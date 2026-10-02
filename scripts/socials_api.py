"""
YouTube subscribers and Twitch followers for every player whose Liquipedia
page links a channel, from the two platforms' own APIs.

    python scripts/socials_api.py                 # both, whichever has its keys set
    python scripts/socials_api.py youtube         # just one
    python scripts/socials_api.py --search 40     # YouTube: up to 40 name searches for links nothing else finds
    python scripts/socials_api.py --recheck       # try links that found nothing before, now
    python scripts/socials_api.py --dry-run       # say what it would ask, send nothing

It reads the links from the raw Liquipedia dump (liquipedia_data/raw_data/fortnite/
players.json, `links.youtube`, `links.twitch` and their `2`, `3` spares) and
writes liquipedia_data/clean_data/fortnite/socials.json:

    {"generated": "2026-10-02",
     "youtube": {"fetched": "2026-10-02", "counts": {"Bugha": 2240000, ...}},
     "twitch":  {"fetched": "2026-10-02", "counts": {"Bugha": 4100000, ...}}}

Page name -> the number. A player with two channels on one platform gets the
bigger one. A channel that hides its count, or a link that leads nowhere, is
left out rather than written as 0. Running one platform keeps the other's block.

Environment:
    YOUTUBE_API_KEY        a Google Cloud API key with "YouTube Data API v3" enabled
    TWITCH_CLIENT_ID       a Twitch developer application's client ID
    TWITCH_CLIENT_SECRET   only if that application is "Confidential"
    LIQUIPEDIA_RAW         the raw folder, if not liquipedia_data/raw_data/fortnite
    SOCIALS_OUT            where socials.json goes, if not liquipedia_data/clean_data/fortnite

YouTube
-------
The free quota is 10,000 units a day (it resets at midnight Pacific time).
Looking a channel up costs 1 unit whatever it is asked by, and channel IDs go
50 to a request, so:

    /channel/UC...        2,039 links  read in batches - 1 unit per 50
    /@handle                842        1 unit each, the first time
    /user/name               68        1 unit each, the first time
    /c/name, /name          455        legacy custom URLs: tried as a handle,
                                       then as a username - 1 or 2 units, once

Every link's channel ID is remembered in socials_state.json, so the first run
spends 1,500-1,900 units and every run after it about 70. `--search N` sends
up to N searches (100 units each) for links still unresolved; a search returns
the closest channel, not certainly the right one, so it is off by default.

Twitch
------
Twitch gives the follower count to any logged-in user, so the first run opens a
login: it prints a code and https://www.twitch.tv/activate, you enter it there,
and the token is kept in ~/.offspawn/twitch_token.json - outside the repo - and
refreshed by itself after that (it expires if the script is not run for 30
days; the next run just asks again). The scope asked for is
moderator:read:followers, the one this endpoint names; for channels you do not
moderate it only ever returns the total. 3,585 links: 36 requests to turn
logins into IDs, then one per channel, inside Twitch's 800 a minute.

A link that finds nothing is not asked about again for 30 days (`--recheck` to
do it now). Ctrl+C is safe: whatever was resolved is in the state file.

The counts belong to YouTube and Twitch, not Liquipedia; the links that find
them come from Liquipedia (CC-BY-SA 3.0).
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote

import requests

ROOT = Path(__file__).resolve().parent.parent
RAW = Path(os.environ.get("LIQUIPEDIA_RAW") or ROOT / "liquipedia_data" / "raw_data" / "fortnite")
OUT = Path(os.environ.get("SOCIALS_OUT") or ROOT / "liquipedia_data" / "clean_data" / "fortnite")
TOKEN_FILE = Path.home() / ".offspawn" / "twitch_token.json"

YOUTUBE = "https://www.googleapis.com/youtube/v3"
HELIX = "https://api.twitch.tv/helix"
TWITCH_AUTH = "https://id.twitch.tv/oauth2"
TWITCH_SCOPES = "moderator:read:followers"

YT_BATCH = 50          # channel IDs per channels.list call
YT_QUOTA = 9000        # units one run may spend: the day has 10,000, keep some spare
TW_BATCH = 100         # logins per users call
RECHECK = timedelta(days=30)
RETRIES = 4
# A new count list this much shorter than the last is a broken answer, not news.
SHRINK_GUARD = 0.6


class ApiError(RuntimeError):
    pass


class DryRun:
    """What a dry run would have sent: the first few requests said, the rest counted."""

    def __init__(self):
        self.count = 0

    def note(self, what):
        self.count += 1
        if self.count <= 3:
            say(f"would GET {what}")


class QuotaSpent(RuntimeError):
    pass


def say(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def today():
    return datetime.fromtimestamp(time.time(), timezone.utc).date().isoformat()


def write_atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def load_json(path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def state_path():
    return RAW / "socials_state.json"


def save_state(state):
    write_atomic(state_path(), json.dumps(state, indent=1, ensure_ascii=False, sort_keys=True))


# ------------------------------------------------------------------ links --

def youtube_ref(url):
    """A YouTube link -> what to ask for: ("id", UC...), ("handle", x), ("username", x), ("custom", x)."""
    match = re.match(r"^https?://(?:www\.|m\.)?youtube\.com/(.*)$", (url or "").strip(), re.I)
    if not match:
        return None
    path = unquote(match.group(1)).split("?")[0].split("#")[0].strip("/")
    parts = [p for p in path.split("/") if p]
    if not parts:
        return None
    head = parts[0]
    if head.lower() == "channel" and len(parts) > 1 and parts[1].startswith("UC"):
        return ("id", parts[1])
    if head.startswith("@"):
        return ("handle", head[1:])
    if head.lower() == "user" and len(parts) > 1:
        return ("username", parts[1])
    if head.lower() == "c" and len(parts) > 1:
        return ("custom", parts[1])
    if head.lower() in ("watch", "playlist", "shorts", "results", "feed"):
        return None
    return ("custom", head)


def twitch_login(url):
    """A Twitch link -> the channel's login, lower case; None for anything that is not a channel."""
    match = re.match(r"^https?://(?:www\.|m\.)?twitch\.tv/([A-Za-z0-9_]{2,25})/?(?:[?#].*)?$", (url or "").strip(), re.I)
    return match.group(1).lower() if match else None


def player_links(raw_players, prefix):
    """page name -> every link on the page whose key starts with `prefix` (youtube, youtube2, ...)."""
    out = {}
    for row in raw_players:
        links = row.get("links") or {}
        if not isinstance(links, dict):
            continue
        found = [value for key, value in sorted(links.items()) if re.fullmatch(rf"{prefix}\d*", key) and value]
        if found and row.get("pagename"):
            out[row["pagename"]] = found
    return out


def due(entry, recheck):
    """Whether a remembered lookup should be asked again: never found, and old enough (or --recheck)."""
    if entry is None:
        return True
    if entry.get("id"):
        return False
    if recheck:
        return True
    checked = entry.get("checked") or "1970-01-01"
    return date.fromisoformat(today()) - date.fromisoformat(checked) >= RECHECK


# ---------------------------------------------------------------- YouTube --

class YouTube:
    def __init__(self, session, key, state, dry_run=None, quota=YT_QUOTA):
        self.session = session
        self.key = key
        self.state = state.setdefault("youtube", {})
        self.full_state = state
        self.dry_run = dry_run
        self.quota = quota
        self.spent = 0

    def get(self, endpoint, params, cost, soft=False):
        """One API call. `soft`: a 400 or 404 is an empty answer - one odd link must not end the run."""
        if self.spent + cost > self.quota:
            raise QuotaSpent(f"this run's {self.quota} units are spent")
        if self.dry_run:
            self.dry_run.note(f"youtube/{endpoint} {params}")
            self.spent += cost
            return {}
        failures = 0
        while True:
            try:
                response = self.session.get(f"{YOUTUBE}/{endpoint}", params={**params, "key": self.key}, timeout=60)
            except requests.RequestException as error:
                failures += 1
                if failures > RETRIES:
                    raise ApiError(f"YouTube {endpoint}: {error}") from error
                time.sleep(30 * failures)
                continue
            self.spent += cost
            if response.status_code >= 500:
                failures += 1
                if failures > RETRIES:
                    raise ApiError(f"YouTube {endpoint}: HTTP {response.status_code}")
                time.sleep(30 * failures)
                continue
            try:
                data = response.json()
            except ValueError:
                data = {}
            if response.status_code == 403 and any(
                e.get("reason") in ("quotaExceeded", "dailyLimitExceeded")
                for e in (data.get("error") or {}).get("errors") or []
            ):
                raise QuotaSpent("YouTube's daily quota is used up - run again tomorrow")
            if soft and response.status_code in (400, 404):
                return {}
            if response.status_code != 200:
                message = (data.get("error") or {}).get("message") or response.text[:300]
                raise ApiError(f"YouTube {endpoint}: HTTP {response.status_code} {message}")
            return data

    def channel_by(self, field, value):
        """One channels.list lookup by handle or username: the channel's ID, or None."""
        data = self.get("channels", {"part": "id", field: value}, 1, soft=True)
        items = data.get("items") or []
        return items[0]["id"] if items else None

    def resolve(self, refs, search_budget, recheck):
        """Every link to a channel ID, remembered in the state. Returns the number of lookups sent."""
        cache = self.state.setdefault("refs", {})
        sent = 0
        searches = 0
        for kind, value in refs:
            key = f"{kind}:{value.lower()}"
            if kind == "id":
                cache[key] = {"id": value}
                continue
            if not due(cache.get(key), recheck):
                continue
            found = None
            if kind == "handle":
                found = self.channel_by("forHandle", f"@{value}")
            elif kind == "username":
                found = self.channel_by("forUsername", value)
            else:
                # Most custom URLs became handles in 2022; the oldest are usernames.
                found = self.channel_by("forHandle", f"@{value}") or self.channel_by("forUsername", value)
            sent += 1
            if not found and searches < search_budget:
                data = self.get("search", {"part": "id", "type": "channel", "q": value, "maxResults": 1}, 100, soft=True)
                items = data.get("items") or []
                found = (items[0].get("id") or {}).get("channelId") if items else None
                searches += 1
            if not self.dry_run:
                cache[key] = {"id": found, "checked": today()}
                if sent % 25 == 0:
                    save_state(self.full_state)
        return sent

    def subscribers(self, channel_ids):
        """channel ID -> subscriber count, for every channel that shows one."""
        counts = {}
        ids = sorted(set(channel_ids))
        for start in range(0, len(ids), YT_BATCH):
            chunk = ids[start:start + YT_BATCH]
            data = self.get("channels", {"part": "statistics", "id": ",".join(chunk), "maxResults": YT_BATCH}, 1)
            for item in data.get("items") or []:
                stats = item.get("statistics") or {}
                if stats.get("hiddenSubscriberCount") or "subscriberCount" not in stats:
                    continue
                counts[item["id"]] = int(stats["subscriberCount"])
        return counts


def run_youtube(raw_players, state, args, session):
    key = os.environ.get("YOUTUBE_API_KEY", "").strip()
    if not key:
        say("youtube: YOUTUBE_API_KEY is not set - skipped")
        return None
    links = player_links(raw_players, "youtube")
    refs_by_player = {page: [r for r in map(youtube_ref, urls) if r] for page, urls in links.items()}
    all_refs = sorted({r for refs in refs_by_player.values() for r in refs})
    yt = YouTube(session, key, state, args.dry_run, args.quota)
    say(f"youtube: {len(links):,} players link {len(all_refs):,} channels")
    complete = True
    # The counts at the end need one unit per 50 channels: keep those back from the lookups.
    reserve = len(all_refs) // YT_BATCH + 2
    yt.quota = args.quota - reserve
    try:
        sent = yt.resolve(all_refs, args.search, args.recheck)
        say(f"youtube: {sent:,} lookups for links not seen before")
    except QuotaSpent as stop:
        say(f"youtube: {stop}; the links resolved so far are kept")
        complete = False
    yt.quota = args.quota
    if not args.dry_run:
        save_state(state)
    cache = state["youtube"].get("refs", {})

    def channel(ref):
        return ref[1] if ref[0] == "id" else (cache.get(f"{ref[0]}:{ref[1].lower()}") or {}).get("id")

    wanted = {channel(r) for refs in refs_by_player.values() for r in refs} - {None}
    try:
        subs = yt.subscribers(wanted)
    except QuotaSpent as stop:
        say(f"youtube: {stop} before the counts - nothing written")
        return None
    counts = {}
    for page, refs in refs_by_player.items():
        best = max((subs[c] for c in map(channel, refs) if c in subs), default=None)
        if best is not None:
            counts[page] = best
    unresolved = sum(1 for r in all_refs if channel(r) is None)
    if args.dry_run:
        say(f"youtube: would send {args.dry_run.count:,} requests, {yt.spent:,} units")
        return None
    say(f"youtube: {len(counts):,} players with a count, {unresolved:,} links found no channel, {yt.spent:,} units")
    if not complete:
        say("youtube: some links are still to look up - the next run carries on")
    return counts


# ----------------------------------------------------------------- Twitch --

class Twitch:
    def __init__(self, session, client_id, secret, dry_run=None):
        self.session = session
        self.client_id = client_id
        self.secret = secret
        self.dry_run = dry_run
        self.token = None

    # ------------------------------------------------------------ login --

    def _token_request(self, data):
        if self.secret:
            data = {**data, "client_secret": self.secret}
        response = self.session.post(f"{TWITCH_AUTH}/token", data=data, timeout=60)
        try:
            body = response.json()
        except ValueError:
            body = {}
        return response.status_code, body

    def _keep(self, body):
        self.token = {
            "access_token": body["access_token"],
            "refresh_token": body.get("refresh_token"),
            "expires_at": time.time() + float(body.get("expires_in") or 0),
        }
        write_atomic(TOKEN_FILE, json.dumps(self.token))

    def _refresh(self):
        refresh = (self.token or {}).get("refresh_token")
        if not refresh:
            return False
        status, body = self._token_request({
            "client_id": self.client_id,
            "grant_type": "refresh_token",
            "refresh_token": refresh,
        })
        if status == 200 and body.get("access_token"):
            self._keep(body)
            return True
        return False

    def _device_login(self):
        response = self.session.post(
            f"{TWITCH_AUTH}/device", data={"client_id": self.client_id, "scopes": TWITCH_SCOPES}, timeout=60
        )
        if response.status_code != 200:
            raise ApiError(f"Twitch login: HTTP {response.status_code} {response.text[:300]}")
        device = response.json()
        say(f"twitch: log in - open {device['verification_uri']} and enter the code {device['user_code']}")
        deadline = time.time() + float(device.get("expires_in") or 1800)
        interval = float(device.get("interval") or 5)
        while time.time() < deadline:
            time.sleep(interval)
            status, body = self._token_request({
                "client_id": self.client_id,
                "scopes": TWITCH_SCOPES,
                "device_code": device["device_code"],
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            })
            if status == 200 and body.get("access_token"):
                self._keep(body)
                say("twitch: logged in")
                return
            message = str(body.get("message") or "")
            if "pending" in message:
                continue
            if "slow" in message:
                interval += 5
                continue
            raise ApiError(f"Twitch login: {message or status}")
        raise ApiError("Twitch login: the code expired before it was entered - run again")

    def login(self):
        if self.dry_run:
            return
        self.token = load_json(TOKEN_FILE, None)
        if self.token and self.token.get("expires_at", 0) > time.time() + 60:
            return
        if self._refresh():
            return
        self._device_login()

    # ---------------------------------------------------------- requests --

    def get(self, endpoint, params, soft=False):
        """One Helix call. `soft`: a 400 or 404 (a channel gone since) is an empty answer."""
        if self.dry_run:
            self.dry_run.note(f"twitch/{endpoint} {str(params)[:80]}")
            return {}
        failures = 0
        refreshed = False
        while True:
            headers = {"Authorization": f"Bearer {self.token['access_token']}", "Client-Id": self.client_id}
            try:
                response = self.session.get(f"{HELIX}/{endpoint}", params=params, headers=headers, timeout=60)
            except requests.RequestException as error:
                failures += 1
                if failures > RETRIES:
                    raise ApiError(f"Twitch {endpoint}: {error}") from error
                time.sleep(15 * failures)
                continue
            if response.status_code == 401 and not refreshed:
                refreshed = True
                if not self._refresh():
                    self._device_login()
                continue
            if response.status_code == 429:
                reset = float(response.headers.get("Ratelimit-Reset") or time.time() + 60)
                time.sleep(max(1.0, reset - time.time()))
                continue
            if response.status_code >= 500:
                failures += 1
                if failures > RETRIES:
                    raise ApiError(f"Twitch {endpoint}: HTTP {response.status_code}")
                time.sleep(15 * failures)
                continue
            if soft and response.status_code in (400, 404):
                return {}
            if response.status_code != 200:
                raise ApiError(f"Twitch {endpoint}: HTTP {response.status_code} {response.text[:300]}")
            # Stay inside the bucket rather than run into its wall.
            if response.headers.get("Ratelimit-Remaining") == "0":
                reset = float(response.headers.get("Ratelimit-Reset") or time.time() + 60)
                time.sleep(max(0.0, reset - time.time()))
            return response.json()

    def ids(self, logins, cache, recheck):
        """Every login to a user ID, remembered; a login nobody has any more is remembered as missing."""
        todo = sorted(login for login in logins if due(cache.get(login), recheck))
        for start in range(0, len(todo), TW_BATCH):
            chunk = todo[start:start + TW_BATCH]
            data = self.get("users", [("login", login) for login in chunk])
            found = {row["login"].lower(): row["id"] for row in data.get("data") or []}
            if not self.dry_run:
                for login in chunk:
                    cache[login] = {"id": found.get(login), "checked": today()}
        return len(todo)

    def followers(self, user_id):
        data = self.get("channels/followers", {"broadcaster_id": user_id, "first": 1}, soft=True)
        total = data.get("total")
        return int(total) if total is not None else None


def run_twitch(raw_players, state, args, session):
    client_id = os.environ.get("TWITCH_CLIENT_ID", "").strip()
    if not client_id:
        say("twitch: TWITCH_CLIENT_ID is not set - skipped")
        return None
    links = player_links(raw_players, "twitch")
    logins_by_player = {page: [l for l in map(twitch_login, urls) if l] for page, urls in links.items()}
    logins = sorted({l for ls in logins_by_player.values() for l in ls})
    tw = Twitch(session, client_id, os.environ.get("TWITCH_CLIENT_SECRET", "").strip(), args.dry_run)
    say(f"twitch: {len(links):,} players link {len(logins):,} channels")
    tw.login()
    cache = state.setdefault("twitch", {}).setdefault("logins", {})
    looked = tw.ids(logins, cache, args.recheck)
    if not args.dry_run:
        save_state(state)
    say(f"twitch: {looked:,} logins looked up")
    totals = {}
    ids = sorted({(cache.get(l) or {}).get("id") for l in logins} - {None})
    for n, user_id in enumerate(ids, start=1):
        total = tw.followers(user_id)
        if total is not None:
            totals[user_id] = total
        if n % 500 == 0:
            say(f"twitch: {n:,} of {len(ids):,} channels")
    counts = {}
    for page, ls in logins_by_player.items():
        best = max((totals[i] for i in ((cache.get(l) or {}).get("id") for l in ls) if i in totals), default=None)
        if best is not None:
            counts[page] = best
    if args.dry_run:
        say(f"twitch: would send {args.dry_run.count:,} requests (more once the logins are known)")
        return None
    missing = sum(1 for l in logins if not (cache.get(l) or {}).get("id"))
    say(f"twitch: {len(counts):,} players with a count, {missing:,} {'login' if missing == 1 else 'logins'} not found")
    return counts


# ------------------------------------------------------------------- main --

def write_counts(platform, counts, force=False):
    """Into socials.json, keeping the other platform's block - unless the new list is suspiciously short."""
    path = OUT / "socials.json"
    payload = load_json(path, {})
    before = len((payload.get(platform) or {}).get("counts") or {})
    if before and len(counts) < before * SHRINK_GUARD and not force:
        say(f"{platform}: {len(counts):,} counts against {before:,} last time - not overwriting (--force to anyway)")
        return False
    payload[platform] = {"fetched": today(), "counts": dict(sorted(counts.items()))}
    payload["generated"] = today()
    write_atomic(path, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
    say(f"{platform}: wrote {len(counts):,} counts to {path}")
    return True


def main(argv=None, session=None):
    parser = argparse.ArgumentParser(description="YouTube subscribers and Twitch followers for the roster.")
    parser.add_argument("platforms", nargs="*", choices=["youtube", "twitch"], help="default: both")
    parser.add_argument("--search", type=int, default=0, help="YouTube searches (100 units each) for links nothing else finds")
    parser.add_argument("--quota", type=int, default=YT_QUOTA, help="YouTube units this run may spend")
    parser.add_argument("--recheck", action="store_true", help="ask again about links that found nothing")
    parser.add_argument("--force", action="store_true", help="write even a much shorter list than last time")
    parser.add_argument("--dry-run", action="store_true", help="send nothing, write nothing")
    args = parser.parse_args(argv)
    platforms = args.platforms or ["youtube", "twitch"]

    players_file = RAW / "players.json"
    if not players_file.exists():
        sys.exit(f"No raw players.json in {RAW} - run scripts/liquipedia_api.py first.")
    raw_players = json.loads(players_file.read_text(encoding="utf-8"))
    state = load_json(state_path(), {})
    session = session or requests.Session()

    dry = args.dry_run
    for platform in platforms:
        args.dry_run = DryRun() if dry else None
        run = run_youtube if platform == "youtube" else run_twitch
        try:
            counts = run(raw_players, state, args, session)
        except ApiError as error:
            if not dry:
                save_state(state)
            say(f"{platform}: {error} - nothing written")
            continue
        if counts is not None:
            write_counts(platform, counts, args.force)
    if not dry:
        save_state(state)
    say("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())

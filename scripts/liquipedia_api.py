"""
Keeps the raw LiquipediaDB dump current: only what changed, inside the API's
60 requests an hour.

    python scripts/liquipedia_api.py                      # all five tables
    python scripts/liquipedia_api.py placement transfer   # just these
    python scripts/liquipedia_api.py --since 2026-09-14   # first run: when the dump was taken
    python scripts/liquipedia_api.py --full placement     # re-read one table from scratch
    python scripts/liquipedia_api.py --dry-run            # print the requests, send nothing

It keeps the raw dump in liquipedia_data/raw_data/fortnite/ - players.json,
teams.json, tournaments.json, transfers.json and placements.jsonl, in the shape
the cleaning notebooks read - with sync_state.json beside them. Git ignores it.

Environment:
    LIQUIPEDIA_API_KEY        the LiquipediaDB key (required)
    LIQUIPEDIA_USER_AGENT     e.g. "OffSpawn/1.0 (you@example.com)" - Liquipedia
                              asks for a way to contact you
    LIQUIPEDIA_RAW            the raw folder, if not liquipedia_data/raw_data/fortnite
    OFFSPAWN_URL              the site, to read webhook pings from (optional)
    OFFSPAWN_ADMIN_PASSWORD   its admin password

What "only what changed" means
------------------------------
LiquipediaDB has no "modified since" filter, so each table is brought up to
date the cheapest way it can be:

    player, team       re-read whole. 5,726 players is 6 requests - fewer than
                       asking for the ones whose earnings moved by name.
    tournament         everything starting or ending after the cutoff.
    transfer           everything dated after the cutoff.
    placement          everything dated after the cutoff.

The cutoff is the last successful sync of that table minus LOOKBACK, so results
filled in a few days after an event are picked up on the next run. Rows in that
window are replaced wholesale, so a row Liquipedia deleted goes too.

Anything older that gets edited arrives through the webhook: the site stores
Liquipedia's pings (POST /api/liquipedia/<secret>), and each run refreshes the
pages they name - every row of that page, in the tables the page belongs to.
A deleted page's rows go; a moved page's rows go and the new page is read.

The budget
----------
Every request is logged in sync_state.json, so no run - or run straight after
another - sends more than PER_HOUR in any rolling hour. It waits rather than
stops. A 429 waits for Retry-After, or an hour. Ctrl+C is safe at any point:
the pages already fetched are kept and the next run carries on from there.

Content from Liquipedia (https://liquipedia.net/fortnite), licensed CC-BY-SA 3.0
(https://creativecommons.org/licenses/by-sa/3.0/). Anything derived from these
files is shared under the same licence and credits Liquipedia - see CREDITS.md.
"""

import argparse
import json
import os
import sys
import time
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path

import requests

API = "https://api.liquipedia.net/api/v3"
WIKI = "fortnite"
ROOT = Path(__file__).resolve().parent.parent
RAW = Path(os.environ.get("LIQUIPEDIA_RAW") or ROOT / "liquipedia_data" / "raw_data" / WIKI)

LIMIT = 1000                    # the API's maximum per request
PER_HOUR = 60                   # the key's allowance
SPACING = 5.0                   # seconds between two requests, allowance or not
LOOKBACK = timedelta(days=30)   # how far behind the last sync a window reaches
PAGES_PER_CALL = 20             # pagenames OR-ed into one request
RETRIES = 4                     # for timeouts and 5xx; a 429 always waits it out


@dataclass(frozen=True)
class Dataset:
    table: str
    file: str
    # A unique order, so paging with offset never repeats or skips a row.
    # The old download ordered by pagename alone, which is shared by every row
    # of a page, and wrote 30,999 placement rows twice.
    order: str
    # Date columns a window is cut on. None: re-read the table whole.
    window: tuple = None


DATASETS = [
    Dataset("player", "players.json", "pageid ASC, objectname ASC"),
    Dataset("team", "teams.json", "pageid ASC, objectname ASC"),
    Dataset("tournament", "tournaments.json", "pageid ASC, objectname ASC", ("startdate", "enddate")),
    Dataset("transfer", "transfers.json", "pageid ASC, objectname ASC", ("date",)),
    Dataset("placement", "placements.jsonl", "pageid ASC, objectname ASC", ("date",)),
]
BY_TABLE = {d.table: d for d in DATASETS}


class ApiError(RuntimeError):
    pass


# ------------------------------------------------------------------ state --

def load_state():
    path = RAW / "sync_state.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {}


def save_state(state):
    write_atomic(RAW / "sync_state.json", json.dumps(state, indent=2, ensure_ascii=False))


def write_atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(text, encoding="utf-8")
    os.replace(tmp, path)


def say(message):
    print(f"[{time.strftime('%H:%M:%S')}] {message}", flush=True)


def sleep_until(moment, why):
    """Sleeps until `moment` (epoch seconds), saying so every ten minutes - if it is worth saying."""
    while True:
        left = moment - time.time()
        if left <= 0:
            return
        if left >= 30:
            say(f"{why} - waiting {int(left // 60)}m {int(left % 60)}s")
        time.sleep(min(left, 600))


# ----------------------------------------------------------------- budget --

class Budget:
    """At most PER_HOUR requests in any rolling hour, remembered across runs."""

    def __init__(self, state):
        self.state = state
        self.used = 0

    def before(self):
        state = self.state
        sleep_until(state.get("blocked_until", 0), "Liquipedia asked us to wait")
        while True:
            now = time.time()
            calls = [t for t in state.get("calls", []) if now - t < 3600]
            state["calls"] = calls
            if len(calls) < PER_HOUR:
                break
            sleep_until(calls[0] + 3600 + 1, f"{PER_HOUR} requests in the last hour")
        if calls:
            sleep_until(calls[-1] + SPACING, "spacing")

    def after(self):
        self.state.setdefault("calls", []).append(time.time())
        self.used += 1
        save_state(self.state)

    def blocked(self, seconds):
        self.state["blocked_until"] = time.time() + seconds
        save_state(self.state)


def retry_after(response):
    """Retry-After in seconds, from either of its two forms, or None."""
    value = response.headers.get("Retry-After")
    if not value:
        return None
    if value.strip().isdigit():
        return int(value)
    try:
        return max(0, (parsedate_to_datetime(value) - datetime.now(timezone.utc)).total_seconds())
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------------------- HTTP --

def open_session():
    key = os.environ.get("LIQUIPEDIA_API_KEY", "").strip()
    if not key:
        sys.exit("Set LIQUIPEDIA_API_KEY first.")
    agent = os.environ.get("LIQUIPEDIA_USER_AGENT", "").strip()
    if not agent:
        sys.exit('Set LIQUIPEDIA_USER_AGENT first, e.g. "OffSpawn/1.0 (you@example.com)".')
    session = requests.Session()
    session.headers.update({
        "Authorization": key if key.startswith("Apikey ") else f"Apikey {key}",
        "User-Agent": agent,
        "Accept-Encoding": "gzip",
    })
    return session


def request(session, budget, table, params, dry_run=False):
    """One API call: the rows it returned. Waits out limits, retries hiccups."""
    if dry_run:
        say(f"would GET /{table} {params}")
        return []
    failures = 0
    while True:
        budget.before()
        try:
            response = session.get(f"{API}/{table}", params=params, timeout=60)
        except requests.RequestException as error:
            budget.after()  # it may still have counted
            failures += 1
            if failures > RETRIES:
                raise ApiError(f"{table}: {error}") from error
            say(f"{table}: {error} - retrying in {failures} min")
            time.sleep(60 * failures)
            continue
        budget.after()

        if response.status_code == 429:
            wait = retry_after(response) or 3600
            budget.blocked(wait)
            say(f"rate limited (429) - waiting {int(wait // 60)} min")
            continue
        if response.status_code >= 500:
            failures += 1
            if failures > RETRIES:
                raise ApiError(f"{table}: HTTP {response.status_code}")
            say(f"{table}: HTTP {response.status_code} - retrying in {failures} min")
            time.sleep(60 * failures)
            continue
        try:
            data = response.json()
        except ValueError:
            data = {}
        errors = data.get("error") or []
        if response.status_code != 200 or errors:
            text = "; ".join(errors) if isinstance(errors, list) else str(errors)
            raise ApiError(f"{table}: HTTP {response.status_code} {text or response.text[:300]}")
        for warning in data.get("warning") or []:
            say(f"{table}: API warning: {warning}")
        return data.get("result") or []


def fetch(ctx, dataset, job, conditions):
    """
    Every row of `dataset` matching `conditions`, LIMIT at a time.

    Each page is appended to a staging file as it arrives and the offset saved,
    so an interrupted fetch carries on where it stopped - as long as it is the
    same job asking the same question.
    """
    state, jobs = ctx["state"], ctx["state"].setdefault("jobs", {})
    name = f"{dataset.table}:{job}"
    staging = RAW / ".staging" / f"{dataset.table}.{job}.jsonl"
    saved = jobs.get(name)
    if saved and saved.get("conditions") == conditions and staging.exists():
        offset = saved["offset"]
        say(f"{name}: resuming at row {offset}")
    else:
        offset = 0
        staging.parent.mkdir(parents=True, exist_ok=True)
        staging.write_text("", encoding="utf-8")

    while True:
        params = {"wiki": WIKI, "limit": LIMIT, "offset": offset, "order": dataset.order}
        if conditions:
            params["conditions"] = conditions
        rows = request(ctx["session"], ctx["budget"], dataset.table, params, ctx["dry_run"])
        with staging.open("a", encoding="utf-8") as out:
            for row in rows:
                out.write(json.dumps(row, ensure_ascii=False) + "\n")
        offset += len(rows)
        jobs[name] = {"conditions": conditions, "offset": offset}
        save_state(state)
        if rows:
            say(f"{name}: {offset} rows so far")
        if len(rows) < LIMIT:
            break

    fetched = read_jsonl(staging)
    ctx["staged"].append((name, staging))
    return fetched


# ------------------------------------------------------------------- rows --

def key_of(row):
    """What makes a row itself. `objectname` starts with the pageid."""
    if row.get("objectname"):
        return (row.get("pageid"), row["objectname"])
    return json.dumps(row, sort_keys=True, ensure_ascii=False)


def page_of(row):
    return normal_page(row.get("pagename"))


def normal_page(name):
    """LiquipediaDB stores pagenames with underscores; webhooks send spaces."""
    return str(name or "").strip().replace(" ", "_")


def read_jsonl(path):
    rows = []
    with path.open(encoding="utf-8") as lines:
        for line in lines:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def load_rows(path):
    if not path.exists():
        return None
    if path.suffix == ".jsonl":
        return read_jsonl(path)
    return json.loads(path.read_text(encoding="utf-8"))


def save_rows(path, rows):
    if path.suffix != ".jsonl":
        write_atomic(path, json.dumps(rows, ensure_ascii=False, indent=2))
        return
    # Line by line: the placements are 550 MB, and building them as one string
    # first took another 1.6 GB.
    tmp = path.with_name(path.name + ".tmp")
    with tmp.open("w", encoding="utf-8") as out:
        for row in rows:
            out.write(json.dumps(row, ensure_ascii=False) + "\n")
    os.replace(tmp, path)


def dedupe(rows):
    """One row per key, the last one seen - fresh rows are always added last."""
    last = {}
    for index, row in enumerate(rows):
        last[key_of(row)] = index
    return [row for index, row in enumerate(rows) if last[key_of(row)] == index]


def in_window(row, fields, edge):
    return any(str(row.get(field) or "") >= edge for field in fields)


def merge_window(old, fetched, dataset, cutoff):
    """
    `old`, with its rows after `cutoff` replaced by `fetched`.

    The API returned every row strictly after the cutoff, so an old row inside
    that range and missing from `fetched` was deleted on the wiki - except on
    the cutoff day itself, where the old row's time of day decides and is not
    worth trusting: those are only ever updated, never dropped.
    """
    edge = (cutoff + timedelta(days=1)).isoformat()
    fresh = {key_of(row) for row in fetched}
    kept, dropped = [], 0
    for row in old:
        if key_of(row) in fresh:
            continue
        if in_window(row, dataset.window, edge):
            dropped += 1
            continue
        kept.append(row)
    # A window that comes back smaller than what it would delete is a query
    # gone wrong, not a wave of deletions. Keep the file as it is.
    if dropped > len(fetched):
        raise ApiError(
            f"{dataset.table}: the API returned {len(fetched)} rows after {cutoff} "
            f"but {dropped} rows we hold for that period are missing from them - not overwriting"
        )
    return kept + fetched, dropped


def replace_pages(old, pages, fetched):
    """Every row of `pages` replaced by what the API has for them now."""
    return [row for row in old if page_of(row) not in pages] + fetched


# ---------------------------------------------------------------- webhook --

def read_pings(state):
    """The webhook's pings since the last run, from the site. [] without it."""
    url = os.environ.get("OFFSPAWN_URL", "").rstrip("/")
    if not url:
        return [], None
    session = requests.Session()
    login = session.post(f"{url}/api/admin/login",
                         json={"password": os.environ.get("OFFSPAWN_ADMIN_PASSWORD", "")}, timeout=30)
    if login.status_code != 204:
        raise ApiError(f"could not log in to {url} ({login.status_code}) - check OFFSPAWN_ADMIN_PASSWORD")
    after = cursor = state.get("webhook_cursor", 0)
    pings = []
    while True:
        response = session.get(f"{url}/api/admin/liquipedia", params={"after": after}, timeout=60)
        response.raise_for_status()
        batch = response.json()
        pings += batch
        if len(batch) < 5000:
            break
        after = batch[-1]["id"]
    if pings:
        cursor = pings[-1]["id"]
    return pings, cursor


def pages_from(pings):
    """(pages to re-read, pages whose rows go), in the order they happened."""
    refresh, drop = set(), set()
    for ping in sorted(pings, key=lambda p: p["id"]):
        body = ping.get("body", ping)
        if body.get("wiki") != WIKI:
            continue
        event, page = body.get("event"), normal_page(body.get("page"))
        if event == "move":
            if body.get("from_namespace", 0) == 0:
                old = normal_page(body.get("from_page"))
                drop.add(old)
                refresh.discard(old)
            if body.get("namespace") == 0:
                refresh.add(page)
                drop.discard(page)
        elif body.get("namespace") != 0:
            continue
        elif event == "delete":
            drop.add(page)
            refresh.discard(page)
        elif event in ("edit", "purge"):
            refresh.add(page)
            drop.discard(page)
    return refresh, drop


def route(pages, known):
    """
    Which tables to ask about each page.

    A page we already hold rows for belongs to those tables; a tournament page
    to the placements too, since its results live on it. A page we have never
    seen could be anything - a new tournament, a new transfer page - so it is
    asked of every table the window does not already re-read whole.
    """
    tables = {d.table: set() for d in DATASETS}
    for page in pages:
        homes = {table for table, names in known.items() if page in names}
        if "tournament" in homes:
            homes.add("placement")
        if not homes:
            homes = {d.table for d in DATASETS if d.window}
        for table in homes:
            tables[table].add(page)
    return tables


# ------------------------------------------------------------------- sync --

def cutoff_for(dataset, state, since, path):
    """The day a window starts from: the last sync (or --since) minus LOOKBACK."""
    stamp = state.get("synced", {}).get(dataset.table)
    if stamp:
        last = datetime.fromisoformat(stamp).date()
    elif since:
        last = since
    else:
        last = datetime.fromtimestamp(path.stat().st_mtime).date()
        say(f"{dataset.table}: no sync on record - taking the file's date, {last}. "
            f"Pass --since if the dump is older than that.")
    return last - LOOKBACK


def sync(ctx, dataset, pages, drops):
    """Brings one table's file up to date. Returns a one-line summary."""
    path = RAW / dataset.file
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")
    old = load_rows(path)
    before = len(old) if old is not None else 0

    whole = old is None or dataset.window is None or dataset.table in ctx["full"]
    if whole:
        rows = fetch(ctx, dataset, "all", None)
        removed = max(0, before - len(rows))
        # A table that comes back a tenth smaller than the copy we hold has
        # not shrunk; the request went wrong. Keep the file as it is.
        held = len(dedupe(old)) if old else 0
        if not ctx["dry_run"] and len(dedupe(rows)) < held * 0.9:
            raise ApiError(f"{dataset.table}: the API returned {len(rows):,} rows, we hold {held:,} - not overwriting")
    else:
        cutoff = cutoff_for(dataset, ctx["state"], ctx["since"], path)
        conditions = " OR ".join(f"[[{field}::>{cutoff.isoformat()}]]" for field in dataset.window)
        fetched = fetch(ctx, dataset, "window", conditions)
        rows, removed = (old, 0) if ctx["dry_run"] else merge_window(dedupe(old), fetched, dataset, cutoff)
        # Pages the window has just read need no second look.
        fresh = {page_of(row) for row in fetched}
        wanted = sorted(page for page in pages if page not in fresh)
        for index in range(0, len(wanted), PAGES_PER_CALL):
            chunk = wanted[index:index + PAGES_PER_CALL]
            conditions = " OR ".join(f"[[pagename::{page}]]" for page in chunk)
            got = fetch(ctx, dataset, f"pages{index // PAGES_PER_CALL}", conditions)
            held = sum(1 for row in rows if page_of(row) in chunk)
            rows = replace_pages(rows, set(chunk), got)
            removed += max(0, held - len(got))

    if drops:
        held = len(rows)
        rows = [row for row in rows if page_of(row) not in drops]
        removed += held - len(rows)
    rows = dedupe(rows)

    if ctx["dry_run"]:
        return f"{dataset.table}: dry run, nothing written"
    save_rows(path, rows)
    ctx["state"].setdefault("synced", {})[dataset.table] = started
    return f"{dataset.table}: {before:,} -> {len(rows):,} rows ({removed:,} removed)"


def main(argv=None, session=None):
    parser = argparse.ArgumentParser(description="Bring the raw Liquipedia dump up to date.")
    parser.add_argument("tables", nargs="*", metavar="table",
                        help=f"any of {', '.join(BY_TABLE)} (default: all)")
    parser.add_argument("--full", nargs="+", default=[], choices=list(BY_TABLE), metavar="table",
                        help="re-read these tables whole")
    parser.add_argument("--since", type=date.fromisoformat,
                        help="first run only: the day the existing dump was taken (YYYY-MM-DD)")
    parser.add_argument("--dry-run", action="store_true", help="print the requests, send nothing")
    args = parser.parse_args(argv)
    unknown = [t for t in args.tables if t not in BY_TABLE]
    if unknown:
        parser.error(f"unknown table {', '.join(unknown)} - pick from {', '.join(BY_TABLE)}")

    chosen = [BY_TABLE[t] for t in args.tables] if args.tables else DATASETS
    RAW.mkdir(parents=True, exist_ok=True)
    state = load_state()
    ctx = {
        "state": state,
        "budget": Budget(state),
        "session": session or (None if args.dry_run else open_session()),
        "since": args.since,
        "full": set(args.full),
        "dry_run": args.dry_run,
        "staged": [],
    }

    pings, cursor = read_pings(state)
    refresh, drops = pages_from(pings)
    if pings:
        say(f"webhook: {len(pings)} pings - {len(refresh)} pages to re-read, {len(drops)} to drop")

    known = {}
    if refresh:
        for dataset in DATASETS:
            rows = load_rows(RAW / dataset.file) or []
            known[dataset.table] = {page_of(row) for row in rows}
    routed = route(refresh, known)

    summaries = []
    for dataset in chosen:
        summaries.append(sync(ctx, dataset, routed[dataset.table], drops))
        say(summaries[-1])
        # Done with this table: its staged pages are in the file now.
        for name, staging in ctx["staged"]:
            state.get("jobs", {}).pop(name, None)
            staging.unlink(missing_ok=True)
        ctx["staged"].clear()
        save_state(state)

    # The pings are only spent once every table has had its turn at them.
    if not ctx["dry_run"] and cursor is not None and len(chosen) == len(DATASETS):
        state["webhook_cursor"] = cursor
        save_state(state)
    try:
        (RAW / ".staging").rmdir()  # only if a finished run left it empty
    except OSError:
        pass
    say(f"done - {ctx['budget'].used} requests this run")
    return summaries


if __name__ == "__main__":
    main()

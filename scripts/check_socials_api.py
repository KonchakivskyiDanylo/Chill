"""
Drives socials_api.py against a fake YouTube and a fake Twitch with a fake
clock. Nothing here touches the network, the real raw folder or ~/.offspawn.

    .venv/Scripts/python scripts/check_socials_api.py

Every link shape on both platforms, batching, the Twitch login and its
refresh, a 429, a 401 mid-run, YouTube's daily quota running out and the run
after it carrying on, links that find nothing being asked again after 30 days,
the guard against overwriting a good file with a broken answer, and a dry run.
"""
import importlib.util
import json
import os
import shutil
import sys
import tempfile
import time as real_time
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SRC = Path(__file__).resolve().parent / "socials_api.py"
spec = importlib.util.spec_from_file_location("socials", SRC)
soc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(soc)

problems = []


def check(ok, message):
    if not ok:
        problems.append(message)
        print("  FAIL", message)


# ------------------------------------------------------------------ fakes --

class FakeTime:
    def __init__(self):
        self.now = 1_790_000_000.0

    def time(self):
        return self.now

    def sleep(self, seconds):
        self.now += max(0, seconds)

    def strftime(self, fmt):
        return real_time.strftime(fmt, real_time.gmtime(self.now))


class Response:
    def __init__(self, status, body, headers=None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.text = json.dumps(body)

    def json(self):
        return self._body


class FakeYouTube:
    def __init__(self):
        self.subs = {"UC_A": 1000, "UC_B": 2000, "UC_B2": 50000, "UC_C": 300, "UC_D": 999, "UC_E": 10, "UC_F": 77}
        self.subs.update({f"UC_X{i}": 100 + i for i in range(60)})
        self.hidden = {"UC_D"}
        self.handles = {"bravo": "UC_B", "delta": "UC_D"}
        self.usernames = {"charlie": "UC_C", "echo": "UC_E"}
        self.searchable = {"foxtrot": "UC_F"}
        self.quota = 10_000      # what the Google day has left
        self.lookups = 0         # forHandle / forUsername calls
        self.stats_calls = 0
        self.searches = 0
        self.empty = False       # a broken API: every lookup comes back with nothing

    def get(self, endpoint, params):
        cost = 100 if endpoint == "search" else 1
        if self.quota < cost:
            return Response(403, {"error": {"message": "quota", "errors": [{"reason": "quotaExceeded"}]}})
        self.quota -= cost
        if endpoint == "search":
            self.searches += 1
            found = self.searchable.get(params["q"].lower())
            return Response(200, {"items": [{"id": {"channelId": found}}] if found else []})
        if "id" in params:
            ids = params["id"].split(",")
            check(len(ids) <= 50, f"youtube: {len(ids)} ids in one call")
            self.stats_calls += 1
            items = [] if self.empty else [
                {"id": i, "statistics": {"subscriberCount": str(self.subs[i]), "hiddenSubscriberCount": i in self.hidden}}
                for i in ids if i in self.subs
            ]
            return Response(200, {"items": items})
        self.lookups += 1
        if "forHandle" in params:
            handle = params["forHandle"].lstrip("@").lower()
            if "!" in handle:
                return Response(400, {"error": {"message": "Invalid handle"}})
            found = self.handles.get(handle)
        else:
            found = self.usernames.get(params["forUsername"].lower())
        return Response(200, {"items": [{"id": found}]} if found else {})


class FakeTwitch:
    def __init__(self, clock):
        self.clock = clock
        self.users = {"alpha": "1", "bravo_tv": "2", "kilo": "3"}
        self.users.update({f"bulk{i}": str(100 + i) for i in range(150)})
        self.followers = {"1": 500, "2": 7000, "3": 42}
        self.followers.update({str(100 + i): i for i in range(150)})
        self.gone = {"3"}           # the user exists, the follower call 404s
        self.tokens = {}            # access token -> expires at
        self.refreshes = {}         # refresh token -> still valid
        self.device_polls = 0
        self.device_logins = 0
        self.refresh_used = 0
        self.user_calls = 0
        self.follower_calls = 0
        self.throttle_at = 40       # the 40th follower call gets a 429
        self.revoke_at = None       # follower call number that finds its token revoked
        self._n = 0

    def issue(self):
        self._n += 1
        access, refresh = f"tok{self._n}", f"ref{self._n}"
        self.tokens[access] = self.clock.now + 4 * 3600
        self.refreshes[refresh] = True
        return {"access_token": access, "refresh_token": refresh, "expires_in": 4 * 3600, "token_type": "bearer"}

    def post(self, url, data):
        if url.endswith("/device"):
            check(data.get("scopes") == soc.TWITCH_SCOPES, "twitch: the login asked for the wrong scope")
            self.device_logins += 1
            return Response(200, {"device_code": "dev", "user_code": "ABCD-EFGH", "verification_uri": "https://www.twitch.tv/activate", "expires_in": 1800, "interval": 5})
        grant = data.get("grant_type")
        if grant == "refresh_token":
            if not self.refreshes.pop(data.get("refresh_token"), False):
                return Response(400, {"status": 400, "message": "Invalid refresh token"})
            self.refresh_used += 1
            return Response(200, self.issue())
        self.device_polls += 1
        if self.device_polls == 1:
            return Response(400, {"status": 400, "message": "authorization_pending"})
        return Response(200, self.issue())

    def get(self, endpoint, params, headers):
        token = (headers.get("Authorization") or "").removeprefix("Bearer ")
        check(headers.get("Client-Id") == "client", "twitch: a request without the Client-Id")
        if self.tokens.get(token, 0) <= self.clock.now:
            return Response(401, {"status": 401, "message": "Invalid OAuth token"})
        if endpoint == "users":
            logins = [value for key, value in params if key == "login"]
            check(len(logins) <= 100, f"twitch: {len(logins)} logins in one call")
            self.user_calls += 1
            return Response(200, {"data": [{"id": self.users[l], "login": l} for l in logins if l in self.users]})
        self.follower_calls += 1
        if self.follower_calls == self.throttle_at:
            return Response(429, {"message": "Too Many Requests"}, {"Ratelimit-Reset": str(int(self.clock.now) + 30)})
        if self.follower_calls == self.revoke_at:
            self.tokens.pop(token, None)
            return Response(401, {"status": 401, "message": "Invalid OAuth token"})
        user_id = params["broadcaster_id"]
        if user_id in self.gone:
            return Response(404, {"message": "Not Found"})
        return Response(200, {"total": self.followers[user_id], "data": [], "pagination": {}})


class FakeSession:
    def __init__(self, youtube, twitch):
        self.youtube = youtube
        self.twitch = twitch
        self.sent = 0

    def get(self, url, params=None, headers=None, timeout=None):
        self.sent += 1
        parsed = urlparse(url)
        if parsed.netloc == "www.googleapis.com":
            check(params.get("key") == "yt-key", "youtube: a request without the key")
            return self.youtube.get(parsed.path.rsplit("/", 1)[1], params)
        endpoint = parsed.path.split("/helix/", 1)[1]
        return self.twitch.get(endpoint, params, headers or {})

    def post(self, url, data=None, timeout=None):
        self.sent += 1
        return self.twitch.post(url, data or {})


# ---------------------------------------------------------------- fixture --

def links(**kinds):
    return {key: value for key, value in kinds.items()}


PLAYERS = [
    {"pagename": "Alpha", "links": links(youtube="https://www.youtube.com/channel/UC_A", twitch="https://www.twitch.tv/alpha")},
    {"pagename": "Bravo", "links": links(youtube="https://www.youtube.com/@Bravo", youtube2="https://www.youtube.com/channel/UC_B2",
                                         twitch="https://www.twitch.tv/Bravo_TV")},
    {"pagename": "Charlie", "links": links(youtube="https://www.youtube.com/c/charlie")},
    {"pagename": "Delta", "links": links(youtube="https://youtube.com/delta")},
    {"pagename": "Echo", "links": links(youtube="https://m.youtube.com/user/Echo/videos")},
    {"pagename": "Foxtrot", "links": links(youtube="https://www.youtube.com/c/foxtrot")},
    {"pagename": "Golf", "links": links(youtube="https://www.youtube.com/@bad!handle")},
    {"pagename": "Hotel", "links": links(twitch="https://www.twitch.tv/gone")},
    {"pagename": "India", "links": links(twitch="https://www.twitch.tv/india/videos")},
    {"pagename": "Kilo", "links": links(twitch="https://www.twitch.tv/kilo")},
    {"pagename": "Nobody", "links": []},
]
PLAYERS += [{"pagename": f"X{i}", "links": links(youtube=f"https://www.youtube.com/channel/UC_X{i}")} for i in range(60)]
PLAYERS += [{"pagename": f"Bulk{i}", "links": links(twitch=f"https://www.twitch.tv/bulk{i}")} for i in range(150)]


def fresh_world():
    tmp = Path(tempfile.mkdtemp(prefix="socials-check-"))
    (tmp / "raw").mkdir()
    (tmp / "raw" / "players.json").write_text(json.dumps(PLAYERS), encoding="utf-8")
    soc.RAW = tmp / "raw"
    soc.OUT = tmp / "out"
    soc.TOKEN_FILE = tmp / "home" / "twitch_token.json"
    clock = FakeTime()
    soc.time = clock
    youtube, twitch = FakeYouTube(), FakeTwitch(clock)
    return tmp, clock, youtube, twitch, FakeSession(youtube, twitch)


def read_out():
    return json.loads((soc.OUT / "socials.json").read_text(encoding="utf-8"))


os.environ["YOUTUBE_API_KEY"] = "yt-key"
os.environ["TWITCH_CLIENT_ID"] = "client"
os.environ.pop("TWITCH_CLIENT_SECRET", None)
temps = []

# ------------------------------------------------------------ the parsers --
print("parsers")
check(soc.youtube_ref("https://www.youtube.com/channel/UCdvYsJBtclFKNpIuApCURZA") == ("id", "UCdvYsJBtclFKNpIuApCURZA"), "parse: channel id")
check(soc.youtube_ref("https://www.youtube.com/@Cloakzy") == ("handle", "Cloakzy"), "parse: handle")
check(soc.youtube_ref("https://www.youtube.com/user/TTfue") == ("username", "TTfue"), "parse: user")
check(soc.youtube_ref("https://www.youtube.com/c/Risker") == ("custom", "Risker"), "parse: /c/")
check(soc.youtube_ref("https://www.youtube.com/Myth_YT") == ("custom", "Myth_YT"), "parse: bare custom URL")
check(soc.youtube_ref("https://www.youtube.com/watch?v=abc") is None, "parse: a video is not a channel")
check(soc.twitch_login("https://www.twitch.tv/TSM_Daequan") == "tsm_daequan", "parse: twitch login")
check(soc.twitch_login("https://www.twitch.tv/india/videos") is None, "parse: a twitch page is not a channel")

# ----------------------------------------------------------- a dry run --
print("dry run")
tmp, clock, youtube, twitch, session = fresh_world()
temps.append(tmp)
soc.main(["--dry-run"], session=session)
check(session.sent == 0, f"dry run: sent {session.sent} requests")
check(not (soc.OUT / "socials.json").exists(), "dry run: wrote socials.json")
check(not soc.state_path().exists(), "dry run: wrote the state file")
check(not soc.TOKEN_FILE.exists(), "dry run: logged in to Twitch")

# ------------------------------------------------------------ first run --
print("first run")
soc.main([], session=session)
out = read_out()
yt = out["youtube"]["counts"]
tw = out["twitch"]["counts"]
check(yt.get("Alpha") == 1000, f"youtube: Alpha reads {yt.get('Alpha')}")
check(yt.get("Bravo") == 50000, f"youtube: Bravo's bigger channel not taken ({yt.get('Bravo')})")
check(yt.get("Charlie") == 300, "youtube: a /c/ link that is a username was not found")
check("Delta" not in yt, "youtube: a hidden subscriber count was written")
check(yt.get("Echo") == 10, "youtube: a /user/ link was not found")
check("Foxtrot" not in yt and "Golf" not in yt, "youtube: a link that leads nowhere got a count")
check(sum(1 for k in yt if k.startswith("X")) == 60, "youtube: the batched channels are not all there")
check(youtube.stats_calls == 2, f"youtube: {youtube.stats_calls} count calls for 63 channels")
check(youtube.searches == 0, "youtube: searched without --search")
check(tw.get("Alpha") == 500 and tw.get("Bravo") == 7000, f"twitch: Alpha {tw.get('Alpha')}, Bravo {tw.get('Bravo')}")
check("Hotel" not in tw and "India" not in tw and "Kilo" not in tw, "twitch: a missing, odd or gone channel got a count")
check(sum(1 for k in tw if k.startswith("Bulk")) == 150, "twitch: the batched logins are not all there")
check(twitch.user_calls == 2, f"twitch: {twitch.user_calls} user calls for 153 logins")
check(twitch.device_logins == 1 and twitch.device_polls == 2, "twitch: the device login did not wait out 'pending'")
check(soc.TOKEN_FILE.exists(), "twitch: the token was not kept")
check(out["generated"] == out["youtube"]["fetched"], "socials.json: no generated date")
first_lookups = youtube.lookups

# ------------------------------------------------- the second run is cheap --
print("second run")
quota_before = youtube.quota
soc.main(["youtube"], session=session)
check(youtube.lookups == first_lookups, f"youtube: {youtube.lookups - first_lookups} lookups repeated on the second run")
check(quota_before - youtube.quota == 2, f"youtube: the second run spent {quota_before - youtube.quota} units, not 2")
check(read_out()["twitch"]["counts"] == tw, "youtube-only run lost the twitch block")

# ------------------------------------------------- misses, after 30 days --
print("rechecks and search")
clock.now += 31 * 86400
youtube.quota = 10_000
soc.main(["youtube", "--search", "5"], session=session)
check(read_out()["youtube"]["counts"].get("Foxtrot") == 77, "youtube: --search did not find Foxtrot after 30 days")
check(youtube.searches == 2, f"youtube: {youtube.searches} searches - Foxtrot and Golf, once each")
searches = youtube.searches
soc.main(["youtube", "--search", "5"], session=session)
check(youtube.searches == searches, "youtube: a link that found nothing was asked again the next day")

# --------------------------------------------------------- Twitch tokens --
print("twitch tokens")
logins_before = twitch.device_logins
clock.now += 5 * 3600            # the access token has expired; the refresh token has not
soc.main(["twitch"], session=session)
check(twitch.refresh_used >= 1 and twitch.device_logins == logins_before, "twitch: an expired token was not refreshed")
check(twitch.follower_calls >= 40, "twitch: never reached the 429")
twitch.revoke_at = twitch.follower_calls + 10
soc.main(["twitch"], session=session)
check(read_out()["twitch"]["counts"].get("Bravo") == 7000, "twitch: a 401 mid-run lost the counts")

# ------------------------------------------------- YouTube's quota runs out --
print("quota")
tmp, clock, youtube, twitch, session = fresh_world()
temps.append(tmp)
youtube.quota = 3                # three lookups and then the day is over
soc.main(["youtube"], session=session)
check(not (soc.OUT / "socials.json").exists(), "quota: wrote counts with no quota left for them")
state = json.loads(soc.state_path().read_text(encoding="utf-8"))
kept = [k for k, v in state["youtube"]["refs"].items() if not k.startswith("id:")]
check(len(kept) >= 1, "quota: the lookups made before the quota ran out were not kept")
youtube.quota = 10_000           # the next day
lookups = youtube.lookups
soc.main(["youtube"], session=session)
check(read_out()["youtube"]["counts"].get("Charlie") == 300, "quota: the next day did not finish the job")
check(youtube.lookups - lookups <= 6 - len(kept) + 1, "quota: the next day looked up again what was already known")
soc.main(["youtube", "--quota", "3"], session=session)
check(read_out()["youtube"]["counts"].get("Alpha") == 1000, "quota: --quota 3 could not even refresh the counts")

# ----------------------------------------------------------- the guard --
print("guard")
youtube.empty = True
soc.main(["youtube"], session=session)
check(len(read_out()["youtube"]["counts"]) > 60, "guard: an empty answer overwrote the counts")
soc.main(["youtube", "--force"], session=session)
check(read_out()["youtube"]["counts"] == {}, "guard: --force did not write")

for tmp in temps:
    shutil.rmtree(tmp, ignore_errors=True)

if problems:
    print(f"\n{len(problems)} problem(s)")
    sys.exit(1)
print("\nall socials checks passed")

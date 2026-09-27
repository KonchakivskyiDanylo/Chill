"""
Drives liquipedia_api.py against a fake LiquipediaDB with a fake clock.
Nothing here touches the network or the real raw folder.

    .venv/Scripts/python scripts/check_liquipedia_api.py

The first download, an incremental run over a fortnight of wiki edits and
webhook pings, the 60-an-hour budget and a 429, resuming after Ctrl+C, the
guards against overwriting a file with a broken answer, and a dry run.
"""
import importlib.util
import json
import re
import shutil
import sys
import tempfile
import time as real_time
from pathlib import Path

SRC = Path(__file__).resolve().parent / "liquipedia_api.py"
spec = importlib.util.spec_from_file_location("lpapi", SRC)
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)

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


def parse_conditions(text):
    """[[f::>v]] OR [[f::v]] ... -> list of (field, op, value)."""
    terms = []
    for field, op, value in re.findall(r"\[\[(\w+)::([><!]?)(.*?)\]\]", text or ""):
        terms.append((field, op, value))
    return terms


def matches(row, terms):
    if not terms:
        return True
    for field, op, value in terms:
        have = str(row.get(field) or "")
        if op == ">" and have > value and have[:10] != value:   # strict, by day and time
            return True
        if op == ">" and have > value and len(have) > 10 and have[:10] == value and have[11:] > "00:00:00":
            return True
        if op == "" and have == value:
            return True
    return False


class FakeApi:
    """One table of rows per endpoint; answers like LiquipediaDB, logs every call."""

    def __init__(self, clock, tables):
        self.clock = clock
        self.tables = tables
        self.calls = []            # (time, table, params)
        self.throttle_at = set()   # call numbers answered with 429
        self.explode_at = None     # call number that raises KeyboardInterrupt
        self.duplicate = True      # the docs warn the API can repeat rows

    def get(self, url, params=None, timeout=None):
        table = url.rsplit("/", 1)[1]
        n = len(self.calls) + 1
        if self.explode_at == n:
            self.explode_at = None
            raise KeyboardInterrupt
        self.calls.append((self.clock.time(), table, dict(params)))
        if n in self.throttle_at:
            return Response(429, {"result": [], "error": ["rate limited"]}, {"Retry-After": "1800"})
        assert params["wiki"] == "fortnite"
        assert params["order"] == "pageid ASC, objectname ASC", params["order"]
        rows = [r for r in self.tables[table] if matches(r, parse_conditions(params.get("conditions")))]
        rows.sort(key=lambda r: (r["pageid"], r["objectname"]))
        page = rows[params["offset"]:params["offset"] + params["limit"]]
        if self.duplicate and page:
            page = page + [page[0]]  # a repeat, as the docs warn
            page = page[:params["limit"]] if len(page) > params["limit"] else page
        return Response(200, {"result": page})


# ------------------------------------------------------------------- data --

def player(pid, name, earnings):
    return {"pageid": pid, "pagename": name, "namespace": 0, "objectname": f"{pid}_player_{name}",
            "id": name, "earnings": earnings}


def team(pid, name):
    return {"pageid": pid, "pagename": name, "namespace": 0, "objectname": f"{pid}_team_{name}", "name": name}


def tournament(pid, name, start, end):
    return {"pageid": pid, "pagename": name, "namespace": 0, "objectname": f"{pid}_tournament",
            "name": name.replace("_", " "), "startdate": start, "enddate": end}


def placement(pid, page, who, place, day):
    return {"pageid": pid, "pagename": page, "namespace": 0, "objectname": f"{pid}_ranking1_{who}",
            "tournament": page.replace("_", " "), "placement": place, "date": f"{day} 00:00:00",
            "opponentname": who}


def transfer(pid, page, n, who, day):
    return {"pageid": pid, "pagename": page, "namespace": 0, "objectname": f"transfer_{day}_{n:05d}",
            "player": who, "date": f"{day} 00:00:00"}


def base_wiki():
    players = [player(1000 + i, f"P{i}", 1000 * i) for i in range(120)]
    teams = [team(5000 + i, f"Team_{i}") for i in range(15)]
    tours = [tournament(8000 + i, f"Cup_{i}", f"2026-0{1 + i % 8}-10", f"2026-0{1 + i % 8}-11") for i in range(40)]
    places = []
    for t in tours:
        for k in range(12):
            places.append(placement(t["pageid"], t["pagename"], f"P{(t['pageid'] + k) % 120}", str(k + 1), t["enddate"]))
    # An event from early September whose results were not in yet: slots, no names.
    tours.append(tournament(8050, "Sept_Cup", "2026-09-04", "2026-09-05"))
    places += [placement(8050, "Sept_Cup", f"TBD{k}", "", "2026-09-05") for k in range(12)]
    transfers = [transfer(9000 + i // 10, f"Transfers_2026_Q{1 + i // 30}", i, f"P{i % 120}", f"2026-0{1 + i // 20}-05")
                 for i in range(100)]
    return {"player": players, "team": teams, "tournament": tours, "placement": places, "transfer": transfers}


def write_raw(folder, wiki, duplicate_placements=0):
    folder.mkdir(parents=True, exist_ok=True)
    for d in api.DATASETS:
        rows = [dict(r) for r in wiki[d.table]]
        if d.table == "placement":
            rows += [dict(r) for r in rows[:duplicate_placements]]
        api.save_rows(folder / d.file, rows)


def read_raw(folder):
    return {d.table: api.load_rows(folder / d.file) for d in api.DATASETS}


def as_keys(rows):
    return sorted(json.dumps(r, sort_keys=True) for r in rows)


def setup(tmp, name):
    folder = tmp / name
    clock = FakeTime()
    api.time = clock
    api.RAW = folder
    api.LIMIT = 10          # small pages, so a few hundred rows is many requests
    api.PAGES_PER_CALL = 3
    api.read_pings = lambda state: ([], None)
    return folder, clock


def budget_ok(fake, label):
    times = [t for t, _, _ in fake.calls]
    worst = max((sum(1 for u in times if t <= u < t + 3600) for t in times), default=0)
    check(worst <= api.PER_HOUR, f"{label}: {worst} requests inside one hour")
    gaps = [b - a for a, b in zip(times, times[1:])]
    check(all(g >= api.SPACING - 1e-6 for g in gaps), f"{label}: two requests closer than SPACING")
    return worst


tmp = Path(tempfile.mkdtemp(prefix="lpapi-"))
try:
    # ---------------------------------------------------- 1. first download
    print("1. first download, no files yet")
    folder, clock = setup(tmp, "bootstrap")
    wiki = base_wiki()
    fake = FakeApi(clock, wiki)
    fake.throttle_at = {7}
    api.main([], session=fake)
    got = read_raw(folder)
    for d in api.DATASETS:
        check(as_keys(got[d.table]) == as_keys(wiki[d.table]),
              f"bootstrap {d.table}: {len(got[d.table])} rows, wiki has {len(wiki[d.table])}")
    worst = budget_ok(fake, "bootstrap")
    total = len(fake.calls)
    retried = [c for c in fake.calls if c[1] == fake.calls[6][1]]
    check(fake.calls[7][0] - fake.calls[6][0] >= 1800, "the 429 did not wait for Retry-After")
    print(f"   {total} requests over {(fake.calls[-1][0] - fake.calls[0][0]) / 3600:.1f} fake hours, "
          f"at most {worst} in any hour")
    state = json.loads((folder / "sync_state.json").read_text())
    check(set(state["synced"]) == set(api.BY_TABLE), "bootstrap: not every table marked synced")
    check(not state.get("jobs"), "bootstrap: jobs left behind")
    check(not list((folder / ".staging").glob("*.jsonl")), "bootstrap: staging files left behind")

    # --------------------------------------------- 2. two weeks of changes
    print("2. incremental run after two weeks of wiki edits, with webhook pings")
    folder, clock = setup(tmp, "incremental")
    old = base_wiki()
    write_raw(folder, old, duplicate_placements=25)   # the old dump's repeats
    (folder / "sync_state.json").write_text(json.dumps({}))
    wiki = base_wiki()
    # New tournament after the dump, with results.
    new_t = tournament(8100, "Globals_2026", "2026-09-26", "2026-09-27")
    wiki["tournament"].append(new_t)
    wiki["placement"] += [placement(8100, "Globals_2026", f"P{k}", str(k + 1), "2026-09-27") for k in range(15)]
    # A recent event's placeholder rows replaced by real ones (different objectnames).
    recent = next(t for t in wiki["tournament"] if t["pagename"] == "Sept_Cup")
    wiki["placement"] = [r for r in wiki["placement"] if r["pagename"] != recent["pagename"]]
    wiki["placement"] += [placement(recent["pageid"], recent["pagename"], f"Q{k}", str(k + 1), "2026-09-05")
                          for k in range(5)]
    # An old tournament edited (outside the window) - arrives by webhook.
    edited = wiki["tournament"][0]   # 2026-01
    edited["name"] = "Cup 0 (renamed)"
    wiki["placement"] = [r for r in wiki["placement"] if r["pagename"] != edited["pagename"]]
    wiki["placement"] += [placement(edited["pageid"], edited["pagename"], f"R{k}", str(k + 1), "2026-01-11")
                          for k in range(3)]
    # An old tournament deleted, one moved - by webhook.
    deleted = wiki["tournament"][8]   # 2026-01
    wiki["tournament"].remove(deleted)
    wiki["placement"] = [r for r in wiki["placement"] if r["pagename"] != deleted["pagename"]]
    moved = wiki["tournament"][15]    # 2026-08? only if it lands outside the window below
    moved_old = moved["pagename"]
    for r in wiki["tournament"] + wiki["placement"]:
        if r["pagename"] == moved_old:
            r["pagename"] = "Cup_Moved"
    # New players, and earnings moved for everyone.
    wiki["player"] += [player(2000 + i, f"New{i}", 50) for i in range(3)]
    for p in wiki["player"][:50]:
        p["earnings"] += 7
    # New transfers.
    wiki["transfer"] += [transfer(9020, "Transfers_2026_Q3", 500 + i, f"P{i}", "2026-09-20") for i in range(12)]

    pings = [
        {"id": 11, "body": {"wiki": "fortnite", "namespace": 0, "event": "edit", "page": edited["pagename"].replace("_", " ")}},
        {"id": 12, "body": {"wiki": "fortnite", "namespace": 0, "event": "delete", "page": deleted["pagename"]}},
        {"id": 13, "body": {"wiki": "fortnite", "namespace": 0, "event": "move", "page": "Cup_Moved",
                            "from_page": moved_old, "from_namespace": 0}},
        {"id": 14, "body": {"wiki": "dota2", "namespace": 0, "event": "edit", "page": "Whatever"}},
    ]
    api.read_pings = lambda state: (pings, 14)
    fake = FakeApi(clock, wiki)
    summaries = api.main(["--since", "2026-09-14"], session=fake)
    for line in summaries:
        print("  ", line)
    got = read_raw(folder)
    for d in api.DATASETS:
        check(as_keys(got[d.table]) == as_keys(wiki[d.table]),
              f"incremental {d.table}: {len(got[d.table])} rows, wiki has {len(wiki[d.table])} "
              f"(missing {len(set(as_keys(wiki[d.table])) - set(as_keys(got[d.table])))}, "
              f"extra {len(set(as_keys(got[d.table])) - set(as_keys(wiki[d.table])))})")
    by_table = {}
    for _, table, params in fake.calls:
        by_table[table] = by_table.get(table, 0) + 1
    full_placement_calls = -(-len(wiki["placement"]) // api.LIMIT)
    print(f"   {len(fake.calls)} requests: {by_table}; a full placement read would be {full_placement_calls}")
    check(by_table["placement"] < full_placement_calls / 2, "incremental: placements were not read incrementally")
    state = json.loads((folder / "sync_state.json").read_text())
    check(state.get("webhook_cursor") == 14, "incremental: webhook cursor not advanced")
    budget_ok(fake, "incremental")

    # ------------------------------------------ 3. a run right after it
    print("3. a second run straight away: the budget carries over")
    fake2 = FakeApi(clock, wiki)
    api.read_pings = lambda state: ([], None)
    first_result = read_raw(folder)
    api.main([], session=fake2)
    joined = FakeApi(clock, wiki)
    joined.calls = fake.calls + fake2.calls
    budget_ok(joined, "back-to-back runs")
    got = read_raw(folder)
    check(all(as_keys(got[d.table]) == as_keys(first_result[d.table]) for d in api.DATASETS), "second run changed the data")
    print(f"   {len(fake2.calls)} requests")

    # --------------------------------------------------- 4. Ctrl+C resume
    print("4. interrupted mid-download, then run again")
    folder, clock = setup(tmp, "resume")
    wiki = base_wiki()
    fake = FakeApi(clock, wiki)
    fake.explode_at = 30
    try:
        api.main(["placement"], session=fake)
        check(False, "resume: the interrupt did not stop the run")
    except KeyboardInterrupt:
        pass
    check(not (folder / "placements.jsonl").exists(), "resume: a half download was written as the file")
    api.main(["placement"], session=fake)
    got = read_raw(folder)
    check(as_keys(got["placement"]) == as_keys(wiki["placement"]), "resume placement: wrong rows")
    fresh = FakeApi(FakeTime(), wiki)
    api.time = fresh.clock
    api.RAW = tmp / "resume-clean"
    api.main(["placement"], session=fresh)
    print(f"   {len(fake.calls)} requests with the interruption, {len(fresh.calls)} without")
    check(len(fake.calls) == len(fresh.calls), "resume: pages were fetched twice")

    # ------------------------------------------------ 5. safety guards
    print("5. a broken answer does not overwrite the files")
    folder, clock = setup(tmp, "guard")
    wiki = base_wiki()
    write_raw(folder, wiki)
    before = (folder / "placements.jsonl").read_text()
    broken = {k: (list(v) if k != "placement" else []) for k, v in wiki.items()}
    try:
        api.main(["placement", "--since", "2026-09-01"], session=FakeApi(clock, broken))
        check(False, "guard: an empty placement window was accepted")
    except api.ApiError as error:
        print("   refused:", error)
    check((folder / "placements.jsonl").read_text() == before, "guard: placements.jsonl was changed")
    shrunk = dict(wiki, player=wiki["player"][:10])
    try:
        api.main(["player"], session=FakeApi(clock, shrunk))
        check(False, "guard: a player table a tenth of the size was accepted")
    except api.ApiError as error:
        print("   refused:", error)

    # ----------------------------------------------------- 6. dry run
    print("6. dry run sends nothing")
    folder, clock = setup(tmp, "dry")
    write_raw(folder, base_wiki())
    before = {d.file: (folder / d.file).read_text() for d in api.DATASETS}
    api.main(["--dry-run", "--since", "2026-09-14"], session=None)
    check(all((folder / d.file).read_text() == before[d.file] for d in api.DATASETS), "dry run changed a file")

    # ----------------------------------------------- 7. webhook page names
    print("7. webhook ping handling")
    refresh, drop = api.pages_from([
        {"id": 1, "body": {"wiki": "fortnite", "namespace": 0, "event": "edit", "page": "A Page"}},
        {"id": 2, "body": {"wiki": "fortnite", "namespace": 0, "event": "delete", "page": "A Page"}},
        {"id": 3, "body": {"wiki": "fortnite", "namespace": 0, "event": "edit", "page": "B"}},
        {"id": 4, "body": {"wiki": "fortnite", "namespace": 2, "event": "edit", "page": "User:X"}},
        {"id": 5, "body": {"wiki": "fortnite", "namespace": 2, "event": "move", "page": "User:X/C",
                           "from_page": "C", "from_namespace": 0}},
    ])
    check(refresh == {"B"} and drop == {"A_Page", "C"}, f"pings read as refresh={refresh} drop={drop}")
finally:
    shutil.rmtree(tmp, ignore_errors=True)

print()
print(f"{len(problems)} problem(s)" if problems else "all liquipedia_api checks passed")
sys.exit(1 if problems else 0)

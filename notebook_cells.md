# Notebook cells to run

Four cells. Paste each into a Jupyter cell and run from the repo root.

Cells 1-3 are needed before the app builds. **Cell 4 is not** — nothing reads
`orgs.json` yet; it is there so the data exists when the game logic for it does.

Neither of the two new files carries a `tier` column — the app joins them to
`players.json` by `pagename` and reads `tier` from there, so re-tiering stays a
one-column edit and these files never go stale.

---

## Cell 1 — `region_tier` on `players.json`

Your global `tier` is a pure earnings rank across all 5,678 rows, so the
non-Western regions have no Easy band at all:

| region | easy | medium | hard |
| --- | ---: | ---: | ---: |
| North America | 53 | 344 | 1403 |
| Europe | 57 | 355 | 1208 |
| Asia | **0** | 82 | 566 |
| Oceania | **0** | 72 | 544 |
| South America | 3 | 104 | 351 |
| Middle East | **0** | 51 | 370 |
| Africa | 0 | 1 | 21 |

This adds `region_tier`: the same 2% / 18% / 80% cut, ranked inside each region.
Drop it into the notebook right after the cell that writes `tier` (the one with
`EASY_PCT, MEDIUM_PCT = 0.02, 0.20`), before the cell that saves.

```python
# region_tier — the same cut as `tier`, ranked within each region.
#
# Fortnitedle lets you pick a region first. Global `tier` cannot serve that:
# it ranks all 5,678 rows on earnings, so Asia, Oceania and the Middle East
# have zero Easy players between them and "Asia + Easy" would quietly hand
# back Medium instead. Ranked inside the region, every region has all three.
#
# `unused` carries over unchanged — one rule for who is playable, not two.
from collections import Counter, defaultdict

by_region = defaultdict(list)
for r in rows:
    if r['tier'] != 'unused':
        by_region[r.get('region') or 'Unknown'].append(r)

for r in rows:
    r['region_tier'] = 'unused'

for region, members in by_region.items():
    members.sort(key=lambda r: (-(r.get('earnings') or 0), r['id'].lower()))
    easy_cut, med_cut = len(members) * EASY_PCT, len(members) * MEDIUM_PCT
    for i, r in enumerate(members, start=1):
        r['region_tier'] = 'easy' if i <= easy_cut else 'medium' if i <= med_cut else 'hard'

for region, members in sorted(by_region.items(), key=lambda kv: -len(kv[1])):
    c = Counter(r['region_tier'] for r in members)
    print(f"{region:<16} easy {c['easy']:>4}  medium {c['medium']:>4}  hard {c['hard']:>5}")
```

Then re-run your existing save cell. Add `region_tier` to its assertion if you
want the same guard `tier` has:

```python
assert all(r['region_tier'] in {'easy', 'medium', 'hard', 'unused'} for r in check)
```

Output on the current export:

```
North America    easy   36  medium  332  hard  1473
Europe           easy   32  medium  295  hard  1311
Asia             easy   13  medium  118  hard   526
Oceania          easy   12  medium  112  hard   500
South America    easy    9  medium   83  hard   370
Middle East      easy    8  medium   78  hard   348
Africa           easy    0  medium    4  hard    18
```

Africa is the one hole: 22 rows, so 2% rounds to nobody. The app greys out a
difficulty with no players in the chosen region rather than quietly widening,
and prints the count on every card, so that is visible before you start.

---

## Cell 2 — `career_path.json`

Your filter, unchanged, joined to `placements.json`.

```python
import json, re
from datetime import date
import pandas as pd

OUT = 'liquipedia_data/clean_data/fortnite/career_path.json'
MIN_APPEARANCES = 5          # a path is only worth guessing from this many majors

df_tournaments = pd.read_json('liquipedia_data/clean_data/fortnite/tournaments.json')

def has_epic_games(val):
    if isinstance(val, list):
        return any(
            "epic games" in str(item).lower()
            or (isinstance(item, dict) and "epic games" in str(item.values()).lower())
            for item in val
        )
    elif isinstance(val, str):
        return "epic games" in val.lower()
    return False

exclude_pattern = r"console|mobile|twitch"

filtered_df = df_tournaments[
    (df_tournaments["liquipediatier"] == 1)
    & (df_tournaments["liquipediatiertype"].isna())
    & (df_tournaments["organizers"].apply(has_epic_games))
    & (pd.to_datetime(df_tournaments["startdate"], errors="coerce") >= "2019-07-26")
    & (~df_tournaments["name"].str.contains(exclude_pattern, case=False, na=False))
].sort_values("startdate")

print(len(filtered_df), 'tournaments')

# ---------------------------------------------------------------- tournaments
tournaments, index_of = [], {}
for _, t in filtered_df.iterrows():
    index_of[t['name']] = len(tournaments)
    tournaments.append({
        'name': t['name'],
        'date': str(t['startdate'])[:10],
        'mode': t['mode'],
        'region': t['region'],
        'prizePool': None if pd.isna(t['prizepool']) else round(float(t['prizepool'])),
    })

# ------------------------------------------------------------------ placements
players_rows = json.load(open('liquipedia_data/clean_data/fortnite/players.json', encoding='utf-8'))
by_page = {p['pagename'].replace('_', ' '): p['pagename'] for p in players_rows}
by_id = {}
for p in players_rows:
    by_id.setdefault(p['id'], p['pagename'])

def resolve(name):
    """A placement's participant name -> a players.json pagename, or None."""
    return by_page.get(name) or by_id.get(name)

placements = json.load(open('liquipedia_data/clean_data/fortnite/placements.json', encoding='utf-8'))

results = {}
for row in placements:
    idx = index_of.get(row.get('tournament'))
    if idx is None:
        continue
    # '', 'DNP' and 'DQ' are not a finish anyone can be identified by; a range
    # like '35-36' is, and reads as its best end.
    m = re.match(r'^(\d+)', str(row.get('placement') or ''))
    if not m:
        continue
    placement = int(m.group(1))
    for part in (row.get('participants') or []):
        page = resolve(part.get('player') or '')
        if page:
            results.setdefault(page, {})[idx] = placement

players = [
    {'id': page, 'results': sorted([i, p] for i, p in hits.items())}
    for page, hits in results.items()
    if len(hits) >= MIN_APPEARANCES
]
players.sort(key=lambda p: p['id'])

payload = {
    'generated': date.today().isoformat(),
    'minAppearances': MIN_APPEARANCES,
    'tournaments': tournaments,
    'players': players,
}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

tier = {p['pagename']: p['tier'] for p in players_rows}
from collections import Counter
print(len(players), 'players with', MIN_APPEARANCES, '+ appearances')
print(Counter(tier.get(p['id']) for p in players))
print('longest path:', max(len(p['results']) for p in players))
```

Expected, on the current export: 188 tournaments, **1,175 players**, `easy 92 /
medium 567 / hard 516`, longest path 34 (EpikWhale). 1,175 rather than 1,208
because `''`, `DNP` and `DQ` rows are dropped — 352 of them — and a few players
fall under five once they are.

---

## Cell 3 — `teammates.json`

Every tournament in the dump, not just the ones somebody won. A pair counts once
per placement row they share, which is what "played together" means — two solo
players at the same event are not teammates.

```python
import json, itertools
from collections import Counter, defaultdict
from datetime import date

OUT = 'liquipedia_data/clean_data/fortnite/teammates.json'
TOP = 10          # Who Are Ya reveals at most this many clues

players_rows = json.load(open('liquipedia_data/clean_data/fortnite/players.json', encoding='utf-8'))
by_page = {p['pagename'].replace('_', ' '): p['pagename'] for p in players_rows}
by_id = {}
for p in players_rows:
    by_id.setdefault(p['id'], p['pagename'])

def resolve(name):
    return by_page.get(name) or by_id.get(name)

placements = json.load(open('liquipedia_data/clean_data/fortnite/placements.json', encoding='utf-8'))

pair = Counter()
for row in placements:
    parts = row.get('participants') or []
    if len(parts) < 2:
        continue
    pages = sorted({resolve(p.get('player') or '') for p in parts} - {None})
    for a, b in itertools.combinations(pages, 2):
        pair[(a, b)] += 1

mates = defaultdict(list)
for (a, b), n in pair.items():
    mates[a].append([b, n])
    mates[b].append([a, n])

players = []
for page, entries in mates.items():
    entries.sort(key=lambda e: (-e[1], e[0]))
    players.append({'id': page, 'mates': entries[:TOP]})
players.sort(key=lambda p: p['id'])

payload = {'generated': date.today().isoformat(), 'top': TOP, 'players': players}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

tier = {p['pagename']: p['tier'] for p in players_rows}
print(len(pair), 'distinct pairs;', len(players), 'players with a teammate')
print('>=3 teammates:', Counter(tier.get(p['id']) for p in players if len(p['mates']) >= 3))
print('Peterbot:', next(p for p in players if p['id'] == 'Peterbot')['mates'])
```

Expected: 39,038 pairs, 5,496 players, `>=3 teammates` = `easy 113 / medium 1000
/ hard 3692`, and Peterbot's list starting `Pollo 126, Cold 54, Ritual 49`.

61,016 participant names never resolve to a `players.json` row (205,641
occurrences) — people Liquipedia has placements for but no player page. They are
skipped, so a pair count is "tournaments together that Liquipedia can name both
of you in", not an absolute.

---

## Cell 4 — `orgs.json` *(not wired up yet)*

Nothing reads this file. It exists because the four criteria games are starved
of everything except country and region, and the org data that would fix it is
already in the dump.

Where they stand today, on the 316-player Wikipedia import:

| | usable criteria | of which country/region |
| --- | ---: | ---: |
| Griefer | 21 | 16 |
| Connections | 28 | 22 |
| Piece Control | 46 | 18 |
| List | 47 categories | 14 (plus 23 FNCS-season ones) |

Team criteria are written into all four and **none of them ever fire**: the
Wikipedia import has 17 orgs with 1-2 players each, under every threshold.
Griefer's own rules say `a rule, for example "plays for NRG"` and that rule
cannot currently be generated.

`transfers.json` is 40,119 roster moves and is otherwise unused. Reduced, it
gives 979 orgs with four or more players.

```python
import json
from collections import defaultdict
from datetime import date

OUT = 'liquipedia_data/clean_data/fortnite/orgs.json'
MIN_PLAYERS = 4          # a criterion nobody can fill is not a criterion

BASE = 'liquipedia_data/clean_data/fortnite'
players_rows = json.load(open(f'{BASE}/players.json', encoding='utf-8'))
teams_rows = json.load(open(f'{BASE}/teams.json', encoding='utf-8'))
transfers = json.load(open(f'{BASE}/transfers.json', encoding='utf-8'))

by_page = {p['pagename'].replace('_', ' '): p['pagename'] for p in players_rows}
by_id = {}
for p in players_rows:
    by_id.setdefault(p['id'], p['pagename'])
tier = {p['pagename']: p['tier'] for p in players_rows}

def resolve(name):
    """A transfer's player name -> a playable players.json pagename, or None."""
    page = by_page.get(name) or by_id.get(name)
    return page if page and tier.get(page) != 'unused' else None

page_of = {t['name']: t['pagename'] for t in teams_rows}
team_meta = {t['pagename']: t for t in teams_rows}

NOT_A_TEAM = {'free agent', 'retired', 'retirement', 'inactive', 'none', 'unknown', ''}

def org_key(name):
    """Transfers spell orgs by display name; teams.json and players.json use the
    page name. Falls back to the raw string for the ~2,100 grassroots orgs with
    no Liquipedia team page — `hasPage` below says which is which."""
    if not name or name.strip().lower() in NOT_A_TEAM:
        return None
    return page_of.get(name, name)

ever = defaultdict(set)
for row in transfers:
    page = resolve(row.get('player') or '')
    if not page:
        continue
    # Per side, not per row: `role_from` is what they were at `fromteam` and
    # `role_to` what they became at `toteam`, so someone who left as a player
    # and joined as a streamer counts for the first org and not the second.
    for side, role in (('fromteam', 'role_from'), ('toteam', 'role_to')):
        if row.get(role) != 'Player':
            continue
        key = org_key(row.get(side))
        if key:
            ever[key].add(page)

# players.json is the authority on who is there now, and catches recent
# signings that have no transfer row yet.
current = defaultdict(set)
for p in players_rows:
    if p['tier'] != 'unused' and p.get('teampagename'):
        current[p['teampagename']].add(p['pagename'])
for key, members in current.items():
    ever[key] |= members

orgs = []
for key, members in ever.items():
    if len(members) < MIN_PLAYERS:
        continue
    meta = team_meta.get(key)
    orgs.append({
        'id': key,
        'name': meta['name'] if meta else key,
        'hasPage': meta is not None,
        'region': (meta or {}).get('region'),
        'status': (meta or {}).get('status'),
        'earnings': round(float((meta or {}).get('earnings') or 0)),
        'current': sorted(current.get(key, ())),
        'ever': sorted(members),
    })
# Richest first, so "take the top N" is a one-liner later.
orgs.sort(key=lambda o: (-o['earnings'], o['name'].lower()))

payload = {'generated': date.today().isoformat(), 'minPlayers': MIN_PLAYERS, 'orgs': orgs}
with open(OUT, 'w', encoding='utf-8') as f:
    json.dump(payload, f, ensure_ascii=False, separators=(',', ':'))

paged = [o for o in orgs if o['hasPage']]
print(f'{len(orgs)} orgs with {MIN_PLAYERS}+ players, {len(paged)} with a Liquipedia team page')
print('  with page and $100k+ org earnings:', sum(1 for o in paged if o['earnings'] >= 100_000))
print('  with page and $1M+ org earnings:  ', sum(1 for o in paged if o['earnings'] >= 1_000_000))
print('  with a current roster of 4+:      ', sum(1 for o in orgs if len(o['current']) >= MIN_PLAYERS))
for o in orgs[:10]:
    print(f"  {o['name']:<24} ever {len(o['ever']):>3}  now {len(o['current']):>2}  ${o['earnings']:,}")
```

Expected, on the current export — 236 KB, 59 KB gzipped:

```
979 orgs with 4+ players, 414 with a Liquipedia team page
  with page and $100k+ org earnings: 174
  with page and $1M+ org earnings:   30
  with a current roster of 4+:       69

  FaZe Clan                ever  21  now  0  $4,635,700
  NRG                      ever  12  now  1  $4,592,147
  Sentinels                ever   8  now  0  $4,114,758
  Team Falcons             ever  23  now  7  $3,764,580
  Lazarus                  ever   9  now  0  $3,714,968
  100 Thieves              ever  21  now  7  $3,713,116
  Guild Esports            ever  14  now  0  $3,206,091
  Ghost Gaming             ever  20  now  1  $3,068,598
  Team Liquid              ever  20  now  4  $2,644,750
  XSET                     ever  22  now 13  $2,393,596
```

### Shape

```jsonc
{ "generated": "...", "minPlayers": 4, "orgs": [
  { "id": "FaZe_Clan",          // teams.json pagename, or the raw name when hasPage is false
    "name": "FaZe Clan",
    "hasPage": true,
    "region": "North America",  // null without a page
    "status": "disbanded",      // teams.json's own word for it
    "earnings": 4635700,        // the org's, not a player's
    "current": ["..."],         // pagenames on the roster today
    "ever":    ["..."] }        // pagenames who were ever there, current included
]}
```

`current` and `ever` are two different questions and both are worth asking:
"plays for FaZe" is a Griefer rule, "has played for FaZe" is a Piece Control
axis. No `tier` column, same as the other two files — difficulty always joins
back to `players.json` by pagename.

### The filter to think about later

979 is too many and the tail is not what you want. Headcount is a bad sort:
the biggest org in the file is **2AM Esports at 142 players**, a grassroots org
with no Liquipedia page that nobody watching the scene would name. Org earnings
sort far better — `hasPage and earnings >= 100_000` leaves **174**, which is
roughly the number of orgs a Fortnite viewer could actually recognise.

That is the decision I would leave to you rather than bake in, which is why the
cell writes all 979 and sorts by earnings instead of cutting.

---

## After running

```bash
npm run check:games
```

While `career_path.json` or `teammates.json` is missing, `check:games` prints a
SKIP line naming the cell and still exits 0; `npm run dev` and `npm run build`
fail on the missing import, because those two games have nothing to run on.
`orgs.json` is not in that set — nothing imports it, so its absence changes
nothing.

`liquipedia_data/` is gitignored apart from `players.json`. The new files are
small enough to commit — career_path 152 KB, teammates 681 KB, orgs 236 KB —
and `.gitignore` already un-ignores the first two so the site builds from a
fresh clone. Add the third when something reads it:

```
!liquipedia_data/clean_data/fortnite/orgs.json
```

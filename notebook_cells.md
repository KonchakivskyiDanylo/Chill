# Notebook cells to run

Four cells, **in this order, top to bottom**. One kernel, started from the repo
root — `BASE` is a relative path. Cell 1 loads `placements.json` (154 MB,
~4 s) and the other three reuse it.

| cell | writes |
| --- | --- |
| 1 | — (loads the dump, classifies the tournaments) |
| 2 | `rankings.json` |
| 3 | `rankings.json` again, with four more boards |
| 4 | `pools.json` |

There is a fifth cell in an appendix at the bottom that rebuilds
`facts.json`. **You do not need it** — nothing in the app has changed that
depends on it, and it is the one cell where the `is_lan` question below
actually changes the data.

> **Cell 3 appends to `boards`.** Running it twice in one kernel duplicates the
> four mode boards. If you need to redo it, run cell 2 again first.

This is transcribed from `notebook_cells.ipynb` verbatim, with three fixes
that a clean run needs:

- `import os` — `os.path.getsize` was used to report file sizes and never
  imported. It survived in the old notebook only because those lines are the
  last thing each cell does.
- `year_of` — lived in a scratch cell of its own rather than in setup, so a
  clean run hit `NameError: name 'year_of' is not defined` partway through the
  rankings cell.
- four more entries in `WANTED`, for the event fields that do not exist yet.

---

## Cell 1 — shared setup

Loads everything and classifies the 14,645 tournaments. Every rule the other
cells depend on is defined here and nowhere else.

Note what `is_lan` actually means, because it is stricter than the word
suggests: **Offline, tier 1, no tier type, organised by Epic, from the 2019
World Cup onwards, excluding console/mobile/twitch/challenge.** That gives
**9 LAN events**, and it is what the current `facts.json` was built on.
Loosening it — to Offline-or-Hybrid across tiers 1–2, say — gives 80, and
moves LAN appearances, LAN wins, List's "won a LAN" category, Griefer's
`lan-winner` rule, Tic Tac Toe's LAN axes and every Tenaball LAN board. Worth
doing deliberately one day; not worth doing by accident.

```python
import json, re, itertools, os
from collections import Counter, defaultdict
from datetime import date
import pandas as pd

BASE = 'liquipedia_data/clean_data/fortnite'
TODAY = date.today().isoformat()

players_rows = json.load(open(f'{BASE}/players.json', encoding='utf-8'))
tournaments  = json.load(open(f'{BASE}/tournaments.json', encoding='utf-8'))
placements   = json.load(open(f'{BASE}/placements.json', encoding='utf-8'))
orgs_payload = json.load(open(f'{BASE}/orgs.json', encoding='utf-8'))

# ------------------------------------------------------------------ resolve --
# Identical to the helper in the career_path and teammates cells: a placement's
# participant name -> a *playable* players.json pagename, or None.
by_page = {p['pagename'].replace('_', ' '): p['pagename'] for p in players_rows}
by_id = {}
for p in players_rows:
    by_id.setdefault(p['id'], p['pagename'])
tier = {p['pagename']: p['tier'] for p in players_rows}
player_of = {p['pagename']: p for p in players_rows}

def resolve(name):
    page = by_page.get(name) or by_id.get(name)
    return page if page and tier.get(page) != 'unused' else None

PLAYABLE = [p for p in players_rows if p['tier'] != 'unused']
print(f'{len(PLAYABLE):,} playable players, {len(placements):,} placement rows')

# -------------------------------------------------------------- classifiers --
def is_epic(t):
    return any('epic games' in str(o).lower() for o in (t.get('organizers') or []))

EXCLUDE_LAN_PATTERN = re.compile(r"console|mobile|twitch|challenge", re.IGNORECASE)


def has_epic_games(val):
    if isinstance(val, list):
        return any(
            "epic games" in str(item).lower()
            or (
                isinstance(item, dict)
                and "epic games" in str(item.values()).lower()
            )
            for item in val
        )
    elif isinstance(val, str):
        return "epic games" in val.lower()
    return False


def is_lan(t):
    """A LAN worth asking about:

    Offline, Tier 1, no tier type (main event), organized by Epic Games,
    post-World Cup (>= 2019-07-26), excluding console/mobile/twitch/challenge.
    """
    # 1. Offline & Tier 1 without tiertype (e.g. not qualifiers/showmatches)
    if t.get("type") != "Offline":
        return False
    if t.get("liquipediatier") != 1:
        return False
    if pd.notna(t.get("liquipediatiertype")):
        return False

    # 2. Start date check (>= 2019-07-26)
    start_date = pd.to_datetime(t.get("startdate"), errors="coerce")
    if pd.isna(start_date) or start_date < pd.Timestamp("2019-07-26"):
        return False

    # 3. Epic Games organizer check
    if not has_epic_games(t.get("organizers")):
        return False

    # 4. Name exclusion check
    name = str(t.get("name") or "")
    if EXCLUDE_LAN_PATTERN.search(name):
        return False

    return True

def is_major(t):
    """Your career_path filter, verbatim."""
    return (
        t['liquipediatier'] == 1
        and t['liquipediatiertype'] is None
        and is_epic(t)
        and (t['startdate'] or '') >= '2019-07-26'
        and not re.search(r'console|mobile|twitch', t['name'], re.I)
    )

def is_fncs_final(t):
    return is_major(t) and 'FNCS' in t['name']

def is_world_cup(t):
    return t['name'].startswith('Fortnite World Cup')

def is_global(t):
    return is_world_cup(t) and 'Finals' in t['name'] or 'Global Championship' in t['name']

def year_of(t):
    """Calendar year, or None when the export's date is not one.

    A few rows carry a malformed `startdate` — the one that bit was
    `0-01-...` — so `str(startdate)[:4]` is not safe to hand to `int()`.
    Those results still count towards career and LAN totals; they are only
    left out of the per-year buckets, because there is no year to put them in.
    """
    m = re.match(r'^(\d{4})-', str(t.get('startdate') or ''))
    return int(m.group(1)) if m else None

bad_dates = [t['name'] for t in tournaments if year_of(t) is None]
if bad_dates:
    print(f'{len(bad_dates)} tournaments have an unusable startdate, e.g. {bad_dates[:3]}')

# Region label: tournaments.json says "Brazil", players.json says "South
# America". One word for one place, or the per-region boards split in two.
REGION_FIX = {'Brazil': 'South America', 'Japan': 'Asia', 'MENA': 'Middle East',
              'India': 'Asia', 'China': 'Asia', 'Latin America': 'South America',
              'CIS': 'Europe', 'Benelux': 'Europe', 'Turkey': 'Europe',
              'Pakistan': 'Asia'}

def region_of(t):
    r = t.get('region')
    return REGION_FIX.get(r, r)

tour_of = {}
for t in tournaments:
    tour_of.setdefault(t['name'], t)

MAJORS = {t['name'] for t in tournaments if is_major(t)}
LANS   = {t['name'] for t in tournaments if is_lan(t)}
FNCS   = {t['name'] for t in tournaments if is_fncs_final(t)}
WCUP   = {t['name'] for t in tournaments if is_world_cup(t)}
GLOBAL = {t['name'] for t in tournaments if is_global(t)}

print(f'majors {len(MAJORS)}  LANs {len(LANS)}  FNCS finals {len(FNCS)} '
      f'  World Cup {len(WCUP)}  globals {len(GLOBAL)}')

# ------------------------------------------------------------- placed rows --
# One pass, reused by every cell below. `rank` is None for '', 'DNP' and 'DQ';
# a range like '35-36' reads as its best end, same rule as career_path.
def rank_of(raw):
    m = re.match(r'^(\d+)', str(raw or ''))
    return int(m.group(1)) if m else None

PLACED = []
for row in placements:
    t = tour_of.get(row.get('tournament'))
    if not t:
        continue
    r = rank_of(row.get('placement'))
    money = float(row.get('individualprizemoney') or 0)
    pages = [(resolve(p.get('player') or ''), p.get('team')) for p in (row.get('participants') or [])]
    pages = [(pg, tm) for pg, tm in pages if pg]
    if not pages:
        continue
    PLACED.append((t, r, money, pages))

print(f'{len(PLACED):,} placement rows with at least one nameable player')
```

Expected: `5,678 playable players`, `442,736 placement rows`.

---

## Cell 2 — `rankings.json`

Every Tenaball board, precomputed. 442,736 placement rows cannot be aggregated
in the browser, and the boards only change when the export does.

Defines `boards`, `board()`, `rank()`, `NAME`, `money` and `SLOTS`, which
cell 3 reuses — so it has to run first.

```python
OUT = f'{BASE}/rankings.json'
YEARS = list(range(2018, 2027))
SLOTS = 10

boards = []
def board(bid, group, title, entity, tie, ranked, fmt):
    """`ranked` is [(key, label, value)] already sorted best-first."""
    if len(ranked) < SLOTS + 1:
        return
    rows = [{'key': k, 'label': l, 'value': round(v, 2), 'display': fmt(v)}
            for k, l, v in ranked[:SLOTS]]
    k, l, v = ranked[SLOTS]
    boards.append({'id': bid, 'group': group, 'title': title, 'entity': entity,
                   'tieRule': tie, 'rows': rows,
                   'next': {'key': k, 'label': l, 'value': round(v, 2)}})

money = lambda v: '${:,.0f}'.format(v)
count = lambda word: (lambda v: f'{v:,.0f} {word}' + ('' if v == 1 else 's'))

def rank(d, label_of):
    return sorted(((k, label_of(k), v) for k, v in d.items() if v > 0),
                  key=lambda e: (-e[2], e[1].lower()))

NAME = lambda page: player_of[page]['id'] if page in player_of else page
TIE_MONEY = 'Straight prize-money order. Exact ties are split by name.'
TIE_COUNT = 'Players level on the count are ranked by career earnings.'

# ---------------------------------------------------------- player: totals --
earn      = Counter()   # from placements, so it can be sliced
lan_earn  = Counter(); fncs_earn = Counter(); wc_earn = Counter()
lan_apps  = Counter(); fncs_apps = Counter()
year_earn = defaultdict(Counter)
org_earn  = Counter(); org_year  = defaultdict(Counter); org_majors = Counter()

for t, r, m, pages in PLACED:
    # `yr` is None for the handful of rows with a malformed date. They still
    # count towards career totals — the money was won — and are simply left out
    # of the per-year boards, because there is no year to file them under.
    n, yr = t['name'], year_of(t)
    for page, team in pages:
        earn[page] += m
        if yr is not None:
            year_earn[yr][page] += m
        if n in LANS:
            lan_earn[page] += m; lan_apps[page] += 1
        if n in FNCS:
            fncs_earn[page] += m; fncs_apps[page] += 1
        if n in WCUP:
            wc_earn[page] += m
        if team and team.lower() not in ('free agent', '', 'none'):
            org_earn[team] += m
            if yr is not None:
                org_year[yr][team] += m
            if n in MAJORS and r == 1:
                org_majors[team] += 1

# Career earnings uses the published column, not the sum of placements — it is
# the number Liquipedia shows on the player page and the one people remember.
career = Counter({p['pagename']: float(p['earnings'] or 0) for p in PLAYABLE})

board('career-earnings', 'Players', 'Top 10 by career earnings', 'player',
      TIE_MONEY, rank(career, NAME), money)
board('lan-earnings', 'Players', 'Top 10 by LAN earnings', 'player',
      TIE_MONEY, rank(lan_earn, NAME), money)
board('fncs-earnings', 'Players', 'Top 10 by FNCS earnings', 'player',
      TIE_MONEY, rank(fncs_earn, NAME), money)
board('earnings-no-wc', 'Players', 'Top 10 by earnings excluding the World Cup',
      'player', TIE_MONEY,
      rank(Counter({k: v - wc_earn[k] for k, v in earn.items()}), NAME), money)
board('lan-apps', 'Players', 'Top 10 by LAN appearances', 'player', TIE_COUNT,
      rank(lan_apps, NAME), count('LAN'))
board('fncs-apps', 'Players', 'Top 10 by FNCS Finals appearances', 'player',
      TIE_COUNT, rank(fncs_apps, NAME), count('final'))
board('fncs-wins', 'Players', 'Top 10 by FNCS wins', 'player', TIE_COUNT,
      rank(Counter({p['pagename']: p['fncs_wins'] for p in PLAYABLE}), NAME),
      count('title'))

major_wins = Counter()
for t, r, m, pages in PLACED:
    if t['name'] in MAJORS and r == 1:
        for page, _ in pages:
            major_wins[page] += 1
board('major-wins', 'Players', 'Top 10 by major tournament wins', 'player',
      TIE_COUNT, rank(major_wins, NAME), count('win'))

for y in YEARS:
    board(f'year-earnings:{y}', 'Players', f'Top 10 earners in {y}', 'player',
          TIE_MONEY, rank(year_earn[y], NAME), money)

# ------------------------------------------------- player: region / country --
region_of_page  = {p['pagename']: p.get('region') for p in PLAYABLE}
country_of_page = {p['pagename']: (p.get('nationalities') or [None])[0] for p in PLAYABLE}
REGIONS = sorted({r for r in region_of_page.values() if r})

for reg in REGIONS:
    sub = Counter({k: v for k, v in career.items() if region_of_page.get(k) == reg})
    board(f'region-earnings:{reg}', 'By region',
          f'Top 10 career earnings — {reg}', 'player', TIE_MONEY, rank(sub, NAME), money)
    for y in YEARS:
        sub = Counter({k: v for k, v in year_earn[y].items() if region_of_page.get(k) == reg})
        board(f'region-year-earnings:{reg}:{y}', 'By region',
              f'Top 10 earners in {y} — {reg}', 'player', TIE_MONEY, rank(sub, NAME), money)

# Only countries deep enough to field a real top ten.
by_country = defaultdict(Counter)
for page, v in career.items():
    c = country_of_page.get(page)
    if c:
        by_country[c][page] = v
for c, sub in by_country.items():
    board(f'country-earnings:{c}', 'By country',
          f'Top 10 career earnings — {c}', 'player', TIE_MONEY, rank(sub, NAME), money)

# --------------------------------------------------------------- teammates --
# Anchors people would actually recognise: the biggest earners.
mates = defaultdict(Counter)
for t, r, m, pages in PLACED:
    ids = sorted({pg for pg, _ in pages})
    if len(ids) > 1:
        for a, b in itertools.combinations(ids, 2):
            mates[a][b] += 1; mates[b][a] += 1
anchors = [p for p, _ in career.most_common(60)]
for a in anchors:
    board(f'teammates:{a}', 'Teammates',
          f'Top 10 most frequent teammates of {NAME(a)}', 'player',
          'Ranked by tournaments entered together.',
          rank(mates[a], NAME), count('tournament'))

# ----------------------------------------------------------- one tournament --
# Offline events only, per your note: globals, World Cup, DreamHack, EWC.
for n in sorted(LANS):
    t = tour_of[n]
    finishers = {}
    for tt, r, m, pages in PLACED:
        if tt['name'] != n or r is None:
            continue
        for page, _ in pages:
            finishers[page] = min(finishers.get(page, 10**9), r)
    ranked = sorted(((k, NAME(k), v) for k, v in finishers.items()),
                    key=lambda e: (e[2], e[1].lower()))
    if len(ranked) < SLOTS + 1 or ranked[SLOTS - 1][2] == ranked[SLOTS][2]:
        continue                      # 10th and 11th tied — no single right answer
    boards.append({
        'id': f'tournament:{n}', 'group': 'Tournaments',
        'title': f'Top 10 at {n}', 'entity': 'player',
        'tieRule': 'Ranked by finishing position at this event.',
        'rows': [{'key': k, 'label': l, 'value': v, 'display': f'{v}'}
                 for k, l, v in ranked[:SLOTS]],
        'next': {'key': ranked[SLOTS][0], 'label': ranked[SLOTS][1], 'value': ranked[SLOTS][2]},
        'lowerIsBetter': True,
    })

# ---------------------------------------------------------------- orgs --
org_name = {o['id']: o['name'] for o in orgs_payload['orgs']}
ORG = lambda k: org_name.get(k, k)
board('org-earnings', 'Organisations', 'Top 10 organisations by total earnings',
      'org', TIE_MONEY, rank(org_earn, ORG), money)
board('org-majors', 'Organisations', 'Top 10 organisations by major wins',
      'org', 'Ranked by wins at Epic-run majors.', rank(org_majors, ORG), count('win'))
for y in YEARS:
    board(f'org-year-earnings:{y}', 'Organisations',
          f'Top 10 organisations by earnings in {y}', 'org', TIE_MONEY,
          rank(org_year[y], ORG), money)

# ------------------------------------------------------------- countries --
CT = lambda c: c
country_total = Counter()
country_year  = defaultdict(Counter)
country_fncs  = Counter()
for p in PLAYABLE:
    c = (p.get('nationalities') or [None])[0]
    if not c:
        continue
    country_total[c] += float(p['earnings'] or 0)
    country_fncs[c]  += p['fncs_wins']
    for y in YEARS:
        country_year[y][c] += float(p.get(f'earnings_{y}') or 0)

board('country-total-earnings', 'Countries', 'Top 10 countries by player earnings',
      'country', TIE_MONEY, rank(country_total, CT), money)
board('country-fncs-wins', 'Countries', 'Top 10 countries by FNCS wins',
      'country', 'Every FNCS title won by a player of that nationality.',
      rank(country_fncs, CT), count('title'))
for y in YEARS:
    board(f'country-year-earnings:{y}', 'Countries',
          f'Top 10 countries by earnings in {y}', 'country', TIE_MONEY,
          rank(country_year[y], CT), money)
for reg in REGIONS:
    sub = Counter()
    for p in PLAYABLE:
        c = (p.get('nationalities') or [None])[0]
        if c and p.get('region') == reg:
            sub[c] += float(p['earnings'] or 0)
    board(f'region-country-earnings:{reg}', 'Countries',
          f'Top 10 countries by earnings — {reg}', 'country', TIE_MONEY,
          rank(sub, CT), money)

payload = {'generated': TODAY, 'slots': SLOTS, 'boards': boards}
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))

print(f'{len(boards)} boards, {os.path.getsize(OUT)/1e6:.2f} MB')
print(Counter(b['group'] for b in boards))
for bid in ('career-earnings', 'lan-earnings', 'fncs-apps', 'org-earnings',
            'country-total-earnings'):
    b = next((x for x in boards if x['id'] == bid), None)
    print(f"\n{bid}:" if b else f"\n{bid}: MISSING")
    if b:
        for row in b['rows'][:5]:
            print(f"   {row['label']:<22} {row['display']}")
```

---

## Cell 3 — earnings by game mode

**New.** Four more boards: top 10 by solo, duo, trio and squad earnings, then
it rewrites `rankings.json` with the full set.

This cannot be done in the browser — it needs prize money *per placement*, and
the only file carrying that is `placements.json` at 154 MB, which is not
shipped. Anything the roster row already holds (age, country, status, career
earnings, FNCS wins) is derived in the app instead, in
`src/games/tenaball/derived-boards.ts`.

`opponenttype` is a property of a *result*, not of a player, so the same player
appears on several of these boards. That is correct: Bugha's World Cup money is
solo money and his FNCS money mostly is not.

Expected output — I ran all four cells against the real dump before writing
this, with the writes redirected to a scratch directory:

```
solo    5269 players with earnings
duo     5384 players with earnings
trio    4755 players with earnings
squad   3256 players with earnings

rewrote rankings.json — 219 boards
```

**215 boards in, 219 out: four added, none changed, none removed.** Running
cells 2 and 3 does not move any existing board. The new ones open with Bugha on
solo, aqua on duo — which is the right answer and a decent sign the split is
working.

```python
from collections import Counter

# (value in `opponenttype`, the word to put in the board title).
# The export spells the four-player format "Quad"; everyone calls it squads,
# so the data key and the label are kept apart. The other values in the column
# are "Team" (1,711 rows, mixed team-vs-team events) which is not a format
# anyone would ask about, and blanks.
MODES = [('Solo', 'solo'), ('Duo', 'duo'), ('Trio', 'trio'), ('Quad', 'squad')]
mode_earn = {key: Counter() for key, _ in MODES}

for row in placements:
    mode = (row.get('opponenttype') or '').strip().title()
    if mode not in mode_earn:
        continue
    parts = row.get('participants') or []
    if not parts:
        continue
    # `individualprizemoney` is per player where the export gives it; where it
    # is 0 the team total is split evenly, which is what Liquipedia's own
    # per-player figures do.
    each = float(row.get('individualprizemoney') or 0)
    if each <= 0:
        each = float(row.get('prizemoney') or 0) / len(parts)
    if each <= 0:
        continue
    for part in parts:
        page = resolve(part.get('player') or '')
        if page:
            mode_earn[mode][page] += each

for key, word in MODES:
    board(f'mode-earnings-{word}', 'Players',
          f'Top 10 by {word} earnings', 'player',
          f'Prize money won in {word} events only. A player appears on several '
          f'of these boards — the money is split by the format each result was '
          f'played in. Exact ties are split by name.',
          rank(mode_earn[key], NAME), money)
    print(f'{word:<6} {len(mode_earn[key]):>5} players with earnings')

payload = {'generated': TODAY, 'slots': SLOTS, 'boards': boards}
with open(f'{BASE}/rankings.json', 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))
print('\nrewrote rankings.json —', len(boards), 'boards')
```

---

## Cell 4 — `pools.json`

The event fields. A pool is a fixed list of players and nothing else: pick one
on the home page and every game draws from that field until you leave it.

Six now. The four new ones are the three earlier Global Championships and the
2019 World Cup solo field — all already in the export, none needing a code
change. A seventh is one more entry in `WANTED`.

```python
OUT = f'{BASE}/pools.json'

WANTED = [
    ('globals-2026', 'FNCS 2026 Globals', 'FNCS 2026  Global Championship',
     'The field for the Global Championship in Europe, 26–27 September 2026.'),
    ('ewc-2026', 'EWC 2026', 'Reload Elite Series 2026 - Championship',
     'The field for the Esports World Cup Fortnite event, August 2026.'),
    # Note the double space in the 2024/2025/2026 names — that is how the
    # export spells them. The 2023 one has a single space.
    ('globals-2025', 'FNCS 2025 Globals', 'FNCS 2025  Global Championship',
     'The field for the Global Championship, September 2025.'),
    ('globals-2024', 'FNCS 2024 Globals', 'FNCS 2024  Global Championship',
     'The field for the Global Championship, September 2024.'),
    ('globals-2023', 'FNCS 2023 Globals', 'FNCS 2023 Global Championship',
     'The field for the Global Championship, October 2023.'),
    ('world-cup-2019', 'World Cup 2019', 'Fortnite World Cup Finals - Solo',
     'The solo field at the 2019 Fortnite World Cup, July 2019.'),
]

pools = []
for pid, label, event, blurb in WANTED:
    t = tour_of.get(event)
    if not t:
        print(f'!! {event!r} not in tournaments.json — skipped')
        continue
    raw, named = set(), set()
    for row in placements:
        if row.get('tournament') != event:
            continue
        for part in (row.get('participants') or []):
            name = part.get('player') or ''
            if not name:
                continue
            raw.add(name)
            page = resolve(name)
            if page:
                named.add(page)
    pools.append({'id': pid, 'label': label, 'blurb': blurb,
                  'event': event, 'date': str(t['startdate'])[:10],
                  'players': sorted(named)})
    print(f'{label:<20} {len(raw):>3} entrants, {len(named):>3} playable')

payload = {'generated': TODAY, 'pools': pools}
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))
print('\nwrote', OUT)
```

Expected output. I resolved all six against the dump before writing this, so
these are the numbers the cell should print, not estimates:

```
FNCS 2026 Globals    101 entrants, 101 playable
EWC 2026              80 entrants,  80 playable
FNCS 2025 Globals     99 entrants,  99 playable
FNCS 2024 Globals    100 entrants, 100 playable
FNCS 2023 Globals    145 entrants, 145 playable
World Cup 2019       100 entrants, 100 playable
```

A line reading `!! ... not in tournaments.json — skipped` means the name in
`WANTED` does not match the export exactly — check the double space.

---

## After running

```bash
npm run check:games
```

Plays all ten games to completion in Node and asserts the invariants each one
depends on, including that every pool resolves to playable names.

---

## Appendix — `facts.json`

Per-player career facts: where a player won, how many LANs they turned up to,
which headline events they played. Read by Griefer, Tic Tac Toe, Connections,
List and Who Are Ya.

**Not part of the run above.** It is here so the document is complete. Running
it rebuilds `facts.json` from whatever `is_lan` currently says, which is the
one thing in this file that will quietly change how the games play.

It depends only on cell 1, so it can be run any time after it.

```python
OUT = f"{BASE}/facts.json"

# ------------------------------------------------------------------ events --
headline = sorted(
    {n for n in (MAJORS | LANS)},
    key=lambda n: (tour_of[n].get("startdate") or "", n),
)
index_of = {n: i for i, n in enumerate(headline)}


def short_name(t):
    """'FNCS 2025 - Major 3: Europe - Grand Finals' -> 'FNCS 2025 - Major 3: Europe'."""
    s = re.sub(r"\s*[-–:]?\s*Grand Finals?\s*[-–:]?\s*", " ", t["name"], flags=re.I)
    s = re.sub(r"\s{2,}", " ", s).strip()
    return re.sub(r"[-–:]\s*$", "", s).strip()


events = []
for n in headline:
    t = tour_of[n]
    events.append(
        {
            "name": t["name"],
            "short": short_name(t),
            "date": str(t["startdate"])[:10],
            "kind": (
                "global"
                if n in GLOBAL
                else "fncs"
                if n in FNCS
                else "lan"
                if n in LANS
                else "major"
            ),
            "lan": n in LANS,
            "region": region_of(t),
            "mode": t.get("mode"),
            "prizePool": (
                None
                if t.get("prizepool") is None or pd.isna(t.get("prizepool"))
                else round(float(t["prizepool"]))
            ),
        }
    )

# ----------------------------------------------------------------- players --
blank = lambda: {
    "played": set(),
    "won": set(),
    "lan_tourneys": set(),
    "fncs_tourneys": set(),
    "winRegions": set(),
    "winYears": set(),
}
facts = defaultdict(blank)

for t, r, money, pages in PLACED:
    name = t.get("name")
    idx = index_of.get(name)
    if idx is None:
        continue

    # Placement rank check: matches 1 or '1'
    is_winner = str(r).strip() in ("1", "1st")

    for page, _team in pages:
        f = facts[page]
        f["played"].add(idx)

        if name in LANS:
            f["lan_tourneys"].add(idx)
        if name in FNCS:
            f["fncs_tourneys"].add(idx)

        if is_winner:
            f["won"].add(idx)
            reg = region_of(t)
            if reg:
                f["winRegions"].add(reg)
            if t.get("startdate"):
                f["winYears"].add(int(str(t["startdate"])[:4]))

players_out = []
for page in sorted(facts):
    if tier.get(page) == "unused":
        continue
    f = facts[page]
    won_kinds = Counter(events[i]["kind"] for i in f["won"])

    players_out.append(
        {
            "id": page,
            "played": sorted(f["played"]),
            "won": sorted(f["won"]),
            "apps": len(f["played"]),
            "lanApps": len(f["lan_tourneys"]),
            "fncsApps": len(f["fncs_tourneys"]),
            "wins": {
                "global": won_kinds["global"],
                "fncs": won_kinds["fncs"],
                "lan": sum(1 for i in f["won"] if events[i]["lan"]),
                "major": len(f["won"]),
            },
            "winRegions": sorted(f["winRegions"]),
            "winYears": sorted(f["winYears"]),
        }
    )

payload = {"generated": TODAY, "events": events, "players": players_out}
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

print(
    f"{len(events)} headline events, {len(players_out):,} players, "
    f"{os.path.getsize(OUT)/1e6:.1f} MB"
)
print("  LAN winners:      ", sum(1 for p in players_out if p["wins"]["lan"]))
print("  global winners:   ", sum(1 for p in players_out if p["wins"]["global"]))
print("  5+ tournaments:   ", sum(1 for p in players_out if p["apps"] >= 5))
print(
    "  most LAN apps:    ",
    sorted(players_out, key=lambda p: -p["lanApps"])[:3],
)
```

---

## Still not built — team boards

"Top 10 at a tournament, in duos/trios, name both players" needs two things:

1. **Data.** A row per placement carrying every participant.
   `placements.json` already has `participants: [{player, team}]` and
   `opponenttype`, so the cell would be straightforward.
2. **An engine change.** `BoardRow` is one `key` and one `label`, and
   `applyGuess` matches a guess against that single key. A duo row needs to
   hold several keys and be *partially* filled — "1st: Bugha ✓ / ????" — which
   changes the board shape, the slot rendering and the scoring.

Worth doing, but it is a Tenaball feature rather than a data addition.

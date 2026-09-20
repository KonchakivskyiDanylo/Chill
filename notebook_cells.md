# Notebook cells to run

Four cells. Paste each into a Jupyter cell and run **in order, from the repo
root** — Cell 1 loads the dump and defines the helpers the other three use.

The previous four cells (`region_tier`, `career_path.json`, `teammates.json`,
`orgs.json`) are done and have been removed from this file. Their outputs are
still read by the app and nothing here touches them.

These three new files are what let every game move onto the Liquipedia export.
Six games (Tenaball, List, Griefer, Tic Tac Toe, Connections, Guess the Player)
still read the 316-player Wikipedia import; none of them can be migrated until
the facts below exist.

Same contract as the existing derived files: **no `tier` column**. Difficulty
always joins back to `players.json` by `pagename`, so re-tiering stays a
one-column edit and these never go stale against it.

| cell | writes | why |
| --- | --- | --- |
| 1 | — | shared load + tournament classification |
| 2 | `facts.json` | per-player career facts — Griefer, Tic Tac Toe, Connections, List, Who Are Ya |
| 3 | `rankings.json` | every Tenaball board, precomputed |
| 4 | `pools.json` | Globals 2026 and EWC 2026 qualified fields |

Cell 1 loads `placements.json` once (154 MB, ~4 s) and the rest reuse it, so
run them in the same kernel session.

---

## Cell 1 — shared setup

Loads everything and classifies the 14,645 tournaments. Every rule the other
cells depend on is defined here and nowhere else, so if a classification is
wrong there is exactly one place to fix it.

The majors filter is **your existing `career_path.json` filter, unchanged** —
Epic-organised, tier 1, no tier type, from the 2019 World Cup onwards, minus
console/mobile/Twitch. Reused rather than restated so Career Path and the new
files can never disagree about what a major is.

```python
import json, re, itertools
from collections import Counter, defaultdict
from datetime import date

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

def is_lan(t):
    """A LAN worth asking about: offline (or hybrid) and top two tiers."""
    return t['type'] in ('Offline', 'Hybrid') and t['liquipediatier'] in (1, 2)

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

# Region label: tournaments.json says "Brazil", players.json says "South
# America". One word for one place, or the per-region boards split in two.
REGION_FIX = {'Brazil': 'South America', 'Japan': 'Asia', 'MENA': 'Middle East',
              'India': 'Asia', 'China': 'Asia', 'Latin America': 'South America',
              'CIS': 'Europe', 'Benelux': 'Europe', 'Turkey': 'Europe',
              'Pakistan': 'Asia'}

def region_of(t):
    r = t.get('region')
    return REGION_FIX.get(r, r)

def year_of(t):
    """Calendar year, or None when the export's date is not one.

    A few rows carry a malformed `startdate` — the one that bit was `0-01-...`
    — so `str(startdate)[:4]` is not safe to hand to `int()`. Those results
    still count towards career and LAN totals; they are only left out of the
    per-year buckets, because there is no year to put them in.
    """
    m = re.match(r'^(\d{4})-', str(t.get('startdate') or ''))
    return int(m.group(1)) if m else None

bad_dates = [t['name'] for t in tournaments if year_of(t) is None]
if bad_dates:
    print(f'{len(bad_dates)} tournaments have an unusable startdate, e.g. {bad_dates[:3]}')

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

Expected: `5,678 playable players`, `442,736 placement rows`, and roughly
`majors 188  LANs 80  FNCS finals ~170`.

---

## Cell 2 — `facts.json`

What the criteria games need and `players.json` cannot answer: where a player
actually *won*, how many LANs they turned up to, which headline events they
played. Today Griefer and Tic Tac Toe generate 16 of 21 criteria from country
and region alone, which is why a Griefer board about "competes in Brazil" is
solvable from the flags on the cards.

`events` is the headline list — majors plus LANs, ~250 tournaments. Player rows
index into it rather than repeating names, which is most of why this file is
about a megabyte instead of ten.

```python
OUT = f'{BASE}/facts.json'

# ------------------------------------------------------------------ events --
headline = sorted(
    {n for n in (MAJORS | LANS)},
    key=lambda n: (tour_of[n]['startdate'] or '', n),
)
index_of = {n: i for i, n in enumerate(headline)}

def short_name(t):
    """'FNCS 2025 - Major 3: Europe - Grand Finals' -> 'FNCS 2025 - Major 3: Europe'."""
    s = re.sub(r'\s*-?\s*Grand Finals?\s*:?\s*', ' ', t['name'], flags=re.I)
    return re.sub(r'\s{2,}', ' ', s).strip()

events = []
for n in headline:
    t = tour_of[n]
    events.append({
        'name': t['name'],
        'short': short_name(t),
        'date': str(t['startdate'])[:10],
        'kind': ('global' if n in GLOBAL else 'fncs' if n in FNCS
                 else 'lan' if n in LANS else 'major'),
        'lan': n in LANS,
        'region': region_of(t),
        'mode': t['mode'],
        'prizePool': None if t['prizepool'] is None else round(float(t['prizepool'])),
    })

# ----------------------------------------------------------------- players --
blank = lambda: {'played': set(), 'won': set(), 'apps': 0, 'lanApps': 0,
                 'fncsApps': 0, 'winRegions': set(), 'winYears': set()}
facts = defaultdict(blank)

for t, r, money, pages in PLACED:
    name, idx = t['name'], index_of.get(t['name'])
    for page, _team in pages:
        f = facts[page]
        f['apps'] += 1
        if name in LANS:
            f['lanApps'] += 1
        if name in FNCS:
            f['fncsApps'] += 1
        if idx is not None:
            f['played'].add(idx)
            if r == 1:
                f['won'].add(idx)
                reg = region_of(t)
                if reg:
                    f['winRegions'].add(reg)
                won_year = year_of(t)
                if won_year is not None:
                    f['winYears'].add(won_year)

players_out = []
for page in sorted(facts):
    if tier.get(page) == 'unused':
        continue
    f = facts[page]
    won_kinds = Counter(events[i]['kind'] for i in f['won'])
    players_out.append({
        'id': page,
        'played': sorted(f['played']),
        'won': sorted(f['won']),
        'apps': f['apps'],
        'lanApps': f['lanApps'],
        'fncsApps': f['fncsApps'],
        'wins': {
            'global': won_kinds['global'],
            'fncs': won_kinds['fncs'],
            'lan': sum(1 for i in f['won'] if events[i]['lan']),
            'major': len(f['won']),
        },
        'winRegions': sorted(f['winRegions']),
        'winYears': sorted(f['winYears']),
    })

payload = {'generated': TODAY, 'events': events, 'players': players_out}
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))

import os
print(f'{len(events)} headline events, {len(players_out):,} players, '
      f'{os.path.getsize(OUT)/1e6:.1f} MB')
print('  LAN winners:      ', sum(1 for p in players_out if p['wins']['lan']))
print('  global winners:   ', sum(1 for p in players_out if p['wins']['global']))
print('  5+ tournaments:   ', sum(1 for p in players_out if p['apps'] >= 5))
print('  most LAN apps:    ', sorted(players_out, key=lambda p: -p['lanApps'])[:3])
```

Check against what I measured on this export: **90 LAN winners** with a player
page, and the LAN-appearance leaders should come out `Vic0try0na 35`, then
`Khanada / MrSavage / Kami / Malibuca` on 33.

My count used a slightly looser name resolver than yours (it also matched
`alternateid_list`), so expect these to land a little **lower**, not higher. If
LAN winners comes out far from 90, the `is_lan` rule is the thing to look at.

### Shape

```jsonc
{ "generated": "...",
  "events": [
    { "name": "Fortnite World Cup Finals - Solo",
      "short": "Fortnite World Cup Finals - Solo",
      "date": "2019-07-28",
      "kind": "global",          // global | fncs | lan | major
      "lan": true,
      "region": "North America", // normalised — never "Brazil"
      "mode": "Solo",
      "prizePool": 15287500 }
  ],
  "players": [
    { "id": "Bugha",             // pagename
      "played": [0, 4, 17],      // indices into events
      "won": [0],
      "apps": 214,               // every tournament in the export
      "lanApps": 18,
      "fncsApps": 22,
      "wins": { "global": 1, "fncs": 0, "lan": 3, "major": 5 },
      "winRegions": ["North America"],
      "winYears": [2019, 2021] }
  ]}
```

`played` / `won` cover the headline events only. `apps` counts *everything*,
because Who Are Ya's "at least 5 tournaments" restriction is about whether we
know the player at all, not about majors.

---

## Cell 3 — `rankings.json`

Every Tenaball board, precomputed. 442,736 placement rows cannot be aggregated
in the browser, and the boards never change between exports, so they are built
once here.

Three kinds of answer, which is new for Tenaball: some boards are answered with
**player** names, some with **org** names, some with **country** names. `entity`
says which, and the app picks the matching resolver.

`next` is the 11th place. Tenaball uses it to spot a guess that ties the
cut-off and treat it as a near miss rather than a mistake — the rule the board
already states.

```python
OUT = f'{BASE}/rankings.json'
SLOTS = 10

# Read off the data, not written down: a re-export that reaches into 2027
# should grow a 2027 board on its own rather than silently dropping the year.
YEARS = sorted({y for y in (year_of(t) for t in tournaments) if y is not None})
print('years covered:', YEARS[0], '→', YEARS[-1])

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

Check against what I measured: `lan-earnings` should open
`Bugha $3,064,367 / EpikWhale $1,505,505 / Rojo $1,169,333`, and `fncs-apps`
should open `EpikWhale 36 / Khanada 35`. Same caveat as Cell 2 — my resolver was
looser, so small downward differences are expected and fine.

If a board comes out missing it simply had fewer than 11 entries and was
skipped; that is the intended behaviour and the app never offers it.

---

## Cell 4 — `pools.json`

The event-scoped game mode. A pool is a fixed list of players and nothing else:
pick it in any game and you get those players only, no region and no difficulty.

Two to start. **EWC 2026 is `Reload Elite Series 2026 - Championship`** — your
call, and the numbers back it: exactly 80 distinct participants.

Adding a third later is one entry in `WANTED`, no code change anywhere.

```python
OUT = f'{BASE}/pools.json'

WANTED = [
    ('globals-2026', 'FNCS 2026 Globals', 'FNCS 2026  Global Championship',
     'The field for the Global Championship in Europe, 26–27 September 2026.'),
    ('ewc-2026', 'EWC 2026', 'Reload Elite Series 2026 - Championship',
     'The field for the Esports World Cup Fortnite event, August 2026.'),
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

Expected, and this one I am confident about — I counted both directly:

```
FNCS 2026 Globals    101 entrants,  82 playable
EWC 2026              80 entrants,  66 playable
```

`82` and `66` are what the games will actually use. The gap is entrants with a
placement but no Liquipedia player page, so there is no name to guess and no
row to render.

### Shape

```jsonc
{ "generated": "...", "pools": [
  { "id": "globals-2026",
    "label": "FNCS 2026 Globals",
    "blurb": "The field for the Global Championship ...",
    "event": "FNCS 2026  Global Championship",
    "date": "2026-09-26",
    "players": ["Acorn", "Ajerss", "..."] }   // pagenames
]}
```

---

## When all four have run

`liquipedia_data/clean_data/fortnite/` should gain `facts.json`,
`rankings.json` and `pools.json`. Paste the printed output back to me — the
counts are what I will assert against while wiring the games up, and if a
classifier is off I would rather fix it before ten games are built on it.

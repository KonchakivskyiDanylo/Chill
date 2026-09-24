# Notebook cells to run

Five cells, **in this order, top to bottom**. One kernel, started from the repo
root — `BASE` is a relative path. Cell 1 loads `placements.json` (154 MB,
~4 s) and the rest reuse it.

| cell | writes |
| --- | --- |
| 1 | — (loads the dump, classifies the tournaments) |
| 2 | `rankings.json` |
| 3 | `rankings.json` again, with four more boards |
| 4 | `rankings.json` a third time, with sixty-six more |
| 5 | `pools.json` |

There is a sixth cell in an appendix at the bottom that rebuilds
`facts.json`. **You do not need it** — nothing in the app has changed that
depends on it, and it is the one cell where the `is_lan` question below
actually changes the data.

> **Cells 3 and 4 append to `boards`.** Running either twice in one kernel
> duplicates its boards. If you need to redo one, run cell 2 again first and
> then 3 and 4 in order — cell 4 writes the file last and is the only one that
> writes the tournament-name list the paydays boards are answered from.

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

**Changed:** the tournament boards are now one row per *finishing position*
rather than per player, each carrying the whole team in `members`. That is what
lets a duos or trios board ask for both names, and it is also why FNCS 2025
Global Championship appears for the first time — see the comment in that
section. Expect **216 boards, Tournaments 8** where it used to say 215 and 7;
nothing else moves.

```python
OUT = f'{BASE}/rankings.json'
YEARS = list(range(2018, 2027))
SLOTS = 10

boards = []
LEVEL_AT_CUT = []   # boards left out because 10th and 11th could not be split

def level(a, b):
    """Equal on the value and on every tiebreak after it."""
    return a[2] == b[2] and a[3:] == b[3:]

def board(bid, group, title, entity, tie, ranked, fmt):
    """`ranked` is [(key, label, value)] or [(key, label, value, tiebreak...)],
    already sorted best-first.

    A board whose 10th and 11th are level on everything it ranks by has no
    single right answer for the last slot, and is not written. Those used to be
    split by name - "exact ties are split by name" - which is a rule a player
    can read but not play. Everywhere else in the ten a level pair is only a
    question of which slot is drawn first, so the name still orders them there
    and nothing says so."""
    if len(ranked) < SLOTS + 1:
        return
    if level(ranked[SLOTS - 1], ranked[SLOTS]):
        LEVEL_AT_CUT.append(bid)
        return
    rows = [{'key': k, 'label': l, 'value': round(v, 2), 'display': fmt(v)}
            for k, l, v, *_ in ranked[:SLOTS]]
    k, l, v, *_ = ranked[SLOTS]
    boards.append({'id': bid, 'group': group, 'title': title, 'entity': entity,
                   'tieRule': tie, 'rows': rows,
                   'next': {'key': k, 'label': l, 'value': round(v, 2)}})

money = lambda v: '${:,.0f}'.format(v)
count = lambda word: (lambda v: f'{v:,.0f} {word}' + ('' if v == 1 else 's'))

def rank(d, label_of):
    return sorted(((k, label_of(k), v) for k, v in d.items() if v > 0),
                  key=lambda e: (-e[2], e[1].lower()))

def rank_fame(d, label_of=None, money_of=None):
    """`rank`, but level counts fall to money before they fall to the alphabet.

    On a count board the alphabet is a bad tiebreak and TIE_COUNT already
    promised this one: nine of the ten slots on "Top 10 by FNCS wins" are 3s and
    4s, and which of the 3s is tenth was decided by their initial. "The bigger
    earner is higher" is a rule a player can act on. `money_of` is the career
    column for a player, the org's prize money for an org, the country's total
    for a country."""
    # Resolved here rather than as defaults: both are defined below this.
    label_of = label_of or NAME
    money_of = money_of or (lambda k: career.get(k, 0))
    # The money rides along as a fourth field so `board` can tell a level count
    # that money settles from one it does not.
    return sorted(((k, label_of(k), v, money_of(k)) for k, v in d.items() if v > 0),
                  key=lambda e: (-e[2], -e[3], e[1].lower()))

NAME = lambda page: player_of[page]['id'] if page in player_of else page
TIE_MONEY = 'Straight prize-money order.'
TIE_COUNT = ('Players level on the count are ranked by career earnings, so the '
             'bigger earner is higher.')

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
      rank_fame(lan_apps, NAME), count('LAN'))
board('fncs-apps', 'Players', 'Top 10 by FNCS Finals appearances', 'player',
      TIE_COUNT, rank_fame(fncs_apps, NAME), count('final'))
board('fncs-wins', 'Players', 'Top 10 by FNCS wins', 'player', TIE_COUNT,
      rank_fame(Counter({p['pagename']: p['fncs_wins'] for p in PLAYABLE}), NAME),
      count('title'))

major_wins = Counter()
for t, r, m, pages in PLACED:
    if t['name'] in MAJORS and r == 1:
        for page, _ in pages:
            major_wins[page] += 1
board('major-wins', 'Players', 'Top 10 by major tournament wins', 'player',
      TIE_COUNT, rank_fame(major_wins, NAME), count('win'))

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
          'Ranked by tournaments entered together. ' + TIE_COUNT,
          rank_fame(mates[a], NAME), count('tournament'))

# ----------------------------------------------------------- one tournament --
# Offline events only, per your note: globals, World Cup, DreamHack, EWC.
#
# A row per finishing *position*, not per player. These events are played in
# duos and trios, so 1st place is two or three people and the slot only fills
# once every one of them has been named — which is what `members` carries.
#
# Ranking players instead is what used to lose whole events: at a trios Globals
# the top three places are nine players, so 10th and 11th were both the
# fourth-placed trio, the "no single right answer" guard fired and FNCS 2025
# Global Championship shipped no board at all. By place there is no such tie,
# and the trio is the answer rather than an accident of the alphabet.
def team_name(pages):
    """'aqua & nyhrox', 'Japko, panzer & Setty' — the names, alphabetical."""
    names = sorted((NAME(p) for p in pages), key=str.lower)
    return names[0] if len(names) == 1 else ' & '.join([', '.join(names[:-1]), names[-1]])

def team_row(place, team):
    pages = sorted(team, key=lambda pg: NAME(pg).lower())
    return {'key': '|'.join(sorted(team)), 'label': team_name(team),
            'value': place, 'display': f'{place}',
            'members': [{'key': pg, 'label': NAME(pg)} for pg in pages]}

# Straight off `placements` rather than PLACED, which drops the participants it
# cannot resolve: a team missing a member is a slot nobody can close, and the
# board has to be able to see that and refuse.
lan_places = defaultdict(lambda: defaultdict(list))
for row in placements:
    n = row.get('tournament')
    if n not in LANS:
        continue
    r = rank_of(row.get('placement'))
    if r is None:
        continue
    lan_places[n][r].append([resolve(p.get('player') or '')
                             for p in (row.get('participants') or [])])

for n in sorted(LANS):
    places = sorted(lan_places[n])[:SLOTS + 1]
    teams = [lan_places[n][p][0] if len(lan_places[n][p]) == 1 else [] for p in places]
    if len(places) < SLOTS + 1 or any(not t or not all(t) for t in teams):
        continue     # fewer than 11 placements, two teams on one place, or a
                     # member this export cannot name — see the note above
    named = [pg for t in teams for pg in t]
    if len(set(named)) != len(named):
        continue     # the same player twice in the eleven — no single right answer
    spare = team_row(places[SLOTS], teams[SLOTS])
    del spare['display']             # the 11th is a near-miss test, never shown
    solo = max(len(t) for t in teams) == 1
    boards.append({
        'id': f'tournament:{n}', 'group': 'Tournaments',
        'title': f'Top 10 at {n}', 'entity': 'player',
        'tieRule': 'Ranked by finishing position at this event.' if solo else
                   ('Ranked by finishing position at this event. Each place is a '
                    'team, and it only fills once every player on it is named.'),
        'rows': [team_row(p, t) for p, t in zip(places[:SLOTS], teams[:SLOTS])],
        'next': spare,
        'lowerIsBetter': True,
    })

# ---------------------------------------------------------------- orgs --
org_name = {o['id']: o['name'] for o in orgs_payload['orgs']}
ORG = lambda k: org_name.get(k, k)
board('org-earnings', 'Organisations', 'Top 10 organisations by total earnings',
      'org', TIE_MONEY, rank(org_earn, ORG), money)
board('org-majors', 'Organisations', 'Top 10 organisations by major wins',
      'org', 'Ranked by wins at Epic-run majors. Organisations level on the count '
      'are ranked by their own prize money.',
      rank_fame(org_majors, ORG, org_earn.get), count('win'))
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
      'country', 'Every FNCS title won by a player of that nationality. Countries '
      "level on the count are ranked by their players' total earnings.",
      rank_fame(country_fncs, CT, country_total.get), count('title'))
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

rewrote rankings.json — 220 boards
```

**216 boards in, 220 out: four added, none changed, none removed.** Running
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
          f'played in.',
          rank(mode_earn[key], NAME), money)
    print(f'{word:<6} {len(mode_earn[key]):>5} players with earnings')

payload = {'generated': TODAY, 'slots': SLOTS, 'boards': boards}
with open(f'{BASE}/rankings.json', 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))
print('\nrewrote rankings.json —', len(boards), 'boards')
```

---

## Cell 4 — sixty-six more categories

**New.** The rest of the list: wins, streaks, ages, longest-running duos, the
country boards split by who is still active, and a board answered with a
*tournament* rather than a player. It appends to `boards` and rewrites
`rankings.json`, so it runs after cells 2 and 3 and writes the file last.

| boards | what they are |
| --- | --- |
| 11 | Players — tournaments won, LAN wins, top-5 finishes at FNCS finals, grand finals without a title, earners with no title, longest run of finals, longest run of titles, titles across chapters, youngest and oldest to win a major, oldest to win a first one |
| 29 | By country — the same career-earnings board as before, active players only. Only countries with eleven active earners get one |
| 1 | Teammates — longest-running duos, measured in consecutive majors together |
| 5 | Countries — players past $100K, $300K, $500K and $1M, and earnings per resident |
| 20 | Paydays — for each of the twenty biggest earners, the ten events they earned the most at |

Three things in here are worth reading before you run it.

**Chapters are derived, not typed in.** The FNCS stopped putting the chapter in
its own name after 2022, so `chapter_at()` asks the export instead: thousands of
community events are called `C6S2` or "Chapter 5 Season 1", and the chapter of
any date is whatever the events around it call themselves. It comes out clean
— Chapter 2 through 2021, 3 in 2022, 4 in 2023, 5 in 2024, 6 in 2025, 7 in
2026 — and Season X falls to Chapter 1, the one chapter that predates the
naming convention entirely.

**Streaks count rounds, not events.** A "wave" is one round of FNCS grand
finals: every region's final inside a week of each other, found by clustering
the dates rather than parsing four generations of naming. A cluster of fewer
than four regions is a one-off — a Global Championship, the 2022
Invitational, the 2026 Summit — and is left out, so missing an event nobody
could qualify for does not break anybody's run.

**`is_lan` is not touched.** The LAN wins board wants more than the nine events
that filter keeps, so it builds its own `OFFLINE` set for that one board. The
shared filter still means what it meant, and `facts.json`, List, Griefer and Tic
Tac Toe are unaffected.

One number in here is not from Liquipedia: the per-capita board needs
populations, and `POPULATION` is a hand-typed table of public 2024 estimates.
The cell prints any country that has earnings but no population on file, so a
future export cannot quietly drop one.

Expected output — I ran all four cells against the real dump before writing
this, with the writes redirected to a scratch directory:

```
286 boards, 639 tournament names, 0.32 MB
Counter({'By country': 76, 'By region': 60, 'Teammates': 59, 'Players': 32,
         'Countries': 20, 'Paydays': 20, 'Organisations': 11, 'Tournaments': 8})
```

**220 boards in, 286 out.** Nothing existing moves; `rankings.json` goes from
0.21 MB to 0.32 MB, and it is loaded only when somebody opens Tenaball.

```python
import bisect
from datetime import date as _date

OUT = f'{BASE}/rankings.json'

TIE_FAME = ('Level counts are split by career earnings, so of two players on the '
            'same number the bigger earner ranks higher.')
TIE_RICH = ('Countries level on count are ordered by total career earnings, '
            'so the bigger-earning country ranks higher.')

def phrase(one, many):
    """`count` from cell 2 pluralises by adding an s, which gives "15 finishs"
    and "26 in a rows". These boards spell both forms out."""
    return lambda v: f'{v:,.0f} {one if v == 1 else many}'

def day_of(t):
    d = str(t.get('startdate') or '')[:10]
    return d if re.match(r'^\d{4}-\d{2}-\d{2}$', d) else None
def days_apart(a, b):
    return (_date.fromisoformat(b) - _date.fromisoformat(a)).days

# `rank_fame` comes from cell 2, where the count boards it was written for are.

# ============================================================ player counts ==
wins_any, wins_offline = Counter(), Counter()
fncs_top5, fncs_apps_all = Counter(), Counter()

# "LAN wins" wants more than the nine events `is_lan` keeps - that filter is
# Epic-run tier-1 finals only, and it is deliberately left alone because
# facts.json, List, Griefer and Tic Tac Toe are all built on it. This is a local
# widening for one board: every offline main event in the top two tiers, which
# is what people mean by a LAN and includes DreamHack, Gamers8 and the EWC.
OFFLINE = {t['name'] for t in tournaments
           if t.get('type') in ('Offline', 'Hybrid')
           and t.get('liquipediatier') in (1, 2)
           and t.get('liquipediatiertype') is None}

for t, r, m, pages in PLACED:
    n = t['name']
    for page, _ in pages:
        if r == 1:
            wins_any[page] += 1
            if n in OFFLINE:
                wins_offline[page] += 1
        if n in FNCS:
            fncs_apps_all[page] += 1
            if r is not None and r <= 5:
                fncs_top5[page] += 1

board('tournament-wins', 'Players', 'Top 10 by tournaments won', 'player',
      'Every tournament on record, from a Global Championship to a $50 cup - '
      'first place only. ' + TIE_FAME, rank_fame(wins_any), count('win'))
board('lan-wins', 'Players', 'Top 10 by LAN wins', 'player',
      'Offline main events in the top two tiers, so the Globals and the World '
      'Cup but also DreamHack, Gamers8 and the Esports World Cup. ' + TIE_FAME,
      rank_fame(wins_offline), count('win'))
board('fncs-top5', 'Players', 'Top 10 by top-5 finishes at FNCS finals', 'player',
      'Fifth or better at an FNCS grand final, counting every season and region. '
      + TIE_FAME, rank_fame(fncs_top5), phrase('top-5 finish', 'top-5 finishes'))

fncs_titles = {p['pagename']: p['fncs_wins'] for p in PLAYABLE}
board('fncs-finals-no-title', 'Players',
      'Top 10 by FNCS grand finals without ever winning one', 'player',
      'Grand finals reached by players whose FNCS title count is still zero. '
      'One win and you leave this board for good. ' + TIE_FAME,
      rank_fame(Counter({k: v for k, v in fncs_apps_all.items() if not fncs_titles.get(k)})),
      count('final'))
board('earnings-no-fncs', 'Players', 'Top 10 earners who have never won an FNCS',
      'player', 'Career prize money, among players with no FNCS title. ' + TIE_MONEY,
      rank(Counter({k: v for k, v in career.items() if not fncs_titles.get(k)}), NAME), money)

# ============================================== FNCS waves: streaks, chapters ==
# A "wave" is one round of FNCS grand finals: every region's final inside a week
# of each other. Read off the dates rather than the names, because the naming
# changed four times (Season X, C2S1, FNCS 2023 - Major 1) and the dates did not.
# A cluster smaller than four regions is a one-off - a Global Championship, the
# 2022 Invitational, the 2026 Summit - and is left out, so missing an event
# nobody could qualify for does not break a streak.
_fncs_days = sorted((day_of(tour_of[n]), n) for n in FNCS if day_of(tour_of[n]))
_clusters, _cur = [], []
for _d, _n in _fncs_days:
    if _cur and days_apart(_cur[-1][0], _d) > 7:
        _clusters.append(_cur)
        _cur = []
    _cur.append((_d, _n))
if _cur:
    _clusters.append(_cur)
WAVES = [c for c in _clusters if len(c) >= 4]
wave_of = {n: i for i, c in enumerate(WAVES) for _, n in c}

# Chapters come out of the export's own names: thousands of community events are
# called "C6S2" or "Chapter 5 Season 1", so the chapter of any date is whatever
# the events around it call themselves. Nothing is hardcoded, which matters
# because the FNCS stopped putting the chapter in its own name after 2022.
_CH_PREFIX, _CH_WORDS = re.compile(r'\bC(\d)S\d+\b'), re.compile(r'\bChapter\s+(\d+)\b', re.I)
_marked = []
for t in tournaments:
    _m = _CH_PREFIX.search(str(t.get('name') or '')) or _CH_WORDS.search(str(t.get('name') or ''))
    if _m and day_of(t):
        _marked.append((day_of(t), int(_m.group(1))))
_marked.sort()

def chapter_at(day, window=45):
    """The chapter the scene was in on `day`, by majority vote of the events
    around it. Before the first event that names a chapter at all, it is the one
    before that - Chapter 1 predates the convention."""
    if day < _marked[0][0]:
        return _marked[0][1] - 1
    near = [c for d, c in _marked if abs(days_apart(d, day)) <= window]
    return Counter(near).most_common(1)[0][0] if near else None

played_waves, won_waves, chapters_won = defaultdict(set), defaultdict(set), defaultdict(set)
for t, r, m, pages in PLACED:
    w = wave_of.get(t['name'])
    if w is None:
        continue
    ch = chapter_at(day_of(t))
    for page, _ in pages:
        played_waves[page].add(w)
        if r == 1:
            won_waves[page].add(w)
            chapters_won[page].add(ch)

def longest_run(seen, universe=None):
    best = run = 0
    for i in (universe if universe is not None else range(len(WAVES))):
        run = run + 1 if i in seen else 0
        best = max(best, run)
    return best

board('fncs-streak-finals', 'Players',
      'Top 10 by consecutive FNCS grand finals qualified for', 'player',
      "The longest run of FNCS grand finals in a row, counting every region's "
      'own final as one round. Miss a round and the run starts again. ' + TIE_FAME,
      rank_fame(Counter({p: longest_run(s) for p, s in played_waves.items()})),
      phrase('final in a row', 'finals in a row'))
board('fncs-streak-wins', 'Players', 'Top 10 by consecutive FNCS titles', 'player',
      "Winning your region's grand final in consecutive rounds of the FNCS. "
      + TIE_FAME,
      rank_fame(Counter({p: longest_run(s) for p, s in won_waves.items()})),
      phrase('title in a row', 'titles in a row'))
board('fncs-chapters', 'Players', 'Top 10 by FNCS titles across different chapters',
      'player',
      'How many different chapters of Fortnite a player has won an FNCS in - '
      'three titles in one chapter counts once. ' + TIE_FAME,
      rank_fame(Counter({p: len(s) for p, s in chapters_won.items()})),
      count('chapter'))

# ==================================================== age at a major win =====
birthday = {p['pagename']: str(p['birthdate'])[:10] for p in PLAYABLE
            if p.get('birthdate') and re.match(r'^\d{4}-\d{2}-\d{2}$', str(p['birthdate'])[:10])}
major_win_days = defaultdict(list)
for t, r, m, pages in PLACED:
    if t['name'] in MAJORS and r == 1 and day_of(t):
        for page, _ in pages:
            major_win_days[page].append(day_of(t))

AGE_TEXT = {}        # whole days -> "13 years 103 days"

def age_days(page, day):
    """Age in whole days, so the order is the real one and only players who
    share a birthday can tie.

    The spelled-out form is worked out here, from the two real dates, and filed
    under the day count: a year is not 365 days and rounding one is how a board
    ends up claiming somebody won at "13 years 365 days"."""
    born = birthday[page]
    b, d = _date.fromisoformat(born), _date.fromisoformat(day)
    y = d.year - b.year - ((d.month, d.day) < (b.month, b.day))
    try:
        anniversary = b.replace(year=b.year + y)
    except ValueError:                      # born on 29 February
        anniversary = _date(b.year + y, 3, 1)
    days = (d - b).days
    AGE_TEXT.setdefault(days, f'{y} years {(d - anniversary).days} days')
    return days

def spell_age(days):
    return AGE_TEXT[days]

_won = {p: sorted(ds) for p, ds in major_win_days.items() if p in birthday}
first_win = {p: age_days(p, ds[0]) for p, ds in _won.items()}
young_win = {p: min(age_days(p, d) for d in ds) for p, ds in _won.items()}
old_win = {p: max(age_days(p, d) for d in ds) for p, ds in _won.items()}

def by_age(d, oldest_first):
    return sorted(((k, NAME(k), v) for k, v in d.items() if v > 0),
                  key=lambda e: (-e[2] if oldest_first else e[2], e[1].lower()))

board('youngest-major-win', 'Players', 'Top 10 youngest ever to win a major',
      'player',
      'Age on the first day of the event, for every Epic-run tier-1 final since '
      'the World Cup. Players with no published birthday cannot be ranked.',
      by_age(young_win, False), spell_age)
board('oldest-major-win', 'Players', 'Top 10 oldest ever to win a major', 'player',
      'The same list read from the other end: the oldest anyone has been on the '
      'day they won an Epic-run tier-1 final.',
      by_age(old_win, True), spell_age)
board('oldest-first-major-win', 'Players', 'Top 10 oldest to win a first major',
      'player',
      'Age at a maiden title rather than at any title, so a long wait counts and '
      'a long career does not.', by_age(first_win, True), spell_age)

# ========================================== per-country, active players only ==
# The all-time country boards above are monuments to the 2019 World Cup. These
# ask who is winning money there now.
active_pages = {p['pagename'] for p in PLAYABLE if str(p.get('status') or '').lower() == 'active'}
_active_country = defaultdict(Counter)
for page, v in career.items():
    c = country_of_page.get(page)
    if c and page in active_pages:
        _active_country[c][page] = v
for c, sub in sorted(_active_country.items()):
    board(f'country-earnings-active:{c}', 'By country',
          f'Top 10 career earnings - {c}, active players only', 'player',
          'Career prize money, counting only players the export still lists as '
          'active. Retired names are not answers here. ' + TIE_MONEY,
          rank(sub, NAME), money)

# ========================================== duos that lasted, major by major ==
# A team board: the row is a pair, and it only fills once both are named.
_major_days = sorted((day_of(tour_of[n]), n) for n in MAJORS if day_of(tour_of[n]))
_mclusters, _cur = [], []
for _d, _n in _major_days:
    if _cur and days_apart(_cur[-1][0], _d) > 7:
        _mclusters.append(_cur)
        _cur = []
    _cur.append((_d, _n))
if _cur:
    _mclusters.append(_cur)
mwave_of = {n: i for i, c in enumerate(_mclusters) for _, n in c}

pair_waves, solo_waves = defaultdict(set), defaultdict(set)
for t, r, m, pages in PLACED:
    w = mwave_of.get(t['name'])
    if w is None:
        continue
    ids = sorted({pg for pg, _ in pages})
    for pg in ids:
        solo_waves[pg].add(w)
    for a, b in itertools.combinations(ids, 2):
        pair_waves[(a, b)].add(w)

def together_run(pair, shared):
    """Consecutive majors played side by side, counted over the majors either of
    them entered. Sitting one out together does not break it; turning up with
    somebody else does."""
    a, b = pair
    return longest_run(shared, sorted(solo_waves[a] | solo_waves[b]))

# Level runs fall to the pair's combined career earnings before the names.
_pair_money = lambda pair: sum(career.get(pg, 0) for pg in pair)
_duos = sorted(((p, together_run(p, s)) for p, s in pair_waves.items() if len(s) >= 3),
               key=lambda e: (-e[1], -_pair_money(e[0]), NAME(e[0][0]).lower(),
                              NAME(e[0][1]).lower()))
_duo_level = len(_duos) >= SLOTS + 1 and (
    _duos[SLOTS - 1][1] == _duos[SLOTS][1]
    and _pair_money(_duos[SLOTS - 1][0]) == _pair_money(_duos[SLOTS][0]))
if _duo_level:
    LEVEL_AT_CUT.append('duo-longevity')
if len(_duos) >= SLOTS + 1 and not _duo_level:
    def duo_row(pair, value):
        a, b = sorted(pair, key=lambda pg: NAME(pg).lower())
        return {'key': '|'.join(sorted(pair)), 'label': f'{NAME(a)} & {NAME(b)}',
                'value': value, 'display': count('major')(value),
                'members': [{'key': a, 'label': NAME(a)}, {'key': b, 'label': NAME(b)}]}
    _spare = duo_row(*_duos[SLOTS])
    _spare.pop('display')
    boards.append({
        'id': 'duo-longevity', 'group': 'Teammates',
        'title': 'Top 10 longest-running duos, major by major', 'entity': 'player',
        'tieRule': ('The longest run of consecutive majors a pair turned up to '
                    'together, counting the majors either of them entered. Both '
                    'names fill one slot. Pairs level on the run are ranked by '
                    'their combined career earnings.'),
        'rows': [duo_row(p, v) for p, v in _duos[:SLOTS]],
        'next': _spare,
    })

# =============================================== countries, counted and sized ==
country_money = Counter()
for page, v in career.items():
    c = country_of_page.get(page)
    if c:
        country_money[c] += v

for thr, word in ((100_000, '$100K'), (300_000, '$300K'), (500_000, '$500K'),
                  (1_000_000, '$1M')):
    c = Counter()
    for page, v in career.items():
        if v >= thr and country_of_page.get(page):
            c[country_of_page[page]] += 1
    board(f'country-over:{thr}', 'Countries',
          f'Top 10 countries by players over {word} in career earnings', 'country',
          f'How many individual players from each country have passed {word}. '
          + TIE_RICH,
          sorted(((k, k, v, country_money[k]) for k, v in c.items() if v > 0),
                 key=lambda e: (-e[2], -e[3], e[1].lower())),
          count('player'))

# Resident populations, hand-entered from public 2024 estimates and rounded to
# the nearest hundred thousand. Not from Liquipedia: the export has no such
# column, and this is the one board that needs a number from outside it.
# England, Scotland and Wales are separate nationalities in the export, so they
# get separate populations rather than being folded into the United Kingdom.
POPULATION = {
    'United States': 340, 'Canada': 41.3, 'Brazil': 212, 'Mexico': 130, 'Argentina': 46,
    'Chile': 19.8, 'Colombia': 52.3, 'Peru': 34.2, 'Uruguay': 3.4, 'Paraguay': 6.9,
    'Ecuador': 18.1, 'Venezuela': 28.4, 'Bolivia': 12.4, 'Costa Rica': 5.2, 'Panama': 4.5,
    'Guatemala': 18.1, 'El Salvador': 6.3, 'Honduras': 10.6, 'Nicaragua': 7,
    'Dominican Republic': 11.4, 'Cuba': 11, 'Puerto Rico': 3.2, 'Trinidad and Tobago': 1.5,
    'United Kingdom': 69.1, 'England': 57.1, 'Scotland': 5.5, 'Wales': 3.2,
    'Northern Ireland': 1.9, 'Ireland': 5.4, 'France': 68.4, 'Germany': 84.6,
    'Spain': 48.6, 'Italy': 58.9, 'Portugal': 10.6, 'Netherlands': 18, 'Belgium': 11.8,
    'Luxembourg': 0.67, 'Switzerland': 8.9, 'Austria': 9.2, 'Denmark': 6, 'Norway': 5.6,
    'Sweden': 10.6, 'Finland': 5.6, 'Iceland': 0.39, 'Poland': 36.7, 'Czechia': 10.9,
    'Slovakia': 5.4, 'Hungary': 9.6, 'Romania': 19, 'Bulgaria': 6.4, 'Greece': 10.4,
    'Croatia': 3.9, 'Slovenia': 2.1, 'Serbia': 6.6, 'Bosnia and Herzegovina': 3.2,
    'North Macedonia': 1.8, 'Albania': 2.7, 'Montenegro': 0.62, 'Kosovo': 1.6,
    'Malta': 0.56, 'Cyprus': 1.3, 'Estonia': 1.37, 'Latvia': 1.87, 'Lithuania': 2.86,
    'Belarus': 9.1, 'Ukraine': 37.9, 'Russia': 144, 'Moldova': 2.5, 'Georgia': 3.7,
    'Armenia': 3, 'Azerbaijan': 10.2, 'Kazakhstan': 20.3, 'Uzbekistan': 36.4,
    'Turkey': 85.7, 'Israel': 9.8, 'Palestine': 5.5, 'Lebanon': 5.4, 'Jordan': 11.5,
    'Syria': 24, 'Iraq': 45.5, 'Iran': 89.2, 'Yemen': 34.4, 'Saudi Arabia': 34,
    'United Arab Emirates': 11, 'Kuwait': 4.9, 'Bahrain': 1.6, 'Qatar': 3, 'Oman': 5.3,
    'Egypt': 114, 'Morocco': 37.8, 'Algeria': 46.3, 'Tunisia': 12.3, 'South Africa': 63,
    'Nigeria': 227, 'Kenya': 56.4, 'Ghana': 34.4, 'Uganda': 49, 'Namibia': 3,
    'Greenland': 0.057, 'India': 1441, 'China': 1411, 'Pakistan': 245, 'Bangladesh': 173,
    'Sri Lanka': 21.9, 'Cambodia': 17.6, 'Japan': 123, 'South Korea': 51.7, 'Taiwan': 23.4,
    'Hong Kong': 7.5, 'Singapore': 6, 'Malaysia': 34.6, 'Indonesia': 281,
    'Philippines': 118, 'Vietnam': 100, 'Thailand': 71.7, 'Australia': 27.1,
    'New Zealand': 5.3, 'Fiji': 0.93,
}
_nopop = sorted(c for c, v in country_money.items() if v > 0 and c not in POPULATION)
if _nopop:
    print('no population on file for:', _nopop)
board('country-per-capita', 'Countries',
      'Top 10 countries by earnings per resident', 'country',
      "Career prize money won by that country's players, divided by its "
      'population. Populations are public 2024 estimates typed in by hand - they '
      'are not part of the Liquipedia export.',
      sorted(((c, c, country_money[c] / (POPULATION[c] * 1_000_000))
              for c in country_money if c in POPULATION and country_money[c] > 0),
             key=lambda e: (-e[2], e[1].lower())),
      lambda v: f'${v:,.2f} per resident')

# ================================================= the paydays of the famous ==
# Answered with a tournament rather than a player, which is a first: the board
# asks where the money came from. Names are shortened to the event rather than
# the region's own page ("C3S1: FNCS", not "C3S1: FNCS - Grand Finals: NA East"),
# because the region is not what anyone remembers and it is never the question.
_REGION_TAIL = re.compile(
    r'\s*[-:]\s*(NA East|NA West|NA Central|North America East|North America West|'
    r'North America Central|North America|Europe|Asia|Brazil|Middle East|Oceania|'
    r'World|Global)\s*$', re.I)
_FINALS = re.compile(r'\s*[-:]?\s*Grand Finals?\s*[-:]?\s*', re.I)

def short_event(name):
    s, prev = name, None
    while prev != s:
        prev = s
        s = _REGION_TAIL.sub('', s).strip().rstrip('-:').strip()
        s = _FINALS.sub(' ', s).strip().rstrip('-:').strip()
    return re.sub(r'\s{2,}', ' ', s)

paydays = defaultdict(Counter)
# When each shortened event last paid out, so two level paydays can be split by
# date rather than by name: C2S7 and FNCS 2023 - Major 3 paid Kami the same.
payday_last = defaultdict(dict)
for t, r, m, pages in PLACED:
    if m <= 0:
        continue
    for page, _ in pages:
        name = short_event(t['name'])
        paydays[page][name] += m
        day = day_of(t)
        when = _date.fromisoformat(day).toordinal() if day else 0
        payday_last[page][name] = max(when, payday_last[page].get(name, 0))
for page, _ in career.most_common(20):
    board(f'paydays:{page}', 'Paydays', f'Top 10 biggest paydays - {NAME(page)}',
          'tournament',
          f'The ten tournaments {NAME(page)} earned the most at, by prize money '
          'from that one event. A regional final is named by the event rather '
          'than the region. Level paydays are ordered by date, the more recent '
          'first.',
          sorted(((n, n, v, payday_last[page].get(n, 0)) for n, v in paydays[page].items()
                  if v > 0),
                 key=lambda e: (-e[2], -e[3], e[1].lower())),
          money)

# Everything answerable on a paydays board, so the guess box has somewhere to
# search that is not the answer sheet. Tier 1-2 only: 735 names is a list, the
# whole export is a phone book.
TOURNAMENT_POOL = {short_event(t['name']) for t in tournaments
                   if t.get('liquipediatier') in (1, 2)}
# Plus any answer that falls outside those two tiers - a payday from a 2018
# skirmish, mostly. An answer you cannot type is the same bug as a wrong answer.
for b in boards:
    if b['entity'] == 'tournament':
        TOURNAMENT_POOL.update(r['key'] for r in b['rows'] + [b['next']])
TOURNAMENT_POOL = sorted(TOURNAMENT_POOL)

payload = {'generated': TODAY, 'slots': SLOTS, 'boards': boards,
           'tournaments': TOURNAMENT_POOL}
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))

print(f'{len(boards)} boards, {len(TOURNAMENT_POOL)} tournament names, '
      f'{os.path.getsize(OUT)/1e6:.2f} MB')
print(f'{len(LEVEL_AT_CUT)} boards left out, level at the cut:', LEVEL_AT_CUT)
print(Counter(b['group'] for b in boards))
```

---

## Cell 5 — `pools.json`

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

## Cell 6 — `teammates.json`

**New here, and the one file in the app that was not written by these cells.**
It lived commented-out in `players_optimize.ipynb`; this is the same code with
one number changed and cell 1's `resolve` in place of its own copy.

`TOP` was 10, which was exactly what Who Are Ya needed when the game always
revealed the same ten names. It now draws its ten clues out of a much bigger
bag, and List asks questions like "everyone who has played ten or more
tournaments with Peterbot" — fourteen players, four of whom were past the old
cut. **`TOP = 50`.**

The file goes from 0.68 MB to 1.15 MB. Fifty is effectively uncapped: at 100 it
is 1.18 MB, because only 674 players have even thirty teammates on record.

Expected output:

```
39,038 distinct pairs; 5,490 players with a teammate
75,104 rows kept at TOP=50; 1.15 MB
  players with 3+ teammates on file: 4,805
  players with 10+ teammates on file: 2,683
  players with 20+ teammates on file: 1,330
  players with 50+ teammates on file: 185
```

```python
OUT = f'{BASE}/teammates.json'
TOP = 50          # was 10 — see the note above

pair = Counter()
for row in placements:
    parts = row.get('participants') or []
    if len(parts) < 2:
        continue
    # `resolve` drops anyone the roster marks unused, so a mate who cannot be
    # shown or guessed never reaches the file in the first place.
    pages = sorted({resolve(p.get('player') or '') for p in parts} - {None})
    for a, b in itertools.combinations(pages, 2):
        pair[(a, b)] += 1

mates = defaultdict(list)
for (a, b), n in pair.items():
    mates[a].append([b, n])
    mates[b].append([a, n])

players_out = []
for page, entries in mates.items():
    entries.sort(key=lambda e: (-e[1], e[0]))
    players_out.append({'id': page, 'mates': entries[:TOP]})
players_out.sort(key=lambda p: p['id'])

payload = {'generated': TODAY, 'top': TOP, 'players': players_out}
with open(OUT, 'w', encoding='utf-8') as fh:
    json.dump(payload, fh, ensure_ascii=False, separators=(',', ':'))

kept = sum(len(p['mates']) for p in players_out)
print(f'{len(pair):,} distinct pairs; {len(players_out):,} players with a teammate')
print(f'{kept:,} rows kept at TOP={TOP}; {os.path.getsize(OUT)/1e6:.2f} MB')
for n in (3, 10, 20, 50):
    print(f'  players with {n}+ teammates on file: '
          f'{sum(1 for p in players_out if len(p["mates"]) >= n):,}')
print('Peterbot:', players_out[[p['id'] for p in players_out].index('Peterbot')]['mates'][:6])
```

---

## Check — FNCS winners vs major winners

**Read-only: writes nothing.** Run it any time after cell 1. It compares the
two ways the games decide "has won an FNCS":

- `fncs_wins` in `players.json` — the count matched in from Wikipedia. Drives
  "FNCS winner", "2+ FNCS titles" and Higher or Lower's FNCS Wins.
- `wins.major` in `facts.json` — a 1st place at one of Liquipedia's majors.
  Drives "Major winner", "Won EU FNCS" and "Won FNCS in 2023".

It prints who is in one and not the other, why (the part of `is_major` that
turns their FNCS wins away), and who is in both but counted differently.

Run against the dump on 24 Sep 2026 it printed:

```
FNCS winners 284   major winners 250   both 245
only FNCS 39   only major 5
reasons, across all their FNCS 1sts:
   42  tier 2, console/mobile/twitch bracket
   38  console/mobile/twitch bracket
   11  tier 2
    2  tier 4
    1  tier 3
=== In both, but counted differently: 17 players ===
```

```python
# FNCS winners vs major winners — read-only, writes nothing. Run after cell 1.
#
#   "FNCS winner" = players.json `fncs_wins` > 0   (the count matched in from Wikipedia)
#   "Major winner" = facts.json `wins.major` > 0   (a 1st place at one of Liquipedia's majors:
#                    tier 1, no tier type, organised by Epic, from the 2019 World Cup on,
#                    not console/mobile/twitch — plus the LANs)
facts_payload = json.load(open(f'{BASE}/facts.json', encoding='utf-8'))
EVENTS = facts_payload['events']
FACTS = {p['id']: p for p in facts_payload['players']}

fncs_winners = {p['pagename'] for p in PLAYABLE if (p.get('fncs_wins') or 0) > 0}
major_winners = {page for page, f in FACTS.items() if f['wins']['major'] > 0}
both = fncs_winners & major_winners
only_fncs = fncs_winners - major_winners
only_major = major_winners - fncs_winners
print(f'FNCS winners {len(fncs_winners)}   major winners {len(major_winners)}   both {len(both)}')
print(f'only FNCS {len(only_fncs)}   only major {len(only_major)}\n')


def why_not_major(t):
    """Which part of is_major() turns this tournament away."""
    reasons = []
    if t['liquipediatier'] != 1:
        reasons.append(f"tier {t['liquipediatier']}")
    if t['liquipediatiertype'] is not None:
        reasons.append(f"tier type {t['liquipediatiertype']!r}")
    if not is_epic(t):
        reasons.append('not organised by Epic')
    if (t['startdate'] or '') < '2019-07-26':
        reasons.append('before the 2019 World Cup')
    if re.search(r'console|mobile|twitch', t['name'], re.I):
        reasons.append('console/mobile/twitch bracket')
    return ', '.join(reasons) or 'counts as a major'


# Every 1st place each player has in a tournament with "FNCS" in its name.
fncs_firsts = defaultdict(list)
for t, r, money, pages in PLACED:
    if r == 1 and 'FNCS' in t['name']:
        for page, _team in pages:
            fncs_firsts[page].append(t)


def majors_won(page):
    return [EVENTS[i]['short'] for i in FACTS.get(page, {}).get('won', [])]


# --- 1. Wikipedia says FNCS winner, Liquipedia's majors have no win ----------
rows = []
for page in sorted(only_fncs, key=lambda pg: -(player_of[pg].get('earnings') or 0)):
    p = player_of[page]
    firsts = fncs_firsts.get(page, [])
    rows.append({
        'player': p['id'],
        'page': page,
        'fncs_wins (Wikipedia)': p.get('fncs_wins'),
        'tier': p['tier'],
        'earnings': p.get('earnings'),
        'FNCS 1sts on Liquipedia': len(firsts),
        'those 1sts, and why they are not majors': '; '.join(
            f"{t['name']} ({why_not_major(t)})" for t in firsts
        ) or '— none: Liquipedia has no FNCS win for them at all',
    })
only_fncs_df = pd.DataFrame(rows)
print('=== FNCS winner by Wikipedia, no major win by Liquipedia ===')
print(only_fncs_df.to_string(index=False, max_colwidth=140))

# Why, summarised: the reason is_major gave for each of those 1sts.
reason_counts = Counter(
    why_not_major(t) for page in only_fncs for t in fncs_firsts.get(page, [])
)
print('\nreasons, across all their FNCS 1sts:')
for reason, n in reason_counts.most_common():
    print(f'  {n:>3}  {reason}')
print(f"  {sum(1 for pg in only_fncs if not fncs_firsts.get(pg))} players with no FNCS 1st on Liquipedia at all")

# --- 2. Liquipedia major win, no FNCS title on Wikipedia ---------------------
print('\n=== Major winner by Liquipedia, no FNCS title by Wikipedia ===')
print(pd.DataFrame([
    {'player': player_of[pg]['id'], 'tier': player_of[pg]['tier'], 'majors won': '; '.join(majors_won(pg))}
    for pg in sorted(only_major)
]).to_string(index=False, max_colwidth=140))

# --- 3. In both sets, but the two sources count a different number ----------
# Liquipedia's FNCS count: won majors whose name says FNCS (regional finals,
# Globals, the Invitational, the Summit).
rows = []
for page in sorted(both):
    wiki = player_of[page].get('fncs_wins') or 0
    liq = sum(1 for i in FACTS[page]['won'] if 'FNCS' in EVENTS[i]['name'])
    if wiki != liq:
        rows.append({'player': player_of[page]['id'], 'Wikipedia': wiki, 'Liquipedia FNCS majors won': liq,
                     'Liquipedia list': '; '.join(EVENTS[i]['short'] for i in FACTS[page]['won'] if 'FNCS' in EVENTS[i]['name'])})
print(f'\n=== In both, but counted differently: {len(rows)} players ===')
if rows:
    print(pd.DataFrame(rows).to_string(index=False, max_colwidth=140))
```

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

## Built — team boards

"Top 10 at a tournament, in duos/trios, name both players" is the tournament
section of cell 2, and it needed the two things this section used to list:

1. **Data.** A row per placement carrying every participant. `placements.json`
   already had `participants: [{player, team}]`, so the cell writes each place
   as one row with a `members: [{key, label}]` array beside the usual key.
2. **An engine change.** `BoardRow.members` is optional and `applyGuess` now
   matches a guess against *any* member of a row, filling the slot partially
   until the last name lands. A board without the column — a `rankings.json`
   written before this — still plays exactly as it did, because a row with no
   members is read as a team of one.

The eleventh place is a team too, so naming anyone from it is the same free
near miss it always was.

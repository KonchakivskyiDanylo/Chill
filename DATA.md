# The data

All data is **imported, not authored**. It is fetched, parsed and written out
by the notebook; nothing is typed in by hand and nothing is invented to fill a
gap. Where a source says nothing, so does OffSpawn — a missing earnings figure
renders as a dash, never a zero.

There is one dataset, and every game reads it:
`liquipedia_data/clean_data/fortnite/` — 5,678 players, 14,645 tournaments,
442,736 placements, from [Liquipedia (Fortnite)](https://liquipedia.net/fortnite/).

The older Wikipedia import (316 players in `src/data/fortnite/`), the
`Dataset` / `PlayerRepository` layer over it, the `scripts/etl/` pipeline that
built it and `fame_calculation.ipynb` have all been **removed**. No game had
read any of it since the migration. Earlier revisions of this file described
that pipeline at length; git has them if they are ever needed.

FNCS title counts still originate from Wikipedia's *Competitive Fortnite
records and statistics* — they are matched into the `fncs_wins` column of
`players.json` upstream, which is why the attribution still names both sources.

Licensing is in [CREDITS.md](CREDITS.md) and
[src/data/LICENSE.md](src/data/LICENSE.md) — the data is CC BY-SA 3.0, not AGPL like the code.

```bash
npm run check:games   # play all ten games headlessly
```

The derived files are committed, so the site builds with no network access.
`scripts/build_data.py` produces all of them from the raw dump.

## Keeping the dump current

The commands, step by step: [UPDATE_DATA.md](UPDATE_DATA.md). How it works:

`scripts/liquipedia_api.py` brings the **raw** dump up to date from the
LiquipediaDB API: `liquipedia_data/raw_data/fortnite/` (git-ignored), the five
files the cleaning notebooks read. You run it; nothing else does.

- **60 requests an hour.** Every request is logged in `sync_state.json`, so a
  run waits rather than overruns, even straight after another. A 429 waits for
  `Retry-After`, or an hour. Ctrl+C is safe; the next run carries on.
- **Only what changed.** Players and teams are re-read whole (about 8
  requests). Tournaments, transfers and placements are read from the last sync
  minus 30 days, and that window replaces what we held for it. A normal run is
  15–20 requests.
- **Older edits come by webhook.** Give Liquipedia
  `https://<site>/api/liquipedia/<LIQUIPEDIA_WEBHOOK_SECRET>`. The server keeps
  the pings; with `OFFSPAWN_URL` and `OFFSPAWN_ADMIN_PASSWORD` set, the script
  reads them and re-reads those pages. Deleted pages lose their rows.
- **It will not overwrite a file with a broken answer**: a window or a table
  that comes back smaller than what it would delete is refused.

```bash
.venv/Scripts/python scripts/liquipedia_api.py --since 2026-09-14   # the first time
.venv/Scripts/python scripts/check_liquipedia_api.py                # its checks, against a fake API
```

Then `scripts/build_data.py` turns the raw dump into every file the site
reads, in three steps, each in `scripts/pipeline/`:

| step | does | was |
| --- | --- | --- |
| `clean.py` | raw -> clean players, teams, tournaments, transfers, placements | the five cleaning notebooks |
| `enrich.py` | FNCS titles, `tier`, `region_tier`, `orgs.json` | `players_optimize.ipynb` (deleted) |
| `derived.py` | rankings, pools, teammates, career path, facts | the cells of `notebook_cells.md` (deleted) |

- **It builds in a staging folder**, runs `npm run check:games` on the result,
  and only then replaces the files - all together, so a failed step leaves the
  site's data as it was. It also sets `EXPORT_DATE` in `roster.ts`.
- **FNCS titles**: Wikipedia's table (`scripts/pipeline/wikipedia_fncs.json`,
  taken from the import before `dce12ea`) up to FNCS 2026 Major 2, then each
  regional grand final's winners from Liquipedia's own results.
- **Proved against the notebooks**: on the same raw dump the five clean files
  come out identical to the notebooks' output, and on the current clean files
  `enrich.py` and `derived.py` reproduce `players.json`, `orgs.json` and every
  derived file exactly.

```bash
.venv/Scripts/python scripts/liquipedia_api.py   # what changed on Liquipedia
.venv/Scripts/python scripts/build_data.py       # every data file, checked
```

`--from players` or `--from derived` starts later, reusing the clean files;
`--out DIR` builds somewhere else to compare first.

---
## The Liquipedia roster

Every game runs on this dataset, in `liquipedia_data/clean_data/fortnite/`,
read **in place**. There is no build step and no derived copy — regenerate a
file and reload.

| file | holds | read through |
| --- | --- | --- |
| `roster.json` | the players the games use — `players.json`'s columns that are read, with empty values left out (`scripts/pipeline/site.py`) | `Roster` |
| `players.json` | 5,678 playable rows in full: handle, aliases, country, birthday, earnings, status; `Roster` falls back to it when `roster.json` is missing | the pipeline |
| `career_path.json` | 187 majors and every player's finishes in them (1,175 with five or more) | `Majors` |
| `teammates.json` | each player's fifty most-played-with teammates | `Teammates` |
| `orgs.json` | 979 organisations, with who has ever played for them | `Orgs` |
| `facts.json` | per player: tournaments played, LAN and FNCS appearances, wins by kind, where and when they won, which headline events they played | `Facts` |
| `rankings.json` | ~290 precomputed top-tens, answered in players, orgs, countries or tournaments | `Rankings` |
| `pools.json` | the qualified field for one event — Globals 2026, EWC 2026 | `Pools` |

All but `players.json` are **derived** from `tournaments.json` and
`placements.json` by `scripts/pipeline/derived.py`. None carries a `tier`: difficulty is
joined from `players.json` by page name, so there is still exactly one place
difficulty is decided.

`rankings.json` is precomputed rather than derived at runtime because its
source is 442,736 placement rows across 154 MB, which is not something a phone
should aggregate per page load. The boards only change when the export does.

A file that has not been generated is simply **absent**, and that is a
supported state. `src/data/liquipedia/files.ts` reads the folder with
`import.meta.glob`, so a missing file is a value to branch on rather than a
build failure — the games that need it show their "has it been generated?"
banner and the rest carry on. `npm run check:games` reports them as SKIPPED and
still passes.

These columns of `players.json` are maintained upstream, by the notebook that
owns the data:

| column | values | meaning |
| --- | --- | --- |
| `tier` | `easy` / `medium` / `hard` / `unused` | difficulty band; `unused` rows are dropped when the roster loads and never reach a game |
| `region_tier` | same, optional | difficulty band within `region`, for Fortnitedle's region picker |
| `fncs_wins` | integer ≥ 0 | FNCS grand finals won, matched over from the Wikipedia import |

`tier` is opaque to the app. Nothing recomputes it and there is no fallback
ranking, so changing how it is calculated changes every game at once and
requires no code change. `region_tier` is read in its place only when a region
has been chosen, and falls back to `tier` when the column is absent.

### Why region needs its own column

`tier` ranks all 5,678 rows against each other. Split by region, the Easy band
is almost entirely NA and EU:

| region | easy | medium | hard |
| --- | ---: | ---: | ---: |
| North America | 53 | 344 | 1403 |
| Europe | 57 | 355 | 1208 |
| Asia | **0** | 82 | 566 |
| Oceania | **0** | 72 | 544 |
| South America | 3 | 104 | 351 |
| Middle East | **0** | 51 | 370 |
| Africa | 0 | 1 | 21 |

So "Asia + Easy" on the global band is not a thin pool, it is an empty one,
and the tier widening would hand back Medium without saying so. Ranked inside
the region the same 2% / 18% / 80% cut gives Asia 13 / 118 / 526 and every
region but Africa all three bands. Africa has 22 rows, so 2% rounds to nobody;
the setup screen greys that card out with its count showing rather than
widening behind your back.

### Why it is separate

The two datasets are not two versions of the same thing; they answer different
questions.

The Wikipedia import is **deep and narrow**: 316 players, but for each of them
who they placed with, where, and under which org. Connections, Tenaball,
Griefer and Piece Control are written around having that, and it is still the
only source that publishes FNCS titles per player.

The Liquipedia export is **wide**: 5,678 players, and — once the notebook has
reduced `placements.json` — their finishes at 187 majors and who they queued
with across all 14,645 tournaments. Higher or Lower and Fortnitedle only ever
need "who exists and what are they worth"; Career Path and Who Are Ya need the
two derived files as well, and get a far better game out of them than the
winners-only view could give. All four read the files directly through `Roster`,
`Majors` and `Teammates` rather than being squeezed through a model built for
the smaller import.

### Inputs

Read-only, and untouched by the build:

```
liquipedia_data/clean_data/fortnite/
  players.json       5,726 pages — handle, real name, nationalities, region,
                     birthdate, career and per-year earnings, current team
  teams.json         535 organisations
  tournaments.json   14,645 tournaments with Liquipedia tier and prize pool
  placements.json    442,736 finishes
  transfers.json     40,119 roster moves (not used yet)
```

`liquipedia_data/` is gitignored **except** the seven files the site reads —
`players`, `career_path`, `teammates`, `orgs`, `facts`, `rankings` and `pools`,
about 6 MB together — because a deploy builds from the repo and a clone
without them has no games. `placements.json` at 154 MB, `tournaments.json`,
`transfers.json` and `teams.json` stay ignored.

Until 24 Sep 2026 this paragraph said `players.json` was already committed.
It never was: `.gitignore` excluded the whole folder and then tried to
re-include single files with `!` lines, which git does not allow inside an
excluded folder. The rules now open each folder level in turn.

### What the notebook derives from `placements.json`

**Career Path** takes the tournaments the notebook calls majors — currently
Liquipedia tier 1, no tier type, organised by Epic Games, from the 2019 World
Cup on, minus the console / mobile / Twitch brackets and challenge events
(MrBeast's): 187 of them. The file carries every player with one (cell 7 in
`scripts/pipeline/derived.py`), but a player needs five to be a possible answer on the
whole roster, which leaves 1,175 — 92 Easy, 567 Medium, 516 Hard. An event
field asks about anyone in it with one, and a short career gets five guesses. Rows with no numeric placement (`''`,
`DNP`, `DQ` — 352 of them) are dropped; a range like `35-36` reads as 35.

**Who Are Ya** counts a pair once per placement row they share, which is what
"played together" means — 213,666 of the 442,736 rows are a roster of two or
more, and two solo players at the same event are not teammates. That gives
39,038 distinct pairs and counts with weight behind them: Peterbot and Pollo
have entered 126 tournaments together, where the Wikipedia import could only
see the ones they won.

61,016 participant names (205,641 rows) have no `players.json` page and are
skipped, because there is nothing to render and nothing to guess. A count is
therefore "tournaments together that Liquipedia can name us both in", not an
absolute.

### What the build does

1. Keeps pages with a competitive record (some prize money). Liquipedia files
   the scene's streamers as `staff`, but Nate Hill, SypherPK, Myth and CouRage
   have all won real money and are more recognisable than most tier-1
   competitors, so `type` is not filtered on. Players recorded as having died
   are left out — the game asks how old someone is *today*.
2. Maps nationalities to ISO 3166-1 alpha-2 for the flag badge; all 121 values
   in the dump are covered, and the build reports any that are not.
3. Resolves handles to pages. 142 handles belong to two or more pages ("Aqua"
   is both the Austrian World Cup winner and a Japanese player); nationality
   settles it where the caller knows one, otherwise the biggest career wins.
4. Scores every 1st place by Liquipedia's tier, tier type and prize pool, and
   derives the fame ranking from that plus career earnings.
5. Carries **FNCS titles** over from the Wikipedia import by handle, with
   hand-verified aliases for winners the two sources spell differently. Where
   a handle belongs to several pages, nationality decides, then whichever page
   Liquipedia itself has winning an FNCS final — both FHDs are Saudi, and
   until 24 Sep 2026 the bigger earner took the other one's two titles. A
   player is credited once per final, so Ruri's win as Takamura adds to their
   count rather than being lost to it. The code is `fncs_titles` in
   `scripts/pipeline/enrich.py`; the Wikipedia table it reads was taken out
   of git (`dce12ea^`) into `scripts/pipeline/wikipedia_fncs.json`. Finals
   after FNCS 2026 Major 2 count from Liquipedia's own winners.

### The FNCS Wins category

The Liquipedia export publishes no per-player FNCS title count, which is why
this one number crosses over from the older Wikipedia data. That table lists
every grand-final winner in every region since 2019, so a handle missing from
it has no title, and reads as 0.

278 players hold at least one, and the category asks only about them — in a pool
where four in five players held zero, nearly every pair would be a tie and there
would be no question to answer. Even so, ties are common, because 189 of those
278 hold exactly one title:

| Tier | Players with a title | Chance a random pair ties |
| --- | --- | --- |
| Easy | 83 | ~23% |
| Medium | 194 | ~70% |
| Hard | 1 → borrows Medium | — |

On Easy and Medium there is no Equal button, so a tie accepts either answer.
That makes Medium generous. If you would rather it were a real question, give
the category its own Equal rule in `hasEqualButton()`:

```ts
export function hasEqualButton(difficulty: Difficulty, category?: Category): boolean {
  return difficulty === 'hard' || category === 'fncsWins';
}
```

Hard has exactly one title-holder of its own, so it borrows Medium's pool
through `playersFor`'s normal tier widening. `npm run check:games` reports that
as a note rather than a failure, because for this category it is expected.
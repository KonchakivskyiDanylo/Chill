# The data

All data is **imported, not authored**. Sources are fetched, parsed and written
out as TypeScript or JSON; nothing is typed in by hand and nothing is invented
to fill a gap.

There are two datasets. This document is mostly about the first one.

| Dataset | Rows | Read by |
| --- | --- | --- |
| `src/data/fortnite/` — the Wikipedia import | 316 players with full career histories | Nine games, through `Dataset` |
| `liquipedia_data/.../players.json` — the Liquipedia export | 5,700 players, no per-event rows | Higher or Lower and Fortnitedle, through `Roster` |

See [The Liquipedia roster](#the-liquipedia-roster) at the end for the second
one. Licensing for both is in [CREDITS.md](CREDITS.md) and
[src/data/LICENSE.md](src/data/LICENSE.md) — the data is CC-BY-SA 3.0, not MIT.

| Source | What it gives |
| --- | --- |
| [Wikipedia — *Competitive Fortnite records and statistics*](https://en.wikipedia.org/wiki/Competitive_Fortnite_records_and_statistics) | Every FNCS winner by season and region (2019 → 2026), the major non-FNCS winners, the FNCS title records, and the $500k+ earners table with real names, ages and orgs |
| [Liquipedia (Fortnite)](https://liquipedia.net/fortnite/) | The birthday list (~3,000 people) and the player earnings portal — career totals plus a table per year |

```bash
npm run etl:fetch     # download the sources into scripts/etl/.cache/
npm run etl:build     # parse the cache -> src/data/fortnite/*.ts
npm run audit         # does the imported data look believable?
npm run check:data    # is it internally consistent, and can the games use it?
npm run check:games   # play all ten games headlessly
```

The generated files are committed, so the site builds with no network access.
`etl:fetch` skips anything already cached — see *Rate limits* below.

---

## Shape

The model is relational. A player is not one row with a `fncsWins` number on it;
a player is a person, and the titles are counted from the results.

```
TournamentEvent    one tournament — a regional grand final, a global, a LAN
EventEntry         one roster's finish at one event: placement, prize, playerIds[], org
OrgStint           one spell at one organisation, with dates
Player             the person — plus views derived from the rows above
```

`EventEntry.playerIds` holds the **whole roster**, so a trio win is one row
referencing three players rather than three disconnected rows. That single
decision is what makes "who did Peterbot play with", "which orgs has Muz worn"
and "how many titles does EpikWhale have" answerable from the same table.

### Generated files — do not edit

| File | Rows | Holds |
| --- | --- | --- |
| `src/data/fortnite/events.ts` | 220 | Every tournament with a recorded result |
| `src/data/fortnite/entries.ts` | 220 | Every roster that placed, with its players and org |
| `src/data/fortnite/players.ts` | 316 | Verified facts: name, country, birthday, earnings |

`npm run etl:build` overwrites all three. Edits there are lost.

### Hand-maintained files — edit these

| File | Purpose |
| --- | --- |
| `scripts/etl/aliases.ts` | Links handles the two sources spell differently, e.g. Wikipedia's `Kalgamer` ↔ Liquipedia's `Kalgamer710` |
| `src/data/fortnite/countries.ts` | Country display names and the fallback country → region map |

### Derived in `src/data/fortnite/build.ts`

Never stored, always computed, so they cannot contradict the rows they come from:

`results` · `teammates` · `fncsWins` · `majorWins` · `team` · `orgHistory` ·
`age` · `region`

Add one result row and every one of those updates at once.

---

## What is complete and what is not

This matters more than the totals, because it tells you where the next import
should point.

| Field | Coverage | Why |
| --- | --- | --- |
| Tournament winners | **complete** | Wikipedia lists every FNCS winner in every region since 2019 |
| Birthdays | 249 / 316 | Liquipedia's birthday list is opt-in; the rest genuinely are not published |
| Real names | 184 / 316 | same |
| Career earnings | 200 / 316 | Liquipedia publishes the top 500; below that (~$83k) there is no figure |
| Per-year earnings | 2018–2021 | 2022–2026 are rate-limited — re-run `npm run etl:fetch` to fill them in |
| Org history | 31 / 316 | Neither source publishes transfer history; only current orgs and the orgs named on LAN winner rows |
| **Placements other than 1st** | **none** | Neither source publishes full standings |
| **Prize money per event** | **none** | Both publish career totals, not payouts per placement |

The last two are the significant gaps. Everything in the dataset is a *winner*,
which is why:

- Tenaball's "A Specific Tournament" category hides itself — it needs ten
  ranked finishers at one event and there is one;
- Who Are Ya asks for three teammate clues rather than six — even a six-time
  champion only has eight distinct title-winning teammates.

Both fix themselves the moment standings are loaded. Nothing needs rewriting:
add rows to `entries.ts` with `placement: 2`, `3`, … and the pools grow.

---

## Adding data

Everything goes through `EventEntry`. To record that a roster finished 4th:

```ts
{ id: 'fncs-c6s3-eu-p4', eventId: 'fncs-c6s3-eu', placement: 4,
  playerIds: ['tjino', 'pablowingu', 'fredoxie'], org: 'Karmine Corp' },
```

Players referenced must exist in `players.ts`; events in `events.ts`. Since both
are generated, a new source belongs in the ETL — write a reader in
`scripts/etl/lib/`, merge it in `build-dataset.ts`, and the tables regenerate.

Event ids read as `fncs-<season>-<region>`, lowercase:

```
fncs-c6s3-eu              FNCS Major 3 2025, Europe
fncs-c2s2-nae-pc          FNCS Chapter 2 Season 2, NA East, PC bracket
fncs-global-2024          2024 FNCS Global Championship
fortnite-world-cup-solos  Fortnite World Cup 2019, solos
fncs-grand-royale-2021-br 2021 FNCS Grand Royale, Brazil
```

Events whose official name is not a standard seasonal final (the All-Star
Showdown, the Grand Royale) key off their name instead of their season, because
several events share one season key. The builder throws on an id collision
rather than silently merging two tournaments.

---

## Two failure modes worth knowing

The sources share no player id, so the import matches on handle. That fails in
two ways, and both are checked automatically:

**The same player, spelled differently.** Caught by `npm run audit` as
"*N titles but no earnings figure*". Fix it by adding a line to
`scripts/etl/aliases.ts`.

**Two different players, same handle.** There is an Australian *Speedy* and a
Bahraini *Speedy*; they are kept apart by country and rendered as `Speedy (AU)`
and `Speedy (BH)`. Where a wrong match slips through, the age guard in
`build-dataset.ts` catches it — a birthday that would make someone eleven at
their first title is dropped rather than published. It rejected two on the last
run.

---

## Rate limits

Liquipedia allows roughly one `action=parse` call per 30 seconds and applies a
long cooldown once you trip it. `etl:fetch` requests one page at a time, sends a
descriptive User-Agent as [their terms](https://liquipedia.net/api-terms-of-use)
require, and skips anything already cached — so a run that stops on a 429 can be
resumed by running it again later. Wikipedia has no such limit.

For bulk work (full standings for 220 tournaments, transfer histories) the
polite route is Liquipedia's [LPDB API](https://api.liquipedia.net/), which
needs a free API key. That is the natural home for the two missing fields above.

---

## Verifying a change

```bash
npm run audit
```

Plausibility of the import: impossible ages, handles matched to the wrong
person, near-identical names that are probably one player split in two,
entries whose roster size disagrees with the event format.

```bash
npm run check:data
```

Integrity and feasibility: every derived view is recomputed from the entries and
compared, every foreign key resolved, and each game asked for its own pool size.
It prints coverage, and reports disagreements *between* sources separately —
those are not ours to fix.

```bash
npm run check:games
```

Plays all ten games to completion headlessly. Run it after any data change: it
proves the generators can still build solvable Tic Tac Toe boards, clean
Connections groups and ten-slot Tenaball boards from whatever the data now says.


---

## The Liquipedia roster

Higher or Lower and Fortnitedle run on a separate, much larger dataset:
`liquipedia_data/clean_data/fortnite/players.json`, read **in place** through
the `@data` alias. There is no build step and no derived copy — edit that file
and reload.

Two columns in it are maintained upstream, by the notebook that owns the data:

| column | values | meaning |
| --- | --- | --- |
| `tier` | `easy` / `medium` / `hard` / `unused` | difficulty band; `unused` rows are dropped when the roster loads and never reach a game |
| `fncs_wins` | integer ≥ 0 | FNCS grand finals won, matched over from the Wikipedia import |

`tier` is opaque to the app. Nothing recomputes it and there is no fallback
ranking, so changing how it is calculated changes every game at once and
requires no code change.

### Why it is separate

The two datasets are not two versions of the same thing; they answer different
questions.

The Wikipedia import is **deep and narrow**: 316 players, but for each of them
who they placed with, where, and under which org. Career Path, Who Are Ya,
Connections and Tenaball cannot work without that, and `Dataset`'s
puzzle-eligibility rule is written around having it.

The Liquipedia dump is **wide and shallow**: 5,678 players with a handle, a
country, a birthday and a career earnings figure, and no per-event rows at all.
Higher or Lower never asks for more than that, and eighteen times the players
makes it a much better game — so it reads the dump directly through `Roster`
rather than being squeezed through a model built for careers.

### Inputs

Read-only, and untouched by the build:

```
liquipedia_data/clean_data/fortnite/
  players.json       5,726 pages — handle, real name, nationalities, region,
                     birthdate, career and per-year earnings, current team
  teams.json         535 organisations
  tournaments.json   14,645 tournaments with Liquipedia tier and prize pool
  placements.json    442,736 finishes; only 1st places are used
  transfers.json     40,119 roster moves (not used yet)
```

`liquipedia_data/` is gitignored **except** `players.json`, which is committed
so the site builds anywhere. It is 3.7 MB, 310 KB gzipped. `placements.json` at
154 MB stays ignored.

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
5. Carries **FNCS titles** over from the Wikipedia import by handle, with three
   hand-verified aliases for winners the two sources spell differently
   (Kalgamer710, Kiryache32, Speedy). Seven winners have no Liquipedia page at
   all; the build names them when it runs.

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

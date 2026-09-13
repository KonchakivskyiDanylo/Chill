# The data

The dataset is **imported, not authored**. Two sources are fetched, parsed and
written out as TypeScript; nothing is typed in by hand and nothing is invented
to fill a gap.

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

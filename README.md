# ChillFN — Fortnite esports puzzles

Ten browser puzzle games built around Fortnite competitive players. No accounts,
no backend, no monetisation — everything runs in the browser, on a dataset
imported from Wikipedia and Liquipedia.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run etl:fetch` | Downloads the upstream sources into `scripts/etl/.cache/` |
| `npm run etl:build` | Regenerates `src/data/fortnite/` from the cache |
| `npm run audit` | Checks the imported data for implausible values |
| `npm run check:data` | Asserts the dataset's invariants (see below) |
| `npm run check:games` | Drives all ten games through a full round headlessly |

**Where the data comes from and how to extend it: see [DATA.md](DATA.md).**

## The games

| Game | Modes | Notes |
| --- | --- | --- |
| Higher or Lower | Age / Career earnings × Easy / Hard | Endless, one mistake ends the run, best score in `localStorage` |
| Wordle | — | 6 guesses, digits are playable characters, any string of the right length is allowed |
| Career Path | Order / Random | Major results only, starts at the first major reached |
| Who Are Ya? | Easy / Hard / Random | Teammates, fewest shared tournaments first |
| Tenaball | Up to 5 categories × Easy / Hard | Each category states its own tie rule; categories the data cannot rank are hidden |
| List | Easy / Hard | 90s, +5s per correct answer, −3s per miss on Hard |
| Impostor | All at once / One by one | 6–8 players, 1–3 impostors |
| Tic Tac Toe | — | Generated boards, 3 mistakes |
| Connections | — | 16 players, 4 groups, 4 mistakes |
| Guess the Player | Exact / Direction | 5 attributes, 8 guesses |

## Architecture

Game logic is separated from UI throughout: each game has a pure `engine.ts`
(no React, no DOM) plus a component that renders it. That is what lets
`npm run check:games` play every game to completion in Node.

```
src/
  data/
    types.ts          Domain model (Player, TournamentEvent, ...)
    repository.ts     ← the one seam between games and the data source
    dataset.ts        Read-only query layer every game uses
    DataProvider.tsx  Loads the dataset once, provides it to the app
    fortnite/
      events.ts       GENERATED — 220 tournaments
      entries.ts      GENERATED — 220 rosters and where they placed
      players.ts      GENERATED — 316 players, verified facts only
      countries.ts    Country names and the fallback country -> region map
      build.ts        Derives results, teammates, titles and org history
  scripts/etl/        Fetches the sources and regenerates the three tables
  games/<game>/engine.ts + <Game>.tsx
  games/shared/criteria.ts   Player predicates shared by Impostor / Tic Tac Toe / Connections
  components/, lib/, styles/
```

### Replacing the data source

Games never import a data module. They receive a `Dataset` built from
whatever `PlayerRepository` returns:

```ts
class ApiPlayerRepository implements PlayerRepository {
  async getPlayers(): Promise<Player[]> { /* fetch Liquipedia / Tracker / your API */ }
  async getEvents(): Promise<TournamentEvent[]> { /* ... */ }
}
setRepository(new ApiPlayerRepository());
```

That is the whole migration path — no game code changes. Player headshots are
already modelled (`Player.photoUrl`); neither source publishes them, so the UI
falls back to a deterministic initials avatar.

## About the data

316 players, 220 tournaments and every FNCS winner in every region from Season X
(2019) to Major 2 of 2026, imported from Wikipedia and Liquipedia. Nothing is
estimated: where a source is silent the field stays empty, and `npm run
check:data` prints the coverage so the gaps are visible rather than papered over.

The model is relational — an `EventEntry` records a whole roster's finish at one
event, so teammates, title counts, org history and career results are all derived
from the same rows and cannot contradict each other.

The two real gaps are **placements other than 1st** and **prize money per
event**; neither source publishes them. Details, and how to load them, are in
[DATA.md](DATA.md).

## Edge cases

Generated puzzles are validated before they are shown, and the games degrade
gracefully rather than dead-ending:

- Tic Tac Toe boards are only offered if all nine cells can be filled with nine
  *different* players; during play, a move that would leave another cell
  unfillable is refused (and costs no mistake) instead of soft-locking.
- Connections draws each group from its *exclusive* pool, so groups cannot
  overlap and every intended group has one right answer.
- Tenaball skips any event whose 10th and 11th finishers share a placement, and
  a guess that ties the cut-off is called out rather than punished.
- Higher or Lower never repeats a player and ends with a win when the pool runs
  out; List and Tenaball resolve typed names tolerantly (case, spaces, accents,
  one typo when unambiguous).

## Not in V1

No leaderboards, no accounts, no daily puzzles, no monetisation. Best scores are
per-device via `localStorage`.

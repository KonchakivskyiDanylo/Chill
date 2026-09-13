# ChillFN — Fortnite esports puzzles

Ten browser puzzle games built around Fortnite competitive players. V1 prototype:
no accounts, no backend, no monetisation — everything runs in the browser on a
generated sample dataset.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run typecheck` | TypeScript only |
| `npm run audit` | Sanity-checks the hand-authored roster (run after editing data) |
| `npm run check:data` | Asserts the dataset's invariants (see below) |
| `npm run check:games` | Drives all ten games through a full round headlessly |

**Editing the player data: see [DATA.md](DATA.md).**

## The games

| Game | Modes | Notes |
| --- | --- | --- |
| Higher or Lower | Age / Career earnings × Easy / Hard | Endless, one mistake ends the run, best score in `localStorage` |
| Wordle | — | 6 guesses, digits are playable characters, any string of the right length is allowed |
| Career Path | Order / Random | Major results only, starts at the first major reached |
| Who Are Ya? | Easy / Hard / Random | Ten most-played tournament teammates |
| Tenaball | 5 categories × Easy / Hard | Each category states its own tie rule |
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
    sample/
      roster.ts       ~110 hand-authored player seeds
      tournaments.ts  Curated major-event catalogue
      build.ts        Expands seeds into a fully consistent dataset
  games/<game>/engine.ts + <Game>.tsx
  games/shared/criteria.ts   Player predicates shared by Impostor / Tic Tac Toe / Connections
  components/, lib/, styles/
```

### Replacing the sample data

Games never import the sample dataset. They receive a `Dataset` built from
whatever `PlayerRepository` returns:

```ts
class ApiPlayerRepository implements PlayerRepository {
  async getPlayers(): Promise<Player[]> { /* fetch Liquipedia / Tracker / your API */ }
  async getEvents(): Promise<TournamentEvent[]> { /* ... */ }
}
setRepository(new ApiPlayerRepository());
```

That is the whole migration path — no game code changes. Player headshots are
already modelled (`Player.photoUrl`); the sample data has none, so the UI falls
back to a deterministic initials avatar.

## About the sample data

`src/data/sample/roster.ts` holds ~110 prominent Fortnite competitive players,
inspired by Liquipedia's highest-earning list. **Figures are approximate
prototype data**, not a historical record — handles, nationalities, orgs and
rough earnings are realistic, but individual placements and dates are generated.

Only the compact seed is hand-written. `build.ts` derives everything else
deterministically, and `npm run check:data` asserts the invariants the games
rely on:

- every 1st place is authored, never generated, so a player's title count always
  matches what the roster says;
- placements are unique per player within an event, so "Top 10 at X" has one
  unambiguous answer;
- `earningsByYear` sums exactly to career `earnings`;
- teammate match counts are symmetric between both players.

Because generation is seeded, the dataset is identical on every load and device.

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

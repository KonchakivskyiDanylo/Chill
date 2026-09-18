# OffSpawn — competitive Fortnite puzzles

Ten browser puzzle games built around competitive Fortnite players. No accounts,
no backend, no monetisation — everything runs in the browser, on data imported
from Liquipedia and Wikipedia.

Player data comes from [Liquipedia](https://liquipedia.net/fortnite) and is
reused and modified under [CC-BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/);
FNCS title counts come from Wikipedia. The derived data files are shared under
the same licence — see [CREDITS.md](CREDITS.md).

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
| `npm run data:roster` | Rebuilds `src/data/liquipedia/roster.json` from the Liquipedia dump (Python) |

**Where the data comes from and how to extend it: see [DATA.md](DATA.md).**

## The games

| Game | Modes | Notes |
| --- | --- | --- |
| Higher or Lower | Age / Career earnings / FNCS wins × Easy / Medium / Hard | **Runs on the Liquipedia roster, not the shared dataset.** Endless, one mistake ends the run, best score in `localStorage`. Hard also adds the Equal button |
| Fortnitedle | Easy / Medium / Hard | Level is picked before the board and switchable on it (switching deals a new player). 6 guesses, digits are playable characters, any string of the right length is allowed |
| Career Path | Order / Random | Major results only, starts at the first major reached |
| Who Are Ya? | Easy / Hard / Random | Teammates, fewest shared tournaments first |
| Tenaball | Up to 5 categories × Easy / Hard | Each category's tie rule is stated on the board; categories the data cannot rank are hidden |
| List | Easy / Hard | 90s, +5s per correct answer, −3s per miss on Hard |
| Griefer | All at once / One by one | 6–8 players, 1–3 griefers |
| Piece Control | — | Generated boards, 3 mistakes |
| Connections | — | 16 players, 4 groups, 4 mistakes |
| Guess the Player | Exact / Direction | 5 attributes, 8 guesses |

Every game has a **Give up** button in its title bar while a round is running.
It is two-step — the first click arms it, the second reveals the answer — because
a single button next to "New game" is too easy to hit by accident, and in the
endless games it would throw away a streak. Each engine exposes a pure
`giveUp(state)` that ends the round and is a no-op once it has; `npm run
check:games` asserts both halves of that for all nine.

A game's folder name is its original name, not its current one: Fortnitedle
lives in `games/wordle/`, Griefer in `games/impostor/`, Piece Control in
`games/tic-tac-toe/`. `GameMeta.id` is likewise unchanged, because local best
scores hang off it — a rename touches `title` and `slug` only.

Easy / Medium / Hard means two different things in that table. In Higher or
Lower and Fortnitedle it is the **fame ranking** below — how well known the
players you are asked about are. Everywhere else it is the mechanical setting
that game always had (lives, time penalties, hidden counts), and has nothing to
do with fame.

### Two data sources

There are two, on purpose, and they answer different questions.

`src/data/fortnite/` is the **Wikipedia import**: 316 players with full career
histories — who placed where, alongside whom, under which org. Nine of the ten
games read it through `Dataset`, because they ask questions only a career
history can answer ("name the player from their results", "who did they win
with"). It is also the only source that publishes FNCS titles per player.

`src/data/liquipedia/roster.json` is the **Liquipedia dump**: 5,678 players with
a handle, a country, a birthday and a career earnings figure, and no per-event
rows at all. Higher or Lower reads it through `Roster`, because that game only
ever needs "who exists and what are they worth" — and eighteen times the roster
makes it a far better game. It carries FNCS titles too, matched over from the
Wikipedia import by handle.

Rebuild it with `npm run data:roster`
(`scripts/build_liquipedia_roster.py`). It reads `liquipedia_data/clean_data/`
read-only and writes exactly one file.

### The fame ranking

Both sources are tiered the same way. For the Wikipedia import,
`fame_calculation.ipynb` scores every player at 70% normalised log career
earnings and 30% tournament wins weighted by how big the tournament was — a
World Cup title is worth 100 points, an EU FNCS 30, a console cup 2 — so a
grinder cannot outrank a champion on prize money alone. It cuts the ranking by
rank, not by score: top 10% Easy, next 30% Medium, the rest Hard.

Run it from the repo root; it writes `src/data/fortnite/fame-ranking.json`,
which `repository.ts` imports, so re-running it after the dataset grows is all
it takes to re-tier everyone. `npm run check:games` fails if that file is
missing or does not cover the whole roster.

`build_liquipedia_roster.py` does the same job for the Liquipedia roster, with
the weights read off Liquipedia's own tournament tier and prize pool instead of
a hand-written table of events. Its cuts are tighter — top 2% Easy, next 18%
Medium — because at 10% an "easy" question reached players with $50k and no
title.

Games do not read the JSON. They ask for a pool:

```ts
dataset.playersFor('hard', { minimum: 2, eligible: (players) => eligible(players, 'age') })
```

`eligible` is the game's own filter, applied per tier, because whether a tier is
big enough is a question about the players a game can actually use — roughly
half the roster has too little recorded history to be a fair answer. If a tier
still comes up short, the next-closest tier is folded in rather than failing.

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
      fame-ranking.json  GENERATED by fame_calculation.ipynb — the Easy/Medium/Hard tiers
      build.ts        Derives results, teammates, titles and org history
    liquipedia/
      roster.json     GENERATED by scripts/build_liquipedia_roster.py — 5,678 players
      roster.ts       Query layer for it: hydration and the tier pools
      useRoster.ts    Loads it on mount, for the one game that needs it
  scripts/etl/        Fetches the sources and regenerates the three tables
  games/<game>/engine.ts + <Game>.tsx
  games/shared/criteria.ts   Player predicates shared by Griefer / Piece Control / Connections
  games/shared/difficulty.ts Fame tier labels, shared by Higher or Lower / Fortnitedle
  components/Footer.tsx      Site footer — carries the Liquipedia attribution
  pages/Credits.tsx          Long-form attribution, as CC-BY-SA asks for
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

- Piece Control boards are only offered if all nine cells can be filled with nine
  *different* players; during play, a move that would leave another cell
  unfillable is refused (and costs no mistake) instead of soft-locking.
- Connections draws each group from its *exclusive* pool, so groups cannot
  overlap and every intended group has one right answer.
- Tenaball skips any event whose 10th and 11th finishers share a placement, and
  a guess that ties the cut-off is called out rather than punished.
- Higher or Lower never repeats a player and ends with a win when the pool runs
  out; List and Tenaball resolve typed names tolerantly (case, spaces, accents,
  one typo when unambiguous).
- Tenaball never punishes a player who is level with 10th but ranked out by the
  tie rule: the guess is called out as a near miss and costs no life. The rule in
  force is printed above the ten slots, because it differs per category.

## Branding

The crown logo is loaded from `public/logo.png` — drop any crop of it there and
it appears in the header and as the favicon. Until the file exists the header
falls back to a plain `OS` mark rather than a broken image.

Social links live in `SOCIALS` at the top of `src/components/Footer.tsx`. An
entry with an empty `href` is skipped, so fill in the ones you have and the rest
stay hidden. There are no Terms or Privacy pages yet; add them as routes in
`App.tsx` and link them from the footer's `site-footer__links` nav.

## Not in V1

No leaderboards, no accounts, no daily puzzles, no monetisation. Best scores are
per-device via `localStorage`.

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
| `npm run check:games` | Drives all ten games through a full round headlessly. Career Path and Who Are Ya report SKIPPED until their generated files exist |

The `etl:*`, `audit` and `check:data` scripts are gone, along with the
316-player Wikipedia import they maintained. Every game reads the Liquipedia
export, and the derived files are built by the cells in
[notebook_cells.md](notebook_cells.md).

**Where the data comes from and how to extend it: see [DATA.md](DATA.md).**

## The games

| Game | Modes | Notes |
| --- | --- | --- |
| Higher or Lower | Age / Career earnings / FNCS wins | Endless, one mistake ends the run, best score in `localStorage`. Hard adds the Equal button. Pairs are chosen so the gap matches a target that narrows with difficulty *and* streak |
| Fortnitedle | — | 6 guesses, digits are playable characters. Nothing is given away before guess 3; then one digit after 3, a second after 4, the rest by 5 — and a revealed digit turns green on the keyboard |
| Career Path | Order / Random | 10 clues. Order tells the career as a story (first major, most recent, best of each stretch between); Random draws 10 at random from the whole career |
| Who Are Ya? | Counts shown / hidden / Random order | Ten clues drawn across up to fifty teammates, number one always among them, revealed fewest-shared first. Needs 3+ teammates and 5+ tournaments on record |
| Tenaball | ~290 categories × Easy / Hard | Boards answer in players, organisations, countries *or* tournaments. Each states its own tie rule. A tournament board is ten placements, so a duos slot wants both names |
| List | Easy / Hard | ~180 categories. 90s, +5s per correct answer, −3s per miss on Hard. Naming everyone ends the round as a win |
| Griefer | All at once / One by one | Ten cards, four to six of which **fit** the rule, and the board never says how many. Cards show the handle only |
| Tic Tac Toe | Easy / Hard | Type a player; the grid works out which cell they belong in. Easy allows 3 mistakes, Hard gives 9 guesses |
| Connections | — | 16 players, 4 overlapping groups with one valid split, 4 lives shown as hearts |
| Guess the Player | Exact / Direction | 6 attributes, 8 guesses |

Eight of the ten share a **setup step** (`components/PoolSetup`), and it opens
closed: Random, or Choose to narrow by region, difficulty and active/retired.
Tenaball and List pick a category instead, because that is their whole subject.

Above all of them sits the **event mode** (`games/shared/mode.ts`), chosen on
the home page and shown in the header. Pick a tournament and every game draws
only from that field until you leave it — the eight setup screens collapse to a
Start button, and Tenaball and List swap their categories for field-scoped ones
derived in the browser.

Fortnitedle, Career Path, Who Are Ya and Guess the Player deal their secret
player from a **no-repeat rotation** (`games/shared/rotation.ts`): the pool
empties before anyone comes round again, and the new cycle never opens with
whoever closed the last one. The cycle is keyed by everything that changes who
is in the bag (`poolScope`) and lives in `localStorage`, so it survives a
reload. (Higher or Lower already never repeats inside a run; the rest deal a
whole board rather than one player.)

Every game has a **Give up** button next to its guess controls while a round is
running — not in the title bar, where it sat beside "New game" and was too easy
to hit by accident. It is two-step: the first click arms it, the second reveals
the answer. Each engine exposes a pure `giveUp(state)` that ends the round and
is a no-op once it has.

A game's folder name is its original name, not its current one: Fortnitedle
lives in `games/wordle/`, Griefer in `games/impostor/`. `GameMeta.id` is
likewise unchanged, because local best scores hang off it — a rename touches
`title` and `slug` only. (Piece Control has been renamed back to Tic Tac Toe,
which is both its folder and its id.)

Easy / Medium / Hard means two different things across that table. In the
shared setup step it is the **fame ranking** below — how well known the players
you are asked about are, expressed on each card as the career-earnings band it
covers. Inside Tenaball, List and Tic Tac Toe it is that game's own mechanical
setting (lives, time penalties, guess budget) and has nothing to do with fame.
Who Are Ya calls its clue orders Counts shown / Counts hidden / Random order
for the same reason: it has a fame difficulty above them, and two Easys on one
screen meant two different things.

### One data source

All ten games read the **Liquipedia export** in
`liquipedia_data/clean_data/fortnite/`, in place, with no build step.

| file | rows | read by |
| --- | --- | --- |
| `players.json` | 5,678 playable | every game — identity, earnings, tier, FNCS wins |
| `career_path.json` | 188 majors, 1,175 players | Career Path |
| `teammates.json` | 39,038 pairs, 5,490 players, 50 kept each | Who Are Ya, List |
| `orgs.json` | 979 orgs | Griefer, Tic Tac Toe, Connections, Tenaball |
| `facts.json` | per-player career facts | Griefer, Tic Tac Toe, Connections, List, Who Are Ya |
| `rankings.json` | ~290 precomputed leaderboards, plus the event names the paydays boards are answered from | Tenaball |
| `pools.json` | event-qualified fields | every game's setup step |

All but `players.json` are **generated by the notebook** — see
`notebook_cells.md`. A file that has not been generated is simply absent:
`src/data/liquipedia/files.ts` reads the folder with `import.meta.glob`, so a
missing file is a value to branch on rather than a build error, and
`npm run check:games` reports the affected games as SKIPPED and stays green.

None of the derived files carries a `tier` column: difficulty is joined from
`players.json` by page name, so re-tiering the roster re-tiers every game and
the derived files cannot go stale against it.

The older **Wikipedia import** — 316 players in `src/data/fortnite/`, with the
`Dataset` / `PlayerRepository` layer and the ETL scripts that fed it — has been
removed. It had not been read by a game since the migration, and the four npm
scripts kept alive to validate it were validating a dataset nothing rendered.
The history is in git if any of it is ever wanted back.

**There is no build step.** The app imports that file in place, through the
`@data` alias. Two columns in it are maintained by the notebook that owns the
data rather than by any code here:

| column | values | meaning |
| --- | --- | --- |
| `tier` | `easy` / `medium` / `hard` / `unused` | difficulty band; `unused` rows never reach a game |
| `region_tier` | same, optional | difficulty band *within* `region` |
| `fncs_wins` | integer ≥ 0 | FNCS grand finals won |

`region_tier` exists because the global band cannot serve Fortnitedle's region
picker: `tier` ranks all 5,678 rows together, so Asia, Oceania and the Middle
East have no Easy players between them and "Asia + Easy" would quietly hand
back Medium. Ranked inside the region every region has all three. It is
optional — a roster exported before the column existed falls back to `tier` —
and a difficulty with nobody in it is greyed out with its count showing rather
than silently widened.

`tier` is **opaque to the app**: nothing recomputes it, nothing second-guesses
it, and there is no fallback ranking. Re-tier the roster by editing that column
and reloading — no code changes, nothing to regenerate.

### The fame ranking

`fame_calculation.ipynb` and the `fame-ranking.json` it produced belonged to the
Wikipedia import and went with it. The Liquipedia roster has never used them:
its difficulty is the `tier` / `region_tier` columns above, written upstream by
the notebook that owns `players.json`.

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
  data/liquipedia/
    roster.ts         Reads .../players.json in place, via the @data alias
    facts.ts          Career facts players.json cannot answer
    majors.ts         Reads .../career_path.json — Career Path's tournaments
    teammates.ts      Reads .../teammates.json — who has played with whom
    rankings.ts       The precomputed Tenaball boards
    pools.ts          Event-qualified fields — the event mode reads these
    orgs.ts           Organisations and who has played for them
    countries.ts      Liquipedia nationality names -> ISO country codes
    files.ts          The one place that knows how to read the export
    useLoaded.ts      The load-on-mount hook they all share
  games/<game>/engine.ts + <Game>.tsx
  games/shared/criteria.ts   Player predicates shared by Griefer / Tic Tac Toe / Connections
  games/shared/difficulty.ts Fame tier labels, shared by the pooled games
  games/shared/pool.ts       Region / difficulty / status, and Random vs Choose
  games/shared/mode.ts       The site-wide event mode
  games/shared/rotation.ts   Deals a pool out once before anyone repeats
  games/tenaball/board-builder.ts  Assembling a board from ranked rows
  games/tenaball/pool-boards.ts    Field boards, derived in the browser
  games/tenaball/derived-boards.ts All-time boards the notebook does not ship
  components/EventMode.tsx   The mode picker (home) and mode chip (header)
  components/SideNav.tsx     The games list down the left of every page
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

5,678 players, 14,645 tournaments and 442,736 placements, imported from
Liquipedia, with FNCS title counts matched in from Wikipedia. Nothing is
estimated: where a source is silent the field stays empty — a missing earnings
figure renders as a dash, never a zero — and a player with no published
birthday is left out of the questions that need one rather than guessed at.

Everything derived from it is derived in one place, the notebook, and read in
place by the app. `npm run check:games` plays all ten games to completion in
Node and asserts the invariants each one depends on. Details are in
[DATA.md](DATA.md).

## Edge cases

Generated puzzles are validated before they are shown, and the games degrade
gracefully rather than dead-ending:

- Tic Tac Toe boards are only offered if all nine cells can be filled with nine
  *different* players; during play, a move that would leave another cell
  unfillable is refused (and costs no mistake) instead of soft-locking.
- Connections lets its groups overlap — a player who fits two connections is
  the point of the game — and then proves the board has exactly one way to
  split into four connected fours before showing it. It also rejects a board
  where a connection that is *not* in play lands on exactly four players across
  different groups, which is the "four French names that are not a group" trap.
- Tenaball's tournament boards rank *placements*, so a duos or trios event puts
  the whole team in one slot and only fills it once every name is in. It skips
  an event where two teams share a place in the top eleven, where a player is
  listed twice in it, or where a finisher cannot be named from the roster.
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

The games list runs down the left of every page (`SideNav.tsx`). The header's
☰ collapses it: to an icon rail on a wide screen, and under 900px to a drawer
over the page with a backdrop. The wide-screen state is remembered; the drawer
always opens closed, so nobody lands on a covered page.

Social links live in `SOCIALS` at the top of `src/components/Footer.tsx`. An
entry with an empty `href` is skipped, so fill in the ones you have and the rest
stay hidden. There are no Terms or Privacy pages yet; add them as routes in
`App.tsx` and link them from the footer's `site-footer__links` nav.

## Not in V1

No leaderboards, no accounts, no daily puzzles, no monetisation. Best scores are
per-device via `localStorage`.

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
| `npm run check:games` | Drives all ten games through a full round headlessly. Career Path and Who Are Ya report SKIPPED until their generated files exist |

**Where the data comes from and how to extend it: see [DATA.md](DATA.md).**

## The games

| Game | Modes | Notes |
| --- | --- | --- |
| Higher or Lower | Age / Career earnings / FNCS wins | Endless, one mistake ends the run, best score in `localStorage`. Hard adds the Equal button. Pairs are chosen so the gap matches a target that narrows with difficulty *and* streak |
| Fortnitedle | — | 6 guesses, digits are playable characters. A name's digits are revealed on a schedule: one after guess 3, two after 2 and 4, three after 1, 3 and 4 |
| Career Path | Order / Random | 10 clues. Order tells the career as a story (first major, most recent, best of each stretch between); Random draws 10 at random from the whole career |
| Who Are Ya? | Counts shown / hidden / Random order | Teammates fewest-shared first. Needs 3+ teammates and 5+ tournaments on record |
| Tenaball | ~250 categories × Easy / Hard | Boards answer in players, organisations *or* countries. Each states its own tie rule |
| List | Easy / Hard | 90s, +5s per correct answer, −3s per miss on Hard |
| Griefer | All at once / One by one | Find the 2–3 players who **fit** the rule among 6–8. Cards show the handle only |
| Tic Tac Toe | Easy / Hard | Type a player; the grid works out which cell they belong in. Easy allows 3 mistakes, Hard gives 9 guesses |
| Connections | — | 16 players, 4 groups, 4 lives shown as hearts |
| Guess the Player | Exact / Direction | 6 attributes, 8 guesses |

Eight of the ten share a **setup step** (`components/PoolSetup`): an event pool
*or* the roster narrowed by region, difficulty and active/retired, then Start.
Tenaball and List pick a category instead, because that is their whole subject.

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
| `teammates.json` | 39,038 pairs, 5,496 players | Who Are Ya, Connections |
| `orgs.json` | 979 orgs | Griefer, Tic Tac Toe, Connections, Tenaball |
| `facts.json` | per-player career facts | Griefer, Tic Tac Toe, Connections, List, Who Are Ya |
| `rankings.json` | ~250 precomputed leaderboards | Tenaball |
| `pools.json` | event-qualified fields | every game's setup step |

All but `players.json` are **generated by the notebook** — see
`notebook_cells.md`. A file that has not been generated is simply absent:
`src/data/liquipedia/files.ts` reads the folder with `import.meta.glob`, so a
missing file is a value to branch on rather than a build error, and
`npm run check:games` reports the affected games as SKIPPED and stays green.

None of the derived files carries a `tier` column: difficulty is joined from
`players.json` by page name, so re-tiering the roster re-tiers every game and
the derived files cannot go stale against it.

`src/data/fortnite/` — the older **Wikipedia import**, 316 players — is still
in the tree and is no longer read by anything. It is kept deliberately: it is
the only source with hand-checked per-event rosters, and the `Dataset` /
`PlayerRepository` layer around it still documents how a different backend
would plug in.

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

The Liquipedia roster does not use it. Its tiers are the `tier` column, written
upstream — see above.

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
      roster.ts       Reads .../players.json in place, via the @data alias
      majors.ts       Reads .../career_path.json — Career Path's tournaments
      teammates.ts    Reads .../teammates.json — who has played with whom
      countries.ts    Liquipedia nationality names -> ISO country codes
      useLoaded.ts    The load-on-mount hook the three share
  scripts/etl/        Fetches the sources and regenerates the three tables
  games/<game>/engine.ts + <Game>.tsx
  games/shared/criteria.ts   Player predicates shared by Griefer / Piece Control / Connections
  games/shared/difficulty.ts Fame tier labels, shared by the four Liquipedia games
  games/shared/rotation.ts   Deals a pool out once before anyone repeats
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

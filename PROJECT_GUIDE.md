# OffSpawn — the whole project

As of 26 September 2026: every game and how it chooses its players, the data, the server, the tests, the limited-mode plan and what to decide next. See also [README.md](README.md), [DATA.md](DATA.md) and [LIMITED_MODE.md](LIMITED_MODE.md).

## What OffSpawn is

OffSpawn is ten browser puzzle games about competitive Fortnite players. They are built on a Liquipedia export of 5,678 players, 14,645 tournaments and 442,736 placements.

The site is React, Vite and TypeScript. Every game splits in two: a pure `engine.ts` with the rules and no React, and a component that draws it. That split is what lets a script play every game to the end in Node.

| Game | What you do | Folder |
| --- | --- | --- |
| Higher or Lower | Say whether the next player's number is higher or lower. Endless; one mistake ends the run | `higher-lower` |
| Fortnitedle | Guess a player's handle in six tries, Wordle-style | `wordle` |
| Career Path | Name the player from ten of their major results | `career-path` |
| Who Are Ya? | Name the player from the teammates they played with | `who-are-ya` |
| Tenaball | Name all ten entries on a top-10 board | `tenaball` |
| List | Name as many answers to a list as you can in 90 seconds | `list` |
| Griefer | Pick the four to six of ten players who fit a rule | `impostor` |
| Tic Tac Toe | Fill a 3×3 grid where every cell is a row rule and a column rule | `tic-tac-toe` |
| Connections | Sort 16 players into four groups of four | `connections` |
| Guess the Player | Close in on a secret player attribute by attribute, eight guesses | `guess-the-player` |

**Hidden for now (26 Sep 2026): Guess the Player, Connections and Griefer.** A `hidden` flag in the registry takes a game off the home page and the side nav, and the live site sends its address home. A dev server still opens it by URL, and `check:games` still plays it. Guess the Player needs more than it has. Of the three rule-grid games only one is kept, Tic Tac Toe: every board builds at every level and none repeats over 200 deals. Its Easy level is the thin one, with 30 distinct rules, and "won the EU FNCS" and "$1M+ earner" each sit on 41% of Easy boards. Delete the flag to bring a game back.

Two folders keep old names: Fortnitedle lives in `wordle` and Griefer in `impostor`. The ids stay unchanged because best scores are stored under them.

How it runs:

- **Locally:** `npm run dev:all` starts the site on port 5173 and the API on port 3000. The analytics page opens without a password, and rounds you play are recorded to `server/.data` on your machine.
- **In production:** Heroku is planned, not live yet. `npm start` serves the built site and the API from one Node process, stores records in Postgres, and puts `#/analytics` behind `ADMIN_PASSWORD`.
- **No accounts yet.** Best scores live in each browser's local storage.

## The data

Every game reads one Liquipedia export in `liquipedia_data/clean_data/fortnite/`, in place, with no build step. The files derived from it are written by the notebook cells in `notebook_cells.md`, which you run; the code never writes that folder.

| File | Holds | Written by | Read by |
| --- | --- | --- | --- |
| `players.json` | 5,678 playable rows: handle, aliases, nationalities, region, birthday, career and per-year earnings, status, FNCS wins, fame tier | the upstream notebook | every game |
| `tournaments.json`, `placements.json` | 14,645 tournaments and 442,736 placements (154 MB) | the export | the notebook only |
| `career_path.json` | 187 majors and every player's finishes in them: 1,175 with five or more, 3,348 in all once cell 7 has run | cell 7 | Career Path |
| `teammates.json` | each player's 50 most frequent teammates | cell 6 | Who Are Ya, List |
| `orgs.json` | 979 organisations, with current and past players | the export | Griefer, Tic Tac Toe, Connections, Tenaball, List |
| `facts.json` | per player: tournaments played, LAN and FNCS appearances, wins by kind, which headline events they played | notebook appendix | the criteria games, List, Tenaball's field boards, FNCS Finals, the glossary |
| `rankings.json` | 375 precomputed Tenaball boards (284 until cells 2–4 are re-run), plus the tournament names the paydays boards answer from | cells 2–4 | Tenaball |
| `pools.json` | event fields; today one, the FNCS 2026 Globals with 101 players | cell 5 | event mode |

Three rules keep this safe:

- **Data changes go through a cell.** A cell is proved against the real dump, with every write sent to a scratch folder, before you run it.
- **Old and new shapes both read.** The TypeScript reads the current file shape and any new one, so nothing breaks before you re-run.
- **A missing file is not a crash.** A generated file that is absent is simply skipped: its games show a "has it been generated?" note, and the test suite reports them as skipped.

Fame is decided upstream. `tier` (easy, medium, hard or unused) and `region_tier` are columns in `players.json`. The app never recomputes them, so re-tiering the roster re-tiers every game at once.

### What the words mean

| Term | Meaning here |
| --- | --- |
| Major | An Epic-run main event that Liquipedia rates tier 1, from the 2019 World Cup on. Console, mobile, Twitch and challenge events are excluded, so MrBeast's Extreme Survival Challenge is not a major. 187 events, 178 of them regional FNCS grand finals |
| LAN | A major played offline: 9 events (the two World Cup finals, the 2022 Invitational, the Globals 2023–26, the 2026 Summit, the Reload Elite Series Championship). The "LAN wins" board alone widens it to any offline tier 1–2 event, so DreamHack, Gamers8 and the Esports World Cup count there |
| Global Championship | The 2019 World Cup finals and the FNCS Globals 2023–26 |
| FNCS win | A regional FNCS grand final won, by Wikipedia's count. The Globals, the Invitational and the Summit are not FNCS wins |
| FNCS finals played | Every FNCS-branded major reached, the Globals, Invitational and Summit included. The 2026 Globals already counts for its qualifiers, because the dump lists entrants before the event |
| Nationality | The first one on the Liquipedia page. 487 players list two or more. England, Scotland and Wales count as their own nations when listed first |
| Region | Where a player competes, one of six: Europe, North America (Central and West together), South America (Brazil), Asia, Oceania, Middle East |
| Earnings | Individual prize money in US dollars, as a career total and per calendar year (2018–2026) |

## Shared machinery

Six pieces are shared across the games:

- how a game chooses its pool
- how it deals a secret player without repeats
- the event mode
- the rules the criteria games draw from
- the definitions
- the Give up button

### Choosing who you get asked about

| Setup | Games | What it offers |
| --- | --- | --- |
| Pool setup | Fortnitedle, Career Path, Who Are Ya, Griefer, Connections, Guess the Player | **Random** (the default), or **Choose** by region and fame tier. The choice is remembered across games. The active-or-retired choice is hidden for now; `SHOW_STATUS` in `pool.ts` brings it back |
| Level setup | Higher or Lower, Tic Tac Toe | One Easy / Medium / Hard that sets both who is asked about and how hard the game presses |
| Category picker | Tenaball, List | The category is the whole subject, so you pick a board or a list |

Fame tiers come from `players.json`:

- **Region fame.** Choosing a region switches to `region_tier`, so Easy means "well known in Asia", not worldwide.
- **Short tiers widen.** A game passes its own eligibility filter, and a tier that comes up short folds in the next-closest one rather than failing.

**Random leans towards names you know.** An even draw over everyone eligible was 70–80% Hard-tier players. So Random picks the tier first:

- **The mix.** Half Easy, a third Medium, the rest Hard (`RANDOM_MIX`, 50/35/15).
- **Who uses it.** The four secret-player games deal every round this way. Connections applies the same mix to each group.

### Dealing without repeats

Fortnitedle, Career Path, Who Are Ya and Guess the Player deal their secret player from a bag, not a die (`rotation.ts`):

- **No repeats.** Everyone comes out once before anyone comes round again.
- **No back-to-back across a refill.** A new cycle never opens with the player who closed the last one.
- **It survives a reload.** The bag is stored in the browser, keyed by everything that changes who is in it.

### Event mode

On the home page you can swap the whole scene for one tournament's field; today that is the FNCS 2026 Globals, 101 players. Every game then draws from that field only, until you leave it from the header.

- **Setup collapses.** The setup screens become a Start button.
- **Field categories.** Tenaball and List swap to boards and lists built from the field in the browser, under one heading, in a planned order.
- **Regions in turn for the secret-player games.** Taking regions in turn (`dealInTurn`) puts every region on screen every six rounds. Europe sent 46 players and the Middle East 4, so an even draw almost never reached the small regions.
- **Region lean in Higher or Lower.** The next player leans towards the region the run has shown least: 4.8 regions in the first 12 rounds instead of 3.2.
- **The whole field, not the roster's minimums.** A qualifier is never left out for falling short of a bar the roster uses. Career Path takes anyone in the field with a major and Who Are Ya anyone with a teammate; either gives a short hand five guesses. Guess the Player takes the players with no birthday, and their Age column goes grey. Griefer, Connections and Tic Tac Toe drop their three-major minimum. At the 2026 Globals every secret-player game deals all 101 (Career Path once cell 7 has run). Only Higher or Lower's Age leaves out the 11 with no birthday, because there is nothing to compare.
- **Not in How to play.** Event mode is not described in any game's rules. Limited mode will get rules of its own.

### Criteria: the rules Griefer, Tic Tac Toe and Connections use

`criteria.ts` builds one list of player rules from the pool, each carrying the players who fit it:

- **Where from:** country and region
- **Who for:** has played for one of the ten richest organisations
- **What won:** FNCS winner, 2+ or 3+ FNCS wins, Global, LAN or major winner, won a region's FNCS, won an FNCS in a given year
- **What earned:** $100K, $250K, $500K or $1M+ career earnings
- **Where played:** at a named Globals or LAN
- **The rest:** age (under 18, 20+) and active or retired

No two rules on one board may be nearly the same: if 90% of one fits inside the other, they do not go together (`NEAR_NESTED`). That is what stops "has won a major" (164 of 165 are FNCS winners) sharing a board with "has won an FNCS".

### Definitions and Give up

- **Definitions.** Every game's "How to play" ends with "What the words mean". Majors, LANs and Globals can list the exact events they cover. Every Tenaball board and List prompt has a "What counts here" fold for the words in its own title.
- **Give up.** Every game has a two-step Give up beside its controls: one click arms it, a second reveals the answer.

## Higher or Lower

Two dials run every round of this endless game. **Who** can appear widens round by round from the top earners down. **How close** the two values are tightens on a schedule. The answer is drawn before the player, so it cannot be read off the last one.

**The known player never changes places.** The revealed player slides across to become the known one, nobody is shown twice in a run, and one mistake ends it. Running out of players ends the run as a win ("cleared").

| Category | Who is eligible | Unit of the gap |
| --- | --- | --- |
| Age | a published birthday | whole years |
| Career Earnings | earnings on record above $0 | share of the bigger figure |
| FNCS Wins | everyone, noughts included | titles |
| FNCS Finals | at least one final (3,316 players) | whole finals |

### Who can appear: the fame window

The pool is ranked by career earnings for every category, because what makes a pair obvious is knowing who the two players are. Round one is two of the top 20, and the window then grows each round:

| Level | Grows per round | Stops at |
| --- | --- | --- |
| Easy | +10 | top 250 |
| Medium | +30 | top 1,000 |
| Hard | +60 | everyone |

### How close: the schedule

Four rounds per step; the last step repeats forever.

| Level | Steps |
| --- | --- |
| Easy | obvious, obvious, moderate, moderate, close, very close |
| Medium | obvious, moderate, moderate, close, very close, very close |
| Hard | obvious, moderate, close, very close, very close, very close |

| Closeness | Earnings | Age | FNCS Wins | FNCS Finals |
| --- | --- | --- | --- | --- |
| Obvious | 50%+ apart | 6+ years | 3+ titles | 8+ finals |
| Moderate | 25–50% | 3–5 | 2 | 4–7 |
| Close | 10–25% | 2 | 1 | 2–3 |
| Very close | under 10% | 0–1 | 0–1 | 0–1 |

### How the next player is picked

1. **Candidates.** Take the unused players inside this round's window. If none are left, widen to the level's cap, and if that is empty too the run is cleared.
2. **In the band.** Keep those whose gap lands in the scheduled band. If nobody does, take one of the three nearest misses.
3. **The answer comes first.** Higher and Lower are an even draw, with two exceptions:
   - **Edge of the roster.** On Age and Earnings, if one side is down to its last few players, the draw follows the players back towards the middle.
   - **Equal on Hard.** Equal comes up about one round in five. When a direction is impossible (a shown 0 cannot go lower), Equal is an even draw against the other.
4. **Look ahead.** Within that answer, prefer a player whose own round next time will still have two possible answers. It samples 24 candidates.
5. **Event mode.** Prefer the region the run has shown least.

Why the answer comes first: the old random draw leaked it. On Hard FNCS Wins, 93% of answers flipped direction and a shown 0 always went higher. Guessing from the shown number alone won about 90% of the time; now it wins about half.

| Guessing from the shown number alone | Before | Now |
| --- | --- | --- |
| FNCS Wins, Hard | 90% | 48% |
| FNCS Wins, Easy / Medium | 88% / 91% | 67% / 65% |
| Age, Easy | 75% | 66% |
| Earnings, Hard | 55% | 54% |
| FNCS Finals, Easy / Medium / Hard | new | 61% / 59% / 50% |

### Ties

- **Easy and Medium** are never dealt two equal numbers.
- **Hard** deals ties, and only Equal is right. Two players with no FNCS wins count as level and can come up in any round: the question "has this player ever won one?".
- **Career earnings** are never dealt level.

Known gap: on Easy and Medium a shown 0 in FNCS Wins is still a free Higher, because those levels have no Equal button. That is about 13–20% of FNCS rounds.

## Fortnitedle

Wordle on a player's handle: six guesses, and every tile turns green (right place), yellow (elsewhere in the name) or grey (not in it).

**Handles are normalised** before anything is compared:

- **Stripped.** Spaces and punctuation go, and case does not matter.
- **Digits count.** They are characters and have keys of their own.
- **Any string goes.** A guess must be the answer's length but need not be a real player.
- **Repeated letters score like Wordle.** Greens are taken first, then yellows from what is left, so a second copy of a letter the name has once is grey.

**Who can be the answer:** 5,585 handles. After normalising, a handle must be 3–12 characters and use at least two different characters. Anything with a parenthesis is out, because "Nate (NA player)" would become the twelve-tile NATENAPLAYER.

**Digits are handed out, because nobody can reason their way to one.** A letter tile tells you something every round; a digit tells you nothing until you happen to try it. 328 answers contain a digit.

They come out from guess 3, one per guess, all of them by guess 5. How much each one gives away depends on the round's difficulty:

| Difficulty | A digit's turn shows |
| --- | --- |
| Easy | the digit, in place under the grid, and its key turns green |
| Medium | a # where it sits, not which digit; the keyboard stays as it was |
| Hard | nothing |

It follows the difficulty chosen on Choose. Random, Choose → Any and event mode have no chosen difficulty, so they give nothing, like Hard. Before the first digit lands the strip is not shown at all, because a row of blanks would give away that the name has a digit.

**The secret is dealt** from the no-repeat bag with the Random mix, or region by region in event mode.

## Career Path

You name a secret player from their results at majors, revealed one at a time: up to ten clues, each a tournament and where they finished.

- **Clues and guesses.** A wrong guess reveals the next clue, and running out of clues loses. The score is how many clues you needed.
- **Who can be the answer:** 1,175 players with at least five majors on record. In event mode it is anyone in the field with a major at all: all 101 at the 2026 Globals once cell 7 has run, against 79 before.
- **Five guesses at least.** A career shorter than five majors still gets five guesses (`MIN_GUESSES`). The ones after its last clue reveal nothing new.
- **Modes.** Order reads the ten oldest first, as a career arc. Random shows the same kind of ten in no order.

### How the ten are chosen

The clues are picked one at a time. Each unused result is scored on what it would add to the list so far:

| Factor | Rewards |
| --- | --- |
| Event | a recognisable stage: a Globals or the World Cup over a $65K regional final, on the prize pool's log scale |
| Mix | a finish band the list lacks yet (win, podium, top 10, top 25, the rest), with a penalty for repeating a placement |
| Spread | distance in time from clues already picked: heavy in Order, light in Random |
| Unique | ruling out someone else the list still describes, such as a duo partner |
| Noise | a little, so meeting the same player twice is a different round |

**Fame changes the weights.** Famous players get more mix and less big-event weight; the deep cuts get the reverse, because their biggest stage is the only thing anyone knows them by.

**Two rules sit on top of the scores:**

- **One player only.** If the chosen clues still fit someone else, the weakest is swapped for a result that player did not share. Thirteen careers cannot be split, because every major was played beside the same partner. There, naming the partner costs one clue.
- **The opening does not give it away.** A signature result (any major win, or a podium at a $1M+ event) never appears in the first three clues for household names, or the first two for regulars. The deep cuts get theirs early.

**Short careers are shown whole.** A career of ten majors or fewer has nothing to choose from, so all of it is shown. In Order that reads oldest first whatever it opens on.

**After the round** the rest of the ten turn face up, dimmed, so you can see what was coming next.

## Who Are Ya?

You name a secret player from the people they have played tournaments with, revealed one at a time. You may guess after every clue, and the round ends on a correct guess or when the clues run out.

**Teammates are counted from every tournament on record.** Two players are teammates at a tournament when they share one result, such as a duo or trio. A pair's count is the number of tournaments entered together; two solo players at the same event are not teammates. `teammates.json` keeps each player's 50 most frequent.

**A clue is a teammate with 3+ shared tournaments** (`MIN_SHARED`). Before that, 44–48% of clues were pickup partners from one or two cash cups.

**Who can be the answer:** 1,165 players with at least three such teammates and five majors on record (`facts.json`'s `apps`, which the code calls `MIN_TOURNAMENTS`). In event mode, anyone in the field with a teammate; a hand shorter than five gets five guesses.

### How the ten clues are drawn

The hand always holds the number one teammate, usually the duo partner and the fact that makes the chain solvable. The other nine are drawn one from each slice of the rest of the list (teammates with 3+ shared tournaments only). For a long list a hand looks like teammates 1, 3, 9, 14, 19, 25, 30, 36, 41 and 47.

That spread means you are never dealt the ten weakest, and meeting the same player twice gives a different hand. The old version always showed the top ten in the same order.

### Clue order

| Mode | Order | Counts shown |
| --- | --- | --- |
| Counts shown | fewest shared tournaments first, the partner last | yes |
| Counts hidden | the same order | no |
| Random order | shuffled, but the number one teammate is never in the first four (`TOP_HELD_BACK`) | no |

A plain shuffle dealt the duo partner first one round in ten, which ended a known player's round on clue one. Teammates on the same count can come out in either order; the count is the clue, not the position. After the round the whole list turns face up, dimmed, with the counts.

## Tenaball

You get one top-10 board and ten empty slots, and name the ten. A correct answer locks into its real position, so the board fills from wherever you know it.

- **Easy:** unlimited guesses.
- **Hard:** three lives, and every wrong guess costs one.

**Typing is forgiving.** Names resolve regardless of case, spaces and accents, and one typo is accepted when the match is unambiguous. The guess box always searches the whole population, never just the ten answers, because a dropdown of the answers would solve the board for you.

### The boards

375 boards come precomputed from the notebook (`rankings.json`), because they are aggregated from 442,736 placements. Eleven more are built in the browser from the roster.

| Group | Boards | Answered with |
| --- | --- | --- |
| By country | 76 | players from one country |
| By region | 59 | players from one region |
| Teammates | 59 | a player's most frequent teammates |
| Players | 31 | players: earnings, FNCS wins, LANs, majors and more |
| Countries | 20 | country names |
| Paydays | 20 | the tournament where the money was won |
| Organisations | 11 | organisation names |
| FNCS finals — North America | 44 | an FNCS grand final's top ten placements: every NA final |
| FNCS finals — Europe | 26 | every EU final |
| FNCS finals — other regions | 21 | the other regions' 2025 and 2026 finals and the 2021 Grand Royale |
| Tournaments | 8 | a LAN's top ten placements |

Seven FNCS finals are left out by the rules below: a finisher the roster cannot name, a shared place in the top eleven, or a player listed twice.

### Ties

Every board prints its own tie rule above the slots:

- **Counts.** Wins, appearances and players are split by career earnings, the bigger earner higher. Countries and organisations are split by their players' combined earnings.
- **Money boards** are straight money order.
- **Youngest and oldest** go by birth date, not age in years.
- **Never the alphabet.** If 10th and 11th are still level after the tie rule, the board is not offered at all.
- **Near miss.** Naming someone level with 10th but ranked out by the tie rule is called out and never costs a life.

### Tournament boards

A tournament board ranks placements, so on a duos or trios event one slot is a whole team. It fills as you name its players and locks once all of them are in. An event is skipped if two teams share a place in the top eleven, a player is listed twice, or a finisher has no roster entry.

### Event-mode boards

For a field, the shipped boards are replaced by 14 built on the spot, under one heading, in the order planned for the limited mode:

1. career earnings
2. youngest
3. lowest career earners
4. FNCS wins
5. Europe by earnings
6. countries by players
7. earnings this year
8. oldest
9. organisations by players
10. North America by earnings
11. LAN appearances
12. FNCS grand finals played
13. tournaments played
14. countries by career earnings

Boards that need the event's results come later; see Limited mode.

## List

You get one list and 90 seconds to name as many of it as you can. Every correct name adds 5 seconds, so a good run keeps extending itself.

- **Levels.** On Easy a wrong name costs nothing; on Hard it takes 3 seconds off.
- **Finishing.** Naming everyone ends the round as a win on the spot. A repeated name does not count again.
- **Missed names.** When time runs out you see everyone you missed.
- **The suggestion box** helps you spell a name you already thought of, and never says whether it is on the list.

**The lists are hand-picked, not generated.** A recall game only works when you can picture the answer set, so there are 183 all-time lists with at least 8 answers each:

| Family | Lists | Example |
| --- | --- | --- |
| Organisations | 52 | has played for FaZe Clan (anyone, at any point) |
| Two events at once | 45 | at both the 2023 and 2024 Globals; played every Globals; two FNCS finals in a row |
| Earnings | 19 | $1M+ career; $200K+ in 2021; $500K+ in a single year |
| Teammates | 19 | 10+ tournaments with one of the 30 top earners |
| By country | 25 | French FNCS winners; countries with a player over $1M |
| FNCS | 13 | FNCS winners by region; 20+ grand finals; won back to back |
| Year by year | 8 | won a major in 2023 |
| Titles and fields | 2 | LAN winners; qualified for a field |

Lists answered with countries or organisations search every name, not just the answers.

### Event-mode lists

A field gets 20 lists, in the order planned for the limited mode. Field lists may be as short as 4 answers, because "name the four from the Middle East" is a fine round:

1. qualifiers from Europe, North America, South America, the Middle East, and Asia or Oceania
2. who won an FNCS this year
3. organisations with a player there
4. countries with a player there
5. who has won an FNCS
6. who also played each of the last three LANs
7. who earned $50K+ or $100K+ this year
8. who has $500K+ or $1M+ career earnings
9. then everyone who qualified, the well-represented countries, LAN winners, never won an FNCS, and retired

There are no ties in a list: it has no order, so everyone who fits counts.

## Griefer

You get a rule, such as "has played for NRG" or "has won a LAN", and ten cards in two rows of five. Four to six of them fit, and the board never says how many; the rest are griefers.

**Cards show the handle and nothing else.** With a flag on the card, "competes in Brazil" was solved by looking, not knowing. The count stays hidden because a stated count turns the last pick into arithmetic.

### How a board is built

1. **The rules.** Build the criteria for the chosen pool, keeping those with 4+ players and under 40% of the pool. Twelve kinds are used: country, region, organisation, FNCS winner, Global, LAN and major winner, 2+/3+ FNCS wins, earnings, won a region's FNCS, won an FNCS in a year, played at a named event.
2. **One seat per kind.** Draw one rule per kind, then shuffle. A flat draw was an organisation generator: about 174 of 250 rules were organisations, so "has played for X" came up seven times in ten.
3. **The ten cards.** Pick 4–6 players who fit (never more than the rule has) and fill the ten with players from the same pool who do not fit.

The griefers are random outsiders, not near-misses. That is a possible improvement: see the last section.

### Modes

| Mode | How you play | Ends |
| --- | --- | --- |
| All at once | select everyone you think fits, then Check | the selection must be exactly right |
| One by one | tap a card, then confirm it | a correct pick continues; a griefer ends the round |

The confirm step exists because a mis-tap on a phone used to end the round outright.

**The dashboard counts misreadings.** Analytics record every card and whether it was picked, so the dashboard shows which rules and which players get misread.

## Tic Tac Toe

A 3×3 grid has a rule on each row and each column; every cell needs one player who fits both. You don't pick the cell: you type a player and the grid works out where they go. Each player can be used once.

| Level | The board is built so every cell has | Mistakes allowed |
| --- | --- | --- |
| Easy | 3+ household names (Easy tier) | 3 |
| Medium | 2+ regulars | 3 |
| Hard | at least one player from anywhere on record | none: 9 guesses, one per cell |

At every level any player who fits is accepted. The level decides what the board is built around, not who you may type.

### How a board is built

1. **Rows first.** Choose three row rules from the criteria.
2. **Columns second.** Choose the three columns only from rules that already share a player with all three rows. Picking six rules at random failed 36 times in 40, because 138 of the 276 rules are organisations and two organisations almost never share a player.
3. **Enough answers.** Check each cell has the answers its level promises, from that level's fame band.
4. **Varied rules.** No more than two rules of the same kind, and no two rules nearly the same (the 90% rule).
5. **Nine different players.** Prove, by a quick backtracking search, that the nine cells can be filled with nine different players. Otherwise the "each player once" rule could make a board unwinnable.

### Where a typed player lands

The grid only offers a cell that leaves every other empty cell still fillable with players not yet used, so a move can never soft-lock the board.

| Safe cells for this player | What happens |
| --- | --- |
| none (fits no open cell) | rejected; a mistake on Easy and Medium |
| exactly one | placed there automatically |
| several | highlighted, and you tap one |

A player who fits always has at least one safe cell, by construction. If you lose, each empty cell shows three answers you could have used: its biggest earners, since those are the ones you should have known.

## Connections

Sixteen players, four hidden groups of four: select four and submit. You have four lives, shown as hearts. A wrong guess with three of the four right says so; anything less says nothing, because two-of-four happens by chance on most guesses.

**Each group's rule fits exactly its own four players.** Five Poles may sit on a board where Poland is not a group; they may not when it is. The old design let players fit two groups on purpose, and every board it made had a rule covering five or more of the sixteen.

**Group kinds** are deliberately short, the things anyone can hold in their head about a handle:

- country and region
- organisation
- FNCS winner, 2+/3+ FNCS wins, LAN winner, major winner
- an earnings threshold

Birth year came off the list because nobody can tell a 2005 from a 2006 across four handles.

### How a board is built

1. **Kinds.** Draw four different kinds, then one rule of each. Every fourth draw is a free draw instead, so France and Brazil can both be groups.
2. **Families.** At most two rules from one family, and no two rules nearly the same (the 90% rule). The families are where-from (country, region) and titles (the four title kinds).
3. **Twenty tries.** Keep the drawn kinds for 20 attempts before redrawing, so kinds that are harder to deal still get boards.
4. **Deal.** The scarcest rule first: each group's four come only from players who fit none of the other three rules.
5. **Fame mix on Random.** Each group gets two household names, one regular, and a regular or a deep cut, falling back to the nearest tier the pool has.
6. **Balance.** The groups' players must sit at comparable earnings ranks. An earnings group sits out, because it is the richest four on the board by definition.
7. **Decoys.** Reject the board if a rule that is not in play lands on exactly four players across different groups: four French names when France is not a group.
8. **Give up.** After 1,500 attempts, say the pool is too thin.

| Pool | Boards built | Tiles by tier |
| --- | --- | --- |
| Random | 20 of 20 (was 16) | 41% Easy, 50% Medium, 9% Hard |
| One tier, e.g. Medium | 40 of 40 | that tier |
| FNCS 2026 Globals | 10 of 10 (was 7) | the field |

Known gaps: most single-region pools (Asia, Oceania, several Hard tiers) cannot build a board, before and after the rebuild. South America Easy and Medium went from 4 in 10 to none: that pool has only five usable rules.

## Guess the Player

You guess any player and get a row of comparisons against the secret one, then use them to close in. You have eight guesses.

| Column | Compared how |
| --- | --- |
| Region | match or not |
| Country | match or not, on each player's first nationality |
| Status | active or retired, match or not |
| Age | exact, or a direction |
| Career earnings | always a direction: exact-matching a six-figure number would never land |
| FNCS wins | exact, or a direction |
| FNCS finals played | exact, or a direction |
| Together | green when the two have entered 10+ tournaments as teammates; a red cell still shows how many |

**Two feedback styles:**

- **Exact.** Age and the FNCS counts are simply right or wrong. That is worth playing, because competitive players sit in a narrow age band and FNCS counts are small.
- **Direction.** An arrow says whether the secret player is higher or lower on every number.

There are only two colours, green and red; the arrows already say which way to go. A number equal to the secret player's is green in both styles.

**Who can be the answer:** 3,027 players with a published birthday and an earnings figure, so the secret never has a blank. In event mode the birthday is not required: for a secret without one, every Age cell is grey (`unknown`) rather than red. You may guess anyone; a guess with no birthday shows a dash for age.

**The secret is dealt** from the no-repeat bag, with the Random mix: over 3,000 test deals it came out 50% Easy, 34% Medium, 16% Hard. In event mode the field's regions are taken in turn.

## Server, analytics and support

The site has its own small server (`server/index.ts`): plain Node HTTP with one dependency, `pg`. It stores to Postgres when `DATABASE_URL` is set, and otherwise to JSON-lines files in `server/.data/`. In production it also serves the built site, gzipped.

### What is recorded

| Record | When | What it holds |
| --- | --- | --- |
| Round | once per finished round, from a production build, or locally under `npm run dev:all` | game, setup, outcome, and per-game detail such as the pairs, guesses and cards |
| Support request | when someone sends the 💬 form | kind (bug, wrong data, suggestion, category, other), message, and optionally the round just played |
| Error | an uncaught browser error, production only | message and stack; at most 5 per page load, each message once |

**Privacy.** There are no cookies for players, no device id and no stored IP addresses, and every total is global. Records are shaped so a user id can be attached later if accounts arrive.

**Spam.** The support form has a hidden trap field. When a bot fills it, the server accepts the request and throws it away.

### The dashboard

`#/analytics` is linked from nowhere and computed live from the stored rounds on every load (`aggregate.ts`). It has a page per question (`src/pages/analytics/`):

| Page | Shows |
| --- | --- |
| `#/analytics` | every game: rounds, won / lost / gave up, rounds per day, how rounds were set up, and a by-game table |
| `#/analytics/game/<id>` | one game: the same numbers narrowed to it, then its own tables with a search box. Examples: which clue solved a Career Path, which Tenaball answers nobody finds, which Griefer cards get misread, which Tic Tac Toe cells stay empty, which Higher or Lower pairs trip people up |
| `#/analytics/players` | a search over every player the rounds mention |
| `#/analytics/players/<id>` | one player across every game: what they were (the secret, a card, an answer, a tile…), how often, how often people got them right, and their latest appearances |
| `#/analytics/support`, `/errors` | the inbox, with status tabs and a search, and the error table |

**How rounds were set up** splits the rounds four ways by where the players came from. Each breakdown under it counts only the rounds it applies to:

| Source | Meaning | Broken down by |
| --- | --- | --- |
| Random | the shared picker on Random | — |
| Chosen | the picker on Choose | region, difficulty |
| Event mode | an event field was in force | which field |
| Own setup | Higher or Lower, Tic Tac Toe, Tenaball and List | level, mode, category |

**Filters.** A bar above every page narrows everything at once. Its choices are the range (24 hours, 7, 30 or 90 days, all time), where the players came from, the event, the region, the difficulty, the level and the outcome. The filters live in the address, so they hold across pages and a view can be bookmarked. The dropdowns only offer values some stored round has. Tables sort by any column.

### Access

| Setting | Meaning |
| --- | --- |
| `ADMIN_PASSWORD` | the dashboard password; without it the dashboard is switched off |
| `SESSION_SECRET` | optional; signs the login cookie (defaults to the password) |
| `ADMIN_OPEN=1` | local only: the dashboard with no password. Ignored when `NODE_ENV=production` |

Locally, `npm run dev:all` sets `ADMIN_OPEN=1` for the API and `VITE_RECORD=1` for the site. The dashboard opens without a password, and rounds you play land in this machine's `server/.data`.

## How it is tested and run

Three commands must pass before anything ships: `npm run typecheck`, `npm run check:games` and `npm run check:server`. `npm run build` runs the typecheck again and then builds the site.

| Command | What it does |
| --- | --- |
| `npm run dev:all` | the site (5173) and the API (3000) in one terminal; Ctrl+C stops both |
| `npm run dev` | the site alone |
| `npm run api` | the API alone, restarting on changes |
| `npm run build` | typecheck and production build into `dist/` |
| `npm start` | the production server: `dist/` plus the API (what Heroku will run) |
| `npm run check:games` | plays all ten games to the end in Node and checks what each promises |
| `npm run check:server` | starts the server on a spare port with a throwaway store and checks every endpoint |

### What check:games holds the games to

It plays every game with a perfect player, generating the random games many times over to catch a board that is rare but impossible:

- **Higher or Lower:** 5 runs of 40 rounds per category and level.
  - Round one is top 20 against top 20, and the cap is never left.
  - No tie without an Equal button, and no obvious pair once the schedule reaches close.
  - Under 75% of answers flip direction, and on Hard a shown 0 must not always go up.
- **Tenaball:** every board has ten answers you can type, and a tie at 10th is never settled by name.
- **List:** every list has enough answers, none repeated, all typable. Lists answered with countries or organisations search more than their answers.
- **Tic Tac Toe:** 25 boards per level, every one fillable with nine different players, and a Hard board ends when nine guesses cannot fill nine cells.
- **Connections:** 40 boards on a tier and 20 on Random. Each splits exactly one way, no rule covers a fifth player, and no two rules are nearly the same.
- **Event mode:**
  - The field's Tenaball boards come in the planned order, and the planned lists exist.
  - Every six deals of the secret-player games cover all six regions.
  - Higher or Lower's region lean shows more regions than without it.
- **Definitions:** the matcher explains the right terms for tricky titles, and the LAN list names every LAN.
- **Fortnitedle:** three guesses into a digit answer, Easy has handed the digit over, Medium a # with no key coloured, Hard nothing.
- **Career Path:** a two-clue round lasts exactly five wrong guesses, a ten-clue round ten, and giving up is never recorded as running out.
- **Who Are Ya:** the number one teammate is last in the ramped orders and never in Random's first four; a two-clue hand lasts five wrong guesses.
- **Whole field:** every secret-player game deals all of an event field that its data allows, and Griefer, Connections and Tic Tac Toe build boards from the whole field.
- **Analytics:** one real round per game, recorded and aggregated the way the dashboard reads it; the filters narrow every table, and the player view finds its player.

A generated data file that is missing makes its games report SKIPPED and the suite still passes, so a fresh clone is testable before the notebook runs.

## Limited mode

Limited mode is planned, not built. It is a fortnight around one event when the site runs only that event, with one puzzle per game per day. For the FNCS 2026 Globals (26–27 September) it would run 16 September to 3 October: 18 days, 18 categories per game. The full plan is in `LIMITED_MODE.md`.

| Game | Daily plan | Works today in event mode |
| --- | --- | --- |
| Tenaball | categories 1–10 before the event, appearances on day one, results boards from 27 Sep | the 11 pre-event boards |
| List | the same shape: field lists first, results lists after | 12 of 18 lists |
| Fortnitedle, Career Path, Who Are Ya, Guess the Player | one secret player a day each, nobody twice across all four (72 of 101); days 1–12 by region, 13–18 the event's stories | regions in turn |
| Higher or Lower | a 20-player run a day, rotating Age, FNCS Wins, FNCS Finals, Earnings; each category splits the field into its own five pools | region lean, difficulty rising |
| Tic Tac Toe, Connections, Griefer | random boards from the field | yes |

**Building it needs four things:**

1. A daily schedule, seeded by the date so everyone gets the same puzzle.
2. Switching on and off by date, with the mode picker hidden.
3. The event's results in the export, refreshed each evening through the event: placements by day, points, and the duos (List 11 needs them before the event).
4. Sources the export does not have: creator subscribers, eliminations and damage, and who qualified from where.

Decided so far:

- **Regions:** six, with North America as one.
- **Nationality:** Scotland stays Scotland.
- **Subscribers:** dropped until there is data.
- **Small regions:** in the one-player games, each small-region player is used once across the four games.

## Open decisions and what to do next

My recommendation: commit this week's work and get the site live before the Globals weekend, so real rounds start arriving. Build limited mode for the next event, with this Globals as its test data. The daily mode cannot be built and tested by 26 September.

| # | Next step | Why | Size |
| --- | --- | --- | --- |
| 1 | Commit the uncommitted work: the Higher or Lower draw, Connections, definitions, field categories, FNCS Finals, `dev:all` | nothing from these sessions is in git yet | small |
| 2 | Deploy to Heroku: check a clean clone builds, then create the app, Postgres and `ADMIN_PASSWORD` | the dashboard only learns from real players | small |
| 3 | An event-results cell: placements by day, points and duos into `pools.json`, re-run each evening of an event | unlocks Tenaball 13–19 and List 11 and 15 | medium |
| 4 | The daily mode: one puzzle per game per day, seeded by date, switched on and off by date | the core of limited mode | large |
| 5 | Limited-mode dealing: no player twice across the four secret games; five balanced pools per Higher or Lower category | what the plan promises per day | medium |

### Decisions only you can make

- **The free Higher on Easy and Medium FNCS Wins.** A shown 0 is still a free Higher there, about 13–20% of rounds. Giving FNCS Wins an Equal button on every level would fix it.
- **The Middle East in Higher or Lower pools.** Four players cannot fill five pools. Either one pool per category goes without, or one of them appears twice in a category.
- **Griefer's griefers** are random players who don't fit. Near-misses would make boards sharper: a country's neighbours, an organisation's rivals, a winner's runner-up.
- **Thin Connections pools.** Most single-region pools and South America Easy/Medium cannot build a board. Accept that, or add rule kinds that work inside one region.
- **Data with no source yet:** creator subscribers, eliminations and damage, and who qualified from where. Each unlocks limited-mode categories if a source is found.
- **Accounts.** Not started. The records are shaped so a user id can be attached later.

# Editing the player data

Everything you can change by hand lives in **two files**:

| File | What it holds |
| --- | --- |
| [`src/data/sample/roster.ts`](src/data/sample/roster.ts) | The ~110 players — one line each. **This is the file you want 99% of the time.** |
| [`src/data/sample/tournaments.ts`](src/data/sample/tournaments.ts) | The list of major events (FNCS seasons, World Cups, LANs) |

After any edit:

```bash
npm run audit
```

That catches typos, impossible dates, unknown ids and contradictions. The dev
server hot-reloads, so just refresh the page to see your change.

---

## Authored vs. derived — read this first

Only the fields in `roster.ts` are written by hand. Everything else is
**generated** from them by [`build.ts`](src/data/sample/build.ts):

| Authored (edit freely) | Derived (do not look for it in a file) |
| --- | --- |
| name, real name, country, region | Individual event placements |
| birth date, career earnings, org, PR | Prize money per result |
| tier, first/last season | Earnings split per year |
| FNCS title count | Teammate match counts |
| Signature results, partners, status | |

Generation is seeded, so it is stable: the same roster always produces the same
placements, on every machine and every reload. If you want a *specific* result
to be true, pin it with `signature` (see below) — that always wins.

**Every 1st place in the app is authored.** The generator never invents a title,
so if a player shows 3 FNCS wins, it is because `fncsWins: 3` says so. `npm run
audit` fails if the dataset ever disagrees with what you wrote.

---

## A roster line, field by field

```ts
{ id: 'bugha', name: 'Bugha', realName: 'Kyle Giersdorf', country: 'US', region: 'NAE',
  born: '2002-12-01', earnings: 3750000, team: 'Sentinels', pr: 2180, tier: 1,
  first: 'C2S1', last: 'C7S2', fncsWins: 1,
  signature: [['wc-2019-solo', 1]], partners: ['jamper', 'arkhram'] },
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Internal key, lowercase. Must be unique. Changing it resets that player's generated results. |
| `name` | yes | The handle shown everywhere, and the Wordle answer. |
| `realName` | no | Shown on reveal screens. **Omit it if you are not sure** — better blank than wrong. |
| `country` | yes | ISO two-letter code. Must exist in `COUNTRY_NAMES` at the top of the file. |
| `region` | yes | Competitive region, not nationality: `NAE` `NAW` `EU` `BR` `OCE` `ASIA` `ME`. A Canadian playing NA East is `country: 'CA', region: 'NAE'`. |
| `born` | no | `YYYY-MM-DD`. Drives age. Without it the player is skipped by Higher or Lower (Age). |
| `earnings` | yes | Career prize money in USD, no separators (`3750000`). |
| `team` | no | Current org. Omit for a free agent. |
| `pr` | yes | Power Ranking points. |
| `tier` | yes | `1` elite → `4` fringe. Only affects how well generated placements go. |
| `first` / `last` | yes | First and last FNCS season they competed in, e.g. `C2S1`, `C7S2`. Defines their whole career span. |
| `fncsWins` | no | Number of FNCS titles. **Authoritative** — the dataset will show exactly this. |
| `signature` | no | Results that must be exactly true: `[['event-id', placement]]`. |
| `partners` | no | Known duo/trio partners by `id`. Gives them a high teammate-match count with each other. |
| `status` | no | `'active'` (default) or `'inactive'` for retired players. |

### Which games use which field

- **name** → Wordle, and every answer you type
- **born / age** → Higher or Lower, Guess the Player
- **earnings** → Higher or Lower, Tenaball, List, Impostor, Tic Tac Toe, Guess the Player
- **country / region** → Impostor, Tic Tac Toe, Connections, Guess the Player, List
- **team** → Impostor, Tic Tac Toe, Connections, List
- **fncsWins** → Tenaball, Guess the Player, Impostor, Tic Tac Toe, List
- **pr** → Tenaball
- **first / last / tier / signature** → Career Path, Tenaball (tournaments), List
- **partners** → Who Are Ya?, Connections

---

## Common tasks

### Fix a wrong fact

Find the line (Ctrl+F the handle) and edit the value. That is it:

```ts
// before
{ id: 'clix', name: 'Clix', born: '2005-01-18', earnings: 640000, ... },
// after
{ id: 'clix', name: 'Clix', born: '2005-04-06', earnings: 712000, ... },
```

### Make a specific result true

Use `signature`. It overrides anything the generator would have done, and it is
the **only** way to award a win:

```ts
signature: [['wc-2019-solo', 1], ['fncs-gc-2024', 12]],
```

Event ids come from `tournaments.ts`. FNCS finals follow the pattern
`fncs-<season>-<region>`, all lowercase:

```
fncs-c4s4-eu      FNCS Chapter 4 Season 4, Europe
fncs-c2s2-nae     FNCS Chapter 2 Season 2, NA East
wc-2019-solo      Fortnite World Cup 2019 Solo
wc-2019-duo       Fortnite World Cup 2019 Duo
dh-anaheim-2020   DreamHack Anaheim 2020
fncs-invitational-2021
fncs-gc-2022 / fncs-gc-2023 / fncs-gc-2024 / fncs-gc-2025
gamers8-2023
ewc-2024 / ewc-2025 / ewc-2026
```

### Change who won an event

Move the `['<event-id>', 1]` entry from one player's `signature` to another's.
Only one player (or one duo/trio) may hold 1st at a given event — the audit
fails otherwise.

### Change how many FNCS titles a player has

Edit `fncsWins`. If you raise it past the number of finals their `first`–`last`
range covers, the audit tells you to widen that range.

### Add a player

Copy any line, change the values, give it a unique `id`. Put it in the right
region block so the file stays readable. Minimum viable line:

```ts
{ id: 'newguy', name: 'NewGuy', country: 'FR', region: 'EU',
  earnings: 250000, pr: 900, tier: 3, first: 'C5S1', last: 'C7S2' },
```

### Remove a player

Delete the line. Then run `npm run audit` — it will tell you if anyone still
lists them in `partners`.

### Add or change an event

Edit `tournaments.ts`. FNCS season finals are generated from the `FNCS_SEASONS`
array (one entry per season × seven regions), so adding a season adds seven
events. One-off majors are hand-listed in `SPECIAL_EVENTS`.

---

## Known-weak data — worth your attention

These were authored from memory for the prototype and are the most likely to be
wrong. They are the highest-value things to correct:

1. **Major-event winners.** Every 1st place outside the World Cup is a plausible
   placeholder, not a checked fact. Search `', 1]` in `roster.ts` to see all of
   them in one pass — there are twelve.
2. **Birth dates.** Roughly right for well-known players, invented for the rest.
3. **Real names.** Only filled in where I was reasonably confident; most players
   have none on purpose.
4. **Career earnings and PR.** Right order of magnitude, not exact.
5. **`first` / `last` seasons.** These define career length, so they change
   Career Path a lot. Worth a pass for the older players.
6. **The lower half of the roster.** The top ~40 names are real and well known;
   further down, some handles are plausible sample names rather than real
   competitors.

Everything derived from these — placements, prize money, teammate counts — is
generated and will update automatically when you fix the source values.

---

## Verify your edits

```bash
npm run audit          # plausibility of what you typed (run this first)
```

```bash
npm run check:data     # internal consistency of the generated dataset
```

```bash
npm run check:games    # plays all ten games to completion headlessly
```

`check:games` is the important one after a big edit: it proves the generators
can still build solvable Tic Tac Toe boards, four clean Connections groups,
ten-slot Tenaball boards and so on from your data.

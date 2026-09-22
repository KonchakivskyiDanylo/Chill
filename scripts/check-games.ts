/**
 * Playability check for all ten games.
 *
 * Run with: npm run check:games
 *
 * Each game is driven through a full round by a perfect-oracle "player" using
 * only its public engine API. Generated games (Tic Tac Toe, Connections,
 * Griefer) are generated many times over to catch a board that is
 * rare-but-impossible rather than one that happens to work.
 *
 * Everything now reads the Liquipedia export. Three of its files are written by
 * the notebook (`notebook_cells.md`) and may legitimately not exist yet — the
 * sections that need them are skipped with a note rather than failing, so this
 * is still useful on a fresh clone.
 */
import { loadRoster, EXPORT_DATE, type RosterPlayer } from '@/data/liquipedia/roster';
import { loadMajors } from '@/data/liquipedia/majors';
import { loadTeammates } from '@/data/liquipedia/teammates';
import { loadFacts } from '@/data/liquipedia/facts';
import { loadOrgs } from '@/data/liquipedia/orgs';
import { loadPools } from '@/data/liquipedia/pools';
import { loadRankings, membersOf } from '@/data/liquipedia/rankings';
import { deal } from '@/games/shared/rotation';
import { GAMES, getGame } from '@/games/registry';
import { buildCriteria, type CriteriaSource } from '@/games/shared/criteria';
import { matchPlayer, suggestPlayers } from '@/lib/text';

import * as hl from '@/games/higher-lower/engine';
import * as wordle from '@/games/wordle/engine';
import * as career from '@/games/career-path/engine';
import * as whoAreYa from '@/games/who-are-ya/engine';
import * as tenaball from '@/games/tenaball/engine';
import { buildCriteria as buildListCriteria } from '@/games/list/criteria';
import * as griefer from '@/games/impostor/engine';
import * as ttt from '@/games/tic-tac-toe/engine';
import * as connections from '@/games/connections/engine';
import * as gtp from '@/games/guess-the-player/engine';

const problems: string[] = [];
const notes: string[] = [];
const skipped: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) problems.push(message);
}

/** Resolves to null when the notebook has not written the file yet. */
async function optional<T>(load: () => Promise<T>, what: string): Promise<T | null> {
  try {
    return await load();
  } catch {
    skipped.push(what);
    return null;
  }
}

// ------------------------------------------------------------ 0. the registry
// Games look themselves up with `getGame('<id>')` while the router looks them
// up by slug, and a rename moves the slug away from the id. If either lookup
// misses, `meta` is undefined and the game crashes on its first render.
for (const game of GAMES) {
  check(getGame(game.slug) === game, `registry: getGame('${game.slug}') did not find ${game.title}`);
  check(getGame(game.id) === game, `registry: getGame('${game.id}') did not find ${game.title}`);
}
check(GAMES.length === 10, `registry: expected 10 games, found ${GAMES.length}`);

const roster = await loadRoster();
notes.push(`roster: ${roster.players.length} playable players (export ${EXPORT_DATE})`);
for (const tier of ['easy', 'medium', 'hard'] as const) {
  notes.push(`  ${tier}: ${roster.playersFor(tier).length}`);
}

const facts = await optional(loadFacts, 'facts.json');
const orgs = await optional(loadOrgs, 'orgs.json');
const rankings = await optional(loadRankings, 'rankings.json');
const pools = await loadPools(); // never rejects
const majors = await optional(loadMajors, 'career_path.json');
const teammates = await optional(loadTeammates, 'teammates.json');

// ------------------------------------------------------------- 1. name search
// The one piece of shared logic every typing game depends on.
{
  const aqua = roster.players.filter((p) => p.name.toLowerCase() === 'aqua');
  notes.push(`search: ${aqua.length} players answer to "Aqua"`);
  for (const [input, expected] of [
    ['peterbo', 'Peterbot'],
    ['clix', 'Clix'],
  ] as const) {
    const found = matchPlayer(input, roster.players);
    check(found !== null, `search: "${input}" resolved to nothing (expected ${expected})`);
  }
  // An alias must find its player — this is the shxrk/Shark case.
  const withAlias = roster.players.find((p) => p.aliases.length > 0);
  if (withAlias) {
    const viaAlias = matchPlayer(withAlias.aliases[0], roster.players);
    check(
      viaAlias !== null,
      `search: alias "${withAlias.aliases[0]}" did not resolve (expected ${withAlias.name})`,
    );
  }
  check(suggestPlayers('cl', roster.players, 5).length > 0, 'search: two letters suggested nothing');
}

// --------------------------------------------------------- 2. Higher or Lower
for (const category of ['age', 'earnings', 'fncsWins'] as const) {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const pool = roster.playersFor(difficulty, {
      minimum: 2,
      eligible: (players) => hl.eligible(players, category),
    });
    let state = hl.createGame(pool, category, difficulty, `hl-${category}-${difficulty}`);
    check(state !== null, `higher-lower: could not start ${category}/${difficulty}`);
    if (!state) continue;

    // Play a long run with perfect answers and measure the gaps served, which
    // is the thing the new pairing is supposed to control.
    const gaps: number[] = [];
    let ties = 0;
    let bothZero = 0;
    let rounds = 0;
    const maxRounds = Math.min(pool.length + 5, 400);
    while (state.status !== 'cleared' && rounds < maxRounds) {
      rounds++;
      gaps.push(hl.gapBetween(state.current, state.challenger, category));
      if (hl.correctAnswer(state) === 'equal') ties++;
      if (category === 'fncsWins' && state.current.fncsWins === 0 && state.challenger.fncsWins === 0) {
        bothZero++;
      }
      const truth = hl.correctAnswer(state);
      const answer = truth === 'equal' && !hl.hasEqualButton(difficulty) ? 'higher' : truth;
      state = hl.submitAnswer(state, answer);
      check(state.status !== 'gameover', `higher-lower ${category}/${difficulty}: perfect play lost`);
      if (state.status === 'gameover') break;
      state = hl.nextRound(state);
    }
    check(rounds > 0, `higher-lower ${category}/${difficulty}: no rounds played`);

    // A round where both players are on nought is not a question — the answer
    // is always Equal. The pairing is supposed to make those impossible.
    check(
      bothZero === 0,
      `higher-lower ${category}/${difficulty}: ${bothZero} of ${rounds} rounds were nought against nought`,
    );
    // And even legitimate ties must not be the whole game.
    check(
      ties < rounds * 0.75,
      `higher-lower ${category}/${difficulty}: ${ties} of ${rounds} rounds were ties`,
    );
    if (category === 'fncsWins') {
      notes.push(`higher-lower fncsWins/${difficulty}: ${ties} ties in ${rounds} rounds`);
    }

    /*
     * The gap should trend down as the streak grows — that is the whole point.
     *
     * Measured over the first thirty rounds rather than the whole oracle run,
     * because thirty is already a very good session and the run above is not
     * one: it plays perfectly until the pool is exhausted. FNCS Wins has only
     * 284 title-holders in 5,678 players, so a 340-round run genuinely runs
     * out of pairs and has to start serving wide ones. Nobody reaches that,
     * and measuring it would be measuring the oracle, not the game.
     */
    if (gaps.length >= 30) {
      const early = gaps.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
      const later = gaps.slice(20, 30).reduce((a, b) => a + b, 0) / 10;
      notes.push(
        `higher-lower ${category}/${difficulty}: ${rounds} rounds, gap ${early.toFixed(2)} → ${later.toFixed(2)} by round 30`,
      );
      check(
        later <= early + 0.08,
        `higher-lower ${category}/${difficulty}: pairs got easier over the first 30 rounds (${early.toFixed(2)} → ${later.toFixed(2)})`,
      );
    }
  }
}

// FNCS Wins must now include players on nought.
{
  const pool = hl.eligible(roster.players, 'fncsWins');
  const zeroes = pool.filter((p) => p.fncsWins === 0).length;
  check(zeroes > 0, 'higher-lower: FNCS Wins still excludes players with no title');
  notes.push(`higher-lower fncsWins: ${pool.length} eligible, ${zeroes} on nought`);
}

// ------------------------------------------------------------- 3. Fortnitedle
{
  const pool = wordle.eligible(roster.players);
  check(pool.length > 0, 'fortnitedle: no eligible answers');
  notes.push(`fortnitedle: ${pool.length} usable handles`);

  let withDigits = 0;
  for (const secret of pool) {
    const game = wordle.gameFor(secret);
    check(game.answer.length >= 3, `fortnitedle: ${secret.name} reduced to "${game.answer}"`);
    const schedule = wordle.revealSchedule(game.answer);
    if (schedule.size === 0) continue;
    withDigits++;
    for (const [position, after] of schedule) {
      check(
        after >= 0 && after <= wordle.MAX_GUESSES,
        `fortnitedle: ${secret.name} reveals position ${position} after ${after} guesses`,
      );
    }
    // Every digit must be out by the last guess, or it was never a fair puzzle.
    const last = Math.max(...schedule.values());
    check(
      last < wordle.MAX_GUESSES,
      `fortnitedle: ${secret.name} hides a digit until guess ${last} of ${wordle.MAX_GUESSES}`,
    );
  }
  notes.push(`fortnitedle: ${withDigits} answers contain a digit`);

  // The documented schedule, exactly: nothing before guess 3, nothing after 5.
  const cases: [string, string][] = [
    ['TH0MASHD', '3'],
    ['A1B2C', '3,4'],
    ['A309', '3,4,5'],
    ['LEO2004', '3,4,5,5'],
  ];
  for (const [answer, expected] of cases) {
    const got = [...wordle.revealSchedule(answer).values()].join();
    check(got === expected, `fortnitedle: ${answer} should reveal after ${expected}, got ${got}`);
  }
  check(
    Math.min(...wordle.revealSchedule('A309').values()) >= wordle.FIRST_REVEAL,
    'fortnitedle: a digit leaked before the first reveal guess',
  );

  // A perfect solve.
  const game = wordle.gameFor(pool[0]);
  const solved = wordle.submitGuess(game, pool[0].name);
  check(solved.ok && solved.state.status === 'won', 'fortnitedle: the exact answer did not win');
}

// ------------------------------------------------------------ 4. Career Path
if (majors) {
  const answerable = majors.eligible(roster.players);
  check(answerable.length > 0, 'career-path: nobody is answerable');
  notes.push(`career-path: ${answerable.length} answerable, ${majors.tournaments.length} majors`);

  for (const mode of ['order', 'random'] as const) {
    let longest = 0;
    for (const secret of answerable.slice(0, 200)) {
      const results = majors.resultsFor(secret.id);
      const game = career.createGame(secret, results, mode, `cp-${mode}-${secret.id}`);
      check(game !== null, `career-path: could not start on ${secret.name}`);
      if (!game) continue;
      check(
        game.clues.length <= career.MAX_CLUES,
        `career-path: ${secret.name} got ${game.clues.length} clues, max is ${career.MAX_CLUES}`,
      );
      // A correct guess turns the rest of the clue list face up, and records
      // how many were actually needed.
      const solved = career.submitGuess(game, secret);
      check(solved.status === 'won', `career-path: correct guess did not win on ${secret.name}`);
      check(
        solved.revealed === game.clues.length,
        `career-path: winning on ${secret.name} left ${solved.revealed}/${game.clues.length} clues hidden`,
      );
      check(
        solved.earned <= solved.revealed,
        `career-path: ${secret.name} earned more clues than were revealed`,
      );
      longest = Math.max(longest, game.clues.length);

      if (mode === 'order') {
        // The story must open on the first major and close on the last.
        check(
          game.clues[0].result.tournament.date === results[0].tournament.date,
          `career-path: ${secret.name}'s story does not open on their first major`,
        );
        check(
          game.clues[game.clues.length - 1].result.tournament.date ===
            results[results.length - 1].tournament.date,
          `career-path: ${secret.name}'s story does not close on their most recent major`,
        );
        // …and run in order.
        for (let i = 1; i < game.clues.length; i++) {
          check(
            game.clues[i - 1].result.tournament.date <= game.clues[i].result.tournament.date,
            `career-path: ${secret.name}'s story is out of order at clue ${i}`,
          );
        }
      }

      // A correct guess on the first clue wins.
      check(career.submitGuess(game, secret).status === 'won', `career-path: correct guess did not win`);
    }
    notes.push(`career-path ${mode}: longest clue list ${longest}`);
  }
}

// ------------------------------------------------------------- 5. Who Are Ya
if (teammates && facts) {
  const byId = new Map(roster.players.map((p) => [p.id, p]));
  const answerable = roster.players.filter(
    (p) =>
      teammates.cluesFor(p.id, byId).length >= whoAreYa.MIN_CLUES &&
      facts.of(p.id).apps >= whoAreYa.MIN_TOURNAMENTS,
  );
  check(answerable.length > 0, 'who-are-ya: nobody is answerable');
  notes.push(
    `who-are-ya: ${answerable.length} answerable (${whoAreYa.MIN_CLUES}+ teammates, ${whoAreYa.MIN_TOURNAMENTS}+ tournaments)`,
  );

  for (const mode of ['easy', 'hard', 'random'] as const) {
    for (const secret of answerable.slice(0, 120)) {
      const clues = teammates.cluesFor(secret.id, byId);
      const game = whoAreYa.createGame(secret, clues, mode, `wy-${mode}-${secret.id}`);
      check(game !== null, `who-are-ya: could not start on ${secret.name}`);
      if (!game) continue;
      check(
        !game.clues.some((clue) => clue.player.id === secret.id),
        `who-are-ya: ${secret.name} is listed as their own teammate`,
      );
      const solved = whoAreYa.submitGuess(game, secret);
      check(solved.status === 'won', 'who-are-ya: correct guess did not win');
      check(
        solved.revealed === game.clues.length,
        `who-are-ya: winning on ${secret.name} left ${solved.revealed}/${game.clues.length} clues hidden`,
      );
    }
  }
}

// ---------------------------------------------------------------- 6. Tenaball
if (rankings) {
  notes.push(`tenaball: ${rankings.boards.length} boards`);
  const byGroup = new Map<string, number>();
  for (const board of rankings.boards) {
    byGroup.set(board.group, (byGroup.get(board.group) ?? 0) + 1);
    check(board.rows.length === tenaball.SLOTS, `tenaball: ${board.id} has ${board.rows.length} rows`);
    check(Boolean(board.next?.key), `tenaball: ${board.id} has no 11th place for the tie rule`);

    // Answers, not rows: a tournament board in duos ranks placements, so the
    // ten rows hold twenty names and it is the *names* that have to be unique.
    // One player answering for two slots would make the board unwinnable.
    const answers = board.rows.flatMap((row) => membersOf(row).map((member) => member.key));
    check(new Set(answers).size === answers.length, `tenaball: ${board.id} repeats an entry`);
    const spare = membersOf(board.next).map((member) => member.key);
    check(
      !spare.some((key) => answers.includes(key)),
      `tenaball: ${board.id} lists its 11th place inside the ten`,
    );

    // A paydays board is answered with an event name, and the only place the
    // guess box can find one is the list the notebook ships. An answer missing
    // from it is a slot that cannot be filled — the same bug the org boards had.
    if (board.entity === 'tournament') {
      const pool = new Set(rankings.tournaments);
      check(pool.size > answers.length * 5, `tenaball: ${board.id} has no event list to search`);
      check(
        [...answers, ...spare].every((key) => pool.has(key)),
        `tenaball: ${board.id} names an event the guess box cannot offer`,
      );
    }

    // A perfect run fills every slot and never loses a life. A team row takes
    // one guess per name and only closes on the last of them.
    let game = tenaball.createGame(board, 'hard');
    for (const row of board.rows) {
      const members = membersOf(row);
      members.forEach((member, index) => {
        const result = tenaball.applyGuess(game, member.key, member.label);
        const wanted = index === members.length - 1 ? 'correct' : 'partial';
        check(
          result.outcome.kind === wanted,
          `tenaball: ${board.id} answered "${member.label}" with ${result.outcome.kind}, expected ${wanted}`,
        );
        game = result.state;
      });
    }
    check(game.status === 'won', `tenaball: ${board.id} did not win on a perfect run`);
    check(game.lives === tenaball.HARD_LIVES, `tenaball: ${board.id} lost a life on a perfect run`);

    // The 11th must be a free near miss, not a mistake.
    const near = tenaball.applyGuess(tenaball.createGame(board, 'hard'), spare[0], board.next.label);
    check(near.outcome.kind === 'tied', `tenaball: ${board.id} punished its own 11th place`);
    check(near.state.lives === tenaball.HARD_LIVES, `tenaball: ${board.id} charged a life for the 11th`);
  }
  for (const [group, count] of [...byGroup].sort((a, b) => b[1] - a[1])) {
    notes.push(`  ${group}: ${count}`);
  }
  check(byGroup.size >= 4, `tenaball: only ${byGroup.size} category groups`);
}

// -------------------------------------------------------------------- 7. List
if (facts) {
  // Orgs and teammates are optional to the game — it shows the lists they buy
  // once the files land — so they are passed here to get those lists checked.
  const criteria = buildListCriteria(roster, facts, pools, orgs, teammates);
  check(criteria.length > 0, 'list: no categories available');
  const byGroup = new Map<string, number>();
  const rosterIds = new Set(roster.players.map((player) => player.id));
  for (const criterion of criteria) {
    const kind = criterion.id.split(':')[0];
    byGroup.set(kind, (byGroup.get(kind) ?? 0) + 1);
    check(criterion.answers.length >= 8, `list: "${criterion.title}" has only ${criterion.answers.length}`);
    const ids = new Set(criterion.answers.map((p) => p.id));
    check(ids.size === criterion.answers.length, `list: "${criterion.title}" repeats an answer`);
    // Every answer has to be typable in the box this list opens, or the round
    // cannot be finished — the same rule Tenaball's boards live by.
    const pool = new Set((criterion.pool ?? roster.players).map((entry) => entry.id));
    const unreachable = criterion.answers.filter((answer) => !pool.has(answer.id));
    check(
      unreachable.length === 0,
      `list: "${criterion.title}" cannot be typed: ${unreachable.slice(0, 3).map((a) => a.name).join(', ')}`,
    );
    if (!criterion.pool) {
      check(
        criterion.answers.every((answer) => rosterIds.has(answer.id)),
        `list: "${criterion.title}" answers with somebody off the roster`,
      );
    }
  }
  notes.push(`list: ${criteria.length} categories`);
  for (const [kind, count] of [...byGroup].sort((a, b) => b[1] - a[1])) {
    notes.push(`  ${kind}: ${count}`);
  }
}

// ---------------------------------------------- 8-10. the criteria-based games
if (facts && orgs) {
  const players = roster.playersFor('medium', { minimum: 200, eligible: facts.eligible(3) });
  const source: CriteriaSource = { players, facts, orgs };
  const criteria = buildCriteria(source, { minMatches: 4, maxShare: 0.5 });
  notes.push(`criteria: ${criteria.length} usable over a ${players.length}-player pool`);

  const kinds = new Map<string, number>();
  for (const criterion of criteria) kinds.set(criterion.kind, (kinds.get(criterion.kind) ?? 0) + 1);
  for (const [kind, count] of [...kinds].sort((a, b) => b[1] - a[1])) notes.push(`  ${kind}: ${count}`);

  // The old dataset could only really answer "country" and "region". If that is
  // true again, the criteria games are back to being flag-reading exercises.
  const identity = (kinds.get('country') ?? 0) + (kinds.get('region') ?? 0);
  check(
    identity < criteria.length * 0.5,
    `criteria: ${identity} of ${criteria.length} are country/region — too few real questions`,
  );

  // ---- Griefer
  let grieferOk = 0;
  for (let seed = 0; seed < 60; seed++) {
    const round = griefer.createRound(source, `g-${seed}`);
    if (!round) continue;
    grieferOk++;
    check(round.memberIds.size >= 2, `griefer: round ${seed} has ${round.memberIds.size} players who fit`);
    check(
      round.memberIds.size < round.board.length,
      `griefer: round ${seed} has no griefers at all`,
    );
    for (const player of round.board) {
      check(
        round.criterion.test(player) === round.memberIds.has(player.id),
        `griefer: round ${seed} mislabels ${player.name}`,
      );
    }
    // Perfect play: select exactly the ones who fit.
    let game = griefer.createGame(round, 'all-at-once');
    for (const player of round.board) {
      if (round.memberIds.has(player.id)) game = griefer.toggle(game, player);
    }
    check(griefer.check(game).status === 'won', `griefer: round ${seed} rejected a perfect selection`);
  }
  check(grieferOk >= 50, `griefer: only ${grieferOk} of 60 seeds produced a board`);

  // ---- Tic Tac Toe
  let boards = 0;
  for (let seed = 0; seed < 40; seed++) {
    const board = ttt.generateBoard(source, `t-${seed}`);
    if (!board) continue;
    boards++;
    let game = ttt.createGame(board, 'easy');

    // Fill it by always submitting a player the grid can place, which exercises
    // the auto-placement path rather than the explicit one.
    for (let step = 0; step < 40 && game.filled.size < 9; step++) {
      const used = new Set([...game.filled.values()].map((p) => p.id));
      let placed = false;
      for (let r = 0; r < ttt.SIZE && !placed; r++) {
        for (let c = 0; c < ttt.SIZE && !placed; c++) {
          if (game.filled.has(ttt.cellKey(r, c))) continue;
          for (const candidate of board.candidates[r][c]) {
            if (used.has(candidate.id)) continue;
            const result = ttt.submit(game, candidate);
            if (result.outcome.kind === 'placed') {
              game = result.state;
              placed = true;
              break;
            }
            if (result.outcome.kind === 'choose') {
              const cell = result.outcome.cells[0];
              const forced = ttt.place(game, cell, candidate);
              if (forced.outcome.kind === 'placed') {
                game = forced.state;
                placed = true;
                break;
              }
            }
          }
        }
      }
      if (!placed) break;
    }
    check(game.status === 'won', `tic-tac-toe: board ${seed} could not be completed (${game.filled.size}/9)`);
    check(game.mistakes === 0, `tic-tac-toe: board ${seed} charged ${game.mistakes} mistakes on perfect play`);
  }
  check(boards >= 35, `tic-tac-toe: only ${boards} of 40 seeds produced a board`);

  // A player who fits nothing must be rejected, not placed.
  {
    const board = ttt.generateBoard(source, 'reject');
    if (board) {
      const game = ttt.createGame(board, 'easy');
      const misfit = players.find(
        (p) => !board.rows.some((row) => row.test(p)) && !board.cols.some((col) => col.test(p)),
      );
      if (misfit) {
        const result = ttt.submit(game, misfit);
        check(result.outcome.kind === 'rejected', `tic-tac-toe: ${misfit.name} fits nothing but was not rejected`);
      }
    }
  }

  // Hard must end the board once nine guesses cannot fill nine cells.
  {
    const board = ttt.generateBoard(source, 'hard');
    if (board) {
      let game = ttt.createGame(board, 'hard');
      const misfit = players.find(
        (p) => !board.rows.some((row) => row.test(p)) && !board.cols.some((col) => col.test(p)),
      );
      if (misfit) {
        game = ttt.submit(game, misfit).state;
        check(game.status === 'lost', 'tic-tac-toe: hard survived a wasted guess');
      }
    }
  }

  // ---- Connections
  let puzzles = 0;
  for (let seed = 0; seed < 40; seed++) {
    const puzzle = connections.generatePuzzle(source, teammates, `c-${seed}`);
    if (!puzzle) continue;
    puzzles++;
    check(puzzle.board.length === 16, `connections: puzzle ${seed} has ${puzzle.board.length} tiles`);
    const ids = new Set(puzzle.board.map((p) => p.id));
    check(ids.size === 16, `connections: puzzle ${seed} repeats a player`);

    let game = connections.createGame(puzzle);
    for (const group of puzzle.groups) {
      for (const player of group.players) game = connections.toggle(game, player);
      game = connections.submit(game);
    }
    check(game.status === 'won', `connections: puzzle ${seed} rejected its own groups`);
    check(game.mistakes === 0, `connections: puzzle ${seed} charged a mistake on perfect play`);
    check(connections.livesLeft(game) === connections.MAX_MISTAKES, `connections: puzzle ${seed} lost a life`);
  }
  check(puzzles >= 35, `connections: only ${puzzles} of 40 seeds produced a board`);

  // A near miss must report how many belonged to one group.
  {
    const puzzle = connections.generatePuzzle(source, teammates, 'near');
    if (puzzle) {
      let game = connections.createGame(puzzle);
      for (const player of puzzle.groups[0].players.slice(0, 3)) game = connections.toggle(game, player);
      game = connections.toggle(game, puzzle.groups[1].players[0]);
      game = connections.submit(game);
      check(game.near === 3, `connections: a three-of-four guess reported near=${game.near}`);
    }
  }
}

// ------------------------------------------------------- 11. Guess the Player
{
  const pool = gtp.answerable(roster.players);
  check(pool.length > 0, 'guess-the-player: nobody is answerable');
  notes.push(`guess-the-player: ${pool.length} answerable`);

  for (const mode of ['exact', 'direction'] as const) {
    const drawn = deal(pool, [], `gtp-${mode}`);
    if (!drawn) continue;
    const game = gtp.gameFor(drawn.pick, mode);
    const won = gtp.submitGuess(game, drawn.pick);
    check(won.status === 'won', `guess-the-player: the correct guess did not win in ${mode}`);
    check(
      won.rows[0].attributes.every((attribute) => attribute.state === 'hit'),
      `guess-the-player: the secret player did not match itself on every attribute in ${mode}`,
    );
    check(
      won.rows[0].attributes.some((attribute) => attribute.key === 'status'),
      'guess-the-player: no status column',
    );
  }

  // Running out of guesses must lose.
  const drawn = deal(pool, [], 'gtp-lose');
  if (drawn) {
    let game = gtp.gameFor(drawn.pick, 'direction');
    const wrong = pool.filter((p: RosterPlayer) => p.id !== drawn.pick.id).slice(0, gtp.MAX_GUESSES);
    for (const player of wrong) game = gtp.submitGuess(game, player);
    check(game.status === 'lost', `guess-the-player: ${gtp.MAX_GUESSES} wrong guesses did not lose`);
  }
}

// ------------------------------------------------------------ 12. event pools
if (pools.pools.length > 0) {
  const byId = new Map(roster.players.map((p) => [p.id, p]));
  for (const pool of pools.pools) {
    const playable = pool.players.filter((id) => byId.has(id));
    notes.push(`pool ${pool.label}: ${playable.length} of ${pool.players.length} playable`);
    check(playable.length >= 20, `pools: ${pool.label} only has ${playable.length} playable players`);
  }
} else {
  skipped.push('pools.json (no event pools)');
}

// ------------------------------------------------------------------- report --
console.log('\n=== notes ===');
for (const note of notes) console.log('  ' + note);

if (skipped.length > 0) {
  console.log('\n=== skipped (run the cells in notebook_cells.md) ===');
  for (const item of skipped) console.log('  ' + item);
}

if (problems.length > 0) {
  console.log(`\n=== ${problems.length} PROBLEM(S) ===`);
  for (const problem of problems) console.log('  ✗ ' + problem);
  process.exit(1);
}
console.log('\n✓ all checks passed');

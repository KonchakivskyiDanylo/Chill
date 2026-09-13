/**
 * Playability check for all ten games.
 *
 * Run with: npm run check:games
 *
 * Each game is driven through a full round by a perfect-oracle "player" using
 * only its public engine API. Generated games (Tic Tac Toe, Connections,
 * Impostor, Tenaball) are generated many times over to catch a board that is
 * rare-but-impossible rather than one that happens to work.
 */
import { loadDataset } from '@/data/repository';
import { matchPlayer } from '@/lib/text';

import * as hl from '@/games/higher-lower/engine';
import * as wordle from '@/games/wordle/engine';
import * as career from '@/games/career-path/engine';
import * as whoAreYa from '@/games/who-are-ya/engine';
import * as tenaball from '@/games/tenaball/engine';
import { buildCriteria as buildListCriteria } from '@/games/list/criteria';
import * as impostor from '@/games/impostor/engine';
import * as ttt from '@/games/tic-tac-toe/engine';
import * as connections from '@/games/connections/engine';
import * as gtp from '@/games/guess-the-player/engine';

const problems: string[] = [];
const notes: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) problems.push(message);
}

const dataset = await loadDataset();

// ------------------------------------------------------- 1. Higher or Lower
for (const category of ['age', 'earnings'] as const) {
  for (const difficulty of ['easy', 'hard'] as const) {
    let state = hl.createGame(dataset.players, category, difficulty, `hl-${category}-${difficulty}`);
    check(state !== null, `higher-lower: could not start ${category}/${difficulty}`);
    if (!state) continue;

    let rounds = 0;
    while (state.status !== 'cleared' && rounds < 500) {
      rounds++;
      // Easy has no Equal button, so a tie is answered either way.
      const truth = hl.correctAnswer(state);
      const answer = truth === 'equal' && difficulty === 'easy' ? 'higher' : truth;
      state = hl.submitAnswer(state, answer);
      if (state.status === 'gameover') break;
      state = hl.nextRound(state);
    }
    check(
      state.status === 'cleared',
      `higher-lower ${category}/${difficulty}: perfect play ended as "${state.status}" after ${rounds} rounds`,
    );
    check(
      state.score === state.poolSize - 1,
      `higher-lower ${category}/${difficulty}: cleared with ${state.score}, expected ${state.poolSize - 1}`,
    );
    if (category === 'age' && difficulty === 'easy') {
      notes.push(`higher-lower: full clear = ${state.score} correct answers over ${state.poolSize} players`);
    }
  }
}

// ------------------------------------------------------------------ 2. Wordle
{
  const lengths = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const game = wordle.createGame(dataset.players, `w-${i}`);
    check(game !== null, 'wordle: could not create a game');
    if (!game) continue;
    lengths.add(game.answer.length);

    const solved = wordle.submitGuess(game, game.secret.name.toLowerCase());
    check(solved.ok && solved.state.status === 'won', `wordle: correct name did not win for ${game.secret.name}`);

    // A non-player string of the right length must be allowed.
    const filler = 'A'.repeat(game.answer.length);
    const fillerResult = wordle.submitGuess(game, filler);
    check(fillerResult.ok, 'wordle: a non-player guess of the right length was rejected');

    const wrongLength = wordle.submitGuess(game, 'A');
    check(!wrongLength.ok, 'wordle: a wrong-length guess was accepted');
  }
  notes.push(`wordle: answer lengths in play = ${[...lengths].sort((a, b) => a - b).join(', ')}`);

  // Scoring: duplicates must behave like real Wordle.
  const scores = wordle.scoreGuess('ABBA', 'ABCD').join(',');
  check(scores === 'correct,correct,absent,absent', `wordle: duplicate scoring wrong (${scores})`);
}

// ------------------------------------------------------------- 3. Career Path
for (const mode of ['order', 'random'] as const) {
  let minClues = Infinity;
  for (let i = 0; i < 120; i++) {
    const game = career.createGame(dataset, mode, `cp-${mode}-${i}`);
    check(game !== null, `career-path: could not create a ${mode} game`);
    if (!game) continue;
    check(game.clues.length >= 4, `career-path: only ${game.clues.length} clues for ${game.secret.name}`);
    minClues = Math.min(minClues, game.clues.length);

    if (mode === 'order') {
      const dates = game.clues.map((clue) => clue.event.date);
      check(
        dates.every((date, index) => index === 0 || dates[index - 1] <= date),
        'career-path: order mode is not chronological',
      );
    }
    check(wrongThenRight(game), `career-path: could not finish a round for ${game.secret.name}`);
  }
  notes.push(`career-path (${mode}): fewest clues on a board = ${minClues}`);
}

function wrongThenRight(start: career.GameState): boolean {
  let state = start;
  // Burn every clue with wrong guesses, then guess correctly on the last one.
  const decoys = dataset.players.filter((player) => player.id !== state.secret.id);
  for (let i = 0; i < state.clues.length - 1; i++) {
    state = career.submitGuess(state, decoys[i]);
    if (state.status !== 'playing') return false;
  }
  state = career.submitGuess(state, state.secret);
  return state.status === 'won';
}

// -------------------------------------------------------------- 4. Who Are Ya
for (const mode of ['easy', 'hard', 'random'] as const) {
  for (let i = 0; i < 120; i++) {
    const game = whoAreYa.createGame(dataset, mode, `wy-${mode}-${i}`);
    check(game !== null, `who-are-ya: could not create a ${mode} game`);
    if (!game) continue;
    check(
      game.clues.length >= whoAreYa.MIN_CLUES,
      `who-are-ya: only ${game.clues.length} teammates for ${game.secret.name}`,
    );
    check(
      !game.clues.some((clue) => clue.player.id === game.secret.id),
      'who-are-ya: the secret player appears in their own teammate list',
    );
    if (mode !== 'random') {
      const counts = game.clues.map((clue) => clue.events);
      check(
        counts.every((value, index) => index === 0 || counts[index - 1] <= value),
        `who-are-ya (${mode}): teammates are not ordered fewest → most`,
      );
    }
    const won = whoAreYa.submitGuess(game, game.secret);
    check(won.status === 'won', 'who-are-ya: a correct first guess did not win');

    // Exhaust every clue with wrong guesses and confirm the round ends.
    let state = game;
    const decoys = dataset.players.filter((player) => player.id !== game.secret.id);
    for (let step = 0; step < 30 && state.status === 'playing'; step++) {
      state = whoAreYa.submitGuess(state, decoys[step]);
    }
    check(state.status === 'lost', 'who-are-ya: a round of wrong guesses never ended');
  }
}

// ---------------------------------------------------------------- 5. Tenaball
for (const category of tenaball.availableCategories(dataset)) {
  let built = 0;
  const titles = new Set<string>();
  for (let i = 0; i < 60; i++) {
    const puzzle = tenaball.buildPuzzle(dataset, category.id, `tb-${category.id}-${i}`);
    if (!puzzle) continue;
    built++;
    titles.add(puzzle.title);
    check(puzzle.slots.length === tenaball.SLOTS, `tenaball ${category.id}: ${puzzle.slots.length} slots`);
    const ids = puzzle.slots.map((slot) => slot.player.id);
    check(new Set(ids).size === ids.length, `tenaball ${category.id}: duplicate player in the top 10`);

    // Every answer must be reachable by typing the player's name.
    for (const slot of puzzle.slots) {
      check(
        matchPlayer(slot.player.name, dataset.roster)?.id === slot.player.id,
        `tenaball ${category.id}: "${slot.player.name}" does not resolve by name`,
      );
    }

    // Play it out on Hard: all ten correct must win without losing a life.
    let state = tenaball.createGame(puzzle, 'hard');
    for (const slot of puzzle.slots) {
      const applied = tenaball.applyGuess(state, slot.player);
      check(applied.outcome.kind === 'correct', `tenaball ${category.id}: a listed player scored as wrong`);
      state = applied.state;
    }
    check(state.status === 'won', `tenaball ${category.id}: ten correct answers did not win`);
    check(state.lives === tenaball.HARD_LIVES, `tenaball ${category.id}: lost a life on a correct answer`);

    // Three wrong answers must end a Hard game.
    let hard = tenaball.createGame(puzzle, 'hard');
    const outsiders = dataset.players.filter(
      (player) => !ids.includes(player.id) && puzzle.valueOf(player) !== puzzle.slots[9].raw,
    );
    for (let k = 0; k < tenaball.HARD_LIVES; k++) hard = tenaball.applyGuess(hard, outsiders[k]).state;
    check(hard.status === 'lost', `tenaball ${category.id}: hard mode did not end after ${tenaball.HARD_LIVES} misses`);
  }
  check(built > 0, `tenaball: category ${category.id} never produced a puzzle`);
  notes.push(`tenaball ${category.id}: ${built}/60 built, ${titles.size} distinct board(s)`);
}

// -------------------------------------------------------------------- 6. List
{
  const criteria = buildListCriteria(dataset);
  check(criteria.length >= 20, `list: only ${criteria.length} criteria available`);
  const sizes = criteria.map((criterion) => criterion.answers.length);
  notes.push(
    `list: ${criteria.length} criteria, answer sets ${Math.min(...sizes)}–${Math.max(...sizes)} players`,
  );
  for (const criterion of criteria) {
    check(criterion.answers.length >= 6, `list: "${criterion.title}" has too few answers`);
    const ids = criterion.answers.map((player) => player.id);
    check(new Set(ids).size === ids.length, `list: "${criterion.title}" contains a duplicate player`);
    for (const player of criterion.answers) {
      check(
        matchPlayer(player.name, dataset.roster)?.id === player.id,
        `list: "${player.name}" does not resolve by name`,
      );
    }
  }
}

// ---------------------------------------------------------------- 7. Impostor
{
  let rounds = 0;
  for (let i = 0; i < 300; i++) {
    const round = impostor.createRound(dataset, `imp-${i}`);
    check(round !== null, 'impostor: could not build a round');
    if (!round) continue;
    rounds++;
    check(round.board.length >= 6 && round.board.length <= 8, `impostor: board of ${round.board.length}`);
    check(round.impostorIds.size >= 1 && round.impostorIds.size <= 3, 'impostor: bad impostor count');
    check(
      new Set(round.board.map((player) => player.id)).size === round.board.length,
      'impostor: the same player appears twice on a board',
    );
    for (const player of round.board) {
      const isImpostor = round.impostorIds.has(player.id);
      check(
        round.criterion.test(player) !== isImpostor,
        `impostor: ${player.name} is labelled wrongly for "${round.criterion.label}"`,
      );
    }

    // All at once: exactly the impostors wins, anything else loses.
    let all = impostor.createGame(round, 'all-at-once');
    for (const player of round.board) if (round.impostorIds.has(player.id)) all = impostor.toggle(all, player);
    check(impostor.check(all).status === 'won', 'impostor: the exact impostor set did not win');

    // One by one: every impostor in turn wins; a member ends it.
    let one = impostor.createGame(round, 'one-by-one');
    for (const player of round.board) if (round.impostorIds.has(player.id)) one = impostor.pick(one, player);
    check(one.status === 'won', 'impostor: catching every impostor one by one did not win');

    const member = round.board.find((player) => !round.impostorIds.has(player.id))!;
    check(
      impostor.pick(impostor.createGame(round, 'one-by-one'), member).status === 'lost',
      'impostor: picking a genuine member did not end the round',
    );
  }
  notes.push(`impostor: ${rounds}/300 rounds generated`);
}

// ------------------------------------------------------------- 8. Tic Tac Toe
{
  let boards = 0;
  for (let i = 0; i < 200; i++) {
    const board = ttt.generateBoard(dataset, `ttt-${i}`);
    check(board !== null, `tic-tac-toe: attempt ${i} produced no board`);
    if (!board) continue;
    boards++;

    for (let r = 0; r < ttt.SIZE; r++) {
      for (let c = 0; c < ttt.SIZE; c++) {
        const cell = board.candidates[r][c];
        check(cell.length > 0, `tic-tac-toe: empty cell at ${r},${c}`);
        for (const player of cell) {
          check(
            board.rows[r].test(player) && board.cols[c].test(player),
            `tic-tac-toe: ${player.name} does not satisfy cell ${r},${c}`,
          );
        }
      }
    }

    // Solve it cell by cell through the public API, taking the first candidate
    // the engine accepts. The deadlock guard must always leave a way forward.
    let state = ttt.createGame(board);
    for (let r = 0; r < ttt.SIZE; r++) {
      for (let c = 0; c < ttt.SIZE; c++) {
        let placed = false;
        for (const candidate of board.candidates[r][c]) {
          const applied = ttt.place(state, r, c, candidate);
          if (applied.outcome === 'placed') {
            state = applied.state;
            placed = true;
            break;
          }
          check(
            applied.outcome === 'already-used' || applied.outcome === 'deadlock',
            `tic-tac-toe: valid candidate rejected as "${applied.outcome}" at ${r},${c}`,
          );
        }
        check(placed, `tic-tac-toe: no playable candidate left for cell ${r},${c}`);
      }
    }
    check(state.status === 'won', 'tic-tac-toe: a solved board did not register as won');
    check(state.mistakes === 0, 'tic-tac-toe: solving cleanly still recorded a mistake');
  }
  notes.push(`tic-tac-toe: ${boards}/200 solvable boards generated`);
}

// ------------------------------------------------------------- 9. Connections
{
  let puzzles = 0;
  for (let i = 0; i < 200; i++) {
    const puzzle = connections.generatePuzzle(dataset, `cx-${i}`);
    check(puzzle !== null, `connections: attempt ${i} produced no board`);
    if (!puzzle) continue;
    puzzles++;

    check(puzzle.board.length === 16, `connections: board of ${puzzle.board.length}`);
    check(new Set(puzzle.board.map((p) => p.id)).size === 16, 'connections: duplicate player on the board');
    check(puzzle.groups.length === 4, `connections: ${puzzle.groups.length} groups`);
    for (const group of puzzle.groups) {
      check(group.players.length === 4, `connections: group "${group.label}" has ${group.players.length}`);
    }

    // Solve it group by group.
    let state = connections.createGame(puzzle);
    for (const group of puzzle.groups) {
      for (const player of group.players) state = connections.toggle(state, player);
      state = connections.submit(state);
    }
    check(state.status === 'won', 'connections: solving every group did not win');
    check(state.mistakes === 0, 'connections: a correct group counted as a mistake');

    // Four mistakes must end the board.
    let losing = connections.createGame(puzzle);
    for (let attempt = 0; attempt < connections.MAX_MISTAKES; attempt++) {
      const mixed = [
        puzzle.groups[0].players[0],
        puzzle.groups[1].players[0],
        puzzle.groups[2].players[0],
        puzzle.groups[3].players[attempt],
      ];
      for (const player of mixed) losing = connections.toggle(losing, player);
      losing = connections.submit(losing);
    }
    check(losing.status === 'lost', 'connections: four wrong submissions did not end the board');
  }
  notes.push(`connections: ${puzzles}/200 boards generated`);
}

// -------------------------------------------------------- 10. Guess the Player
for (const mode of ['exact', 'direction'] as const) {
  for (let i = 0; i < 120; i++) {
    const game = gtp.createGame(dataset.players, mode, `gp-${mode}-${i}`);
    check(game !== null, `guess-the-player: could not create a ${mode} game`);
    if (!game) continue;

    const won = gtp.submitGuess(game, game.secret);
    check(won.status === 'won', 'guess-the-player: guessing the secret did not win');
    check(
      won.rows[0].attributes.every((attribute) => attribute.state === 'hit'),
      'guess-the-player: the secret player did not score all hits',
    );

    // Eight wrong guesses must end the round.
    let state = game;
    const decoys = dataset.players.filter((player) => player.id !== game.secret.id);
    for (let step = 0; step < gtp.MAX_GUESSES; step++) state = gtp.submitGuess(state, decoys[step]);
    check(state.status === 'lost', 'guess-the-player: eight wrong guesses did not end the round');

    if (mode === 'exact') {
      const row = gtp.compare(decoys[0], game.secret, 'exact');
      const age = row.find((attribute) => attribute.key === 'age')!;
      check(age.direction === undefined, 'guess-the-player: exact mode leaked a direction arrow on age');
    }
  }
}

// ------------------------------------------------------------------- report --
console.log('--- game playability ---');
for (const note of notes) console.log('  ' + note);
if (problems.length) {
  console.log(`\n--- ${problems.length} PROBLEM(S) ---`);
  for (const problem of [...new Set(problems)].slice(0, 40)) console.log('  ! ' + problem);
  process.exitCode = 1;
} else {
  console.log('\nAll ten games are playable start to finish.');
}

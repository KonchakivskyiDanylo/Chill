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
import { loadRoster } from '@/data/liquipedia/roster';
import { GAMES, getGame } from '@/games/registry';
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

// ------------------------------------------------------------ 0. the registry
// Games look themselves up with `getGame('<id>')` while the router looks them
// up by slug, and a rename moves the slug away from the id. If either lookup
// misses, `meta` is undefined and the game crashes on its first render — so
// check both resolve to the same entry.
for (const game of GAMES) {
  check(getGame(game.slug) === game, `registry: getGame('${game.slug}') did not find ${game.title}`);
  check(getGame(game.id) === game, `registry: getGame('${game.id}') did not find ${game.title}`);
}

// --------------------------------------------------- 0. the fame ranking
// Every difficulty mode reads from this. If the JSON ever fails to load, the
// Dataset quietly falls back to a derived ranking and the modes keep "working"
// while asking about the wrong players — so fail loudly instead.
check(dataset.fameIsPublished, 'fame: fell back to the derived ranking, fame-ranking.json did not load');
const ranked = new Set(dataset.fame.map((entry) => entry.playerId));
check(
  dataset.roster.every((player) => ranked.has(player.id)),
  'fame: players are missing from the ranking — re-run fame_calculation.ipynb',
);
for (const tier of ['easy', 'medium', 'hard'] as const) {
  notes.push(`fame ${tier}: ${dataset.playersByTier(tier).length} playable of ${dataset.fame.filter((entry) => entry.tier === tier).length} ranked`);
}

// ------------------------------------------------------- 1. Higher or Lower
// The one game on the Liquipedia roster rather than the shared dataset, so it
// is driven through its own data here too.
const roster = await loadRoster();
notes.push(`roster: ${roster.players.length} Liquipedia players, generated ${roster.generatedAt}`);
for (const tier of ['easy', 'medium', 'hard'] as const) {
  notes.push(`roster ${tier}: ${roster.playersFor(tier).length} players`);
}

for (const category of ['age', 'earnings', 'fncsWins'] as const) {
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    // Built exactly as the game builds it, eligibility rule included.
    const pool = roster.playersFor(difficulty, {
      minimum: 2,
      eligible: (players) => hl.eligible(players, category),
    });
    let state = hl.createGame(pool, category, difficulty, `hl-${category}-${difficulty}`);
    check(state !== null, `higher-lower: could not start ${category}/${difficulty}`);
    if (!state) continue;

    // Widening into a neighbouring tier is a legitimate last resort. Age and
    // earnings never need it. FNCS Wins does: exactly one player outside the
    // top 20% of the ranking holds a title, so Hard has to borrow from Medium
    // or the category cannot be dealt at all.
    const offTier = pool.filter((player) => player.tier !== difficulty);
    if (category === 'fncsWins') {
      notes.push(
        `higher-lower fncsWins/${difficulty}: ${pool.length} in the pool` +
          (offTier.length ? `, ${offTier.length} borrowed from another tier` : ''),
      );
    } else {
      check(
        offTier.length === 0,
        `higher-lower ${category}/${difficulty}: widened into another tier for ${offTier.length} player(s)`,
      );
    }

    let rounds = 0;
    const seen: string[] = [];
    // One round per player, plus slack — the loop has to be able to reach a
    // full clear of a 4,500-player Hard pool, or the clear check is meaningless.
    const maxRounds = pool.length + 5;
    while (state.status !== 'cleared' && rounds < maxRounds) {
      rounds++;
      seen.push(state.challenger.id);
      // Without the Equal button a tie is answered either way.
      const truth = hl.correctAnswer(state);
      const answer = truth === 'equal' && !hl.hasEqualButton(difficulty) ? 'higher' : truth;
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
    check(
      new Set(seen).size === seen.length,
      `higher-lower ${category}/${difficulty}: a player was shown twice in one run`,
    );
    if (category === 'age') {
      notes.push(
        `higher-lower ${difficulty}: full clear = ${state.score} correct answers over ${state.poolSize} players`,
      );
    }
  }
}

// ------------------------------------------------------------------ 2. Wordle
for (const difficulty of ['easy', 'medium', 'hard'] as const) {
  const lengths = new Set<number>();
  for (let i = 0; i < 200; i++) {
    const pool = dataset.playersFor(difficulty, { minimum: 1, eligible: wordle.eligible });
    const game = wordle.createGame(pool, `w-${difficulty}-${i}`);
    check(game !== null, `wordle: could not create a ${difficulty} game`);
    if (!game) continue;
    lengths.add(game.answer.length);
    check(
      dataset.tierOf(game.secret) === difficulty,
      `wordle ${difficulty}: secret ${game.secret.name} is a ${dataset.tierOf(game.secret)} player`,
    );

    const solved = wordle.submitGuess(game, game.secret.name.toLowerCase());
    check(solved.ok && solved.state.status === 'won', `wordle: correct name did not win for ${game.secret.name}`);

    // A non-player string of the right length must be allowed.
    const filler = 'A'.repeat(game.answer.length);
    const fillerResult = wordle.submitGuess(game, filler);
    check(fillerResult.ok, 'wordle: a non-player guess of the right length was rejected');

    const wrongLength = wordle.submitGuess(game, 'A');
    check(!wrongLength.ok, 'wordle: a wrong-length guess was accepted');
  }
  notes.push(
    `wordle ${difficulty}: ${wordle.eligible(dataset.playersByTier(difficulty)).length} usable names, answer lengths ${[
      ...lengths,
    ]
      .sort((a, b) => a - b)
      .join(', ')}`,
  );
}

{
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

// ------------------------------------------------------------ 11. Giving up
// Every game has a give-up button, and every one of them must end the round
// from a mid-round state and then stay ended — a `giveUp` that left the status
// on 'playing' would render a board you cannot escape, and one that fired twice
// could resurrect a finished round.
{
  const ended = (status: string) => status !== 'playing';

  const hlPool = roster.playersFor('easy', {
    minimum: 2,
    eligible: (players) => hl.eligible(players, 'age'),
  });
  const hlGame = hl.createGame(hlPool, 'age', 'easy', 'giveup')!;
  const hlGone = hl.giveUp(hlGame);
  check(hlGone.status === 'gameover', `give up higher-lower: status is "${hlGone.status}"`);
  check(hl.giveUp(hlGone) === hlGone, 'give up higher-lower: a second give up changed the state');

  const rounds: [string, { status: string }, (s: never) => { status: string }][] = [
    ['wordle', wordle.createGame(dataset.playersFor('easy', { minimum: 1, eligible: wordle.eligible }))!, wordle.giveUp as never],
    ['career-path', career.createGame(dataset, 'order', 'giveup')!, career.giveUp as never],
    ['who-are-ya', whoAreYa.createGame(dataset, 'easy', 'giveup')!, whoAreYa.giveUp as never],
    ['tenaball', tenaball.createGame(tenaball.buildPuzzle(dataset, 'career-earnings', 'giveup')!, 'hard'), tenaball.giveUp as never],
    ['impostor', impostor.createGame(impostor.createRound(dataset, 'giveup')!, 'all-at-once'), impostor.giveUp as never],
    ['tic-tac-toe', ttt.createGame(ttt.generateBoard(dataset, 'giveup')!), ttt.giveUp as never],
    ['connections', connections.createGame(connections.generatePuzzle(dataset, 'giveup')!), connections.giveUp as never],
    ['guess-the-player', gtp.createGame(dataset.players, 'exact', 'giveup')!, gtp.giveUp as never],
  ];

  for (const [name, game, surrender] of rounds) {
    check(!ended(game.status), `give up ${name}: the fixture was already over before giving up`);
    const gone = surrender(game as never);
    check(gone.status === 'lost', `give up ${name}: status is "${gone.status}", expected "lost"`);
    check(surrender(gone as never) === gone, `give up ${name}: a second give up changed the state`);
  }
  notes.push(`give up: ${rounds.length + 1} engines end the round and stay ended`);
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

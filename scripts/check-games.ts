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
import { makeRng, shuffle } from '@/lib/rng';
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
// Played perfectly for forty rounds, five runs per level, checking the pairing
// keeps the promises the schedule makes: it opens on famous names, never
// leaves the level's cap, never deals a free tie, and once the schedule has
// reached "close" it never serves an obvious pair — the 1-versus-5 on round
// thirty that started all this.
for (const category of ['age', 'earnings', 'fncsWins'] as const) {
  const ranked = [...hl.eligible(roster.players, category)].sort((a, b) => b.earnings - a.earnings);
  const rank = new Map(ranked.map((player, index) => [player.id, index + 1]));
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    let rounds = 0;
    let onSchedule = 0;
    let ties = 0;
    let deepest = 0;
    for (let run = 0; run < 5; run++) {
      let state = hl.createGame(roster.players, category, difficulty, `hl-${category}-${difficulty}-${run}`);
      check(state !== null, `higher-lower: could not start ${category}/${difficulty}`);
      if (!state) continue;
      check(
        (rank.get(state.current.id) ?? Infinity) <= 20 && (rank.get(state.challenger.id) ?? Infinity) <= 20,
        `higher-lower ${category}/${difficulty}: round one was not top 20 against top 20`,
      );

      while (state.status === 'playing' && hl.roundOf(state) <= 40) {
        const round = hl.roundOf(state);
        const scheduled = hl.closenessFor(difficulty, round);
        const where = `${category}/${difficulty} run ${run} round ${round}`;
        rounds++;
        if (hl.fitsBand(state.current, state.challenger, category, scheduled)) onSchedule++;
        deepest = Math.max(deepest, rank.get(state.challenger.id) ?? Infinity);

        check(
          (rank.get(state.challenger.id) ?? Infinity) <= hl.WINDOW[difficulty].cap,
          `higher-lower ${where}: ${state.challenger.name} is outside the level's cap`,
        );
        const truth = hl.correctAnswer(state);
        if (truth === 'equal') ties++;
        check(
          truth !== 'equal' || hl.hasEqualButton(difficulty),
          `higher-lower ${where}: dealt a tie with no Equal button`,
        );
        if (category === 'fncsWins') {
          check(
            state.current.fncsWins > 0 || state.challenger.fncsWins > 0,
            `higher-lower ${where}: nought against nought`,
          );
        }
        if (category !== 'fncsWins' && (scheduled === 'close' || scheduled === 'very-close')) {
          check(
            !hl.fitsBand(state.current, state.challenger, category, 'obvious'),
            `higher-lower ${where}: served an obvious pair`,
          );
        }

        state = hl.submitAnswer(state, truth);
        check(state.status !== 'gameover', `higher-lower ${where}: perfect play lost`);
        if (state.status === 'gameover') break;
        state = hl.nextRound(state);
      }
    }
    const share = onSchedule / Math.max(rounds, 1);
    notes.push(
      `higher-lower ${category}/${difficulty}: ${rounds} rounds, ${Math.round(share * 100)}% in the ` +
        `scheduled band, deepest challenger #${deepest}, ${ties} ties`,
    );
    // FNCS Wins runs on small integers and a few hundred title-holders, so its
    // bands are often unreachable and the nearest miss stands in — measured,
    // not held to a number.
    if (category !== 'fncsWins') {
      check(share >= 0.7, `higher-lower ${category}/${difficulty}: only ${Math.round(share * 100)}% on schedule`);
    }
    // Legitimate ties must still not be the whole game.
    check(ties < rounds * 0.5, `higher-lower ${category}/${difficulty}: ${ties} of ${rounds} rounds were ties`);
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
// Every answerable player, both modes, two seeds each. What is asserted is
// what the clue picker promises: the ten describe one player and nobody else,
// the opening never hands over a signature result for a known name, Order
// reads by date, and a hand is never five of the same finish.
if (majors) {
  const answerable = majors.eligible(roster.players);
  check(answerable.length > 0, 'career-path: nobody is answerable');
  // Players whose whole record a partner shares. No hand can tell them apart,
  // so they are held to everything below except describing one player.
  const twinned = new Set(
    answerable
      .filter((p) => career.alsoFits(majors.resultsFor(p.id), p.id, majors).size > 0)
      .map((p) => p.id),
  );
  notes.push(
    `career-path: ${answerable.length} answerable, ${twinned.size} of them share a partner's whole ` +
      `record, ${majors.tournaments.length} majors`,
  );
  const guard = { easy: 3, medium: 2, hard: 0 } as const;

  for (const mode of ['order', 'random'] as const) {
    let hands = 0;
    let bands = 0;
    let samey = 0;
    let varied = 0;
    let long = 0;
    for (const secret of answerable) {
      const results = majors.resultsFor(secret.id);
      const [first, second] = ['a', 'b'].map((seed) =>
        career.createGame(secret, results, mode, majors, `cp-${mode}-${seed}-${secret.id}`),
      );
      if (!first || !second) {
        check(false, `career-path: could not start on ${secret.name}`);
        continue;
      }
      for (const game of [first, second]) {
        hands++;
        const clues = game.clues.map((clue) => clue.result);
        check(clues.length <= career.MAX_CLUES, `career-path: ${secret.name} got ${clues.length} clues`);
        check(
          clues.length === Math.min(career.MAX_CLUES, results.length),
          `career-path: ${secret.name} got ${clues.length} clues from ${results.length} results`,
        );

        const others = career.alsoFits(clues, secret.id, majors);
        check(
          others.size === 0 || twinned.has(secret.id),
          `career-path ${mode}: ${secret.name}'s clues also describe ${[...others].slice(0, 2).join(', ')}`,
        );

        // A known name never opens on the result that gives them away — as far
        // as the career has ordinary results to open on instead.
        const ordinary = clues.filter((clue) => !career.isSignature(clue)).length;
        const opening = Math.min(guard[secret.tier], ordinary);
        if (results.length > career.MAX_CLUES || mode === 'random') {
          check(
            clues.slice(0, opening).every((clue) => !career.isSignature(clue)),
            `career-path ${mode}: ${secret.name} opens on a signature result`,
          );
        }

        if (mode === 'order') {
          for (let i = 1; i < clues.length; i++) {
            check(
              clues[i - 1].tournament.date <= clues[i].tournament.date,
              `career-path: ${secret.name}'s story is out of order at clue ${i}`,
            );
          }
        }

        bands += new Set(clues.map((clue) => career.finishBand(clue.placement))).size;
        const same = Math.max(
          ...[...new Set(clues.map((clue) => clue.placement))].map(
            (place) => clues.filter((clue) => clue.placement === place).length,
          ),
        );
        // Only a hand with a choice counts: a five-major career of five wins
        // is what it is.
        if (same >= 5 && results.length > career.MAX_CLUES) samey++;

        const solved = career.submitGuess(game, secret);
        check(solved.status === 'won', `career-path: correct guess did not win on ${secret.name}`);
        check(
          solved.revealed === game.clues.length,
          `career-path: winning on ${secret.name} left ${solved.revealed}/${game.clues.length} clues hidden`,
        );
      }
      if (results.length > 15) {
        long++;
        const key = (game: career.GameState) =>
          game.clues.map((clue) => clue.result.tournament.name).sort().join('|');
        if (key(first) !== key(second)) varied++;
      }
    }
    check(samey === 0, `career-path ${mode}: ${samey} hands repeat one placement five times`);
    notes.push(
      `career-path ${mode}: ${hands} hands, ${(bands / Math.max(hands, 1)).toFixed(1)} finish bands each, ` +
        `${varied}/${long} long careers dealt a different hand on a second meeting`,
    );
  }

  // The round the old picker served: Bugha opening on the World Cup.
  const bugha = answerable.find((p) => p.name === 'Bugha');
  if (bugha) {
    const game = career.createGame(bugha, majors.resultsFor(bugha.id), 'order', majors, 'bugha');
    const opening = game?.clues[0]?.result;
    notes.push(`career-path: Bugha's Order path opens on ${opening?.tournament.shortName} (${opening?.placement})`);
    check(
      !opening?.tournament.name.startsWith('Fortnite World Cup'),
      "career-path: Bugha's path still opens on the World Cup",
    );
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
  // Built the way the game builds it: the board around one level's fame band,
  // the guess box open to the whole roster.
  const bands = { easy: ['easy'], medium: ['easy', 'medium'], hard: ['easy', 'medium', 'hard'] } as const;
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const answers = bands[difficulty].flatMap((band) =>
      roster.exactly(band, { eligible: facts.eligible(3) }),
    );
    const pools = { answers, accepted: roster.players };
    const answerIds = new Set(answers.map((p) => p.id));
    let boards = 0;
    let offers = 0;
    let autoPlaced = 0;
    // Placed players from outside the level's band. The band builds the board;
    // it must never decide who you are allowed to answer with.
    let outsiders = 0;
    for (let seed = 0; seed < 25; seed++) {
      const board = ttt.generateBoard({ facts, orgs }, pools, difficulty, `t-${difficulty}-${seed}`);
      if (!board) continue;
      boards++;
      // The level's promise: enough answers from its own band in every cell.
      for (const row of board.candidates) {
        for (const cell of row) {
          const known = cell.filter((p) => answerIds.has(p.id)).length;
          check(
            known >= ttt.LEVELS[difficulty].answers,
            `tic-tac-toe ${difficulty}: board ${seed} has a cell with ${known} answers from its band`,
          );
        }
      }

      // Play it in a scrambled order, submitting whoever fits some empty cell.
      // This is the path that used to dead-end: a player offered two cells,
      // one of which stranded a third.
      let game = ttt.createGame(board, difficulty);
      // One pass is enough: a cell only ever closes, so anyone who fits an
      // open cell now was offered it on their turn.
      const order = shuffle(makeRng(`t-order-${seed}`), board.candidates.flat(2));
      for (const candidate of order) {
        if (game.status !== 'playing') break;
        if ([...game.filled.values()].some((p) => p.id === candidate.id)) continue;
        const open = board.rows.some((row, r) =>
          board.cols.some(
            (col, c) => !game.filled.has(ttt.cellKey(r, c)) && row.test(candidate) && col.test(candidate),
          ),
        );
        if (!open) continue;
        const result = ttt.submit(game, candidate);
        check(
          result.outcome.kind !== 'deadlock',
          `tic-tac-toe ${difficulty}: board ${seed} refused ${candidate.name}, who fits an open cell`,
        );
        if (result.outcome.kind === 'placed') {
          autoPlaced++;
          if (!answerIds.has(candidate.id)) outsiders++;
          game = result.state;
        } else if (result.outcome.kind === 'choose') {
          offers++;
          // Every offered cell has to be one the move can actually go to.
          for (const cell of result.outcome.cells) {
            const tried = ttt.place(game, cell, candidate);
            check(
              tried.outcome.kind === 'placed',
              `tic-tac-toe ${difficulty}: board ${seed} offered ${candidate.name} a cell that strands another`,
            );
          }
          game = ttt.place(game, result.outcome.cells[0], candidate).state;
          if (!answerIds.has(candidate.id)) outsiders++;
        }
      }
      check(
        game.status === 'won',
        `tic-tac-toe ${difficulty}: board ${seed} could not be completed (${game.filled.size}/9)`,
      );
      check(game.mistakes === 0, `tic-tac-toe ${difficulty}: board ${seed} charged a mistake on perfect play`);
    }
    check(boards >= 22, `tic-tac-toe ${difficulty}: only ${boards} of 25 seeds produced a board`);
    if (difficulty !== 'hard') {
      check(outsiders > 0, `tic-tac-toe ${difficulty}: nobody from outside the band was ever placed`);
    }
    notes.push(
      `tic-tac-toe ${difficulty}: ${boards}/25 boards over a ${answers.length}-player band, ` +
        `${autoPlaced} placed by typing alone, ${offers} asked which cell, ` +
        `${outsiders} placed from outside the band`,
    );
  }

  // Nobody reads "won in Europe" off a Globals any more.
  {
    const all = buildCriteria({ players: roster.players, facts, orgs }, { minMatches: 1, maxShare: 1 });
    const eu = all.find((criterion) => criterion.id === 'won-fncs:Europe');
    const cooper = roster.players.find((p) => p.name === 'Cooper' && facts.of(p.id).wins.global > 0);
    check(Boolean(eu), 'criteria: no "Won EU FNCS" rule');
    if (eu && cooper) {
      check(!eu.test(cooper), 'criteria: Cooper counts as an EU FNCS winner for the Copenhagen Globals');
    }
  }

  const easyPools = {
    answers: roster.exactly('easy', { eligible: facts.eligible(3) }),
    accepted: roster.players,
  };

  // A player who fits nothing must be rejected, not placed.
  {
    const board = ttt.generateBoard({ facts, orgs }, easyPools, 'easy', 'reject');
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
    const board = ttt.generateBoard({ facts, orgs }, easyPools, 'hard', 'hard');
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
  let crossed = 0;
  for (let seed = 0; seed < 40; seed++) {
    const puzzle = connections.generatePuzzle(source, `c-${seed}`);
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

    // The promise the overlap rework has to keep: one way to split the sixteen.
    const ways = connections.solutions(puzzle, source);
    check(ways === 1, `connections: puzzle ${seed} splits ${ways} ways, not 1`);
    // And the reason for the rework: somebody on the board fits two groups.
    const traps = connections.overlap(puzzle, source);
    check(
      traps >= connections.MIN_TRAPS,
      `connections: puzzle ${seed} has ${traps} players fitting two groups`,
    );
    crossed += traps;
  }
  check(puzzles >= 35, `connections: only ${puzzles} of 40 seeds produced a board`);
  notes.push(
    `connections: ${puzzles} of 40 seeds produced a board, ` +
      `${(crossed / Math.max(puzzles, 1)).toFixed(1)} overlapping players each`,
  );

  // A near miss must report how many belonged to one group.
  {
    const puzzle = connections.generatePuzzle(source, 'near');
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

  const extras: gtp.Extras = {
    fncsFinals: facts ? (id) => facts.of(id).fncsApps : undefined,
    together: teammates ? (a, b) => teammates.together(a, b) : undefined,
  };
  const columns = 6 + (facts ? 1 : 0) + (teammates ? 1 : 0);

  for (const mode of ['exact', 'direction'] as const) {
    const drawn = deal(pool, [], `gtp-${mode}`);
    if (!drawn) continue;
    const game = gtp.gameFor(drawn.pick, mode, extras);
    const won = gtp.submitGuess(game, drawn.pick);
    check(
      won.rows[0].attributes.length === columns,
      `guess-the-player: ${won.rows[0].attributes.length} columns, expected ${columns}`,
    );
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

  // Played together: a duo that has entered 100+ events is green both ways, a
  // pair that never has is red — and nothing is ever amber any more.
  if (teammates) {
    const peterbot = pool.find((p) => p.name === 'Peterbot');
    const pollo = pool.find((p) => p.name === 'Pollo');
    if (peterbot && pollo) {
      const cell = (guess: RosterPlayer, secret: RosterPlayer) =>
        gtp.compare(guess, secret, 'direction', extras).find((a) => a.key === 'together');
      notes.push(`guess-the-player: Pollo on Peterbot reads "${cell(pollo, peterbot)?.display}"`);
      check(cell(pollo, peterbot)?.state === 'hit', 'guess-the-player: Pollo is not green on Peterbot');
      check(cell(peterbot, pollo)?.state === 'hit', 'guess-the-player: Peterbot is not green on Pollo');
      const stranger = pool.find((p) => teammates.together(p.id, peterbot.id) === 0 && p.id !== peterbot.id);
      if (stranger) {
        check(cell(stranger, peterbot)?.state === 'miss', `guess-the-player: ${stranger.name} is green on Peterbot`);
      }
    }
  }
  for (const secret of pool.slice(0, 50)) {
    for (const guess of pool.slice(50, 70)) {
      const states = gtp.compare(guess, secret, 'direction', extras).map((a) => a.state as string);
      check(!states.includes('close'), 'guess-the-player: a cell came back amber');
    }
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

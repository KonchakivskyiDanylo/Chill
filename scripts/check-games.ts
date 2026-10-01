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
 * `scripts/build_data.py` and may legitimately not exist yet — the
 * sections that need them are skipped with a note rather than failing, so this
 * is still useful on a fresh clone.
 */
import { loadRoster, EXPORT_DATE, Roster, type LiquipediaRow, type RosterPlayer } from '@/data/liquipedia/roster';
import { loadJson } from '@/data/liquipedia/files';
import { loadMajors } from '@/data/liquipedia/majors';
import { loadTeammates } from '@/data/liquipedia/teammates';
import { loadFacts } from '@/data/liquipedia/facts';
import { loadOrgs } from '@/data/liquipedia/orgs';
import { loadPools } from '@/data/liquipedia/pools';
import { loadRankings, membersOf } from '@/data/liquipedia/rankings';
import { deal, dealInTurn, dealWeighted } from '@/games/shared/rotation';
import { TERMS, termsIn, type TermId } from '@/games/shared/glossary';
import { DEFAULT_POOL, RANDOM_MIX } from '@/games/shared/pool';
import { pickFresh, type PuzzleStatus } from '@/games/shared/progress';
import { GAMES, getGame, VISIBLE_GAMES } from '@/games/registry';
import {
  buildCriteria,
  hasNestedPair,
  isNested,
  NEAR_NESTED,
  type CriteriaSource,
  type PlayerCriterion,
} from '@/games/shared/criteria';
import { makeRng, shuffle } from '@/lib/rng';
import { aggregate, playerIndex, playerLens } from '@/analytics/aggregate';
import {
  GAME_IDS,
  MAX_RECORD_BYTES,
  RECORD_VERSION,
  type GameId,
  type RoundRecord,
  type Stored,
} from '@/analytics/types';
import { matchPlayer, suggestPlayers } from '@/lib/text';

import * as hl from '@/games/higher-lower/engine';
import * as wordle from '@/games/wordle/engine';
import * as career from '@/games/career-path/engine';
import * as whoAreYa from '@/games/who-are-ya/engine';
import * as tenaball from '@/games/tenaball/engine';
import { buildCriteria as buildListCriteria, buildPoolCriteria } from '@/games/list/criteria';
import { poolBoards } from '@/games/tenaball/pool-boards';
import { derivedBoards } from '@/games/tenaball/derived-boards';
import * as griefer from '@/games/impostor/engine';
import * as ttt from '@/games/tic-tac-toe/engine';
import * as connections from '@/games/connections/engine';
import * as gtp from '@/games/guess-the-player/engine';
import * as pyramid from '@/games/pyramid/engine';
import * as bingo from '@/games/bingo/engine';

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
// Every game records its rounds under an id the analytics know, and every id has a game.
check(
  GAMES.length === GAME_IDS.length && GAME_IDS.every((id) => GAMES.some((game) => game.id === id)),
  `registry: ${GAMES.length} games but ${GAME_IDS.length} analytics ids`,
);
// Hidden games leave the lists, not the registry: they are still played below.
check(
  VISIBLE_GAMES.length > 0 && VISIBLE_GAMES.every((game) => !game.hidden),
  'registry: a hidden game is still listed',
);
notes.push(
  `registry: ${VISIBLE_GAMES.length} games listed, hidden: ${GAMES.filter((g) => g.hidden).map((g) => g.title).join(', ') || 'none'}`,
);

const roster = await loadRoster();
notes.push(`roster: ${roster.players.length} playable players (export ${EXPORT_DATE})`);

// roster.json is players.json with the unused columns and empty values left
// out. It must give the games exactly the same players, field for field.
{
  const slim = await optional(() => loadJson('roster'), 'roster: roster.json (run scripts/build_data.py)');
  if (slim) {
    const today = new Date();
    const full = new Roster((await loadJson('players')) as LiquipediaRow[], today).players;
    const lean = new Roster(slim as LiquipediaRow[], today).players;
    check(full.length === lean.length, `roster: roster.json has ${lean.length} players, players.json ${full.length}`);
    const differ = full.filter((player, i) => JSON.stringify(player) !== JSON.stringify(lean[i]));
    check(differ.length === 0, `roster: roster.json reads differently for ${differ.slice(0, 3).map((p) => p.name).join(', ')}`);
    if (differ.length === 0) notes.push(`roster: roster.json gives the same ${lean.length} players as players.json`);
  }
}
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
// thirty that started all this. And that the answers cannot be read off the
// board: not by flipping the last one, not by the nought on the left.
// FNCS Finals reads `facts.json`, attached to the roster the way the page does it.
const contenders: hl.Contender[] = facts
  ? roster.players.map((p) => ({ ...p, fncsFinals: facts.of(p.id).fncsApps }))
  : roster.players;
const hlCategories: hl.Category[] = facts ? ['age', 'earnings', 'fncsWins', 'fncsFinals'] : ['age', 'earnings', 'fncsWins'];
/**
 * The run checks for one category over one set of players. `tag` names it in
 * the output — the category, or Placement and the event it is about.
 */
function checkHigherLower(contenders: readonly hl.Contender[], category: hl.Category, tag: string = category) {
  const ranked = [...hl.eligible(contenders, category)].sort((a, b) => b.earnings - a.earnings);
  const rank = new Map(ranked.map((player, index) => [player.id, index + 1]));
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    let rounds = 0;
    let onSchedule = 0;
    let ties = 0;
    let deepest = 0;
    // Consecutive answers that flipped direction, and shown noughts that went
    // up — the two ways Hard's FNCS Wins could be read without knowing anyone.
    let turns = 0;
    let flips = 0;
    let fromNought = 0;
    let noughtUp = 0;
    for (let run = 0; run < 5; run++) {
      let state = hl.createGame(contenders, category, difficulty, `hl-${tag}-${difficulty}-${run}`);
      check(state !== null, `higher-lower: could not start ${tag}/${difficulty}`);
      if (!state) continue;
      check(
        (rank.get(state.current.id) ?? Infinity) <= 20 && (rank.get(state.challenger.id) ?? Infinity) <= 20,
        `higher-lower ${tag}/${difficulty}: round one was not top 20 against top 20`,
      );

      let previous: hl.Answer | null = null;
      while (state.status === 'playing' && hl.roundOf(state) <= 40) {
        const round = hl.roundOf(state);
        const scheduled = hl.closenessFor(difficulty, round);
        const where = `${tag}/${difficulty} run ${run} round ${round}`;
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
        if (previous && previous !== 'equal' && truth !== 'equal') {
          turns++;
          if (previous !== truth) flips++;
        }
        previous = truth;
        if (category === 'fncsWins' && state.current.fncsWins === 0) {
          fromNought++;
          if (truth === 'higher') noughtUp++;
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
    const flipped = flips / Math.max(turns, 1);
    notes.push(
      `higher-lower ${tag}/${difficulty}: ${rounds} rounds, ${Math.round(share * 100)}% in the ` +
        `scheduled band, deepest challenger #${deepest}, ${ties} ties, ` +
        `${Math.round(flipped * 100)}% of answers flipped direction`,
    );
    // An answer that just went up used to be followed by one going down: 93%
    // of Hard's FNCS answers flipped, so "the opposite of last time" won the
    // game. A fair coin flips half the time; three in four is the alarm.
    check(
      flipped < 0.75,
      `higher-lower ${tag}/${difficulty}: ${Math.round(flipped * 100)}% of answers flipped direction`,
    );
    // On Hard a shown nought can be equal, and must sometimes be — it used to
    // go up every time, because nought against nought was never dealt.
    if (category === 'fncsWins' && difficulty === 'hard') {
      check(fromNought > 0, 'higher-lower fncsWins/hard: no nought was ever shown');
      check(
        noughtUp < fromNought * 0.75,
        `higher-lower fncsWins/hard: ${noughtUp} of ${fromNought} shown noughts went up`,
      );
    }
    // FNCS Wins runs on small integers and a few hundred title-holders, so its
    // bands are often unreachable and the nearest miss stands in — measured,
    // not held to a number.
    if (category !== 'fncsWins') {
      check(share >= 0.7, `higher-lower ${tag}/${difficulty}: only ${Math.round(share * 100)}% on schedule`);
    }
    // Legitimate ties must still not be the whole game.
    check(ties < rounds * 0.5, `higher-lower ${tag}/${difficulty}: ${ties} of ${rounds} rounds were ties`);
  }
}
for (const category of hlCategories) checkHigherLower(contenders, category);

// Placement counts down: 1st is higher than 10th, and nine places of fifty is
// a close pair. Runs over a real field are in section 12, once cell 5 has
// written an event's results.
{
  const [a, b] = roster.players;
  const first: hl.Contender = { ...a, placement: { place: 1, of: 50 } };
  const tenth: hl.Contender = { ...b, placement: { place: 10, of: 50 } };
  check(hl.valueOf(first, 'placement') > hl.valueOf(tenth, 'placement'), 'higher-lower placement: 1st is not higher than 10th');
  check(hl.fitsBand(first, tenth, 'placement', 'close'), 'higher-lower placement: 1st against 10th of 50 is not close');
  const placed = hl.withPlacements([a, b], { [a.id]: 3 });
  check(
    hl.eligible(placed, 'placement').length === 1 && placed[0].placement?.of === 3,
    'higher-lower placement: withPlacements attached the wrong finishes',
  );
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

  // The digit help per difficulty, three guesses into a round on a digit
  // answer: Easy hands over the digit and greens its key, Medium a # and no
  // key, Hard nothing at all.
  const digital = pool.find((p) => wordle.revealSchedule(wordle.gameFor(p).answer).size > 0);
  if (digital) {
    const help = (level: 'easy' | 'medium' | 'hard') => {
      let state = wordle.gameFor(digital, level);
      const filler = ['Q', 'X', 'Z'].map((c) => c.repeat(state.answer.length));
      for (const guess of filler) {
        const next = wordle.submitGuess(state, guess);
        if (next.ok) state = next.state;
      }
      const shown = [...wordle.revealedDigits(state).values()];
      const keyed = [...wordle.keyboardState(state)].filter(([key, s]) => /\d/.test(key) && s === 'correct');
      return { shown, keyed: keyed.length };
    };
    const easy = help('easy');
    const medium = help('medium');
    const hard = help('hard');
    check(easy.shown.length === 1 && /\d/.test(easy.shown[0]) && easy.keyed === 1, `fortnitedle easy: ${digital.name} digit not handed over`);
    check(medium.shown.join() === wordle.HIDDEN_DIGIT && medium.keyed === 0, `fortnitedle medium: ${digital.name} showed ${medium.shown.join()} with ${medium.keyed} keys`);
    check(hard.shown.length === 0 && hard.keyed === 0, `fortnitedle hard: ${digital.name} gave a digit away`);
  }
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

  // Every round gets MIN_GUESSES guesses, however short the career: an event
  // field's two-major qualifier plays two clues, then three spare guesses that
  // reveal nothing. A ten-clue round is unchanged — its tenth wrong guess ends it.
  const [secret, ...others] = answerable;
  const wrongs = (game: career.GameState, n: number) =>
    others.slice(0, n).reduce((state, other) => career.submitGuess(state, other), game);
  const two = career.createGame(secret, majors.resultsFor(secret.id).slice(0, 2), 'order', majors, 'short')!;
  const fourIn = wrongs(two, career.MIN_GUESSES - 1);
  check(
    fourIn.status === 'playing' && career.guessesLeft(fourIn) === 1,
    `career-path: a two-clue round ended or miscounted after ${career.MIN_GUESSES - 1} wrong guesses`,
  );
  const fiveIn = wrongs(two, career.MIN_GUESSES);
  check(fiveIn.status === 'lost' && career.record(fiveIn).outcome === 'lost', 'career-path: a two-clue round outlived its guesses');
  check(
    career.record(career.giveUp(wrongs(two, 3))).outcome === 'gave-up',
    'career-path: giving up on the spare guesses was recorded as running out',
  );
  const full = career.createGame(secret, majors.resultsFor(secret.id), 'order', majors, 'full')!;
  if (full.clues.length === career.MAX_CLUES) {
    check(wrongs(full, career.MAX_CLUES - 1).status === 'playing', 'career-path: a ten-clue round ended early');
    check(wrongs(full, career.MAX_CLUES).status === 'lost', 'career-path: a ten-clue round outlived its clues');
  }

  // An event field reaches its short careers; the roster does not.
  for (const pool of pools.pools) {
    const inPool = roster.players.filter((p) => pool.players.includes(p.id));
    const reached = majors.inField(inPool).length;
    const long = majors.eligible(inPool).length;
    check(reached >= long, `career-path: ${pool.label} lost players to the field rule`);
    notes.push(`career-path ${pool.label}: ${reached} of ${inPool.length} answerable (${long} with ${majors.minAppearances}+ majors)`);
  }
}

// ------------------------------------------------------------- 5. Who Are Ya
if (teammates && facts) {
  const byId = new Map(roster.players.map((p) => [p.id, p]));
  const answerable = roster.players.filter(
    (p) =>
      whoAreYa.usableClues(teammates.cluesFor(p.id, byId)).length >= whoAreYa.MIN_CLUES &&
      facts.of(p.id).apps >= whoAreYa.MIN_TOURNAMENTS,
  );
  check(answerable.length > 0, 'who-are-ya: nobody is answerable');
  notes.push(
    `who-are-ya: ${answerable.length} answerable (${whoAreYa.MIN_CLUES}+ teammates, ${whoAreYa.MIN_TOURNAMENTS}+ majors)`,
  );

  let early = 0;
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
      check(
        game.clues.every((clue) => clue.events >= whoAreYa.MIN_SHARED),
        `who-are-ya: ${secret.name}'s hand has a teammate under ${whoAreYa.MIN_SHARED} shared tournaments`,
      );
      // The number one teammate: last in the two ramped orders, and never in
      // the first four of Random.
      const top = game.clues.findIndex((clue) => clue.player.id === clues[0].player.id);
      if (mode === 'random') {
        if (top < Math.min(whoAreYa.TOP_HELD_BACK, game.clues.length - 1)) early++;
      } else {
        check(top === game.clues.length - 1, `who-are-ya ${mode}: ${secret.name}'s top teammate is not last`);
      }
      const solved = whoAreYa.submitGuess(game, secret);
      check(solved.status === 'won', 'who-are-ya: correct guess did not win');
      check(
        solved.revealed === game.clues.length,
        `who-are-ya: winning on ${secret.name} left ${solved.revealed}/${game.clues.length} clues hidden`,
      );
    }
  }
  check(early === 0, `who-are-ya random: the top teammate came in the first ${whoAreYa.TOP_HELD_BACK} clues ${early} times`);

  // A two-teammate hand — an event field's short record — still plays five
  // wrong guesses, and giving up on the spares is not running out.
  const secret = answerable[0];
  const two = whoAreYa.createGame(secret, teammates.cluesFor(secret.id, byId).slice(0, 2), 'easy', 'short')!;
  const others = roster.players.filter((p) => p.id !== secret.id);
  const wrongs = (n: number) => others.slice(0, n).reduce((state, p) => whoAreYa.submitGuess(state, p), two);
  check(wrongs(career.MIN_GUESSES - 1).status === 'playing', 'who-are-ya: a two-clue hand ended before five guesses');
  check(wrongs(career.MIN_GUESSES).status === 'lost', 'who-are-ya: a two-clue hand outlived five guesses');
  check(whoAreYa.record(whoAreYa.giveUp(wrongs(3))).outcome === 'gave-up', 'who-are-ya: giving up on the spares read as running out');
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

    if (board.shareCut) {
      // Level at the cut: the 11th fills 10th, and the 10th is then told it is level.
      const tenth = board.rows[tenaball.SLOTS - 1];
      check(tenth.value === board.next.value, `tenaball: ${board.id} shares a cut that is not level`);
      let shared = tenaball.createGame(board, 'hard');
      for (const key of spare) shared = tenaball.applyGuess(shared, key).state;
      check(shared.found.has(tenaball.SLOTS), `tenaball: ${board.id}'s level 11th did not fill 10th`);
      const other = tenaball.applyGuess(shared, membersOf(tenth)[0].key);
      check(
        other.outcome.kind === 'level' && other.state.lives === tenaball.HARD_LIVES,
        `tenaball: ${board.id}'s 10th after its level 11th read ${other.outcome.kind}`,
      );
    } else {
      // The 11th must be a free near miss, not a mistake.
      const near = tenaball.applyGuess(tenaball.createGame(board, 'hard'), spare[0], board.next.label);
      check(near.outcome.kind === 'tied', `tenaball: ${board.id} punished its own 11th place`);
      check(near.state.lives === tenaball.HARD_LIVES, `tenaball: ${board.id} charged a life for the 11th`);
    }
  }

  // The average-finish boards. The user's worked example is Vico at 2026's
  // five majors, 1 + 3 + 1 + 3 + 20 = 5.6; Peterbot's 2024 FNCS was 2nd, 1st
  // and 1st in NA Central, 4 / 3.
  const year = facts?.season?.year ?? 2026;
  const europe = rankings.get(`season:${year}:Europe`);
  const naCentral = rankings.get('fncs-avg:2024:NA Central');
  if (!europe || !naCentral) {
    skipped.push('tenaball: the average-finish boards (rankings.json is older — run build_data.py)');
  } else {
    const vico = europe.rows.find((row) => row.key === 'Vic0try0na');
    check(vico?.display === '5.6', `tenaball: Vic0try0na reads ${vico?.display} on Europe's 2026 board, not 5.6`);
    const peterbot = naCentral.rows.find((row) => row.key === 'Peterbot');
    check(
      peterbot?.display === '1.3',
      `tenaball: Peterbot reads ${peterbot?.display} on NA Central's 2024 FNCS board, not 1.3`,
    );
    // Cold played EWC and the Summit with Rapid, Major 2 and the Globals with
    // Ritual: as a duo, either pair missed two of the five, at 100th each.
    const duos = rankings.get(`season:${year}:duos`);
    check(Boolean(duos), 'tenaball: no top 10 duos of the season');
    check(
      !duos?.rows.some((row) => membersOf(row).some((member) => member.key === 'Cold')),
      'tenaball: Cold is in a top 10 duo',
    );
    // A miss is twice a full lobby's last place, 200th at the most, so no
    // average can be worse than that.
    for (const board of rankings.boards.filter((b) => /^(season|fncs-avg):/.test(b.id))) {
      check(board.lowerIsBetter === true, `tenaball: ${board.id} is an average that is not lower-is-better`);
      check(
        [...board.rows, board.next].every((row) => row.value <= 200),
        `tenaball: ${board.id} has an average worse than a missed solo final`,
      );
    }
    for (const key of ['world', 'Europe', 'NA Central', 'NA West', 'duos']) {
      const board = rankings.get(`season:${year}:${key}`);
      if (!board) {
        notes.push(`tenaball: no ${year} "${key}" board — 11th and 12th are level too, or fewer than eleven`);
        continue;
      }
      const cut = board.shareCut ? ` (10th shared with ${board.next.label})` : '';
      notes.push(`tenaball: ${board.title} — ${board.rows.map((row) => row.label).join(', ')}${cut}`);
    }
  }

  // Div Cups and Performance Evaluations. C7S4's Div Cups carry C7S3's names,
  // so both seasons have to come out as boards of their own — merged, C7S4
  // would have no weeks and C7S3 eight.
  const divcups = rankings.boards.filter((b) => b.id.startsWith('divcup:'));
  if (divcups.length === 0) {
    skipped.push('tenaball: the Div Cup boards (rankings.json is older — run build_data.py)');
  } else {
    const finals = rankings.get('divcup:finals:all:world');
    check(
      finals?.rows[0].key === 'Eomzo' && finals.rows[0].value === 62,
      `tenaball: Div Cup finals all time opens on ${finals?.rows[0].label} ${finals?.rows[0].value}, not Eomzo 62`,
    );
    for (const season of ['C7S3', 'C7S4']) {
      const board = rankings.get(`divcup:average:${season}:world`);
      check(Boolean(board), `tenaball: no ${season} Div Cup average board`);
      check(Boolean(board?.tieRule.includes('the 4 Div Cup weeks')), `tenaball: ${season} is not four weeks of Div Cups`);
    }
    for (const board of divcups) {
      if (board.id.startsWith('divcup:average')) {
        check(board.lowerIsBetter === true, `tenaball: ${board.id} is an average that is not lower-is-better`);
        check(
          [...board.rows, board.next].every((row) => row.value <= 100),
          `tenaball: ${board.id} averages worse than a missed week`,
        );
      } else {
        check(board.rows.every((row) => row.value > 0), `tenaball: ${board.id} lists someone on nothing`);
      }
    }
    const fpe = rankings.boards.filter((b) => b.id.startsWith('fpe:'));
    check(fpe.length > 0, 'tenaball: no Performance Evaluation boards');
    notes.push(`tenaball: ${divcups.length} Div Cup boards, ${fpe.length} Performance Evaluation boards`);
  }
  for (const [group, count] of [...byGroup].sort((a, b) => b[1] - a[1])) {
    notes.push(`  ${group}: ${count}`);
  }
  check(byGroup.size >= 4, `tenaball: only ${byGroup.size} category groups`);
}

// Boards built in the browser — each event field's, and the derived all-time
// ones — never let the alphabet decide who is 10th. A level cut means the
// board is not built at all, and no rule may promise a split by name.
{
  const byId = new Map(roster.players.map((p) => [p.id, p]));
  const built = [
    ...derivedBoards(roster.players),
    ...pools.pools.flatMap((pool) =>
      poolBoards(pool, pool.players.flatMap((id) => byId.get(id) ?? []), facts, orgs),
    ),
  ];
  for (const board of built) {
    check(!/alphabet|by name/i.test(board.tieRule), `tenaball: ${board.id} still breaks ties by name`);
    const tenth = board.rows[tenaball.SLOTS - 1];
    // Level on the value is fine when the rule has something under it.
    if (tenth.value === board.next.value) {
      check(/earnings|born/i.test(board.tieRule), `tenaball: ${board.id} is level at the cut with no tiebreak`);
    }
  }
  notes.push(`tenaball: ${built.length} boards built in the browser (derived + event fields)`);
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
  // Countries, not players: one FNCS winner puts a country on it.
  const winning = criteria.find((criterion) => criterion.id === 'countries-fncs');
  check(Boolean(winning), 'list: no "Countries with an FNCS winner"');
  if (winning) {
    const expected = new Set(roster.players.filter((p) => p.fncsWins > 0).flatMap((p) => p.countryName ?? []));
    check(
      winning.answers.length === expected.size && winning.answers.every((answer) => expected.has(answer.id)),
      'list: "Countries with an FNCS winner" is not the set of the winners’ countries',
    );
    notes.push(`list: ${winning.answers.length} countries with an FNCS winner`);
  }
  // Div Cup and Evaluation lists come finished in facts.json: a winners list
  // for every region, and every season's "played them all".
  if (facts.lists.length === 0) {
    skipped.push('list: the Div Cup lists (facts.json is older — run build_data.py)');
  } else {
    const ids = new Set(criteria.map((criterion) => criterion.id));
    for (const region of ['Europe', 'NA Central', 'NA West', 'Brazil', 'Asia', 'Middle East', 'Oceania']) {
      check(ids.has(`divcup-won:${region}`), `list: no Div Cup winners list for ${region}`);
    }
    check(
      [...ids].some((id) => id.startsWith('divcup-every:C7S4')) && [...ids].some((id) => id.startsWith('divcup-every:C7S3')),
      'list: C7S3 and C7S4 are not two seasons',
    );
    // "Played every one of them", split by region: every FNCS year has its
    // lists, 2019's is the one with the World Cup, and none is a phone book.
    const everyFinal = criteria.filter((criterion) => criterion.id.startsWith('fncs-every:'));
    if (everyFinal.length === 0) {
      skipped.push('list: "played every one" by region (facts.json is older — run build_data.py)');
    } else {
      const years = new Set(everyFinal.map((criterion) => criterion.id.split(':')[1]));
      check(years.size >= 8, `list: "every FNCS grand final" covers only ${years.size} years`);
      check(
        Boolean(everyFinal.find((criterion) => criterion.id === 'fncs-every:2019')?.title.includes('World Cup')),
        'list: 2019’s "every FNCS grand final" does not ask for the World Cup',
      );
      const every = criteria.filter((criterion) => /^(fncs|divcup)-every:/.test(criterion.id));
      const biggest = every.reduce((a, b) => (b.answers.length > a.answers.length ? b : a));
      check(biggest.answers.length <= 100, `list: "${biggest.title}" is ${biggest.answers.length} names`);
      notes.push(`list: ${every.length} "played every one" lists, the biggest ${biggest.title} at ${biggest.answers.length}`);
    }
    const weekly = criteria.filter((criterion) => /^(divcup|fpe)/.test(criterion.id));
    notes.push(
      `list: ${weekly.length} Div Cup and Evaluation lists, ${facts.lists.length - weekly.length} under 8 answers`,
    );
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
    let nearNested = 0;
    // Boards where one player fits more cells than the level allows.
    let overReach = 0;
    // Boards carrying one of the rules added 27 Sep 2026, by kind.
    const added = new Map<string, number>();
    for (let seed = 0; seed < 25; seed++) {
      const board = ttt.generateBoard({ facts, orgs }, pools, difficulty, `t-${difficulty}-${seed}`);
      if (!board) continue;
      boards++;
      if (ttt.maxReach(board) > ttt.LEVELS[difficulty].reach) overReach++;
      for (const kind of new Set([...board.rows, ...board.cols].map((axis) => axis.kind))) {
        if (['fncs-count', 'fncs-back-to-back', 'fncs-with', 'lan-podium'].includes(kind)) {
          added.set(kind, (added.get(kind) ?? 0) + 1);
        }
      }
      // No two axes nearly the same rule — "Won NA FNCS" beside "North America".
      const axes = [...board.rows, ...board.cols];
      for (let i = 0; i < axes.length; i++) {
        for (let j = i + 1; j < axes.length; j++) {
          const [small, large] =
            axes[i].matches.length <= axes[j].matches.length ? [axes[i], axes[j]] : [axes[j], axes[i]];
          const inside = small.matches.filter((p) => large.test(p)).length;
          if (inside >= small.matches.length * ttt.NEAR_NESTED) nearNested++;
        }
      }
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
    check(nearNested === 0, `tic-tac-toe ${difficulty}: ${nearNested} pairs of near-identical axes`);
    // EpikWhale used to fit all nine cells on one Easy board in five.
    check(overReach <= 1, `tic-tac-toe ${difficulty}: ${overReach} boards let one player fit over ${ttt.LEVELS[difficulty].reach} cells`);

    // Ten boards in a row, the way the game deals them: the last three boards' rules kept out.
    let recent: string[] = [];
    let repeats = 0;
    const rules = new Set<string>();
    for (let round = 0; round < 10; round++) {
      const board = ttt.generateBoard({ facts, orgs }, pools, difficulty, `run-${difficulty}-${round}`, recent);
      if (!board) continue;
      const ids = [...board.rows, ...board.cols].map((axis) => axis.id);
      repeats += ids.filter((id) => recent.slice(0, 6).includes(id)).length;
      ids.forEach((id) => rules.add(id));
      recent = [...ids, ...recent].slice(0, 18);
    }
    notes.push(`tic-tac-toe ${difficulty}: 10 boards in a row use ${rules.size} rules, ${repeats} repeated from the board before`);
    notes.push(
      `tic-tac-toe ${difficulty}: ${boards}/25 boards over a ${answers.length}-player band, ` +
        `${autoPlaced} placed by typing alone, ${offers} asked which cell, ` +
        `${outsiders} placed from outside the band; new rules on ` +
        ([...added].map(([kind, n]) => `${n} (${kind})`).join(', ') || 'none'),
    );
  }

  // Nobody reads "won in Europe" off a Globals any more — and a Globals is not
  // an FNCS title for the year either.
  {
    const all = buildCriteria({ players: roster.players, facts, orgs }, { minMatches: 1, maxShare: 1 });
    const eu = all.find((criterion) => criterion.id === 'won-fncs:Europe');
    const y2023 = all.find((criterion) => criterion.id === 'won-fncs-in:2023');
    const cooper = roster.players.find((p) => p.name === 'Cooper' && facts.of(p.id).wins.global > 0);
    check(Boolean(eu), 'criteria: no "Won EU FNCS" rule');
    if (eu && cooper) {
      check(!eu.test(cooper), 'criteria: Cooper counts as an EU FNCS winner for the Copenhagen Globals');
    }
    if (y2023 && cooper) {
      check(!y2023.test(cooper), 'criteria: Cooper counts as a 2023 FNCS winner for the Globals');
    }

    // The rules added for Tic Tac Toe on 27 Sep 2026.
    const exact = [0, 1, 2, 3].map((n) => all.find((criterion) => criterion.id === `fncs-count:${n}`));
    const four = all.find((criterion) => criterion.id === 'fncs-count:4+');
    check(exact.every(Boolean) && Boolean(four), 'criteria: an exact FNCS count rule is missing');
    const counted = exact.reduce((sum, criterion) => sum + (criterion?.matches.length ?? 0), 0) + (four?.matches.length ?? 0);
    check(counted === roster.players.length, `criteria: the FNCS count rules cover ${counted} of ${roster.players.length}`);

    const peterbot = all.find((criterion) => criterion.id === 'fncs-with:Peterbot');
    const partners = peterbot?.matches.map((p) => p.id).sort().join(', ');
    check(partners === 'Bylah, Cold, Pollo, Ritual', `criteria: Peterbot's FNCS partners read ${partners ?? 'nothing'}`);
    const anchors = all.filter((criterion) => criterion.kind === 'fncs-with');
    notes.push(`criteria: "won an FNCS with" anchors — ${anchors.map((c) => c.short.replace('Won FNCS with ', '')).join(', ')}`);

    const backToBack = all.find((criterion) => criterion.id === 'fncs-back-to-back');
    check(Boolean(backToBack), 'criteria: no back-to-back FNCS rule');
    notes.push(`criteria: ${backToBack?.matches.length ?? 0} back-to-back FNCS winners`);

    // Podium needs the appendix cell's `podium`; a file from before it has none.
    const podiums = roster.players.some((p) => facts.of(p.id).podium.length > 0);
    const podium = all.find((criterion) => criterion.id === 'lan-podium');
    if (podiums) {
      check(Boolean(podium), 'criteria: facts.json has podiums but no "LAN podium" rule');
      const winners = all.find((criterion) => criterion.id === 'lan-winner');
      if (podium && winners) {
        check(winners.matches.every((p) => podium.test(p)), 'criteria: a LAN winner is not on a LAN podium');
      }
      notes.push(`criteria: ${podium?.matches.length ?? 0} players with a LAN podium`);
    } else {
      skipped.push('LAN podium (facts.json has no podium yet — run the appendix cell)');
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
  // On a chosen tier, and on Random over the whole roster with the fame mix
  // the game passes there — the pool most people play and the one where an
  // exclusive draw would otherwise be all deep cuts.
  const everyone: CriteriaSource = {
    players: (['easy', 'medium', 'hard'] as const).flatMap((tier) =>
      roster.exactly(tier, { eligible: facts.eligible(3) }),
    ),
    facts,
    orgs,
  };
  for (const setup of [
    { name: 'medium', source, mix: undefined, seeds: 40, least: 35 },
    { name: 'random', source: everyone, mix: RANDOM_MIX, seeds: 20, least: 18 },
  ]) {
    const inPlay = buildCriteria(setup.source, { minMatches: 4, maxShare: 0.5 });
    let puzzles = 0;
    const tiers = { easy: 0, medium: 0, hard: 0 };
    for (let seed = 0; seed < setup.seeds; seed++) {
      const where = `connections ${setup.name}: puzzle ${seed}`;
      const puzzle = connections.generatePuzzle(setup.source, `c-${seed}`, setup.mix);
      if (!puzzle) continue;
      puzzles++;
      check(puzzle.board.length === 16, `${where} has ${puzzle.board.length} tiles`);
      const ids = new Set(puzzle.board.map((p) => p.id));
      check(ids.size === 16, `${where} repeats a player`);
      for (const player of puzzle.board) tiers[player.tier]++;

      let game = connections.createGame(puzzle);
      for (const group of puzzle.groups) {
        for (const player of group.players) game = connections.toggle(game, player);
        game = connections.submit(game);
      }
      check(game.status === 'won', `${where} rejected its own groups`);
      check(game.mistakes === 0, `${where} charged a mistake on perfect play`);
      check(connections.livesLeft(game) === connections.MAX_MISTAKES, `${where} lost a life`);

      // One way to split the sixteen.
      const ways = connections.solutions(puzzle, setup.source);
      check(ways === 1, `${where} splits ${ways} ways, not 1`);
      // And no group lands on a fifth player — five Poles beside a Poland group.
      const crowded = connections.crowded(puzzle, setup.source);
      check(crowded.length === 0, `${where} has a fifth player for "${crowded.join('", "')}"`);
      // "Has won a major" beside "has won an FNCS title": 164 of 165 in both.
      const groups = puzzle.groups.map((group) => inPlay.find((c) => c.id === group.id));
      if (groups.every((c) => c !== undefined)) {
        check(
          !hasNestedPair(groups as PlayerCriterion[], NEAR_NESTED),
          `${where} has two nearly identical groups (${puzzle.groups.map((g) => g.label).join(' / ')})`,
        );
      }
    }
    check(
      puzzles >= setup.least,
      `connections ${setup.name}: only ${puzzles} of ${setup.seeds} seeds produced a board`,
    );
    const dealt = Math.max(puzzles * 16, 1);
    notes.push(
      `connections ${setup.name}: ${puzzles} of ${setup.seeds} seeds produced a board; tiles ` +
        `${Math.round((tiers.easy / dealt) * 100)}% easy, ${Math.round((tiers.medium / dealt) * 100)}% medium, ` +
        `${Math.round((tiers.hard / dealt) * 100)}% hard`,
    );
  }

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

// ------------------------------------------------ 11b. Random's fame weighting
// Deal 3,000 secrets the way Random does and count the tiers. Each tier is its
// own no-repeat bag, so nobody may come round twice before their tier's bag
// empties, and nobody twice in a row ever.
{
  const pool = gtp.answerable(roster.players);
  let seen: string[] = [];
  const counts: Record<string, number> = { easy: 0, medium: 0, hard: 0 };
  const sinceRefill = new Map<string, Set<string>>();
  let last = '';
  let repeats = 0;
  let backToBack = 0;
  const draws = 3000;
  for (let i = 0; i < draws; i++) {
    const drawn = dealWeighted(pool, seen, (p) => p.tier, RANDOM_MIX, `mix-${i}`);
    if (!drawn) break;
    const tier = drawn.pick.tier;
    counts[tier]++;
    const bag = sinceRefill.get(tier) ?? new Set<string>();
    if (drawn.wrapped) bag.clear();
    if (bag.has(drawn.pick.id)) repeats++;
    bag.add(drawn.pick.id);
    sinceRefill.set(tier, bag);
    if (drawn.pick.id === last) backToBack++;
    last = drawn.pick.id;
    seen = drawn.seen;
  }
  check(repeats === 0, `random mix: ${repeats} players came round twice inside one cycle`);
  check(backToBack === 0, `random mix: ${backToBack} back-to-back repeats`);
  for (const tier of ['easy', 'medium', 'hard'] as const) {
    const share = counts[tier] / draws;
    check(
      Math.abs(share - RANDOM_MIX[tier]) < 0.04,
      `random mix: ${tier} is ${Math.round(share * 100)}% of draws, meant to be ${RANDOM_MIX[tier] * 100}%`,
    );
  }
  notes.push(
    `random mix over ${draws} Guess the Player deals: ` +
      `easy ${Math.round((counts.easy / draws) * 100)}%, medium ${Math.round((counts.medium / draws) * 100)}%, ` +
      `hard ${Math.round((counts.hard / draws) * 100)}% (default choice is ${DEFAULT_POOL.mode})`,
  );
}

// A guess with no published birthday reads as a blank, never as age 0.
{
  const secret = gtp.answerable(roster.players)[0];
  const ageless = roster.players.find((p) => p.age === null);
  if (secret && ageless) {
    const age = gtp.compare(ageless, secret, 'direction').find((a) => a.key === 'age');
    check(age?.display === '—' && !age.direction, `guess-the-player: ${ageless.name} with no birthday reads "${age?.display}"`);
  }
}

// The Random buttons: something unplayed first, then something only tried, then anything.
{
  const puzzles = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const status: Record<string, PuzzleStatus> = { a: 'won', b: 'tried' };
  const statusOf = (id: string) => status[id] ?? null;
  check(pickFresh(puzzles, statusOf)?.id === 'c', 'progress: Random did not prefer the unplayed puzzle');
  status.c = 'won';
  check(pickFresh(puzzles, statusOf)?.id === 'b', 'progress: Random did not fall back to a tried puzzle');
}

// List: FNCS winners by region are the regional finals, not the venue of a LAN.
if (facts) {
  const lists = buildListCriteria(roster, facts, pools, orgs, teammates);
  const na = lists.find((c) => c.id === 'fncs:North America');
  const kami = roster.players.find((p) => p.name === 'Kami' && p.countryName === 'Poland');
  if (na && kami) {
    check(!na.answers.some((a) => a.id === kami.id), 'list: Kami is an NA FNCS winner for the Raleigh Invitational');
  }
  check(
    !lists.some((c) => c.id.startsWith('won-in-year:') && /title/i.test(c.title)),
    'list: a year list still asks for "a title"',
  );

  // The age lists only hold players with a birthday; Peterbot won at 14.
  const young = lists.find((c) => c.id === 'fncs-age:under:15');
  check(Boolean(young?.answers.some((a) => a.name === 'Peterbot')), 'list: Peterbot is not an FNCS winner before 15');
  for (const c of lists.filter((c) => c.id.startsWith('fncs-age:'))) {
    check(
      c.answers.every((a) => roster.players.find((p) => p.id === a.id)?.birthDate),
      `list: "${c.title}" has a player with no birthday`,
    );
  }
  for (const c of lists.filter((c) => c.id.startsWith('country-lan:'))) {
    const country = c.id.slice('country-lan:'.length);
    check(
      c.answers.every((a) => facts.of(a.id).lanApps > 0 && roster.players.find((p) => p.id === a.id)?.countryName === country),
      `list: "${c.title}" has a player from elsewhere or with no LAN`,
    );
  }

  // The season: the user's worked example is Vico, 1 + 3 + 1 + 3 + 20 = 28, an average of 5.6.
  const season = facts.season;
  if (!season) {
    skipped.push('list: the season lists (facts.json has no season block — run build_data.py)');
  } else {
    const vico = season.results.get('Vic0try0na');
    check(
      vico?.map((r) => r?.finish).join(',') === '1,3,1,3,20',
      `list: Vic0try0na's 2026 finishes are ${vico?.map((r) => r?.finish).join(',')}, not 1,3,1,3,20`,
    );
    const all = lists.find((c) => c.id === `season:${season.year}:all`);
    check(Boolean(all?.answers.some((a) => a.id === 'Vic0try0na')), 'list: Vic0try0na did not play all five');
    // The top tens are Tenaball boards now, not lists.
    check(!lists.some((c) => c.id.startsWith(`season:${season.year}:top`)), 'list: a season top 10 is still a list');
    notes.push(`list: ${all?.title} — ${all?.answers.length} players`);
  }
}

// ------------------------------------------------------------------ Pyramid
if (facts) {
  /** Swaps a game into the right order, the way a player would. */
  const solve = (game: pyramid.GameState): pyramid.GameState => {
    for (let i = 0; i < pyramid.SIZE; i++) {
      const j = game.order.findIndex((item, k) => k >= i && item.value === game.puzzle.items[i].value);
      game = pyramid.swap(game, i, j);
    }
    return game;
  };
  for (const level of ['easy', 'medium', 'hard'] as const) {
    let built = 0;
    let pairs = 0;
    let deep = 0;
    const kinds = new Map<string, number>();
    for (let seed = 0; seed < 40; seed++) {
      const puzzle = pyramid.generatePuzzle(roster, facts, rankings, level, `p-${level}-${seed}`, null, majors);
      if (!puzzle) continue;
      built++;
      const tag = `pyramid ${level}: "${puzzle.title}"`;
      const kind = puzzle.id.replace(/:\d{4}$/, ':year').replace(/^tournament:.*/, 'tournament');
      kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
      const values = puzzle.items.map((item) => item.value);
      check(puzzle.items.length === pyramid.SIZE, `${tag} has ${puzzle.items.length} items`);
      check(new Set(puzzle.items.map((item) => item.id)).size === pyramid.SIZE, `${tag} repeats an item`);
      const lowerBetter = puzzle.id.startsWith('tournament:');
      // Tournaments draw ten from the field, not the top ten every time.
      if (lowerBetter && values.some((value, i) => value !== i + 1)) deep++;
      check(
        values.every((value, i) => i === 0 || (lowerBetter ? value > values[i - 1] : value <= values[i - 1])),
        `${tag} is not in order`,
      );
      // Never three on one value; money never level, and never a coin flip.
      const perValue = new Map<number, number>();
      for (const value of values) perValue.set(value, (perValue.get(value) ?? 0) + 1);
      check(Math.max(...perValue.values()) <= 2, `${tag} has three players on one value`);
      pairs += [...perValue.values()].filter((n) => n === 2).length;
      if (puzzle.id.startsWith('earnings')) {
        const gap = pyramid.LEVELS[level].gap;
        check(
          values.every((value, i) => i === 0 || value <= values[i - 1] * (1 - gap) + 1e-9),
          `${tag} has two amounts closer than ${gap * 100}%`,
        );
      }

      // The start gives nothing away; sorted and checked, it wins on the first check.
      const fresh = pyramid.createGame(puzzle, level, `o-${seed}`);
      check(pyramid.inPlace(fresh) <= 1, `${tag} starts with ${pyramid.inPlace(fresh)} in place`);
      const won = pyramid.check(solve(fresh));
      check(won.status === 'won' && won.checks === 1, `${tag} sorted right read ${won.status}`);
      // A level pair is right either way round.
      const pair = values.findIndex((value, i) => i > 0 && value === values[i - 1]);
      if (pair > 0) {
        const flipped = pyramid.check(pyramid.swap(solve(fresh), pair - 1, pair));
        check(flipped.status === 'won', `${tag} refused a level pair the other way round`);
      }
    }
    check(built >= 38, `pyramid ${level}: only ${built} of 40 seeds made a pyramid`);
    if (majors && kinds.get('tournament')) {
      check(deep > 0, `pyramid ${level}: every tournament pyramid was the top ten`);
    }
    notes.push(
      `pyramid ${level}: ${built}/40 built, ${pairs} level pairs; ` +
        [...kinds].sort((a, b) => b[1] - a[1]).map(([kind, n]) => `${kind} ${n}`).join(', '),
    );
  }

  // Lives: Hard ends on the first imperfect check, Medium on the second, Easy never.
  const puzzle = pyramid.generatePuzzle(roster, facts, rankings, 'easy', 'lives')!;
  const unsorted = (level: pyramid.Difficulty) => {
    let game = pyramid.createGame(puzzle, level, 'lives');
    // Make sure it is not already right.
    if (pyramid.inPlace(game) === pyramid.SIZE) game = pyramid.swap(game, 0, 1);
    return game;
  };
  check(pyramid.check(unsorted('hard')).status === 'lost', 'pyramid: hard survived an imperfect check');
  const medium = pyramid.check(unsorted('medium'));
  check(medium.status === 'playing' && medium.lives === 1, 'pyramid: medium lost on the first imperfect check');
  check(pyramid.check(medium).status === 'lost', 'pyramid: medium survived a second imperfect check');
  let easy = unsorted('easy');
  for (let i = 0; i < 5; i++) easy = pyramid.check(easy);
  check(easy.status === 'playing', 'pyramid: easy ran out of checks');
  // What a check locks stays put; what it marks wrong loses the mark once moved.
  const locked = [...easy.locked][0];
  if (locked) {
    const at = easy.order.findIndex((item) => item.id === locked);
    const other = easy.order.findIndex((item) => !easy.locked.has(item.id));
    check(pyramid.swap(easy, at, other) === easy, 'pyramid: a locked player moved');
  }
  const [a, b] = easy.order.map((item, i) => (easy.wrong.has(item.id) ? i : -1)).filter((i) => i >= 0);
  if (b !== undefined) {
    const moved = pyramid.swap(easy, a, b);
    check(!moved.wrong.has(easy.order[a].id), 'pyramid: a moved player kept its red mark');
  }
}

// -------------------------------------------------------------------- Bingo
if (facts && orgs) {
  const source = { facts, orgs, teammates, roster: roster.players };
  const eligible = facts.eligible(3);
  const bandOf = (level: bingo.Difficulty) => bingo.LEVELS[level].bands.flatMap((band) => roster.exactly(band, { eligible }));
  for (const level of ['easy', 'medium', 'hard'] as const) {
    const answers = bandOf(level);
    const kinds = new Map<string, number>();
    let built = 0;
    let decoys = 0;
    for (let seed = 0; seed < 25; seed++) {
      const board = bingo.generateBoard(source, { answers }, level, `bingo-${level}-${seed}`);
      if (!board) continue;
      built++;
      const tag = `bingo ${level}: card ${seed}`;
      check(board.squares.length === bingo.SQUARES, `${tag} has ${board.squares.length} squares`);
      check(new Set(board.squares.map((sq) => sq.id)).size === bingo.SQUARES, `${tag} repeats a square`);
      const perKind = new Map<string, number>();
      for (const sq of board.squares) {
        perKind.set(sq.kind, (perKind.get(sq.kind) ?? 0) + 1);
        kinds.set(sq.kind, (kinds.get(sq.kind) ?? 0) + 1);
      }
      check(Math.max(...perKind.values()) <= 2, `${tag} has three squares of one kind`);
      const most = Math.max(...answers.map((player) => board.squares.filter((sq) => sq.test(player)).length));
      check(most <= bingo.MAX_REACH, `${tag} lets one player fit ${most} squares`);
      for (let i = 0; i < board.squares.length; i++) {
        for (let j = i + 1; j < board.squares.length; j++) {
          check(!isNested(board.squares[i], board.squares[j], NEAR_NESTED), `${tag}: "${board.squares[i].short}" and "${board.squares[j].short}" are nearly the same`);
        }
      }
      // The deck: the level's size, no one twice, every square covered, and a full
      // card in it that survives losing any one player.
      check(board.deck.length === bingo.LEVELS[level].deck, `${tag} deals ${board.deck.length} players`);
      check(new Set(board.deck.map((p) => p.id)).size === board.deck.length, `${tag} deals a player twice`);
      board.squares.forEach((sq) => {
        const cover = board.deck.filter((p) => sq.test(p)).length;
        check(cover >= bingo.LEVELS[level].cover, `${tag}: "${sq.short}" has ${cover} players in the deck`);
      });
      check(bingo.robust(board.squares, board.deck), `${tag} has a player the full card cannot do without`);
      decoys += board.deck.filter((p) => !board.squares.some((sq) => sq.test(p))).length;
      const full = bingo.fullCard(board.squares, board.deck);

      // A perfect round: each player the full card needs goes to their square, the rest are skipped.
      if (full) {
        const plan = new Map([...full].map(([square, player]) => [player.id, square]));
        let game = bingo.createGame(board, level);
        while (game.status === 'playing') {
          const player = bingo.current(game)!;
          const square = plan.get(player.id);
          game = square === undefined ? bingo.skip(game) : bingo.place(game, square)!.state;
        }
        check(
          game.filled.size === bingo.SQUARES && bingo.lines(game).length === bingo.LINES.length && game.wrong.length === 0,
          `${tag}: a perfect round filled ${game.filled.size} squares`,
        );
        check(bingo.outcomeOf(game) === 'won', `${tag}: a full card read ${bingo.outcomeOf(game)}`);
      }
    }
    check(built >= 24, `bingo ${level}: only ${built} of 25 seeds made a card`);
    notes.push(`bingo ${level}: ${built}/25 cards, ${bingo.LEVELS[level].deck}-player decks with ${(decoys / Math.max(built, 1)).toFixed(1)} who fit nothing; ${[...kinds].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${k} ${n}`).join(', ')}`);
  }

  // A wrong square costs a life and the player; skipping costs nothing; the deck running out ends it.
  const board = bingo.generateBoard(source, { answers: bandOf('hard') }, 'hard', 'bingo-lives')!;
  const wrongSquare = (game: bingo.GameState) =>
    board.squares.findIndex((sq, i) => !game.filled.has(i) && !sq.test(bingo.current(game)!));
  let game = bingo.createGame(board, 'hard');
  while (game.status === 'playing' && wrongSquare(game) < 0) game = bingo.skip(game);
  if (game.status === 'playing') {
    const missed = bingo.place(game, wrongSquare(game))!;
    check(missed.outcome.kind === 'wrong' && bingo.livesLeft(missed.state) === bingo.LEVELS.hard.lives - 1, 'bingo: a wrong square did not cost one life');
    check(missed.state.turn === game.turn + 1, 'bingo: a wrong square did not move to the next player');
  }
  let skipped = bingo.createGame(board, 'hard');
  while (skipped.status === 'playing') skipped = bingo.skip(skipped);
  check(skipped.skipped === board.deck.length && bingo.livesLeft(skipped) === bingo.LEVELS.hard.lives, 'bingo: skipping cost something');
  check(bingo.outcomeOf(skipped) === 'lost', `bingo: skipping the whole deck read ${bingo.outcomeOf(skipped)}`);
}

// --------------------------------------------------------- 13. analytics records
// One real round per game through its own engine, recorded the way the game
// records it, then aggregated — so a record that stops matching what the
// dashboard reads fails here rather than on the live page.
{
  const stored: Stored<RoundRecord>[] = [];
  const keep = <G extends GameId>(
    game: G,
    made: { outcome: RoundRecord['outcome']; r: RoundRecord<G>['r'] },
    setup: RoundRecord['setup'] = {},
  ) => {
    const body = { v: RECORD_VERSION, game, app: 'check', data: 'check', setup, ...made } as RoundRecord;
    const size = JSON.stringify(body).length;
    check(size < MAX_RECORD_BYTES, `analytics: a ${game} record is ${size} bytes`);
    stored.push({ id: stored.length + 1, at: new Date().toISOString(), body });
  };
  const pool = gtp.answerable(roster.players);
  const [secret, other] = [pool[0], pool[1]];

  // Fortnitedle: one wrong guess, then the answer.
  {
    let game = wordle.gameFor(secret);
    const first = wordle.submitGuess(game, 'Q'.repeat(game.answer.length));
    if (first.ok) game = first.state;
    const second = wordle.submitGuess(game, game.answer);
    if (second.ok) game = second.state;
    const made = wordle.record(game);
    check(made.outcome === 'won' && made.r.guesses === 2, `analytics: fortnitedle recorded ${made.outcome} in ${made.r.guesses}`);
    keep('wordle', made, { pick: 'random' });
  }

  // Guess the Player: given up after one guess.
  {
    const game = gtp.giveUp(gtp.submitGuess(gtp.gameFor(secret, 'direction'), other));
    const made = gtp.record(game);
    check(made.outcome === 'gave-up', `analytics: guess-the-player give-up recorded as ${made.outcome}`);
    keep('guess-the-player', made);
  }

  // Career Path: skip, wrong guess, right guess — and a second round given up.
  if (majors) {
    const who = majors.eligible(roster.players).find((p) => majors.resultsFor(p.id).length >= 6)!;
    let game = career.createGame(who, majors.resultsFor(who.id), 'order', majors, 'analytics')!;
    game = career.revealNext(game);
    game = career.submitGuess(game, other.id === who.id ? secret : other);
    game = career.submitGuess(game, who);
    const made = career.record(game);
    check(made.outcome === 'won', `analytics: career-path win recorded as ${made.outcome}`);
    check(
      made.r.steps.map((s) => (s.guess ? (s.correct ? 'right' : 'wrong') : 'skip')).join() === 'skip,wrong,right',
      `analytics: career-path steps read ${JSON.stringify(made.r.steps)}`,
    );
    check(
      made.r.steps.map((s) => s.clue).join() === '0,1,2',
      'analytics: career-path steps name the wrong clues',
    );
    keep('career-path', made, { pick: 'custom', region: 'Europe', mode: 'order' });
    const quit = career.record(career.giveUp(career.createGame(who, majors.resultsFor(who.id), 'order', majors, 'q')!));
    check(quit.outcome === 'gave-up', `analytics: career-path give-up recorded as ${quit.outcome}`);
    keep('career-path', quit);
  }

  // Who Are Ya: out of clues is a loss, not a give-up.
  if (teammates && facts) {
    const byId = new Map(roster.players.map((p) => [p.id, p]));
    const who = roster.players.find((p) => whoAreYa.usableClues(teammates.cluesFor(p.id, byId)).length >= 3)!;
    let game = whoAreYa.createGame(who, teammates.cluesFor(who.id, byId), 'easy', 'analytics')!;
    const wrongs = roster.players.filter((p) => p.id !== who.id);
    for (let i = 0; game.status === 'playing'; i++) game = whoAreYa.submitGuess(game, wrongs[i]);
    const made = whoAreYa.record(game);
    check(made.outcome === 'lost', `analytics: who-are-ya running out recorded as ${made.outcome}`);
    keep('who-are-ya', made);
  }

  // Tenaball: the first row found, then given up.
  if (rankings) {
    const board = rankings.boards[0];
    let game = tenaball.createGame(board, 'easy');
    for (const member of membersOf(board.rows[0])) game = tenaball.applyGuess(game, member.key, member.label).state;
    game = tenaball.giveUp(game);
    const made = tenaball.record(game);
    check(made.outcome === 'gave-up', `analytics: tenaball give-up recorded as ${made.outcome}`);
    check(
      made.r.answers.filter((a) => a.found).length === membersOf(board.rows[0]).length,
      'analytics: tenaball recorded the wrong answers as found',
    );
    keep('tenaball', made, { level: 'easy' });
  }

  // List has no engine; the record is built in the component, so build one the same way.
  keep('list', {
    outcome: 'lost',
    r: { list: { id: 'check', name: 'Check list' }, total: 3, found: [{ id: secret.id, name: secret.name }], missed: ['A', 'B'] },
  });

  if (facts && orgs) {
    const source: CriteriaSource = {
      players: roster.playersFor('medium', { minimum: 200, eligible: facts.eligible(3) }),
      facts,
      orgs,
    };

    // Griefer: one griefer picked and checked — a loss, with the misread on file.
    const round = griefer.createRound(source, 'analytics')!;
    const outsider = round.board.find((p) => !round.memberIds.has(p.id))!;
    const lost = griefer.check(griefer.toggle(griefer.createGame(round, 'all-at-once'), outsider));
    const made = griefer.record(lost);
    check(made.outcome === 'lost', `analytics: griefer loss recorded as ${made.outcome}`);
    check(
      made.r.cards.some((c) => c.player.id === outsider.id && c.picked && !c.fits),
      'analytics: griefer did not record the picked griefer',
    );
    keep('impostor', made, { mode: 'all-at-once' });

    // Tic Tac Toe: one player placed, then given up.
    const answers = roster.exactly('easy', { eligible: facts.eligible(3) });
    const board = ttt.generateBoard({ facts, orgs }, { answers, accepted: roster.players }, 'easy', 'analytics')!;
    let game = ttt.createGame(board, 'easy');
    const first = board.candidates[0][0][0];
    const placed = ttt.submit(game, first);
    game = placed.outcome.kind === 'choose' ? ttt.place(game, placed.outcome.cells[0], first).state : placed.state;
    const tt = ttt.record(ttt.giveUp(game));
    check(tt.outcome === 'gave-up' && tt.r.placed.length === 1, `analytics: tic-tac-toe recorded ${tt.outcome}, ${tt.r.placed.length} placed`);
    keep('tic-tac-toe', tt, { level: 'easy' });

    // Connections: one wrong four, then given up.
    const puzzle = connections.generatePuzzle(source, 'analytics')!;
    let cgame = connections.createGame(puzzle);
    const mixed = [...puzzle.groups[0].players.slice(0, 3), puzzle.groups[1].players[0]];
    for (const p of mixed) cgame = connections.toggle(cgame, p);
    cgame = connections.giveUp(connections.submit(cgame));
    const cm = connections.record(cgame);
    check(
      cm.outcome === 'gave-up' && cm.r.attempts.length === 1 && !cm.r.attempts[0].correct,
      `analytics: connections recorded ${cm.outcome} with ${cm.r.attempts.length} attempts`,
    );
    keep('connections', cm);
  }

  // Higher or Lower: one right, one wrong.
  {
    let game = hl.createGame(roster.players, 'earnings', 'easy', 'analytics')!;
    game = hl.nextRound(hl.submitAnswer(game, hl.correctAnswer(game)));
    game = hl.submitAnswer(game, hl.correctAnswer(game) === 'higher' ? 'lower' : 'higher');
    const made = hl.record(game);
    check(
      made.outcome === 'lost' && made.r.score === 1 && made.r.pairs.length === 2,
      `analytics: higher-lower recorded ${made.outcome}, score ${made.r.score}, ${made.r.pairs.length} pairs`,
    );
    keep('higher-lower', made, { level: 'easy', category: 'earnings' });
  }

  // Pyramid: one check with some wrong, then given up.
  if (facts) {
    const puzzle = pyramid.generatePuzzle(roster, facts, rankings, 'easy', 'analytics')!;
    let game = pyramid.createGame(puzzle, 'easy', 'analytics');
    game = pyramid.giveUp(pyramid.check(game));
    const made = pyramid.record(game);
    check(
      made.outcome === 'gave-up' && made.r.items.length === pyramid.SIZE && made.r.checks === 1,
      `analytics: pyramid recorded ${made.outcome}, ${made.r.items.length} items, ${made.r.checks} checks`,
    );
    keep('pyramid', made, { level: 'easy' });
  }

  // Bingo: one square marked, one wrong, then given up.
  if (facts && orgs) {
    const easy = roster.exactly('easy', { eligible: facts.eligible(3) });
    const board = bingo.generateBoard({ facts, orgs, teammates, roster: roster.players }, { answers: easy }, 'easy', 'analytics')!;
    let game = bingo.createGame(board, 'easy');
    while (!board.squares.some((sq) => sq.test(bingo.current(game)!))) game = bingo.skip(game);
    const first = bingo.current(game)!;
    game = bingo.place(game, board.squares.findIndex((sq) => sq.test(first)))!.state;
    const second = bingo.current(game)!;
    const wrong = board.squares.findIndex((sq, i) => !game.filled.has(i) && !sq.test(second));
    if (wrong >= 0) game = bingo.place(game, wrong)!.state;
    const made = bingo.record(bingo.giveUp(game));
    check(
      made.outcome === 'gave-up' && made.r.squares.length === bingo.SQUARES && made.r.placed.length === 1 && made.r.deck === board.deck.length,
      `analytics: bingo recorded ${made.outcome}, ${made.r.squares.length} squares, ${made.r.placed.length} placed`,
    );
    keep('bingo', made, { level: 'easy' });
  }

  // A malformed row must cost itself, not the dashboard.
  stored.push({ id: 999, at: new Date().toISOString(), body: { game: 'tenaball', r: null } as unknown as RoundRecord });

  const dash = aggregate(stored);
  const played = (id: GameId) => dash.games.find((g) => g.game === id)?.rounds ?? 0;
  check(played('wordle') === 1, `analytics: dashboard counts ${played('wordle')} fortnitedle rounds`);
  check(dash.wordle[0]?.solved === 1 && dash.wordle[0]?.avgGuesses === 2, 'analytics: fortnitedle row is wrong');
  if (majors) {
    check(played('career-path') === 2, `analytics: dashboard counts ${played('career-path')} career-path rounds`);
    const row = dash.careerPath[0];
    const solvedAt = row?.clues.find((c) => c.solved === 1);
    check(Boolean(solvedAt) && row.solved === 1 && row.avgClues === 3, 'analytics: career-path clue breakdown is wrong');
    const mix = dash.games.find((g) => g.game === 'career-path')!.mix;
    check(mix.regions[0]?.label === 'Europe', 'analytics: setup counts lost the region');
    const chosen = mix.source.find((s) => s.label === 'chosen')?.count;
    check(chosen === 1, `analytics: ${chosen} career-path rounds counted as Chosen, expected 1`);

    // Filters narrow everything at once, and a filter nothing matches is an
    // empty dashboard rather than an error.
    const europe = aggregate(stored, { filter: { region: 'Europe' } });
    check(europe.rounds === 1 && europe.careerPath.length === 1, `analytics: the Europe filter kept ${europe.rounds} rounds`);
    const nothing = aggregate(stored, { filter: { source: 'event' } });
    check(nothing.rounds === 0 && nothing.wordle.length === 0, 'analytics: an empty filter still counted rounds');

    // The player view: the Career Path secret, seen as the secret twice.
    const who = dash.careerPath[0];
    const lens = playerLens(stored, who.id);
    const asSecret = lens.rows.find((row) => row.game === 'career-path' && row.role === 'secret');
    check(asSecret?.rounds === 2 && asSecret.good === 1, `analytics: ${who.name}'s player view reads ${JSON.stringify(asSecret)}`);
  }
  const index = playerIndex(stored);
  check(index.length > 0 && index.every((entry) => entry.rounds > 0), 'analytics: the player index is empty');
  check(!index.some((entry) => entry.id === 'check'), 'analytics: a list id leaked into the player index');
  if (rankings) check(dash.tenaball[0]?.gaveUp === 1, 'analytics: tenaball give-up not counted');
  check(dash.list[0]?.answers.length === 3, 'analytics: list answers not counted from found + missed');
  if (facts && orgs) {
    check(dash.griefer.misreads.length > 0, 'analytics: griefer misreads empty');
    check(dash.ticTacToe.length === 9, `analytics: tic-tac-toe has ${dash.ticTacToe.length} cells, not 9`);
    check(dash.connections.misgrouped.length === 4, 'analytics: connections misgrouped players not counted');
  }
  check(dash.higherLower.pairs.length === 2, 'analytics: higher-lower pairs not counted');
  notes.push(`analytics: ${stored.length} records across ${dash.games.filter((g) => g.rounds).length} games aggregate cleanly`);
}

// ------------------------------------------------------------ 12. event pools
if (pools.pools.length > 0) {
  const byId = new Map(roster.players.map((p) => [p.id, p]));
  for (const pool of pools.pools) {
    const playable = pool.players.filter((id) => byId.has(id));
    notes.push(`pool ${pool.label}: ${playable.length} of ${pool.players.length} playable`);
    check(playable.length >= 20, `pools: ${pool.label} only has ${playable.length} playable players`);
  }

  for (const pool of pools.pools) {
    const field = pool.players.flatMap((id) => byId.get(id) ?? []);
    const year = pool.date.slice(0, 4);

    // Tenaball: one heading, and the planned boards first and in order. A board
    // the field cannot fill is dropped, so this checks order, not presence.
    const boards = poolBoards(pool, field, facts, orgs);
    check(new Set(boards.map((b) => b.group)).size === 1, `event ${pool.label}: field boards under several headings`);
    const planned = ['earnings', 'youngest', 'earnings-least', 'fncs', 'earnings:Europe', 'countries',
      'earnings-year', 'oldest', 'orgs', 'earnings:North America', 'lans', 'fncs-apps'];
    const at = planned.map((id) => boards.findIndex((b) => b.id === `pool:${pool.id}:${id}`)).filter((i) => i >= 0);
    check(at.every((index, i) => i === 0 || index > at[i - 1]), `event ${pool.label}: field boards out of order`);
    check(at.length >= 10, `event ${pool.label}: only ${at.length} of the ${planned.length} planned boards built`);
    notes.push(`event ${pool.label}: ${boards.length} Tenaball boards, ${at.length} of ${planned.length} planned`);

    // The results boards, once the event has been played: standings in place
    // order, every team slot closable by naming its players, and the two
    // seeded boards only from a file that carries earnings from before.
    if (Object.keys(pool.placements ?? {}).length > 0) {
      const playable = (board: (typeof boards)[number]) => {
        let game = tenaball.createGame(board, 'hard');
        for (const row of board.rows) {
          for (const member of membersOf(row)) game = tenaball.applyGuess(game, member.key, member.label).state;
        }
        return game.status === 'won';
      };
      const results = boards.find((b) => b.id === `pool:${pool.id}:results`);
      check(Boolean(results), `event ${pool.label}: the results are in but there is no top 10 board`);
      if (results) {
        check(
          results.rows.every((row, i) => row.value === i + 1),
          `event ${pool.label}: the top 10 reads ${results.rows.map((row) => row.value).join(', ')}`,
        );
        check(playable(results), `event ${pool.label}: the top 10 cannot be completed`);
      }
      const seeded = ['upsets', 'disappointments'].map((id) => boards.find((b) => b.id === `pool:${pool.id}:${id}`));
      if (pool.earningsBefore) {
        check(seeded.every(Boolean), `event ${pool.label}: earnings from before are in but a seeded board is missing`);
        for (const board of seeded) {
          if (!board) continue;
          check(board.rows.every((row) => row.value > 0), `event ${pool.label}: ${board.title} has a row that moved no places`);
          check(playable(board), `event ${pool.label}: ${board.title} cannot be completed`);
        }
        const [upset, flop] = seeded.map((board) => board?.rows[0]);
        notes.push(
          `event ${pool.label}: biggest upset ${upset?.label} ${upset?.display}, biggest disappointment ${flop?.label} ${flop?.display}`,
        );
      } else {
        check(seeded.every((board) => !board), `event ${pool.label}: seeded boards without earnings from before`);
        notes.push(`event ${pool.label}: no earnings from before the event yet — upsets and disappointments wait for cell 5`);
      }
    }

    // List: the planned lists, and the two answered with names that are not
    // players search a population wider than their answers.
    if (facts) {
      const lists = buildPoolCriteria(pool, field, facts, orgs, roster.players);
      const ids = lists.map((c) => c.id.replace(`pool:${pool.id}:`, ''));
      for (const id of ['region:Europe', `fncs-${year}`, 'region:North America', 'orgs', 'region:South America',
        'countries', 'region:Middle East', 'fncs', 'region:Asia-Oceania']) {
        check(ids.includes(id), `event ${pool.label}: no "${id}" list`);
      }
      check(ids.some((id) => id.startsWith('also:')), `event ${pool.label}: no "also played the last LAN" list`);
      const firstLan = lists.find((c) => c.id === `pool:${pool.id}:first-lan`);
      const lansBefore = facts.events.filter((event) => event.lan && event.date < pool.date);
      if (firstLan) {
        check(
          firstLan.answers.every((a) => lansBefore.every((event) => !facts.playedAt(event.index).has(a.id))),
          `event ${pool.label}: a "first LAN" answer played an earlier LAN`,
        );
        notes.push(`event ${pool.label}: ${firstLan.answers.length} qualifiers at their first LAN (${lansBefore.length} LANs before it)`);
      } else {
        check(lansBefore.length === 0, `event ${pool.label}: no "first LAN" list`);
      }
      for (const list of lists.filter((c) => c.pool)) {
        const searchable = new Set(list.pool!.map((entry) => entry.id));
        check(list.answers.every((a) => searchable.has(a.id)), `event ${pool.label}: "${list.title}" has an answer you cannot type`);
        check(list.pool!.length > list.answers.length * 2, `event ${pool.label}: "${list.title}" searches little more than its answers`);
      }
      notes.push(`event ${pool.label}: ${lists.length} List lists — ${lists.slice(0, 4).map((c) => c.title).join('; ')}…`);
    }

    // The secret-player games: regions in turn, so any run of as many deals as
    // there are regions shows every one of them.
    const regions = new Set(field.map((p) => p.region ?? ''));
    let seen: string[] = [];
    const dealt: string[] = [];
    const rng = makeRng(`turns-${pool.id}`);
    for (let i = 0; i < regions.size * 4; i++) {
      const drawn = dealInTurn(field, seen, (p) => p.region ?? '', rng)!;
      seen = drawn.seen;
      dealt.push(drawn.pick.region ?? '');
    }
    for (let i = 0; i + regions.size <= dealt.length; i += regions.size) {
      const window = new Set(dealt.slice(i, i + regions.size));
      check(window.size === regions.size, `event ${pool.label}: deals ${i + 1}-${i + regions.size} miss a region`);
    }

    // Higher or Lower leans to the region it has shown least; measured against
    // the same runs without the lean.
    const spread = (on: boolean) => {
      let total = 0;
      for (let run = 0; run < 5; run++) {
        let state = hl.createGame(field, 'earnings', 'easy', `spread-${run}`, on);
        const shown = new Set<string>();
        while (state && state.status === 'playing' && hl.roundOf(state) <= 12) {
          shown.add(state.challenger.region ?? '');
          state = hl.nextRound(hl.submitAnswer(state, hl.correctAnswer(state)));
        }
        total += shown.size;
      }
      return total / 5;
    };
    const [flat, leaned] = [spread(false), spread(true)];
    check(leaned >= flat, `event ${pool.label}: Higher or Lower's region lean shows fewer regions (${leaned} vs ${flat})`);
    notes.push(`event ${pool.label}: Higher or Lower shows ${leaned.toFixed(1)} regions in 12 rounds with the lean, ${flat.toFixed(1)} without`);

    // Higher or Lower's Placement, once the event's results are in.
    if (Object.keys(pool.placements ?? {}).length > 0) {
      checkHigherLower(hl.withPlacements(field, pool.placements), 'placement', `placement at ${pool.label}`);
    } else {
      notes.push(`event ${pool.label}: no results yet — Higher or Lower's Placement is greyed out`);
    }

    // Every game deals the whole field where the data allows: a qualifier is
    // never left out for falling short of a minimum the roster uses. Career
    // Path can only once cell 7 has written its short careers.
    const reach: [string, number][] = [
      ['Fortnitedle', wordle.eligible(field).length],
      ['Guess the Player', gtp.answerableInField(field).length],
    ];
    if (teammates) {
      reach.push(['Who Are Ya', field.filter((p) => whoAreYa.usableClues(teammates.cluesFor(p.id, byId)).length > 0).length]);
    }
    const shortCareers = majors && roster.players.some((p) => {
      const n = majors.resultsFor(p.id).length;
      return n > 0 && n < majors.minAppearances;
    });
    if (majors && shortCareers) reach.push(['Career Path', majors.inField(field).length]);
    for (const [game, n] of reach) check(n === field.length, `event ${pool.label}: ${game} deals ${n} of ${field.length}`);
    notes.push(
      `event ${pool.label}: ${reach.map(([game, n]) => `${game} ${n}`).join(', ')} of ${field.length}` +
        (majors && !shortCareers ? ` (Career Path ${majors.inField(field).length} until cell 7 runs)` : ''),
    );

    // The board games take the whole field too, and still build.
    if (facts && orgs) {
      const source: CriteriaSource = { players: field, facts, orgs };
      let rounds = 0;
      let puzzles = 0;
      let grids = 0;
      for (let seed = 0; seed < 8; seed++) {
        if (griefer.createRound(source, `field-g-${seed}`)) rounds++;
        if (connections.generatePuzzle(source, `field-c-${seed}`)) puzzles++;
        const level = (['easy', 'medium', 'hard'] as const)[seed % 3];
        if (ttt.generateBoard({ facts, orgs }, { answers: field, accepted: field }, level, `field-t-${seed}`)) grids++;
      }
      check(rounds === 8 && puzzles >= 6 && grids >= 6, `event ${pool.label}: whole-field boards — Griefer ${rounds}/8, Connections ${puzzles}/8, Tic Tac Toe ${grids}/8`);
      notes.push(`event ${pool.label}: whole-field boards — Griefer ${rounds}/8, Connections ${puzzles}/8, Tic Tac Toe ${grids}/8`);
    }
  }
} else {
  skipped.push('pools.json (no event pools)');
}

// ------------------------------------------------------------ 12b. the glossary
// The definitions are matched to titles by their words; the traps are the ones
// that read alike — a region after "from", the one board whose LAN is wide.
{
  const expect = (title: string, id: string, has: TermId[], lacks: TermId[] = []) => {
    const found = termsIn(title, id);
    for (const term of has) check(found.includes(term), `glossary: "${title}" is missing ${term}`);
    for (const term of lacks) check(!found.includes(term), `glossary: "${title}" wrongly explains ${term}`);
  };
  expect('Top 10 by LAN wins', 'lan-wins', ['lan-wide'], ['lan']);
  expect('Players who have won a LAN', 'lan-winners', ['lan'], ['lan-wide']);
  expect('Players from Poland who have won an FNCS', 'country-fncs:Poland', ['nationality', 'fncs-title']);
  expect('FNCS 2026 Globals qualifiers from Europe', 'pool:x:region:Europe', ['region', 'field'], ['nationality']);
  expect('Top 10 by major tournament wins', 'major-wins', ['major']);
  expect('Players with 20+ FNCS grand finals', 'fncs-apps:20', ['fncs-final'], ['fncs-title']);
  if (facts) {
    const lans = TERMS.lan.events!(facts).names;
    check(lans.length === facts.events.filter((e) => e.lan).length, 'glossary: the LAN list is not every LAN');
    notes.push(`glossary: ${lans.length} LANs listed — ${lans.join(', ')}`);
  }
}

// ------------------------------------------------------------------- report --
console.log('\n=== notes ===');
for (const note of notes) console.log('  ' + note);

if (skipped.length > 0) {
  console.log('\n=== skipped (run scripts/build_data.py) ===');
  for (const item of skipped) console.log('  ' + item);
}

if (problems.length > 0) {
  console.log(`\n=== ${problems.length} PROBLEM(S) ===`);
  for (const problem of problems) console.log('  ✗ ' + problem);
  process.exit(1);
}
console.log('\n✓ all checks passed');

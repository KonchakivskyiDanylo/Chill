import type { Facts } from '@/data/liquipedia/facts';
import type { Platform, Socials } from '@/data/socials';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { makeRng, randInt, sample, shuffle } from '@/lib/rng';
import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import { buildCriteria, type CriteriaSource, type PlayerCriterion } from '@/games/shared/criteria';

/** Pure logic for Griefer. */

export type Mode = 'all-at-once' | 'one-by-one';

/** Two rows of five. */
export const BOARD_SIZE = 10;
export const MIN_MEMBERS = 4;
export const MAX_MEMBERS = 6;

export interface Round {
  criterion: PlayerCriterion;
  /** Board order — the players who fit and the griefers, mixed. */
  board: RosterPlayer[];
  /** The players who actually satisfy the rule. These are what you pick. */
  memberIds: Set<string>;
}

export interface GameState {
  mode: Mode;
  round: Round;
  /** Players the user has flagged (all-at-once) or already found (one-by-one). */
  selected: Set<string>;
  status: 'playing' | 'won' | 'lost';
  /** The pick that ended a one-by-one round, for the result message. */
  mistake: RosterPlayer | null;
  /** Set by `giveUp`: a lost round is otherwise the same whether checked or abandoned. */
  gaveUp?: true;
}

/**
 * The kinds of rule worth putting on a board.
 *
 * Country and region were left out for a long time, and the reason has expired.
 * They used to be almost the only rules available *and* the cards carried
 * flags, so "every player here competes in Brazil" was solvable by looking
 * rather than knowing. The cards are a bare handle now and there are ten other
 * kinds of rule in the draw, so a nationality board is one rule in twelve
 * rather than the game — and "which of these ten are French" is a genuine
 * question once the flags are gone.
 */
const USABLE = new Set([
  'country',
  'region',
  'org',
  'fncs-winner',
  'global-winner',
  'lan-winner',
  'tournament-winner',
  'earnings',
  'fncs-wins',
  'won-fncs-region',
  'won-fncs-year',
  'played-event',
  // "Has 100K+ Twitch followers", when the server has fresh counts.
  'socials',
]);

/**
 * One criterion per kind, then shuffled — not one shuffle over all of them.
 *
 * The flat shuffle was effectively an org generator. `buildCriteria` produces
 * roughly 250 rules over a full pool and about 174 of them are organisations,
 * so a uniform draw served "has played for X" seven times in ten and reached
 * the four earnings rules under twice in a hundred rounds. Every kind now gets
 * one seat in the draw, so a career-earnings board is as likely as an org one.
 */
function byKind(criteria: PlayerCriterion[], rng: ReturnType<typeof makeRng>): PlayerCriterion[] {
  const buckets = new Map<string, PlayerCriterion[]>();
  for (const criterion of criteria) {
    const bucket = buckets.get(criterion.kind);
    if (bucket) bucket.push(criterion);
    else buckets.set(criterion.kind, [criterion]);
  }
  // A few rounds deep per kind, so a kind whose first pick cannot fill a board
  // gets another go before the draw falls back to everything else.
  const ordered: PlayerCriterion[] = [];
  for (let round = 0; round < 3; round++) {
    const layer: PlayerCriterion[] = [];
    for (const bucket of buckets.values()) {
      const pick = bucket[Math.floor(rng() * bucket.length)];
      if (pick && !ordered.includes(pick) && !layer.includes(pick)) layer.push(pick);
    }
    ordered.push(...shuffle(rng, layer));
  }
  return [...ordered, ...shuffle(rng, criteria)];
}

/**
 * Share of the griefers drawn from the near misses; the rest stay random, so a
 * board is not ten look-alikes and a player who reads every card as a trap is
 * wrong too.
 */
export const NEAR_SHARE = 0.6;

/**
 * How nearly an outsider fits the rule — the griefer worth putting on a board.
 *
 * Random outsiders made most griefers easy to dismiss: "has won the EU FNCS"
 * next to a Japanese player nobody has heard of. A near miss is the player you
 * have to stop and think about (the user's open decision, closed 3 Oct 2026):
 *
 *   country, region      the same scene as the players who fit, or the same
 *                        flag competing somewhere else
 *   organisation         someone who has won an FNCS beside one of its players
 *   titles               a finalist who never won one, or a podium at a LAN
 *   2+ / 3+ titles       one title short
 *   earnings             just under the line
 *   FNCS in a region     a winner from another region, or a finalist from this one
 *   FNCS in a year       a winner in another year
 *   played at an event   at another of the headline events, not this one
 *   followers            a quarter of the line or more
 *
 * plus a little for sitting at the same fame as the players who fit, so the
 * griefers are not told apart by being nobodies.
 */
export function nearness(
  criterion: PlayerCriterion,
  members: readonly RosterPlayer[],
  player: RosterPlayer,
  facts: Facts,
  headline: ReadonlySet<string>,
  socials?: Socials | null,
): number {
  const mine = facts.of(player.id);
  const arg = criterion.id.split(':')[1] ?? '';
  const memberRegions = new Set(members.map((member) => member.region));
  let score = 0;
  switch (criterion.kind) {
    case 'country':
      if (memberRegions.has(player.region)) score += 2;
      break;
    case 'region':
      if (members.some((member) => member.countryName && member.countryName === player.countryName)) score += 3;
      break;
    case 'org':
      if (members.some((member) => facts.fncsPartners(member.id).has(player.id))) score += 3;
      else if (memberRegions.has(player.region)) score += 1;
      break;
    case 'fncs-winner':
    case 'global-winner':
    case 'lan-winner':
    case 'tournament-winner':
      if (player.fncsWins > 0 || mine.podium.some((index) => facts.events[index]?.lan)) score += 3;
      else score += 2 * Math.min(1, mine.apps / 20);
      break;
    case 'fncs-wins':
      if (player.fncsWins === Number(arg) - 1) score += 4;
      break;
    case 'earnings': {
      const line = Number(arg);
      if (player.earnings >= line / 2) score += 4 * (player.earnings / line);
      break;
    }
    case 'won-fncs-region':
      if (player.fncsWins > 0) score += 2;
      if (members.some((member) => member.region === player.region)) score += 1.5 * Math.min(1, mine.apps / 15);
      break;
    case 'won-fncs-year':
      if (mine.fncsWinYears.length > 0) score += 3;
      break;
    case 'played-event':
      if (headline.has(player.id)) score += 3;
      break;
    case 'socials': {
      const [platform, line] = criterion.id.split(':');
      const count = socials?.of(platform as Platform, player) ?? 0;
      if (count >= Number(line) / 4) score += 4 * (count / Number(line));
      break;
    }
  }
  // The same fame as the players who fit: within a factor of ten in earnings.
  const typical = members.reduce((sum, member) => sum + Math.log10(member.earnings + 1), 0) / Math.max(1, members.length);
  score += Math.max(0, 1 - Math.abs(Math.log10(player.earnings + 1) - typical));
  return score;
}

function pickGriefers(
  criterion: PlayerCriterion,
  members: readonly RosterPlayer[],
  outsiders: readonly RosterPlayer[],
  count: number,
  facts: Facts,
  rng: ReturnType<typeof makeRng>,
  socials?: Socials | null,
): RosterPlayer[] {
  const headline = new Set(facts.headlineEvents.flatMap((event) => [...facts.playedAt(event.index)]));
  const ranked = outsiders
    .map((player) => ({ player, score: nearness(criterion, members, player, facts, headline, socials) + rng() * 0.5 }))
    .sort((a, b) => b.score - a.score);
  // The near misses are the best-scored few, drawn from rather than taken in
  // order, so the same rule does not deal the same griefers every time.
  const near = sample(
    rng,
    ranked.slice(0, Math.max(count * 3, 12)).map((entry) => entry.player),
    Math.ceil(count * NEAR_SHARE),
  );
  const taken = new Set(near.map((player) => player.id));
  const rest = sample(
    rng,
    outsiders.filter((player) => !taken.has(player.id)),
    count - near.length,
  );
  return [...near, ...rest];
}

export function createRound(source: CriteriaSource, seed: string = String(Date.now())): Round | null {
  const rng = makeRng(seed);
  const criteria = buildCriteria(source, { minMatches: MIN_MEMBERS, maxShare: 0.4 }).filter(
    (criterion) => USABLE.has(criterion.kind),
  );
  if (criteria.length === 0) return null;

  for (const criterion of byKind(criteria, rng)) {
    const outsiders = source.players.filter((player) => !criterion.test(player));
    /*
     * Ten cards, four to six of which fit, and the board never says how many.
     *
     * It used to be six to eight cards with half of them fitting, printed above
     * them as "find the 3". Both halves of that made the round easier than it
     * looked: a known count turns the last pick into arithmetic, and a small
     * count means most cards are griefers, so guessing is cheap. Ten is two
     * tidy rows of five and enough cards that four-of-ten and six-of-ten feel
     * genuinely different from the outside.
     */
    // Six unless the rule cannot field six — a rule with five players to its
    // name is still a good board, it is just never a six.
    const most = Math.min(MAX_MEMBERS, criterion.matches.length);
    if (most < MIN_MEMBERS) continue;
    const memberCount = randInt(rng, MIN_MEMBERS, most);
    const grieferCount = BOARD_SIZE - memberCount;
    if (outsiders.length < grieferCount) continue;

    const members = sample(rng, criterion.matches, memberCount);
    const griefers = pickGriefers(criterion, members, outsiders, grieferCount, source.facts, rng, source.socials);
    return {
      criterion,
      board: shuffle(rng, [...members, ...griefers]),
      memberIds: new Set(members.map((player) => player.id)),
    };
  }
  return null;
}

export function createGame(round: Round, mode: Mode): GameState {
  return { mode, round, selected: new Set(), status: 'playing', mistake: null };
}

/** All-at-once: toggle a pick before checking. */
export function toggle(state: GameState, player: RosterPlayer): GameState {
  if (state.status !== 'playing' || state.mode !== 'all-at-once') return state;
  const selected = new Set(state.selected);
  if (selected.has(player.id)) selected.delete(player.id);
  else selected.add(player.id);
  return { ...state, selected };
}

/** All-at-once: the selection must match the set of players who fit, exactly. */
export function check(state: GameState): GameState {
  if (state.status !== 'playing' || state.mode !== 'all-at-once') return state;
  const { memberIds } = state.round;
  const exact =
    state.selected.size === memberIds.size && [...state.selected].every((id) => memberIds.has(id));
  return { ...state, status: exact ? 'won' : 'lost' };
}

/**
 * One-by-one: a wrong pick ends the round immediately.
 *
 * The board asks for confirmation before calling this — a single stray click
 * used to end a round with no way back, which is a harsh way to lose to a
 * mis-tap on a phone.
 */
export function pick(state: GameState, player: RosterPlayer): GameState {
  if (state.status !== 'playing' || state.mode !== 'one-by-one') return state;
  if (state.selected.has(player.id)) return state;

  if (!state.round.memberIds.has(player.id)) {
    return { ...state, status: 'lost', mistake: player };
  }
  const selected = new Set(state.selected).add(player.id);
  return {
    ...state,
    selected,
    status: selected.size === state.round.memberIds.size ? 'won' : 'playing',
  };
}

/** Ends the round unsolved, so the board can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost', gaveUp: true } : state;
}

/** How many players who fit the rule are still to be found. */
export function membersLeft(state: GameState): number {
  return (
    state.round.memberIds.size -
    [...state.selected].filter((id) => state.round.memberIds.has(id)).length
  );
}

/**
 * The round as the analytics record it: every card, whether it fit and
 * whether it was picked. A griefer picked, or a fit left alone, is the
 * "misunderstanding" the dashboard counts per rule and per player. In one by
 * one the mistake that ended the round counts as picked.
 */
export function record(state: GameState): { outcome: Outcome; r: GamePayloads['impostor'] } {
  const picked = new Set(state.selected);
  if (state.mistake) picked.add(state.mistake.id);
  return {
    outcome: state.status === 'won' ? 'won' : state.gaveUp ? 'gave-up' : 'lost',
    r: {
      rule: { id: state.round.criterion.id, name: state.round.criterion.label },
      cards: state.round.board.map((player) => ({
        player: ref(player),
        fits: state.round.memberIds.has(player.id),
        picked: picked.has(player.id),
      })),
    },
  };
}

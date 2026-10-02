import { ref, type GamePayloads, type Outcome } from '@/analytics/types';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';

/**
 * Pure logic for Contextinho: Contexto with players. Every guess is ranked by
 * how alike it is to the secret player, out of everyone on record; #1 is the
 * secret.
 *
 * The roadmap (2 Oct 2026) says V1's real job is to find out how similarity
 * should work, so the measure is a weighted sum of separate parts, each 0 to
 * 1, and the weights are an argument. The game plays on `DEFAULT_WEIGHTS` —
 * the four the roadmap starts with — and the lab on the page (dev builds only)
 * changes them live, along with the parts that are off by default.
 */

export type AttributeId = 'teammates' | 'country' | 'age' | 'region' | 'linked' | 'era' | 'earnings' | 'orgs' | 'fncs';

export interface Attribute {
  id: AttributeId;
  label: string;
  /** What 1 and 0 mean, for the lab. */
  hint: string;
}

export const ATTRIBUTES: Attribute[] = [
  { id: 'teammates', label: 'Played together', hint: 'Tournaments entered as teammates, on a log scale: 40 or more is a full match.' },
  { id: 'country', label: 'Country', hint: 'Same first nationality.' },
  { id: 'age', label: 'Age', hint: 'Birth dates two years apart score a third; unknown scores 0.3.' },
  { id: 'region', label: 'Region', hint: 'Same competitive region.' },
  { id: 'linked', label: 'Shared teammates', hint: 'Overlap between the two players’ top-50 teammate lists.' },
  { id: 'era', label: 'Same years', hint: 'Overlap between the years each earned prize money.' },
  { id: 'earnings', label: 'Career earnings', hint: 'A tenfold gap in career earnings scores half.' },
  { id: 'orgs', label: 'Same organisations', hint: 'Organisations both have played for; two in common is a full match.' },
  { id: 'fncs', label: 'FNCS wins', hint: 'Five titles apart scores 0.' },
];

export type Weights = Record<AttributeId, number>;

/** The roadmap's four: age, country, region and matches played together. */
export const DEFAULT_WEIGHTS: Weights = {
  teammates: 4,
  country: 2,
  age: 1.5,
  region: 1,
  linked: 0,
  era: 0,
  earnings: 0,
  orgs: 0,
  fncs: 0,
};

/** What the parts read besides the roster row. Orgs is optional: without it that part is 0. */
export interface Context {
  teammates: Teammates;
  orgs: Orgs | null;
}

export type Parts = Record<AttributeId, number>;

export interface Scored {
  player: RosterPlayer;
  /** 1 is the secret. */
  rank: number;
  /** 0–100, the secret 100. */
  score: number;
  parts: Parts;
}

const YEAR = 365.25 * 86_400_000;

function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared++;
  return shared / (a.size + b.size - shared);
}

/** Everything about the secret the parts compare against, worked out once per ranking. */
function profile(player: RosterPlayer, context: Context, orgsOf: (id: string) => ReadonlySet<string>) {
  return {
    player,
    born: player.birthDate ? Date.parse(player.birthDate) : NaN,
    mates: new Map(context.teammates.matesOf(player.id)),
    mateIds: new Set(context.teammates.matesOf(player.id).map(([id]) => id)),
    years: new Set(Object.keys(player.earningsByYear)),
    orgs: orgsOf(player.id),
  };
}

/**
 * Ranks everyone against the secret: the secret first, then by the weighted
 * parts, the bigger career earner first on a tie — never the alphabet.
 */
export function rankAll(
  secret: RosterPlayer,
  players: readonly RosterPlayer[],
  weights: Weights,
  context: Context,
): Map<string, Scored> {
  const byPlayer = new Map<string, Set<string>>();
  for (const org of context.orgs?.orgs ?? []) {
    for (const id of org.ever) {
      let set = byPlayer.get(id);
      if (!set) byPlayer.set(id, (set = new Set()));
      set.add(org.id);
    }
  }
  const orgsOf = (id: string): ReadonlySet<string> => byPlayer.get(id) ?? new Set();
  const target = profile(secret, context, orgsOf);
  const total = Object.values(weights).reduce((sum, weight) => sum + Math.max(0, weight), 0) || 1;

  const scored = players
    .filter((player) => player.id !== secret.id)
    .map((player) => {
      const parts = compare(target, player, context, orgsOf);
      const sum = (Object.keys(parts) as AttributeId[]).reduce(
        (acc, id) => acc + Math.max(0, weights[id]) * parts[id],
        0,
      );
      return { player, value: sum / total, parts };
    })
    .sort((a, b) => b.value - a.value || b.player.earnings - a.player.earnings);

  const out = new Map<string, Scored>();
  const full = Object.fromEntries(ATTRIBUTES.map((a) => [a.id, 1])) as Parts;
  out.set(secret.id, { player: secret, rank: 1, score: 100, parts: full });
  scored.forEach((entry, index) => {
    out.set(entry.player.id, {
      player: entry.player,
      rank: index + 2,
      // Never 100 for anyone but the secret, however alike.
      score: Math.min(99, Math.round(entry.value * 100)),
      parts: entry.parts,
    });
  });
  return out;
}

function compare(
  target: ReturnType<typeof profile>,
  player: RosterPlayer,
  context: Context,
  orgsOf: (id: string) => ReadonlySet<string>,
): Parts {
  const together = target.mates.get(player.id) ?? 0;
  const born = player.birthDate ? Date.parse(player.birthDate) : NaN;
  const age =
    Number.isNaN(born) || Number.isNaN(target.born) ? 0.3 : Math.exp(-Math.abs(born - target.born) / YEAR / 1.8);
  const theirMates = new Set(context.teammates.matesOf(player.id).map(([id]) => id));
  const earningsGap = Math.abs(Math.log10(player.earnings + 1) - Math.log10(target.player.earnings + 1));
  const sharedOrgs = [...orgsOf(player.id)].filter((org) => target.orgs.has(org)).length;
  return {
    teammates: Math.min(1, Math.log1p(together) / Math.log1p(40)),
    country: player.country !== null && player.country === target.player.country ? 1 : 0,
    age,
    region: player.region !== null && player.region === target.player.region ? 1 : 0,
    linked: Math.min(1, jaccard(target.mateIds, theirMates) * 3),
    era: jaccard(target.years, new Set(Object.keys(player.earningsByYear))),
    earnings: Math.max(0, 1 - earningsGap / 2),
    orgs: Math.min(1, sharedOrgs / 2),
    fncs: Math.max(0, 1 - Math.abs(player.fncsWins - target.player.fncsWins) / 5),
  };
}

/** Who can be the secret: someone with a teammate, so the biggest part has something to say. */
export function eligible(teammates: Teammates) {
  return (players: RosterPlayer[]): RosterPlayer[] =>
    players.filter((player) => teammates.matesOf(player.id).some(([, events]) => events >= 5));
}

// ------------------------------------------------------------------ round --

export interface GameState {
  secret: RosterPlayer;
  /** In the order made; `hint` marks the ones a hint gave. */
  guesses: { player: RosterPlayer; hint: boolean }[];
  status: 'playing' | 'won' | 'lost';
  hints: number;
}

export function createGame(secret: RosterPlayer): GameState {
  return { secret, guesses: [], status: 'playing', hints: 0 };
}

export function submitGuess(state: GameState, player: RosterPlayer, hint = false): GameState {
  if (state.status !== 'playing' || state.guesses.some((g) => g.player.id === player.id)) return state;
  return {
    ...state,
    guesses: [...state.guesses, { player, hint }],
    hints: state.hints + (hint ? 1 : 0),
    status: player.id === state.secret.id ? 'won' : 'playing',
  };
}

/**
 * The player a hint names: the one halfway between your best rank and #1, or
 * the nearest one to it you have not guessed. Null once you are next to it.
 */
export function hintFor(state: GameState, ranking: ReadonlyMap<string, Scored>, everyone: number): RosterPlayer | null {
  const best = Math.min(everyone + 1, ...state.guesses.map((g) => ranking.get(g.player.id)?.rank ?? Infinity));
  if (best <= 2) return null;
  const guessed = new Set(state.guesses.map((g) => g.player.id));
  const byRank = [...ranking.values()].sort((a, b) => a.rank - b.rank);
  for (let rank = Math.max(2, Math.floor(best / 2)); rank < best; rank++) {
    const entry = byRank[rank - 1];
    if (entry && !guessed.has(entry.player.id)) return entry.player;
  }
  return null;
}

export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

export function record(state: GameState): { outcome: Outcome; r: GamePayloads['contextinho'] } {
  return {
    outcome: state.status === 'won' ? 'won' : 'gave-up',
    r: { secret: ref(state.secret), guesses: state.guesses.map((g) => ref(g.player)), hints: state.hints },
  };
}

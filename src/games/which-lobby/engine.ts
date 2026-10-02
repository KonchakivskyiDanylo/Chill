import type { ClueRoundPayload, Outcome } from '@/analytics/types';
import type { Majors } from '@/data/liquipedia/majors';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { ordinal } from '@/lib/format';
import { makeRng, type Rng } from '@/lib/rng';
import { recordRound, startRound, type ClueRound, type Named } from '@/games/shared/clue-round';
import type { Level } from '@/games/shared/levels';
import { lobbiesOf, lobbyTitle, type Lobby } from '@/games/shared/lobbies';

/**
 * Pure logic for Which Lobby?: a tournament's leaderboard revealed from the
 * bottom up — a 40th, a 20th, a 7th, the podium, the winner — until you name
 * the tournament.
 *
 * Built to the user's roadmap (2 Oct 2026): placements one by one, the round
 * over when you name it or the placements run out. A guess is a round and a
 * region picked from the list rather than typed, and a wrong one says whether
 * the lobby was earlier or later and whether the region was right — otherwise
 * 186 grand finals named alike would be a lottery.
 */

/** Regions each level deals; a LAN, with no region, and the World Cup's two finals come up at every level. */
export const LEVELS: Record<Level, { regions: ReadonlySet<string> | null; pick: 'famous' | 'weighted' | 'any' }> = {
  easy: { regions: new Set(['Europe', 'NA East', 'North America', 'NA Central']), pick: 'famous' },
  medium: { regions: new Set(['Europe', 'NA East', 'North America', 'NA Central', 'NA West', 'Brazil']), pick: 'weighted' },
  hard: { regions: null, pick: 'any' },
};

/** The order regions are listed in a picker. */
export const REGION_ORDER = [
  'Europe',
  'NA East',
  'North America',
  'NA Central',
  'NA West',
  'Brazil',
  'Asia',
  'Oceania',
  'Middle East',
  'Solo',
  'Duos',
];

export interface Finisher {
  placement: number;
  /** Everyone on the team, all on the roster. */
  players: RosterPlayer[];
}

export type Secret = Named & { lobby: Lobby };
export type GameState = ClueRound<Secret, Finisher>;

/** The lobbies a level can deal and the picker offers. */
export function lobbiesFor(majors: Majors, level: Level): Lobby[] {
  const regions = LEVELS[level].regions;
  return lobbiesOf(majors).filter(
    (lobby) => !regions || lobby.variant === null || lobby.variant === 'Solo' || lobby.variant === 'Duos' || regions.has(lobby.variant),
  );
}

/** A lobby as a guess or a secret: its name is the id. */
export function asNamed(lobby: Lobby): Secret {
  return { id: lobby.name, name: `${lobby.year} ${lobbyTitle(lobby)}`, lobby };
}

/**
 * Bands of the leaderboard, bottom to top, one finisher drawn from each: the
 * back half, then ever closer to the top, then 2nd–3rd, then the winner. Sized
 * by how far the results go, so a 33-team trios final gets six and a
 * 100-player solo final seven.
 */
export function bands(size: number): [number, number][] {
  const at = (share: number) => Math.max(1, Math.round(size * share));
  const out: [number, number][] = [
    [at(0.55) + 1, size],
    [at(0.35) + 1, at(0.55)],
    [at(0.2) + 1, at(0.35)],
    [at(0.1) + 1, at(0.2)],
  ];
  let floor = at(0.1) + 1;
  if (floor > 4) {
    out.push([4, floor - 1]);
    floor = 4;
  }
  out.push([2, Math.min(3, floor - 1)], [1, 1]);
  return out.filter(([lo, hi]) => lo <= hi && hi <= size);
}

function pickFrom(options: Finisher[], how: 'famous' | 'weighted' | 'any', rng: Rng): Finisher {
  const fame = (finisher: Finisher) => finisher.players.reduce((sum, player) => sum + player.earnings, 0);
  if (how === 'famous') return [...options].sort((a, b) => fame(b) - fame(a))[0];
  if (how === 'any') return options[Math.floor(rng() * options.length)];
  const weights = options.map((option) => Math.sqrt(fame(option) + 1_000));
  let roll = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < options.length; i++) {
    roll -= weights[i];
    if (roll < 0) return options[i];
  }
  return options[options.length - 1];
}

/** The finishers, worst first. A band with nobody fully on the roster is skipped. */
export function cluesFor(
  lobby: Lobby,
  majors: Majors,
  byId: ReadonlyMap<string, RosterPlayer>,
  level: Level,
  rng: Rng,
): Finisher[] {
  const field: Finisher[] = majors.fieldOf(lobby.name).flatMap(({ placement, players }) => {
    const known = players.map((id) => byId.get(id));
    return known.every(Boolean) && known.length > 0 ? [{ placement, players: known as RosterPlayer[] }] : [];
  });
  const out: Finisher[] = [];
  for (const [lo, hi] of bands(lobby.size)) {
    const options = field.filter((finisher) => finisher.placement >= lo && finisher.placement <= hi);
    if (options.length) out.push(pickFrom(options, LEVELS[level].pick, rng));
  }
  return out;
}

export function createGame(
  lobby: Lobby,
  majors: Majors,
  byId: ReadonlyMap<string, RosterPlayer>,
  level: Level,
  seed: string = String(Date.now()),
): GameState {
  return startRound(asNamed(lobby), cluesFor(lobby, majors, byId, level, makeRng(seed)));
}

/** What a wrong guess is told: when the lobby was against it, and whether the region matched. */
export function compare(guess: Lobby, secret: Lobby): { when: 'same' | 'earlier' | 'later'; region: boolean } {
  return {
    when: guess.round === secret.round && guess.year === secret.year ? 'same' : secret.date < guess.date ? 'earlier' : 'later',
    region: guess.variant === secret.variant,
  };
}

export function finisherName(finisher: Finisher): string {
  return finisher.players.map((player) => player.name).join(' & ');
}

export function record(state: GameState): { outcome: Outcome; r: ClueRoundPayload } {
  return recordRound(state, (finisher) => ({
    id: `${finisher.placement}`,
    name: `${ordinal(finisher.placement)} — ${finisherName(finisher)}`,
  }));
}

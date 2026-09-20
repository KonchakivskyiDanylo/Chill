import type { RosterPlayer } from '@/data/liquipedia/roster';
import { moneyShort } from '@/lib/format';

/** Pure logic for Guess the Player. */

/**
 * Exact — age and FNCS wins are simply right or wrong. Worth testing because
 * competitive players sit in a narrow age band and FNCS-win counts are small.
 * Direction — arrows plus a proximity band. Earnings always use this style.
 */
export type FeedbackMode = 'exact' | 'direction';

export const MAX_GUESSES = 8;

export type AttributeKey = 'region' | 'country' | 'status' | 'age' | 'earnings' | 'fncsWins';
export type CellState = 'hit' | 'close' | 'miss';

export interface AttributeResult {
  key: AttributeKey;
  label: string;
  /** The guessed player's value, as shown in the cell. */
  display: string;
  state: CellState;
  /** Set when the secret is higher/lower than the guess. */
  direction?: 'up' | 'down';
}

export interface GuessRow {
  player: RosterPlayer;
  attributes: AttributeResult[];
  correct: boolean;
}

export interface GameState {
  mode: FeedbackMode;
  secret: RosterPlayer;
  rows: GuessRow[];
  status: 'playing' | 'won' | 'lost';
}

/**
 * A round on a secret player the caller has already chosen.
 *
 * The caller picks, because who comes up next is a rotation question (see
 * `games/shared/rotation.ts`) and the rules of the round are not.
 */
export function gameFor(secret: RosterPlayer, mode: FeedbackMode): GameState {
  return { mode, secret, rows: [], status: 'playing' };
}

/**
 * Players who can be the answer.
 *
 * Every column has to say something, so a player with no published birthday or
 * no earnings figure would hand back two blank cells and a shrug.
 */
export function answerable(players: readonly RosterPlayer[]): RosterPlayer[] {
  return players.filter((player) => player.age !== null && player.earningsKnown);
}

function numericResult(
  key: AttributeKey,
  label: string,
  display: string,
  guessValue: number,
  secretValue: number,
  mode: FeedbackMode,
  closeWithin: number,
): AttributeResult {
  if (guessValue === secretValue) return { key, label, display, state: 'hit' };
  if (mode === 'exact') return { key, label, display, state: 'miss' };
  return {
    key,
    label,
    display,
    state: Math.abs(guessValue - secretValue) <= closeWithin ? 'close' : 'miss',
    direction: secretValue > guessValue ? 'up' : 'down',
  };
}

export function compare(
  guess: RosterPlayer,
  secret: RosterPlayer,
  mode: FeedbackMode,
): AttributeResult[] {
  const guessAge = guess.age ?? 0;
  const secretAge = secret.age ?? 0;

  // Career earnings always use direction + proximity: exact matching on a
  // six-figure number would never land.
  const earnings: AttributeResult =
    guess.earnings === secret.earnings
      ? { key: 'earnings', label: 'Earnings', display: moneyShort(guess.earnings), state: 'hit' }
      : {
          key: 'earnings',
          label: 'Earnings',
          display: moneyShort(guess.earnings),
          // Within 20% counts as warm.
          state: Math.abs(guess.earnings - secret.earnings) <= secret.earnings * 0.2 ? 'close' : 'miss',
          direction: secret.earnings > guess.earnings ? 'up' : 'down',
        };

  return [
    {
      key: 'region',
      label: 'Region',
      display: guess.region ?? '—',
      state: guess.region === secret.region ? 'hit' : 'miss',
    },
    {
      key: 'country',
      label: 'Country',
      display: guess.countryName ?? '—',
      // Right region, wrong country is a genuine partial hit.
      state:
        guess.country === secret.country ? 'hit' : guess.region === secret.region ? 'close' : 'miss',
    },
    {
      key: 'status',
      label: 'Status',
      display: guess.status === 'active' ? 'Active' : 'Retired',
      state: (guess.status === 'active') === (secret.status === 'active') ? 'hit' : 'miss',
    },
    numericResult('age', 'Age', String(guessAge), guessAge, secretAge, mode, 2),
    earnings,
    numericResult('fncsWins', 'FNCS wins', String(guess.fncsWins), guess.fncsWins, secret.fncsWins, mode, 1),
  ];
}

export function submitGuess(state: GameState, guess: RosterPlayer): GameState {
  if (state.status !== 'playing') return state;
  if (state.rows.some((row) => row.player.id === guess.id)) return state;

  const correct = guess.id === state.secret.id;
  const rows = [...state.rows, { player: guess, attributes: compare(guess, state.secret, state.mode), correct }];
  return {
    ...state,
    rows,
    status: correct ? 'won' : rows.length >= MAX_GUESSES ? 'lost' : 'playing',
  };
}

/** Ends the round unsolved, so the secret player can be revealed. */
export function giveUp(state: GameState): GameState {
  return state.status === 'playing' ? { ...state, status: 'lost' } : state;
}

export function guessesLeft(state: GameState): number {
  return MAX_GUESSES - state.rows.length;
}

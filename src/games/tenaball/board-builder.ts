import type { Board, BoardRow, EntityKind } from '@/data/liquipedia/rankings';

/**
 * Assembling a Tenaball board out of ranked rows.
 *
 * Shared by the two places that build boards in the browser rather than reading
 * them from `rankings.json`: the event-mode field boards (`pool-boards.ts`) and
 * the handful of all-time boards the shipped set does not carry
 * (`derived-boards.ts`). Everything precomputed still comes from the notebook,
 * for the reason given in `rankings.ts` — 442,736 placement rows is not a thing
 * to aggregate on a phone. These two build from data already in memory.
 */

export const SLOTS = 10;

/** Ten rows plus the spare that makes the near-miss rule work. */
export const NEEDED = SLOTS + 1;

export interface Ranked {
  key: string;
  label: string;
  value: number;
  display: string;
}

export const TIE_ALPHA =
  'Level values are ordered alphabetically, so 10th is the last name in the tie.';

/**
 * A board, or nothing.
 *
 * Nothing is the common case for a small field — a hundred players do not
 * necessarily yield eleven organisations worth ranking — and a board with
 * eight rows is not a Tenaball board. The caller simply drops it.
 */
export function board(
  id: string,
  group: string,
  title: string,
  entity: EntityKind,
  tieRule: string,
  ranked: Ranked[],
  lowerIsBetter?: boolean,
): Board | null {
  if (ranked.length < NEEDED) return null;
  const rows: BoardRow[] = ranked.slice(0, SLOTS);
  const next = ranked[SLOTS];
  return {
    id,
    group,
    title,
    entity,
    tieRule,
    rows,
    next: { key: next.key, label: next.label, value: next.value },
    lowerIsBetter,
  };
}

/**
 * Sort descending on `value`, breaking ties by label.
 *
 * Alphabetical is not a fair tiebreak so much as a stated one: the board prints
 * its tie rule above the slots, and "level values are ordered by name" is a
 * rule a player can act on, where an arbitrary export order is not.
 *
 * `localeCompare` rather than `<`, because half the handles in this scene are
 * lowercase and code-point order puts every one of them after every capitalised
 * name — which would make the stated rule a lie at exactly the moment a player
 * relies on it to work out who is tenth.
 */
export function byValue(ranked: Ranked[], ascending = false): Ranked[] {
  return ranked.sort(
    (a, b) =>
      (ascending ? a.value - b.value : b.value - a.value) ||
      a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }),
  );
}

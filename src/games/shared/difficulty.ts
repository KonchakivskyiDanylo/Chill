import type { FameTier } from '@/data/types';

/**
 * The fame difficulty scale, used by Higher or Lower and Wordle.
 *
 * It is the fame ranking (see `FameEntry`): Easy asks about the players
 * everyone knows, Hard about the ones only the scene knows. A game that also
 * has a mechanical difference at a level — Higher or Lower's Equal button —
 * hangs it off the same three values rather than adding a second setting.
 *
 * The other games keep the modes they already had; their Easy/Hard labels mean
 * what they always meant and have nothing to do with fame.
 */
export type Difficulty = FameTier;

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface DifficultyMeta {
  id: Difficulty;
  label: string;
  icon: string;
  /** Who you get asked about. */
  blurb: string;
}

export const DIFFICULTY_META: Record<Difficulty, DifficultyMeta> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    icon: '🟢',
    blurb: 'The names everyone knows — World Cup winners, FNCS champions, the biggest earners.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    icon: '🟡',
    blurb: 'Regulars of the competitive scene: known if you watch, not household names.',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    icon: '🔴',
    blurb: 'Deep cuts — regional winners and one-off qualifiers only the scene remembers.',
  },
};

import type { FameTier } from '@/data/liquipedia/roster';

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
  /**
   * Who you get asked about, in as few words as it takes — the whole hint on
   * the setup card. The cards used to print the earnings band under it too
   * ("$100K+ earned"), which was a number to decode rather than a promise
   * about who you would recognise, and it went.
   */
  blurb: string;
}

export const DIFFICULTY_META: Record<Difficulty, DifficultyMeta> = {
  easy: {
    id: 'easy',
    label: 'Easy',
    icon: '🟢',
    blurb: 'The names everyone knows.',
  },
  medium: {
    id: 'medium',
    label: 'Medium',
    icon: '🟡',
    blurb: 'Regulars of the competitive scene.',
  },
  hard: {
    id: 'hard',
    label: 'Hard',
    icon: '🔴',
    blurb: 'Deep cuts only the scene remembers.',
  },
};

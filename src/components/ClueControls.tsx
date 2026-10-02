import type { ReactNode } from 'react';
import { cluesLeft, guessesLeft, type ClueRound, type Named } from '@/games/shared/clue-round';
import { GiveUpButton } from './GiveUpButton';

/**
 * The two ways out of a clue round you are stuck in — take the next clue, or
 * give up — side by side, as Career Path and Who Are Ya have them. `noun` is
 * what a clue is called in this game: a year, a player, a placement.
 */
export function ClueActions({
  round,
  noun,
  onReveal,
  onGiveUp,
}: {
  round: ClueRound<Named, unknown>;
  noun: string;
  onReveal: () => void;
  onGiveUp: () => void;
}) {
  const left = cluesLeft(round);
  const guesses = guessesLeft(round);
  return (
    <div className="action-pair">
      <button type="button" className="btn" onClick={onReveal} disabled={left === 0}>
        {left > 0
          ? `Reveal next ${noun} (${left} left)`
          : guesses > 1
            ? `All revealed — ${guesses} guesses left`
            : 'All revealed — last guess!'}
      </button>
      <GiveUpButton onGiveUp={onGiveUp} variant="danger" />
    </div>
  );
}

/** Every guess so far, red until the right one. */
export function GuessChips({
  guesses,
  secretId,
  title = 'Your guesses',
  render,
}: {
  guesses: readonly Named[];
  secretId: string;
  title?: string;
  /** What a chip says, when it is more than the name. */
  render?: (guess: Named) => ReactNode;
}) {
  if (guesses.length === 0) return null;
  return (
    <section className="card stack-sm">
      <div className="card__title">{title}</div>
      <div className="row">
        {guesses.map((guess) => (
          <span key={guess.id} className={`chip ${guess.id === secretId ? 'chip--success' : 'chip--danger'}`}>
            {render ? render(guess) : guess.name}
          </span>
        ))}
      </div>
    </section>
  );
}

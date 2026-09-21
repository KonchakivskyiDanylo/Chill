import { useEffect, useState } from 'react';

/**
 * Ends the current round and reveals the answer.
 *
 * Two-step on purpose: the first click arms it, the second does it. Giving up
 * cannot be undone, and in the endless games a stray click would throw away a
 * streak someone has spent ten minutes on — a single button is too easy to hit
 * by accident next to "New game". It disarms itself after a few seconds so it
 * never sits there looking like a permanent state.
 */
export function GiveUpButton({
  onGiveUp,
  label = 'Give up',
  variant = 'quiet',
}: {
  onGiveUp: () => void;
  label?: string;
  /**
   * `quiet` is the small grey control that sits under a board — the default,
   * because in most games giving up is an escape hatch and should not compete
   * with the thing you are meant to be doing. `danger` is a full-size red
   * button for the one layout that pairs it with another action on the same
   * row, where matching weights is what makes the pair readable as a choice.
   */
  variant?: 'quiet' | 'danger';
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  const className =
    variant === 'danger'
      ? `btn btn--danger${armed ? ' btn--danger-armed' : ''}`
      : `icon-btn${armed ? ' icon-btn--danger' : ''}`;

  return (
    <button
      type="button"
      className={className}
      aria-label={armed ? 'Confirm giving up' : label}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onGiveUp();
        } else {
          setArmed(true);
        }
      }}
    >
      {armed ? 'Sure? Reveal' : `🏳 ${label}`}
    </button>
  );
}

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
export function GiveUpButton({ onGiveUp, label = 'Give up' }: { onGiveUp: () => void; label?: string }) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(timer);
  }, [armed]);

  return (
    <button
      type="button"
      className={`icon-btn${armed ? ' icon-btn--danger' : ''}`}
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

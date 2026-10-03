import { useEffect, useState } from 'react';
import { dayKey, isDayKey, msUntilNextDay } from './day';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A day to pretend it is, from `?day=YYYY-MM-DD` — dev builds only, for
 * checking tomorrow's puzzles or a streak across a week without waiting.
 */
function devDay(): string | null {
  if (!import.meta.env?.DEV || typeof window === 'undefined') return null;
  const asked = new URLSearchParams(window.location.search).get('day');
  return isDayKey(asked) ? asked : null;
}

/** Today, kept current: the component re-renders when the day turns over. */
export function useToday(): string {
  const [today, setToday] = useState(() => devDay() ?? dayKey());
  useEffect(() => {
    if (devDay()) return;
    // A little past midnight, so the new day has definitely begun.
    const id = window.setTimeout(() => setToday(dayKey()), msUntilNextDay() + 500);
    return () => window.clearTimeout(id);
  }, [today]);
  return today;
}

/** "05:12:33" until the next puzzle, ticking once a second. */
export function useCountdown(): string {
  const [left, setLeft] = useState(() => msUntilNextDay());
  useEffect(() => {
    const id = window.setInterval(() => setLeft(msUntilNextDay()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const total = Math.max(0, Math.floor(left / 1000));
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

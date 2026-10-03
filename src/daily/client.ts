import { useEffect, useState } from 'react';
import { isDayKey } from './day';
import type { DailySet } from './types';

/**
 * Today's puzzles, from the server.
 *
 * The server makes a day's set once and keeps it, so everyone gets the same
 * one (`GET /api/daily/<day>`). A dev server running without the API — plain
 * `npm run dev` — makes the set in the browser instead, from the same code, so
 * the games still open; it has no history to avoid repeats with, which only a
 * developer ever sees.
 */

const cache = new Map<string, Promise<DailySet>>();

async function fetchSet(day: string): Promise<DailySet> {
  const res = await fetch(`/api/daily/${day}`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`The daily puzzles did not load (${res.status}).`);
  const set = (await res.json()) as DailySet;
  if (!set || set.day !== day || typeof set.puzzles !== 'object') throw new Error('The daily puzzles came back garbled.');
  return set;
}

async function makeHere(day: string): Promise<DailySet> {
  const { generateDaily, loadDailyData } = await import('./generate');
  return generateDaily(day, await loadDailyData(), []);
}

export function loadDailySet(day: string): Promise<DailySet> {
  if (!isDayKey(day)) return Promise.reject(new Error(`Not a day: ${day}`));
  if (!cache.has(day)) {
    const loading = fetchSet(day).catch((error: unknown) => {
      if (import.meta.env.DEV) return makeHere(day);
      throw error;
    });
    // A failure is not remembered, so the next visit tries again.
    loading.catch(() => cache.delete(day));
    cache.set(day, loading);
  }
  return cache.get(day)!;
}

/** The set for `day`; `null` day means daily play is off and nothing is fetched. */
export function useDailySet(day: string | null): { set: DailySet | null; error: string | null } {
  const [state, setState] = useState<{ day: string | null; set: DailySet | null; error: string | null }>({
    day: null,
    set: null,
    error: null,
  });
  useEffect(() => {
    if (!day) return;
    let live = true;
    loadDailySet(day).then(
      (set) => live && setState({ day, set, error: null }),
      (error: unknown) => live && setState({ day, set: null, error: error instanceof Error ? error.message : String(error) }),
    );
    return () => {
      live = false;
    };
  }, [day]);
  return state.day === day ? { set: state.set, error: state.error } : { set: null, error: null };
}

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

/**
 * localStorage with graceful degradation — private windows, blocked site data
 * and quota errors must never break a game, they just lose persistence.
 */

// Pre-dates the rename to OffSpawn, and stays: it is an invisible key, and
// changing it would silently wipe every best score already on a player's device.
const PREFIX = 'chillfn:';

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function writeLocal<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable — carry on without persistence */
  }
  announce(key);
}

/**
 * One shared cache behind every `useLocalState`, so two components reading the
 * same key are reading the same value.
 *
 * Without this each hook kept private state seeded from storage at mount, and
 * a write from one was invisible to the other until a reload. That was
 * survivable while the only shared setting was the theme — a component that
 * never re-renders on a theme change is a component nobody notices. The event
 * mode broke it: the header chip, the home page strip and the game you are in
 * are three separate readers of one choice, and all three have to move together
 * the moment any of them changes it.
 */
const cache = new Map<string, unknown>();
const listeners = new Map<string, Set<() => void>>();

function announce(key: string): void {
  cache.delete(key);
  for (const listener of listeners.get(key) ?? []) listener();
}

function subscribe(key: string, listener: () => void): () => void {
  let set = listeners.get(key);
  if (!set) listeners.set(key, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

/**
 * The same key, changed in another tab.
 *
 * `storage` only fires in the tabs that did *not* make the change, so this
 * cannot double-announce a local write. Without it two open tabs drift apart:
 * leaving the Globals in one would leave the other still playing them, with a
 * header chip saying so and a `localStorage` that disagrees.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (changed) => {
    if (changed.storageArea !== window.localStorage) return;
    // `key === null` is a `clear()`, which invalidates everything.
    if (changed.key === null) {
      for (const key of [...listeners.keys()]) announce(key);
      return;
    }
    if (changed.key.startsWith(PREFIX)) announce(changed.key.slice(PREFIX.length));
  });
}

/**
 * The current value, memoised.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-reads on every
 * render, so parsing the JSON afresh each time would hand it a new object
 * every time and loop forever. The cache is the identity, and `announce`
 * is the only thing that drops it.
 */
function snapshot<T>(key: string, fallback: T): T {
  if (!cache.has(key)) cache.set(key, readLocal(key, fallback));
  return cache.get(key) as T;
}

/** State backed by localStorage, shared by every component reading that key. */
export function useLocalState<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    useCallback((listener) => subscribe(key, listener), [key]),
    () => snapshot(key, initial),
    () => initial,
  );

  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      const resolved =
        typeof next === 'function' ? (next as (p: T) => T)(snapshot(key, initial)) : next;
      writeLocal(key, resolved);
    },
    // `initial` is only ever read when storage holds nothing, so a caller
    // passing a fresh object literal each render must not re-arm the callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );

  return [value, update];
}

/**
 * A best score that only ever moves up. `scope` lets one game keep separate
 * records per category/difficulty.
 */
export function useBestScore(scope: string): { best: number; submit: (score: number) => boolean } {
  const key = `best:${scope}`;
  const [best, setBest] = useState<number>(() => readLocal(key, 0));

  useEffect(() => {
    setBest(readLocal(key, 0));
  }, [key]);

  const submit = useCallback(
    (score: number) => {
      if (score <= best) return false;
      writeLocal(key, score);
      setBest(score);
      return true;
    },
    [key, best],
  );

  return { best, submit };
}

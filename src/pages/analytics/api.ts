import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FILTER_KEYS, parseFilter, type Filter } from '@/analytics/aggregate';

/** One call to the admin API. The status comes back so a 401 can log the page out. */
export async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`/api/admin/${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : null };
}

/**
 * What every page on the dashboard shares: how to log out when the session
 * lapses, and a counter the ↻ button bumps so every open view reloads.
 */
export const AdminContext = createContext<{ onOut: () => void; tick: number }>({ onOut: () => {}, tick: 0 });

/** Days the dashboard opens on when the address says nothing. */
export const DEFAULT_DAYS = 30;

/**
 * The range and the filters, kept in the address.
 *
 * In the query string rather than in state, so moving from the overview to a
 * game's page or a player's keeps "last 7 days, Chosen, Europe" in force, and
 * a view can be bookmarked or reloaded exactly as it was.
 */
export function useScope() {
  const [params, setParams] = useSearchParams();
  const days = params.has('days') ? Math.max(0, Number(params.get('days')) || 0) : DEFAULT_DAYS;
  const filter = useMemo(() => parseFilter(params), [params]);

  const set = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === '') next.delete(key);
        else next.set(key, String(value));
      }
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const clear = useCallback(() => set(Object.fromEntries(FILTER_KEYS.map((key) => [key, null]))), [set]);

  /** The query string for an API call: the range, the filters, and anything extra. */
  const query = useCallback(
    (extra: Partial<Filter> = {}) => {
      const out = new URLSearchParams({ days: String(days) });
      for (const [key, value] of Object.entries({ ...filter, ...extra })) {
        if (value) out.set(key, String(value));
      }
      return out.toString();
    },
    [days, filter],
  );

  const active = FILTER_KEYS.filter((key) => key !== 'game' && filter[key] !== undefined).length;
  return { params, days, filter, set, clear, query, active, search: params.toString() };
}

/**
 * GETs `path` whenever it changes or ↻ is pressed. `null` skips the call.
 * A 401 anywhere logs the whole page out.
 */
export function useAdminData<T>(path: string | null): { data: T | null; loading: boolean } {
  const { onOut, tick } = useContext(AdminContext);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!path) return;
    let live = true;
    setLoading(true);
    api<T>(path)
      .then(({ status, body }) => {
        if (!live) return;
        if (status === 401) return onOut();
        setData(body);
      })
      .catch(() => {})
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [path, tick, onOut]);

  return { data, loading };
}

import { useEffect, useRef } from 'react';
import { effective, type PoolChoice } from '@/games/shared/pool';
import {
  RECORD_VERSION,
  type ClientError,
  type FunnelHit,
  type GameId,
  type GamePayloads,
  type Outcome,
  type RoundRecord,
  type Setup,
  type SupportRequest,
} from './types';

/**
 * The browser half of the analytics: sending page opens, round starts,
 * finished rounds, support requests and errors to the site's own server.
 *
 * Rounds are only sent from a production build, so playing on `npm run dev`
 * does not fill the dashboard with test games — set `VITE_RECORD=1` to send
 * them anyway, as `npm run dev:all` does. Sending never blocks or breaks a
 * game: every request is fire-and-forget and a failure is swallowed.
 */
const SEND_ROUNDS = import.meta.env.PROD || import.meta.env.VITE_RECORD === '1';

/** Which build sent a record — see `define` in `vite.config.ts`. */
export const APP_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'dev';

/**
 * `keepalive`, so a record sent as the player closes the tab still arrives.
 * The endpoints are called funnel/rounds/support/errors rather than anything
 * with "analytics" or "track" in it, because blockers match on those words.
 */
async function post(path: string, body: unknown): Promise<boolean> {
  try {
    const res = await fetch(`/api/${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** The last round finished on this page — what the support form offers to attach. */
let last: { record: RoundRecord; title: string } | null = null;

export function lastRound(): { record: RoundRecord; title: string } | null {
  return last;
}

/**
 * Records a finished round.
 *
 * `title` is only for the support form ("Career Path — Peterbot") and is not
 * sent with the record.
 */
export function sendRound(record: RoundRecord, title: string): void {
  last = { record, title };
  if (SEND_ROUNDS) void post('rounds', record);
}

/**
 * The page open right now, and whether a round has been started on it — held
 * in memory for this page load only, never stored.
 */
let opened: { page: string; at: number; started: boolean } | null = null;
let entered = false;

/** A page opened: the home page or a game's. */
export function sendOpen(page: FunnelHit['page'], daily?: boolean): void {
  const now = Date.now();
  // React's development double-run of effects, not a second visit.
  if (opened?.page === page && now - opened.at < 1000) return;
  opened = { page, at: now, started: false };
  const entry = !entered;
  entered = true;
  if (SEND_ROUNDS) void post('funnel', { step: 'open', page, daily: page === 'home' ? undefined : Boolean(daily), entry } satisfies FunnelHit);
}

/**
 * A round started: a new deal in unlimited play, or the first move on the
 * day's puzzle (`useDailyRound`). The finish is `useRoundRecorder`'s record.
 */
export function sendStart(game: GameId, daily: boolean): void {
  const first = opened?.page === game && !opened.started;
  if (opened?.page === game) opened.started = true;
  if (SEND_ROUNDS) void post('funnel', { step: 'start', page: game, daily, first } satisfies FunnelHit);
}

/** Counts the page as opened once per visit to it — on arriving, not on every render. */
export function useOpen(page: FunnelHit['page'] | null, daily?: boolean): void {
  useEffect(() => {
    if (page) sendOpen(page, daily);
    // Only a new page is a new open; the mode is read as it was on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
}

/**
 * Support requests are always sent — the form says so when it fails.
 *
 * `trap` is the form's hidden field. A person leaves it empty; when a bot
 * fills it the server accepts the request and throws it away.
 */
export function sendSupport(request: SupportRequest, trap = ''): Promise<boolean> {
  return post('support', trap ? { ...request, website: trap } : request);
}

/** The setup of a game on the shared pool picker. */
export function poolSetup(event: string | null, choice: PoolChoice, mode?: string): Setup {
  if (event) return { event, mode };
  const { region, difficulty, status } = effective(choice);
  return { event: null, pick: choice.mode, region, difficulty, status, mode };
}

/**
 * Sends a round once, when it finishes.
 *
 * Fires on the change from playing to finished, so starting the same board
 * again and finishing it again is a second record, and re-rendering a
 * finished board is not. `make` is read at that moment, so it sees the final
 * state.
 */
export function useRoundRecorder<G extends GameId>(
  game: G,
  finished: boolean,
  make: () => { title: string; data: string; setup: Setup; outcome: Outcome; r: GamePayloads[G] },
): void {
  const sent = useRef(false);
  const latest = useRef(make);
  latest.current = make;

  useEffect(() => {
    if (!finished) {
      sent.current = false;
      return;
    }
    if (sent.current) return;
    sent.current = true;
    const { title, data, setup, outcome, r } = latest.current();
    const record: RoundRecord<G> = { v: RECORD_VERSION, game, app: APP_BUILD, data, setup, outcome, r };
    sendRound(record as RoundRecord, title);
  }, [finished, game]);
}

/**
 * Reports uncaught errors, so a page that breaks shows up on the dashboard
 * without anyone having to write in. At most five per page load, and the same
 * message once, so one bug in a render loop cannot flood the table.
 */
export function installErrorReporting(): void {
  if (!import.meta.env.PROD) return;
  const seen = new Set<string>();
  const report = (message: string, stack?: string) => {
    if (seen.size >= 5 || seen.has(message)) return;
    seen.add(message);
    const body: ClientError = {
      message: message.slice(0, 500),
      stack: stack?.slice(0, 4000),
      page: location.pathname + location.search,
      app: APP_BUILD,
    };
    void post('errors', body);
  };
  window.addEventListener('error', (event) => report(event.message, event.error?.stack));
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    report(reason instanceof Error ? reason.message : String(reason), reason?.stack);
  });
}

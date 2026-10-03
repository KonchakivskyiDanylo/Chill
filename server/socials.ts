import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Platform, SocialsPayload } from '@/data/socials';
import type { Store } from './store';

/**
 * YouTube subscribers and Twitch followers, fetched by the server itself.
 *
 * Both platforms limit how long their numbers may be kept (checked 3 Oct
 * 2026): YouTube 30 days, then refreshed or deleted; Twitch 24 hours. So the
 * counts are never a file in git. The server fetches them about once a day
 * (`scheduleSocials`), keeps only the latest set, and never serves a Twitch
 * count older than a day or a YouTube count older than thirty — a platform
 * whose refresh failed simply drops out until the next one works.
 *
 * The links come from `links.json` (Liquipedia's, written by
 * scripts/build_data.py). This is scripts/socials_api.py in TypeScript, which
 * stays for running by hand.
 *
 * Configuration, environment variables:
 *   YOUTUBE_API_KEY        a Google Cloud API key with YouTube Data API v3
 *   TWITCH_CLIENT_ID       a Twitch application's client ID
 *   TWITCH_CLIENT_SECRET   only if that application is Confidential
 *   SOCIALS_FETCH=1        fetch on a dev server too (the live one always does)
 * Twitch's follower totals need a logged-in user: log in once from
 * /analytics/socials, and the server keeps and refreshes the token.
 */

const YOUTUBE = 'https://www.googleapis.com/youtube/v3';
const HELIX = 'https://api.twitch.tv/helix';
const TWITCH_AUTH = 'https://id.twitch.tv/oauth2';
const TWITCH_SCOPES = 'moderator:read:followers';

/** How long each platform's counts may be served. */
export const MAX_AGE: Record<Platform, number> = { youtube: 30 * 86_400_000, twitch: 24 * 3_600_000 };
/** A count this old is due a refresh — see `scheduleSocials`. */
const DUE = 20 * 3_600_000;
/** A remembered handle -> channel lookup is asked again after this long (YouTube's 30 days). */
const RESOLVE_AGE = 25 * 86_400_000;
const YT_QUOTA = 9000;
/** A new list this much shorter than the last is a broken answer, not news. */
const SHRINK_GUARD = 0.6;

const KEY = process.env.YOUTUBE_API_KEY?.trim() ?? '';
const CLIENT_ID = process.env.TWITCH_CLIENT_ID?.trim() ?? '';
const CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET?.trim() ?? '';
const SECURE = process.env.NODE_ENV === 'production';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const log = (message: string) => console.log(`[socials] ${message}`);

// ------------------------------------------------------------------ links --

type YouTubeRef = ['id' | 'handle' | 'username' | 'custom', string];

export function youtubeRef(url: string): YouTubeRef | null {
  const match = /^https?:\/\/(?:www\.|m\.)?youtube\.com\/(.*)$/i.exec(url.trim());
  if (!match) return null;
  let tail = match[1];
  try {
    tail = decodeURIComponent(tail);
  } catch {
    /* keep it as written */
  }
  const parts = tail.split(/[?#]/)[0].split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const head = parts[0];
  if (head.toLowerCase() === 'channel' && parts[1]?.startsWith('UC')) return ['id', parts[1]];
  if (head.startsWith('@')) return ['handle', head.slice(1)];
  if (head.toLowerCase() === 'user' && parts[1]) return ['username', parts[1]];
  if (head.toLowerCase() === 'c' && parts[1]) return ['custom', parts[1]];
  if (['watch', 'playlist', 'shorts', 'results', 'feed'].includes(head.toLowerCase())) return null;
  return ['custom', head];
}

export function twitchLogin(url: string): string | null {
  const match = /^https?:\/\/(?:www\.|m\.)?twitch\.tv\/([A-Za-z0-9_]{2,25})\/?(?:[?#].*)?$/i.exec(url.trim());
  return match ? match[1].toLowerCase() : null;
}

interface Links {
  generated: string;
  players: Record<string, { youtube?: string[]; twitch?: string[] }>;
}

const DATA = process.env.OFFSPAWN_DATA || path.join(process.cwd(), 'liquipedia_data', 'clean_data', 'fortnite');

async function readLinks(): Promise<Links | null> {
  try {
    return JSON.parse(await readFile(path.join(DATA, 'links.json'), 'utf8')) as Links;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- YouTube --

interface YouTubeState {
  /** "handle:bugha" -> the channel and when that was looked up. */
  refs: Record<string, { id: string | null; checked: number }>;
}

class QuotaSpent extends Error {}

async function youtubeGet(endpoint: string, params: Record<string, string>, budget: { left: number }, cost = 1) {
  if (budget.left < cost) throw new QuotaSpent('quota for this run is spent');
  for (let attempt = 0; ; attempt++) {
    const url = `${YOUTUBE}/${endpoint}?${new URLSearchParams({ ...params, key: KEY })}`;
    const res = await fetch(url).catch(() => null);
    budget.left -= cost;
    if (!res || res.status >= 500) {
      if (attempt >= 3) throw new Error(`YouTube ${endpoint}: ${res ? res.status : 'no answer'}`);
      await sleep(5_000 * (attempt + 1));
      continue;
    }
    const body = (await res.json().catch(() => ({}))) as {
      items?: { id: string; statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[];
      error?: { message?: string; errors?: { reason?: string }[] };
    };
    if (res.status === 403 && body.error?.errors?.some((e) => /quotaExceeded|dailyLimitExceeded/.test(e.reason ?? ''))) {
      throw new QuotaSpent("YouTube's daily quota is used up");
    }
    if (res.status === 400 || res.status === 404) return { items: [] };
    if (!res.ok) throw new Error(`YouTube ${endpoint}: HTTP ${res.status} ${body.error?.message ?? ''}`);
    return body;
  }
}

async function fetchYouTube(links: Links, store: Store): Promise<Record<string, number> | null> {
  if (!KEY) return null;
  const state = ((await store.socialState('youtube')) as YouTubeState | null) ?? { refs: {} };
  const refsByPlayer = Object.entries(links.players).map(
    ([page, entry]) => [page, (entry.youtube ?? []).map(youtubeRef).filter((ref): ref is YouTubeRef => ref !== null)] as const,
  );
  const all = new Map<string, YouTubeRef>();
  for (const [, refs] of refsByPlayer) for (const ref of refs) all.set(`${ref[0]}:${ref[1].toLowerCase()}`, ref);
  const budget = { left: YT_QUOTA - Math.ceil(all.size / 50) - 2 };
  const now = Date.now();
  let looked = 0;
  try {
    for (const [key, [kind, value]] of all) {
      if (kind === 'id') continue;
      const known = state.refs[key];
      if (known && now - known.checked < RESOLVE_AGE) continue;
      const by = async (field: string, v: string) => {
        const data = await youtubeGet('channels', { part: 'id', [field]: v }, budget);
        return data.items?.[0]?.id ?? null;
      };
      const found =
        kind === 'handle'
          ? await by('forHandle', `@${value}`)
          : kind === 'username'
            ? await by('forUsername', value)
            : ((await by('forHandle', `@${value}`)) ?? (await by('forUsername', value)));
      state.refs[key] = { id: found, checked: now };
      looked++;
    }
  } catch (error) {
    if (!(error instanceof QuotaSpent)) throw error;
    log(`youtube: ${error.message} after ${looked} lookups; the rest carry over to tomorrow`);
  }
  await store.setSocialState('youtube', state);
  const channel = ([kind, value]: YouTubeRef) => (kind === 'id' ? value : (state.refs[`${kind}:${value.toLowerCase()}`]?.id ?? null));

  const ids = [...new Set(refsByPlayer.flatMap(([, refs]) => refs.map(channel)).filter((id): id is string => Boolean(id)))].sort();
  const subs = new Map<string, number>();
  budget.left += Math.ceil(ids.length / 50) + 2;
  for (let i = 0; i < ids.length; i += 50) {
    const data = await youtubeGet('channels', { part: 'statistics', id: ids.slice(i, i + 50).join(','), maxResults: '50' }, budget);
    for (const item of data.items ?? []) {
      const stats = item.statistics;
      if (!stats || stats.hiddenSubscriberCount || stats.subscriberCount === undefined) continue;
      subs.set(item.id, Number(stats.subscriberCount));
    }
  }
  const counts: Record<string, number> = {};
  for (const [page, refs] of refsByPlayer) {
    const best = Math.max(...refs.map(channel).map((id) => (id ? (subs.get(id) ?? -1) : -1)));
    if (best >= 0) counts[page] = best;
  }
  log(`youtube: ${Object.keys(counts).length} players, ${looked} new lookups, ${YT_QUOTA - budget.left} units`);
  return counts;
}

// ----------------------------------------------------------------- Twitch --

interface TwitchToken {
  access: string;
  refresh: string | null;
  expires: number;
}

async function tokenRequest(form: Record<string, string>): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await fetch(`${TWITCH_AUTH}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(CLIENT_SECRET ? { ...form, client_secret: CLIENT_SECRET } : form),
  });
  return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

function keep(body: Record<string, unknown>): TwitchToken {
  return {
    access: String(body.access_token),
    refresh: body.refresh_token ? String(body.refresh_token) : null,
    expires: Date.now() + Number(body.expires_in ?? 0) * 1000,
  };
}

async function twitchToken(store: Store, force = false): Promise<TwitchToken | null> {
  const token = (await store.socialState('twitch-token')) as TwitchToken | null;
  if (!token) return null;
  if (!force && token.expires > Date.now() + 60_000) return token;
  if (!token.refresh) return null;
  const { status, body } = await tokenRequest({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: token.refresh });
  if (status !== 200 || !body.access_token) {
    log(`twitch: the login could not be refreshed (${status}) — log in again from /analytics/socials`);
    await store.setSocialState('twitch-token', null);
    return null;
  }
  const fresh = keep(body);
  await store.setSocialState('twitch-token', fresh);
  return fresh;
}

/** The device login in progress, if any — the admin page shows its code. */
let pendingLogin: { code: string; url: string; expires: number } | null = null;

export async function startTwitchLogin(store: Store): Promise<{ code: string; url: string } | { error: string }> {
  if (!CLIENT_ID) return { error: 'Set TWITCH_CLIENT_ID on the server first.' };
  const res = await fetch(`${TWITCH_AUTH}/device`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scopes: TWITCH_SCOPES }),
  });
  if (!res.ok) return { error: `Twitch refused the login: HTTP ${res.status}` };
  const device = (await res.json()) as {
    device_code: string;
    user_code: string;
    verification_uri: string;
    expires_in?: number;
    interval?: number;
  };
  const expires = Date.now() + (device.expires_in ?? 1800) * 1000;
  pendingLogin = { code: device.user_code, url: device.verification_uri, expires };
  // Wait for the code to be entered, in the background.
  void (async () => {
    let interval = (device.interval ?? 5) * 1000;
    while (Date.now() < expires && pendingLogin?.code === device.user_code) {
      await sleep(interval);
      const { status, body } = await tokenRequest({
        client_id: CLIENT_ID,
        scopes: TWITCH_SCOPES,
        device_code: device.device_code,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      });
      if (status === 200 && body.access_token) {
        await store.setSocialState('twitch-token', keep(body));
        pendingLogin = null;
        log('twitch: logged in');
        void refreshSocials(store, 'twitch');
        return;
      }
      const message = String(body.message ?? '');
      if (/slow/.test(message)) interval += 5000;
      else if (!/pending/.test(message)) break;
    }
    if (pendingLogin?.code === device.user_code) pendingLogin = null;
  })();
  return { code: device.user_code, url: device.verification_uri };
}

async function fetchTwitch(links: Links, store: Store): Promise<Record<string, number> | null> {
  if (!CLIENT_ID) return null;
  let token = await twitchToken(store);
  if (!token) return null;
  const get = async (endpoint: string, params: [string, string][]) => {
    for (let attempt = 0; ; attempt++) {
      const res = await fetch(`${HELIX}/${endpoint}?${new URLSearchParams(params)}`, {
        headers: { Authorization: `Bearer ${token!.access}`, 'Client-Id': CLIENT_ID },
      }).catch(() => null);
      if (res?.status === 401 && attempt === 0) {
        token = await twitchToken(store, true);
        if (!token) throw new Error('the Twitch login has expired');
        continue;
      }
      if (res?.status === 429) {
        const reset = Number(res.headers.get('ratelimit-reset') ?? 0) * 1000;
        await sleep(Math.max(1000, reset - Date.now()));
        continue;
      }
      if (!res || res.status >= 500) {
        if (attempt >= 3) throw new Error(`Twitch ${endpoint}: ${res ? res.status : 'no answer'}`);
        await sleep(5_000 * (attempt + 1));
        continue;
      }
      if (res.status === 400 || res.status === 404) return {};
      if (!res.ok) throw new Error(`Twitch ${endpoint}: HTTP ${res.status}`);
      if (res.headers.get('ratelimit-remaining') === '0') {
        const reset = Number(res.headers.get('ratelimit-reset') ?? 0) * 1000;
        await sleep(Math.max(0, reset - Date.now()));
      }
      return (await res.json()) as { data?: { login: string; id: string }[]; total?: number };
    }
  };
  const loginsByPlayer = Object.entries(links.players).map(
    ([page, entry]) => [page, (entry.twitch ?? []).map(twitchLogin).filter((login): login is string => Boolean(login))] as const,
  );
  const logins = [...new Set(loginsByPlayer.flatMap(([, list]) => list))].sort();
  // Logins to ids afresh every time: a day-old id is Twitch data kept past a day.
  const idOf = new Map<string, string>();
  for (let i = 0; i < logins.length; i += 100) {
    const data = await get('users', logins.slice(i, i + 100).map((login) => ['login', login] as [string, string]));
    for (const row of data.data ?? []) idOf.set(row.login.toLowerCase(), row.id);
  }
  const totals = new Map<string, number>();
  for (const id of new Set(idOf.values())) {
    const data = await get('channels/followers', [
      ['broadcaster_id', id],
      ['first', '1'],
    ]);
    if (typeof data.total === 'number') totals.set(id, data.total);
  }
  const counts: Record<string, number> = {};
  for (const [page, list] of loginsByPlayer) {
    const best = Math.max(...list.map((login) => totals.get(idOf.get(login) ?? '') ?? -1));
    if (best >= 0) counts[page] = best;
  }
  log(`twitch: ${Object.keys(counts).length} players from ${totals.size} channels`);
  return counts;
}

// -------------------------------------------------------------- the store --

/** What the site gets: each platform that is fresh, with when it was fetched. */
export async function servedSocials(store: Store): Promise<SocialsPayload> {
  const out: SocialsPayload = {};
  for (const platform of ['youtube', 'twitch'] as const) {
    const kept = await store.socials(platform);
    if (kept && Date.now() - Date.parse(kept.fetched) <= MAX_AGE[platform]) out[platform] = kept;
  }
  // A dev server with nothing fetched reads the developer's own socials.json,
  // however old — it never reaches the live site, and never git.
  if (!SECURE && !out.youtube && !out.twitch) {
    try {
      const local = JSON.parse(await readFile(path.join(DATA, 'socials.json'), 'utf8')) as SocialsPayload;
      return { youtube: local.youtube, twitch: local.twitch };
    } catch {
      /* none */
    }
  }
  return out;
}

const running = new Set<Platform>();
const lastError: Partial<Record<Platform, string>> = {};

export async function refreshSocials(store: Store, only?: Platform): Promise<void> {
  const links = await readLinks();
  if (!links) {
    log('no links.json — run scripts/build_data.py');
    return;
  }
  for (const platform of only ? [only] : (['youtube', 'twitch'] as const)) {
    if (running.has(platform)) continue;
    running.add(platform);
    try {
      const counts = platform === 'youtube' ? await fetchYouTube(links, store) : await fetchTwitch(links, store);
      if (!counts) continue;
      const before = await store.socials(platform);
      const had = Object.keys(before?.counts ?? {}).length;
      if (had && Object.keys(counts).length < had * SHRINK_GUARD) {
        lastError[platform] = `only ${Object.keys(counts).length} counts against ${had} last time — kept the old ones`;
        log(`${platform}: ${lastError[platform]}`);
        continue;
      }
      await store.setSocials(platform, { fetched: new Date().toISOString(), counts });
      delete lastError[platform];
    } catch (error) {
      lastError[platform] = error instanceof Error ? error.message : String(error);
      log(`${platform}: ${lastError[platform]}`);
    } finally {
      running.delete(platform);
    }
  }
}

/** For /analytics/socials. */
export async function socialsStatus(store: Store) {
  const out: Record<string, unknown> = {
    links: Boolean(await readLinks()),
    login: pendingLogin && pendingLogin.expires > Date.now() ? { code: pendingLogin.code, url: pendingLogin.url } : null,
  };
  for (const platform of ['youtube', 'twitch'] as const) {
    const kept = await store.socials(platform);
    out[platform] = {
      configured: platform === 'youtube' ? Boolean(KEY) : Boolean(CLIENT_ID),
      connected: platform === 'youtube' ? Boolean(KEY) : Boolean(await store.socialState('twitch-token')),
      fetched: kept?.fetched ?? null,
      players: kept ? Object.keys(kept.counts).length : 0,
      fresh: Boolean(kept && Date.now() - Date.parse(kept.fetched) <= MAX_AGE[platform]),
      running: running.has(platform),
      error: lastError[platform] ?? null,
    };
  }
  return out;
}

/**
 * Keeps the counts current: a check at start-up and every half hour, and a
 * refresh once a platform's counts are older than `DUE`. Twenty hours, not
 * twenty-four, so a slow or failed run has hours to try again before Twitch's
 * day is up — a refresh tied to midnight would sit right on that line. Nothing
 * runs without keys, so a server with none configured never calls out.
 *
 * Heroku's Eco dynos sleep when nobody visits; the check at start-up catches
 * up on waking, and until it finishes a stale platform is simply not served.
 */
export function scheduleSocials(store: Store): void {
  if (!KEY && !CLIENT_ID) return;
  // Only the live server fetches on its own. A dev server reads the developer's
  // socials.json instead, so starting one does not spend the YouTube quota;
  // SOCIALS_FETCH=1 turns the schedule on locally, for working on this file.
  if (!SECURE && process.env.SOCIALS_FETCH !== '1') return;
  const tick = async () => {
    for (const platform of ['youtube', 'twitch'] as const) {
      const kept = await store.socials(platform);
      const age = kept ? Date.now() - Date.parse(kept.fetched) : Infinity;
      if (age > DUE) await refreshSocials(store, platform);
    }
  };
  void tick();
  setInterval(() => void tick(), 30 * 60_000).unref();
}

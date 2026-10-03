import type { RosterPlayer } from './liquipedia/roster';

/**
 * YouTube subscribers and Twitch followers, per player.
 *
 * Never a file the site ships: both platforms limit how long their numbers may
 * be kept (YouTube 30 days, Twitch 24 hours), so the server fetches them itself
 * and hands out only fresh ones (`server/socials.ts`, `GET /api/socials`). A
 * platform the server has nothing fresh for is simply absent, and every game
 * that reads these leaves its follower categories out until it is back.
 *
 * YouTube's counts arrive rounded to three figures (2,240,000), as YouTube
 * gives them; the games show them as given. Neither is ever added to the other
 * — YouTube's terms rule out new numbers made from theirs.
 */

export type Platform = 'youtube' | 'twitch';
export const PLATFORMS: Platform[] = ['twitch', 'youtube'];

/** What the server sends: each fresh platform, when it was fetched, page name -> count. */
export type SocialsPayload = Partial<Record<Platform, { fetched: string; counts: Record<string, number> }>>;

export const PLATFORM_META: Record<Platform, { name: string; noun: string; short: string; icon: string }> = {
  twitch: { name: 'Twitch', noun: 'Twitch followers', short: 'followers', icon: '🟣' },
  youtube: { name: 'YouTube', noun: 'YouTube subscribers', short: 'subscribers', icon: '🔴' },
};

export class Socials {
  private readonly counts: Partial<Record<Platform, Map<string, number>>> = {};
  readonly fetched: Partial<Record<Platform, string>> = {};

  constructor(payload: SocialsPayload) {
    for (const platform of PLATFORMS) {
      const block = payload[platform];
      if (!block) continue;
      this.counts[platform] = new Map(Object.entries(block.counts));
      this.fetched[platform] = block.fetched;
    }
  }

  /** The platforms with counts right now. */
  get platforms(): Platform[] {
    return PLATFORMS.filter((platform) => this.counts[platform]);
  }

  has(platform: Platform): boolean {
    return Boolean(this.counts[platform]);
  }

  /** A player's count, or null when the platform is off or the player has no channel there. */
  of(platform: Platform, player: RosterPlayer | string): number | null {
    return this.counts[platform]?.get(typeof player === 'string' ? player : player.id) ?? null;
  }
}

export const NO_SOCIALS = new Socials({});

let cached: Promise<Socials> | null = null;

/**
 * The counts, once per page load. Never rejects: no server, no network or no
 * counts is the same as no follower categories.
 *
 * Under Node (`check:games`) it reads the developer's own socials.json, the file
 * `scripts/socials_api.py` writes and git never sees, when there is one.
 */
export function loadSocials(): Promise<Socials> {
  cached ??= (async () => {
    try {
      if (typeof window === 'undefined') {
        const { loadJson } = await import('./liquipedia/files');
        return new Socials((await loadJson('socials')) as SocialsPayload);
      }
      const res = await fetch('/api/socials', { headers: { accept: 'application/json' } });
      return res.ok ? new Socials((await res.json()) as SocialsPayload) : NO_SOCIALS;
    } catch {
      return NO_SOCIALS;
    }
  })();
  return cached;
}

/** "4.1M", "125K", "980" — the count the way a follower count is said. */
export function countShort(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(value >= 100_000 ? 0 : 1).replace(/\.0$/, '')}K`;
  return String(value);
}

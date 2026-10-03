import { loadFacts, type Facts } from '@/data/liquipedia/facts';
import { loadMajors, type Majors } from '@/data/liquipedia/majors';
import { loadOrgs, type Orgs } from '@/data/liquipedia/orgs';
import { loadRankings, type Rankings } from '@/data/liquipedia/rankings';
import { loadRoster, type Roster, type RosterPlayer } from '@/data/liquipedia/roster';
import { loadTeammates, type Teammates } from '@/data/liquipedia/teammates';
import type { Socials } from '@/data/socials';
import { pickDaily as careerPath } from '@/games/career-path/daily';
import { buildCriteria } from '@/games/list/criteria';
import { pickDaily as list } from '@/games/list/daily';
import { pickDaily as tenaball } from '@/games/tenaball/daily';
import { pickDaily as ticTacToe } from '@/games/tic-tac-toe/daily';
import { pickDaily as whoAreYa } from '@/games/who-are-ya/daily';
import { pickDaily as wordle } from '@/games/wordle/daily';
import { makeRng } from '@/lib/rng';
import { daysBetween } from './day';
import { knownPlayers } from './fame';
import type { DailyContext, DailyGame, DailyPuzzles, DailySet } from './types';

/**
 * Makes a day's puzzles.
 *
 * Run by the server the first time a day is asked for, and kept (see
 * `server/index.ts`); run in the browser only when there is no server — the
 * dev server on its own. Deterministic for a given day, data and history.
 */

export interface DailyData {
  /** Fresh follower counts, when there are any — a grid may then carry a follower rule. */
  socials?: Socials | null;
  roster: Roster;
  majors: Majors;
  teammates: Teammates;
  facts: Facts;
  orgs: Orgs;
  rankings: Rankings;
}

export async function loadDailyData(): Promise<DailyData> {
  const [roster, majors, teammates, facts, orgs, rankings] = await Promise.all([
    loadRoster(),
    loadMajors(),
    loadTeammates(),
    loadFacts(),
    loadOrgs(),
    loadRankings(),
  ]);
  return { roster, majors, teammates, facts, orgs, rankings };
}

/**
 * Who a one-player game's secret is drawn from: the famous names more often
 * than the regulars, never the deep cuts. A daily is the one puzzle everyone
 * plays, and Random's 15% of names only the scene knows would make one day in
 * seven unwinnable for most of them.
 */
export const DAILY_MIX: Readonly<Record<'easy' | 'medium', number>> = { easy: 0.6, medium: 0.4 };

/**
 * How far back a secret is kept out, tried longest first. The famous pool is
 * about a hundred players across three games, so after two months or so the
 * oldest ones start coming round again.
 */
const SECRET_REST = [Infinity, 180, 60, 14, 0];

/** The games whose puzzle is one secret player — no two the same player on one day. */
const SECRET_GAMES: DailyGame[] = ['wordle', 'career-path', 'who-are-ya'];

export function generateDaily(day: string, data: DailyData, history: readonly DailySet[]): DailySet {
  const earlier = history
    .filter((set) => set.day < day)
    .map((set) => ({ daysAgo: daysBetween(set.day, day), puzzles: set.puzzles }))
    .sort((a, b) => a.daysAgo - b.daysAgo);
  const today = new Set<string>();

  const ctx: DailyContext = {
    day,
    rng: (purpose) => makeRng(`daily:${day}:${purpose}`),
    recent: <G extends DailyGame>(game: G) =>
      earlier.flatMap(({ daysAgo, puzzles }) => {
        const puzzle = puzzles[game];
        return puzzle ? [{ daysAgo, puzzle: puzzle as DailyPuzzles[G] }] : [];
      }),
    pickPlayer: (game, pool) => {
      const rng = makeRng(`daily:${day}:${game}:secret`);
      const known = knownPlayers(data.roster);
      const dealt = earlier.flatMap(({ daysAgo, puzzles }) =>
        SECRET_GAMES.flatMap((other) => {
          const puzzle = puzzles[other] as { secret?: string } | undefined;
          return puzzle?.secret ? [{ daysAgo, id: puzzle.secret }] : [];
        }),
      );
      for (const rest of SECRET_REST) {
        const resting = new Set(dealt.filter((entry) => entry.daysAgo <= rest).map((entry) => entry.id));
        const open = (tier: 'easy' | 'medium') =>
          pool.filter(
            (player) =>
              player.tier === tier &&
              known.has(player.id) &&
              !today.has(player.id) &&
              !resting.has(player.id),
          );
        const tiers = (['easy', 'medium'] as const).map((tier) => ({ tier, players: open(tier) })).filter((t) => t.players.length > 0);
        if (tiers.length === 0) continue;
        let roll = rng() * tiers.reduce((sum, t) => sum + DAILY_MIX[t.tier], 0);
        const chosen = tiers.find((t) => (roll -= DAILY_MIX[t.tier]) < 0) ?? tiers[tiers.length - 1];
        const secret: RosterPlayer = chosen.players[Math.floor(rng() * chosen.players.length)];
        today.add(secret.id);
        return secret;
      }
      return null;
    },
  };

  const { roster, majors, teammates, facts, orgs, rankings } = data;
  const byId = new Map(roster.players.map((player) => [player.id, player]));
  const puzzles: Partial<DailyPuzzles> = {};
  // Each on its own: a game whose data is missing is left out, not the whole day.
  const make = <G extends DailyGame>(game: G, build: () => DailyPuzzles[G] | null) => {
    try {
      const puzzle = build();
      if (puzzle) puzzles[game] = puzzle;
    } catch (error) {
      console.error(`daily ${day}: ${game} failed`, error);
    }
  };
  make('wordle', () => wordle(roster, ctx));
  make('career-path', () => careerPath(roster, majors, ctx));
  make('who-are-ya', () => whoAreYa(roster, teammates, facts, byId, ctx));
  make('tenaball', () => tenaball(roster, rankings, data.socials ?? null, ctx));
  make('list', () => list(roster, buildCriteria(roster, facts, null, orgs, teammates, data.socials), ctx));
  make('tic-tac-toe', () => ticTacToe(roster, facts, orgs, data.socials ?? null, ctx));
  return { day, puzzles };
}

import type { Board, BoardRow } from '@/data/liquipedia/rankings';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { PLATFORM_META, type Platform, type Socials } from '@/data/socials';
import { SLOTS } from './engine';

/**
 * Top 10 boards by Twitch followers and YouTube subscribers, built in the
 * browser from the counts the server hands out — never written into
 * rankings.json, which is in git, because neither platform lets its numbers be
 * kept that long (`data/socials.ts`).
 *
 * Per platform: everyone, each region, FNCS champions, and players under 20.
 * Only rankings — never a total of anyone's counts, which YouTube's terms
 * would call a new metric made from theirs.
 */

export const SOCIAL_GROUP = 'Followers';

/** The boards a daily may be: the big ones, where the names are famous by definition. */
export const DAILY_SOCIAL = (id: string) => /^social:[a-z]+:(all|region:Europe|region:North America|fncs-winners)$/.test(id);

const TIE_RULE = 'Counts as Twitch and YouTube give them. Level counts go to the bigger career earner.';

const row = (player: RosterPlayer, value: number): BoardRow => ({
  key: player.id,
  label: player.name,
  value,
  display: value.toLocaleString('en-US'),
});

function board(
  id: string,
  title: string,
  platform: Platform,
  players: readonly RosterPlayer[],
  socials: Socials,
): Board | null {
  const ranked = players
    .map((player) => ({ player, value: socials.of(platform, player) }))
    .filter((entry): entry is { player: RosterPlayer; value: number } => entry.value !== null && entry.value > 0)
    .sort((a, b) => b.value - a.value || b.player.earnings - a.player.earnings);
  if (ranked.length <= SLOTS) return null;
  const [tenth, eleventh] = [ranked[SLOTS - 1], ranked[SLOTS]];
  // Level on the count and on earnings too: nothing a player could reason about decides it.
  if (tenth.value === eleventh.value && tenth.player.earnings === eleventh.player.earnings) return null;
  return {
    id,
    group: SOCIAL_GROUP,
    title,
    entity: 'player',
    tieRule: TIE_RULE,
    rows: ranked.slice(0, SLOTS).map((entry) => row(entry.player, entry.value)),
    next: row(eleventh.player, eleventh.value),
  };
}

export function socialBoards(roster: Roster, socials: Socials | null): Board[] {
  if (!socials) return [];
  const out: Board[] = [];
  const push = (made: Board | null) => made && out.push(made);
  for (const platform of socials.platforms) {
    const noun = PLATFORM_META[platform].noun;
    push(board(`social:${platform}:all`, `Top 10 by ${noun}`, platform, roster.players, socials));
    for (const region of roster.regions) {
      push(
        board(
          `social:${platform}:region:${region}`,
          `Top 10 by ${noun} — ${region}`,
          platform,
          roster.players.filter((player) => player.region === region),
          socials,
        ),
      );
    }
    push(
      board(
        `social:${platform}:fncs-winners`,
        `Top 10 FNCS champions by ${noun}`,
        platform,
        roster.players.filter((player) => player.fncsWins > 0),
        socials,
      ),
    );
    push(
      board(
        `social:${platform}:under-20`,
        `Top 10 players under 20 by ${noun}`,
        platform,
        roster.players.filter((player) => player.age !== null && player.age < 20),
        socials,
      ),
    );
  }
  return out;
}

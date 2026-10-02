import type { ClueRoundPayload, Outcome } from '@/analytics/types';
import type { Bios } from '@/data/liquipedia/bios';
import type { MajorResult, Majors } from '@/data/liquipedia/majors';
import { orgName, type Orgs } from '@/data/liquipedia/orgs';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';
import { moneyShort, ordinal, plural } from '@/lib/format';
import { recordRound, startRound, type ClueRound } from '@/games/shared/clue-round';

/**
 * Pure logic for IRL: a player's real name, then their file filled in a line
 * at a time until you name the handle.
 *
 * Built to the user's roadmap (2 Oct 2026): the real name first, then
 * nationality and region, age, organisations, achievements, a teammate,
 * aliases. The last line is the handle itself with its letters blanked —
 * "B _ _ _ _" — so a round always ends on something you can work out.
 */

export type ClueId =
  | 'name'
  | 'nationality'
  | 'born'
  | 'orgs'
  | 'earnings'
  | 'titles'
  | 'highlight'
  | 'teammate'
  | 'team'
  | 'aliases'
  | 'handle';

export interface Clue {
  id: ClueId;
  label: string;
  value: string;
}

/** What a file is filled from besides the roster and the bios. Each is optional: its line is left out. */
export interface Sources {
  orgs: Orgs | null;
  teammates: Teammates | null;
  majors: Majors | null;
}

export type GameState = ClueRound<RosterPlayer, Clue>;

/** Who can come up: anyone whose page publishes a real name. */
export function eligible(bios: Bios) {
  return (players: RosterPlayer[]): RosterPlayer[] => players.filter((player) => bios.realName(player.id) !== null);
}

/** "Bugha" -> "B _ _ _ _": the first character, then a blank per letter or digit. */
export function handleShape(handle: string): string {
  return [...handle]
    .map((char, index) => (index === 0 ? char.toUpperCase() : /[\p{L}\p{N}]/u.test(char) ? '_' : char))
    .join(' ')
    .replace(/\s{3,}/g, '   ');
}

/** The best finish at a major, the bigger stage first on a tie. */
function bestResult(results: readonly MajorResult[]): MajorResult | null {
  let best: MajorResult | null = null;
  for (const result of results) {
    if (
      !best ||
      result.placement < best.placement ||
      (result.placement === best.placement && (result.tournament.prizePool ?? 0) > (best.tournament.prizePool ?? 0))
    ) {
      best = result;
    }
  }
  return best;
}

/** The file, top to bottom. Lines the data has nothing for are left out. */
export function fileOf(player: RosterPlayer, bios: Bios, sources: Sources, byId: ReadonlyMap<string, RosterPlayer>): Clue[] {
  const out: Clue[] = [{ id: 'name', label: 'Real name', value: bios.realName(player.id) ?? '—' }];

  const where = [player.countryName, player.region].filter(Boolean).join(' · ');
  if (where) out.push({ id: 'nationality', label: 'From', value: where });
  if (player.birthDate) {
    out.push({ id: 'born', label: 'Born', value: `${player.birthDate.slice(0, 4)}${player.age !== null ? ` (${player.age} today)` : ''}` });
  }

  const team = player.team;
  const past = bios
    .orgsOf(player.id)
    .map((id) => orgName(id, sources.orgs))
    .filter((name) => name !== team)
    .reverse();
  if (past.length) {
    out.push({
      id: 'orgs',
      label: 'Played for',
      value: past.length > 4 ? `${past.slice(0, 4).join(', ')} and ${past.length - 4} more` : past.join(', '),
    });
  }

  if (player.earningsKnown) out.push({ id: 'earnings', label: 'Prize money', value: moneyShort(player.earnings) });
  out.push({
    id: 'titles',
    label: 'FNCS titles',
    value: player.fncsWins ? plural(player.fncsWins, 'FNCS win') : 'None',
  });

  const best = bestResult(sources.majors?.resultsFor(player.id) ?? []);
  if (best) {
    out.push({
      id: 'highlight',
      label: 'Best major',
      value: `${ordinal(best.placement)} — ${best.tournament.shortName}${best.tournament.shortName.includes(String(best.tournament.year)) ? '' : ` (${best.tournament.year})`}`,
    });
  }

  const mate = sources.teammates?.cluesFor(player.id, byId)[0];
  if (mate) {
    out.push({ id: 'teammate', label: 'Most frequent teammate', value: `${mate.player.name} — ${plural(mate.events, 'tournament')}` });
  }
  if (team) out.push({ id: 'team', label: 'Plays for', value: team });
  if (player.aliases.length) out.push({ id: 'aliases', label: 'Also known as', value: player.aliases.join(', ') });
  out.push({ id: 'handle', label: 'Handle', value: handleShape(player.name) });
  return out;
}

export function createGame(
  player: RosterPlayer,
  bios: Bios,
  sources: Sources,
  byId: ReadonlyMap<string, RosterPlayer>,
): GameState {
  return startRound(player, fileOf(player, bios, sources, byId));
}

export function record(state: GameState): { outcome: Outcome; r: ClueRoundPayload } {
  return recordRound(state, (clue) => ({ id: clue.id, name: `${clue.label}: ${clue.value}` }));
}

import type { Dataset } from '@/data/dataset';
import type { Player } from '@/data/types';
import { REGION_LABEL } from '@/data/types';
import { money } from '@/lib/format';
import { shuffle, type Rng } from '@/lib/rng';

/**
 * Criteria for the List game.
 *
 * Every criterion is built from the dataset and carries its own answer set, so
 * a criterion can never be offered unless it has a real, checkable answer.
 */

export interface Criterion {
  id: string;
  /** The prompt shown to the player. */
  title: string;
  /** Extra context, e.g. the exact event name. */
  subtitle?: string;
  answers: Player[];
}

/** Answer sets outside this range are either unguessable or trivially long. */
const MIN_ANSWERS = 8;
const MAX_ANSWERS = 45;

function make(id: string, title: string, answers: Player[], subtitle?: string): Criterion | null {
  if (answers.length < MIN_ANSWERS || answers.length > MAX_ANSWERS) return null;
  return { id, title, subtitle, answers };
}

/** Every criterion the current dataset can actually support. */
export function buildCriteria(dataset: Dataset): Criterion[] {
  const out: (Criterion | null)[] = [];

  // Players in a specific FNCS season (any region's grand final).
  const seasons = new Set(
    dataset.events.filter((event) => event.tier === 'fncs' && event.season).map((event) => event.season!),
  );
  for (const season of seasons) {
    const players = new Set<Player>();
    for (const event of dataset.events) {
      if (event.season !== season) continue;
      for (const player of dataset.participantsOf(event.id)) players.add(player);
    }
    const label = season.replace(/^C(\d+)S(\d+)$/, 'Chapter $1 Season $2');
    out.push(make(`fncs-season:${season}`, `Players in an FNCS ${label} Grand Final`, [...players]));
  }

  // Players at a specific headline event. Regional FNCS finals are excluded:
  // their fields are small and obscure, and the season criterion above already
  // covers them across every region.
  for (const event of dataset.events) {
    if (event.tier === 'fncs') continue;
    const participants = dataset.participantsOf(event.id);
    out.push(make(`event:${event.id}`, `Players who competed at ${event.name}`, participants));
  }

  // Winners of a specific event tier — "who has ever won a major LAN".
  out.push(make('fncs-winners', 'Players who have won an FNCS title', dataset.fncsWinners()));
  out.push(
    make('major-winners', 'Players who have won a major LAN or global championship', dataset.winnersByTier(['lan', 'global'])),
  );

  // Global Championship participants.
  const globalPlayers = new Set<Player>();
  for (const event of dataset.events) {
    if (event.tier !== 'global') continue;
    for (const player of dataset.participantsOf(event.id)) globalPlayers.add(player);
  }
  out.push(make('global-participants', 'Players who have played a global championship', [...globalPlayers]));

  // Organisations.
  for (const team of dataset.teams) {
    out.push(make(`team:${team}`, `Players signed to ${team}`, dataset.byTeam(team)));
  }

  // Countries and regions.
  for (const country of dataset.countries) {
    const players = dataset.byCountry(country);
    if (players.length === 0) continue;
    out.push(make(`country:${country}`, `Players from ${players[0].countryName}`, players));
  }
  for (const region of dataset.regions) {
    out.push(make(`region:${region}`, `Players competing in ${REGION_LABEL[region]}`, dataset.byRegion(region)));
  }

  // Career earnings thresholds.
  for (const threshold of [500_000, 750_000, 1_000_000]) {
    out.push(
      make(
        `earnings:${threshold}`,
        `Players with ${money(threshold)}+ in career earnings`,
        dataset.players.filter((player) => player.earnings >= threshold),
      ),
    );
  }

  // FNCS win thresholds.
  for (const threshold of [1, 2, 3]) {
    out.push(
      make(
        `wins:${threshold}`,
        `Players with ${threshold}+ FNCS ${threshold === 1 ? 'title' : 'titles'}`,
        dataset.players.filter((player) => player.fncsWins >= threshold),
      ),
    );
  }

  // Earnings in a single year.
  for (const year of dataset.years) {
    for (const threshold of [100_000, 200_000]) {
      out.push(
        make(
          `year:${year}:${threshold}`,
          `Players who earned ${money(threshold)}+ during ${year}`,
          dataset.players.filter((player) => dataset.earningsIn(player, year) >= threshold),
        ),
      );
    }
  }

  return out.filter((criterion): criterion is Criterion => criterion !== null);
}

export function drawCriterion(criteria: Criterion[], rng: Rng, avoidId?: string): Criterion | null {
  const pool = criteria.filter((criterion) => criterion.id !== avoidId);
  const usable = pool.length > 0 ? pool : criteria;
  if (usable.length === 0) return null;
  return shuffle(rng, usable)[0];
}

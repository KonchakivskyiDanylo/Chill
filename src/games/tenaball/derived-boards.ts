import type { Board } from '@/data/liquipedia/rankings';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { money, plural } from '@/lib/format';
import { board, byValue, TIE_ALPHA } from './board-builder';

/**
 * All-time boards the shipped set cannot carry, built from the roster in place.
 *
 * `rankings.json` is aggregated from placement rows in the notebook, so a board
 * that needs a column the notebook does not currently group by means a notebook
 * run. These are the ones that need nothing the roster has not already loaded —
 * status, country, age, earnings — so they can simply exist.
 *
 * Deliberately a short list. Anything that needs prize money per tournament,
 * per game mode or per team belongs in the notebook, where the 442,736
 * placement rows actually are.
 */
export function derivedBoards(players: readonly RosterPlayer[]): Board[] {
  const out: Board[] = [];
  const add = (made: Board | null) => {
    if (made) out.push(made);
  };

  /*
   * Countries by the earnings of their *active* players.
   *
   * A genuinely different board from the all-time one next to it, and the
   * interesting half of the question: the all-time table is a monument to the
   * 2019 World Cup and barely moves, where this one answers "who is still
   * winning money right now" and reshuffles every season. Retired players are
   * excluded entirely, not discounted.
   */
  const active = players.filter((p) => p.status === 'active' && p.countryName);
  const byCountry = new Map<string, number>();
  for (const p of active) {
    byCountry.set(p.countryName as string, (byCountry.get(p.countryName as string) ?? 0) + p.earnings);
  }

  add(
    board(
      'derived:countries-active-earnings',
      'Countries',
      'Top 10 countries by earnings — active players only',
      'country',
      `Career earnings added up per country, counting only players the export still lists as active. Retired players are left out entirely, so this is not the all-time table. ${TIE_ALPHA}`,
      byValue(
        [...byCountry]
          .filter(([, total]) => total > 0)
          .map(([name, total]) => ({
            key: name,
            label: name,
            value: total,
            display: money(total),
          })),
      ),
    ),
  );

  /*
   * And the headcount behind it, which is a different question again: Brazil
   * sends more active players than anyone and does not top the money board.
   */
  const heads = new Map<string, number>();
  for (const p of active) {
    heads.set(p.countryName as string, (heads.get(p.countryName as string) ?? 0) + 1);
  }
  add(
    board(
      'derived:countries-active-players',
      'Countries',
      'Top 10 countries by active players',
      'country',
      `How many players each country still has competing, as the export lists them. ${TIE_ALPHA}`,
      byValue(
        [...heads].map(([name, count]) => ({
          key: name,
          label: name,
          value: count,
          display: plural(count, 'player'),
        })),
      ),
    ),
  );

  return out;
}

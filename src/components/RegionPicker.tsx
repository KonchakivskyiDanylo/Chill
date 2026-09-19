import { plural } from '@/lib/format';
import { useLocalState } from '@/lib/storage';
import { OptionCard, OptionGrid } from './ui';

/**
 * Region as a setup step, for the games that run on the Liquipedia roster.
 *
 * `null` is "all regions" and is the default — it is the roster as it has
 * always been, so nobody has to make a decision to get the old behaviour.
 * Anything else is a Liquipedia region label exactly as the export spells it
 * (`'North America'`, `'Middle East'`), taken from `roster.regions` rather than
 * listed here, so a new region in the data shows up without a code change.
 */

export type RegionChoice = string | null;

/** Region flags, keyed by the export's own labels. Missing is fine — the card just has no icon. */
const ICONS: Record<string, string> = {
  'North America': '🌎',
  Europe: '🌍',
  Asia: '🌏',
  Oceania: '🦘',
  'South America': '🌴',
  'Middle East': '🕌',
  Africa: '🦁',
};

export function regionLabel(region: RegionChoice): string {
  return region ?? 'All regions';
}

export function regionIcon(region: RegionChoice): string {
  return region === null ? '🌐' : (ICONS[region] ?? '📍');
}

/** The chosen region, remembered across games and reloads. */
export function useRegion(): [RegionChoice, (next: RegionChoice) => void] {
  return useLocalState<RegionChoice>('region', null);
}

export function RegionCards({
  regions,
  value,
  onChange,
  counts,
}: {
  /** Region labels, in the order they should appear. `roster.regions`. */
  regions: readonly string[];
  value: RegionChoice;
  onChange: (value: RegionChoice) => void;
  /** Players this game can use per region, plus `null` for the whole roster. */
  counts?: Map<RegionChoice, number>;
}) {
  const options: RegionChoice[] = [null, ...regions];
  return (
    <OptionGrid>
      {options.map((region) => {
        const count = counts?.get(region);
        return (
          <OptionCard
            key={region ?? 'all'}
            label={
              <>
                <span aria-hidden="true">{regionIcon(region)}</span> {regionLabel(region)}
              </>
            }
            hint={
              count === undefined ? undefined : (
                <span className="tiny faint">{plural(count, 'player')}</span>
              )
            }
            selected={value === region}
            onClick={() => onChange(region)}
          />
        );
      })}
    </OptionGrid>
  );
}

export function RegionChip({ region }: { region: RegionChoice }) {
  return (
    <span className="chip">
      <span aria-hidden="true">{regionIcon(region)}</span> {regionLabel(region)}
    </span>
  );
}

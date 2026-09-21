import { OptionCard, OptionGrid } from './ui';

/**
 * Region as a setup step, for the games that run on the Liquipedia roster.
 *
 * `null` is "all regions" and is the default — it is the roster as it has
 * always been, so nobody has to make a decision to get the old behaviour.
 * Anything else is a Liquipedia region label exactly as the export spells it
 * (`'North America'`, `'Middle East'`), taken from `roster.regions` rather than
 * listed here, so a new region in the data shows up without a code change.
 *
 * The choice itself now lives in `games/shared/pool.ts` alongside difficulty,
 * status and the event pools, because those four are one decision.
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

export function RegionCards({
  regions,
  value,
  onChange,
}: {
  /** Region labels, in the order they should appear. `roster.regions`. */
  regions: readonly string[];
  value: RegionChoice;
  onChange: (value: RegionChoice) => void;
}) {
  const options: RegionChoice[] = [null, ...regions];
  return (
    // Compact: a region card is a flag and two words, so it has no business
    // being as tall as a difficulty card that carries a sentence and a number.
    <OptionGrid compact>
      {options.map((region) => (
        <OptionCard
          key={region ?? 'all'}
          label={
            <>
              <span aria-hidden="true">{regionIcon(region)}</span> {regionLabel(region)}
            </>
          }
          selected={value === region}
          onClick={() => onChange(region)}
        />
      ))}
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

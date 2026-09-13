import type { Region, TournamentEvent } from '@/data/types';

/**
 * Curated catalogue of *major* events only.
 *
 * Career Path, Tenaball and List deliberately never show minor events (Cash
 * Cups, qualifiers, Console Champions, ...) — only what a viewer would call a
 * headline result: FNCS season finals, global championships and major LANs.
 */

/** FNCS season finals are generated per season x region to keep the file small. */
interface SeasonSeed {
  /** Season key such as "C4S4". */
  key: string;
  /** Clue label, e.g. "FNCS Ch4S4". */
  label: string;
  year: number;
  date: string;
  format: TournamentEvent['format'];
}

const FNCS_SEASONS: SeasonSeed[] = [
  { key: 'C2S1', label: 'FNCS Ch2S1', year: 2019, date: '2019-12-08', format: 'solo' },
  { key: 'C2S2', label: 'FNCS Ch2S2', year: 2020, date: '2020-05-03', format: 'duo' },
  { key: 'C2S3', label: 'FNCS Ch2S3', year: 2020, date: '2020-08-16', format: 'trio' },
  { key: 'C2S4', label: 'FNCS Ch2S4', year: 2020, date: '2020-11-15', format: 'duo' },
  { key: 'C2S5', label: 'FNCS Ch2S5', year: 2021, date: '2021-03-14', format: 'solo' },
  { key: 'C2S6', label: 'FNCS Ch2S6', year: 2021, date: '2021-05-30', format: 'trio' },
  { key: 'C2S7', label: 'FNCS Ch2S7', year: 2021, date: '2021-08-22', format: 'duo' },
  { key: 'C2S8', label: 'FNCS Ch2S8', year: 2021, date: '2021-11-21', format: 'trio' },
  { key: 'C3S1', label: 'FNCS Ch3S1', year: 2022, date: '2022-02-27', format: 'duo' },
  { key: 'C3S2', label: 'FNCS Ch3S2', year: 2022, date: '2022-05-22', format: 'trio' },
  { key: 'C3S3', label: 'FNCS Ch3S3', year: 2022, date: '2022-08-21', format: 'duo' },
  { key: 'C3S4', label: 'FNCS Ch3S4', year: 2022, date: '2022-11-13', format: 'trio' },
  { key: 'C4S1', label: 'FNCS Ch4S1', year: 2023, date: '2023-03-05', format: 'duo' },
  { key: 'C4S2', label: 'FNCS Ch4S2', year: 2023, date: '2023-06-04', format: 'trio' },
  { key: 'C4S3', label: 'FNCS Ch4S3', year: 2023, date: '2023-08-27', format: 'duo' },
  { key: 'C4S4', label: 'FNCS Ch4S4', year: 2023, date: '2023-11-19', format: 'trio' },
  { key: 'C5S1', label: 'FNCS Ch5S1', year: 2024, date: '2024-03-17', format: 'duo' },
  { key: 'C5S2', label: 'FNCS Ch5S2', year: 2024, date: '2024-06-16', format: 'trio' },
  { key: 'C5S3', label: 'FNCS Ch5S3', year: 2024, date: '2024-08-25', format: 'duo' },
  { key: 'C5S4', label: 'FNCS Ch5S4', year: 2024, date: '2024-11-17', format: 'trio' },
  { key: 'C6S1', label: 'FNCS Ch6S1', year: 2025, date: '2025-03-16', format: 'duo' },
  { key: 'C6S2', label: 'FNCS Ch6S2', year: 2025, date: '2025-06-15', format: 'trio' },
  { key: 'C6S3', label: 'FNCS Ch6S3', year: 2025, date: '2025-08-24', format: 'duo' },
  { key: 'C6S4', label: 'FNCS Ch6S4', year: 2025, date: '2025-11-16', format: 'trio' },
  { key: 'C7S1', label: 'FNCS Ch7S1', year: 2026, date: '2026-03-15', format: 'duo' },
  { key: 'C7S2', label: 'FNCS Ch7S2', year: 2026, date: '2026-06-14', format: 'trio' },
];

const FNCS_REGIONS: Region[] = ['EU', 'NAE', 'NAW', 'BR', 'OCE', 'ASIA', 'ME'];

const REGION_EVENT_NAME: Record<Region, string> = {
  EU: 'Europe',
  NAE: 'NA East',
  NAW: 'NA West',
  BR: 'Brazil',
  OCE: 'Oceania',
  ASIA: 'Asia',
  ME: 'Middle East',
};

/** "C4S4" -> "Chapter 4 Season 4" */
function expandSeasonKey(key: string): string {
  const match = /^C(\d+)S(\d+)$/.exec(key);
  if (!match) return key;
  return `Chapter ${match[1]} Season ${match[2]}`;
}

function buildFncsEvents(): TournamentEvent[] {
  const out: TournamentEvent[] = [];
  for (const season of FNCS_SEASONS) {
    for (const region of FNCS_REGIONS) {
      out.push({
        id: `fncs-${season.key.toLowerCase()}-${region.toLowerCase()}`,
        name: `FNCS ${expandSeasonKey(season.key)} — ${REGION_EVENT_NAME[region]} Grand Finals`,
        shortName: season.label,
        tier: 'fncs',
        year: season.year,
        date: season.date,
        region,
        format: season.format,
        season: season.key,
      });
    }
  }
  return out;
}

/** Global championships and major LANs — hand-authored. */
const SPECIAL_EVENTS: TournamentEvent[] = [
  {
    id: 'wc-2019-solo',
    name: 'Fortnite World Cup 2019 — Solo Finals',
    shortName: 'World Cup 2019 (Solo)',
    tier: 'global',
    year: 2019,
    date: '2019-07-28',
    region: null,
    format: 'solo',
    season: null,
  },
  {
    id: 'wc-2019-duo',
    name: 'Fortnite World Cup 2019 — Duo Finals',
    shortName: 'World Cup 2019 (Duo)',
    tier: 'global',
    year: 2019,
    date: '2019-07-27',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'dh-anaheim-2020',
    name: 'DreamHack Anaheim 2020',
    shortName: 'DreamHack Anaheim 2020',
    tier: 'lan',
    year: 2020,
    date: '2020-02-22',
    region: null,
    format: 'solo',
    season: null,
  },
  {
    id: 'fncs-invitational-2021',
    name: 'FNCS Invitational 2021',
    shortName: 'FNCS Invitational 2021',
    tier: 'global',
    year: 2021,
    date: '2021-12-04',
    region: null,
    format: 'solo',
    season: null,
  },
  {
    id: 'fncs-gc-2022',
    name: 'FNCS Global Championship 2022',
    shortName: 'FNCS Global 2022',
    tier: 'global',
    year: 2022,
    date: '2022-11-13',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'gamers8-2023',
    name: 'Gamers8 2023 — Fortnite',
    shortName: 'Gamers8 2023',
    tier: 'lan',
    year: 2023,
    date: '2023-08-13',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'fncs-gc-2023',
    name: 'FNCS Global Championship 2023',
    shortName: 'FNCS Global 2023',
    tier: 'global',
    year: 2023,
    date: '2023-10-15',
    region: null,
    format: 'solo',
    season: null,
  },
  {
    id: 'ewc-2024',
    name: 'Esports World Cup 2024 — Fortnite',
    shortName: 'EWC 2024',
    tier: 'lan',
    year: 2024,
    date: '2024-07-21',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'fncs-gc-2024',
    name: 'FNCS Global Championship 2024',
    shortName: 'FNCS Global 2024',
    tier: 'global',
    year: 2024,
    date: '2024-09-29',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'ewc-2025',
    name: 'Esports World Cup 2025 — Fortnite',
    shortName: 'EWC 2025',
    tier: 'lan',
    year: 2025,
    date: '2025-07-20',
    region: null,
    format: 'trio',
    season: null,
  },
  {
    id: 'fncs-gc-2025',
    name: 'FNCS Global Championship 2025',
    shortName: 'FNCS Global 2025',
    tier: 'global',
    year: 2025,
    date: '2025-10-05',
    region: null,
    format: 'trio',
    season: null,
  },
  {
    id: 'ewc-2026',
    name: 'Esports World Cup 2026 — Fortnite',
    shortName: 'EWC 2026',
    tier: 'lan',
    year: 2026,
    date: '2026-07-19',
    region: null,
    format: 'duo',
    season: null,
  },
];

export const EVENTS: TournamentEvent[] = [...buildFncsEvents(), ...SPECIAL_EVENTS].sort((a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1,
);

export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export { FNCS_SEASONS, FNCS_REGIONS };

import type { Region, TournamentEvent } from '@/data/types';

/**
 * Curated catalogue of *major* events only.
 */

interface SeasonSeed {
  key: string;
  label: string;
  year: number;
  date: string;
  format: TournamentEvent['format'] | 'squad'; // Assuming you may need to add 'squad' to your types
}

const FNCS_SEASONS: SeasonSeed[] = [
  { key: 'SX', label: 'FNCS Season X', year: 2019, date: '2019-09-22', format: 'trio' },
  { key: 'C2S1', label: 'FNCS Ch2S1', year: 2019, date: '2019-12-08', format: 'squad' },
  { key: 'C2S2', label: 'FNCS Ch2S2', year: 2020, date: '2020-04-19', format: 'duo' },
  { key: 'C2S3', label: 'FNCS Ch2S3', year: 2020, date: '2020-08-16', format: 'solo' },
  { key: 'C2S4', label: 'FNCS Ch2S4', year: 2020, date: '2020-11-01', format: 'trio' },
  { key: 'C2S5', label: 'FNCS Ch2S5', year: 2021, date: '2021-03-14', format: 'trio' },
  { key: 'C2S6', label: 'FNCS Ch2S6', year: 2021, date: '2021-05-30', format: 'trio' },
  { key: 'C2S7', label: 'FNCS Ch2S7', year: 2021, date: '2021-09-05', format: 'trio' },
  { key: 'C2S8', label: 'FNCS Ch2S8', year: 2021, date: '2021-10-31', format: 'trio' },
  { key: 'C3S1', label: 'FNCS Ch3S1', year: 2022, date: '2022-03-06', format: 'duo' },
  { key: 'C3S2', label: 'FNCS Ch3S2', year: 2022, date: '2022-05-29', format: 'duo' },
  { key: 'C3S3', label: 'FNCS Ch3S3', year: 2022, date: '2022-08-14', format: 'duo' },

  // Epic transitioned to the "Majors" naming convention in 2023
  { key: '2023-M1', label: 'FNCS 2023 Major 1', year: 2023, date: '2023-03-05', format: 'duo' },
  { key: '2023-M2', label: 'FNCS 2023 Major 2', year: 2023, date: '2023-05-14', format: 'duo' },
  { key: '2023-M3', label: 'FNCS 2023 Major 3', year: 2023, date: '2023-08-13', format: 'duo' },
  { key: '2024-M1', label: 'FNCS 2024 Major 1', year: 2024, date: '2024-02-25', format: 'duo' },
  { key: '2024-M2', label: 'FNCS 2024 Major 2', year: 2024, date: '2024-05-19', format: 'duo' },
  { key: '2024-M3', label: 'FNCS 2024 Major 3', year: 2024, date: '2024-07-28', format: 'duo' },
  { key: '2025-M1', label: 'FNCS 2025 Major 1', year: 2025, date: '2025-02-16', format: 'trio' },
  { key: '2025-M2', label: 'FNCS 2025 Major 2', year: 2025, date: '2025-04-27', format: 'trio' },
  { key: '2025-M3', label: 'FNCS 2025 Major 3', year: 2025, date: '2025-08-03', format: 'trio' },
  { key: '2026-M1', label: 'FNCS 2026 Major 1', year: 2026, date: '2026-04-26', format: 'duo' },
  { key: '2026-M2', label: 'FNCS 2026 Major 2', year: 2026, date: '2026-08-02', format: 'duo' },
];

// Note: You must add 'NAC' to your Region type in '@/data/types'
const FNCS_REGIONS: (Region | 'NAC')[] = ['EU', 'NAE', 'NAW', 'NAC', 'BR', 'OCE', 'ASIA', 'ME'];

const REGION_EVENT_NAME: Record<string, string> = {
  EU: 'Europe',
  NAE: 'NA East',
  NAW: 'NA West',
  NAC: 'NA Central',
  BR: 'Brazil',
  OCE: 'Oceania',
  ASIA: 'Asia',
  ME: 'Middle East',
};

function expandSeasonKey(key: string): string {
  const chapterMatch = /^C(\d+)S(\d+)$/.exec(key);
  if (chapterMatch) return `Chapter ${chapterMatch[1]} Season ${chapterMatch[2]}`;

  const majorMatch = /^(\d{4})-M(\d)$/.exec(key);
  if (majorMatch) return `${majorMatch[1]} Major ${majorMatch[2]}`;

  if (key === 'SX') return 'Season X';
  return key;
}

function buildFncsEvents(): TournamentEvent[] {
  const out: TournamentEvent[] = [];
  for (const season of FNCS_SEASONS) {
    for (const region of FNCS_REGIONS) {
      // Historical filtering for the NAE/NAW -> NAC region merge
      const isPostMerge = season.year > 2023 || (season.year === 2023 && season.key !== '2023-M1');
      if (region === 'NAC' && !isPostMerge) continue; // NAC didn't exist yet
      if ((region === 'NAE' || region === 'NAW') && isPostMerge) continue; // NAE/NAW no longer existed

      out.push({
        id: `fncs-${season.key.toLowerCase()}-${region.toLowerCase()}`,
        name: `FNCS ${expandSeasonKey(season.key)} — ${REGION_EVENT_NAME[region]} Grand Finals`,
        shortName: season.label,
        tier: 'fncs',
        year: season.year,
        date: season.date,
        region: region as Region,
        format: season.format as TournamentEvent['format'],
        season: season.key,
      });
    }
  }
  return out;
}

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
    date: '2020-02-23',
    region: null,
    format: 'solo',
    season: null,
  },
  {
    id: 'fncs-invitational-2022',
    name: 'FNCS Invitational 2022 (Raleigh)',
    shortName: 'FNCS Invitational 2022',
    tier: 'global',
    year: 2022,
    date: '2022-11-13',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'fncs-gc-2023',
    name: 'FNCS Global Championship 2023 (Copenhagen)',
    shortName: 'FNCS Global 2023',
    tier: 'global',
    year: 2023,
    date: '2023-10-15',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'fncs-gc-2024',
    name: 'FNCS Global Championship 2024 (Fort Worth)',
    shortName: 'FNCS Global 2024',
    tier: 'global',
    year: 2024,
    date: '2024-09-08',
    region: null,
    format: 'duo',
    season: null,
  },
  {
    id: 'fncs-gc-2025',
    name: 'FNCS Global Championship 2025 (Lyon)',
    shortName: 'FNCS Global 2025',
    tier: 'global',
    year: 2025,
    date: '2025-09-07',
    region: null,
    format: 'trio',
    season: null,
  },
  {
    id: 'fncs-gc-2026',
    name: 'FNCS Global Championship 2026 (Antwerp)',
    shortName: 'FNCS Global 2026',
    tier: 'global',
    year: 2026,
    date: '2026-09-27',
    region: null,
    format: 'duo',
    season: null,
  }
];

export const EVENTS: TournamentEvent[] = [...buildFncsEvents(), ...SPECIAL_EVENTS].sort((a, b) =>
  a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1,
);

export const EVENT_BY_ID = new Map(EVENTS.map((e) => [e.id, e]));

export { FNCS_SEASONS, FNCS_REGIONS };
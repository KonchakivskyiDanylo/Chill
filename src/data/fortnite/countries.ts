import type { Region } from '@/data/types';

/** Display names for every country code that appears in the dataset. */
export const COUNTRY_NAMES: Record<string, string> = {
  AE: 'United Arab Emirates',
  AR: 'Argentina',
  AT: 'Austria',
  AU: 'Australia',
  BA: 'Bosnia and Herzegovina',
  BH: 'Bahrain',
  BR: 'Brazil',
  CA: 'Canada',
  CL: 'Chile',
  CU: 'Cuba',
  DE: 'Germany',
  DK: 'Denmark',
  FR: 'France',
  GB: 'United Kingdom',
  HR: 'Croatia',
  ID: 'Indonesia',
  IE: 'Ireland',
  IN: 'India',
  JO: 'Jordan',
  JP: 'Japan',
  KR: 'South Korea',
  KW: 'Kuwait',
  LT: 'Lithuania',
  LV: 'Latvia',
  MX: 'Mexico',
  MY: 'Malaysia',
  NL: 'Netherlands',
  NO: 'Norway',
  NZ: 'New Zealand',
  OM: 'Oman',
  PK: 'Pakistan',
  PL: 'Poland',
  RS: 'Serbia',
  RU: 'Russia',
  SA: 'Saudi Arabia',
  SE: 'Sweden',
  SG: 'Singapore',
  SI: 'Slovenia',
  SY: 'Syria',
  UA: 'Ukraine',
  US: 'United States',
};

/**
 * Fallback region for a player with no recorded result — only reached by the
 * handful of high earners who never placed first at a tracked event.
 */
export const REGION_BY_COUNTRY: Record<string, Region> = {
  AE: 'ME', BH: 'ME', JO: 'ME', KW: 'ME', OM: 'ME', SA: 'ME', SY: 'ME',
  AR: 'BR', BR: 'BR', CL: 'BR',
  AU: 'OCE', NZ: 'OCE',
  ID: 'ASIA', IN: 'ASIA', JP: 'ASIA', KR: 'ASIA', MY: 'ASIA', PK: 'ASIA', SG: 'ASIA',
  AT: 'EU', BA: 'EU', DE: 'EU', DK: 'EU', FR: 'EU', GB: 'EU', HR: 'EU', IE: 'EU',
  LT: 'EU', LV: 'EU', NL: 'EU', NO: 'EU', PL: 'EU', RS: 'EU', RU: 'EU', SE: 'EU',
  SI: 'EU', UA: 'EU',
  CA: 'NAC', CU: 'NAC', MX: 'NAC', US: 'NAC',
};

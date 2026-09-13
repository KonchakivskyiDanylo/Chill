import type { Region } from '@/data/types';

export interface RosterSeed {
  id: string;
  name: string;
  realName?: string;
  country: string;
  region: Region | 'NAC';
  born?: string;
  earnings: number;
  team?: string;
  pr: number;
  tier: 1 | 2 | 3 | 4;
  first: string;
  last: string;
  fncsWins?: number;
  signature?: [string, number][];
  partners?: string[];
  status?: 'active' | 'inactive';
}

export const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  CA: 'Canada',
  GB: 'United Kingdom',
  FR: 'France',
  DE: 'Germany',
  NL: 'Netherlands',
  BE: 'Belgium',
  NO: 'Norway',
  SE: 'Sweden',
  DK: 'Denmark',
  FI: 'Finland',
  PL: 'Poland',
  ES: 'Spain',
  IT: 'Italy',
  AT: 'Austria',
  CH: 'Switzerland',
  CZ: 'Czechia',
  SI: 'Slovenia',
  BR: 'Brazil',
  AR: 'Argentina',
  AU: 'Australia',
  NZ: 'New Zealand',
  JP: 'Japan',
  KR: 'South Korea',
  SA: 'Saudi Arabia',
  AE: 'United Arab Emirates',
  RS: 'Serbia',
  RU: 'Russia',
  LV: 'Latvia',
  BA: 'Bosnia and Herzegovina',
  UA: 'Ukraine',
};

export const ROSTER: RosterSeed[] = [
  // ---------------------------------------------------------------- North America (NAC/NAE/NAW)
  { id: 'bugha', name: 'Bugha', realName: 'Kyle Giersdorf', country: 'US', region: 'NAC', born: '2002-12-30', earnings: 3750000, team: 'Dignitas', pr: 2500, tier: 1, first: 'SX', last: '2026-M2', fncsWins: 3, signature: [['wc-2019-solo', 1]], partners: ['mero'] },
  { id: 'mero', name: 'Mero', realName: 'Matthew Faitel', country: 'CA', region: 'NAC', born: '2004-09-01', earnings: 1550000, team: 'Dignitas', pr: 2300, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 5, signature: [['fncs-gc-2023', 1]], partners: ['bugha', 'cooper'] },
  { id: 'cooper', name: 'Cooper', country: 'US', region: 'NAC', born: '2007-02-01', earnings: 600000, team: 'Dignitas', pr: 1800, tier: 1, first: '2023-M1', last: '2026-M2', fncsWins: 1, signature: [['fncs-gc-2023', 1]], partners: ['mero'] },
  { id: 'peterbot', name: 'Peterbot', realName: 'Peter Kata', country: 'US', region: 'NAC', born: '2006-05-15', earnings: 1800000, team: 'Exceed', pr: 2450, tier: 1, first: 'C3S1', last: '2026-M2', fncsWins: 4, signature: [['fncs-gc-2024', 1]], partners: ['pollo'] },
  { id: 'pollo', name: 'Pollo', country: 'US', region: 'NAC', born: '2007-07-25', earnings: 850000, team: 'Exceed', pr: 2100, tier: 1, first: 'C4S1', last: '2026-M2', fncsWins: 3, signature: [['fncs-gc-2024', 1]], partners: ['peterbot'] },
  { id: 'acorn', name: 'Acorn', realName: 'Riley Strick', country: 'US', region: 'NAC', born: '2005-06-10', earnings: 900000, team: 'Dignitas', pr: 2000, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 3, partners: ['cold'] },
  { id: 'cold', name: 'Cold', country: 'US', region: 'NAC', born: '2005-12-01', earnings: 800000, team: 'Dignitas', pr: 1950, tier: 1, first: 'C3S1', last: '2026-M2', fncsWins: 2, partners: ['acorn'] },
  { id: 'ritual', name: 'Ritual', country: 'US', region: 'NAC', born: '2006-10-15', earnings: 550000, team: 'XSET', pr: 2200, tier: 1, first: 'C4S1', last: '2026-M2', fncsWins: 1, partners: ['trashy'] },
  { id: 'trashy', name: 'Trashy', country: 'US', region: 'NAC', born: '2005-08-20', earnings: 350000, pr: 1800, tier: 2, first: 'C2S4', last: '2026-M2', partners: ['ritual'] },
  { id: 'clix', name: 'Clix', realName: 'Cody Conrod', country: 'US', region: 'NAC', born: '2005-01-07', earnings: 950000, team: 'XSET', pr: 1750, tier: 2, first: 'SX', last: '2026-M2', partners: ['veno'] },
  { id: 'khanada', name: 'Khanada', realName: 'Leon Khim', country: 'US', region: 'NAC', born: '2005-04-14', earnings: 1100000, team: 'Dignitas', pr: 1900, tier: 1, first: 'SX', last: '2026-M2', fncsWins: 1, partners: ['ajerss'] },
  { id: 'ajerss', name: 'Ajerss', country: 'US', region: 'NAC', born: '2005-03-22', earnings: 550000, pr: 1850, tier: 2, first: 'C3S3', last: '2026-M2', partners: ['khanada'] },
  { id: 'reet', name: 'Reet', realName: 'Nathan Amundson', country: 'US', region: 'NAC', born: '2004-12-16', earnings: 850000, team: 'XSET', pr: 1850, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 2, partners: ['epikwhale'] },
  { id: 'epikwhale', name: 'EpikWhale', realName: 'Shane Cotton', country: 'US', region: 'NAC', born: '2002-08-01', earnings: 1950000, team: 'FaZe Clan', pr: 2200, tier: 1, first: 'SX', last: '2026-M2', fncsWins: 6, signature: [['wc-2019-solo', 3]], partners: ['reet'] },
  { id: 'dukez', name: 'Dukez', country: 'US', region: 'NAC', born: '2004-12-12', earnings: 500000, pr: 1900, tier: 2, first: 'C2S4', last: '2026-M2', fncsWins: 1, partners: ['sphinx'] },
  { id: 'sphinx', name: 'Sphinx', country: 'US', region: 'NAC', born: '2006-09-02', earnings: 180000, pr: 1550, tier: 3, first: 'C4S3', last: '2026-M2', partners: ['dukez'] },
  { id: 'edgey', name: 'Edgey', realName: 'Benjamin Peterson', country: 'US', region: 'NAC', born: '2004-05-19', earnings: 600000, pr: 1650, tier: 2, first: 'C2S1', last: '2026-M2' },
  { id: 'kwanti', name: 'Kwanti', country: 'US', region: 'NAC', born: '2005-07-30', earnings: 250000, pr: 1700, tier: 3, first: 'C3S1', last: '2026-M2' },
  { id: 'brycx', name: 'Brycx', country: 'US', region: 'NAC', born: '2006-04-10', earnings: 200000, pr: 1600, tier: 3, first: 'C4S2', last: '2026-M2', partners: ['boltz'] },
  { id: 'boltz', name: 'Boltz', country: 'US', region: 'NAC', born: '2005-11-25', earnings: 220000, pr: 1650, tier: 3, first: 'C4S1', last: '2026-M2', partners: ['brycx'] },
  { id: 'rapid', name: 'Rapid', country: 'US', region: 'NAC', born: '2004-10-18', earnings: 300000, pr: 1750, tier: 2, first: 'C2S2', last: '2026-M2', partners: ['batmanbugha'] },
  { id: 'batmanbugha', name: 'Batman Bugha', country: 'US', region: 'NAC', born: '2004-02-14', earnings: 200000, pr: 1700, tier: 3, first: 'C3S1', last: '2026-M2', partners: ['rapid'] },

  // Retired/Inactive NA Legends
  { id: 'cented', name: 'Cented', realName: 'Evan Barron', country: 'CA', region: 'NAC', born: '2002-12-11', earnings: 950000, pr: 1600, tier: 2, first: 'SX', last: '2024-M3', status: 'inactive' },
  { id: 'zayt', name: 'Zayt', realName: 'Williams Aubin', country: 'CA', region: 'NAE', born: '2000-02-02', earnings: 1100000, pr: 1500, tier: 1, first: 'SX', last: 'C2S5', status: 'inactive', partners: ['saf'] },
  { id: 'saf', name: 'Saf', realName: 'Rocco Morales', country: 'US', region: 'NAE', born: '2002-12-21', earnings: 1200000, pr: 1450, tier: 1, first: 'SX', last: 'C2S8', status: 'inactive', partners: ['zayt'] },
  { id: 'psalm', name: 'Psalm', realName: 'Harrison Chang', country: 'US', region: 'NAW', born: '1995-11-13', earnings: 1900000, pr: 1180, tier: 2, first: 'SX', last: 'C2S2', status: 'inactive', signature: [['wc-2019-solo', 2]] },
  { id: 'arkhram', name: 'Arkhram', realName: 'Diego Lima', country: 'US', region: 'NAW', born: '2003-08-25', earnings: 950000, team: '100 Thieves', pr: 1720, tier: 1, first: 'SX', last: 'C3S2', fncsWins: 4, status: 'inactive' },

  // ----------------------------------------------------------------- Europe
  { id: 'tayson', name: 'TaySon', realName: 'Tai Starčič', country: 'SI', region: 'EU', born: '2004-03-21', earnings: 1900000, team: 'Team Falcons', pr: 2600, tier: 1, first: 'C2S1', last: '2026-M2', fncsWins: 5, signature: [['fncs-invitational-2022', 2]] },
  { id: 'th0mashd', name: 'Th0masHD', realName: 'Thomas Høxbro Davidsen', country: 'DK', region: 'EU', born: '2004-02-08', earnings: 1400000, team: 'Heroic', pr: 2350, tier: 1, first: 'SX', last: '2026-M2', fncsWins: 1, partners: ['queasy'] },
  { id: 'queasy', name: 'Queasy', realName: 'Aleksa Cvetkovic', country: 'RS', region: 'EU', born: '2004-07-30', earnings: 1350000, team: 'Team Falcons', pr: 2150, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 3, partners: ['th0mashd'] },
  { id: 'vic0', name: 'vic0', country: 'AT', region: 'EU', born: '2006-01-15', earnings: 600000, team: 'FUT Esports', pr: 2300, tier: 1, first: 'C3S4', last: '2026-M2', fncsWins: 2, partners: ['flickzy'] },
  { id: 'flickzy', name: 'Flickzy', country: 'GB', region: 'EU', born: '2005-09-11', earnings: 450000, team: 'AIGHT', pr: 2150, tier: 1, first: 'C4S1', last: '2026-M2', fncsWins: 1, partners: ['vic0'] },
  { id: 't3eny', name: 't3eny', country: 'SI', region: 'EU', born: '2005-08-04', earnings: 550000, team: 'Karmine Corp', pr: 2250, tier: 1, first: 'C3S3', last: '2026-M2', fncsWins: 1 },
  { id: 'merstach', name: 'Merstach', country: 'LV', region: 'EU', born: '2005-03-23', earnings: 950000, team: 'Karmine Corp', pr: 2300, tier: 1, first: 'C2S6', last: '2026-M2', fncsWins: 2, partners: ['malibuca'] },
  { id: 'malibuca', name: 'Malibuca', realName: 'Danila Kucherenko', country: 'RU', region: 'EU', born: '2005-01-06', earnings: 1100000, team: 'Team Falcons', pr: 2050, tier: 1, first: 'C2S6', last: '2026-M2', fncsWins: 1, partners: ['merstach'] },
  { id: 'chico', name: 'Chico', country: 'BA', region: 'EU', born: '2006-05-10', earnings: 350000, team: 'Team Falcons', pr: 2000, tier: 1, first: 'C4S2', last: '2026-M2', fncsWins: 1, partners: ['trulex'] },
  { id: 'trulex', name: 'TruleX', country: 'RS', region: 'EU', born: '2004-11-20', earnings: 450000, team: 'Valiant', pr: 2050, tier: 1, first: 'C2S5', last: '2026-M2', fncsWins: 1, partners: ['chico'] },
  { id: 'swizzy', name: 'SwizzY', country: 'RU', region: 'EU', born: '2005-11-30', earnings: 500000, team: 'Karmine Corp', pr: 2200, tier: 1, first: 'C3S1', last: '2026-M2', fncsWins: 1, partners: ['japko'] },
  { id: 'japko', name: 'Japko', country: 'PL', region: 'EU', born: '2005-02-18', earnings: 400000, team: 'Karmine Corp', pr: 2100, tier: 2, first: 'C3S2', last: '2026-M2', partners: ['swizzy'] },
  { id: 'veno', name: 'Veno', realName: 'Harry Pearson', country: 'GB', region: 'EU', born: '2004-01-27', earnings: 1250000, team: 'Fnatic', pr: 2100, tier: 1, first: 'C2S6', last: '2026-M2', fncsWins: 2, partners: ['clix'] },
  { id: 'kami', name: 'Kami', realName: 'Michał Kamiński', country: 'PL', region: 'EU', born: '2005-01-20', earnings: 1600000, team: 'Gaimin Gladiators', pr: 2250, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 2, signature: [['fncs-invitational-2022', 1]], partners: ['setty'] },
  { id: 'setty', name: 'Setty', realName: 'Iwo Zając', country: 'PL', region: 'EU', born: '2004-05-24', earnings: 1500000, team: 'Gaimin Gladiators', pr: 2200, tier: 1, first: 'C2S4', last: '2026-M2', fncsWins: 1, signature: [['fncs-invitational-2022', 1]], partners: ['kami'] },
  { id: 'jannisz', name: 'JannisZ', realName: 'Jannis Matwin', country: 'DE', region: 'EU', born: '2004-11-05', earnings: 1050000, team: 'Wave Esports', pr: 1950, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 3 },
  { id: 'vadeal', name: 'Vadeal', country: 'DE', region: 'EU', born: '2004-10-09', earnings: 850000, team: 'Wave Esports', pr: 2050, tier: 1, first: 'C2S4', last: '2026-M2', fncsWins: 2 },
  { id: 'rezon', name: 'rezon ay', realName: 'Rezon', country: 'DE', region: 'EU', born: '2005-12-02', earnings: 800000, team: 'FUT Esports', pr: 2000, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 1 },
  { id: 'andilex', name: 'Andilex', country: 'FR', region: 'EU', born: '2003-01-25', earnings: 900000, team: 'Karmine Corp', pr: 1800, tier: 2, first: 'C2S1', last: '2026-M2', fncsWins: 2 },
  { id: 'vanyak3kk', name: 'Vanyak3kk', country: 'UA', region: 'EU', born: '2005-01-29', earnings: 300000, pr: 1950, tier: 2, first: 'C3S1', last: '2026-M2' },
  { id: 'p1ng', name: 'P1ng', country: 'RU', region: 'EU', born: '2005-04-15', earnings: 250000, team: 'AIGHT', pr: 1900, tier: 2, first: 'C3S3', last: '2026-M2', partners: ['wox'] },
  { id: 'wox', name: 'Wox', country: 'DE', region: 'EU', born: '2005-07-22', earnings: 230000, team: 'Team Havok', pr: 1850, tier: 2, first: 'C3S4', last: '2026-M2', partners: ['p1ng'] },

  // Retired/Legacy EU Legends
  { id: 'mrsavage', name: 'MrSavage', realName: 'Martin Foss Andersen', country: 'NO', region: 'EU', born: '2004-11-12', earnings: 900000, team: 'Team Falcons', pr: 2100, tier: 1, first: 'SX', last: '2026-M2', fncsWins: 1, partners: ['mongraal', 'benjyfishy'] },
  { id: 'mongraal', name: 'Mongraal', realName: 'Kyle Jackson', country: 'GB', region: 'EU', born: '2004-08-13', earnings: 700000, pr: 1600, tier: 2, first: 'SX', last: '2024-M3', partners: ['mitr0', 'mrsavage'], status: 'inactive' },
  { id: 'benjyfishy', name: 'Benjyfishy', realName: 'Benjy David Fish', country: 'GB', region: 'EU', born: '2004-04-02', earnings: 850000, pr: 1650, tier: 2, first: 'SX', last: 'C3S2', status: 'inactive', partners: ['mrsavage'] },
  { id: 'mitr0', name: 'Mitr0', realName: 'Dmitri Van de Vrie', country: 'NL', region: 'EU', born: '2003-05-02', earnings: 750000, pr: 1550, tier: 2, first: 'SX', last: 'C3S1', fncsWins: 1, partners: ['mongraal'], status: 'inactive' },
  { id: 'aqua', name: 'Aqua', realName: 'David Wang', country: 'AT', region: 'EU', born: '2002-05-08', earnings: 1950000, pr: 1700, tier: 1, first: 'SX', last: 'C4S2', fncsWins: 2, signature: [['wc-2019-duo', 1]], partners: ['nyhrox'], status: 'inactive' },
  { id: 'nyhrox', name: 'Nyhrox', realName: 'Emil Bergquist Pedersen', country: 'NO', region: 'EU', born: '2003-01-31', earnings: 1650000, pr: 1400, tier: 2, first: 'SX', last: 'C3S1', signature: [['wc-2019-duo', 1]], partners: ['aqua'], status: 'inactive' },
  { id: 'wolfiez', name: 'Wolfiez', realName: 'Jaden Ashman', country: 'GB', region: 'EU', born: '2003-10-24', earnings: 1350000, pr: 1300, tier: 2, first: 'SX', last: 'C4S2', signature: [['wc-2019-duo', 2]], status: 'inactive' },

  // ----------------------------------------------------------------- Brazil
  { id: 'k1ng', name: 'k1ng', realName: 'Thiago Lapp', country: 'AR', region: 'BR', born: '2003-02-11', earnings: 1350000, team: 'FaZe Clan', pr: 1850, tier: 1, first: 'SX', last: '2026-M2', fncsWins: 5, signature: [['wc-2019-solo', 5]] },
  { id: 'phzin', name: 'Phzin', realName: 'Pedro Henrique', country: 'BR', region: 'BR', born: '2005-01-09', earnings: 600000, team: 'Hero Base', pr: 1650, tier: 1, first: 'C2S4', last: '2026-M2', fncsWins: 6 },

  // --------------------------------------------------------------- Oceania / Transplant
  { id: 'alex', name: 'Alex', realName: 'Alex Buchanan', country: 'AU', region: 'OCE', born: '2005-03-12', earnings: 450000, team: 'PWR', pr: 1400, tier: 1, first: 'C2S2', last: '2026-M2', fncsWins: 5, partners: ['worthy'] },
  { id: 'worthy', name: 'Worthy', realName: 'Lachlan Murphy', country: 'AU', region: 'OCE', born: '2004-07-21', earnings: 400000, team: 'PWR', pr: 1350, tier: 1, first: 'SX', last: '2026-M2', fncsWins: 6, partners: ['alex'] },
  { id: 'muz', name: 'Muz', realName: 'Muz', country: 'AU', region: 'NAC', born: '2004-12-08', earnings: 550000, team: 'PWR', pr: 1550, tier: 2, first: 'C2S4', last: '2026-M2', fncsWins: 4 }, // OCE GOAT -> Moved to NA Central

  // ------------------------------------------------------------------ Asia
  { id: 'koyota', name: 'Koyota', country: 'JP', region: 'ASIA', born: '2005-02-22', earnings: 350000, team: 'ZETA DIVISION', pr: 1200, tier: 1, first: 'C3S1', last: '2026-M2', fncsWins: 3 },
  { id: 'zagou', name: 'Zagou', country: 'JP', region: 'ASIA', born: '2004-06-01', earnings: 300000, team: 'ZETA DIVISION', pr: 1150, tier: 1, first: 'C2S6', last: '2026-M2', fncsWins: 3 },

  // ---------------------------------------------------------- Middle East
  { id: 'kalgamer', name: 'Kalgamer', country: 'SA', region: 'ME', born: '2004-09-08', earnings: 450000, team: 'Twisted Minds', pr: 1250, tier: 1, first: 'C2S5', last: '2026-M2', fncsWins: 4, partners: ['fhd'] },
  { id: 'fhd', name: 'FHD', realName: 'Fahad', country: 'SA', region: 'ME', born: '2005-04-25', earnings: 420000, team: 'Twisted Minds', pr: 1200, tier: 1, first: 'C2S5', last: '2026-M2', fncsWins: 4, partners: ['kalgamer'] }
];
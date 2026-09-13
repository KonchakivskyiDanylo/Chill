import type { Region } from '@/data/types';

/**
 * Compact seed roster of ~100 prominent Fortnite competitive players.
 *
 * PROTOTYPE DATA. Handles, nationalities, orgs and rough earnings are inspired
 * by Liquipedia's highest-earning Fortnite players, but exact figures, birth
 * dates and every individual placement are approximated for this prototype.
 *
 * Only the facts below are hand-authored. Everything else a game needs
 * (per-event results, placements, yearly earnings splits, teammate match
 * counts) is derived deterministically in `build.ts`, so the dataset is always
 * internally consistent. Replacing this file with real API data means
 * implementing `PlayerRepository` — the games never read this module.
 */
export interface RosterSeed {
  id: string;
  name: string;
  realName?: string;
  /** ISO 3166-1 alpha-2 nationality. */
  country: string;
  /** Competitive region (may differ from nationality, e.g. a Canadian in NA East). */
  region: Region;
  born?: string;
  /** Career prize money in USD. */
  earnings: number;
  team?: string;
  pr: number;
  /** Relative strength, 1 = elite. Drives generated placements. */
  tier: 1 | 2 | 3 | 4;
  /** First FNCS season key they competed in. */
  first: string;
  /** Last FNCS season key they competed in. */
  last: string;
  /** Target number of FNCS titles. The builder honours this where events allow. */
  fncsWins?: number;
  /** Results that must appear exactly as authored: [eventId, placement]. */
  signature?: [string, number][];
  /** Known duo/trio partners by id. Links are made symmetric by the builder. */
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
};

export const ROSTER: RosterSeed[] = [
  // ---------------------------------------------------------------- NA East
  { id: 'bugha', name: 'Bugha', realName: 'Kyle Giersdorf', country: 'US', region: 'NAE', born: '2002-12-01', earnings: 3750000, team: 'Sentinels', pr: 2180, tier: 1, first: 'C2S1', last: 'C7S2', fncsWins: 1, signature: [['wc-2019-solo', 1], ['fncs-invitational-2021', 4]], partners: ['jamper', 'arkhram'] },
  { id: 'mero', name: 'Mero', realName: 'Diego Campos', country: 'US', region: 'NAE', born: '2004-02-14', earnings: 1430000, team: 'Sentinels', pr: 1960, tier: 1, first: 'C2S2', last: 'C7S2', fncsWins: 2, partners: ['acorn', 'ajerss'] },
  { id: 'acorn', name: 'Acorn', country: 'US', region: 'NAE', born: '2005-06-10', earnings: 780000, team: 'Sentinels', pr: 1480, tier: 2, first: 'C3S1', last: 'C7S2', fncsWins: 1, partners: ['mero'] },
  { id: 'ajerss', name: 'Ajerss', country: 'US', region: 'NAE', born: '2006-03-22', earnings: 690000, team: 'Sentinels', pr: 1420, tier: 2, first: 'C3S3', last: 'C7S2', partners: ['mero'] },
  { id: 'peterbot', name: 'Peterbot', realName: 'Peter Kata', country: 'US', region: 'NAE', born: '2005-04-05', earnings: 1680000, team: 'NRG', pr: 2240, tier: 1, first: 'C3S2', last: 'C7S2', fncsWins: 3, signature: [['ewc-2024', 1]], partners: ['pxmp', 'cold'] },
  { id: 'pxmp', name: 'Pxmp', country: 'US', region: 'NAE', born: '2006-09-12', earnings: 620000, team: 'NRG', pr: 1360, tier: 2, first: 'C4S2', last: 'C7S2', fncsWins: 1, partners: ['peterbot'] },
  { id: 'cold', name: 'Cold', country: 'US', region: 'NAE', born: '2005-11-02', earnings: 540000, pr: 1240, tier: 2, first: 'C4S1', last: 'C7S2', partners: ['peterbot'] },
  { id: 'cented', name: 'Cented', realName: 'Kevin Marchand', country: 'US', region: 'NAE', born: '2003-08-24', earnings: 1120000, team: 'NRG', pr: 1880, tier: 1, first: 'C2S2', last: 'C7S1', fncsWins: 1, partners: ['reet'] },
  { id: 'reet', name: 'Reet', country: 'US', region: 'NAE', born: '2004-10-01', earnings: 860000, team: 'NRG', pr: 1540, tier: 2, first: 'C2S6', last: 'C7S2', fncsWins: 1, partners: ['cented'] },
  { id: 'clix', name: 'Clix', realName: 'Cody Conrod', country: 'US', region: 'NAE', born: '2005-01-18', earnings: 640000, team: 'NRG', pr: 1300, tier: 2, first: 'C2S2', last: 'C6S4' },
  { id: 'khanada', name: 'Khanada', country: 'US', region: 'NAE', born: '2005-07-07', earnings: 710000, team: '100 Thieves', pr: 1420, tier: 2, first: 'C2S6', last: 'C7S2', fncsWins: 1 },
  { id: 'edgey', name: 'Edgey', country: 'US', region: 'NAE', born: '2004-05-19', earnings: 560000, pr: 1180, tier: 3, first: 'C3S1', last: 'C7S2' },
  { id: 'bucke', name: 'Bucke', country: 'US', region: 'NAE', born: '2004-09-30', earnings: 620000, team: '100 Thieves', pr: 1320, tier: 2, first: 'C2S5', last: 'C7S1' },
  { id: 'dukez', name: 'Dukez', country: 'US', region: 'NAE', born: '2003-12-12', earnings: 540000, pr: 1160, tier: 3, first: 'C2S4', last: 'C6S4' },
  { id: 'slackes', name: 'Slackes', country: 'US', region: 'NAE', born: '2003-04-08', earnings: 510000, pr: 1120, tier: 3, first: 'C2S3', last: 'C6S2' },
  { id: 'zayt', name: 'Zayt', realName: 'Williams Aubin', country: 'CA', region: 'NAE', born: '2000-02-02', earnings: 740000, pr: 980, tier: 1, first: 'C2S1', last: 'C2S6', status: 'inactive', partners: ['saf'] },
  { id: 'saf', name: 'Saf', realName: 'Nate Kou', country: 'US', region: 'NAE', born: '2003-06-15', earnings: 890000, pr: 1240, tier: 1, first: 'C2S1', last: 'C3S4', fncsWins: 2, status: 'inactive', partners: ['zayt'] },
  { id: 'commandment', name: 'Commandment', country: 'US', region: 'NAE', born: '2004-03-03', earnings: 480000, pr: 1080, tier: 3, first: 'C2S7', last: 'C7S1' },
  { id: 'kreo', name: 'Kreo', country: 'US', region: 'NAE', born: '2005-02-20', earnings: 470000, pr: 1060, tier: 3, first: 'C3S2', last: 'C7S2' },
  { id: 'deyy', name: 'Deyy', country: 'US', region: 'NAE', born: '2004-07-26', earnings: 520000, pr: 1140, tier: 3, first: 'C2S6', last: 'C6S4' },
  { id: 'arkhram', name: 'Arkhram', realName: 'Diego Lima', country: 'US', region: 'NAE', born: '2004-01-10', earnings: 1020000, team: '100 Thieves', pr: 1720, tier: 1, first: 'C2S1', last: 'C7S2', fncsWins: 1, partners: ['bugha'] },
  { id: 'reverse2k', name: 'Reverse2k', country: 'US', region: 'NAE', born: '2002-10-05', earnings: 820000, pr: 1280, tier: 2, first: 'C2S1', last: 'C5S4' },
  { id: 'megga', name: 'Megga', country: 'US', region: 'NAE', born: '2003-05-11', earnings: 610000, team: 'FaZe Clan', pr: 1200, tier: 3, first: 'C2S2', last: 'C6S1' },
  { id: 'jamper', name: 'Jamper', country: 'US', region: 'NAE', born: '2003-02-17', earnings: 560000, pr: 1150, tier: 3, first: 'C2S1', last: 'C5S2', partners: ['bugha'] },
  { id: 'bizzle', name: 'Bizzle', realName: 'Timothy Miller', country: 'US', region: 'NAE', born: '1998-09-06', earnings: 700000, pr: 860, tier: 2, first: 'C2S1', last: 'C3S3', status: 'inactive' },
  { id: 'unknown', name: 'Unknown', realName: 'Ronaldo Maach', country: 'US', region: 'NAE', born: '2003-11-23', earnings: 780000, pr: 1260, tier: 2, first: 'C2S1', last: 'C5S1' },
  { id: 'tfue', name: 'Tfue', realName: 'Turner Tenney', country: 'US', region: 'NAE', born: '1998-01-02', earnings: 650000, pr: 720, tier: 2, first: 'C2S1', last: 'C2S4', status: 'inactive', signature: [['wc-2019-duo', 2]] },
  { id: 'nosh', name: 'Nosh', country: 'US', region: 'NAE', born: '2005-08-14', earnings: 430000, pr: 1020, tier: 3, first: 'C4S1', last: 'C7S2' },
  { id: 'vivid', name: 'Vivid', country: 'US', region: 'NAE', born: '2004-12-01', earnings: 450000, pr: 1040, tier: 3, first: 'C3S3', last: 'C7S1' },
  { id: 'threats', name: 'Threats', country: 'US', region: 'NAE', born: '2005-03-30', earnings: 400000, pr: 960, tier: 4, first: 'C4S3', last: 'C7S2' },
  { id: 'ritual', name: 'Ritual', country: 'US', region: 'NAE', born: '2006-01-25', earnings: 380000, pr: 940, tier: 4, first: 'C5S1', last: 'C7S2' },
  { id: 'rehx', name: 'Rehx', country: 'US', region: 'NAE', born: '2004-04-14', earnings: 460000, pr: 1050, tier: 3, first: 'C2S8', last: 'C6S3' },
  { id: 'sway', name: 'Sway', realName: 'Kevin Sway', country: 'US', region: 'NAE', born: '2004-06-28', earnings: 420000, team: 'FaZe Clan', pr: 900, tier: 3, first: 'C2S2', last: 'C5S3' },
  { id: 'nate-hill', name: 'Nate Hill', realName: 'Nathan Hill', country: 'US', region: 'NAE', born: '1997-03-19', earnings: 510000, pr: 780, tier: 3, first: 'C2S1', last: 'C3S2', status: 'inactive' },

  // ---------------------------------------------------------------- NA West
  { id: 'psalm', name: 'Psalm', realName: 'Harrison Chang', country: 'US', region: 'NAW', born: '1995-11-13', earnings: 1920000, pr: 1180, tier: 1, first: 'C2S1', last: 'C4S2', status: 'inactive', signature: [['wc-2019-solo', 2]] },
  { id: 'epikwhale', name: 'EpikWhale', realName: 'Shane Cotton', country: 'US', region: 'NAW', born: '2002-07-09', earnings: 1560000, team: 'NRG', pr: 1840, tier: 1, first: 'C2S1', last: 'C7S2', fncsWins: 2, signature: [['wc-2019-solo', 3]] },
  { id: 'dubs', name: 'Dubs', country: 'US', region: 'NAW', born: '2003-01-14', earnings: 720000, team: 'FaZe Clan', pr: 1340, tier: 2, first: 'C2S2', last: 'C6S4', fncsWins: 1 },
  { id: 'ceice', name: 'Ceice', country: 'US', region: 'NAW', born: '2002-06-18', earnings: 560000, team: 'FaZe Clan', pr: 1160, tier: 2, first: 'C2S1', last: 'C5S4' },
  { id: 'riversan', name: 'Riversan', country: 'US', region: 'NAW', born: '2003-09-02', earnings: 520000, pr: 1120, tier: 3, first: 'C2S3', last: 'C6S2' },
  { id: 'mackwood', name: 'Mackwood', country: 'CA', region: 'NAW', born: '2003-05-07', earnings: 540000, pr: 1140, tier: 3, first: 'C2S4', last: 'C6S4' },
  { id: 'stretch', name: 'Stretch', country: 'US', region: 'NAW', born: '2004-04-04', earnings: 440000, pr: 1020, tier: 3, first: 'C3S1', last: 'C7S1' },
  { id: 'nicks', name: 'Nicks', country: 'US', region: 'NAW', born: '2004-11-11', earnings: 400000, pr: 980, tier: 3, first: 'C3S3', last: 'C7S2' },
  { id: 'avery', name: 'Avery', country: 'US', region: 'NAW', born: '2005-05-05', earnings: 390000, pr: 960, tier: 4, first: 'C4S2', last: 'C7S2' },
  { id: 'kore', name: 'Kore', country: 'CA', region: 'NAW', born: '2005-10-22', earnings: 370000, pr: 930, tier: 4, first: 'C4S4', last: 'C7S2' },

  // ----------------------------------------------------------------- Europe
  { id: 'mrsavage', name: 'MrSavage', realName: 'Martin Foss Andersen', country: 'NO', region: 'EU', born: '2004-08-14', earnings: 1240000, team: '100 Thieves', pr: 2020, tier: 1, first: 'C2S1', last: 'C7S2', fncsWins: 2, partners: ['benjyfishy'] },
  { id: 'benjyfishy', name: 'Benjyfishy', realName: 'Benjy Fish', country: 'GB', region: 'EU', born: '2004-06-16', earnings: 1140000, pr: 1560, tier: 1, first: 'C2S1', last: 'C4S2', status: 'inactive', partners: ['mrsavage'] },
  { id: 'mongraal', name: 'Mongraal', realName: 'Kyle Jackson', country: 'GB', region: 'EU', born: '2004-09-29', earnings: 760000, team: 'FaZe Clan', pr: 1280, tier: 2, first: 'C2S1', last: 'C5S4', partners: ['mitr0'] },
  { id: 'mitr0', name: 'Mitr0', realName: 'Dmitri Van de Vrie', country: 'NL', region: 'EU', born: '2003-05-02', earnings: 700000, pr: 1240, tier: 2, first: 'C2S1', last: 'C5S2', partners: ['mongraal'] },
  { id: 'tayson', name: 'TaySon', realName: 'Tai Starcic', country: 'SI', region: 'EU', born: '2003-03-21', earnings: 1180000, team: 'Team Falcons', pr: 2080, tier: 1, first: 'C2S2', last: 'C7S2', fncsWins: 3, signature: [['fncs-gc-2022', 1]] },
  { id: 'th0mashd', name: 'Th0masHD', country: 'DK', region: 'EU', born: '2004-02-08', earnings: 940000, team: 'Team Falcons', pr: 1780, tier: 1, first: 'C2S4', last: 'C7S2', fncsWins: 2 },
  { id: 'anas', name: 'Anas', country: 'FR', region: 'EU', born: '2005-04-17', earnings: 830000, team: 'Team Falcons', pr: 1660, tier: 1, first: 'C3S2', last: 'C7S2', fncsWins: 2, partners: ['vadeal'] },
  { id: 'vadeal', name: 'Vadeal', country: 'FR', region: 'EU', born: '2005-10-09', earnings: 690000, team: 'Team Falcons', pr: 1420, tier: 2, first: 'C3S4', last: 'C7S2', partners: ['anas'] },
  { id: 'veno', name: 'Veno', country: 'DE', region: 'EU', born: '2004-01-27', earnings: 720000, team: 'Wave Esports', pr: 1460, tier: 2, first: 'C2S5', last: 'C7S2', fncsWins: 1 },
  { id: 'queasy', name: 'Queasy', country: 'GB', region: 'EU', born: '2004-07-30', earnings: 660000, team: 'Guild Esports', pr: 1380, tier: 2, first: 'C2S6', last: 'C7S2' },
  { id: 'jannisz', name: 'JannisZ', country: 'DE', region: 'EU', born: '2004-11-05', earnings: 780000, team: 'Wave Esports', pr: 1520, tier: 2, first: 'C2S4', last: 'C7S2', fncsWins: 1 },
  { id: 'setty', name: 'Setty', country: 'DE', region: 'EU', born: '2005-06-23', earnings: 620000, team: 'Wave Esports', pr: 1340, tier: 2, first: 'C3S2', last: 'C7S2' },
  { id: 'podasai', name: 'Podasai', country: 'DE', region: 'EU', born: '2005-09-11', earnings: 580000, team: 'Wave Esports', pr: 1260, tier: 3, first: 'C3S4', last: 'C7S2' },
  { id: 'kami', name: 'Kami', country: 'DE', region: 'EU', born: '2004-03-14', earnings: 540000, team: 'Guild Esports', pr: 1180, tier: 3, first: 'C2S7', last: 'C6S4' },
  { id: 'malibuca', name: 'Malibuca', country: 'PL', region: 'EU', born: '2005-01-06', earnings: 610000, team: 'Team Liquid', pr: 1320, tier: 2, first: 'C3S1', last: 'C7S2' },
  { id: 'noahreyli', name: 'Noahreyli', country: 'NO', region: 'EU', born: '2005-08-20', earnings: 640000, team: 'Guild Esports', pr: 1360, tier: 2, first: 'C2S6', last: 'C7S2' },
  { id: 'trippern', name: 'Trippern', country: 'NO', region: 'EU', born: '2004-12-19', earnings: 560000, team: 'Guild Esports', pr: 1220, tier: 3, first: 'C2S5', last: 'C6S4' },
  { id: 'skite', name: 'Skite', country: 'FR', region: 'EU', born: '2005-02-28', earnings: 590000, team: 'Karmine Corp', pr: 1280, tier: 3, first: 'C3S2', last: 'C7S2' },
  { id: 'k1nzell', name: 'K1nzell', country: 'FR', region: 'EU', born: '2005-11-15', earnings: 520000, team: 'Karmine Corp', pr: 1160, tier: 3, first: 'C3S4', last: 'C7S2' },
  { id: 'snayzy', name: 'Snayzy', country: 'FR', region: 'EU', born: '2006-04-02', earnings: 500000, team: 'Karmine Corp', pr: 1140, tier: 3, first: 'C4S2', last: 'C7S2' },
  { id: 'flickzy', name: 'Flickzy', country: 'FR', region: 'EU', born: '2005-05-26', earnings: 540000, team: 'Karmine Corp', pr: 1200, tier: 3, first: 'C3S3', last: 'C7S2' },
  { id: 'refsgaard', name: 'Refsgaard', country: 'DK', region: 'EU', born: '2003-07-12', earnings: 680000, pr: 1400, tier: 2, first: 'C2S2', last: 'C6S4', fncsWins: 1 },
  { id: 'wolfiez', name: 'Wolfiez', realName: 'Jaden Ashman', country: 'GB', region: 'EU', born: '2003-10-24', earnings: 1540000, pr: 1240, tier: 1, first: 'C2S1', last: 'C4S4', status: 'inactive', signature: [['wc-2019-duo', 2]] },
  { id: 'aqua', name: 'Aqua', realName: 'David Wang', country: 'AT', region: 'EU', born: '2002-05-08', earnings: 1860000, pr: 1460, tier: 1, first: 'C2S1', last: 'C4S4', signature: [['wc-2019-duo', 1]], partners: ['nyhrox'] },
  { id: 'nyhrox', name: 'Nyhrox', realName: 'Emil Bergquist Pedersen', country: 'NO', region: 'EU', born: '2003-01-31', earnings: 1620000, pr: 1380, tier: 1, first: 'C2S1', last: 'C4S2', signature: [['wc-2019-duo', 1]], partners: ['aqua'] },
  { id: 'rojo', name: 'Rojo', country: 'NO', region: 'EU', born: '2003-06-07', earnings: 740000, pr: 1300, tier: 2, first: 'C2S2', last: 'C6S2' },
  { id: 'chapix', name: 'Chapix', country: 'ES', region: 'EU', born: '2004-08-03', earnings: 560000, pr: 1200, tier: 3, first: 'C2S8', last: 'C7S1' },
  { id: 'jahq', name: 'JahQ', country: 'PL', region: 'EU', born: '2004-10-13', earnings: 600000, team: 'Team Liquid', pr: 1300, tier: 2, first: 'C2S7', last: 'C7S2' },
  { id: 'kwaaz', name: 'Kwaaz', country: 'FR', region: 'EU', born: '2005-03-09', earnings: 510000, pr: 1150, tier: 3, first: 'C3S3', last: 'C7S2' },
  { id: 'pinq', name: 'Pinq', country: 'PL', region: 'EU', born: '2004-04-21', earnings: 530000, team: 'Team Liquid', pr: 1170, tier: 3, first: 'C3S1', last: 'C7S1' },
  { id: 'andilex', name: 'Andilex', country: 'DE', region: 'EU', born: '2005-07-18', earnings: 480000, pr: 1090, tier: 3, first: 'C3S4', last: 'C7S2' },
  { id: 'vanyak', name: 'Vanyak', country: 'CZ', region: 'EU', born: '2004-09-05', earnings: 470000, pr: 1080, tier: 3, first: 'C2S8', last: 'C6S4' },
  { id: 'rezon', name: 'Rezon', country: 'PL', region: 'EU', born: '2005-12-02', earnings: 450000, team: 'Team Liquid', pr: 1050, tier: 3, first: 'C4S1', last: 'C7S2' },
  { id: 'stompy', name: 'Stompy', country: 'NL', region: 'EU', born: '2004-06-11', earnings: 490000, pr: 1100, tier: 3, first: 'C2S8', last: 'C6S3' },
  { id: 'hen', name: 'Hen', country: 'NL', region: 'EU', born: '2005-02-14', earnings: 430000, pr: 1000, tier: 4, first: 'C4S1', last: 'C7S2' },
  { id: 'tschiinken', name: 'Tschiinken', country: 'AT', region: 'EU', born: '2004-11-28', earnings: 420000, pr: 990, tier: 4, first: 'C3S2', last: 'C6S4' },
  { id: 'aztral', name: 'Aztral', country: 'SE', region: 'EU', born: '2004-05-16', earnings: 580000, pr: 1250, tier: 3, first: 'C2S5', last: 'C7S1' },
  { id: 'jelty', name: 'Jelty', country: 'FR', region: 'EU', born: '2005-09-23', earnings: 460000, pr: 1060, tier: 3, first: 'C4S1', last: 'C7S2' },
  { id: 'nayte', name: 'Nayte', country: 'GB', region: 'EU', born: '2004-02-26', earnings: 500000, team: 'Guild Esports', pr: 1130, tier: 3, first: 'C2S7', last: 'C6S4' },
  { id: 'kyzu', name: 'Kyzu', country: 'BE', region: 'EU', born: '2005-04-30', earnings: 440000, pr: 1010, tier: 3, first: 'C3S3', last: 'C7S2' },
  { id: 'vico', name: 'Vico', country: 'SE', region: 'EU', born: '2005-08-08', earnings: 410000, pr: 970, tier: 4, first: 'C4S3', last: 'C7S2' },
  { id: 'dallux', name: 'Dallux', country: 'DK', region: 'EU', born: '2005-01-20', earnings: 425000, pr: 985, tier: 4, first: 'C4S2', last: 'C7S2' },
  { id: 'moqzii', name: 'Moqzii', country: 'NL', region: 'EU', born: '2004-10-30', earnings: 455000, pr: 1045, tier: 3, first: 'C3S2', last: 'C7S1' },
  { id: 'pxlarized', name: 'Pxlarized', country: 'BE', region: 'EU', born: '2005-06-05', earnings: 405000, pr: 960, tier: 4, first: 'C4S4', last: 'C7S2' },

  // ----------------------------------------------------------------- Brazil
  { id: 'king', name: 'King', country: 'BR', region: 'BR', born: '2003-02-11', earnings: 520000, team: 'Luminosity', pr: 1240, tier: 2, first: 'C2S2', last: 'C7S2', fncsWins: 2 },
  { id: 'nk', name: 'Nk', country: 'BR', region: 'BR', born: '2004-05-23', earnings: 480000, team: 'Luminosity', pr: 1180, tier: 2, first: 'C2S5', last: 'C7S2', fncsWins: 1 },
  { id: 'phzin', name: 'Phzin', country: 'BR', region: 'BR', born: '2005-01-09', earnings: 460000, team: 'Luminosity', pr: 1150, tier: 2, first: 'C3S2', last: 'C7S2', fncsWins: 1 },
  { id: 'kurt0', name: 'Kurt0', country: 'BR', region: 'BR', born: '2004-08-17', earnings: 420000, team: 'Luminosity', pr: 1090, tier: 3, first: 'C3S1', last: 'C7S2' },
  { id: 'vhen', name: 'Vhen', country: 'BR', region: 'BR', born: '2005-03-27', earnings: 380000, pr: 1020, tier: 3, first: 'C4S1', last: 'C7S2' },
  { id: 'luvz', name: 'Luvz', country: 'BR', region: 'BR', born: '2005-11-19', earnings: 350000, pr: 980, tier: 3, first: 'C4S3', last: 'C7S2' },
  { id: 'drakz', name: 'Drakz', country: 'BR', region: 'BR', born: '2004-04-12', earnings: 340000, pr: 960, tier: 4, first: 'C3S4', last: 'C6S4' },
  { id: 'mkzin', name: 'Mkzin', country: 'BR', region: 'BR', born: '2006-02-05', earnings: 320000, pr: 930, tier: 4, first: 'C5S1', last: 'C7S2' },

  // --------------------------------------------------------------- Oceania
  { id: 'volx', name: 'Volx', country: 'AU', region: 'OCE', born: '2005-03-12', earnings: 380000, team: 'Dignitas', pr: 1120, tier: 2, first: 'C3S1', last: 'C7S2', fncsWins: 2 },
  { id: 'hazza', name: 'Hazza', country: 'AU', region: 'OCE', born: '2004-07-21', earnings: 340000, team: 'Dignitas', pr: 1050, tier: 2, first: 'C2S5', last: 'C7S2', fncsWins: 1 },
  { id: 'sicky', name: 'Sicky', country: 'AU', region: 'OCE', born: '2004-12-08', earnings: 310000, team: 'Dignitas', pr: 1000, tier: 3, first: 'C2S8', last: 'C7S1' },
  { id: 'jynx', name: 'Jynx', country: 'NZ', region: 'OCE', born: '2005-09-16', earnings: 290000, team: 'Dignitas', pr: 960, tier: 3, first: 'C3S3', last: 'C7S2' },
  { id: 'mercury', name: 'Mercury', country: 'AU', region: 'OCE', born: '2005-05-29', earnings: 270000, pr: 920, tier: 3, first: 'C4S1', last: 'C7S2' },
  { id: 'ozfn', name: 'Ozfn', country: 'AU', region: 'OCE', born: '2006-01-13', earnings: 250000, pr: 890, tier: 4, first: 'C5S1', last: 'C7S2' },

  // ------------------------------------------------------------------ Asia
  { id: 'riku', name: 'Riku', country: 'JP', region: 'ASIA', born: '2004-06-01', earnings: 300000, team: 'Gen.G', pr: 1010, tier: 2, first: 'C2S6', last: 'C7S2', fncsWins: 2 },
  { id: 'nemui', name: 'Nemui', country: 'JP', region: 'ASIA', born: '2005-02-22', earnings: 270000, team: 'Gen.G', pr: 960, tier: 2, first: 'C3S2', last: 'C7S2', fncsWins: 1 },
  { id: 'wataame', name: 'Wataame', country: 'JP', region: 'ASIA', born: '2004-10-04', earnings: 250000, team: 'Gen.G', pr: 930, tier: 3, first: 'C3S1', last: 'C7S1' },
  { id: 'jaomock', name: 'Jaomock', country: 'KR', region: 'ASIA', born: '2005-07-14', earnings: 230000, team: 'Gen.G', pr: 900, tier: 3, first: 'C4S1', last: 'C7S2' },

  // ---------------------------------------------------------- Middle East
  { id: 'nagu', name: 'Nagu', country: 'SA', region: 'ME', born: '2004-09-08', earnings: 320000, team: 'Twisted Minds', pr: 1030, tier: 2, first: 'C3S1', last: 'C7S2', fncsWins: 2 },
  { id: 'fadi', name: 'Fadi', country: 'AE', region: 'ME', born: '2005-04-25', earnings: 280000, team: 'Twisted Minds', pr: 970, tier: 2, first: 'C3S3', last: 'C7S2', fncsWins: 1 },
  { id: 'sultan', name: 'Sultan', country: 'SA', region: 'ME', born: '2004-11-30', earnings: 260000, team: 'Twisted Minds', pr: 940, tier: 3, first: 'C3S2', last: 'C7S2' },
  { id: 'amir', name: 'Amir', country: 'AE', region: 'ME', born: '2005-12-17', earnings: 240000, team: 'Twisted Minds', pr: 910, tier: 3, first: 'C4S2', last: 'C7S2' },
];

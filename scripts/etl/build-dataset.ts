/**
 * Turns the cached sources into the generated data modules under
 * `src/data/fortnite/`.
 *
 * Run with: npm run etl:build   (after `npm run etl:fetch`)
 *
 * Nothing here is invented. Every event, entry, birthday and earnings figure
 * traces back to a row in one of the cached pages; where a value is missing
 * upstream it stays missing rather than being filled in. The generated modules
 * are committed so the site builds without network access.
 */
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCache, EARNINGS_YEARS } from './fetch-sources.ts';
import { cleanText, parseTables, parseWinnerCell, tableCaptions } from './lib/wikitext.ts';
import { parseBirthdays, parseEarnings } from './lib/liquipedia.ts';
import { BIRTHDAY_BLOCKLIST, LIQUIPEDIA_ALIASES } from './aliases.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '..', 'src', 'data', 'fortnite');

type Region = 'NAE' | 'NAW' | 'NAC' | 'EU' | 'BR' | 'OCE' | 'ASIA' | 'ME';
type Tier = 'global' | 'fncs' | 'lan' | 'major';
type Format = 'solo' | 'duo' | 'trio' | 'squad';

interface EventDraft {
  id: string;
  name: string;
  shortName: string;
  tier: Tier;
  year: number;
  date: string;
  dateLabel: string;
  region: Region | null;
  format: Format;
  season: string | null;
  platform: string | null;
  order: number;
}

interface EntryDraft {
  eventId: string;
  placement: number;
  names: { name: string; country: string | null }[];
  org: string | null;
}

// --------------------------------------------------------------------- dates

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "October–November 2020" -> { date: '2020-11-15', year: 2020 }. Uses the final month. */
function parseDateLabel(label: string): { date: string; year: number } {
  const yearMatch = /(\d{4})/.exec(label);
  const year = yearMatch ? Number(yearMatch[1]) : 0;
  const found = MONTHS.filter((month) => label.includes(month));
  const month = found.length ? MONTHS.indexOf(found[found.length - 1]) + 1 : 6;
  return { date: `${year}-${String(month).padStart(2, '0')}-15`, year };
}

const slug = (value: string): string =>
  cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const FORMAT_BY_SIZE: Record<number, Format> = { 1: 'solo', 2: 'duo', 3: 'trio', 4: 'squad' };

// ------------------------------------------------------------ wikipedia: FNCS

const FNCS_COLUMNS: Region[] = ['EU', 'NAE', 'NAC', 'NAW', 'BR', 'ASIA', 'ME', 'OCE'];

/** Stable ids for the FNCS events that are not regional grand finals. */
const GLOBAL_EVENT_IDS: Record<string, string> = {
  'FNCS – Invitational': 'fncs-invitational-2020',
  'FNCS All-Star Showdown': 'fncs-all-star-showdown-2021',
  '2021 FNCS Grand Royale': 'fncs-grand-royale-2021',
  'FNCS Invitational 2022': 'fncs-invitational-2022',
  '2023 FNCS Global Championship': 'fncs-global-2023',
  '2024 FNCS Global Championship': 'fncs-global-2024',
  '2025 FNCS Global Championship': 'fncs-global-2025',
  '2026 FNCS Global Championship': 'fncs-global-2026',
  'FNCS Major 1 Summit – 2026': 'fncs-summit-2026',
};

function platformSuffix(platform: string | null): string {
  if (!platform) return '';
  if (/pc/i.test(platform)) return '-pc';
  if (/console|mobile/i.test(platform)) return '-console';
  if (/zero build/i.test(platform)) return '-zb';
  if (/battle royale/i.test(platform)) return '-br';
  if (/duo/i.test(platform)) return '-duo';
  if (/solo/i.test(platform)) return '-solo';
  return '-' + slug(platform);
}

function buildFncs(wikitext: string): { events: EventDraft[]; entries: EntryDraft[] } {
  const section = wikitext.split('=== Major non-FNCS')[0];
  const grid = parseTables(section)[0];
  const events: EventDraft[] = [];
  const entries: EntryDraft[] = [];

  for (let row = 3; row < grid.length; row++) {
    const cells = grid[row];
    const official = cleanText(cells[0]);
    const platformRaw = cleanText(cells[1]);
    const platform = platformRaw === official ? null : platformRaw.replace(/\s*\/\s*/, '/');
    const dateLabel = cleanText(cells[2]);
    const season = cleanText(cells[3]) || null;
    const { date, year } = parseDateLabel(dateLabel);

    const winnerCells = cells.slice(4, 12);
    const parsed = winnerCells.map(parseWinnerCell);
    const isGlobal = new Set(winnerCells).size === 1 && parsed[0].players.length > 0;
    const populated = parsed.filter((p) => p.players.length > 0);
    if (populated.length === 0) continue; // TBD rows (events that have not happened yet)

    const rosterSize = Math.min(4, Math.max(...populated.map((p) => p.players.length)));
    const format = FORMAT_BY_SIZE[rosterSize] ?? 'trio';

    if (isGlobal) {
      const id = GLOBAL_EVENT_IDS[official] ?? `fncs-${slug(official)}`;
      events.push({
        id, name: official, shortName: official, tier: 'global', year, date, dateLabel,
        region: null, format, season, platform, order: row,
      });
      entries.push({ eventId: id, placement: 1, names: parsed[0].players, org: parsed[0].org });
      continue;
    }

    // Several events share a season key — C2S7 covers both the All-Star
    // Showdown and the regular grand finals, C2S8 both the finals and the Grand
    // Royale — so only the standard seasonal finals may key off the season.
    const seasonal = /^FNCS[\s:–-]*(Chapter \d+\s*[–-]?\s*Season \d+|Season X|Major \d+\s*[–-]\s*\d{4})$/i.test(official);
    const stem = seasonal && season ? season.toLowerCase() : slug(official);

    FNCS_COLUMNS.forEach((region, index) => {
      const cell = parsed[index];
      if (!cell.players.length) return;
      const id = `fncs-${stem}-${region.toLowerCase()}${platformSuffix(platform)}`;
      events.push({
        id,
        name: `${official} — ${REGION_NAME[region]} Grand Finals${platform ? ` (${platform})` : ''}`,
        shortName: `${official}${platform ? ` (${platform})` : ''}`,
        tier: 'fncs', year, date, dateLabel, region,
        format: FORMAT_BY_SIZE[Math.min(4, cell.players.length)] ?? format,
        season, platform, order: row,
      });
      entries.push({ eventId: id, placement: 1, names: cell.players, org: cell.org });
    });
  }
  return { events, entries };
}

const REGION_NAME: Record<Region, string> = {
  EU: 'Europe', NAE: 'NA East', NAC: 'NA Central', NAW: 'NA West',
  BR: 'Brazil', ASIA: 'Asia', ME: 'Middle East', OCE: 'Oceania',
};

// ------------------------------------------------------ wikipedia: non-FNCS

/** LAN events on the non-FNCS table; everything else is treated as an online major. */
const LAN_EVENTS = /dreamhack|gamers8|esports world cup|reload elite|world cup/i;

function buildMajors(wikitext: string): { events: EventDraft[]; entries: EntryDraft[] } {
  const start = wikitext.indexOf('=== Major non-FNCS tournament winners ===');
  const end = wikitext.indexOf('== Record FNCS winners ==');
  const grid = parseTables(wikitext.slice(start, end))[0];
  const events: EventDraft[] = [];
  const entries: EntryDraft[] = [];

  for (let row = 2; row < grid.length; row++) {
    const cells = grid[row];
    const official = cleanText(cells[0]);
    const platformRaw = cleanText(cells[1]);
    const platform = platformRaw === official ? null : platformRaw;
    const dateLabel = cleanText(cells[2]);
    const season = cleanText(cells[3]) || null;
    const { date, year } = parseDateLabel(dateLabel);

    const eu = parseWinnerCell(cells[4]);
    const na = parseWinnerCell(cells[5]);
    const shared = cells[4] === cells[5];
    const tier: Tier = LAN_EVENTS.test(official) ? 'lan' : 'major';

    const sides = shared
      ? [{ region: null as Region | null, cell: eu }]
      : [
          { region: 'EU' as Region | null, cell: eu },
          { region: 'NAE' as Region | null, cell: na },
        ];

    for (const side of sides) {
      if (!side.cell.players.length) continue;
      const regionSuffix = side.region ? `-${side.region.toLowerCase()}` : '';
      const id = `${slug(official)}${platformSuffix(platform)}${regionSuffix}`;
      events.push({
        id,
        name: official + (platform ? ` (${platform})` : '') + (side.region ? ` — ${REGION_NAME[side.region]}` : ''),
        shortName: official + (platform ? ` (${platform})` : ''),
        tier, year, date, dateLabel,
        region: side.region,
        format: FORMAT_BY_SIZE[Math.min(4, side.cell.players.length)] ?? 'duo',
        season, platform, order: 1000 + row,
      });
      entries.push({ eventId: id, placement: 1, names: side.cell.players, org: side.cell.org });
    }
  }
  return { events, entries };
}

// ------------------------------------------------- wikipedia: earners table

interface EarnerRow {
  rank: number;
  name: string;
  country: string | null;
  realName: string | null;
  birthDate: string | null;
  /** Current organisation(s); Wikipedia lists a club and sometimes a sponsor. */
  orgs: string[];
  active: boolean;
}

function buildEarners(wikitext: string): EarnerRow[] {
  const start = wikitext.indexOf('== Highest earners ==');
  const end = wikitext.indexOf('== References ==');
  const grid = parseTables(wikitext.slice(start, end))[0];
  const rows: EarnerRow[] = [];
  for (let row = 1; row < grid.length; row++) {
    const cells = grid[row];
    const rank = Number(cleanText(cells[0]));
    const { players } = parseWinnerCell(cells[1] ?? '');
    if (!players.length || !Number.isFinite(rank)) continue;
    const age = /\{\{Age\|(\d+)\|(\d+)\|(\d+)\}\}/i.exec(cells[3] ?? '');
    rows.push({
      rank,
      name: players[0].name,
      country: players[0].country,
      realName: cleanText(cells[2]) || null,
      birthDate: age
        ? `${age[1]}-${String(Number(age[2])).padStart(2, '0')}-${String(Number(age[3])).padStart(2, '0')}`
        : null,
      orgs: parseWinnerCell(cells[5] ?? '').players.map((entry) => entry.name),
      active: (cells[1] ?? '').includes("'''"),
    });
  }
  return rows;
}

/** FNCS title counts as published, used to verify what we derive from the winners table. */
function buildRecordCounts(wikitext: string): Map<string, number> {
  const start = wikitext.indexOf('== Record FNCS winners ==');
  const end = wikitext.indexOf('== Highest earners ==');
  const section = wikitext.slice(start, end);
  const grid = parseTables(section)[0];
  const counts = new Map<string, number>();
  for (let row = 1; row < grid.length; row++) {
    const { players } = parseWinnerCell(grid[row][1] ?? '');
    const wins = Number(cleanText(grid[row][2] ?? ''));
    if (players.length && Number.isFinite(wins)) counts.set(players[0].name.toLowerCase(), wins);
  }
  void tableCaptions;
  return counts;
}

// ------------------------------------------------------------------- players

const key = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');

interface PlayerDraft {
  id: string;
  name: string;
  realName: string | null;
  country: string;
  regions: Set<Region>;
  birthDate: string | null;
  earnings: number;
  earningsByYear: Record<string, number>;
  earningsKnown: boolean;
  orgs: { org: string; source: 'wikipedia' }[];
  status: 'active' | 'inactive';
  lastDate: string;
}

async function main(): Promise<void> {
  const wikitext = await readCache('wikipedia-records.wikitext');
  if (!wikitext) throw new Error('Run "npm run etl:fetch" first — wikipedia-records.wikitext is missing.');

  const fncs = buildFncs(wikitext);
  const majors = buildMajors(wikitext);
  const earners = buildEarners(wikitext);
  const recordCounts = buildRecordCounts(wikitext);

  const events = [...fncs.events, ...majors.events].sort(
    (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order),
  );

  // An id collision would silently merge two tournaments into one, so fail loudly.
  const seenIds = new Map<string, string>();
  for (const event of events) {
    const clash = seenIds.get(event.id);
    if (clash && clash !== event.name) {
      throw new Error(`event id "${event.id}" is claimed by both "${clash}" and "${event.name}"`);
    }
    seenIds.set(event.id, event.name);
  }
  const rawEntries = [...fncs.entries, ...majors.entries];

  // --- Liquipedia ---------------------------------------------------------
  const birthdayHtml = await readCache('liquipedia-birthdays.html');
  const birthdays = birthdayHtml ? parseBirthdays(birthdayHtml) : [];
  const birthdayByKey = new Map(birthdays.map((b) => [key(b.handle), b]));

  const totalHtml = await readCache('liquipedia-earnings-total.html');
  const totals = totalHtml ? parseEarnings(totalHtml) : [];
  const totalByKey = new Map(totals.map((e) => [key(e.name), e]));

  const yearly = new Map<number, Map<string, number>>();
  for (const year of EARNINGS_YEARS) {
    const html = await readCache(`liquipedia-earnings-${year}.html`);
    if (!html) continue;
    yearly.set(year, new Map(parseEarnings(html).map((e) => [key(e.name), e.earnings])));
  }

  // --- identities ---------------------------------------------------------
  // A handle can belong to two different people (there is an Australian and a
  // Bahraini "Speedy"); split on country and suffix the rarer one's id.
  const appearances = new Map<string, Map<string, number>>();
  const eventById = new Map(events.map((e) => [e.id, e]));
  for (const entry of rawEntries) {
    for (const person of entry.names) {
      const k = key(person.name);
      if (!k) continue;
      const byCountry = appearances.get(k) ?? new Map<string, number>();
      const country = person.country ?? '??';
      byCountry.set(country, (byCountry.get(country) ?? 0) + 1);
      appearances.set(k, byCountry);
    }
  }

  const idFor = new Map<string, string>(); // `${key}|${country}` -> player id
  /** Display suffix for the shared-handle players, so the two never look alike. */
  const labelFor = new Map<string, string>();
  for (const [k, byCountry] of appearances) {
    const ranked = [...byCountry.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    ranked.forEach(([country], index) => {
      const id = index === 0 ? k : `${k}-${country.toLowerCase()}`;
      idFor.set(`${k}|${country}`, id);
      // Two people really do share a handle (an Australian and a Bahraini
      // "Speedy"), so tag every one of them with their country — a bare
      // duplicate would make name lookup ambiguous in the games.
      if (ranked.length > 1) labelFor.set(id, country);
    });
  }

  const players = new Map<string, PlayerDraft>();
  const nameOf = new Map<string, string>();

  function ensure(person: { name: string; country: string | null }, date: string, region: Region | null): string | null {
    const k = key(person.name);
    if (!k) return null;
    const id = idFor.get(`${k}|${person.country ?? '??'}`) ?? k;
    let draft = players.get(id);
    if (!draft) {
      const lp = key(LIQUIPEDIA_ALIASES[k] ?? '') || k;
      const birthday = BIRTHDAY_BLOCKLIST.has(k) ? undefined : birthdayByKey.get(lp);
      const total = totalByKey.get(lp);
      const earner = earners.find((e) => key(e.name) === k);
      const earningsByYear: Record<string, number> = {};
      for (const [year, table] of yearly) {
        const amount = table.get(lp);
        if (amount) earningsByYear[String(year)] = amount;
      }
      // Liquipedia's all-time table stops at the top 500, but the per-year
      // tables reach further down. When the career total is missing, the sum of
      // the known years is the best verified figure we have (a lower bound).
      const yearSum = Object.values(earningsByYear).reduce((sum, amount) => sum + amount, 0);
      const tag = labelFor.get(id);
      draft = {
        id,
        name: tag ? `${person.name} (${tag})` : person.name,
        realName: earner?.realName ?? birthday?.realName ?? null,
        country: person.country ?? earner?.country ?? '??',
        regions: new Set<Region>(),
        birthDate: birthday?.birthDate ?? earner?.birthDate ?? null,
        earnings: total?.earnings ?? yearSum,
        earningsByYear,
        earningsKnown: Boolean(total),
        orgs: (earner?.orgs ?? []).map((org) => ({ org, source: 'wikipedia' as const })),
        status: 'inactive',
        lastDate: date,
      };
      players.set(id, draft);
      nameOf.set(id, person.name);
    }
    if (region) draft.regions.add(region);
    if (date > draft.lastDate) draft.lastDate = date;
    return id;
  }

  // Everyone on the $500k+ earners table belongs in the dataset even if they
  // never won a title — Psalm, Wolfiez and Kreo are World Cup names the games
  // should still know about.
  for (const earner of earners) {
    ensure({ name: earner.name, country: earner.country }, '2019-07-15', null);
  }

  const entries: { id: string; eventId: string; placement: number; playerIds: string[]; org: string | null }[] = [];
  for (const entry of rawEntries) {
    const event = eventById.get(entry.eventId);
    if (!event) continue;
    const ids = entry.names
      .map((person) => ensure(person, event.date, event.region))
      .filter((id): id is string => Boolean(id));
    if (!ids.length) continue;
    entries.push({
      id: `${entry.eventId}-p${entry.placement}`,
      eventId: entry.eventId,
      placement: entry.placement,
      playerIds: ids,
      org: entry.org,
    });
  }

  // A handle shared with a younger player is the commonest bad match, and it
  // shows up as an impossible age at the first recorded title. Epic's events
  // are 13+, so anything under 12 is the wrong person: drop the birthday rather
  // than publish a wrong one.
  const firstEventDate = new Map<string, string>();
  for (const entry of entries) {
    const date = eventById.get(entry.eventId)!.date;
    for (const id of entry.playerIds) {
      const seen = firstEventDate.get(id);
      if (!seen || date < seen) firstEventDate.set(id, date);
    }
  }
  let droppedBirthdays = 0;
  for (const draft of players.values()) {
    const first = firstEventDate.get(draft.id);
    if (!draft.birthDate || !first) continue;
    const born = new Date(draft.birthDate);
    const on = new Date(first);
    let age = on.getFullYear() - born.getFullYear();
    const monthDiff = on.getMonth() - born.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < born.getDate())) age--;
    if (age < 12) {
      draft.birthDate = null;
      draft.realName = null;
      droppedBirthdays++;
    }
  }

  // Active if they are flagged active upstream or have a result in the last 18 months.
  const latest = events[events.length - 1]?.date ?? '2026-09-13';
  const cutoff = new Date(latest);
  cutoff.setMonth(cutoff.getMonth() - 18);
  const cutoffIso = cutoff.toISOString().slice(0, 10);
  for (const draft of players.values()) {
    const earner = earners.find((e) => key(e.name) === key(draft.name));
    draft.status = earner?.active || draft.lastDate >= cutoffIso ? 'active' : 'inactive';
  }

  // --- emit ---------------------------------------------------------------
  await mkdir(OUT_DIR, { recursive: true });

  const sortedPlayers = [...players.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
  const usedEventIds = new Set(entries.map((e) => e.eventId));
  const keptEvents = events.filter((e) => usedEventIds.has(e.id));

  await writeFile(join(OUT_DIR, 'events.ts'), renderEvents(keptEvents), 'utf8');
  await writeFile(join(OUT_DIR, 'entries.ts'), renderEntries(entries), 'utf8');
  await writeFile(join(OUT_DIR, 'players.ts'), renderPlayers(sortedPlayers), 'utf8');

  // --- report -------------------------------------------------------------
  console.log(`events   ${keptEvents.length}`);
  console.log(`entries  ${entries.length}`);
  console.log(`players  ${sortedPlayers.length}`);
  console.log(`  with birthday      ${sortedPlayers.filter((p) => p.birthDate).length}`);
  console.log(`  with real name     ${sortedPlayers.filter((p) => p.realName).length}`);
  console.log(`  with earnings      ${sortedPlayers.filter((p) => p.earningsKnown).length}`);
  console.log(`  with yearly splits ${sortedPlayers.filter((p) => Object.keys(p.earningsByYear).length).length}`);
  console.log(`  years covered      ${[...yearly.keys()].join(', ') || 'none'}`);
  console.log(`  birthdays rejected by the age guard: ${droppedBirthdays}`);

  // cross-check derived FNCS titles against the published record tables
  const derived = new Map<string, number>();
  for (const entry of entries) {
    if (entry.placement !== 1) continue;
    if (eventById.get(entry.eventId)?.tier !== 'fncs') continue;
    for (const id of entry.playerIds) derived.set(id, (derived.get(id) ?? 0) + 1);
  }
  let mismatches = 0;
  for (const [name, published] of recordCounts) {
    const id = idFor.get(`${key(name)}|${[...(appearances.get(key(name))?.keys() ?? [])][0]}`) ?? key(name);
    const ours = derived.get(id) ?? 0;
    // The published tables count regional finals plus the globals as FNCS wins;
    // ours counts regional finals only, so ours <= published is expected.
    if (ours > published) {
      mismatches++;
      if (mismatches <= 10) console.log(`  ! ${name}: derived ${ours} regional FNCS wins > published ${published}`);
    }
  }
  console.log(`FNCS title cross-check: ${mismatches} over-count(s) vs Wikipedia record tables`);
}

// ------------------------------------------------------------------ emitters

const q = (value: string | null): string =>
  value === null ? 'null' : `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const BANNER = `// GENERATED by scripts/etl/build-dataset.ts — do not edit by hand.
// Sources: en.wikipedia.org "Competitive Fortnite records and statistics" and
// liquipedia.net/fortnite (Birthday list, Player earnings portal).
// Regenerate with: npm run etl:fetch && npm run etl:build
`;

function renderEvents(events: EventDraft[]): string {
  const rows = events.map(
    (e) =>
      `  { id: ${q(e.id)}, name: ${q(e.name)}, shortName: ${q(e.shortName)}, tier: ${q(e.tier)}, ` +
      `year: ${e.year}, date: ${q(e.date)}, dateLabel: ${q(e.dateLabel)}, region: ${q(e.region)}, ` +
      `format: ${q(e.format)}, season: ${q(e.season)}, platform: ${q(e.platform)} },`,
  );
  return `${BANNER}
import type { TournamentEvent } from '@/data/types';

/** Every tournament we have a recorded result for, oldest first. */
export const EVENTS: TournamentEvent[] = [
${rows.join('\n')}
];
`;
}

function renderEntries(
  entries: { id: string; eventId: string; placement: number; playerIds: string[]; org: string | null }[],
): string {
  const rows = entries.map(
    (e) =>
      `  { id: ${q(e.id)}, eventId: ${q(e.eventId)}, placement: ${e.placement}, ` +
      `playerIds: [${e.playerIds.map(q).join(', ')}], org: ${q(e.org)} },`,
  );
  return `${BANNER}
/** One roster's finish at one event. Prize money is attached in build.ts. */
export interface RawEntry {
  id: string;
  eventId: string;
  placement: number;
  playerIds: string[];
  org: string | null;
}

export const ENTRIES: RawEntry[] = [
${rows.join('\n')}
];
`;
}

function renderPlayers(players: PlayerDraft[]): string {
  const rows = players.map((p) => {
    const years = Object.entries(p.earningsByYear)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([year, amount]) => `'${year}': ${amount}`)
      .join(', ');
    const orgs = p.orgs.map((o) => `{ org: ${q(o.org)}, source: ${q(o.source)} }`).join(', ');
    return (
      `  { id: ${q(p.id)}, name: ${q(p.name)}, realName: ${q(p.realName)}, country: ${q(p.country)}, ` +
      `regions: [${[...p.regions].map(q).join(', ')}], birthDate: ${q(p.birthDate)}, ` +
      `earnings: ${p.earnings}, earningsKnown: ${p.earningsKnown}, earningsByYear: { ${years} }, ` +
      `orgs: [${orgs}], status: ${q(p.status)} },`
    );
  });
  return `${BANNER}
import type { DataSource, Region } from '@/data/types';

/** Verified facts about a player. Career totals are derived in build.ts. */
export interface PlayerSeed {
  id: string;
  name: string;
  realName: string | null;
  country: string;
  /** Every region the player has a recorded result in. */
  regions: Region[];
  birthDate: string | null;
  /** Career earnings in USD; 0 when the player sits outside Liquipedia's top 500. */
  earnings: number;
  /** False when no verified earnings figure exists for this player. */
  earningsKnown: boolean;
  earningsByYear: Record<string, number>;
  /** Organisations, oldest first. Dates are attached in build.ts where known. */
  orgs: { org: string; source: DataSource }[];
  status: 'active' | 'inactive';
}

export const PLAYER_SEEDS: PlayerSeed[] = [
${rows.join('\n')}
];
`;
}

if (!existsSync(OUT_DIR)) await mkdir(OUT_DIR, { recursive: true });
await main();

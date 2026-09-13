/**
 * Roster audit — sanity-checks the hand-authored data in
 * `src/data/sample/roster.ts`.
 *
 * Run with: npm run audit
 *
 * `check:data` proves the dataset is internally consistent; this script asks a
 * different question: does what a human typed look *plausible*? It cannot know
 * whether Bugha's birthday is right, but it will catch a typo'd country code, a
 * partner id that does not exist, a player who supposedly debuted at nine, or
 * two players credited with winning the same event.
 *
 * ERROR = certainly wrong, fix it.  WARN = probably wrong, worth a look.
 */
import { EVENT_BY_ID } from '@/data/sample/tournaments';
import { FNCS_SEASONS } from '@/data/sample/tournaments';
import { COUNTRY_NAMES, ROSTER } from '@/data/sample/roster';
import { loadDataset } from '@/data/repository';
import { DATA_UPDATED_AT } from '@/data/types';

const errors: string[] = [];
const warnings: string[] = [];

const seasonIndex = new Map(FNCS_SEASONS.map((season, index) => [season.key, index]));
const ids = new Set(ROSTER.map((seed) => seed.id));
const today = new Date(DATA_UPDATED_AT);

function ageOn(born: string, iso: string): number {
  const birth = new Date(born);
  const on = new Date(iso);
  let age = on.getFullYear() - birth.getFullYear();
  const months = on.getMonth() - birth.getMonth();
  if (months < 0 || (months === 0 && on.getDate() < birth.getDate())) age--;
  return age;
}

// ------------------------------------------------------------- uniqueness --
const seenIds = new Set<string>();
const seenNames = new Map<string, string>();
const seenRealNames = new Map<string, string>();
for (const seed of ROSTER) {
  if (seenIds.has(seed.id)) errors.push(`duplicate id "${seed.id}"`);
  seenIds.add(seed.id);

  const nameKey = seed.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const priorName = seenNames.get(nameKey);
  if (priorName) errors.push(`"${seed.name}" and "${priorName}" collide once spaces are stripped`);
  seenNames.set(nameKey, seed.name);

  if (seed.realName) {
    const prior = seenRealNames.get(seed.realName.toLowerCase());
    if (prior) warnings.push(`real name "${seed.realName}" is used by both ${prior} and ${seed.name}`);
    seenRealNames.set(seed.realName.toLowerCase(), seed.name);
  }
}

// ------------------------------------------------------------------ fields --
for (const seed of ROSTER) {
  const who = seed.name;

  if (!COUNTRY_NAMES[seed.country]) {
    errors.push(`${who}: country "${seed.country}" has no entry in COUNTRY_NAMES`);
  }

  const from = seasonIndex.get(seed.first);
  const to = seasonIndex.get(seed.last);
  if (from === undefined) errors.push(`${who}: first season "${seed.first}" is not a known season`);
  if (to === undefined) errors.push(`${who}: last season "${seed.last}" is not a known season`);
  if (from !== undefined && to !== undefined && from > to) {
    errors.push(`${who}: first season ${seed.first} comes after last season ${seed.last}`);
  }

  if (seed.born) {
    const age = ageOn(seed.born, DATA_UPDATED_AT);
    if (Number.isNaN(age)) errors.push(`${who}: birth date "${seed.born}" is not a valid date`);
    else if (age < 13) errors.push(`${who}: would be ${age} years old today`);
    else if (age > 40) warnings.push(`${who}: would be ${age} years old today`);

    if (from !== undefined) {
      const debutAge = ageOn(seed.born, FNCS_SEASONS[from].date);
      // Epic's competitive minimum is 13.
      if (debutAge < 13) errors.push(`${who}: debuts at ${seed.first} aged ${debutAge}`);
      else if (debutAge > 30) warnings.push(`${who}: debuts at ${seed.first} aged ${debutAge}`);
    }
    if (new Date(seed.born) > today) errors.push(`${who}: birth date is in the future`);
  } else {
    warnings.push(`${who}: no birth date, so they are skipped by Higher or Lower (Age)`);
  }

  if (seed.earnings <= 0) errors.push(`${who}: earnings must be positive`);
  if (seed.pr <= 0) errors.push(`${who}: PR must be positive`);

  for (const partnerId of seed.partners ?? []) {
    if (!ids.has(partnerId)) errors.push(`${who}: partner "${partnerId}" is not a player id`);
    if (partnerId === seed.id) errors.push(`${who}: listed as their own partner`);
  }

  for (const [eventId, placement] of seed.signature ?? []) {
    const event = EVENT_BY_ID.get(eventId);
    if (!event) {
      errors.push(`${who}: signature event "${eventId}" does not exist`);
      continue;
    }
    if (placement < 1) errors.push(`${who}: signature placement ${placement} at ${eventId} is not valid`);
    if (from !== undefined && to !== undefined) {
      const span = { start: FNCS_SEASONS[from].date, end: FNCS_SEASONS[to].date };
      // World Cup 2019 predates FNCS, so only flag results well outside the career.
      const early = event.date < span.start && event.year < Number(span.start.slice(0, 4));
      const late = event.date > span.end && event.year > Number(span.end.slice(0, 4));
      if (early || late) {
        warnings.push(
          `${who}: ${event.shortName} (${event.year}) sits outside their ${seed.first}–${seed.last} career`,
        );
      }
    }
  }

  // A player still listed as active who stopped competing long ago.
  if ((seed.status ?? 'active') === 'active' && to !== undefined && to < FNCS_SEASONS.length - 4) {
    warnings.push(`${who}: marked active but last competed at ${seed.last}`);
  }
  if (seed.status === 'inactive' && to !== undefined && to >= FNCS_SEASONS.length - 1) {
    warnings.push(`${who}: marked inactive but competed in the latest season ${seed.last}`);
  }
}

// -------------------------------------------------------- authored titles --
const winnersByEvent = new Map<string, string[]>();
for (const seed of ROSTER) {
  for (const [eventId, placement] of seed.signature ?? []) {
    if (placement !== 1) continue;
    const list = winnersByEvent.get(eventId) ?? [];
    list.push(seed.name);
    winnersByEvent.set(eventId, list);
  }
}
for (const [eventId, winners] of winnersByEvent) {
  const event = EVENT_BY_ID.get(eventId);
  if (!event) continue;
  const teamSize = event.format === 'solo' ? 1 : event.format === 'duo' ? 2 : event.format === 'trio' ? 3 : 4;
  if (winners.length > teamSize) {
    errors.push(
      `${event.shortName}: ${winners.length} winners (${winners.join(', ')}) but it is a ${event.format} event`,
    );
  }
}

// ------------------------------- did the builder honour the authored data? --
const dataset = await loadDataset();
for (const seed of ROSTER) {
  const player = dataset.getPlayer(seed.id);
  if (!player) {
    errors.push(`${seed.name}: missing from the built dataset`);
    continue;
  }
  const target = seed.fncsWins ?? 0;
  if (player.fncsWins !== target) {
    errors.push(
      `${seed.name}: asked for ${target} FNCS titles but the dataset gave ${player.fncsWins} — ` +
        `widen their first/last season range so there are enough finals to win`,
    );
  }
  for (const [eventId, placement] of seed.signature ?? []) {
    const actual = player.results.find((result) => result.eventId === eventId);
    if (!actual) errors.push(`${seed.name}: signature result at ${eventId} did not make it into the dataset`);
    else if (actual.placement !== placement) {
      errors.push(`${seed.name}: ${eventId} should be ${placement} but the dataset shows ${actual.placement}`);
    }
  }
}

// ------------------------------------------------------------- group sizes --
const countByTeam = new Map<string, number>();
const countByCountry = new Map<string, number>();
for (const seed of ROSTER) {
  if (seed.team) countByTeam.set(seed.team, (countByTeam.get(seed.team) ?? 0) + 1);
  countByCountry.set(seed.country, (countByCountry.get(seed.country) ?? 0) + 1);
}
for (const [team, count] of countByTeam) {
  if (count < 4) {
    warnings.push(`org "${team}" has only ${count} players — too few for Connections/Tic Tac Toe groups`);
  }
}

// ----------------------------------------------------------------- report --
console.log(`Audited ${ROSTER.length} players in src/data/sample/roster.ts\n`);
if (errors.length) {
  console.log(`ERRORS (${errors.length}) — these must be fixed:`);
  for (const message of errors) console.log('  ✗ ' + message);
  console.log('');
}
if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}) — worth checking:`);
  for (const message of warnings) console.log('  · ' + message);
  console.log('');
}
if (!errors.length && !warnings.length) console.log('Nothing to flag.');
if (errors.length) process.exitCode = 1;

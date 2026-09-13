/**
 * Plausibility audit for the imported dataset.
 *
 * Run with: npm run audit
 *
 * `check:data` proves the dataset is internally consistent — the derived views
 * agree with the rows, every key resolves. This asks a different question: does
 * the imported data look *believable*? It cannot know whether Bugha's birthday
 * is right, but it will catch a player who supposedly won a title at eleven, a
 * handle matched to the wrong person's earnings, a country with no region, or a
 * name so close to another that the two are probably one person split in half.
 *
 * These are the failure modes of importing by name from two sources that do not
 * share an id, so re-run it whenever a new source is merged in.
 *
 * ERROR = certainly wrong, fix it.  WARN = probably wrong, worth a look.
 */
import { loadDataset } from '@/data/repository';
import { COUNTRY_NAMES, REGION_BY_COUNTRY } from '@/data/fortnite/countries';
import { DATA_UPDATED_AT } from '@/data/types';

const errors: string[] = [];
const warnings: string[] = [];

const dataset = await loadDataset();
const { roster, events, entries } = dataset;

function ageOn(born: string, iso: string): number {
  const birth = new Date(born);
  const on = new Date(iso);
  let age = on.getFullYear() - birth.getFullYear();
  const monthDiff = on.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && on.getDate() < birth.getDate())) age--;
  return age;
}

// --- per player -----------------------------------------------------------
for (const player of roster) {
  if (!COUNTRY_NAMES[player.country]) {
    errors.push(`${player.name}: country code "${player.country}" has no display name`);
  }
  if (!REGION_BY_COUNTRY[player.country]) {
    warnings.push(`${player.name}: country "${player.country}" has no default region mapping`);
  }

  if (player.birthDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(player.birthDate)) {
      errors.push(`${player.name}: malformed birth date "${player.birthDate}"`);
    }
    const age = ageOn(player.birthDate, DATA_UPDATED_AT);
    if (age < 13) errors.push(`${player.name}: would be ${age} today`);
    else if (age > 35) warnings.push(`${player.name}: ${age} is old for this roster — check the birthday matched the right person`);

    // Epic's events are 13+; a title before that means the handle matched someone else.
    const first = dataset.careerOf(player)[0];
    if (first) {
      const ageAtFirst = ageOn(player.birthDate, first.event.date);
      if (ageAtFirst < 12) {
        errors.push(
          `${player.name}: would have been ${ageAtFirst} at ${first.event.shortName} — birthday probably matched the wrong player`,
        );
      }
    }
  }

  if (player.earningsKnown && player.earnings <= 0) {
    errors.push(`${player.name}: marked as having verified earnings but the total is ${player.earnings}`);
  }
  // A decorated player with no earnings figure means the handle did not match
  // Liquipedia's spelling, not that they played for free.
  if (!player.earningsKnown && player.fncsWins + player.majorWins >= 3) {
    warnings.push(
      `${player.name}: ${player.fncsWins + player.majorWins} titles but no earnings figure — check the Liquipedia handle`,
    );
  }

  const titles = player.fncsWins + player.majorWins;
  if (titles > 0 && player.results.length < titles) {
    errors.push(`${player.name}: ${titles} titles but only ${player.results.length} results`);
  }

  for (const stint of player.orgHistory) {
    if (stint.from && stint.from < '2017-01-01') {
      warnings.push(`${player.name}: org stint at ${stint.org} starts ${stint.from}, before competitive Fortnite`);
    }
  }
}

// --- likely duplicate people ---------------------------------------------
// Two sources spelling one handle differently is the main way a player gets
// split in two, so flag near-identical names that never share a tournament.
const normalise = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]/g, '');
for (let i = 0; i < roster.length; i++) {
  for (let j = i + 1; j < roster.length; j++) {
    const a = roster[i];
    const b = roster[j];
    const na = normalise(a.name);
    const nb = normalise(b.name);
    if (na === nb) {
      // Deliberate: a shared handle is tagged with a country, so only complain
      // when neither carries a tag.
      if (!a.name.includes('(') && !b.name.includes('(')) {
        errors.push(`${a.name} and ${b.name} normalise identically — name lookup will be ambiguous`);
      }
      continue;
    }
    if (na.length >= 5 && (na.startsWith(nb) || nb.startsWith(na)) && Math.abs(na.length - nb.length) <= 2) {
      if (a.country === b.country && dataset.eventsTogether(a, b) === 0) {
        warnings.push(`${a.name} / ${b.name}: near-identical names from ${a.country}, never teamed up — possibly one player`);
      }
    }
  }
}

// --- events ---------------------------------------------------------------
for (const event of events) {
  if (event.year < 2018 || event.year > new Date(DATA_UPDATED_AT).getFullYear()) {
    errors.push(`${event.name}: year ${event.year} is outside the competitive era`);
  }
  if (!event.date.startsWith(String(event.year))) {
    errors.push(`${event.name}: date ${event.date} does not match year ${event.year}`);
  }
  const expected = { solo: 1, duo: 2, trio: 3, squad: 4 }[event.format];
  for (const entry of dataset.entriesOf(event.id)) {
    if (entry.playerIds.length !== expected) {
      warnings.push(
        `${event.name}: a ${event.format} entry has ${entry.playerIds.length} player(s) — check the source row`,
      );
    }
    if (new Set(entry.playerIds).size !== entry.playerIds.length) {
      errors.push(`${event.name}: an entry lists the same player twice`);
    }
  }
}

// --- coverage worth knowing about -----------------------------------------
const orgCounts = new Map<string, number>();
for (const player of roster) {
  for (const stint of player.orgHistory) orgCounts.set(stint.org, (orgCounts.get(stint.org) ?? 0) + 1);
}
const singletons = [...orgCounts.entries()].filter(([, n]) => n === 1).map(([org]) => org);

console.log('--- audit ---');
console.log(`  players ${roster.length} · events ${events.length} · entries ${entries.length}`);
console.log(`  orgs on record: ${orgCounts.size}${singletons.length ? ` (${singletons.length} with a single player)` : ''}`);
console.log(`  players with no recorded result: ${roster.filter((p) => p.results.length === 0).length}`);
console.log(`  players with no birthday: ${roster.filter((p) => !p.birthDate).length}`);

if (errors.length) {
  console.log(`\n--- ${errors.length} ERROR(S) ---`);
  for (const error of errors.slice(0, 40)) console.log('  x ' + error);
  if (errors.length > 40) console.log(`  ... and ${errors.length - 40} more`);
}
if (warnings.length) {
  console.log(`\n--- ${warnings.length} WARNING(S) ---`);
  for (const warning of warnings.slice(0, 40)) console.log('  ? ' + warning);
  if (warnings.length > 40) console.log(`  ... and ${warnings.length - 40} more`);
}
if (!errors.length && !warnings.length) console.log('\nNothing looks wrong.');
process.exitCode = errors.length ? 1 : 0;

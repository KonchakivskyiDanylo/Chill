/**
 * Sanity check for the generated dataset.
 *
 * Run with: npm run check:data
 *
 * Two jobs. First, integrity: the derived views (results, teammates, title
 * counts, org history) must agree with the entry rows they are built from, and
 * every foreign key must resolve. Second, feasibility: each game draws its
 * puzzles from a pool, and this asserts the pools are big enough.
 *
 * It also prints coverage, because the dataset is deliberately incomplete —
 * sources publish winners and career totals, not full standings — and knowing
 * which fields are thin is what tells you where to point the next import.
 */
import { loadDataset } from '@/data/repository';
import { REGION_LABEL } from '@/data/types';
import { eligible as careerPathEligible } from '@/games/career-path/engine';
import { eligible as whoAreYaEligible } from '@/games/who-are-ya/engine';
import { eligible as wordleEligible } from '@/games/wordle/engine';

const problems: string[] = [];
const notes: string[] = [];
/** Places where two upstream sources disagree; reported, not failed. */
const upstreamConflicts: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) problems.push(message);
}

const dataset = await loadDataset();
const { roster, players, events, entries } = dataset;

notes.push(`players in roster: ${roster.length}`);
notes.push(`puzzle-eligible players: ${players.length}`);
notes.push(`events: ${events.length}`);
notes.push(`entries (rosters placed): ${entries.length}`);

// --- identity -------------------------------------------------------------
const ids = new Set(roster.map((p) => p.id));
check(ids.size === roster.length, 'duplicate player ids');

const wordleKeys = players.map((p) => p.name.toUpperCase().replace(/[^A-Z0-9]/g, ''));
const dupNames = wordleKeys.filter((k, i) => wordleKeys.indexOf(k) !== i);
check(dupNames.length === 0, `duplicate normalised names in the puzzle pool: ${[...new Set(dupNames)].join(', ')}`);

// --- referential integrity ------------------------------------------------
const eventIds = new Set(events.map((e) => e.id));
for (const entry of entries) {
  check(eventIds.has(entry.eventId), `entry ${entry.id}: unknown event ${entry.eventId}`);
  check(entry.playerIds.length > 0, `entry ${entry.id}: empty roster`);
  for (const playerId of entry.playerIds) {
    check(ids.has(playerId), `entry ${entry.id}: unknown player ${playerId}`);
  }
  const event = dataset.getEvent(entry.eventId);
  const expected = { solo: 1, duo: 2, trio: 3, squad: 4 }[event?.format ?? 'trio'];
  check(
    entry.playerIds.length <= expected,
    `entry ${entry.id}: ${entry.playerIds.length} players in a ${event?.format} event`,
  );
}

// --- derived views match the rows they come from --------------------------
for (const player of roster) {
  // results are exactly the entries this player appears in
  const fromEntries = entries.filter((e) => e.playerIds.includes(player.id));
  check(
    player.results.length === fromEntries.length,
    `${player.name}: ${player.results.length} results but appears in ${fromEntries.length} entries`,
  );

  const derivedFncs = fromEntries.filter(
    (e) => e.placement === 1 && dataset.getEvent(e.eventId)?.tier === 'fncs',
  ).length;
  check(derivedFncs === player.fncsWins, `${player.name}: fncsWins ${player.fncsWins} != entries ${derivedFncs}`);

  const derivedMajor = fromEntries.filter((e) => {
    const tier = dataset.getEvent(e.eventId)?.tier;
    return e.placement === 1 && tier !== undefined && tier !== 'fncs';
  }).length;
  check(derivedMajor === player.majorWins, `${player.name}: majorWins ${player.majorWins} != entries ${derivedMajor}`);

  // chronological ordering
  const dates = dataset.careerOf(player).map((e) => e.event.date);
  check(dates.every((d, i) => i === 0 || dates[i - 1] <= d), `${player.name}: results not chronological`);

  // teammate links are symmetric and match the shared entries
  for (const link of player.teammates) {
    const other = dataset.getPlayer(link.playerId);
    check(Boolean(other), `${player.name}: teammate ${link.playerId} missing`);
    if (!other) continue;
    const back = other.teammates.find((l) => l.playerId === player.id);
    check(
      back?.events === link.events,
      `${player.name}/${other.name}: asymmetric shared events (${link.events} vs ${back?.events})`,
    );
    const shared = fromEntries.filter((e) => e.playerIds.includes(other.id)).length;
    check(
      link.events === shared,
      `${player.name}/${other.name}: link says ${link.events} shared events, entries say ${shared}`,
    );
  }

  // earnings
  const yearSum = Object.values(player.earningsByYear).reduce((a, b) => a + b, 0);
  check(yearSum >= 0, `${player.name}: negative earnings in a year`);
  if (player.earningsKnown) {
    check(
      player.earnings > 0,
      `${player.name}: flagged as having verified earnings but the total is 0`,
    );
    // Liquipedia's all-time top-500 table and its per-year tables are built
    // from different tournament filters and disagree for a few players. Neither
    // is ours to correct, so surface it rather than failing the build.
    if (yearSum > player.earnings * 1.02 + 1) {
      upstreamConflicts.push(`${player.name}: years sum to ${yearSum}, career total says ${player.earnings}`);
    }
  }

  if (player.age !== null) {
    check(player.age > 10 && player.age < 45, `${player.name}: implausible age ${player.age}`);
  }

  // org history
  for (const stint of player.orgHistory) {
    check(Boolean(stint.org), `${player.name}: empty org name`);
    if (stint.from && stint.to) {
      check(stint.from <= stint.to, `${player.name}: org stint ${stint.org} ends before it starts`);
    }
  }
  // A player can be listed under a club and a sponsor at once; `team` is the
  // primary of those, and must be one of the open stints.
  const open = player.orgHistory.filter((s) => s.to === null);
  check(
    player.team === null ? open.length === 0 : open.some((s) => s.org === player.team),
    `${player.name}: team "${player.team}" is not among the open org stints`,
  );
}

// --- event invariants -----------------------------------------------------
for (const event of events) {
  const placements = dataset.entriesOf(event.id).map((e) => e.placement);
  check(
    new Set(placements).size === placements.length,
    `${event.name}: duplicate placements ${placements.join(',')}`,
  );
  check(dataset.winnersOf(event.id).length > 0, `${event.name}: no winner recorded`);
}

// --- coverage -------------------------------------------------------------
const pct = (n: number): string => `${Math.round((n / roster.length) * 100)}%`;
notes.push(`with a birthday: ${roster.filter((p) => p.birthDate).length} (${pct(roster.filter((p) => p.birthDate).length)})`);
notes.push(`with a real name: ${roster.filter((p) => p.realName).length} (${pct(roster.filter((p) => p.realName).length)})`);
notes.push(`with verified earnings: ${roster.filter((p) => p.earningsKnown).length} (${pct(roster.filter((p) => p.earningsKnown).length)})`);
notes.push(`with an org on record: ${roster.filter((p) => p.orgHistory.length).length} (${pct(roster.filter((p) => p.orgHistory.length).length)})`);
notes.push(`entries with prize money: ${entries.filter((e) => e.prize > 0).length} / ${entries.length}`);
const tiers = events.reduce<Record<string, number>>((acc, e) => {
  acc[e.tier] = (acc[e.tier] ?? 0) + 1;
  return acc;
}, {});
notes.push(`events by tier: ${Object.entries(tiers).map(([t, n]) => `${t}:${n}`).join(', ')}`);

// --- game feasibility -----------------------------------------------------
// Ask each game for its own pool rather than restating its rules here, so a
// threshold change in an engine shows up in this report instead of drifting.
const careerPathPool = careerPathEligible(dataset);
notes.push(`Career Path pool: ${careerPathPool.length}`);
check(careerPathPool.length >= 20, 'not enough eligible players for Career Path');

const whoAreYaPool = whoAreYaEligible(dataset);
notes.push(`Who Are Ya pool: ${whoAreYaPool.length}`);
check(whoAreYaPool.length >= 20, 'not enough eligible players for Who Are Ya');

const wordlePool = wordleEligible(players);
notes.push(`Wordle pool: ${wordlePool.length}`);
check(wordlePool.length >= 20, 'not enough eligible players for Wordle');

const fncsWinners = dataset.fncsWinners();
notes.push(`FNCS winners in the pool: ${fncsWinners.length}`);
check(fncsWinners.length >= 10, 'need 10+ FNCS winners for Tenaball "Top 10 FNCS wins"');

const majorWinners = dataset.winnersByTier(['lan', 'global', 'major']);
notes.push(`global/LAN/major winners: ${majorWinners.length}`);
check(majorWinners.length >= 4, 'need 4+ major winners for Tic Tac Toe');

const bigTeams = dataset.teams.filter((t) => dataset.byTeam(t).length >= 4);
notes.push(`orgs with 4+ current players: ${bigTeams.length}${bigTeams.length ? ` (${bigTeams.join(', ')})` : ''}`);

const bigCountries = dataset.countries.filter((c) => dataset.byCountry(c).length >= 4);
notes.push(
  `countries with 4+ players: ${bigCountries.length} (${bigCountries
    .map((c) => `${c}:${dataset.byCountry(c).length}`)
    .join(', ')})`,
);
check(bigCountries.length >= 4, 'need 4+ countries with four players for Connections');

const bigRegions = dataset.regions.filter((r) => dataset.byRegion(r).length >= 4);
notes.push(
  `regions with 4+ players: ${bigRegions.map((r) => `${REGION_LABEL[r]}:${dataset.byRegion(r).length}`).join(', ')}`,
);

const years = dataset.years;
notes.push(`earnings years: ${years[0]}-${years[years.length - 1]}`);
const thinYears = years.filter((year) => players.filter((p) => dataset.earningsIn(p, year) > 0).length < 10);
if (thinYears.length) {
  notes.push(`years with <10 earners (skipped by Tenaball): ${thinYears.join(', ')}`);
}
check(years.length - thinYears.length >= 3, 'need 3+ usable years for Tenaball "Earnings in a Year"');

for (const threshold of [500_000, 750_000, 1_000_000]) {
  const count = players.filter((p) => p.earnings >= threshold).length;
  notes.push(`players with $${threshold.toLocaleString('en-US')}+: ${count}`);
  check(count >= 4, `too few players above $${threshold}`);
}

const tenaballEvents = dataset.eventsWithParticipants(10);
notes.push(`events with 10+ recorded finishers (Tenaball/List pool): ${tenaballEvents.length}`);

const careerLengths = players.map((p) => p.results.length).sort((a, b) => a - b);
notes.push(
  `results per pooled player: min ${careerLengths[0]}, median ${careerLengths[Math.floor(careerLengths.length / 2)]}, max ${careerLengths[careerLengths.length - 1]}`,
);

// --- report ---------------------------------------------------------------
console.log('--- dataset summary ---');
for (const note of notes) console.log('  ' + note);
if (upstreamConflicts.length) {
  console.log(`
--- ${upstreamConflicts.length} upstream source conflict(s) ---`);
  for (const conflict of upstreamConflicts) console.log('  ~ ' + conflict);
}
if (problems.length) {
  console.log(`\n--- ${problems.length} PROBLEM(S) ---`);
  for (const problem of problems.slice(0, 40)) console.log('  ! ' + problem);
  if (problems.length > 40) console.log(`  ... and ${problems.length - 40} more`);
  process.exitCode = 1;
} else {
  console.log('\nAll invariants hold.');
}

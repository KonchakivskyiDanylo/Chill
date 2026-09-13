/**
 * Sanity check for the generated sample dataset.
 *
 * Run with: npm run check:data
 *
 * The games assume a number of invariants (unique placements, symmetric
 * teammate counts, big enough answer sets for the generated puzzles). This
 * script asserts them so a change to the roster cannot silently break a game.
 */
import { loadDataset } from '@/data/repository';
import { REGION_LABEL } from '@/data/types';

const problems: string[] = [];
const notes: string[] = [];

function check(condition: boolean, message: string): void {
  if (!condition) problems.push(message);
}

const dataset = await loadDataset();
const { players, events } = dataset;

notes.push(`players: ${players.length}`);
notes.push(`events: ${events.length}`);

// --- identity -------------------------------------------------------------
const ids = new Set(players.map((p) => p.id));
check(ids.size === players.length, 'duplicate player ids');
const wordleKeys = players.map((p) => p.name.toUpperCase().replace(/[^A-Z0-9]/g, ''));
const dupNames = wordleKeys.filter((k, i) => wordleKeys.indexOf(k) !== i);
check(dupNames.length === 0, `duplicate normalised names: ${[...new Set(dupNames)].join(', ')}`);
check(
  wordleKeys.every((k) => k.length >= 2 && k.length <= 12),
  'a player name normalises to an unusable Wordle length',
);

// --- per player invariants ------------------------------------------------
for (const player of players) {
  const yearSum = Object.values(player.earningsByYear).reduce((a, b) => a + b, 0);
  check(yearSum === player.earnings, `${player.name}: earningsByYear ${yearSum} != earnings ${player.earnings}`);
  check(player.earnings > 0, `${player.name}: no earnings`);
  check(player.results.length >= 3, `${player.name}: only ${player.results.length} major results`);
  check(player.teammates.length >= 10, `${player.name}: only ${player.teammates.length} teammates`);
  check(player.age !== null && player.age > 12 && player.age < 45, `${player.name}: implausible age ${player.age}`);

  const derivedWins = player.results.filter(
    (r) => dataset.getEvent(r.eventId)?.tier === 'fncs' && r.placement === 1,
  ).length;
  check(derivedWins === player.fncsWins, `${player.name}: fncsWins ${player.fncsWins} != results ${derivedWins}`);

  // chronological ordering
  const dates = dataset.careerOf(player).map((e) => e.event.date);
  check(
    dates.every((d, i) => i === 0 || dates[i - 1] <= d),
    `${player.name}: results not chronological`,
  );

  for (const link of player.teammates) {
    const other = dataset.getPlayer(link.playerId);
    check(Boolean(other), `${player.name}: teammate ${link.playerId} missing`);
    if (other) {
      const back = other.teammates.find((l) => l.playerId === player.id);
      check(
        back?.matches === link.matches,
        `${player.name}/${other.name}: asymmetric matches (${link.matches} vs ${back?.matches})`,
      );
    }
  }
}

// --- event invariants -----------------------------------------------------
let tiedEvents = 0;
for (const event of events) {
  const standings = dataset.standings(event.id);
  const placements = standings.map((s) => s.result.placement);
  if (new Set(placements).size !== placements.length) tiedEvents++;
  const winners = dataset.winnersOf(event.id);
  check(winners.length <= 2, `${event.name}: ${winners.length} winners`);
}
notes.push(`events with a shared placement (authored ties): ${tiedEvents}`);

// --- game feasibility -----------------------------------------------------
const tenaballTournaments = dataset.eventsWithParticipants(12);
notes.push(`events with 12+ participants (Tenaball/List pool): ${tenaballTournaments.length}`);
check(tenaballTournaments.length >= 5, 'not enough populated events for Tenaball');

const fncsWinners = dataset.fncsWinners();
notes.push(`FNCS winners: ${fncsWinners.length}`);
check(fncsWinners.length >= 10, 'need 10+ FNCS winners for Tenaball "Top 10 FNCS wins"');

const majorWinners = dataset.winnersByTier(['lan', 'global']);
notes.push(`major/LAN winners: ${majorWinners.length}`);
check(majorWinners.length >= 4, 'need 4+ major winners for Tic Tac Toe');

const bigTeams = dataset.teams.filter((t) => dataset.byTeam(t).length >= 4);
notes.push(`orgs with 4+ players: ${bigTeams.length} (${bigTeams.join(', ')})`);
check(bigTeams.length >= 6, 'need 6+ orgs with four players for Connections');

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
for (const year of years) {
  const earners = players.filter((p) => dataset.earningsIn(p, year) > 0);
  if (earners.length < 10) problems.push(`year ${year}: only ${earners.length} earners (Tenaball needs 10)`);
}

// Tic Tac Toe style feasibility: every (country x org) pair that has a player.
const earningsThresholds = [500_000, 750_000, 1_000_000];
for (const threshold of earningsThresholds) {
  const count = players.filter((p) => p.earnings >= threshold).length;
  notes.push(`players with $${threshold.toLocaleString('en-US')}+: ${count}`);
  check(count >= 4, `too few players above $${threshold}`);
}

const soloEvents = dataset.eventsWithParticipants(10, (e) => e.format === 'solo');
notes.push(`solo events with 10+ participants: ${soloEvents.length}`);

const careerLengths = players.map((p) => p.results.length).sort((a, b) => a - b);
notes.push(
  `major results per player: min ${careerLengths[0]}, median ${careerLengths[Math.floor(careerLengths.length / 2)]}, max ${careerLengths[careerLengths.length - 1]}`,
);

const pairsWith200 = players.filter((p) => p.teammates.some((t) => t.matches >= 200)).length;
notes.push(`players with a 200+ match teammate: ${pairsWith200}`);

// --- report ---------------------------------------------------------------
console.log('--- dataset summary ---');
for (const note of notes) console.log('  ' + note);
if (problems.length) {
  console.log(`\n--- ${problems.length} PROBLEM(S) ---`);
  for (const problem of problems.slice(0, 40)) console.log('  ! ' + problem);
  process.exitCode = 1;
} else {
  console.log('\nAll invariants hold.');
}

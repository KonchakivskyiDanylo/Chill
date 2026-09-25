import type { Facts, HeadlineEvent } from '@/data/liquipedia/facts';

/**
 * What the words mean.
 *
 * Every game leans on a handful of terms — a major, a LAN, a nationality —
 * that mean something narrower here than they do in conversation, and the
 * games left the reader to guess which. "Players who have won a LAN" refused
 * a DreamHack winner under a hint that did not say DreamHack was out; a player
 * with two nationalities could not tell which flag a country question would
 * use; nothing said that a "tournament" means every cash cup on Liquipedia.
 *
 * So each term is defined once, here, and shown wherever it is used: in a
 * game's "How to play" (`GameMeta.terms`), and under a Tenaball board or a
 * List prompt that mentions it (`termsIn`). Where the data can list the events
 * a term covers, it does, so the definition cannot drift from what the games
 * actually count.
 */

export type TermId =
  | 'tournament'
  | 'major'
  | 'lan'
  | 'lan-wide'
  | 'global'
  | 'fncs-title'
  | 'fncs-final'
  | 'nationality'
  | 'region'
  | 'org'
  | 'earnings'
  | 'age'
  | 'teammates'
  | 'field';

export interface EventList {
  names: string[];
  /** What the list leaves out, as one closing line — "and 178 regional grand finals". */
  more?: string;
}

export interface Term {
  id: TermId;
  name: string;
  text: string;
  /** The events the term covers, read from `facts.json` once it has loaded. */
  events?: (facts: Facts) => EventList;
}

const named = (events: HeadlineEvent[]): string[] =>
  [...events]
    .sort((a, b) => (a.date < b.date ? -1 : 1))
    .map((event) => (event.short.includes(String(event.year)) ? event.short : `${event.short} (${event.year})`));

/** A regional FNCS grand final: the online kind, one per region per round. */
const isRegional = (event: HeadlineEvent) => event.kind === 'fncs' && !event.lan;

export const TERMS: Record<TermId, Term> = {
  tournament: {
    id: 'tournament',
    name: 'Tournament',
    text:
      'Any Fortnite tournament Liquipedia has a page for: Epic’s own events, third-party cups, qualifiers and the weekly cash cups, online or offline. A count of tournaments played or won counts every one of them, from a $50 cup to the World Cup.',
  },
  major: {
    id: 'major',
    name: 'Major',
    text:
      'An Epic-run main event that Liquipedia rates tier 1, from the 2019 World Cup on: every regional FNCS grand final, every Global Championship, the World Cup finals and Epic’s other LANs. Qualifiers, showmatches, cash cups, console, mobile and Twitch events are not majors, and neither is a third-party event however big, or anything before the World Cup.',
    events: (facts) => {
      const regional = facts.events.filter(isRegional).length;
      return {
        names: named(facts.events.filter((event) => !isRegional(event))),
        more: `…and ${regional} regional FNCS grand finals, every region and season since 2019.`,
      };
    },
  },
  lan: {
    id: 'lan',
    name: 'LAN',
    text:
      'A major played offline, in front of a crowd. That is the strict meaning and every LAN question here uses it, except the one Tenaball board that says otherwise. DreamHack, Gamers8 and other offline events Epic did not run are not LANs here, and neither are the practice cash cups held at one.',
    events: (facts) => ({ names: named(facts.events.filter((event) => event.lan)) }),
  },
  'lan-wide': {
    id: 'lan-wide',
    name: 'LAN, on the “LAN wins” board',
    text:
      'That one board widens it to any offline main event in Liquipedia’s top two tiers, so DreamHack, Gamers8 and the Esports World Cup count alongside Epic’s own LANs.',
  },
  global: {
    id: 'global',
    name: 'Global Championship',
    text:
      'The events every region qualifies into: the 2019 World Cup finals, solo and duos, and the FNCS Global Championships held since 2023. A Globals is a title of its own — winning one does not add to a player’s FNCS wins.',
    events: (facts) => ({ names: named(facts.events.filter((event) => event.kind === 'global')) }),
  },
  'fncs-title': {
    id: 'fncs-title',
    name: 'FNCS win',
    text:
      'A regional FNCS grand final won — Europe, North America, Brazil and the rest, every season since 2019. The count is Wikipedia’s. The Global Championships, the 2022 Invitational and the 2026 Summit carry the FNCS name but are not FNCS wins, and “won an FNCS in 2026” means a regional final that year.',
  },
  'fncs-final': {
    id: 'fncs-final',
    name: 'FNCS grand finals played',
    text:
      'Every regional FNCS grand final a player reached, plus the FNCS events played offline: the Global Championships, the 2022 Invitational and the 2026 Summit. Qualifying heats and cash cups do not count.',
    events: (facts) => {
      const regional = facts.events.filter(isRegional).length;
      return {
        names: named(
          facts.events.filter((event) => !isRegional(event) && event.short.includes('FNCS')),
        ),
        more: `…and ${regional} regional grand finals.`,
      };
    },
  },
  nationality: {
    id: 'nationality',
    name: 'Nationality',
    text:
      'The first nationality on the player’s Liquipedia page — the flag shown beside their name. A player who lists two counts for the first one only: Peterbot, listed United States then Hungary, is American here and not Hungarian. England, Scotland and Wales are nations of their own when a player lists one of them first, so Cr1nge, listed Scotland then United Kingdom, is Scottish here and not British.',
  },
  region: {
    id: 'region',
    name: 'Region',
    text:
      'Where a player competes, as Liquipedia records it — not where they are from. There are six: Europe, North America (East and West together), South America (the FNCS’s Brazil region), Asia, Oceania and the Middle East.',
  },
  org: {
    id: 'org',
    name: 'Organisation',
    text:
      '“Has played for” means at any point on record, not only today. Counting the organisations in an event’s field uses each player’s current team, so a player without one counts for nobody.',
  },
  earnings: {
    id: 'earnings',
    name: 'Earnings',
    text:
      'Individual prize money recorded on Liquipedia, in US dollars — a team’s prize split between its players. “In 2026” is that calendar year. Salaries, creator deals and anything Liquipedia does not list are not included.',
  },
  age: {
    id: 'age',
    name: 'Age',
    text:
      'Age today, worked out from the player’s published birthday. A player with no birthday on record is left out of every age question rather than guessed.',
  },
  teammates: {
    id: 'teammates',
    name: 'Teammates',
    text:
      'Two players are teammates at a tournament when they share one result — a duo, trio or squad. Counts are tournaments entered together, across every tournament on record.',
  },
  field: {
    id: 'field',
    name: 'Qualified',
    text:
      'In the event’s field as Liquipedia lists it. An entrant with no Liquipedia player page cannot be an answer.',
  },
};

/**
 * The terms a board or list title leans on, in the order they are defined.
 *
 * Read off the words rather than tagged by hand, because there are three
 * hundred boards and lists and most of them are built by the notebook: a
 * title that says "LAN" needs the LAN definition whoever wrote it. `id` is
 * there for the one board whose LAN is the wide one, and for an event field's
 * boards and lists (`pool:…`), whose titles carry the event's name: every one
 * of them mentioned the Globals, so every one explained what a Globals is.
 */
export function termsIn(text: string, id = ''): TermId[] {
  const found = new Set<TermId>();
  const field = id.startsWith('pool:');
  const region = /\bby region\b|Europe|North America|South America|Brazil|\bAsia\b|Oceania|Middle East/i;
  if (field) found.add('field');
  if (/\bLANs?\b/.test(text)) found.add(id === 'lan-wins' ? 'lan-wide' : 'lan');
  // "Major 1 Summit" is an event's name, not the word.
  if (/\bmajors?\b(?! \d)/i.test(text)) found.add('major');
  if (!field && /Global Championship|World Cup|\bGlobals?\b/i.test(text)) found.add('global');
  if (/FNCS (wins?|titles?)|won (an|the|their region’s) FNCS|FNCS (grand final )?winners?|Won [A-Z]+ FNCS|finals won/i.test(text)) {
    found.add('fncs-title');
  }
  if (/FNCS (grand )?finals|FNCS Finals|grand finals (played|reached|qualified)/i.test(text) && !/finals won/i.test(text)) {
    found.add('fncs-final');
  }
  // "Qualifiers from Europe" is a region, "players from Poland" a nationality.
  const from = /\bfrom ([A-Z][\w ]+)/.exec(text);
  if (/countr|nation/i.test(text) || (from && !region.test(from[1]))) found.add('nationality');
  if (region.test(text)) found.add('region');
  if (/organi[sz]ation|played for|\borgs?\b/i.test(text)) found.add('org');
  if (/earn|\$|prize|money|payday/i.test(text)) found.add('earnings');
  if (/youngest|oldest|\bage\b|born/i.test(text)) found.add('age');
  if (/tournaments (played|won|entered)|tournaments? on record|every tournament|tournaments with/i.test(text)) {
    found.add('tournament');
  }
  if (/teammate|\bduos?\b|played together|entered together|queued|tournaments with [A-Z]/.test(text)) {
    found.add('teammates');
  }
  if (/qualif/i.test(text)) found.add('field');
  return (Object.keys(TERMS) as TermId[]).filter((term) => found.has(term));
}

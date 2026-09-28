import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { TermId } from './shared/glossary';
import { SHOW_STATUS } from './shared/pool';

/** A named block of rules, e.g. "Game modes". */
export interface RuleSection {
  title: string;
  items: string[];
}

export interface GameMeta {
  /**
   * Stable key. Local best scores and the "seen the rules" flag hang off it, so
   * renaming a game changes its `title` and `slug` and leaves this alone.
   */
  id: string;
  /** URL path segment. */
  slug: string;
  title: string;
  /** One-line pitch for the home page card. */
  tagline: string;
  icon: string;
  /**
   * Short bullets shown in the "How to play" card and modal. Optional: a game
   * that explains itself with `intro` and `sections` needs no flat list.
   */
  rules?: string[];
  /**
   * Opening paragraphs above the bullets, for games whose rules read better as
   * prose than as a list.
   */
  intro?: string[];
  /** Grouped rules shown under their own headings, below `rules`. */
  sections?: RuleSection[];
  /**
   * The terms this game leans on — a major, a LAN, a nationality — defined
   * under "What the words mean". See `games/shared/glossary.ts`.
   */
  terms?: TermId[];
  /**
   * Not ready to host: left off the home page and the side nav, and a
   * production build sends its address back home. A dev server still opens it
   * by URL, so it can be worked on; `check:games` still plays it. Delete the
   * flag to bring it back.
   */
  hidden?: boolean;
  Component: LazyExoticComponent<ComponentType>;
}

/**
 * Rules every game repeats, written once.
 *
 * Six of the ten share a setup step (see `components/PoolSetup`), so six
 * rules panels were about to say the same three paragraphs in three slightly
 * different ways. Higher or Lower and Tic Tac Toe left it for a single
 * Easy / Medium / Hard of their own (`LevelSetup`), and explain that instead.
 */
const POOL_SECTION: RuleSection = {
  title: 'Who you get asked about',
  items: [
    'Random 🎲 — anyone can come up, but it leans towards names you know: half the rounds are Easy-band players, a third Medium, the rest Hard. This is the default, and Start works without touching anything.',
    SHOW_STATUS
      ? 'Choose 🎛️ — narrow it by region, difficulty and whether the player is still competing. Whatever you pick is remembered, here and in every other game.'
      : 'Choose 🎛️ — narrow it by region and difficulty. Whatever you pick is remembered, here and in every other game.',
    'Region — play one region’s scene only. Difficulty is then ranked inside that region, so Easy means “well known in Asia”, not “well known worldwide”.',
    'Difficulty — Easy 🟢 is the names everyone knows, Medium 🟡 the regulars of the scene, Hard 🔴 the deep cuts.',
    ...(SHOW_STATUS ? ['Active, retired or everyone — the export says which players are still competing.'] : []),
  ],
};

export const GAMES: GameMeta[] = [
  {
    id: 'higher-lower',
    slug: 'higher-lower',
    title: 'Higher or Lower',
    tagline: 'Is the next player above or below? Keep the streak alive.',
    icon: '📈',
    intro: [
      'The goal is to decide whether the player on the right is higher or lower than the one on the left, on the category you picked.',
      'If you make the correct choice you score 1 point, the right-hand player slides across and a new one appears. Keep going and get the best score!',
    ],
    sections: [
      {
        title: 'Categories',
        items: [
          'Age — how old each player is today, from their published birthday.',
          'Career Earnings — every dollar of tournament prize money on record.',
          'FNCS Wins — FNCS grand finals won, across every season and region. Players with none are included.',
          'FNCS Finals — FNCS grand finals reached, the Globals and the other FNCS LANs included.',
        ],
      },
      {
        title: 'Difficulty',
        items: [
          'A run starts with famous players far apart. The longer it lasts, the less known the players and the closer their numbers.',
          'Easy gets harder slowly and Medium sooner. Hard gets there much quicker, and adds an Equal button.',
        ],
      },
      {
        title: 'Ties',
        items: [
          'Easy and Medium never deal two players on the same number, so one of Higher and Lower is always right.',
          'Hard does, and then only Equal is right — two players with no FNCS wins included.',
          'Age is compared in whole years: two 19-year-olds are level even with birthdays months apart.',
          'Career earnings are never dealt level.',
        ],
      },
    ],
    terms: ['earnings', 'age', 'fncs-title', 'fncs-final'],
    Component: lazy(() => import('./higher-lower/HigherLowerGame')),
  },
  {
    id: 'wordle',
    slug: 'fortnitedle',
    title: 'Fortnitedle',
    tagline: 'Guess the player’s name, letter by letter.',
    icon: '🟩',
    intro: [
      'Guess the competitive Fortnite player in 6 tries. After each guess the colour of the tiles changes to show how close your guess was to the player’s name.',
    ],
    rules: [
      'Spaces and punctuation are removed, capitalisation does not matter.',
      'Digits 0–9 count as characters and are on the keyboard.',
      'Any combination of letters and digits is allowed — it does not have to be a real player.',
      'Every player in the pool comes up once before any of them comes round again.',
    ],
    sections: [
      {
        title: 'Names with numbers in them',
        items: [
          'Digits are given away, never before your third guess and all of them by guess 5.',
          'Easy 🟢 shows the digit itself, Medium 🟡 only a # where it sits. Hard 🔴 and Random 🎲 show nothing at all.',
        ],
      },
      POOL_SECTION,
    ],
    terms: ['region'],
    Component: lazy(() => import('./wordle/WordleGame')),
  },
  {
    id: 'career-path',
    slug: 'career-path',
    title: 'Career Path',
    tagline: 'Name the player from their major results alone.',
    icon: '🗺️',
    intro: [
      'A secret player’s tournament results are revealed one at a time. Name them from the career alone.',
      'A wrong guess reveals the next clue, and running out of clues loses the round. The fewer clues you need, the better.',
    ],
    rules: [
      'Clues are majors only: Epic’s grand finals since the 2019 World Cup — regional FNCS finals, the Globals, the World Cup itself.',
      'Each clue is one tournament and where the player finished.',
      'Only players with at least five majors on record can be the answer.',
      'When the round ends, the clues you did not need turn face up, dimmed.',
    ],
    sections: [
      {
        title: 'Game modes',
        items: [
          'Order — ten results spread across the career, oldest first.',
          'Random — the same kind of ten, in no order.',
        ],
      },
      {
        title: 'Which ten',
        items: [
          'A mix of finishes — a win, a top 10, a 40th — with the bigger stages preferred.',
          'The first clues never give it away: no win or big podium in the first three for the best-known players.',
          'The ten fit only one player, except for thirteen who played every major beside the same partner. Name the partner and your next guess is the one.',
        ],
      },
      POOL_SECTION,
    ],
    terms: ['major', 'global', 'lan'],
    Component: lazy(() => import('./career-path/CareerPathGame')),
  },
  {
    id: 'who-are-ya',
    slug: 'who-are-ya',
    title: 'Who Are Ya?',
    tagline: 'Identify the player from the teammates they queue with.',
    icon: '🤝',
    intro: [
      'A secret player is picked, and the people they have entered tournaments with are revealed one at a time. Name the player from the company they keep.',
      'You may guess after every clue. The round ends on a correct guess or when the clues run out.',
    ],
    rules: [
      'Teammates are ranked by how many tournaments the pair entered together, across every tournament on record.',
      'A clue is a teammate who entered at least three tournaments with the answer. Only players with three such teammates and five majors can be the answer.',
      'When the round ends, the rest of the list turns face up with the counts.',
    ],
    sections: [
      {
        title: 'Clue order',
        items: [
          'Counts shown — fewest → most shared tournaments, with the number on each teammate.',
          'Counts hidden — the same order, without the numbers.',
          'Random order — no ramp-up, and the counts stay hidden. The top teammate is never one of the first four clues.',
          'Teammates on the same number of shared tournaments can come out in either order — the count is the clue, not the position.',
        ],
      },
      POOL_SECTION,
    ],
    terms: ['teammates', 'tournament'],
    Component: lazy(() => import('./who-are-ya/WhoAreYaGame')),
  },
  {
    id: 'tenaball',
    slug: 'tenaball',
    title: 'Tenaball',
    tagline: 'Find all ten players in a top 10.',
    icon: '🔟',
    intro: [
      'You get one leaderboard — "Top 10 by LAN earnings", "Top 10 countries by FNCS wins" — and ten empty slots. Name the ten.',
      'Correct answers lock into their real position, so the board fills in from wherever you happen to know it.',
    ],
    rules: [
      'Easy: unlimited guesses — just find all ten.',
      'Hard: 3 lives, and every wrong guess costs one.',
      'On a duos or trios board a slot is a whole team, and it locks once you have named everyone on it.',
      '“What counts here” under each board explains its words — which events are majors or LANs, whose nationality a dual national counts for.',
    ],
    sections: [
      {
        title: 'Categories',
        items: [
          'Nearly four hundred boards: players, regions, countries, tournaments, FNCS finals, organisations and paydays. Hit Random, or search for one.',
          'Not every board wants a player. Some want an organisation, a country or a tournament — the input says which.',
        ],
      },
      {
        title: 'Ties',
        items: [
          'Every board prints its tie rule above the slots. On a count, the bigger career earner ranks higher.',
          'If 10th and 11th are still level after the tie rule, the board is not offered.',
          'Naming the 11th is a near miss: it is called out, and it never costs a life.',
        ],
      },
    ],
    terms: [
      'tournament',
      'major',
      'lan',
      'lan-wide',
      'global',
      'fncs-title',
      'fncs-final',
      'nationality',
      'region',
      'org',
      'earnings',
      'age',
      'teammates',
    ],
    Component: lazy(() => import('./tenaball/TenaballGame')),
  },
  {
    id: 'list',
    slug: 'list',
    title: 'List',
    tagline: 'Name as many players as you can before the clock runs out.',
    icon: '⏱️',
    intro: [
      'One list, ninety seconds, and as many names as you can remember.',
      'Every correct name scores a point and adds 5 seconds, so a good run keeps extending itself.',
    ],
    rules: [
      'Repeating a name you already found does not count again.',
      'Easy: wrong answers cost nothing.',
      'Hard: every wrong answer takes 3 seconds off the clock.',
      'Name everyone on the list and you win straight away.',
      'When time runs out you see everyone you missed.',
      'The suggestion box helps you spell a name you already thought of — it never tells you whether that name is on the list.',
    ],
    sections: [
      {
        title: 'The lists',
        items: [
          'Nearly two hundred: an organisation’s players, FNCS winners by region or year, earnings thresholds, countries, the top earners’ teammates, and who played two events.',
          '“What counts here” under each list explains its words — which events are LANs or majors, whose nationality a dual national counts for.',
        ],
      },
    ],
    terms: [
      'field',
      'region',
      'nationality',
      'org',
      'fncs-title',
      'fncs-final',
      'major',
      'lan',
      'global',
      'earnings',
      'teammates',
    ],
    Component: lazy(() => import('./list/ListGame')),
  },
  {
    id: 'impostor',
    slug: 'griefer',
    title: 'Griefer',
    tagline: 'Spot the players who actually belong.',
    icon: '🕵️',
    intro: [
      'You get a rule — "has played for NRG", "has won a LAN" — and a board of ten players. Four to six of them fit the rule. The rest are griefers.',
      'Find the ones who fit.',
    ],
    rules: [
      'Cards show the player’s handle and nothing else: no flag, no org, no earnings.',
      'That is deliberate. A card carrying a Brazilian flag answers "competes in Brazil" for you, which made the old version a reading exercise rather than a knowledge one.',
      'Between four and six of the ten fit the rule, and the board never tells you how many. A stated count makes the last pick arithmetic instead of knowledge.',
    ],
    sections: [
      {
        title: 'Game modes',
        items: [
          'All at once — select everyone you think fits, then hit Check. The selection has to be exactly right.',
          'One by one — tap a player, then confirm. A correct pick continues; a griefer ends the round.',
          'The confirm step exists because a mis-tap used to end a round outright.',
        ],
      },
      {
        title: 'The rules you will see',
        items: [
          'Organisations — has played for a given org, at any point, not just today.',
          'Titles — has won an FNCS, a LAN, a global championship, or two or more FNCS titles.',
          'Career earnings above a threshold.',
          'Won their region’s FNCS — “has won the EU FNCS” — or won an FNCS in a given year. Regional finals only: a Globals is its own title and counts for neither.',
          'Played at a specific tournament — the globals and LANs, never a regional qualifier.',
          'Country and region — in the draw now that the cards carry no flags.',
        ],
      },
      POOL_SECTION,
    ],
    terms: ['org', 'fncs-title', 'lan', 'global', 'earnings', 'nationality', 'region'],
    // Hidden 26 Sep 2026: one of Griefer, Connections and Tic Tac Toe for now, and
    // Tic Tac Toe is the one kept. Griefer's griefers are random outsiders.
    hidden: true,
    Component: lazy(() => import('./impostor/ImpostorGame')),
  },
  {
    id: 'tic-tac-toe',
    slug: 'tic-tac-toe',
    title: 'Tic Tac Toe',
    tagline: 'Fill the grid with players who match both conditions.',
    icon: '⭕',
    intro: [
      'A 3×3 grid has a category on every row and every column. Fill each cell with a player who fits both.',
      'Type a player’s name and the grid places them. If they fit more than one cell, you tap which.',
    ],
    rules: [
      'A player who fits no open cell costs a life.',
      'Each player can be used once.',
      'The grid never offers a cell that would leave another with nobody left to fill it.',
    ],
    sections: [
      {
        title: 'Difficulty',
        items: [
          'Easy 🟢 — every cell has at least three names everyone knows. 3 lives.',
          'Medium 🟡 — every cell has at least two of the scene’s regulars. 3 lives.',
          'Hard 🔴 — a cell may have only one answer. 1 life.',
          'At every level, any player who fits is accepted.',
        ],
      },
      {
        title: 'Categories',
        items: [
          'Won EU FNCS, Won FNCS in 2023 — the regional FNCS finals. A Globals is not an FNCS win.',
          'Won FNCS with Peterbot — was on one of his FNCS-winning teams: Cold, Ritual, Pollo or Bylah.',
          'Top 3 at a LAN — a podium finish at any LAN in “What the words mean”.',
          'Won FNCS back to back — won two FNCS in a row, in any region.',
          'Played at an event — was in its field, whatever the result.',
        ],
      },
    ],
    terms: ['nationality', 'region', 'org', 'fncs-title', 'lan', 'global', 'major', 'earnings', 'age'],
    Component: lazy(() => import('./tic-tac-toe/TicTacToeGame')),
  },
  {
    id: 'connections',
    slug: 'connections',
    title: 'Connections',
    tagline: 'Sort 16 players into the 4 groups they belong to.',
    icon: '🧩',
    intro: [
      '16 players hide 4 groups of 4. Select four and submit; a correct group locks in and reveals what its connection was.',
      'You have 4 lives, and every wrong group costs one.',
    ],
    rules: [
      'A group is a country, a region, an organisation, a title — FNCS, LAN, major — or an earnings threshold. Nothing more obscure than that, and no birth years: nobody can tell a 2005 from a 2006.',
      'Every connection fits exactly its own four. If the group is Poland, there is no fifth Pole on the board — so there is exactly one way to split the sixteen.',
      'A wrong guess tells you when three of your four belonged to one group, and says nothing otherwise.',
      'Nothing otherwise is deliberate: two of any four landing in the same group is close to chance on a sixteen-card board, so reporting it every time buried the one hint worth reading.',
    ],
    sections: [POOL_SECTION],
    terms: ['nationality', 'region', 'org', 'fncs-title', 'lan', 'major', 'earnings'],
    // Hidden 26 Sep 2026 in favour of Tic Tac Toe; thin pools cannot build a board.
    hidden: true,
    Component: lazy(() => import('./connections/ConnectionsGame')),
  },
  {
    id: 'guess-the-player',
    slug: 'guess-the-player',
    title: 'Guess the Player',
    tagline: 'Narrow down the secret player attribute by attribute.',
    icon: '🎯',
    intro: [
      'Guess any player and you get a row of comparisons against the secret one. Use them to close in.',
      'You have 8 lives, and every wrong guess costs one.',
    ],
    rules: [
      'Green means a match, red means not. There is no in-between colour — the arrows already say which way to go.',
      'Columns: region, country, status, age, career earnings, FNCS wins, FNCS finals played, and whether your guess has played with the secret player.',
      'Together is green when the two have entered 10 or more tournaments as teammates. A red cell still shows how many they did play, if any.',
      'Career earnings always show a direction, because exact-matching a six-figure number would never land.',
      'You can guess anyone, not just players from the pool the secret was drawn from. A guess with no published birthday shows — for age.',
      'Only players with a published birthday and earnings figure can be the answer, so the secret never has a blank.',
    ],
    sections: [
      {
        title: 'Feedback style',
        items: [
          'Exact — age and the FNCS counts are simply right or wrong. Worth trying: competitive players sit in a narrow age band and FNCS counts are small.',
          'Direction — ▲ means the secret player is higher, ▼ lower, on every number.',
        ],
      },
      {
        title: 'Ties',
        items: [
          'A number level with the secret player’s is green in both styles — in Direction there is simply no arrow.',
          'Country compares the first nationality on each page, so a dual national matches only on the flag they list first.',
        ],
      },
      POOL_SECTION,
    ],
    terms: ['region', 'nationality', 'age', 'earnings', 'fncs-title', 'fncs-final', 'teammates'],
    // Hidden 26 Sep 2026: needs more than the columns it has before it is hosted.
    hidden: true,
    Component: lazy(() => import('./guess-the-player/GuessThePlayerGame')),
  },
];

/**
 * A game by its URL slug or its id.
 *
 * Both, because they can differ: a rename changes `slug` and leaves `id` alone
 * so local best scores survive it, and the game components ask for themselves
 * by id (`getGame('wordle')` inside Fortnitedle). Slug wins on a tie, so the
 * router always resolves to the game whose URL was actually requested, and a
 * link to a game's old slug — which is still its id — keeps working.
 */
/** The games players see — everything not `hidden`. */
export const VISIBLE_GAMES: GameMeta[] = GAMES.filter((game) => !game.hidden);

/** Whether a hidden game's page opens at all: on a dev server, yes; on the live site, no. */
export const OPEN_HIDDEN = import.meta.env?.DEV === true;

export function getGame(key: string): GameMeta | undefined {
  return GAMES.find((game) => game.slug === key) ?? GAMES.find((game) => game.id === key);
}

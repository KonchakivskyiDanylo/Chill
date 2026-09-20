import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

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
  Component: LazyExoticComponent<ComponentType>;
}

/**
 * Rules every game repeats, written once.
 *
 * Eight of the ten now share a setup step (see `components/PoolSetup`), so
 * eight rules panels were about to say the same three paragraphs in three
 * slightly different ways.
 */
const POOL_SECTION: RuleSection = {
  title: 'Who you get asked about',
  items: [
    'Full roster — every player in the export, narrowed three ways below.',
    'An event pool — the field that qualified for one tournament, such as the FNCS Globals or the Esports World Cup. A pool is a fixed list of players, so region, difficulty and status do not apply to it.',
    'Region — play one region’s scene only. Difficulty is then ranked inside that region, so Easy means “well known in Asia”, not “well known worldwide”.',
    'Difficulty — Easy 🟢, Medium 🟡 and Hard 🔴 are bands of career earnings, and each card tells you the band it covers. Random 🎲 ignores the bands entirely.',
    'Active, retired or everyone — the export says which players are still competing.',
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
          'FNCS Wins — FNCS grand finals won, across every season and region. Players on nought are included, because “a name you know on one title against a name you do not” is the best round this category has.',
        ],
      },
      {
        title: 'How the pairs are picked',
        items: [
          'Not at random. The challenger is chosen so the gap between the two values is about as wide as the round is aiming for.',
          'That target narrows as your streak grows, so a run gets harder the longer it survives rather than asking the same question fifty times.',
          'It also narrows with difficulty: Easy opens on pairs that are obvious, Hard on pairs that are nearly level.',
          'Which is why you will not get a 1-versus-5 on round thirty any more.',
        ],
      },
      {
        title: 'Difficulty',
        items: [
          'Hard is the only level with an Equal button. Use it when the two values match exactly.',
          'On Easy, Medium and Random there is no Equal button, so two matching values accept either answer.',
        ],
      },
      POOL_SECTION,
    ],
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
          'A digit is the one thing in this game you cannot reason your way to: a letter tile tells you something every round, a digit tells you nothing until you happen to try it.',
          'So they are given away, slowly. A name with one digit reveals it after your third guess; two digits appear after the second and the fourth; three after the first, third and fourth.',
          'The strip under the grid shows the shape of the name with the revealed digits already in position.',
          'Names that are mostly numbers hand over the first digit immediately — they are not words with a digit in them.',
        ],
      },
      POOL_SECTION,
    ],
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
      'You get one guess per revealed clue, so guessing early scores better — and every clue you take is one you cannot get back.',
    ],
    rules: [
      'Clues are majors only: the Epic-run grand finals since the 2019 World Cup — FNCS regionals, the Globals, the World Cup itself.',
      'Each clue is one tournament and where the player finished.',
      'Only players with at least five majors on record can be the answer.',
      'Get it right and the whole career is revealed, not just the ten clues you were shown.',
    ],
    sections: [
      {
        title: 'Game modes',
        items: [
          'Order — ten results telling the career as a story: the first major they ever reached, the most recent, and the best result from each stretch in between.',
          'That gives you an arc — 2019 → 2020 → 2022 → 2024 → 2026 — rather than ten results from whichever eighteen months the player happened to peak in.',
          'Random — ten results drawn at random from the whole career, in no order at all. No arc to read, just ten facts. Genuinely harder.',
        ],
      },
      POOL_SECTION,
    ],
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
      'Teammates are ranked by how many tournaments the pair entered together, counted across every tournament in the export.',
      'A pair counts once per result they share, so two solo players at the same event are not teammates.',
      'The answer needs at least three recorded teammates and five tournaments on record.',
      'Get it right and every teammate on record is revealed, with the counts.',
    ],
    sections: [
      {
        title: 'Clue order',
        items: [
          'Counts shown — fewest → most shared tournaments, with the number on each teammate.',
          'Counts hidden — the same order, without the numbers.',
          'Random order — no ramp-up, and the counts stay hidden.',
        ],
      },
      POOL_SECTION,
    ],
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
      'Hard: you start with 3 lives and every wrong guess costs one.',
      'Ties are handled per category, and the board says which rule is in play above the ten slots.',
      'Naming someone level with 10th but ranked out by the tie rule is a near miss: it is called out, and it never costs a life.',
    ],
    sections: [
      {
        title: 'Categories',
        items: [
          'Over two hundred boards, grouped: players, regions, countries, tournaments, organisations.',
          'Some are about the whole career — earnings, FNCS wins, LAN appearances. Some are about one year, one region, one country or one tournament.',
          'Not every board wants a player. An organisations board wants org names and a countries board wants country names — the prompt above the input says which.',
          'Hit Random for a board you did not choose, or search the list if you have one in mind.',
        ],
      },
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
      'When time runs out you see everyone you missed.',
      'The suggestion box helps you spell a name you already thought of — it never tells you whether that name is on the list.',
    ],
    sections: [
      {
        title: 'The lists',
        items: [
          'Qualified fields — everyone who made it to the FNCS Globals, or to the Esports World Cup.',
          'FNCS grand final winners, split by region, because Europe’s winners and North America’s are two different memories.',
          'LAN winners — anyone who has won an offline tournament in the top two tiers.',
        ],
      },
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
      'You get a rule — "has played for NRG", "has won a LAN" — and a board of players. Two or three of them fit the rule. The rest are griefers.',
      'Find the ones who fit.',
    ],
    rules: [
      'Cards show the player’s handle and nothing else: no flag, no org, no earnings.',
      'That is deliberate. A card carrying a Brazilian flag answers "competes in Brazil" for you, which made the old version a reading exercise rather than a knowledge one.',
      'Rules are never about country or region, for the same reason — those are the two facts you could guess from a handle.',
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
          'Won a title in a given region, or in a given year.',
          'Played at a specific tournament — the globals and LANs, never a regional qualifier.',
        ],
      },
      POOL_SECTION,
    ],
    Component: lazy(() => import('./impostor/ImpostorGame')),
  },
  {
    id: 'tic-tac-toe',
    slug: 'tic-tac-toe',
    title: 'Tic Tac Toe',
    tagline: 'Fill the grid with players who match both conditions.',
    icon: '⭕',
    intro: [
      'A 3×3 grid has a category on every row and every column. Each cell needs a player who satisfies both.',
      'You do not pick the cell. Type a player’s name and the grid works out where they belong.',
    ],
    sections: [
      {
        title: 'Where your player lands',
        items: [
          'Fits no open cell — rejected, and on Easy that costs a mistake.',
          'Fits exactly one cell — placed there automatically.',
          'Fits several cells, but is the only possible answer to one of them — placed there. Put "World Cup winner × United States" on a board and type Bugha: he is the only person who fits it, so that is obviously where he goes.',
          'Fits several cells and is not the sole answer to any — the grid highlights your options and you tap one.',
        ],
      },
      {
        title: 'Difficulty',
        items: [
          'Easy 🟢 — unlimited guesses, and three wrong answers end the board.',
          'Hard 🔴 — nine guesses, one per cell. Every single one has to land.',
        ],
      },
      {
        title: 'Other rules',
        items: [
          'Every player may only be used once on the board.',
          'Boards are generated and checked, so all nine cells can always be filled with nine different players.',
          'A player who fits a cell but would strand another cell is refused rather than allowed to soft-lock the board — and it does not cost you anything.',
          'Cells show the handle alone, for the same reason Griefer does.',
        ],
      },
      POOL_SECTION,
    ],
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
      'You have four lives, shown as hearts. Every wrong group costs one.',
    ],
    rules: [
      'Groups can be an organisation, a title, an earnings threshold, a year, a tournament they played, or the teammates of one player.',
      'Every player belongs to exactly one of the four groups — the generator draws each from the pool that fits its group and none of the others.',
      'A wrong guess tells you how many of your four belonged to a single group.',
      'That is more use than the usual “one away”, which stays silent on the two-and-two guess that means you have merged two groups.',
    ],
    sections: [POOL_SECTION],
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
      'You have 8 guesses.',
    ],
    rules: [
      'Green means an exact match, red means no match, amber means close.',
      'Region, country and status are always simply right or wrong — except country, which goes amber when you have the right region.',
      'Career earnings always show a direction and a proximity band, because exact-matching a six-figure number would never land.',
      'Only players with a published birthday and earnings figure can be the answer, so no column is ever blank.',
    ],
    sections: [
      {
        title: 'Feedback style',
        items: [
          'Exact — age and FNCS wins are simply right or wrong. Worth trying: competitive players sit in a narrow age band and FNCS counts are small.',
          'Direction — ▲ means the secret player is higher, ▼ lower. Amber means within 2 years, 1 title, or 20% of the earnings.',
        ],
      },
      POOL_SECTION,
    ],
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
export function getGame(key: string): GameMeta | undefined {
  return GAMES.find((game) => game.slug === key) ?? GAMES.find((game) => game.id === key);
}

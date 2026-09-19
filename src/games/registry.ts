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
  /**
   * False for games that read their own data instead of the shared dataset, so
   * the app does not make them wait on a load they never use.
   */
  needsDataset?: boolean;
  Component: LazyExoticComponent<ComponentType>;
}

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
          'FNCS Wins — FNCS grand finals won, across every season and region. Only players who have won at least one appear, and matching totals are common.',
        ],
      },
      {
        title: 'Game modes',
        items: [
          'Easy 🟢 — the names everyone knows: World Cup and FNCS champions, the game’s biggest earners.',
          'Medium 🟡 — regulars of the competitive scene: known if you watch, not household names.',
          'Hard 🔴 — deep cuts, and the only mode with an Equal button. Use it when the two values match exactly.',
          'On Easy and Medium there is no Equal button, so two matching values accept either answer.',
        ],
      },
    ],
    needsDataset: false,
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
        title: 'Region',
        items: [
          'Pick a region first, or All regions to play the whole roster.',
          'A region also changes what the levels mean: they are ranked inside that region, so Easy is “well known in Asia”, not “well known worldwide”.',
          'The card for each region shows how many players it can ask you about.',
        ],
      },
      {
        title: 'Difficulty',
        items: [
          'Easy 🟢 — the names everyone knows: World Cup and FNCS champions, the game’s biggest earners.',
          'Medium 🟡 — regulars of the competitive scene: known if you watch, not household names.',
          'Hard 🔴 — deep cuts, regional winners and one-off qualifiers only the scene remembers.',
          'Pick a level before you start, or switch it on the board — switching deals a new secret player.',
        ],
      },
    ],
    Component: lazy(() => import('./wordle/WordleGame')),
  },
  {
    id: 'career-path',
    slug: 'career-path',
    title: 'Career Path',
    tagline: 'Name the player from their major results alone.',
    icon: '🗺️',
    rules: [
      'Clues are majors only: the Epic-run grand finals since the 2019 World Cup — FNCS regionals, the Globals, the World Cup itself.',
      'Each clue is one tournament and where the player finished.',
      'The path starts at the first major they actually reached and ends at their most recent.',
      'Only players with at least five majors on record can be the answer.',
      'You get one guess per revealed clue — guess early for a better score.',
    ],
    sections: [
      {
        title: 'Difficulty',
        items: [
          'Easy 🟢 / Medium 🟡 / Hard 🔴 pick how well known the secret player is, not how the clues work.',
          'Every player at the chosen level comes up once before any of them comes round again.',
        ],
      },
      {
        title: 'Game modes',
        items: [
          'Order — results appear oldest to newest, the way the career ran.',
          'Random — the same results in a random order. Much harder to read.',
        ],
      },
    ],
    needsDataset: false,
    Component: lazy(() => import('./career-path/CareerPathGame')),
  },
  {
    id: 'who-are-ya',
    slug: 'who-are-ya',
    title: 'Who Are Ya?',
    tagline: 'Identify the player from the teammates they queue with.',
    icon: '🤝',
    rules: [
      'A secret player is picked. The teammates they have entered tournaments with are revealed one at a time.',
      'Teammates are ranked by how many tournaments the pair entered together, counted across every tournament in the export.',
      'Only players with at least three recorded teammates can be the answer.',
      'You may guess after every clue. The game ends on a correct guess or when the clues run out.',
    ],
    sections: [
      {
        title: 'Difficulty',
        items: [
          'Easy 🟢 / Medium 🟡 / Hard 🔴 pick how well known the secret player is, not how the clues work.',
          'Every player at the chosen level comes up once before any of them comes round again.',
        ],
      },
      {
        title: 'Clue order',
        items: [
          'Counts shown — fewest → most shared tournaments, with the number on each teammate.',
          'Counts hidden — the same order, without the numbers.',
          'Random order — no ramp-up, and the counts stay hidden.',
        ],
      },
    ],
    needsDataset: false,
    Component: lazy(() => import('./who-are-ya/WhoAreYaGame')),
  },
  {
    id: 'tenaball',
    slug: 'tenaball',
    title: 'Tenaball',
    tagline: 'Find all ten players in a top 10.',
    icon: '🔟',
    rules: [
      'You get one category, such as "Top 10 by career earnings".',
      'Type player names one at a time to fill the ten slots.',
      'Correct answers lock into their real position in the ranking.',
      'Easy: unlimited guesses — just find all ten.',
      'Hard: you start with 3 lives and every wrong guess costs one.',
      'Ties are handled per category, and the board says which rule is in play above the ten slots.',
      'Naming a player who is level with 10th but ranked out by the tie rule is a near miss: it is called out, and it never costs a life.',
    ],
    Component: lazy(() => import('./tenaball/TenaballGame')),
  },
  {
    id: 'list',
    slug: 'list',
    title: 'List',
    tagline: 'Name as many players as you can before the clock runs out.',
    icon: '⏱️',
    rules: [
      'You get one criterion and 90 seconds.',
      'Type player names one at a time.',
      'Every correct, new name scores a point and adds 5 seconds.',
      'Repeating a name you already found does not count again.',
      'Easy: wrong answers cost nothing.',
      'Hard: every wrong answer takes 3 seconds off the clock.',
      'When time runs out you see the full answer set.',
    ],
    Component: lazy(() => import('./list/ListGame')),
  },
  {
    id: 'impostor',
    slug: 'griefer',
    title: 'Griefer',
    tagline: 'Spot the players who do not belong.',
    icon: '🕵️',
    rules: [
      'You get a rule, for example "plays for NRG", and a group of players.',
      'Most of them fit the rule. The griefers do not.',
      'All at once: select every griefer you can see, then hit Check. One mistake loses the round.',
      'One by one: click griefers one at a time. A correct pick continues, a wrong pick ends the round.',
    ],
    Component: lazy(() => import('./impostor/ImpostorGame')),
  },
  {
    id: 'tic-tac-toe',
    slug: 'piece-control',
    title: 'Piece Control',
    tagline: 'Fill the grid with players who match both conditions.',
    icon: '⭕',
    rules: [
      'A 3×3 grid has a category on every row and every column.',
      'Each cell needs a player who satisfies both that row and that column.',
      'Every player may only be used once on the board.',
      'Boards are generated and checked, so every cell always has at least one valid answer.',
      'Fill all nine cells to win.',
    ],
    Component: lazy(() => import('./tic-tac-toe/TicTacToeGame')),
  },
  {
    id: 'connections',
    slug: 'connections',
    title: 'Connections',
    tagline: 'Sort 16 players into the 4 groups they belong to.',
    icon: '🧩',
    rules: [
      '16 players hide 4 groups of 4.',
      'Select four players and submit. A correct group locks in and reveals its connection.',
      'Groups can be country, region, org, tournament winners, teammates and similar links.',
      'You have 4 mistakes before the board is revealed.',
    ],
    Component: lazy(() => import('./connections/ConnectionsGame')),
  },
  {
    id: 'guess-the-player',
    slug: 'guess-the-player',
    title: 'Guess the Player',
    tagline: 'Narrow down the secret player attribute by attribute.',
    icon: '🎯',
    rules: [
      'Guess any player. You get a comparison on region, country, age, career earnings and FNCS wins.',
      'Green means an exact match, red means no match.',
      'Exact mode: age and FNCS wins are simply right or wrong.',
      'Direction mode: an arrow shows whether the secret player is higher or lower, and how close you are.',
      'Career earnings always use direction and proximity.',
      'You have 8 guesses.',
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

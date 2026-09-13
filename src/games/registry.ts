import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

export interface GameMeta {
  id: string;
  /** URL path segment. */
  slug: string;
  title: string;
  /** One-line pitch for the home page card. */
  tagline: string;
  icon: string;
  /** Short bullets shown in the "How to play" card and modal. */
  rules: string[];
  Component: LazyExoticComponent<ComponentType>;
}

export const GAMES: GameMeta[] = [
  {
    id: 'higher-lower',
    slug: 'higher-lower',
    title: 'Higher or Lower',
    tagline: 'Is the next player above or below? Keep the streak alive.',
    icon: '📈',
    rules: [
      'Two players are shown. One value is revealed, the other is hidden.',
      'Higher means the hidden player’s value is greater than the shown one.',
      'Lower means the hidden player’s value is smaller than the shown one.',
      'Easy: only Higher and Lower. If the two values are equal, both answers are accepted.',
      'Hard: you also get an Equal button, and you must use it when the values match exactly.',
      'One mistake ends the run. Players never repeat inside a run.',
    ],
    Component: lazy(() => import('./higher-lower/HigherLowerGame')),
  },
  {
    id: 'wordle',
    slug: 'wordle',
    title: 'Wordle',
    tagline: 'Guess the player’s name, letter by letter.',
    icon: '🟩',
    rules: [
      'One secret player is chosen. Guess their name in 6 tries.',
      'Green: right character in the right spot.',
      'Yellow: the character is in the name but somewhere else.',
      'Grey: the character is not in the name at all.',
      'Spaces and punctuation are removed, capitalisation does not matter.',
      'Digits 0–9 count as characters and are on the keyboard.',
      'Any combination of letters and digits is allowed — it does not have to be a real player.',
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
      'Clues are major results only: FNCS Grand Finals, global championships and major LANs.',
      'Each clue is one tournament and the placement the player got there.',
      'The path starts at the first major event the player actually reached.',
      'It ends at their most recent major result in the dataset.',
      'Order mode reveals results oldest to newest. Random mode reveals them in any order.',
      'You get one guess per revealed clue — guess early for a better score.',
    ],
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
      'Teammates are ranked by how many tournaments the pair entered together.',
      'Easy: teammates come fewest → most shared tournaments, with the count shown.',
      'Hard: same order, counts hidden.',
      'Random: random order, counts hidden.',
      'You may guess after every clue. The game ends on a correct guess or when the clues run out.',
    ],
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
      'How ties are handled depends on the category; each category states its rule.',
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
    slug: 'impostor',
    title: 'Impostor',
    tagline: 'Spot the players who do not belong.',
    icon: '🕵️',
    rules: [
      'You get a rule, for example "plays for NRG", and a group of players.',
      'Most of them fit the rule. The impostors do not.',
      'All at once: select every impostor you can see, then hit Check. One mistake loses the round.',
      'One by one: click impostors one at a time. A correct pick continues, a wrong pick ends the round.',
    ],
    Component: lazy(() => import('./impostor/ImpostorGame')),
  },
  {
    id: 'tic-tac-toe',
    slug: 'tic-tac-toe',
    title: 'Tic Tac Toe',
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

export function getGame(slug: string): GameMeta | undefined {
  return GAMES.find((game) => game.slug === slug);
}

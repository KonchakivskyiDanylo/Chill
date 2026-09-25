import { lazy, type ComponentType, type LazyExoticComponent } from 'react';
import type { TermId } from './shared/glossary';

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
    'Choose 🎛️ — narrow it by region, difficulty and whether the player is still competing. Whatever you pick is remembered, here and in every other game.',
    'Region — play one region’s scene only. Difficulty is then ranked inside that region, so Easy means “well known in Asia”, not “well known worldwide”.',
    'Difficulty — Easy 🟢, Medium 🟡 and Hard 🔴 are bands of career earnings, and each card tells you the band it covers.',
    'Active, retired or everyone — the export says which players are still competing.',
  ],
};

/**
 * The event mode, explained in the games it changes.
 *
 * Separate from `POOL_SECTION` because it is not a setting on this screen: it
 * is chosen on the home page and shown in the header, and while it is on the
 * section above does not apply at all.
 */
const MODE_SECTION: RuleSection = {
  title: 'Event mode',
  items: [
    'On the home page you can swap the whole scene for one tournament’s field — the FNCS Globals, the Esports World Cup.',
    'Every game then draws from that field and nothing else, and says so in the header until you leave it.',
    'A field is a fixed list of players, so the region, fame and status choices do not apply to it: eighty players is already the narrowest these games can run on. A game’s own Easy / Medium / Hard still does.',
  ],
};

/**
 * The event mode in the four games with one secret player, which deal a field
 * differently from the rest — see `dealInTurn`.
 */
const MODE_SECTION_SECRET: RuleSection = {
  title: MODE_SECTION.title,
  items: [
    ...MODE_SECTION.items,
    'The secret player comes from each of the field’s regions in turn, so every region is on the screen every few rounds — the four players the Middle East sent come up as often as Europe’s forty-six.',
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
          'FNCS Finals — FNCS grand finals reached, the Globals and the other FNCS LANs included. Only players who have reached one are in, so a shown number can always go either way.',
        ],
      },
      {
        title: 'How the pairs are picked',
        items: [
          'Who: every player is ranked by career earnings. Round one is two of the top 20, and each round lets the challenger come from a little further down — so a run opens on names you know and reaches the deep cuts only if it lasts.',
          'How close: the gap between the two values follows a schedule, four rounds per step — 🟢 obvious, 🟡 moderate, 🟠 close, 🔴 very close.',
          'For earnings a step is a share of the bigger figure: obvious is one player on half the other’s money or less, very close is within 10%. For age it is years (6+ apart down to 0–1), for FNCS wins titles (3+ down to 0–1), and for FNCS finals whole finals (8+ down to 0–1).',
          'Which is why you will not get a 1-versus-5 on round thirty.',
          'Which way: the answer is drawn before the player, Higher and Lower about equally often whatever the last one was. Guessing the opposite of last time will not carry a run — knowing the players will.',
          'In an event mode the new player leans towards the region the run has shown least, so a Globals run is not all Europe and North America.',
        ],
      },
      {
        title: 'Difficulty',
        items: [
          'Easy 🟢🟢🟡🟡🟠🔴 — the slowest schedule, and it never leaves the top 250 earners.',
          'Medium 🟢🟡🟡🟠🔴🔴 — close pairs from round 13, reaching the top 1,000.',
          'Hard 🟢🟡🟠🔴🔴🔴 — very close from round 13, anyone on record, and an Equal button.',
        ],
      },
      {
        title: 'Ties',
        items: [
          'Easy and Medium never deal two players on the same number, so one of Higher and Lower is always right.',
          'Hard does, and only Equal is right for them — two players who have never won an FNCS included.',
          'Age is compared in whole years: two 19-year-olds are level even with birthdays months apart.',
          'Career earnings are never dealt level. Two careers equal to the dollar would be a coincidence nobody could know.',
        ],
      },
      MODE_SECTION,
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
          'A digit is the one thing in this game you cannot reason your way to: a letter tile tells you something every round, a digit tells you nothing until you happen to try it.',
          'So they are given away, but never before your third guess. One digit arrives after guess 3; two after 3 and 4; three after 3, 4 and 5. Anything more comes out by guess 5.',
          'Until the first one lands, nothing is shown at all — a strip of blanks would give away both the length of the name and the fact that it has a digit in it.',
          'When a digit does arrive it appears in position under the grid, and its key turns green on the keyboard.',
        ],
      },
      POOL_SECTION,
      MODE_SECTION_SECRET,
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
      'You get one guess per revealed clue, so guessing early scores better — and every clue you take is one you cannot get back.',
    ],
    rules: [
      'Clues are majors only: the Epic-run grand finals since the 2019 World Cup — FNCS regionals, the Globals, the World Cup itself.',
      'Each clue is one tournament and where the player finished.',
      'Only players with at least five majors on record can be the answer.',
      'Get it right and the rest of the ten clues turn face up, dimmed, so you can see what you would have been shown next.',
    ],
    sections: [
      {
        title: 'Game modes',
        items: [
          'Order — ten results read oldest first, spread across the whole career, so you get an arc — 2019 → 2021 → 2024 → 2026 — rather than one good year.',
          'Random — the same kind of ten, in no order at all. No arc to read, just ten facts.',
        ],
      },
      {
        title: 'Which ten',
        items: [
          'Not the ten best. A hand mixes finishes — a win, a top 10, a 40th — rather than five 1sts in a row that only say “a winner”.',
          'Bigger stages are preferred: a Globals or a World Cup placing over a small regional final.',
          'The ten describe exactly one player whenever the career allows it: a duo partner who stood beside them at every one of those events is ruled out by at least one result they did not share.',
          'The exception is the thirteen players who never played a major without the same partner — the clues fit the partner too, so if you name the partner, the next guess is the one.',
          'The opening does not give it away. For the best-known players the first three clues are never a win or a podium on a $1M stage; for regulars the first two. The deep cuts get their big results early, because nobody could name them otherwise.',
          'A career of ten majors or fewer is shown whole — there is nothing to choose — so in Order it reads oldest first whatever it opens on. Random still keeps the big results out of the opening.',
          'The same player is dealt a different ten the next time they come round.',
        ],
      },
      POOL_SECTION,
      MODE_SECTION_SECRET,
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
      'Teammates are ranked by how many tournaments the pair entered together, counted across every tournament in the export.',
      'A pair counts once per result they share, so two solo players at the same event are not teammates.',
      'Ten clues are drawn from up to fifty teammates, spread across the whole list — so the same player deals a different hand each time. The number one teammate is always one of them.',
      'The answer needs at least three recorded teammates and five tournaments on record.',
      'Get it right and the rest of the clue list turns face up, dimmed, with the counts shown.',
    ],
    sections: [
      {
        title: 'Clue order',
        items: [
          'Counts shown — fewest → most shared tournaments, with the number on each teammate.',
          'Counts hidden — the same order, without the numbers.',
          'Random order — no ramp-up, and the counts stay hidden.',
          'Teammates on the same number of shared tournaments can come out in either order — the count is the clue, not the position.',
        ],
      },
      POOL_SECTION,
      MODE_SECTION_SECRET,
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
      'Hard: you start with 3 lives and every wrong guess costs one.',
      'A tournament board ranks the finishing positions, so on a duos or trios event a slot is a whole team — it fills in as you name them and only locks once you have every one.',
      'Under every board, “What counts here” says what its words mean — which events are majors, which are LANs, whose nationality a dual national counts for.',
    ],
    sections: [
      {
        title: 'Categories',
        items: [
          'Nearly three hundred boards, grouped: players, regions, countries, tournaments, organisations, paydays.',
          'Some are about the whole career — earnings, FNCS wins, LAN appearances. Some are about one year, one region, one country or one tournament.',
          'Not every board wants a player. An organisations board wants org names, a countries board wants country names, and a paydays board wants the tournament where the money was won — the prompt above the input says which.',
          'Hit Random for a board you did not choose, or search the list if you have one in mind.',
          'In an event mode all of them are replaced by that field’s own boards, under one heading and in a fixed order: career earnings, the youngest, the lowest earners, FNCS wins, Europe’s top earners, countries by players, this year’s earnings, the oldest, organisations by players, North America’s top earners, then LAN and FNCS grand-final appearances.',
        ],
      },
      {
        title: 'Ties',
        items: [
          'Every board prints its tie rule above the ten slots, because they differ.',
          'Counts — wins, appearances, players — are split by career earnings: of two players on the same number, the bigger earner ranks higher. Countries and organisations are split by their players’ combined earnings.',
          'Money boards are straight money order, and youngest and oldest go by the birth date rather than the age in years.',
          'If 10th and 11th are still level after the tie rule, the board is not offered at all. The alphabet never decides who is 10th.',
          'Naming someone level with 10th but ranked out by the tie rule is a near miss: it is called out, and it never costs a life.',
          'A tournament where two teams share a place in the top eleven is not offered either.',
        ],
      },
      MODE_SECTION,
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
      'Name every player on the list and the round ends there and then — you do not have to sit out the clock to win it.',
      'When time runs out you see everyone you missed.',
      'The suggestion box helps you spell a name you already thought of — it never tells you whether that name is on the list.',
    ],
    sections: [
      {
        title: 'The lists',
        items: [
          'Qualified fields — everyone who made it to the FNCS Globals, or to the Esports World Cup.',
          'FNCS grand final winners, split by region, because Europe’s winners and North America’s are two different memories.',
          'LAN winners — Epic’s offline majors only; “What counts here” under the list names every one of them.',
          'Major tournament winners, year by year — Epic’s tier-1 finals: FNCS grand finals, the Globals, the World Cup and Epic’s LANs.',
          'In an event mode the lists are all about that field instead, in a fixed order: the qualifiers from each region, this year’s FNCS winners, the organisations and the countries with a player there, everyone who has won an FNCS, who else played the last LANs, and who has earned what — then everyone who qualified.',
          'A field list can be short. The Middle East sent four players to the 2026 Globals, and naming all four is a round of its own.',
        ],
      },
      {
        title: 'Ties',
        items: ['A list has no order, so there is nothing to tie: everyone who fits counts, however many there are.'],
      },
      MODE_SECTION,
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
      MODE_SECTION,
    ],
    terms: ['org', 'fncs-title', 'lan', 'global', 'earnings', 'nationality', 'region'],
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
          'Fits no open cell — rejected, and on Easy and Medium that costs a mistake.',
          'The grid only ever offers a cell that leaves every other empty cell still fillable with players you have not used. A cell that would strand another is never offered.',
          'Exactly one such cell — placed there automatically. That includes the cell you are the last possible answer for: putting you anywhere else would strand it.',
          'Several — the grid highlights them and you tap one.',
        ],
      },
      {
        title: 'Difficulty',
        items: [
          'Easy 🟢 — built on the names everyone knows, at least three of them per cell. Three wrong answers end the board.',
          'Medium 🟡 — the scene’s regulars join in, at least two per cell. Three wrong answers end the board.',
          'Hard 🔴 — a cell may have a single answer from anywhere on record. Nine guesses, one per cell.',
          'At every level any player who fits is accepted — the level decides what the board is built around, not who you may type.',
        ],
      },
      {
        title: 'Other rules',
        items: [
          'Every player may only be used once on the board.',
          'Boards are generated and checked, so all nine cells can always be filled with nine different players.',
          'Title rules say what was won: “Won EU FNCS” is the regional FNCS, and a Globals never makes someone a European winner because it was held in Copenhagen.',
          'Cells show the handle alone, for the same reason Griefer does.',
        ],
      },
      MODE_SECTION,
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
      'You have four lives, shown as hearts. Every wrong group costs one.',
    ],
    rules: [
      'A group is a country, a region, an organisation, a title — FNCS, LAN, major — or an earnings threshold. Nothing more obscure than that, and no birth years: nobody can tell a 2005 from a 2006.',
      'Every connection fits exactly its own four. If the group is Poland, there is no fifth Pole on the board — so there is exactly one way to split the sixteen.',
      'A wrong guess tells you when three of your four belonged to one group, and says nothing otherwise.',
      'Nothing otherwise is deliberate: two of any four landing in the same group is close to chance on a sixteen-card board, so reporting it every time buried the one hint worth reading.',
    ],
    sections: [POOL_SECTION, MODE_SECTION],
    terms: ['nationality', 'region', 'org', 'fncs-title', 'lan', 'major', 'earnings'],
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
      MODE_SECTION_SECRET,
    ],
    terms: ['region', 'nationality', 'age', 'earnings', 'fncs-title', 'fncs-final', 'teammates'],
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

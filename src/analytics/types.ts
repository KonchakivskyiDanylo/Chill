/**
 * What the site records, and in what shape.
 *
 * One record per *finished round* — never per click, never per page view. The
 * site had no telemetry at all before this, and the reason to add some is
 * narrow: to see which games and boards people play and where the puzzles are
 * too hard or too easy. Everything below is chosen for that and nothing else.
 *
 * Nothing identifies a person. There is no device id, no account, no cookie
 * for players (the only cookie is the admin login on `/analytics`), and the
 * server does not keep IP addresses. Totals are global: "Tenaball was played
 * 300 times", never "this device played 30 of them".
 *
 * Shared by the browser (which sends records), the server (which stores
 * them) and `aggregate.ts` (which turns them into the dashboard), so the three
 * cannot disagree about a field.
 */

/** Bumped when a record's shape changes, so the dashboard can tell eras apart. */
export const RECORD_VERSION = 1;

/** Registry ids — the same ones local best scores hang off. */
export const GAME_IDS = [
  'higher-lower',
  'wordle',
  'career-path',
  'who-are-ya',
  'tenaball',
  'list',
  'impostor',
  'tic-tac-toe',
  'connections',
  'guess-the-player',
] as const;

export type GameId = (typeof GAME_IDS)[number];

/** A player, an org, a rule — anything a record names, with the label to show. */
export interface Ref {
  id: string;
  name: string;
}

/** The `Ref` of anything with an id and a name — a roster player, a criterion. */
export const ref = (item: { id: string; name: string }): Ref => ({ id: item.id, name: item.name });

/**
 * How the round was set up: the "how many were Random, how many in Asia"
 * half of the dashboard. Every field optional, because each game only has
 * some of these.
 */
export interface Setup {
  /** The event mode's pool id, when one was in force. */
  event?: string | null;
  /** Shared pool picker: Random or Choose. */
  pick?: 'random' | 'custom';
  region?: string | null;
  /** Fame band from the pool picker, or `any`. */
  difficulty?: string;
  status?: string;
  /** A game's own Easy / Medium / Hard (Tic Tac Toe, Higher or Lower, Tenaball, List). */
  level?: string;
  /** A game's own mode: Order / Random, Exact / Direction, all-at-once / one-by-one… */
  mode?: string;
  /** Higher or Lower's category. */
  category?: string;
}

export type Outcome = 'won' | 'lost' | 'gave-up' | 'cleared';

/**
 * One step in a clue game (Career Path, Who Are Ya): what the player did while
 * clue `clue` was the newest one showing. `guess` is null for "reveal next
 * clue" — a skip — and set for a guess, `correct` saying which kind.
 */
export interface Step {
  clue: number;
  guess: Ref | null;
  correct: boolean;
}

export interface GamePayloads {
  wordle: { secret: Ref; guesses: number };
  'guess-the-player': { secret: Ref; guesses: Ref[] };
  'career-path': { secret: Ref; clues: Ref[]; steps: Step[] };
  'who-are-ya': { secret: Ref; clues: Ref[]; steps: Step[] };
  tenaball: {
    board: Ref;
    /** Every answer on the board, found or not — per-answer hit rates need both. */
    answers: { name: string; found: boolean }[];
    wrong: string[];
  };
  /** `missed` is names only, to keep a 300-answer list inside the size limit. */
  list: { list: Ref; total: number; found: Ref[]; missed: string[] };
  impostor: {
    rule: Ref;
    /** Every card: whether it fit the rule and whether the player picked it. */
    cards: { player: Ref; fits: boolean; picked: boolean }[];
  };
  'tic-tac-toe': {
    rows: Ref[];
    cols: Ref[];
    placed: { row: number; col: number; player: Ref }[];
    mistakes: number;
  };
  connections: {
    groups: { rule: Ref; players: Ref[] }[];
    /** Every submitted four, in order. */
    attempts: { players: string[]; correct: boolean }[];
  };
  'higher-lower': {
    score: number;
    pairs: { shown: Ref; hidden: Ref; answer: string; correct: boolean }[];
  };
}

export interface RoundRecord<G extends GameId = GameId> {
  v: number;
  game: G;
  /** Build of the app that sent it. */
  app: string;
  /** When the data behind the round was generated, so re-runs do not blur together. */
  data: string;
  setup: Setup;
  outcome: Outcome;
  r: GamePayloads[G];
}

/** What the support form sends. */
export const SUPPORT_KINDS = ['bug', 'wrong-data', 'suggestion', 'category', 'other'] as const;
export type SupportKind = (typeof SUPPORT_KINDS)[number];

export interface SupportRequest {
  kind: SupportKind;
  message: string;
  /** Optional — only if the player wants an answer. */
  contact?: string;
  /** Where they were: the page, and the round they last finished if they chose to attach it. */
  context?: { page: string; round?: RoundRecord };
}

export const SUPPORT_STATUSES = ['new', 'seen', 'done'] as const;
export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

/** A browser error, reported on its own so broken pages show up without anyone writing in. */
export interface ClientError {
  message: string;
  stack?: string;
  page: string;
  app: string;
}

/** What the server hands back from storage. */
export interface Stored<T> {
  id: number;
  at: string;
  body: T;
}

export interface StoredSupport extends Stored<SupportRequest> {
  status: SupportStatus;
}

/** The largest record the server takes. A 200-round Higher or Lower run is about 30 KB. */
export const MAX_RECORD_BYTES = 64 * 1024;
export const MAX_MESSAGE_CHARS = 2000;

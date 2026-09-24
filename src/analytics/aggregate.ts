import {
  GAME_IDS,
  type GameId,
  type GamePayloads,
  type Outcome,
  type RoundRecord,
  type Setup,
  type Stored,
} from './types';

/**
 * Stored rounds -> the numbers on `/analytics`.
 *
 * Pure, and run on the server at request time, so the dashboard is always
 * live and there is no second copy of the data to keep in step. Every record
 * is read defensively: an old build or a hand-crafted POST can send anything,
 * and one bad row must cost that row, not the page.
 *
 * What each game reports follows the list of questions the dashboard was
 * built to answer — see the comment on each section.
 */

// ------------------------------------------------------------------ shapes --

export interface Count {
  label: string;
  count: number;
}

export interface GameOverview {
  game: GameId;
  rounds: number;
  outcomes: Record<Outcome, number>;
  /** Per setup field — "pick: random 40, custom 12" and so on. */
  setups: { field: keyof Setup; values: Count[] }[];
}

/** Fortnitedle and Guess the Player: how each secret player went. */
export interface SecretRow {
  id: string;
  name: string;
  plays: number;
  solved: number;
  /** Over solved rounds only. */
  avgGuesses: number | null;
}

/** Career Path and Who Are Ya: the same, plus which clue did it. */
export interface ClueRow extends SecretRow {
  /** Over solved rounds: how many clues were showing. */
  avgClues: number | null;
  /**
   * Per clue: how many rounds were solved right after it, and how many
   * reached it at all. "2024 Globals 30/32" is solved 30 of 32 reached.
   */
  clues: { name: string; solved: number; skipped: number; wrong: number; reached: number }[];
  /** Wrong guesses made on this secret, most common first — who they get mistaken for. */
  mistakenFor: Count[];
}

/** Tenaball and List: one row per board or list. */
export interface BoardRow {
  id: string;
  name: string;
  plays: number;
  /** Mean share of the answers found, 0–1 — the difficulty. */
  avgShare: number;
  /** Rounds where everything was found: 10/10, or a cleared list. */
  perfect: number;
  gaveUp: number;
  /** Per answer: rounds it was found in, of rounds it was on the board. */
  answers: { name: string; found: number; seen: number }[];
  /** Tenaball only: wrong answers typed, most common first. */
  wrong: Count[];
}

export interface RuleRow {
  id: string;
  name: string;
  plays: number;
  won: number;
}

/** Griefer: a player misread under one rule. */
export interface Misread {
  rule: string;
  player: string;
  /** Whether they actually fit the rule. */
  fits: boolean;
  shown: number;
  /** Picked when they did not fit, or left when they did. */
  wrong: number;
}

/** Tic Tac Toe: one pair of rules. */
export interface CellRow {
  name: string;
  plays: number;
  filled: number;
  answers: Count[];
}

export interface GroupRow {
  name: string;
  plays: number;
  solved: number;
}

export interface PairRow {
  category: string;
  shown: string;
  hidden: string;
  seen: number;
  correct: number;
}

export interface RunRow {
  category: string;
  level: string;
  runs: number;
  avgScore: number;
  best: number;
}

export interface Dashboard {
  generated: string;
  rounds: number;
  /** Rounds per day, oldest first, for the last 30 days. */
  days: { day: string; rounds: number }[];
  games: GameOverview[];
  wordle: SecretRow[];
  guessThePlayer: SecretRow[];
  careerPath: ClueRow[];
  whoAreYa: ClueRow[];
  tenaball: BoardRow[];
  list: BoardRow[];
  griefer: { rules: RuleRow[]; misreads: Misread[] };
  ticTacToe: CellRow[];
  connections: { groups: GroupRow[]; misgrouped: Count[] };
  higherLower: { runs: RunRow[]; pairs: PairRow[]; players: SecretRow[] };
}

// ----------------------------------------------------------------- helpers --

const OUTCOMES: Outcome[] = ['won', 'lost', 'gave-up', 'cleared'];
const SETUP_FIELDS: (keyof Setup)[] = ['event', 'pick', 'region', 'difficulty', 'status', 'level', 'mode', 'category'];

function tally(counts: Map<string, number>, key: string, by = 1): void {
  counts.set(key, (counts.get(key) ?? 0) + by);
}

function top(counts: Map<string, number>, limit = 10): Count[] {
  return [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function mean(total: number, n: number): number | null {
  return n > 0 ? Math.round((total / n) * 100) / 100 : null;
}

function of<G extends GameId>(rounds: Stored<RoundRecord>[], game: G): Stored<RoundRecord<G>>[] {
  return rounds.filter((round) => round.body?.game === game) as Stored<RoundRecord<G>>[];
}

/** Runs `fn` per round and drops the rounds it throws on. */
function each<T>(rounds: T[], fn: (round: T) => void): void {
  for (const round of rounds) {
    try {
      fn(round);
    } catch {
      /* malformed record — skipped, see the header comment */
    }
  }
}

// -------------------------------------------------------------- per game --

function overview(rounds: Stored<RoundRecord>[]): GameOverview[] {
  return GAME_IDS.map((game) => {
    const mine = of(rounds, game);
    const outcomes = Object.fromEntries(OUTCOMES.map((o) => [o, 0])) as Record<Outcome, number>;
    const fields = new Map<keyof Setup, Map<string, number>>();
    for (const { body } of mine) {
      if (OUTCOMES.includes(body.outcome)) outcomes[body.outcome]++;
      for (const field of SETUP_FIELDS) {
        const value = body.setup?.[field];
        if (value === undefined) continue;
        if (!fields.has(field)) fields.set(field, new Map());
        tally(fields.get(field)!, value === null ? 'none' : String(value));
      }
    }
    return {
      game,
      rounds: mine.length,
      outcomes,
      setups: [...fields].map(([field, counts]) => ({ field, values: top(counts, 20) })),
    };
  });
}

/** Fortnitedle and Guess the Player. */
function secrets(
  rounds: Stored<RoundRecord<'wordle'>>[] | Stored<RoundRecord<'guess-the-player'>>[],
): SecretRow[] {
  const rows = new Map<string, SecretRow & { guessTotal: number }>();
  each(rounds as Stored<RoundRecord>[], ({ body }) => {
    const r = body.r as GamePayloads['wordle'] | GamePayloads['guess-the-player'];
    const guesses = typeof r.guesses === 'number' ? r.guesses : r.guesses.length;
    const row = rows.get(r.secret.id) ?? {
      id: r.secret.id,
      name: r.secret.name,
      plays: 0,
      solved: 0,
      avgGuesses: null,
      guessTotal: 0,
    };
    row.plays++;
    if (body.outcome === 'won') {
      row.solved++;
      row.guessTotal += guesses;
    }
    rows.set(row.id, row);
  });
  return [...rows.values()]
    .map(({ guessTotal, ...row }) => ({ ...row, avgGuesses: mean(guessTotal, row.solved) }))
    .sort((a, b) => b.plays - a.plays);
}

/** Career Path and Who Are Ya. */
function clueGames(
  rounds: Stored<RoundRecord<'career-path'>>[] | Stored<RoundRecord<'who-are-ya'>>[],
): ClueRow[] {
  type Acc = ClueRow & { guessTotal: number; clueTotal: number; clueMap: Map<string, ClueRow['clues'][number]>; wrongMap: Map<string, number> };
  const rows = new Map<string, Acc>();
  each(rounds as Stored<RoundRecord>[], ({ body }) => {
    const r = body.r as GamePayloads['career-path'];
    const row: Acc = rows.get(r.secret.id) ?? {
      id: r.secret.id,
      name: r.secret.name,
      plays: 0,
      solved: 0,
      avgGuesses: null,
      avgClues: null,
      clues: [],
      mistakenFor: [],
      guessTotal: 0,
      clueTotal: 0,
      clueMap: new Map(),
      wrongMap: new Map(),
    };
    row.plays++;
    const clueAt = (index: number) => {
      const clue = r.clues[index];
      const key = clue.id;
      const entry = row.clueMap.get(key) ?? { name: clue.name, solved: 0, skipped: 0, wrong: 0, reached: 0 };
      row.clueMap.set(key, entry);
      return entry;
    };
    // Every clue that was ever the newest one showing was reached.
    const newest = Math.max(0, ...r.steps.map((step) => step.clue));
    const lastShown = body.outcome === 'won' ? newest : Math.min(r.clues.length - 1, newest + (r.steps.length ? 1 : 0));
    for (let i = 0; i <= Math.min(lastShown, r.clues.length - 1); i++) clueAt(i).reached++;
    for (const step of r.steps) {
      const entry = clueAt(step.clue);
      if (!step.guess) entry.skipped++;
      else if (step.correct) entry.solved++;
      else {
        entry.wrong++;
        tally(row.wrongMap, step.guess.name);
      }
    }
    if (body.outcome === 'won') {
      row.solved++;
      row.guessTotal += r.steps.filter((step) => step.guess).length;
      row.clueTotal += newest + 1;
    }
    rows.set(row.id, row);
  });
  return [...rows.values()]
    .map(({ guessTotal, clueTotal, clueMap, wrongMap, ...row }) => ({
      ...row,
      avgGuesses: mean(guessTotal, row.solved),
      avgClues: mean(clueTotal, row.solved),
      clues: [...clueMap.values()].sort((a, b) => b.reached - a.reached),
      mistakenFor: top(wrongMap, 5),
    }))
    .sort((a, b) => b.plays - a.plays);
}

function tenaball(rounds: Stored<RoundRecord<'tenaball'>>[]): BoardRow[] {
  type Acc = BoardRow & { shareTotal: number; answerMap: Map<string, { found: number; seen: number }>; wrongMap: Map<string, number> };
  const rows = new Map<string, Acc>();
  each(rounds, ({ body }) => {
    const { board, answers, wrong } = body.r;
    const row: Acc = rows.get(board.id) ?? {
      id: board.id,
      name: board.name,
      plays: 0,
      avgShare: 0,
      perfect: 0,
      gaveUp: 0,
      answers: [],
      wrong: [],
      shareTotal: 0,
      answerMap: new Map(),
      wrongMap: new Map(),
    };
    const found = answers.filter((answer) => answer.found).length;
    row.plays++;
    row.shareTotal += answers.length ? found / answers.length : 0;
    if (found === answers.length) row.perfect++;
    if (body.outcome === 'gave-up') row.gaveUp++;
    for (const answer of answers) {
      const entry = row.answerMap.get(answer.name) ?? { found: 0, seen: 0 };
      entry.seen++;
      if (answer.found) entry.found++;
      row.answerMap.set(answer.name, entry);
    }
    for (const name of wrong) tally(row.wrongMap, name);
    rows.set(board.id, row);
  });
  return [...rows.values()]
    .map(({ shareTotal, answerMap, wrongMap, ...row }) => ({
      ...row,
      avgShare: mean(shareTotal, row.plays) ?? 0,
      answers: [...answerMap].map(([name, n]) => ({ name, ...n })).sort((a, b) => b.found / b.seen - a.found / a.seen),
      wrong: top(wrongMap, 10),
    }))
    .sort((a, b) => b.plays - a.plays);
}

function list(rounds: Stored<RoundRecord<'list'>>[]): BoardRow[] {
  type Acc = BoardRow & { shareTotal: number; answerMap: Map<string, { found: number; seen: number }> };
  const rows = new Map<string, Acc>();
  each(rounds, ({ body }) => {
    const { list: which, total, found, missed } = body.r;
    const row: Acc = rows.get(which.id) ?? {
      id: which.id,
      name: which.name,
      plays: 0,
      avgShare: 0,
      perfect: 0,
      gaveUp: 0,
      answers: [],
      wrong: [],
      shareTotal: 0,
      answerMap: new Map(),
    };
    row.plays++;
    row.shareTotal += total ? found.length / total : 0;
    if (found.length >= total) row.perfect++;
    if (body.outcome === 'gave-up') row.gaveUp++;
    const bump = (name: string, hit: boolean) => {
      const entry = row.answerMap.get(name) ?? { found: 0, seen: 0 };
      entry.seen++;
      if (hit) entry.found++;
      row.answerMap.set(name, entry);
    };
    for (const entry of found) bump(entry.name, true);
    for (const name of missed ?? []) bump(name, false);
    rows.set(which.id, row);
  });
  return [...rows.values()]
    .map(({ shareTotal, answerMap, ...row }) => ({
      ...row,
      avgShare: mean(shareTotal, row.plays) ?? 0,
      answers: [...answerMap].map(([name, n]) => ({ name, ...n })).sort((a, b) => b.found / b.seen - a.found / a.seen),
    }))
    .sort((a, b) => b.plays - a.plays);
}

/**
 * Griefer: which rules are hard, and which players people misread under a
 * rule — picked though they do not fit, or passed over though they do.
 */
function griefer(rounds: Stored<RoundRecord<'impostor'>>[]): Dashboard['griefer'] {
  const rules = new Map<string, RuleRow>();
  const reads = new Map<string, Misread>();
  each(rounds, ({ body }) => {
    const { rule, cards } = body.r;
    const row = rules.get(rule.id) ?? { id: rule.id, name: rule.name, plays: 0, won: 0 };
    row.plays++;
    if (body.outcome === 'won') row.won++;
    rules.set(rule.id, row);
    // A round given up says nothing about what the player believed.
    if (body.outcome === 'gave-up') return;
    for (const card of cards) {
      const key = `${rule.id}|${card.player.id}`;
      const entry = reads.get(key) ?? { rule: rule.name, player: card.player.name, fits: card.fits, shown: 0, wrong: 0 };
      entry.shown++;
      if (card.fits !== card.picked) entry.wrong++;
      reads.set(key, entry);
    }
  });
  return {
    rules: [...rules.values()].sort((a, b) => b.plays - a.plays),
    misreads: [...reads.values()]
      .filter((read) => read.wrong > 0)
      .sort((a, b) => b.wrong / b.shown - a.wrong / a.shown || b.shown - a.shown)
      .slice(0, 100),
  };
}

/**
 * Tic Tac Toe, per pair of rules. The pair is keyed in a fixed order so
 * "FaZe × Won EU FNCS" and "Won EU FNCS × FaZe" are one cell.
 */
function ticTacToe(rounds: Stored<RoundRecord<'tic-tac-toe'>>[]): CellRow[] {
  const cells = new Map<string, CellRow & { answerMap: Map<string, number> }>();
  each(rounds, ({ body }) => {
    const { rows, cols, placed } = body.r;
    rows.forEach((row, r) =>
      cols.forEach((col, c) => {
        const [a, b] = row.id < col.id ? [row, col] : [col, row];
        const key = `${a.id}|${b.id}`;
        const cell = cells.get(key) ?? { name: `${a.name} × ${b.name}`, plays: 0, filled: 0, answers: [], answerMap: new Map() };
        cell.plays++;
        const hit = placed.find((entry) => entry.row === r && entry.col === c);
        if (hit) {
          cell.filled++;
          tally(cell.answerMap, hit.player.name);
        }
        cells.set(key, cell);
      }),
    );
  });
  return [...cells.values()]
    .map(({ answerMap, ...cell }) => ({ ...cell, answers: top(answerMap, 50) }))
    .sort((a, b) => b.plays - a.plays);
}

/** Connections: which groups get solved, and who ends up in a wrong four. */
function connections(rounds: Stored<RoundRecord<'connections'>>[]): Dashboard['connections'] {
  const groups = new Map<string, GroupRow>();
  const misgrouped = new Map<string, number>();
  each(rounds, ({ body }) => {
    const { groups: inPlay, attempts } = body.r;
    const names = new Map(inPlay.flatMap((group) => group.players.map((p) => [p.id, p.name] as const)));
    for (const group of inPlay) {
      const row = groups.get(group.rule.id) ?? { name: group.rule.name, plays: 0, solved: 0 };
      row.plays++;
      const ids = new Set(group.players.map((p) => p.id));
      if (attempts.some((a) => a.correct && a.players.every((id) => ids.has(id)))) row.solved++;
      groups.set(group.rule.id, row);
    }
    for (const attempt of attempts) {
      if (attempt.correct) continue;
      for (const id of attempt.players) tally(misgrouped, names.get(id) ?? id);
    }
  });
  return {
    groups: [...groups.values()].sort((a, b) => b.plays - a.plays),
    misgrouped: top(misgrouped, 30),
  };
}

/**
 * Higher or Lower: runs by category and level, and pair- and player-level hit
 * rates — the numbers that could one day pick pairs by how often people get
 * them right rather than by the gap between the values.
 */
function higherLower(rounds: Stored<RoundRecord<'higher-lower'>>[]): Dashboard['higherLower'] {
  const runs = new Map<string, RunRow & { total: number }>();
  const pairs = new Map<string, PairRow>();
  const players = new Map<string, SecretRow>();
  each(rounds, ({ body }) => {
    const category = body.setup?.category ?? '?';
    const level = body.setup?.level ?? '?';
    const key = `${category}|${level}`;
    const run = runs.get(key) ?? { category, level, runs: 0, avgScore: 0, best: 0, total: 0 };
    run.runs++;
    run.total += body.r.score;
    run.best = Math.max(run.best, body.r.score);
    runs.set(key, run);
    for (const pair of body.r.pairs) {
      const pairKey = `${category}|${pair.shown.id}|${pair.hidden.id}`;
      const row = pairs.get(pairKey) ?? { category, shown: pair.shown.name, hidden: pair.hidden.name, seen: 0, correct: 0 };
      row.seen++;
      if (pair.correct) row.correct++;
      pairs.set(pairKey, row);
      const playerKey = `${category}|${pair.hidden.id}`;
      const player = players.get(playerKey) ?? { id: pair.hidden.id, name: `${pair.hidden.name} (${category})`, plays: 0, solved: 0, avgGuesses: null };
      player.plays++;
      if (pair.correct) player.solved++;
      players.set(playerKey, player);
    }
  });
  return {
    runs: [...runs.values()].map(({ total, ...run }) => ({ ...run, avgScore: mean(total, run.runs) ?? 0 })),
    pairs: [...pairs.values()].sort((a, b) => b.seen - a.seen).slice(0, 200),
    players: [...players.values()].sort((a, b) => b.plays - a.plays).slice(0, 200),
  };
}

// ------------------------------------------------------------------- entry --

export function aggregate(rounds: Stored<RoundRecord>[], now: Date = new Date()): Dashboard {
  const valid = rounds.filter((round) => round.body && GAME_IDS.includes(round.body.game));

  const byDay = new Map<string, number>();
  for (const round of valid) tally(byDay, String(round.at).slice(0, 10));
  const days: Dashboard['days'] = [];
  for (let i = 29; i >= 0; i--) {
    const day = new Date(now.getTime() - i * 86_400_000).toISOString().slice(0, 10);
    days.push({ day, rounds: byDay.get(day) ?? 0 });
  }

  return {
    generated: now.toISOString(),
    rounds: valid.length,
    days,
    games: overview(valid),
    wordle: secrets(of(valid, 'wordle')),
    guessThePlayer: secrets(of(valid, 'guess-the-player')),
    careerPath: clueGames(of(valid, 'career-path')),
    whoAreYa: clueGames(of(valid, 'who-are-ya')),
    tenaball: tenaball(of(valid, 'tenaball')),
    list: list(of(valid, 'list')),
    griefer: griefer(of(valid, 'impostor')),
    ticTacToe: ticTacToe(of(valid, 'tic-tac-toe')),
    connections: connections(of(valid, 'connections')),
    higherLower: higherLower(of(valid, 'higher-lower')),
  };
}

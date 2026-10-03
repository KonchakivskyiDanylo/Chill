import { useState } from 'react';
import { Link } from 'react-router-dom';
import { gameStats, logKey, useDailyLog, type DailyLog } from '@/daily/progress';
import { DAILY_GAMES, type DailyGame, type DailyResult } from '@/daily/types';
import { useCountdown } from '@/daily/useDay';
import { puzzleLabel } from '@/daily/day';
import { getGame, type GameMeta } from '@/games/registry';
import { SITE_URL } from '@/lib/seo';
import { readLocal } from '@/lib/storage';
import './daily.css';

/**
 * The text a Share button puts on the clipboard: Wordle's shape, so it reads
 * the same pasted into Discord or X.
 *
 *   OffSpawn Fortnitedle #12 4/6
 *   ⬛🟨⬛⬛⬛
 *   ⬛🟩🟩⬛🟨
 *   offspawn.app/game/fortnitedle
 */
export function shareText(game: GameMeta, number: number, result: DailyResult, grid: readonly string[]): string {
  const site = SITE_URL.replace(/^https?:\/\//, '');
  return [`OffSpawn ${game.title} ${puzzleLabel(number)} ${result.score}`, ...grid, `${site}/game/${game.slug}`].join(
    '\n',
  );
}

/**
 * Copies, or hands to the phone's share sheet where there is one — a phone is
 * where most results get posted from, and its sheet goes straight to the apps.
 */
async function share(text: string): Promise<'shared' | 'copied' | 'failed'> {
  const phone = typeof navigator.share === 'function' && window.matchMedia?.('(pointer: coarse)').matches;
  if (phone) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return 'shared';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/**
 * The end of a daily puzzle: how it went, Share, the streak, and when the next
 * one comes. Sits where a practice round has its New game button.
 */
export function DailyEnd({
  game,
  number,
  day,
  result,
  grid,
}: {
  game: DailyGame;
  number: number;
  day: string;
  result: DailyResult;
  /** The emoji lines of the shared result. */
  grid: readonly string[];
}) {
  const meta = getGame(game)!;
  const log = useDailyLog(game);
  const stats = gameStats(log, day);
  const countdown = useCountdown();
  const [shared, setShared] = useState<'shared' | 'copied' | 'failed' | null>(null);
  const text = shareText(meta, number, result, grid);
  const won = result.outcome === 'won' || result.outcome === 'cleared';

  return (
    <section className="daily-end card stack">
      <div className="daily-end__head">
        <div>
          <div className="card__title" style={{ marginBottom: 2 }}>
            Daily {puzzleLabel(number)}
          </div>
          <div className="daily-end__score">{result.score}</div>
        </div>
        <pre className="daily-end__grid" aria-label="Your result">
          {grid.join('\n')}
        </pre>
      </div>

      <button
        type="button"
        className={`btn btn--lg btn--block ${won ? 'btn--primary' : ''}`}
        onClick={async () => setShared(await share(text))}
      >
        {shared === 'copied' ? '✓ Copied — paste it anywhere' : shared === 'shared' ? '✓ Shared' : '📤 Share result'}
      </button>
      {shared === 'failed' ? (
        <textarea className="input daily-end__fallback" readOnly value={text} rows={grid.length + 2} onFocus={(e) => e.target.select()} />
      ) : null}

      <div className="daily-end__stats">
        <DailyStat label="Played" value={stats.played} />
        <DailyStat label="Won" value={stats.played ? `${Math.round((stats.won / stats.played) * 100)}%` : '–'} />
        <DailyStat label="Streak" value={`${stats.streak}${stats.streak >= 3 ? ' 🔥' : ''}`} />
        <DailyStat label="Best" value={stats.best} />
      </div>

      <p className="daily-end__next">
        Next puzzle in <strong className="daily-end__clock">{countdown}</strong>
      </p>

      <MoreDailies current={game} day={day} />
    </section>
  );
}

/** What a daily game shows while its round is not there: loading, none today, or a failure. */
export function DailyPending({ status, error }: { status: 'off' | 'loading' | 'ready' | 'missing' | 'error'; error: string | null }) {
  if (status === 'error') {
    return (
      <section className="card stack-sm center">
        <div className="bold">Today’s puzzle did not load</div>
        <p className="small muted" style={{ margin: 0 }}>
          {error} Check your connection and reload the page.
        </p>
      </section>
    );
  }
  if (status === 'missing') {
    return (
      <section className="card stack-sm center">
        <div className="bold">No puzzle here today</div>
        <p className="small muted" style={{ margin: 0 }}>
          This game’s daily could not be made today. The other daily puzzles are on the home page.
        </p>
      </section>
    );
  }
  return <div className="page center muted">Loading today’s puzzle…</div>;
}

function DailyStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="daily-end__stat">
      <div className="daily-end__stat-value">{value}</div>
      <div className="daily-end__stat-label">{label}</div>
    </div>
  );
}

/** The other dailies, ticked when done today — the way on to the next one. */
function MoreDailies({ current, day }: { current: DailyGame; day: string }) {
  const others = DAILY_GAMES.filter((game) => game !== current && !getGame(game)?.hidden);
  return (
    <div className="stack-sm">
      <div className="tiny faint center">More daily puzzles</div>
      <div className="daily-more">
        {others.map((id) => {
          const meta = getGame(id)!;
          const done = readLocal<DailyLog>(logKey(id), {})[day];
          return (
            <Link key={id} to={`/game/${meta.slug}`} className={`daily-more__item${done ? ' daily-more__item--done' : ''}`}>
              <span aria-hidden="true">{meta.icon}</span> {meta.title}
              {done ? <span className="daily-more__tick">✓ {done.score}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

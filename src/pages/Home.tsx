import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ModePicker } from '@/components/EventMode';
import { loadDailySet } from '@/daily/client';
import { puzzleLabel, puzzleNumber } from '@/daily/day';
import { statsOf, useDailyLogs } from '@/daily/progress';
import { DAILY_GAMES, type DailyGame } from '@/daily/types';
import { useCountdown, useToday } from '@/daily/useDay';
import { DAILY_ONLY } from '@/daily/useDailyRound';
import { loadRoster } from '@/data/liquipedia/roster';
import { VISIBLE_GAMES, type GameMeta } from '@/games/registry';
import { HOME_META, usePageMeta } from '@/lib/seo';
import '@/components/daily.css';

/**
 * Fetches the players and today's puzzles while someone is still choosing a
 * game.
 *
 * Every game needs them, so by the time a card is tapped they are usually
 * already downloaded. Waits for an idle moment so it never competes with the
 * page itself; both loaders cache, so the game just picks up the same promise.
 * A failure is left for the game to report.
 */
function usePrefetch(today: string) {
  useEffect(() => {
    const load = () => {
      void loadRoster().catch(() => {});
      if (DAILY_ONLY) void loadDailySet(today).catch(() => {});
    };
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(load, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 1500);
    return () => window.clearTimeout(id);
  }, [today]);
}

const isDaily = (game: GameMeta) => (DAILY_GAMES as readonly string[]).includes(game.id);
const won = (outcome: string) => outcome === 'won' || outcome === 'cleared';

export function Home() {
  usePageMeta(HOME_META);
  const today = useToday();
  usePrefetch(today);
  const countdown = useCountdown();
  const dailies = VISIBLE_GAMES.filter(isDaily);
  const endless = VISIBLE_GAMES.filter((game) => !isDaily(game));

  // Read through the shared store, so finishing a puzzle in another tab ticks it here too.
  const all = useDailyLogs();
  const logs = dailies.map((game) => [game, all[game.id as DailyGame]] as const);
  const doneToday = logs.filter(([, log]) => log[today]).length;
  const streak = statsOf(
    logs.flatMap(([, log]) => Object.keys(log)),
    today,
  ).streak;

  return (
    <div className="page stack-lg">
      <section className="stack" style={{ paddingTop: 12 }}>
        <h1>How well do you actually know competitive Fortnite?</h1>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          A new set of puzzles every day, built on the real competitive record — FNCS grand finals, the
          World Cup, the LANs and everything under them. The same puzzles for everyone, new at midnight
          Central European time. No account, no sign-up.
        </p>
      </section>

      <ModePicker />

      <section className="stack">
        <div className="home-today">
          <div>
            <div className="card__title" style={{ marginBottom: 2 }}>
              Today’s puzzles {puzzleLabel(puzzleNumber(today))}
            </div>
            <div className="home-today__done">
              {doneToday === dailies.length ? 'All done for today ✓' : `${doneToday} of ${dailies.length} played`}
            </div>
          </div>
          <div className="home-today__side">
            {streak > 0 ? (
              <span className="home-today__streak">
                🔥 {streak} day{streak === 1 ? '' : 's'}
              </span>
            ) : null}
            <span className="home-today__next">
              Next in <strong>{countdown}</strong>
            </span>
          </div>
        </div>

        <div className="game-grid">
          {logs.map(([game, log]) => {
            const done = log[today];
            return (
              <Link
                key={game.id}
                to={`/game/${game.slug}`}
                className={`game-card${done ? ' game-card--done' : ''}`}
              >
                <span className="game-card__icon" aria-hidden="true">
                  {game.icon}
                </span>
                <span className="game-card__body">
                  <span className="game-card__title">{game.title}</span>
                  <span className="game-card__tagline">{game.tagline}</span>
                </span>
                {done ? (
                  <span
                    className={`game-card__done${won(done.outcome) ? '' : ' game-card__done--lost'}`}
                    title="Played today"
                  >
                    {won(done.outcome) ? '✓ ' : ''}
                    {done.score}
                  </span>
                ) : (
                  <span className="game-card__play">Play</span>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {endless.length > 0 ? (
        <section className="stack">
          <div className="card__title" style={{ marginBottom: 0 }}>
            Any time
          </div>
          <div className="game-grid">
            {endless.map((game) => (
              <Link key={game.id} to={`/game/${game.slug}`} className="game-card">
                <span className="game-card__icon" aria-hidden="true">
                  {game.icon}
                </span>
                <span className="game-card__body">
                  <span className="game-card__title">{game.title}</span>
                  <span className="game-card__tagline">{game.tagline}</span>
                </span>
                <span className="game-card__go" aria-hidden="true">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

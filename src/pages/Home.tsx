import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ModePicker } from '@/components/EventMode';
import { loadRoster } from '@/data/liquipedia/roster';
import { VISIBLE_GAMES } from '@/games/registry';

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/**
 * Fetches the players while someone is still choosing a game.
 *
 * Every game needs them, so by the time a card is tapped they are usually
 * already downloaded and indexed. Waits for an idle moment so it never
 * competes with the page itself; `loadRoster` caches, so the game just picks
 * up the same promise. A failure is left for the game to report.
 */
function usePrefetchRoster() {
  useEffect(() => {
    const load = () => void loadRoster().catch(() => {});
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(load, { timeout: 3000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(load, 1500);
    return () => window.clearTimeout(id);
  }, []);
}

export function Home() {
  usePrefetchRoster();
  return (
    <div className="page stack-lg">
      <section className="stack" style={{ paddingTop: 12 }}>
        <h1>How well do you actually know competitive Fortnite?</h1>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          {COUNT[VISIBLE_GAMES.length] ?? VISIBLE_GAMES.length} puzzles built on the real competitive record — FNCS grand finals, the World Cup, the LANs and
          everything under them. Name the player from their career, their teammates, their earnings or six
          green letters. No account, no sign-up: pick a game and play.
        </p>
      </section>

      {/*
        Above the games, because it changes what every one of them is about. Pick
        a tournament here and every game runs on that field until you leave it.
      */}
      <ModePicker />

      <section className="game-grid">
        {VISIBLE_GAMES.map((game) => (
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
      </section>
    </div>
  );
}

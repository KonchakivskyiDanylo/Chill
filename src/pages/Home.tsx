import { Link } from 'react-router-dom';
import { ModePicker } from '@/components/EventMode';
import { VISIBLE_GAMES } from '@/games/registry';

const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

export function Home() {
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

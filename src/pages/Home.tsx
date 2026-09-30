import { Link } from 'react-router-dom';
import { ModePicker } from '@/components/EventMode';
import { SOURCE } from '@/data/liquipedia/roster';
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

      <section className="card card--muted stack">
        <div className="card__title">About this prototype</div>
        <p className="small muted">
          An unfinished fan project: scores and progress stay in your browser. The data is from{' '}
          <a className="link" href={SOURCE.url} target="_blank" rel="noreferrer noopener">
            Liquipedia
          </a>{' '}
          and Wikipedia, modified, under CC BY-SA — and where they say nothing, neither do we: nothing is
          estimated.{' '}
          <Link to="/credits" className="link">
            Credits &amp; licence
          </Link>
        </p>
      </section>
    </div>
  );
}

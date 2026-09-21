import { Link } from 'react-router-dom';
import { ModePicker } from '@/components/EventMode';
import { GAMES } from '@/games/registry';

export function Home() {
  return (
    <div className="page stack-lg">
      <section className="stack" style={{ paddingTop: 12 }}>
        <h1>How well do you actually know competitive Fortnite?</h1>
        <p className="muted" style={{ maxWidth: '60ch' }}>
          Ten puzzles built on the real competitive record — FNCS grand finals, the World Cup, the LANs and
          everything under them. Name the player from their career, their teammates, their earnings or six
          green letters. No account, no sign-up: pick a game and play.
        </p>
      </section>

      {/*
        Above the games, because it changes what all ten of them are about. Pick
        a tournament here and every game runs on that field until you leave it.
      */}
      <ModePicker />

      <section className="game-grid">
        {GAMES.map((game) => (
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
          OffSpawn is a fan project, and an unfinished one — the games work, the data is still growing, and
          the scoring is all local to your browser. Everything it knows comes from people who wrote it down
          first:{' '}
          <a className="link" href="https://liquipedia.net/fortnite" target="_blank" rel="noreferrer noopener">
            Liquipedia
          </a>{' '}
          for who these players are, where they are from, when they were born and what they have won, and
          Wikipedia's competitive Fortnite records for the FNCS title counts. Both are CC-BY-SA, so the data
          this site derives from them is too.
        </p>
        <p className="small muted">
          Where a source says nothing, so does OffSpawn: a missing earnings figure shows as a dash rather
          than a zero, and a player with no published birthday is simply left out of the questions that need
          one. Nothing on the site is estimated or filled in.
        </p>
        <p className="small muted">
          Every game reads through one repository interface, so a live API can replace the imported files
          without a single game changing.
        </p>
        <p className="tiny faint">
          <Link to="/credits" className="link">
            Credits &amp; data licence
          </Link>
        </p>
      </section>
    </div>
  );
}

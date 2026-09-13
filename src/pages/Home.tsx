import { Link } from 'react-router-dom';
import { GAMES } from '@/games/registry';
import { useDataState } from '@/data/DataProvider';
import { DataNote } from '@/components/GameShell';

export function Home() {
  const { dataset } = useDataState();

  return (
    <div className="page stack-lg">
      <section className="stack" style={{ paddingTop: 12 }}>
        <span className="chip chip--primary" style={{ width: 'fit-content' }}>
          {dataset ? `${dataset.players.length} players · ${dataset.events.length} majors` : 'Loading dataset…'}
        </span>
        <h1>Ten puzzles about Fortnite competitive players.</h1>
        <p className="muted" style={{ maxWidth: '58ch' }}>
          Guess players from their career results, their teammates, their earnings and their trophies. No account,
          no sign-up — pick a game and play.
        </p>
      </section>

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

      <section className="card card--muted">
        <div className="card__title">About this prototype</div>
        <p className="small muted">
          Every game runs on a shared sample dataset of well-known Fortnite competitive players — earnings, ages,
          orgs, nationalities, major results and tournament teammates. The data layer sits behind a single
          repository interface, so the sample records can be swapped for live Liquipedia / API data without
          touching the games.
        </p>
        <DataNote />
      </section>
    </div>
  );
}

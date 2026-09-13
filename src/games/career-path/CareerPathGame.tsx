import { useCallback, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import type { Player } from '@/data/types';
import { money, ordinal } from '@/lib/format';
import { getGame } from '@/games/registry';
import { cluesLeft, createGame, revealNext, submitGuess, type GameState, type Mode } from './engine';
import './career-path.css';

const meta = getGame('career-path')!;

export default function CareerPathGame() {
  const dataset = useDataset();
  const [mode, setMode] = useState<Mode | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    (nextMode: Mode) => {
      const created = createGame(dataset, nextMode);
      if (!created) {
        setError('No player in the dataset has enough major results for a career path.');
        return;
      }
      setError(null);
      setMode(nextMode);
      setGame(created);
    },
    [dataset],
  );

  const guess = (player: Player) => setGame((prev) => (prev ? submitGuess(prev, player) : prev));
  const reveal = () => setGame((prev) => (prev ? revealNext(prev) : prev));

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <section className="card stack">
            <div className="card__title">Pick a mode</div>
            <OptionGrid>
              <OptionCard
                label="Order"
                hint="Results appear oldest → newest, the way the career actually ran."
                selected={mode === 'order'}
                onClick={() => start('order')}
              />
              <OptionCard
                label="Random"
                hint="The same results, revealed in a random order. Harder to read."
                selected={mode === 'random'}
                onClick={() => start('random')}
              />
            </OptionGrid>
          </section>
          {error ? (
            <Banner tone="danger" title="Cannot start">
              {error}
            </Banner>
          ) : null}
        </div>
      </GameShell>
    );
  }

  const finished = game.status !== 'playing';
  const visible = game.clues.slice(0, game.revealed);
  const guessedIds = new Set(game.guesses.map((p) => p.id));

  return (
    <GameShell
      game={meta}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => start(game.mode)}>
          ↺ New player
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Clues shown" value={`${game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
          <Stat label="Mode" value={game.mode === 'order' ? 'Order' : 'Random'} />
        </div>

        <section className="card stack">
          <div className="card__title">
            {game.mode === 'order' ? 'Career path — oldest first' : 'Career path — random order'}
          </div>
          <ol className="cp-path list-reset">
            {visible.map((clue, index) => (
              <li key={clue.event.id} className="cp-clue">
                <span className="cp-clue__dot" aria-hidden="true" />
                <div className="cp-clue__body">
                  <div className="cp-clue__event">{clue.event.shortName}</div>
                  <div className="cp-clue__meta">
                    {clue.event.region ? `${clue.event.region} · ` : ''}
                    {clue.event.year}
                    {finished ? ` · ${money(clue.result.prize)}` : ''}
                  </div>
                </div>
                <div
                  className={`cp-clue__place${clue.result.placement === 1 ? ' cp-clue__place--win' : ''}`}
                  aria-label={`Placed ${ordinal(clue.result.placement)}`}
                >
                  {ordinal(clue.result.placement)}
                </div>
                {index === visible.length - 1 && !finished ? <span className="cp-clue__new">new</span> : null}
              </li>
            ))}
          </ol>
        </section>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? `Got it in ${game.guesses.length}!` : 'Out of clues'}
            >
              The player was <strong>{game.secret.name}</strong>.
            </Banner>
            <SecretCard player={game.secret} />
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => start(game.mode)}>
              Next player
            </button>
          </div>
        ) : (
          <div className="stack">
            <PlayerSearch players={dataset.players} onPick={guess} exclude={guessedIds} />
            <button type="button" className="btn btn--block" onClick={reveal} disabled={cluesLeft(game) === 0}>
              {cluesLeft(game) === 0 ? 'All clues revealed — last guess!' : `Reveal next clue (${cluesLeft(game)} left)`}
            </button>
          </div>
        )}

        {game.guesses.length > 0 ? (
          <section className="card stack-sm">
            <div className="card__title">Your guesses</div>
            <div className="row">
              {game.guesses.map((player) => (
                <span
                  key={player.id}
                  className={`chip ${player.id === game.secret.id ? 'chip--success' : 'chip--danger'}`}
                >
                  {player.name}
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </GameShell>
  );
}

function SecretCard({ player }: { player: Player }) {
  return (
    <div className="card row" style={{ gap: 14 }}>
      <PlayerAvatar player={player} size={54} />
      <div>
        <div className="bold">{player.name}</div>
        <div className="small muted">
          <CountryBadge code={player.country} name={player.countryName} /> {player.countryName}
          {player.team ? ` · ${player.team}` : ''} · {money(player.earnings)} · {player.fncsWins} FNCS
        </div>
      </div>
    </div>
  );
}

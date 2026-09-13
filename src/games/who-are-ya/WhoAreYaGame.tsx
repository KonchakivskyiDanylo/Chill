import { useCallback, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, OptionCard, OptionGrid, PlayerLine, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import type { Player } from '@/data/types';
import { money } from '@/lib/format';
import { getGame } from '@/games/registry';
import {
  cluesLeft,
  createGame,
  revealNext,
  showsMatches,
  submitGuess,
  type GameState,
  type Mode,
} from './engine';

const meta = getGame('who-are-ya')!;

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'easy', label: 'Easy', hint: 'Fewest → most matches, with the match count shown.' },
  { id: 'hard', label: 'Hard', hint: 'Fewest → most matches, but the counts stay hidden.' },
  { id: 'random', label: 'Random', hint: 'Random order, counts hidden. No ramp-up.' },
];

export default function WhoAreYaGame() {
  const dataset = useDataset();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    (mode: Mode) => {
      const created = createGame(dataset, mode);
      if (!created) {
        setError('No player in the dataset has enough tournament teammates for this game.');
        return;
      }
      setError(null);
      setGame(created);
    },
    [dataset],
  );

  const guess = (player: Player) => setGame((prev) => (prev ? submitGuess(prev, player) : prev));

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <section className="card stack">
            <div className="card__title">Pick a mode</div>
            <OptionGrid>
              {MODES.map((mode) => (
                <OptionCard key={mode.id} label={mode.label} hint={mode.hint} onClick={() => start(mode.id)} />
              ))}
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
  const withMatches = showsMatches(game.mode);

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
          <Stat label="Teammates" value={`${game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
          <Stat label="Mode" value={MODES.find((m) => m.id === game.mode)!.label} />
        </div>

        <section className="card stack">
          <div className="card__title">Tournament teammates</div>
          <ul className="stack-sm list-reset">
            {visible.map((clue) => (
              <li
                key={clue.player.id}
                className="row-between"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap' }}
              >
                <PlayerLine
                  player={clue.player}
                  size={36}
                  meta={clue.player.team ?? clue.player.countryName}
                />
                {withMatches || finished ? (
                  <span className="chip nums">{clue.matches.toLocaleString('en-US')} matches</span>
                ) : (
                  <span className="chip faint">?</span>
                )}
              </li>
            ))}
          </ul>
          <p className="tiny faint">
            Ranked by tournament matches played together
            {game.mode === 'random' ? ', shown in random order.' : ', fewest first.'}
          </p>
        </section>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={
                game.status === 'won'
                  ? `Got it after ${game.revealed} ${game.revealed === 1 ? 'clue' : 'clues'}!`
                  : 'Out of clues'
              }
            >
              The player was <strong>{game.secret.name}</strong>.
            </Banner>
            <div className="card row" style={{ gap: 14 }}>
              <PlayerAvatar player={game.secret} size={54} />
              <div>
                <div className="bold">{game.secret.name}</div>
                <div className="small muted">
                  <CountryBadge code={game.secret.country} name={game.secret.countryName} />{' '}
                  {game.secret.countryName}
                  {game.secret.team ? ` · ${game.secret.team}` : ''} · {money(game.secret.earnings)}
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => start(game.mode)}>
              Next player
            </button>
          </div>
        ) : (
          <div className="stack">
            <PlayerSearch players={dataset.players} onPick={guess} exclude={guessedIds} />
            <button
              type="button"
              className="btn btn--block"
              onClick={() => setGame((prev) => (prev ? revealNext(prev) : prev))}
              disabled={cluesLeft(game) === 0}
            >
              {cluesLeft(game) === 0
                ? 'All teammates revealed — last guess!'
                : `Reveal next teammate (${cluesLeft(game)} left)`}
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

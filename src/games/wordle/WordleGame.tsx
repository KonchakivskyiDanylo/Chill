import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Banner, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import { money } from '@/lib/format';
import { useLocalState } from '@/lib/storage';
import { getGame } from '@/games/registry';
import { createGame, keyboardState, MAX_GUESSES, scoreGuess, submitGuess, type GameState } from './engine';
import './wordle.css';

const meta = getGame('wordle')!;

const KEY_ROWS = [
  '1234567890'.split(''),
  'QWERTYUIOP'.split(''),
  'ASDFGHJKL'.split(''),
  ['ENTER', ...'ZXCVBNM'.split(''), 'DEL'],
];

export default function WordleGame() {
  const dataset = useDataset();
  const [game, setGame] = useState<GameState | null>(() => createGame(dataset.players));
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [record, setRecord] = useLocalState('wordle:record', { played: 0, won: 0 });

  const newGame = useCallback(() => {
    setGame(createGame(dataset.players));
    setDraft('');
    setMessage(null);
  }, [dataset]);

  const commit = useCallback(() => {
    if (!game || game.status !== 'playing') return;
    const result = submitGuess(game, draft);
    if (!result.ok) {
      setMessage(result.reason);
      return;
    }
    setMessage(null);
    setDraft('');
    setGame(result.state);
    if (result.state.status !== 'playing') {
      setRecord({
        played: record.played + 1,
        won: record.won + (result.state.status === 'won' ? 1 : 0),
      });
    }
  }, [game, draft, record, setRecord]);

  const press = useCallback(
    (key: string) => {
      if (!game || game.status !== 'playing') return;
      if (key === 'ENTER') {
        commit();
        return;
      }
      if (key === 'DEL') {
        setMessage(null);
        setDraft((prev) => prev.slice(0, -1));
        return;
      }
      if (!/^[A-Z0-9]$/.test(key)) return;
      setMessage(null);
      setDraft((prev) => (prev.length >= game.answer.length ? prev : prev + key));
    },
    [game, commit],
  );

  // Physical keyboard support — the on-screen one is for touch.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === 'Enter') press('ENTER');
      else if (event.key === 'Backspace') press('DEL');
      else if (/^[a-zA-Z0-9]$/.test(event.key)) press(event.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  if (!game) {
    return (
      <GameShell game={meta}>
        <Banner tone="danger" title="No puzzle available">
          No player in the dataset has a usable name for this game.
        </Banner>
      </GameShell>
    );
  }

  const keys = keyboardState(game);
  const finished = game.status !== 'playing';
  const rows = Array.from({ length: MAX_GUESSES }, (_, index) => {
    if (index < game.guesses.length) {
      return { value: game.guesses[index], states: scoreGuess(game.guesses[index], game.answer) };
    }
    if (index === game.guesses.length && !finished) return { value: draft, states: null };
    return { value: '', states: null };
  });

  return (
    <GameShell
      game={meta}
      toolbar={
        <button type="button" className="icon-btn" onClick={newGame}>
          ↺ New game
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Length" value={game.answer.length} />
          <Stat label="Guess" value={`${Math.min(game.guesses.length + (finished ? 0 : 1), MAX_GUESSES)}/${MAX_GUESSES}`} />
          <Stat label="Solved" value={`${record.won}/${record.played}`} />
        </div>

        <p className="center muted small">
          The answer is <strong>{game.answer.length}</strong> characters — letters and digits, no spaces.
        </p>

        <div
          className="wordle-grid"
          style={{ '--cols': game.answer.length } as CSSProperties}
          aria-label={`Guess grid, ${game.answer.length} characters`}
        >
          {rows.map((row, rowIndex) =>
            Array.from({ length: game.answer.length }, (_, colIndex) => {
              const char = row.value[colIndex] ?? '';
              const state = row.states?.[colIndex];
              return (
                <div
                  key={`${rowIndex}-${colIndex}`}
                  className={`wordle-tile${state ? ` wordle-tile--${state}` : ''}${char && !state ? ' wordle-tile--filled' : ''}`}
                >
                  {char}
                </div>
              );
            }),
          )}
        </div>

        {message ? <p className="center small" style={{ color: 'var(--warning)' }}>{message}</p> : null}

        {finished ? (
          <div className="stack">
            <Banner tone={game.status === 'won' ? 'success' : 'danger'} title={game.status === 'won' ? 'Solved!' : 'Out of guesses'}>
              The player was <strong>{game.secret.name}</strong>.
            </Banner>
            <div className="card row" style={{ gap: 14 }}>
              <PlayerAvatar player={game.secret} size={54} />
              <div>
                <div className="bold">{game.secret.name}</div>
                <div className="small muted">
                  <CountryBadge code={game.secret.country} name={game.secret.countryName} />{' '}
                  {game.secret.countryName}
                  {game.secret.team ? ` · ${game.secret.team}` : ''} · {money(game.secret.earnings)} ·{' '}
                  {game.secret.fncsWins} FNCS
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={newGame}>
              New game
            </button>
          </div>
        ) : (
          <div className="wordle-keyboard">
            {KEY_ROWS.map((row, index) => (
              <div className="wordle-keyboard__row" key={index}>
                {row.map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`wordle-key${key.length > 1 ? ' wordle-key--wide' : ''}${
                      keys.get(key) ? ` wordle-key--${keys.get(key)}` : ''
                    }`}
                    onClick={() => press(key)}
                  >
                    {key === 'DEL' ? '⌫' : key}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </GameShell>
  );
}

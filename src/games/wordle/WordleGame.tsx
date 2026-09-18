import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { GiveUpButton } from '@/components/GiveUpButton';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Banner } from '@/components/ui';
import { DifficultyCards, DifficultySwitch, useDifficulty } from '@/components/DifficultyPicker';
import { DIFFICULTIES, type Difficulty } from '@/games/shared/difficulty';
import { useDataset } from '@/data/DataProvider';
import { playerMoney, plural } from '@/lib/format';
import { getGame } from '@/games/registry';
import {
  createGame,
  eligible,
  giveUp,
  keyboardState,
  MAX_GUESSES,
  scoreGuess,
  submitGuess,
  type GameState,
  type TileState,
} from './engine';
import './wordle.css';

const meta = getGame('wordle')!;

const KEY_ROWS = [
  '1234567890'.split(''),
  'QWERTYUIOP'.split(''),
  'ASDFGHJKL'.split(''),
  ['ENTER', ...'ZXCVBNM'.split(''), 'DEL'],
];

/**
 * The three tile colours, shown rather than described.
 *
 * Real handles, so the examples double as a hint about what the answers look
 * like — and MITR0 carries the digit rule, which reads as a footnote in prose
 * and as an obvious fact the moment you see a 0 in a tile.
 */
const EXAMPLES: { word: string; at: number; state: TileState; note: string }[] = [
  {
    word: 'BUGHA',
    at: 0,
    state: 'correct',
    note: 'B is in the player’s name and in the correct spot.',
  },
  {
    word: 'MITR0',
    at: 4,
    state: 'present',
    note: '0 is in the player’s name but in the wrong spot — digits are characters too.',
  },
  {
    word: 'ACORN',
    at: 1,
    state: 'absent',
    note: 'C is not in the player’s name in any spot.',
  },
];

function Examples() {
  return (
    <div className="stack-sm">
      {EXAMPLES.map((example) => (
        <div key={example.word} className="wordle-example">
          <div
            className="wordle-grid wordle-grid--example"
            style={{ '--cols': example.word.length } as CSSProperties}
            aria-hidden="true"
          >
            {example.word.split('').map((char, index) => (
              <div
                key={index}
                className={`wordle-tile${index === example.at ? ` wordle-tile--${example.state}` : ''}`}
              >
                {char}
              </div>
            ))}
          </div>
          <p className="small muted center">{example.note}</p>
        </div>
      ))}
    </div>
  );
}

export default function WordleGame() {
  const dataset = useDataset();
  const [difficulty, setDifficulty] = useDifficulty();
  const [game, setGame] = useState<GameState | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // A handle only works as an answer at a playable length, so eligibility has to
  // be part of choosing the tier, not a filter applied after it.
  const poolFor = useCallback(
    (level: Difficulty) => dataset.playersFor(level, { minimum: 1, eligible }),
    [dataset],
  );

  const counts = useMemo(() => {
    const entries = DIFFICULTIES.map((level) => [level, poolFor(level).length] as const);
    return Object.fromEntries(entries) as Record<Difficulty, number>;
  }, [poolFor]);

  const newGame = useCallback(
    (level: Difficulty) => {
      setGame(createGame(poolFor(level)));
      setDraft('');
      setMessage(null);
    },
    [poolFor],
  );

  const changeDifficulty = (level: Difficulty) => {
    setDifficulty(level);
    newGame(level);
  };

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
  }, [game, draft]);

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
      <GameShell game={meta} examples={<Examples />}>
        <Setup
          difficulty={difficulty}
          counts={counts}
          onDifficulty={setDifficulty}
          onStart={() => newGame(difficulty)}
          exhausted={counts[difficulty] === 0}
        />
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
      examples={<Examples />}
      toolbar={
        <>
          {finished ? null : <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />}
          <button type="button" className="icon-btn" onClick={() => setGame(null)}>
            ↺ Change level
          </button>
        </>
      }
    >
      <div className="stack">
        {/* Where a length / guess / solved readout used to be. The grid already
            shows both of those; the level is the one thing it cannot show. */}
        <DifficultySwitch value={difficulty} onChange={changeDifficulty} />

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
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? 'Solved!' : 'Round over'}
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
                  {game.secret.team ? ` · ${game.secret.team}` : ''} · {playerMoney(game.secret)} ·{' '}
                  {game.secret.fncsWins} FNCS
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              onClick={() => newGame(difficulty)}
            >
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

/**
 * Difficulty as a first step rather than a control on the board, so the level
 * is a decision you make before meeting a secret player — the same shape as
 * picking a category in Higher or Lower and Tenaball.
 */
function Setup({
  difficulty,
  counts,
  onDifficulty,
  onStart,
  exhausted,
}: {
  difficulty: Difficulty;
  counts: Record<Difficulty, number>;
  onDifficulty: (value: Difficulty) => void;
  onStart: () => void;
  exhausted: boolean;
}) {
  return (
    <div className="stack">
      <section className="card stack">
        <div className="card__title">Pick a difficulty</div>
        <DifficultyCards value={difficulty} onChange={onDifficulty} counts={counts} />
        <p className="tiny faint">
          This picks how well known the secret player is, not how the guessing works. You can switch level on
          the board too — it deals a new player.
        </p>
      </section>

      {exhausted ? (
        <Banner tone="danger" title="No puzzle available">
          No player at this difficulty has a name this game can use.
        </Banner>
      ) : null}

      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={exhausted} onClick={onStart}>
        Start
      </button>
      <p className="tiny faint center">
        6 guesses · {plural(counts[difficulty], 'possible answer')} at this level
      </p>
    </div>
  );
}

import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { GiveUpButton } from '@/components/GiveUpButton';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Banner } from '@/components/ui';
import { DifficultyCards, DifficultySwitch, useDifficulty } from '@/components/DifficultyPicker';
import { type Difficulty } from '@/games/shared/difficulty';
import { EXPORT_DATE, SOURCE, type Roster } from '@/data/liquipedia/roster';
import { useRoster } from '@/data/liquipedia/useRoster';
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
 * The rules, shown rather than described.
 *
 * Real handles, so the examples double as a hint about what the answers look
 * like. MITR0 carries the digit rule, which reads as a footnote in prose and as
 * an obvious fact the moment you see a 0 in a tile; ANNAS carries the
 * repeated-character rule, which is the one that catches people out — nearly
 * half the answers in the roster repeat a character, so guessing two of
 * something the name only has one of happens constantly.
 *
 * `states` is one entry per tile, `null` for a tile left neutral so the eye
 * goes to the one being explained.
 */
const EXAMPLES: { word: string; states: (TileState | null)[]; note: string }[] = [
  {
    word: 'BUGHA',
    states: ['correct', null, null, null, null],
    note: 'B is in the player’s name and in the correct spot.',
  },
  {
    word: 'MITR0',
    states: [null, null, null, null, 'present'],
    note: '0 is in the player’s name but in the wrong spot — digits are characters too.',
  },
  {
    word: 'ACORN',
    states: [null, 'absent', null, null, null],
    note: 'C is not in the player’s name in any spot.',
  },
  {
    word: 'ANNAS',
    states: [null, 'present', 'absent', null, null],
    note: 'Two N’s guessed, but the name only has one: the first is yellow, the second greys out. On a repeated character, grey means “no more of these”, not “none at all”.',
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
            {example.word.split('').map((char, index) => {
              const state = example.states[index];
              return (
                <div key={index} className={`wordle-tile${state ? ` wordle-tile--${state}` : ''}`}>
                  {char}
                </div>
              );
            })}
          </div>
          <p className="small muted center">{example.note}</p>
        </div>
      ))}
    </div>
  );
}

export default function WordleGame() {
  const { roster, error } = useRoster();

  if (error) {
    return (
      <div className="card banner banner--danger">
        <div>
          <div className="banner__title">Player data unavailable</div>
          <div className="small">{error}</div>
        </div>
      </div>
    );
  }
  if (!roster) return <div className="card center muted">Loading players…</div>;
  return <Game roster={roster} />;
}

/** Where the secret players come from, and under what licence. */
function RosterNote() {
  return (
    <p className="tiny faint">
      Secret players come from{' '}
      <a href={SOURCE.url} className="link" target="_blank" rel="noreferrer noopener">
        {SOURCE.name}
      </a>{' '}
      (last update {formatDate(EXPORT_DATE)}), reused under{' '}
      <a href={SOURCE.licenseUrl} className="link" target="_blank" rel="noreferrer noopener">
        {SOURCE.license}
      </a>
      . FNCS titles come from Wikipedia’s “Competitive Fortnite records and statistics”.{' '}
      <Link to="/credits" className="link">
        Full attribution
      </Link>
      .
    </p>
  );
}

function Game({ roster }: { roster: Roster }) {
  const [difficulty, setDifficulty] = useDifficulty();
  const [game, setGame] = useState<GameState | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  // A handle only works as an answer at a playable length, so eligibility has to
  // be part of choosing the tier, not a filter applied after it.
  const poolFor = useCallback(
    (level: Difficulty) => roster.playersFor(level, { minimum: 1, eligible }),
    [roster],
  );

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
      <GameShell game={meta} examples={<Examples />} dataNote={<RosterNote />}>
        <Setup
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          onStart={() => newGame(difficulty)}
          exhausted={poolFor(difficulty).length === 0}
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
      dataNote={<RosterNote />}
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
                  {game.secret.country ? (
                    <>
                      <CountryBadge
                        code={game.secret.country}
                        name={game.secret.countryName ?? game.secret.country}
                      />{' '}
                    </>
                  ) : null}
                  {game.secret.countryName ?? 'Unknown'}
                  {game.secret.team ? ` · ${game.secret.team}` : ''} · {playerMoney(game.secret)} ·{' '}
                  {plural(game.secret.fncsWins, 'FNCS win')}
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
  onDifficulty,
  onStart,
  exhausted,
}: {
  difficulty: Difficulty;
  onDifficulty: (value: Difficulty) => void;
  onStart: () => void;
  exhausted: boolean;
}) {
  return (
    <div className="stack">
      <section className="card stack">
        <div className="card__title">Pick a difficulty</div>
        <DifficultyCards value={difficulty} onChange={onDifficulty} />
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
      <p className="tiny faint center">6 guesses</p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { GiveUpButton } from '@/components/GiveUpButton';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner } from '@/components/ui';
import { deal, rotationKey } from '@/games/shared/rotation';
import { useEventMode } from '@/games/shared/mode';
import { poolScope, resolvePool, usePoolChoice } from '@/games/shared/pool';
import type { Pools } from '@/data/liquipedia/pools';
import { type Roster } from '@/data/liquipedia/roster';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { playerMoney, plural } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  eligible,
  gameFor,
  giveUp,
  hasDigits,
  keyboardState,
  MAX_GUESSES,
  revealedDigits,
  revealSchedule,
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
 * an obvious fact the moment you see a 0 in a tile.
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
  const { pools } = usePools();
  return (
    <LiquipediaGate error={error} ready={Boolean(roster)}>
      {roster ? <Game roster={roster} pools={pools} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, pools }: { roster: Roster; pools: Pools | null }) {
  const [choice, setChoice] = usePoolChoice();
  const [event] = useEventMode();
  const [game, setGame] = useState<GameState | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  /** Set when a round opened a fresh cycle, so the board can say so. */
  const [wrapped, setWrapped] = useState(false);

  // A handle only works as an answer at a playable length, so eligibility has
  // to be part of choosing the pool, not a filter applied after it.
  const players = useMemo(
    () => resolvePool(roster, pools, event, choice, eligible, 1),
    [roster, pools, event, choice],
  );

  /**
   * Deal a player nobody in this pool has had yet.
   *
   * The cycle is keyed by everything that changes who is in the bag, so
   * switching region or level starts a separate cycle rather than poisoning
   * the one you were on.
   */
  const newGame = useCallback(() => {
    const key = rotationKey(meta.id, ...poolScope(event, choice));
    const drawn = deal(players, readLocal<string[]>(key, []));
    if (drawn) writeLocal(key, drawn.seen);
    setGame(drawn ? gameFor(drawn.pick) : null);
    setWrapped(drawn?.wrapped ?? false);
    setDraft('');
    setMessage(null);
  }, [players, event, choice]);

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

  // Physical keyboard support — the on-screen one is for touch. The parameter
  // is `stroke` rather than the usual `event`, which now means the site-wide
  // event mode everywhere else in this file.
  useEffect(() => {
    const onKey = (stroke: KeyboardEvent) => {
      if (stroke.metaKey || stroke.ctrlKey || stroke.altKey) return;
      if (stroke.key === 'Enter') press('ENTER');
      else if (stroke.key === 'Backspace') press('DEL');
      else if (/^[a-zA-Z0-9]$/.test(stroke.key)) press(stroke.key.toUpperCase());
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  if (!game) {
    return (
      <GameShell game={meta} examples={<Examples />} dataNote={<RosterNote fncs />}>
        <div className="stack">
          <PoolSetup
            roster={roster}
            pools={pools}
            event={event}
            value={choice}
            onChange={setChoice}
            eligible={eligible}
            onStart={newGame}
            canStart={players.length > 0}
          />
          {players.length === 0 ? (
            <Banner tone="danger" title="No puzzle available">
              No player in this pool has a name this game can use.
            </Banner>
          ) : null}
          <p className="tiny faint center">
            6 guesses · every player in the pool comes up once before any of them comes round again
          </p>
        </div>
      </GameShell>
    );
  }

  const keys = keyboardState(game);
  const finished = game.status !== 'playing';
  const digits = revealedDigits(game);
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
      dataNote={<RosterNote fncs />}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => setGame(null)}>
          ⚙ Setup
        </button>
      }
    >
      <div className="stack">
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

        {/*
          Only once a digit has actually been handed over.
          The strip used to appear from guess one as a row of blanks reading
          "This name has 1 digit in it" — which gives away the length of the
          answer and the fact that it contains a digit, three guesses before the
          game intends to tell you either. Nothing to show is now shown as
          nothing.
        */}
        {hasDigits(game.answer) && !finished && digits.size > 0 ? (
          <DigitHint answer={game.answer} shown={digits} guesses={game.guesses.length} />
        ) : null}

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
                  {game.secret.countryName ?? 'Unknown'}
                  {game.secret.team ? ` · ${game.secret.team}` : ''} · {playerMoney(game.secret)} ·{' '}
                  {plural(game.secret.fncsWins, 'FNCS win')}
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={newGame}>
              New game
            </button>
          </div>
        ) : (
          <>
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
            <div className="row" style={{ justifyContent: 'center' }}>
              <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
            </div>
          </>
        )}

        {wrapped ? (
          <p className="tiny faint center">
            You have now had every player in this pool — starting again, reshuffled.
          </p>
        ) : null}
      </div>
    </GameShell>
  );
}

/**
 * The digits in the answer, handed over on a schedule.
 *
 * Shown as a skeleton of the whole word rather than a sentence, because "the
 * third character is a 0" is a fact you then have to hold in your head while
 * counting tiles. A row of blanks with the digit sitting in its own slot is
 * the same fact, already positioned.
 *
 * Only rendered once the first digit has landed — before that there is nothing
 * to say that is not a spoiler. See the call site.
 */
function DigitHint({
  answer,
  shown,
  guesses,
}: {
  answer: string;
  shown: Map<number, string>;
  guesses: number;
}) {
  const schedule = revealSchedule(answer);
  const pending = [...schedule.values()].filter((after) => guesses < after);
  const next = pending.length > 0 ? Math.min(...pending) : null;

  /*
   * Which digits arrived on *this* guess, so they can be announced rather than
   * quietly appearing. A reveal is the only thing this game ever gives you for
   * free and it used to slide in unmarked under a grid you were staring at.
   */
  const justRevealed = new Set(
    [...schedule.entries()].filter(([, after]) => after === guesses).map(([position]) => position),
  );

  return (
    <div className="wordle-hint">
      <div className="wordle-hint__row" aria-label="Known digits">
        {answer.split('').map((_char, index) => (
          <span
            key={index}
            className={[
              'wordle-hint__cell',
              shown.has(index) ? 'wordle-hint__cell--shown' : '',
              justRevealed.has(index) ? 'wordle-hint__cell--new' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {shown.get(index) ?? ''}
          </span>
        ))}
      </div>
      {justRevealed.size > 0 ? (
        <p className="wordle-hint__pop" role="status">
          {justRevealed.size === 1 ? 'Digit revealed' : `${justRevealed.size} digits revealed`} — it
          is on the keyboard too
        </p>
      ) : (
        <p className="tiny faint center">
          {`${shown.size} of ${plural(schedule.size, 'digit')} shown.`}
          {next !== null ? ` Next after guess ${next}.` : ''}
        </p>
      )}
    </div>
  );
}

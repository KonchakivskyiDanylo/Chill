import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { GiveUpButton } from '@/components/GiveUpButton';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { Banner } from '@/components/ui';
import { DifficultyCards, DifficultySwitch, useDifficulty } from '@/components/DifficultyPicker';
import { RegionCards, RegionChip, useRegion, type RegionChoice } from '@/components/RegionPicker';
import { DIFFICULTIES, type Difficulty } from '@/games/shared/difficulty';
import { deal, rotationKey } from '@/games/shared/rotation';
import { type Roster, type RosterPlayer } from '@/data/liquipedia/roster';
import { useRoster } from '@/data/liquipedia/useRoster';
import { playerMoney, plural } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  eligible,
  gameFor,
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
  return (
    <LiquipediaGate error={error} ready={Boolean(roster)}>
      {roster ? <Game roster={roster} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster }: { roster: Roster }) {
  const [difficulty, setDifficulty] = useDifficulty();
  const [storedRegion, setRegion] = useRegion();
  // The choice is remembered across sessions, and the export's region labels
  // are not ours to guarantee. One that is no longer in the data reads as "all".
  const region = storedRegion && !roster.regions.includes(storedRegion) ? null : storedRegion;
  const [game, setGame] = useState<GameState | null>(null);
  const [draft, setDraft] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  /** Set when a round opened a fresh cycle, so the board can say so. */
  const [wrapped, setWrapped] = useState(false);

  // A handle only works as an answer at a playable length, so eligibility has to
  // be part of choosing the pool, not a filter applied after it.
  const poolFor = useCallback(
    (level: Difficulty, where: RegionChoice) =>
      roster.playersFor(level, { minimum: 1, eligible, region: where }),
    [roster],
  );

  /**
   * Deal a player nobody in this pool has had yet.
   *
   * The cycle is keyed by region *and* level because those are the two things
   * that change who is in the bag; switching level starts a separate cycle
   * rather than poisoning the one you were on.
   */
  const newGame = useCallback(
    (level: Difficulty, where: RegionChoice) => {
      const key = rotationKey(meta.id, where, level);
      const drawn = deal(poolFor(level, where), readLocal<string[]>(key, []));
      if (drawn) writeLocal(key, drawn.seen);
      setGame(drawn ? gameFor(drawn.pick) : null);
      setWrapped(drawn?.wrapped ?? false);
      setDraft('');
      setMessage(null);
    },
    [poolFor],
  );

  const changeDifficulty = (level: Difficulty) => {
    setDifficulty(level);
    newGame(level, region);
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
      <GameShell game={meta} examples={<Examples />} dataNote={<RosterNote fncs />}>
        <Setup
          roster={roster}
          poolFor={poolFor}
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          region={region}
          onRegion={setRegion}
          onStart={() => newGame(difficulty, region)}
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
      dataNote={<RosterNote fncs />}
      toolbar={
        <>
          {finished ? null : <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />}
          <button type="button" className="icon-btn" onClick={() => setGame(null)}>
            ↺ Change setup
          </button>
        </>
      }
    >
      <div className="stack">
        {/* Where a length / guess / solved readout used to be. The grid already
            shows both of those; the level and the region are what it cannot. */}
        <div className="row-between" style={{ gap: 8 }}>
          <DifficultySwitch value={difficulty} onChange={changeDifficulty} />
          <RegionChip region={region} />
        </div>

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
                  {game.secret.countryName ?? 'Unknown'}
                  {game.secret.team ? ` · ${game.secret.team}` : ''} · {playerMoney(game.secret)} ·{' '}
                  {plural(game.secret.fncsWins, 'FNCS win')}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              onClick={() => newGame(difficulty, region)}
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
 * Region first, then difficulty, then start.
 *
 * That order because difficulty depends on the region: the counts under the
 * three cards are counts *within* the region you picked, and in a small region
 * a level can be empty. Picking level first and region second would move the
 * ground under a choice already made.
 */
function Setup({
  roster,
  poolFor,
  difficulty,
  onDifficulty,
  region,
  onRegion,
  onStart,
}: {
  roster: Roster;
  poolFor: (level: Difficulty, region: RegionChoice) => RosterPlayer[];
  difficulty: Difficulty;
  onDifficulty: (value: Difficulty) => void;
  region: RegionChoice;
  onRegion: (value: RegionChoice) => void;
  onStart: () => void;
}) {
  const regionCounts = useMemo(() => {
    const counts = new Map<RegionChoice, number>();
    for (const where of [null, ...roster.regions]) {
      counts.set(
        where,
        DIFFICULTIES.reduce((n, level) => n + roster.exactly(level, { eligible, region: where }).length, 0),
      );
    }
    return counts;
  }, [roster]);

  // Exact counts, never widened: a card that says 0 has to mean 0.
  const levelCounts = useMemo(
    () =>
      Object.fromEntries(
        DIFFICULTIES.map((level) => [level, roster.exactly(level, { eligible, region }).length]),
      ) as Record<Difficulty, number>,
    [roster, region],
  );

  const exhausted = poolFor(difficulty, region).length === 0;
  const empty = levelCounts[difficulty] === 0;

  return (
    <div className="stack">
      <section className="card stack">
        <div className="card__title">Pick a region</div>
        <RegionCards regions={roster.regions} value={region} onChange={onRegion} counts={regionCounts} />
      </section>

      <section className="card stack">
        <div className="card__title">Pick a difficulty</div>
        <DifficultyCards value={difficulty} onChange={onDifficulty} counts={levelCounts} />
        <p className="tiny faint">
          This picks how well known the secret player is, not how the guessing works. With a region chosen
          the levels are ranked inside that region, so “Easy” means well known in Asia, not well known
          worldwide. You can switch level on the board too — it deals a new player.
        </p>
      </section>

      {empty && !exhausted ? (
        <Banner tone="info" title="Nobody at this level here">
          No {region} player is ranked {difficulty}. Starting will deal from the next closest level in{' '}
          {region}.
        </Banner>
      ) : null}

      {exhausted ? (
        <Banner tone="danger" title="No puzzle available">
          No player in this region has a name this game can use.
        </Banner>
      ) : null}

      <button type="button" className="btn btn--primary btn--lg btn--block" disabled={exhausted} onClick={onStart}>
        Start
      </button>
      <p className="tiny faint center">
        6 guesses · every player in the pool comes up once before any of them comes round again
      </p>
    </div>
  );
}

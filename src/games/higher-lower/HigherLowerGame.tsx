import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { LevelSetup, type LevelOption } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import type { Pools } from '@/data/liquipedia/pools';
import { EXPORT_DATE, SOURCE, type Roster, type RosterPlayer } from '@/data/liquipedia/roster';
import { useEventMode } from '@/games/shared/mode';
import { poolPlayers } from '@/games/shared/pool';
import { playerMoney, plural } from '@/lib/format';
import { CountryBadge } from '@/components/CountryBadge';
import { useBestScore, useLocalState } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  CATEGORIES,
  CLOSENESS_ICON,
  correctAnswer,
  createGame,
  giveUp,
  hasEqualButton,
  nextRound,
  SCHEDULE,
  submitAnswer,
  WINDOW,
  type Answer,
  type Category,
  type Difficulty,
  type GameState,
} from './engine';
import './higher-lower.css';

const meta = getGame('higher-lower')!;

/** A level's schedule as the six coloured steps it walks through. */
const steps = (difficulty: Difficulty) => SCHEDULE[difficulty].map((step) => CLOSENESS_ICON[step]).join('');

/**
 * The levels, each described by what it does to a run.
 *
 * There is no separate fame setting any more — see the pairing notes in
 * `engine.ts`. The row of dots is the schedule itself, four rounds a dot.
 */
const LEVELS: LevelOption<Difficulty>[] = [
  {
    id: 'easy',
    label: '🟢 Easy',
    hint: (
      <>
        Big gaps between famous names, closing slowly. Top {WINDOW.easy.cap} earners only.
        <span className="tiny faint" style={{ display: 'block' }}>
          {steps('easy')}
        </span>
      </>
    ),
  },
  {
    id: 'medium',
    label: '🟡 Medium',
    hint: (
      <>
        Starts the same, tightens much sooner. Reaches the top {WINDOW.medium.cap.toLocaleString('en-US')}.
        <span className="tiny faint" style={{ display: 'block' }}>
          {steps('medium')}
        </span>
      </>
    ),
  },
  {
    id: 'hard',
    label: '🔴 Hard',
    hint: (
      <>
        Near-level pairs within a few rounds, anyone on record, and an Equal button.
        <span className="tiny faint" style={{ display: 'block' }}>
          {steps('hard')}
        </span>
      </>
    ),
  },
];

function displayValue(player: RosterPlayer, category: Category): string {
  if (category === 'age') return `${player.age} years old`;
  if (category === 'fncsWins') return plural(player.fncsWins, 'FNCS win');
  return playerMoney(player);
}

/**
 * The fact shown under the revealed value: something true about the player
 * that is not the answer to the round they just played.
 */
function secondaryFact(player: RosterPlayer, category: Category): string {
  return category === 'fncsWins' ? playerMoney(player) : plural(player.fncsWins, 'FNCS win');
}

export default function HigherLowerGame() {
  const { roster, error: loadError } = useRoster();
  const { pools } = usePools();

  if (loadError) {
    return (
      <div className="card banner banner--danger">
        <div>
          <div className="banner__title">Player data unavailable</div>
          <div className="small">{loadError}</div>
        </div>
      </div>
    );
  }
  if (!roster) return <div className="card center muted">Loading players…</div>;
  return <Game roster={roster} pools={pools} />;
}

function Game({ roster, pools }: { roster: Roster; pools: Pools | null }) {
  const [event] = useEventMode();
  const [category, setCategory] = useState<Category>('earnings');
  const [difficulty, setDifficulty] = useLocalState<Difficulty>('higher-lower:level', 'easy');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Keyed by the level alone now that it is the only setting. Scores from the
  // old region / fame / status scopes are left where they are: they were
  // earned under a different pairing and are not the same record.
  const scope = `higher-lower:${category}:${event ? `event:${event}` : 'roster'}:${difficulty}`;
  const { best, submit: submitBest } = useBestScore(scope);

  /**
   * The whole roster, or the event's field. The level narrows it round by
   * round from the top earners down, so nothing is cut from it up front.
   */
  const players = useMemo(() => {
    const field = poolPlayers(roster, pools, event);
    return field.length > 0 ? field : roster.players;
  }, [roster, pools, event]);

  const start = useCallback(() => {
    const created = createGame(players, category, difficulty);
    if (!created) {
      setError('Not enough players in this field have that value on record.');
      return;
    }
    setError(null);
    setGame(created);
  }, [players, category, difficulty]);

  // Reveal the answer for a beat, then slide to the next pair.
  useEffect(() => {
    if (game?.status !== 'revealed') return;
    const timer = window.setTimeout(() => setGame((prev) => (prev ? nextRound(prev) : prev)), 1100);
    return () => window.clearTimeout(timer);
  }, [game?.status, game?.challenger.id]);

  useEffect(() => {
    if (game && (game.status === 'gameover' || game.status === 'cleared')) submitBest(game.score);
  }, [game, submitBest]);

  const answer = (choiceMade: Answer) =>
    setGame((prev) => (prev ? submitAnswer(prev, choiceMade) : prev));

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote />}
      toolbar={
        game ? (
          <button type="button" className="icon-btn" onClick={() => setGame(null)}>
            ⚙ Setup
          </button>
        ) : null
      }
    >
      {!game ? (
        <div className="stack">
          <LevelSetup
            pools={pools}
            event={event}
            levels={LEVELS}
            value={difficulty}
            onChange={setDifficulty}
            onStart={start}
            startLabel="Start endless run"
            extra={
              <section className="card stack">
                <div className="card__title">Category</div>
                <OptionGrid>
                  {CATEGORIES.map((item) => (
                    <OptionCard
                      key={item.id}
                      label={item.label}
                      hint={item.hint}
                      selected={category === item.id}
                      onClick={() => setCategory(item.id)}
                    />
                  ))}
                </OptionGrid>
              </section>
            }
          />
          {error ? (
            <Banner tone="danger" title="Cannot start">
              {error}
            </Banner>
          ) : null}
          <p className="tiny faint center">Endless mode · one mistake ends the run</p>
        </div>
      ) : (
        <Board game={game} best={best} onAnswer={answer} onRestart={start} onGiveUp={() => setGame(giveUp(game))} />
      )}
    </GameShell>
  );
}

/** Where this game's numbers come from, and under what licence. */
function RosterNote() {
  const source = SOURCE;
  return (
    <p className="tiny faint">
      Player values come from{' '}
      <a href={source.url} className="link" target="_blank" rel="noreferrer noopener">
        {source.name}
      </a>{' '}
      (last update {formatDate(EXPORT_DATE)}), reused under{' '}
      <a href={source.licenseUrl} className="link" target="_blank" rel="noreferrer noopener">
        {source.license}
      </a>
      . FNCS titles come from Wikipedia’s “Competitive Fortnite records and statistics”. Where a source
      publishes no figure the player is left out of that category rather than counted as a zero.{' '}
      <Link to="/credits" className="link">
        Full attribution
      </Link>
      .
    </p>
  );
}

function Board({
  game,
  best,
  onAnswer,
  onRestart,
  onGiveUp,
}: {
  game: GameState;
  best: number;
  onAnswer: (answer: Answer) => void;
  onRestart: () => void;
  onGiveUp: () => void;
}) {
  const categoryMeta = CATEGORIES.find((c) => c.id === game.category)!;
  const revealed = game.status !== 'playing';
  const finished = game.status === 'gameover' || game.status === 'cleared';
  const truth = correctAnswer(game);

  return (
    <div className="stack">
      <div className="stats">
        <Stat label="Score" value={game.score} />
        <Stat label="Best" value={Math.max(best, game.score)} />
      </div>

      <div className="hl-prompt">
        <span className="chip chip--primary">{categoryMeta.title}</span>
      </div>

      <div className="hl-board">
        <PlayerPanel
          player={game.current}
          category={game.category}
          value={displayValue(game.current, game.category)}
        />
        <div className="hl-vs" aria-hidden="true">
          VS
        </div>
        <PlayerPanel
          player={game.challenger}
          category={game.category}
          value={revealed ? displayValue(game.challenger, game.category) : null}
          tone={
            revealed && game.lastAnswer ? (game.status === 'gameover' ? 'wrong' : 'right') : undefined
          }
        />
      </div>

      {finished ? (
        <div className="stack">
          {game.status === 'cleared' ? (
            <Banner tone="success" title="🎉 You ran out of players! You won!">
              {/* Not necessarily the whole pool: FNCS Wins stops once there is
                  no title-holder left to pair against, because a round where
                  neither player has won one is not a question. */}
              You scored {game.score} and exhausted every pair this category had left.
            </Banner>
          ) : (
            <Banner tone="danger" title={game.lastAnswer ? 'Run over' : 'Gave up'}>
              {game.challenger.name} was {displayValue(game.challenger, game.category)} — the answer was{' '}
              <strong>{truth}</strong>. Final score: {game.score}.
            </Banner>
          )}
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={onRestart}>
            Play again
          </button>
        </div>
      ) : (
        <div className="stack-sm">
          <div className="hl-answers">
            <button
              type="button"
              className="btn btn--lg hl-answer"
              disabled={revealed}
              onClick={() => onAnswer('higher')}
            >
              ▲ Higher
            </button>
            {hasEqualButton(game.difficulty) ? (
              <button
                type="button"
                className="btn btn--lg hl-answer"
                disabled={revealed}
                onClick={() => onAnswer('equal')}
              >
                = Equal
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn--lg hl-answer"
              disabled={revealed}
              onClick={() => onAnswer('lower')}
            >
              ▼ Lower
            </button>
          </div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <GiveUpButton onGiveUp={onGiveUp} />
          </div>
        </div>
      )}

      <p className="tiny faint center">
        Is {game.challenger.name}’s {categoryMeta.title.toLowerCase()} higher or lower than{' '}
        {game.current.name}’s?
        {/* Only Hard is ever dealt a tie, so only Hard needs telling. */}
        {hasEqualButton(game.difficulty) ? ' Or exactly equal — Hard deals ties.' : ''}
      </p>
    </div>
  );
}

function PlayerPanel({
  player,
  category,
  value,
  tone,
}: {
  player: RosterPlayer;
  category: Category;
  value: string | null;
  tone?: 'right' | 'wrong';
}) {
  return (
    <div className={`hl-panel${tone ? ` hl-panel--${tone}` : ''}`}>
      <PlayerAvatar player={player} size={72} />
      <div className="hl-panel__name">{player.name}</div>
      <div className="hl-panel__meta">
        {player.country ? (
          <>
            <CountryBadge code={player.country} name={player.countryName ?? player.country} />{' '}
          </>
        ) : null}
        {player.countryName ?? 'Unknown'}
        {player.team ? ` · ${player.team}` : ''}
      </div>
      <div className={`hl-panel__value${value ? '' : ' hl-panel__value--hidden'}`}>{value ?? '???'}</div>
      {/* Only shown once the value is out — the two numbers correlate. */}
      <div className="tiny faint">{value ? secondaryFact(player, category) : ' '}</div>
    </div>
  );
}

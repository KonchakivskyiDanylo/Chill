import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatDate, GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import { DifficultyCards, DifficultyChip, useDifficulty } from '@/components/DifficultyPicker';
import { DIFFICULTIES } from '@/games/shared/difficulty';
import { useRoster } from '@/data/liquipedia/useRoster';
import { EXPORT_DATE, SOURCE, type Roster, type RosterPlayer } from '@/data/liquipedia/roster';
import { playerMoney, plural } from '@/lib/format';
import { CountryBadge } from '@/components/CountryBadge';
import { useBestScore } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  CATEGORIES,
  correctAnswer,
  createGame,
  eligible,
  giveUp,
  hasEqualButton,
  nextRound,
  submitAnswer,
  type Answer,
  type Category,
  type Difficulty,
  type GameState,
} from './engine';
import './higher-lower.css';

const meta = getGame('higher-lower')!;

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
  return <Game roster={roster} />;
}

function Game({ roster }: { roster: Roster }) {
  const [category, setCategory] = useState<Category | null>(null);
  const [difficulty, setDifficulty] = useDifficulty();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scope = `higher-lower:${category ?? 'none'}:${difficulty}`;
  const { best, submit: submitBest } = useBestScore(scope);

  /**
   * The pool one level offers, which is the fame tier minus anyone missing the
   * value this category compares — a player with no birth date cannot be part
   * of an Age run. Undefined until a category is picked, because until then
   * there is no eligibility rule to count against.
   */
  const poolFor = useCallback(
    (tier: Difficulty, forCategory: Category) =>
      roster.playersFor(tier, {
        minimum: 2, // a pair is the smallest run that can be dealt
        eligible: (players) => eligible(players, forCategory),
      }),
    [roster],
  );

  const counts = useMemo(() => {
    if (!category) return undefined;
    const entries = DIFFICULTIES.map((tier) => [tier, poolFor(tier, category).length] as const);
    return Object.fromEntries(entries) as Record<Difficulty, number>;
  }, [poolFor, category]);

  const start = useCallback(
    (nextCategory: Category, nextDifficulty: Difficulty) => {
      const created = createGame(poolFor(nextDifficulty, nextCategory), nextCategory, nextDifficulty);
      if (!created) {
        setError('Not enough players at this difficulty have that value on record.');
        return;
      }
      setError(null);
      setGame(created);
    },
    [poolFor],
  );

  // Reveal the answer for a beat, then slide to the next pair.
  useEffect(() => {
    if (game?.status !== 'revealed') return;
    const timer = window.setTimeout(() => setGame((prev) => (prev ? nextRound(prev) : prev)), 1100);
    return () => window.clearTimeout(timer);
  }, [game?.status, game?.challenger.id]);

  useEffect(() => {
    if (game && (game.status === 'gameover' || game.status === 'cleared')) submitBest(game.score);
  }, [game, submitBest]);

  const answer = (choice: Answer) => setGame((prev) => (prev ? submitAnswer(prev, choice) : prev));

  const reset = () => {
    setGame(null);
    setCategory(null);
  };

  const toolbar = game ? (
    <>
      {game.status === 'playing' ? (
        <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
      ) : null}
      <button type="button" className="icon-btn" onClick={reset}>
        ↺ Change mode
      </button>
    </>
  ) : null;

  return (
    <GameShell game={meta} toolbar={toolbar} dataNote={<RosterNote />}>
      {!game ? (
        <Setup
          category={category}
          difficulty={difficulty}
          counts={counts}
          onCategory={setCategory}
          onDifficulty={setDifficulty}
          onStart={start}
          error={error}
        />
      ) : (
        <Board game={game} best={best} onAnswer={answer} onRestart={() => start(game.category, game.difficulty)} />
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

function Setup({
  category,
  difficulty,
  counts,
  onCategory,
  onDifficulty,
  onStart,
  error,
}: {
  category: Category | null;
  difficulty: Difficulty;
  counts?: Record<Difficulty, number>;
  onCategory: (value: Category) => void;
  onDifficulty: (value: Difficulty) => void;
  onStart: (category: Category, difficulty: Difficulty) => void;
  error: string | null;
}) {
  return (
    <div className="stack">
      <section className="card stack">
        <div className="card__title">1 · Pick a category</div>
        <OptionGrid>
          {CATEGORIES.map((item) => (
            <OptionCard
              key={item.id}
              label={item.label}
              hint={item.hint}
              selected={category === item.id}
              onClick={() => onCategory(item.id)}
            />
          ))}
        </OptionGrid>
      </section>

      <section className="card stack">
        <div className="card__title">2 · Pick a difficulty</div>
        <DifficultyCards value={difficulty} onChange={onDifficulty} counts={counts} />
        <p className="tiny faint">
          Hard also adds the Equal button — and expects you to use it when two players match exactly.
        </p>
      </section>

      {error ? <Banner tone="danger" title="Cannot start">{error}</Banner> : null}

      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        disabled={!category}
        onClick={() => category && onStart(category, difficulty)}
      >
        {category ? 'Start endless run' : 'Choose a category'}
      </button>
      <p className="tiny faint center">
        Endless mode · one mistake ends the run
        {counts ? ` · ${plural(counts[difficulty], 'player')} in the pool` : ''}
      </p>
    </div>
  );
}

function Board({
  game,
  best,
  onAnswer,
  onRestart,
}: {
  game: GameState;
  best: number;
  onAnswer: (answer: Answer) => void;
  onRestart: () => void;
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
        <DifficultyChip difficulty={game.difficulty} />
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
            revealed && game.lastAnswer
              ? game.status === 'gameover'
                ? 'wrong'
                : 'right'
              : undefined
          }
        />
      </div>

      {finished ? (
        <div className="stack">
          {game.status === 'cleared' ? (
            <Banner tone="success" title="🎉 You used every player! You won!">
              You made it through all {game.poolSize} players in the pool with a score of {game.score}.
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
      )}

      <p className="tiny faint center">
        Is {game.challenger.name}’s {categoryMeta.title.toLowerCase()} higher or lower than {game.current.name}’s?
        {hasEqualButton(game.difficulty) ? '' : ' Equal values accept either answer.'}
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

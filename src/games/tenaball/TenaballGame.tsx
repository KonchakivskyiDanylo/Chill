import { useCallback, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GuessInput } from '@/components/GuessInput';
import { Banner, OptionCard, OptionGrid, PlayerLine, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import { matchPlayer } from '@/lib/text';
import { getGame } from '@/games/registry';
import {
  applyGuess,
  buildPuzzle,
  CATEGORIES,
  createGame,
  HARD_LIVES,
  type CategoryId,
  type Difficulty,
  type GameState,
  type GuessOutcome,
} from './engine';
import './tenaball.css';

const meta = getGame('tenaball')!;

function outcomeMessage(outcome: GuessOutcome, text: string): { tone: string; message: string } {
  switch (outcome.kind) {
    case 'correct':
      return { tone: 'var(--success)', message: `Correct — that is #${outcome.rank}.` };
    case 'duplicate':
      return { tone: 'var(--warning)', message: `Already found at #${outcome.rank}.` };
    case 'tied':
      return { tone: 'var(--warning)', message: `Level with 10th, but the tie rule leaves them off the board.` };
    case 'unknown':
      return { tone: 'var(--text-muted)', message: `No player called “${text}” in the dataset.` };
    default:
      return { tone: 'var(--danger)', message: `${text} is not in this top 10.` };
  }
}

export default function TenaballGame() {
  const dataset = useDataset();
  const [category, setCategory] = useState<CategoryId | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty | null>(null);
  const [game, setGame] = useState<GameState | null>(null);
  const [feedback, setFeedback] = useState<{ tone: string; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    (nextCategory: CategoryId, nextDifficulty: Difficulty) => {
      const puzzle = buildPuzzle(dataset, nextCategory, String(Date.now()));
      if (!puzzle) {
        setError('The dataset does not have enough players for this category yet.');
        return;
      }
      setError(null);
      setFeedback(null);
      setGame(createGame(puzzle, nextDifficulty));
    },
    [dataset],
  );

  const guess = (text: string) => {
    if (!game) return;
    const player = matchPlayer(text, dataset.players);
    const { state, outcome } = applyGuess(game, player);
    setGame(state);
    setFeedback(outcomeMessage(outcome, player?.name ?? text));
  };

  if (!game) {
    return (
      <GameShell game={meta}>
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
                  onClick={() => setCategory(item.id)}
                />
              ))}
            </OptionGrid>
          </section>
          <section className="card stack">
            <div className="card__title">2 · Pick a difficulty</div>
            <OptionGrid>
              <OptionCard
                label="Easy"
                hint="Unlimited guesses. Just find all ten."
                selected={difficulty === 'easy'}
                onClick={() => setDifficulty('easy')}
              />
              <OptionCard
                label="Hard"
                hint={`${HARD_LIVES} lives. Every wrong answer costs one.`}
                selected={difficulty === 'hard'}
                onClick={() => setDifficulty('hard')}
              />
            </OptionGrid>
          </section>
          {error ? (
            <Banner tone="danger" title="Cannot start">
              {error}
            </Banner>
          ) : null}
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={!category || !difficulty}
            onClick={() => category && difficulty && start(category, difficulty)}
          >
            {category && difficulty ? 'Start' : 'Choose a category and difficulty'}
          </button>
        </div>
      </GameShell>
    );
  }

  const finished = game.status !== 'playing';
  const { puzzle } = game;

  return (
    <GameShell
      game={meta}
      toolbar={
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setGame(null);
            setFeedback(null);
          }}
        >
          ↺ Change category
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Found" value={`${game.found.size}/${puzzle.slots.length}`} />
          <Stat label="Lives" value={game.difficulty === 'hard' ? game.lives : '∞'} />
          <Stat label="Misses" value={game.wrong.length} />
        </div>

        <section className="card stack">
          <h2>{puzzle.title}</h2>
          <p className="tiny faint">{puzzle.tieRule}</p>

          <ol className="tb-slots list-reset">
            {puzzle.slots.map((slot) => {
              const revealed = game.found.has(slot.rank) || finished;
              const missed = finished && !game.found.has(slot.rank);
              return (
                <li key={slot.rank} className={`tb-slot${revealed ? ' tb-slot--filled' : ''}${missed ? ' tb-slot--missed' : ''}`}>
                  <span className="tb-slot__rank">{slot.rank}</span>
                  {revealed ? (
                    <>
                      <PlayerLine
                        player={slot.player}
                        size={32}
                        meta={slot.player.team ?? slot.player.countryName}
                      />
                      <span className="spacer" />
                      <span className="tb-slot__value nums">{slot.value}</span>
                    </>
                  ) : (
                    <span className="tb-slot__empty">???</span>
                  )}
                </li>
              );
            })}
          </ol>
        </section>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? 'All ten found!' : 'Out of lives'}
            >
              {game.status === 'won'
                ? `Completed with ${game.wrong.length} wrong ${game.wrong.length === 1 ? 'guess' : 'guesses'}.`
                : `You found ${game.found.size} of ${puzzle.slots.length}. The full board is revealed above.`}
            </Banner>
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              onClick={() => start(puzzle.category, game.difficulty)}
            >
              New board
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            <GuessInput onSubmit={guess} autoFocus placeholder="Name a player…" />
            {feedback ? (
              <p className="small center" style={{ color: feedback.tone }}>
                {feedback.message}
              </p>
            ) : null}
          </div>
        )}

        {game.wrong.length > 0 ? (
          <section className="card stack-sm">
            <div className="card__title">Wrong guesses</div>
            <div className="row">
              {game.wrong.map((player, index) => (
                <span key={`${player.id}-${index}`} className="chip chip--danger">
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

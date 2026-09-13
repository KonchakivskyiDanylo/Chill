import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GuessInput } from '@/components/GuessInput';
import { Banner, OptionCard, OptionGrid, PlayerLine, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import type { Player } from '@/data/types';
import { formatClock } from '@/lib/format';
import { makeRng } from '@/lib/rng';
import { useBestScore } from '@/lib/storage';
import { matchPlayer } from '@/lib/text';
import { getGame } from '@/games/registry';
import { buildCriteria, drawCriterion, type Criterion } from './criteria';
import './list.css';

const meta = getGame('list')!;

const START_SECONDS = 90;
const BONUS_SECONDS = 5;
const PENALTY_SECONDS = 3;

type Difficulty = 'easy' | 'hard';

export default function ListGame() {
  const dataset = useDataset();
  const criteria = useMemo(() => buildCriteria(dataset), [dataset]);

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [criterion, setCriterion] = useState<Criterion | null>(() =>
    drawCriterion(criteria, makeRng(String(Date.now()))),
  );
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [found, setFound] = useState<Player[]>([]);
  const [timeLeft, setTimeLeft] = useState(START_SECONDS);
  const [feedback, setFeedback] = useState<{ tone: string; message: string } | null>(null);
  const deadlineRef = useRef<number>(0);

  const { best, submit: submitBest } = useBestScore(`list:${difficulty}`);

  // Timer: a deadline plus a tick, so bonuses and penalties simply move the
  // deadline and the display stays accurate even if a tick is late.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const remaining = (deadlineRef.current - Date.now()) / 1000;
      if (remaining <= 0) {
        setTimeLeft(0);
        setRunning(false);
        setFinished(true);
      } else {
        setTimeLeft(remaining);
      }
    };
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [running]);

  useEffect(() => {
    if (finished) submitBest(found.length);
  }, [finished, found.length, submitBest]);

  const start = useCallback(() => {
    if (!criterion) return;
    setFound([]);
    setFeedback(null);
    setFinished(false);
    setTimeLeft(START_SECONDS);
    deadlineRef.current = Date.now() + START_SECONDS * 1000;
    setRunning(true);
  }, [criterion]);

  const shuffleCriterion = () => {
    setCriterion(drawCriterion(criteria, makeRng(String(Date.now())), criterion?.id));
    setFound([]);
    setFinished(false);
    setFeedback(null);
    setTimeLeft(START_SECONDS);
  };

  const adjustTime = (seconds: number) => {
    deadlineRef.current += seconds * 1000;
    setTimeLeft(Math.max(0, (deadlineRef.current - Date.now()) / 1000));
  };

  const guess = (text: string) => {
    if (!running || !criterion) return;
    const player = matchPlayer(text, dataset.players);

    if (!player) {
      if (difficulty === 'hard') adjustTime(-PENALTY_SECONDS);
      setFeedback({
        tone: 'var(--text-muted)',
        message:
          difficulty === 'hard'
            ? `No player called “${text}” — ${PENALTY_SECONDS}s`
            : `No player called “${text}”.`,
      });
      return;
    }
    if (found.some((entry) => entry.id === player.id)) {
      setFeedback({ tone: 'var(--warning)', message: `${player.name} is already on your list.` });
      return;
    }
    if (!criterion.answers.some((answer) => answer.id === player.id)) {
      if (difficulty === 'hard') adjustTime(-PENALTY_SECONDS);
      setFeedback({
        tone: 'var(--danger)',
        message:
          difficulty === 'hard'
            ? `${player.name} does not fit — ${PENALTY_SECONDS}s`
            : `${player.name} does not fit.`,
      });
      return;
    }

    adjustTime(BONUS_SECONDS);
    setFound((prev) => [player, ...prev]);
    setFeedback({ tone: 'var(--success)', message: `${player.name} +${BONUS_SECONDS}s` });
  };

  if (!criterion) {
    return (
      <GameShell game={meta}>
        <Banner tone="danger" title="No criterion available">
          The dataset does not currently support any List criterion.
        </Banner>
      </GameShell>
    );
  }

  const foundIds = new Set(found.map((player) => player.id));
  const missed = criterion.answers.filter((player) => !foundIds.has(player.id));
  const idle = !running && !finished;

  return (
    <GameShell
      game={meta}
      toolbar={
        idle || finished ? (
          <button type="button" className="icon-btn" onClick={shuffleCriterion}>
            ↺ New criterion
          </button>
        ) : null
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Score" value={found.length} />
          <Stat label="Best" value={Math.max(best, found.length)} />
          <Stat
            label="Time"
            value={<span className={timeLeft <= 10 && running ? 'list-clock--low' : ''}>{formatClock(timeLeft)}</span>}
          />
        </div>

        <section className="card stack">
          <div className="card__title">Criterion</div>
          <h2>{criterion.title}</h2>
          {criterion.subtitle ? <p className="small muted">{criterion.subtitle}</p> : null}
          {!running ? (
            <p className="tiny faint">
              {criterion.answers.length} players fit this criterion.
            </p>
          ) : null}
        </section>

        {idle ? (
          <div className="stack">
            <section className="card stack">
              <div className="card__title">Difficulty</div>
              <OptionGrid>
                <OptionCard
                  label="Easy"
                  hint="90 seconds. Wrong answers cost nothing."
                  selected={difficulty === 'easy'}
                  onClick={() => setDifficulty('easy')}
                />
                <OptionCard
                  label="Hard"
                  hint={`90 seconds. Every wrong answer costs ${PENALTY_SECONDS}s.`}
                  selected={difficulty === 'hard'}
                  onClick={() => setDifficulty('hard')}
                />
              </OptionGrid>
            </section>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              Start the clock
            </button>
          </div>
        ) : null}

        {running ? (
          <div className="stack-sm">
            <GuessInput onSubmit={guess} autoFocus placeholder="Name a player…" />
            {feedback ? (
              <p className="small center" style={{ color: feedback.tone }}>
                {feedback.message}
              </p>
            ) : null}
          </div>
        ) : null}

        {found.length > 0 ? (
          <section className="card stack-sm">
            <div className="card__title">Your list ({found.length})</div>
            <div className="list-grid">
              {found.map((player) => (
                <div key={player.id} className="list-chip list-chip--found">
                  <PlayerLine player={player} size={26} showFlag={false} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {finished ? (
          <div className="stack">
            <Banner
              tone={found.length >= criterion.answers.length ? 'success' : 'info'}
              title={
                found.length >= criterion.answers.length
                  ? `Perfect — all ${criterion.answers.length}!`
                  : `Time! ${found.length} of ${criterion.answers.length}`
              }
            >
              {missed.length > 0 ? `You missed ${missed.length}.` : 'You named every single one.'}
            </Banner>

            {missed.length > 0 ? (
              <section className="card stack-sm">
                <div className="card__title">Missed ({missed.length})</div>
                <div className="list-grid">
                  {missed.map((player) => (
                    <div key={player.id} className="list-chip">
                      <PlayerLine player={player} size={26} showFlag={false} />
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="row">
              <button type="button" className="btn btn--primary btn--lg" style={{ flex: 1 }} onClick={start}>
                Play again
              </button>
              <button type="button" className="btn btn--lg" style={{ flex: 1 }} onClick={shuffleCriterion}>
                New criterion
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </GameShell>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Facts } from '@/data/liquipedia/facts';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { useFacts } from '@/data/liquipedia/useFacts';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { formatClock } from '@/lib/format';
import { useBestScore } from '@/lib/storage';
import { getGame } from '@/games/registry';
import { buildCriteria, type Criterion } from './criteria';
import './list.css';

const meta = getGame('list')!;

const START_SECONDS = 90;
const BONUS_SECONDS = 5;
const PENALTY_SECONDS = 3;

type Difficulty = 'easy' | 'hard';

export default function ListGame() {
  const { roster, error: rosterError } = useRoster();
  const { facts, error: factsError } = useFacts();
  const { pools } = usePools();

  return (
    <LiquipediaGate error={rosterError ?? factsError} ready={Boolean(roster && facts)}>
      {roster && facts ? <Game roster={roster} facts={facts} pools={pools} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, facts, pools }: { roster: Roster; facts: Facts; pools: Pools | null }) {
  const criteria = useMemo(() => buildCriteria(roster, facts, pools), [roster, facts, pools]);

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [criterion, setCriterion] = useState<Criterion | null>(null);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  /** Ended by the give-up button rather than by the clock. */
  const [gaveUp, setGaveUp] = useState(false);
  const [found, setFound] = useState<RosterPlayer[]>([]);
  const [timeLeft, setTimeLeft] = useState(START_SECONDS);
  const [feedback, setFeedback] = useState<{ tone: string; message: string } | null>(null);
  const deadlineRef = useRef<number>(0);

  const { best, submit: submitBest } = useBestScore(`list:${criterion?.id ?? 'none'}:${difficulty}`);

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
    setGaveUp(false);
    setTimeLeft(START_SECONDS);
    deadlineRef.current = Date.now() + START_SECONDS * 1000;
    setRunning(true);
  }, [criterion]);

  const adjustTime = (seconds: number) => {
    deadlineRef.current += seconds * 1000;
    setTimeLeft(Math.max(0, (deadlineRef.current - Date.now()) / 1000));
  };

  const guess = (player: RosterPlayer) => {
    if (!running || !criterion) return;

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

  if (criteria.length === 0) {
    return (
      <GameShell game={meta}>
        <Banner tone="danger" title="No categories available">
          The export does not currently support any List category.
        </Banner>
      </GameShell>
    );
  }

  // ------------------------------------------------------------- setup --
  if (!criterion) {
    return (
      <GameShell game={meta} dataNote={<RosterNote what="Answers" generated={facts.generated} />}>
        <div className="stack">
          <section className="card stack">
            <div className="card__title">Difficulty</div>
            <OptionGrid>
              <OptionCard
                label="🟢 Easy"
                hint="90 seconds. Wrong answers cost nothing."
                selected={difficulty === 'easy'}
                onClick={() => setDifficulty('easy')}
              />
              <OptionCard
                label="🔴 Hard"
                hint={`90 seconds. Every wrong answer costs ${PENALTY_SECONDS}s.`}
                selected={difficulty === 'hard'}
                onClick={() => setDifficulty('hard')}
              />
            </OptionGrid>
          </section>

          <section className="card stack">
            <div className="card__title">Pick a list</div>
            <OptionGrid>
              {criteria.map((option) => (
                <OptionCard
                  key={option.id}
                  label={option.title}
                  hint={
                    <>
                      {option.subtitle}
                      <span className="tiny faint" style={{ display: 'block', marginTop: 4 }}>
                        {option.answers.length} to find
                      </span>
                    </>
                  }
                  onClick={() => setCriterion(option)}
                />
              ))}
            </OptionGrid>
          </section>
        </div>
      </GameShell>
    );
  }

  const foundIds = new Set(found.map((player) => player.id));
  const missed = criterion.answers.filter((player) => !foundIds.has(player.id));
  const idle = !running && !finished;

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote what="Answers" generated={facts.generated} />}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => setCriterion(null)}>
          ↺ New list
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Score" value={found.length} />
          <Stat label="Best" value={Math.max(best, found.length)} />
          <Stat
            label="Time"
            value={
              <span className={timeLeft <= 10 && running ? 'list-clock--low' : ''}>
                {formatClock(timeLeft)}
              </span>
            }
          />
        </div>

        <section className="card stack">
          <div className="card__title">Your list</div>
          <h2>{criterion.title}</h2>
          {criterion.subtitle ? <p className="small muted">{criterion.subtitle}</p> : null}
          <p className="tiny faint">{criterion.answers.length} players fit.</p>
        </section>

        {idle ? (
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
            Start the clock
          </button>
        ) : null}

        {running ? (
          <div className="stack-sm">
            {/*
             * Suggestions are safe here now the row is a bare handle: it helps
             * you spell a name you already thought of, and tells you nothing
             * about whether that name is on the list.
             */}
            <PlayerSearch
              players={roster.players}
              onPick={guess}
              exclude={foundIds}
              placeholder="Name a player…"
              buttonLabel="Add"
              autoFocus
            />
            {feedback ? (
              <p className="small center" style={{ color: feedback.tone }}>
                {feedback.message}
              </p>
            ) : null}
            <div className="row" style={{ justifyContent: 'center' }}>
              <GiveUpButton
                onGiveUp={() => {
                  setRunning(false);
                  setFinished(true);
                  setGaveUp(true);
                  setTimeLeft(0);
                  setFeedback(null);
                }}
              />
            </div>
          </div>
        ) : null}

        {found.length > 0 ? (
          <section className="card stack-sm">
            <div className="card__title">Found ({found.length})</div>
            <div className="list-grid">
              {found.map((player) => (
                <div key={player.id} className="list-chip list-chip--found">
                  {player.name}
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
                  : `${gaveUp ? 'Gave up' : 'Time!'} ${found.length} of ${criterion.answers.length}`
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
                      {player.name}
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="row">
              <button type="button" className="btn btn--primary btn--lg" style={{ flex: 1 }} onClick={start}>
                Play again
              </button>
              <button
                type="button"
                className="btn btn--lg"
                style={{ flex: 1 }}
                onClick={() => setCriterion(null)}
              >
                New list
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </GameShell>
  );
}

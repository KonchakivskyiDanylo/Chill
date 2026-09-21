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
import { activePool, useEventMode } from '@/games/shared/mode';
import { poolPlayers } from '@/games/shared/pool';
import { buildCriteria, buildPoolCriteria, type Criterion } from './criteria';
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
  const [event] = useEventMode();
  const pool = activePool(pools, event);

  /**
   * The lists on offer: this field's, or the all-time set.
   *
   * A field is a hundred players, so every list it can produce is derived on
   * the spot — see `buildPoolCriteria`. If the field is too small to fill even
   * one list the all-time set stands in, which is what the note on the setup
   * screen is for.
   */
  const criteria = useMemo(() => {
    if (pool) {
      const scoped = buildPoolCriteria(pool, poolPlayers(roster, pools, event), facts);
      if (scoped.length > 0) return scoped;
    }
    return buildCriteria(roster, facts, pools);
  }, [pool, roster, facts, pools, event]);

  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [criterion, setCriterion] = useState<Criterion | null>(null);
  /** The category search box — see `ListPicker`. */
  const [query, setQuery] = useState('');
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

    /*
     * Naming the last one ends the round, then and there.
     *
     * It used to keep the clock running on an empty list with nothing left to
     * type, until time ran out and the game said "Time! 14 of 14" — which is a
     * win reported as though it were a loss, after thirty seconds of sitting
     * there. Clearing the list is the best thing that can happen in this game
     * and it should be the thing that stops it.
     */
    const complete = found.length + 1 >= criterion.answers.length;
    if (complete) {
      setRunning(false);
      setFinished(true);
      setFeedback(null);
    } else {
      adjustTime(BONUS_SECONDS);
      setFeedback({ tone: 'var(--success)', message: `${player.name} +${BONUS_SECONDS}s` });
    }
    setFound((prev) => [player, ...prev]);
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

          {pool ? (
            <p className="small muted center" style={{ margin: 0 }}>
              Every list below is the <strong>{pool.label}</strong> field only.
            </p>
          ) : null}

          {/*
            Random first, then the list — the same shape as Tenaball's picker,
            and for the same reason. The categories grew from five hand-picked
            ones to a few dozen, which is past the point where a wall of cards
            is a choice rather than a search.
          */}
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={() => setCriterion(criteria[Math.floor(Math.random() * criteria.length)])}
          >
            🎲 Random list
          </button>

          <ListPicker
            criteria={criteria}
            query={query}
            onQuery={setQuery}
            onPick={setCriterion}
            scope={pool?.label ?? null}
          />
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
              tone={missed.length === 0 ? 'success' : 'info'}
              title={
                missed.length === 0
                  ? `You win — all ${criterion.answers.length} of them!`
                  : `${gaveUp ? 'Gave up' : 'Time!'} ${found.length} of ${criterion.answers.length}`
              }
            >
              {missed.length > 0
                ? `You missed ${missed.length}.`
                : `Cleared the whole list with ${formatClock(timeLeft)} on the clock.`}
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

/**
 * The list picker: a search box over grouped categories.
 *
 * Same component shape as Tenaball's, deliberately — the two games ask the
 * same question ("which of these dozens do you want?") and answering it in two
 * different ways on two adjacent pages is the kind of thing that makes a site
 * feel assembled rather than designed.
 *
 * Grouped by what the list is about, because "FNCS grand final winners —
 * Europe" and "Players with 3+ FNCS wins" are neighbours in a player's head
 * and were forty cards apart in an alphabetical wall.
 */
function ListPicker({
  criteria,
  query,
  onQuery,
  onPick,
  scope,
}: {
  criteria: Criterion[];
  query: string;
  onQuery: (value: string) => void;
  onPick: (criterion: Criterion) => void;
  /** The event field in force, if any — shown so the header says what these are. */
  scope: string | null;
}) {
  const needle = query.trim().toLowerCase();
  const matching = needle
    ? criteria.filter(
        (entry) =>
          entry.title.toLowerCase().includes(needle) ||
          (entry.subtitle ?? '').toLowerCase().includes(needle),
      )
    : criteria;

  const grouped = new Map<string, Criterion[]>();
  for (const entry of matching) {
    const group = groupOf(entry);
    const bucket = grouped.get(group);
    if (bucket) bucket.push(entry);
    else grouped.set(group, [entry]);
  }

  return (
    <section className="card stack">
      <div className="row-between">
        <div className="card__title" style={{ marginBottom: 0 }}>
          {scope ? `Or pick a ${scope} list` : 'Or pick a list'}
        </div>
        <span className="tiny faint">{matching.length} available</span>
      </div>
      <input
        className="input"
        value={query}
        placeholder="Search lists — “FNCS”, “Europe”, “earnings”…"
        onChange={(event) => onQuery(event.target.value)}
        aria-label="Search lists"
        autoComplete="off"
        spellCheck={false}
      />
      {matching.length === 0 ? (
        <p className="small muted">Nothing matches “{query}”.</p>
      ) : (
        <div className="picker-list">
          {[...grouped].map(([group, entries]) => (
            <div key={group} className="stack-sm">
              <h3 className="picker-list__head">{group}</h3>
              <div className="picker-list__group">
                {entries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="picker-option"
                    title={entry.subtitle}
                    onClick={() => onPick(entry)}
                  >
                    {entry.title}{' '}
                    <span className="faint">· {entry.answers.length}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Which heading a list sits under, read off its id prefix. */
function groupOf(criterion: Criterion): string {
  const [kind] = criterion.id.split(':');
  switch (kind) {
    case 'pool':
      return 'Qualified fields';
    case 'fncs':
    case 'fncs-wins':
      return 'FNCS';
    case 'earnings':
      return 'Earnings';
    case 'won-in-year':
      return 'Year by year';
    default:
      return 'Titles';
  }
}

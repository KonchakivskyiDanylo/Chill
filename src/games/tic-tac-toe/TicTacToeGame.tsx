import { useCallback, useMemo, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Facts } from '@/data/liquipedia/facts';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { useFacts } from '@/data/liquipedia/useFacts';
import { useOrgs } from '@/data/liquipedia/useOrgs';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { useEventMode } from '@/games/shared/mode';
import { resolvePool, usePoolChoice } from '@/games/shared/pool';
import { getGame } from '@/games/registry';
import {
  cellKey,
  createGame,
  generateBoard,
  giveUp,
  guessesLeft,
  HARD_GUESSES,
  MAX_MISTAKES,
  place,
  SIZE,
  solutionFor,
  submit,
  type Cell,
  type Difficulty,
  type GameState,
} from './engine';
import './tic-tac-toe.css';

const meta = getGame('tic-tac-toe')!;

const RULESETS: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: '🟢 Easy', hint: `Unlimited guesses. ${MAX_MISTAKES} wrong answers end the board.` },
  { id: 'hard', label: '🔴 Hard', hint: `${HARD_GUESSES} guesses — one per cell. Every one has to land.` },
];

export default function TicTacToeGame() {
  const { roster, error: rosterError } = useRoster();
  const { facts, error: factsError } = useFacts();
  const { orgs, error: orgsError } = useOrgs();
  const { pools } = usePools();

  return (
    <LiquipediaGate
      error={rosterError ?? factsError ?? orgsError}
      ready={Boolean(roster && facts && orgs)}
    >
      {roster && facts && orgs ? (
        <Game roster={roster} facts={facts} orgs={orgs} pools={pools} />
      ) : null}
    </LiquipediaGate>
  );
}

function Game({
  roster,
  facts,
  orgs,
  pools,
}: {
  roster: Roster;
  facts: Facts;
  orgs: Orgs;
  pools: Pools | null;
}) {
  const [choice, setChoice] = usePoolChoice();
  const [event] = useEventMode();
  const [ruleset, setRuleset] = useState<Difficulty>('easy');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: string; message: string } | null>(null);
  /** Set when a player fits several cells and none of them is uniquely theirs. */
  const [choosing, setChoosing] = useState<{ player: RosterPlayer; cells: Cell[] } | null>(null);

  const eligible = useMemo(() => facts.eligible(3), [facts]);
  const players = useMemo(
    () => resolvePool(roster, pools, event, choice, eligible, 60),
    [roster, pools, event, choice, eligible],
  );

  const start = useCallback(() => {
    const board = generateBoard({ players, facts, orgs });
    if (!board) {
      setError('Not enough players in this pool to build a solvable grid. Try a wider one.');
      return;
    }
    setError(null);
    setFeedback(null);
    setChoosing(null);
    setGame(createGame(board, ruleset));
  }, [players, facts, orgs, ruleset]);

  const usedIds = useMemo(
    () => new Set(game ? [...game.filled.values()].map((player) => player.id) : []),
    [game],
  );

  if (!game) {
    return (
      <GameShell game={meta} dataNote={<RosterNote what="Players" generated={facts.generated} />}>
        <div className="stack">
          <PoolSetup
            roster={roster}
            pools={pools}
            event={event}
            value={choice}
            onChange={setChoice}
            eligible={eligible}
            onStart={start}
            startLabel="New board"
            extra={
              <section className="card stack">
                <div className="card__title">Rules</div>
                <OptionGrid>
                  {RULESETS.map((option) => (
                    <OptionCard
                      key={option.id}
                      label={option.label}
                      hint={option.hint}
                      selected={ruleset === option.id}
                      onClick={() => setRuleset(option.id)}
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
        </div>
      </GameShell>
    );
  }

  const { board } = game;
  const finished = game.status !== 'playing';

  /** Applies whatever `submit`/`place` came back with, and narrates it. */
  const resolve = (result: ReturnType<typeof submit>, player: RosterPlayer) => {
    setGame(result.state);
    switch (result.outcome.kind) {
      case 'placed': {
        const { row, col } = result.outcome.cell;
        setChoosing(null);
        setFeedback({
          tone: 'var(--success)',
          message: `${player.name} → ${board.rows[row].short} × ${board.cols[col].short}.`,
        });
        break;
      }
      case 'choose':
        setChoosing({ player, cells: result.outcome.cells });
        setFeedback({
          tone: 'var(--text-muted)',
          message: `${player.name} fits more than one cell — pick which.`,
        });
        break;
      case 'already-used':
        setFeedback({ tone: 'var(--warning)', message: `${player.name} is already on the board.` });
        break;
      case 'deadlock':
        setFeedback({
          tone: 'var(--warning)',
          message: `${player.name} fits, but using them there would leave another cell impossible.`,
        });
        break;
      default:
        setChoosing(null);
        setFeedback({ tone: 'var(--danger)', message: `${player.name} does not fit any open cell.` });
    }
  };

  const left = guessesLeft(game);

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote what="Players" generated={facts.generated} />}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => setGame(null)}>
          ↺ New board
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Filled" value={`${game.filled.size}/9`} />
          {game.difficulty === 'easy' ? (
            <Stat label="Mistakes" value={`${game.mistakes}/${MAX_MISTAKES}`} />
          ) : (
            <Stat label="Guesses left" value={Number.isFinite(left) ? left : '∞'} />
          )}
        </div>

        <div className="scroll-x">
          <div className="ttt-grid">
            <div className="ttt-corner" aria-hidden="true" />
            {board.cols.map((col) => (
              <div key={col.id} className="ttt-head" title={col.label}>
                {col.short}
              </div>
            ))}

            {board.rows.map((row, rowIndex) => (
              <BoardRow
                key={row.id}
                rowIndex={rowIndex}
                label={row.short}
                title={row.label}
                game={game}
                finished={finished}
                choosing={choosing}
                onChoose={(col) => {
                  if (!choosing) return;
                  resolve(place(game, { row: rowIndex, col }, choosing.player), choosing.player);
                }}
              />
            ))}
          </div>
        </div>

        {feedback ? (
          <p className="small center" style={{ color: feedback.tone }}>
            {feedback.message}
          </p>
        ) : null}

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? 'Board complete!' : 'Board lost'}
            >
              {game.status === 'won'
                ? `All nine cells filled in ${game.guesses} guesses.`
                : 'Every empty cell below shows players who would have worked.'}
            </Banner>
            {game.status === 'lost' ? <Reveal game={game} /> : null}
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              New board
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            {choosing ? (
              <p className="small center muted">
                Tap the cell you want <strong>{choosing.player.name}</strong> in, or{' '}
                <button type="button" className="link-btn" onClick={() => setChoosing(null)}>
                  cancel
                </button>
                .
              </p>
            ) : (
              <PlayerSearch
                players={players}
                onPick={(player) => resolve(submit(game, player), player)}
                exclude={usedIds}
                placeholder="Name a player…"
                buttonLabel="Place"
                autoFocus
              />
            )}
            <div className="row" style={{ justifyContent: 'center' }}>
              <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}

/** Players who would have worked, per cell left empty. */
function Reveal({ game }: { game: GameState }) {
  const empty: Cell[] = [];
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      if (!game.filled.has(cellKey(row, col))) empty.push({ row, col });
    }
  }
  return (
    <section className="card stack-sm">
      <div className="card__title">What would have worked</div>
      {empty.map(({ row, col }) => (
        <p key={cellKey(row, col)} className="small">
          <span className="muted">
            {game.board.rows[row].short} × {game.board.cols[col].short}
          </span>{' '}
          —{' '}
          <span className="bold">
            {solutionFor(game, row, col)
              .map((player) => player.name)
              .join(', ') || 'nobody left'}
          </span>
        </p>
      ))}
    </section>
  );
}

function BoardRow({
  rowIndex,
  label,
  title,
  game,
  finished,
  choosing,
  onChoose,
}: {
  rowIndex: number;
  label: string;
  title: string;
  game: GameState;
  finished: boolean;
  choosing: { player: RosterPlayer; cells: Cell[] } | null;
  onChoose: (col: number) => void;
}) {
  return (
    <>
      <div className="ttt-head ttt-head--row" title={title}>
        {label}
      </div>
      {Array.from({ length: SIZE }, (_, col) => {
        const player = game.filled.get(cellKey(rowIndex, col));
        const offered = choosing?.cells.some((cell) => cell.row === rowIndex && cell.col === col);
        const classes = ['ttt-cell'];
        if (player) classes.push('ttt-cell--filled');
        if (offered) classes.push('ttt-cell--offered');
        return (
          <button
            key={col}
            type="button"
            className={classes.join(' ')}
            onClick={() => offered && onChoose(col)}
            disabled={Boolean(player) || finished || !offered}
          >
            {player ? (
              <span className="ttt-cell__name">{player.name}</span>
            ) : (
              <span className="ttt-cell__plus" aria-hidden="true">
                {offered ? '↓' : finished ? '?' : ''}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

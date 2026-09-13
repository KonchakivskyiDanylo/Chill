import { useCallback, useMemo, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, Modal, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import type { Player } from '@/data/types';
import { getGame } from '@/games/registry';
import {
  cellKey,
  createGame,
  generateBoard,
  MAX_MISTAKES,
  place,
  SIZE,
  solutionFor,
  type GameState,
} from './engine';
import './tic-tac-toe.css';

const meta = getGame('tic-tac-toe')!;

export default function TicTacToeGame() {
  const dataset = useDataset();
  const [game, setGame] = useState<GameState | null>(() => {
    const board = generateBoard(dataset);
    return board ? createGame(board) : null;
  });
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: string; message: string } | null>(null);

  const newBoard = useCallback(() => {
    const board = generateBoard(dataset);
    setGame(board ? createGame(board) : null);
    setActive(null);
    setFeedback(null);
  }, [dataset]);

  const usedIds = useMemo(
    () => new Set(game ? [...game.filled.values()].map((player) => player.id) : []),
    [game],
  );

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <Banner tone="danger" title="No solvable board">
            The generator could not find a 3×3 board where every cell has a valid, distinct player.
          </Banner>
          <button type="button" className="btn btn--primary btn--block" onClick={newBoard}>
            Try again
          </button>
        </div>
      </GameShell>
    );
  }

  const { board } = game;
  const finished = game.status !== 'playing';

  const submit = (player: Player) => {
    if (!active) return;
    const result = place(game, active.row, active.col, player);
    setGame(result.state);
    switch (result.outcome) {
      case 'placed':
        setFeedback({ tone: 'var(--success)', message: `${player.name} fits.` });
        setActive(null);
        break;
      case 'already-used':
        setFeedback({ tone: 'var(--warning)', message: `${player.name} is already on the board.` });
        break;
      case 'deadlock':
        setFeedback({
          tone: 'var(--warning)',
          message: `${player.name} fits, but using them here would leave another cell impossible. Pick someone else.`,
        });
        break;
      case 'wrong':
        setFeedback({ tone: 'var(--danger)', message: `${player.name} does not fit that cell.` });
        setActive(null);
        break;
      default:
        setActive(null);
    }
  };

  return (
    <GameShell
      game={meta}
      toolbar={
        <button type="button" className="icon-btn" onClick={newBoard}>
          ↺ New board
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Filled" value={`${game.filled.size}/9`} />
          <Stat label="Mistakes" value={`${game.mistakes}/${MAX_MISTAKES}`} />
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
                onSelect={(col) => {
                  setFeedback(null);
                  setActive({ row: rowIndex, col });
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
              title={game.status === 'won' ? 'Board complete!' : 'Out of mistakes'}
            >
              {game.status === 'won'
                ? `All nine cells filled with ${game.mistakes} ${game.mistakes === 1 ? 'mistake' : 'mistakes'}.`
                : 'Tap an empty cell to see players who would have worked.'}
            </Banner>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={newBoard}>
              New board
            </button>
          </div>
        ) : null}

        <Modal
          open={active !== null}
          title={
            active
              ? `${board.rows[active.row].short} × ${board.cols[active.col].short}`
              : ''
          }
          onClose={() => setActive(null)}
        >
          {active ? (
            <>
              <p className="small muted">
                Name a player who {board.rows[active.row].label} <strong>and</strong>{' '}
                {board.cols[active.col].label}.
              </p>
              {finished ? (
                <div className="stack-sm">
                  <div className="card__title">Players that would have worked</div>
                  {solutionFor(game, active.row, active.col).map((player) => (
                    <div key={player.id} className="row">
                      <PlayerAvatar player={player} size={28} />
                      <span className="bold">{player.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <PlayerSearch players={dataset.roster} onPick={submit} exclude={usedIds} buttonLabel="Place" />
                  {feedback ? (
                    <p className="small" style={{ color: feedback.tone }}>
                      {feedback.message}
                    </p>
                  ) : null}
                </>
              )}
            </>
          ) : null}
        </Modal>
      </div>
    </GameShell>
  );
}

function BoardRow({
  rowIndex,
  label,
  title,
  game,
  finished,
  onSelect,
}: {
  rowIndex: number;
  label: string;
  title: string;
  game: GameState;
  finished: boolean;
  onSelect: (col: number) => void;
}) {
  return (
    <>
      <div className="ttt-head ttt-head--row" title={title}>
        {label}
      </div>
      {Array.from({ length: SIZE }, (_, col) => {
        const player = game.filled.get(cellKey(rowIndex, col));
        return (
          <button
            key={col}
            type="button"
            className={`ttt-cell${player ? ' ttt-cell--filled' : ''}`}
            onClick={() => onSelect(col)}
            disabled={Boolean(player)}
          >
            {player ? (
              <>
                <PlayerAvatar player={player} size={34} />
                <span className="ttt-cell__name">{player.name}</span>
              </>
            ) : (
              <span className="ttt-cell__plus" aria-hidden="true">
                {finished ? '?' : '+'}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

import { useCallback, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { Banner, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import type { Player } from '@/data/types';
import { getGame } from '@/games/registry';
import {
  createGame,
  generatePuzzle,
  giveUp,
  GROUP_SIZE,
  MAX_MISTAKES,
  submit,
  toggle,
  unsolvedGroups,
  type GameState,
  type Group,
} from './engine';
import './connections.css';

const meta = getGame('connections')!;

const GROUP_TONES = ['a', 'b', 'c', 'd'];

export default function ConnectionsGame() {
  const dataset = useDataset();
  const [game, setGame] = useState<GameState | null>(() => {
    const puzzle = generatePuzzle(dataset);
    return puzzle ? createGame(puzzle) : null;
  });

  const newPuzzle = useCallback(() => {
    const puzzle = generatePuzzle(dataset);
    setGame(puzzle ? createGame(puzzle) : null);
  }, [dataset]);

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <Banner tone="danger" title="No board available">
            The generator could not find four clean groups of four in the current dataset.
          </Banner>
          <button type="button" className="btn btn--primary btn--block" onClick={newPuzzle}>
            Try again
          </button>
        </div>
      </GameShell>
    );
  }

  const finished = game.status !== 'playing';
  const solvedIds = new Set(game.solved.flatMap((group) => group.players.map((player) => player.id)));
  const remaining = game.puzzle.board.filter((player) => !solvedIds.has(player.id));

  const toneOf = (group: Group) =>
    GROUP_TONES[game.puzzle.groups.findIndex((candidate) => candidate.id === group.id)] ?? 'a';

  const onTile = (player: Player) => setGame((prev) => (prev ? toggle(prev, player) : prev));

  return (
    <GameShell
      game={meta}
      toolbar={
        <>
          {game.status === 'playing' ? (
            <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
          ) : null}
          <button type="button" className="icon-btn" onClick={newPuzzle}>
            ↺ New board
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Groups" value={`${game.solved.length}/4`} />
          <Stat label="Mistakes" value={`${game.mistakes}/${MAX_MISTAKES}`} />
        </div>

        <div className="stack-sm">
          {game.solved.map((group) => (
            <SolvedGroup key={group.id} group={group} tone={toneOf(group)} />
          ))}
          {finished
            ? unsolvedGroups(game).map((group) => (
                <SolvedGroup key={group.id} group={group} tone={toneOf(group)} missed />
              ))
            : null}
        </div>

        {!finished ? (
          <div className="cx-grid">
            {remaining.map((player) => (
              <button
                key={player.id}
                type="button"
                className={`cx-tile${game.selected.includes(player.id) ? ' cx-tile--selected' : ''}`}
                onClick={() => onTile(player)}
              >
                {player.name}
              </button>
            ))}
          </div>
        ) : null}

        {game.message ? (
          <p className="small center" style={{ color: 'var(--warning)' }}>
            {game.message}
          </p>
        ) : null}

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? 'Board solved!' : 'Out of mistakes'}
            >
              {game.status === 'won'
                ? `Four groups with ${game.mistakes} ${game.mistakes === 1 ? 'mistake' : 'mistakes'}.`
                : 'The remaining connections are revealed above.'}
            </Banner>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={newPuzzle}>
              New board
            </button>
          </div>
        ) : (
          <div className="row">
            <button
              type="button"
              className="btn"
              style={{ flex: 1 }}
              disabled={game.selected.length === 0}
              onClick={() => setGame((prev) => (prev ? { ...prev, selected: [], message: null } : prev))}
            >
              Clear
            </button>
            <button
              type="button"
              className="btn btn--primary"
              style={{ flex: 2 }}
              disabled={game.selected.length !== GROUP_SIZE}
              onClick={() => setGame((prev) => (prev ? submit(prev) : prev))}
            >
              Submit ({game.selected.length}/{GROUP_SIZE})
            </button>
          </div>
        )}
      </div>
    </GameShell>
  );
}

function SolvedGroup({ group, tone, missed }: { group: Group; tone: string; missed?: boolean }) {
  return (
    <div className={`cx-group cx-group--${tone}${missed ? ' cx-group--missed' : ''}`}>
      <div className="cx-group__label">
        {missed ? 'Missed · ' : ''}
        {group.label.charAt(0).toUpperCase() + group.label.slice(1)}
      </div>
      <div className="cx-group__players">{group.players.map((player) => player.name).join(' · ')}</div>
    </div>
  );
}

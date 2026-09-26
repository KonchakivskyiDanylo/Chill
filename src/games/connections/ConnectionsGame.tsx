import { useCallback, useMemo, useState } from 'react';
import { poolSetup, useRoundRecorder } from '@/analytics/client';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner, Stat } from '@/components/ui';
import type { Facts } from '@/data/liquipedia/facts';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { useFacts } from '@/data/liquipedia/useFacts';
import { useOrgs } from '@/data/liquipedia/useOrgs';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { activePool, useEventMode } from '@/games/shared/mode';
import { everyone, RANDOM_MIX, resolvePool, usePoolChoice } from '@/games/shared/pool';
import { getGame } from '@/games/registry';
import {
  createGame,
  generatePuzzle,
  giveUp,
  GROUP_SIZE,
  livesLeft,
  MAX_MISTAKES,
  submit,
  toggle,
  unsolvedGroups,
  type GameState,
  type Group,
  record as roundRecord,
} from './engine';
import './connections.css';

const meta = getGame('connections')!;

const GROUP_TONES = ['a', 'b', 'c', 'd'];

export default function ConnectionsGame() {
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
  const [game, setGame] = useState<GameState | null>(null);

  useRoundRecorder('connections', game !== null && game.status !== 'playing', () => ({
    title: 'Connections',
    data: facts.generated,
    setup: poolSetup(event, choice),
    ...roundRecord(game!),
  }));
  const [error, setError] = useState<string | null>(null);

  // A board needs players with enough recorded career to satisfy a rule — on
  // the whole roster. An event field is dealt whole: a qualifier with two majors
  // on record still has a country, a region and an organisation to fit.
  const inField = Boolean(activePool(pools, event));
  const eligible = useMemo(() => (inField ? everyone : facts.eligible(3)), [facts, inField]);
  const players = useMemo(
    () => resolvePool(roster, pools, event, choice, eligible, 80),
    [roster, pools, event, choice, eligible],
  );

  const start = useCallback(() => {
    // Random leans towards names people know, as every game's Random does; a
    // chosen tier or an event field is dealt evenly.
    const mix = !pools?.get(event) && choice.mode === 'random' ? RANDOM_MIX : undefined;
    const puzzle = generatePuzzle({ players, facts, orgs }, undefined, mix);
    if (!puzzle) {
      setError('Could not find four clean groups of four in this pool. Try a wider one.');
      return;
    }
    setError(null);
    setGame(createGame(puzzle));
  }, [players, facts, orgs, pools, event, choice.mode]);

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

  const finished = game.status !== 'playing';
  const solvedIds = new Set(game.solved.flatMap((group) => group.players.map((player) => player.id)));
  const remaining = game.puzzle.board.filter((player) => !solvedIds.has(player.id));

  const toneOf = (group: Group) =>
    GROUP_TONES[game.puzzle.groups.findIndex((candidate) => candidate.id === group.id)] ?? 'a';

  const onTile = (player: RosterPlayer) => setGame((prev) => (prev ? toggle(prev, player) : prev));

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
          <Stat label="Groups" value={`${game.solved.length}/4`} />
          <Stat label="Lives" value={<Hearts left={livesLeft(game)} />} />
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

        {/*
         * One away, and only one away.
         *
         * The engine reports `near` for three-of-four and nothing else — see
         * the note on `submit`. Two of any four landing in the same group is
         * close to chance on a sixteen-card board, so saying so every time was
         * noise that buried the one hint worth reading.
         */}
        {game.near !== null && !finished ? (
          <Banner tone="info">
            <strong>
              {game.near} of those {GROUP_SIZE}
            </strong>{' '}
            belong to one group — swap one out.
          </Banner>
        ) : null}

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? 'Board solved!' : 'Out of lives'}
            >
              {game.status === 'won'
                ? `Four groups with ${game.mistakes} ${game.mistakes === 1 ? 'mistake' : 'mistakes'}.`
                : 'The remaining connections are revealed above.'}
            </Banner>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              New board
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            <div className="row">
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                disabled={game.selected.length === 0}
                onClick={() => setGame((prev) => (prev ? { ...prev, selected: [], near: null } : prev))}
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
            <div className="row" style={{ justifyContent: 'center' }}>
              <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}

/** Lives as hearts: four filled, emptying as they are spent. */
function Hearts({ left }: { left: number }) {
  return (
    <span className="cx-hearts" aria-label={`${left} of ${MAX_MISTAKES} lives left`}>
      {Array.from({ length: MAX_MISTAKES }, (_, index) => (
        <span key={index} className={`cx-heart${index < left ? '' : ' cx-heart--spent'}`} aria-hidden="true">
          {index < left ? '♥' : '♡'}
        </span>
      ))}
    </span>
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

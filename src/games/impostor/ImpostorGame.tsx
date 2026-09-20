import { useCallback, useMemo, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid } from '@/components/ui';
import { useFacts } from '@/data/liquipedia/useFacts';
import { useOrgs } from '@/data/liquipedia/useOrgs';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import type { Facts } from '@/data/liquipedia/facts';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { resolvePool, usePoolChoice } from '@/games/shared/pool';
import { getGame } from '@/games/registry';
import {
  check,
  createGame,
  createRound,
  giveUp,
  membersLeft,
  pick,
  toggle,
  type GameState,
  type Mode,
} from './engine';
import './impostor.css';

const meta = getGame('impostor')!;

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: 'all-at-once',
    label: 'All at once',
    hint: 'Select everyone who fits, then check. The selection has to be exactly right.',
  },
  {
    id: 'one-by-one',
    label: 'One by one',
    hint: 'Pick them one at a time, confirming each. One griefer ends the round.',
  },
];

export default function ImpostorGame() {
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
  const [mode, setMode] = useState<Mode>('all-at-once');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** One-by-one only: the card awaiting confirmation. */
  const [pending, setPending] = useState<RosterPlayer | null>(null);

  // A board needs players with enough recorded career to satisfy a rule.
  const eligible = useMemo(() => facts.eligible(3), [facts]);
  const players = useMemo(
    () => resolvePool(roster, pools, choice, eligible, 40),
    [roster, pools, choice, eligible],
  );

  const start = useCallback(() => {
    const round = createRound({ players, facts, orgs });
    if (!round) {
      setError('Not enough players in this pool to build a fair board. Try a wider one.');
      return;
    }
    setError(null);
    setPending(null);
    setGame(createGame(round, mode));
  }, [players, facts, orgs, mode]);

  if (!game) {
    return (
      <GameShell game={meta} dataNote={<RosterNote what="Players" generated={facts.generated} />}>
        <div className="stack">
          <PoolSetup
            roster={roster}
            pools={pools}
            value={choice}
            onChange={setChoice}
            eligible={eligible}
            onStart={start}
            startLabel="Start round"
            extra={
              <section className="card stack">
                <div className="card__title">Mode</div>
                <OptionGrid>
                  {MODES.map((option) => (
                    <OptionCard
                      key={option.id}
                      label={option.label}
                      hint={option.hint}
                      selected={mode === option.id}
                      onClick={() => setMode(option.id)}
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

  const { round } = game;
  const finished = game.status !== 'playing';
  const left = membersLeft(game);

  const onCardClick = (player: RosterPlayer) => {
    if (finished) return;
    if (game.mode === 'all-at-once') {
      setGame((prev) => (prev ? toggle(prev, player) : prev));
    } else {
      // Confirmed below rather than acted on here: a stray tap used to end the
      // round outright.
      setPending((current) => (current?.id === player.id ? null : player));
    }
  };

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote what="Players" generated={facts.generated} />}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => setGame(null)}>
          ↺ New round
        </button>
      }
    >
      <div className="stack">
        <section className="card">
          <div className="card__title">The rule</div>
          <h2>
            Find the players who <span style={{ color: 'var(--primary)' }}>{round.criterion.label}</span>
          </h2>
          <p className="small muted" style={{ marginTop: 6 }}>
            {round.memberIds.size} of these {round.board.length} do. The rest are griefers.
            {game.mode === 'all-at-once'
              ? ' Select them all, then hit Check.'
              : ' Pick them one at a time — a griefer ends the round.'}
            {finished ? '' : ` ${left} left to find.`}
          </p>
        </section>

        <div className="imp-grid">
          {round.board.map((player) => {
            const isMember = round.memberIds.has(player.id);
            const isSelected = game.selected.has(player.id);
            const isPending = pending?.id === player.id;
            const classes = ['imp-card'];
            if (isSelected && !finished) classes.push('imp-card--selected');
            if (isPending) classes.push('imp-card--pending');
            if (finished && isMember) classes.push('imp-card--member');
            if (finished && !isMember && isSelected) classes.push('imp-card--wrong');
            if (game.mode === 'one-by-one' && isSelected && !finished) classes.push('imp-card--caught');

            return (
              <button
                key={player.id}
                type="button"
                className={classes.join(' ')}
                disabled={finished || (game.mode === 'one-by-one' && isSelected)}
                aria-pressed={isSelected || isPending}
                onClick={() => onCardClick(player)}
              >
                {/*
                 * The handle and nothing else. A flag or an org badge here
                 * answers half the rules on its own — "competes in Brazil" was
                 * literally written on every card.
                 */}
                <span className="imp-card__name">{player.name}</span>
                {finished ? (
                  <span className={`imp-card__tag ${isMember ? 'imp-card__tag--member' : ''}`}>
                    {isMember ? 'Fits the rule' : 'Griefer'}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? 'All of them found!' : 'Round lost'}
            >
              {game.mistake
                ? `${game.mistake.name} does not fit — a griefer.`
                : game.status === 'won'
                  ? 'Exactly the right selection.'
                  : 'That selection was not the right set.'}
            </Banner>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              Next round
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            {game.mode === 'all-at-once' ? (
              <button
                type="button"
                className="btn btn--primary btn--lg btn--block"
                disabled={game.selected.size === 0}
                onClick={() => setGame((prev) => (prev ? check(prev) : prev))}
              >
                Check {game.selected.size > 0 ? `(${game.selected.size} selected)` : ''}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--lg btn--block"
                disabled={!pending}
                onClick={() => {
                  if (!pending) return;
                  setGame((prev) => (prev ? pick(prev, pending) : prev));
                  setPending(null);
                }}
              >
                {pending ? `Confirm ${pending.name}` : 'Tap a player, then confirm'}
              </button>
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

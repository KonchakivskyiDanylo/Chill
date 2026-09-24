import { useCallback, useMemo, useState } from 'react';
import { poolSetup, useRoundRecorder } from '@/analytics/client';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { CountryBadge } from '@/components/CountryBadge';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid, PlayerLine, Stat } from '@/components/ui';
import type { Facts } from '@/data/liquipedia/facts';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';
import { useFacts } from '@/data/liquipedia/useFacts';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { useTeammates } from '@/data/liquipedia/useTeammates';
import { rotationKey } from '@/games/shared/rotation';
import { useEventMode } from '@/games/shared/mode';
import { dealSecret, poolScope, resolvePool, usePoolChoice } from '@/games/shared/pool';
import { playerMoney, plural } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  cluesLeft,
  createGame,
  giveUp,
  MIN_CLUES,
  MIN_TOURNAMENTS,
  revealNext,
  showsMatches,
  submitGuess,
  type GameState,
  type Mode,
  record as roundRecord,
} from './engine';

const meta = getGame('who-are-ya')!;

/**
 * The three clue orders.
 *
 * Named for what they do rather than Easy/Hard, because the fame difficulty
 * above them already owns those words and two Easys on one screen mean two
 * different things.
 */
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'easy', label: 'Counts shown', hint: 'Fewest → most shared tournaments, with the count on each.' },
  { id: 'hard', label: 'Counts hidden', hint: 'Same order, but you do not get to see the numbers.' },
  { id: 'random', label: 'Random order', hint: 'No ramp-up: any teammate could come first. Counts hidden.' },
];

export default function WhoAreYaGame() {
  const { roster, error: rosterError } = useRoster();
  const { teammates, error: teammatesError } = useTeammates();
  const { facts, error: factsError } = useFacts();
  const { pools } = usePools();

  return (
    <LiquipediaGate
      error={rosterError ?? teammatesError ?? factsError}
      ready={Boolean(roster && teammates && facts)}
    >
      {roster && teammates && facts ? (
        <Game roster={roster} teammates={teammates} facts={facts} pools={pools} />
      ) : null}
    </LiquipediaGate>
  );
}

function Game({
  roster,
  teammates,
  facts,
  pools,
}: {
  roster: Roster;
  teammates: Teammates;
  facts: Facts;
  pools: Pools | null;
}) {
  const [choice, setChoice] = usePoolChoice();
  const [event] = useEventMode();
  const [mode, setMode] = useState<Mode>('easy');
  const [game, setGame] = useState<GameState | null>(null);

  useRoundRecorder('who-are-ya', game !== null && game.status !== 'playing', () => ({
    title: `Who Are Ya? — ${game!.secret.name}`,
    data: teammates.generated,
    setup: poolSetup(event, choice, game!.mode),
    ...roundRecord(game!),
  }));
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(roster.players.map((player) => [player.id, player])), [roster]);
  const cluesFor = useCallback(
    (playerId: string) => teammates.cluesFor(playerId, byId),
    [teammates, byId],
  );

  /**
   * A player can only be the answer with enough teammates *and* enough
   * tournaments — an `unused` teammate has no row to show and no name to
   * guess, and a three-tournament career is not something anyone can recognise.
   */
  const eligible = useCallback(
    (players: RosterPlayer[]) =>
      players.filter(
        (player) =>
          cluesFor(player.id).length >= MIN_CLUES && facts.of(player.id).apps >= MIN_TOURNAMENTS,
      ),
    [cluesFor, facts],
  );

  const answerable = useMemo(() => eligible(roster.players), [eligible, roster]);
  const players = useMemo(
    () => resolvePool(roster, pools, event, choice, eligible, 10),
    [roster, pools, event, choice, eligible],
  );

  const start = useCallback(() => {
    const key = rotationKey(meta.id, ...poolScope(event, choice));
    const drawn = dealSecret(players, readLocal<string[]>(key, []), pools, event, choice);
    if (!drawn) {
      setError(
        `No player in this pool has ${MIN_CLUES} recorded teammates and ${MIN_TOURNAMENTS} tournaments.`,
      );
      return;
    }
    writeLocal(key, drawn.seen);
    setError(null);
    setGame(createGame(drawn.pick, cluesFor(drawn.pick.id), mode));
  }, [players, pools, event, choice, cluesFor, mode]);

  const note = <RosterNote what="Teammates" generated={teammates.generated} />;

  if (!game) {
    return (
      <GameShell game={meta} dataNote={note}>
        <div className="stack">
          <PoolSetup
            roster={roster}
            pools={pools}
            event={event}
            value={choice}
            onChange={setChoice}
            eligible={eligible}
            onStart={start}
            startLabel="Start"
            extra={
              <section className="card stack">
                <div className="card__title">Clue order</div>
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
          <p className="tiny faint center">
            {plural(answerable.length, 'player')} with at least {MIN_CLUES} recorded teammates and{' '}
            {MIN_TOURNAMENTS} tournaments
          </p>
        </div>
      </GameShell>
    );
  }

  const finished = game.status !== 'playing';
  const visible = game.clues.slice(0, game.revealed);
  const guessedIds = new Set(game.guesses.map((p) => p.id));
  const withMatches = showsMatches(game.mode);

  return (
    <GameShell
      game={meta}
      dataNote={note}
      toolbar={
        <>
          <button type="button" className="icon-btn" onClick={start}>
            ↺ New player
          </button>
          <button type="button" className="icon-btn" onClick={() => setGame(null)}>
            ⚙ Setup
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Clues used" value={`${finished ? game.earned : game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
          <Stat label="Order" value={MODES.find((m) => m.id === game.mode)!.label} />
        </div>

        <section className="card stack">
          <div className="card__title">Tournament teammates</div>
          {/*
            One list, start to finish — the same change Career Path got. Ending
            the round fills in the teammates it was still holding back, here,
            dimmed; it does not print a second list of everyone on record.
          */}
          <ul className="stack-sm list-reset">
            {visible.map((clue, index) => (
              <li
                key={clue.player.id}
                className="row-between"
                style={{
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border)',
                  flexWrap: 'nowrap',
                  opacity: finished && index >= game.earned ? 0.55 : 1,
                }}
              >
                <PlayerLine
                  player={clue.player}
                  size={36}
                  meta={clue.player.team ?? clue.player.countryName}
                />
                {withMatches || finished ? (
                  <span className="chip nums">{plural(clue.events, 'tournament')}</span>
                ) : (
                  <span className="chip faint">?</span>
                )}
              </li>
            ))}
          </ul>
          {finished && game.clues.length > game.earned ? (
            <p className="tiny faint" style={{ margin: 0 }}>
              You got there on {plural(game.earned, 'clue')} — the dimmed{' '}
              {plural(game.clues.length - game.earned, 'teammate')}{' '}
              {game.clues.length - game.earned === 1 ? 'was' : 'were'} still to come.
            </p>
          ) : null}
          <p className="tiny faint">
            Ranked by tournaments entered together, across every event in the export
            {game.mode === 'random' ? ', shown in random order.' : ', fewest first.'}
          </p>
        </section>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={
                game.status === 'won'
                  ? `Got it after ${plural(game.earned, 'clue')}!`
                  : 'Out of clues'
              }
            >
              The player was <strong>{game.secret.name}</strong>.
            </Banner>
            <div className="card row" style={{ gap: 14 }}>
              <PlayerAvatar player={game.secret} size={54} />
              <div>
                <div className="bold">{game.secret.name}</div>
                <div className="small muted">
                  <CountryBadge code={game.secret.country} name={game.secret.countryName} />{' '}
                  {game.secret.countryName ?? 'Unknown'}
                  {game.secret.team ? ` · ${game.secret.team}` : ''} · {playerMoney(game.secret)}
                </div>
              </div>
            </div>

            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              Next player
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            <PlayerSearch
              players={answerable}
              onPick={(player) => setGame(submitGuess(game, player))}
              exclude={guessedIds}
              autoFocus
            />
            {/* Same pairing as Career Path: take a clue, or stop. */}
            <div className="action-pair">
              <button
                type="button"
                className="btn"
                onClick={() => setGame(revealNext(game))}
                disabled={cluesLeft(game) === 0}
              >
                {cluesLeft(game) === 0
                  ? 'All teammates revealed — last guess!'
                  : `Reveal next teammate (${cluesLeft(game)} left)`}
              </button>
              <GiveUpButton onGiveUp={() => setGame(giveUp(game))} variant="danger" />
            </div>
          </div>
        )}

        {game.guesses.length > 0 ? (
          <section className="card stack-sm">
            <div className="card__title">Your guesses</div>
            <div className="row">
              {game.guesses.map((player) => (
                <span
                  key={player.id}
                  className={`chip ${player.id === game.secret.id ? 'chip--success' : 'chip--danger'}`}
                >
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

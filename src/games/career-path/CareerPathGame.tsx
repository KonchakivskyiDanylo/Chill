import { useCallback, useMemo, useState } from 'react';
import { poolSetup, useRoundRecorder } from '@/analytics/client';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { CountryBadge } from '@/components/CountryBadge';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { MajorResult, Majors } from '@/data/liquipedia/majors';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { useMajors } from '@/data/liquipedia/useMajors';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { rotationKey } from '@/games/shared/rotation';
import { activePool, useEventMode } from '@/games/shared/mode';
import { dealSecret, poolPlayers, poolScope, resolvePool, usePoolChoice } from '@/games/shared/pool';
import { moneyShort, ordinal, playerMoney, plural } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  cluesLeft,
  createGame,
  giveUp,
  guessesLeft,
  MIN_GUESSES,
  revealNext,
  submitGuess,
  type GameState,
  type Mode,
  record as roundRecord,
} from './engine';
import './career-path.css';

const meta = getGame('career-path')!;

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: 'order',
    label: 'Order',
    hint: 'Ten results spread across the career and read oldest first, like a story. It never opens on the result that gives the player away.',
  },
  {
    id: 'random',
    label: 'Random',
    hint: 'The same kind of ten, in no order at all. No arc to read — just ten facts.',
  },
];

export default function CareerPathGame() {
  const { roster, error: rosterError } = useRoster();
  const { majors, error: majorsError } = useMajors();
  const { pools } = usePools();

  return (
    <LiquipediaGate error={rosterError ?? majorsError} ready={Boolean(roster && majors)}>
      {roster && majors ? <Game roster={roster} majors={majors} pools={pools} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, majors, pools }: { roster: Roster; majors: Majors; pools: Pools | null }) {
  const [choice, setChoice] = usePoolChoice();
  const [event] = useEventMode();
  const [mode, setMode] = useState<Mode>('order');
  const [game, setGame] = useState<GameState | null>(null);

  useRoundRecorder('career-path', game !== null && game.status !== 'playing', () => ({
    title: `Career Path — ${game!.secret.name}`,
    data: majors.generated,
    setup: poolSetup(event, choice, game!.mode),
    ...roundRecord(game!),
  }));
  const [error, setError] = useState<string | null>(null);

  // An event field asks about anyone in it with a major; the whole roster only
  // about careers long enough to read (see `Majors.inField`).
  const field = activePool(pools, event);
  const eligible = field ? majors.inField : majors.eligible;

  /** Who the guess box takes: every usual answer, plus the field's own when one is in force. */
  const answerable = useMemo(() => {
    const usual = majors.eligible(roster.players);
    if (!field) return usual;
    const known = new Set(usual.map((player) => player.id));
    return [
      ...usual,
      ...majors.inField(poolPlayers(roster, pools, event)).filter((player) => !known.has(player.id)),
    ];
  }, [roster, majors, field, pools, event]);

  const players = useMemo(
    () => resolvePool(roster, pools, event, choice, eligible, 10),
    [roster, pools, event, choice, eligible],
  );

  const start = useCallback(() => {
    const key = rotationKey(meta.id, ...poolScope(event, choice));
    const drawn = dealSecret(players, readLocal<string[]>(key, []), pools, event, choice);
    if (!drawn) {
      setError(
        field
          ? 'Nobody in this field has a major on record.'
          : `No player in this pool has ${majors.minAppearances} majors on record.`,
      );
      return;
    }
    writeLocal(key, drawn.seen);
    setError(null);
    setGame(createGame(drawn.pick, majors.resultsFor(drawn.pick.id), mode, majors));
  }, [players, pools, event, choice, majors, mode, field]);

  const note = <RosterNote what="Results" generated={majors.generated} />;

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
            {plural(majors.tournaments.length, 'major')} on record ·{' '}
            {field
              ? `${players.length} of the field's ${plural(field.players.length, 'player')} with at least one`
              : `${plural(answerable.length, 'player')} with at least ${majors.minAppearances} of them`}
          </p>
        </div>
      </GameShell>
    );
  }

  const finished = game.status !== 'playing';
  const visible = game.clues.slice(0, game.revealed);
  const guessedIds = new Set(game.guesses.map((p) => p.id));
  /** A career shorter than the guesses every round gets — see `MIN_GUESSES`. */
  const short = game.clues.length < MIN_GUESSES;
  const left = guessesLeft(game);

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
          <Stat label="Guesses" value={short ? `${game.guesses.length}/${MIN_GUESSES}` : game.guesses.length} />
          <Stat label="Mode" value={game.mode === 'order' ? 'Order' : 'Random'} />
        </div>

        <section className="card stack">
          <div className="card__title">
            {game.mode === 'order' ? 'Career path — oldest first' : 'Career path — random order'}
          </div>
          {/*
            One list, start to finish. Ending the round fills in the rest of the
            ten *here*, continuing what you were already reading, rather than
            printing a second copy of the career in a card underneath the
            answer. Clues you never needed are dimmed.
          */}
          <ol className="cp-path list-reset">
            {visible.map((clue, index) => (
              <ClueRow
                key={clue.result.tournament.name}
                result={clue.result}
                isNew={index === visible.length - 1 && !finished}
                dim={finished && index >= game.earned}
              />
            ))}
          </ol>
          {finished && game.clues.length > game.earned ? (
            <p className="tiny faint" style={{ margin: 0 }}>
              You got there on {plural(game.earned, 'clue')} — the dimmed{' '}
              {plural(game.clues.length - game.earned, 'result')} below{' '}
              {game.clues.length - game.earned === 1 ? 'was' : 'were'} still to come.
            </p>
          ) : null}
          {short && !finished ? (
            <p className="tiny faint" style={{ margin: 0 }}>
              A short career: {plural(game.clues.length, 'major')} on record, so this is all there is.
              You still get {MIN_GUESSES} guesses — the ones after the last clue reveal nothing new.
            </p>
          ) : null}
        </section>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={
                game.status === 'won'
                  ? `Got it in ${game.guesses.length}!`
                  : game.gaveUp
                    ? 'Round over'
                    : short
                      ? 'Out of guesses'
                      : 'Out of clues'
              }
            >
              The player was <strong>{game.secret.name}</strong>.
            </Banner>
            <SecretCard player={game.secret} />

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
            {/*
              Side by side: taking a clue and quitting are the two ways out of a
              round you are stuck in, and they belong on the same line so you
              can weigh one against the other. Give up is the red one, on the
              right, where a destructive action is expected.
            */}
            <div className="action-pair">
              <button
                type="button"
                className="btn"
                onClick={() => setGame(revealNext(game))}
                disabled={cluesLeft(game) === 0}
              >
                {cluesLeft(game) > 0
                  ? `Reveal next clue (${cluesLeft(game)} left)`
                  : left > 1
                    ? `All clues revealed — ${left} guesses left`
                    : 'All clues revealed — last guess!'}
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

function ClueRow({
  result,
  isNew,
  dim,
}: {
  result: MajorResult;
  isNew?: boolean;
  /** A result that was never one of the ten clues, in the full reveal. */
  dim?: boolean;
}) {
  const { tournament, placement } = result;
  return (
    <li className={`cp-clue${dim ? ' cp-clue--dim' : ''}`}>
      <span className="cp-clue__dot" aria-hidden="true" />
      <div className="cp-clue__body">
        <div className="cp-clue__event">{tournament.shortName}</div>
        <div className="cp-clue__meta">
          {tournament.mode ? `${tournament.mode} · ` : ''}
          {tournament.year}
          {tournament.prizePool ? ` · ${moneyShort(tournament.prizePool)} pool` : ''}
        </div>
      </div>
      <div
        className={`cp-clue__place${placement === 1 ? ' cp-clue__place--win' : ''}`}
        aria-label={`Placed ${ordinal(placement)}`}
      >
        {ordinal(placement)}
      </div>
      {isNew ? <span className="cp-clue__new">new</span> : null}
    </li>
  );
}

function SecretCard({ player }: { player: RosterPlayer }) {
  return (
    <div className="card row" style={{ gap: 14 }}>
      <PlayerAvatar player={player} size={54} />
      <div>
        <div className="bold">{player.name}</div>
        <div className="small muted">
          <CountryBadge code={player.country} name={player.countryName} /> {player.countryName ?? 'Unknown'}
          {player.team ? ` · ${player.team}` : ''} · {playerMoney(player)} ·{' '}
          {plural(player.fncsWins, 'FNCS win')}
        </div>
      </div>
    </div>
  );
}

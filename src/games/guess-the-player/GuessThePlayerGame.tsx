import { useCallback, useMemo, useState } from 'react';
import { EXPORT_DATE } from '@/data/liquipedia/roster';
import { poolSetup, useRoundRecorder } from '@/analytics/client';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { CountryBadge } from '@/components/CountryBadge';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Facts } from '@/data/liquipedia/facts';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';
import { useFacts } from '@/data/liquipedia/useFacts';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { useTeammates } from '@/data/liquipedia/useTeammates';
import { rotationKey } from '@/games/shared/rotation';
import { activePool, useEventMode } from '@/games/shared/mode';
import { dealSecret, poolPlayers, poolScope, resolvePool, usePoolChoice } from '@/games/shared/pool';
import { playerMoney } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  answerable,
  answerableInField,
  gameFor,
  giveUp,
  guessesLeft,
  MAX_GUESSES,
  submitGuess,
  TOGETHER_MIN,
  type AttributeResult,
  type Extras,
  type FeedbackMode,
  type GameState,
  record as roundRecord,
} from './engine';
import './guess-the-player.css';

const meta = getGame('guess-the-player')!;

const COLUMNS: { key: string; label: string }[] = [
  { key: 'player', label: 'Guess' },
  { key: 'region', label: 'Region' },
  { key: 'country', label: 'Country' },
  { key: 'status', label: 'Status' },
  { key: 'age', label: 'Age' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'fncsWins', label: 'FNCS wins' },
  { key: 'fncsFinals', label: 'FNCS finals' },
  { key: 'together', label: 'Together' },
];

const MODES: { id: FeedbackMode; label: string; hint: string }[] = [
  {
    id: 'exact',
    label: 'Exact',
    hint: 'Age and the FNCS counts are right or wrong, nothing in between. Earnings still use direction.',
  },
  {
    id: 'direction',
    label: 'Direction',
    hint: 'Arrows on every number show whether the secret player is higher or lower.',
  },
];

/** The optional columns, for whichever of their files have arrived. */
function extrasFrom(facts: Facts | null, teammates: Teammates | null): Extras {
  return {
    fncsFinals: facts ? (id) => facts.of(id).fncsApps : undefined,
    together: teammates ? (a, b) => teammates.together(a, b) : undefined,
  };
}

export default function GuessThePlayerGame() {
  const { roster, error } = useRoster();
  const { pools } = usePools();
  /*
   * Not gated on, unlike the roster. Both files are generated and a missing one
   * is a supported state: the round then plays without that column rather than
   * not at all. Start waits for each to either arrive or fail.
   */
  const { facts, error: factsError } = useFacts();
  const { teammates, error: teammatesError } = useTeammates();
  const settled = Boolean((facts || factsError) && (teammates || teammatesError));
  const extras = useMemo(() => extrasFrom(facts, teammates), [facts, teammates]);

  return (
    <LiquipediaGate error={error} ready={Boolean(roster)}>
      {roster ? (
        <Game
          roster={roster}
          pools={pools}
          extras={extras}
          settled={settled}
        />
      ) : null}
    </LiquipediaGate>
  );
}

function Game({
  roster,
  pools,
  extras,
  settled,
}: {
  roster: Roster;
  pools: Pools | null;
  extras: Extras;
  /** Whether the optional files have finished loading, one way or the other. */
  settled: boolean;
}) {
  const [choice, setChoice] = usePoolChoice();
  const [event] = useEventMode();
  const [mode, setMode] = useState<FeedbackMode>('direction');
  const [game, setGame] = useState<GameState | null>(null);

  useRoundRecorder('guess-the-player', game !== null && game.status !== 'playing', () => ({
    title: `Guess the Player — ${game!.secret.name}`,
    data: EXPORT_DATE,
    setup: poolSetup(event, choice, game!.mode),
    ...roundRecord(game!),
  }));
  const [error, setError] = useState<string | null>(null);

  // A field deals everyone in it, a missing birthday included — see `answerableInField`.
  const eligible = activePool(pools, event) ? answerableInField : answerable;
  const players = useMemo(
    () => resolvePool(roster, pools, event, choice, eligible, 20),
    [roster, pools, event, choice, eligible],
  );
  /*
   * Who the guess box takes: anyone, the way Tic Tac Toe does. It used to be
   * `players`, the pool the secret is drawn from, so on Hard you could not
   * guess Bugha to read his row — and a name missing from the list told you it
   * was not the answer. In an event mode it is the field, as everywhere else.
   */
  const guessable = useMemo(() => {
    const field = poolPlayers(roster, pools, event);
    return field.length > 0 ? field : roster.players;
  }, [roster, pools, event]);

  const start = useCallback(() => {
    // A no-repeat cycle per pool, so the same secret does not come round twice
    // in an evening. See `games/shared/rotation.ts`.
    const key = rotationKey(meta.id, ...poolScope(event, choice));
    const drawn = dealSecret(players, readLocal<string[]>(key, []), pools, event, choice);
    if (!drawn) {
      setError('No player in this pool has a published birthday and earnings figure.');
      return;
    }
    writeLocal(key, drawn.seen);
    setError(null);
    setGame(gameFor(drawn.pick, mode, extras));
  }, [players, pools, event, choice, mode, extras]);

  if (!game) {
    return (
      <GameShell game={meta} dataNote={<RosterNote what="Secret players" />}>
        <div className="stack">
          <PoolSetup
            roster={roster}
            pools={pools}
            event={event}
            value={choice}
            onChange={setChoice}
            eligible={eligible}
            onStart={start}
            startLabel={settled ? 'Start' : 'Loading…'}
            canStart={settled}
            extra={
              <section className="card stack">
                <div className="card__title">Feedback style</div>
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

  const finished = game.status !== 'playing';
  const guessedIds = new Set(game.rows.map((row) => row.player.id));
  const columns = COLUMNS.filter(
    (column) =>
      (column.key !== 'fncsFinals' || game.extras.fncsFinals) &&
      (column.key !== 'together' || game.extras.together),
  );
  // Guess, then one column per attribute this round compares.
  const attributes = columns.length - 1;

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote what="Secret players" />}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => setGame(null)}>
          ↺ New player
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Guesses left" value={guessesLeft(game)} />
          <Stat label="Used" value={`${game.rows.length}/${MAX_GUESSES}`} />
          <Stat label="Mode" value={game.mode === 'exact' ? 'Exact' : 'Direction'} />
        </div>

        {!finished ? (
          <div className="stack-sm">
            <PlayerSearch
              players={guessable}
              onPick={(player) => setGame(submitGuess(game, player))}
              exclude={guessedIds}
              autoFocus
            />
            <div className="row" style={{ justifyContent: 'center' }}>
              <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
            </div>
          </div>
        ) : null}

        {game.rows.length > 0 ? (
          <div className="scroll-x">
            <div
              className="gp-table"
              style={{
                gridTemplateColumns: `minmax(120px, 1.3fr) repeat(${attributes}, minmax(66px, 1fr))`,
                minWidth: 125 + attributes * 71,
              }}
            >
              {columns.map((column) => (
                <div key={column.key} className="gp-th">
                  {column.label}
                </div>
              ))}
              {game.rows.map((row) => (
                <Row key={row.player.id} player={row.player} attributes={row.attributes} />
              ))}
            </div>
          </div>
        ) : (
          <p className="center muted small">
            Guess any player to compare them with the secret one — where they are from, how old,
            what they have earned and won, and whether the two have played together.
          </p>
        )}

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? `Found in ${game.rows.length}!` : 'Out of guesses'}
            >
              The player was <strong>{game.secret.name}</strong>.
            </Banner>
            <div className="card row" style={{ gap: 14 }}>
              <PlayerAvatar player={game.secret} size={54} />
              <div>
                <div className="bold">{game.secret.name}</div>
                <div className="small muted">
                  <CountryBadge code={game.secret.country} name={game.secret.countryName} />{' '}
                  {game.secret.countryName} · {game.secret.region} ·{' '}
                  {game.secret.age === null ? 'age unknown' : `${game.secret.age} yrs`} ·{' '}
                  {playerMoney(game.secret)} · {game.secret.fncsWins} FNCS
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              Next player
            </button>
          </div>
        ) : null}

        <section className="card stack-sm">
          <div className="card__title">Reading the feedback</div>
          <div className="row small">
            <span className="gp-swatch gp-swatch--hit" /> match
            <span className="gp-swatch gp-swatch--miss" /> no match
            {game.secret.age === null ? (
              <>
                <span className="gp-swatch gp-swatch--unknown" /> no birthday on record
              </>
            ) : null}
          </div>
          <p className="tiny faint">
            {game.mode === 'exact'
              ? 'Exact mode: age and the FNCS counts show no arrows — they either match or they do not. Career earnings still show direction.'
              : 'Direction mode: ▲ means the secret player is higher, ▼ means lower.'}
            {game.extras.together
              ? ` Together turns green when your guess and the secret player have entered ${TOGETHER_MIN} or more tournaments as teammates.`
              : ''}
          </p>
        </section>
      </div>
    </GameShell>
  );
}

function Row({ player, attributes }: { player: RosterPlayer; attributes: AttributeResult[] }) {
  return (
    <>
      <div className="gp-cell gp-cell--player">
        <PlayerAvatar player={player} size={26} />
        <span className="bold">{player.name}</span>
      </div>
      {attributes.map((attribute) => (
        <div key={attribute.key} className={`gp-cell gp-cell--${attribute.state}`}>
          <span>{attribute.display}</span>
          {attribute.direction ? (
            <span className="gp-arrow" aria-label={attribute.direction === 'up' ? 'higher' : 'lower'}>
              {attribute.direction === 'up' ? '▲' : '▼'}
            </span>
          ) : null}
        </div>
      ))}
    </>
  );
}

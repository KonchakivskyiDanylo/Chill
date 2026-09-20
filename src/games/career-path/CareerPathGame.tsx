import { useCallback, useMemo, useState } from 'react';
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
import { deal, rotationKey } from '@/games/shared/rotation';
import { poolScope, resolvePool, usePoolChoice } from '@/games/shared/pool';
import { moneyShort, ordinal, playerMoney, plural } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  cluesLeft,
  createGame,
  giveUp,
  revealNext,
  submitGuess,
  type GameState,
  type Mode,
} from './engine';
import './career-path.css';

const meta = getGame('career-path')!;

const MODES: { id: Mode; label: string; hint: string }[] = [
  {
    id: 'order',
    label: 'Order',
    hint: 'Ten results telling the career as a story: the first major, the most recent, and the best of each stretch between.',
  },
  {
    id: 'random',
    label: 'Random',
    hint: 'Ten results drawn at random from the whole career, in no order. No arc to read — just ten facts.',
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
  const [mode, setMode] = useState<Mode>('order');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** Everyone the game could ever ask about — what the search box covers. */
  const answerable = useMemo(() => majors.eligible(roster.players), [roster, majors]);

  const players = useMemo(
    () => resolvePool(roster, pools, choice, majors.eligible, 10),
    [roster, pools, choice, majors],
  );

  const start = useCallback(() => {
    const key = rotationKey(meta.id, ...poolScope(choice));
    const drawn = deal(players, readLocal<string[]>(key, []));
    if (!drawn) {
      setError(`No player in this pool has ${majors.minAppearances} majors on record.`);
      return;
    }
    writeLocal(key, drawn.seen);
    setError(null);
    setGame(createGame(drawn.pick, majors.resultsFor(drawn.pick.id), mode));
  }, [players, choice, majors, mode]);

  const note = <RosterNote what="Results" generated={majors.generated} />;

  if (!game) {
    return (
      <GameShell game={meta} dataNote={note}>
        <div className="stack">
          <PoolSetup
            roster={roster}
            pools={pools}
            value={choice}
            onChange={setChoice}
            eligible={majors.eligible}
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
            {plural(answerable.length, 'player')} with at least {majors.minAppearances} of them
          </p>
        </div>
      </GameShell>
    );
  }

  const finished = game.status !== 'playing';
  const visible = game.clues.slice(0, game.revealed);
  const guessedIds = new Set(game.guesses.map((p) => p.id));
  const shownIds = new Set(game.clues.map((clue) => clue.result.tournament.name));

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
          <Stat label="Clues shown" value={`${game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
          <Stat label="Mode" value={game.mode === 'order' ? 'Order' : 'Random'} />
        </div>

        <section className="card stack">
          <div className="card__title">
            {game.mode === 'order' ? 'Career path — oldest first' : 'Career path — random order'}
          </div>
          <ol className="cp-path list-reset">
            {visible.map((clue, index) => (
              <ClueRow
                key={clue.result.tournament.name}
                result={clue.result}
                isNew={index === visible.length - 1 && !finished}
              />
            ))}
          </ol>
        </section>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? `Got it in ${game.guesses.length}!` : 'Out of clues'}
            >
              The player was <strong>{game.secret.name}</strong>.
            </Banner>
            <SecretCard player={game.secret} />

            {/*
             * The whole record, not just the ten clues. Half the fun of being
             * told the answer is seeing the career you were only shown a
             * tenth of.
             */}
            <section className="card stack-sm">
              <div className="card__title">
                Every major — {plural(game.career.length, 'result')}
              </div>
              <ol className="cp-path cp-path--full list-reset">
                {game.career.map((result) => (
                  <ClueRow
                    key={result.tournament.name}
                    result={result}
                    dim={!shownIds.has(result.tournament.name)}
                  />
                ))}
              </ol>
            </section>

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
            <div className="row">
              <button
                type="button"
                className="btn"
                style={{ flex: 1 }}
                onClick={() => setGame(revealNext(game))}
                disabled={cluesLeft(game) === 0}
              >
                {cluesLeft(game) === 0
                  ? 'All clues revealed — last guess!'
                  : `Reveal next clue (${cluesLeft(game)} left)`}
              </button>
            </div>
            <div className="row" style={{ justifyContent: 'center' }}>
              <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
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

import { useCallback, useMemo, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { CountryBadge } from '@/components/CountryBadge';
import { DifficultyCards, DifficultyChip, useDifficulty } from '@/components/DifficultyPicker';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Majors } from '@/data/liquipedia/majors';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { useMajors } from '@/data/liquipedia/useMajors';
import { useRoster } from '@/data/liquipedia/useRoster';
import { DIFFICULTIES, type Difficulty } from '@/games/shared/difficulty';
import { deal, rotationKey } from '@/games/shared/rotation';
import { moneyShort, ordinal, playerMoney, plural } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import { cluesLeft, createGame, giveUp, revealNext, submitGuess, type GameState, type Mode } from './engine';
import './career-path.css';

const meta = getGame('career-path')!;

export default function CareerPathGame() {
  const { roster, error: rosterError } = useRoster();
  const { majors, error: majorsError } = useMajors();

  return (
    <LiquipediaGate error={rosterError ?? majorsError} ready={Boolean(roster && majors)}>
      {roster && majors ? <Game roster={roster} majors={majors} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, majors }: { roster: Roster; majors: Majors }) {
  const [difficulty, setDifficulty] = useDifficulty();
  const [game, setGame] = useState<GameState | null>(null);

  /** Everyone the game could ever ask about — what the search box covers. */
  const answerable = useMemo(() => majors.eligible(roster.players), [roster, majors]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        DIFFICULTIES.map((level) => [level, roster.exactly(level, { eligible: majors.eligible }).length]),
      ) as Record<Difficulty, number>,
    [roster, majors],
  );

  const start = useCallback(
    (mode: Mode, level: Difficulty) => {
      const key = rotationKey(meta.id, level);
      const pool = roster.playersFor(level, { minimum: 1, eligible: majors.eligible });
      const drawn = deal(pool, readLocal<string[]>(key, []));
      if (!drawn) return;
      writeLocal(key, drawn.seen);
      setGame(createGame(drawn.pick, majors.resultsFor(drawn.pick.id), mode));
    },
    [roster, majors],
  );

  const note = <RosterNote what="Results" generated={majors.generated} />;

  if (!game) {
    return (
      <GameShell game={meta} dataNote={note}>
        <Setup
          difficulty={difficulty}
          onDifficulty={setDifficulty}
          counts={counts}
          tournaments={majors.tournaments.length}
          answerable={answerable.length}
          minAppearances={majors.minAppearances}
          onStart={(mode) => start(mode, difficulty)}
        />
      </GameShell>
    );
  }

  const finished = game.status !== 'playing';
  const visible = game.clues.slice(0, game.revealed);
  const guessedIds = new Set(game.guesses.map((p) => p.id));

  return (
    <GameShell
      game={meta}
      dataNote={note}
      toolbar={
        <>
          {game.status === 'playing' ? <GiveUpButton onGiveUp={() => setGame(giveUp(game))} /> : null}
          <button type="button" className="icon-btn" onClick={() => start(game.mode, difficulty)}>
            ↺ New player
          </button>
          <button type="button" className="icon-btn" onClick={() => setGame(null)}>
            ↺ Change setup
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Clues shown" value={`${game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
          <Stat label="Mode" value={game.mode === 'order' ? 'Order' : 'Random'} />
          <Stat label="Level" value={<DifficultyChip difficulty={difficulty} />} />
        </div>

        <section className="card stack">
          <div className="card__title">
            {game.mode === 'order' ? 'Career path — oldest first' : 'Career path — random order'}
          </div>
          <ol className="cp-path list-reset">
            {visible.map((clue, index) => {
              const { tournament, placement } = clue.result;
              return (
                <li key={tournament.name} className="cp-clue">
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
                  {index === visible.length - 1 && !finished ? (
                    <span className="cp-clue__new">new</span>
                  ) : null}
                </li>
              );
            })}
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
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              onClick={() => start(game.mode, difficulty)}
            >
              Next player
            </button>
          </div>
        ) : (
          <div className="stack">
            <PlayerSearch players={answerable} onPick={(player) => setGame(submitGuess(game, player))} exclude={guessedIds} />
            <button
              type="button"
              className="btn btn--block"
              onClick={() => setGame(revealNext(game))}
              disabled={cluesLeft(game) === 0}
            >
              {cluesLeft(game) === 0
                ? 'All clues revealed — last guess!'
                : `Reveal next clue (${cluesLeft(game)} left)`}
            </button>
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

function Setup({
  difficulty,
  onDifficulty,
  counts,
  tournaments,
  answerable,
  minAppearances,
  onStart,
}: {
  difficulty: Difficulty;
  onDifficulty: (value: Difficulty) => void;
  counts: Record<Difficulty, number>;
  tournaments: number;
  answerable: number;
  minAppearances: number;
  onStart: (mode: Mode) => void;
}) {
  return (
    <div className="stack">
      <section className="card stack">
        <div className="card__title">Pick a difficulty</div>
        <DifficultyCards value={difficulty} onChange={onDifficulty} counts={counts} />
        <p className="tiny faint">
          How well known the secret player is. The clues are the same either way — a more famous player is
          simply one you have a chance of recognising from them.
        </p>
      </section>

      <section className="card stack">
        <div className="card__title">Pick a mode</div>
        <OptionGrid>
          <OptionCard
            label="Order"
            hint="Results appear oldest → newest, the way the career actually ran."
            onClick={() => onStart('order')}
          />
          <OptionCard
            label="Random"
            hint="The same results, revealed in a random order. Harder to read."
            onClick={() => onStart('random')}
          />
        </OptionGrid>
      </section>

      <p className="tiny faint center">
        {plural(tournaments, 'major')} · {plural(answerable, 'player')} with at least {minAppearances} of
        them · every player comes up once before any of them comes round again
      </p>
    </div>
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

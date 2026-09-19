import { useCallback, useMemo, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { CountryBadge } from '@/components/CountryBadge';
import { DifficultyCards, DifficultyChip, useDifficulty } from '@/components/DifficultyPicker';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, OptionCard, OptionGrid, PlayerLine, Stat } from '@/components/ui';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import type { Teammates } from '@/data/liquipedia/teammates';
import { useRoster } from '@/data/liquipedia/useRoster';
import { useTeammates } from '@/data/liquipedia/useTeammates';
import { DIFFICULTIES, type Difficulty } from '@/games/shared/difficulty';
import { deal, rotationKey } from '@/games/shared/rotation';
import { playerMoney, plural } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  cluesLeft,
  createGame,
  giveUp,
  MIN_CLUES,
  revealNext,
  showsMatches,
  submitGuess,
  type GameState,
  type Mode,
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

  return (
    <LiquipediaGate error={rosterError ?? teammatesError} ready={Boolean(roster && teammates)}>
      {roster && teammates ? <Game roster={roster} teammates={teammates} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, teammates }: { roster: Roster; teammates: Teammates }) {
  const [difficulty, setDifficulty] = useDifficulty();
  const [game, setGame] = useState<GameState | null>(null);

  const byId = useMemo(() => new Map(roster.players.map((player) => [player.id, player])), [roster]);
  const cluesFor = useCallback(
    (playerId: string) => teammates.cluesFor(playerId, byId),
    [teammates, byId],
  );

  /**
   * A player can only be the answer once there are enough teammates left after
   * resolving — an `unused` teammate has no row to show and no name to guess.
   */
  const eligible = useCallback(
    (players: RosterPlayer[]) => players.filter((player) => cluesFor(player.id).length >= MIN_CLUES),
    [cluesFor],
  );

  const answerable = useMemo(() => eligible(roster.players), [eligible, roster]);

  const counts = useMemo(
    () =>
      Object.fromEntries(
        DIFFICULTIES.map((level) => [level, roster.exactly(level, { eligible }).length]),
      ) as Record<Difficulty, number>,
    [roster, eligible],
  );

  const start = useCallback(
    (mode: Mode, level: Difficulty) => {
      const key = rotationKey(meta.id, level);
      const drawn = deal(roster.playersFor(level, { minimum: 1, eligible }), readLocal<string[]>(key, []));
      if (!drawn) return;
      writeLocal(key, drawn.seen);
      setGame(createGame(drawn.pick, cluesFor(drawn.pick.id), mode));
    },
    [roster, eligible, cluesFor],
  );

  const note = <RosterNote what="Teammates" generated={teammates.generated} />;

  if (!game) {
    return (
      <GameShell game={meta} dataNote={note}>
        <div className="stack">
          <section className="card stack">
            <div className="card__title">Pick a difficulty</div>
            <DifficultyCards value={difficulty} onChange={setDifficulty} counts={counts} />
            <p className="tiny faint">
              How well known the secret player is. The teammates are the same either way.
            </p>
          </section>

          <section className="card stack">
            <div className="card__title">Pick a clue order</div>
            <OptionGrid>
              {MODES.map((mode) => (
                <OptionCard
                  key={mode.id}
                  label={mode.label}
                  hint={mode.hint}
                  onClick={() => start(mode.id, difficulty)}
                />
              ))}
            </OptionGrid>
          </section>

          <p className="tiny faint center">
            {plural(answerable.length, 'player')} with at least {MIN_CLUES} recorded teammates · every player
            comes up once before any of them comes round again
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
          <Stat label="Teammates" value={`${game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
          <Stat label="Order" value={MODES.find((m) => m.id === game.mode)!.label} />
          <Stat label="Level" value={<DifficultyChip difficulty={difficulty} />} />
        </div>

        <section className="card stack">
          <div className="card__title">Tournament teammates</div>
          <ul className="stack-sm list-reset">
            {visible.map((clue) => (
              <li
                key={clue.player.id}
                className="row-between"
                style={{ padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'nowrap' }}
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
                  ? `Got it after ${game.revealed} ${game.revealed === 1 ? 'clue' : 'clues'}!`
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
            <PlayerSearch
              players={answerable}
              onPick={(player) => setGame(submitGuess(game, player))}
              exclude={guessedIds}
            />
            <button
              type="button"
              className="btn btn--block"
              onClick={() => setGame(revealNext(game))}
              disabled={cluesLeft(game) === 0}
            >
              {cluesLeft(game) === 0
                ? 'All teammates revealed — last guess!'
                : `Reveal next teammate (${cluesLeft(game)} left)`}
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

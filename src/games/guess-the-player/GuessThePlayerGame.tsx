import { useCallback, useMemo, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { CountryBadge } from '@/components/CountryBadge';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { PoolSetup } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster, RosterPlayer } from '@/data/liquipedia/roster';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { deal, rotationKey } from '@/games/shared/rotation';
import { poolScope, resolvePool, usePoolChoice } from '@/games/shared/pool';
import { playerMoney } from '@/lib/format';
import { readLocal, writeLocal } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  answerable,
  gameFor,
  giveUp,
  guessesLeft,
  MAX_GUESSES,
  submitGuess,
  type AttributeResult,
  type FeedbackMode,
  type GameState,
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
  { key: 'fncsWins', label: 'FNCS' },
];

const MODES: { id: FeedbackMode; label: string; hint: string }[] = [
  {
    id: 'exact',
    label: 'Exact',
    hint: 'Age and FNCS wins are right or wrong, nothing in between. Earnings still use direction.',
  },
  {
    id: 'direction',
    label: 'Direction',
    hint: 'Arrows show whether the secret player is higher or lower, with a warm band when you are close.',
  },
];

export default function GuessThePlayerGame() {
  const { roster, error } = useRoster();
  const { pools } = usePools();

  return (
    <LiquipediaGate error={error} ready={Boolean(roster)}>
      {roster ? <Game roster={roster} pools={pools} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, pools }: { roster: Roster; pools: Pools | null }) {
  const [choice, setChoice] = usePoolChoice();
  const [mode, setMode] = useState<FeedbackMode>('direction');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const players = useMemo(
    () => resolvePool(roster, pools, choice, answerable, 20),
    [roster, pools, choice],
  );

  const start = useCallback(() => {
    // A no-repeat cycle per pool, so the same secret does not come round twice
    // in an evening. See `games/shared/rotation.ts`.
    const key = rotationKey(meta.id, ...poolScope(choice));
    const drawn = deal(players, readLocal<string[]>(key, []));
    if (!drawn) {
      setError('No player in this pool has a published birthday and earnings figure.');
      return;
    }
    writeLocal(key, drawn.seen);
    setError(null);
    setGame(gameFor(drawn.pick, mode));
  }, [players, choice, mode]);

  if (!game) {
    return (
      <GameShell game={meta} dataNote={<RosterNote what="Secret players" />}>
        <div className="stack">
          <PoolSetup
            roster={roster}
            pools={pools}
            value={choice}
            onChange={setChoice}
            eligible={answerable}
            onStart={start}
            startLabel="Start"
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
              players={players}
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
            <div className="gp-table">
              {COLUMNS.map((column) => (
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
            Guess any player to get comparisons on region, country, status, age, earnings and FNCS wins.
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
                  {game.secret.countryName} · {game.secret.region} · {game.secret.age} yrs ·{' '}
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
            <span className="gp-swatch gp-swatch--hit" /> exact match
            <span className="gp-swatch gp-swatch--close" /> close
            <span className="gp-swatch gp-swatch--miss" /> no match
          </div>
          <p className="tiny faint">
            {game.mode === 'exact'
              ? 'Exact mode: age and FNCS wins show no arrows — they either match or they do not. Career earnings still show direction.'
              : 'Direction mode: ▲ means the secret player is higher, ▼ means lower. Amber means you are within 2 years, 1 title or 20% of the earnings.'}
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

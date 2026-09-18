import { useCallback, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { CountryBadge } from '@/components/CountryBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import type { Player } from '@/data/types';
import { REGION_LABEL } from '@/data/types';
import { playerMoney } from '@/lib/format';
import { getGame } from '@/games/registry';
import {
  createGame,
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
  { key: 'age', label: 'Age' },
  { key: 'earnings', label: 'Earnings' },
  { key: 'fncsWins', label: 'FNCS' },
];

export default function GuessThePlayerGame() {
  const dataset = useDataset();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    (mode: FeedbackMode) => {
      const created = createGame(dataset.players, mode);
      if (!created) {
        setError('No player in the dataset has the attributes this game needs.');
        return;
      }
      setError(null);
      setGame(created);
    },
    [dataset],
  );

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <section className="card stack">
            <div className="card__title">Pick a feedback style</div>
            <OptionGrid>
              <OptionCard
                label="Exact"
                hint="Age and FNCS wins are right or wrong, nothing in between. Earnings still use direction."
                onClick={() => start('exact')}
              />
              <OptionCard
                label="Direction"
                hint="Arrows show whether the secret player is higher or lower, with a warm band when you are close."
                onClick={() => start('direction')}
              />
            </OptionGrid>
          </section>
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
      toolbar={
        <>
          {game.status === 'playing' ? (
            <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
          ) : null}
          <button type="button" className="icon-btn" onClick={() => start(game.mode)}>
            ↺ New player
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Guesses left" value={guessesLeft(game)} />
          <Stat label="Used" value={`${game.rows.length}/${MAX_GUESSES}`} />
          <Stat label="Mode" value={game.mode === 'exact' ? 'Exact' : 'Direction'} />
        </div>

        {!finished ? (
          <PlayerSearch players={dataset.roster} onPick={(player) => setGame(submitGuess(game, player))} exclude={guessedIds} />
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
            Guess any player to get comparisons on region, country, age, earnings and FNCS wins.
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
                  {game.secret.countryName} · {REGION_LABEL[game.secret.region]} · {game.secret.age} yrs ·{' '}
                  {playerMoney(game.secret)} · {game.secret.fncsWins} FNCS
                </div>
              </div>
            </div>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => start(game.mode)}>
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

function Row({ player, attributes }: { player: Player; attributes: AttributeResult[] }) {
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

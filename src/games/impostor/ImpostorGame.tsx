import { useCallback, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { CountryBadge } from '@/components/CountryBadge';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import { useDataset } from '@/data/DataProvider';
import type { Player } from '@/data/types';
import { playerMoneyShort } from '@/lib/format';
import { getGame } from '@/games/registry';
import { check, createGame, createRound, impostorsLeft, pick, toggle, type GameState, type Mode } from './engine';
import './impostor.css';

const meta = getGame('impostor')!;

export default function ImpostorGame() {
  const dataset = useDataset();
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    (mode: Mode) => {
      const round = createRound(dataset);
      if (!round) {
        setError('The dataset cannot build a fair board right now.');
        return;
      }
      setError(null);
      setGame(createGame(round, mode));
    },
    [dataset],
  );

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <section className="card stack">
            <div className="card__title">Pick a mode</div>
            <OptionGrid>
              <OptionCard
                label="All at once"
                hint="Select every impostor you can see, then check. One mistake loses the round."
                onClick={() => start('all-at-once')}
              />
              <OptionCard
                label="One by one"
                hint="Click impostors one at a time. A wrong pick ends the round instantly."
                onClick={() => start('one-by-one')}
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

  const { round } = game;
  const finished = game.status !== 'playing';

  const onCardClick = (player: Player) => {
    setGame((prev) => {
      if (!prev) return prev;
      return prev.mode === 'all-at-once' ? toggle(prev, player) : pick(prev, player);
    });
  };

  return (
    <GameShell
      game={meta}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => start(game.mode)}>
          ↺ New round
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Impostors" value={round.impostorIds.size} />
          <Stat label="Left to find" value={finished ? 0 : impostorsLeft(game)} />
          <Stat label="Mode" value={game.mode === 'all-at-once' ? 'All at once' : 'One by one'} />
        </div>

        <section className="card">
          <div className="card__title">The rule</div>
          <h2>
            Every player here <span style={{ color: 'var(--primary)' }}>{round.criterion.label}</span>
          </h2>
          <p className="small muted" style={{ marginTop: 6 }}>
            …except {round.impostorIds.size === 1 ? 'one impostor' : `${round.impostorIds.size} impostors`}.
            {game.mode === 'all-at-once'
              ? ' Select them all, then hit Check.'
              : ' Click them one at a time.'}
          </p>
        </section>

        <div className="imp-grid">
          {round.board.map((player) => {
            const isImpostor = round.impostorIds.has(player.id);
            const isSelected = game.selected.has(player.id);
            const reveal = finished;
            const classes = ['imp-card'];
            if (isSelected && !reveal) classes.push('imp-card--selected');
            if (reveal && isImpostor) classes.push('imp-card--impostor');
            if (reveal && !isImpostor && isSelected) classes.push('imp-card--wrong');
            if (game.mode === 'one-by-one' && isSelected && !reveal) classes.push('imp-card--caught');

            return (
              <button
                key={player.id}
                type="button"
                className={classes.join(' ')}
                disabled={finished || (game.mode === 'one-by-one' && isSelected)}
                aria-pressed={isSelected}
                onClick={() => onCardClick(player)}
              >
                <PlayerAvatar player={player} size={44} />
                <span className="imp-card__name">{player.name}</span>
                <span className="imp-card__meta">
                  <CountryBadge code={player.country} name={player.countryName} />{' '}
                  {player.team ?? 'Free agent'}
                </span>
                <span className="imp-card__meta tiny faint">
                  {playerMoneyShort(player)} · {player.fncsWins} FNCS
                </span>
                {reveal ? (
                  <span className={`imp-card__tag ${isImpostor ? 'imp-card__tag--impostor' : ''}`}>
                    {isImpostor ? 'Impostor' : 'Fits the rule'}
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
              title={game.status === 'won' ? 'All impostors caught!' : 'Round lost'}
            >
              {game.mistake
                ? `${game.mistake.name} ${round.criterion.label} — not an impostor.`
                : game.status === 'won'
                  ? 'Exactly the right selection.'
                  : 'That selection did not match the impostors.'}
            </Banner>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => start(game.mode)}>
              Next round
            </button>
          </div>
        ) : game.mode === 'all-at-once' ? (
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            disabled={game.selected.size === 0}
            onClick={() => setGame((prev) => (prev ? check(prev) : prev))}
          >
            Check {game.selected.size > 0 ? `(${game.selected.size} selected)` : ''}
          </button>
        ) : null}
      </div>
    </GameShell>
  );
}

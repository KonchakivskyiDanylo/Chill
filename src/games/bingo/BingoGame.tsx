import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRoundRecorder } from '@/analytics/client';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { LevelSetup, type LevelOption } from '@/components/PoolSetup';
import { Banner, Hearts, Stat } from '@/components/ui';
import type { Facts } from '@/data/liquipedia/facts';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { Roster } from '@/data/liquipedia/roster';
import { loadTeammates, type Teammates } from '@/data/liquipedia/teammates';
import { useFacts } from '@/data/liquipedia/useFacts';
import { useOrgs } from '@/data/liquipedia/useOrgs';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { getGame } from '@/games/registry';
import type { PlayerCriterion } from '@/games/shared/criteria';
import { plural } from '@/lib/format';
import {
  createGame,
  current,
  generateBoard,
  giveUp,
  LEVELS,
  lines,
  livesLeft,
  outcomeOf,
  place,
  record as roundRecord,
  skip,
  solutionFor,
  SQUARES,
  type Difficulty,
  type GameState,
} from './engine';
import './bingo.css';
import { useSocials } from '@/data/useSocials';

const meta = getGame('bingo')!;

const DIFFICULTIES: LevelOption<Difficulty>[] = [
  {
    id: 'easy',
    label: '🟢 Easy',
    hint: `${LEVELS.easy.deck} famous players. ${LEVELS.easy.lives} lives.`,
  },
  {
    id: 'medium',
    label: '🟡 Medium',
    hint: `${LEVELS.medium.deck} players, the regulars too. ${LEVELS.medium.lives} lives.`,
  },
  { id: 'hard', label: '🔴 Hard', hint: `${LEVELS.hard.deck} players from anywhere. ${LEVELS.hard.lives} lives.` },
];

/**
 * A square's label: short enough for a 4×4 card on a phone ("Played Fortnite
 * World Cup Finals - Duos" does not fit in 80 pixels), and a whole phrase —
 * Tic Tac Toe's headers can say "XSET", but a lone square reading "XSET"
 * could mean anything.
 */
function squareLabel(square: PlayerCriterion): string {
  if (square.kind === 'org') return `Played for ${square.short}`;
  if (square.kind === 'country') return `From ${square.short}`;
  if (square.kind === 'region') return `Competes in ${square.short}`;
  return square.short
    .replace(/FNCS (\d{4})\s+Global Championship/, 'Globals $1')
    .replace(/Fortnite World Cup Finals - (\w+)/, 'World Cup $1')
    .replace(/Reload Elite Series (\d{4}) - Championship/, 'EWC $1')
    .replace(/FNCS (\d{4}) Major 1 Summit/, 'the $1 Summit')
    .replace(/FNCS: Invitational (\d{4})/, 'the $1 Invitational');
}

export default function BingoGame() {
  const { roster, error: rosterError } = useRoster();
  const { facts, error: factsError } = useFacts();
  const { orgs, error: orgsError } = useOrgs();

  return (
    <LiquipediaGate error={rosterError ?? factsError ?? orgsError} ready={Boolean(roster && facts && orgs)}>
      {roster && facts && orgs ? <Game roster={roster} facts={facts} orgs={orgs} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, facts, orgs }: { roster: Roster; facts: Facts; orgs: Orgs }) {
  const socials = useSocials();
  const { pools } = usePools();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: string; message: string } | null>(null);

  /*
   * Teammate counts, for the "10+ tournaments with X" squares. Loaded after
   * the first paint and not waited for: without them those squares simply do
   * not come up.
   */
  const [teammates, setTeammates] = useState<Teammates | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadTeammates().then(
      (loaded) => !cancelled && setTeammates(loaded),
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useRoundRecorder('bingo', game !== null && game.status === 'over', () => ({
    title: `Bingo — ${game!.difficulty}`,
    data: facts.generated,
    setup: { level: game!.difficulty },
    ...roundRecord(game!),
  }));

  const answers = useMemo(() => {
    const eligible = facts.eligible(3);
    return LEVELS[difficulty].bands.flatMap((band) => roster.exactly(band, { eligible }));
  }, [facts, roster, difficulty]);

  const start = useCallback(() => {
    const board = generateBoard({ facts, orgs, socials, teammates, roster: roster.players }, { answers }, difficulty);
    if (!board) {
      setError('Could not build a card from this data.');
      return;
    }
    setError(null);
    setFeedback(null);
    setGame(createGame(board, difficulty));
  }, [facts, orgs, socials, teammates, roster, answers, difficulty]);

  if (!game) {
    return (
      <GameShell game={meta} dataNote={<RosterNote />}>
        <div className="stack">
          <LevelSetup
            pools={pools}
            event={null}
            levels={DIFFICULTIES}
            value={difficulty}
            onChange={setDifficulty}
            onStart={start}
            startLabel="New card"
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

  const { board } = game;
  const player = current(game);
  const finished = game.status === 'over';
  const inLine = new Set(lines(game).flat());
  const left = board.deck.length - game.turn;

  const onSquare = (square: number) => {
    const result = place(game, square);
    if (!result) return;
    setGame(result.state);
    const name = board.deck[game.turn].name;
    if (result.outcome.kind === 'placed') {
      setFeedback({ tone: 'var(--success)', message: `${name} → ${squareLabel(board.squares[square])}.` });
    } else {
      const fits = result.outcome.fits.map((index) => squareLabel(board.squares[index]));
      setFeedback({
        tone: 'var(--danger)',
        message: `${name} is not “${squareLabel(board.squares[square])}”. ${
          fits.length ? `${name} would have fitted: ${fits.join(', ')}.` : `${name} fitted no open square — a skip.`
        }`,
      });
    }
  };

  const outcome = outcomeOf(game);

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote />}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => setGame(null)}>
          ↺ New card
        </button>
      }
    >
      <div className="stack bingo-play">
        <div className="stats">
          <Stat label="Squares" value={`${game.filled.size}/${SQUARES}`} />
          <Stat label="Players left" value={left} />
          <Stat
            label={LEVELS[game.difficulty].lives === 1 ? 'Life' : 'Lives'}
            value={<Hearts left={livesLeft(game)} total={LEVELS[game.difficulty].lives} />}
          />
        </div>

        {player ? (
          <section className="card bingo-deal" aria-live="polite">
            <div className="bingo-deal__who">
              <span className="bingo-deal__count">
                Player {game.turn + 1} of {board.deck.length} · tap a square or skip
              </span>
              <span key={player.id} className="bingo-deal__name">
                {player.name}
              </span>
            </div>
            <button
              type="button"
              className="btn bingo-deal__skip"
              onClick={() => {
                setGame(skip(game));
                setFeedback(null);
              }}
            >
              Skip ⏭
            </button>
          </section>
        ) : null}

        <div className="bingo-card" role="grid" aria-label="Bingo card">
          {board.squares.map((square, index) => {
            const marked = game.filled.get(index);
            const reveal = finished && !marked && outcome !== 'won' ? solutionFor(game, index)[0] : undefined;
            const open = !finished && !marked;
            const classes = ['bingo-sq'];
            if (marked) classes.push('bingo-sq--marked');
            if (inLine.has(index)) classes.push('bingo-sq--line');
            if (open) classes.push('bingo-sq--open');
            return (
              <button
                key={square.id}
                type="button"
                role="gridcell"
                className={classes.join(' ')}
                title={square.label}
                disabled={!open}
                onClick={() => onSquare(index)}
              >
                <span className="bingo-sq__rule">{squareLabel(square)}</span>
                {marked ? <span className="bingo-sq__player">{marked.name}</span> : null}
                {reveal ? <span className="bingo-sq__reveal">e.g. {reveal.name}</span> : null}
              </button>
            );
          })}
        </div>

        {/* Below the card, so a message never pushes the squares down. */}
        {feedback ? (
          <p className="small center" style={{ color: feedback.tone, margin: 0 }}>
            {feedback.message}
          </p>
        ) : null}

        {finished ? (
          <div className="stack">
            <Banner
              tone={outcome === 'won' ? 'success' : 'danger'}
              title={
                outcome === 'won'
                  ? 'Full card — Bingo!'
                  : game.gaveUp
                    ? 'Gave up'
                    : livesLeft(game) === 0
                      ? 'Out of lives'
                      : 'Out of players'
              }
            >
              {outcome === 'won'
                ? `All ${SQUARES} squares with ${plural(left, 'player')} to spare${game.wrong.length ? ` and ${plural(game.wrong.length, 'miss', 'misses')}` : ''}.`
                : `${game.filled.size} of ${SQUARES} squares. Each open one shows a player who would have fitted.`}
            </Banner>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              New card
            </button>
          </div>
        ) : (
          <div className="row" style={{ justifyContent: 'center' }}>
            <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
          </div>
        )}
      </div>
    </GameShell>
  );
}

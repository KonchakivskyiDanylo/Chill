import { useCallback, useMemo, useState } from 'react';
import { GameShell } from '@/components/GameShell';
import { GiveUpButton } from '@/components/GiveUpButton';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerSearch } from '@/components/PlayerSearch';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Board } from '@/data/liquipedia/rankings';
import type { Orgs } from '@/data/liquipedia/orgs';
import type { Rankings } from '@/data/liquipedia/rankings';
import type { Roster } from '@/data/liquipedia/roster';
import { useOrgs } from '@/data/liquipedia/useOrgs';
import { useRankings } from '@/data/liquipedia/useRankings';
import { useRoster } from '@/data/liquipedia/useRoster';
import type { Searchable } from '@/lib/text';
import { useBestScore } from '@/lib/storage';
import { getGame } from '@/games/registry';
import {
  applyGuess,
  createGame,
  giveUp,
  HARD_LIVES,
  slotsOf,
  type Difficulty,
  type GameState,
} from './engine';
import './tenaball.css';

const meta = getGame('tenaball')!;

const DIFFICULTIES: { id: Difficulty; label: string; hint: string }[] = [
  { id: 'easy', label: '🟢 Easy', hint: 'Unlimited guesses — just find all ten.' },
  { id: 'hard', label: '🔴 Hard', hint: `${HARD_LIVES} lives. Every wrong answer costs one.` },
];

export default function TenaballGame() {
  const { roster, error: rosterError } = useRoster();
  const { rankings, error: rankingsError } = useRankings();
  const { orgs, error: orgsError } = useOrgs();

  return (
    <LiquipediaGate
      error={rosterError ?? rankingsError ?? orgsError}
      ready={Boolean(roster && rankings && orgs)}
    >
      {roster && rankings && orgs ? <Game roster={roster} rankings={rankings} orgs={orgs} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, rankings, orgs }: { roster: Roster; rankings: Rankings; orgs: Orgs }) {
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [game, setGame] = useState<GameState | null>(null);
  const [query, setQuery] = useState('');
  const [feedback, setFeedback] = useState<{ tone: string; message: string } | null>(null);

  const start = useCallback(
    (board: Board | null) => {
      if (!board) return;
      setFeedback(null);
      setGame(createGame(board, difficulty));
    },
    [difficulty],
  );

  /**
   * What the guess box searches.
   *
   * Deliberately the *whole* population, never the ten answers — searching the
   * board would print the solution into the dropdown. A country board searches
   * every country, so typing "bra" offers Brazil whether or not Brazil is in
   * the top ten, and the board decides.
   */
  const searchPool: readonly Searchable[] = useMemo(() => {
    if (!game) return [];
    if (game.board.entity === 'org') {
      return orgs.orgs.map((org) => ({ id: org.id, name: org.name }));
    }
    if (game.board.entity === 'country') {
      const names = [...new Set(roster.players.map((p) => p.countryName).filter(Boolean))] as string[];
      return names.map((name) => ({ id: name, name }));
    }
    return roster.players;
  }, [game, orgs, roster]);

  const scoreKey = game ? `tenaball:${game.board.id}:${game.difficulty}` : 'tenaball:none';
  const { best, submit: submitScore } = useBestScore(scoreKey);

  if (!game) {
    return (
      <GameShell game={meta} dataNote={<RosterNote what="Rankings" generated={rankings.generated} />}>
        <div className="stack">
          <section className="card stack">
            <div className="card__title">Difficulty</div>
            <OptionGrid>
              {DIFFICULTIES.map((option) => (
                <OptionCard
                  key={option.id}
                  label={option.label}
                  hint={option.hint}
                  selected={difficulty === option.id}
                  onClick={() => setDifficulty(option.id)}
                />
              ))}
            </OptionGrid>
          </section>

          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={() => start(rankings.random())}
          >
            🎲 Random category
          </button>

          <CategoryPicker rankings={rankings} query={query} onQuery={setQuery} onPick={start} />
        </div>
      </GameShell>
    );
  }

  const { board } = game;
  const slots = slotsOf(board);
  const finished = game.status !== 'playing';

  const guess = (entity: Searchable) => {
    const result = applyGuess(game, entity.id, entity.name);
    setGame(result.state);
    // Recorded here rather than during render — a state setter in the render
    // body re-renders forever.
    if (result.state.status !== 'playing') submitScore(result.state.found.size);
    switch (result.outcome.kind) {
      case 'correct':
        setFeedback({ tone: 'var(--success)', message: `${entity.name} — number ${result.outcome.rank}.` });
        break;
      case 'duplicate':
        setFeedback({ tone: 'var(--warning)', message: `${entity.name} is already on the board.` });
        break;
      case 'tied':
        setFeedback({
          tone: 'var(--warning)',
          message: `${entity.name} is level with 10th but ranked out by the tie rule — no penalty.`,
        });
        break;
      default:
        setFeedback({ tone: 'var(--danger)', message: `${entity.name} is not in this top ten.` });
    }
  };

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote what="Rankings" generated={rankings.generated} />}
      toolbar={
        <button type="button" className="icon-btn" onClick={() => setGame(null)}>
          ↺ New category
        </button>
      }
    >
      <div className="stack">
        <div className="stats">
          <Stat label="Found" value={`${game.found.size}/${slots.length}`} />
          {game.difficulty === 'hard' ? <Stat label="Lives" value={game.lives} /> : null}
          <Stat label="Best" value={best} />
        </div>

        <section className="card">
          <div className="card__title">{board.group}</div>
          <h2>{board.title}</h2>
          <p className="tiny faint" style={{ marginTop: 6 }}>
            {board.tieRule}
          </p>
        </section>

        <ol className="tb-list list-reset">
          {slots.map((slot) => {
            const revealed = game.found.has(slot.rank) || finished;
            const missed = finished && !game.found.has(slot.rank);
            return (
              <li
                key={slot.rank}
                className={`tb-slot${revealed ? ' tb-slot--filled' : ''}${missed ? ' tb-slot--missed' : ''}`}
              >
                <span className="tb-slot__rank">{slot.rank}</span>
                <span className="tb-slot__name">{revealed ? slot.row.label : '—'}</span>
                <span className="tb-slot__value">{revealed ? slot.row.display : ''}</span>
              </li>
            );
          })}
        </ol>

        {feedback ? (
          <p className="small center" style={{ color: feedback.tone }}>
            {feedback.message}
          </p>
        ) : null}

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={game.status === 'won' ? 'All ten found!' : 'Board over'}
            >
              {game.status === 'won'
                ? `Every slot filled${game.wrong.length ? ` with ${game.wrong.length} wrong ${game.wrong.length === 1 ? 'answer' : 'answers'}` : ''}.`
                : `You found ${game.found.size} of ${slots.length}. The rest are revealed above.`}
            </Banner>
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              onClick={() => setGame(null)}
            >
              New category
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            <PlayerSearch
              players={searchPool}
              onPick={guess}
              placeholder={
                board.entity === 'org'
                  ? 'Name an organisation…'
                  : board.entity === 'country'
                    ? 'Name a country…'
                    : 'Name a player…'
              }
              buttonLabel="Enter"
              autoFocus
            />
            <div className="row" style={{ justifyContent: 'center' }}>
              <GiveUpButton onGiveUp={() => setGame(giveUp(game))} />
            </div>
          </div>
        )}
      </div>
    </GameShell>
  );
}

/**
 * The category list.
 *
 * There are a couple of hundred boards, which is too many for a grid of cards
 * and exactly right for a search box over headed groups: you either know what
 * you want and type two words of it, or you scroll the group you fancy.
 */
function CategoryPicker({
  rankings,
  query,
  onQuery,
  onPick,
}: {
  rankings: Rankings;
  query: string;
  onQuery: (value: string) => void;
  onPick: (board: Board) => void;
}) {
  const grouped = useMemo(() => {
    const out = new Map<string, Board[]>();
    for (const board of rankings.search(query)) {
      const list = out.get(board.group);
      if (list) list.push(board);
      else out.set(board.group, [board]);
    }
    return out;
  }, [rankings, query]);

  const total = [...grouped.values()].reduce((n, list) => n + list.length, 0);

  return (
    <section className="card stack">
      <div className="row-between">
        <div className="card__title">Or pick a category</div>
        <span className="tiny faint">{total} available</span>
      </div>
      <input
        className="input"
        value={query}
        placeholder="Search categories — “2023”, “Brazil”, “LAN”…"
        onChange={(event) => onQuery(event.target.value)}
        aria-label="Search categories"
        autoComplete="off"
        spellCheck={false}
      />
      {total === 0 ? (
        <p className="small muted">Nothing matches “{query}”.</p>
      ) : (
        <div className="tb-categories">
          {[...grouped].map(([group, boards]) => (
            <div key={group} className="stack-sm">
              <h3 className="tb-categories__head">{group}</h3>
              <div className="tb-categories__list">
                {boards.map((board) => (
                  <button
                    key={board.id}
                    type="button"
                    className="tb-category"
                    onClick={() => onPick(board)}
                  >
                    {board.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

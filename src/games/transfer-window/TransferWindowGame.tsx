import { useCallback, useEffect, useState } from 'react';
import { sendStart, useRoundRecorder } from '@/analytics/client';
import { ClueActions, GuessChips } from '@/components/ClueControls';
import { GameShell } from '@/components/GameShell';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerSearch } from '@/components/PlayerSearch';
import { LevelSetup, type LevelOption } from '@/components/PoolSetup';
import { SecretCard } from '@/components/SecretCard';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Bios } from '@/data/liquipedia/bios';
import { loadFacts, type Facts } from '@/data/liquipedia/facts';
import type { Orgs } from '@/data/liquipedia/orgs';
import { EXPORT_DATE, type Roster } from '@/data/liquipedia/roster';
import { useBios } from '@/data/liquipedia/useBios';
import { useOrgs } from '@/data/liquipedia/useOrgs';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { getGame } from '@/games/registry';
import { giveUp, guess, skip } from '@/games/shared/clue-round';
import { dealFresh, LEVEL_LABEL, levelPlayers, type Level } from '@/games/shared/levels';
import { avatarColors, initials } from '@/lib/text';
import { plural } from '@/lib/format';
import {
  createGame,
  duration,
  eligible,
  MIN_ORGS,
  record as roundRecord,
  span,
  type Clue,
  type GameState,
  type Mode,
  type OrgCard,
} from './engine';
import './transfer-window.css';

const meta = getGame('transfer-window')!;

const LEVELS: LevelOption<Level>[] = [
  { id: 'easy', label: LEVEL_LABEL.easy, hint: 'The names everyone knows.' },
  { id: 'medium', label: LEVEL_LABEL.medium, hint: 'The regulars of the scene too.' },
  { id: 'hard', label: LEVEL_LABEL.hard, hint: `Anyone with ${MIN_ORGS} organisations or more.` },
];

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'timeline', label: '🗓️ Timeline', hint: 'Oldest first, with the dates and the FNCS titles won at each.' },
  { id: 'shuffled', label: '🔀 Shuffled', hint: 'No order and no dates.' },
];

export default function TransferWindowGame() {
  const { roster, error } = useRoster();
  const { bios } = useBios();
  const { orgs } = useOrgs();
  return (
    <LiquipediaGate error={error} ready={Boolean(roster && bios)}>
      {roster && bios ? <Game roster={roster} bios={bios} orgs={orgs} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, bios, orgs }: { roster: Roster; bios: Bios; orgs: Orgs | null }) {
  const { pools } = usePools();
  const [level, setLevel] = useState<Level>('easy');
  const [mode, setMode] = useState<Mode>('timeline');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** For the trophies on a card; not waited for — without it the cards carry none. */
  const [facts, setFacts] = useState<Facts | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadFacts().then((value) => !cancelled && setFacts(value), () => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useRoundRecorder('transfer-window', game !== null && game.status !== 'playing', () => ({
    title: `Transfer Window — ${game!.secret.name}`,
    data: bios.generated ?? EXPORT_DATE,
    setup: { level, mode: game!.mode },
    ...roundRecord(game!),
  }));

  const start = useCallback(() => {
    const pick = dealFresh(meta.id, [level], levelPlayers(roster, level, eligible(bios)));
    if (!pick) {
      setError(`Nobody at this level has ${MIN_ORGS} organisations on record.`);
      return;
    }
    setError(null);
    sendStart('transfer-window', false);
    setGame(createGame(pick, bios, orgs, facts, mode));
  }, [roster, bios, orgs, facts, level, mode]);

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <LevelSetup
            pools={pools}
            event={null}
            levels={LEVELS}
            value={level}
            onChange={setLevel}
            onStart={start}
            extra={
              <section className="card stack">
                <div className="card__title">Mode</div>
                <OptionGrid>
                  {MODES.map((option) => (
                    <OptionCard
                      key={option.id}
                      label={option.label}
                      hint={option.hint}
                      selected={(bios.dated ? mode : 'shuffled') === option.id}
                      disabled={option.id === 'timeline' && !bios.dated}
                      onClick={() => setMode(option.id)}
                    />
                  ))}
                </OptionGrid>
                {bios.dated ? null : (
                  <p className="tiny faint" style={{ margin: 0 }}>
                    The timeline arrives with the next data build (bios.json). Until then, shuffled.
                  </p>
                )}
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
  const newest = finished ? -1 : game.revealed - 1;
  const cards = game.clues.map((clue, index) => ({ clue, index })).filter(({ clue }) => clue.kind === 'org');
  const factClues = game.clues.map((clue, index) => ({ clue, index })).filter(({ clue }) => clue.kind === 'fact');

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote />}
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
          <Stat label="Clues" value={`${finished ? game.earned : game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
          <Stat label="Mode" value={game.mode === 'timeline' ? 'Timeline' : 'Shuffled'} />
        </div>

        <section className="card stack">
          <div className="row-between">
            <div className="card__title" style={{ marginBottom: 0 }}>
              {game.mode === 'timeline' ? 'Career, oldest first' : 'Organisations, in no order'}
            </div>
            <span className="tiny faint">
              {game.mode === 'timeline' ? plural(cards.length, 'stint') : plural(cards.length, 'organisation')}
            </span>
          </div>
          <ol className={`tw-path list-reset${game.mode === 'timeline' ? ' tw-path--timeline' : ''}`}>
            {cards.map(({ clue, index }, position) => (
              <li key={`${(clue as Extract<Clue, { kind: 'org' }>).card.org}-${index}`} className="tw-step">
                <Card
                  card={(clue as Extract<Clue, { kind: 'org' }>).card}
                  hidden={index >= game.revealed}
                  isNew={index === newest}
                  late={finished && index >= game.earned}
                  timeline={game.mode === 'timeline'}
                />
                {position < cards.length - 1 ? (
                  <span className="tw-arrow" aria-hidden="true">
                    {game.mode === 'timeline' ? '→' : '·'}
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
          <dl className="tw-facts">
            {factClues.map(({ clue, index }) => {
              const fact = clue as Extract<Clue, { kind: 'fact' }>;
              const open = index < game.revealed;
              return (
                <div key={fact.id} className={`tw-fact${index === newest ? ' tw-fact--new' : ''}`}>
                  <dt>{fact.label}</dt>
                  <dd aria-label={open ? undefined : 'Not revealed yet'}>{open ? fact.value : '?'}</dd>
                </div>
              );
            })}
          </dl>
        </section>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={
                game.status === 'won'
                  ? `Got it in ${plural(game.earned, 'clue')}!`
                  : game.gaveUp
                    ? 'Round over'
                    : 'Out of clues'
              }
            >
              Those moves were <strong>{game.secret.name}</strong>’s.
            </Banner>
            <SecretCard player={game.secret} />
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              Next player
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            <PlayerSearch
              players={roster.players}
              onPick={(player) => setGame(guess(game, player))}
              exclude={new Set(game.guesses.map((g) => g.id))}
              autoFocus
            />
            <ClueActions round={game} noun="clue" onReveal={() => setGame(skip(game))} onGiveUp={() => setGame(giveUp(game))} />
          </div>
        )}

        <GuessChips guesses={game.guesses} secretId={game.secret.id} />
      </div>
    </GameShell>
  );
}

function Card({
  card,
  hidden,
  isNew,
  late,
  timeline,
}: {
  card: OrgCard;
  hidden: boolean;
  isNew: boolean;
  late: boolean;
  timeline: boolean;
}) {
  if (hidden) {
    return (
      <div className="tw-card tw-card--hidden" aria-label="Not revealed yet">
        <span className="tw-crest tw-crest--hidden" aria-hidden="true">
          ?
        </span>
      </div>
    );
  }
  const [from, to] = avatarColors(card.org);
  const when = timeline ? span(card) : null;
  const long = timeline ? duration(card.from, card.current ? null : card.to) : null;
  return (
    <div className={`tw-card${isNew ? ' tw-card--new' : ''}${late ? ' tw-card--late' : ''}${card.current ? ' tw-card--now' : ''}`}>
      <span className="tw-crest" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} aria-hidden="true">
        {initials(card.name)}
      </span>
      <span className="tw-card__name">{card.name}</span>
      {when ? <span className="tw-card__when">{when}</span> : null}
      <span className="tw-card__meta">
        {long ? <span>{long}</span> : null}
        {card.titles ? (
          <span className="tw-card__titles" title={plural(card.titles, 'FNCS title')}>
            🏆{card.titles > 1 ? `×${card.titles}` : ''}
          </span>
        ) : null}
        {card.current && !timeline ? <span className="tw-card__now">now</span> : null}
      </span>
    </div>
  );
}

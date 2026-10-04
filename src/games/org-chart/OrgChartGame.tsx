import { useCallback, useMemo, useState } from 'react';
import { sendStart, useRoundRecorder } from '@/analytics/client';
import { ClueActions, GuessChips } from '@/components/ClueControls';
import { GameShell } from '@/components/GameShell';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerSearch } from '@/components/PlayerSearch';
import { LevelSetup, type LevelOption } from '@/components/PoolSetup';
import { Banner, OptionCard, OptionGrid, Stat } from '@/components/ui';
import type { Bios } from '@/data/liquipedia/bios';
import type { Org, Orgs } from '@/data/liquipedia/orgs';
import type { Roster } from '@/data/liquipedia/roster';
import { useBios } from '@/data/liquipedia/useBios';
import { useOrgs } from '@/data/liquipedia/useOrgs';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { getGame } from '@/games/registry';
import { giveUp, guess, skip } from '@/games/shared/clue-round';
import { dealFresh, LEVEL_LABEL, type Level } from '@/games/shared/levels';
import { avatarColors, initials } from '@/lib/text';
import { moneyShort, plural } from '@/lib/format';
import {
  createGame,
  LEVELS,
  orgPool,
  record as roundRecord,
  tenure,
  type Clue,
  type ClueStyle,
  type GameState,
} from './engine';
import './org-chart.css';

const meta = getGame('org-chart')!;

const DIFFICULTIES: LevelOption<Level>[] = [
  { id: 'easy', label: LEVEL_LABEL.easy, hint: `The ${LEVELS.easy.top} richest organisations.` },
  { id: 'medium', label: LEVEL_LABEL.medium, hint: `The top ${LEVELS.medium.top}.` },
  { id: 'hard', label: LEVEL_LABEL.hard, hint: 'Any org with a Liquipedia page.' },
];

const STYLES: { id: ClueStyle; label: string; hint: string }[] = [
  { id: 'dates', label: '📅 Full dates', hint: 'When each player joined and when they left.' },
  { id: 'joined', label: '✍️ Joined', hint: 'Only when they joined.' },
  { id: 'names', label: '🙈 Names only', hint: 'Just the players.' },
];

const STYLE_LABEL: Record<ClueStyle, string> = { dates: 'Dates', joined: 'Joined', names: 'Names' };

export default function OrgChartGame() {
  const { roster, error: rosterError } = useRoster();
  const { orgs, error: orgsError } = useOrgs();
  const { bios } = useBios();
  return (
    <LiquipediaGate error={rosterError ?? orgsError} ready={Boolean(roster && orgs && bios)}>
      {roster && orgs && bios ? <Game roster={roster} orgs={orgs} bios={bios} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, orgs, bios }: { roster: Roster; orgs: Orgs; bios: Bios }) {
  const { pools } = usePools();
  const [level, setLevel] = useState<Level>('easy');
  const [style, setStyle] = useState<ClueStyle>('dates');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Every org with a page is a guess, not just the level's: the box must not narrow it for you. */
  const guessable = useMemo(() => orgs.orgs.filter((org) => org.hasPage), [orgs]);

  useRoundRecorder('org-chart', game !== null && game.status !== 'playing', () => ({
    title: `Org Chart — ${game!.secret.name}`,
    data: orgs.generated,
    setup: { level, mode: game!.style },
    ...roundRecord(game!),
  }));

  const start = useCallback(() => {
    const org = dealFresh(meta.id, [level], orgPool(orgs, roster, level));
    if (!org) {
      setError('No organisation at this level has enough players on record.');
      return;
    }
    setError(null);
    sendStart('org-chart', false);
    setGame(createGame(org, roster, bios, style));
  }, [orgs, roster, bios, level, style]);

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <LevelSetup
            pools={pools}
            event={null}
            levels={DIFFICULTIES}
            value={level}
            onChange={setLevel}
            onStart={start}
            extra={
              <section className="card stack">
                <div className="card__title">Clues</div>
                <OptionGrid>
                  {STYLES.map((option) => (
                    <OptionCard
                      key={option.id}
                      label={option.label}
                      hint={option.hint}
                      selected={(bios.dated ? style : 'names') === option.id}
                      disabled={option.id !== 'names' && !bios.dated}
                      onClick={() => setStyle(option.id)}
                    />
                  ))}
                </OptionGrid>
                {bios.dated ? null : (
                  <p className="tiny faint" style={{ margin: 0 }}>
                    The dates arrive with the next data build (bios.json). Until then, names only.
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
  const shown = game.clues.slice(0, game.revealed);
  const newest = finished ? -1 : game.revealed - 1;

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote />}
      toolbar={
        <>
          <button type="button" className="icon-btn" onClick={start}>
            ↺ New org
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
          <Stat label="Clues show" value={STYLE_LABEL[game.style]} />
        </div>

        <section className="card oc-board">
          <Crest org={finished ? game.secret : null} clues={game.clues} shown={game.revealed} newest={newest} />
          <ol className="oc-tree list-reset" aria-label="Players">
            {game.clues.map((clue, index) => {
              if (clue.kind !== 'player') return null;
              const hidden = index >= game.revealed;
              const late = finished && index >= game.earned;
              return (
                <li
                  key={clue.player.id}
                  className={`oc-node${hidden ? ' oc-node--hidden' : ''}${index === newest ? ' oc-node--new' : ''}${late ? ' oc-node--late' : ''}`}
                >
                  {hidden ? (
                    <span className="oc-node__name" aria-label="Not revealed yet">
                      ?
                    </span>
                  ) : (
                    <>
                      <span className="oc-node__name">{clue.player.name}</span>
                      {tenure(clue, game.style) ? (
                        <span className={`oc-node__when${clue.current ? ' oc-node__when--now' : ''}`}>
                          {tenure(clue, game.style)}
                        </span>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="tiny faint center" style={{ margin: 0 }}>
            {plural(shown.filter((clue) => clue.kind === 'player').length, 'player')} of{' '}
            {game.clues.filter((clue) => clue.kind === 'player').length} shown
          </p>
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
              The organisation was <strong>{game.secret.name}</strong>
              {game.secret.region ? `, ${game.secret.region}` : ''} — {moneyShort(game.secret.earnings)} in prize money,{' '}
              {plural(game.secret.ever.length, 'player')} on record.
            </Banner>
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              Next org
            </button>
          </div>
        ) : (
          <div className="stack-sm">
            <PlayerSearch
              players={guessable}
              onPick={(org) => setGame(guess(game, org))}
              exclude={new Set(game.guesses.map((g) => g.id))}
              placeholder="Guess an organisation…"
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

const FACTS: { id: 'region' | 'founded' | 'earnings'; label: string }[] = [
  { id: 'region', label: 'Region' },
  { id: 'founded', label: 'Founded' },
  { id: 'earnings', label: 'Prize money' },
];

/**
 * The org at the top of the chart: a crest with a question mark until the
 * round is over, and its three facts redacted until their clue comes up.
 */
function Crest({
  org,
  clues,
  shown,
  newest,
}: {
  org: Org | null;
  clues: readonly Clue[];
  shown: number;
  newest: number;
}) {
  const [from, to] = org ? avatarColors(org.id) : ['var(--surface-3)', 'var(--surface-2)'];
  return (
    <div className="oc-crest">
      <div className="oc-crest__badge" style={{ background: `linear-gradient(135deg, ${from}, ${to})` }} aria-hidden="true">
        {org ? initials(org.name) : '?'}
      </div>
      <div className="oc-crest__name">{org ? org.name : 'Unknown organisation'}</div>
      <dl className="oc-facts">
        {FACTS.map((fact) => {
          const index = clues.findIndex((clue) => clue.kind === 'fact' && clue.id === fact.id);
          if (index < 0) return null;
          const clue = clues[index] as Extract<Clue, { kind: 'fact' }>;
          const open = index < shown;
          return (
            <div key={fact.id} className={`oc-fact${index === newest ? ' oc-fact--new' : ''}`}>
              <dt>{fact.label}</dt>
              <dd className={open ? undefined : 'oc-redacted'} aria-label={open ? undefined : 'Not revealed yet'}>
                {open ? clue.value : '██████'}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

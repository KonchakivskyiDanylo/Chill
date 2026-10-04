import { useCallback, useEffect, useMemo, useState } from 'react';
import { sendStart, useRoundRecorder } from '@/analytics/client';
import { ClueActions, GuessChips } from '@/components/ClueControls';
import { GameShell } from '@/components/GameShell';
import { LiquipediaGate, RosterNote } from '@/components/LiquipediaGate';
import { PlayerSearch } from '@/components/PlayerSearch';
import { LevelSetup, type LevelOption } from '@/components/PoolSetup';
import { SecretCard } from '@/components/SecretCard';
import { Banner, Stat } from '@/components/ui';
import type { Bios } from '@/data/liquipedia/bios';
import { loadMajors, type Majors } from '@/data/liquipedia/majors';
import { loadOrgs, type Orgs } from '@/data/liquipedia/orgs';
import { EXPORT_DATE, type Roster } from '@/data/liquipedia/roster';
import { loadTeammates, type Teammates } from '@/data/liquipedia/teammates';
import { useBios } from '@/data/liquipedia/useBios';
import { usePools } from '@/data/liquipedia/usePools';
import { useRoster } from '@/data/liquipedia/useRoster';
import { getGame } from '@/games/registry';
import { giveUp, guess, skip } from '@/games/shared/clue-round';
import { dealFresh, LEVEL_LABEL, levelPlayers, type Level } from '@/games/shared/levels';
import { plural } from '@/lib/format';
import { createGame, eligible, record as roundRecord, type GameState } from './engine';
import './irl.css';
import { useSocials } from '@/data/useSocials';

const meta = getGame('irl')!;

const LEVELS: LevelOption<Level>[] = [
  { id: 'easy', label: LEVEL_LABEL.easy, hint: 'The names everyone knows.' },
  { id: 'medium', label: LEVEL_LABEL.medium, hint: 'The regulars of the scene too.' },
  { id: 'hard', label: LEVEL_LABEL.hard, hint: 'Anyone with a published real name.' },
];

export default function IrlGame() {
  const { roster, error } = useRoster();
  const { bios } = useBios();
  return (
    <LiquipediaGate error={error} ready={Boolean(roster && bios)}>
      {roster && bios ? <Game roster={roster} bios={bios} /> : null}
    </LiquipediaGate>
  );
}

function Game({ roster, bios }: { roster: Roster; bios: Bios }) {
  const { pools } = usePools();
  const [level, setLevel] = useState<Level>('easy');
  const [game, setGame] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const byId = useMemo(() => new Map(roster.players.map((player) => [player.id, player])), [roster]);

  /*
   * Three files that each add a line to the dossier, loaded behind the setup
   * screen and not waited for: a missing one costs its line, not the game.
   */
  const [orgs, setOrgs] = useState<Orgs | null>(null);
  const [teammates, setTeammates] = useState<Teammates | null>(null);
  const [majors, setMajors] = useState<Majors | null>(null);
  const socials = useSocials();
  useEffect(() => {
    let cancelled = false;
    loadOrgs().then((value) => !cancelled && setOrgs(value), () => {});
    loadTeammates().then((value) => !cancelled && setTeammates(value), () => {});
    loadMajors().then((value) => !cancelled && setMajors(value), () => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useRoundRecorder('irl', game !== null && game.status !== 'playing', () => ({
    title: `IRL — ${game!.secret.name}`,
    data: bios.generated ?? EXPORT_DATE,
    setup: { level },
    ...roundRecord(game!),
  }));

  const start = useCallback(() => {
    const pick = dealFresh(meta.id, [level], levelPlayers(roster, level, eligible(bios)));
    if (!pick) {
      setError('Nobody at this level publishes a real name.');
      return;
    }
    setError(null);
    sendStart('irl', false);
    setGame(createGame(pick, bios, { orgs, teammates, majors, socials }, byId));
  }, [roster, bios, level, orgs, teammates, majors, socials, byId]);

  if (!game) {
    return (
      <GameShell game={meta}>
        <div className="stack">
          <LevelSetup pools={pools} event={null} levels={LEVELS} value={level} onChange={setLevel} onStart={start} />
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
  const [name, ...lines] = game.clues;

  return (
    <GameShell
      game={meta}
      dataNote={<RosterNote />}
      toolbar={
        <>
          <button type="button" className="icon-btn" onClick={start}>
            ↺ New file
          </button>
          <button type="button" className="icon-btn" onClick={() => setGame(null)}>
            ⚙ Setup
          </button>
        </>
      }
    >
      <div className="stack irl-play">
        <div className="stats">
          <Stat label="Lines" value={`${finished ? game.earned : game.revealed}/${game.clues.length}`} />
          <Stat label="Guesses" value={game.guesses.length} />
        </div>

        <article className={`irl-file${finished ? ` irl-file--${game.status}` : ''}`} aria-label="Player file">
          <header className="irl-file__head">
            <span className="irl-file__org">OffSpawn · player file</span>
            <span className="irl-file__ref">{finished ? 'Declassified' : 'Classified'}</span>
          </header>
          <div className="irl-file__id">
            <div className="irl-file__photo" aria-hidden="true">
              {finished ? game.secret.name.slice(0, 2).toUpperCase() : '?'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div className="irl-file__label">{name.label}</div>
              <div className="irl-file__name">{name.value}</div>
              <div className="irl-file__handle">
                {finished ? (
                  <>
                    aka <strong>{game.secret.name}</strong>
                  </>
                ) : (
                  'aka ???'
                )}
              </div>
            </div>
            {finished ? (
              <span className="irl-stamp" aria-hidden="true">
                {game.status === 'won' ? 'Identified' : 'Unsolved'}
              </span>
            ) : null}
          </div>
          <dl className="irl-file__lines">
            {lines.map((line, i) => {
              const index = i + 1;
              const open = index < game.revealed;
              const late = finished && index >= game.earned;
              const isNew = !finished && index === game.revealed - 1;
              return (
                <div
                  key={line.id}
                  className={`irl-line${open ? '' : ' irl-line--closed'}${isNew ? ' irl-line--new' : ''}${late ? ' irl-line--late' : ''}`}
                >
                  <dt>{line.label}</dt>
                  <dd aria-label={open ? undefined : 'Not revealed yet'}>
                    {open ? (
                      <span className={line.id === 'handle' ? 'irl-line__shape' : undefined}>{line.value}</span>
                    ) : (
                      <span className="irl-redacted" style={{ width: `${40 + ((index * 37) % 45)}%` }} />
                    )}
                  </dd>
                </div>
              );
            })}
          </dl>
        </article>

        {finished ? (
          <div className="stack">
            <Banner
              tone={game.status === 'won' ? 'success' : 'danger'}
              title={
                game.status === 'won'
                  ? `Identified in ${plural(game.earned, 'line')}!`
                  : game.gaveUp
                    ? 'Round over'
                    : 'Out of lines'
              }
            >
              {name.value} is <strong>{game.secret.name}</strong>.
            </Banner>
            <SecretCard player={game.secret} />
            <button type="button" className="btn btn--primary btn--lg btn--block" onClick={start}>
              Next file
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
            <ClueActions round={game} noun="line" onReveal={() => setGame(skip(game))} onGiveUp={() => setGame(giveUp(game))} />
          </div>
        )}

        <GuessChips guesses={game.guesses} secretId={game.secret.id} />
      </div>
    </GameShell>
  );
}

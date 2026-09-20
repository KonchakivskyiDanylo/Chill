import { useMemo, type ReactNode } from 'react';
import type { Pools } from '@/data/liquipedia/pools';
import type { Roster } from '@/data/liquipedia/roster';
import { DIFFICULTY_META } from '@/games/shared/difficulty';
import {
  countFor,
  LEVELS,
  resolvePool,
  tierBands,
  type Eligible,
  type Level,
  type PoolChoice,
  type StatusChoice,
} from '@/games/shared/pool';
import { moneyShort, plural } from '@/lib/format';
import { RegionCards } from './RegionPicker';
import { OptionCard, OptionGrid } from './ui';

/**
 * The setup step every guessing game shares: who am I being asked about, and
 * then Start.
 *
 * Start is always an explicit button, even when nothing needs choosing. Three
 * of these games used to begin the moment you picked a mode, which meant the
 * first clue was on screen before you had finished reading the options — and
 * changing your mind cost you a round.
 *
 * The event-pool branch hides region, difficulty and status rather than greying
 * them out, because they do not apply at all: a pool is a fixed field of eighty
 * and that is the whole point of it.
 */

const STATUSES: { id: StatusChoice; label: string; hint: string; icon: string }[] = [
  { id: 'all', label: 'Everyone', hint: 'The whole roster, playing or not.', icon: '🌐' },
  { id: 'active', label: 'Active', hint: 'Players still competing today.', icon: '🟢' },
  { id: 'retired', label: 'Retired', hint: 'Players who have stopped — the history of the scene.', icon: '📼' },
];

export function PoolSetup({
  roster,
  pools,
  value,
  onChange,
  eligible,
  extra,
  onStart,
  startLabel = 'Start',
  canStart = true,
}: {
  roster: Roster;
  pools: Pools | null;
  value: PoolChoice;
  onChange: (next: PoolChoice) => void;
  /** This game's own answerability filter, so every count is a count of real answers. */
  eligible?: Eligible;
  /** Game-specific choices (modes, categories) shown above Start. */
  extra?: ReactNode;
  onStart: () => void;
  startLabel?: string;
  canStart?: boolean;
}) {
  const set = (patch: Partial<PoolChoice>) => onChange({ ...value, ...patch });

  const difficultyCounts = useMemo(
    () =>
      Object.fromEntries(
        LEVELS.map((level) => [level, countFor(roster, value, level, eligible)]),
      ) as Record<Level, number>,
    [roster, value, eligible],
  );

  const bands = useMemo(() => tierBands(roster, value), [roster, value]);

  const poolSizes = useMemo(() => {
    const sizes = new Map<string, number>();
    for (const pool of pools?.pools ?? []) {
      sizes.set(pool.id, resolvePool(roster, pools, { ...value, event: pool.id }, eligible).length);
    }
    return sizes;
  }, [roster, pools, value, eligible]);

  const available = (pools?.pools ?? []).filter((pool) => (poolSizes.get(pool.id) ?? 0) > 0);
  const onEvent = value.event !== null;

  return (
    <div className="stack">
      {available.length > 0 ? (
        <section className="card stack">
          <div className="card__title">Who are you playing?</div>
          <OptionGrid>
            <OptionCard
              label={
                <>
                  <span aria-hidden="true">🌐</span> Full roster
                </>
              }
              hint="Every player in the export, narrowed by region, level and status."
              selected={!onEvent}
              onClick={() => set({ event: null })}
            />
            {available.map((pool) => (
              <OptionCard
                key={pool.id}
                label={
                  <>
                    <span aria-hidden="true">🏆</span> {pool.label}
                  </>
                }
                hint={
                  <>
                    {pool.blurb}
                    <span className="tiny faint" style={{ display: 'block', marginTop: 4 }}>
                      {plural(poolSizes.get(pool.id) ?? 0, 'player')} · no levels, no regions
                    </span>
                  </>
                }
                selected={value.event === pool.id}
                onClick={() => set({ event: pool.id })}
              />
            ))}
          </OptionGrid>
        </section>
      ) : null}

      {onEvent ? null : (
        <>
          <section className="card stack">
            <div className="card__title">Region</div>
            {/* No player counts: a number tells you nothing about whether you
                will recognise anyone, and the difficulty cards below say what
                the band actually means in money. */}
            <RegionCards
              regions={roster.regions}
              value={value.region}
              onChange={(region) => set({ region })}
            />
          </section>

          <section className="card stack">
            <div className="card__title">Difficulty</div>
            <OptionGrid>
              {LEVELS.map((id) => {
                if (id === 'any') {
                  return (
                    <OptionCard
                      key={id}
                      label={
                        <>
                          <span aria-hidden="true">🎲</span> Random
                        </>
                      }
                      hint="Any player at all, from household names to one-off qualifiers. No ranking applied."
                      selected={value.difficulty === 'any'}
                      disabled={difficultyCounts.any === 0}
                      onClick={() => set({ difficulty: 'any' })}
                    />
                  );
                }
                const meta = DIFFICULTY_META[id];
                const band = bands[id];
                return (
                  <OptionCard
                    key={id}
                    label={
                      <>
                        <span aria-hidden="true">{meta.icon}</span> {meta.label}
                      </>
                    }
                    hint={
                      <>
                        {meta.blurb}
                        {band ? (
                          <span className="tiny faint" style={{ display: 'block', marginTop: 4 }}>
                            {id === 'easy'
                              ? `${moneyShort(band.min)}+ career earnings`
                              : id === 'hard'
                                ? `under ${moneyShort(band.max)} career earnings`
                                : `${moneyShort(band.min)} – ${moneyShort(band.max)} career earnings`}
                          </span>
                        ) : null}
                      </>
                    }
                    selected={value.difficulty === id}
                    // A tier with nobody in it is not a choice.
                    disabled={difficultyCounts[id] === 0}
                    onClick={() => set({ difficulty: id })}
                  />
                );
              })}
            </OptionGrid>
          </section>

          <section className="card stack">
            <div className="card__title">Still competing?</div>
            <OptionGrid>
              {STATUSES.map((status) => (
                <OptionCard
                  key={status.id}
                  label={
                    <>
                      <span aria-hidden="true">{status.icon}</span> {status.label}
                    </>
                  }
                  hint={status.hint}
                  selected={value.status === status.id}
                  onClick={() => set({ status: status.id })}
                />
              ))}
            </OptionGrid>
          </section>
        </>
      )}

      {extra}

      <button
        type="button"
        className="btn btn--primary btn--lg btn--block"
        disabled={!canStart}
        onClick={onStart}
      >
        {startLabel}
      </button>
    </div>
  );
}

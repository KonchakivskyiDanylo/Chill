import { usePools } from '@/data/liquipedia/usePools';
import { activePool, useEventMode } from '@/games/shared/mode';
import { plural } from '@/lib/format';

/**
 * The event mode, as the player meets it.
 *
 * Two pieces of one idea:
 *
 *   ModePicker  on the home page — choose the whole scene, or one tournament's
 *               field, before you choose a game.
 *   ModeChip    in the header — what is in force, everywhere, until you leave it.
 *
 * The field used to be picked inside each game, from a row of cards above
 * region and difficulty. That framed it as a fifth setting on a form, when it
 * is really the answer to "what am I in the mood for" — and a mood you are in
 * for a session, not one you re-declare ten times. Lifting it to the site makes
 * the games simpler too: with a fixed field of eighty there is nothing left to
 * narrow, so eight setup screens collapse to a single Start button.
 */

/** The choice, on the home page. */
export function ModePicker() {
  const { pools } = usePools();
  const [event, setEvent] = useEventMode();

  const available = pools?.pools ?? [];
  // No pools generated yet — say nothing rather than showing a mode of one.
  if (available.length === 0) return null;

  return (
    <section className="card stack-sm">
      <div className="card__title">What are you playing?</div>
      {/*
        Said plainly, because the cards alone do not explain the consequence.
        "FNCS 2026 Globals — 101 players" reads as a filter on one list; what it
        actually does is change the answer to every question in every game,
        on every page, until you leave it.
      */}
      <p className="small muted" style={{ margin: 0 }}>
        Pick a tournament and every game asks only about the players who qualified for it — so in
        Globals mode the answer is always one of those 101, never anyone else. Stays on across every
        game until you leave it from the header.
      </p>
      <div className="options options--compact">
        <button
          type="button"
          className="option"
          aria-pressed={event === null}
          onClick={() => setEvent(null)}
        >
          <span className="option__label">
            <span aria-hidden="true">🌐</span> The whole scene
          </span>
          <span className="option__hint tiny">Every player on record.</span>
        </button>
        {available.map((pool) => (
          <button
            key={pool.id}
            type="button"
            className="option"
            aria-pressed={event === pool.id}
            onClick={() => setEvent(pool.id)}
          >
            <span className="option__label">
              <span aria-hidden="true">🏆</span> {pool.label}
            </span>
            <span className="option__hint tiny">
              {plural(pool.players.length, 'player')} — that field only.
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * What is in force, in the header.
 *
 * Renders nothing on the whole scene: a chip that says "everything" on every
 * page is a chip nobody reads, and its absence is what makes the present one
 * mean something. The ✕ is the way out from anywhere, which matters because
 * the mode is set on a page you may not go back to.
 */
export function ModeChip() {
  const { pools } = usePools();
  const [event, setEvent] = useEventMode();
  const pool = activePool(pools, event);

  if (!pool) return null;

  return (
    <span className="mode-chip" title={`${pool.event} — ${pool.blurb}`}>
      <span aria-hidden="true">🏆</span>
      <span className="mode-chip__label">{pool.label}</span>
      <span className="mode-chip__count tiny">{pool.players.length}</span>
      <button
        type="button"
        className="mode-chip__exit"
        onClick={() => setEvent(null)}
        aria-label={`Leave ${pool.label} mode`}
        title={`Leave ${pool.label} mode`}
      >
        ✕
      </button>
    </span>
  );
}

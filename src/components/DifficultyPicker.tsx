import { DIFFICULTIES, DIFFICULTY_META, type Difficulty } from '@/games/shared/difficulty';
import { plural } from '@/lib/format';
import { useLocalState } from '@/lib/storage';
import { OptionCard, OptionGrid } from './ui';

/**
 * The difficulty controls the fame-ranked games share.
 *
 * `DifficultyCards` for the setup step, `DifficultySwitch` to change level on
 * the board, `DifficultyChip` to show what you picked while playing.
 */

/**
 * The chosen difficulty, remembered across games and reloads.
 *
 * One setting for the whole site: picking Hard in Wordle and then opening
 * Connections should not quietly drop you back to Medium.
 */
export function useDifficulty(): [Difficulty, (next: Difficulty) => void] {
  const [value, setValue] = useLocalState<Difficulty>('difficulty', 'medium');
  return [DIFFICULTIES.includes(value) ? value : 'medium', setValue];
}

/**
 * Players a game can actually use at each level, shown under the blurb.
 *
 * Deliberately the count and not a share of the roster: only about half the
 * roster has enough recorded history to be a fair answer, so the ranking's own
 * 10/30/60 split says nothing useful about the pool you are about to play.
 */
export type DifficultyCounts = Partial<Record<Difficulty, number>>;

export function DifficultyCards({
  value,
  onChange,
  counts,
}: {
  value: Difficulty | null;
  onChange: (value: Difficulty) => void;
  counts?: DifficultyCounts;
}) {
  return (
    <OptionGrid>
      {DIFFICULTIES.map((id) => {
        const meta = DIFFICULTY_META[id];
        const count = counts?.[id];
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
                {count === undefined ? null : (
                  <span className="tiny faint" style={{ display: 'block', marginTop: 4 }}>
                    {plural(count, 'player')} to play
                  </span>
                )}
              </>
            }
            selected={value === id}
            // A tier with nobody in it is not a choice. Better a greyed card
            // saying "0 players" than a Start button that hands back another
            // tier's players without saying so.
            disabled={count === 0}
            onClick={() => onChange(id)}
          />
        );
      })}
    </OptionGrid>
  );
}

/**
 * Compact segmented control. Exported so a game can put it where a stats row
 * would otherwise go — Fortnitedle shows the level on the board instead of a
 * length/guess/solved readout the grid already tells you.
 *
 * Re-picking the level you are already on does nothing. It has to: in
 * Fortnitedle a switch deals a new secret player, and Enter — the key you
 * press to submit a guess — also activates whatever button has focus, which
 * straight after a level change is this one. That threw the round away
 * mid-guess.
 */
export function DifficultySwitch({
  value,
  onChange,
}: {
  value: Difficulty;
  onChange: (value: Difficulty) => void;
}) {
  return (
    <div className="difficulty-switch" role="group" aria-label="Difficulty">
      {DIFFICULTIES.map((id) => {
        const meta = DIFFICULTY_META[id];
        return (
          <button
            key={id}
            type="button"
            className="difficulty-switch__btn"
            data-level={id}
            aria-pressed={value === id}
            // The tooltip would otherwise become the accessible name and the
            // level itself ("Hard") would never be announced.
            aria-label={`${meta.label} — ${meta.blurb}`}
            title={meta.blurb}
            onClick={() => {
              if (id !== value) onChange(id);
            }}
          >
            <span aria-hidden="true">{meta.icon}</span>
            {meta.label}
          </button>
        );
      })}
    </div>
  );
}

export function DifficultyChip({ difficulty }: { difficulty: Difficulty }) {
  const meta = DIFFICULTY_META[difficulty];
  return (
    <span className="chip" data-level={difficulty} title={meta.blurb}>
      <span aria-hidden="true">{meta.icon}</span> {meta.label}
    </span>
  );
}

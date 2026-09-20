import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EXPORT_DATE, SOURCE } from '@/data/liquipedia/roster';
import { readLocal, writeLocal } from '@/lib/storage';
import type { GameMeta } from '@/games/registry';
import { Modal } from './ui';

/**
 * Page frame shared by all ten games: title bar, "How to play" (shown
 * automatically on a first visit), the game itself, and the rules underneath.
 */
export function GameShell({
  game,
  toolbar,
  dataNote,
  examples,
  children,
}: {
  game: GameMeta;
  /** Optional controls rendered on the right of the title row (e.g. New game). */
  toolbar?: ReactNode;
  /**
   * Where this game's numbers come from. Games reading the shared dataset can
   * leave it out; Higher or Lower runs on its own roster and says so itself.
   */
  dataNote?: ReactNode;
  /**
   * Worked examples shown between the goal and the bullets. Some rules are far
   * easier to show than to write: Fortnitedle's three tile colours are three
   * sentences as prose, and three tiles as a picture.
   */
  examples?: ReactNode;
  children: ReactNode;
}) {
  const seenKey = `seen-rules:${game.id}`;
  const [showRules, setShowRules] = useState(() => !readLocal(seenKey, false));

  const dismiss = () => {
    writeLocal(seenKey, true);
    setShowRules(false);
  };

  return (
    <div className="page stack-lg">
      <div className="stack">
        <Link to="/" className="small muted" style={{ width: 'fit-content' }}>
          ← All games
        </Link>
        <div className="row-between">
          <div>
            <h1>
              <span aria-hidden="true" style={{ marginRight: 10 }}>
                {game.icon}
              </span>
              {game.title}
            </h1>
            <p className="muted small" style={{ marginTop: 4 }}>
              {game.tagline}
            </p>
          </div>
          <div className="row">
            {toolbar}
            <button type="button" className="icon-btn" onClick={() => setShowRules(true)}>
              ? How to play
            </button>
          </div>
        </div>
      </div>

      {children}

      <RulesCard game={game} dataNote={dataNote} examples={examples} />

      <Modal open={showRules} title={`How to play ${game.title}`} onClose={dismiss}>
        <Rules game={game} dataNote={dataNote} examples={examples} />
        <button type="button" className="btn btn--primary btn--block" onClick={dismiss}>
          Got it
        </button>
      </Modal>
    </div>
  );
}

function RulesList({ rules }: { rules: string[] }) {
  return (
    <ul className="stack-sm list-reset small">
      {rules.map((rule) => (
        <li key={rule} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 8 }}>
          <span aria-hidden="true" style={{ color: 'var(--primary)', lineHeight: 1.55 }}>
            ▸
          </span>
          <span>{rule}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * A game's rules, in the order they read best: the plain-English goal first,
 * then the bullets, then where the numbers came from, then the named groups
 * (categories, modes) that only make sense once you know the goal.
 */
function Rules({
  game,
  dataNote,
  examples,
}: {
  game: GameMeta;
  dataNote?: ReactNode;
  examples?: ReactNode;
}) {
  return (
    <div className="stack">
      {game.intro?.length ? (
        <div className="stack-sm">
          {game.intro.map((line) => (
            <p key={line} className="small muted">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {examples}

      {game.rules?.length ? <RulesList rules={game.rules} /> : null}

      {dataNote ?? <DataNote />}

      {game.sections?.map((section) => (
        <div key={section.title} className="stack-sm">
          <h3>{section.title}</h3>
          <RulesList rules={section.items} />
        </div>
      ))}
    </div>
  );
}

export function RulesCard({
  game,
  dataNote,
  examples,
}: {
  game: GameMeta;
  dataNote?: ReactNode;
  examples?: ReactNode;
}) {
  return (
    <section className="card stack">
      <div className="card__title">How to play</div>
      <Rules game={game} dataNote={dataNote} examples={examples} />
    </section>
  );
}

/**
 * The attribution shown when a game does not supply its own.
 *
 * Every game does supply one, so this is a backstop rather than a default —
 * but CC-BY-SA asks for attribution wherever the work appears, so the backstop
 * has to be correct rather than absent.
 */
export function DataNote() {
  return (
    <p className="tiny faint">
      Player values come from {SOURCE.name}, last updated {formatDate(EXPORT_DATE)}, reused under{' '}
      {SOURCE.license}. Where a source publishes no figure the field is left blank rather than
      estimated.
    </p>
  );
}

export function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

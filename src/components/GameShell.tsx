import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DATA_SOURCE_LABEL, DATA_UPDATED_AT } from '@/data/types';
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
  children,
}: {
  game: GameMeta;
  /** Optional controls rendered on the right of the title row (e.g. New game). */
  toolbar?: ReactNode;
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

      <RulesCard game={game} />

      <Modal open={showRules} title={`How to play — ${game.title}`} onClose={dismiss}>
        <RulesList rules={game.rules} />
        <DataNote />
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

export function RulesCard({ game }: { game: GameMeta }) {
  return (
    <section className="card stack">
      <div className="card__title">Rules</div>
      <RulesList rules={game.rules} />
      <hr className="divider" />
      <DataNote />
    </section>
  );
}

export function DataNote() {
  return (
    <p className="tiny faint">
      Player values are based on the {DATA_SOURCE_LABEL} (last update: {formatDate(DATA_UPDATED_AT)}). Figures in
      this prototype are approximate and will be replaced by live data.
    </p>
  );
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

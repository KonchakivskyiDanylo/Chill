import { useEffect, type ReactNode } from 'react';
import type { PuzzleStatus } from '@/games/shared/progress';
import type { Nameable } from '@/lib/text';
import { CountryBadge } from './CountryBadge';
import { PlayerAvatar } from './PlayerAvatar';

/**
 * Everything the shared player UI renders: an avatar, a name and a flag.
 *
 * Structural rather than `Player`, because the Wikipedia import and the
 * Liquipedia roster are two different row shapes and both are rendered by
 * these components.
 */
export interface Displayable extends Nameable {
  country: string | null;
  countryName: string | null;
  photoUrl: string | null;
}

/** A selectable card — used for every category / difficulty / mode choice. */
export function OptionCard({
  label,
  hint,
  selected,
  disabled,
  onClick,
}: {
  label: ReactNode;
  hint?: ReactNode;
  selected?: boolean;
  /** For a choice the data cannot serve — an empty tier in the chosen region. */
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="option"
      aria-pressed={Boolean(selected)}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="option__label">{label}</span>
      {hint ? <span className="option__hint">{hint}</span> : null}
    </button>
  );
}

/**
 * `compact` is for cards that are a label and nothing else — the regions.
 * Eight of them at the default 150px minimum took two rows and the height of a
 * paragraph to say eight words.
 */
export function OptionGrid({ children, compact }: { children: ReactNode; compact?: boolean }) {
  return <div className={compact ? 'options options--compact' : 'options'}>{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  );
}

/**
 * Lives as hearts, full ones first, emptying as they are spent. Every game
 * with lives shows them this way, so how many you can still get wrong reads
 * the same at a glance everywhere.
 */
export function Hearts({ left, total }: { left: number; total: number }) {
  return (
    <span className="hearts" aria-label={`${left} of ${total} ${total === 1 ? 'life' : 'lives'} left`}>
      {Array.from({ length: total }, (_, index) => (
        <span key={index} className={index < left ? 'heart' : 'heart heart--spent'} aria-hidden="true">
          {index < left ? '♥' : '♡'}
        </span>
      ))}
    </span>
  );
}

const STATUS_LABEL = { won: 'Completed', tried: 'Tried', none: 'Not played' } as const;

/**
 * Whether you have played a puzzle: green completed, yellow tried (gave up or
 * fell short), red not played. The red one is a hollow ring, so a picker you
 * have barely touched reads as a list, not as a wall of warnings.
 */
export function StatusDot({ status }: { status: PuzzleStatus | null }) {
  const key = status ?? 'none';
  return (
    <span
      className={`status-dot status-dot--${key}`}
      role="img"
      aria-label={STATUS_LABEL[key]}
      title={STATUS_LABEL[key]}
    />
  );
}

/** What the dots mean, with how many of each — shown above a picker. */
export function StatusLegend({ statuses }: { statuses: readonly (PuzzleStatus | null)[] }) {
  const count = (key: PuzzleStatus | null) => statuses.filter((status) => status === key).length;
  return (
    <div className="status-legend tiny muted">
      {(['won', 'tried', null] as const).map((key) => (
        <span key={key ?? 'none'}>
          <StatusDot status={key} />
          {count(key)} {STATUS_LABEL[key ?? 'none'].toLowerCase()}
        </span>
      ))}
    </div>
  );
}

export function Banner({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'success' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`banner banner--${tone}`} role="status">
      <div>
        {title ? <div className="banner__title">{title}</div> : null}
        {children ? <div className="small">{children}</div> : null}
      </div>
    </div>
  );
}

/** Name + avatar + a short meta line. The one place player identity is rendered. */
export function PlayerLine({
  player,
  size = 40,
  meta,
  showFlag = true,
}: {
  player: Displayable;
  size?: number;
  meta?: ReactNode;
  showFlag?: boolean;
}) {
  return (
    <div className="player-line">
      <PlayerAvatar player={player} size={size} />
      <div style={{ minWidth: 0 }}>
        <div className="player-line__name">
          {showFlag ? <CountryBadge code={player.country} name={player.countryName} /> : null}{' '}
          {player.name}
        </div>
        {meta ? <div className="player-line__meta">{meta}</div> : null}
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="modal stack"
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Dialog'}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="row-between">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

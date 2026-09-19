import { useEffect, type ReactNode } from 'react';
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

export function OptionGrid({ children }: { children: ReactNode }) {
  return <div className="options">{children}</div>;
}

export function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
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

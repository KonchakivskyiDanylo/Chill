import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EXPORT_DATE, SOURCE } from '@/data/liquipedia/roster';
import { formatDate } from './GameShell';
import { Banner } from './ui';

/**
 * Loading and failure for the games that read the Liquipedia files directly.
 *
 * Those files are per-game and load on mount, so every one of them needs the
 * same two states before it has a board to show.
 */
export function LiquipediaGate({
  error,
  ready,
  children,
}: {
  error: string | null;
  ready: boolean;
  children: ReactNode;
}) {
  if (error) {
    return (
      <Banner tone="danger" title="Player data unavailable">
        {error}
      </Banner>
    );
  }
  if (!ready) return <div className="card center muted">Loading players…</div>;
  return <>{children}</>;
}

/**
 * Where a game's players came from and under what licence.
 *
 * CC-BY-SA asks for attribution wherever the work is used, so every game that
 * reads the export carries it rather than relying on the site footer alone.
 */
export function RosterNote({
  what = 'Secret players',
  /** The date the derived file was generated, when the game reads one. */
  generated,
  /** True for the games whose numbers include the Wikipedia FNCS counts. */
  fncs = false,
}: {
  what?: string;
  generated?: string;
  fncs?: boolean;
}) {
  return (
    <p className="tiny faint">
      {what} come from{' '}
      <a href={SOURCE.url} className="link" target="_blank" rel="noreferrer noopener">
        {SOURCE.name}
      </a>{' '}
      (last update {formatDate(EXPORT_DATE)}
      {generated ? `, results built ${formatDate(generated)}` : ''}), reused under{' '}
      <a href={SOURCE.licenseUrl} className="link" target="_blank" rel="noreferrer noopener">
        {SOURCE.license}
      </a>
      .{fncs ? ' FNCS titles come from Wikipedia’s “Competitive Fortnite records and statistics”.' : ''}{' '}
      <Link to="/credits" className="link">
        Full attribution
      </Link>
      .
    </p>
  );
}

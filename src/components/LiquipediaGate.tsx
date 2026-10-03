import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { EXPORT_DATE, SOURCE } from '@/data/liquipedia/roster';
import { formatDate } from '@/lib/format';
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
 * Liquipedia's API terms want the credit "in close proximity to the data", so
 * every game carries this rather than relying on the footer. One line, but it
 * holds everything CC BY-SA asks of it: the source with a link back, that it
 * was modified, and the licence's URI. The long form is on /credits.
 */
export function RosterNote() {
  return (
    <p className="tiny faint">
      Data from{' '}
      <a href={SOURCE.url} className="link" target="_blank" rel="noreferrer noopener">
        {SOURCE.name}
      </a>{' '}
      (
      <a href={SOURCE.licenseUrl} className="link" target="_blank" rel="noreferrer noopener">
        {SOURCE.license}
      </a>
      ), modified · updated {formatDate(EXPORT_DATE)} ·{' '}
      <Link to="/credits" className="link">
        Credits
      </Link>
    </p>
  );
}

/** Display formatting shared by every game. */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function money(value: number): string {
  return usd.format(Math.round(value));
}

/** Compact money for tight spaces: $1.1M, $845K. */
export function moneyShort(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 2)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

export function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * A player's career earnings for display.
 *
 * Liquipedia publishes the top 500 only, so most of the roster has no verified
 * figure. Showing "$0" would read as "earned nothing" rather than "not
 * published", so those render as a dash.
 */
export function playerMoney(player: { earnings: number; earningsKnown: boolean }): string {
  return player.earningsKnown ? money(player.earnings) : '—';
}

/** Compact variant of {@link playerMoney}. */
export function playerMoneyShort(player: { earnings: number; earningsKnown: boolean }): string {
  return player.earningsKnown ? moneyShort(player.earnings) : '—';
}

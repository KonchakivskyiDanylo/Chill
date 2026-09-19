/**
 * Country marker.
 *
 * Deliberately a text badge rather than a flag emoji: Windows browsers do not
 * render regional-indicator flags at all, so emoji would show as bare letters
 * for a large share of players.
 */
export function CountryBadge({ code, name }: { code: string | null; name?: string | null }) {
  // Most of the Liquipedia roster publishes a nationality and some does not.
  // Rendering nothing beats every caller writing the same guard.
  if (!code) return null;
  return (
    <span className="flag" title={name ?? code}>
      {code.toUpperCase()}
    </span>
  );
}

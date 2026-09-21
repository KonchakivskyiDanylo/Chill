import { avatarColors, initials } from '@/lib/text';

/**
 * Everything the avatar needs, and nothing else.
 *
 * Structural rather than a `Pick` of a row type: the avatar is happy to render
 * anything with a stable id and a name, and tying it to one table's shape only
 * ever meant it could not render the other's.
 */
interface Avatarable {
  id: string;
  name: string;
  photoUrl: string | null;
}

/**
 * Headshot when the data source provides one, otherwise a stable colour +
 * initials tile. The sample dataset has no photos, so this is what ships in V1;
 * setting `photoUrl` on a player is all that is needed to show real images.
 */
export function PlayerAvatar({ player, size = 40 }: { player: Avatarable; size?: number }) {
  const [from, to] = avatarColors(player.id);
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(10, Math.round(size * 0.36)),
        background: `linear-gradient(135deg, ${from}, ${to})`,
      }}
      aria-hidden="true"
    >
      {player.photoUrl ? <img src={player.photoUrl} alt="" loading="lazy" /> : initials(player.name)}
    </div>
  );
}

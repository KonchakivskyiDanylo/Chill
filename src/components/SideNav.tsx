import { NavLink } from 'react-router-dom';
import { VISIBLE_GAMES } from '@/games/registry';

/**
 * The games list, permanently down the left of every page.
 *
 * Three shapes, one component, because they are the same list at three widths:
 *
 *   open       title + tagline per game — the default on a wide screen
 *   collapsed  an icon rail, so the nav costs 56px instead of 268px
 *   drawer     under 900px the rail is useless on a touch target, so the panel
 *              slides over the page instead and a backdrop closes it
 *
 * `NavLink` rather than `Link`: the game you are playing is the one piece of
 * state the list can show, and it saves a "where am I" glance on every page.
 */
export function SideNav({
  open,
  collapsed,
  onClose,
}: {
  /** Drawer/rail state. On a wide screen `false` means the icon rail. */
  open: boolean;
  /** True on a wide screen while closed — render the rail, not nothing. */
  collapsed: boolean;
  onClose: () => void;
}) {
  return (
    <aside
      className={`side-nav${open ? ' side-nav--open' : ''}${collapsed ? ' side-nav--rail' : ''}`}
      aria-label="Games"
    >
      <div className="side-nav__head">
        <span className="side-nav__eyebrow">Play Fortnite Games</span>
        <button type="button" className="side-nav__close" onClick={onClose} aria-label="Hide the games list">
          ✕
        </button>
      </div>

      <nav className="side-nav__list">
        {VISIBLE_GAMES.map((game) => (
          <NavLink
            key={game.id}
            to={`/game/${game.slug}`}
            className={({ isActive }) => `side-nav__item${isActive ? ' side-nav__item--active' : ''}`}
            // On the rail the label is clipped away, so the only name left is
            // the tooltip and the accessible one.
            title={collapsed ? `${game.title} — ${game.tagline}` : undefined}
          >
            <span className="side-nav__icon" aria-hidden="true">
              {game.icon}
            </span>
            <span className="side-nav__text">
              <span className="side-nav__title">{game.title}</span>
              <span className="side-nav__tagline">{game.tagline}</span>
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

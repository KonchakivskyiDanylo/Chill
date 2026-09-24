import { useEffect, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLocalState } from '@/lib/storage';
import { ModeChip } from './EventMode';
import { Footer } from './Footer';
import { SideNav } from './SideNav';
import { SupportButton } from './Support';

type Theme = 'dark' | 'light';

/** Below this the games list is a drawer over the page, not a column beside it. */
const WIDE = '(min-width: 900px)';

/**
 * The crown. Drop your own file at `public/logo.png` (any crop works — it is
 * rendered with `object-fit: contain`) and it shows up here and as the favicon.
 * Until then the wordmark stands on its own rather than showing a broken image.
 */
function BrandMark() {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="brand__mark" aria-hidden="true">OS</span>;
  return (
    <img
      src="/logo.jpg"
      alt=""
      className="brand__logo"
      width={34}
      height={34}
      onError={() => setFailed(true)}
    />
  );
}

/** Tracks a media query, for the one layout decision CSS cannot make alone. */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === 'undefined' ? true : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

export function Layout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalState<Theme>('theme', 'dark');
  const wide = useMediaQuery(WIDE);
  const { pathname } = useLocation();

  // Two states, because the button means two different things. On a wide screen
  // it pins the list open and is worth remembering; on a phone it opens a
  // drawer over the page, which must never be what you land on.
  const [pinned, setPinned] = useLocalState<boolean>('nav-open', true);
  const [drawer, setDrawer] = useState(false);

  const open = wide ? pinned : drawer;
  const collapsed = wide && !pinned;
  const toggle = () => (wide ? setPinned(!pinned) : setDrawer(!drawer));
  const close = () => (wide ? setPinned(false) : setDrawer(false));

  // Picking a game from the drawer should leave you looking at the game.
  useEffect(() => setDrawer(false), [pathname]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header__inner">
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-expanded={open}
            aria-label={open ? 'Hide the games list' : 'Show the games list'}
            title={open ? 'Hide the games list' : 'Show the games list'}
          >
            ☰
          </button>
          <Link to="/" className="brand">
            <BrandMark />
            <span>
              Off<span className="brand__accent">Spawn</span>
            </span>
          </Link>
          <span className="chip chip--primary tiny site-header__badge" style={{ marginLeft: 2 }}>
            Prototype
          </span>
          <div className="spacer" />
          {/* Only renders when an event mode is in force — see `EventMode`. */}
          <ModeChip />
          <SupportButton />
          <button
            type="button"
            className="icon-btn"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      <div className="app__body">
        <SideNav open={open} collapsed={collapsed} onClose={close} />
        {open && !wide ? (
          <div className="side-nav__backdrop" onClick={close} role="presentation" />
        ) : null}
        <div className="app__main">
          {children}
          <Footer />
        </div>
      </div>
    </div>
  );
}

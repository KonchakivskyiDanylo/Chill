import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocalState } from '@/lib/storage';
import { Footer } from './Footer';

type Theme = 'dark' | 'light';

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

export function Layout({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useLocalState<Theme>('theme', 'dark');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <div className="app">
      <header className="site-header">
        <div className="site-header__inner">
          <Link to="/" className="brand">
            <BrandMark />
            <span>
              Off<span className="brand__accent">Spawn</span>
            </span>
          </Link>
          <span className="chip chip--primary tiny" style={{ marginLeft: 2 }}>
            Prototype
          </span>
          <div className="spacer" />
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
      {children}
      <Footer />
    </div>
  );
}

import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLocalState } from '@/lib/storage';

type Theme = 'dark' | 'light';

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
            <span className="brand__mark" aria-hidden="true">
              FN
            </span>
            <span>ChillFN</span>
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
    </div>
  );
}

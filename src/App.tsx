import { lazy, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { getGame, OPEN_HIDDEN } from '@/games/registry';
import { Credits } from '@/pages/Credits';
import { Home } from '@/pages/Home';

/**
 * Not linked from anywhere: it is the site owner's page, behind a password.
 * Lazy, so its code is never part of what a player downloads.
 */
const Analytics = lazy(() => import('@/pages/Analytics'));

/**
 * No data provider.
 *
 * Every game now reads the Liquipedia export through its own `loadX()` cache
 * and waits on it behind `LiquipediaGate`, so there is nothing app-wide left
 * to load — and nothing to make a game queue behind data it never reads.
 */
function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const game = slug ? getGame(slug) : undefined;

  // A hidden game is not on the live site at all, address included.
  if (!game || (game.hidden && !OPEN_HIDDEN)) return <Navigate to="/" replace />;

  const { Component } = game;
  return (
    <Suspense fallback={<div className="page center muted">Loading game…</div>}>
      <Component />
    </Suspense>
  );
}

function NotFound() {
  return (
    <div className="page center stack">
      <h1>Page not found</h1>
      <Link to="/" className="btn btn--primary" style={{ margin: '0 auto' }}>
        Back to the games
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/credits" element={<Credits />} />
        <Route
          path="/analytics/*"
          element={
            <Suspense fallback={<div className="page center muted">Loading…</div>}>
              <Analytics />
            </Suspense>
          }
        />
        <Route path="/game/:slug" element={<GamePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

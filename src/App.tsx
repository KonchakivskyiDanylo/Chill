import { Suspense } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { getGame } from '@/games/registry';
import { Credits } from '@/pages/Credits';
import { Home } from '@/pages/Home';

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

  if (!game) return <Navigate to="/" replace />;

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
        <Route path="/game/:slug" element={<GamePage />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Layout>
  );
}

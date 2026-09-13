import { Suspense } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DataProvider, RequireData } from '@/data/DataProvider';
import { getGame } from '@/games/registry';
import { Home } from '@/pages/Home';

function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const game = slug ? getGame(slug) : undefined;

  if (!game) return <Navigate to="/" replace />;

  const { Component } = game;
  return (
    <RequireData>
      <Suspense fallback={<div className="page center muted">Loading game…</div>}>
        <Component />
      </Suspense>
    </RequireData>
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
    <DataProvider>
      <Layout>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/game/:slug" element={<GamePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </DataProvider>
  );
}

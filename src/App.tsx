import { Suspense } from 'react';
import { Link, Navigate, Route, Routes, useParams } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { DataProvider, RequireData } from '@/data/DataProvider';
import { getGame } from '@/games/registry';
import { Credits } from '@/pages/Credits';
import { Home } from '@/pages/Home';

function GamePage() {
  const { slug } = useParams<{ slug: string }>();
  const game = slug ? getGame(slug) : undefined;

  if (!game) return <Navigate to="/" replace />;

  const { Component } = game;
  const board = (
    <Suspense fallback={<div className="page center muted">Loading game…</div>}>
      <Component />
    </Suspense>
  );

  // Higher or Lower loads its own roster, so it must not queue behind the
  // shared dataset it never reads.
  return game.needsDataset === false ? board : <RequireData>{board}</RequireData>;
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
          <Route path="/credits" element={<Credits />} />
          <Route path="/game/:slug" element={<GamePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Layout>
    </DataProvider>
  );
}

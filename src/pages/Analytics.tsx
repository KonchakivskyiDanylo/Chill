import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import type { Dashboard } from '@/analytics/aggregate';
import { GAME_IDS, type ClientError, type Stored, type StoredSupport } from '@/analytics/types';
import { usePools } from '@/data/liquipedia/usePools';
import { getGame } from '@/games/registry';
import { AdminContext, api, useAdminData, useScope } from './analytics/api';
import { GamePage } from './analytics/GamePage';
import { Errors, Inbox } from './analytics/Inbox';
import { gameTitle } from './analytics/labels';
import { Overview } from './analytics/Overview';
import { PlayerPage, Players } from './analytics/Players';
import { FilterBar } from './analytics/ui';
import './analytics.css';

/**
 * `#/analytics` — the site owner's page.
 *
 * Password-protected by the server (`ADMIN_PASSWORD`), not linked from
 * anywhere, and lazy-loaded so none of it ships to players. Everything on it
 * is computed from the stored rounds on request, so it is always current.
 *
 * A page per question rather than one long scroll:
 *
 *   /analytics                 every game: volume, outcomes, how rounds were set up
 *   /analytics/game/<id>       one game, with the tables only it has
 *   /analytics/players         find a player
 *   /analytics/players/<id>    one player across every game
 *   /analytics/support         the 💬 inbox
 *   /analytics/errors          browser errors
 *
 * The range and the filters live in the query string and ride along on every
 * link, so they hold while you move between pages.
 */

type Session = 'checking' | 'out' | 'in' | 'off' | 'offline';

export default function Analytics() {
  const [session, setSession] = useState<Session>('checking');

  const check = useCallback(async () => {
    try {
      const { status } = await api('me');
      setSession(status === 204 ? 'in' : status === 503 ? 'off' : 'out');
    } catch {
      setSession('offline');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);
  const loggedOut = useCallback(() => setSession('out'), []);

  return (
    <div className="page stack an-page">
      <h1 style={{ margin: 0 }}>Analytics</h1>
      {session === 'checking' ? <p className="muted">Checking…</p> : null}
      {session === 'offline' ? (
        <p className="muted">
          The server is not answering. Locally, run <code>npm run dev:all</code>.
        </p>
      ) : null}
      {session === 'off' ? (
        <p className="muted">
          The dashboard is switched off: set <code>ADMIN_PASSWORD</code> on the server.
        </p>
      ) : null}
      {session === 'out' ? <Login onIn={() => setSession('in')} /> : null}
      {session === 'in' ? <Board onOut={loggedOut} /> : null}
    </div>
  );
}

function Login({ onIn }: { onIn: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card stack an-login"
      onSubmit={async (event) => {
        event.preventDefault();
        const { status, body } = await api<{ error: string }>('login', {
          method: 'POST',
          body: JSON.stringify({ password }),
        });
        if (status === 204) onIn();
        else setError(body?.error ?? 'Could not log in');
      }}
    >
      <label className="stack-sm">
        <span className="field-label">Password</span>
        <input
          className="input"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
        />
      </label>
      {error ? <p className="small" style={{ color: 'var(--danger)', margin: 0 }}>{error}</p> : null}
      <button type="submit" className="btn btn--primary">
        Log in
      </button>
    </form>
  );
}

function Board({ onOut }: { onOut: () => void }) {
  const [tick, setTick] = useState(0);
  const context = useMemo(() => ({ onOut, tick }), [onOut, tick]);
  return (
    <AdminContext.Provider value={context}>
      <Pages onReload={() => setTick((n) => n + 1)} onOut={onOut} />
    </AdminContext.Provider>
  );
}

function Pages({ onReload, onOut }: { onReload: () => void; onOut: () => void }) {
  const { query, search } = useScope();
  const { pathname } = useLocation();
  const { pools } = usePools();
  // The overview's numbers, and the filter dropdowns' options on every page.
  const { data } = useAdminData<Dashboard>(`dashboard?${query({ game: undefined })}`);
  const { data: tickets } = useAdminData<StoredSupport[]>('support');
  const { data: errors } = useAdminData<Stored<ClientError>[]>('errors');

  const fresh = (tickets ?? []).filter((ticket) => ticket.status === 'new').length;
  const inbox = /\/analytics\/(support|errors)/.test(pathname);
  const on = (path: string) => ({ pathname: path, search: search ? `?${search}` : '' });
  const tab = ({ isActive }: { isActive: boolean }) => `an-tab${isActive ? ' is-active' : ''}`;

  return (
    <div className="stack">
      <nav className="row-between an-bar" aria-label="Analytics">
        <div className="an-tabs">
          <NavLink end to={on('/analytics')} className={tab}>
            Overview
          </NavLink>
          <NavLink to={on('/analytics/players')} className={tab}>
            Players
          </NavLink>
          <NavLink to={on('/analytics/support')} className={tab}>
            Support{fresh ? ` (${fresh} new)` : ''}
          </NavLink>
          <NavLink to={on('/analytics/errors')} className={tab}>
            Errors{errors ? ` (${errors.length})` : ''}
          </NavLink>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={onReload} aria-label="Reload">
            ↻
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await api('logout', { method: 'POST' });
              onOut();
            }}
          >
            Log out
          </button>
        </div>
      </nav>

      {inbox ? null : (
        <>
          <div className="an-games" aria-label="Games">
            {GAME_IDS.map((id) => (
              <NavLink key={id} to={on(`/analytics/game/${id}`)} className={({ isActive }) => `an-game${isActive ? ' is-active' : ''}`}>
                <span aria-hidden="true">{getGame(id)?.icon}</span> {gameTitle(id)}
                <span className="an-game__n">{data?.games.find((g) => g.game === id)?.rounds ?? '·'}</span>
              </NavLink>
            ))}
          </div>
          <FilterBar options={data?.options ?? null} pools={pools} />
        </>
      )}

      <Routes>
        <Route index element={<Overview data={data} pools={pools} />} />
        <Route path="game/:id" element={<GamePage pools={pools} />} />
        <Route path="players" element={<Players />} />
        <Route path="players/:id" element={<PlayerPage />} />
        <Route path="support" element={<Inbox tickets={tickets} onChange={onReload} />} />
        <Route path="errors" element={<Errors errors={errors} />} />
        <Route path="*" element={<Navigate to={on('/analytics')} replace />} />
      </Routes>
    </div>
  );
}

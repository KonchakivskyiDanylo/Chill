import { useCallback, useEffect, useState } from 'react';
import { Card } from './ui';

interface PlatformStatus {
  configured: boolean;
  connected: boolean;
  fetched: string | null;
  players: number;
  fresh: boolean;
  running: boolean;
  error: string | null;
}

interface Status {
  links: boolean;
  login: { code: string; url: string } | null;
  youtube: PlatformStatus;
  twitch: PlatformStatus;
}

/**
 * `/analytics/socials` — the follower counts the server keeps (`server/socials.ts`):
 * how fresh each platform is, the one-time Twitch login, and a refresh now.
 */
export function Socials() {
  const [status, setStatus] = useState<Status | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/socials');
    if (res.ok) setStatus((await res.json()) as Status);
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const post = async (path: string) => {
    const res = await fetch(`/api/admin/socials/${path}`, { method: 'POST' });
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    setMessage(body.error ?? null);
    void load();
  };

  if (!status) return <p className="muted">Loading…</p>;

  return (
    <div className="stack">
      {!status.links ? (
        <Card title="No links yet">
          <p className="small">
            The server reads each player's channels from <code>links.json</code>, which{' '}
            <code>scripts/build_data.py</code> writes. Run it, commit the file, and deploy.
          </p>
        </Card>
      ) : null}

      {(['twitch', 'youtube'] as const).map((platform) => {
        const s = status[platform];
        const name = platform === 'twitch' ? 'Twitch followers' : 'YouTube subscribers';
        const limit = platform === 'twitch' ? '24 hours' : '30 days';
        return (
          <Card
            key={platform}
            title={name}
            aside={
              <span className={`chip ${s.fresh ? 'chip--success' : 'chip--danger'}`}>
                {s.running ? 'Fetching…' : s.fresh ? 'Live on the site' : 'Not on the site'}
              </span>
            }
          >
            <ul className="small stack-sm list-reset">
              <li>
                {s.fetched
                  ? `Fetched ${new Date(s.fetched).toLocaleString()} — ${s.players.toLocaleString()} players. Served for ${limit}.`
                  : 'Never fetched.'}
              </li>
              {!s.configured ? (
                <li>
                  Set <code>{platform === 'twitch' ? 'TWITCH_CLIENT_ID' : 'YOUTUBE_API_KEY'}</code> on the server.
                </li>
              ) : null}
              {platform === 'twitch' && s.configured && !s.connected ? (
                <li>Twitch only gives follower totals to a logged-in account: log in once below.</li>
              ) : null}
              {s.error ? <li style={{ color: 'var(--danger)' }}>Last run: {s.error}</li> : null}
            </ul>
          </Card>
        );
      })}

      {status.login ? (
        <Card title="Twitch login">
          <p className="small">
            Open{' '}
            <a href={status.login.url} target="_blank" rel="noreferrer">
              {status.login.url}
            </a>{' '}
            and enter <strong style={{ fontFamily: 'var(--mono)', fontSize: '1.2em' }}>{status.login.code}</strong>. This
            page notices by itself.
          </p>
        </Card>
      ) : null}

      <div className="row">
        {status.twitch.configured ? (
          <button type="button" className="btn" onClick={() => void post('twitch-login')}>
            {status.twitch.connected ? 'Log in to Twitch again' : 'Log in to Twitch'}
          </button>
        ) : null}
        <button type="button" className="btn btn--primary" onClick={() => void post('refresh')}>
          Fetch now
        </button>
      </div>
      {message ? <p className="small" style={{ color: 'var(--danger)' }}>{message}</p> : null}
      <p className="tiny faint">
        The server fetches by itself about once a day. The counts are never written to git: YouTube allows keeping them
        30 days and Twitch 24 hours, so only the latest set is kept, and an old one is not shown.
      </p>
    </div>
  );
}

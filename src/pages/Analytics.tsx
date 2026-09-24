import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type {
  BoardRow,
  ClueRow,
  Count,
  Dashboard,
  GameOverview,
  SecretRow,
} from '@/analytics/aggregate';
import type { ClientError, Stored, StoredSupport, SupportStatus } from '@/analytics/types';
import { Stat } from '@/components/ui';
import { getGame } from '@/games/registry';
import './analytics.css';

/**
 * `#/analytics` — the site owner's page.
 *
 * Password-protected by the server (`ADMIN_PASSWORD`), not linked from
 * anywhere, and lazy-loaded so none of it ships to players. Everything on it
 * is computed from the stored rounds on request, so it is always current.
 */

type Session = 'checking' | 'out' | 'in' | 'off' | 'offline';
type Tab = 'overview' | 'games' | 'support' | 'errors';

async function api<T>(path: string, init?: RequestInit): Promise<{ status: number; body: T | null }> {
  const res = await fetch(`/api/admin/${path}`, {
    credentials: 'same-origin',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: text ? (JSON.parse(text) as T) : null };
}

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
      <h1>Analytics</h1>
      {session === 'checking' ? <p className="muted">Checking…</p> : null}
      {session === 'offline' ? (
        <p className="muted">
          The server is not answering. Locally, run <code>npm run api</code> beside <code>npm run dev</code>.
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

// ---------------------------------------------------------------- the page --

const RANGES: { days: number; label: string }[] = [
  { days: 1, label: 'Today' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
  { days: 0, label: 'All time' },
];

function Board({ onOut }: { onOut: () => void }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Dashboard | null>(null);
  const [tickets, setTickets] = useState<StoredSupport[]>([]);
  const [errors, setErrors] = useState<Stored<ClientError>[]>([]);

  const load = useCallback(async () => {
    const [dash, support, faults] = await Promise.all([
      api<Dashboard>(`dashboard?days=${days}`),
      api<StoredSupport[]>('support'),
      api<Stored<ClientError>[]>('errors'),
    ]);
    if ([dash, support, faults].some((res) => res.status === 401)) return onOut();
    setData(dash.body);
    setTickets(support.body ?? []);
    setErrors(faults.body ?? []);
  }, [days, onOut]);

  useEffect(() => {
    void load();
  }, [load]);

  const fresh = tickets.filter((ticket) => ticket.status === 'new').length;

  return (
    <div className="stack">
      <div className="row-between an-bar">
        <div className="an-tabs">
          {(['overview', 'games', 'support', 'errors'] as Tab[]).map((id) => (
            <button key={id} type="button" className="an-tab" aria-pressed={tab === id} onClick={() => setTab(id)}>
              {id === 'support' ? `Support${fresh ? ` (${fresh} new)` : ''}` : id === 'errors' ? `Errors (${errors.length})` : id[0].toUpperCase() + id.slice(1)}
            </button>
          ))}
        </div>
        <div className="row">
          <select className="input an-range" value={days} onChange={(event) => setDays(Number(event.target.value))}>
            {RANGES.map((range) => (
              <option key={range.days} value={range.days}>
                {range.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => void load()}>
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
      </div>

      {!data ? <p className="muted">Loading…</p> : null}
      {data && tab === 'overview' ? <Overview data={data} /> : null}
      {data && tab === 'games' ? <Games data={data} /> : null}
      {tab === 'support' ? <Inbox tickets={tickets} onChange={load} /> : null}
      {tab === 'errors' ? <Errors errors={errors} /> : null}
    </div>
  );
}

// ------------------------------------------------------------------ pieces --

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const title = (id: string) => getGame(id)?.title ?? id;

function Table({ head, rows, empty = 'Nothing yet.' }: { head: string[]; rows: ReactNode[][]; empty?: string }) {
  if (rows.length === 0) return <p className="small muted">{empty}</p>;
  return (
    <div className="scroll-x">
      <table className="an-table">
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const counts = (items: Count[]) => items.map((item) => `${item.label} ${item.count}`).join(' · ') || '—';

function Section({ name, children, open }: { name: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="card an-section" open={open}>
      <summary className="card__title">{name}</summary>
      <div className="stack">{children}</div>
    </details>
  );
}

// ---------------------------------------------------------------- overview --

function Overview({ data }: { data: Dashboard }) {
  const peak = Math.max(1, ...data.days.map((day) => day.rounds));
  return (
    <div className="stack">
      <div className="stats">
        <Stat label="Rounds in range" value={data.rounds} />
        <Stat label="Today" value={data.days[data.days.length - 1]?.rounds ?? 0} />
      </div>

      <section className="card stack-sm">
        <div className="card__title">Rounds per day, last 30</div>
        <div className="an-bars" role="img" aria-label="Rounds per day">
          {data.days.map((day) => (
            <div key={day.day} className="an-bars__bar" title={`${day.day}: ${day.rounds}`}>
              <span style={{ height: `${(day.rounds / peak) * 100}%` }} />
            </div>
          ))}
        </div>
      </section>

      <section className="card stack-sm">
        <div className="card__title">By game</div>
        <Table
          head={['Game', 'Rounds', 'Won', 'Lost', 'Gave up', 'How it was set up']}
          rows={[...data.games]
            .sort((a, b) => b.rounds - a.rounds)
            .map((game: GameOverview) => [
              title(game.game),
              game.rounds,
              pct(game.outcomes.won + game.outcomes.cleared, game.rounds),
              pct(game.outcomes.lost, game.rounds),
              pct(game.outcomes['gave-up'], game.rounds),
              <span className="tiny">
                {game.setups.map((setup) => (
                  <span key={setup.field} className="an-setup">
                    <strong>{setup.field}</strong> {counts(setup.values)}
                  </span>
                ))}
              </span>,
            ])}
        />
      </section>
    </div>
  );
}

// ------------------------------------------------------------------- games --

function Secrets({ rows }: { rows: SecretRow[] }) {
  return (
    <Table
      head={['Player', 'Plays', 'Solved', 'Avg guesses when solved']}
      rows={rows.slice(0, 100).map((row) => [row.name, row.plays, pct(row.solved, row.plays), row.avgGuesses ?? '—'])}
    />
  );
}

function Clues({ rows }: { rows: ClueRow[] }) {
  if (rows.length === 0) return <p className="small muted">Nothing yet.</p>;
  return (
    <div className="stack-sm">
      {rows.slice(0, 100).map((row) => (
        <details key={row.id} className="an-row">
          <summary>
            <strong>{row.name}</strong> — {row.plays} plays, solved {pct(row.solved, row.plays)}, avg{' '}
            {row.avgClues ?? '—'} clues / {row.avgGuesses ?? '—'} guesses
          </summary>
          <Table
            head={['Clue', 'Solved right after it', 'Reached', 'Skipped', 'Guessed wrong']}
            rows={row.clues.map((clue) => [clue.name, `${clue.solved}/${clue.reached}`, clue.reached, clue.skipped, clue.wrong])}
          />
          {row.mistakenFor.length ? <p className="tiny muted">Mistaken for: {counts(row.mistakenFor)}</p> : null}
        </details>
      ))}
    </div>
  );
}

function Boards({ rows, wrong }: { rows: BoardRow[]; wrong?: boolean }) {
  if (rows.length === 0) return <p className="small muted">Nothing yet.</p>;
  return (
    <div className="stack-sm">
      {rows.slice(0, 150).map((row) => (
        <details key={row.id} className="an-row">
          <summary>
            <strong>{row.name}</strong> — {row.plays} plays, {Math.round(row.avgShare * 100)}% found on average,{' '}
            {row.perfect} perfect, {row.gaveUp} gave up
          </summary>
          <p className="tiny">
            <strong>Easiest:</strong>{' '}
            {row.answers.slice(0, 5).map((a) => `${a.name} ${a.found}/${a.seen}`).join(' · ')}
          </p>
          <p className="tiny">
            <strong>Hardest:</strong>{' '}
            {row.answers.slice(-5).reverse().map((a) => `${a.name} ${a.found}/${a.seen}`).join(' · ')}
          </p>
          {wrong && row.wrong.length ? <p className="tiny muted">Wrong answers typed: {counts(row.wrong)}</p> : null}
        </details>
      ))}
    </div>
  );
}

function Games({ data }: { data: Dashboard }) {
  const hardestCells = [...data.ticTacToe].filter((c) => c.plays >= 3).sort((a, b) => a.filled / a.plays - b.filled / b.plays);
  return (
    <div className="stack">
      <Section name="Fortnitedle" open>
        <Secrets rows={data.wordle} />
      </Section>
      <Section name="Guess the Player">
        <Secrets rows={data.guessThePlayer} />
      </Section>
      <Section name="Career Path">
        <Clues rows={data.careerPath} />
      </Section>
      <Section name="Who Are Ya?">
        <Clues rows={data.whoAreYa} />
      </Section>
      <Section name="Tenaball">
        <Boards rows={data.tenaball} wrong />
      </Section>
      <Section name="List">
        <Boards rows={data.list} />
      </Section>
      <Section name="Griefer">
        <Table
          head={['Rule', 'Plays', 'Won']}
          rows={data.griefer.rules.map((rule) => [rule.name, rule.plays, pct(rule.won, rule.plays)])}
        />
        <div className="card__title">Most misread</div>
        <Table
          head={['Rule', 'Player', 'Actually fits?', 'Got it wrong']}
          rows={data.griefer.misreads.map((read) => [
            read.rule,
            read.player,
            read.fits ? 'Yes — left out' : 'No — picked',
            `${read.wrong}/${read.shown}`,
          ])}
        />
      </Section>
      <Section name="Tic Tac Toe">
        <div className="card__title">Hardest cells (3+ plays)</div>
        <Table
          head={['Cell', 'Plays', 'Filled', 'Most used answers']}
          rows={hardestCells.slice(0, 30).map((cell) => [cell.name, cell.plays, pct(cell.filled, cell.plays), counts(cell.answers.slice(0, 3))])}
        />
        <div className="card__title">All cells</div>
        <Table
          head={['Cell', 'Plays', 'Filled', 'Most used', 'Least used']}
          rows={data.ticTacToe.slice(0, 150).map((cell) => [
            cell.name,
            cell.plays,
            pct(cell.filled, cell.plays),
            counts(cell.answers.slice(0, 3)),
            counts(cell.answers.slice(-3).reverse()),
          ])}
        />
      </Section>
      <Section name="Connections">
        <Table
          head={['Group', 'Plays', 'Solved']}
          rows={data.connections.groups.map((group) => [group.name, group.plays, pct(group.solved, group.plays)])}
        />
        <p className="tiny muted">In a wrong four most often: {counts(data.connections.misgrouped)}</p>
      </Section>
      <Section name="Higher or Lower">
        <Table
          head={['Category', 'Level', 'Runs', 'Avg score', 'Best']}
          rows={data.higherLower.runs.map((run) => [run.category, run.level, run.runs, run.avgScore, run.best])}
        />
        <div className="card__title">Pairs</div>
        <Table
          head={['Category', 'Shown', 'Hidden', 'Right']}
          rows={data.higherLower.pairs.slice(0, 50).map((pair) => [pair.category, pair.shown, pair.hidden, `${pair.correct}/${pair.seen}`])}
        />
        <div className="card__title">Players, as the hidden one</div>
        <Table
          head={['Player', 'Shown', 'Answered right']}
          rows={data.higherLower.players.slice(0, 50).map((row) => [row.name, row.plays, pct(row.solved, row.plays)])}
        />
      </Section>
    </div>
  );
}

// ----------------------------------------------------------------- support --

const KIND_LABEL: Record<string, string> = {
  bug: '🐞 Bug',
  'wrong-data': '📊 Wrong data',
  suggestion: '💡 Suggestion',
  category: '🔟 New category',
  other: 'Other',
};

function Inbox({ tickets, onChange }: { tickets: StoredSupport[]; onChange: () => void }) {
  const set = async (id: number, status: SupportStatus) => {
    await api(`support/${id}`, { method: 'POST', body: JSON.stringify({ status }) });
    onChange();
  };
  if (tickets.length === 0) return <p className="muted">No requests yet.</p>;
  return (
    <div className="stack-sm">
      {tickets.map((ticket) => (
        <article key={ticket.id} className={`card stack-sm an-ticket an-ticket--${ticket.status}`}>
          <div className="row-between">
            <span className="small">
              <strong>{KIND_LABEL[ticket.body.kind] ?? ticket.body.kind}</strong> ·{' '}
              {new Date(ticket.at).toLocaleString()} · {ticket.body.context?.page ?? '—'}
            </span>
            <span className="row">
              {(['new', 'seen', 'done'] as SupportStatus[]).map((status) => (
                <button
                  key={status}
                  type="button"
                  className="an-tab"
                  aria-pressed={ticket.status === status}
                  onClick={() => void set(ticket.id, status)}
                >
                  {status}
                </button>
              ))}
            </span>
          </div>
          <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{ticket.body.message}</p>
          {ticket.body.contact ? <p className="small muted" style={{ margin: 0 }}>Contact: {ticket.body.contact}</p> : null}
          {ticket.body.context?.round ? (
            <details>
              <summary className="small">Attached round — {title(ticket.body.context.round.game)}</summary>
              <pre className="an-pre">{JSON.stringify(ticket.body.context.round, null, 2)}</pre>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function Errors({ errors }: { errors: Stored<ClientError>[] }) {
  if (errors.length === 0) return <p className="muted">No errors reported.</p>;
  return (
    <div className="stack-sm">
      {errors.map((error) => (
        <details key={error.id} className="card an-row">
          <summary className="small">
            {new Date(error.at).toLocaleString()} · <strong>{error.body.message}</strong> · {error.body.page} ·{' '}
            {error.body.app}
          </summary>
          {error.body.stack ? <pre className="an-pre">{error.body.stack}</pre> : null}
        </details>
      ))}
    </div>
  );
}

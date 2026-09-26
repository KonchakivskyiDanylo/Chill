import { useState } from 'react';
import {
  SUPPORT_STATUSES,
  type ClientError,
  type Stored,
  type StoredSupport,
  type SupportStatus,
} from '@/analytics/types';
import { api } from './api';
import { gameTitle } from './labels';
import { RowSearch, matchesText } from './ui';

const KIND_LABEL: Record<string, string> = {
  bug: '🐞 Bug',
  'wrong-data': '📊 Wrong data',
  suggestion: '💡 Suggestion',
  category: '🔟 New category',
  other: 'Other',
};

/** `#/analytics/support` — what people sent through the 💬 form, newest first. */
export function Inbox({ tickets, onChange }: { tickets: StoredSupport[] | null; onChange: () => void }) {
  const [show, setShow] = useState<SupportStatus | 'all'>('all');
  const [text, setText] = useState('');
  if (!tickets) return <p className="muted">Loading…</p>;

  const set = async (id: number, status: SupportStatus) => {
    await api(`support/${id}`, { method: 'POST', body: JSON.stringify({ status }) });
    onChange();
  };
  const rows = tickets.filter(
    (ticket) =>
      (show === 'all' || ticket.status === show) &&
      matchesText(`${ticket.body.message} ${ticket.body.contact ?? ''} ${ticket.body.kind}`, text),
  );

  return (
    <div className="stack">
      <div className="row-between an-card-head">
        <div className="an-tabs">
          {(['all', ...SUPPORT_STATUSES] as const).map((status) => (
            <button key={status} type="button" className="an-tab" aria-pressed={show === status} onClick={() => setShow(status)}>
              {status} ({status === 'all' ? tickets.length : tickets.filter((t) => t.status === status).length})
            </button>
          ))}
        </div>
        <RowSearch value={text} onChange={setText} placeholder="Search messages…" />
      </div>
      {rows.length === 0 ? <p className="muted">No requests here.</p> : null}
      {rows.map((ticket) => (
        <article key={ticket.id} className={`card stack-sm an-ticket an-ticket--${ticket.status}`}>
          <div className="row-between">
            <span className="small">
              <strong>{KIND_LABEL[ticket.body.kind] ?? ticket.body.kind}</strong> ·{' '}
              {new Date(ticket.at).toLocaleString()} · {ticket.body.context?.page ?? '—'}
            </span>
            <span className="row">
              {SUPPORT_STATUSES.map((status) => (
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
              <summary className="small">Attached round — {gameTitle(ticket.body.context.round.game)}</summary>
              <pre className="an-pre">{JSON.stringify(ticket.body.context.round, null, 2)}</pre>
            </details>
          ) : null}
        </article>
      ))}
    </div>
  );
}

/** `#/analytics/errors` — uncaught browser errors, newest first. */
export function Errors({ errors }: { errors: Stored<ClientError>[] | null }) {
  const [text, setText] = useState('');
  if (!errors) return <p className="muted">Loading…</p>;
  const rows = errors.filter((error) => matchesText(`${error.body.message} ${error.body.page} ${error.body.app}`, text));
  return (
    <div className="stack-sm">
      <div className="row-between an-card-head">
        <span className="small muted">{errors.length} reported, newest first</span>
        <RowSearch value={text} onChange={setText} placeholder="Search errors…" />
      </div>
      {rows.length === 0 ? <p className="muted">No errors reported.</p> : null}
      {rows.map((error) => (
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

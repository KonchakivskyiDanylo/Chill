import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PlayerEntry, PlayerLens } from '@/analytics/aggregate';
import { Stat } from '@/components/ui';
import { useAdminData, useScope } from './api';
import { ago, gameTitle, GOOD_LABEL, OUTCOME_LABEL, pct, ROLE_LABEL } from './labels';
import { Card, DataTable, matchesText, RowSearch } from './ui';

/**
 * `#/analytics/players` — find a player. Everyone any stored round mentions,
 * in any role, most seen first; the box narrows it by name and Enter opens
 * the best match.
 */
export function Players() {
  const { query, params, set, search } = useScope();
  const text = params.get('q') ?? '';
  const navigate = useNavigate();
  const { data } = useAdminData<PlayerEntry[]>(`players?${query()}`);
  const rows = (data ?? []).filter((entry) => matchesText(`${entry.name} ${entry.id}`, text));

  return (
    <Card
      title={`Players${data ? ` (${data.length})` : ''}`}
      aside={
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const best = rows.find((row) => row.name.toLowerCase() === text.trim().toLowerCase()) ?? rows[0];
            if (best) navigate({ pathname: `/analytics/players/${encodeURIComponent(best.id)}`, search: `?${search}` });
          }}
        >
          <RowSearch value={text} onChange={(q) => set({ q })} placeholder="Search a player…" />
        </form>
      }
    >
      {!data ? (
        <p className="muted">Loading…</p>
      ) : (
        <DataTable
          columns={[
            {
              head: 'Player',
              cell: (entry) => (
                <Link to={{ pathname: `/analytics/players/${encodeURIComponent(entry.id)}`, search: `?${search}` }}>
                  {entry.name}
                </Link>
              ),
              sort: (entry) => entry.name,
            },
            { head: 'Rounds', cell: (entry) => entry.rounds, sort: (entry) => entry.rounds, align: 'right' },
          ]}
          rows={rows}
          empty={text ? `Nobody called “${text}” in these rounds.` : 'No player appears in these rounds yet.'}
        />
      )}
    </Card>
  );
}

/**
 * `#/analytics/players/<id>` — one player across every game: what they were
 * (the secret, a card, an answer…), how often, and how often whoever was
 * playing got them right.
 */
export function PlayerPage() {
  const { id = '' } = useParams<{ id: string }>();
  const { query, search } = useScope();
  const { data } = useAdminData<PlayerLens>(`players/${encodeURIComponent(id)}?${query()}`);
  const lens = data?.id === id ? data : null;

  return (
    <div className="stack">
      <div className="row-between">
        <h2 style={{ margin: 0 }}>{lens?.name ?? id}</h2>
        <Link className="small" to={{ pathname: '/analytics/players', search: `?${search}` }}>
          ← All players
        </Link>
      </div>
      {!lens ? (
        <p className="muted">Loading…</p>
      ) : lens.rounds === 0 ? (
        <p className="muted">No round in this view mentions {lens.name}. Try a longer range or fewer filters.</p>
      ) : (
        <>
          <div className="stats">
            <Stat label="Rounds" value={lens.rounds} />
            <Stat label="Games" value={new Set(lens.rows.map((row) => row.game)).size} />
          </div>
          <Card title="By game">
            <DataTable
              columns={[
                {
                  head: 'Game',
                  cell: (row) => (
                    <Link to={{ pathname: `/analytics/game/${row.game}`, search: `?${search}` }}>{gameTitle(row.game)}</Link>
                  ),
                  sort: (row) => gameTitle(row.game),
                },
                { head: 'As', cell: (row) => ROLE_LABEL[row.role] ?? row.role, sort: (row) => row.role },
                { head: 'Times', cell: (row) => row.rounds, sort: (row) => row.rounds, align: 'right' },
                {
                  head: 'Got right',
                  cell: (row) =>
                    row.judged ? (
                      <span>
                        {pct(row.good, row.judged)}{' '}
                        <span className="faint">
                          {GOOD_LABEL[row.role] ?? 'right'} {row.good}/{row.judged}
                        </span>
                      </span>
                    ) : (
                      '—'
                    ),
                  sort: (row) => (row.judged ? row.good / row.judged : -1),
                  align: 'right',
                },
              ]}
              rows={lens.rows}
            />
          </Card>
          <Card title="Latest appearances">
            <ul className="list-reset stack-sm">
              {lens.recent.map((entry, index) => (
                <li key={index} className="small">
                  <span className="faint">{ago(entry.at)}</span> · {gameTitle(entry.game)} — {ROLE_LABEL[entry.role]}
                  {entry.good === undefined ? '' : entry.good ? ' · got right' : ' · got wrong'} ·{' '}
                  <span className="muted">round {OUTCOME_LABEL[entry.outcome]?.toLowerCase() ?? entry.outcome}</span>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

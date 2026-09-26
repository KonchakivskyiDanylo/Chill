import { useMemo, useState, type ReactNode } from 'react';
import { OUTCOMES, SOURCES, type Count, type Dashboard } from '@/analytics/aggregate';
import type { Outcome } from '@/analytics/types';
import type { Pools } from '@/data/liquipedia/pools';
import { useScope } from './api';
import {
  eventLabel,
  OUTCOME_LABEL,
  pct,
  regionLabel,
  SOURCE_HINT,
  SOURCE_LABEL,
  words,
} from './labels';

/**
 * The pieces every dashboard page is built from.
 *
 * Charts are one hue — the site's primary — because each one answers "how
 * many", never "which series": the label beside a bar says what it is, and a
 * number beside it says how much. Nothing here needs a legend.
 */

// ------------------------------------------------------------------ charts --

function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Rounds per day as columns, with the day and count on hover and a table beneath. */
export function DayColumns({ series }: { series: Dashboard['series'] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length === 0) return null;
  const peak = Math.max(1, ...series.map((d) => d.rounds));
  const total = series.reduce((n, d) => n + d.rounds, 0);
  const first = series[0].day;
  const last = series[series.length - 1].day;
  const shown = hover === null ? null : series[hover];

  return (
    <figure className="an-cols">
      <div
        className="an-cols__plot"
        role="img"
        aria-label={`Rounds per day from ${shortDay(first)} to ${shortDay(last)}: ${total} in all, ${peak} on the busiest day`}
        onMouseLeave={() => setHover(null)}
      >
        <span className="an-cols__max tiny faint">{peak}</span>
        {series.map((d, i) => (
          <div key={d.day} className="an-cols__col" onMouseEnter={() => setHover(i)}>
            <span
              className={`an-cols__bar${hover === i ? ' is-hover' : ''}`}
              style={{ height: d.rounds ? `${(d.rounds / peak) * 100}%` : 0 }}
            />
          </div>
        ))}
        {shown ? (
          <div className="an-tip" style={{ left: `${((hover! + 0.5) / series.length) * 100}%` }}>
            <strong>{shown.rounds}</strong> round{shown.rounds === 1 ? '' : 's'} · {shortDay(shown.day)}
          </div>
        ) : null}
      </div>
      <div className="an-cols__axis tiny faint">
        <span>{shortDay(first)}</span>
        <span>{total} rounds</span>
        <span>{shortDay(last)}</span>
      </div>
      <details className="tiny">
        <summary className="muted">As a table</summary>
        <DataTable
          columns={[
            { head: 'Day', cell: (d) => d.day, sort: (d) => d.day },
            { head: 'Rounds', cell: (d) => d.rounds, sort: (d) => d.rounds, align: 'right' },
          ]}
          rows={[...series].reverse().filter((d) => d.rounds > 0)}
          empty="No rounds in these days."
        />
      </details>
    </figure>
  );
}

export interface ShareItem {
  key: string;
  label: ReactNode;
  /** A second, quieter line under the label. */
  hint?: ReactNode;
  count: number;
}

/**
 * Shares of a whole as labelled bars: the label, the bar, the count and its
 * percentage. The bar's length is the share of `total` (the sum by default),
 * so four bars that fill a quarter each say "evenly split" at a glance.
 */
export function ShareBars({ items, total, empty = 'None yet.' }: { items: ShareItem[]; total?: number; empty?: string }) {
  const whole = total ?? items.reduce((n, item) => n + item.count, 0);
  if (items.length === 0 || whole === 0) return <p className="small muted">{empty}</p>;
  return (
    <ul className="an-share list-reset">
      {items.map((item) => (
        <li key={item.key} className="an-share__row">
          <span className="an-share__label">
            <span className="small">{item.label}</span>
            {item.hint ? <span className="tiny faint an-share__hint">{item.hint}</span> : null}
          </span>
          <span className="an-share__track" aria-hidden="true">
            <span className="an-share__fill" style={{ width: `${(item.count / whole) * 100}%` }} />
          </span>
          <span className="an-share__value small">
            {item.count} <span className="faint">{pct(item.count, whole)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ tables --

export interface Column<T> {
  head: string;
  cell: (row: T) => ReactNode;
  /** A value to sort on. The column header is a sort button when there is one. */
  sort?: (row: T) => number | string;
  align?: 'right';
}

/**
 * A table that sorts on any column with a `sort`, and shows the first
 * `limit` rows with a button for the rest.
 */
export function DataTable<T>({
  columns,
  rows,
  limit = 50,
  empty = 'Nothing yet.',
}: {
  columns: Column<T>[];
  rows: T[];
  limit?: number;
  empty?: string;
}) {
  const [sortBy, setSortBy] = useState<{ index: number; dir: 1 | -1 } | null>(null);
  const [all, setAll] = useState(false);

  const sorted = useMemo(() => {
    if (!sortBy) return rows;
    const key = columns[sortBy.index]?.sort;
    if (!key) return rows;
    return [...rows].sort((a, b) => {
      const x = key(a);
      const y = key(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sortBy.dir;
    });
  }, [rows, columns, sortBy]);

  if (rows.length === 0) return <p className="small muted">{empty}</p>;
  const visible = all ? sorted : sorted.slice(0, limit);

  return (
    <div className="stack-sm">
      <div className="scroll-x">
        <table className="an-table">
          <thead>
            <tr>
              {columns.map((column, index) => (
                <th key={column.head} className={column.align === 'right' ? 'an-num' : undefined}>
                  {column.sort ? (
                    <button
                      type="button"
                      className="an-sort"
                      onClick={() =>
                        setSortBy((prev) =>
                          prev?.index === index ? { index, dir: prev.dir === 1 ? -1 : 1 } : { index, dir: -1 },
                        )
                      }
                    >
                      {column.head}
                      <span aria-hidden="true">{sortBy?.index === index ? (sortBy.dir === 1 ? ' ▲' : ' ▼') : ''}</span>
                    </button>
                  ) : (
                    column.head
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((row, i) => (
              <tr key={i}>
                {columns.map((column) => (
                  <td key={column.head} className={column.align === 'right' ? 'an-num' : undefined}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit ? (
        <button type="button" className="link-btn tiny" onClick={() => setAll(!all)}>
          {all ? `Show the first ${limit}` : `Show all ${rows.length}`}
        </button>
      ) : null}
    </div>
  );
}

/** A card with a title, and an optional control on the right of it. */
export function Card({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card stack">
      <div className="row-between an-card-head">
        <div className="card__title" style={{ marginBottom: 0 }}>
          {title}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A text box that narrows a page's rows. */
export function RowSearch({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      className="input an-search"
      type="search"
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export const matchesText = (text: string, query: string) =>
  !query.trim() || text.toLowerCase().includes(query.trim().toLowerCase());

// ----------------------------------------------------------------- filters --

const RANGES: { days: number; label: string }[] = [
  { days: 1, label: 'Last 24 hours' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 0, label: 'All time' },
];

/**
 * The range and every filter, in one row above whatever the page shows.
 *
 * The dropdowns offer only values some round in range actually has, so a
 * filter can never be set to something that would always come back empty.
 * A value already chosen stays listed even when the range no longer has it.
 */
export function FilterBar({ options, pools }: { options: Dashboard['options'] | null; pools: Pools | null }) {
  const { days, filter, set, clear, active } = useScope();
  const withChosen = (values: string[] | undefined, chosen: string | undefined) =>
    chosen && !(values ?? []).includes(chosen) ? [chosen, ...(values ?? [])] : (values ?? []);

  const select = (
    key: string,
    label: string,
    value: string | undefined,
    values: { value: string; label: string }[],
  ) => (
    <label className="an-filter">
      <span className="tiny faint">{label}</span>
      <select className="input an-select" value={value ?? ''} onChange={(event) => set({ [key]: event.target.value || null })}>
        <option value="">All</option>
        {values.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="an-filters">
      <label className="an-filter">
        <span className="tiny faint">Range</span>
        <select className="input an-select" value={days} onChange={(event) => set({ days: event.target.value })}>
          {RANGES.map((range) => (
            <option key={range.days} value={range.days}>
              {range.label}
            </option>
          ))}
        </select>
      </label>
      {select(
        'source',
        'Players from',
        filter.source,
        SOURCES.map((source) => ({ value: source, label: SOURCE_LABEL[source] })),
      )}
      {filter.source === 'event' || filter.event || (options?.events.length ?? 0) > 1
        ? select(
            'event',
            'Event',
            filter.event,
            withChosen(options?.events, filter.event).map((value) => ({ value, label: eventLabel(value, pools) })),
          )
        : null}
      {select(
        'region',
        'Region (Chosen)',
        filter.region,
        withChosen(options?.regions, filter.region).map((value) => ({ value, label: regionLabel(value) })),
      )}
      {select(
        'difficulty',
        'Difficulty (Chosen)',
        filter.difficulty,
        withChosen(options?.difficulty, filter.difficulty).map((value) => ({ value, label: words(value) })),
      )}
      {select(
        'level',
        'Level',
        filter.level,
        withChosen(options?.level, filter.level).map((value) => ({ value, label: words(value) })),
      )}
      {select(
        'outcome',
        'Outcome',
        filter.outcome,
        OUTCOMES.map((value: Outcome) => ({ value, label: OUTCOME_LABEL[value] })),
      )}
      {active > 0 ? (
        <button type="button" className="link-btn tiny an-clear" onClick={clear}>
          Clear {active} filter{active === 1 ? '' : 's'}
        </button>
      ) : null}
    </div>
  );
}

// -------------------------------------------------------------------- mix --

/** Source bars with what each source means under its name. */
export function sourceItems(source: Count[]): ShareItem[] {
  return source.map((count) => ({
    key: count.label,
    label: SOURCE_LABEL[count.label as keyof typeof SOURCE_LABEL] ?? count.label,
    hint: SOURCE_HINT[count.label as keyof typeof SOURCE_HINT],
    count: count.count,
  }));
}

export function countItems(counts: Count[], label: (value: string) => string): ShareItem[] {
  return counts.map((count) => ({ key: count.label, label: label(count.label), count: count.count }));
}

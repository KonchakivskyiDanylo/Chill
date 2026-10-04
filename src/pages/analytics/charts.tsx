import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { DataTable } from './ui';

/**
 * The dashboard's charts, drawn by hand in SVG and HTML — a line chart, stat
 * tiles, meters, a heatmap and stacked outcome bars. No chart library: these
 * five are a few hundred lines, and the site keeps its dependencies to one.
 *
 * They follow one set of rules. Thin marks (2px lines, bars at most 24px,
 * 4px rounded ends), hairline grid and axes, colours from the `--viz-*` tokens
 * in analytics.css (validated for both themes, on the site's own surfaces),
 * text always in text colours. Every chart answers hover and the keyboard,
 * and every one has a table view, so no value is reachable only by pointing.
 */

// ----------------------------------------------------------------- numbers --

/** 1,284 · 12.9K · 3.4M. */
export function compact(n: number): string {
  if (Math.abs(n) < 10_000) return n.toLocaleString('en-GB');
  if (Math.abs(n) < 1_000_000) return `${(n / 1000).toFixed(n < 100_000 ? 1 : 0).replace(/\.0$/, '')}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
}

export function shortDay(day: string): string {
  return new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Round tick steps — 1, 2 or 5 times a power of ten — from zero to at least `max`. */
function ticks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const power = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
  const out: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** The width of an element, kept current as it resizes. */
function useWidth<T extends HTMLElement>(): [RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

// -------------------------------------------------------------- line chart --

export interface Series {
  key: string;
  label: string;
  /** A `--viz-*` token, e.g. `var(--viz-1)`. */
  color: string;
  values: number[];
}

const PLOT = 190;
const AXIS = 26;

/**
 * Counts per day as lines on one axis. A legend above, the latest values at
 * the right-hand end when they do not collide, a crosshair that snaps to the
 * nearest day with every series in one tooltip, the arrow keys to move it, and
 * the numbers as a table underneath.
 */
export function LineChart({ days, series, label }: { days: string[]; series: Series[]; label: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [at, setAt] = useState<number | null>(null);
  const n = days.length;
  const peak = Math.max(1, ...series.flatMap((s) => s.values));
  const yTicks = ticks(peak);
  const top = yTicks[yTicks.length - 1];

  const left = 8 + String(compact(top)).length * 7;
  const endLabels = series.length <= 4 && width > 480;
  const right = endLabels ? 64 : 12;
  const plotW = Math.max(0, width - left - right);
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => 8 + (1 - v / top) * (PLOT - 8);

  // End labels sit at their line's last value, unless two would overlap.
  const ends = series
    .map((s) => ({ s, v: s.values[n - 1] ?? 0, y: y(s.values[n - 1] ?? 0) }))
    .sort((a, b) => a.y - b.y);
  const clash = ends.some((e, i) => i > 0 && e.y - ends[i - 1].y < 14);

  const pick = (clientX: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box || n === 0) return;
    const rel = clientX - box.left - left;
    setAt(Math.max(0, Math.min(n - 1, Math.round((rel / Math.max(1, plotW)) * (n - 1)))));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const step = event.key === 'ArrowLeft' ? -1 : 1;
      setAt((cur) => Math.max(0, Math.min(n - 1, (cur ?? n - 1) + (cur === null ? 0 : step))));
    } else if (event.key === 'Escape') setAt(null);
  };

  const path = (values: number[]) => values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const total = (s: Series) => s.values.reduce((a, b) => a + b, 0);

  return (
    <figure className="viz">
      <ul className="viz-legend list-reset" aria-hidden="true">
        {series.map((s) => (
          <li key={s.key}>
            <span className="viz-key viz-key--line" style={{ background: s.color }} />
            {s.label} <span className="viz-legend__n">{compact(total(s))}</span>
          </li>
        ))}
      </ul>
      <div
        ref={ref}
        className="viz-plot"
        style={{ height: PLOT + AXIS }}
        tabIndex={0}
        role="img"
        aria-label={`${label}, ${shortDay(days[0] ?? '')} to ${shortDay(days[n - 1] ?? '')}: ${series
          .map((s) => `${s.label} ${total(s)}`)
          .join(', ')}. Arrow keys step through the days.`}
        onPointerMove={(event) => pick(event.clientX)}
        onPointerLeave={() => setAt(null)}
        onKeyDown={onKey}
        onBlur={() => setAt(null)}
      >
        {width > 0 ? (
          <svg width={width} height={PLOT + AXIS} aria-hidden="true">
            {yTicks.map((t) => (
              <g key={t}>
                <line className={t === 0 ? 'viz-axis' : 'viz-grid'} x1={left} x2={left + plotW} y1={y(t)} y2={y(t)} />
                <text className="viz-tick" x={left - 6} y={y(t)} dy="0.32em" textAnchor="end">
                  {compact(t)}
                </text>
              </g>
            ))}
            {[0, Math.floor((n - 1) / 2), n - 1]
              .filter((i, k, all) => n > 0 && all.indexOf(i) === k)
              .map((i) => (
                <text
                  key={i}
                  className="viz-tick"
                  x={x(i)}
                  y={PLOT + 18}
                  textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}
                >
                  {shortDay(days[i])}
                </text>
              ))}
            {series.map((s, k) => (
              <g key={s.key}>
                {k === 0 ? <path className="viz-area" d={`${path(s.values)}L${x(n - 1)},${y(0)}L${x(0)},${y(0)}Z`} style={{ fill: s.color }} /> : null}
                <path className="viz-line" d={path(s.values)} style={{ stroke: s.color }} />
              </g>
            ))}
            {endLabels && !clash
              ? ends.map((e) => (
                  <g key={e.s.key}>
                    <circle className="viz-dot" cx={x(n - 1)} cy={e.y} r={4} style={{ fill: e.s.color }} />
                    <text className="viz-end" x={x(n - 1) + 9} y={e.y} dy="0.32em">
                      {compact(e.v)}
                    </text>
                  </g>
                ))
              : null}
            {at !== null ? (
              <g>
                <line className="viz-cross" x1={x(at)} x2={x(at)} y1={8} y2={PLOT} />
                {series.map((s) => (
                  <circle key={s.key} className="viz-dot" cx={x(at)} cy={y(s.values[at] ?? 0)} r={4} style={{ fill: s.color }} />
                ))}
              </g>
            ) : null}
          </svg>
        ) : null}
        {at !== null && width > 0 ? (
          <div
            className="viz-tip"
            // Beside the crosshair, on whichever side has the room.
            style={x(at) > width * 0.6 ? { right: width - x(at) + 12, top: 4 } : { left: x(at) + 12, top: 4 }}
            role="status"
          >
            <div className="viz-tip__head">{shortDay(days[at])}</div>
            {series.map((s) => (
              <div key={s.key} className="viz-tip__row">
                <span className="viz-key viz-key--line" style={{ background: s.color }} />
                <strong>{compact(s.values[at] ?? 0)}</strong>
                <span className="viz-tip__label">{s.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      <TableView>
        <DataTable
          columns={[
            { head: 'Day', cell: (i: number) => days[i], sort: (i) => days[i] },
            ...series.map((s) => ({ head: s.label, cell: (i: number) => s.values[i], sort: (i: number) => s.values[i], align: 'right' as const })),
          ]}
          rows={days.map((_, i) => i).reverse().filter((i) => series.some((s) => s.values[i] > 0))}
          empty="Nothing on these days."
        />
      </TableView>
    </figure>
  );
}

/** The accessible twin every chart carries. */
export function TableView({ children }: { children: ReactNode }) {
  return (
    <details className="viz-table tiny">
      <summary className="muted">As a table</summary>
      {children}
    </details>
  );
}

// -------------------------------------------------------------- stat tiles --

/** A small trend line: the series in a quiet ink, today's end in the accent. */
export function Sparkline({ values }: { values: number[] }) {
  const w = 96;
  const h = 26;
  if (values.length < 2) return null;
  const peak = Math.max(1, ...values);
  const x = (i: number) => (i / (values.length - 1)) * (w - 4) + 2;
  const y = (v: number) => h - 3 - (v / peak) * (h - 6);
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  const last = values.length - 1;
  return (
    <svg className="viz-spark" width={w} height={h} aria-hidden="true">
      <path d={d} />
      <circle cx={x(last)} cy={y(values[last])} r={3} />
    </svg>
  );
}

export interface Delta {
  /** Signed: a percentage for counts, points for a rate. */
  value: number;
  unit: '%' | 'pts';
  /** "the previous 7 days". */
  against: string;
}

/** Change against the period before: a percentage, or null when there was nothing before. */
export function change(now: number, before: number | undefined, against: string): Delta | null {
  if (before === undefined || before === 0) return null;
  return { value: Math.round(((now - before) / before) * 100), unit: '%', against };
}

/**
 * Label, value, change against the period before, and a sparkline. Up is
 * green and down red for every tile here — more visits, more rounds and more
 * wins are all good — and the arrow and sign say it as well as the colour.
 */
export function StatTile({
  label,
  value,
  delta,
  trend,
  hint,
}: {
  label: string;
  value: ReactNode;
  delta?: Delta | null;
  trend?: number[];
  hint?: string;
}) {
  const dir = !delta || delta.value === 0 ? 'flat' : delta.value > 0 ? 'up' : 'down';
  return (
    <div className="viz-stat" title={hint}>
      <div className="viz-stat__label">{label}</div>
      <div className="viz-stat__row">
        <div className="viz-stat__value">{value}</div>
        {trend ? <Sparkline values={trend} /> : null}
      </div>
      <div className={`viz-stat__delta viz-stat__delta--${dir}`}>
        {delta ? (
          <>
            <span aria-hidden="true">{dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■'}</span>{' '}
            {delta.value > 0 ? '+' : ''}
            {delta.value}
            {delta.unit === '%' ? '%' : ' pts'} <span className="viz-stat__against">vs {delta.against}</span>
          </>
        ) : (
          <span className="viz-stat__against">{hint ?? ' '}</span>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ meters --

/**
 * A part of a whole, as a filled track: "320 of 500 game opens started a
 * round". The track is the same hue, lighter, so the whole bar reads as one
 * quantity.
 */
export function Meter({ label, part, whole, note }: { label: string; part: number; whole: number; note: string }) {
  const share = whole > 0 ? Math.min(1, part / whole) : 0;
  return (
    <div className="viz-meter">
      <div className="viz-meter__head">
        <span className="small">{label}</span>
        <strong className="viz-meter__pct">{whole > 0 ? `${Math.round(share * 100)}%` : '—'}</strong>
      </div>
      <div
        className="viz-meter__track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={whole}
        aria-valuenow={part}
        aria-label={`${label}: ${part} of ${whole}`}
      >
        <span className="viz-meter__fill" style={{ width: `${share * 100}%` }} />
      </div>
      <div className="tiny faint">{whole > 0 ? `${compact(part)} of ${compact(whole)} ${note}` : `No ${note} yet`}</div>
    </div>
  );
}

// ----------------------------------------------------------------- heatmap --

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Weekday by hour, one hue from faint to full: when people come. Each cell
 * names its slot and count on hover and focus; the scale sits underneath.
 */
export function Heatmap({ grid, unit }: { grid: number[][]; unit: string }) {
  const [at, setAt] = useState<[number, number] | null>(null);
  const peak = Math.max(0, ...grid.flat());
  const total = grid.flat().reduce((a, b) => a + b, 0);
  const level = (v: number) => (v === 0 || peak === 0 ? 0 : 0.18 + 0.82 * (v / peak));
  const slot = (h: number) => `${String(h).padStart(2, '0')}:00`;

  if (total === 0) return <p className="small muted">No {unit} in this range yet.</p>;
  return (
    <figure className="viz">
      <div className="viz-heat" role="img" aria-label={`${unit} by weekday and hour, Berlin time: ${total} in all, at most ${peak} in one hour`} onPointerLeave={() => setAt(null)}>
        <span />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={h} className="viz-heat__hour">
            {h % 3 === 0 ? h : ''}
          </span>
        ))}
        {grid.map((row, d) => (
          <div key={d} className="viz-heat__row">
            <span className="viz-heat__day">{WEEKDAYS[d]}</span>
            {row.map((v, h) => (
              <span
                key={h}
                className={`viz-heat__cell${at?.[0] === d && at?.[1] === h ? ' is-at' : ''}`}
                style={{ '--heat': level(v) } as CSSProperties}
                tabIndex={v > 0 ? 0 : -1}
                aria-label={`${WEEKDAYS[d]} ${slot(h)}: ${v}`}
                onPointerEnter={() => setAt([d, h])}
                onFocus={() => setAt([d, h])}
                onBlur={() => setAt(null)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="viz-heat__foot tiny faint">
        <span>
          {at ? (
            <>
              <strong className="viz-heat__value">{grid[at[0]][at[1]]}</strong> {unit} · {WEEKDAYS[at[0]]} {slot(at[1])}–{slot((at[1] + 1) % 24)}
            </>
          ) : (
            'Berlin time. Point at a square for its count.'
          )}
        </span>
        <span className="viz-heat__scale" aria-hidden="true">
          Fewer
          {[0.18, 0.45, 0.72, 1].map((o) => (
            <span key={o} className="viz-heat__cell" style={{ '--heat': o } as CSSProperties} />
          ))}
          More
        </span>
      </div>
      <TableView>
        <DataTable
          columns={[
            { head: 'Day', cell: (r: { d: number; h: number; v: number }) => WEEKDAYS[r.d], sort: (r) => r.d },
            { head: 'Hour', cell: (r) => slot(r.h), sort: (r) => r.h },
            { head: unit, cell: (r) => r.v, sort: (r) => r.v, align: 'right' },
          ]}
          rows={grid.flatMap((row, d) => row.map((v, h) => ({ d, h, v }))).filter((r) => r.v > 0)}
        />
      </TableView>
    </figure>
  );
}

// -------------------------------------------------------------- outcomes --

export interface OutcomeSplit {
  won: number;
  lost: number;
  gaveUp: number;
}

const OUTCOME_PARTS: { key: keyof OutcomeSplit; label: string; className: string }[] = [
  { key: 'won', label: 'Won', className: 'viz-seg--won' },
  { key: 'lost', label: 'Lost', className: 'viz-seg--lost' },
  { key: 'gaveUp', label: 'Gave up', className: 'viz-seg--gave' },
];

/** The legend for `OutcomeBar` — said once above a column of them. */
export function OutcomeLegend() {
  return (
    <ul className="viz-legend list-reset">
      {OUTCOME_PARTS.map((part) => (
        <li key={part.key}>
          <span className={`viz-key ${part.className}`} />
          {part.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * How a set of rounds ended, as one bar split three ways: won, lost, gave up.
 * A share is written inside its segment only when it fits; the title of each
 * segment has its count either way.
 */
export function OutcomeBar({ split, wide }: { split: OutcomeSplit; wide?: boolean }) {
  const total = split.won + split.lost + split.gaveUp;
  if (total === 0) return <span className="tiny faint">—</span>;
  return (
    <span className={`viz-outcome${wide ? ' viz-outcome--wide' : ''}`} role="img" aria-label={OUTCOME_PARTS.map((p) => `${p.label} ${split[p.key]}`).join(', ')}>
      {OUTCOME_PARTS.filter((p) => split[p.key] > 0).map((p) => {
        const share = split[p.key] / total;
        return (
          <span key={p.key} className={`viz-seg ${p.className}`} style={{ flexGrow: share }} title={`${p.label}: ${split[p.key]} (${Math.round(share * 100)}%)`}>
            {share >= (wide ? 0.08 : 0.22) ? `${Math.round(share * 100)}%` : ''}
          </span>
        );
      })}
    </span>
  );
}

// -------------------------------------------------------------------- misc --

/** Holds the last render at reduced opacity while new numbers load, instead of a blank. */
export function Refreshing({ loading, children }: { loading: boolean; children: ReactNode }) {
  const [shown, setShown] = useState(false);
  // Only dim for a load that takes a moment; a quick one would just flicker.
  useEffect(() => {
    if (!loading) return setShown(false);
    const timer = window.setTimeout(() => setShown(true), 150);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return <div className={`stack${shown ? ' viz-loading' : ''}`}>{children}</div>;
}

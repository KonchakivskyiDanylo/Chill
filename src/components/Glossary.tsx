import { useEffect, useState } from 'react';
import { loadFacts, type Facts } from '@/data/liquipedia/facts';
import { TERMS, type Term, type TermId } from '@/games/shared/glossary';

/**
 * Definitions for the terms a game or a category uses — see `glossary.ts`.
 *
 * A term that covers a set of events can list them, and does so only when the
 * reader opens it: the list comes from `facts.json`, which Fortnitedle and
 * Higher or Lower never otherwise load, and a rules panel is not worth half a
 * megabyte to a player who does not look.
 */
export function Glossary({ terms }: { terms: readonly TermId[] }) {
  return (
    <ul className="stack-sm list-reset small">
      {terms.map((id) => {
        const term = TERMS[id];
        return (
          <li key={id}>
            <strong>{term.name}</strong> — {term.text}
            {term.events ? <Events term={term} /> : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The definitions a Tenaball board or a List prompt needs, folded away.
 *
 * Folded because the prompt is the thing being played, and the fine print is
 * for the moment somebody wonders whether DreamHack counts.
 */
export function WhatCounts({ terms }: { terms: readonly TermId[] }) {
  if (terms.length === 0) return null;
  return (
    <details className="small">
      <summary className="tiny faint" style={{ cursor: 'pointer' }}>
        What counts here
      </summary>
      <div style={{ marginTop: 8 }}>
        <Glossary terms={terms} />
      </div>
    </details>
  );
}

function Events({ term }: { term: Term }) {
  const [open, setOpen] = useState(false);
  return (
    <details onToggle={(event) => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
      <summary className="tiny faint" style={{ cursor: 'pointer' }}>
        Which events count
      </summary>
      {open ? <EventNames term={term} /> : null}
    </details>
  );
}

function EventNames({ term }: { term: Term }) {
  const [facts, setFacts] = useState<Facts | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadFacts().then(
      (loaded) => !cancelled && setFacts(loaded),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return <p className="tiny faint">The event list comes from facts.json, which is not there.</p>;
  if (!facts || !term.events) return <p className="tiny faint">Loading…</p>;
  const list = term.events(facts);
  return (
    <ul className="tiny muted" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
      {list.names.map((name) => (
        <li key={name}>{name}</li>
      ))}
      {list.more ? <li style={{ listStyle: 'none', marginLeft: -18 }}>{list.more}</li> : null}
    </ul>
  );
}

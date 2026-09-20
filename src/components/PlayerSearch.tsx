import { useEffect, useMemo, useRef, useState } from 'react';
import { ambiguousNames, disambiguator, normalizeName, suggestPlayers, type Searchable } from '@/lib/text';
import './player-search.css';

/**
 * Autocomplete for every game that takes a typed player name.
 *
 * Used everywhere now, including the recall games. That used to be forbidden —
 * suggesting names in List or Tenaball hands over the answers — but the
 * objection was really to *what* was suggested, not to suggesting: the list
 * showed a flag and an avatar, so "Top 10 earners in Brazil" could be solved by
 * typing letters and reading the flags.
 *
 * So the row is the handle and nothing else. The only exception is a handle
 * more than one player answers to (121 of 5,678, e.g. two players called Aqua),
 * where the Liquipedia parenthetical is shown because otherwise the two rows
 * are indistinguishable. Nothing else about the player is rendered.
 *
 * Generic over the row, because the roster and the leaderboards are different
 * shapes and both are searched.
 */
export function PlayerSearch<T extends Searchable>({
  players,
  onPick,
  exclude,
  placeholder = 'Guess a player…',
  disabled,
  buttonLabel = 'Guess',
  autoFocus,
}: {
  players: readonly T[];
  onPick: (player: T) => void;
  /** Player ids already used — hidden from the suggestions. */
  exclude?: ReadonlySet<string>;
  placeholder?: string;
  disabled?: boolean;
  buttonLabel?: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pool = useMemo(
    () => (exclude ? players.filter((p) => !exclude.has(p.id)) : players),
    [players, exclude],
  );
  const ambiguous = useMemo(() => ambiguousNames(pool), [pool]);
  const suggestions = useMemo(() => suggestPlayers(query, pool, 7), [query, pool]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const choose = (player: T) => {
    onPick(player);
    setQuery('');
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const choice = suggestions[highlight];
      if (choice) choose(choice);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div className="player-search" ref={containerRef}>
      <div className="input-row">
        <input
          ref={inputRef}
          className="input"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          aria-label={placeholder}
          aria-autocomplete="list"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        <button
          type="button"
          className="btn btn--primary"
          disabled={disabled || suggestions.length === 0}
          onClick={() => suggestions[highlight] && choose(suggestions[highlight])}
        >
          {buttonLabel}
        </button>
      </div>

      {open && query && !disabled ? (
        <ul className="player-search__list list-reset" role="listbox">
          {suggestions.length === 0 ? (
            <li className="player-search__empty">No player matches “{query}”.</li>
          ) : (
            suggestions.map((player, index) => {
              // Only for a handle two players share — see the note above.
              const tag = ambiguous.has(normalizeName(player.name)) ? disambiguator(player.id) : null;
              return (
                <li key={player.id}>
                  <button
                    type="button"
                    className={`player-search__item${index === highlight ? ' is-active' : ''}`}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(player)}
                  >
                    <span className="bold">{player.name}</span>
                    {tag ? <span className="player-search__tag">{tag}</span> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}

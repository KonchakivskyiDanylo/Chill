import { useEffect, useMemo, useRef, useState } from 'react';
import type { Player } from '@/data/types';
import { suggestPlayers } from '@/lib/text';
import { CountryBadge } from './CountryBadge';
import { PlayerAvatar } from './PlayerAvatar';
import './player-search.css';

/**
 * Autocomplete for the games where you pick a known player (Career Path, Who
 * Are Ya, Guess the Player).
 *
 * Recall games (List, Tenaball) deliberately do NOT use this — suggesting
 * names there would hand over the answers.
 */
export function PlayerSearch({
  players,
  onPick,
  exclude,
  placeholder = 'Guess a player…',
  disabled,
  buttonLabel = 'Guess',
}: {
  players: readonly Player[];
  onPick: (player: Player) => void;
  /** Player ids already used — hidden from the suggestions. */
  exclude?: ReadonlySet<string>;
  placeholder?: string;
  disabled?: boolean;
  buttonLabel?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(() => {
    const pool = exclude ? players.filter((p) => !exclude.has(p.id)) : players;
    return suggestPlayers(query, pool, 7);
  }, [query, players, exclude]);

  useEffect(() => setHighlight(0), [query]);

  useEffect(() => {
    const onClickAway = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  const choose = (player: Player) => {
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
            suggestions.map((player, index) => (
              <li key={player.id}>
                <button
                  type="button"
                  className={`player-search__item${index === highlight ? ' is-active' : ''}`}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => choose(player)}
                >
                  <PlayerAvatar player={player} size={28} />
                  <span className="bold">{player.name}</span>
                  <span className="spacer" />
                  <CountryBadge code={player.country} name={player.countryName} />
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

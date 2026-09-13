import { useEffect, useRef, useState } from 'react';

/**
 * Plain typed-name input for the recall games (Tenaball, List).
 *
 * No autocomplete on purpose — these games are about remembering who the
 * players are, and a suggestion list would simply hand over the answers.
 */
export function GuessInput({
  onSubmit,
  placeholder = 'Type a player name…',
  disabled,
  buttonLabel = 'Enter',
  autoFocus,
}: {
  onSubmit: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  buttonLabel?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus && !disabled) inputRef.current?.focus();
  }, [autoFocus, disabled]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue('');
  };

  return (
    <form
      className="input-row"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <input
        ref={inputRef}
        className="input"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => setValue(event.target.value)}
        aria-label={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
      />
      <button type="submit" className="btn btn--primary" disabled={disabled || !value.trim()}>
        {buttonLabel}
      </button>
    </form>
  );
}

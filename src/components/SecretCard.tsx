import type { ReactNode } from 'react';
import type { RosterPlayer } from '@/data/liquipedia/roster';
import { playerMoney, plural } from '@/lib/format';
import { CountryBadge } from './CountryBadge';
import { PlayerAvatar } from './PlayerAvatar';

/**
 * The answer, once a round is over: avatar, handle, and a line of who they
 * are — nationality, earnings and FNCS wins, no team. Every game that names a
 * secret player ends on this card. `extra` is a second line a game wants to
 * add — IRL's real name.
 */
export function SecretCard({ player, extra }: { player: RosterPlayer; extra?: ReactNode }) {
  return (
    <div className="card row" style={{ gap: 14, flexWrap: 'nowrap' }}>
      <PlayerAvatar player={player} size={54} />
      <div style={{ minWidth: 0 }}>
        <div className="bold">{player.name}</div>
        <div className="small muted">
          <CountryBadge code={player.country} name={player.countryName} /> {player.countryName ?? 'Unknown'} ·{' '}
          {playerMoney(player)} · {plural(player.fncsWins, 'FNCS win')}
        </div>
        {extra ? <div className="small muted">{extra}</div> : null}
      </div>
    </div>
  );
}

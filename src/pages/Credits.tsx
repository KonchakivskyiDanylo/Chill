import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { REPO_URL, SOURCE, WIKIPEDIA } from '@/data/liquipedia/roster';

/**
 * Attribution page.
 *
 * Kept short on purpose, but it has to hold everything the two licences and
 * Liquipedia's API terms ask for: credit with a link back, the licence's URI,
 * a note that the work was modified, the same licence on what we derive (and
 * the no-warranty disclaimer that travels with it), no implied endorsement,
 * and the project published as open source. Liquipedia's images are licensed
 * separately, which is why none are used.
 */

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="link" href={href} target="_blank" rel="noreferrer noopener">
    {children}
  </a>
);

export function Credits() {
  return (
    <div className="page page--narrow stack-lg">
      <div className="stack-sm">
        <Link to="/" className="small muted" style={{ width: 'fit-content' }}>
          ← All games
        </Link>
        <h1>Credits &amp; licence</h1>
      </div>

      <section className="card stack-sm">
        <div className="card__title">Liquipedia</div>
        <p className="small">
          Player, team, tournament, placement and transfer data is from the{' '}
          <Ext href={SOURCE.url}>Liquipedia Fortnite wiki</Ext> and its contributors, fetched through the
          Liquipedia API and used under <Ext href={SOURCE.licenseUrl}>{SOURCE.license}</Ext>.
        </p>
        <p className="small muted">
          <strong>Modified:</strong> filtered to players with a competitive record, countries turned into
          flags, team pages into team names, and ages, difficulty tiers, rankings and puzzle answers derived
          by this site. Errors in those are ours. No Liquipedia images are used.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">Wikipedia</div>
        <p className="small">
          FNCS title counts are from <Ext href={WIKIPEDIA.url}>“Competitive Fortnite records and statistics”</Ext>,
          used under <Ext href={WIKIPEDIA.licenseUrl}>{WIKIPEDIA.license}</Ext>.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">This site</div>
        <p className="small muted">
          Our data files are shared under the same licence, as is, without warranty. The code is MIT and{' '}
          <Ext href={REPO_URL}>open source on GitHub</Ext>, where you can also report wrong data. OffSpawn is
          an unofficial fan project, not affiliated with or endorsed by Epic Games, Liquipedia, Team Liquid,
          Wikipedia or any team or player. Fortnite is a trademark of Epic Games, Inc.
        </p>
      </section>
    </div>
  );
}

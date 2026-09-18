import { Link } from 'react-router-dom';

/**
 * Attribution page.
 *
 * Liquipedia's text is licensed CC-BY-SA 3.0, which asks for three things from
 * anyone reusing it: credit the source with a link, say what was changed, and
 * pass the same licence on to the derived work. Section 4(a) also wants the
 * licence itself — or its URI — to travel with the work, which is why every
 * link below points at the real licence text rather than paraphrasing it.
 */

/** What was taken from Liquipedia, in the wiki's own terms. */
const LIQUIPEDIA_TABLES = [
  'Player pages — handle, real name, nationality, region, birth date, career and per-year earnings, current team',
  'Team pages — organisation names, regions, founding and disband dates',
  'Tournament pages — name, dates, mode, region, prize pool and Liquipedia tier',
  'Placement tables — who finished where, and alongside whom',
  'Transfer tables — moves between organisations',
];

export function Credits() {
  return (
    <div className="page page--narrow stack-lg">
      <div className="stack">
        <Link to="/" className="small muted" style={{ width: 'fit-content' }}>
          ← All games
        </Link>
        <h1>Credits &amp; data licence</h1>
        <p className="muted">
          OffSpawn is a fan project. Everything it knows about Fortnite players was written by other people,
          and this page says who they are and what was done with their work.
        </p>
      </div>

      <section className="card stack">
        <div className="card__title">Liquipedia</div>
        <p className="small">
          Some content on OffSpawn is from the Liquipedia Fortnite wiki —{' '}
          <a className="link" href="https://liquipedia.net/fortnite" target="_blank" rel="noreferrer noopener">
            https://liquipedia.net/fortnite
          </a>{' '}
          — and is used under the{' '}
          <a
            className="link"
            href="https://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="noreferrer noopener"
          >
            Creative Commons Attribution-ShareAlike 3.0
          </a>{' '}
          licence. Liquipedia is a Team Liquid project, written and maintained by its contributors.
        </p>
        <p className="small">What was taken:</p>
        <ul className="stack-sm list-reset small">
          {LIQUIPEDIA_TABLES.map((table) => (
            <li key={table} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 8 }}>
              <span aria-hidden="true" style={{ color: 'var(--primary)', lineHeight: 1.55 }}>
                ▸
              </span>
              <span>{table}</span>
            </li>
          ))}
        </ul>
        <hr className="divider" />
        <div className="stack-sm">
          <h3>What was changed</h3>
          <p className="small muted">
            The original work has been modified. Liquipedia's player, tournament, team, transfer and
            placement tables were exported, then: rows were narrowed to people with a competitive record;
            nationalities were mapped to two-letter country codes; team page names were swapped for display
            names; ages are computed from published birth dates; and a “fame” ranking was derived from
            career earnings and tournament wins weighted by the tier of the tournament, which is what the
            Easy / Medium / Hard settings select on. None of those derived numbers appear on Liquipedia —
            they are this site's reading of Liquipedia's data, and any error in them is ours.
          </p>
          <p className="small muted">
            No photographs or images were taken from Liquipedia. Many files there are licensed separately
            from the text and would need their own clearance.
          </p>
        </div>
        <hr className="divider" />
        <div className="stack-sm">
          <h3>ShareAlike</h3>
          <p className="small muted">
            Because the data files in this project are a derivative of CC-BY-SA text, they are shared under
            the same licence: <strong>CC-BY-SA 3.0</strong>. That covers{' '}
            <code className="mono tiny">src/data/</code> and the build scripts' output. The site's own
            source code is MIT-licensed, which is a separate thing from the data it reads.
          </p>
        </div>
      </section>

      <section className="card stack">
        <div className="card__title">Wikipedia</div>
        <p className="small">
          FNCS title counts, and the tournament results behind Career Path, Who Are Ya, Connections and
          Tenaball, come from the English Wikipedia article{' '}
          <a
            className="link"
            href="https://en.wikipedia.org/wiki/Competitive_Fortnite_records_and_statistics"
            target="_blank"
            rel="noreferrer noopener"
          >
            “Competitive Fortnite records and statistics”
          </a>
          , used under{' '}
          <a
            className="link"
            href="https://creativecommons.org/licenses/by-sa/4.0/"
            target="_blank"
            rel="noreferrer noopener"
          >
            CC-BY-SA 4.0
          </a>
          . Its FNCS winners table lists every grand-final winner in every region since 2019, which is why
          Higher or Lower can ask about FNCS wins at all — the Liquipedia export does not publish that as a
          per-player number.
        </p>
      </section>

      <section className="card stack">
        <div className="card__title">Epic Games</div>
        <p className="small muted">
          Fortnite is a trademark of Epic Games, Inc. OffSpawn is an unofficial, non-commercial fan project
          with no affiliation to Epic Games, Liquipedia, Team Liquid, Wikipedia or any organisation or
          player named on the site. Player names, team names and logos appear for identification only.
        </p>
      </section>

      <section className="card stack">
        <div className="card__title">Something wrong?</div>
        <p className="small muted">
          If you are a rights holder and something here needs correcting or removing, or if a player's data
          is simply wrong, open an issue on the repository and it will be fixed.
        </p>
      </section>
    </div>
  );
}

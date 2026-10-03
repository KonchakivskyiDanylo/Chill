import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { SOURCE } from '@/data/liquipedia/roster';
import { CREDITS_META, usePageMeta } from '@/lib/seo';

/**
 * Credits & licence.
 *
 * The long form the footer points to: plain headings, nothing a reader has to
 * decode. It holds everything Liquipedia's licence and API terms ask for —
 * credit with a link back, the licence and its link, that the data was
 * changed and how, the same licence on what we share (as is, without
 * warranty), and no implied endorsement. Liquipedia's images are licensed
 * separately, which is why none are used. The code's repository is public, as
 * the API terms ask, but not linked (the user, 30 Sep 2026).
 */

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="link" href={href} target="_blank" rel="noreferrer noopener">
    {children}
  </a>
);

export function Credits() {
  usePageMeta(CREDITS_META);
  return (
    <div className="page page--narrow stack-lg">
      <div className="stack-sm">
        <Link to="/" className="small muted" style={{ width: 'fit-content' }}>
          ← All games
        </Link>
        <h1>Credits &amp; licence</h1>
        <p className="muted" style={{ margin: 0 }}>
          Where OffSpawn’s numbers come from, and the terms you can reuse them on.
        </p>
      </div>

      <section className="card stack-sm">
        <div className="card__title">Where the data comes from</div>
        <p className="small">
          Every player, team, tournament, result and transfer on OffSpawn comes from the{' '}
          <Ext href={SOURCE.url}>Liquipedia Fortnite wiki</Ext>, written by its contributors. We get it
          through the Liquipedia API and use it under the{' '}
          <Ext href={SOURCE.licenseUrl}>{SOURCE.license}</Ext> licence, as set out in{' '}
          <Ext href="https://liquipedia.net/commons/Liquipedia:Copyrights">Liquipedia’s copyright page</Ext>.
        </p>
        <p className="small">
          There is no other source. Where Liquipedia says nothing — a birthday, an earnings figure — the site
          shows nothing rather than a guess.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">What we changed</div>
        <ul className="small stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
          <li>Kept only players with prize money on record, and left out players who have died.</li>
          <li>Turned nationalities into flags and team pages into team names.</li>
          <li>
            Worked out ages, difficulty levels, rankings, FNCS title counts (from the results of every regional
            FNCS grand final) and every puzzle’s answers.
          </li>
        </ul>
        <p className="small muted" style={{ margin: 0 }}>
          Any mistake in those is ours, not Liquipedia’s. No images from Liquipedia are used.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">Follower counts</div>
        <p className="small">
          YouTube subscriber counts come from YouTube, through YouTube API Services, and Twitch follower counts
          from Twitch. They are refreshed every day and shown exactly as each platform gives them. They belong
          to YouTube and Twitch and are not covered by the licence below. Which channel belongs to which player
          comes from Liquipedia. More on the <Link to="/privacy" className="link">privacy page</Link>.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">Reusing our data</div>
        <p className="small">
          The data files OffSpawn makes from Liquipedia’s are shared under the same licence,{' '}
          <Ext href={SOURCE.licenseUrl}>{SOURCE.license}</Ext>. You can reuse them if you:
        </p>
        <ul className="small stack-sm" style={{ margin: 0, paddingLeft: 18 }}>
          <li>
            credit Liquipedia with a link: “Some content from Liquipedia, <Ext href={SOURCE.url}>liquipedia.net/fortnite</Ext>”;
          </li>
          <li>say what you changed;</li>
          <li>share your version under the same licence.</li>
        </ul>
        <p className="small muted" style={{ margin: 0 }}>
          They are provided as they are, without any warranty.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">Not official</div>
        <p className="small">
          OffSpawn is unofficial. It is not connected to, or endorsed by, Epic Games, Liquipedia, Team Liquid,
          YouTube, Twitch, or any team or player. Fortnite is a trademark of Epic Games, Inc.
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          Spotted wrong data, or have a rights question? Tell us with the 💬 button at the top of any page.
        </p>
      </section>
    </div>
  );
}

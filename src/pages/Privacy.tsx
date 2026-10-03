import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { GOOGLE_PRIVACY, YOUTUBE_TERMS } from '@/components/SocialsNote';
import { PRIVACY_META, usePageMeta } from '@/lib/seo';

/**
 * What the site keeps, and about whom.
 *
 * Short, and complete for what YouTube's API terms ask of a site that shows
 * its data: that the site uses YouTube API Services, a link to YouTube's Terms
 * of Service and to Google's Privacy Policy, what is collected and stored, and
 * how to get in touch. Twitch's developer terms ask for a public privacy
 * notice too.
 */

const Ext = ({ href, children }: { href: string; children: ReactNode }) => (
  <a className="link" href={href} target="_blank" rel="noreferrer noopener">
    {children}
  </a>
);

export function Privacy() {
  usePageMeta(PRIVACY_META);
  return (
    <div className="page page--narrow stack-lg">
      <div className="stack-sm">
        <Link to="/" className="small muted" style={{ width: 'fit-content' }}>
          ← All games
        </Link>
        <h1>Privacy</h1>
      </div>

      <section className="card stack-sm">
        <div className="card__title">What stays on your device</div>
        <p className="small">
          Your daily results, streaks, best scores and settings are kept in your browser’s local storage. They
          never leave it, and clearing your site data deletes them. There are no accounts.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">What the site counts</div>
        <p className="small">
          When you finish a round, the site records how it went — which puzzle, the answers given, won or
          lost — to see which puzzles are too hard. It is not linked to you: no account, no device id, no
          cookie, and IP addresses are not stored. A message you send with the 💬 button is kept with any
          contact details you choose to add, to reply to it.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">YouTube and Twitch</div>
        <p className="small">
          Follower counts come from the YouTube Data API (YouTube API Services) and the Twitch API: the
          public subscriber and follower totals of players’ channels, as linked from their Liquipedia pages.
          The site asks for nothing about you from either, and keeps only the latest counts — refreshed daily,
          never older than YouTube and Twitch allow.
        </p>
        <p className="small">
          By using the parts of OffSpawn that show these counts you agree to be bound by the{' '}
          <Ext href={YOUTUBE_TERMS}>YouTube Terms of Service</Ext>. YouTube’s data is handled under the{' '}
          <Ext href={GOOGLE_PRIVACY}>Google Privacy Policy</Ext>.
        </p>
      </section>

      <section className="card stack-sm">
        <div className="card__title">Questions</div>
        <p className="small muted">
          Ask with the 💬 button at the top of any page. See also <Link to="/credits" className="link">Credits &amp; licence</Link>.
        </p>
      </section>
    </div>
  );
}

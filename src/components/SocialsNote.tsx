import { Link } from 'react-router-dom';
import { useSocials } from '@/data/useSocials';

/**
 * Where the follower counts come from, next to the data — YouTube's terms ask
 * that a page showing its numbers says YouTube is the source. Shown only while
 * the server has counts, so a page with none says nothing about them.
 */

export const YOUTUBE_TERMS = 'https://www.youtube.com/t/terms';
export const GOOGLE_PRIVACY = 'https://policies.google.com/privacy';

export function SocialsNote() {
  const socials = useSocials();
  if (!socials?.platforms.length) return null;
  const both = socials.has('youtube') && socials.has('twitch');
  return (
    <p className="tiny faint" style={{ margin: 0 }}>
      Follower counts from{' '}
      {socials.has('youtube') ? (
        <>
          YouTube (YouTube API Services ·{' '}
          <a href={YOUTUBE_TERMS} className="link" target="_blank" rel="noreferrer noopener">
            Terms
          </a>
          )
        </>
      ) : null}
      {both ? ' and ' : ''}
      {socials.has('twitch') ? 'Twitch' : ''}, refreshed daily ·{' '}
      <Link to="/privacy" className="link">
        Privacy
      </Link>
    </p>
  );
}

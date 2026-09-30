import { Link } from 'react-router-dom';
import { SOURCE } from '@/data/liquipedia/roster';

/**
 * Site footer.
 *
 * It carries the Liquipedia attribution, which is not decoration: the player
 * data is reused under CC BY-SA 3.0, and that licence requires the credit and a
 * link to the source to appear wherever the work is shown. `Credits` has the
 * long form; this is the version every page carries.
 */

/**
 * Social links. Fill in a `href` and the link appears — an entry with an empty
 * `href` is skipped, so the footer never ships a link that goes nowhere.
 */
const SOCIALS: { label: string; href: string }[] = [
  { label: 'Discord', href: '' },
  { label: 'X', href: '' },
  { label: 'Instagram', href: '' },
  { label: 'TikTok', href: '' },
  { label: 'YouTube', href: '' },
];

export function Footer() {
  const socials = SOCIALS.filter((social) => social.href);

  return (
    <footer className="site-footer">
      <div className="site-footer__inner">
        <div className="site-footer__top">
          <Link to="/" className="brand">
            <span className="brand__mark" aria-hidden="true">
              OS
            </span>
            <span>
              Off<span className="brand__accent">Spawn</span>
            </span>
          </Link>
          {socials.length ? (
            <nav className="site-footer__socials" aria-label="Social links">
              {socials.map((social) => (
                <a key={social.label} href={social.href} target="_blank" rel="noreferrer noopener">
                  {social.label}
                </a>
              ))}
            </nav>
          ) : null}
        </div>

        <hr className="divider" />

        <p className="small faint">
          Data from{' '}
          <a className="link" href={SOURCE.url} target="_blank" rel="noreferrer noopener">
            Liquipedia
          </a>{' '}
          and Wikipedia, modified, under{' '}
          <a className="link" href={SOURCE.licenseUrl} target="_blank" rel="noreferrer noopener">
            CC BY-SA
          </a>
          ; our data files are shared under the same licence. Where the sources say nothing, neither do
          we — nothing is estimated.
        </p>

        <p className="small faint">
          OffSpawn is unofficial and not affiliated with or endorsed by Epic Games, Liquipedia or any team.
          Fortnite is a trademark of Epic Games, Inc.
        </p>

        {/* The site sends one thing about you: how each round you finish went. Say so. */}
        <p className="small faint">
          Your scores and progress stay in your browser. Finished rounds are counted anonymously to tune
          the puzzles — no accounts, no tracking cookies.
        </p>

        <nav className="site-footer__links" aria-label="Site information">
          <Link to="/credits">Credits &amp; licence</Link>
        </nav>
      </div>
    </footer>
  );
}

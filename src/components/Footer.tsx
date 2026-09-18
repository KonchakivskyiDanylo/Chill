import { Link } from 'react-router-dom';

/**
 * Site footer.
 *
 * It carries the Liquipedia attribution, which is not decoration: the player
 * data is reused under CC-BY-SA 3.0, and that licence requires the credit and a
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

        <p className="tiny faint">
          Player data from{' '}
          <a
            className="link"
            href="https://liquipedia.net/fortnite"
            target="_blank"
            rel="noreferrer noopener"
          >
            Liquipedia
          </a>
          , reused and modified under{' '}
          <a
            className="link"
            href="https://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="noreferrer noopener"
          >
            CC-BY-SA 3.0
          </a>
          . FNCS titles from Wikipedia, “Competitive Fortnite records and statistics”, also CC-BY-SA. The
          data files derived from them are shared under the same licence.
        </p>

        <p className="tiny faint">
          © {new Date().getFullYear()} OffSpawn. Player names, team names, logos and trademarks are used
          solely for identification and informational purposes; all rights remain with their respective
          owners. Fortnite is a trademark of Epic Games, Inc. — OffSpawn is an unofficial fan project and
          is not affiliated with or endorsed by Epic Games, Liquipedia or any team shown here.
        </p>

        <nav className="site-footer__links" aria-label="Site information">
          <Link to="/credits">Credits &amp; data licence</Link>
        </nav>
      </div>
    </footer>
  );
}

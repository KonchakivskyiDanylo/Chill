import { useEffect, useState } from 'react';
import { loadSocials, type Socials } from './socials';

/**
 * The counts for a component: null until they land (a daily puzzle waits for
 * them, because its rules may be follower rules), then the counts — possibly
 * none at all, which is `NO_SOCIALS`.
 */
export function useSocials(): Socials | null {
  const [socials, setSocials] = useState<Socials | null>(null);
  useEffect(() => {
    let live = true;
    void loadSocials().then((loaded) => live && setSocials(loaded));
    return () => {
      live = false;
    };
  }, []);
  return socials;
}


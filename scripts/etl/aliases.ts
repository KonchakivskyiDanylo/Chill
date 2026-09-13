/**
 * Hand-verified links between the two sources.
 *
 * Wikipedia and Liquipedia have no shared player id, so the import matches on
 * handle. That works for most of the roster and fails in two ways, both of
 * which have to be resolved by a person looking at the pages:
 *
 *  - the same player is spelled differently (Wikipedia's "Kalgamer" is
 *    Liquipedia's "Kalgamer710");
 *  - two different players share a handle, and the automatic age check in
 *    `build-dataset.ts` is not enough to separate them.
 *
 * Add to these rather than editing the generated files — those are overwritten
 * on every build. Each entry should say who was checked and why.
 */

/** Wikipedia handle (lowercased, alphanumeric) -> Liquipedia handle. */
export const LIQUIPEDIA_ALIASES: Record<string, string> = {
  // Khalid 'Kalgamer' Alomar, Saudi Arabia — four Middle East titles.
  // Liquipedia files him under the handle he streams with.
  kalgamer: 'Kalgamer710',
  // Kiryache, Russia — EU Chapter 2 Season 7 winner, same digit-suffix pattern.
  kiryache: 'Kiryache32',
};

/**
 * Handles where the birthday list holds a *different* person of the same name.
 *
 * The age guard catches these automatically when the implied age at a player's
 * first title is impossible; list one here only when the two are close enough in
 * age for that check to pass.
 */
export const BIRTHDAY_BLOCKLIST = new Set<string>([]);

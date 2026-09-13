/**
 * Readers for the two Liquipedia pages we cache.
 *
 * Both are Lua-rendered tables, so they only exist as HTML — the wikitext is
 * just a template call. Parsing stays deliberately structural (rows and cells)
 * rather than relying on class names, which change more often than the shape.
 */

const MONTHS: Record<string, number> = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6,
  July: 7, August: 8, September: 9, October: 10, November: 11, December: 12,
};

function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&#160;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowCells(html: string): string[][] {
  const rows: string[][] = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]);
    if (cells.length) rows.push(cells);
  }
  return rows;
}

/**
 * The player cell holds a flag image then one or more links; the *last* link is
 * the handle (earlier ones are the flag and, on some rows, the team).
 */
function handleFromCell(cell: string): string {
  const anchors = [...cell.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/g)]
    .map((a) => stripTags(a[1]))
    .filter(Boolean);
  return anchors.length ? anchors[anchors.length - 1] : stripTags(cell);
}

export interface BirthdayRow {
  handle: string;
  birthDate: string;
  realName: string | null;
}

/** Rows of `Birthday_list`: birth year | month and day | handle | real name. */
export function parseBirthdays(html: string): BirthdayRow[] {
  const out = new Map<string, BirthdayRow>();
  for (const cells of rowCells(html)) {
    if (cells.length < 3) continue;
    const year = stripTags(cells[0]);
    if (!/^\d{4}$/.test(year)) continue;
    const monthDay = /^([A-Z][a-z]+)\s+(\d{1,2})$/.exec(stripTags(cells[1]));
    if (!monthDay) continue;
    const month = MONTHS[monthDay[1]];
    if (!month) continue;
    const handle = handleFromCell(cells[2]);
    if (!handle) continue;
    const birthDate = `${year}-${String(month).padStart(2, '0')}-${String(Number(monthDay[2])).padStart(2, '0')}`;
    const realName = cells[3] ? stripTags(cells[3]) || null : null;
    // The page repeats each person across an overview and per-era tabs.
    if (!out.has(handle.toLowerCase())) out.set(handle.toLowerCase(), { handle, birthDate, realName });
  }
  return [...out.values()];
}

export interface EarningsRow {
  rank: number;
  name: string;
  earnings: number;
}

/** Rows of the player earnings portal: rank | player | medals | `$1,234,567`. */
export function parseEarnings(html: string): EarningsRow[] {
  const out = new Map<string, EarningsRow>();
  for (const cells of rowCells(html)) {
    if (cells.length < 3) continue;
    const rank = stripTags(cells[0]);
    if (!/^\d+$/.test(rank)) continue;
    const name = handleFromCell(cells[1]);
    const money = /\$([\d,]+)/.exec(stripTags(cells[cells.length - 1]));
    if (!name || !money) continue;
    if (!out.has(name.toLowerCase())) {
      out.set(name.toLowerCase(), {
        rank: Number(rank),
        name,
        earnings: Number(money[1].replace(/,/g, '')),
      });
    }
  }
  return [...out.values()];
}

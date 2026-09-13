/**
 * Minimal MediaWiki markup helpers — enough to read the tables on
 * en.wikipedia.org/wiki/Competitive_Fortnite_records_and_statistics.
 *
 * The tables lean heavily on `rowspan` / `colspan` (the "NA Central" column is
 * one cell spanning eighteen rows), so a naive line split misaligns every
 * column after it. `parseTables` therefore expands spans into a dense grid:
 * every row comes back with the same number of columns and cell `n` always
 * means the same thing.
 */

export interface Cell {
  content: string;
  rowspan: number;
  colspan: number;
}

/** Splits `| a || b` / `! a !! b` into raw cells, ignoring separators inside templates and links. */
export function splitCells(line: string): string[] {
  const sep = line.startsWith('!') ? '!!' : '||';
  const body = line.replace(/^[|!]{1,2}/, '');
  const parts: string[] = [];
  let buf = '';
  let link = 0;
  let tpl = 0;
  for (let i = 0; i < body.length; i++) {
    if (body.startsWith('{{', i)) tpl++;
    if (body.startsWith('}}', i)) tpl = Math.max(0, tpl - 1);
    if (body.startsWith('[[', i)) link++;
    if (body.startsWith(']]', i)) link = Math.max(0, link - 1);
    if (!tpl && !link && body.startsWith(sep, i)) {
      parts.push(buf);
      buf = '';
      i++;
      continue;
    }
    buf += body[i];
  }
  parts.push(buf);
  return parts;
}

/** Separates a cell's HTML attributes from its content and reads the spans. */
export function parseCell(raw: string): Cell {
  let attrs = '';
  let content = raw;
  let tpl = 0;
  let link = 0;
  for (let i = 0; i < raw.length; i++) {
    if (raw.startsWith('{{', i)) tpl++;
    if (raw.startsWith('}}', i)) tpl = Math.max(0, tpl - 1);
    if (raw.startsWith('[[', i)) link++;
    if (raw.startsWith(']]', i)) link = Math.max(0, link - 1);
    if (!tpl && !link && raw[i] === '|' && raw[i + 1] !== '|') {
      const head = raw.slice(0, i);
      if (head.includes('=') || head.trim() === '') {
        attrs = head;
        content = raw.slice(i + 1);
      }
      break;
    }
  }
  const span = (name: string): number => {
    const at = attrs.toLowerCase().indexOf(name);
    if (at < 0) return 1;
    const digits = /[0-9]+/.exec(attrs.slice(at + name.length));
    return digits ? Number(digits[0]) : 1;
  };
  return { content: content.trim(), rowspan: span('rowspan'), colspan: span('colspan') };
}

/** Expands one table's lines into a dense grid, resolving row/col spans. */
function buildGrid(lines: string[]): string[][] {
  const rows: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('|-')) {
      if (current.length) rows.push(current);
      current = [];
      continue;
    }
    if (trimmed.startsWith('|+')) continue; // caption
    if (trimmed.startsWith('|') || trimmed.startsWith('!')) {
      current.push(trimmed);
      continue;
    }
    // continuation of the previous cell (multi-line refs)
    if (current.length && trimmed) current[current.length - 1] += '\n' + line;
  }
  if (current.length) rows.push(current);

  const grid: string[][] = [];
  const pending: { col: number; rowsLeft: number; value: string }[] = [];

  for (const rowLines of rows) {
    const out: string[] = [];
    const carried = pending.filter((p) => p.rowsLeft > 0);
    const cells = rowLines.flatMap((line) => splitCells(line).map(parseCell));

    let col = 0;
    const skipCarried = (): void => {
      let guard = 0;
      while (guard++ < 64) {
        const hit = carried.find((p) => p.col === col);
        if (!hit) break;
        out[col] = hit.value;
        col++;
      }
    };

    for (const cell of cells) {
      skipCarried();
      const startCol = col;
      for (let k = 0; k < cell.colspan; k++) out[col++] = cell.content;
      if (cell.rowspan > 1) {
        for (let k = 0; k < cell.colspan; k++) {
          pending.push({ col: startCol + k, rowsLeft: cell.rowspan - 1, value: cell.content });
        }
      }
    }
    skipCarried();

    for (const p of carried) p.rowsLeft--;
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].rowsLeft <= 0) pending.splice(i, 1);

    const width = out.length;
    grid.push(Array.from({ length: width }, (_, i) => out[i] ?? ''));
  }
  return grid;
}

/** Every `{| ... |}` table in `wikitext`, as dense grids. */
export function parseTables(wikitext: string): string[][][] {
  const tables: string[][] = [];
  let depth = 0;
  let current: string[] | null = null;
  for (const line of wikitext.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{|')) {
      depth++;
      if (depth === 1) {
        current = [];
        continue;
      }
    }
    if (trimmed.startsWith('|}')) {
      depth--;
      if (depth === 0 && current) {
        tables.push(current);
        current = null;
        continue;
      }
    }
    if (depth >= 1 && current) current.push(line);
  }
  return tables.map(buildGrid);
}

/** The `|+Caption` of each table, in the same order as `parseTables`. */
export function tableCaptions(wikitext: string): string[] {
  return [...wikitext.matchAll(/\|\+([^\n]*)/g)].map((m) => m[1].trim());
}

/** Strips templates, links, refs and HTML down to display text. */
export function cleanText(value: string): string {
  return String(value ?? '')
    .replace(/<ref[^>]*\/>/g, '')
    .replace(/<ref[\s\S]*?<\/ref>/g, '')
    .replace(/\{\{flagicon\|[^}]*\}\}/gi, '')
    .replace(/\{\{Age\|[^}]*\}\}/gi, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{Abbr\|([^|}]+)[^}]*\}\}/gi, '$1')
    .replace(/\{\{Abbr ([^}]+)\}\}/gi, '$1')
    .replace(/'''?/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Wikipedia flag template names -> ISO 3166-1 alpha-2. */
export const FLAG_TO_ISO: Record<string, string> = {
  US: 'US',
  UK: 'GB',
  Canada: 'CA',
  Australia: 'AU',
  Japan: 'JP',
  Brazil: 'BR',
  KSA: 'SA',
  Russia: 'RU',
  Mexico: 'MX',
  Austria: 'AT',
  Argentina: 'AR',
  Denmark: 'DK',
  Germany: 'DE',
  Poland: 'PL',
  Sweden: 'SE',
  France: 'FR',
  UAE: 'AE',
  Bahrain: 'BH',
  Slovenia: 'SI',
  Serbia: 'RS',
  'South Korea': 'KR',
  Lithuania: 'LT',
  Netherlands: 'NL',
  Kuwait: 'KW',
  Latvia: 'LV',
  Ukraine: 'UA',
  Pakistan: 'PK',
  Indonesia: 'ID',
  'New Zealand': 'NZ',
  Norway: 'NO',
  Singapore: 'SG',
  Malaysia: 'MY',
  Jordan: 'JO',
  Syria: 'SY',
  India: 'IN',
  Ireland: 'IE',
  Chile: 'CL',
  Croatia: 'HR',
  Oman: 'OM',
  Bosnia: 'BA',
  Cuba: 'CU',
};

export interface NamedPlayer {
  name: string;
  country: string | null;
}

/**
 * Reads a winners cell such as
 * `{{flagicon|Austria}} [[Aqua (gamer)|Aqua]]<br />{{flagicon|Austria}} Stompy`
 * into `[{name:'Aqua',country:'AT'}, {name:'Stompy',country:'AT'}]`.
 *
 * A leading `Org:` (as used for the LAN rows) is returned separately.
 */
export function parseWinnerCell(cell: string): { org: string | null; players: NamedPlayer[] } {
  if (!cell) return { org: null, players: [] };

  // Separators between roster members: <br />, " & ", and ", " before a flag.
  const flat = String(cell)
    .replace(/<br\s*\/?>/gi, '')
    .replace(/\s+&\s+/g, '')
    .replace(/,\s*(?=\{\{flagicon)/g, '');

  const segments: NamedPlayer[] = [];
  let org: string | null = null;

  for (const [index, segment] of flat.split('').entries()) {
    const flag = /\{\{flagicon\|([^}|]+)/.exec(segment);
    const text = cleanText(segment).trim();
    if (!text || text === '—' || /^TBD$/i.test(text)) continue;
    // The LAN rows lead with the organisation: "{{flagicon|KSA}} [[Team Falcons]]:<br />..."
    if (index === 0 && text.endsWith(':')) {
      org = text.slice(0, -1).trim();
      continue;
    }
    segments.push({
      name: text.replace(/:$/, '').trim(),
      country: flag ? (FLAG_TO_ISO[flag[1].trim()] ?? flag[1].trim()) : null,
    });
  }
  return { org, players: segments };
}

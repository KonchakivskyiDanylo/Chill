import { createHmac, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { aggregate } from '@/analytics/aggregate';
import {
  GAME_IDS,
  MAX_MESSAGE_CHARS,
  MAX_RECORD_BYTES,
  SUPPORT_KINDS,
  SUPPORT_STATUSES,
  type ClientError,
  type RoundRecord,
  type SupportRequest,
} from '@/analytics/types';
import { openStore } from './store';

/**
 * The site's server: the built app from `dist/`, and a handful of endpoints.
 *
 *   POST /api/rounds    a finished round (anyone)
 *   POST /api/support   a support request (anyone)
 *   POST /api/errors    a browser error (anyone)
 *   /api/admin/*        the dashboard behind `#/analytics` (you)
 *
 * No framework: seven routes and a static folder do not need one, and one
 * dependency (`pg`) is easier to keep current than twelve.
 *
 * Configuration, all environment variables:
 *   PORT              set by Heroku
 *   DATABASE_URL      set by Heroku's Postgres add-on; without it, files
 *   ADMIN_PASSWORD    the dashboard password — the admin routes are off without it
 *   SESSION_SECRET    optional; signs the admin cookie (defaults to the password)
 *   ADMIN_OPEN=1      local only: the dashboard with no password at all. Ignored
 *                     when NODE_ENV is production, which Heroku always sets.
 */

const PORT = Number(process.env.PORT ?? 3000);
const DIST = path.resolve(process.cwd(), 'dist');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const SECRET = process.env.SESSION_SECRET || ADMIN_PASSWORD;
const SECURE = process.env.NODE_ENV === 'production';
const OPEN = process.env.ADMIN_OPEN === '1' && !SECURE;
const COOKIE = 'os_admin';
const SESSION_DAYS = 30;

const store = await openStore();

// ------------------------------------------------------------------ limits --

/**
 * A fixed window per client and bucket. The address is only ever a key in
 * this map, for as long as the window lasts — it is never written down.
 */
const windows = new Map<string, { count: number; resets: number }>();

function allowed(req: IncomingMessage, bucket: string, max: number, minutes: number): boolean {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  const key = `${bucket}|${forwarded || req.socket.remoteAddress || '?'}`;
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resets < now) {
    windows.set(key, { count: 1, resets: now + minutes * 60_000 });
    if (windows.size > 10_000) {
      for (const [k, v] of windows) if (v.resets < now) windows.delete(k);
    }
    return true;
  }
  entry.count++;
  return entry.count <= max;
}

// ----------------------------------------------------------------- helpers --

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function readJson(req: IncomingMessage, limit: number): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'Too large');
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Not JSON');
  }
}

function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}): void {
  if (body === undefined) {
    res.writeHead(status, headers).end();
    return;
  }
  res
    .writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers })
    .end(JSON.stringify(body));
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// ------------------------------------------------------------------- admin --

function sign(value: string): string {
  return createHmac('sha256', SECRET).update(value).digest('hex');
}

function sameText(a: string, b: string): boolean {
  // Hash first so the comparison is constant-time whatever the lengths.
  return timingSafeEqual(Buffer.from(sign(a)), Buffer.from(sign(b)));
}

function sessionCookie(): string {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  const value = `${expires}.${sign(String(expires))}`;
  return `${COOKIE}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_DAYS * 86_400}${SECURE ? '; Secure' : ''}`;
}

function isAdmin(req: IncomingMessage): boolean {
  if (OPEN) return true;
  if (!ADMIN_PASSWORD) return false;
  const cookie = String(req.headers.cookie ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`));
  if (!cookie) return false;
  const [expires, mac] = cookie.slice(COOKIE.length + 1).split('.');
  if (!expires || !mac || Number(expires) < Date.now()) return false;
  return sameText(mac, sign(expires));
}

// ------------------------------------------------------------------ routes --

async function api(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const route = `${req.method} ${url.pathname}`;

  if (route === 'POST /api/rounds') {
    if (!allowed(req, 'rounds', 120, 10)) throw new HttpError(429, 'Slow down');
    const body = await readJson(req, MAX_RECORD_BYTES);
    if (
      !isObject(body) ||
      !GAME_IDS.includes(body.game as never) ||
      typeof body.v !== 'number' ||
      !isObject(body.r) ||
      typeof body.outcome !== 'string'
    ) {
      throw new HttpError(400, 'Not a round');
    }
    await store.addRound(body as unknown as RoundRecord);
    return send(res, 204);
  }

  if (route === 'POST /api/support') {
    if (!allowed(req, 'support', 5, 10)) throw new HttpError(429, 'Too many messages — try again in a few minutes');
    const body = await readJson(req, MAX_RECORD_BYTES + 8_192);
    // A field no person fills in: bots that fill every input fill this one.
    if (isObject(body) && body.website) return send(res, 204);
    if (
      !isObject(body) ||
      !SUPPORT_KINDS.includes(body.kind as never) ||
      typeof body.message !== 'string' ||
      !body.message.trim() ||
      body.message.length > MAX_MESSAGE_CHARS ||
      (body.contact !== undefined && (typeof body.contact !== 'string' || body.contact.length > 200))
    ) {
      throw new HttpError(400, 'Not a support request');
    }
    const request: SupportRequest = {
      kind: body.kind as SupportRequest['kind'],
      message: body.message.trim(),
      contact: typeof body.contact === 'string' && body.contact.trim() ? body.contact.trim() : undefined,
      context: isObject(body.context) ? (body.context as SupportRequest['context']) : undefined,
    };
    await store.addSupport(request);
    return send(res, 204);
  }

  if (route === 'POST /api/errors') {
    if (!allowed(req, 'errors', 20, 10)) return send(res, 204);
    const body = await readJson(req, 8_192);
    if (!isObject(body) || typeof body.message !== 'string') throw new HttpError(400, 'Not an error');
    await store.addError(body as unknown as ClientError);
    return send(res, 204);
  }

  // ---- admin
  if (!url.pathname.startsWith('/api/admin/')) throw new HttpError(404, 'No such route');
  if (!ADMIN_PASSWORD && !OPEN) throw new HttpError(503, 'Set ADMIN_PASSWORD on the server to use the dashboard');

  if (route === 'POST /api/admin/login') {
    if (!allowed(req, 'login', 10, 15)) throw new HttpError(429, 'Too many attempts — wait fifteen minutes');
    const body = await readJson(req, 1_024);
    if (!isObject(body) || typeof body.password !== 'string' || !sameText(body.password, ADMIN_PASSWORD)) {
      throw new HttpError(401, 'Wrong password');
    }
    return send(res, 204, undefined, { 'set-cookie': sessionCookie() });
  }
  if (route === 'POST /api/admin/logout') {
    return send(res, 204, undefined, { 'set-cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
  }

  if (!isAdmin(req)) throw new HttpError(401, 'Log in first');

  if (route === 'GET /api/admin/me') return send(res, 204);

  if (route === 'GET /api/admin/dashboard') {
    const days = Number(url.searchParams.get('days'));
    const since = days > 0 ? new Date(Date.now() - days * 86_400_000) : undefined;
    return send(res, 200, aggregate(await store.rounds(since)));
  }
  if (route === 'GET /api/admin/support') return send(res, 200, await store.support());
  if (route === 'GET /api/admin/errors') return send(res, 200, await store.errors(200));

  const status = /^POST \/api\/admin\/support\/(\d+)$/.exec(route);
  if (status) {
    const body = await readJson(req, 1_024);
    if (!isObject(body) || !SUPPORT_STATUSES.includes(body.status as never)) throw new HttpError(400, 'Bad status');
    const ok = await store.setSupportStatus(Number(status[1]), body.status as never);
    return send(res, ok ? 204 : 404);
  }

  throw new HttpError(404, 'No such route');
}

// ------------------------------------------------------------------ static --

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/**
 * Gzipped text files, made once and kept.
 *
 * Heroku's router does not compress, and the roster alone is 2.4 MB of
 * JavaScript and 290 KB gzipped — on a phone that is the difference between
 * a game opening and a game loading. `dist/` never changes while the server
 * runs, so each file is compressed on first request and served from memory.
 */
const zipped = new Map<string, Promise<Buffer>>();
const gzipAsync = promisify(gzip);
const COMPRESSIBLE = new Set(['.html', '.js', '.css', '.json', '.svg', '.txt']);

/**
 * Files from `dist/`, and `index.html` for anything else — the app routes on
 * the hash, so every real path is a file or the page itself. Hashed assets are
 * cached for a year; the page never, so a deploy is picked up on reload.
 */
async function serveStatic(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
  const wanted = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = path.join(DIST, wanted);
  if (!file.startsWith(DIST)) return send(res, 403);
  const found = await stat(file).catch(() => null);
  if (!found?.isFile()) file = path.join(DIST, 'index.html');
  if (!(await stat(file).catch(() => null))) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('No build yet — run `npm run build`.');
    return;
  }
  const type = TYPES[path.extname(file)] ?? 'application/octet-stream';
  const cache = file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  const headers: Record<string, string> = {
    'content-type': type,
    'cache-control': cache,
    'x-content-type-options': 'nosniff',
    vary: 'accept-encoding',
  };
  const accepts = /\bgzip\b/.test(String(req.headers['accept-encoding'] ?? ''));
  if (accepts && COMPRESSIBLE.has(path.extname(file))) {
    if (!zipped.has(file)) zipped.set(file, readFile(file).then((raw) => gzipAsync(raw)));
    const body = await zipped.get(file)!;
    res.writeHead(200, { ...headers, 'content-encoding': 'gzip', 'content-length': String(body.length) }).end(body);
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { ...headers, 'content-length': String(body.length) }).end(body);
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');
  try {
    if (url.pathname.startsWith('/api/')) await api(req, res, url);
    else await serveStatic(req, res, url);
  } catch (error) {
    if (error instanceof HttpError) return send(res, error.status, { error: error.message });
    console.error(error);
    if (!res.headersSent) send(res, 500, { error: 'Server error' });
  }
}).listen(PORT, () => {
  const dashboard = OPEN ? 'open (ADMIN_OPEN, local only)' : ADMIN_PASSWORD ? 'on' : 'off (no ADMIN_PASSWORD)';
  console.log(`OffSpawn on :${PORT} — ${process.env.DATABASE_URL ? 'Postgres' : 'file store'}, dashboard ${dashboard}`);
});

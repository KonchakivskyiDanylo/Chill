/**
 * The analytics server, end to end.
 *
 * Run with: npm run check:server
 *
 * Starts `server/index.ts` on a spare port with a throwaway file store and a
 * known admin password, then plays the part of the site and of its owner:
 * sends rounds, support requests and errors, checks the bad ones are turned
 * away, logs in, and reads everything back through the admin routes. Nothing
 * touches a real database or `server/.data`.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RECORD_VERSION, type RoundRecord } from '@/analytics/types';

const problems: string[] = [];
const check = (ok: boolean, message: string) => {
  if (!ok) problems.push(message);
};

const PORT = 3100 + Math.floor(Math.random() * 800);
const BASE = `http://localhost:${PORT}`;
const PASSWORD = 'check-server-password';
const dir = await mkdtemp(path.join(tmpdir(), 'offspawn-check-'));

const server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
  env: { ...process.env, PORT: String(PORT), DATA_DIR: dir, ADMIN_PASSWORD: PASSWORD, DATABASE_URL: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
server.stdout.on('data', (chunk) => (output += chunk));
server.stderr.on('data', (chunk) => (output += chunk));

async function request(route: string, init: RequestInit = {}, cookie = '') {
  const res = await fetch(`${BASE}${route}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') ?? '' };
}
const post = (route: string, body: unknown, cookie = '') =>
  request(route, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) }, cookie);

try {
  // Wait for it to listen.
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`${BASE}/api/admin/me`);
      break;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  const round: RoundRecord<'wordle'> = {
    v: RECORD_VERSION,
    game: 'wordle',
    app: 'check',
    data: 'check',
    setup: { pick: 'random' },
    outcome: 'won',
    r: { secret: { id: 'Bugha', name: 'Bugha' }, guesses: 3 },
  };

  // ---- the public side
  check((await post('/api/rounds', round)).status === 204, 'a valid round was not accepted');
  check((await post('/api/rounds', { ...round, game: 'chess' })).status === 400, 'a round for no game was accepted');
  check((await post('/api/rounds', 'not json')).status === 400, 'a non-JSON round was accepted');
  const huge = { ...round, r: { ...round.r, padding: 'x'.repeat(70_000) } };
  check((await post('/api/rounds', huge)).status === 413, 'an oversized round was accepted');

  const ticket = { kind: 'wrong-data', message: 'FHD has the wrong title count', contact: 'me@example.com', context: { page: '/game/career-path', round } };
  check((await post('/api/support', ticket)).status === 204, 'a valid support request was not accepted');
  check((await post('/api/support', { ...ticket, website: 'http://spam' })).status === 204, 'the honeypot did not answer like a success');
  check((await post('/api/support', { ...ticket, message: '   ' })).status === 400, 'an empty support message was accepted');
  check((await post('/api/errors', { message: 'boom', page: '#/', app: 'check' })).status === 204, 'an error report was not accepted');

  // ---- the admin side
  check((await request('/api/admin/me')).status === 401, 'the dashboard answered without a login');
  check((await request('/api/admin/dashboard')).status === 401, 'the dashboard data answered without a login');
  check((await post('/api/admin/login', { password: 'wrong' })).status === 401, 'a wrong password logged in');
  const login = await post('/api/admin/login', { password: PASSWORD });
  check(login.status === 204, `the right password did not log in (${login.status})`);
  check(/HttpOnly/i.test(login.setCookie) && /SameSite=Strict/i.test(login.setCookie), 'the admin cookie is not HttpOnly + SameSite');
  const cookie = login.setCookie.split(';')[0];
  check((await request('/api/admin/me', {}, cookie)).status === 204, 'the admin cookie was not accepted');
  check((await request('/api/admin/me', {}, `${cookie}0`)).status === 401, 'a tampered admin cookie was accepted');

  const dash = await request('/api/admin/dashboard?days=7', {}, cookie);
  const data = dash.body as { rounds: number; wordle: { name: string; solved: number }[] };
  check(dash.status === 200 && data.rounds === 1, `the dashboard counts ${data?.rounds} rounds, expected 1`);
  check(data.wordle?.[0]?.name === 'Bugha' && data.wordle[0].solved === 1, 'the dashboard lost the Fortnitedle round');

  const inbox = await request('/api/admin/support', {}, cookie);
  const tickets = inbox.body as { id: number; status: string; body: { message: string } }[];
  check(tickets.length === 1, `the inbox holds ${tickets.length} requests — the honeypot one should be gone`);
  check((await post(`/api/admin/support/${tickets[0]?.id}`, { status: 'done' }, cookie)).status === 204, 'a request could not be marked done');
  const after = (await request('/api/admin/support', {}, cookie)).body as { status: string }[];
  check(after[0]?.status === 'done', 'marking a request done did not stick');

  const errors = (await request('/api/admin/errors', {}, cookie)).body as unknown[];
  check(errors.length === 1, `the error list holds ${errors.length}, expected 1`);

  // ---- limits: the support form is capped at five per ten minutes per client
  let limited = false;
  for (let i = 0; i < 6 && !limited; i++) limited = (await post('/api/support', ticket)).status === 429;
  check(limited, 'the support form was never rate-limited');

  const logout = await post('/api/admin/logout', {}, cookie);
  check(/Max-Age=0/.test(logout.setCookie), 'logging out did not clear the cookie');

  // ---- the site itself, when it has been built: the page, gzipped
  const page = await fetch(`${BASE}/`, { headers: { 'accept-encoding': 'gzip' } });
  if (page.status !== 404) {
    check(page.status === 200 && (await page.text()).includes('<div id="root">'), 'the page did not come back');
    check(page.headers.get('content-encoding') === 'gzip', 'the page was not gzipped');
  }
  // ---- ADMIN_OPEN is for a laptop: in production it must do nothing
  const port = PORT + 1;
  const prod = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dir, ADMIN_OPEN: '1', NODE_ENV: 'production', ADMIN_PASSWORD: '', DATABASE_URL: '' },
    stdio: 'ignore',
  });
  try {
    let status = 0;
    for (let i = 0; i < 100 && !status; i++) {
      status = await fetch(`http://localhost:${port}/api/admin/dashboard`).then(
        (res) => res.status,
        () => new Promise<number>((resolve) => setTimeout(() => resolve(0), 150)),
      );
    }
    check(status === 503, `ADMIN_OPEN opened the dashboard in production (status ${status})`);
  } finally {
    prod.kill();
  }
} catch (error) {
  problems.push(`crashed: ${error instanceof Error ? error.message : String(error)}`);
} finally {
  server.kill();
  await rm(dir, { recursive: true, force: true });
}

if (problems.length) {
  console.log(`\n=== ${problems.length} PROBLEM(S) ===`);
  for (const problem of problems) console.log(`  ✗ ${problem}`);
  console.log('\nserver output:\n' + output);
  process.exit(1);
}
console.log(`server: ${output.trim()}`);
console.log('✓ server checks passed');

/**
 * The site and its API in one terminal.
 *
 * Run with: npm run dev:all
 *
 * `npm run dev` is Vite alone, and the analytics page, the support form and
 * the error reporter all reach the server on :3000 through Vite's proxy — so
 * working on any of them locally meant a second terminal running
 * `npm run api`. This runs those two package scripts side by side, tags each
 * line with the one it came from, and stops both on Ctrl+C or as soon as
 * either of them exits, so a half-running site is never left behind.
 *
 * The API gets ADMIN_OPEN=1: the local-only switch that opens `#/analytics`
 * without a password. The server ignores it in production.
 *
 * The site gets VITE_RECORD=1, so rounds played here are recorded. A dev build
 * does not send them otherwise, and running the dashboard beside a site that
 * never reports to it looked broken: the one round in the local store stayed
 * the only one however much you played. They land in `server/.data`, which is
 * this machine's store and never the live one.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';

const WINDOWS = process.platform === 'win32';
const COLOUR = Boolean(process.stdout.isTTY);

const children: ChildProcess[] = [];
let stopping = false;

function run(label: string, hue: number, script: string, env: Record<string, string> = {}): void {
  const child = spawn(`npm run ${script}`, {
    shell: true,
    // Its own process group, so stopping it stops whatever npm started too.
    detached: !WINDOWS,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Piped output is not a terminal, and Vite would drop its colours for it.
    env: { ...process.env, ...(COLOUR ? { FORCE_COLOR: '1' } : {}), ...env },
  });
  const tag = COLOUR ? `\x1b[${hue}m${label}\x1b[0m` : label;
  relay(child.stdout!, process.stdout, tag);
  relay(child.stderr!, process.stderr, tag);
  child.on('exit', (status) => {
    if (stopping) return;
    console.log(`${tag} stopped${status ? ` (exit ${status})` : ''} — stopping the other one too`);
    stop(status ?? 1);
  });
  children.push(child);
}

/** Line by line, so the two streams never interleave mid-line. */
function relay(from: Readable, to: Writable, tag: string): void {
  let partial = '';
  from.setEncoding('utf8');
  from.on('data', (chunk: string) => {
    const lines = (partial + chunk).split(/\r?\n/);
    partial = lines.pop() ?? '';
    for (const line of lines) to.write(`${tag} ${line}\n`);
  });
  from.on('end', () => {
    if (partial) to.write(`${tag} ${partial}\n`);
  });
}

/**
 * The whole tree, not just the shell. On Windows `npm` runs through cmd.exe,
 * and killing that leaves Vite and the server running and holding their ports.
 */
function kill(child: ChildProcess): void {
  if (child.pid === undefined || child.exitCode !== null) return;
  try {
    if (WINDOWS) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGTERM');
  } catch {
    // Already gone.
  }
}

function stop(status: number): void {
  if (stopping) return;
  stopping = true;
  children.forEach(kill);
  // Give the kills a moment to land before this process, and its pipes, go.
  const left = () => children.filter((child) => child.exitCode === null && child.signalCode === null);
  const started = Date.now();
  const wait = setInterval(() => {
    if (left().length === 0 || Date.now() - started > 3000) {
      clearInterval(wait);
      process.exit(status);
    }
  }, 100);
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

run('api ', 35, 'api', { ADMIN_OPEN: '1' });
run('site', 36, 'dev', { VITE_RECORD: '1' });

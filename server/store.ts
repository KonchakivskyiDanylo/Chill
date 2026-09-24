import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import type {
  ClientError,
  RoundRecord,
  Stored,
  StoredSupport,
  SupportRequest,
  SupportStatus,
} from '@/analytics/types';

/**
 * Where the server keeps what the site sends.
 *
 * Postgres when `DATABASE_URL` is set — Heroku sets it when a Postgres add-on
 * is attached — and a folder of JSON-lines files otherwise, so the whole thing
 * runs on a laptop with nothing installed. Both keep the record exactly as it
 * arrived; the dashboard is computed from it on request (`aggregate.ts`).
 */
export interface Store {
  addRound(body: RoundRecord): Promise<void>;
  /** Oldest first. `since` limits it, for the dashboard's day filter. */
  rounds(since?: Date): Promise<Stored<RoundRecord>[]>;
  addSupport(body: SupportRequest): Promise<void>;
  /** Newest first. */
  support(): Promise<StoredSupport[]>;
  setSupportStatus(id: number, status: SupportStatus): Promise<boolean>;
  addError(body: ClientError): Promise<void>;
  /** Newest first. */
  errors(limit: number): Promise<Stored<ClientError>[]>;
}

export async function openStore(): Promise<Store> {
  const url = process.env.DATABASE_URL;
  if (url) return PostgresStore.open(url);
  const dir = process.env.DATA_DIR ?? path.join(process.cwd(), 'server', '.data');
  return FileStore.open(dir);
}

// ----------------------------------------------------------------- Postgres --

class PostgresStore implements Store {
  private constructor(private readonly pool: pg.Pool) {}

  static async open(url: string): Promise<PostgresStore> {
    // Heroku's Postgres needs TLS and presents a certificate Node will not
    // verify out of the box; a local database needs neither.
    const local = /localhost|127\.0\.0\.1/.test(url);
    const pool = new pg.Pool({ connectionString: url, ssl: local ? false : { rejectUnauthorized: false } });
    await pool.query(`
      create table if not exists rounds (
        id bigserial primary key,
        at timestamptz not null default now(),
        game text not null,
        body jsonb not null
      );
      create index if not exists rounds_at on rounds (at);
      create table if not exists support (
        id bigserial primary key,
        at timestamptz not null default now(),
        status text not null default 'new',
        body jsonb not null
      );
      create table if not exists client_errors (
        id bigserial primary key,
        at timestamptz not null default now(),
        body jsonb not null
      );
    `);
    return new PostgresStore(pool);
  }

  async addRound(body: RoundRecord): Promise<void> {
    await this.pool.query('insert into rounds (game, body) values ($1, $2)', [body.game, body]);
  }

  async rounds(since?: Date): Promise<Stored<RoundRecord>[]> {
    const { rows } = await this.pool.query(
      'select id, at, body from rounds where at >= $1 order by id',
      [since ?? new Date(0)],
    );
    return rows.map((row) => ({ id: Number(row.id), at: new Date(row.at).toISOString(), body: row.body }));
  }

  async addSupport(body: SupportRequest): Promise<void> {
    await this.pool.query('insert into support (body) values ($1)', [body]);
  }

  async support(): Promise<StoredSupport[]> {
    const { rows } = await this.pool.query('select id, at, status, body from support order by id desc limit 500');
    return rows.map((row) => ({
      id: Number(row.id),
      at: new Date(row.at).toISOString(),
      status: row.status,
      body: row.body,
    }));
  }

  async setSupportStatus(id: number, status: SupportStatus): Promise<boolean> {
    const { rowCount } = await this.pool.query('update support set status = $1 where id = $2', [status, id]);
    return (rowCount ?? 0) > 0;
  }

  async addError(body: ClientError): Promise<void> {
    await this.pool.query('insert into client_errors (body) values ($1)', [body]);
  }

  async errors(limit: number): Promise<Stored<ClientError>[]> {
    const { rows } = await this.pool.query('select id, at, body from client_errors order by id desc limit $1', [limit]);
    return rows.map((row) => ({ id: Number(row.id), at: new Date(row.at).toISOString(), body: row.body }));
  }
}

// -------------------------------------------------------------------- files --

/**
 * One JSON object per line, one file per table, held in memory as well.
 *
 * For running locally and for the server's own checks — not for Heroku, whose
 * disk is wiped on every restart. There, attach Postgres.
 */
class FileStore implements Store {
  private rows: Stored<RoundRecord>[] = [];
  private tickets: StoredSupport[] = [];
  private faults: Stored<ClientError>[] = [];

  private constructor(private readonly dir: string) {}

  static async open(dir: string): Promise<FileStore> {
    await mkdir(dir, { recursive: true });
    const store = new FileStore(dir);
    store.rows = await store.read('rounds');
    store.tickets = await store.read('support');
    store.faults = await store.read('errors');
    return store;
  }

  private file(name: string): string {
    return path.join(this.dir, `${name}.jsonl`);
  }

  private async read<T>(name: string): Promise<T[]> {
    try {
      const text = await readFile(this.file(name), 'utf8');
      return text.split('\n').filter(Boolean).map((line) => JSON.parse(line) as T);
    } catch {
      return [];
    }
  }

  private async append(name: string, row: unknown): Promise<void> {
    await appendFile(this.file(name), `${JSON.stringify(row)}\n`);
  }

  private next(rows: { id: number }[]): number {
    return rows.length ? rows[rows.length - 1].id + 1 : 1;
  }

  async addRound(body: RoundRecord): Promise<void> {
    const row = { id: this.next(this.rows), at: new Date().toISOString(), body };
    this.rows.push(row);
    await this.append('rounds', row);
  }

  async rounds(since?: Date): Promise<Stored<RoundRecord>[]> {
    return since ? this.rows.filter((row) => new Date(row.at) >= since) : [...this.rows];
  }

  async addSupport(body: SupportRequest): Promise<void> {
    const row: StoredSupport = { id: this.next(this.tickets), at: new Date().toISOString(), status: 'new', body };
    this.tickets.push(row);
    await this.append('support', row);
  }

  async support(): Promise<StoredSupport[]> {
    return [...this.tickets].reverse();
  }

  async setSupportStatus(id: number, status: SupportStatus): Promise<boolean> {
    const ticket = this.tickets.find((row) => row.id === id);
    if (!ticket) return false;
    ticket.status = status;
    await writeFile(this.file('support'), this.tickets.map((row) => `${JSON.stringify(row)}\n`).join(''));
    return true;
  }

  async addError(body: ClientError): Promise<void> {
    const row = { id: this.next(this.faults), at: new Date().toISOString(), body };
    this.faults.push(row);
    await this.append('errors', row);
  }

  async errors(limit: number): Promise<Stored<ClientError>[]> {
    return [...this.faults].reverse().slice(0, limit);
  }
}

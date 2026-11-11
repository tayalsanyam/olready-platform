import postgres from 'postgres';
import { connection } from 'next/server';

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;
/** Anything a query can run on: the pool or an open transaction. */
export type Db = Sql | Tx;

const globalForDb = globalThis as unknown as { __olreadySql?: Sql };

function create(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const supabase = url.includes('supabase.com') || url.includes('supabase.co');
  const client = postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    ssl: supabase ? 'require' : undefined,
    max: process.env.NODE_ENV === 'production' ? 3 : 10,
    connect_timeout: 15,
    idle_timeout: 20,
    onnotice: () => {},
    transform: { undefined: null },
  });
  // `next build` on Vercel prerenders pages. Those queries were canceled by Postgres
  // and failed the build. Ask Next to render them on the request instead.
  if (process.env.NEXT_PHASE !== 'phase-production-build') return client;
  return new Proxy(client, {
    apply: async (target, thisArg, args) => {
      await connection();
      return Reflect.apply(target as unknown as (...a: unknown[]) => unknown, thisArg, args as unknown[]);
    },
  }) as Sql;
}

export const sql: Sql = globalForDb.__olreadySql ?? create();
if (process.env.NODE_ENV !== 'production') globalForDb.__olreadySql = sql;

export class DomainError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'DomainError';
  }
}

export async function getSetting<T = number>(db: Db, key: string, fallback: T): Promise<T> {
  const [row] = await db`select value from mkt.settings where key = ${key}`;
  return row ? (row.value as T) : fallback;
}

export async function audit(
  db: Db,
  actor: string | null,
  action: string,
  entity: string,
  entityId: string | null,
  data: Record<string, unknown> = {}
) {
  await db`
    insert into mkt.audit_log (actor_profile_id, action, entity, entity_id, data)
    values (${actor}, ${action}, ${entity}, ${entityId}, ${db.json(data as never)})`;
}

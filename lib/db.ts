import postgres from 'postgres';

export type Sql = postgres.Sql<Record<string, unknown>>;
export type Tx = postgres.TransactionSql<Record<string, unknown>>;
/** Anything a query can run on: the pool or an open transaction. */
export type Db = Sql | Tx;

const globalForDb = globalThis as unknown as { __olreadySql?: Sql };

function create(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return postgres(url, {
    // Supabase's transaction pooler does not support prepared statements.
    prepare: false,
    max: process.env.NODE_ENV === 'production' ? 5 : 10,
    idle_timeout: 20,
    onnotice: () => {},
    transform: { undefined: null },
  });
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

import type { Db, Sql } from './db';

/**
 * The walkthrough vendors, brides and team accounts that scripts/seed.mjs creates. They are marked by
 * their slug ("-demo") and their email (@demo.in, @demo.olready.in); nothing else is ever touched.
 */
export async function demoCounts(db: Db, except: string | null = null) {
  const [c] = await db<{ vendors: number; people: number; leads: number; weddings: number; touched: number }[]>`
    select
      (select count(*) from mkt.vendors where slug like '%-demo')::int as vendors,
      (select count(*) from mkt.profiles where (email like '%@demo.in' or email like '%@demo.olready.in') and id::text <> ${except ?? ''})::int as people,
      (select count(*) from mkt.leads where email like '%@demo.in')::int as leads,
      (select count(*) from mkt.real_weddings where slug like '%-demo')::int as weddings,
      -- Real people who wrote to, unlocked or reviewed a demo vendor: their rows with that vendor go too.
      (select count(*) from mkt.threads t join mkt.vendors v on v.id = t.vendor_id where v.slug like '%-demo')::int as touched`;
  return c;
}

type Ref = { tbl: string; col: string; nullable: boolean; has_id: boolean; cascade: boolean };

/**
 * Tables that point at `table`, except links the database empties by itself. Cascading links are walked too:
 * a row the database would remove for us can itself be held by a third table (a request's categories by unlocks).
 */
async function blockers(tx: Db, table: string): Promise<Ref[]> {
  return tx<Ref[]>`
    select c.conrelid::regclass::text as tbl, a.attname as col, not a.attnotnull as nullable, c.confdeltype = 'c' as cascade,
      exists (select 1 from pg_attribute i where i.attrelid = c.conrelid and i.attname = 'id' and not i.attisdropped) as has_id
    from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f' and c.confrelid = ${table}::regclass and c.confdeltype <> 'n' and cardinality(c.conkey) = 1 and c.conrelid <> c.confrelid`;
}

/**
 * Deletes rows by id. Where another table points at them: an optional link is emptied (a real lead that
 * named a demo vendor keeps everything else), a required one is removed with whatever hangs off it.
 */
async function purge(tx: Db, table: string, ids: (string | number)[], depth = 0): Promise<void> {
  if (!ids.length) return;
  if (depth > 12) throw new Error(`Demo data is linked too deeply at ${table}`);
  for (const r of await blockers(tx, table)) {
    const t = tx.unsafe(r.tbl);
    const col = tx(r.col);
    if (r.nullable && !r.cascade) await tx`update ${t} set ${col} = null where ${col}::text = any(${ids.map(String)})`;
    else if (r.has_id) {
      const kids = await tx<{ id: string }[]>`select id::text as id from ${t} where ${col}::text = any(${ids.map(String)})`;
      await purge(tx, r.tbl, kids.map((k) => k.id), depth + 1);
    } else await tx`delete from ${t} where ${col}::text = any(${ids.map(String)})`;
  }
  await tx`delete from ${tx.unsafe(table)} where id::text = any(${ids.map(String)})`;
}

/** Removes every demo row in one transaction and reports what went. Guides and reference data stay. */
export async function removeDemoData(sql: Sql, actor: string | null) {
  return sql.begin(async (tx) => {
    const before = await demoCounts(tx, actor);
    const idsOf = async (q: Promise<{ id: string }[]>) => (await q).map((r) => r.id);
    await purge(tx, 'mkt.real_weddings', await idsOf(tx<{ id: string }[]>`select id::text as id from mkt.real_weddings where slug like '%-demo'`));
    await purge(tx, 'mkt.leads', await idsOf(tx<{ id: string }[]>`select id::text as id from mkt.leads where email like '%@demo.in'`));
    await purge(tx, 'mkt.vendors', await idsOf(tx<{ id: string }[]>`select id::text as id from mkt.vendors where slug like '%-demo'`));
    await purge(
      tx,
      'mkt.profiles',
      await idsOf(tx<{ id: string }[]>`select id::text as id from mkt.profiles where (email like '%@demo.in' or email like '%@demo.olready.in') and id::text <> ${actor ?? ''}`)
    );
    // The test gateway lets anyone "pay" without money; the seed switches it on.
    await tx`update mkt.gateway_settings set enabled = false where gateway = 'test'`;
    await tx`insert into mkt.audit_log (actor_profile_id, action, entity, data) values (${actor}, 'demo.remove', 'system', ${tx.json(before as never)})`;
    return before;
  });
}

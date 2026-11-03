// Imported first so lib/db.ts finds a URL; the eval itself uses EVAL_DATABASE_URL.
process.env.DATABASE_URL ??= process.env.EVAL_DATABASE_URL ?? 'postgres://postgres@localhost:54329/olready';

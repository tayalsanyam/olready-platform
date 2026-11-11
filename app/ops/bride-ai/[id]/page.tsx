import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sql, audit } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { Badge, Card, PageTitle } from '@/components/ui';
import { fmtDate, fmtDateTime, fmtDay, fmtLongDate } from '@/lib/dates';

export const metadata = { title: 'Ask Olready chat' };
type P = { params: Promise<{ id: string }> };

type Row = { id: string; role: 'user' | 'assistant'; text: string; content: unknown; tools_used: string[]; flags: string[]; created_at: Date };

/** A full chat including the lookups behind each answer, for checking quality. Every view is audited. */
export default async function BrideAiThread({ params }: P) {
  const { id } = await params;
  const me = await requireRole(['ops', 'admin'], `/ops/bride-ai/${id}`);
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [t] = await sql<{ title: string; bride: string; created_at: Date }[]>`
    select t.title, p.full_name as bride, t.created_at from mkt.assistant_threads t join mkt.profiles p on p.id = t.profile_id where t.id = ${id}`;
  if (!t) notFound();
  const rows = await sql<Row[]>`select id, role, text, content, tools_used, flags, created_at from mkt.assistant_messages where thread_id = ${id} order by created_at, id`;
  await audit(sql, me.id, 'bride_ai.view', 'assistant_thread', id);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/ops/bride-ai" className="text-[var(--color-muted)]">
          Ask Olready
        </Link>
      </p>
      <PageTitle title={t.title} sub={`${t.bride.split(' ')[0]} · started ${fmtDate(t.created_at)}`} />
      <Card className="space-y-4">
        {rows.map((r) => {
          if (r.text) {
            return (
              <div key={r.id} className={r.role === 'user' ? 'text-right' : ''}>
                <p className={`inline-block max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm ${r.role === 'user' ? 'bg-[var(--color-pink-soft)]' : 'bg-[var(--color-tint)]'}`}>{r.text}</p>
                {r.flags.length ? (
                  <div className="mt-1 flex gap-1">
                    {r.flags.map((f) => (
                      <Badge key={f} tone="warn">
                        {f}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }
          const blocks = Array.isArray(r.content) ? (r.content as { type: string; name?: string; input?: unknown; content?: string }[]) : [];
          return (
            <details key={r.id} className="rounded-lg border border-dashed border-[var(--color-line)] px-3 py-2 text-xs text-[var(--color-muted)]">
              <summary className="cursor-pointer">
                {r.role === 'assistant' ? `Looked up: ${r.tools_used.join(', ')}` : 'Lookup results'}
              </summary>
              <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words">
                {blocks.map((b) => (b.type === 'tool_use' ? `${b.name} ${JSON.stringify(b.input)}` : b.type === 'tool_result' ? b.content : '')).join('\n\n')}
              </pre>
            </details>
          );
        })}
      </Card>
    </>
  );
}

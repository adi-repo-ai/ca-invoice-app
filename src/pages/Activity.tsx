import type { DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SettingsTabs } from '../components/SettingsTabs';
import { Alert, Button, Card, Empty, PageHeader, SkeletonRows, errorMessage } from '../components/ui';
import { describeAudit, listRecentAudit, timeAgo, type AuditEntry } from '../data/audit';
import { db } from '../firebase';

const FILTERS: { key: string; label: string; match: (e: AuditEntry) => boolean }[] = [
  { key: '', label: 'All', match: () => true },
  { key: 'issue', label: 'Issued', match: (e) => e.action === 'ISSUE' },
  { key: 'pay', label: 'Payments', match: (e) => e.action === 'PAYMENT' },
  { key: 'send', label: 'Sent', match: (e) => e.action === 'SEND_EMAIL' || e.action === 'SEND_WHATSAPP' },
  { key: 'del', label: 'Cancelled / deleted', match: (e) => e.action === 'CANCEL' || e.action === 'DELETE' },
];

const DOT: Record<string, string> = {
  CREATE: 'bg-slate-400',
  EDIT: 'bg-slate-400',
  ISSUE: 'bg-blue-500',
  PAYMENT: 'bg-green-500',
  CANCEL: 'bg-red-500',
  DELETE: 'bg-red-600',
  SEND_EMAIL: 'bg-amber-500',
  SEND_WHATSAPP: 'bg-emerald-500',
};

/** ADMIN: who did what to which invoice, newest first (from the append-only audit log). */
export default function Activity() {
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listRecentAudit(db, 40)
      .then((r) => {
        setRows(r.rows);
        setCursor(r.last);
        setHasMore(r.hasMore);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  async function more() {
    setBusy(true);
    try {
      const r = await listRecentAudit(db, 40, cursor);
      setRows((p) => [...(p ?? []), ...r.rows]);
      setCursor(r.last);
      setHasMore(r.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const f = FILTERS.find((x) => x.key === filter)!;
  const shown = (rows ?? []).filter(f.match);
  return (
    <div className="space-y-4">
      <PageHeader title="Settings" subtitle="Everything done to invoices, by whom and when" />
      <SettingsTabs />
      {error && <Alert>{error}</Alert>}
      <Card>
        <div className="mb-4 flex flex-wrap gap-1.5">
          {FILTERS.map((x) => (
            <button
              key={x.key}
              type="button"
              aria-pressed={filter === x.key}
              onClick={() => setFilter(x.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${filter === x.key ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-slate-200 text-slate-600 hover:border-[var(--brand)]'}`}
            >
              {x.label}
            </button>
          ))}
        </div>
        {!rows ? (
          <SkeletonRows />
        ) : shown.length === 0 ? (
          <Empty>No activity yet.</Empty>
        ) : (
          <ol className="relative space-y-0 border-l border-slate-200 pl-5">
            {shown.map((e) => {
              const at = e.at?.toDate();
              return (
                <li key={e.id} className="relative py-2.5">
                  <span className={`absolute -left-[26px] top-4 h-2.5 w-2.5 rounded-full ring-4 ring-[var(--color-surface)] ${DOT[e.action] ?? 'bg-slate-400'}`} />
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm">
                      {e.action === 'DELETE' ? (
                        describeAudit(e)
                      ) : (
                        <Link to={`/invoices/${e.invoiceId}`} className="hover:text-[var(--brand)] hover:underline">
                          {describeAudit(e)}
                        </Link>
                      )}
                      {typeof e.details?.recipient === 'string' && e.details.recipient && <span className="text-slate-500"> → {e.details.recipient}</span>}
                      {e.action === 'CANCEL' && typeof e.details?.reason === 'string' && <span className="text-slate-500"> · “{e.details.reason}”</span>}
                    </span>
                    <span className="text-xs text-slate-500" title={at?.toLocaleString('en-IN')}>
                      {timeAgo(at)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400">{e.userEmail}</div>
                </li>
              );
            })}
          </ol>
        )}
        {hasMore && (
          <div className="mt-3 text-center">
            <Button variant="secondary" busy={busy} onClick={more}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

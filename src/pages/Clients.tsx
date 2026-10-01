import type { DocumentSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDialog } from '../components/Dialog';
import { Alert, Button, Card, Empty, LinkButton, Loading, PageHeader, errorMessage } from '../components/ui';
import { countClients, deleteClient, listClients, listClientsNewest, type ClientRow } from '../data/clients';
import { db } from '../firebase';

type Sort = 'az' | 'newest';

export default function Clients() {
  const dialog = useDialog();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('az');
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState('');

  // Searching always uses A–Z (name prefix search).
  const effectiveSort: Sort = search.trim() ? 'az' : sort;
  const fetchPage = useCallback(
    (after: DocumentSnapshot | null) => (effectiveSort === 'newest' ? listClientsNewest(db, after) : listClients(db, search, after)),
    [effectiveSort, search],
  );

  // Debounced; each page costs at most 21 reads.
  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null);
      fetchPage(null)
        .then((r) => {
          setRows(r.rows);
          setCursor(r.last);
          setHasMore(r.hasMore);
        })
        .catch((e) => setMsg({ kind: 'error', text: errorMessage(e) }));
    }, 250);
    return () => clearTimeout(t);
  }, [fetchPage]);

  useEffect(() => {
    countClients(db).then(setTotal).catch(() => undefined);
  }, []);

  async function more() {
    setBusy('more');
    try {
      const r = await fetchPage(cursor);
      setRows((p) => [...(p ?? []), ...r.rows]);
      setCursor(r.last);
      setHasMore(r.hasMore);
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  }

  async function remove(c: ClientRow) {
    const ok = await dialog.confirm({
      title: `Delete ${c.name}?`,
      message: 'They will be removed from your client list. Existing invoices are kept unchanged.',
      confirmText: 'Delete client',
      danger: true,
    });
    if (!ok) return;
    setBusy(c.id);
    try {
      await deleteClient(db, c.id);
      setRows((p) => (p ?? []).filter((r) => r.id !== c.id));
      setTotal((t) => (t === null ? t : t - 1));
      setMsg({ kind: 'success', text: `${c.name} deleted.` });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy('');
    }
  }

  const sortBtn = (value: Sort, label: string) => (
    <button
      type="button"
      onClick={() => setSort(value)}
      aria-pressed={effectiveSort === value}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${effectiveSort === value ? 'bg-surface text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        subtitle={total === null ? 'Your client list' : `${total} client${total === 1 ? '' : 's'} in total`}
        actions={<LinkButton to="/clients/new">+ New client</LinkButton>}
      />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input type="search" className="min-w-0 flex-1" placeholder="Search by name (starts with)…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search clients" />
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Sort clients">
            {sortBtn('az', 'A–Z')}
            {sortBtn('newest', 'Newest first')}
          </div>
        </div>
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>No clients found.</Empty>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-2 py-3 transition hover:bg-slate-50">
                <Link to={`/clients/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--brand)]/10 font-semibold text-[var(--brand)]">
                    {c.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-sm text-slate-500">
                      {[c.contactPerson, c.stateName, c.whatsapp ? `+${c.whatsapp}` : '', c.gstin].filter(Boolean).join(' · ') || '—'}
                    </span>
                  </span>
                </Link>
                <div className="flex items-center gap-2">
                  <LinkButton variant="secondary" to={`/clients/${c.id}`} className="!px-3 !py-1.5">
                    View
                  </LinkButton>
                  <Button variant="ghost" className="!px-3 !py-1.5 !text-red-600" busy={busy === c.id} onClick={() => remove(c)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {hasMore && (
          <div className="mt-4 text-center">
            <Button variant="secondary" busy={busy === 'more'} onClick={more}>
              Load more
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

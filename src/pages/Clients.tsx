import type { DocumentSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDialog } from '../components/Dialog';
import { Alert, Button, Card, Empty, LinkButton, PageHeader, SkeletonRows, errorMessage } from '../components/ui';
import { useAuth } from '../auth';
import { CLIENT_TAGS } from '../lib/defaults';
import { CLIENT_CSV_HEADERS, parseClientCsv } from '../lib/clientImport';
import { toCsv } from '../lib/csv';
import { useSettings } from '../settings-context';
import { countClients, createClient, deleteClient, listClients, listClientsByTag, listClientsNewest, type ClientRow } from '../data/clients';
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
  const [tag, setTag] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();
  const { settings } = useSettings();

  // Searching always uses A–Z (name prefix search).
  const effectiveSort: Sort = search.trim() || tag ? 'az' : sort;
  const fetchPage = useCallback(
    (after: DocumentSnapshot | null) =>
      tag ? listClientsByTag(db, tag, after) : effectiveSort === 'newest' ? listClientsNewest(db, after) : listClients(db, search, after),
    [effectiveSort, search, tag],
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

  const [reloadTick, setReloadTick] = useState(0);
  useEffect(() => {
    countClients(db).then(setTotal).catch(() => undefined);
  }, [reloadTick]);

  function downloadTemplate() {
    const csv = toCsv(CLIENT_CSV_HEADERS, [['Sri Rama Traders', 'Ramesh', 'rama@example.com', '9876543210', 'Main Road, Siddipet', 'Telangana', '', '', 'Business; GST']]);
    import('../pdf/generate').then(({ downloadBlob }) => downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'clients-template.csv'));
  }

  async function importFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    const { clients, problems } = parseClientCsv(await file.text(), settings.stateCode);
    if (fileRef.current) fileRef.current.value = '';
    if (clients.length === 0) return setMsg({ kind: 'error', text: problems.join(' ') || 'No clients found in the file.' });
    const ok = await dialog.confirm({
      title: `Import ${clients.length} client${clients.length === 1 ? '' : 's'}?`,
      message: (
        <>
          {problems.length > 0 && (
            <span className="mb-2 block text-amber-700">
              {problems.length} row{problems.length === 1 ? '' : 's'} will be skipped: {problems.slice(0, 3).join(' ')}
              {problems.length > 3 ? ' …' : ''}
            </span>
          )}
          They are added to your client list. Existing clients are not changed.
        </>
      ),
      confirmText: 'Import',
    });
    if (!ok) return;
    setBusy('import');
    let done = 0;
    try {
      for (const c of clients) {
        await createClient(db, user!.uid, c);
        done++;
      }
      setMsg({ kind: 'success', text: `${done} client${done === 1 ? '' : 's'} imported.${problems.length ? ` ${problems.length} skipped.` : ''}` });
    } catch (e) {
      setMsg({ kind: 'error', text: `${done} imported, then: ${errorMessage(e)}` });
    } finally {
      setBusy('');
      setReloadTick((n) => n + 1);
      fetchPage(null)
        .then((r) => {
          setRows(r.rows);
          setCursor(r.last);
          setHasMore(r.hasMore);
        })
        .catch(() => undefined);
    }
  }

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
        subtitle={
          total === null ? (
            'Your client list'
          ) : (
            <span className="inline-flex items-center gap-2">
              Total clients
              <span className="rounded-full bg-[var(--brand)] px-2.5 py-0.5 text-sm font-semibold text-white">{total}</span>
            </span>
          )
        }
        actions={
          <>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} aria-label="Import clients file" />
            <Button variant="ghost" onClick={downloadTemplate}>
              CSV template
            </Button>
            <Button variant="secondary" busy={busy === 'import'} onClick={() => fileRef.current?.click()}>
              Import CSV
            </Button>
            <LinkButton to="/clients/new">+ New client</LinkButton>
          </>
        }
      />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            type="search"
            className="min-w-0 flex-1"
            placeholder="Search by name (starts with)…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              if (e.target.value) setTag('');
            }}
            aria-label="Search clients"
          />
          <div className="inline-flex rounded-lg bg-slate-100 p-1" role="group" aria-label="Sort clients">
            {sortBtn('az', 'A–Z')}
            {sortBtn('newest', 'Newest first')}
          </div>
        </div>
        <div className="-mt-2 mb-4 flex flex-wrap gap-1.5" role="group" aria-label="Filter by tag">
          {['', ...CLIENT_TAGS].map((t) => (
            <button
              key={t || 'all'}
              type="button"
              aria-pressed={tag === t}
              onClick={() => {
                setTag(t);
                if (t) setSearch('');
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${tag === t ? 'border-[var(--brand)] bg-[var(--brand)] text-white' : 'border-slate-200 text-slate-600 hover:border-[var(--brand)] hover:text-[var(--brand)]'}`}
            >
              {t || 'All tags'}
            </button>
          ))}
        </div>
        {!rows ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <Empty
            icon={<span className="text-xl">👥</span>}
            action={!search && !tag ? <LinkButton to="/clients/new">+ Add your first client</LinkButton> : undefined}
          >
            {search || tag ? 'No clients match this search or tag.' : 'No clients yet. Add one, or import a list from Excel (CSV).'}
          </Empty>
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
                    {c.tags && c.tags.length > 0 && (
                      <span className="mt-1 flex flex-wrap gap-1">
                        {c.tags.map((t) => (
                          <span key={t} className="rounded-full bg-[var(--brand)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--brand)]">
                            {t}
                          </span>
                        ))}
                      </span>
                    )}
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

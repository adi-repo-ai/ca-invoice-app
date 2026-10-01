import type { DocumentSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Card, LinkButton, Loading, PageHeader, errorMessage } from '../components/ui';
import { listClients, type ClientRow } from '../data/clients';
import { db } from '../firebase';

export default function Clients() {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<ClientRow[] | null>(null);
  const [cursor, setCursor] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Debounced prefix search; each page costs at most 21 reads.
  useEffect(() => {
    const t = setTimeout(() => {
      setRows(null);
      listClients(db, search, null)
        .then((r) => {
          setRows(r.rows);
          setCursor(r.last);
          setHasMore(r.hasMore);
        })
        .catch((e) => setError(errorMessage(e)));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function more() {
    setBusy(true);
    try {
      const r = await listClients(db, search, cursor);
      setRows((p) => [...(p ?? []), ...r.rows]);
      setCursor(r.last);
      setHasMore(r.hasMore);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Clients" actions={<LinkButton to="/clients/new">New client</LinkButton>} />
      {error && <Alert>{error}</Alert>}
      <Card>
        <input
          type="search"
          className="mb-4 w-full"
          placeholder="Search by name (starts with)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {!rows ? (
          <Loading />
        ) : rows.length === 0 ? (
          <p className="text-sm text-slate-500">No clients found.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/clients/${c.id}`} className="flex flex-wrap items-center justify-between gap-2 py-3 hover:bg-slate-50">
                  <div>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-sm text-slate-500">
                      {c.contactPerson && `${c.contactPerson} · `}
                      {c.stateName}
                      {c.gstin && ` · ${c.gstin}`}
                    </div>
                  </div>
                  <span className="text-sm text-[var(--brand)]">View →</span>
                </Link>
              </li>
            ))}
          </ul>
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

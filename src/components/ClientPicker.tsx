import { useEffect, useState } from 'react';
import { listClients, type ClientRow } from '../data/clients';
import { db } from '../firebase';

/** Search-as-you-type client selector (prefix search, max 20 reads per query). */
export function ClientPicker({ value, onChange }: { value: ClientRow | null; onChange: (c: ClientRow) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ClientRow[]>([]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listClients(db, q, null).then((r) => setRows(r.rows)).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  if (value && !open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
        <div>
          <div className="font-medium">{value.name}</div>
          <div className="text-xs text-slate-500">
            {value.stateName} ({value.stateCode}){value.gstin && ` · ${value.gstin}`}
          </div>
        </div>
        <button type="button" className="text-sm text-[var(--brand)]" onClick={() => setOpen(true)}>
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="relative">
      <input
        autoFocus={open}
        className="w-full"
        placeholder="Type to search clients…"
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {rows.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching clients</li>}
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setQ('');
                }}
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-slate-500"> · {c.stateName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

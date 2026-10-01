import { useEffect, useRef, useState } from 'react';
import { listClients, type ClientRow } from '../data/clients';
import { db } from '../firebase';

/**
 * Search-as-you-type client selector (prefix search, max 20 reads per query).
 * The list closes when you pick a client, click anywhere outside, or press Esc.
 */
export function ClientPicker({
  value,
  onChange,
  placeholder = 'Type to search saved clients…',
}: {
  value: ClientRow | null;
  onChange: (c: ClientRow) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false); // "Change" clicked while a client is selected
  const [rows, setRows] = useState<ClientRow[]>([]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      listClients(db, q, null).then((r) => setRows(r.rows)).catch(() => setRows([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q, open]);

  // Close on outside click / Esc.
  useEffect(() => {
    if (!open) return;
    const close = () => {
      setOpen(false);
      setEditing(false);
      setQ('');
    };
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (value && !editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-surface px-3 py-2">
        <div>
          <div className="font-medium">{value.name}</div>
          <div className="text-xs text-slate-500">
            {value.stateName}
            {value.gstin && ` · ${value.gstin}`}
          </div>
        </div>
        <button
          type="button"
          className="text-sm text-[var(--brand)]"
          onClick={() => {
            setEditing(true);
            setOpen(true);
          }}
        >
          Change
        </button>
      </div>
    );
  }
  return (
    <div className="relative" ref={box}>
      <input
        autoFocus={editing}
        className="w-full"
        placeholder={placeholder}
        value={q}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-200 bg-surface shadow-lg">
          {rows.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">No matching clients</li>}
          {rows.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  onChange(c);
                  setOpen(false);
                  setEditing(false);
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

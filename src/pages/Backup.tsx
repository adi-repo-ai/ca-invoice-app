import { collection, doc, getDoc, getDocs, Timestamp, type Firestore } from 'firebase/firestore';
import { useState } from 'react';
import { Alert, Button, Card, PageHeader, errorMessage } from '../components/ui';
import { db } from '../firebase';
import { todayIST } from '../lib/fy';

// Firestore managed backups need the Blaze plan, so ADMINs download a full
// JSON export instead. Costs one read per document.
const COLLECTIONS = ['settings', 'clients', 'invoices', 'counters', 'auditLog'] as const;

function plain(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate().toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

export async function exportAll(fs: Firestore) {
  const out: Record<string, Record<string, unknown>> = {};
  for (const c of COLLECTIONS) {
    if (c === 'settings') {
      // Rules only expose the single settings/firm doc, not the collection.
      const firm = await getDoc(doc(fs, 'settings/firm'));
      out[c] = firm.exists() ? { firm: plain(firm.data()) } : {};
      continue;
    }
    const snap = await getDocs(collection(fs, c));
    out[c] = Object.fromEntries(snap.docs.map((d) => [d.id, plain(d.data())]));
  }
  return { exportedAt: new Date().toISOString(), format: 'lka-invoices-backup-v1', collections: out };
}

export default function Backup() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const data = await exportAll(db);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const { downloadBlob } = await import('../pdf/generate');
      downloadBlob(blob, `lka-invoices-backup_${todayIST()}.json`);
      const counts = COLLECTIONS.map((c) => `${c}: ${Object.keys(data.collections[c]).length}`).join(', ');
      setMsg({ kind: 'success', text: `Backup downloaded (${counts}).` });
    } catch (e) {
      setMsg({ kind: 'error', text: errorMessage(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Backup" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <Card title="Export all data">
        <p className="mb-4 text-sm text-slate-600">
          Downloads firm settings, clients, invoices, invoice counters and the audit log as a single JSON file. Store it
          somewhere safe (e.g. an encrypted drive). Run this at least weekly; each export uses one Firestore read per document.
        </p>
        <Button busy={busy} onClick={run}>
          Export all data
        </Button>
      </Card>
    </div>
  );
}

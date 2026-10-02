import {
  collection,
  doc,
  getDocs,
  limit,
  startAfter,
  type DocumentSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Firestore,
  type Transaction,
  type WriteBatch,
} from 'firebase/firestore';
import type { AuditAction } from '../lib/types';

export interface Actor {
  uid: string;
  email: string;
}

/** Append an audit entry inside the same batch/transaction as the change. */
export function appendAudit(
  db: Firestore,
  w: WriteBatch | Transaction,
  actor: Actor,
  invoiceId: string,
  invoiceNumber: string | null,
  action: AuditAction,
  details: Record<string, unknown> = {},
): void {
  const ref = doc(collection(db, 'auditLog'));
  const entry = {
    invoiceId,
    invoiceNumber: invoiceNumber ?? null,
    action,
    uid: actor.uid,
    userEmail: actor.email,
    at: serverTimestamp(),
    details,
  };
  // WriteBatch.set and Transaction.set have the same shape.
  (w as WriteBatch).set(ref, entry);
}

export interface AuditEntry {
  id: string;
  invoiceId: string;
  invoiceNumber: string | null;
  action: AuditAction;
  uid: string;
  userEmail: string;
  at: { toDate(): Date } | null;
  details: Record<string, unknown>;
}

export async function listInvoiceAudit(db: Firestore, invoiceId: string): Promise<AuditEntry[]> {
  const snap = await getDocs(
    query(collection(db, 'auditLog'), where('invoiceId', '==', invoiceId), orderBy('at', 'desc'), limit(50)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, 'id'>) }));
}

/** Latest activity across all invoices (newest first), paginated. */
export async function listRecentAudit(
  db: Firestore,
  max = 20,
  after: DocumentSnapshot | null = null,
): Promise<{ rows: AuditEntry[]; last: DocumentSnapshot | null; hasMore: boolean }> {
  const parts = [orderBy('at', 'desc')] as Parameters<typeof query>[1][];
  if (after) parts.push(startAfter(after));
  parts.push(limit(max + 1));
  const snap = await getDocs(query(collection(db, 'auditLog'), ...parts));
  const docs = snap.docs.slice(0, max);
  return {
    rows: docs.map((d) => ({ id: d.id, ...(d.data() as Omit<AuditEntry, 'id'>) })),
    last: docs[docs.length - 1] ?? null,
    hasMore: snap.docs.length > max,
  };
}

const ACTION_TEXT: Record<string, string> = {
  CREATE: 'created a draft',
  EDIT: 'edited a draft',
  ISSUE: 'issued',
  PAYMENT: 'recorded payment for',
  CANCEL: 'cancelled',
  DELETE: 'deleted',
  SEND_EMAIL: 'emailed',
  SEND_WHATSAPP: 'sent on WhatsApp',
};

/** Plain-language sentence for an activity entry, e.g. "a@x.com issued LKA/2026-27/0003". */
export function describeAudit(e: AuditEntry): string {
  const who = e.userEmail.split('@')[0];
  const kind = e.details?.kind as string | undefined;
  let verb = ACTION_TEXT[e.action] ?? e.action.toLowerCase();
  if ((e.action === 'SEND_EMAIL' || e.action === 'SEND_WHATSAPP') && kind && kind !== 'invoice') {
    verb = `${verb.split(' ')[0] === 'sent' ? 'sent' : 'emailed'} a ${kind} for`;
  }
  return `${who} ${verb} ${e.invoiceNumber ?? 'a draft'}`;
}

/** "5 min ago", "3 h ago", "2 d ago". */
export function timeAgo(d: Date | null | undefined, now = Date.now()): string {
  if (!d) return 'just now';
  const s = Math.max(0, Math.round((now - d.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
}

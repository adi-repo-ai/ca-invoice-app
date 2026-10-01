import {
  collection,
  doc,
  getDocs,
  limit,
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

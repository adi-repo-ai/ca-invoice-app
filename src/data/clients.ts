import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  endAt,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  startAt,
  updateDoc,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';
import type { Client } from '../lib/types';

export type ClientInput = Omit<Client, 'nameLower'>;
export interface ClientRow extends Client {
  id: string;
}

export const CLIENT_PAGE_SIZE = 20;

/** Prefix search on name, paginated (one read per returned client). */
export async function listClients(
  db: Firestore,
  search: string,
  after: DocumentSnapshot | null,
): Promise<{ rows: ClientRow[]; last: DocumentSnapshot | null; hasMore: boolean }> {
  const s = search.trim().toLowerCase();
  const parts = [orderBy('nameLower')] as Parameters<typeof query>[1][];
  if (s) parts.push(startAt(s), endAt(s + ''));
  if (after) parts.push(startAfter(after));
  parts.push(limit(CLIENT_PAGE_SIZE + 1));
  const snap = await getDocs(query(collection(db, 'clients'), ...parts));
  const docs = snap.docs.slice(0, CLIENT_PAGE_SIZE);
  return {
    rows: docs.map((d) => ({ id: d.id, ...(d.data() as Client) })),
    last: docs[docs.length - 1] ?? null,
    hasMore: snap.docs.length > CLIENT_PAGE_SIZE,
  };
}

export async function getClient(db: Firestore, id: string): Promise<ClientRow | null> {
  const snap = await getDoc(doc(db, 'clients', id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Client) } : null;
}

export async function createClient(db: Firestore, uid: string, c: ClientInput): Promise<string> {
  const ref = await addDoc(collection(db, 'clients'), {
    ...c,
    nameLower: c.name.toLowerCase(),
    createdAt: serverTimestamp(),
    createdBy: uid,
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
  return ref.id;
}

export async function updateClient(db: Firestore, uid: string, id: string, c: ClientInput): Promise<void> {
  await updateDoc(doc(db, 'clients', id), {
    ...c,
    nameLower: c.name.toLowerCase(),
    updatedAt: serverTimestamp(),
    updatedBy: uid,
  });
}

/** Remove a saved client. Their invoices keep a full copy of the details. */
export async function deleteClient(db: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(db, 'clients', id));
}

/** Number of saved clients (a cheap server-side count). */
export async function countClients(db: Firestore): Promise<number> {
  return (await getCountFromServer(collection(db, 'clients'))).data().count;
}

/** Newest clients first (for the "Newest" sort). */
export async function listClientsNewest(
  db: Firestore,
  after: DocumentSnapshot | null,
): Promise<{ rows: ClientRow[]; last: DocumentSnapshot | null; hasMore: boolean }> {
  const parts = [orderBy('createdAt', 'desc')] as Parameters<typeof query>[1][];
  if (after) parts.push(startAfter(after));
  parts.push(limit(CLIENT_PAGE_SIZE + 1));
  const snap = await getDocs(query(collection(db, 'clients'), ...parts));
  const docs = snap.docs.slice(0, CLIENT_PAGE_SIZE);
  return {
    rows: docs.map((d) => ({ id: d.id, ...(d.data() as Client) })),
    last: docs[docs.length - 1] ?? null,
    hasMore: snap.docs.length > CLIENT_PAGE_SIZE,
  };
}

// Personal home-page items: tasks, calendar events, notes and favourite
// links. Each item is private to the signed-in user (enforced by the rules).
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
  type Timestamp,
} from 'firebase/firestore';

export type HomeKind = 'tasks' | 'events' | 'notes' | 'links';

export interface HomeItem {
  id: string;
  ownerUid: string;
  title?: string;
  text?: string;
  url?: string;
  date?: string; // YYYY-MM-DD
  time?: string; // HH:MM
  done?: boolean;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

const ORDER: Record<HomeKind, [string, 'asc' | 'desc']> = {
  tasks: ['date', 'asc'],
  events: ['date', 'asc'],
  notes: ['updatedAt', 'desc'],
  links: ['createdAt', 'asc'],
};

export async function listHome(db: Firestore, uid: string, kind: HomeKind, max = 50): Promise<HomeItem[]> {
  const [field, dir] = ORDER[kind];
  const snap = await getDocs(query(collection(db, kind), where('ownerUid', '==', uid), orderBy(field, dir), limit(max)));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<HomeItem, 'id'>) }));
}

export async function addHome(db: Firestore, uid: string, kind: HomeKind, fields: Omit<HomeItem, 'id' | 'ownerUid'>): Promise<void> {
  await addDoc(collection(db, kind), { ...fields, ownerUid: uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateHome(db: Firestore, kind: HomeKind, id: string, fields: Partial<HomeItem>): Promise<void> {
  await updateDoc(doc(db, kind, id), { ...fields, updatedAt: serverTimestamp() });
}

export async function deleteHome(db: Firestore, kind: HomeKind, id: string): Promise<void> {
  await deleteDoc(doc(db, kind, id));
}

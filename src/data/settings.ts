import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { withDefaults } from '../lib/defaults';
import type { FirmSettings } from '../lib/types';

export const SETTINGS_PATH = 'settings/firm';

export async function loadSettings(db: Firestore): Promise<{ settings: FirmSettings; saved: boolean }> {
  const snap = await getDoc(doc(db, SETTINGS_PATH));
  return { settings: withDefaults(snap.data() as Partial<FirmSettings> | undefined), saved: snap.exists() };
}

export async function saveSettings(db: Firestore, uid: string, s: FirmSettings): Promise<void> {
  await setDoc(doc(db, SETTINGS_PATH), { ...s, updatedAt: serverTimestamp(), updatedBy: uid });
}

// Calls to Netlify Functions, authenticated with the user's Firebase ID token.
import { auth } from './firebase';

export async function callFunction<T>(name: string, body: unknown): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Not signed in');
  const token = await user.getIdToken();
  const res = await fetch(`/.netlify/functions/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

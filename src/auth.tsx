import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth, db } from './firebase';
import type { Role } from './lib/types';

interface AuthState {
  loading: boolean;
  user: User | null;
  role: Role | null; // null = signed in but no role assigned -> no access
  fin: boolean; // can see revenue totals, reports, CSV export and backup
  pay: boolean; // can record payments, send receipts and client statements
}

const SIGNED_OUT: AuthState = { loading: false, user: null, role: null, fin: false, pay: false };
const AuthContext = createContext<AuthState>({ ...SIGNED_OUT, loading: true });

/**
 * Permissions from the token. Accounts made before these flags existed keep
 * what they had: ADMINs see revenue, everyone may record payments.
 */
export function permsFromClaims(claims: Record<string, unknown>, role: Role | null): { fin: boolean; pay: boolean } {
  if (!role) return { fin: false, pay: false };
  return {
    fin: typeof claims.fin === 'boolean' ? claims.fin : role === 'ADMIN',
    pay: typeof claims.pay === 'boolean' ? claims.pay : true,
  };
}

const IDLE_LIMIT_MS = 30 * 60 * 1000; // sign out after 30 minutes without activity
const HEARTBEAT_MS = 5 * 60 * 1000; // refresh "last seen" every 5 minutes while open

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ ...SIGNED_OUT, loading: true });
  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user) return setState(SIGNED_OUT);
        const token = await user.getIdTokenResult();
        const role = token.claims.role === 'ADMIN' || token.claims.role === 'STAFF' ? token.claims.role : null;
        setState({ loading: false, user, role, ...permsFromClaims(token.claims, role) });
      }),
    [],
  );

  // Privacy: automatically sign out after a period of inactivity.
  useEffect(() => {
    if (!state.user) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
    };
    const events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last > IDLE_LIMIT_MS) {
        try {
          sessionStorage.setItem('signedOutIdle', '1');
        } catch {
          /* ignore */
        }
        signOut(auth);
      }
    }, 30_000);
    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      clearInterval(timer);
    };
  }, [state.user]);

  // "Active now" indicator on the Users page.
  useEffect(() => {
    if (!state.user || !state.role) return;
    const uid = state.user.uid;
    const beat = () => updateDoc(doc(db, 'users', uid), { lastSeenAt: serverTimestamp() }).catch(() => undefined);
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => clearInterval(t);
  }, [state.user, state.role]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** The signed-in user as the data layer needs it (uid + email for the audit log). */
export function useActor() {
  const { user } = useAuth();
  if (!user) throw new Error('not signed in');
  return { uid: user.uid, email: user.email ?? '' };
}

export const logout = () => signOut(auth);

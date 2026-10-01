import { onIdTokenChanged, signOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { auth } from './firebase';
import type { Role } from './lib/types';

interface AuthState {
  loading: boolean;
  user: User | null;
  role: Role | null; // null = signed in but no role assigned -> no access
}

const AuthContext = createContext<AuthState>({ loading: true, user: null, role: null });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ loading: true, user: null, role: null });
  useEffect(
    () =>
      onIdTokenChanged(auth, async (user) => {
        if (!user) return setState({ loading: false, user: null, role: null });
        const token = await user.getIdTokenResult();
        const role = token.claims.role === 'ADMIN' || token.claims.role === 'STAFF' ? token.claims.role : null;
        setState({ loading: false, user, role });
      }),
    [],
  );
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

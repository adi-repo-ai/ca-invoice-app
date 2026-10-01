import { signInWithEmailAndPassword } from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { Alert, Button, Field } from '../components/ui';
import { auth } from '../firebase';

// Sign-in only. There is deliberately no sign-up: accounts are created by an
// ADMIN from the Users page (and self-signup is disabled in Firebase).
export default function Login() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setError(
        code === 'auth/user-disabled'
          ? 'This account has been disabled.'
          : code === 'auth/too-many-requests'
            ? 'Too many attempts. Please wait and try again.'
            : 'Incorrect email or password.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow">
        <h1 className="text-center text-lg font-semibold">Sign in to Invoices</h1>
        {error && <Alert>{error}</Alert>}
        <Field label="Email">
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" busy={busy} className="w-full">
          Sign in
        </Button>
        <p className="text-center text-xs text-slate-500">Accounts are created by your administrator.</p>
      </form>
    </div>
  );
}

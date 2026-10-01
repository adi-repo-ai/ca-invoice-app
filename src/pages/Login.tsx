import {
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from 'firebase/auth';
import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { ThemeToggle } from '../components/ThemeToggle';
import { Alert, Button, Field } from '../components/ui';
import { auth } from '../firebase';
import { DEFAULT_LOGO_DATA_URL } from '../lib/defaultLogo';

// Sign-in only. Google sign-in is the main way in; only emails an ADMIN has
// added in Settings → Users get access. Email + password stays as a fallback.
export default function Login() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [showEmail, setShowEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(() => {
    try {
      if (sessionStorage.getItem('signedOutIdle')) {
        sessionStorage.removeItem('signedOutIdle');
        return { kind: 'info', text: 'You were signed out after 30 minutes of inactivity.' };
      }
    } catch {
      /* storage unavailable */
    }
    return null;
  });
  const [busy, setBusy] = useState<'' | 'google' | 'email' | 'reset'>('');

  if (!loading && user) {
    const from = (location.state as { from?: string } | null)?.from ?? '/';
    return <Navigate to={from} replace />;
  }

  async function google() {
    setBusy('google');
    setMsg(null);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
        await signInWithRedirect(auth, provider);
        return;
      }
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setMsg({
          kind: 'error',
          text:
            code === 'auth/user-disabled'
              ? 'This account has been disabled. Ask an administrator.'
              : code === 'auth/unauthorized-domain'
                ? 'This website address is not authorised in Firebase (Authentication → Settings → Authorized domains).'
                : code === 'auth/operation-not-allowed'
                  ? 'Google sign-in is not enabled yet in Firebase (Authentication → Sign-in method → Google).'
                  : 'Google sign-in failed. Please try again.',
        });
      }
    } finally {
      setBusy('');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy('email');
    setMsg(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      setMsg({
        kind: 'error',
        text:
          code === 'auth/user-disabled'
            ? 'This account has been disabled.'
            : code === 'auth/too-many-requests'
              ? 'Too many attempts. Please wait and try again.'
              : 'Incorrect email or password.',
      });
    } finally {
      setBusy('');
    }
  }

  async function forgot() {
    if (!email.trim()) return setMsg({ kind: 'error', text: 'Type your email address first, then click "Forgot password?".' });
    setBusy('reset');
    setMsg(null);
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch {
      /* don't reveal whether the account exists */
    } finally {
      setBusy('');
      setMsg({ kind: 'success', text: `If ${email.trim()} has a password account, a reset link has been sent. Check your inbox (and spam).` });
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-[var(--brand)]/10 via-slate-50 to-slate-100 px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm animate-fade-in space-y-6 rounded-2xl border border-slate-200 bg-surface p-7 shadow-xl">
        <div className="text-center">
          <img src={DEFAULT_LOGO_DATA_URL} alt="" className="mx-auto mb-3 h-14 w-auto rounded-lg bg-white p-1" />
          <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to the invoice portal</p>
        </div>
        {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

        <button
          type="button"
          onClick={google}
          disabled={!!busy}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-surface px-4 py-3 text-sm font-medium shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
            <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
          </svg>
          {busy === 'google' ? 'Signing in…' : 'Sign in with Google'}
        </button>

        {!showEmail ? (
          <button type="button" className="block w-full text-center text-xs text-slate-500 underline-offset-2 hover:underline" onClick={() => setShowEmail(true)}>
            Use email &amp; password instead
          </button>
        ) : (
          <form onSubmit={submit} className="animate-fade-in space-y-4 border-t border-slate-200 pt-5">
            <Field label="Email">
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <div className="flex items-center justify-between">
              <button type="button" className="text-sm font-medium text-[var(--brand)] hover:underline" onClick={forgot} disabled={busy === 'reset'}>
                Forgot password?
              </button>
              <Button type="submit" busy={busy === 'email'}>
                Sign in
              </Button>
            </div>
          </form>
        )}
        <p className="text-center text-xs text-slate-500">Access is given by your administrator. Your data is private to the firm.</p>
      </div>
    </div>
  );
}

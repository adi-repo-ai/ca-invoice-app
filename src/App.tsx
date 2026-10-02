import { lazy, Suspense, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { callFunction } from './api';
import { logout, useAuth } from './auth';
import { DialogProvider } from './components/Dialog';
import { Layout } from './components/Layout';
import { Alert, Button, Loading, errorMessage } from './components/ui';
import { auth } from './firebase';
import Login from './pages/Login';
import { SettingsProvider } from './settings-context';

const Home = lazy(() => import('./pages/Home'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceEdit = lazy(() => import('./pages/InvoiceEdit'));
const InvoiceView = lazy(() => import('./pages/InvoiceView'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientEdit = lazy(() => import('./pages/ClientEdit'));
const ClientView = lazy(() => import('./pages/ClientView'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));
const Backup = lazy(() => import('./pages/Backup'));
const Activity = lazy(() => import('./pages/Activity'));
const Reports = lazy(() => import('./pages/Reports'));

/** Every route except /login requires a signed-in user with a role claim. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user, role } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!role) return <NoRole email={user.email ?? ''} />;
  return <SettingsProvider>{children}</SettingsProvider>;
}

/**
 * Signed in but no role yet: check the access list (Settings → Users) once.
 * If the email was added there, the role is granted and the app opens.
 */
function NoRole({ email }: { email: string }) {
  const [state, setState] = useState<'checking' | 'denied'>('checking');
  const [reason, setReason] = useState('');
  const tried = useRef(false);
  useEffect(() => {
    if (tried.current) return;
    tried.current = true;
    callFunction<{ role: string }>('activate', {})
      .then(() => auth.currentUser?.getIdToken(true))
      .catch((e) => {
        setReason(errorMessage(e));
        setState('denied');
      });
  }, []);
  if (state === 'checking') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-slate-500">
        <Loading />
        <p className="text-sm">Checking your access…</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md animate-fade-in space-y-4 rounded-2xl border border-slate-200 bg-surface p-7 text-center shadow-xl">
        <h1 className="text-lg font-semibold">No access yet</h1>
        <p className="text-sm text-slate-600">{reason || `${email} has not been given access.`}</p>
        <Button onClick={logout}>Sign out</Button>
        <SetupCodeForm />
      </div>
    </div>
  );
}

/** First-time setup: the first user becomes ADMIN with the SETUP_CODE from Netlify. */
function SetupCodeForm() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await callFunction('claim-admin', { code });
      await auth.currentUser?.getIdToken(true); // pick up the new ADMIN role
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2 border-t border-slate-200 pt-4 text-left">
      <p className="text-xs text-slate-500">First-time setup only: enter the setup code to become the administrator.</p>
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <input type="password" autoComplete="off" required placeholder="Setup code" className="min-w-0 flex-1" value={code} onChange={(e) => setCode(e.target.value)} />
        <Button type="submit" variant="secondary" busy={busy}>
          Submit
        </Button>
      </div>
    </form>
  );
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  return role === 'ADMIN' ? <>{children}</> : <Navigate to="/" replace />;
}

/** Pages showing revenue totals (reports, full backup): only people with revenue access. */
function RevenueOnly({ children }: { children: ReactNode }) {
  const { fin } = useAuth();
  return fin ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <DialogProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <RequireAuth>
              <Layout />
            </RequireAuth>
          }
        >
          {(
            [
              ['/', <Home />],
              ['/invoices', <Invoices />],
              ['/invoices/new', <InvoiceEdit />],
              ['/invoices/:id', <InvoiceView />],
              ['/invoices/:id/edit', <InvoiceEdit />],
              ['/clients', <Clients />],
              ['/clients/new', <ClientEdit />],
              ['/clients/:id', <ClientView />],
              ['/clients/:id/edit', <ClientEdit />],
              ['/settings', <AdminOnly><Settings /></AdminOnly>],
              ['/settings/users', <AdminOnly><Users /></AdminOnly>],
              ['/settings/backup', <AdminOnly><RevenueOnly><Backup /></RevenueOnly></AdminOnly>],
              ['/settings/activity', <AdminOnly><Activity /></AdminOnly>],
              ['/reports', <RevenueOnly><Reports /></RevenueOnly>],
              ['/users', <Navigate to="/settings/users" replace />],
              ['/backup', <Navigate to="/settings/backup" replace />],
            ] as [string, ReactNode][]
          ).map(([path, el]) => (
            <Route key={path} path={path} element={<Suspense fallback={<Loading />}>{el}</Suspense>} />
          ))}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </DialogProvider>
  );
}

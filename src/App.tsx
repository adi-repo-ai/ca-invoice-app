import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { logout, useAuth } from './auth';
import { Layout } from './components/Layout';
import { Button, Loading } from './components/ui';
import Login from './pages/Login';
import { SettingsProvider } from './settings-context';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Invoices = lazy(() => import('./pages/Invoices'));
const InvoiceEdit = lazy(() => import('./pages/InvoiceEdit'));
const InvoiceView = lazy(() => import('./pages/InvoiceView'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientEdit = lazy(() => import('./pages/ClientEdit'));
const ClientView = lazy(() => import('./pages/ClientView'));
const Settings = lazy(() => import('./pages/Settings'));
const Users = lazy(() => import('./pages/Users'));
const Backup = lazy(() => import('./pages/Backup'));

/** Every route except /login requires a signed-in user with a role claim. */
function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, user, role } = useAuth();
  const location = useLocation();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!role) {
    return (
      <div className="mx-auto mt-20 max-w-md space-y-4 rounded-lg bg-white p-6 text-center shadow">
        <h1 className="text-lg font-semibold">No access</h1>
        <p className="text-sm text-slate-600">
          Your account ({user.email}) has not been given a role. Ask an administrator to grant access, then sign in again.
        </p>
        <Button onClick={logout}>Sign out</Button>
      </div>
    );
  }
  return <SettingsProvider>{children}</SettingsProvider>;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  return role === 'ADMIN' ? <>{children}</> : <Navigate to="/" replace />;
}

export default function App() {
  return (
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
            ['/', <Dashboard />],
            ['/invoices', <Invoices />],
            ['/invoices/new', <InvoiceEdit />],
            ['/invoices/:id', <InvoiceView />],
            ['/invoices/:id/edit', <InvoiceEdit />],
            ['/clients', <Clients />],
            ['/clients/new', <ClientEdit />],
            ['/clients/:id', <ClientView />],
            ['/clients/:id/edit', <ClientEdit />],
            ['/settings', <AdminOnly><Settings /></AdminOnly>],
            ['/users', <AdminOnly><Users /></AdminOnly>],
            ['/backup', <AdminOnly><Backup /></AdminOnly>],
          ] as [string, ReactNode][]
        ).map(([path, el]) => (
          <Route key={path} path={path} element={<Suspense fallback={<Loading />}>{el}</Suspense>} />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

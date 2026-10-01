import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { formatPaise } from '../lib/money';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[var(--brand)] text-white hover:opacity-90',
  secondary: 'bg-white text-slate-800 border border-slate-300 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'text-slate-700 hover:bg-slate-100',
};

export function Button({
  variant = 'primary',
  className = '',
  busy,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function LinkButton({ to, children, variant = 'primary' }: { to: string; children: ReactNode; variant?: Variant }) {
  return (
    <Link to={to} className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm ${VARIANTS[variant]}`}>
      {children}
    </Link>
  );
}

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? 'h-4 w-4' : 'h-6 w-6'}`}
      aria-label="Loading"
    />
  );
}

export function Loading() {
  return (
    <div className="flex justify-center p-10 text-slate-500">
      <Spinner />
    </div>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold text-slate-800">{title}</h2>}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, error, hint, children, className = '' }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    // Wrapping in <label> associates the text with the (first) control inside.
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-slate-500">{hint}</span>}
      {error && <span className="text-xs text-red-600">{error}</span>}
    </label>
  );
}

export function Alert({ kind = 'error', children }: { kind?: 'error' | 'success' | 'info'; children: ReactNode }) {
  const cls = {
    error: 'border-red-200 bg-red-50 text-red-800',
    success: 'border-green-200 bg-green-50 text-green-800',
    info: 'border-blue-200 bg-blue-50 text-blue-800',
  }[kind];
  return <div className={`rounded-md border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}

export function PageHeader({ title, actions }: { title: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Money({ paise, className = '' }: { paise: number; className?: string }) {
  return <span className={`tabular-nums ${className}`}>₹{formatPaise(paise)}</span>;
}

const STATUS_CLS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700',
  ISSUED: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-red-100 text-red-700',
};
export function StatusBadge({ status }: { status: string }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLS[status] ?? ''}`}>{status}</span>;
}

export function errorMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code === 'permission-denied') return 'You do not have permission to do that (or the data failed validation).';
  if (code === 'unavailable') return 'You appear to be offline. Please try again.';
  return (e as Error)?.message ?? String(e);
}

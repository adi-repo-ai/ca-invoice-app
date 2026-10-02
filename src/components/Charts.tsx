import type { ReactNode } from 'react';
import { formatPaise } from '../lib/money';

/** Compact rupee label for chart axes: 1.2L, 45K, 900. */
export function shortRupees(paise: number): string {
  const r = paise / 100;
  if (r >= 1e7) return `${(r / 1e7).toFixed(1).replace(/\.0$/, '')}Cr`;
  if (r >= 1e5) return `${(r / 1e5).toFixed(1).replace(/\.0$/, '')}L`;
  if (r >= 1e3) return `${(r / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(r));
}

export interface BarPoint {
  label: string;
  a: number; // first series, paise
  b: number; // second series, paise
}

/** Paired bar chart (e.g. billed vs received per month). Pure CSS, no chart library. */
export function BarChart({ data, aLabel, bLabel, height = 160 }: { data: BarPoint[]; aLabel: string; bLabel: string; height?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-[var(--brand)]" /> {aLabel}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> {bLabel}
        </span>
      </div>
      <div className="flex items-end gap-2 sm:gap-3" style={{ height }} role="img" aria-label={`${aLabel} and ${bLabel} by period`}>
        {data.map((d) => (
          <div key={d.label} className="flex h-full min-w-0 flex-1 flex-col justify-end">
            <div className="flex h-full items-end justify-center gap-0.5 sm:gap-1">
              <Bar value={d.a} max={max} cls="bg-[var(--brand)]" title={`${d.label} · ${aLabel}: ₹${formatPaise(d.a)}`} />
              <Bar value={d.b} max={max} cls="bg-green-500" title={`${d.label} · ${bLabel}: ₹${formatPaise(d.b)}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2 sm:gap-3">
        {data.map((d) => (
          <div key={d.label} className="min-w-0 flex-1 truncate text-center text-[11px] text-slate-500">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

function Bar({ value, max, cls, title }: { value: number; max: number; cls: string; title: string }) {
  const h = value > 0 ? Math.max(3, (value / max) * 100) : 0;
  return (
    <div className="group relative flex h-full w-full max-w-5 items-end">
      <div className={`w-full rounded-t-md ${cls} transition-all duration-700 group-hover:brightness-110`} style={{ height: `${h}%` }} title={title} />
      {value > 0 && (
        <span className="pointer-events-none absolute -top-5 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
          ₹{shortRupees(value)}
        </span>
      )}
    </div>
  );
}

/** Circular progress ring with a centre label. */
export function Ring({ pct, size = 112, stroke = 10, children, color = 'var(--brand)' }: { pct: number; size?: number; stroke?: number; children?: ReactNode; color?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-slate-100" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (p / 100) * c}
          style={{ transition: 'stroke-dashoffset 900ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/** Horizontal stacked bar for buckets (e.g. overdue ageing). */
export function StackBar({ parts }: { parts: { label: string; value: number; cls: string }[] }) {
  const total = parts.reduce((t, p) => t + p.value, 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {total > 0 &&
          parts.map((p) =>
            p.value > 0 ? <div key={p.label} className={`${p.cls} transition-all duration-700`} style={{ width: `${(p.value / total) * 100}%` }} title={`${p.label}: ₹${formatPaise(p.value)}`} /> : null,
          )}
      </div>
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
        {parts.map((p) => (
          <div key={p.label} className="flex items-center gap-1.5 text-slate-600">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${p.cls}`} />
            <span className="truncate">{p.label}</span>
            <span className="ml-auto font-medium tabular-nums text-slate-800">₹{shortRupees(p.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

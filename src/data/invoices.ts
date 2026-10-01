import {
  collection,
  doc,
  getAggregateFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  sum,
  where,
  writeBatch,
  type DocumentSnapshot,
  type Firestore,
  type QueryConstraint,
} from 'firebase/firestore';
import { addDays, fyForDate, nextInvoiceNumber, todayIST } from '../lib/fy';
import { computeInvoice, type LineInput } from '../lib/tax';
import type {
  Client,
  ClientSnapshot,
  FirmSettings,
  FirmSnapshot,
  Invoice,
  InvoiceStatus,
  Payment,
  Reimbursement,
} from '../lib/types';
import { appendAudit, type Actor } from './audit';

export interface InvoiceRow extends Invoice {
  id: string;
}

export interface DraftInput {
  clientId: string; // '' for a one-off client that isn't saved to the client list
  client: ClientSnapshot;
  items: LineInput[];
  reimbursements: Reimbursement[];
  terms: string;
  notes?: string;
  includeSignature?: boolean;
}

export function clientSnapshot(c: Client): ClientSnapshot {
  return {
    name: c.name,
    contactPerson: c.contactPerson,
    email: c.email,
    whatsapp: c.whatsapp,
    address: c.address,
    stateName: c.stateName,
    stateCode: c.stateCode,
    gstin: c.gstin,
    pan: c.pan,
  };
}

export function firmSnapshot(s: FirmSettings): FirmSnapshot {
  return {
    name: s.name,
    signatoryName: s.signatoryName,
    tagline: s.tagline,
    proprietor: s.proprietor,
    address: s.address,
    stateName: s.stateName,
    stateCode: s.stateCode,
    phone: s.phone,
    email: s.email,
    website: s.website,
    gstin: s.gstin,
    pan: s.pan,
    bank: { ...s.bank },
  };
}

/** Body fields shared by drafts and issued invoices (totals recomputed every time). */
function body(input: DraftInput, settings: FirmSettings, invoiceDate: string) {
  const r = computeInvoice({
    items: input.items,
    reimbursements: input.reimbursements,
    gstRateBp: settings.gstRateBp,
    firmStateCode: settings.stateCode,
    clientStateCode: input.client.stateCode,
    chargeGst: settings.chargeGst,
  });
  return {
    clientId: input.clientId,
    client: input.client,
    items: r.items,
    reimbursements: r.reimbursements,
    gstRateBp: settings.chargeGst ? settings.gstRateBp : 0,
    taxType: r.taxType,
    totals: r.totals,
    amountInWords: r.amountInWords,
    terms: input.terms,
    notes: input.notes ?? '',
    includeSignature: input.includeSignature ?? true,
    invoiceDate,
    dueDate: addDays(invoiceDate, settings.paymentDueDays),
  };
}

export async function createDraft(
  db: Firestore,
  actor: Actor,
  input: DraftInput,
  settings: FirmSettings,
): Promise<string> {
  const ref = doc(collection(db, 'invoices'));
  const batch = writeBatch(db);
  batch.set(ref, {
    status: 'DRAFT',
    ...body(input, settings, todayIST()),
    createdAt: serverTimestamp(),
    createdBy: actor.uid,
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  });
  appendAudit(db, batch, actor, ref.id, null, 'CREATE', { client: input.client.name });
  await batch.commit();
  return ref.id;
}

export async function updateDraft(
  db: Firestore,
  actor: Actor,
  id: string,
  input: DraftInput,
  settings: FirmSettings,
): Promise<void> {
  const ref = doc(db, 'invoices', id);
  const batch = writeBatch(db);
  batch.update(ref, {
    status: 'DRAFT',
    ...body(input, settings, todayIST()),
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  });
  appendAudit(db, batch, actor, id, null, 'EDIT', {});
  await batch.commit();
}

/**
 * DRAFT -> ISSUED. In one Firestore transaction: read the per-FY counter,
 * take the next sequence, write the invoice and the counter together. Two
 * staff issuing at the same moment both read the same counter; Firestore
 * aborts one transaction and retries it, so numbers never collide or skip.
 * Security rules independently enforce counter == previous + 1.
 */
export async function issueInvoice(
  db: Firestore,
  actor: Actor,
  id: string,
  settings: FirmSettings,
): Promise<string> {
  // When two transactions race, the loser's commit is checked by the security
  // rules against the counter the winner already advanced, so it fails with
  // permission-denied (which the SDK does not retry). Retry only in that case:
  // i.e. when the counter has moved since this attempt read it.
  for (let attempt = 1; ; attempt++) {
    const seen: { fy?: string; last?: number | null } = {};
    try {
      return await issueOnce(db, actor, id, settings, seen);
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'permission-denied' || !seen.fy || attempt >= 20) throw e;
      const now = await getDoc(doc(db, 'counters', seen.fy));
      const lastNow = now.exists() ? (now.data().last as number) : null;
      if (lastNow === seen.last) throw e; // a genuine denial, not a race
      await new Promise((r) => setTimeout(r, 20 + Math.random() * 80 * attempt));
    }
  }
}

async function issueOnce(
  db: Firestore,
  actor: Actor,
  id: string,
  settings: FirmSettings,
  seen: { fy?: string; last?: number | null },
): Promise<string> {
  const invRef = doc(db, 'invoices', id);
  return runTransaction(
    db,
    async (tx) => {
      const invSnap = await tx.get(invRef);
      if (!invSnap.exists()) throw new Error('Invoice not found');
      const inv = invSnap.data() as Invoice;
      if (inv.status !== 'DRAFT') throw new Error('Only drafts can be issued');
      if (inv.items.length === 0) throw new Error('Add at least one line item before issuing');

      // Use the client's latest details on the issued invoice.
      // (One-off clients have no saved record; deleted clients keep the snapshot.)
      let client = inv.client;
      if (inv.clientId) {
        const clientSnap = await tx.get(doc(db, 'clients', inv.clientId));
        if (clientSnap.exists()) client = clientSnapshot(clientSnap.data() as Client);
      }

      const issueDate = todayIST();
      const fy = fyForDate(issueDate);
      const counterRef = doc(db, 'counters', fy);
      const counterSnap = await tx.get(counterRef);
      const last = counterSnap.exists() ? (counterSnap.data().last as number) : null;
      seen.fy = fy;
      seen.last = last;
      const next = nextInvoiceNumber(settings.invoicePrefix, issueDate, last);

      const fields = body(
        {
          clientId: inv.clientId,
          client,
          items: inv.items,
          reimbursements: inv.reimbursements,
          terms: inv.terms,
          notes: inv.notes ?? '',
          includeSignature: inv.includeSignature ?? true,
        },
        settings,
        issueDate,
      );
      tx.update(invRef, {
        ...fields,
        status: 'ISSUED',
        number: next.number,
        seq: next.seq,
        fy: next.fy,
        firm: firmSnapshot(settings),
        issuedAt: serverTimestamp(),
        issuedBy: actor.uid,
        updatedAt: serverTimestamp(),
        updatedBy: actor.uid,
      });
      tx.set(counterRef, { last: next.seq, lastInvoiceId: id, updatedAt: serverTimestamp() });
      appendAudit(db, tx, actor, id, next.number, 'ISSUE', {
        grandTotalPaise: fields.totals.grandTotalPaise,
      });
      return next.number;
    },
    { maxAttempts: 25 },
  );
}

export async function recordPayment(
  db: Firestore,
  actor: Actor,
  inv: InvoiceRow,
  payment: Payment,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'invoices', inv.id), {
    status: 'PAID',
    payment,
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  });
  appendAudit(db, batch, actor, inv.id, inv.number ?? null, 'PAYMENT', { ...payment });
  await batch.commit();
}

export async function cancelInvoice(
  db: Firestore,
  actor: Actor,
  inv: InvoiceRow,
  reason: string,
): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, 'invoices', inv.id), {
    status: 'CANCELLED',
    cancelReason: reason.trim(),
    cancelledAt: serverTimestamp(),
    cancelledBy: actor.uid,
    updatedAt: serverTimestamp(),
    updatedBy: actor.uid,
  });
  appendAudit(db, batch, actor, inv.id, inv.number ?? null, 'CANCEL', { reason: reason.trim() });
  await batch.commit();
}

export async function getInvoice(db: Firestore, id: string): Promise<InvoiceRow | null> {
  const snap = await getDoc(doc(db, 'invoices', id));
  return snap.exists() ? { id: snap.id, ...(snap.data() as Invoice) } : null;
}

// ---------- listing / filtering ----------

export interface InvoiceFilter {
  clientId?: string;
  status?: InvoiceStatus | '';
  from?: string; // YYYY-MM-DD inclusive
  to?: string; // YYYY-MM-DD inclusive
}

export const INVOICE_PAGE_SIZE = 20;

function filterConstraints(f: InvoiceFilter): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (f.clientId) c.push(where('clientId', '==', f.clientId));
  if (f.status) c.push(where('status', '==', f.status));
  if (f.from) c.push(where('invoiceDate', '>=', f.from));
  if (f.to) c.push(where('invoiceDate', '<=', f.to));
  c.push(orderBy('invoiceDate', 'desc'));
  return c;
}

/** One page of invoices (reads = page size + 1). */
export async function listInvoices(
  db: Firestore,
  f: InvoiceFilter,
  after: DocumentSnapshot | null,
  pageSize = INVOICE_PAGE_SIZE,
): Promise<{ rows: InvoiceRow[]; last: DocumentSnapshot | null; hasMore: boolean }> {
  const c = filterConstraints(f);
  if (after) c.push(startAfter(after));
  c.push(limit(pageSize + 1));
  const snap = await getDocs(query(collection(db, 'invoices'), ...c));
  const docs = snap.docs.slice(0, pageSize);
  return {
    rows: docs.map((d) => ({ id: d.id, ...(d.data() as Invoice) })),
    last: docs[docs.length - 1] ?? null,
    hasMore: snap.docs.length > pageSize,
  };
}

/** All invoices matching a filter (for CSV export), fetched in pages of 500. */
export async function listAllInvoices(db: Firestore, f: InvoiceFilter): Promise<InvoiceRow[]> {
  const out: InvoiceRow[] = [];
  let after: DocumentSnapshot | null = null;
  for (;;) {
    const page: Awaited<ReturnType<typeof listInvoices>> = await listInvoices(db, f, after, 500);
    out.push(...page.rows);
    if (!page.hasMore) return out;
    after = page.last;
  }
}

/** Issued invoices past their due date, oldest first. */
export async function listOverdue(db: Firestore, today: string, max = 20): Promise<InvoiceRow[]> {
  const snap = await getDocs(
    query(
      collection(db, 'invoices'),
      where('status', '==', 'ISSUED'),
      where('dueDate', '<', today),
      orderBy('dueDate', 'asc'),
      limit(max),
    ),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Invoice) }));
}

export interface PeriodTotals {
  invoicedPaise: number;
  receivedPaise: number;
  outstandingPaise: number;
}

/**
 * Period totals via server-side SUM aggregations (billed at ~1 read per
 * 1,000 index entries) instead of downloading every invoice.
 *  invoiced    = grand total of ISSUED + PAID invoices dated in the period
 *  received    = payments (amount + TDS) recorded with a payment date in the period
 *  outstanding = grand total of still-unpaid ISSUED invoices dated in the period
 */
export async function periodTotals(db: Firestore, from: string, to: string): Promise<PeriodTotals> {
  const inv = collection(db, 'invoices');
  const [invoiced, outstanding, received] = await Promise.all([
    getAggregateFromServer(
      query(inv, where('status', 'in', ['ISSUED', 'PAID']), where('invoiceDate', '>=', from), where('invoiceDate', '<=', to)),
      { v: sum('totals.grandTotalPaise') },
    ),
    getAggregateFromServer(
      query(inv, where('status', '==', 'ISSUED'), where('invoiceDate', '>=', from), where('invoiceDate', '<=', to)),
      { v: sum('totals.grandTotalPaise') },
    ),
    getAggregateFromServer(
      query(inv, where('status', '==', 'PAID'), where('payment.date', '>=', from), where('payment.date', '<=', to)),
      { amt: sum('payment.amountPaise'), tds: sum('payment.tdsPaise') },
    ),
  ]);
  return {
    invoicedPaise: invoiced.data().v ?? 0,
    outstandingPaise: outstanding.data().v ?? 0,
    receivedPaise: (received.data().amt ?? 0) + (received.data().tds ?? 0),
  };
}

// ADMIN-only: restart this financial year's invoice numbering at 0001
// (e.g. after deleting test invoices before going live). Refused while any
// numbered invoice of that year still exists, so the series never has gaps
// or duplicates.
import { adminDb } from './_shared/admin';
import { HttpError, postHandler, requireRole } from './_shared/http';

/** Indian financial year (April–March) for today's date in IST, e.g. "2026-27". */
export function currentFy(now: Date = new Date()): string {
  const [y, m] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

export default postHandler(async (req) => {
  await requireRole(req, ['ADMIN']);
  const db = adminDb();
  const fy = currentFy();
  const counterRef = db.doc(`counters/${fy}`);

  return db.runTransaction(async (tx) => {
    const remaining = await tx.get(db.collection('invoices').where('fy', '==', fy).count());
    const n = remaining.data().count;
    if (n > 0) {
      throw new HttpError(
        409,
        `${n} numbered invoice${n === 1 ? '' : 's'} from FY ${fy} still exist${n === 1 ? 's' : ''}. Delete ${n === 1 ? 'it' : 'them'} first (drafts don't count), then reset.`,
      );
    }
    const counter = await tx.get(counterRef);
    if (counter.exists) tx.delete(counterRef);
    return { fy, previousLast: counter.exists ? (counter.get('last') as number) : 0 };
  });
});

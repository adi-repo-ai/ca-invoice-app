// Email an issued invoice PDF (generated in the browser) to the client via
// SMTP. Any signed-in ADMIN or STAFF may send; the send is written to the
// audit log from here (server-side), so it cannot be forged by a client.
import { FieldValue } from 'firebase-admin/firestore';
import nodemailer from 'nodemailer';
import { adminDb } from './_shared/admin';
import { HttpError, postHandler, readJson, requireRole } from './_shared/http';
import { invoiceFileName } from '../../src/lib/fy';

interface Body {
  invoiceId: string;
  to: string;
  subject: string;
  body: string;
  pdfBase64: string;
}

const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const MAX_PDF_BYTES = 4 * 1024 * 1024; // Netlify sync functions accept ~6 MB bodies

function env(name: string, required = true): string {
  const v = process.env[name] ?? '';
  if (required && !v) throw new Error(`${name} is not configured`);
  return v;
}

export default postHandler(async (req) => {
  const caller = await requireRole(req, ['ADMIN', 'STAFF']);
  const b = await readJson<Body>(req, 6_000_000);

  const to = String(b.to ?? '').trim();
  if (!EMAIL_RE.test(to)) throw new HttpError(400, 'A single valid recipient email is required');
  const subject = String(b.subject ?? '').trim();
  if (!subject || subject.length > 200 || /[\r\n]/.test(subject)) throw new HttpError(400, 'Subject must be 1–200 characters on one line');
  const text = String(b.body ?? '');
  if (!text.trim() || text.length > 5000) throw new HttpError(400, 'Message must be 1–5000 characters');
  if (typeof b.invoiceId !== 'string' || !b.invoiceId) throw new HttpError(400, 'invoiceId is required');

  const pdf = Buffer.from(String(b.pdfBase64 ?? ''), 'base64');
  if (pdf.length === 0 || pdf.length > MAX_PDF_BYTES) throw new HttpError(400, 'PDF is missing or larger than 4 MB');
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new HttpError(400, 'Attachment is not a PDF');

  const db = adminDb();
  const snap = await db.doc(`invoices/${b.invoiceId}`).get();
  if (!snap.exists) throw new HttpError(404, 'Invoice not found');
  const inv = snap.data()!;
  if (inv.status !== 'ISSUED' && inv.status !== 'PAID') throw new HttpError(409, 'Only issued or paid invoices can be emailed');
  const settings = (await db.doc('settings/firm').get()).data() ?? {};

  const port = Number(env('SMTP_PORT', false) || 587);
  const user = env('SMTP_USER', false);
  const transport = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure: (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465,
    auth: user ? { user, pass: env('SMTP_PASS') } : undefined,
  });

  const fileName = invoiceFileName(inv.number, inv.client?.name ?? 'client');
  let messageId: string;
  try {
    const info = await transport.sendMail({
      from: env('MAIL_FROM'),
      to,
      replyTo: typeof settings.email === 'string' && settings.email ? settings.email : undefined,
      subject,
      text,
      attachments: [{ filename: fileName, content: pdf, contentType: 'application/pdf' }],
    });
    messageId = info.messageId;
  } catch (e) {
    console.error('SMTP send failed', e);
    throw new HttpError(502, 'The mail server rejected the message. Check the SMTP settings.');
  }

  await db.collection('auditLog').add({
    invoiceId: b.invoiceId,
    invoiceNumber: inv.number ?? null,
    action: 'SEND_EMAIL',
    uid: caller.uid,
    userEmail: caller.email ?? '',
    at: FieldValue.serverTimestamp(),
    details: { channel: 'email', recipient: to, subject, messageId },
  });
  return { ok: true, messageId };
});

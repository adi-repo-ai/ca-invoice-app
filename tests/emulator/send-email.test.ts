import { SMTPServer } from 'smtp-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { clearAuth, idTokenFor, post } from './fn-helpers';
import { adminAuth, adminDb } from '../../netlify/functions/_shared/admin';
import handler from '../../netlify/functions/send-invoice-email';

// A throwaway local SMTP server that captures messages.
const received: string[] = [];
const smtp = new SMTPServer({
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  onData(stream, _session, cb) {
    let data = '';
    stream.on('data', (c) => (data += c.toString()));
    stream.on('end', () => {
      received.push(data);
      cb();
    });
  },
});

const PDF = Buffer.from('%PDF-1.4\n% test\n%%EOF').toString('base64');
let staffToken: string;
let noRoleToken: string;

beforeAll(async () => {
  await new Promise<void>((r) => smtp.listen(2525, '127.0.0.1', r));
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: '2525', SMTP_SECURE: 'false', SMTP_USER: '', MAIL_FROM: 'Invoices <invoices@example.com>' });

  await clearAuth();
  const auth = adminAuth();
  const staff = await auth.createUser({ email: 'mailer@example.com', password: 'mailer123' });
  await auth.setCustomUserClaims(staff.uid, { role: 'STAFF' });
  await auth.createUser({ email: 'norole@example.com', password: 'norole123' });
  staffToken = await idTokenFor('mailer@example.com', 'mailer123');
  noRoleToken = await idTokenFor('norole@example.com', 'norole123');

  const db = adminDb();
  await db.doc('settings/firm').set({ email: 'office@example.com' });
  await db.doc('invoices/inv-issued').set({ status: 'ISSUED', number: 'LKA/2026-27/0007', client: { name: 'Sri Rama Traders' } });
  await db.doc('invoices/inv-draft').set({ status: 'DRAFT', client: { name: 'X' } });
});
afterAll(() => new Promise<void>((r) => smtp.close(() => r())));

const body = (over: Record<string, unknown> = {}) => ({
  invoiceId: 'inv-issued',
  to: 'client@example.com',
  subject: 'Invoice LKA/2026-27/0007',
  body: 'Please find attached.',
  pdfBase64: PDF,
  ...over,
});

describe('send-invoice-email function', () => {
  it('requires a signed-in user with a role', async () => {
    expect((await handler(post('send-invoice-email', body()))).status).toBe(401);
    expect((await handler(post('send-invoice-email', body(), noRoleToken))).status).toBe(403);
  });

  it('validates the payload and invoice status', async () => {
    expect((await handler(post('send-invoice-email', body({ to: 'a@b.com, c@d.com' }), staffToken))).status).toBe(400);
    expect((await handler(post('send-invoice-email', body({ subject: 'x\r\nBcc: evil@x.com' }), staffToken))).status).toBe(400);
    expect((await handler(post('send-invoice-email', body({ pdfBase64: Buffer.from('hello').toString('base64') }), staffToken))).status).toBe(400);
    expect((await handler(post('send-invoice-email', body({ invoiceId: 'inv-draft' }), staffToken))).status).toBe(409);
    expect((await handler(post('send-invoice-email', body({ invoiceId: 'missing' }), staffToken))).status).toBe(404);
  });

  it('sends the PDF as an attachment and writes the audit log', async () => {
    const res = await handler(post('send-invoice-email', body(), staffToken));
    expect(res.status).toBe(200);
    const msg = received.at(-1)!;
    expect(msg).toContain('To: client@example.com');
    expect(msg).toContain('Reply-To: office@example.com');
    expect(msg).toContain('Content-Type: application/pdf');
    expect(msg).toContain('filename=LKA-2026-27-0007_Sri-Rama-Traders.pdf');

    const log = await adminDb().collection('auditLog').where('invoiceId', '==', 'inv-issued').get();
    const entry = log.docs.map((d) => d.data()).find((d) => d.action === 'SEND_EMAIL')!;
    expect(entry.details).toMatchObject({ channel: 'email', recipient: 'client@example.com' });
    expect(entry.userEmail).toBe('mailer@example.com');
    expect(entry.at).toBeTruthy();
  });
});

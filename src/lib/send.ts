// Sending invoices, reminders and receipts through the user's own email /
// WhatsApp. On phones the share sheet opens with the PDF attached; on
// computers the PDF downloads and a ready-written message opens.
import { writeBatch, type Firestore } from 'firebase/firestore';
import { appendAudit, type Actor } from '../data/audit';
import type { InvoiceRow } from '../data/invoices';
import { invoiceMessage, type MessageKind } from './messages';
import { todayIST } from './fy';
import type { FirmSettings } from './types';
import { normaliseWhatsapp } from './validation';

export type Channel = 'email' | 'whatsapp';

export interface SendResult {
  message: string; // what to tell the user
  href: string; // the email / WhatsApp link, to open again
}

const SUBJECT: Record<MessageKind, (n: string, firm: string) => string> = {
  invoice: (n, firm) => `Invoice ${n} from ${firm}`,
  reminder: (n, firm) => `Payment reminder: invoice ${n} from ${firm}`,
  receipt: (n, firm) => `Payment receipt for invoice ${n} from ${firm}`,
};

/** Open the email or WhatsApp app, attaching a PDF when given. Returns null if the user cancelled the share sheet. */
export async function deliver(opts: {
  channel: Channel;
  email: string;
  whatsapp: string;
  subject: string;
  text: string;
  file?: { blob: Blob; fileName: string };
}): Promise<{ method: 'share-sheet' | 'download' | 'link'; href: string } | null> {
  const wa = normaliseWhatsapp(opts.whatsapp);
  const href =
    opts.channel === 'whatsapp'
      ? `https://wa.me/${wa ?? ''}?text=${encodeURIComponent(opts.text)}`
      : `mailto:${encodeURIComponent(opts.email)}?subject=${encodeURIComponent(opts.subject)}&body=${encodeURIComponent(
          opts.file ? `${opts.text}\n\n(PDF attached: ${opts.file.fileName})` : opts.text,
        )}`;
  let method: 'share-sheet' | 'download' | 'link' = opts.file ? 'download' : 'link';
  if (opts.file) {
    const f = new File([opts.file.blob], opts.file.fileName, { type: 'application/pdf' });
    if (navigator.canShare?.({ files: [f] })) {
      try {
        await navigator.share({ files: [f], title: opts.subject, text: opts.text });
        method = 'share-sheet';
      } catch (e) {
        if ((e as Error).name === 'AbortError') return null;
        // Sharing blocked by the browser: fall back to download.
      }
    }
    if (method === 'download') {
      const { downloadBlob } = await import('../pdf/generate');
      downloadBlob(opts.file.blob, opts.file.fileName);
    }
  }
  if (method !== 'share-sheet') {
    if (opts.channel === 'whatsapp') window.open(href, '_blank', 'noopener');
    else window.location.href = href;
  }
  return { method, href };
}

/** Send an invoice (PDF), a payment reminder (text) or a receipt (PDF), and log it. */
export async function sendDocument(opts: {
  db: Firestore;
  actor: Actor;
  inv: InvoiceRow;
  settings: FirmSettings;
  channel: Channel;
  kind: MessageKind;
}): Promise<SendResult | null> {
  const { db, actor, inv, settings, channel, kind } = opts;
  const firmName = (inv.firm ?? settings).name;
  const number = inv.number ?? 'DRAFT';
  const text = invoiceMessage(kind, inv, settings, todayIST());
  let file: { blob: Blob; fileName: string } | undefined;
  if (kind === 'invoice') {
    const { generateInvoicePdf } = await import('../pdf/generate');
    file = await generateInvoicePdf(inv, settings);
  } else if (kind === 'receipt') {
    const { generateReceiptPdf } = await import('../pdf/generate');
    file = await generateReceiptPdf(inv, settings);
  }
  const res = await deliver({ channel, email: inv.client.email, whatsapp: inv.client.whatsapp, subject: SUBJECT[kind](number, firmName), text, file });
  if (!res) return null;
  const wa = normaliseWhatsapp(inv.client.whatsapp);
  const batch = writeBatch(db);
  appendAudit(db, batch, actor, inv.id, inv.number ?? null, channel === 'email' ? 'SEND_EMAIL' : 'SEND_WHATSAPP', {
    kind,
    channel,
    recipient: channel === 'email' ? inv.client.email : wa ? `+${wa}` : '',
    method: res.method,
  });
  await batch.commit();
  const what = kind === 'invoice' ? 'Invoice' : kind === 'receipt' ? 'Receipt' : 'Reminder';
  let message: string;
  if (res.method === 'share-sheet') message = `${what} shared with the PDF attached.`;
  else if (res.method === 'link')
    message = channel === 'email' ? `${what} email opened in your mail app: check and send.` : `${what} opened in WhatsApp${wa ? ` for +${wa}` : ''}: check and send.`;
  else
    message =
      channel === 'email'
        ? `${what} PDF downloaded (${file!.fileName}). Your email app opened with the message ready: attach the PDF and send.`
        : `${what} PDF downloaded (${file!.fileName}). WhatsApp opened${wa ? ` for +${wa}` : ' (choose the contact)'}: attach the PDF and send.`;
  return { message, href: res.href };
}

// Lazily-loaded PDF generation (keeps @react-pdf out of the main bundle).
import { pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { createElement } from 'react';
import { invoiceFileName } from '../lib/fy';
import { paiseToDecimal } from '../lib/csv';
import type { FirmSettings, Invoice } from '../lib/types';
import { InvoicePdf } from './InvoicePdf';

/**
 * UPI "pay" link for the invoice amount (works with GPay, PhonePe, Paytm, BHIM…).
 * Only for unpaid invoices when a UPI ID is set.
 */
export function upiPayLink(invoice: Invoice, settings: FirmSettings): string | null {
  const firm = invoice.firm ?? settings;
  const upi = firm.bank.upiId?.trim();
  if (!upi || invoice.status === 'PAID' || invoice.status === 'CANCELLED') return null;
  if (invoice.totals.grandTotalPaise <= 0) return null;
  const params = new URLSearchParams({
    pa: upi,
    pn: firm.name,
    am: paiseToDecimal(invoice.totals.grandTotalPaise),
    cu: 'INR',
    tn: `Invoice ${invoice.number ?? ''}`.trim(),
  });
  return `upi://pay?${params.toString().replace(/\+/g, '%20')}`;
}

export async function generateInvoicePdf(
  invoice: Invoice,
  settings: FirmSettings,
): Promise<{ blob: Blob; fileName: string }> {
  const link = upiPayLink(invoice, settings);
  const qrDataUrl = link ? await QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'M' }) : null;
  const blob = await pdf(createElement(InvoicePdf, { invoice, settings, qrDataUrl }) as Parameters<typeof pdf>[0]).toBlob();
  return { blob, fileName: invoiceFileName(invoice.number ?? 'DRAFT', invoice.client.name) };
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

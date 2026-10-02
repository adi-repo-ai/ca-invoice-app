// Re-exported for callers that import it from here.
export { upiPayLink } from '../lib/messages';
// Lazily-loaded PDF generation (keeps @react-pdf out of the main bundle).
import { pdf } from '@react-pdf/renderer';
import QRCode from 'qrcode';
import { createElement } from 'react';
import { invoiceFileName } from '../lib/fy';
import { upiPayLink } from '../lib/messages';
import type { FirmSettings, Invoice } from '../lib/types';
import { InvoicePdf } from './InvoicePdf';
import { ReceiptPdf } from './ReceiptPdf';
import { StatementPdf, type StatementData } from './StatementPdf';

export async function generateInvoicePdf(
  invoice: Invoice,
  settings: FirmSettings,
): Promise<{ blob: Blob; fileName: string }> {
  const link = upiPayLink(invoice, settings);
  const qrDataUrl = link ? await QRCode.toDataURL(link, { margin: 1, width: 240, errorCorrectionLevel: 'M' }) : null;
  const blob = await pdf(createElement(InvoicePdf, { invoice, settings, qrDataUrl, upiLink: link }) as Parameters<typeof pdf>[0]).toBlob();
  return { blob, fileName: invoiceFileName(invoice.number ?? 'DRAFT', invoice.client.name) };
}

export async function generateReceiptPdf(invoice: Invoice, settings: FirmSettings): Promise<{ blob: Blob; fileName: string }> {
  const blob = await pdf(createElement(ReceiptPdf, { invoice, settings }) as Parameters<typeof pdf>[0]).toBlob();
  return { blob, fileName: invoiceFileName(`Receipt-${invoice.number ?? ''}`, invoice.client.name) };
}

export async function generateStatementPdf(data: StatementData, settings: FirmSettings): Promise<{ blob: Blob; fileName: string }> {
  const blob = await pdf(createElement(StatementPdf, { data, settings }) as Parameters<typeof pdf>[0]).toBlob();
  return { blob, fileName: invoiceFileName(`Statement-${data.from}-to-${data.to}`, data.client.name) };
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

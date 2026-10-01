// A4 tax-invoice layout rendered entirely in the browser with @react-pdf.
// Uses the built-in Helvetica font (no font downloads); amounts are prefixed
// with "Rs." because Helvetica has no ₹ glyph.
import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import { formatPaise } from '../lib/money';
import type { FirmSettings, FirmSnapshot, Invoice } from '../lib/types';

const rs = (p: number) => `Rs. ${formatPaise(p)}`;
const pct = (bp: number) => `${bp / 100}%`;

function makeStyles(brand: string) {
  return StyleSheet.create({
    page: { padding: 32, paddingBottom: 56, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937' },
    header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: brand, paddingBottom: 10 },
    firmBlock: { flexDirection: 'row', maxWidth: '62%' },
    logo: { width: 70, maxHeight: 70, objectFit: 'contain', marginRight: 10 },
    firmName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: brand, marginBottom: 1 },
    tagline: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#374151', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 },
    proprietor: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: '#374151', marginBottom: 3 },
    muted: { color: '#4b5563' },
    titleBlock: { alignItems: 'flex-end' },
    title: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: brand, marginBottom: 6, letterSpacing: 1 },
    metaRow: { flexDirection: 'row', marginBottom: 2 },
    metaLabel: { width: 70, color: '#4b5563', textAlign: 'right', marginRight: 6 },
    metaValue: { fontFamily: 'Helvetica-Bold' },
    section: { flexDirection: 'row', marginTop: 14, gap: 12 },
    box: { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 3, padding: 8 },
    boxTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: brand, textTransform: 'uppercase', marginBottom: 4 },
    bold: { fontFamily: 'Helvetica-Bold' },
    table: { marginTop: 14, borderWidth: 1, borderColor: '#e5e7eb' },
    th: { flexDirection: 'row', backgroundColor: brand, color: '#ffffff', fontFamily: 'Helvetica-Bold', paddingVertical: 5 },
    tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingVertical: 5 },
    cNo: { width: '6%', paddingHorizontal: 4 },
    cDesc: { width: '44%', paddingHorizontal: 4 },
    cSac: { width: '12%', paddingHorizontal: 4 },
    cQty: { width: '8%', paddingHorizontal: 4, textAlign: 'right' },
    cRate: { width: '15%', paddingHorizontal: 4, textAlign: 'right' },
    cAmt: { width: '15%', paddingHorizontal: 4, textAlign: 'right' },
    cWide: { width: '85%', paddingHorizontal: 4 },
    totalsWrap: { flexDirection: 'row', marginTop: 10, gap: 12 },
    words: { flex: 1, padding: 8, backgroundColor: '#f9fafb', borderRadius: 3 },
    totals: { width: 220 },
    tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, paddingHorizontal: 6 },
    grand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 6, marginTop: 3, backgroundColor: brand, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11 },
    terms: { color: '#374151', lineHeight: 1.35 },
    footer: { position: 'absolute', bottom: 22, left: 32, right: 32, borderTopWidth: 1, borderTopColor: '#e5e7eb', paddingTop: 6, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: '#6b7280' },
    watermark: { position: 'absolute', top: 330, left: 60, fontSize: 80, color: '#dc2626', opacity: 0.12, transform: 'rotate(-30deg)', fontFamily: 'Helvetica-Bold' },
  });
}

export interface InvoicePdfProps {
  invoice: Invoice;
  settings: FirmSettings; // for logo, brand colour and (fallback) firm details
}

export function InvoicePdf({ invoice: inv, settings }: InvoicePdfProps) {
  const s = makeStyles(settings.brandColor);
  const firm: FirmSnapshot = inv.firm ?? settings;
  const t = inv.totals;
  const intra = inv.taxType === 'INTRA';
  const contact = [firm.phone, firm.email, firm.website].filter(Boolean).join('  |  ');

  return (
    <Document title={inv.number ?? 'Invoice'} author={firm.name} creator={firm.name}>
      <Page size="A4" style={s.page}>
        {inv.status === 'CANCELLED' && <Text style={s.watermark} fixed>CANCELLED</Text>}

        <View style={s.header}>
          <View style={s.firmBlock}>
            {settings.logoDataUrl && <Image src={settings.logoDataUrl} style={s.logo} />}
            <View>
              <Text style={s.firmName}>{firm.name}</Text>
              {firm.tagline ? <Text style={s.tagline}>{firm.tagline}</Text> : null}
              {firm.proprietor ? <Text style={s.proprietor}>{firm.proprietor}</Text> : null}
              <Text style={s.muted}>{firm.address}</Text>
              {contact ? <Text style={s.muted}>{contact}</Text> : null}
              <Text style={{ marginTop: 3 }}>
                {firm.gstin ? `GSTIN: ${firm.gstin}   ` : ''}
                {firm.pan ? `PAN: ${firm.pan}` : ''}
              </Text>
            </View>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>TAX INVOICE</Text>
            {(
              [
                ['Invoice No.', inv.number ?? 'DRAFT'],
                ['Invoice Date', inv.invoiceDate],
                ['Due Date', inv.dueDate],
                ['Reverse Charge', 'No'],
              ] as const
            ).map(([k, v]) => (
              <View key={k} style={s.metaRow}>
                <Text style={s.metaLabel}>{k}</Text>
                <Text style={s.metaValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={s.section}>
          <View style={s.box}>
            <Text style={s.boxTitle}>Bill to</Text>
            <Text style={s.bold}>{inv.client.name}</Text>
            {inv.client.contactPerson ? <Text>Attn: {inv.client.contactPerson}</Text> : null}
            <Text style={s.muted}>{inv.client.address}</Text>
            {inv.client.gstin ? <Text>GSTIN: {inv.client.gstin}</Text> : <Text style={s.muted}>Unregistered (no GSTIN)</Text>}
            {inv.client.pan ? <Text>PAN: {inv.client.pan}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.boxTitle}>GST details</Text>
            <Text>
              Place of supply: <Text style={s.bold}>{inv.client.stateName} ({inv.client.stateCode})</Text>
            </Text>
            <Text>
              Supplier state: {firm.stateName} ({firm.stateCode})
            </Text>
            <Text>Tax type: {intra ? `CGST ${pct(inv.gstRateBp / 2)} + SGST ${pct(inv.gstRateBp / 2)}` : `IGST ${pct(inv.gstRateBp)}`}</Text>
          </View>
        </View>

        <View style={s.table}>
          <View style={s.th} fixed>
            <Text style={s.cNo}>#</Text>
            <Text style={s.cDesc}>Description of service</Text>
            <Text style={s.cSac}>SAC</Text>
            <Text style={s.cQty}>Qty</Text>
            <Text style={s.cRate}>Rate</Text>
            <Text style={s.cAmt}>Amount</Text>
          </View>
          {inv.items.map((it, i) => (
            <View key={i} style={s.tr} wrap={false}>
              <Text style={s.cNo}>{i + 1}</Text>
              <Text style={s.cDesc}>{it.description}</Text>
              <Text style={s.cSac}>{it.sac}</Text>
              <Text style={s.cQty}>{it.qty}</Text>
              <Text style={s.cRate}>{formatPaise(it.ratePaise)}</Text>
              <Text style={s.cAmt}>{formatPaise(it.amountPaise)}</Text>
            </View>
          ))}
        </View>

        {inv.reimbursements.length > 0 && (
          <View style={s.table}>
            <View style={s.th}>
              <Text style={s.cNo}>#</Text>
              <Text style={{ ...s.cWide, width: '79%' }}>Reimbursement of expenses paid on your behalf (not subject to GST)</Text>
              <Text style={s.cAmt}>Amount</Text>
            </View>
            {inv.reimbursements.map((r, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={s.cNo}>{i + 1}</Text>
                <Text style={{ ...s.cWide, width: '79%' }}>{r.description}</Text>
                <Text style={s.cAmt}>{formatPaise(r.amountPaise)}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={s.totalsWrap} wrap={false}>
          <View style={s.words}>
            <Text style={s.boxTitle}>Amount in words</Text>
            <Text style={s.bold}>{inv.amountInWords}</Text>
          </View>
          <View style={s.totals}>
            <View style={s.tRow}>
              <Text>Taxable value</Text>
              <Text>{rs(t.taxablePaise)}</Text>
            </View>
            {intra ? (
              <>
                <View style={s.tRow}>
                  <Text>CGST @ {pct(inv.gstRateBp / 2)}</Text>
                  <Text>{rs(t.cgstPaise)}</Text>
                </View>
                <View style={s.tRow}>
                  <Text>SGST @ {pct(inv.gstRateBp / 2)}</Text>
                  <Text>{rs(t.sgstPaise)}</Text>
                </View>
              </>
            ) : (
              <View style={s.tRow}>
                <Text>IGST @ {pct(inv.gstRateBp)}</Text>
                <Text>{rs(t.igstPaise)}</Text>
              </View>
            )}
            {t.reimbursementsPaise !== 0 && (
              <View style={s.tRow}>
                <Text>Reimbursements</Text>
                <Text>{rs(t.reimbursementsPaise)}</Text>
              </View>
            )}
            {t.roundOffPaise !== 0 && (
              <View style={s.tRow}>
                <Text>Round off</Text>
                <Text>{rs(t.roundOffPaise)}</Text>
              </View>
            )}
            <View style={s.grand}>
              <Text>Grand total</Text>
              <Text>{rs(t.grandTotalPaise)}</Text>
            </View>
          </View>
        </View>

        <View style={s.section} wrap={false}>
          <View style={s.box}>
            <Text style={s.boxTitle}>Bank details</Text>
            {firm.bank.accountName ? <Text>A/c name: {firm.bank.accountName}</Text> : null}
            {firm.bank.accountNumber ? <Text>A/c no.: {firm.bank.accountNumber}</Text> : null}
            {firm.bank.ifsc ? <Text>IFSC: {firm.bank.ifsc}</Text> : null}
            {firm.bank.branch ? <Text>Branch: {firm.bank.branch}</Text> : null}
            {firm.bank.upiId ? <Text style={{ marginTop: 3 }}>UPI: <Text style={s.bold}>{firm.bank.upiId}</Text></Text> : null}
          </View>
          <View style={[s.box, { flex: 1.4 }]}>
            <Text style={s.boxTitle}>Terms</Text>
            {inv.terms.split('\n').map((line, i) => (
              <Text key={i} style={s.terms}>
                {line || ' '}
              </Text>
            ))}
            {inv.status === 'CANCELLED' && inv.cancelReason ? (
              <Text style={{ marginTop: 4, color: '#dc2626' }}>Cancelled: {inv.cancelReason}</Text>
            ) : null}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>Computer-generated invoice. No signature required.</Text>
          <Text render={({ pageNumber, totalPages }) => `${inv.number ?? ''}  ·  Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

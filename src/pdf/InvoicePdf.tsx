// A4 invoice layout rendered entirely in the browser with @react-pdf.
// Uses the built-in Helvetica font (no font downloads); amounts are prefixed
// with "Rs." because Helvetica has no ₹ glyph.
//
// The title is always "INVOICE". When GST is switched off in Settings there are
// no tax lines; when it is on a single "GST @ x%" line is shown.
import { Document, Font, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { formatPaise } from '../lib/money';
import type { FirmSettings, FirmSnapshot, Invoice } from '../lib/types';

const rs = (p: number) => `Rs. ${formatPaise(p)}`;
const pct = (bp: number) => `${bp / 100}%`;
const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

// Never hyphenate words (e.g. firm names) when wrapping.
Font.registerHyphenationCallback((word) => [word]);

/** Multi-line text as one Text per line (a raw "\n" renders with a large gap). */
function Lines({ text, style }: { text: string; style?: Style | Style[] }) {
  return (
    <>
      {text.split('\n').map((line, i) => (
        <Text key={i} style={style}>
          {line || ' '}
        </Text>
      ))}
    </>
  );
}

const INK = '#111827';
const MUTED = '#4b5563';
const LINE = '#e5e7eb';

function makeStyles(brand: string) {
  return StyleSheet.create({
    page: { paddingTop: 34, paddingHorizontal: 36, paddingBottom: 70, fontSize: 9, fontFamily: 'Helvetica', color: INK },
    // ---- header ----
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    firmBlock: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, paddingRight: 16 },
    logo: { width: 62, height: 62, objectFit: 'contain', marginRight: 14 },
    firmText: { flex: 1 },
    firmDetails: { marginTop: 4, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: LINE },
    detailLine: { color: MUTED, marginBottom: 2 },
    firmName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: brand, marginBottom: 4 },
    tagline: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: brand, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 6 },
    proprietor: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3 },
    muted: { color: MUTED },
    titleBlock: { width: 168 },
    title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: brand, letterSpacing: 2, textAlign: 'right', marginBottom: 8 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
    metaLabel: { color: MUTED },
    metaValue: { fontFamily: 'Helvetica-Bold' },
    rule: { height: 2, backgroundColor: brand, marginTop: 12, marginBottom: 12 },
    // ---- boxes ----
    row: { flexDirection: 'row', gap: 12 },
    box: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
    boxTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: brand, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
    bold: { fontFamily: 'Helvetica-Bold' },
    clientName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
    payBox: { width: 290, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
    payRow: { flexDirection: 'row', gap: 10 },
    qr: { width: 66, height: 66 },
    qrCaption: { fontSize: 6.5, color: MUTED, textAlign: 'center', marginTop: 2, width: 66 },
    // ---- tables ----
    table: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
    th: { flexDirection: 'row', backgroundColor: brand, color: '#ffffff', fontFamily: 'Helvetica-Bold', paddingVertical: 6 },
    tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE, paddingVertical: 6 },
    cNo: { width: '6%', paddingHorizontal: 6 },
    cDesc: { width: '46%', paddingHorizontal: 6 },
    cSac: { width: '12%', paddingHorizontal: 6 },
    cQty: { width: '8%', paddingHorizontal: 6, textAlign: 'right' },
    cRate: { width: '14%', paddingHorizontal: 6, textAlign: 'right' },
    cAmt: { width: '14%', paddingHorizontal: 6, textAlign: 'right' },
    cWide: { width: '80%', paddingHorizontal: 6 },
    // ---- totals ----
    totalsWrap: { flexDirection: 'row', marginTop: 12, gap: 12 },
    words: { flex: 1, padding: 10, backgroundColor: '#f3f4f6', borderRadius: 4 },
    totals: { width: 230 },
    tRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 8 },
    grand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, paddingHorizontal: 8, marginTop: 4, backgroundColor: brand, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11, borderRadius: 3 },
    // ---- notes / signature / terms ----
    notes: { marginTop: 12, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
    text: { color: '#374151', marginBottom: 1 },
    bottom: { marginTop: 'auto', paddingTop: 16 },
    bottomRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
    signWrap: { paddingTop: 28 },
    signBlock: { width: 210, alignItems: 'center' },
    signImg: { height: 40, maxWidth: 170, objectFit: 'contain', marginVertical: 4 },
    signSpace: { height: 36 },
    signLine: { borderTopWidth: 1, borderTopColor: INK, width: 170, marginTop: 2, paddingTop: 3, alignItems: 'center' },
    terms: { marginTop: 14, paddingTop: 8, borderTopWidth: 1, borderTopColor: LINE },
    // ---- footer ----
    footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
    band: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, backgroundColor: brand },
    watermark: { position: 'absolute', top: 330, left: 60, fontSize: 80, color: '#dc2626', opacity: 0.12, transform: 'rotate(-30deg)', fontFamily: 'Helvetica-Bold' },
  });
}

export interface InvoicePdfProps {
  invoice: Invoice;
  settings: FirmSettings; // for logo, signature, brand colour and (fallback) firm details
  qrDataUrl?: string | null; // UPI payment QR code
}

export function InvoicePdf({ invoice: inv, settings, qrDataUrl }: InvoicePdfProps) {
  const s = makeStyles(settings.brandColor);
  const firm: FirmSnapshot = inv.firm ?? settings;
  const t = inv.totals;
  const gst = inv.taxType !== 'NONE';
  const contact = [firm.phone, firm.email, firm.website].filter(Boolean).join('  |  ');
  const ids = [firm.gstin ? `GSTIN: ${firm.gstin}` : '', firm.pan ? `PAN: ${firm.pan}` : ''].filter(Boolean).join('    ');
  const year = (inv.invoiceDate || '').slice(0, 4);
  const signatory = firm.signatoryName ?? settings.signatoryName;
  const showSignature = inv.includeSignature !== false;
  const hasBank = Boolean(firm.bank.accountNumber || firm.bank.upiId);

  const meta: [string, string][] = [
    ['Invoice No.', inv.number ?? 'DRAFT'],
    ['Invoice Date', fmtDate(inv.invoiceDate)],
    ['Due Date', fmtDate(inv.dueDate)],
  ];

  return (
    <Document title={inv.number ?? 'Invoice'} author={firm.name} creator={firm.name}>
      <Page size="A4" style={s.page}>
        {inv.status === 'CANCELLED' && <Text style={s.watermark} fixed>CANCELLED</Text>}

        {/* Header: firm on the left, invoice title + details on the right */}
        <View style={s.header}>
          <View style={s.firmBlock}>
            {settings.logoDataUrl && <Image src={settings.logoDataUrl} style={s.logo} />}
            <View style={s.firmText}>
              <Text style={s.firmName}>{firm.name}</Text>
              {firm.tagline ? <Text style={s.tagline}>{firm.tagline}</Text> : null}
              {firm.proprietor ? <Text style={s.proprietor}>{firm.proprietor}</Text> : null}
              <View style={s.firmDetails}>
                <Lines text={firm.address} style={s.detailLine} />
                {contact ? <Text style={[s.detailLine, { marginTop: 3 }]}>{contact}</Text> : null}
                {ids ? <Text style={{ marginTop: 3 }}>{ids}</Text> : null}
              </View>
            </View>
          </View>
          <View style={s.titleBlock}>
            <Text style={s.title}>INVOICE</Text>
            {meta.map(([k, v]) => (
              <View key={k} style={s.metaRow}>
                <Text style={s.metaLabel}>{k}</Text>
                <Text style={s.metaValue}>{v}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.rule} />

        {/* Bill to */}
        <View style={s.row}>
          <View style={s.box}>
            <Text style={s.boxTitle}>Bill to</Text>
            <Text style={s.clientName}>{inv.client.name}</Text>
            {inv.client.contactPerson ? <Text>Attn: {inv.client.contactPerson}</Text> : null}
            {inv.client.address ? <Lines text={inv.client.address} style={s.muted} /> : null}
            {inv.client.gstin ? <Text style={{ marginTop: 3 }}>GSTIN: {inv.client.gstin}</Text> : null}
            {inv.client.pan ? <Text>PAN: {inv.client.pan}</Text> : null}
            {inv.client.stateName ? (
              <Text style={{ marginTop: 3 }}>
                Place of supply: <Text style={s.bold}>{inv.client.stateName}</Text>
              </Text>
            ) : null}
          </View>
        </View>

        {/* Services */}
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
              <Text style={s.cWide}>Reimbursement of expenses paid on your behalf</Text>
              <Text style={s.cAmt}>Amount</Text>
            </View>
            {inv.reimbursements.map((r, i) => (
              <View key={i} style={s.tr} wrap={false}>
                <Text style={s.cNo}>{i + 1}</Text>
                <Text style={s.cWide}>{r.description}</Text>
                <Text style={s.cAmt}>{formatPaise(r.amountPaise)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Amount in words + totals */}
        <View style={s.totalsWrap} wrap={false}>
          <View style={s.words}>
            <Text style={s.boxTitle}>Amount in words</Text>
            <Text style={s.bold}>{inv.amountInWords}</Text>
          </View>
          <View style={s.totals}>
            <View style={s.tRow}>
              <Text>Total Amount</Text>
              <Text>{rs(gst ? t.taxablePaise : t.taxablePaise + t.reimbursementsPaise)}</Text>
            </View>
            {gst && (
              <View style={s.tRow}>
                <Text>GST @ {pct(inv.gstRateBp)}</Text>
                <Text>{rs(t.taxPaise)}</Text>
              </View>
            )}
            {gst && t.reimbursementsPaise !== 0 && (
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
              <Text>Total Invoice Value</Text>
              <Text>{rs(t.grandTotalPaise)}</Text>
            </View>
          </View>
        </View>

        {inv.notes ? (
          <View style={s.notes} wrap={false}>
            <Text style={s.boxTitle}>Notes</Text>
            <Lines text={inv.notes} style={s.text} />
          </View>
        ) : null}

        {inv.status === 'CANCELLED' && inv.cancelReason ? (
          <Text style={{ marginTop: 8, color: '#dc2626' }}>Cancelled: {inv.cancelReason}</Text>
        ) : null}

        {/* Bottom: payment details + signature, then terms */}
        <View style={s.bottom} wrap={false}>
          <View style={s.bottomRow}>
            {(hasBank || qrDataUrl) && (
              <View style={s.payBox}>
                <Text style={s.boxTitle}>Payment details</Text>
                <View style={s.payRow}>
                  <View style={{ flex: 1 }}>
                    {firm.bank.accountName ? <Text>A/c name: {firm.bank.accountName}</Text> : null}
                    {firm.bank.accountNumber ? <Text>A/c no.: {firm.bank.accountNumber}</Text> : null}
                    {firm.bank.ifsc ? <Text>IFSC: {firm.bank.ifsc}</Text> : null}
                    {firm.bank.branch ? <Text>Branch: {firm.bank.branch}</Text> : null}
                    {firm.bank.upiId ? (
                      <Text style={{ marginTop: 3 }}>
                        UPI: <Text style={s.bold}>{firm.bank.upiId}</Text>
                      </Text>
                    ) : null}
                  </View>
                  {qrDataUrl ? (
                    <View>
                      <Image src={qrDataUrl} style={s.qr} />
                      <Text style={s.qrCaption}>Scan to pay via UPI</Text>
                    </View>
                  ) : null}
                </View>
              </View>
            )}
            <View style={{ flex: 1 }} />
            {/* Signature (only when "Show signature" is on for this invoice) */}
            {showSignature && (
              <View style={s.signWrap}>
                <View style={s.signBlock}>
                  <Text style={s.bold}>For {firm.name}</Text>
                  {settings.signatureDataUrl ? <Image src={settings.signatureDataUrl} style={s.signImg} /> : <View style={s.signSpace} />}
                  <View style={s.signLine}>
                    {signatory ? <Text style={s.bold}>{signatory}</Text> : null}
                    <Text style={s.muted}>Authorised Signatory</Text>
                  </View>
                </View>
              </View>
            )}
          </View>
          {/* Terms at the bottom */}
          {inv.terms ? (
            <View style={s.terms}>
              <Text style={s.boxTitle}>Terms &amp; conditions</Text>
              <Lines text={inv.terms} style={s.text} />
            </View>
          ) : null}
        </View>

        <View style={s.footer} fixed>
          <Text>
            © {year} {firm.name}. All rights reserved.
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Computer-generated invoice · ${inv.number ?? ''} · Page ${pageNumber} of ${totalPages}`} />
        </View>
        <View style={s.band} fixed />
      </Page>
    </Document>
  );
}

// A4 payment receipt for a paid invoice.
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { FirmSettings, Invoice } from '../lib/types';
import { amountInWords } from '../lib/words';
import { FirmHeader, FooterBand, LINE, Lines, MUTED, baseStyles, fmtDate, rs } from './common';

export function ReceiptPdf({ invoice: inv, settings }: { invoice: Invoice; settings: FirmSettings }) {
  const brand = settings.brandColor;
  const s = baseStyles(brand);
  const x = StyleSheet.create({
    row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: LINE },
    total: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: brand, color: '#ffffff', fontFamily: 'Helvetica-Bold', fontSize: 11, borderRadius: 3, marginTop: 6 },
    table: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
    words: { marginTop: 12, padding: 10, backgroundColor: '#f3f4f6', borderRadius: 4 },
    thanks: { marginTop: 18, fontSize: 10, color: MUTED },
  });
  const firm = inv.firm ?? settings;
  const p = inv.payment!;
  const settled = p.amountPaise + p.tdsPaise;
  const rows: [string, string][] = [
    ['Against invoice', inv.number ?? ''],
    ['Invoice date', fmtDate(inv.invoiceDate)],
    ['Invoice amount', rs(inv.totals.grandTotalPaise)],
    ['Payment mode', p.mode],
    ...(p.reference ? ([['Reference / UTR', p.reference]] as [string, string][]) : []),
    ['Amount received', rs(p.amountPaise)],
    ...(p.tdsPaise ? ([['TDS deducted by client', rs(p.tdsPaise)]] as [string, string][]) : []),
  ];
  return (
    <Document title={`Receipt ${inv.number ?? ''}`} author={firm.name} creator={firm.name}>
      <Page size="A4" style={s.page}>
        <Text style={[s.watermark, { color: '#16a34a' }]} fixed>
          PAID
        </Text>
        <FirmHeader
          firm={firm}
          settings={settings}
          brand={brand}
          title="RECEIPT"
          meta={[
            ['Receipt No.', `R-${inv.number ?? ''}`],
            ['Payment date', fmtDate(p.date)],
          ]}
        />
        <View style={[s.box, { flexGrow: 0, flexBasis: 'auto' }]}>
          <Text style={s.boxTitle}>Received with thanks from</Text>
          <Text style={s.clientName}>{inv.client.name}</Text>
          {inv.client.contactPerson ? <Text>Attn: {inv.client.contactPerson}</Text> : null}
          {inv.client.address ? <Lines text={inv.client.address} style={s.muted} /> : null}
          {inv.client.gstin ? <Text style={{ marginTop: 3 }}>GSTIN: {inv.client.gstin}</Text> : null}
        </View>
        <View style={x.table}>
          {rows.map(([k, v]) => (
            <View key={k} style={x.row}>
              <Text style={s.muted}>{k}</Text>
              <Text style={s.bold}>{v}</Text>
            </View>
          ))}
        </View>
        <View style={x.total}>
          <Text>Total settled</Text>
          <Text>{rs(settled)}</Text>
        </View>
        <View style={x.words}>
          <Text style={s.boxTitle}>Amount in words</Text>
          <Text style={s.bold}>{amountInWords(settled)}</Text>
        </View>
        <Text style={x.thanks}>Thank you for your payment. This is a computer-generated receipt and needs no signature.</Text>
        <FooterBand firmName={firm.name} year={p.date.slice(0, 4)} note={`Receipt for invoice ${inv.number ?? ''}`} brand={brand} />
      </Page>
    </Document>
  );
}

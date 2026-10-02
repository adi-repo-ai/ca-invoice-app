// A4 statement of account for one client: invoices, payments and balance.
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { ClientSnapshot, FirmSettings, Invoice } from '../lib/types';
import { FirmHeader, FooterBand, LINE, Lines, baseStyles, fmtDate, rs } from './common';

export interface StatementData {
  client: ClientSnapshot;
  from: string;
  to: string;
  invoices: Invoice[]; // ISSUED / PAID / CANCELLED in the period, oldest first
  generatedOn: string;
}

export function StatementPdf({ data, settings }: { data: StatementData; settings: FirmSettings }) {
  const brand = settings.brandColor;
  const s = baseStyles(brand);
  const x = StyleSheet.create({
    table: { marginTop: 14, borderWidth: 1, borderColor: LINE, borderRadius: 4 },
    th: { flexDirection: 'row', backgroundColor: brand, color: '#ffffff', fontFamily: 'Helvetica-Bold', paddingVertical: 6 },
    tr: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: LINE, paddingVertical: 5 },
    cDate: { width: '13%', paddingHorizontal: 6 },
    cDoc: { width: '33%', paddingHorizontal: 6 },
    cAmt: { width: '18%', paddingHorizontal: 6, textAlign: 'right' },
    summary: { flexDirection: 'row', gap: 10, marginTop: 14 },
    sumBox: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
    sumVal: { fontSize: 12, fontFamily: 'Helvetica-Bold', marginTop: 2 },
  });
  // Ledger lines: each invoice is a debit; each payment (incl. TDS) is a credit.
  type Line = { date: string; doc: string; debit: number; credit: number };
  const lines: Line[] = [];
  for (const inv of data.invoices) {
    if (inv.status === 'CANCELLED') continue;
    lines.push({ date: inv.invoiceDate, doc: `Invoice ${inv.number}`, debit: inv.totals.grandTotalPaise, credit: 0 });
    if (inv.payment) {
      lines.push({ date: inv.payment.date, doc: `Payment (${inv.payment.mode}) for ${inv.number}`, debit: 0, credit: inv.payment.amountPaise });
      if (inv.payment.tdsPaise) lines.push({ date: inv.payment.date, doc: `TDS deducted for ${inv.number}`, debit: 0, credit: inv.payment.tdsPaise });
    }
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit);
  let bal = 0;
  const billed = lines.reduce((t, l) => t + l.debit, 0);
  const received = lines.reduce((t, l) => t + l.credit, 0);
  const firm = settings;
  return (
    <Document title={`Statement ${data.client.name}`} author={firm.name} creator={firm.name}>
      <Page size="A4" style={s.page}>
        <FirmHeader
          firm={firm}
          settings={settings}
          brand={brand}
          title="STATEMENT"
          meta={[
            ['Period from', fmtDate(data.from)],
            ['Period to', fmtDate(data.to)],
            ['Generated on', fmtDate(data.generatedOn)],
          ]}
        />
        <View style={[s.box, { flexGrow: 0, flexBasis: 'auto' }]}>
          <Text style={s.boxTitle}>Statement of account for</Text>
          <Text style={s.clientName}>{data.client.name}</Text>
          {data.client.address ? <Lines text={data.client.address} style={s.muted} /> : null}
          {data.client.gstin ? <Text style={{ marginTop: 3 }}>GSTIN: {data.client.gstin}</Text> : null}
        </View>
        <View style={x.summary}>
          <View style={x.sumBox}>
            <Text style={s.boxTitle}>Total billed</Text>
            <Text style={x.sumVal}>{rs(billed)}</Text>
          </View>
          <View style={x.sumBox}>
            <Text style={s.boxTitle}>Total received</Text>
            <Text style={x.sumVal}>{rs(received)}</Text>
          </View>
          <View style={[x.sumBox, { borderColor: brand }]}>
            <Text style={s.boxTitle}>Balance due</Text>
            <Text style={[x.sumVal, { color: billed - received > 0 ? '#b91c1c' : '#15803d' }]}>{rs(billed - received)}</Text>
          </View>
        </View>
        <View style={x.table}>
          <View style={x.th} fixed>
            <Text style={x.cDate}>Date</Text>
            <Text style={x.cDoc}>Particulars</Text>
            <Text style={x.cAmt}>Billed</Text>
            <Text style={x.cAmt}>Received</Text>
            <Text style={x.cAmt}>Balance</Text>
          </View>
          {lines.length === 0 ? (
            <View style={x.tr}>
              <Text style={{ paddingHorizontal: 6 }}>No invoices in this period.</Text>
            </View>
          ) : (
            lines.map((l, i) => {
              bal += l.debit - l.credit;
              return (
                <View key={i} style={x.tr} wrap={false}>
                  <Text style={x.cDate}>{fmtDate(l.date)}</Text>
                  <Text style={x.cDoc}>{l.doc}</Text>
                  <Text style={x.cAmt}>{l.debit ? rs(l.debit) : ''}</Text>
                  <Text style={x.cAmt}>{l.credit ? rs(l.credit) : ''}</Text>
                  <Text style={[x.cAmt, s.bold]}>{rs(bal)}</Text>
                </View>
              );
            })
          )}
        </View>
        <FooterBand firmName={firm.name} year={data.generatedOn.slice(0, 4)} note={`Statement for ${data.client.name}`} brand={brand} />
      </Page>
    </Document>
  );
}

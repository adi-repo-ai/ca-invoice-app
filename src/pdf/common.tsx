// Shared pieces for all PDFs (invoice, receipt, statement): same header,
// footer and colours so every document looks like it comes from the firm.
import { Font, Image, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import { formatPaise } from '../lib/money';
import type { FirmSettings, FirmSnapshot } from '../lib/types';

export const rs = (p: number) => `Rs. ${formatPaise(p)}`;
export const pct = (bp: number) => `${bp / 100}%`;
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};

// Never hyphenate words (e.g. firm names) when wrapping.
Font.registerHyphenationCallback((word) => [word]);

/** Multi-line text as one Text per line (a raw "\n" renders with a large gap). */
export function Lines({ text, style }: { text: string; style?: Style | Style[] }) {
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

export const INK = '#111827';
export const MUTED = '#4b5563';
export const LINE = '#e5e7eb';

export function baseStyles(brand: string) {
  return StyleSheet.create({
    page: { paddingTop: 34, paddingHorizontal: 36, paddingBottom: 70, fontSize: 9, fontFamily: 'Helvetica', color: INK },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    firmBlock: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, paddingRight: 16 },
    logo: { width: 62, height: 62, objectFit: 'contain', marginRight: 14 },
    firmText: { flex: 1 },
    firmDetails: { marginTop: 4, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: LINE },
    detailLine: { color: MUTED, marginBottom: 2 },
    firmName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: brand, marginBottom: 4 },
    tagline: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: brand, letterSpacing: 1.6, textTransform: 'uppercase', marginBottom: 6 },
    proprietor: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: INK, marginBottom: 3 },
    titleBlock: { width: 178 },
    title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: brand, letterSpacing: 2, textAlign: 'right', marginBottom: 8 },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, borderBottomWidth: 0.5, borderBottomColor: LINE },
    metaLabel: { color: MUTED },
    metaValue: { fontFamily: 'Helvetica-Bold' },
    rule: { height: 2, backgroundColor: brand, marginTop: 12, marginBottom: 12 },
    box: { flex: 1, borderWidth: 1, borderColor: LINE, borderRadius: 4, padding: 10 },
    boxTitle: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: brand, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 },
    bold: { fontFamily: 'Helvetica-Bold' },
    muted: { color: MUTED },
    clientName: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
    footer: { position: 'absolute', bottom: 22, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', fontSize: 7.5, color: MUTED },
    band: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 12, backgroundColor: brand },
    watermark: { position: 'absolute', top: 330, left: 90, fontSize: 90, opacity: 0.1, transform: 'rotate(-30deg)', fontFamily: 'Helvetica-Bold' },
  });
}

/** Firm logo + name + address on the left, document title + meta rows on the right. */
export function FirmHeader({ firm, settings, title, meta, brand }: { firm: FirmSnapshot; settings: FirmSettings; title: string; meta: [string, string][]; brand: string }) {
  const s = baseStyles(brand);
  const contact = [firm.phone, firm.email, firm.website].filter(Boolean).join('  |  ');
  const ids = [firm.gstin ? `GSTIN: ${firm.gstin}` : '', firm.pan ? `PAN: ${firm.pan}` : ''].filter(Boolean).join('    ');
  return (
    <>
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
          <Text style={s.title}>{title}</Text>
          {meta.map(([k, v]) => (
            <View key={k} style={s.metaRow}>
              <Text style={s.metaLabel}>{k}</Text>
              <Text style={s.metaValue}>{v}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={s.rule} />
    </>
  );
}

export function FooterBand({ firmName, year, note, brand }: { firmName: string; year: string; note: string; brand: string }) {
  const s = baseStyles(brand);
  return (
    <>
      <View style={s.footer} fixed>
        <Text>
          © {year} {firmName}. All rights reserved.
        </Text>
        <Text render={({ pageNumber, totalPages }) => `${note} · Page ${pageNumber} of ${totalPages}`} />
      </View>
      <View style={s.band} fixed />
    </>
  );
}

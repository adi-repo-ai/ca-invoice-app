// Amount in words using the Indian numbering system (thousand, lakh, crore).

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen',
  'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  const t = TENS[Math.floor(n / 10)];
  const o = ONES[n % 10];
  return o ? `${t}-${o}` : t;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (r) parts.push(twoDigits(r));
  return parts.join(' ');
}

/** Integer -> words in Indian numbering. 0 -> "Zero". */
export function numberToIndianWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error('expected a non-negative integer');
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1_00_00_000);
  const lakh = Math.floor((n % 1_00_00_000) / 1_00_000);
  const thousand = Math.floor((n % 1_00_000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${numberToIndianWords(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
}

/** 12345678 paise -> "Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only" */
export function amountInWords(paise: number): string {
  if (!Number.isSafeInteger(paise) || paise < 0) throw new Error('expected non-negative integer paise');
  const rupees = Math.floor(paise / 100);
  const p = paise % 100;
  let s = `Rupees ${numberToIndianWords(rupees)}`;
  if (p) s += ` and ${twoDigits(p)} Paise`;
  return `${s} Only`;
}

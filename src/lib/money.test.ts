import { describe, expect, it } from 'vitest';
import { formatPaise, paiseToInput, parseRupeesToPaise } from './money';
import { isValidGstin, isValidPan, normaliseWhatsapp } from './validation';

describe('money', () => {
  it('parses rupee strings to integer paise without floats', () => {
    expect(parseRupeesToPaise('1,23,456.78')).toBe(12345678);
    expect(parseRupeesToPaise('0.1')).toBe(10);
    expect(parseRupeesToPaise('19.99')).toBe(1999);
    expect(parseRupeesToPaise('₹ 500')).toBe(50000);
    expect(parseRupeesToPaise('1.234')).toBeNull();
    expect(parseRupeesToPaise('abc')).toBeNull();
  });

  it('formats paise Indian-style', () => {
    expect(formatPaise(12345678)).toBe('1,23,456.78');
    expect(formatPaise(1234567800)).toBe('1,23,45,678.00');
    expect(formatPaise(-33)).toBe('-0.33');
    expect(paiseToInput(150050)).toBe('1500.50');
  });
});

describe('validation', () => {
  it('validates GSTIN format', () => {
    expect(isValidGstin('36AABCU9603R1ZM')).toBe(true);
    expect(isValidGstin('36AABCU9603R1Z')).toBe(false);
    expect(isValidGstin('36aabcu9603r1zm')).toBe(false);
  });
  it('validates PAN', () => {
    expect(isValidPan('AABCU9603R')).toBe(true);
    expect(isValidPan('AABCU9603')).toBe(false);
  });
  it('normalises WhatsApp numbers', () => {
    expect(normaliseWhatsapp('98765 43210')).toBe('919876543210');
    expect(normaliseWhatsapp('+91 98765-43210')).toBe('919876543210');
    expect(normaliseWhatsapp('09876543210')).toBe('919876543210');
    expect(normaliseWhatsapp('12345')).toBeNull();
  });
});

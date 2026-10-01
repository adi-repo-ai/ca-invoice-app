import { describe, expect, it } from 'vitest';
import { amountInWords, numberToIndianWords } from './words';

describe('amount in words (Indian numbering)', () => {
  it.each([
    [0, 'Zero'],
    [7, 'Seven'],
    [15, 'Fifteen'],
    [40, 'Forty'],
    [99, 'Ninety-Nine'],
    [100, 'One Hundred'],
    [101, 'One Hundred One'],
    [1000, 'One Thousand'],
    [11800, 'Eleven Thousand Eight Hundred'],
    [100000, 'One Lakh'],
    [123456, 'One Lakh Twenty-Three Thousand Four Hundred Fifty-Six'],
    [1000000, 'Ten Lakh'],
    [10000000, 'One Crore'],
    [12345678, 'One Crore Twenty-Three Lakh Forty-Five Thousand Six Hundred Seventy-Eight'],
    [1000000000, 'One Hundred Crore'],
    [99999999999, 'Nine Thousand Nine Hundred Ninety-Nine Crore Ninety-Nine Lakh Ninety-Nine Thousand Nine Hundred Ninety-Nine'],
  ])('%i -> %s', (n, words) => {
    expect(numberToIndianWords(n)).toBe(words);
  });

  it('adds Rupees / Paise / Only', () => {
    expect(amountInWords(12345678)).toBe(
      'Rupees One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight Paise Only',
    );
    expect(amountInWords(1180000)).toBe('Rupees Eleven Thousand Eight Hundred Only');
    expect(amountInWords(5)).toBe('Rupees Zero and Five Paise Only');
  });

  it('rejects negatives and non-integers', () => {
    expect(() => amountInWords(-1)).toThrow();
    expect(() => amountInWords(1.5)).toThrow();
  });
});

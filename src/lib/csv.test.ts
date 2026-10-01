import { describe, expect, it } from 'vitest';
import { paiseToDecimal, toCsv } from './csv';

describe('csv', () => {
  it('escapes quotes, commas and newlines and blocks formulas', () => {
    expect(toCsv(['a', 'b'], [['x,y', 'say "hi"'], ['=SUM(A1)', -33]])).toBe(
      'a,b\r\n"x,y","say ""hi"""\r\n\'=SUM(A1),-33\r\n',
    );
  });
  it('formats paise as decimals', () => {
    expect(paiseToDecimal(123450)).toBe('1234.50');
    expect(paiseToDecimal(-33)).toBe('-0.33');
  });
});

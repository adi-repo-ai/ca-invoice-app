import { describe, expect, it } from 'vitest';
import { parseCsv } from './csv';
import { parseClientCsv } from './clientImport';

describe('parseCsv', () => {
  it('handles quotes, commas and newlines inside quotes, CRLF and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"multi\nline",z\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['multi\nline', 'z'],
    ]);
  });
});

describe('parseClientCsv', () => {
  it('maps headings, normalises fields and reports bad rows', () => {
    const csv = [
      'Client Name,Mobile,State,GSTIN,PAN,Tags,Email',
      'Sri Rama Traders,9876543210,Telangana,36AAAFS1234K1Z2,AAAFS1234K,GST; Business,rama@example.com',
      'Bad Row,123,Telangana,NOTAGSTIN,,,',
      ',9876543210,,,,,',
      'Plain Person,,,,,,',
    ].join('\n');
    const r = parseClientCsv(csv, '36');
    expect(r.clients).toHaveLength(2);
    expect(r.clients[0]).toMatchObject({ name: 'Sri Rama Traders', whatsapp: '919876543210', stateCode: '36', tags: ['GST', 'Business'] });
    expect(r.clients[1]).toMatchObject({ name: 'Plain Person', stateCode: '36', stateName: 'Telangana' });
    expect(r.problems).toHaveLength(2);
    expect(r.problems[0]).toMatch(/Row 3 \(Bad Row\): invalid GSTIN, invalid mobile/);
  });

  it('needs a Name column', () => {
    expect(parseClientCsv('Foo,Bar\n1,2').problems[0]).toMatch(/Name/);
  });
});

import { describe, expect, it } from 'vitest';
import { isTestHost } from './siteEnv';

describe('isTestHost', () => {
  it('flags branch deploys and deploy previews', () => {
    expect(isTestHost('staging--lingeshwarca-invoice.netlify.app')).toBe(true);
    expect(isTestHost('deploy-preview-12--lingeshwarca-invoice.netlify.app')).toBe(true);
  });
  it('does not flag the live site or local development', () => {
    expect(isTestHost('lingeshwarca-invoice.netlify.app')).toBe(false);
    expect(isTestHost('invoices.example.in')).toBe(false);
    expect(isTestHost('localhost')).toBe(false);
  });
});

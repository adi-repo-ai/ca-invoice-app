import { beforeEach, describe, expect, it, vi } from 'vitest';

const getDocs = vi.fn();
vi.mock('firebase/firestore', async (orig) => {
  const real = await orig<typeof import('firebase/firestore')>();
  return {
    ...real,
    collection: vi.fn(() => ({})),
    query: vi.fn((...a: unknown[]) => a),
    where: vi.fn(() => 'where'),
    orderBy: vi.fn(() => 'orderBy'),
    limit: vi.fn(() => 'limit'),
    startAfter: vi.fn(() => 'startAfter'),
    getDocs: (...a: unknown[]) => getDocs(...a),
  };
});

const { listClientsByTag } = await import('./clients');
const doc = (id: string, name: string) => ({ id, data: () => ({ name, nameLower: name.toLowerCase(), tags: ['GST'] }) });
const indexError = Object.assign(new Error('The query requires an index. That index is currently building'), { code: 'failed-precondition' });

describe('listClientsByTag', () => {
  beforeEach(() => getDocs.mockReset());

  it('uses the indexed query when the index is ready', async () => {
    getDocs.mockResolvedValueOnce({ docs: [doc('a', 'Alpha')] });
    const r = await listClientsByTag({} as never, 'GST', null);
    expect(r.rows.map((x) => x.name)).toEqual(['Alpha']);
    expect(getDocs).toHaveBeenCalledTimes(1);
  });

  it('falls back to an unindexed query sorted A–Z while the index is building', async () => {
    getDocs.mockRejectedValueOnce(indexError).mockResolvedValueOnce({ docs: [doc('b', 'Zeta'), doc('a', 'alpha'), doc('c', 'Mid')] });
    const r = await listClientsByTag({} as never, 'GST', null);
    expect(r.rows.map((x) => x.name)).toEqual(['alpha', 'Mid', 'Zeta']);
    expect(r.hasMore).toBe(false);
  });

  it('does not hide other errors', async () => {
    getDocs.mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'permission-denied' }));
    await expect(listClientsByTag({} as never, 'GST', null)).rejects.toThrow('denied');
  });
});

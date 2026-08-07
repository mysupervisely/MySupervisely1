import { accessStorage } from './accessStorage';
import type { AccessRecord } from '../models/access';

function makeRecord(overrides: Partial<AccessRecord> = {}): AccessRecord {
  return { token: 'tok-1', verifiedAt: '2026-01-01T09:00:00.000Z', ...overrides };
}

beforeEach(async () => {
  await accessStorage.clear();
});

describe('accessStorage', () => {
  test('getRecord returns null when nothing has been stored', async () => {
    expect(await accessStorage.getRecord()).toBeNull();
  });

  test('setRecord then getRecord round-trips the exact record', async () => {
    const record = makeRecord({ plan: 'qbank', expiresAt: '2026-02-01T00:00:00.000Z' });
    await accessStorage.setRecord(record);
    expect(await accessStorage.getRecord()).toEqual(record);
  });

  test('setRecord overwrites any previously stored record — only one entitlement cached at a time', async () => {
    await accessStorage.setRecord(makeRecord({ token: 'tok-1' }));
    await accessStorage.setRecord(makeRecord({ token: 'tok-2' }));
    expect((await accessStorage.getRecord())?.token).toBe('tok-2');
  });

  test('clear removes the stored record', async () => {
    await accessStorage.setRecord(makeRecord());
    await accessStorage.clear();
    expect(await accessStorage.getRecord()).toBeNull();
  });
});

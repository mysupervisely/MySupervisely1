import {
  computeOfflineFallbackState,
  computeStateForValidRecord,
  createAccessService,
  grantsPlan,
  isExpired,
  isStaleForOffline,
} from './accessService';
import { accessConfig } from '../constants/accessConfig';
import type { AccessClient, AccessClientError, CheckAccessResult, VerifySessionResult } from '../api/accessClient';
import type { AccessRecord } from '../models/access';

const NOW = new Date('2026-01-15T12:00:00.000Z');

function makeRecord(overrides: Partial<AccessRecord> = {}): AccessRecord {
  return { token: 'tok-1', verifiedAt: '2026-01-15T09:00:00.000Z', ...overrides };
}

// ---- Pure decision functions ----

describe('isExpired', () => {
  test('never expired when expiresAt is undefined (today\'s real backend never sets it)', () => {
    expect(isExpired(makeRecord(), NOW)).toBe(false);
  });

  test('expired once expiresAt is in the past', () => {
    expect(isExpired(makeRecord({ expiresAt: '2026-01-01T00:00:00.000Z' }), NOW)).toBe(true);
  });

  test('treated as expired exactly at the boundary (<=), not after', () => {
    expect(isExpired(makeRecord({ expiresAt: NOW.toISOString() }), NOW)).toBe(true);
  });

  test('not expired while expiresAt is still in the future', () => {
    expect(isExpired(makeRecord({ expiresAt: '2026-02-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('isStaleForOffline', () => {
  test('not stale immediately after verification', () => {
    expect(isStaleForOffline(makeRecord({ verifiedAt: NOW.toISOString() }), NOW)).toBe(false);
  });

  test('not stale just under MAX_OFFLINE_TRUST_MS', () => {
    const verifiedAt = new Date(NOW.getTime() - accessConfig.MAX_OFFLINE_TRUST_MS + 1000).toISOString();
    expect(isStaleForOffline(makeRecord({ verifiedAt }), NOW)).toBe(false);
  });

  test('stale once past MAX_OFFLINE_TRUST_MS', () => {
    const verifiedAt = new Date(NOW.getTime() - accessConfig.MAX_OFFLINE_TRUST_MS - 1000).toISOString();
    expect(isStaleForOffline(makeRecord({ verifiedAt }), NOW)).toBe(true);
  });
});

describe('grantsPlan', () => {
  test('an undefined plan (today\'s real backend) grants every plan', () => {
    const record = makeRecord();
    expect(grantsPlan(record, 'course')).toBe(true);
    expect(grantsPlan(record, 'qbank')).toBe(true);
    expect(grantsPlan(record, 'bundle')).toBe(true);
  });

  test('a bundle plan grants every plan', () => {
    const record = makeRecord({ plan: 'bundle' });
    expect(grantsPlan(record, 'course')).toBe(true);
    expect(grantsPlan(record, 'qbank')).toBe(true);
  });

  test('a specific plan grants only itself, not the other single plan', () => {
    const qbankRecord = makeRecord({ plan: 'qbank' });
    expect(grantsPlan(qbankRecord, 'qbank')).toBe(true);
    expect(grantsPlan(qbankRecord, 'course')).toBe(false);
  });
});

describe('computeStateForValidRecord', () => {
  test('granted, with the given source, when not expired', () => {
    expect(computeStateForValidRecord(makeRecord(), NOW, 'network')).toEqual({
      status: 'granted',
      record: makeRecord(),
      source: 'network',
    });
  });

  test('expired takes priority over granted', () => {
    const record = makeRecord({ expiresAt: '2026-01-01T00:00:00.000Z' });
    expect(computeStateForValidRecord(record, NOW, 'cache')).toEqual({ status: 'expired', record });
  });
});

describe('computeOfflineFallbackState', () => {
  test('granted from cache when recently verified and not expired', () => {
    const record = makeRecord({ verifiedAt: NOW.toISOString() });
    expect(computeOfflineFallbackState(record, NOW)).toEqual({ status: 'granted', record, source: 'cache' });
  });

  test('expired still takes priority over staleness', () => {
    const record = makeRecord({ expiresAt: '2026-01-01T00:00:00.000Z' });
    expect(computeOfflineFallbackState(record, NOW)).toEqual({ status: 'expired', record });
  });

  test('stale once the cache is older than MAX_OFFLINE_TRUST_MS', () => {
    const verifiedAt = new Date(NOW.getTime() - accessConfig.MAX_OFFLINE_TRUST_MS - 1000).toISOString();
    const record = makeRecord({ verifiedAt });
    expect(computeOfflineFallbackState(record, NOW)).toEqual({ status: 'stale', record });
  });
});

// ---- The composed AccessService, against a mocked client + storage ----

function makeMockStorage() {
  let record: AccessRecord | null = null;
  return {
    getRecord: jest.fn(async () => record),
    setRecord: jest.fn(async (r: AccessRecord) => {
      record = r;
    }),
    clear: jest.fn(async () => {
      record = null;
    }),
    _peek: () => record,
  };
}

type MockAccessClient = {
  checkAccess: (token: string) => Promise<CheckAccessResult>;
  verifySession: (sessionId: string) => Promise<VerifySessionResult>;
};

function mockClient(overrides: Partial<MockAccessClient> = {}): AccessClient {
  return { ...baseMockClient(), ...overrides } as AccessClient;
}

function baseMockClient(): MockAccessClient {
  return {
    checkAccess: jest.fn(async (): Promise<CheckAccessResult> => ({ ok: true, valid: true })),
    verifySession: jest.fn(async (): Promise<VerifySessionResult> => ({ ok: true, valid: true, token: 'new-token' })),
  };
}

describe('AccessService.verifyToken', () => {
  test('a valid token is cached and reported as granted', async () => {
    const storage = makeMockStorage();
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });

    const outcome = await service.verifyToken('tok-1');
    expect(outcome.ok).toBe(true);
    expect(outcome.ok && outcome.state.status).toBe('granted');
    expect(storage._peek()).toEqual({ token: 'tok-1', verifiedAt: NOW.toISOString() });
  });

  test('an invalid token clears any existing cached copy of that same token and reports none', async () => {
    const storage = makeMockStorage();
    await storage.setRecord({ token: 'tok-1', verifiedAt: '2026-01-01T00:00:00.000Z' });
    const client = mockClient({ checkAccess: jest.fn(async () => ({ ok: true as const, valid: false })) });
    const service = createAccessService({ client, storage, now: () => NOW });

    const outcome = await service.verifyToken('tok-1');
    expect(outcome.ok && outcome.state).toEqual({ status: 'none' });
    expect(storage._peek()).toBeNull();
  });

  test('a backend failure surfaces the typed error, without touching the cache', async () => {
    const storage = makeMockStorage();
    const error: AccessClientError = { kind: 'network', message: 'No connection.' };
    const client = mockClient({ checkAccess: jest.fn(async () => ({ ok: false as const, error })) });
    const service = createAccessService({ client, storage, now: () => NOW });

    const outcome = await service.verifyToken('tok-1');
    expect(outcome).toEqual({ ok: false, error });
    expect(storage.setRecord).not.toHaveBeenCalled();
  });
});

describe('AccessService.redeemStripeSession', () => {
  test('a valid session mints and caches the returned token', async () => {
    const storage = makeMockStorage();
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });

    const outcome = await service.redeemStripeSession('cs_123');
    expect(outcome.ok && outcome.state.status).toBe('granted');
    expect(storage._peek()?.token).toBe('new-token');
  });

  test('an unpaid/invalid session grants nothing and caches nothing', async () => {
    const storage = makeMockStorage();
    const client = mockClient({ verifySession: jest.fn(async () => ({ ok: true as const, valid: false })) });
    const service = createAccessService({ client, storage, now: () => NOW });

    const outcome = await service.redeemStripeSession('cs_bad');
    expect(outcome.ok && outcome.state).toEqual({ status: 'none' });
    expect(storage._peek()).toBeNull();
  });
});

describe('AccessService.getState (missing / cached access)', () => {
  test('missing access: no cached record at all reports none', async () => {
    const storage = makeMockStorage();
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });
    expect(await service.getState()).toEqual({ status: 'none' });
  });

  test('cached access: a cached, unexpired record reports granted from cache, with no network call', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord({ verifiedAt: NOW.toISOString() }));
    const client = mockClient();
    const service = createAccessService({ client, storage, now: () => NOW });

    const state = await service.getState();
    expect(state).toEqual({ status: 'granted', record: makeRecord({ verifiedAt: NOW.toISOString() }), source: 'cache' });
    expect(client.checkAccess).not.toHaveBeenCalled();
  });

  test('expired access: a cached record past its expiresAt reports expired', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord({ expiresAt: '2026-01-01T00:00:00.000Z' }));
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });

    expect((await service.getState()).status).toBe('expired');
  });
});

describe('AccessService.refresh (network revalidation, offline behavior, backend failures)', () => {
  test('missing access: refreshing with nothing cached reports none without calling the network', async () => {
    const storage = makeMockStorage();
    const client = mockClient();
    const service = createAccessService({ client, storage, now: () => NOW });

    expect(await service.refresh()).toEqual({ status: 'none' });
    expect(client.checkAccess).not.toHaveBeenCalled();
  });

  test('a successful revalidation updates verifiedAt and reports granted from network', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord({ verifiedAt: '2026-01-01T00:00:00.000Z' }));
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });

    const state = await service.refresh();
    expect(state.status).toBe('granted');
    expect(state.status === 'granted' && state.source).toBe('network');
    expect(storage._peek()?.verifiedAt).toBe(NOW.toISOString());
  });

  test('a token the backend now reports invalid is cleared and reported as none', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord());
    const client = mockClient({ checkAccess: jest.fn(async () => ({ ok: true as const, valid: false })) });
    const service = createAccessService({ client, storage, now: () => NOW });

    expect(await service.refresh()).toEqual({ status: 'none' });
    expect(storage._peek()).toBeNull();
  });

  test('offline behavior: a network failure falls back to the cached record as granted (within the trust window)', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord({ verifiedAt: NOW.toISOString() }));
    const client = mockClient({
      checkAccess: jest.fn(async (): Promise<CheckAccessResult> => ({ ok: false, error: { kind: 'network', message: 'offline' } })),
    });
    const service = createAccessService({ client, storage, now: () => NOW });

    const state = await service.refresh();
    expect(state).toEqual({ status: 'granted', record: makeRecord({ verifiedAt: NOW.toISOString() }), source: 'cache' });
  });

  test('offline behavior: a network failure against a too-old cache reports stale, not granted', async () => {
    const storage = makeMockStorage();
    const staleVerifiedAt = new Date(NOW.getTime() - accessConfig.MAX_OFFLINE_TRUST_MS - 1000).toISOString();
    await storage.setRecord(makeRecord({ verifiedAt: staleVerifiedAt }));
    const client = mockClient({
      checkAccess: jest.fn(async (): Promise<CheckAccessResult> => ({ ok: false, error: { kind: 'network', message: 'offline' } })),
    });
    const service = createAccessService({ client, storage, now: () => NOW });

    expect((await service.refresh()).status).toBe('stale');
  });

  test('backend failures: a 500-class error also falls back to cache, same as a network error', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord({ verifiedAt: NOW.toISOString() }));
    const client = mockClient({
      checkAccess: jest.fn(async (): Promise<CheckAccessResult> => ({ ok: false, error: { kind: 'backend', message: 'down' } })),
    });
    const service = createAccessService({ client, storage, now: () => NOW });

    expect((await service.refresh()).status).toBe('granted');
  });
});

describe('AccessService.hasAccess', () => {
  test('false with no cached access at all', async () => {
    const storage = makeMockStorage();
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });
    expect(await service.hasAccess('qbank')).toBe(false);
  });

  test('true when granted and the plan matches (or is unknown, granting everything)', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord({ verifiedAt: NOW.toISOString() }));
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });
    expect(await service.hasAccess('qbank')).toBe(true);
  });

  test('false once expired', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord({ expiresAt: '2026-01-01T00:00:00.000Z' }));
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });
    expect(await service.hasAccess('qbank')).toBe(false);
  });
});

describe('AccessService.clearAccess', () => {
  test('removes the cached record entirely', async () => {
    const storage = makeMockStorage();
    await storage.setRecord(makeRecord());
    const service = createAccessService({ client: mockClient(), storage, now: () => NOW });

    await service.clearAccess();
    expect(storage._peek()).toBeNull();
    expect(await service.getState()).toEqual({ status: 'none' });
  });
});

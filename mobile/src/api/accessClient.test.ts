import { createAccessClient } from './accessClient';

function mockFetch(response: { status: number; body: unknown } | Error) {
  return jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
    if (response instanceof Error) throw response;
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      json: async () => response.body,
    } as unknown as Response;
  });
}

describe('accessClient.checkAccess', () => {
  test('valid:true is passed through', async () => {
    const fetchImpl = mockFetch({ status: 200, body: { valid: true } });
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });

    const result = await client.checkAccess('tok-1');
    expect(result).toEqual({ ok: true, valid: true });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.test/api/check-access?token=tok-1');
  });

  test('valid:false is passed through', async () => {
    const fetchImpl = mockFetch({ status: 200, body: { valid: false } });
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    expect(await client.checkAccess('bad-token')).toEqual({ ok: true, valid: false });
  });

  test('network failure surfaces as kind: network', async () => {
    const fetchImpl = mockFetch(new TypeError('Network request failed'));
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    const result = await client.checkAccess('tok-1');
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('network');
  });

  test('a timed-out request surfaces as kind: timeout', async () => {
    const abortError = new Error('aborted');
    abortError.name = 'AbortError';
    const fetchImpl = mockFetch(abortError);
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    const result = await client.checkAccess('tok-1');
    expect(!result.ok && result.error.kind).toBe('timeout');
  });

  test('a non-2xx response surfaces as kind: backend, using the backend message when present', async () => {
    const fetchImpl = mockFetch({ status: 500, body: { error: 'Something broke' } });
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    const result = await client.checkAccess('tok-1');
    expect(!result.ok && result.error.kind).toBe('backend');
    expect(!result.ok && result.error.message).toBe('Something broke');
  });

  test('a response missing the valid field surfaces as kind: malformed', async () => {
    const fetchImpl = mockFetch({ status: 200, body: {} });
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    const result = await client.checkAccess('tok-1');
    expect(!result.ok && result.error.kind).toBe('malformed');
  });

  test('an unparsable body surfaces as kind: malformed', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    })) as unknown as typeof fetch;
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    const result = await client.checkAccess('tok-1');
    expect(!result.ok && result.error.kind).toBe('malformed');
  });
});

describe('accessClient.verifySession', () => {
  test('a paid session returns valid:true with the minted token', async () => {
    const fetchImpl = mockFetch({ status: 200, body: { valid: true, token: 'minted-token' } });
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });

    const result = await client.verifySession('cs_123');
    expect(result).toEqual({ ok: true, valid: true, token: 'minted-token' });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.test/api/verify-session?session_id=cs_123');
  });

  test('an unpaid session returns valid:false with no token', async () => {
    const fetchImpl = mockFetch({ status: 200, body: { valid: false } });
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    expect(await client.verifySession('cs_unpaid')).toEqual({ ok: true, valid: false, token: undefined });
  });

  test('backend failure surfaces as kind: backend', async () => {
    const fetchImpl = mockFetch({ status: 500, body: { error: 'Stripe not configured' } });
    const client = createAccessClient({ baseUrl: 'https://example.test', fetchImpl });
    const result = await client.verifySession('cs_123');
    expect(!result.ok && result.error.kind).toBe('backend');
  });
});

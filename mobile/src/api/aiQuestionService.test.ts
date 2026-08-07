import { buildGenerateQuestionPrompt, createAIQuestionService, parseGenerateQuestionResponse } from './aiQuestionService';
import type { GenerateAIQuestionParams } from './aiQuestionService';
import type { System } from '../models';

const SYSTEM: System = {
  key: 'cardio',
  label: 'Cardiovascular',
  description: 'Heart and vascular system',
  quizBrief: 'Focus on hypertension, heart failure, and anticoagulation.',
  isAnatomical: true,
  x: 10,
  y: 20,
  chip: false,
  available: true,
  lessonIds: [],
  source: 'content-export',
};

function baseParams(overrides: Partial<GenerateAIQuestionParams> = {}): GenerateAIQuestionParams {
  return { system: SYSTEM, domain: 3, ...overrides };
}

function anthropicResponse(text: string) {
  return { id: 'msg_1', content: [{ type: 'text', text }] };
}

function validQuestionJson(overrides: Record<string, unknown> = {}) {
  return {
    stem: 'A 62-year-old patient with HFrEF is started on which agent?',
    options: [
      { label: 'A', text: 'Sacubitril/valsartan' },
      { label: 'B', text: 'Diphenhydramine' },
      { label: 'C', text: 'Ibuprofen' },
      { label: 'D', text: 'Pseudoephedrine' },
    ],
    correctLabel: 'A',
    rationale: 'Sacubitril/valsartan is guideline-directed therapy for HFrEF.',
    ...overrides,
  };
}

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

describe('buildGenerateQuestionPrompt', () => {
  test('embeds system label, domain, and quizBrief, and demands raw JSON only', () => {
    const prompt = buildGenerateQuestionPrompt(baseParams());
    expect(prompt).toContain('Cardiovascular');
    expect(prompt).toContain('Domain 3');
    expect(prompt).toContain('Focus on hypertension, heart failure, and anticoagulation.');
    expect(prompt).toContain('RAW JSON ONLY');
    expect(prompt).toContain('stem');
    expect(prompt).toContain('correctLabel');
  });

  test('includes topic and difficulty lines only when provided', () => {
    const withoutExtras = buildGenerateQuestionPrompt(baseParams());
    expect(withoutExtras).not.toContain('Specific focus');
    expect(withoutExtras).not.toContain('Difficulty:');

    const withExtras = buildGenerateQuestionPrompt(
      baseParams({ topic: { title: 'Heart Failure', note: 'Focus on GDMT titration.' }, difficulty: 'hard' })
    );
    expect(withExtras).toContain('Heart Failure');
    expect(withExtras).toContain('Focus on GDMT titration.');
    expect(withExtras).toContain('Difficulty: hard');
  });
});

describe('parseGenerateQuestionResponse', () => {
  test('parses a valid response into a SingleAnswerQuestion tied to the request params', () => {
    const result = parseGenerateQuestionResponse(anthropicResponse(JSON.stringify(validQuestionJson())), baseParams());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.question.type).toBe('single');
    expect(result.question.domain).toBe(3);
    expect(result.question.systemKey).toBe('cardio');
    expect(result.question.correctLabel).toBe('A');
    expect(result.question.options).toHaveLength(4);
    expect(result.question.source).toEqual({ kind: 'ai', generatedAt: expect.any(String) });
    expect(result.question.id).toMatch(/^ai-/);
  });

  test('strips markdown code fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(validQuestionJson()) + '\n```';
    const result = parseGenerateQuestionResponse(anthropicResponse(fenced), baseParams());
    expect(result.ok).toBe(true);
  });

  test('uses the topic title as topicLabel when a topic was requested, else the system label', () => {
    const withTopic = parseGenerateQuestionResponse(
      anthropicResponse(JSON.stringify(validQuestionJson())),
      baseParams({ topic: { title: 'Heart Failure', note: '' } })
    );
    expect(withTopic.ok && withTopic.question.topicLabel).toBe('Heart Failure');

    const withoutTopic = parseGenerateQuestionResponse(anthropicResponse(JSON.stringify(validQuestionJson())), baseParams());
    expect(withoutTopic.ok && withoutTopic.question.topicLabel).toBe('Cardiovascular');
  });

  test('malformed: body has no content array', () => {
    const result = parseGenerateQuestionResponse({ id: 'msg_1' }, baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('malformed');
  });

  test('malformed: text is not valid JSON at all', () => {
    const result = parseGenerateQuestionResponse(anthropicResponse('Sure, here is a question about the heart.'), baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('malformed');
  });

  test('malformed: missing required fields', () => {
    const result = parseGenerateQuestionResponse(
      anthropicResponse(JSON.stringify({ stem: 'x' })),
      baseParams()
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('malformed');
  });

  test('malformed: correctLabel does not match any option label', () => {
    const result = parseGenerateQuestionResponse(
      anthropicResponse(JSON.stringify(validQuestionJson({ correctLabel: 'Z' }))),
      baseParams()
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('malformed');
  });

  test('malformed: fewer than 2 options', () => {
    const result = parseGenerateQuestionResponse(
      anthropicResponse(JSON.stringify(validQuestionJson({ options: [{ label: 'A', text: 'only one' }] }))),
      baseParams()
    );
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('malformed');
  });

  test('malformed: empty content text', () => {
    const result = parseGenerateQuestionResponse(anthropicResponse(''), baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('malformed');
  });
});

describe('AIQuestionService.generateQuestion (mocked backend)', () => {
  test('successful generation returns ok:true with a real question, calling the real endpoint shape', async () => {
    const fetchImpl = mockFetch({ status: 200, body: anthropicResponse(JSON.stringify(validQuestionJson())) });
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const result = await service.generateQuestion(baseParams());
    expect(result.ok).toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://example.test/api/generate-question');
    expect(init?.method).toBe('POST');
    const sentBody = JSON.parse(init?.body as string);
    expect(sentBody.messages).toHaveLength(1);
    expect(sentBody.messages[0].role).toBe('user');
    expect(typeof sentBody.max_tokens).toBe('number');
  });

  test('sends x-access-token header only when an access token is provided', async () => {
    const fetchImpl = mockFetch({ status: 200, body: anthropicResponse(JSON.stringify(validQuestionJson())) });
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    await service.generateQuestion(baseParams({ accessToken: 'secret-token' }));
    const [, initWithToken] = fetchImpl.mock.calls[0];
    expect((initWithToken?.headers as Record<string, string>)['x-access-token']).toBe('secret-token');

    fetchImpl.mockClear();
    await service.generateQuestion(baseParams({ accessToken: null }));
    const [, initWithoutToken] = fetchImpl.mock.calls[0];
    expect((initWithoutToken?.headers as Record<string, string>)['x-access-token']).toBeUndefined();
  });

  test('network failure surfaces as kind: network, with a safe user-facing message', async () => {
    const fetchImpl = mockFetch(new TypeError('Network request failed'));
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const result = await service.generateQuestion(baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('network');
    expect(!result.ok && result.error.message.length).toBeGreaterThan(0);
  });

  test('a timed-out request (AbortError) surfaces as kind: timeout', async () => {
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    const fetchImpl = mockFetch(abortError);
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const result = await service.generateQuestion(baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('timeout');
  });

  test('a 401 response surfaces as kind: unauthorized, without leaking backend internals', async () => {
    const fetchImpl = mockFetch({ status: 401, body: { error: 'Invalid or expired access token' } });
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const result = await service.generateQuestion(baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('unauthorized');
    expect(!result.ok && result.error.message).not.toContain('ANTHROPIC');
  });

  test('a non-401 backend error surfaces as kind: backend, using the backend-provided message', async () => {
    const fetchImpl = mockFetch({ status: 500, body: { error: 'AI generation failed' } });
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const result = await service.generateQuestion(baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('backend');
    expect(!result.ok && result.error.message).toBe('AI generation failed');
  });

  test('a backend error with no JSON error field still gets a safe generic message', async () => {
    const fetchImpl = mockFetch({ status: 500, body: {} });
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const result = await service.generateQuestion(baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('backend');
    expect(!result.ok && result.error.message.length).toBeGreaterThan(0);
  });

  test('an unparsable (non-JSON) body on a 2xx response surfaces as kind: malformed', async () => {
    const fetchImpl = jest.fn(async () => {
      return {
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('not json');
        },
      } as unknown as Response;
    });
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const result = await service.generateQuestion(baseParams());
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('malformed');
  });

  test('retries: a failed call does not leave the service unusable — a second call with the same params can still succeed', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => anthropicResponse(JSON.stringify(validQuestionJson())),
      } as unknown as Response);
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const first = await service.generateQuestion(baseParams());
    expect(first.ok).toBe(false);
    expect(!first.ok && first.error.kind).toBe('network');

    const retry = await service.generateQuestion(baseParams());
    expect(retry.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('retries: three consecutive failures followed by a success all resolve independently (no shared broken state)', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('fail 1'))
      .mockRejectedValueOnce(new TypeError('fail 2'))
      .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({ error: 'fail 3' }) } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => anthropicResponse(JSON.stringify(validQuestionJson())),
      } as unknown as Response);
    const service = createAIQuestionService({ baseUrl: 'https://example.test', fetchImpl });

    const results = [];
    for (let i = 0; i < 4; i++) {
      results.push(await service.generateQuestion(baseParams()));
    }
    expect(results.map((r) => r.ok)).toEqual([false, false, false, true]);
  });
});

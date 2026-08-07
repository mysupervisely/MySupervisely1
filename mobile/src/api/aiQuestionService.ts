import { API_BASE_URL } from './apiConfig';
import { aiQuestionConfig } from '../constants/aiQuestionConfig';
import { domainLabel } from '../constants/domains';
import type { QuestionDomain, SingleAnswerQuestion, System } from '../models';

/**
 * M8 — typed client for the existing `generate-question.mts` Netlify
 * function only (docs/MOBILE_MIGRATION_AUDIT.md §I). "Reuse the existing
 * Netlify function. Do NOT generate questions locally. Do NOT expose
 * Anthropic API keys." This file is responsible for API communication
 * only — building the request, calling the one real endpoint, parsing
 * and validating the response into a `Question` the rest of the app
 * already knows how to render. It never imports AsyncStorage or React;
 * caching (aiQuestionCacheStorage.ts) and UI are the caller's job, same
 * separation as every other service in this codebase.
 *
 * The backend is a thin, generic Anthropic proxy: it accepts
 * `{messages, max_tokens}`, pins the model server-side, and forwards the
 * *raw* Anthropic Messages API response back — it does not know what a
 * "NAPLEX question" is. All of the domain-specific work (building a
 * prompt that asks for one, and parsing/validating the model's answer)
 * happens here, client-side, matching the one real, audited prompt/
 * response contract (audit §I) — not a new, unvalidated shape.
 */

export type AIQuestionDifficulty = 'easy' | 'medium' | 'hard';

export type GenerateAIQuestionParams = {
  system: System;
  domain: QuestionDomain;
  /** Optional lesson-level narrowing within `system` — a `{title, note}` pair, not a full Lesson (only those two fields are used). */
  topic?: { title: string; note: string };
  difficulty?: AIQuestionDifficulty;
  /**
   * `x-access-token` gate (audit §G — "keeps API costs gated to paying
   * users"). This app has no purchase/entitlement flow yet (that's M10,
   * not built) so callers today pass `undefined`/`null`; the request is
   * still made for real and the backend's real 401 is what surfaces as
   * the `unauthorized` error below — not something faked client-side.
   */
  accessToken?: string | null;
};

export type AIQuestionServiceErrorKind =
  | 'network' // fetch itself failed (offline, DNS, connection refused)
  | 'timeout' // no response within aiQuestionConfig.REQUEST_TIMEOUT_MS
  | 'unauthorized' // 401 — missing/invalid/expired access token
  | 'backend' // any other non-2xx from generate-question.mts (its own errors, or an Anthropic-side failure it surfaced)
  | 'malformed'; // 2xx, but the body isn't the expected Anthropic shape, or the model's text isn't a valid question

export type AIQuestionServiceError = {
  kind: AIQuestionServiceErrorKind;
  /** Safe to show a student as-is — never includes a key, a stack trace, or raw backend internals. */
  message: string;
};

export type GenerateAIQuestionResult =
  | { ok: true; question: SingleAnswerQuestion }
  | { ok: false; error: AIQuestionServiceError };

function ok(question: SingleAnswerQuestion): GenerateAIQuestionResult {
  return { ok: true, question };
}
function fail(kind: AIQuestionServiceErrorKind, message: string): GenerateAIQuestionResult {
  return { ok: false, error: { kind, message } };
}

/**
 * The exact prompt shape the audit confirmed real and working: embeds
 * `system.label` + `system.quizBrief` (the "or" branch of "lesson.domain
 * + lesson.brief, OR system.label + system.quizBrief" — this app's
 * `Lesson` model has no `domain`/`brief` fields, confirmed absent at
 * M2), plus the NAPLEX domain and an optional topic/difficulty, and
 * demands raw JSON only in the one validated `{stem, options,
 * correctLabel, rationale}` single-answer shape. SATA/numeric generation
 * is out of scope for M8 — the audit only documents this one prompt/
 * response contract as real and working end to end; inventing an
 * unvalidated SATA/numeric prompt shape isn't "reusing the existing
 * backend," it's guessing at a new one.
 */
export function buildGenerateQuestionPrompt(params: GenerateAIQuestionParams): string {
  const lines = [
    'You are writing one NAPLEX-style pharmacy licensing exam practice question.',
    '',
    `Topic area: ${params.system.label}${params.topic ? ` — ${params.topic.title}` : ''}`,
    `NAPLEX Domain: ${params.domain} (${domainLabel(params.domain)})`,
  ];
  if (params.system.quizBrief) lines.push(`Content focus: ${params.system.quizBrief}`);
  if (params.topic?.note) lines.push(`Specific focus: ${params.topic.note}`);
  if (params.difficulty) lines.push(`Difficulty: ${params.difficulty}`);
  lines.push(
    '',
    'Write one single-best-answer multiple-choice question with exactly 4 answer options ' +
      '(labeled A-D), matching real NAPLEX clinical-reasoning style and depth.',
    '',
    'Respond with RAW JSON ONLY — no markdown code fences, no commentary before or after — in exactly this shape:',
    '{"stem": "...", "options": [{"label":"A","text":"..."},{"label":"B","text":"..."},{"label":"C","text":"..."},{"label":"D","text":"..."}], "correctLabel": "A", "rationale": "..."}'
  );
  return lines.join('\n');
}

type ParsedQuestionJson = {
  stem: string;
  options: { label: string; text: string }[];
  correctLabel: string;
  rationale: string;
};

/** Strips ```json / ``` fences the model sometimes wraps its answer in, despite being told not to — the same defensive step the audited web client already needed (audit §I). */
function stripCodeFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

function isValidParsedQuestion(value: unknown): value is ParsedQuestionJson {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.stem !== 'string' || candidate.stem.trim().length === 0) return false;
  if (typeof candidate.rationale !== 'string' || candidate.rationale.trim().length === 0) return false;
  if (typeof candidate.correctLabel !== 'string' || candidate.correctLabel.trim().length === 0) return false;
  if (!Array.isArray(candidate.options) || candidate.options.length < 2) return false;
  const options = candidate.options as unknown[];
  for (const option of options) {
    if (typeof option !== 'object' || option === null) return false;
    const optionRecord = option as Record<string, unknown>;
    if (typeof optionRecord.label !== 'string' || optionRecord.label.trim().length === 0) return false;
    if (typeof optionRecord.text !== 'string' || optionRecord.text.trim().length === 0) return false;
  }
  const labels = options.map((o) => (o as { label: string }).label);
  if (!labels.includes(candidate.correctLabel)) return false;
  return true;
}

/**
 * Extracts and validates a question from the raw Anthropic Messages API
 * response the backend forwards verbatim. Exported (alongside the prompt
 * builder above) specifically so tests can exercise malformed-response
 * handling without going through a real/mocked `fetch`.
 */
export function parseGenerateQuestionResponse(
  anthropicResponseBody: unknown,
  params: GenerateAIQuestionParams
): GenerateAIQuestionResult {
  if (typeof anthropicResponseBody !== 'object' || anthropicResponseBody === null) {
    return fail('malformed', "The AI service's response could not be read. Please try again.");
  }
  const body = anthropicResponseBody as { content?: unknown };
  if (!Array.isArray(body.content)) {
    return fail('malformed', "The AI service's response could not be read. Please try again.");
  }

  const text = body.content
    .filter((block): block is { type: string; text: string } => {
      return typeof block === 'object' && block !== null && (block as { type?: unknown }).type === 'text';
    })
    .map((block) => block.text)
    .join('')
    .trim();

  if (text.length === 0) {
    return fail('malformed', "The AI service's response was empty. Please try again.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(text));
  } catch {
    return fail('malformed', 'The generated question was not in a readable format. Please try again.');
  }

  if (!isValidParsedQuestion(parsed)) {
    return fail('malformed', 'The generated question was incomplete or invalid. Please try again.');
  }

  const question: SingleAnswerQuestion = {
    id: `ai-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: 'single',
    stem: parsed.stem,
    rationale: parsed.rationale,
    domain: params.domain,
    systemKey: params.system.key,
    topicLabel: params.topic?.title ?? params.system.label,
    source: { kind: 'ai', generatedAt: new Date().toISOString() },
    options: parsed.options,
    correctLabel: parsed.correctLabel,
  };
  return ok(question);
}

type FetchLike = typeof fetch;

export type AIQuestionServiceConfig = {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
};

/**
 * Factory rather than a bare singleton so tests can inject a mock
 * `fetchImpl`/`baseUrl`/`timeoutMs` without any global monkey-patching.
 * `aiQuestionService` below is the real, default-configured instance
 * every screen/hook actually uses.
 */
export function createAIQuestionService(config: AIQuestionServiceConfig = {}) {
  const baseUrl = config.baseUrl ?? API_BASE_URL;
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? aiQuestionConfig.REQUEST_TIMEOUT_MS;

  return {
    async generateQuestion(params: GenerateAIQuestionParams): Promise<GenerateAIQuestionResult> {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      let response: Response;
      try {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (params.accessToken) headers['x-access-token'] = params.accessToken;

        response = await fetchImpl(`${baseUrl}/api/generate-question`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            max_tokens: aiQuestionConfig.MAX_TOKENS,
            messages: [{ role: 'user', content: buildGenerateQuestionPrompt(params) }],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return fail('timeout', 'The request took too long. Check your connection and try again.');
        }
        return fail('network', 'No connection to the AI service. Check your network and try again.');
      } finally {
        clearTimeout(timeoutId);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return fail('malformed', "The AI service's response could not be read. Please try again.");
      }

      if (!response.ok) {
        const backendMessage =
          typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
            ? (body as { error: string }).error
            : undefined;

        if (response.status === 401) {
          return fail('unauthorized', 'AI practice requires an active QBank/course access. Please unlock access and try again.');
        }
        return fail('backend', backendMessage ?? 'The AI service could not generate a question right now. Please try again.');
      }

      return parseGenerateQuestionResponse(body, params);
    },
  };
}

export const aiQuestionService = createAIQuestionService();
export type AIQuestionService = ReturnType<typeof createAIQuestionService>;

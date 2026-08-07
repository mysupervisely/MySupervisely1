import { useCallback, useState } from 'react';

import { aiQuestionService } from '../api/aiQuestionService';
import { aiQuestionCacheStorage } from '../storage/aiQuestionCacheStorage';
import type { AIQuestionServiceError, GenerateAIQuestionParams } from '../api/aiQuestionService';
import type { SingleAnswerQuestion } from '../models';

export type GenerationStatus = 'idle' | 'loading' | 'error';

/**
 * M8 — the thin, side-effecting wiring around aiQuestionService, same
 * "hook is glue, logic lives in the service/storage layer" split as
 * every other hook in this app. Holds the in-flight/error UI state and,
 * on success, writes the question to aiQuestionCacheStorage before
 * handing it back to the caller (the setup screen) to navigate with.
 *
 * Deliberately no automatic retry loop here — a failed generation is a
 * real (potentially billed) AI API call; retrying is always an explicit
 * user action (`generate` called again with the same params), never
 * silent, see docs/M8_IMPLEMENTATION_NOTES.md.
 */
export function useAIQuestionGeneration() {
  const [status, setStatus] = useState<GenerationStatus>('idle');
  const [error, setError] = useState<AIQuestionServiceError | null>(null);

  const generate = useCallback(async (params: GenerateAIQuestionParams): Promise<SingleAnswerQuestion | null> => {
    setStatus('loading');
    setError(null);

    const result = await aiQuestionService.generateQuestion(params);
    if (!result.ok) {
      setStatus('error');
      setError(result.error);
      return null;
    }

    await aiQuestionCacheStorage.addQuestion(result.question);
    setStatus('idle');
    return result.question;
  }, []);

  return { status, error, isLoading: status === 'loading', generate };
}

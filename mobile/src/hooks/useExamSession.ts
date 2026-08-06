import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';

import {
  createExamSession,
  examSessionReducer,
  fromPersisted,
  isExpired,
  toPersisted,
  type ExamSessionState,
} from '../services/examSession';
import { computeExamResult } from '../services/examResultService';
import { contentRepository } from '../services/contentRepository';
import { examSessionStorage } from '../storage/examSessionStorage';
import { examResultsStorage } from '../storage/examResultsStorage';
import type { ExamResult } from '../models/examResult';
import type { ExamNumber } from '../models/exam';

const PERSIST_DEBOUNCE_MS = 400;

function generateResultId(): string {
  return `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * The dedicated Exam Session layer (M6). Deliberately its own hook, not a
 * variant of useQBankSession — see src/services/examSession.ts's doc
 * comment for why the underlying state shape had to differ from the
 * Question Engine's QBank usage, and what IS still reused from it
 * (scoring, answer-shape primitives).
 *
 * Handles: loading-or-creating a session on mount, resuming an
 * interrupted one (including auto-submitting immediately if it expired
 * while the app was closed), debounced persistence of every mutation, and
 * grading + permanently storing the result on submission.
 */
export function useExamSession(examNumber: ExamNumber) {
  const exam = useMemo(() => contentRepository.getExam(examNumber), [examNumber]);

  const [state, dispatch] = useReducer(
    examSessionReducer,
    examNumber,
    (n) => createExamSession(n, [], new Date())
  );
  const [isLoading, setIsLoading] = useState(true);
  const [justSubmittedResult, setJustSubmittedResult] = useState<ExamResult | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      if (!exam) {
        setIsLoading(false);
        return;
      }

      const persisted = await examSessionStorage.load(examNumber);
      if (cancelled) return;

      let initial: ExamSessionState = persisted
        ? fromPersisted(persisted, exam.questions)
        : createExamSession(examNumber, exam.questions, new Date());

      if (!persisted) {
        await examSessionStorage.save(toPersisted(initial));
      } else if (initial.status === 'in_progress' && isExpired(initial.startedAt, initial.durationSeconds, new Date())) {
        // The exam's 6-hour window closed while the app was closed/backgrounded —
        // don't resume into a session that's already over; submit it now,
        // same as if the live timer had ticked down to 0 while the screen was open.
        initial = examSessionReducer(initial, { type: 'SUBMIT_EXAM', now: new Date() });
        await examSessionStorage.save(toPersisted(initial));
        await examResultsStorage.saveResult(computeExamResult(initial, generateResultId()));
      }

      dispatch({ type: 'HYDRATE', state: initial });
      setIsLoading(false);
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [examNumber, exam]);

  // Debounced persistence — exam interactions include per-keystroke numeric
  // input, so writing on every single state change (rather than ~400ms
  // after activity settles) would mean an AsyncStorage write per character
  // typed. See docs/M6_IMPLEMENTATION_NOTES.md's Performance section for
  // the tradeoff this accepts (a few hundred ms of unsaved progress in the
  // worst case of an immediate app kill).
  useEffect(() => {
    if (isLoading || state.status === 'submitted') return;
    const timeout = setTimeout(() => {
      examSessionStorage.save(toPersisted(state)).catch(() => {});
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [state, isLoading]);

  const selectSingle = useCallback((label: string) => dispatch({ type: 'SELECT_SINGLE', label }), []);
  const toggleSata = useCallback((label: string) => dispatch({ type: 'TOGGLE_SATA', label }), []);
  const setNumeric = useCallback((text: string) => dispatch({ type: 'SET_NUMERIC', text }), []);
  const next = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const previous = useCallback(() => dispatch({ type: 'PREVIOUS' }), []);
  const jumpTo = useCallback((index: number) => dispatch({ type: 'JUMP_TO', index }), []);
  const toggleFlag = useCallback(() => dispatch({ type: 'TOGGLE_FLAG' }), []);

  // Read via a ref so submitExam's identity stays stable (safe to pass as
  // useExamTimer's onExpire without re-subscribing its interval) while
  // still always grading the LATEST state, not a stale closure over it.
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  });

  const submitExam = useCallback(async (): Promise<ExamResult | null> => {
    if (stateRef.current.status === 'submitted') return null; // already submitted, nothing to do
    const now = new Date();
    const submittedState = examSessionReducer(stateRef.current, { type: 'SUBMIT_EXAM', now });
    dispatch({ type: 'HYDRATE', state: submittedState });
    await examSessionStorage.save(toPersisted(submittedState));
    const result = computeExamResult(submittedState, generateResultId());
    await examResultsStorage.saveResult(result);
    setJustSubmittedResult(result);
    return result;
  }, []);

  return {
    isLoading,
    state,
    exam,
    selectSingle,
    toggleSata,
    setNumeric,
    next,
    previous,
    jumpTo,
    toggleFlag,
    submitExam,
    /** The result from THIS hook instance's own submitExam() call, if any — for immediate post-submit navigation. */
    justSubmittedResult,
  };
}

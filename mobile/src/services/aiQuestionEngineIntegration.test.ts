import { parseGenerateQuestionResponse } from '../api/aiQuestionService';
import { createInitialEngineState, getCurrentAttempt, getCurrentQuestion, questionEngineReducer } from './questionEngine';
import { scoreQuestion } from './scoringService';
import type { GenerateAIQuestionParams } from '../api/aiQuestionService';
import type { System } from '../models';

/**
 * M8 — "integration with Question Engine": proves an AI-generated
 * question, once parsed by aiQuestionService, is a real, ordinary
 * `Question` the existing reusable Question Engine (M4, unmodified) can
 * select/submit/score exactly like a QBank or exam question — the
 * literal meaning of "no duplicate UI / same Question Engine as QBank."
 */

const SYSTEM: System = {
  key: 'cardio',
  label: 'Cardiovascular',
  description: 'Heart and vascular system',
  quizBrief: 'Hypertension, heart failure, anticoagulation.',
  isAnatomical: true,
  x: 10,
  y: 20,
  chip: false,
  available: true,
  lessonIds: [],
  source: 'content-export',
};

const PARAMS: GenerateAIQuestionParams = { system: SYSTEM, domain: 3 };

function generatedQuestion() {
  const responseText = JSON.stringify({
    stem: 'Which agent is guideline-directed therapy for HFrEF?',
    options: [
      { label: 'A', text: 'Sacubitril/valsartan' },
      { label: 'B', text: 'Diphenhydramine' },
      { label: 'C', text: 'Ibuprofen' },
      { label: 'D', text: 'Pseudoephedrine' },
    ],
    correctLabel: 'A',
    rationale: 'Sacubitril/valsartan reduces mortality in HFrEF.',
  });
  const result = parseGenerateQuestionResponse({ content: [{ type: 'text', text: responseText }] }, PARAMS);
  if (!result.ok) throw new Error('fixture setup failed');
  return result.question;
}

describe('AI-generated question x Question Engine integration', () => {
  test('the engine recognizes it as the current question with the real options intact', () => {
    const question = generatedQuestion();
    const state = createInitialEngineState([question]);
    expect(getCurrentQuestion(state)).toBe(question);
    expect(getCurrentQuestion(state)?.type).toBe('single');
  });

  test('selecting the correct label and submitting scores correct, via the unmodified engine reducer', () => {
    const question = generatedQuestion();
    let state = createInitialEngineState([question]);
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });

    const attempt = getCurrentAttempt(state);
    expect(attempt?.status).toBe('submitted');
    expect(attempt?.isCorrect).toBe(true);
    // Cross-checked against the same scoringService QBank/exams use — no separate AI-only scoring path.
    expect(scoreQuestion(question, { type: 'single', label: 'A' })).toBe(true);
  });

  test('selecting a wrong label and submitting scores incorrect', () => {
    const question = generatedQuestion();
    let state = createInitialEngineState([question]);
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });

    expect(getCurrentAttempt(state)?.isCorrect).toBe(false);
  });

  test('an unanswered generated question cannot be submitted (same "no submitting nothing" rule as every other source)', () => {
    const question = generatedQuestion();
    let state = createInitialEngineState([question]);
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    expect(getCurrentAttempt(state)).toBeUndefined();
  });

  test('a locked (submitted) generated question rejects further selection, same immutability rule as QBank', () => {
    const question = generatedQuestion();
    let state = createInitialEngineState([question]);
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'A' });
    state = questionEngineReducer(state, { type: 'SUBMIT' });
    const beforeSecondSelect = state;
    state = questionEngineReducer(state, { type: 'SELECT_SINGLE', label: 'B' });
    expect(state).toBe(beforeSecondSelect); // reducer no-ops once locked — unchanged reference
  });
});

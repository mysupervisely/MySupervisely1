import { isAnswerable, scoreNumeric, scoreQuestion, scoreSata, scoreSingle } from './scoringService';
import type { NumericQuestion, SataQuestion, SingleAnswerQuestion } from '../models/question';

function singleQuestion(correctLabel: string): SingleAnswerQuestion {
  return {
    id: 'q1',
    type: 'single',
    stem: 'stem',
    rationale: 'rationale',
    domain: 1,
    systemKey: 'cardio',
    topicLabel: 'Cardiovascular',
    source: { kind: 'qbank', index: 0 },
    options: [
      { label: 'A', text: 'a' },
      { label: 'B', text: 'b' },
    ],
    correctLabel,
  };
}

function sataQuestion(correctLabels: string[]): SataQuestion {
  return {
    id: 'q2',
    type: 'sata',
    stem: 'stem',
    rationale: 'rationale',
    domain: 3,
    systemKey: 'derm',
    topicLabel: 'Dermatology',
    source: { kind: 'qbank', index: 1 },
    options: [
      { label: 'A', text: 'a' },
      { label: 'B', text: 'b' },
      { label: 'C', text: 'c' },
    ],
    correctLabels,
  };
}

function numericQuestion(correctValue: number, tolerance: number): NumericQuestion {
  return {
    id: 'q3',
    type: 'numeric',
    stem: 'stem',
    rationale: 'rationale',
    domain: 1,
    systemKey: 'calc',
    topicLabel: 'Calculations Toolkit',
    source: { kind: 'qbank', index: 2 },
    correctValue,
    tolerance,
  };
}

describe('scoreSingle', () => {
  test('exact match is correct', () => {
    expect(scoreSingle('B', 'B')).toBe(true);
  });
  test('mismatch is incorrect', () => {
    expect(scoreSingle('B', 'A')).toBe(false);
  });
  test('empty answer is incorrect', () => {
    expect(scoreSingle('B', '')).toBe(false);
  });
});

describe('scoreSata — exact-set, order-independent, no partial credit', () => {
  test('exact set match (different order) is correct', () => {
    expect(scoreSata(['A', 'B', 'D'], ['D', 'A', 'B'])).toBe(true);
  });
  test('partial selection (subset) is incorrect', () => {
    expect(scoreSata(['A', 'B', 'D'], ['A', 'B'])).toBe(false);
  });
  test('extra selection (superset) is incorrect', () => {
    expect(scoreSata(['A', 'B'], ['A', 'B', 'C'])).toBe(false);
  });
  test('completely wrong set is incorrect', () => {
    expect(scoreSata(['A', 'B'], ['C', 'D'])).toBe(false);
  });
  test('empty selection is incorrect', () => {
    expect(scoreSata(['A', 'B'], [])).toBe(false);
  });
});

describe('scoreNumeric — inclusive tolerance band', () => {
  test('exact value is correct', () => {
    expect(scoreNumeric(10, 0.5, '10')).toBe(true);
  });
  test('exactly at the upper tolerance boundary is correct (inclusive)', () => {
    expect(scoreNumeric(10, 0.5, '10.5')).toBe(true);
  });
  test('exactly at the lower tolerance boundary is correct (inclusive)', () => {
    expect(scoreNumeric(10, 0.5, '9.5')).toBe(true);
  });
  test('just outside the upper boundary is incorrect', () => {
    expect(scoreNumeric(10, 0.5, '10.51')).toBe(false);
  });
  test('just outside the lower boundary is incorrect', () => {
    expect(scoreNumeric(10, 0.5, '9.49')).toBe(false);
  });
  test('zero tolerance requires an exact match', () => {
    expect(scoreNumeric(10, 0, '10')).toBe(true);
    expect(scoreNumeric(10, 0, '10.01')).toBe(false);
  });
  test('non-numeric input is incorrect, not a thrown error', () => {
    expect(scoreNumeric(10, 0.5, 'abc')).toBe(false);
  });
  test('empty input is incorrect', () => {
    expect(scoreNumeric(10, 0.5, '')).toBe(false);
    expect(scoreNumeric(10, 0.5, '   ')).toBe(false);
  });
  test('negative values score correctly', () => {
    expect(scoreNumeric(-5, 1, '-4.5')).toBe(true);
    expect(scoreNumeric(-5, 1, '-3.9')).toBe(false);
  });
});

describe('scoreQuestion — dispatches by type', () => {
  test('single', () => {
    expect(scoreQuestion(singleQuestion('C'), { type: 'single', label: 'C' })).toBe(true);
    expect(scoreQuestion(singleQuestion('C'), { type: 'single', label: 'A' })).toBe(false);
  });
  test('sata', () => {
    expect(scoreQuestion(sataQuestion(['A', 'C']), { type: 'sata', labels: ['C', 'A'] })).toBe(true);
    expect(scoreQuestion(sataQuestion(['A', 'C']), { type: 'sata', labels: ['A'] })).toBe(false);
  });
  test('numeric', () => {
    expect(scoreQuestion(numericQuestion(100, 5), { type: 'numeric', text: '104' })).toBe(true);
    expect(scoreQuestion(numericQuestion(100, 5), { type: 'numeric', text: '106' })).toBe(false);
  });
  test('a mismatched answer/question type shape degrades to incorrect, not a throw', () => {
    expect(() =>
      scoreQuestion(singleQuestion('B'), { type: 'numeric', text: '5' })
    ).not.toThrow();
    expect(scoreQuestion(singleQuestion('B'), { type: 'numeric', text: '5' })).toBe(false);
  });
});

describe('isAnswerable — gates the Submit button', () => {
  test('single needs a chosen label', () => {
    expect(isAnswerable(singleQuestion('A'), { type: 'single', label: '' })).toBe(false);
    expect(isAnswerable(singleQuestion('A'), { type: 'single', label: 'A' })).toBe(true);
  });
  test('sata needs at least one chosen label', () => {
    expect(isAnswerable(sataQuestion(['A']), { type: 'sata', labels: [] })).toBe(false);
    expect(isAnswerable(sataQuestion(['A']), { type: 'sata', labels: ['A'] })).toBe(true);
  });
  test('numeric needs non-empty, parseable text', () => {
    expect(isAnswerable(numericQuestion(1, 1), { type: 'numeric', text: '' })).toBe(false);
    expect(isAnswerable(numericQuestion(1, 1), { type: 'numeric', text: 'abc' })).toBe(false);
    expect(isAnswerable(numericQuestion(1, 1), { type: 'numeric', text: '1.5' })).toBe(true);
  });
});

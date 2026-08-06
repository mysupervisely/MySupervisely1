import type { Question } from './question';

export type ExamNumber = 1 | 2 | 3;

/**
 * A fixed, 225-question practice exam. `questions` is ordered by slot
 * (0..224) exactly as authored in the source — there is no blueprint
 * generation or shuffling on the mobile side (the audit's §K notes the
 * web app's seeded-random blueprint machinery is unnecessary here since
 * all 675 exam questions are already static, pre-assigned content).
 */
export type Exam = {
  examNumber: ExamNumber;
  questions: Question[];
};

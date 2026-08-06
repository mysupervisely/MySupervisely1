/**
 * Types mirroring the RAW source JSON exactly, as authored in
 * mobile-source/content-export/. Used only by the import script — the app
 * runtime never sees these, it sees the normalized types in src/models/.
 */

export type RawQuestionOption = {
  label: string;
  text: string;
};

export type RawQuestionType = 'single' | 'numeric' | 'sata';

export type RawQuestion = {
  type: RawQuestionType;
  domain: number;
  topicLabel: string;
  stem: string;
  rationale: string;
  // single / sata
  options?: RawQuestionOption[];
  correctLabel?: string;
  // sata
  correctLabels?: string[];
  // numeric
  correctValue?: number;
  tolerance?: number;
  unit?: string;
};

export type RawQbankFile = RawQuestion[];

/** exam_question_bank.json: { "1": { "0": RawQuestion, "1": RawQuestion, ... }, "2": {...}, "3": {...} } */
export type RawExamBankFile = Record<string, Record<string, RawQuestion>>;

export type RawLesson = {
  title: string;
  note: string;
};

export type RawSystem = {
  label: string;
  description: string;
  quizBrief?: string;
  available: boolean;
  chip?: boolean;
  x?: number;
  y?: number;
  lessons: RawLesson[];
};

/** systems.json: { [systemKey]: RawSystem } */
export type RawSystemsFile = Record<string, RawSystem>;

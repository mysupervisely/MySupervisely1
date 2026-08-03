import type { QuestionCategory, SafetyRule } from "./types.js";

/**
 * Bump this whenever ANY rule below (or the category baseline table) is
 * added, removed, or edited — including regex tweaks. Every
 * MedicationQuestion stores the version that produced its disposition, so
 * a rule change never silently changes the meaning of a past question.
 *
 * Format: date-stamped, "<YYYY-MM-DD>.<n>" — n increments if more than one
 * revision ships on the same day.
 */
export const SAFETY_RULE_SET_VERSION = "2026-08-04.1";

/**
 * The patient's own category selection is a structured, unambiguous
 * signal — not inferred — so it's the baseline disposition before any
 * text pattern is considered. Only GENERAL_INFO / ADMINISTRATION / STORAGE
 * are generic-enough-to-educate-on; everything else defaults to
 * PHARMACIST_REVIEW (human judgment) per docs/doseprepped/ARCHITECTURE.md
 * §9. See "Deterministic Safety & Disposition Rule Engine" in that
 * document for the full rationale for each row.
 */
export const CATEGORY_BASELINE_DISPOSITION: Record<
  QuestionCategory,
  "GENERAL_EDUCATION" | "PHARMACIST_REVIEW"
> = {
  GENERAL_INFO: "GENERAL_EDUCATION",
  ADMINISTRATION: "GENERAL_EDUCATION",
  STORAGE: "GENERAL_EDUCATION",
  MISSED_DOSE: "PHARMACIST_REVIEW",
  SIDE_EFFECT: "PHARMACIST_REVIEW",
  DRUG_INTERACTION: "PHARMACIST_REVIEW",
  ADHERENCE: "PHARMACIST_REVIEW",
  COST_ACCESS: "PHARMACIST_REVIEW",
  OTHER: "PHARMACIST_REVIEW",
};

/**
 * Escalation rules scan the question's free text and, on a match, override
 * the category baseline *upward* (toward more caution) — never downward.
 * Each rule is independently named and documented so a clinical reviewer
 * can audit exactly what it targets and why. This is an intentionally
 * small initial set scoped to M3 Phase 2's stated requirements — see the
 * "Current limitations" note in docs/doseprepped/ARCHITECTURE.md. It does
 * not attempt to enumerate every possible medical emergency.
 */
export const SAFETY_RULES: SafetyRule[] = [
  {
    id: "anaphylaxis-or-severe-allergic-reaction",
    disposition: "URGENT_EMERGENCY",
    description:
      "Signals consistent with a possible severe allergic reaction (e.g. anaphylaxis): swelling of the face/lips/tongue/throat, difficulty breathing, or the word 'anaphylaxis' itself.",
    patterns: [
      /anaphyla/i,
      /(throat|tongue|lips?|face).{0,30}swell/i,
      /swell.{0,30}(throat|tongue|lips?|face)/i,
      /(can'?t|cannot|having trouble|difficult(y)?).{0,20}breath/i,
      /trouble breathing/i,
      /struggling to breathe/i,
    ],
  },
  {
    id: "possible-overdose-or-poisoning",
    disposition: "URGENT_EMERGENCY",
    description:
      "Signals of a possible overdose or accidental poisoning: explicit mention of overdose/poisoning, or taking a clearly excessive quantity.",
    patterns: [
      /over ?dose/i,
      /poison(ed|ing)?/i,
      /took (way |far )?too many/i,
      /took\b.{0,10}\d+\s*(pills|tablets|capsules)/i,
    ],
  },
  {
    id: "loss-of-consciousness-or-unresponsiveness",
    disposition: "URGENT_EMERGENCY",
    description:
      "Signals of loss of consciousness, unresponsiveness, or abnormal breathing.",
    patterns: [/passed out/i, /unconscious/i, /unresponsive/i, /not breathing/i, /can'?t wake/i],
  },
  {
    id: "chest-pain-or-severe-cardiac-symptom",
    disposition: "URGENT_EMERGENCY",
    description: "Chest pain or a symptom commonly associated with a cardiac emergency.",
    patterns: [/chest pain/i, /crushing.{0,15}chest/i, /chest.{0,15}crushing/i],
  },
  {
    id: "suicidal-ideation-or-self-harm",
    disposition: "URGENT_EMERGENCY",
    description: "Statements suggesting suicidal ideation or intentional self-harm.",
    patterns: [/suicid/i, /kill myself/i, /harm(ing)? myself/i, /end my life/i],
  },
  {
    id: "severe-or-rapidly-worsening-symptom",
    disposition: "PROVIDER_EVALUATION",
    description:
      "Reports of severe, rapidly worsening, or otherwise concerning symptoms that fall short of the explicit emergency signals above but still warrant clinical evaluation rather than general education.",
    patterns: [
      /\bsevere(ly)?\b/i,
      /getting worse/i,
      /rapidly worsening/i,
      /won'?t stop/i,
      /can'?t (stop|control)/i,
      /blood(y)?\b.{0,15}\b(stool|vomit|urine|cough)/i,
      /\bhives?\b/i,
      /rash.{0,20}spreading/i,
    ],
  },
  {
    id: "medication-error-with-potential-harm",
    disposition: "PROVIDER_EVALUATION",
    description:
      "Reports of a medication error (wrong medication, wrong dose, doubled dose) that could plausibly have significant consequences, without an explicit emergency signal already present.",
    patterns: [
      /gave\b.{0,25}\bwrong\b/i,
      /took\b.{0,15}\bwrong (medication|medicine|pill|dose)\b/i,
      /accidentally (took|gave|doubled)/i,
      /double(d)? (my|the) dose/i,
      /took\b.{0,10}two doses/i,
    ],
  },
];

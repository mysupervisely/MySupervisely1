/**
 * Explicit topicLabel -> system-key mapping.
 *
 * This exists because `topicLabel` on a question and `label` on a system
 * are NOT always the same string — matching them by string equality
 * silently drops content. Two concrete cases found by inspection
 * (docs/MOBILE_MIGRATION_AUDIT.md §C):
 *
 * 1. Questions tagged `topicLabel: "Infectious Disease"` (55 in the QBank)
 *    belong to the `id` system, whose OWN `label` field in systems.json is
 *    "Infectious Disease & Immunology" — a different string. The `id`
 *    system's `label` is left exactly as-authored (it's real content, not
 *    ours to edit); this map is the fix, not a rename of the system.
 *
 * 2. `topicLabel: "Drug Class Study Guide"` (99 in the QBank) has no
 *    corresponding system in systems.json at all — it corresponds to the
 *    web app's separate drug-class quick-reference feature. There is
 *    nowhere real to put these 99 real questions, so the import step
 *    synthesizes one system-like bucket, `drug-class-study-guide`, to hold
 *    them (see src/services/contentRepository.ts and
 *    docs/M2_IMPLEMENTATION_NOTES.md). This is not fabricated content —
 *    it's a structural home for real questions that the source data left
 *    orphaned.
 *
 * Every other entry here matches an exact `label` string in systems.json —
 * verified programmatically during the audit — and is listed anyway so the
 * mapping is one explicit, reviewable table rather than "27 exact matches
 * plus 2 special cases scattered in code."
 *
 * If content is updated later and a new `topicLabel` shows up that isn't a
 * key in this map, import/validation must fail loudly (see
 * scripts/validate-content.ts) rather than silently miscategorizing or
 * dropping the question.
 */
export const TOPIC_LABEL_TO_SYSTEM_KEY: Record<string, string> = {
  Cardiovascular: 'cardio',
  'Neuro & Psych': 'neuro',
  Pulmonary: 'respiratory',
  'GI & Hepatic': 'gi',
  Endocrine: 'endocrine',
  Renal: 'renal',
  Immunology: 'immuno',
  Pediatrics: 'peds',
  Geriatrics: 'geri',
  Dermatology: 'derm',
  Ophthalmology: 'ophtho',
  Urology: 'uro',
  'Calculations Toolkit': 'calc',
  'Hematology & Oncology': 'heme',
  "Women's Health": 'repro',
  'Infectious Disease': 'id', // <-- the mismatch: systems.json's `id.label` is "Infectious Disease & Immunology"
  Rheumatology: 'rheum',
  'Sterile & Nonsterile Compounding': 'compounding',
  'Medication Safety': 'medsafety',
  'Drug Information & Literature Evaluation': 'druginfo',
  'Pharmacy Operations & REMS': 'pharmops',
  'OTC & Self-Care Therapeutics': 'otc',
  'Professional Practice & Ethics': 'ethics',
  'Biostatistics & Evidence-Based Medicine': 'biostats',
  'Toxicology & Poison Management': 'tox',
  'Nutrition Support': 'nutrition',
  'Drug Class Study Guide': 'drug-class-study-guide', // <-- synthesized bucket, not a real systems.json entry
};

/** The one system key this content layer synthesizes rather than importing verbatim. */
export const SYNTHESIZED_SYSTEM_KEY = 'drug-class-study-guide';

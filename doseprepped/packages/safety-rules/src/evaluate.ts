import { CATEGORY_BASELINE_DISPOSITION, SAFETY_RULES, SAFETY_RULE_SET_VERSION } from "./rules.js";
import type { DispositionResult, QuestionCategory } from "./types.js";

/**
 * Assigns a MedicationQuestion's disposition. Pure, synchronous, and has
 * no dependency on any AI/LLM service — this function is the entire
 * "deterministic safety gate" described in docs/doseprepped/
 * ARCHITECTURE.md, and the system's ability to route a question does not
 * degrade if an AI service is slow, disabled, or unavailable, because
 * nothing here ever calls one.
 *
 * Precedence: any URGENT_EMERGENCY rule match wins outright; else any
 * PROVIDER_EVALUATION rule match; else the category baseline. Escalation
 * rules only ever move the result *up* in severity from the baseline,
 * never down.
 */
export function evaluateDisposition(questionText: string, category: QuestionCategory): DispositionResult {
  const urgentMatches: string[] = [];
  const providerMatches: string[] = [];

  for (const rule of SAFETY_RULES) {
    const matched = rule.patterns.some((pattern) => pattern.test(questionText));
    if (!matched) continue;

    if (rule.disposition === "URGENT_EMERGENCY") {
      urgentMatches.push(rule.id);
    } else {
      providerMatches.push(rule.id);
    }
  }

  if (urgentMatches.length > 0) {
    return {
      disposition: "URGENT_EMERGENCY",
      matchedRuleIds: urgentMatches,
      ruleSetVersion: SAFETY_RULE_SET_VERSION,
    };
  }

  if (providerMatches.length > 0) {
    return {
      disposition: "PROVIDER_EVALUATION",
      matchedRuleIds: providerMatches,
      ruleSetVersion: SAFETY_RULE_SET_VERSION,
    };
  }

  return {
    disposition: CATEGORY_BASELINE_DISPOSITION[category],
    matchedRuleIds: [],
    ruleSetVersion: SAFETY_RULE_SET_VERSION,
  };
}

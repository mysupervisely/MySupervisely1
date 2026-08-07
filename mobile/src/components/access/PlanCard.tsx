import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import { calcBundleSavings, calcPrice, calcPricePerDay, planFeatures } from '../../services/pricingService';
import type { PricingPlan } from '../../services/pricingService';

type PlanCardProps = {
  plan: PricingPlan;
  label: string;
  days: number;
  counts: { lessons: number; questions: number; exams: number };
  onPurchasePress: () => void;
};

/**
 * M9 — one plan card. Every number here is computed live from
 * pricingService + the real content counts passed in from
 * PricingScreen — "Do not hardcode pricing," taken to also mean the
 * feature counts shouldn't drift from real content either.
 */
export function PlanCard({ plan, label, days, counts, onPurchasePress }: PlanCardProps) {
  const price = Math.round(calcPrice(days, plan));
  const perDay = calcPricePerDay(days, plan);
  const features = planFeatures(plan);
  const savings = plan === 'bundle' ? calcBundleSavings(days) : null;

  return (
    <View style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.price} accessibilityLabel={`$${price} for ${days} days`}>
        ${price}
      </Text>
      <Text style={styles.perDay}>
        ${perDay} / day · {days} day{days === 1 ? '' : 's'}
      </Text>
      {savings !== null && savings > 0 ? <Text style={styles.savings}>Save ${savings} vs. buying separately</Text> : null}

      <View style={styles.features}>
        {features.includesLessons ? <FeatureLine text={`${counts.lessons} written lessons`} /> : null}
        {features.includesQbank ? <FeatureLine text={`${counts.questions.toLocaleString()} QBank questions`} /> : null}
        {features.includesExams ? <FeatureLine text={`${counts.exams} full-length practice exams`} /> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Continue with ${label}, $${price}`}
        style={styles.button}
        onPress={onPurchasePress}
      >
        <Text style={styles.buttonText}>Continue</Text>
      </Pressable>
    </View>
  );
}

function FeatureLine({ text }: { text: string }) {
  return (
    <View style={styles.featureLine}>
      <Text style={styles.featureCheck}>✓</Text>
      <Text style={styles.featureText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs,
  },
  label: {
    ...typeScale.h3,
    color: colors.ink,
  },
  price: {
    ...typeScale.display,
    color: colors.teal,
  },
  perDay: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  savings: {
    ...typeScale.caption,
    color: colors.tealDeep,
  },
  features: {
    marginTop: spacing.sm,
    gap: spacing.xs / 2,
  },
  featureLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  featureCheck: {
    ...typeScale.bodyMedium,
    color: colors.teal,
  },
  featureText: {
    ...typeScale.body,
    color: colors.ink,
    flex: 1,
  },
  button: {
    marginTop: spacing.md,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  buttonText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});

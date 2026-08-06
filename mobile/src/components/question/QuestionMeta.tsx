import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typeScale } from '../../theme';
import { domainLabel } from '../../constants/domains';

type QuestionMetaProps = {
  index: number;
  total: number;
  systemLabel: string;
  domain: number;
};

/**
 * Question number / system / NAPLEX domain header. "Difficulty (if
 * available)" from the task is intentionally omitted — no difficulty field
 * exists anywhere in the real content (verified against the content
 * export), so nothing is shown rather than fabricating a rating.
 */
export function QuestionMeta({ index, total, systemLabel, domain }: QuestionMetaProps) {
  return (
    <View style={styles.container} accessibilityRole="header">
      <Text style={styles.counter}>
        Question {index + 1} of {total}
      </Text>
      <Text style={styles.tags}>
        {systemLabel} · {domainLabel(domain)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs / 2,
    marginBottom: spacing.md,
  },
  counter: {
    ...typeScale.monoLabel,
    color: colors.teal,
    letterSpacing: 0.5,
  },
  tags: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});

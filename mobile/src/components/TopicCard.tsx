import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../theme';

type TopicCardProps = {
  title: string;
  lessonCount: number;
  questionCount: number;
  onPress: () => void;
};

/** A "More Topics" card — same navigation contract as a body-map hotspot, different chrome. */
export const TopicCard = memo(function TopicCard({
  title,
  lessonCount,
  questionCount,
  onPress,
}: TopicCardProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title} — ${lessonCount} lesson${lessonCount === 1 ? '' : 's'}, ${questionCount} question${questionCount === 1 ? '' : 's'}`}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={onPress}
    >
      <Text style={styles.title}>{title}</Text>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          {lessonCount} lesson{lessonCount === 1 ? '' : 's'}
        </Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.meta}>
          {questionCount} question{questionCount === 1 ? '' : 's'}
        </Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    minHeight: 44,
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.xs,
    width: '48%',
  },
  cardPressed: {
    opacity: 0.7,
  },
  title: {
    ...typeScale.h3,
    color: colors.ink,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  meta: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  metaDot: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
});

import type { ReactElement } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typeScale } from '../../theme';
import type { PaletteEntry } from '../../services/examSession';

type PaletteGridProps = {
  entries: PaletteEntry[];
  onSelect: (index: number) => void;
  showLegend?: boolean;
  /** Rendered above the grid, scrolling WITH it (FlatList's own header slot) — never wrap this component in a second ScrollView/FlatList, or virtualization breaks. */
  headerContent?: ReactElement;
};

const COLUMNS = 5;
const CELL_SIZE = 56;

/**
 * The 225-cell jump-to grid — the FlatList here is always the primary
 * scroller wherever it's used (QuestionPalette's modal; ExamReviewScreen's
 * whole body), never nested inside another ScrollView/FlatList. Nesting a
 * non-scrolling FlatList inside a ScrollView is a known anti-pattern that
 * silently defeats virtualization by forcing every row to render at once —
 * exactly the perf problem using FlatList here was meant to avoid at 225
 * items. Screen-level "header" content (title, stats, buttons) goes
 * through `headerContent`, not a wrapping container.
 */
export function PaletteGrid({ entries, onSelect, showLegend = true, headerContent }: PaletteGridProps) {
  return (
    <FlatList
      data={entries}
      keyExtractor={(entry) => entry.questionId}
      numColumns={COLUMNS}
      contentContainerStyle={styles.grid}
      ListHeaderComponent={
        <View style={styles.headerArea}>
          {headerContent}
          {showLegend ? (
            <View style={styles.legend}>
              <LegendItem swatchStyle={styles.swatchUnanswered} label="Unanswered" />
              <LegendItem swatchStyle={styles.swatchAnswered} label="Answered" />
              <LegendItem swatchStyle={styles.swatchFlagged} label="Flagged" />
              <LegendItem swatchStyle={styles.swatchCurrent} label="Current" />
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Question ${item.index + 1}${item.isCurrent ? ', current' : ''}${
            item.isAnswered ? ', answered' : ', unanswered'
          }${item.isFlagged ? ', flagged for review' : ''}`}
          onPress={() => onSelect(item.index)}
          style={[
            styles.cell,
            item.isAnswered ? styles.cellAnswered : styles.cellUnanswered,
            item.isFlagged && styles.cellFlagged,
            item.isCurrent && styles.cellCurrent,
          ]}
        >
          <Text style={[styles.cellText, item.isAnswered && styles.cellTextAnswered]}>{item.index + 1}</Text>
        </Pressable>
      )}
    />
  );
}

function LegendItem({ swatchStyle, label }: { swatchStyle: object; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, swatchStyle]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerArea: {
    gap: spacing.md,
    paddingBottom: spacing.sm,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legendSwatch: {
    width: 12,
    height: 12,
    borderRadius: radius.sm,
  },
  swatchUnanswered: {
    backgroundColor: colors.paperRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  swatchAnswered: {
    backgroundColor: colors.teal,
  },
  swatchFlagged: {
    backgroundColor: colors.paperRaised,
    borderWidth: 2,
    borderColor: colors.amber,
  },
  swatchCurrent: {
    backgroundColor: colors.paperRaised,
    borderWidth: 2,
    borderColor: colors.ink,
  },
  legendLabel: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  grid: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    minWidth: 44,
    minHeight: 44,
    margin: spacing.xs / 2,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  cellUnanswered: {
    backgroundColor: colors.paperRaised,
    borderColor: colors.line,
  },
  cellAnswered: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  cellFlagged: {
    borderWidth: 2,
    borderColor: colors.amber,
  },
  cellCurrent: {
    borderWidth: 2,
    borderColor: colors.ink,
  },
  cellText: {
    ...typeScale.bodyMedium,
    color: colors.ink,
  },
  cellTextAnswered: {
    color: colors.paperRaised,
  },
});

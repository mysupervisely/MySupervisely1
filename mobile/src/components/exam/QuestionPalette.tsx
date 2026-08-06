import { Modal, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { PaletteGrid } from './PaletteGrid';
import { colors, spacing, typeScale } from '../../theme';
import type { PaletteEntry } from '../../services/examSession';

type QuestionPaletteProps = {
  visible: boolean;
  entries: PaletteEntry[];
  onSelect: (index: number) => void;
  onClose: () => void;
};

/** Modal wrapper around PaletteGrid — opened from ExamTakingScreen for a quick jump-to-question view. */
export function QuestionPalette({ visible, entries, onSelect, onClose }: QuestionPaletteProps) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            Question Palette
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close question palette" onPress={onClose}>
            <Text style={styles.closeText}>Done</Text>
          </Pressable>
        </View>
        <PaletteGrid entries={entries} onSelect={onSelect} />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.paper,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: {
    ...typeScale.h2,
    color: colors.ink,
  },
  closeText: {
    ...typeScale.bodyMedium,
    color: colors.teal,
  },
});

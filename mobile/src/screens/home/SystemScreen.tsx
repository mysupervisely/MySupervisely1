import { Pressable, StyleSheet, Text } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { PlaceholderNotice } from '../../components/PlaceholderNotice';
import { colors, typeScale } from '../../theme';
import type { HomeStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<HomeStackParamList, 'System'>;

/**
 * M1 stub. Takes a real route param (systemKey) so M3 can wire real system
 * data straight in without changing the navigation contract. No system
 * content is loaded here yet — that's M2 (content layer) + M3 (this screen,
 * for real).
 */
export function SystemScreen({ route, navigation }: Props) {
  const { systemKey } = route.params;

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="System">{systemKey}</ScreenTitle>
      <PlaceholderNotice
        milestone="M3"
        description="System description, lesson list, and entry points into practice questions for this topic, sourced from the real systems.json content."
      />
      <Pressable
        accessibilityRole="button"
        style={styles.link}
        onPress={() => navigation.navigate('Lesson', { systemKey, lessonIndex: 0 })}
      >
        <Text style={styles.linkText}>Preview: open a Lesson screen →</Text>
      </Pressable>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: 16,
    alignSelf: 'flex-start',
  },
  linkText: {
    ...typeScale.bodyMedium,
    color: colors.teal,
  },
});

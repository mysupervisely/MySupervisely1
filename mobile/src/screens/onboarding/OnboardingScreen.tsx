import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { colors, radius, spacing, typeScale } from '../../theme';
import { onboardingStorage } from '../../storage/onboardingStorage';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

/**
 * Real asset (logo_full_lockup.png from the content export), real copy,
 * real brand styling. The name field now persists (M3, via
 * src/storage/onboardingStorage.ts) so the Home screen's greeting is real
 * rather than decorative — see docs/M3_IMPLEMENTATION_NOTES.md for why
 * this one field was scoped in ahead of the full M6 storage layer.
 */
export function OnboardingScreen({ navigation }: Props) {
  const [name, setName] = useState('');

  const handleGetStarted = async () => {
    await onboardingStorage.setFirstName(name);
    navigation.replace('Main', { screen: 'HomeTab', params: { screen: 'Home' } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Image
          source={require('../../../assets/brand/logo_full_lockup.png')}
          style={styles.logo}
          resizeMode="contain"
          accessibilityLabel="PharmDPrepped"
        />
        <Text style={styles.tagline}>NAPLEX prep built on clinical reasoning.</Text>

        <View style={styles.form}>
          <Text style={styles.label}>What should we call you?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your first name"
            placeholderTextColor={colors.inkSoft}
            style={styles.input}
            autoCapitalize="words"
            returnKeyType="done"
          />
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Get started"
          hitSlop={8}
          style={styles.cta}
          onPress={handleGetStarted}
        >
          <Text style={styles.ctaText}>Get started</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl,
  },
  logo: {
    width: '100%',
    height: 120,
  },
  tagline: {
    ...typeScale.body,
    color: colors.paper,
    textAlign: 'center',
  },
  form: {
    gap: spacing.sm,
  },
  label: {
    ...typeScale.caption,
    color: colors.paper,
  },
  input: {
    ...typeScale.body,
    color: colors.ink,
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cta: {
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});

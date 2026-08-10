import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { colors, radius, spacing, typeScale } from '../../theme';
import { onboardingStorage } from '../../storage/onboardingStorage';
import type { RootStackParamList } from '../../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Onboarding'>;

/**
 * Real asset (logo_full_lockup.png from the content export), real copy,
 * real brand styling. The name field persists (M3, via
 * src/storage/onboardingStorage.ts) so the Home screen's greeting is real
 * rather than decorative — see docs/M3_IMPLEMENTATION_NOTES.md for why
 * this one field was scoped in ahead of the full M6 storage layer.
 *
 * M10 polish: the concept line is the exact copy this milestone
 * specifies ("Master the NAPLEX one system at a time"), a
 * KeyboardAvoidingView + ScrollView keep the "Get started" button
 * reachable above the keyboard on smaller devices, the name field is
 * optional (an empty name still gets a real, if generic, greeting — see
 * src/utils/greeting.ts), and the return key submits the form directly.
 */
export function OnboardingScreen({ navigation }: Props) {
  const [name, setName] = useState('');

  const handleGetStarted = async () => {
    await onboardingStorage.setFirstName(name.trim());
    navigation.replace('Main', { screen: 'HomeTab', params: { screen: 'Home' } });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={spacing.xl}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Image
            source={require('../../../assets/brand/logo_full_lockup.png')}
            style={styles.logo}
            resizeMode="contain"
            accessibilityLabel="PharmDPrepped"
          />
          <Text style={styles.concept} accessibilityRole="header">
            Master the NAPLEX one system at a time.
          </Text>
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
              onSubmitEditing={handleGetStarted}
              accessibilityLabel="Your first name"
              accessibilityHint="Optional — used to personalize your greeting"
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Get started"
            accessibilityHint="Enters the app"
            hitSlop={8}
            style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
            onPress={handleGetStarted}
          >
            <Text style={styles.ctaText}>Get started</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  flex: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xl,
    gap: spacing.lg,
  },
  logo: {
    width: '100%',
    height: 120,
  },
  concept: {
    ...typeScale.h2,
    color: colors.paper,
    textAlign: 'center',
  },
  tagline: {
    ...typeScale.body,
    color: colors.paper,
    textAlign: 'center',
    opacity: 0.8,
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
    minHeight: 44,
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  cta: {
    minHeight: 44,
    backgroundColor: colors.teal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.85,
  },
  ctaText: {
    ...typeScale.h3,
    color: colors.paperRaised,
  },
});

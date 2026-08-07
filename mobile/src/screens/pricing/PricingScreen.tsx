import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ScreenContainer } from '../../components/ScreenContainer';
import { ScreenTitle } from '../../components/ScreenTitle';
import { SelectChip } from '../../components/SelectChip';
import { PlanCard } from '../../components/access/PlanCard';
import { useAccessState } from '../../hooks/useAccessState';
import { contentRepository } from '../../services/contentRepository';
import { clampDays, pricingConfig } from '../../services/pricingService';
import { colors, radius, spacing, typeScale } from '../../theme';

const DURATION_PRESETS = [3, 7, 14, 30, 60, 90, 180, 365];

/**
 * M9 — the production paywall. "Display: Course Only / QBank Only /
 * Course + QBank. Explain features clearly. Display selected access
 * duration. Do not hardcode pricing." Every price comes from
 * pricingService (the real, ported web formula); every feature count
 * comes from contentRepository (the real content). "Purchase" is a
 * clearly-labeled not-yet-wired action — see
 * docs/MOBILE_PAYMENT_ARCHITECTURE.md §7 for exactly why (App Store/Play
 * policy requires native IAP for this, which needs store-side product
 * configuration this project doesn't have yet). "Restore access" (an
 * existing web purchase) IS fully real, calling the actual backend.
 */
export function PricingScreen() {
  const [days, setDays] = useState<number>(pricingConfig.DEFAULT_DAYS);
  const [daysInputText, setDaysInputText] = useState(String(pricingConfig.DEFAULT_DAYS));
  const [tokenInput, setTokenInput] = useState('');
  const [sessionInput, setSessionInput] = useState('');
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'loading'>('idle');
  const [restoreError, setRestoreError] = useState<string | null>(null);

  const access = useAccessState();

  const counts = useMemo(
    () => ({
      lessons: contentRepository
        .getAllSystems()
        .reduce((sum, system) => sum + contentRepository.getLessonsForSystem(system.key).length, 0),
      questions: contentRepository.getQuestions().length,
      exams: contentRepository.getAllExams().length,
    }),
    []
  );

  const selectDays = (value: number) => {
    const clamped = clampDays(value);
    setDays(clamped);
    setDaysInputText(String(clamped));
  };

  const commitCustomDays = () => {
    const parsed = parseInt(daysInputText, 10);
    if (Number.isNaN(parsed)) {
      setDaysInputText(String(days));
      return;
    }
    selectDays(parsed);
  };

  const notifyPurchaseNotWired = (label: string) => {
    Alert.alert(
      'In-App Purchase Coming Soon',
      `${label} will be purchasable directly from the app once native in-app purchases are wired up (see docs/MOBILE_PAYMENT_ARCHITECTURE.md). If you already purchased on the web, use "Restore Access" below.`
    );
  };

  const handleVerifyToken = async () => {
    if (!tokenInput.trim()) return;
    setRestoreStatus('loading');
    setRestoreError(null);
    const outcome = await access.verifyToken(tokenInput.trim());
    setRestoreStatus('idle');
    if (!outcome.ok) {
      setRestoreError(outcome.error.message);
    } else if (outcome.state.status === 'none') {
      setRestoreError('That access code was not recognized. Double-check it and try again.');
    } else {
      setTokenInput('');
    }
  };

  const handleVerifySession = async () => {
    if (!sessionInput.trim()) return;
    setRestoreStatus('loading');
    setRestoreError(null);
    const outcome = await access.redeemStripeSession(sessionInput.trim());
    setRestoreStatus('idle');
    if (!outcome.ok) {
      setRestoreError(outcome.error.message);
    } else if (outcome.state.status === 'none') {
      setRestoreError('That purchase could not be verified. If you were charged, contact support.');
    } else {
      setSessionInput('');
    }
  };

  return (
    <ScreenContainer>
      <ScreenTitle eyebrow="Access">Pricing</ScreenTitle>

      {access.state?.status === 'granted' ? (
        <View style={styles.grantedBanner} accessible accessibilityLabel="You have unlocked access">
          <Text style={styles.grantedTitle}>You have access</Text>
          <Text style={styles.grantedSubtitle}>
            {access.state.source === 'cache' ? 'Verified from your last connection.' : 'Verified just now.'}
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionLabel} accessibilityRole="header">
        Access Duration
      </Text>
      <View style={styles.chipRow}>
        {DURATION_PRESETS.map((preset) => (
          <SelectChip key={preset} label={`${preset}d`} selected={days === preset} onPress={() => selectDays(preset)} />
        ))}
      </View>
      <View style={styles.customDaysRow}>
        <Text style={styles.customDaysLabel}>Custom:</Text>
        <TextInput
          value={daysInputText}
          onChangeText={setDaysInputText}
          onBlur={commitCustomDays}
          keyboardType="number-pad"
          style={styles.daysInput}
          accessibilityLabel={`Custom access duration in days, between ${pricingConfig.MIN_DAYS} and ${pricingConfig.MAX_DAYS}`}
        />
        <Text style={styles.customDaysLabel}>days</Text>
      </View>

      <Text style={[styles.sectionLabel, styles.laterSection]} accessibilityRole="header">
        Choose a Plan
      </Text>
      <View style={styles.planList}>
        <PlanCard
          plan="course"
          label="Course Only"
          days={days}
          counts={counts}
          onPurchasePress={() => notifyPurchaseNotWired('Course Only')}
        />
        <PlanCard
          plan="qbank"
          label="QBank Only"
          days={days}
          counts={counts}
          onPurchasePress={() => notifyPurchaseNotWired('QBank Only')}
        />
        <PlanCard
          plan="bundle"
          label="Course + QBank"
          days={days}
          counts={counts}
          onPurchasePress={() => notifyPurchaseNotWired('Course + QBank')}
        />
      </View>

      <Text style={[styles.sectionLabel, styles.laterSection]} accessibilityRole="header">
        Already Purchased on the Web?
      </Text>
      <Text style={styles.restoreSubtitle}>
        Enter your access code, or the payment confirmation link&apos;s session ID, to unlock the same access here.
      </Text>

      <View style={styles.restoreForm}>
        <Text style={styles.restoreLabel}>Access code</Text>
        <View style={styles.restoreRow}>
          <TextInput
            value={tokenInput}
            onChangeText={setTokenInput}
            placeholder="Paste your access code"
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            style={styles.restoreInput}
            accessibilityLabel="Access code"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Verify access code"
            style={styles.restoreButton}
            onPress={handleVerifyToken}
          >
            <Text style={styles.restoreButtonText}>Verify</Text>
          </Pressable>
        </View>

        <Text style={[styles.restoreLabel, styles.laterSection]}>Stripe session ID</Text>
        <View style={styles.restoreRow}>
          <TextInput
            value={sessionInput}
            onChangeText={setSessionInput}
            placeholder="cs_..."
            placeholderTextColor={colors.inkSoft}
            autoCapitalize="none"
            style={styles.restoreInput}
            accessibilityLabel="Stripe checkout session ID"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Verify purchase"
            style={styles.restoreButton}
            onPress={handleVerifySession}
          >
            <Text style={styles.restoreButtonText}>Verify</Text>
          </Pressable>
        </View>

        {restoreStatus === 'loading' ? (
          <ActivityIndicator color={colors.teal} accessibilityLabel="Verifying" style={styles.restoreSpinner} />
        ) : null}
        {restoreError ? <Text style={styles.restoreError}>{restoreError}</Text> : null}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  grantedBanner: {
    backgroundColor: 'rgba(15, 125, 128, 0.08)',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.teal,
    padding: spacing.md,
    gap: spacing.xs / 2,
    marginBottom: spacing.lg,
  },
  grantedTitle: {
    ...typeScale.h3,
    color: colors.tealDeep,
  },
  grantedSubtitle: {
    ...typeScale.caption,
    color: colors.inkSoft,
  },
  sectionLabel: {
    ...typeScale.h2,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  laterSection: {
    marginTop: spacing.xl,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  customDaysRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  customDaysLabel: {
    ...typeScale.body,
    color: colors.inkSoft,
  },
  daysInput: {
    ...typeScale.body,
    color: colors.ink,
    minWidth: 72,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paperRaised,
  },
  planList: {
    gap: spacing.md,
  },
  restoreSubtitle: {
    ...typeScale.body,
    color: colors.inkSoft,
    marginBottom: spacing.md,
  },
  restoreForm: {
    backgroundColor: colors.paperRaised,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
  },
  restoreLabel: {
    ...typeScale.bodyMedium,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  restoreRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  restoreInput: {
    ...typeScale.body,
    color: colors.ink,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.paper,
  },
  restoreButton: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  restoreButtonText: {
    ...typeScale.bodyMedium,
    color: colors.paperRaised,
  },
  restoreSpinner: {
    marginTop: spacing.sm,
  },
  restoreError: {
    ...typeScale.caption,
    color: colors.flag,
    marginTop: spacing.sm,
  },
});

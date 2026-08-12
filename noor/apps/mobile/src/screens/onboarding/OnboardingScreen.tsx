import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import {
  NOOR_INTERESTS,
  NOOR_INTEREST_LABELS,
  CARE_TYPES,
  CARE_TYPE_LABELS,
  CARE_FORMATS,
  CARE_FORMAT_LABELS,
  US_STATES,
  type NoorInterest,
  type CareType,
  type CareFormatPreference,
  type PatientProfileDTO,
} from "@noor/types";
import { Picker } from "@react-native-picker/picker";
import { apiFetch, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { ScreenContainer, Heading, BodyText, Button, ErrorText, TextField, Card, FieldLabel } from "../../components/ui";
import { OptionCard } from "../../components/OptionCard";
import { NoorSunMark } from "../../components/NoorSunMark";

interface FormState {
  firstName: string;
  lastName: string;
  state: string;
  whatBringsYouToNoor: NoorInterest | "";
  careType: CareType | "";
  careFormatPreference: CareFormatPreference | "";
}

const EMPTY_FORM: FormState = {
  firstName: "",
  lastName: "",
  state: "",
  whatBringsYouToNoor: "",
  careType: "",
  careFormatPreference: "",
};

const WELCOME_STEP = 0;
const FIRST_DATA_STEP = 1;
const LAST_DATA_STEP = 4;
const COMPLETION_STEP = 5;

const DATA_STEP_TITLES: Record<number, string> = {
  1: "Let's get to know you.",
  2: "What brings you to Noor?",
  3: "What kind of care are you looking for?",
  4: "How would you like to receive care?",
};

function isProfileUntouched(profile: PatientProfileDTO): boolean {
  return (
    !profile.firstName &&
    !profile.lastName &&
    !profile.state &&
    !profile.whatBringsYouToNoor &&
    !profile.careType &&
    !profile.careFormatPreference
  );
}

/** Same resume logic as the web onboarding wizard (M2) — a returning
 * patient lands on their first incomplete step, never re-asked for
 * answers already saved, REGARDLESS of which client saved them (M5
 * brief §11: "begin onboarding on web and continue on mobile, or vice
 * versa, because the backend is the source of truth"). */
function firstIncompleteDataStep(profile: PatientProfileDTO): number {
  if (!profile.firstName || !profile.lastName || !profile.state) return 1;
  if (!profile.whatBringsYouToNoor) return 2;
  if (!profile.careType) return 3;
  if (!profile.careFormatPreference) return 4;
  return COMPLETION_STEP;
}

export function OnboardingScreen() {
  const { refreshMe } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(WELCOME_STEP);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [stepError, setStepError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const profile = await apiFetch<PatientProfileDTO>("/patients/me");
        if (cancelled) return;
        setForm({
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          state: profile.state ?? "",
          whatBringsYouToNoor: profile.whatBringsYouToNoor ?? "",
          careType: profile.careType ?? "",
          careFormatPreference: profile.careFormatPreference ?? "",
        });
        setStep(isProfileUntouched(profile) ? WELCOME_STEP : firstIncompleteDataStep(profile));
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Something went wrong.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function stepPayload(): Record<string, string> {
    switch (step) {
      case 1:
        return { firstName: form.firstName.trim(), lastName: form.lastName.trim(), state: form.state };
      case 2:
        return { whatBringsYouToNoor: form.whatBringsYouToNoor };
      case 3:
        return { careType: form.careType };
      case 4:
        return { careFormatPreference: form.careFormatPreference };
      default:
        return {};
    }
  }

  function validateStep(): string | null {
    switch (step) {
      case 1:
        if (!form.firstName.trim() || !form.lastName.trim()) return "Please enter your first and last name.";
        if (!form.state) return "Please choose your state.";
        return null;
      case 2:
        return form.whatBringsYouToNoor ? null : "Please choose an option.";
      case 3:
        return form.careType ? null : "Please choose a care type.";
      case 4:
        return form.careFormatPreference ? null : "Please choose how you'd like to receive care.";
      default:
        return null;
    }
  }

  async function onContinue() {
    if (step === WELCOME_STEP) {
      setStep(FIRST_DATA_STEP);
      return;
    }
    const validationError = validateStep();
    if (validationError) {
      setStepError(validationError);
      return;
    }
    setStepError(null);
    setSubmitting(true);
    try {
      await apiFetch("/patients/me", { method: "PATCH", body: JSON.stringify(stepPayload()) });
      if (step === LAST_DATA_STEP) {
        await apiFetch("/patients/me/onboarding/complete", { method: "POST" });
        setStep(COMPLETION_STEP);
      } else {
        setStep((s) => s + 1);
      }
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function onBack() {
    setStepError(null);
    setStep((s) => Math.max(WELCOME_STEP, s - 1));
  }

  async function onFinish() {
    await refreshMe();
    setDone(true);
  }

  if (loading) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted>Loading...</BodyText>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer style={{ justifyContent: "center" }}>
        <ErrorText>{error}</ErrorText>
      </ScreenContainer>
    );
  }

  // `done` flips RootNavigator to the Main tabs the same instant refreshMe()
  // resolves — this screen doesn't navigate itself.
  if (done) return null;

  if (step === WELCOME_STEP) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <NoorSunMark size={48} />
        <Heading level={1}>Welcome to Noor.</Heading>
        <BodyText muted style={{ textAlign: "center", marginBottom: 32 }}>
          A brighter path forward.
        </BodyText>
        <Button title="Continue" onPress={onContinue} />
      </ScreenContainer>
    );
  }

  if (step === COMPLETION_STEP) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <NoorSunMark size={48} />
        <Heading level={1}>You&apos;re all set.</Heading>
        <BodyText muted style={{ textAlign: "center", marginBottom: 32 }}>
          Your Noor journey starts here.
        </BodyText>
        <Button title="Continue to Noor Home" onPress={onFinish} />
      </ScreenContainer>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
      <ScreenContainer>
        <BodyText
          muted
          accessibilityRole="progressbar"
          style={{ marginBottom: 16 }}
        >{`Step ${step - FIRST_DATA_STEP + 1} of ${LAST_DATA_STEP - FIRST_DATA_STEP + 1}`}</BodyText>

        <Card>
          <Heading level={2}>{DATA_STEP_TITLES[step]}</Heading>
          {stepError && <ErrorText>{stepError}</ErrorText>}

          {step === 1 && (
            <>
              <TextField
                label="First name"
                value={form.firstName}
                onChangeText={(v) => setForm((f) => ({ ...f, firstName: v }))}
                autoComplete="given-name"
              />
              <TextField
                label="Last name"
                value={form.lastName}
                onChangeText={(v) => setForm((f) => ({ ...f, lastName: v }))}
                autoComplete="family-name"
              />
              <FieldLabel>State</FieldLabel>
              <Picker
                selectedValue={form.state}
                onValueChange={(v) => setForm((f) => ({ ...f, state: v }))}
                accessibilityLabel="State"
              >
                <Picker.Item label="Choose your state" value="" enabled={false} />
                {US_STATES.map(([code, name]) => (
                  <Picker.Item key={code} label={name} value={code} />
                ))}
              </Picker>
            </>
          )}

          {step === 2 && (
            <>
              {NOOR_INTERESTS.map((option) => (
                <OptionCard
                  key={option}
                  label={NOOR_INTEREST_LABELS[option]}
                  selected={form.whatBringsYouToNoor === option}
                  onPress={() => setForm((f) => ({ ...f, whatBringsYouToNoor: option }))}
                />
              ))}
            </>
          )}

          {step === 3 && (
            <>
              {CARE_TYPES.map((option) => (
                <OptionCard
                  key={option}
                  label={CARE_TYPE_LABELS[option]}
                  selected={form.careType === option}
                  onPress={() => setForm((f) => ({ ...f, careType: option }))}
                />
              ))}
            </>
          )}

          {step === 4 && (
            <>
              {CARE_FORMATS.map((option) => (
                <OptionCard
                  key={option}
                  label={CARE_FORMAT_LABELS[option]}
                  selected={form.careFormatPreference === option}
                  onPress={() => setForm((f) => ({ ...f, careFormatPreference: option }))}
                />
              ))}
            </>
          )}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <Button title="Back" variant="secondary" onPress={onBack} disabled={submitting} />
            <Button
              title={submitting ? "Saving..." : step === LAST_DATA_STEP ? "Finish" : "Continue"}
              onPress={onContinue}
              disabled={submitting}
            />
          </View>
        </Card>
      </ScreenContainer>
    </ScrollView>
  );
}

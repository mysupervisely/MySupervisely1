import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
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
import { ScreenContainer, Heading, TextField, Button, ErrorText, Card, FieldLabel, LinkButton, BodyText } from "../../components/ui";
import { OptionCard } from "../../components/OptionCard";

interface FormState {
  firstName: string;
  lastName: string;
  state: string;
  whatBringsYouToNoor: NoorInterest | "";
  careType: CareType | "";
  careFormatPreference: CareFormatPreference | "";
}

// Native profile (M5 brief §15) — the exact same PATCH /patients/me
// endpoint the web profile page and the onboarding wizard both use.
// Only first name, last name, state, and care preferences are editable;
// there is no field anywhere in this screen or the request it sends for
// role, ownership, system identifiers, care relationships, or audit
// fields — those simply aren't part of this form or the schema it
// submits to (packages/types/src/onboarding.ts patientProfileUpdateSchema).
export function ProfileScreen() {
  const { signOut } = useAuth();
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      apiFetch<PatientProfileDTO>("/patients/me")
        .then((profile) => {
          if (cancelled) return;
          setForm({
            firstName: profile.firstName ?? "",
            lastName: profile.lastName ?? "",
            state: profile.state ?? "",
            whatBringsYouToNoor: profile.whatBringsYouToNoor ?? "",
            careType: profile.careType ?? "",
            careFormatPreference: profile.careFormatPreference ?? "",
          });
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Something went wrong.");
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  async function onSave() {
    if (!form) return;
    setSaveError(null);
    setSaved(false);
    setSaving(true);
    try {
      await apiFetch("/patients/me", { method: "PATCH", body: JSON.stringify(form) });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <ScreenContainer>
        <ErrorText>{error}</ErrorText>
      </ScreenContainer>
    );
  }

  if (!form) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted>Loading...</BodyText>
      </ScreenContainer>
    );
  }

  return (
    <ScrollView>
      <ScreenContainer>
        <Heading level={1}>Your profile</Heading>
        <Card>
          {saveError && <ErrorText>{saveError}</ErrorText>}
          {saved && <BodyText style={{ color: "#8a6a1f", marginBottom: 12 }}>Saved</BodyText>}

          <TextField
            label="First name"
            value={form.firstName}
            onChangeText={(v) => setForm({ ...form, firstName: v })}
            autoComplete="given-name"
          />
          <TextField
            label="Last name"
            value={form.lastName}
            onChangeText={(v) => setForm({ ...form, lastName: v })}
            autoComplete="family-name"
          />
          <FieldLabel>State</FieldLabel>
          <Picker selectedValue={form.state} onValueChange={(v) => setForm({ ...form, state: v })} accessibilityLabel="State">
            {US_STATES.map(([code, name]) => (
              <Picker.Item key={code} label={name} value={code} />
            ))}
          </Picker>

          <View style={{ marginTop: 12 }}>
            <FieldLabel>What brings you to Noor?</FieldLabel>
            {NOOR_INTERESTS.map((option) => (
              <OptionCard
                key={option}
                label={NOOR_INTEREST_LABELS[option]}
                selected={form.whatBringsYouToNoor === option}
                onPress={() => setForm({ ...form, whatBringsYouToNoor: option })}
              />
            ))}
          </View>

          <View style={{ marginTop: 8 }}>
            <FieldLabel>Care type</FieldLabel>
            {CARE_TYPES.map((option) => (
              <OptionCard
                key={option}
                label={CARE_TYPE_LABELS[option]}
                selected={form.careType === option}
                onPress={() => setForm({ ...form, careType: option })}
              />
            ))}
          </View>

          <View style={{ marginTop: 8 }}>
            <FieldLabel>Care format</FieldLabel>
            {CARE_FORMATS.map((option) => (
              <OptionCard
                key={option}
                label={CARE_FORMAT_LABELS[option]}
                selected={form.careFormatPreference === option}
                onPress={() => setForm({ ...form, careFormatPreference: option })}
              />
            ))}
          </View>

          <Button title={saving ? "Saving..." : "Save changes"} onPress={onSave} disabled={saving} />
        </Card>

        <View style={{ marginTop: 24, alignItems: "center" }}>
          <LinkButton title="Sign out" onPress={() => signOut()} />
        </View>
      </ScreenContainer>
    </ScrollView>
  );
}

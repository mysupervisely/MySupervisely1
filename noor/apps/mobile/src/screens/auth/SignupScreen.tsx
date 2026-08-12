import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/types";
import { ScreenContainer, TextField, Button, ErrorText, BodyText } from "../../components/ui";
import { useAuth } from "../../lib/AuthContext";
import { ApiError } from "../../lib/api";

type Props = NativeStackScreenProps<AuthStackParamList, "Signup">;

// Account creation always makes a PATIENT account — same as the web app
// and enforced server-side; there is no role field on this screen or in
// the request it sends (M1's privilege-escalation guard, unchanged).
export function SignupScreen({}: Props) {
  const { signUp } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signUp(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <ScreenContainer>
          <BodyText muted style={{ marginBottom: 16 }}>
            Create your Noor account to begin.
          </BodyText>
          {error && <ErrorText>{error}</ErrorText>}
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="username"
          />
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
          />
          <Button title={submitting ? "Creating account..." : "Create Account"} onPress={onSubmit} loading={submitting} />
        </ScreenContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

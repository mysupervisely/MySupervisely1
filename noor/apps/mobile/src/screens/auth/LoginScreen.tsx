import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/types";
import { ScreenContainer, TextField, Button, ErrorText, LinkButton } from "../../components/ui";
import { useAuth } from "../../lib/AuthContext";
import { ApiError } from "../../lib/api";

type Props = NativeStackScreenProps<AuthStackParamList, "Login">;

// Recreates the web app's sign-in experience (M5 brief §10): account
// creation is a separate screen, login here supports the same error/
// loading states. The RootNavigator switches to the authenticated stack
// automatically once AuthContext's status flips to "signedIn" — this
// screen never navigates "into" the app itself, only triggers signIn().
export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      // Same message regardless of whether the account exists — no
      // enumeration leak (M5 brief §10, mirroring the API's own
      // constant-shape failure path).
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
        <ScreenContainer>
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
            autoComplete="current-password"
            textContentType="password"
          />
          <Button title={submitting ? "Signing in..." : "Sign In"} onPress={onSubmit} loading={submitting} />
          <LinkButton title="Don't have an account? Create one" onPress={() => navigation.navigate("Signup")} />
        </ScreenContainer>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

import { View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { AuthStackParamList } from "../../navigation/types";
import { ScreenContainer, Heading, BodyText, Button, LinkButton } from "../../components/ui";
import { NoorSunMark } from "../../components/NoorSunMark";
import { spacing } from "../../theme";

type Props = NativeStackScreenProps<AuthStackParamList, "Welcome">;

// The launch/welcome experience (M5 brief §9): sun mark, wordmark,
// tagline, then a clear choice — sign in or create an account. No
// unnecessary delay: this renders the moment LaunchScreen has determined
// the user is unauthenticated, with no separate animated splash step.
export function WelcomeScreen({ navigation }: Props) {
  return (
    <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
      <View style={{ alignItems: "center", marginBottom: spacing.xxl }}>
        <NoorSunMark size={56} />
        <Heading level={1}>Noor</Heading>
        <BodyText muted style={{ textAlign: "center" }}>
          A brighter path forward.
        </BodyText>
      </View>

      <View style={{ width: "100%", gap: spacing.md }}>
        <Button title="Sign In" onPress={() => navigation.navigate("Login")} />
        <Button title="Create Account" variant="secondary" onPress={() => navigation.navigate("Signup")} />
      </View>
    </ScreenContainer>
  );
}

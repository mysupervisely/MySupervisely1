import { View } from "react-native";
import { NoorSunMark } from "../components/NoorSunMark";
import { Heading, BodyText } from "../components/ui";
import { colors } from "../theme";

/**
 * The launch experience (M5 brief §9): sun mark, wordmark, tagline. This
 * renders only for the brief moment AuthContext takes to check
 * SecureStore + validate any stored token against the server — there is
 * no artificial minimum-display timer or animation gating navigation, so
 * a fast/warm start moves past this screen quickly rather than padding
 * out a splash delay.
 */
export function LaunchScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.cream, alignItems: "center", justifyContent: "center" }}>
      <NoorSunMark size={56} />
      <Heading level={1}>Noor</Heading>
      <BodyText muted>A brighter path forward.</BodyText>
    </View>
  );
}

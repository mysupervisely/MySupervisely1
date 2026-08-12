import { Pressable, Text, View } from "react-native";
import { colors, fonts, minTouchTarget, radius } from "../theme";

/** A single tappable option row (radio semantics) — ported from the web
 * app's .noor-radio-card, used for both onboarding preference pickers and
 * the Check-In's SINGLE_SELECT questions, exactly as the web app reuses
 * the same class for both. */
export function OptionCard({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: minTouchTarget,
        flexDirection: "row",
        alignItems: "center",
        borderWidth: 1,
        borderColor: selected ? colors.gold : colors.borderStrong,
        backgroundColor: selected ? colors.goldTint : colors.white,
        borderRadius: radius.field,
        paddingHorizontal: 14,
        paddingVertical: 10,
        marginBottom: 8,
      }}
    >
      <View
        style={{
          width: 18,
          height: 18,
          borderRadius: 9,
          borderWidth: 2,
          borderColor: selected ? colors.goldDeep : colors.borderStrong,
          marginRight: 10,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {selected && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.goldDeep }} />}
      </View>
      <Text style={{ fontFamily: fonts.body, fontSize: 15, color: colors.ink, flexShrink: 1 }}>{label}</Text>
    </Pressable>
  );
}

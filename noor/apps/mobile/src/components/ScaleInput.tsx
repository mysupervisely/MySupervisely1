import { Pressable, Text, View } from "react-native";
import { colors, fonts, minTouchTarget, radius } from "../theme";

/**
 * The 1-10 scale control, ported from apps/patient's .noor-scale-option
 * (globals.css): the selected value is distinguished by a thicker gold
 * border, bold weight, AND a checkmark badge — deliberately not color
 * alone (WCAG 1.4.1 — M5 brief §25 "controls that do not rely only on
 * color"). Uses accessibilityRole="radio" per option and wraps the group
 * in accessibilityRole="radiogroup" so a screen reader announces it as a
 * single choice among N, matching the web app's
 * role="radiogroup"/aria-label pattern.
 */
export function ScaleInput({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
        const selected = value === n;
        return (
          <Pressable
            key={n}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            accessibilityLabel={String(n)}
            onPress={() => onChange(n)}
            style={{
              minWidth: minTouchTarget,
              minHeight: minTouchTarget,
              borderRadius: radius.field,
              borderWidth: selected ? 2 : 1,
              borderColor: selected ? colors.gold : colors.borderStrong,
              backgroundColor: selected ? colors.goldTint : colors.white,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ fontFamily: selected ? fonts.bodySemiBold : fonts.body, fontSize: 15, color: colors.ink }}>{n}</Text>
            {selected && (
              <View
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: colors.goldDeep,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.white, fontSize: 10, lineHeight: 12 }}>✓</Text>
              </View>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

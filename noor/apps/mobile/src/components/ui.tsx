// Small shared UI primitives — kept in one file (not one-component-per-
// file) deliberately, mirroring how the web app centralizes shared
// styling in globals.css rather than a component per class name. Every
// primitive here maps to a web equivalent class for visual parity:
// Button -> .noor-button, Card -> .noor-card, TextField -> .noor-field,
// ErrorText -> .noor-error (role="alert" equivalent via accessibilityRole).

import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from "react-native";
import { colors, fonts, minTouchTarget, radius, spacing } from "../theme";

export function ScreenContainer({ children, style, ...rest }: ViewProps) {
  return (
    <View style={[{ flex: 1, backgroundColor: colors.cream, padding: spacing.lg }, style]} {...rest}>
      {children}
    </View>
  );
}

export function Card({ children, muted, style, ...rest }: ViewProps & { muted?: boolean }) {
  return (
    <View
      style={[
        {
          backgroundColor: muted ? colors.creamDeep : colors.white,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.card,
          padding: spacing.lg,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

export function Heading({ children, level = 1 }: { children: React.ReactNode; level?: 1 | 2 }) {
  return (
    <Text
      accessibilityRole="header"
      style={{
        fontFamily: fonts.display,
        fontSize: level === 1 ? 30 : 22,
        color: colors.ink,
        marginBottom: spacing.sm,
      }}
    >
      {children}
    </Text>
  );
}

export function BodyText({
  children,
  muted,
  style,
  ...rest
}: { children: React.ReactNode; muted?: boolean; style?: object } & Omit<
  React.ComponentProps<typeof Text>,
  "style" | "children"
>) {
  return (
    <Text
      style={[{ fontFamily: fonts.body, fontSize: 16, color: muted ? colors.muted : colors.ink, lineHeight: 22 }, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        backgroundColor: colors.errorTint,
        borderRadius: radius.field,
        padding: spacing.md,
        marginBottom: spacing.md,
      }}
    >
      <Text style={{ fontFamily: fonts.body, color: colors.error, fontSize: 14 }}>{children}</Text>
    </View>
  );
}

interface ButtonProps extends Omit<PressableProps, "style"> {
  title: string;
  variant?: "primary" | "secondary";
  loading?: boolean;
}

export function Button({ title, variant = "primary", loading, disabled, ...rest }: ButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        minHeight: minTouchTarget,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.lg,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: isPrimary ? (pressed ? colors.goldDeep : colors.gold) : "transparent",
        borderWidth: isPrimary ? 0 : 1,
        borderColor: colors.borderStrong,
        opacity: disabled || loading ? 0.6 : 1,
      })}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : colors.gold} />
      ) : (
        <Text
          style={{
            fontFamily: fonts.bodyMedium,
            fontSize: 16,
            color: isPrimary ? colors.white : colors.ink,
          }}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

export function LinkButton({ title, ...rest }: { title: string } & PressableProps) {
  return (
    <Pressable accessibilityRole="button" style={{ minHeight: minTouchTarget, justifyContent: "center" }} {...rest}>
      <Text style={{ fontFamily: fonts.bodyMedium, color: colors.goldDeep, fontSize: 15 }}>{title}</Text>
    </Pressable>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkSoft, marginBottom: spacing.xs }}>
      {children}
    </Text>
  );
}

export function TextField({ label, style, ...rest }: TextInputProps & { label: string }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.inkSoft, marginBottom: spacing.xs }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={[
          {
            minHeight: minTouchTarget,
            borderWidth: 1,
            borderColor: colors.borderStrong,
            borderRadius: radius.field,
            paddingHorizontal: spacing.md,
            fontFamily: fonts.body,
            fontSize: 16,
            color: colors.ink,
            backgroundColor: colors.white,
          },
          style,
        ]}
        {...rest}
      />
    </View>
  );
}

export function Badge({ children, tone = "gold" }: { children: React.ReactNode; tone?: "gold" | "muted" }) {
  return (
    <View
      style={{
        alignSelf: "flex-start",
        backgroundColor: tone === "gold" ? colors.goldTint : colors.creamDeep,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 4,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.bodySemiBold,
          fontSize: 11,
          letterSpacing: 0.5,
          textTransform: "uppercase",
          color: tone === "gold" ? colors.goldDeep : colors.muted,
        }}
      >
        {children}
      </Text>
    </View>
  );
}

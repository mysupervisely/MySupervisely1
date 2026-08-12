import { useCallback, useState } from "react";
import { FlatList, Pressable, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CheckInSummaryDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { ScreenContainer, BodyText, ErrorText, Card, Badge, Button } from "../../components/ui";
import type { CheckInStackParamList } from "../../navigation/types";
import { colors, fonts, spacing } from "../../theme";

type Nav = NativeStackNavigationProp<CheckInStackParamList, "CheckInHistory">;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

// Native check-in history (M5 brief §14): patient-owned submitted
// check-ins and review status only — purely descriptive, exactly the
// same restraint as the web history page
// (apps/patient/src/app/check-in/history/page.tsx): no clinical
// interpretation, no clinician-only information (no reviewer identity,
// no internal note — those fields don't even exist on this DTO).
export function CheckInHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const [checkIns, setCheckIns] = useState<CheckInSummaryDTO[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      apiFetch<CheckInSummaryDTO[]>("/check-ins")
        .then((result) => {
          if (!cancelled) setCheckIns(result);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof ApiError ? err.message : "Something went wrong.");
        });
      return () => {
        cancelled = true;
      };
    }, []),
  );

  if (error) {
    return (
      <ScreenContainer>
        <ErrorText>{error}</ErrorText>
      </ScreenContainer>
    );
  }

  if (!checkIns) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted>Loading...</BodyText>
      </ScreenContainer>
    );
  }

  if (checkIns.length === 0) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted style={{ textAlign: "center", marginBottom: 16 }}>
          You haven&apos;t submitted a check-in yet.
        </BodyText>
        <Button title="Begin Check-In" onPress={() => navigation.navigate("CheckIn")} />
      </ScreenContainer>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.cream }}
      contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}
      data={checkIns}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <Pressable onPress={() => navigation.navigate("CheckInDetail", { checkInId: item.id })}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <BodyText style={{ fontFamily: fonts.bodySemiBold }}>{formatDate(item.submittedAt)}</BodyText>
              {item.status === "REVIEWED" && <Badge>Reviewed</Badge>}
            </View>
            <BodyText muted style={{ fontSize: 14 }}>
              Overall wellbeing {item.scores.overallWellbeing ?? "—"}/10 · Mood {item.scores.mood ?? "—"}/10 · Stress{" "}
              {item.scores.stress ?? "—"}/10 · Sleep {item.scores.sleep ?? "—"}/10
            </BodyText>
          </Card>
        </Pressable>
      )}
    />
  );
}

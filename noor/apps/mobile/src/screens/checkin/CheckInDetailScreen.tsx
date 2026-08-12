import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import type { RouteProp } from "@react-navigation/native";
import { useRoute } from "@react-navigation/native";
import type { CheckInDetailDTO, CheckInResponseDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { ScreenContainer, Heading, BodyText, ErrorText, Card, Badge } from "../../components/ui";
import type { CheckInStackParamList } from "../../navigation/types";
import { fonts } from "../../theme";

type DetailRoute = RouteProp<CheckInStackParamList, "CheckInDetail">;

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function renderAnswer(response: CheckInResponseDTO): string {
  if (response.responseType === "SCALE_1_10") {
    return response.valueNumeric !== null ? `${response.valueNumeric}/10` : "Not answered";
  }
  if (response.responseType === "SINGLE_SELECT") {
    return response.valueOptionLabel ?? "Not answered";
  }
  return response.valueText && response.valueText.length > 0 ? response.valueText : "Not answered";
}

// Read-only by construction: no input/textarea/button that could modify
// an answer exists anywhere on this screen — a submitted check-in is
// immutable (M3 brief §7), same guarantee as the web detail page.
export function CheckInDetailScreen() {
  const route = useRoute<DetailRoute>();
  const [checkIn, setCheckIn] = useState<CheckInDetailDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<CheckInDetailDTO>(`/check-ins/${route.params.checkInId}`)
      .then((result) => {
        if (!cancelled) setCheckIn(result);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) {
          setError("That check-in couldn't be found.");
        } else {
          setError(err instanceof ApiError ? err.message : "Something went wrong.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [route.params.checkInId]);

  if (error) {
    return (
      <ScreenContainer>
        <ErrorText>{error}</ErrorText>
      </ScreenContainer>
    );
  }

  if (!checkIn) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted>Loading...</BodyText>
      </ScreenContainer>
    );
  }

  return (
    <ScrollView>
      <ScreenContainer>
        <Heading level={1}>{formatDate(checkIn.submittedAt)}</Heading>
        {checkIn.status === "REVIEWED" && (
          <View style={{ marginBottom: 16 }}>
            <Badge>Reviewed by your Noor care team</Badge>
          </View>
        )}

        <View style={{ gap: 12 }}>
          {checkIn.responses.map((response) => (
            <Card key={response.questionKey} muted>
              <BodyText style={{ fontFamily: fonts.bodySemiBold }}>{response.questionPrompt}</BodyText>
              <BodyText muted>{renderAnswer(response)}</BodyText>
            </Card>
          ))}
        </View>
      </ScreenContainer>
    </ScrollView>
  );
}

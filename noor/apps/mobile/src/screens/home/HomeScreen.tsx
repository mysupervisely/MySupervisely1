import { useCallback, useState } from "react";
import { ScrollView, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { PatientProfileDTO } from "@noor/types";
import { timeOfDayGreeting } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/AuthContext";
import { ScreenContainer, Heading, BodyText, Button, Card, Badge, ErrorText } from "../../components/ui";
import type { MainTabParamList } from "../../navigation/types";

type Nav = BottomTabNavigationProp<MainTabParamList>;

// Native Noor Home (M5 brief §12) — the same concepts as the web app's
// Home (apps/patient/src/app/home/page.tsx): personalized greeting, Your
// Care, Your Noor Journey/check-in entry point, and honest future-care
// empty states. Nothing here is invented — "No provider yet" and the
// Psychiatry "Coming soon" badge are the same two states the web app
// shows, not new mobile-only content.
export function HomeScreen() {
  const navigation = useNavigation<Nav>();
  const { me } = useAuth();
  const [profile, setProfile] = useState<PatientProfileDTO | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<PatientProfileDTO>("/patients/me");
      setProfile(result);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }, []);

  // Re-fetches every time Home regains focus (e.g. returning from
  // Check-In after a submission) so the reviewed-status/journey section
  // never shows stale data — same reasoning as a web page refetching on
  // navigation, adapted to a tab-based native app that doesn't remount.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (error) {
    return (
      <ScreenContainer>
        <ErrorText>{error}</ErrorText>
      </ScreenContainer>
    );
  }

  if (!profile || !me) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted>Loading...</BodyText>
      </ScreenContainer>
    );
  }

  const displayName = profile.firstName ?? me.email;

  return (
    <ScrollView>
      <ScreenContainer>
        <Heading level={1}>
          {timeOfDayGreeting()}, {displayName}.
        </Heading>
        <BodyText muted>A brighter path forward.</BodyText>

        <View style={{ marginTop: 24 }}>
          <Heading level={2}>Your care</Heading>
          <Card>
            <Heading level={2}>No provider yet</Heading>
            <BodyText muted>Find a therapist who fits your needs.</BodyText>
            <BodyText muted style={{ marginTop: 8 }}>
              No upcoming appointments yet. Once you&apos;re matched with a provider, they&apos;ll show up here.
            </BodyText>
          </Card>
        </View>

        <View style={{ marginTop: 24 }}>
          <Heading level={2}>Your Noor journey</Heading>
          <Card muted>
            <Heading level={2}>How are things going?</Heading>
            <BodyText muted style={{ marginBottom: 16 }}>
              Take a few minutes to check in with how you&apos;ve been doing.
            </BodyText>
            <Button title="Begin Check-In" onPress={() => navigation.navigate("CheckInTab", { screen: "CheckIn" })} />
          </Card>
        </View>

        <View style={{ marginTop: 24 }}>
          <Heading level={2}>Explore care</Heading>
          <Card muted>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Heading level={2}>Psychiatry</Heading>
              <Badge tone="muted">Coming soon</Badge>
            </View>
            <BodyText muted>Psychiatric care may be available as Noor expands.</BodyText>
          </Card>
        </View>
      </ScreenContainer>
    </ScrollView>
  );
}

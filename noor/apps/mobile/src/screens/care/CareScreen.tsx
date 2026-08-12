import { ScrollView, View } from "react-native";
import { ScreenContainer, Heading, BodyText, Card, Badge } from "../../components/ui";

// The future home for provider relationship, appointments, therapy, and
// psychiatry (M5 brief §16) — today, only honest empty states, since none
// of that exists yet. No fake clinicians, appointments, availability, or
// services are invented here, matching the web app's same restraint on
// its "Explore care" section.
export function CareScreen() {
  return (
    <ScrollView>
      <ScreenContainer>
        <Heading level={1}>Care</Heading>
        <BodyText muted style={{ marginBottom: 16 }}>
          Your provider relationship, appointments, and care team will live here.
        </BodyText>

        <View style={{ gap: 12 }}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Heading level={2}>Therapy</Heading>
            </View>
            <BodyText muted>No provider yet. Provider matching isn&apos;t available on mobile yet.</BodyText>
          </Card>

          <Card muted>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
              <Heading level={2}>Psychiatry</Heading>
              <Badge tone="muted">Coming soon</Badge>
            </View>
            <BodyText muted>Psychiatric care may be available as Noor expands.</BodyText>
          </Card>

          <Card muted>
            <Heading level={2}>Appointments</Heading>
            <BodyText muted>No upcoming appointments yet.</BodyText>
          </Card>
        </View>
      </ScreenContainer>
    </ScrollView>
  );
}

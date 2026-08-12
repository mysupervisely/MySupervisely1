import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useCallback } from "react";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { CheckInQuestionDTO, CheckInDetailDTO, CheckInResponseDTO } from "@noor/types";
import { apiFetch, ApiError } from "../../lib/api";
import { ScreenContainer, Heading, BodyText, Button, ErrorText, Card, LinkButton, TextField } from "../../components/ui";
import { fonts } from "../../theme";
import { ScaleInput } from "../../components/ScaleInput";
import { OptionCard } from "../../components/OptionCard";
import { NoorSunMark } from "../../components/NoorSunMark";
import type { CheckInStackParamList } from "../../navigation/types";

type Nav = NativeStackNavigationProp<CheckInStackParamList, "CheckIn">;

type AnswerValue = number | string;
type AnswersMap = Record<string, AnswerValue>;
type Phase = "loading" | "intro" | "question" | "review" | "confirmation";

// The exact, product-approved safety sentence (M3 brief), preserved
// verbatim on native exactly as on web — this is NOT an emergency/crisis
// tool, and nothing beyond this one sentence (a specific crisis line,
// phone number) is invented here either. See
// docs/noor/M3-IMPLEMENTATION.md §9 / M5-IMPLEMENTATION.md "Check-In
// behavior."
const SAFETY_DISCLAIMER = "This check-in is not monitored continuously and should not be used for emergencies.";

function responseValue(response: CheckInResponseDTO): AnswerValue | undefined {
  if (response.valueNumeric !== null) return response.valueNumeric;
  if (response.valueOptionKey !== null) return response.valueOptionKey;
  if (response.valueText !== null) return response.valueText;
  return undefined;
}

function initialAnswersFrom(detail: CheckInDetailDTO): AnswersMap {
  const answers: AnswersMap = {};
  for (const response of detail.responses) {
    const value = responseValue(response);
    if (value !== undefined) answers[response.questionKey] = value;
  }
  return answers;
}

function firstIncompleteIndex(questions: CheckInQuestionDTO[], answers: AnswersMap): number {
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i]!;
    if (question.isRequired && answers[question.key] === undefined) return i;
  }
  return questions.length;
}

function optionLabel(question: CheckInQuestionDTO, key: string): string {
  return question.options?.find((option) => option.key === key)?.label ?? key;
}

/**
 * The native Check-In wizard (M3 brought to mobile — M5 brief §13): same
 * data-driven architecture as web (apps/patient/src/app/check-in/page.tsx)
 * — every question comes from GET /check-ins/questions, nothing about a
 * specific question is hardcoded, and POST /check-ins is the same
 * idempotent get-or-create used to both start fresh and resume an
 * in-progress draft (including a draft started on the *web* app — the
 * backend, not the client, is the source of truth).
 */
export function CheckInScreen() {
  const navigation = useNavigation<Nav>();
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<CheckInQuestionDTO[]>([]);
  const [checkInId, setCheckInId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<AnswersMap>({});
  const [stepIndex, setStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [fetchedQuestions, draft] = await Promise.all([
        apiFetch<CheckInQuestionDTO[]>("/check-ins/questions"),
        apiFetch<CheckInDetailDTO>("/check-ins", { method: "POST" }),
      ]);
      const initialAnswers = initialAnswersFrom(draft);
      setQuestions(fetchedQuestions);
      setCheckInId(draft.id);
      setAnswers(initialAnswers);
      if (Object.keys(initialAnswers).length === 0) {
        setPhase("intro");
      } else {
        const resumeIndex = firstIncompleteIndex(fetchedQuestions, initialAnswers);
        if (resumeIndex >= fetchedQuestions.length) {
          setPhase("review");
        } else {
          setStepIndex(resumeIndex);
          setPhase("question");
        }
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Re-check for a fresh draft every time this tab regains focus after
  // a submission — otherwise returning here would still show the just-
  // submitted (now-immutable) check-in's stale in-memory state.
  useFocusEffect(
    useCallback(() => {
      if (phase === "confirmation") {
        setPhase("loading");
        load();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  async function saveAnswer(key: string, value: AnswerValue) {
    if (!checkInId) return;
    await apiFetch(`/check-ins/${checkInId}/responses`, { method: "PATCH", body: JSON.stringify({ [key]: value }) });
  }

  function setAnswer(key: string, value: AnswerValue) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  async function onContinue() {
    const question = questions[stepIndex];
    if (!question) return;
    const value = answers[question.key];
    if (question.isRequired && (value === undefined || value === "")) {
      setStepError("Please answer before continuing.");
      return;
    }
    setStepError(null);
    setSaving(true);
    try {
      if (value !== undefined && value !== "") await saveAnswer(question.key, value);
      if (stepIndex === questions.length - 1) {
        setPhase("review");
      } else {
        setStepIndex((i) => i + 1);
      }
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function onBack() {
    const question = questions[stepIndex];
    if (question) {
      const value = answers[question.key];
      if (value !== undefined && value !== "") await saveAnswer(question.key, value).catch(() => undefined);
    }
    setStepError(null);
    if (stepIndex === 0) {
      setPhase("intro");
    } else {
      setStepIndex((i) => i - 1);
    }
  }

  async function onSubmit() {
    if (!checkInId) return;
    setStepError(null);
    setSaving(true);
    try {
      await apiFetch<CheckInDetailDTO>(`/check-ins/${checkInId}/submit`, { method: "POST" });
      setPhase("confirmation");
    } catch (err) {
      setStepError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (error) {
    return (
      <ScreenContainer>
        <ErrorText>{error}</ErrorText>
      </ScreenContainer>
    );
  }

  if (phase === "loading") {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted>Loading...</BodyText>
      </ScreenContainer>
    );
  }

  if (phase === "intro") {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <NoorSunMark size={48} />
        <Heading level={1}>Noor Check-In</Heading>
        <BodyText muted style={{ textAlign: "center", marginBottom: 24 }}>
          Take a few minutes to check in with how you&apos;ve been doing. Your responses help your care team stay
          connected with you between sessions.
        </BodyText>
        <Button title="Begin Check-In" onPress={() => setPhase("question")} />
        <BodyText muted style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
          {SAFETY_DISCLAIMER}
        </BodyText>
      </ScreenContainer>
    );
  }

  if (phase === "confirmation") {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <NoorSunMark size={48} />
        <Heading level={1}>Your check-in has been submitted.</Heading>
        <BodyText muted style={{ textAlign: "center", marginBottom: 24 }}>
          Your care team can review your responses.
        </BodyText>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <Button title="View History" variant="secondary" onPress={() => navigation.navigate("CheckInHistory")} />
        </View>
        <BodyText muted style={{ fontSize: 13, textAlign: "center", marginTop: 24 }}>
          {SAFETY_DISCLAIMER}
        </BodyText>
      </ScreenContainer>
    );
  }

  if (phase === "review") {
    return (
      <ScrollView>
        <ScreenContainer>
          <Heading level={1}>Review your check-in</Heading>
          <BodyText muted>Take a look before submitting. You can edit any answer.</BodyText>
          {stepError && <ErrorText>{stepError}</ErrorText>}

          <View style={{ gap: 12, marginTop: 8 }}>
            {questions.map((question, index) => {
              const value = answers[question.key];
              const hasValue = value !== undefined && value !== "";
              let display: string;
              if (!hasValue) display = "Not answered";
              else if (question.responseType === "SCALE_1_10") display = `${value}/10`;
              else if (question.responseType === "SINGLE_SELECT") display = optionLabel(question, String(value));
              else display = String(value);

              return (
                <Card key={question.key} muted>
                  <BodyText style={{ fontFamily: fonts.bodySemiBold }}>{question.promptText}</BodyText>
                  <BodyText muted>{display}</BodyText>
                  <LinkButton
                    title="Edit"
                    onPress={() => {
                      setStepError(null);
                      setStepIndex(index);
                      setPhase("question");
                    }}
                  />
                </Card>
              );
            })}
          </View>

          <BodyText muted style={{ fontSize: 13, marginTop: 16 }}>
            {SAFETY_DISCLAIMER}
          </BodyText>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <Button title="Back" variant="secondary" onPress={() => setPhase("question")} disabled={saving} />
            <Button title={saving ? "Submitting..." : "Submit Check-In"} onPress={onSubmit} disabled={saving} />
          </View>
        </ScreenContainer>
      </ScrollView>
    );
  }

  const question = questions[stepIndex];
  if (!question) {
    return (
      <ScreenContainer style={{ justifyContent: "center", alignItems: "center" }}>
        <BodyText muted>Loading...</BodyText>
      </ScreenContainer>
    );
  }
  const value = answers[question.key];

  return (
    <ScrollView>
      <ScreenContainer>
        <BodyText muted style={{ marginBottom: 12 }}>{`Question ${stepIndex + 1} of ${questions.length}`}</BodyText>

        <Card>
          <Heading level={2}>{question.promptText}</Heading>
          {stepError && <ErrorText>{stepError}</ErrorText>}

          {question.responseType === "SCALE_1_10" && (
            <ScaleInput
              label={question.promptText}
              value={typeof value === "number" ? value : null}
              onChange={(n) => setAnswer(question.key, n)}
            />
          )}

          {question.responseType === "SINGLE_SELECT" &&
            (question.options ?? []).map((option) => (
              <OptionCard
                key={option.key}
                label={option.label}
                selected={value === option.key}
                onPress={() => setAnswer(question.key, option.key)}
              />
            ))}

          {question.responseType === "FREE_TEXT" && (
            <TextField
              label="Your answer (optional)"
              value={typeof value === "string" ? value : ""}
              onChangeText={(text) => setAnswer(question.key, text)}
              multiline
              numberOfLines={4}
              style={{ minHeight: 88, textAlignVertical: "top", paddingTop: 12 }}
            />
          )}

          <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
            <Button title="Back" variant="secondary" onPress={onBack} disabled={saving} />
            <Button title={saving ? "Saving..." : "Continue"} onPress={onContinue} disabled={saving} />
          </View>
        </Card>
      </ScreenContainer>
    </ScrollView>
  );
}

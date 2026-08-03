"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { TextField } from "@/components/ui/TextField";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { API_URL } from "@/lib/api";

interface ReferenceMatch {
  id: string;
  name: string;
  strength: string | null;
  dosageForm: string | null;
}

interface MedicationFormValues {
  name: string;
  strength: string;
  dosageForm: string;
  directions: string;
  frequency: string;
  route: string;
  startDate: string;
  endDate: string;
  notes: string;
}

interface MedicationFormProps {
  mode: "create" | "edit";
  medicationId?: string;
  initialValues?: MedicationFormValues;
}

const emptyValues: MedicationFormValues = {
  name: "",
  strength: "",
  dosageForm: "",
  directions: "",
  frequency: "",
  route: "",
  startDate: "",
  endDate: "",
  notes: "",
};

export function MedicationForm({ mode, medicationId, initialValues }: MedicationFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<MedicationFormValues>(initialValues ?? emptyValues);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<ReferenceMatch[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  function setField<K extends keyof MedicationFormValues>(field: K, value: MedicationFormValues[K]) {
    setValues((prev) => ({ ...prev, [field]: value }));
  }

  function handleNameChange(value: string) {
    setField("name", value);
    setShowSuggestions(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setSuggestions([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      try {
        const response = await fetch(
          `${API_URL}/medications/reference?q=${encodeURIComponent(value)}`,
          { credentials: "include" },
        );
        if (!response.ok) return;
        const data = await response.json();
        setSuggestions(data.results ?? []);
      } catch {
        // Autocomplete is a convenience; silently ignore network errors.
      }
    }, 250);
  }

  function selectSuggestion(match: ReferenceMatch) {
    setValues((prev) => ({
      ...prev,
      name: match.name,
      strength: match.strength ?? prev.strength,
      dosageForm: match.dosageForm ?? prev.dosageForm,
    }));
    setShowSuggestions(false);
    setSuggestions([]);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors([]);
    setLoading(true);

    const payload = {
      name: values.name,
      strength: values.strength,
      dosageForm: values.dosageForm,
      directions: values.directions,
      frequency: values.frequency,
      route: values.route,
      startDate: values.startDate,
      endDate: values.endDate || undefined,
      notes: values.notes || undefined,
    };

    try {
      const url = mode === "create" ? `${API_URL}/medications` : `${API_URL}/medications/${medicationId}`;
      const response = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const details: string[] | undefined = body?.details?.fieldErrors
          ? Object.values(body.details.fieldErrors).flat() as string[]
          : undefined;
        setErrors(details?.length ? details : [body?.error ?? "Something went wrong. Please try again."]);
        return;
      }

      router.push("/medications");
      router.refresh();
    } catch {
      setErrors(["Could not reach the server. Please try again."]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="relative">
        <TextField
          id="name"
          label="Medication name"
          value={values.name}
          onChange={(e) => handleNameChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
          autoComplete="off"
          required
        />
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-surface shadow-md">
            <div className="flex items-center gap-2 border-b border-border px-3 py-1.5">
              <Badge tone="neutral">Synthetic data</Badge>
              <span className="text-xs text-ink-muted">Demo suggestions only</span>
            </div>
            <ul>
              {suggestions.map((match) => (
                <li key={match.id}>
                  <button
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent-light"
                    onMouseDown={() => selectSuggestion(match)}
                  >
                    <span className="font-medium text-ink">{match.name}</span>
                    {(match.strength || match.dosageForm) && (
                      <span className="text-xs text-ink-muted">
                        {[match.strength, match.dosageForm].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <TextField
        id="strength"
        label="Strength"
        placeholder="e.g. 10 mg"
        value={values.strength}
        onChange={(e) => setField("strength", e.target.value)}
        required
      />
      <TextField
        id="dosageForm"
        label="Dosage form"
        placeholder="e.g. Tablet"
        value={values.dosageForm}
        onChange={(e) => setField("dosageForm", e.target.value)}
        required
      />
      <TextField
        id="directions"
        label="Directions"
        placeholder="e.g. Take one tablet by mouth once daily."
        value={values.directions}
        onChange={(e) => setField("directions", e.target.value)}
        required
      />
      <TextField
        id="frequency"
        label="Frequency"
        placeholder="e.g. Once daily"
        value={values.frequency}
        onChange={(e) => setField("frequency", e.target.value)}
        required
      />
      <TextField
        id="route"
        label="Route"
        placeholder="e.g. Oral"
        value={values.route}
        onChange={(e) => setField("route", e.target.value)}
        required
      />
      <TextField
        id="startDate"
        label="Start date"
        type="date"
        value={values.startDate}
        onChange={(e) => setField("startDate", e.target.value)}
        required
      />
      <TextField
        id="endDate"
        label="End date (optional)"
        type="date"
        value={values.endDate}
        onChange={(e) => setField("endDate", e.target.value)}
      />
      <TextField
        id="notes"
        label="Notes (optional)"
        value={values.notes}
        onChange={(e) => setField("notes", e.target.value)}
      />

      {errors.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-danger">
          {errors.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}

      <Button type="submit" fullWidth disabled={loading}>
        {loading ? "Saving…" : "Save Medication"}
      </Button>
    </form>
  );
}

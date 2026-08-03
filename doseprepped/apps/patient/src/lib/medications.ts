import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";

export type MedicationStatus = "ACTIVE" | "INACTIVE";

export interface Medication {
  id: string;
  name: string;
  strength: string;
  dosageForm: string;
  directions: string;
  frequency: string;
  route: string;
  startDate: string;
  endDate: string | null;
  notes: string | null;
  status: MedicationStatus;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

async function apiFetch(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
}

export async function getMedications(): Promise<Medication[]> {
  const response = await apiFetch("/medications");
  if (!response.ok) return [];
  const data = (await response.json()) as { medications: Medication[] };
  return data.medications;
}

export async function getMedication(id: string): Promise<Medication | null> {
  const response = await apiFetch(`/medications/${encodeURIComponent(id)}`);
  if (!response.ok) return null;
  const data = (await response.json()) as { medication: Medication };
  return data.medication;
}

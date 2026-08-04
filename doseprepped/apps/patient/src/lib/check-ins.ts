import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "./api";

export type CheckInResponseValue = "DOING_WELL" | "HAVING_SOME_ISSUES" | "HAVING_SIGNIFICANT_ISSUES" | "HAS_A_QUESTION";

export interface CheckIn {
  id: string;
  medicationId: string;
  response: CheckInResponseValue;
  notes: string | null;
  createdAt: string;
}

async function apiFetch(path: string): Promise<Response> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  return fetch(`${API_URL}${path}`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });
}

export async function getCheckIns(medicationId: string): Promise<CheckIn[]> {
  const response = await apiFetch(`/medications/${encodeURIComponent(medicationId)}/check-ins`);
  if (!response.ok) return [];
  const data = (await response.json()) as { checkIns: CheckIn[] };
  return data.checkIns;
}

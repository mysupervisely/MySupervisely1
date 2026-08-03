import "server-only";
import { cookies } from "next/headers";
import type { Role } from "@doseprepped/types";
import { API_URL } from "./api";

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  createdAt: string;
}

/**
 * Resolves the signed-in user for the current request by forwarding the
 * incoming cookies to the API's /auth/me endpoint. The API is the only
 * thing that ever reads the sessions table — this keeps a single
 * authoritative auth check shared by both the API and this frontend.
 */
export async function getServerSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return null;

  const response = await fetch(`${API_URL}/auth/me`, {
    headers: { cookie: cookieHeader },
    cache: "no-store",
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { user: SessionUser };
  return data.user;
}

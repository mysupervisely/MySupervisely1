import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

async function requireToken(req: Request, url: URL): Promise<string | null> {
  const token = url.searchParams.get("token") || req.headers.get("x-access-token");
  if (!token) return null;
  const accessStore = getStore("access-tokens");
  const record = await accessStore.get(`token:${token}`, { type: "json" });
  return record ? token : null;
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const token = await requireToken(req, url);
  if (!token) {
    return new Response(JSON.stringify({ error: "Invalid or missing access token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isShared = url.searchParams.get("shared") === "true";
  // Shared data lives in a global store under the raw key (reused across all users, e.g. cached exam questions).
  // Private data lives in a per-user store, keyed by that user's access token.
  const store = isShared ? getStore("shared-data") : getStore("user-progress");

  if (req.method === "GET") {
    const key = url.searchParams.get("key");
    if (key) {
      const storageKey = isShared ? key : `${token}:${key}`;
      const value = await store.get(storageKey, { type: "json" });
      return new Response(JSON.stringify({ value: value ?? null }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    const prefix = url.searchParams.get("prefix") || "";
    const listPrefix = isShared ? prefix : `${token}:${prefix}`;
    const { blobs } = await store.list({ prefix: listPrefix });
    const keys = blobs.map((b) => (isShared ? b.key : b.key.replace(`${token}:`, "")));
    return new Response(JSON.stringify({ keys }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method === "POST") {
    const body = await req.json();
    const { key, value } = body;
    const shared = body.shared === true;
    const targetStore = shared ? getStore("shared-data") : getStore("user-progress");
    if (!key) {
      return new Response(JSON.stringify({ error: "Missing key" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    const storageKey = shared ? key : `${token}:${key}`;
    await targetStore.setJSON(storageKey, value);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = {
  path: "/api/progress",
};

import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Require a valid access token before allowing question generation (keeps API costs gated to paying users).
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || req.headers.get("x-access-token");
  if (!token) {
    return new Response(JSON.stringify({ error: "Access token required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const accessStore = getStore("access-tokens");
  const record = await accessStore.get(`token:${token}`, { type: "json" });
  if (!record) {
    return new Response(JSON.stringify({ error: "Invalid or expired access token" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const apiKey = Netlify.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "AI generation not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Accept the same request shape the client already builds: { model, max_tokens, messages }.
    // The model is pinned server-side regardless of what the client sends, so it can't be tampered with.
    const body = await req.json();
    const messages = body.messages;
    const maxTokens = body.max_tokens || 1000;

    if (!messages || !Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: "Missing messages" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: maxTokens,
        messages,
      }),
    });

    const data = await anthropicRes.json();

    if (!anthropicRes.ok) {
      return new Response(JSON.stringify({ error: data.error?.message || "AI generation failed" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Request failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/generate-question",
};

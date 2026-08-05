import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing session_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const secretKey = Netlify.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    return new Response(JSON.stringify({ error: "Stripe not configured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const stripeRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${sessionId}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const session = await stripeRes.json();

    if (!stripeRes.ok || session.payment_status !== "paid") {
      return new Response(JSON.stringify({ valid: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Payment confirmed. Issue (or reuse) an access token tied to this checkout session.
    const accessStore = getStore("access-tokens");
    const existing = await accessStore.get(`session:${sessionId}`, { type: "json" });

    let token: string;
    if (existing && existing.token) {
      token = existing.token;
    } else {
      token = crypto.randomUUID();
      await accessStore.setJSON(`session:${sessionId}`, { token, email: session.customer_details?.email || null });
      await accessStore.setJSON(`token:${token}`, {
        email: session.customer_details?.email || null,
        sessionId,
        createdAt: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ valid: true, token }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: "Verification failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config: Config = {
  path: "/api/verify-session",
};

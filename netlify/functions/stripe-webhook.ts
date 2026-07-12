import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const signature = event.headers['stripe-signature']
  if (!signature) {
    return { statusCode: 400, body: 'Missing Stripe signature' }
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  // Stripe signature verification needs the exact raw body bytes, not a re-serialized object.
  const rawBody = event.isBase64Encoded ? Buffer.from(event.body || '', 'base64') : event.body || ''

  let stripeEvent: Stripe.Event
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    return { statusCode: 400, body: `Webhook signature verification failed: ${(err as Error).message}` }
  }

  if (stripeEvent.type === 'checkout.session.completed') {
    const session = stripeEvent.data.object as Stripe.Checkout.Session
    const matchId = session.metadata?.match_id

    if (!matchId) {
      return { statusCode: 400, body: 'Missing match_id in session metadata' }
    }

    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

    const { error: paymentError } = await supabase
      .from('payments')
      .update({
        status: 'succeeded',
        stripe_payment_intent_id:
          typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
      })
      .eq('stripe_session_id', session.id)

    if (paymentError) {
      return { statusCode: 500, body: 'Failed to update payment' }
    }

    const { error: matchUpdateError } = await supabase
      .from('matches')
      .update({ state: 'revealed' })
      .eq('id', matchId)

    if (matchUpdateError) {
      return { statusCode: 500, body: 'Failed to update match' }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) }
}

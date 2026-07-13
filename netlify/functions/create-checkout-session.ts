import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Fees in cents, keyed by matches.match_type
const FEES_CENTS: Record<string, number> = {
  supervision: 20000,
  placement: 90000,
  fullmatch: 75000,
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let matchId: string | undefined
  try {
    ;({ match_id: matchId } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }
  if (!matchId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'match_id is required' }) }
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, match_type, state')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Match not found' }) }
  }

  const amount = FEES_CENTS[match.match_type]
  if (!amount) {
    return { statusCode: 400, body: JSON.stringify({ error: `Unknown match_type: ${match.match_type}` }) }
  }

  if (match.state === 'revealed') {
    return { statusCode: 409, body: JSON.stringify({ error: 'Match has already been paid for and revealed' }) }
  }

  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || 'http://localhost:8888'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          unit_amount: amount,
          product_data: {
            name: `MySupervisely ${match.match_type} match fee`,
          },
        },
        quantity: 1,
      },
    ],
    metadata: { match_id: matchId },
    success_url: `${siteUrl}/?checkout=success&match_id=${matchId}`,
    cancel_url: `${siteUrl}/?checkout=cancelled&match_id=${matchId}`,
  })

  const { error: paymentError } = await supabase.from('payments').insert({
    match_id: matchId,
    amount,
    currency: 'usd',
    status: 'pending',
    stripe_session_id: session.id,
  })

  if (paymentError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to record payment' }) }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ url: session.url }),
  }
}

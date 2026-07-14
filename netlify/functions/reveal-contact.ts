import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  const authHeader = event.headers.authorization || event.headers.Authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Missing or invalid Authorization header' }) }
  }
  const accessToken = authHeader.replace('Bearer ', '')

  let matchId: string | undefined
  try {
    ;({ match_id: matchId } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }
  if (!matchId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'match_id is required' }) }
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

  // Verify the caller's identity from their access token
  const { data: userData, error: userError } = await supabase.auth.getUser(accessToken)
  if (userError || !userData?.user) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired session' }) }
  }
  const callerId = userData.user.id

  // Look up the match and confirm it's actually revealed
  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, state, intern_id, supervisor_id')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Match not found' }) }
  }

  if (callerId !== match.intern_id && callerId !== match.supervisor_id) {
    return { statusCode: 403, body: JSON.stringify({ error: 'You are not a participant in this match' }) }
  }

  if (match.state !== 'revealed') {
    return { statusCode: 403, body: JSON.stringify({ error: 'Contact info is not available until this match is revealed', current_state: match.state }) }
  }

  // Figure out who the OTHER person is, and return their real contact info
  const otherPersonId = callerId === match.intern_id ? match.supervisor_id : match.intern_id

  const { data: otherProfile, error: profileError } = await supabase
    .from('profiles')
    .select('real_name, email, phone, display_name')
    .eq('id', otherPersonId)
    .single()

  if (profileError || !otherProfile) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not load contact info' }) }
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      name: otherProfile.real_name || otherProfile.display_name,
      email: otherProfile.email,
      phone: otherProfile.phone,
    }),
  }
}

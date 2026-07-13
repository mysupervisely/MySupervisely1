import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let matchId: string | undefined
  let profileId: string | undefined
  let goodFit: boolean | undefined
  let moveForward: string | undefined
  let rating: number | undefined
  let notes: string | undefined

  try {
    ;({
      match_id: matchId,
      profile_id: profileId,
      good_fit: goodFit,
      move_forward: moveForward,
      rating,
      notes,
    } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  if (!matchId || !profileId || !moveForward) {
    return { statusCode: 400, body: JSON.stringify({ error: 'match_id, profile_id, and move_forward are required' }) }
  }
  if (!['yes', 'no', 'not_sure'].includes(moveForward)) {
    return { statusCode: 400, body: JSON.stringify({ error: "move_forward must be 'yes', 'no', or 'not_sure'" }) }
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, intern_id, supervisor_id, state')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Match not found' }) }
  }

  if (profileId !== match.intern_id && profileId !== match.supervisor_id) {
    return { statusCode: 403, body: JSON.stringify({ error: 'profile_id is not a participant in this match' }) }
  }

  // Upsert this person's response (one row per person per match, per the schema's unique constraint)
  const { error: surveyError } = await supabase
    .from('survey_responses')
    .upsert(
      { match_id: matchId, profile_id: profileId, good_fit: goodFit ?? null, move_forward: moveForward, rating: rating ?? null, notes: notes ?? null },
      { onConflict: 'match_id,profile_id' }
    )

  if (surveyError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to save survey response', detail: surveyError.message }) }
  }

  // Check both responses now
  const { data: responses, error: responsesError } = await supabase
    .from('survey_responses')
    .select('profile_id, move_forward')
    .eq('match_id', matchId)

  if (responsesError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to load responses', detail: responsesError.message }) }
  }

  const internResponse = responses?.find((r: any) => r.profile_id === match.intern_id)
  const supervisorResponse = responses?.find((r: any) => r.profile_id === match.supervisor_id)

  let newState = match.state

  if (internResponse && supervisorResponse) {
    if (internResponse.move_forward === 'yes' && supervisorResponse.move_forward === 'yes') {
      newState = 'matched'
    } else if (internResponse.move_forward === 'no' || supervisorResponse.move_forward === 'no') {
      newState = 'closed'
    }
    // if either is 'not_sure' and neither is 'no', leave state as survey_pending for a follow-up round
  }

  if (newState !== match.state) {
    await supabase.from('matches').update({ state: newState }).eq('id', matchId)
  }

  return {
    statusCode: 200,
    body: JSON.stringify({
      saved: true,
      both_responded: !!(internResponse && supervisorResponse),
      match_state: newState,
    }),
  }
}

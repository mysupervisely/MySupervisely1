import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

async function createMeetingToken(roomName: string, userName: string, expUnix: number): Promise<string> {
  const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        user_name: userName,
        is_owner: false,
        exp: expUnix,
      },
    }),
  })
  if (!res.ok) {
    throw new Error(`Failed to create meeting token: ${await res.text()}`)
  }
  const data = await res.json()
  return data.token
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let matchId: string | undefined
  let scheduledAt: string | undefined
  try {
    ;({ match_id: matchId, scheduled_at: scheduledAt } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }
  if (!matchId || !scheduledAt) {
    return { statusCode: 400, body: JSON.stringify({ error: 'match_id and scheduled_at are required' }) }
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!)

  const { data: match, error: matchError } = await supabase
    .from('matches')
    .select('id, state, intern_id, supervisor_id')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Match not found' }) }
  }

  const { data: participants, error: participantsError } = await supabase
    .from('profiles')
    .select('id, display_name')
    .in('id', [match.intern_id, match.supervisor_id])

  if (participantsError || !participants || participants.length < 2) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Could not load participant profiles' }) }
  }

  const internProfile = participants.find((p: any) => p.id === match.intern_id)
  const supervisorProfile = participants.find((p: any) => p.id === match.supervisor_id)

  const roomName = `match-${matchId.slice(0, 8)}-${Date.now()}`
  const expUnix = Math.floor(new Date(scheduledAt).getTime() / 1000) + 60 * 60 * 2

  const dailyRes = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: roomName,
      privacy: 'private',
      properties: {
        exp: expUnix,
        enable_chat: false,
        enable_screenshare: false,
      },
    }),
  })

  if (!dailyRes.ok) {
    const errText = await dailyRes.text()
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create video room', detail: errText }) }
  }

  const room = await dailyRes.json()

  let internToken: string
  let supervisorToken: string
  try {
    internToken = await createMeetingToken(roomName, internProfile?.display_name || 'Intern', expUnix)
    supervisorToken = await createMeetingToken(roomName, supervisorProfile?.display_name || 'Supervisor', expUnix)
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to create meeting tokens', detail: err.message }) }
  }

  const internJoinUrl = `${room.url}?t=${internToken}`
  const supervisorJoinUrl = `${room.url}?t=${supervisorToken}`

  const { error: bookingError } = await supabase.from('bookings').insert({
    match_id: matchId,
    scheduled_at: scheduledAt,
    video_room_url: room.url,
    video_room_name: room.name,
    intern_join_url: internJoinUrl,
    supervisor_join_url: supervisorJoinUrl,
    status: 'scheduled',
  })

  if (bookingError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to record booking', detail: bookingError.message }) }
  }

  await supabase.from('matches').update({ state: 'booked' }).eq('id', matchId)

  return {
    statusCode: 200,
    body: JSON.stringify({
      intern_join_url: internJoinUrl,
      supervisor_join_url: supervisorJoinUrl,
      scheduled_at: scheduledAt,
    }),
  }
}

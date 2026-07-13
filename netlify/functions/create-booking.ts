import type { Handler } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

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
    .select('id, state')
    .eq('id', matchId)
    .single()

  if (matchError || !match) {
    return { statusCode: 404, body: JSON.stringify({ error: 'Match not found' }) }
  }

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
      privacy: 'public',
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

  const { error: bookingError } = await supabase.from('bookings').insert({
    match_id: matchId,
    scheduled_at: scheduledAt,
    video_room_url: room.url,
    video_room_name: room.name,
    status: 'scheduled',
  })

  if (bookingError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to record booking', detail: bookingError.message }) }
  }

  await supabase.from('matches').update({ state: 'booked' }).eq('id', matchId)

  return {
    statusCode: 200,
    body: JSON.stringify({ video_room_url: room.url, scheduled_at: scheduledAt }),
  }
}

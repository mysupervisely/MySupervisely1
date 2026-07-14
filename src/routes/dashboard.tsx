import { useEffect, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/dashboard')({
  component: DashboardPage,
})

type Profile = {
  id: string
  display_name: string
  role: string
  specialty: string | null
  location: string | null
}

type Match = {
  id: string
  match_type: string
  state: string
  intern_id: string
  supervisor_id: string
}

type ContactInfo = {
  name: string
  email: string
  phone: string | null
}

function DashboardPage() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string | null>(null)
  const [accessToken, setAccessToken] = useState<string | null>(null)
  const [matches, setMatches] = useState<Match[]>([])
  const [otherProfiles, setOtherProfiles] = useState<Record<string, Profile>>({})
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session

      if (!session) {
        navigate({ to: '/login' })
        return
      }

      if (cancelled) return
      setUserId(session.user.id)
      setAccessToken(session.access_token)

      const { data: matchRows, error: matchError } = await supabase
        .from('matches')
        .select('id, match_type, state, intern_id, supervisor_id')
        .or(`intern_id.eq.${session.user.id},supervisor_id.eq.${session.user.id}`)
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (matchError) {
        setError('Could not load your matches. Please refresh and try again.')
        setLoading(false)
        return
      }

      const rows = (matchRows || []) as Match[]
      setMatches(rows)

      const otherIds = rows.map((m) => (m.intern_id === session.user.id ? m.supervisor_id : m.intern_id))
      const uniqueOtherIds = [...new Set(otherIds)]

      if (uniqueOtherIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('public_profiles')
          .select('id, display_name, role, specialty, location')
          .in('id', uniqueOtherIds)

        if (!cancelled && profileRows) {
          const map: Record<string, Profile> = {}
          for (const p of profileRows as Profile[]) map[p.id] = p
          setOtherProfiles(map)
        }
      }

      if (!cancelled) setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [navigate])

  if (loading) {
    return (
      <div className="audience-hero">
        <p className="section-sub">Loading your matches...</p>
      </div>
    )
  }

  return (
    <div className="audience-hero">
      <p className="section-label">Your Account</p>
      <h1 className="section-title">Your Matches</h1>
      <p className="section-sub">
        {matches.length === 0
          ? "You don't have any matches yet. We'll notify you as soon as we find one."
          : `${matches.length} match${matches.length === 1 ? '' : 'es'} so far.`}
      </p>

      {error && <p style={{ color: '#B54545', marginTop: '1rem' }}>{error}</p>}

      <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '640px' }}>
        {matches.map((match: Match) =>
          userId ? (
            <MatchCard key={match.id} match={match} userId={userId} accessToken={accessToken} otherProfile={otherProfiles[match.intern_id === userId ? match.supervisor_id : match.intern_id]} />
          ) : null
        )}
      </div>
    </div>
  )
}

function MatchCard({
  match,
  userId,
  accessToken,
  otherProfile,
}: {
  match: Match
  userId: string
  accessToken: string | null
  otherProfile?: Profile
}) {
  const [busy, setBusy] = useState(false)
  const [localError, setLocalError] = useState('')
  const [contact, setContact] = useState<ContactInfo | null>(null)
  const [scheduledAt, setScheduledAt] = useState('')
  const [bookingResult, setBookingResult] = useState<{ intern_join_url: string; supervisor_join_url: string } | null>(null)
  const [surveySubmitted, setSurveySubmitted] = useState(false)

  const isIntern = match.intern_id === userId

  const handleBook = async () => {
    if (!scheduledAt) {
      setLocalError('Please pick a date and time first.')
      return
    }
    setBusy(true)
    setLocalError('')
    try {
      const res = await fetch('/api/booking', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: match.id, scheduled_at: new Date(scheduledAt).toISOString() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Booking failed')
      setBookingResult(data)
    } catch (err: any) {
      setLocalError(err.message || 'Something went wrong booking this call.')
    } finally {
      setBusy(false)
    }
  }

  const handleSurvey = async (moveForward: 'yes' | 'no') => {
    setBusy(true)
    setLocalError('')
    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: match.id, profile_id: userId, move_forward: moveForward, good_fit: moveForward === 'yes' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Survey submission failed')
      setSurveySubmitted(true)
    } catch (err: any) {
      setLocalError(err.message || 'Something went wrong submitting your response.')
    } finally {
      setBusy(false)
    }
  }

  const handlePay = async () => {
    setBusy(true)
    setLocalError('')
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ match_id: match.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not start checkout')
      window.location.href = data.url
    } catch (err: any) {
      setLocalError(err.message || 'Something went wrong starting checkout.')
      setBusy(false)
    }
  }

  const handleReveal = async () => {
    if (!accessToken) return
    setBusy(true)
    setLocalError('')
    try {
      const res = await fetch('/api/reveal-contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ match_id: match.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load contact info')
      setContact(data)
    } catch (err: any) {
      setLocalError(err.message || 'Something went wrong loading contact info.')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (match.state === 'revealed' && !contact) {
      handleReveal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.state])

  return (
    <div style={{ background: 'var(--white)', border: '1px solid var(--sand)', borderRadius: '16px', padding: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 500, fontSize: '1.1rem' }}>{otherProfile?.display_name || 'Match'}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--clay)' }}>
            {otherProfile?.specialty || ''}{otherProfile?.location ? ` · ${otherProfile.location}` : ''}
          </div>
        </div>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--sage)' }}>
          {match.state}
        </div>
      </div>

      {localError && <p style={{ color: '#B54545', fontSize: '0.85rem', marginTop: '1rem' }}>{localError}</p>}

      {match.state === 'suggested' && !bookingResult && (
        <div style={{ marginTop: '1rem' }}>
          <label htmlFor={`when-${match.id}`} style={{ display: 'block', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Pick a time for a masked video intro</label>
          <input
            id={`when-${match.id}`}
            type="datetime-local"
            value={scheduledAt}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setScheduledAt(e.target.value)}
            style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--sand)', marginBottom: '0.75rem' }}
          />
          <button className="btn-primary" onClick={handleBook} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Booking...' : 'Book a video intro'}
          </button>
        </div>
      )}

      {bookingResult && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>You're booked! Here's your link:</p>
          <a
            href={isIntern ? bookingResult.intern_join_url : bookingResult.supervisor_join_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            style={{ display: 'inline-block' }}
          >
            Join video call ↗
          </a>
        </div>
      )}

      {match.state === 'booked' && !surveySubmitted && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>How did the call go? Do you want to move forward?</p>
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button className="btn-primary" onClick={() => handleSurvey('yes')} disabled={busy}>Yes, let's go</button>
            <button className="btn-secondary" onClick={() => handleSurvey('no')} disabled={busy}>Not a fit</button>
          </div>
        </div>
      )}

      {surveySubmitted && match.state === 'booked' && (
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--sage)' }}>Thanks! We'll let you know once both sides have responded.</p>
      )}

      {match.state === 'matched' && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>You both said yes! Complete payment to unlock contact info.</p>
          <button className="btn-primary" onClick={handlePay} disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Starting checkout...' : 'Confirm & Pay'}
          </button>
        </div>
      )}

      {match.state === 'closed' && (
        <p style={{ marginTop: '1rem', fontSize: '0.9rem', color: 'var(--clay)' }}>This match didn't move forward. We'll keep looking for your next one.</p>
      )}

      {match.state === 'revealed' && (
        <div style={{ marginTop: '1rem' }}>
          {contact ? (
            <div style={{ background: 'var(--linen)', borderRadius: '10px', padding: '1rem', fontSize: '0.9rem' }}>
              <div><strong>{contact.name}</strong></div>
              <div>{contact.email}</div>
              {contact.phone && <div>{contact.phone}</div>}
            </div>
          ) : (
            <p style={{ fontSize: '0.9rem', color: 'var(--clay)' }}>{busy ? 'Loading contact info...' : 'Contact info unavailable.'}</p>
          )}
        </div>
      )}
    </div>
  )
}

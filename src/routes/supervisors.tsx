import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/supervisors')({
  component: SupervisorsPage,
})

function encode(data: Record<string, string>) {
  return Object.entries(data)
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    .join('&')
}

const US_STATES = [
  'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut',
  'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
  'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan',
  'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire',
  'New Jersey', 'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
  'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota',
  'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia',
  'Wisconsin', 'Wyoming',
]

// States where we've directly verified that fully-remote (telehealth-only)
// clinical supervision is permitted by the licensing board.
// Source: ASWB "Clinical social work supervision: Comparison of requirements"
// (March 2024), cross-checked against Florida Admin Code 64B4-2.002 directly.
// NOTE: ASWB data is LCSW/social-work-board specific. LMFT/LMHC
// rules in the same state are usually governed by the same or a similar board,
// but have not been individually re-verified for those license types yet —
// confirm before expanding this list further.
// Any state NOT in this set defaults to requiring some in-person component,
// which is the safe assumption until verified otherwise.
const TELEHEALTH_PERMISSIVE_STATES = new Set([
  'California',
  'Virginia',
  'Washington',
  'Illinois',
  'Michigan',
  'Missouri',
  'Colorado',
  'Maryland',
  'Minnesota',
  'Massachusetts',
])

function getFormatOptions(state: string) {
  if (!state) {
    return { options: [] as string[], note: '' }
  }
  const permissive = TELEHEALTH_PERMISSIVE_STATES.has(state)
  const options = permissive
    ? ['Telehealth / Virtual only', 'In-person only', 'Both']
    : ['In-person only', 'Both']
  const note = permissive
    ? `${state} allows fully remote supervision.`
    : `${state} requires an in-person component for supervision — we don't offer telehealth-only matches there yet.`
  return { options, note }
}

function SupervisorsPage() {
  const [fields, setFields] = useState({
    name: '',
    email: '',
    state: '',
    city: '',
    zip: '',
    licenseType: '',
    qualifiedSupervisor: '',
    format: '',
    specialties: '',
    privatePractice: '',
    fee: '',
    availability: '',
    'bot-field': '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target
    setFields((prev) => {
      const next = { ...prev, [name]: value }
      // If the state changes and the previously selected format is no
      // longer valid for the new state (e.g. was telehealth-only, new
      // state requires in-person), clear it so an invalid pair can't submit.
      if (name === 'state') {
        const { options } = getFormatOptions(value)
        if (!options.includes(prev.format)) {
          next.format = ''
        }
      }
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/supervisor-form.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode({ 'form-name': 'supervisor-application', ...fields }),
    })
    fetch('/api/send-confirmation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: fields.email, name: fields.name, kind: 'supervisor' }),
    }).catch(() => {})
    fetch('/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: 'supervisor', ...fields }),
    }).catch(() => {})
    setSubmitted(true)
  }

  const { options: formatOptions, note: formatNote } = getFormatOptions(fields.state)

  return (
    <>
      <div className="audience-hero supervisor">
        <p className="section-label">For Supervisors</p>
        <h1 className="section-title">Spend less time recruiting.<br />More time mentoring.</h1>
        <p className="section-sub">We send you motivated, pre-screened interns who match your specialty, schedule, and supervision style.</p>
        <div className="match-badge" style={{ marginTop: '1rem', display: 'inline-flex' }}>$200 flat · Only when you accept a supervisee</div>
      </div>

      <section className="section">
        <div className="audience-grid">
          <div>
            <p className="section-label">Why Join</p>
            <h2 className="section-title" style={{ fontSize: '2rem' }}>Build the supervisee roster you actually want.</h2>
            <div className="faq" style={{ marginTop: '2rem' }}>
              <div className="faq-item">
                <p className="faq-q">What does it cost to join?</p>
                <p className="faq-a">A flat $200 fee, charged once, only when you accept a supervisee — never a subscription just to join. Browsing and messaging candidates is always free.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">What qualifications do I need?</p>
                <p className="faq-a">You must hold an active license in your state, along with approved clinical supervisor status (or your state's equivalent) with the relevant licensing board. We verify credentials before listing you.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Can I offer virtual supervision?</p>
                <p className="faq-a">Depends on your state's supervision rules — some states allow fully remote supervision, others require an in-person component. We'll only offer telehealth-only matching where it's actually permitted.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">How many interns will I be matched with?</p>
                <p className="faq-a">You control your availability. Tell us your capacity and we'll only send matches when you have room.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Do I set my own fees?</p>
                <p className="faq-a">Absolutely. You set your own rates. We just help make the right connection happen.</p>
              </div>
            </div>
          </div>

          <div>
            <p className="section-label">Join the Network</p>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: '1.75rem', fontWeight: 500, color: 'var(--bark)', marginBottom: '1.5rem' }}>Tell us about your practice</h2>

            {submitted ? (
              <div className="form-success">
                <h3>Welcome to the network! 🤝</h3>
                <p>We'll review your profile and be in touch within 2 business days to complete your onboarding.</p>
              </div>
            ) : (
              <form className="form-wrap" onSubmit={handleSubmit}>
                <input type="hidden" name="form-name" value="supervisor-application" />
                <input type="hidden" name="bot-field" value={fields['bot-field']} />

                <label htmlFor="sup-name">Full Name</label>
                <input id="sup-name" type="text" name="name" placeholder="Your name" value={fields.name} onChange={handleChange} required />

                <label htmlFor="sup-email">Email Address</label>
                <input id="sup-email" type="email" name="email" placeholder="your@email.com" value={fields.email} onChange={handleChange} required />

                <label htmlFor="sup-state">What state are you licensed in?</label>
                <select id="sup-state" name="state" value={fields.state} onChange={handleChange} required>
                  <option value="">Select a state</option>
                  {US_STATES.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                </select>

                <label htmlFor="sup-city">City</label>
                <input id="sup-city" type="text" name="city" placeholder="e.g. Tampa" value={fields.city} onChange={handleChange} required />

                <label htmlFor="sup-zip">ZIP code</label>
                <input id="sup-zip" type="text" name="zip" placeholder="e.g. 33602" pattern="^\d{5}$" maxLength={5} inputMode="numeric" value={fields.zip} onChange={handleChange} required />

                <label htmlFor="sup-license">License Type</label>
                <select id="sup-license" name="licenseType" value={fields.licenseType} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>LMHC</option>
                  <option>LCSW</option>
                  <option>LMFT</option>
                  <option>Other</option>
                </select>

                <label htmlFor="sup-qs">Do you hold approved clinical supervisor status in your state?</label>
                <select id="sup-qs" name="qualifiedSupervisor" value={fields.qualifiedSupervisor} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Yes</option>
                  <option>No (in progress)</option>
                  <option>Not sure</option>
                </select>

                <label htmlFor="sup-format">Supervision format offered</label>
                <select id="sup-format" name="format" value={fields.format} onChange={handleChange} required disabled={!fields.state}>
                  <option value="">{fields.state ? 'Select one' : 'Select your state first'}</option>
                  {formatOptions.map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
                {formatNote && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--walnut)', marginTop: '-0.5rem', marginBottom: '1rem' }}>{formatNote}</p>
                )}

                <label htmlFor="sup-specialties">Specialty areas (e.g. trauma, anxiety, private practice)</label>
                <input id="sup-specialties" type="text" name="specialties" placeholder="List your areas of focus" value={fields.specialties} onChange={handleChange} required />

                <label htmlFor="sup-pp">Do you offer private practice / entrepreneurship mentoring?</label>
                <select id="sup-pp" name="privatePractice" value={fields.privatePractice} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Yes — I love this</option>
                  <option>Somewhat</option>
                  <option>Not my focus</option>
                </select>

                <label htmlFor="sup-fee">Monthly supervision fee (per supervisee)</label>
                <input id="sup-fee" type="text" name="fee" placeholder="e.g. $150/month or $50/session" value={fields.fee} onChange={handleChange} required />

                <label htmlFor="sup-avail">Current availability</label>
                <select id="sup-avail" name="availability" value={fields.availability} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Accepting 1–2 new supervisees</option>
                  <option>Accepting 3+ new supervisees</option>
                  <option>Waitlist only right now</option>
                </select>

                <button type="submit" className="btn-primary" style={{ width: '100%', background: 'var(--walnut)' }}>Join the Network</button>
              </form>
            )}
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-logo">My<span>Supervisely</span></div>
        <p>© 2025 MySupervisely. All rights reserved.</p>
        <div className="footer-links">
          <Link to="/">Home</Link>
          <Link to="/about">About</Link>
          <Link to="/interns">For Interns</Link>
          <a href="https://www.therapyprepped.com" target="_blank" rel="noopener noreferrer">NCMHCE Prep ↗</a>
        </div>
      </footer>
    </>
  )
}
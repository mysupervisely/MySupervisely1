import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/interns')({
  component: InternsPage,
})

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

function encode(data: Record<string, string>) {
  return Object.entries(data)
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    .join('&')
}

function InternsPage() {
  const [fields, setFields] = useState({
    name: '',
    email: '',
    region: '',
    format: '',
    goal: '',
    privatePractice: '',
    budget: '',
    examPrep: '',
    notes: '',
    'bot-field': '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => setFields({ ...fields, [e.target.name]: e.target.value })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/intern-form.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode({ 'form-name': 'intern-application', ...fields }),
    })
    setSubmitted(true)
  }

  return (
    <>
      <div className="audience-hero">
        <p className="section-label">For Interns</p>
        <h1 className="section-title">You deserve a supervisor who fits — not just whoever's available.</h1>
        <p className="section-sub">Tell us about your goals and we'll match you with a qualified supervisor who's aligned with where you want to go.</p>
        <div className="match-badge" style={{ marginTop: '1rem', display: 'inline-flex' }}>$0 · Free for interns, always</div>
      </div>

      <div style={{ background: 'var(--sage, #6F907F)', color: '#F9F6F0', padding: '1rem 1.5rem', margin: '0 10% 2.5rem', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <p style={{ margin: 0, fontSize: '0.95rem' }}>If you're on the LMHC track, <strong>TherapyPrepped</strong> helps interns prepare specifically for the NCMHCE licensure exam.</p>
        <a href="https://www.therapyprepped.com" target="_blank" rel="noopener noreferrer" style={{ background: '#F9F6F0', color: 'var(--walnut, #35261D)', padding: '0.5rem 1.25rem', borderRadius: '20px', fontSize: '0.85rem', fontWeight: 600, whiteSpace: 'nowrap', textDecoration: 'none' }}>Check it out ↗</a>
      </div>

      <section className="section">
        <div className="audience-grid">
          <div>
            <p className="section-label">What You Get</p>
            <h2 className="section-title" style={{ fontSize: '2rem' }}>More than a match.<br />A mentorship.</h2>
            <div className="faq" style={{ marginTop: '2rem' }}>
              <div className="faq-item">
                <p className="faq-q">Is this free for interns?</p>
                <p className="faq-a">Yes — matching is completely free for interns. You only pay your supervisor their supervision fee once you've decided to work together.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">What license types do you work with?</p>
                <p className="faq-a">We work with registered and associate-level mental health interns across the country, and we're always expanding to support more license types and states.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Can I find a telehealth supervisor?</p>
                <p className="faq-a">Absolutely. Many of our supervisors offer fully virtual supervision, which is perfect if you're building a telehealth practice.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">How long does matching take?</p>
                <p className="faq-a">Most interns receive their first match within 3–5 business days of completing the intake form.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">What if the match isn't right?</p>
                <p className="faq-a">No problem — we'll work with you to find a better fit. There's no obligation until you say yes.</p>
              </div>
            </div>
          </div>

          <div>
            <p className="section-label">Get Matched</p>
            <h2 style={{ fontFamily: 'var(--ff-display)', fontSize: '1.75rem', fontWeight: 500, color: 'var(--bark)', marginBottom: '1.5rem' }}>Tell us about yourself</h2>

            {submitted ? (
              <div className="form-success">
                <h3>You're on the list! 🌱</h3>
                <p>We'll review your profile and reach out with your match within 3–5 business days.</p>
                {(fields.examPrep === 'Yes — actively studying' || fields.examPrep === 'Not yet, but I will be') && (
                  <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid rgba(0,0,0,0.08)' }}>
                    <p style={{ fontSize: '0.9rem', marginBottom: '0.75rem' }}>Since you're on the LMHC track: get a head start on your NCMHCE prep with <strong>TherapyPrepped</strong> — use code <strong>MYSUPER10</strong> for 10% off.</p>
                    <a href="https://www.therapyprepped.com" target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ display: 'inline-block' }}>Explore TherapyPrepped ↗</a>
                  </div>
                )}
              </div>
            ) : (
              <form className="form-wrap" onSubmit={handleSubmit}>
                <input type="hidden" name="form-name" value="intern-application" />
                <input type="hidden" name="bot-field" value={fields['bot-field']} />

                <label htmlFor="intern-name">Full Name</label>
                <input id="intern-name" type="text" name="name" placeholder="Your name" value={fields.name} onChange={handleChange} required />

                <label htmlFor="intern-email">Email Address</label>
                <input id="intern-email" type="email" name="email" placeholder="your@email.com" value={fields.email} onChange={handleChange} required />

                <label htmlFor="intern-region">What state are you licensed/located in?</label>
                <select id="intern-region" name="region" value={fields.region} onChange={handleChange} required>
                  <option value="">Select a state</option>
                  {US_STATES.map((state) => (
                    <option key={state}>{state}</option>
                  ))}
                  <option>Other / Telehealth nationwide</option>
                </select>

                <label htmlFor="intern-format">Supervision format preference</label>
                <select id="intern-format" name="format" value={fields.format} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Telehealth / Virtual only</option>
                  <option>In-person only</option>
                  <option>Either works</option>
                </select>

                <label htmlFor="intern-goal">Career goal</label>
                <select id="intern-goal" name="goal" value={fields.goal} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Private practice (solo or group)</option>
                  <option>Telehealth platform</option>
                  <option>Agency or nonprofit</option>
                  <option>Still figuring it out</option>
                </select>

                <label htmlFor="intern-pp">Are you interested in private practice mentorship?</label>
                <select id="intern-pp" name="privatePractice" value={fields.privatePractice} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Yes — that's a priority</option>
                  <option>Somewhat interested</option>
                  <option>Not at this time</option>
                </select>

                <label htmlFor="intern-budget">Monthly supervision budget</label>
                <select id="intern-budget" name="budget" value={fields.budget} onChange={handleChange} required>
                  <option value="">Select a range</option>
                  <option>Under $100/month</option>
                  <option>$100–$200/month</option>
                  <option>$200–$350/month</option>
                  <option>$350+/month</option>
                </select>

                <label htmlFor="intern-examprep">Are you on the LMHC track preparing for the NCMHCE?</label>
                <select id="intern-examprep" name="examPrep" value={fields.examPrep} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Yes — actively studying</option>
                  <option>Not yet, but I will be</option>
                  <option>Already passed</option>
                  <option>Not applicable — different licensure track</option>
                </select>

                <label htmlFor="intern-notes">Anything else we should know? (optional)</label>
                <textarea id="intern-notes" name="notes" placeholder="Supervision style preferences, specialty interests, scheduling needs..." value={fields.notes} onChange={handleChange} />

                <button type="submit" className="btn-primary" style={{ width: '100%' }}>Submit My Profile</button>
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
          <Link to="/supervisors">For Supervisors</Link>
          <a href="https://www.therapyprepped.com" target="_blank" rel="noopener noreferrer">NCMHCE Prep ↗</a>
        </div>
      </footer>
    </>
  )
}

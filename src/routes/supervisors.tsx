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

function SupervisorsPage() {
  const [fields, setFields] = useState({
    name: '',
    email: '',
    state: '',
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
  ) => setFields({ ...fields, [e.target.name]: e.target.value })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/supervisor-form.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode({ 'form-name': 'supervisor-application', ...fields }),
    })
    setSubmitted(true)
  }

  return (
    <>
      <div className="audience-hero supervisor">
        <p className="section-label">For Supervisors</p>
        <h1 className="section-title">Spend less time recruiting.<br />More time mentoring.</h1>
        <p className="section-sub">We send you motivated, pre-screened interns who match your specialty, schedule, and supervision style.</p>
      </div>

      <section className="section">
        <div className="audience-grid">
          <div>
            <p className="section-label">Why Join</p>
            <h2 className="section-title" style={{ fontSize: '2rem' }}>Build the supervisee roster you actually want.</h2>
            <div className="faq" style={{ marginTop: '2rem' }}>
              <div className="faq-item">
                <p className="faq-q">What does it cost to join?</p>
                <p className="faq-a">Joining our supervisor network is currently free during our launch phase. We'll always be transparent about any future pricing.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">What qualifications do I need?</p>
                <p className="faq-a">You must hold an active license in your state, along with approved clinical supervisor status (or your state's equivalent) with the relevant licensing board. We verify credentials before listing you.</p>
              </div>
              <div className="faq-item">
                <p className="faq-q">Can I offer virtual supervision?</p>
                <p className="faq-a">Yes — in fact, most of our interns are specifically looking for telehealth-compatible supervisors.</p>
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

                <label htmlFor="sup-license">License Type</label>
                <select id="sup-license" name="licenseType" value={fields.licenseType} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>LMHC</option>
                  <option>LCSW</option>
                  <option>LMFT</option>
                  <option>Psychologist</option>
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
                <select id="sup-format" name="format" value={fields.format} onChange={handleChange} required>
                  <option value="">Select one</option>
                  <option>Telehealth / Virtual only</option>
                  <option>In-person only</option>
                  <option>Both</option>
                </select>

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
        </div>
      </footer>
    </>
  )
}

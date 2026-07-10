import { Link, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

export const Route = createFileRoute('/careers')({
  component: CareersPage,
})

function encode(data: Record<string, string>) {
  return Object.entries(data)
    .map(([key, val]) => `${encodeURIComponent(key)}=${encodeURIComponent(val)}`)
    .join('&')
}

function InternCareerForm() {
  const [fields, setFields] = useState({
    name: '',
    email: '',
    licenseType: '',
    licenseStatus: '',
    hoursRemaining: '',
    region: '',
    employmentType: '',
    specialties: '',
    alsoSeekingSupervision: '',
    'bot-field': '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setFields({ ...fields, [e.target.name]: e.target.value })

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields({ ...fields, alsoSeekingSupervision: e.target.checked ? 'Yes' : '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/career-intern-form.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode({ 'form-name': 'career-intern-application', ...fields }),
    })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="form-success">
        <h3>You're on the list 🤝</h3>
        <p>We'll review your profile and reach out when a matching opening comes up.</p>
      </div>
    )
  }

  return (
    <form className="form-wrap" onSubmit={handleSubmit}>
      <input type="hidden" name="form-name" value="career-intern-application" />
      <input type="hidden" name="bot-field" value={fields['bot-field']} />

      <label htmlFor="ci-name">Full Name</label>
      <input id="ci-name" type="text" name="name" placeholder="Your name" value={fields.name} onChange={handleChange} required />

      <label htmlFor="ci-email">Email Address</label>
      <input id="ci-email" type="email" name="email" placeholder="your@email.com" value={fields.email} onChange={handleChange} required />

      <label htmlFor="ci-license">License type</label>
      <select id="ci-license" name="licenseType" value={fields.licenseType} onChange={handleChange} required>
        <option value="">Select one</option>
        <option>LMFT</option>
        <option>LMHC</option>
        <option>LCSW</option>
      </select>

      <label htmlFor="ci-status">License status</label>
      <select id="ci-status" name="licenseStatus" value={fields.licenseStatus} onChange={handleChange} required>
        <option value="">Select one</option>
        <option>Registered Intern</option>
        <option>Newly licensed</option>
      </select>

      <label htmlFor="ci-hours">Hours remaining (approx.)</label>
      <input id="ci-hours" type="text" name="hoursRemaining" placeholder="e.g. 320" value={fields.hoursRemaining} onChange={handleChange} required />

      <label htmlFor="ci-region">City / area</label>
      <input id="ci-region" type="text" name="region" placeholder="e.g. Davie, FL" value={fields.region} onChange={handleChange} required />

      <label htmlFor="ci-employment">Employment type you want</label>
      <select id="ci-employment" name="employmentType" value={fields.employmentType} onChange={handleChange} required>
        <option value="">Select one</option>
        <option>Full-time</option>
        <option>Part-time</option>
        <option>Contract / 1099</option>
      </select>

      <label htmlFor="ci-specialties">Specialties / populations</label>
      <input id="ci-specialties" type="text" name="specialties" placeholder="Couples, EMDR, adolescents…" value={fields.specialties} onChange={handleChange} required />

      <div className="connector-check">
        <input id="ci-connector" type="checkbox" checked={fields.alsoSeekingSupervision === 'Yes'} onChange={handleCheckbox} />
        <label htmlFor="ci-connector"><b>Also seeking a supervisor</b> — flag me for practices offering both supervision and employment.</label>
      </div>

      <button type="submit" className="btn-primary" style={{ width: '100%' }}>Find a Job</button>
    </form>
  )
}

function PracticeCareerForm() {
  const [fields, setFields] = useState({
    practiceName: '',
    email: '',
    location: '',
    roleType: '',
    employmentType: '',
    compensation: '',
    specialties: '',
    alsoOfferingSupervision: '',
    'bot-field': '',
  })
  const [submitted, setSubmitted] = useState(false)

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => setFields({ ...fields, [e.target.name]: e.target.value })

  const handleCheckbox = (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields({ ...fields, alsoOfferingSupervision: e.target.checked ? 'Yes' : '' })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await fetch('/career-practice-form.html', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: encode({ 'form-name': 'career-practice-application', ...fields }),
    })
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="form-success">
        <h3>Listing received 🎉</h3>
        <p>We'll review your opening and be in touch within 2 business days.</p>
      </div>
    )
  }

  return (
    <form className="form-wrap" onSubmit={handleSubmit}>
      <input type="hidden" name="form-name" value="career-practice-application" />
      <input type="hidden" name="bot-field" value={fields['bot-field']} />

      <label htmlFor="cp-name">Practice name</label>
      <input id="cp-name" type="text" name="practiceName" placeholder="Coral Grove Counseling" value={fields.practiceName} onChange={handleChange} required />

      <label htmlFor="cp-email">Contact email</label>
      <input id="cp-email" type="email" name="email" placeholder="hiring@practice.com" value={fields.email} onChange={handleChange} required />

      <label htmlFor="cp-location">Location(s)</label>
      <input id="cp-location" type="text" name="location" placeholder="Davie · Telehealth" value={fields.location} onChange={handleChange} required />

      <label htmlFor="cp-roletype">Role type</label>
      <select id="cp-roletype" name="roleType" value={fields.roleType} onChange={handleChange} required>
        <option value="">Select one</option>
        <option>Hiring now</option>
        <option>Hiring upon licensure</option>
      </select>

      <label htmlFor="cp-employment">Employment type offered</label>
      <select id="cp-employment" name="employmentType" value={fields.employmentType} onChange={handleChange} required>
        <option value="">Select one</option>
        <option>Full-time</option>
        <option>Part-time</option>
        <option>Fee-split</option>
      </select>

      <label htmlFor="cp-comp">Compensation structure</label>
      <input id="cp-comp" type="text" name="compensation" placeholder="e.g. 60/40 split, $28/hr" value={fields.compensation} onChange={handleChange} required />

      <label htmlFor="cp-specialties">Specialties needed</label>
      <input id="cp-specialties" type="text" name="specialties" placeholder="Trauma, family, substance use…" value={fields.specialties} onChange={handleChange} required />

      <div className="connector-check">
        <input id="cp-connector" type="checkbox" checked={fields.alsoOfferingSupervision === 'Yes'} onChange={handleCheckbox} />
        <label htmlFor="cp-connector"><b>Also offering supervision</b> — flag this listing for interns seeking both.</label>
      </div>

      <button type="submit" className="btn-primary" style={{ width: '100%' }}>Post an Opening</button>
    </form>
  )
}

function CareersPage() {
  return (
    <>
      <div className="audience-hero careers">
        <p className="section-label">MySupervisely Careers</p>
        <h1 className="section-title" style={{ color: 'var(--white)' }}>
          Two tracks. One practice. <em style={{ fontStyle: 'italic' }}>Full Match.</em>
        </h1>
        <p className="section-sub">
          Supervision gets you licensed. Careers is where you get hired. Post one profile — when a practice
          offers both supervision and employment, we flag it so you don't have to search twice.
        </p>
      </div>

      <section className="section">
        <div className="match-callout">
          <div className="match-badge">● Full Match</div>
          <p>
            When an intern checks "also seeking a supervisor" and a practice checks "also offering supervision,"
            that listing gets flagged as a Full Match — meaning you can get supervised and hired in the same
            place, without searching twice.
          </p>
        </div>

        <div className="audience-grid">
          <div>
            <p className="section-label">For Interns</p>
            <h2 className="section-title" style={{ fontSize: '2rem' }}>Find a job</h2>
            <p className="section-sub" style={{ marginBottom: '2rem' }}>
              For Registered Interns and newly licensed clinicians ready for full-time, part-time, or contract work.
            </p>
            <InternCareerForm />
          </div>

          <div>
            <p className="section-label">For Practices</p>
            <h2 className="section-title" style={{ fontSize: '2rem' }}>Post an opening</h2>
            <p className="section-sub" style={{ marginBottom: '2rem' }}>
              For practices hiring now, hiring upon licensure, or offering both a job and supervision.
            </p>
            <PracticeCareerForm />
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
          <Link to="/supervisors">For Supervisors</Link>
          <a href="https://www.therapyprepped.com" target="_blank" rel="noopener noreferrer">NCMHCE Prep ↗</a>
        </div>
      </footer>
    </>
  )
}

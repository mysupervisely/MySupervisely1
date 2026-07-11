import { Link, createFileRoute } from '@tanstack/react-router'
import { WelcomeIntro } from './welcome'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function SiteFooter() {
  return (
    <footer>
      <div className="footer-logo">My<span>Supervisely</span></div>
      <p>© 2025 MySupervisely. All rights reserved.</p>
      <div className="footer-links">
        <Link to="/about">About</Link>
        <Link to="/interns">For Interns</Link>
        <Link to="/supervisors">For Supervisors</Link>
        <a href="https://www.therapyprepped.com" target="_blank" rel="noopener noreferrer">NCMHCE Prep ↗</a>
      </div>
    </footer>
  )
}

function HomePage() {
  return (
    <>
      <WelcomeIntro />

      {/* Stats */}
      <div className="stats">
        <div className="stat">
          <div className="stat-num">100%</div>
          <div className="stat-label">Telehealth-friendly matches</div>
        </div>
        <div className="stat">
          <div className="stat-num">Nationwide</div>
          <div className="stat-label">Licensed & qualified supervisors</div>
        </div>
        <div className="stat">
          <div className="stat-num">Free</div>
          <div className="stat-label">To get matched as an intern</div>
        </div>
        <div className="stat">
          <div className="stat-num">1:1</div>
          <div className="stat-label">Personalized matching process</div>
        </div>
      </div>

      {/* How it works */}
      <section className="section">
        <p className="section-label">The Process</p>
        <h2 className="section-title">Matching that actually makes sense</h2>
        <p className="section-sub">We don't throw you a list of names. We learn what you need and make a thoughtful introduction.</p>
        <div className="steps">
          <div className="step">
            <div className="step-num">01</div>
            <h3>Tell us about yourself</h3>
            <p>Share your goals, license type, supervision style, schedule, and what kind of clinical career you're building.</p>
          </div>
          <div className="step">
            <div className="step-num">02</div>
            <h3>We find your match</h3>
            <p>We personally review your profile and connect you with supervisors who align with your needs — not just whoever's available.</p>
          </div>
          <div className="step">
            <div className="step-num">03</div>
            <h3>Meet & decide together</h3>
            <p>Have a consultation with your matched supervisor. You're in control — no pressure, no commitment until you're ready.</p>
          </div>
          <div className="step">
            <div className="step-num">04</div>
            <h3>Start your supervision</h3>
            <p>Begin meeting, logging hours, and building your career with a supervisor who genuinely invests in your growth.</p>
          </div>
        </div>
      </section>

      {/* Split cards */}
      <section className="section section-alt">
        <p className="section-label">Who We Serve</p>
        <h2 className="section-title">Built for both sides of supervision</h2>
        <p className="section-sub">Whether you're just starting out or looking to grow your supervisee roster, we make the match easier.</p>
        <div className="split">
          <div className="card card-intern">
            <p className="card-tag">For Interns</p>
            <h2>Stop searching alone.</h2>
            <p>Finding a supervisor who truly fits your goals, schedule, and clinical vision shouldn't be a full-time job.</p>
            <ul>
              <li>Telehealth & private practice focused</li>
              <li>All intern license types welcome</li>
              <li>Matched by goals, not just geography</li>
              <li>Free to get matched</li>
            </ul>
            <Link to="/interns" className="btn-white">Find My Supervisor</Link>
          </div>
          <div className="card card-supervisor">
            <p className="card-tag">For Supervisors</p>
            <h2>Find supervisees who are serious.</h2>
            <p>We send you pre-screened interns who match your specialty, philosophy, and availability.</p>
            <ul>
              <li>Interns matched to your niche</li>
              <li>No cold outreach or marketing needed</li>
              <li>Flexible fee structures</li>
              <li>Join a growing network</li>
            </ul>
            <Link to="/supervisors" className="btn-white">Join as a Supervisor</Link>
          </div>
        </div>
      </section>

      {/* Job Placement / Careers */}
      <section className="section">
        <p className="section-label">Careers</p>
        <h2 className="section-title">Job placement, not just supervision</h2>
        <p className="section-sub">Once you're licensed — or even before — we help connect you to real openings at practices and organizations that are actually hiring, matched the same way we match supervision: by goals, not just geography.</p>
        <div className="steps">
          <div className="step">
            <div className="step-num">01</div>
            <h3>Open positions, curated</h3>
            <p>We source and vet job openings from practices and organizations across LMHC, LCSW, and LMFT — not a generic job board.</p>
          </div>
          <div className="step">
            <div className="step-num">02</div>
            <h3>Matched to your fit</h3>
            <p>Roles are matched to your specialty, setting preference, and career vision, the same way we match supervision.</p>
          </div>
          <div className="step">
            <div className="step-num">03</div>
            <h3>Support through the process</h3>
            <p>From application to offer, we're a real point of contact — not a black-box portal you submit into and never hear back from.</p>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="section">
        <p className="section-label">Early Voices</p>
        <h2 className="section-title">What people are saying</h2>
        <p className="section-sub">We're just getting started — but the need is real.</p>
        <div className="testimonials">
          <div className="testimonial">
            <p className="testimonial-quote">"I spent three months searching for a supervisor who understood private practice. I wish something like this existed when I graduated."</p>
            <p className="testimonial-author">Mental Health Intern</p>
          </div>
          <div className="testimonial">
            <p className="testimonial-quote">"As a Qualified Supervisor, I want to work with interns who are motivated. I just never had a good way to find them."</p>
            <p className="testimonial-author">Licensed Supervisor</p>
          </div>
          <div className="testimonial">
            <p className="testimonial-quote">"The telehealth flexibility is everything. I needed a supervisor who could meet virtually and really understood that model."</p>
            <p className="testimonial-author">Mental Health Intern</p>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section style={{ background: 'var(--linen)', padding: '5rem 10%', textAlign: 'center' }}>
        <p className="section-label" style={{ textAlign: 'center' }}>Ready?</p>
        <h2 className="section-title" style={{ margin: '0 auto 1rem', textAlign: 'center' }}>Your path starts with the right supervisor.</h2>
        <p style={{ fontSize: '1rem', color: 'var(--walnut)', fontWeight: 300, marginBottom: '2rem' }}>Join the waitlist today and be first to get matched when we launch.</p>
        <div className="btn-group" style={{ justifyContent: 'center' }}>
          <Link to="/interns" className="btn-primary">Get Matched as an Intern</Link>
          <Link to="/supervisors" className="btn-secondary">Join as a Supervisor</Link>
        </div>
      </section>

      <SiteFooter />
    </>
  )
}

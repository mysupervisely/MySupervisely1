import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: AboutPage,
})

function AboutPage() {
  return (
    <>
      <div className="about-hero">
        <p className="section-label">Our Story</p>
        <h1 className="section-title">Built by people who understand the struggle.</h1>
        <p className="section-sub">MySupervisely exists because finding the right clinical supervisor is harder than it should be — and we're here to fix that.</p>
      </div>

      <div className="about-body">
        <p>When mental health interns graduate, they're often left to navigate the supervision process alone. They send cold emails, scroll through Psychology Today, and hope to find someone who gets their goals — someone who can mentor them toward private practice, telehealth, or whatever clinical vision they're working toward.</p>
        <p>Most of the time, they settle. They take whoever's available, not whoever's right. And that mismatch costs them time, money, and momentum.</p>
        <p>MySupervisely is a matching service that connects mental health interns nationwide with qualified supervisors who are actually aligned with their goals — specialties, schedule, supervision style, and career direction included.</p>
        <p>We're not a directory. We're not a search engine. We're a thoughtful human-driven matching service that believes the right supervisory relationship can define your entire early career.</p>

        <h3>Why we built this</h3>
        <p>We kept hearing the same things from interns: "I didn't know who to trust." From supervisors: "I want better supervisees but don't know how to find them." MySupervisely bridges that gap — intentionally, carefully, and with heart.</p>

        <div className="values">
          <div className="value">
            <div className="value-icon">🌱</div>
            <h4>Growth-first</h4>
            <p>Every match is made with your clinical career in mind, not just your license requirements.</p>
          </div>
          <div className="value">
            <div className="value-icon">🤝</div>
            <h4>Human-matched</h4>
            <p>Real people review every profile. No algorithm, no guesswork.</p>
          </div>
          <div className="value">
            <div className="value-icon">🌐</div>
            <h4>Telehealth-ready</h4>
            <p>Built for the modern flexible clinician — virtual, remote, and boundary-crossing.</p>
          </div>
          <div className="value">
            <div className="value-icon">🔒</div>
            <h4>Trustworthy</h4>
            <p>We vet every supervisor for licensure, Qualified Supervisor status, and fit.</p>
          </div>
        </div>
      </div>

      <footer>
        <div className="footer-logo">My<span>Supervisely</span></div>
        <p>© 2025 MySupervisely. All rights reserved.</p>
        <div className="footer-links">
          <Link to="/">Home</Link>
          <Link to="/interns">For Interns</Link>
          <Link to="/supervisors">For Supervisors</Link>
          <a href="https://www.therapyprepped.com" target="_blank" rel="noopener noreferrer">NCMHCE Prep ↗</a>
        </div>
      </footer>
    </>
  )
}

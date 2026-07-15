import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/pricing')({
  component: PricingPage,
})

function PricingPage() {
  return (
    <div className="msp-pricing">
      <style>{`
        .msp-pricing {
          font-family: 'Inter', sans-serif;
          background: #F6F2EA;
          color: #20291F;
          padding: 80px 24px 100px;
        }
        .msp-pricing .wrap { max-width: 1080px; margin: 0 auto; }
        .msp-pricing .eyebrow { text-align: center; font-size: 14px; letter-spacing: 0.14em; text-transform: uppercase; color: #5C7C6B; font-weight: 600; margin-bottom: 18px; }
        .msp-pricing h1 { text-align: center; font-family: 'Fraunces', serif; font-weight: 500; font-size: 48px; line-height: 1.15; }
        .msp-pricing h1 em { font-style: italic; font-weight: 600; color: #5C7C6B; }
        .msp-pricing .sub { text-align: center; max-width: 600px; margin: 20px auto 0; font-size: 18px; line-height: 1.6; color: #4A5A4C; }
        .msp-pricing .value-line { text-align: center; max-width: 520px; margin: 16px auto 0; font-size: 14.5px; font-weight: 600; color: #5C7C6B; }
        .msp-pricing .intern-banner { margin: 48px 0; background: #FFFFFF; border: 1px solid #E4DCC9; border-radius: 24px; padding: 30px 40px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
        .msp-pricing .intern-banner-left { display: flex; align-items: center; gap: 20px; }
        .msp-pricing .intern-icon { width: 52px; height: 52px; border-radius: 50%; background: #E4EDE6; display: flex; align-items: center; justify-content: center; font-size: 24px; flex-shrink: 0; }
        .msp-pricing .intern-title { font-family: 'Fraunces', serif; font-size: 21px; font-weight: 600; margin-bottom: 4px; }
        .msp-pricing .intern-desc { font-size: 14px; color: #5C6B5D; max-width: 480px; }
        .msp-pricing .free-tag { background: #5C7C6B; color: #F6F2EA; font-weight: 700; font-size: 15px; padding: 10px 22px; border-radius: 100px; white-space: nowrap; }
        .msp-pricing .section-label { text-align: center; font-size: 14px; letter-spacing: 0.1em; text-transform: uppercase; color: #8A8367; font-weight: 600; margin: 56px 0 12px; }
        .msp-pricing .section-sub { text-align: center; font-size: 15px; color: #5C6B5D; max-width: 520px; margin: 0 auto 30px; }
        .msp-pricing .fee-grid { display: flex; gap: 20px; margin-bottom: 20px; }
        .msp-pricing .fee-card { flex: 1; background: #FFFFFF; border: 1px solid #E4DCC9; border-radius: 22px; padding: 26px 28px; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
        .msp-pricing .fee-name { font-family: 'Fraunces', serif; font-size: 19px; font-weight: 600; margin-bottom: 4px; }
        .msp-pricing .fee-desc { font-size: 13.5px; color: #5C6B5D; max-width: 260px; }
        .msp-pricing .fee-amount { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; white-space: nowrap; text-align: right; }
        .msp-pricing .fee-amount span { font-size: 13px; font-weight: 500; color: #8A8367; display: block; text-align: right; }
        .msp-pricing .bundle-strip { background: #F3E9D3; border: 1px solid #E0CB98; border-radius: 18px; padding: 16px 26px; display: flex; align-items: center; justify-content: space-between; font-size: 14.5px; color: #5A4A22; margin-bottom: 28px; }
        .msp-pricing .grid { display: flex; gap: 24px; align-items: stretch; }
        .msp-pricing .card { flex: 1; background: #FFFFFF; border: 1px solid #E4DCC9; border-radius: 28px; padding: 38px 34px; display: flex; flex-direction: column; position: relative; }
        .msp-pricing .card.featured { border: 2px solid #5C7C6B; box-shadow: 0 20px 50px rgba(92,124,107,0.15); }
        .msp-pricing .featured-tag { display: inline-block; background: #5C7C6B; color: #F6F2EA; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; padding: 5px 14px; border-radius: 100px; text-transform: uppercase; margin-bottom: 16px; }
        .msp-pricing .plan-kicker { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #8A8367; font-weight: 600; margin-bottom: 10px; }
        .msp-pricing .plan-name { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; margin-bottom: 8px; }
        .msp-pricing .plan-desc { font-size: 15px; color: #5C6B5D; line-height: 1.5; margin-bottom: 24px; min-height: 44px; }
        .msp-pricing .price-row { display: flex; align-items: baseline; gap: 6px; margin-bottom: 4px; }
        .msp-pricing .price { font-family: 'Fraunces', serif; font-size: 42px; font-weight: 600; }
        .msp-pricing .price-period { font-size: 15px; color: #8A8367; font-weight: 500; }
        .msp-pricing .price-note { font-size: 13px; color: #8A8367; margin-bottom: 26px; }
        .msp-pricing .cta-btn { display: block; text-align: center; padding: 14px; border-radius: 100px; font-weight: 600; font-size: 16px; margin-bottom: 28px; text-decoration: none; border: none; cursor: pointer; width: 100%; }
        .msp-pricing .cta-btn.primary { background: #20291F; color: #F6F2EA; }
        .msp-pricing .cta-btn.secondary { background: #F0EBE0; color: #20291F; }
        .msp-pricing .feature-list { list-style: none; flex: 1; padding: 0; margin: 0; }
        .msp-pricing .feature-list li { font-size: 15px; color: #3C4A3E; padding-left: 26px; position: relative; margin-bottom: 12px; line-height: 1.45; }
        .msp-pricing .feature-list li::before { content: "✓"; position: absolute; left: 0; top: 0; color: #5C7C6B; font-weight: 700; }
        .msp-pricing .compare { margin-top: 56px; }
        .msp-pricing .compare-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; text-align: center; margin-bottom: 6px; }
        .msp-pricing .compare-sub { text-align: center; font-size: 15px; color: #5C6B5D; margin-bottom: 30px; }
        .msp-pricing .compare-table { background: #FFFFFF; border: 1px solid #E4DCC9; border-radius: 28px; overflow-x: auto; }
        .msp-pricing .compare-table table { width: 100%; border-collapse: collapse; min-width: 600px; }
        .msp-pricing .compare-table th, .msp-pricing .compare-table td { text-align: left; padding: 18px 20px; font-size: 14.5px; }
        .msp-pricing .compare-table thead th { background: #F6F2EA; color: #8A8367; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; border-bottom: 1px solid #E4DCC9; }
        .msp-pricing .compare-table thead th.us { color: #5C7C6B; }
        .msp-pricing .compare-table tbody tr:not(:last-child) td { border-bottom: 1px solid #EEE7D9; }
        .msp-pricing .compare-table td.us { background: #F1F5F1; font-weight: 600; color: #20291F; }
        .msp-pricing .compare-table td.label { color: #8A8367; font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.03em; }
        .msp-pricing .breakeven { margin-top: 56px; background: #FFFFFF; border: 1px solid #E4DCC9; border-radius: 28px; padding: 40px 44px; }
        .msp-pricing .breakeven-title { font-family: 'Fraunces', serif; font-size: 24px; font-weight: 600; margin-bottom: 6px; text-align: center; }
        .msp-pricing .breakeven-sub { text-align: center; font-size: 15px; color: #5C6B5D; margin-bottom: 30px; }
        .msp-pricing table.be { width: 100%; border-collapse: collapse; }
        .msp-pricing table.be th, .msp-pricing table.be td { text-align: left; padding: 14px 12px; font-size: 15px; }
        .msp-pricing table.be thead th { color: #8A8367; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 2px solid #E4DCC9; font-weight: 600; }
        .msp-pricing table.be tbody tr { border-bottom: 1px solid #EEE7D9; }
        .msp-pricing table.be tbody tr.total { font-weight: 700; }
        .msp-pricing table.be tbody tr.total td { color: #20291F; border-top: 2px solid #E4DCC9; border-bottom: none; padding-top: 16px; }
        .msp-pricing .membership-row td { color: #5C7C6B; font-weight: 700; }
        .msp-pricing .breakeven-note { text-align: center; font-size: 14px; color: #5C6B5D; margin-top: 22px; }
        .msp-pricing .transparency { margin-top: 56px; background: #20291F; border-radius: 28px; padding: 44px 48px; color: #F6F2EA; }
        .msp-pricing .transparency-title { font-family: 'Fraunces', serif; font-size: 26px; font-weight: 600; margin-bottom: 14px; text-align: center; }
        .msp-pricing .transparency-intro { text-align: center; font-size: 15.5px; color: #C9CFC5; max-width: 560px; margin: 0 auto 30px; line-height: 1.6; }
        .msp-pricing .transparency-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 22px 40px; }
        .msp-pricing .t-item { display: flex; gap: 14px; }
        .msp-pricing .t-check { width: 22px; height: 22px; border-radius: 50%; background: #5C7C6B; color: #F6F2EA; font-size: 13px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px; }
        .msp-pricing .t-text { font-size: 15px; color: #D8DED9; line-height: 1.5; }
        .msp-pricing .t-text b { color: #F6F2EA; }
        .msp-pricing .faq { margin-top: 70px; }
        .msp-pricing .faq-title { font-family: 'Fraunces', serif; font-size: 28px; font-weight: 600; text-align: center; margin-bottom: 34px; }
        .msp-pricing .faq-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 28px 40px; }
        .msp-pricing .faq-q { font-weight: 600; font-size: 16px; margin-bottom: 6px; }
        .msp-pricing .faq-a { font-size: 15px; color: #4A5A4C; line-height: 1.55; }
        @media (max-width: 820px) {
          .msp-pricing .grid, .msp-pricing .fee-grid { flex-direction: column; }
          .msp-pricing .faq-grid, .msp-pricing .transparency-grid { grid-template-columns: 1fr; }
          .msp-pricing .intern-banner, .msp-pricing .bundle-strip { flex-direction: column; align-items: flex-start; gap: 12px; }
          .msp-pricing h1 { font-size: 34px; }
        }
      `}</style>

      <div className="wrap">
        <div className="eyebrow">Pricing</div>
        <h1>No surprises. <em>Just a clear path</em><br />to your next match.</h1>
        <div className="sub">Here's exactly what you'll pay, when you'll pay it, and what you get — before you ever sign up.</div>
        <div className="value-line">We publish real prices because we think transparency is what makes people comfortable signing up in the first place.</div>

        <div className="intern-banner">
          <div className="intern-banner-left">
            <div className="intern-icon">🌱</div>
            <div>
              <div className="intern-title">Interns & job-seeking candidates</div>
              <div className="intern-desc">Get matched, message supervisors, browse job openings, and track your hours — completely free, always.</div>
            </div>
          </div>
          <div className="free-tag">$0 forever</div>
        </div>

        <div className="section-label">For Supervisors & Practices — Pay Per Match</div>
        <div className="section-sub">No subscription required. Browse and message for free — you only pay once a match is confirmed.</div>

        <div className="fee-grid">
          <div className="fee-card">
            <div>
              <div className="fee-name">Supervision Match</div>
              <div className="fee-desc">One-time fee when you accept a supervisee for hours.</div>
            </div>
            <div className="fee-amount">$200<span>flat fee</span></div>
          </div>
          <div className="fee-card">
            <div>
              <div className="fee-name">Job Placement</div>
              <div className="fee-desc">One-time fee when a candidate is hired.</div>
            </div>
            <div className="fee-amount">$900<span>flat fee</span></div>
          </div>
        </div>

        <div className="bundle-strip">
          <span><b>Full Match bundle:</b> supervising and hiring the same candidate? Pay <b>$750 total</b> instead of $1,100 separately.</span>
        </div>

        <div className="section-label">Or Go Unlimited</div>

        <div className="grid">
          <div className="card">
            <div className="plan-kicker">Pay Per Match</div>
            <div className="plan-name">Best for occasional hiring</div>
            <div className="plan-desc">No monthly cost. Pay only the flat fees above, only when a match is confirmed.</div>
            <div className="price-row"><div className="price">$0</div></div>
            <div className="price-note">+ $200 per supervision match, $900 per placement</div>
            <button className="cta-btn secondary">Post an opening, free</button>
            <ul className="feature-list">
              <li>Unlimited browsing & messaging</li>
              <li>Post unlimited openings</li>
              <li>Nothing charged until a match is confirmed</li>
            </ul>
          </div>

          <div className="card featured">
            <div className="featured-tag">Best for 2+ matches/year</div>
            <div className="plan-kicker">Membership</div>
            <div className="plan-name">Unlimited matching</div>
            <div className="plan-desc">Zero per-match fees, plus the tooling a flat fee doesn't include.</div>
            <div className="price-row"><div className="price">$79</div><div className="price-period">/ month</div></div>
            <div className="price-note">or $790/year (2 months free) · free during launch phase</div>
            <button className="cta-btn primary">Start free during launch</button>
            <ul className="feature-list">
              <li>Zero per-match fees, unlimited matches</li>
              <li>Supervised hour tracking & sign-off</li>
              <li>Credential & license verification</li>
              <li>Priority placement in search</li>
              <li>Full Match flagging included</li>
            </ul>
          </div>
        </div>

        <div className="compare">
          <div className="compare-title">How we compare</div>
          <div className="compare-sub">Same industry, very different pricing models — based on publicly available pricing pages as of 2026.</div>
          <div className="compare-table">
            <table>
              <thead>
                <tr>
                  <th>Model</th>
                  <th className="us">MySupervisely</th>
                  <th>Per-session marketplaces</th>
                  <th>Directory listings</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="label">Who pays</td>
                  <td className="us">Supervisor / employer, once</td>
                  <td>Candidate, per session</td>
                  <td>Supervisor, to be listed</td>
                </tr>
                <tr>
                  <td className="label">Supervision match</td>
                  <td className="us">$200 flat, one time</td>
                  <td>$125 per session, ongoing</td>
                  <td>Not included — search only</td>
                </tr>
                <tr>
                  <td className="label">Job placement</td>
                  <td className="us">$900 flat, one time</td>
                  <td>Custom / sales call</td>
                  <td>Not offered</td>
                </tr>
                <tr>
                  <td className="label">Pricing shown publicly</td>
                  <td className="us">Yes, in full, on this page</td>
                  <td>Candidate rate only — employer pricing is "talk to sales"</td>
                  <td>Yes, tiered listing packages</td>
                </tr>
                <tr>
                  <td className="label">Real matching (vs. search)</td>
                  <td className="us">Yes</td>
                  <td>Yes</td>
                  <td>No — self-serve directory search</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="breakeven">
          <div className="breakeven-title">Is membership worth it? Here's the math.</div>
          <div className="breakeven-sub">A typical active practice, over one year:</div>
          <table className="be">
            <thead>
              <tr><th>Activity</th><th>Pay-per-match cost</th></tr>
            </thead>
            <tbody>
              <tr><td>2 supervision matches</td><td>$400</td></tr>
              <tr><td>1 job placement</td><td>$900</td></tr>
              <tr className="total"><td>Total on Pay Per Match</td><td>$1,300 / year</td></tr>
              <tr className="membership-row"><td>Membership (annual)</td><td>$790 / year</td></tr>
            </tbody>
          </table>
          <div className="breakeven-note">If you place more than 1–2 people a year, membership pays for itself — plus you keep the hour-tracking and credentialing tools year-round.</div>
        </div>

        <div className="transparency">
          <div className="transparency-title">Here's exactly what you're signing up for</div>
          <div className="transparency-intro">We believe hesitation usually comes from not knowing what something costs — so we'd rather show you everything upfront than have you wonder what's coming later.</div>
          <div className="transparency-grid">
            <div className="t-item"><div className="t-check">✓</div><div className="t-text"><b>Interns never pay,</b> under any plan, at any time.</div></div>
            <div className="t-item"><div className="t-check">✓</div><div className="t-text"><b>No credit card required</b> to browse, post, or message on the Pay Per Match plan.</div></div>
            <div className="t-item"><div className="t-check">✓</div><div className="t-text"><b>You're only charged</b> once you confirm a supervision match or a hire.</div></div>
            <div className="t-item"><div className="t-check">✓</div><div className="t-text"><b>Membership is optional</b> — most practices can start entirely on Pay Per Match.</div></div>
            <div className="t-item"><div className="t-check">✓</div><div className="t-text"><b>Cancel membership anytime,</b> no contract, no cancellation fee.</div></div>
            <div className="t-item"><div className="t-check">✓</div><div className="t-text"><b>No hidden fees</b> — what's listed here is the full price, always.</div></div>
          </div>
        </div>

        <div className="faq">
          <div className="faq-title">Questions</div>
          <div className="faq-grid">
            <div><div className="faq-q">Will I ever be charged without confirming a match?</div><div className="faq-a">No. On Pay Per Match, you're never charged for browsing, posting, or messaging — only once you confirm a supervision match or a hire.</div></div>
            <div><div className="faq-q">Why is membership free right now?</div><div className="faq-a">We're in launch phase and want early practices to try the full toolset. You'll get advance notice before billing ever starts.</div></div>
            <div><div className="faq-q">What does "hour tracking & sign-off" do?</div><div className="faq-a">Supervisors log and approve supervisee hours directly in-platform, giving both sides an exportable record for licensure boards.</div></div>
            <div><div className="faq-q">Can I switch plans later?</div><div className="faq-a">Yes, anytime from your account settings — no penalty either direction.</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}

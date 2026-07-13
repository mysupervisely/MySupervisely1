import { useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/signup')({
  component: SignupPage,
})

function SignupPage() {
  const [role, setRole] = useState('intern')
  const [realName, setRealName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const displayName = realName.trim() ? `${realName.trim().split(' ')[0]} ${realName.trim().split(' ').slice(-1)[0][0]}.` : 'New User'

    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          real_name: realName,
          display_name: displayName,
        },
      },
    })

    setLoading(false)
    if (signUpError) {
      setError(signUpError.message)
      return
    }
    setSubmitted(true)
  }

  if (submitted) {
    return (
      <div className="audience-hero">
        <p className="section-label">Almost there</p>
        <h1 className="section-title">Check your email 📩</h1>
        <p className="section-sub">We sent a confirmation link to {email}. Click it to activate your account, then come back and log in.</p>
        <div style={{ marginTop: '1.5rem' }}>
          <Link to="/login" className="btn-primary">Go to login</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="audience-hero">
      <p className="section-label">Create your account</p>
      <h1 className="section-title">Join MySupervisely</h1>
      <p className="section-sub">Free for interns and candidates. Supervisors and practices pay only when a match is confirmed.</p>

      <form className="form-wrap" onSubmit={handleSubmit} style={{ maxWidth: '480px', marginTop: '2rem' }}>
        <label htmlFor="signup-role">I am a...</label>
        <select id="signup-role" value={role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRole(e.target.value)} required>
          <option value="intern">Intern / candidate</option>
          <option value="supervisor">Supervisor</option>
          <option value="practice">Practice / employer</option>
        </select>

        <label htmlFor="signup-name">Full name</label>
        <input id="signup-name" type="text" placeholder="Your name" value={realName} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRealName(e.target.value)} required />

        <label htmlFor="signup-email">Email</label>
        <input id="signup-email" type="email" placeholder="you@email.com" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} required />

        <label htmlFor="signup-password">Password</label>
        <input id="signup-password" type="password" placeholder="At least 8 characters" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required minLength={8} />

        {error && <p style={{ color: '#B54545', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </div>
  )
}

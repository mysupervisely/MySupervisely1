import { useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { supabase } from '../lib/supabase'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    setLoading(false)
    if (signInError) {
      setError(signInError.message)
      return
    }
    navigate({ to: '/' })
  }

  return (
    <div className="audience-hero">
      <p className="section-label">Welcome back</p>
      <h1 className="section-title">Log in</h1>

      <form className="form-wrap" onSubmit={handleSubmit} style={{ maxWidth: '480px', marginTop: '2rem' }}>
        <label htmlFor="login-email">Email</label>
        <input id="login-email" type="email" placeholder="you@email.com" value={email} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)} required />

        <label htmlFor="login-password">Password</label>
        <input id="login-password" type="password" placeholder="Your password" value={password} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} required />

        {error && <p style={{ color: '#B54545', fontSize: '0.85rem', marginBottom: '1rem' }}>{error}</p>}

        <button type="submit" className="btn-primary" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
      </form>

      <p style={{ marginTop: '1.5rem', fontSize: '0.9rem' }}>
        Don't have an account? <Link to="/signup">Sign up</Link>
      </p>
    </div>
  )
}

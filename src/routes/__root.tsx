import { HeadContent, Link, Scripts, createRootRoute } from '@tanstack/react-router'
import '../styles.css'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'MySupervisely – Find the supervisor who fits your path' },
      { name: 'description', content: 'MySupervisely connects mental health interns with qualified supervisors who match their goals, style, and career vision.' },
    ],
    links: [
      {
        rel: 'preconnect',
        href: 'https://fonts.googleapis.com',
      },
      {
        rel: 'preconnect',
        href: 'https://fonts.gstatic.com',
        crossOrigin: 'anonymous',
      },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap',
      },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <SiteNav />
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function SiteNav() {
  return (
    <nav>
      <Link to="/" className="nav-logo">My<span>Supervisely</span></Link>
      <div className="nav-links">
        <Link to="/">Home</Link>
        <Link to="/about">About</Link>
        <Link to="/interns">For Interns</Link>
        <Link to="/supervisors">For Supervisors</Link>
        <Link to="/careers">Careers</Link>
        <Link to="/pricing">Pricing</Link>
        <Link to="/dashboard">Dashboard</Link>
        <Link to="/login">Log In</Link>
        <Link to="/signup" className="nav-cta">Sign Up</Link>
      </div>
    </nav>
  )
}

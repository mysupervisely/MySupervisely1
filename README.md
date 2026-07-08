# MySupervisely

MySupervisely is a mental health supervision matching platform that connects mental health interns nationwide (across license types) with qualified supervisors who align with their goals, schedule, supervision style, and career direction.

## What It Does

- **Interns** submit a profile describing their goals, location, telehealth preferences, budget, and career direction — and receive a personalized supervisor match within 3–5 business days.
- **Supervisors** join the network by submitting their credentials, specialties, availability, and fee structure — and receive pre-screened intern referrals.
- The site includes a home page, an About page, and dedicated pages for interns and supervisors with FAQ sections and intake forms.

## Key Technologies

- **TanStack Start** — SSR-enabled React framework with file-based routing
- **TanStack Router** — type-safe client-side routing with `<Link>` navigation
- **Tailwind CSS v4** — utility CSS (minimal use; most styling uses custom CSS variables)
- **Netlify Forms** — serverless form handling for intern and supervisor applications
- **Netlify** — hosting, CDN, form processing

## Running Locally

```bash
npm install
npm run dev
```

The dev server runs at [http://localhost:3000](http://localhost:3000).

> Note: Netlify Forms submissions do not work in local development. Deploy to Netlify to test form submissions.

## Pages

| Route | Description |
|---|---|
| `/` | Home — hero, stats, how it works, audience cards, testimonials, CTA |
| `/about` | About — story, mission, values |
| `/interns` | For Interns — FAQ + intern application form |
| `/supervisors` | For Supervisors — FAQ + supervisor application form |

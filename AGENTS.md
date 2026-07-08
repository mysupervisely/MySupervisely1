# AGENTS.md — MySupervisely

## Project Overview

MySupervisely is a static marketing + form-collection site built with TanStack Start (React + Vite) and deployed on Netlify. It has four pages and two Netlify Forms.

## Directory Structure

```
src/
  routes/
    __root.tsx        — Root layout: Google Fonts links, sticky nav, Scripts
    index.tsx         — Home page (hero, stats, how it works, cards, testimonials, CTA)
    about.tsx         — About page (story + values grid)
    interns.tsx       — Intern FAQ + application form (Netlify Forms AJAX)
    supervisors.tsx   — Supervisor FAQ + application form (Netlify Forms AJAX)
  styles.css          — All site styles via CSS custom properties (no Tailwind utility classes used)
  router.tsx          — TanStack Router instance with scrollRestoration

public/
  intern-form.html    — Static skeleton for Netlify Forms build-time detection (intern form)
  supervisor-form.html— Static skeleton for Netlify Forms build-time detection (supervisor form)

netlify.toml          — Build config
```

## Styling Approach

All styling uses CSS custom properties defined in `:root` inside `styles.css`. Tailwind is installed but only the `@import "tailwindcss"` directive is present — no utility classes are used in components. To add new styles, extend `styles.css` with class-based rules using the CSS variables:

```
--cream, --linen, --sand, --clay, --walnut, --bark, --sage, --white
--ff-display (Cormorant Garamond serif), --ff-body (DM Sans)
```

## Netlify Forms

Both forms use AJAX submission with `application/x-www-form-urlencoded` encoding. This is required because TanStack Start's SSR catch-all intercepts normal `POST /` requests.

- Intern form POSTs to `/intern-form.html` with `form-name: intern-application`
- Supervisor form POSTs to `/supervisor-form.html` with `form-name: supervisor-application`
- Static skeleton files in `public/` register the forms with Netlify at build time
- Honeypot `bot-field` included for spam protection

## Navigation

All navigation uses TanStack Router `<Link>` components (not `<a>` tags) to enable client-side transitions. The sticky nav is rendered in `__root.tsx`'s `RootDocument` shell, so it persists across all route transitions without remounting.

## Adding New Pages

1. Create `src/routes/your-page.tsx` with `createFileRoute('/your-page')({ component: YourPage })`
2. TanStack Router auto-generates `src/routeTree.gen.ts` at build time
3. Add a `<Link to="/your-page">` in the nav if needed

## Non-Obvious Decisions

- Forms fetch to the static HTML skeleton file paths (not `/`) to bypass the SSR function and reach Netlify's `formsHandler` middleware on the CDN origin.
- The `__root.tsx` uses `shellComponent` (not `component`) so the HTML shell including `<html>`, `<head>`, `<body>` is only rendered once at the SSR layer.
- Google Fonts are loaded via `head()` link tags in `__root.tsx` rather than `@import` in CSS to avoid render-blocking.

import type { Handler } from '@netlify/functions'

const ADMIN_EMAIL = 'mysupervisely@gmail.com'

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  region: 'Region',
  format: 'Format',
  goal: 'Goal',
  privatePractice: 'Private Practice',
  budget: 'Budget',
  notes: 'Notes',
  licenseType: 'License Type',
  licenseStatus: 'License Status',
  hoursRemaining: 'Hours Remaining',
  employmentType: 'Employment Type',
  specialties: 'Specialties',
  alsoSeekingSupervision: 'Also Seeking Supervision',
  practiceName: 'Practice Name',
  location: 'Location',
  roleType: 'Role Type',
  compensation: 'Compensation',
  alsoOfferingSupervision: 'Also Offering Supervision',
  state: 'State',
  qualifiedSupervisor: 'Qualified Supervisor',
  fee: 'Fee',
  availability: 'Availability',
}

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let kind: string | undefined
  let fields: Record<string, string> = {}

  try {
    ;({ kind, ...fields } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  if (!kind) {
    return { statusCode: 400, body: JSON.stringify({ error: 'kind is required' }) }
  }

  const kindLabel: Record<string, string> = {
    intern: 'New Intern Application',
    supervisor: 'New Supervisor Application',
    practice: 'New Practice/Job Opening',
  }

  const subject = `${kindLabel[kind] || 'New Submission'} — MySupervisely`

  const rows = Object.entries(fields)
    .filter(([key]) => key !== 'bot-field')
    .map(([key, val]) => `<tr><td style="padding:4px 12px 4px 0; color:#8A8367; font-size:13px; vertical-align:top;">${FIELD_LABELS[key] || key}</td><td style="padding:4px 0; font-size:14px;">${val || '—'}</td></tr>`)
    .join('')

  const html = `
    <h2 style="font-family: sans-serif;">${kindLabel[kind] || 'New Submission'}</h2>
    <table style="border-collapse: collapse; font-family: sans-serif;">${rows}</table>
    <p style="margin-top: 20px; font-size: 13px; color: #8A8367;">Sent automatically from mysupervisely.com</p>
  `

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MySupervisely <hello@mysupervisely.com>',
        to: [ADMIN_EMAIL],
        subject,
        html,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send admin notification', detail: errText }) }
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send admin notification', detail: err.message }) }
  }
}

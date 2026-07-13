import type { Handler } from '@netlify/functions'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let toEmail: string | undefined
  let name: string | undefined
  let kind: string | undefined // 'intern' or 'practice'

  try {
    ;({ email: toEmail, name, kind } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  if (!toEmail || !kind) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email and kind are required' }) }
  }

  const firstName = name?.trim().split(' ')[0] || 'there'

  const subject =
    kind === 'practice'
      ? "We've got your opening — MySupervisely"
      : "You're on the list — MySupervisely"

  const body =
    kind === 'practice'
      ? `<p>Hi ${firstName},</p>
         <p>Thanks for submitting your opening to MySupervisely. We'll review it and reach out within 2 business days to confirm the details and start matching you with candidates.</p>
         <p>— The MySupervisely team</p>`
      : `<p>Hi ${firstName},</p>
         <p>Thanks for signing up with MySupervisely. We'll review your profile and reach out with your match within 3–5 business days.</p>
         <p>— The MySupervisely team</p>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'MySupervisely <hello@mysupervisely.com>',
        to: [toEmail],
        subject,
        html: body,
      }),
    })

    if (!res.ok) {
      const errText = await res.text()
      return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email', detail: errText }) }
    }

    return { statusCode: 200, body: JSON.stringify({ sent: true }) }
  } catch (err: any) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Failed to send email', detail: err.message }) }
  }
}

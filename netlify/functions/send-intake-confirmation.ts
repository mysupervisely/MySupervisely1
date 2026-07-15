import type { Handler } from '@netlify/functions'

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' }
  }

  let toEmail: string | undefined
  let name: string | undefined
  let kind: string | undefined // 'intern' | 'practice' | 'supervisor'

  try {
    ;({ email: toEmail, name, kind } = JSON.parse(event.body || '{}'))
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  if (!toEmail || !kind) {
    return { statusCode: 400, body: JSON.stringify({ error: 'email and kind are required' }) }
  }

  const firstName = name?.trim().split(' ')[0] || 'there'

  const sampleMatchCard = `
    <p style="margin-top:24px; margin-bottom:8px; font-size:13px; color:#8A8367; text-transform:uppercase; letter-spacing:0.05em;">Here's what a match looks like</p>
    <div style="border:1px solid #E5DFD0; border-radius:12px; padding:16px 20px; max-width:360px; font-family: sans-serif;">
      <div style="font-weight:600; font-size:15px;">Dr. Alex M. · LMFT</div>
      <div style="font-size:13px; color:#8A8367; margin-top:4px;">Telehealth · Trauma-focused · Accepting 1–2 supervisees</div>
    </div>
    <p style="font-size:12px; color:#8A8367; margin-top:8px;">Example only — your real match will be based on your specific goals and licensure needs.</p>
  `

  const copy: Record<string, { subject: string; html: string }> = {
    practice: {
      subject: "We've got your opening — MySupervisely",
      html: `<p>Hi ${firstName},</p>
             <p>Thanks for submitting your opening to MySupervisely. We'll review it and reach out within 2 business days to confirm the details and start matching you with candidates.</p>
             <p>— The MySupervisely team</p>`,
    },
    supervisor: {
      subject: 'Welcome to the network — MySupervisely',
      html: `<p>Hi ${firstName},</p>
             <p>Thanks for joining MySupervisely as a supervisor. We'll review your profile and be in touch within 2 business days to complete your onboarding.</p>
             <p>— The MySupervisely team</p>`,
    },
    intern: {
      subject: "You're on the list — MySupervisely",
      html: `<p>Hi ${firstName},</p>
             <p>Thanks for signing up with MySupervisely. We'll review your profile and reach out with your match within 3–5 business days.</p>
             ${sampleMatchCard}
             <p>— The MySupervisely team</p>`,
    },
  }

  const { subject, html: body } = copy[kind] || copy.intern

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

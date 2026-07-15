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
    <p style="margin-top:28px; margin-bottom:10px; font-size:12px; color:#8A8367; text-transform:uppercase; letter-spacing:0.08em; font-weight:600;">Here's what a match looks like</p>
    <table role="presentation" style="width:100%; max-width:400px; border:1px solid #E5DFD0; border-radius:14px; background:#FBF9F4; font-family: sans-serif;" cellpadding="0" cellspacing="0">
      <tr>
        <td style="padding:18px 20px;">
          <table role="presentation" cellpadding="0" cellspacing="0">
            <tr>
              <td style="width:44px; vertical-align:top;">
                <div style="width:40px; height:40px; border-radius:50%; background:#6F907F; color:#ffffff; text-align:center; line-height:40px; font-weight:600; font-size:15px;">AM</div>
              </td>
              <td style="padding-left:12px; vertical-align:top;">
                <div style="font-weight:600; font-size:15px; color:#35261D;">Dr. Alex M. · LMFT</div>
                <div style="font-size:13px; color:#8A8367; margin-top:2px;">Telehealth · Trauma-focused</div>
                <div style="display:inline-block; margin-top:8px; padding:3px 10px; background:#E9EFE9; color:#4E6B58; font-size:11px; font-weight:600; border-radius:20px;">Accepting 1–2 supervisees</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
    <p style="font-size:12px; color:#8A8367; margin-top:8px; margin-bottom:24px;">Example only — your real match will be based on your specific goals and licensure needs.</p>
    <table role="presentation" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-radius:8px; background:#6F907F;">
          <a href="https://mysupervisely.com/signup" target="_blank" style="display:inline-block; padding:12px 28px; color:#ffffff; font-family: sans-serif; font-size:14px; font-weight:600; text-decoration:none; border-radius:8px;">Create your free account →</a>
        </td>
      </tr>
    </table>
    <p style="font-size:12px; color:#8A8367; margin-top:10px;">Creating an account lets you track your match status and book your intro call as soon as we find your fit.</p>
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { seat, slot, name, id } = req.body;
  const date = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });

  // Send email notification via Resend
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Library Booking <onboarding@resend.dev>',
        to: ['vinayrao.735@gmail.com'],
        subject: `📚 New Booking — Seat ${seat} | ${slot}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;background:#f4f6f9;padding:24px;border-radius:12px">
            <h2 style="color:#2563eb;margin-bottom:4px">New Seat Booking</h2>
            <p style="color:#64748b;margin-top:0">${date}</p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#fff;border-radius:8px;overflow:hidden">
              <tr style="background:#eff6ff">
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Seat</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${seat}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Time Slot</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${slot}</td>
              </tr>
              <tr style="background:#eff6ff">
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Name</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${name}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Student / Staff ID</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${id}</td>
              </tr>
            </table>
          </div>
        `
      })
    });
    if (!emailRes.ok) console.error('Resend error:', await emailRes.text());
  } catch (e) {
    console.error('Email failed:', e.message);
  }

  // Append to Google Sheet via Apps Script webhook
  if (process.env.SHEETS_WEBHOOK_URL) {
    try {
      await fetch(process.env.SHEETS_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, seat, slot, name, id }),
        redirect: 'follow',
      });
    } catch (e) {
      console.error('Sheets webhook failed:', e.message);
    }
  }

  res.status(200).json({ ok: true });
}

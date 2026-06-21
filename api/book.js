import crypto from 'crypto';

async function getGoogleAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const body   = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const unsigned = `${header}.${body}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(unsigned);
  const signature = sign.sign(serviceAccount.private_key, 'base64url');
  const jwt = `${unsigned}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function appendToSheet(token, sheetId, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/Sheet1!A1:E1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) console.error('Sheets error:', await res.text());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { seat, slot, name, id } = req.body;
  const date = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

  // Send email via Resend
  try {
    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
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
        `,
      }),
    });
    if (!emailRes.ok) console.error('Resend error:', await emailRes.text());
  } catch (e) {
    console.error('Email failed:', e.message);
  }

  // Append to Google Sheet
  try {
    const serviceAccount = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token = await getGoogleAccessToken(serviceAccount);
    await appendToSheet(token, process.env.SHEET_ID, [date, slot, seat, name, id]);
  } catch (e) {
    console.error('Sheets failed:', e.message);
  }

  res.status(200).json({ ok: true });
}

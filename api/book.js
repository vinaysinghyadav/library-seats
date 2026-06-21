import crypto from 'crypto';

const SUPABASE_URL = 'https://oiokshmvnqucqfsrjmvk.supabase.co';

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
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }),
  });
  const data = await res.json();
  return data.access_token;
}

async function appendToSheet(token, sheetId, sheetName, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
  if (!res.ok) console.error('Sheets error:', await res.text());
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { seat, name, id, from, to, amount } = req.body;
  const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

  // Save to Supabase as pending
  let bookingId = null;
  try {
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings`, {
      method: 'POST',
      headers: {
        'apikey': process.env.SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ seat, name, student_id: id, from_date: from, to_date: to, amount, status: 'pending' }),
    });
    const [booking] = await sbRes.json();
    bookingId = booking?.id;
  } catch (e) {
    console.error('Supabase insert failed:', e.message);
  }

  const approveUrl = `https://library-seats.vercel.app/api/approve?id=${bookingId}`;

  // Send email with Accept button
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Library Booking <onboarding@resend.dev>',
        to: ['vinayrao.735@gmail.com'],
        subject: `📚 New Booking Request — Seat ${seat}`,
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#f4f6f9;padding:24px;border-radius:12px">
            <h2 style="color:#2563eb;margin-bottom:4px">New Booking Request</h2>
            <p style="color:#64748b;margin-top:0">${date}</p>
            <table style="width:100%;border-collapse:collapse;margin-top:16px;background:#fff;border-radius:8px;overflow:hidden">
              <tr style="background:#eff6ff">
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Seat</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${seat}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#64748b;font-size:13px">From → To</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${from} → ${to}</td>
              </tr>
              <tr style="background:#eff6ff">
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Name</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${name}</td>
              </tr>
              <tr>
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Student / Staff ID</td>
                <td style="padding:10px 16px;font-weight:700;color:#1e293b">${id}</td>
              </tr>
              <tr style="background:#eff6ff">
                <td style="padding:10px 16px;color:#64748b;font-size:13px">Amount Paid</td>
                <td style="padding:10px 16px;font-weight:700;color:#16a34a">₹${amount}</td>
              </tr>
            </table>
            <div style="text-align:center;margin-top:24px">
              <a href="${approveUrl}" style="display:inline-block;padding:14px 36px;background:#22c55e;color:#fff;text-decoration:none;border-radius:8px;font-size:1rem;font-weight:700;">
                ✅ Accept Booking
              </a>
            </div>
            <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px">Clicking Accept will confirm the seat and notify the student's record.</p>
          </div>
        `,
      }),
    });
  } catch (e) {
    console.error('Email failed:', e.message);
  }

  // Append to Google Sheets — Requests tab
  try {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token = await getGoogleAccessToken(sa);
    await appendToSheet(token, process.env.SHEET_ID, 'Requests', [bookingId, date, from, to, seat, name, id, `₹${amount}`]);
  } catch (e) {
    console.error('Sheets failed:', e.message);
  }

  res.status(200).json({ ok: true, bookingId });
}

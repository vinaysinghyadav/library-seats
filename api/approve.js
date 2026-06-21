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
  return (await res.json()).access_token;
}

async function appendToSheet(token, sheetId, sheetName, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(sheetName)}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values: [values] }),
  });
}

export default async function handler(req, res) {
  const { id } = req.query;

  if (!id) return res.status(400).send(html('Invalid link.', false));

  // Fetch booking from Supabase
  const fetchRes = await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${id}&select=*`, {
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
    },
  });
  const [booking] = await fetchRes.json();

  if (!booking) return res.status(404).send(html('Booking not found.', false));
  if (booking.status === 'approved') return res.status(200).send(html(`Seat ${booking.seat} was already approved.`, true));

  // Update status to approved
  await fetch(`${SUPABASE_URL}/rest/v1/bookings?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': process.env.SUPABASE_SERVICE_KEY,
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status: 'approved' }),
  });

  // Append to Approved sheet
  try {
    const sa = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
    const token = await getGoogleAccessToken(sa);
    const approvedOn = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    await appendToSheet(token, process.env.SHEET_ID, 'Approved', [
      booking.id, approvedOn, booking.from_date, booking.to_date,
      booking.seat, booking.name, booking.student_id, `₹${booking.amount}`,
    ]);
  } catch (e) {
    console.error('Sheets failed:', e.message);
  }

  res.status(200).send(html(`Seat ${booking.seat} approved for ${booking.name} (${booking.from_date} → ${booking.to_date}).`, true));
}

function html(message, success) {
  const color = success ? '#22c55e' : '#ef4444';
  const icon  = success ? '✅' : '❌';
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Library Booking</title>
    <style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f4f6f9;}
    .card{background:#fff;border-radius:16px;padding:40px 32px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.1);max-width:400px;}
    .icon{font-size:3rem;margin-bottom:16px;} h2{color:${color};} p{color:#64748b;}</style>
  </head><body><div class="card">
    <div class="icon">${icon}</div>
    <h2>${success ? 'Booking Approved' : 'Error'}</h2>
    <p>${message}</p>
  </div></body></html>`;
}

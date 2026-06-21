const ROWS = ['A','B','C','D','E'];
const COLS = 10;
const SEATS = ROWS.flatMap(r => Array.from({length: COLS}, (_, i) => `${r}${i+1}`));

const SLOTS = [
  '9:00 AM – 11:00 AM',
  '11:00 AM – 1:00 PM',
  '1:00 PM – 3:00 PM',
  '3:00 PM – 5:00 PM',
  '5:00 PM – 7:00 PM',
  '7:00 PM – 9:00 PM',
];

const PASSES = [
  { label: '1 Day',    key: '1d', price: 100  },
  { label: '1 Month',  key: '1m', price: 1500 },
  { label: '3 Months', key: '3m', price: 3000 },
  { label: '6 Months', key: '6m', price: 4800 },
  { label: '1 Year',   key: '1y', price: 8400 },
];

const PASS_PRICE = Object.fromEntries(PASSES.map(p => [p.key, p.price]));

const SUPABASE_URL  = 'https://oiokshmvnqucqfsrjmvk.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9pb2tzaG12bnF1Y3Fmc3JqbXZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIwNDY0NTMsImV4cCI6MjA5NzYyMjQ1M30.cVa8SDpjvMoR3dE4r0ZhjMnfqSLdIeXY5DBgvfPHt0k';

// approvedBookings: [{ seat, from_date, to_date, name, student_id }]
let approvedBookings = [];
let currentSlot = SLOTS[0];
let currentPass = '1d';
let selectedSeat = null;

function toYMD(date) { return date.toISOString().slice(0, 10); }

function calcToDate(fromYMD, passKey) {
  const d = new Date(fromYMD);
  if (passKey === '1d') d.setDate(d.getDate());
  else if (passKey === '1m') d.setMonth(d.getMonth() + 1);
  else if (passKey === '3m') d.setMonth(d.getMonth() + 3);
  else if (passKey === '6m') d.setMonth(d.getMonth() + 6);
  else if (passKey === '1y') d.setFullYear(d.getFullYear() + 1);
  return toYMD(d);
}

function fmtDate(ymd) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function isOverlap(existingBookings, fromYMD, toYMD_) {
  if (!existingBookings) return false;
  return existingBookings.some(b => fromYMD <= b.to && toYMD_ >= b.from);
}

// ── DOM refs ──────────────────────────────────────────────
const slotSelect   = document.getElementById('slotSelect');
const fromInput    = document.getElementById('fromDate');
const toDisplay    = document.getElementById('toDisplay');
const passButtons  = document.querySelectorAll('.pass-btn');
const seatGrid     = document.getElementById('seatGrid');
const statsAvail   = document.getElementById('statsAvail');
const statsBooked  = document.getElementById('statsBooked');
const modalOverlay = document.getElementById('modalOverlay');
const modalTitle   = document.getElementById('modalTitle');
const modalSlotLbl = document.getElementById('modalSlotLabel');
const modalClose   = document.getElementById('modalClose');
const bookForm     = document.getElementById('bookForm');
const paymentStep  = document.getElementById('paymentStep');
const bookedView   = document.getElementById('bookedView');
const inputName    = document.getElementById('inputName');
const inputId      = document.getElementById('inputId');
const formError    = document.getElementById('formError');
const btnConfirm   = document.getElementById('btnConfirm');
const btnBack      = document.getElementById('btnBack');
const btnPaid      = document.getElementById('btnPaid');
const btnCancel    = document.getElementById('btnCancel');
const paymentAmount = document.getElementById('paymentAmount');
const viewName     = document.getElementById('viewName');
const viewId       = document.getElementById('viewId');
const viewSeat     = document.getElementById('viewSeat');
const viewSlot     = document.getElementById('viewSlot');
const viewFrom     = document.getElementById('viewFrom');
const viewTo       = document.getElementById('viewTo');
const dateDisplay  = document.getElementById('dateDisplay');

async function fetchApproved() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bookings?status=eq.approved&select=seat,from_date,to_date,name,student_id`, {
      headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${SUPABASE_ANON}` },
    });
    approvedBookings = await res.json();
  } catch (e) {
    console.error('Failed to fetch bookings:', e.message);
  }
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  dateDisplay.textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  // Default from = today
  fromInput.value = toYMD(new Date());
  fromInput.min   = toYMD(new Date());
  updateToDisplay();

  SLOTS.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = i; opt.textContent = s;
    slotSelect.appendChild(opt);
  });

  slotSelect.addEventListener('change', () => { currentSlot = SLOTS[slotSelect.value]; renderGrid(); });
  fromInput.addEventListener('change', () => { updateToDisplay(); renderGrid(); });

  passButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      passButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPass = btn.dataset.pass;
      updateToDisplay();
      renderGrid();
    });
  });

  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  btnConfirm.addEventListener('click', showPaymentStep);
  btnBack.addEventListener('click', showBookForm);
  btnPaid.addEventListener('click', confirmBooking);
  btnCancel.addEventListener('click', cancelBooking);

  await fetchApproved();
  renderGrid();
}

function updateToDisplay() {
  const to = calcToDate(fromInput.value, currentPass);
  toDisplay.textContent = currentPass === '1d'
    ? fmtDate(fromInput.value)
    : `${fmtDate(fromInput.value)} → ${fmtDate(to)}`;
}

// ── Grid ──────────────────────────────────────────────────
function renderGrid() {
  seatGrid.innerHTML = '';
  const fromYMD = fromInput.value;
  const toYMD_  = calcToDate(fromYMD, currentPass);
  let bookedCount = 0;

  SEATS.forEach(seat => {
    const btn = document.createElement('button');
    btn.className = 'seat';
    btn.textContent = seat;

    const conflict = approvedBookings.find(b =>
      b.seat === seat && fromYMD <= b.to_date && toYMD_ >= b.from_date
    );

    if (conflict) {
      bookedCount++;
      btn.classList.add('booked');
      btn.title = `${seat} — Booked by ${conflict.name} (${fmtDate(conflict.from_date)} – ${fmtDate(conflict.to_date)})`;
      btn.addEventListener('click', () => openModal(seat, conflict));
    } else {
      btn.classList.add('available');
      btn.title = seat;
      btn.addEventListener('click', () => openModal(seat, null));
    }

    seatGrid.appendChild(btn);
  });

  statsAvail.textContent  = `${SEATS.length - bookedCount} available`;
  statsBooked.textContent = `${bookedCount} booked`;
}

// ── Modal ─────────────────────────────────────────────────
function showBookForm() {
  bookForm.classList.remove('hidden');
  paymentStep.classList.add('hidden');
}

function showPaymentStep() {
  const name = inputName.value.trim();
  const id   = inputId.value.trim();
  if (!name || !id) { formError.classList.remove('hidden'); return; }
  formError.classList.add('hidden');
  const price = PASS_PRICE[currentPass];
  const passLabel = PASSES.find(p => p.key === currentPass).label;
  paymentAmount.innerHTML = `Pay <strong>₹${price.toLocaleString('en-IN')}</strong> for <strong>${passLabel}</strong> pass`;
  bookForm.classList.add('hidden');
  paymentStep.classList.remove('hidden');
}

function openModal(seat, existingBooking) {
  selectedSeat = seat;
  modalTitle.textContent   = `Seat ${seat}`;
  modalSlotLbl.textContent = currentSlot;
  formError.classList.add('hidden');
  paymentStep.classList.add('hidden');

  if (existingBooking) {
    bookForm.classList.add('hidden');
    bookedView.classList.remove('hidden');
    viewName.textContent = existingBooking.name;
    viewId.textContent   = existingBooking.student_id;
    viewSeat.textContent = seat;
    viewSlot.textContent = currentSlot;
    viewFrom.textContent = fmtDate(existingBooking.from_date);
    viewTo.textContent   = fmtDate(existingBooking.to_date);
  } else {
    bookForm.classList.remove('hidden');
    bookedView.classList.add('hidden');
    inputName.value = '';
    inputId.value   = '';
  }

  modalOverlay.classList.remove('hidden');
  if (!existingBooking) inputName.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  selectedSeat = null;
}

function confirmBooking() {
  const name   = inputName.value.trim();
  const id     = inputId.value.trim();
  const from   = fromInput.value;
  const to     = calcToDate(from, currentPass);
  const amount = PASS_PRICE[currentPass];

  fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat: selectedSeat, name, id, from, to, amount }),
  }).catch(() => {});

  closeModal();
}

function cancelBooking() {
  closeModal();
}

function exportToExcel() {
  const rows = [['Date From', 'Date To', 'Time Slot', 'Seat', 'Name', 'Student/Staff ID']];

  SLOTS.forEach(slot => {
    const slotData = bookings[slot] || {};
    SEATS.forEach(seat => {
      (slotData[seat] || []).forEach(b => {
        rows.push([fmtDate(b.from), fmtDate(b.to), slot, seat, b.name, b.id]);
      });
    });
  });

  if (rows.length === 1) { alert('No bookings to export yet.'); return; }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [14, 14, 26, 6, 20, 16].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
  const today = new Date().toLocaleDateString('en-IN').replace(/\//g, '-');
  XLSX.writeFile(wb, `library-bookings-${today}.xlsx`);
}

init();

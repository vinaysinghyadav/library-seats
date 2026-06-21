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
  { label: '1 Day',    key: '1d' },
  { label: '1 Month',  key: '1m' },
  { label: '3 Months', key: '3m' },
  { label: '6 Months', key: '6m' },
  { label: '1 Year',   key: '1y' },
];

const STORAGE_KEY = 'library_bookings_v2';

function loadBookings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveBookings(b) { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); }

// bookings[slot][seat] = [{ name, id, from, to }, ...]
let bookings = loadBookings();
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
const bookedView   = document.getElementById('bookedView');
const inputName    = document.getElementById('inputName');
const inputId      = document.getElementById('inputId');
const formError    = document.getElementById('formError');
const btnConfirm   = document.getElementById('btnConfirm');
const btnCancel    = document.getElementById('btnCancel');
const viewName     = document.getElementById('viewName');
const viewId       = document.getElementById('viewId');
const viewSeat     = document.getElementById('viewSeat');
const viewSlot     = document.getElementById('viewSlot');
const viewFrom     = document.getElementById('viewFrom');
const viewTo       = document.getElementById('viewTo');
const dateDisplay  = document.getElementById('dateDisplay');

// ── Init ──────────────────────────────────────────────────
function init() {
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

  document.getElementById('btnExport').addEventListener('click', exportToExcel);
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  btnConfirm.addEventListener('click', confirmBooking);
  btnCancel.addEventListener('click', cancelBooking);

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
  const slotData = bookings[currentSlot] || {};
  let bookedCount = 0;

  SEATS.forEach(seat => {
    const btn = document.createElement('button');
    btn.className = 'seat';
    btn.textContent = seat;

    const seatBookings = slotData[seat] || [];
    const conflict = seatBookings.find(b => fromYMD <= b.to && toYMD_ >= b.from);

    if (conflict) {
      bookedCount++;
      btn.classList.add('booked');
      btn.title = `${seat} — Booked by ${conflict.name} (${fmtDate(conflict.from)} – ${fmtDate(conflict.to)})`;
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
function openModal(seat, existingBooking) {
  selectedSeat = seat;
  modalTitle.textContent   = `Seat ${seat}`;
  modalSlotLbl.textContent = currentSlot;
  formError.classList.add('hidden');

  if (existingBooking) {
    bookForm.classList.add('hidden');
    bookedView.classList.remove('hidden');
    viewName.textContent = existingBooking.name;
    viewId.textContent   = existingBooking.id;
    viewSeat.textContent = seat;
    viewSlot.textContent = currentSlot;
    viewFrom.textContent = fmtDate(existingBooking.from);
    viewTo.textContent   = fmtDate(existingBooking.to);
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

async function confirmBooking() {
  const name = inputName.value.trim();
  const id   = inputId.value.trim();
  if (!name || !id) { formError.classList.remove('hidden'); return; }

  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Booking…';

  const from = fromInput.value;
  const to   = calcToDate(from, currentPass);

  if (!bookings[currentSlot]) bookings[currentSlot] = {};
  if (!bookings[currentSlot][selectedSeat]) bookings[currentSlot][selectedSeat] = [];
  bookings[currentSlot][selectedSeat].push({ name, id, from, to });
  saveBookings(bookings);

  fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat: selectedSeat, slot: currentSlot, name, id, from, to }),
  }).catch(() => {});

  btnConfirm.disabled = false;
  btnConfirm.textContent = 'Confirm Booking';
  closeModal();
  renderGrid();
}

function cancelBooking() {
  const from = fromInput.value;
  const to   = calcToDate(from, currentPass);
  if (bookings[currentSlot]?.[selectedSeat]) {
    bookings[currentSlot][selectedSeat] = bookings[currentSlot][selectedSeat]
      .filter(b => !(b.from === from && b.to === to));
  }
  saveBookings(bookings);
  closeModal();
  renderGrid();
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

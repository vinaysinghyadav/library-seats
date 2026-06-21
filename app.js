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

const STORAGE_KEY = 'library_bookings_v1';

function loadBookings() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; } catch { return {}; }
}
function saveBookings(b) { localStorage.setItem(STORAGE_KEY, JSON.stringify(b)); }

// bookings[slot][seat] = { name, id }
let bookings = loadBookings();
let currentSlot = SLOTS[0];
let selectedSeat = null;

// ── DOM refs ──────────────────────────────────────────────
const slotSelect    = document.getElementById('slotSelect');
const seatGrid      = document.getElementById('seatGrid');
const statsAvail    = document.getElementById('statsAvail');
const statsBooked   = document.getElementById('statsBooked');
const modalOverlay  = document.getElementById('modalOverlay');
const modalTitle    = document.getElementById('modalTitle');
const modalSlotLbl  = document.getElementById('modalSlotLabel');
const modalClose    = document.getElementById('modalClose');
const bookForm      = document.getElementById('bookForm');
const bookedView    = document.getElementById('bookedView');
const inputName     = document.getElementById('inputName');
const inputId       = document.getElementById('inputId');
const formError     = document.getElementById('formError');
const btnConfirm    = document.getElementById('btnConfirm');
const btnCancel     = document.getElementById('btnCancel');
const viewName      = document.getElementById('viewName');
const viewId        = document.getElementById('viewId');
const viewSeat      = document.getElementById('viewSeat');
const viewSlot      = document.getElementById('viewSlot');
const dateDisplay   = document.getElementById('dateDisplay');

// ── Init ──────────────────────────────────────────────────
function init() {
  dateDisplay.textContent = new Date().toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  SLOTS.forEach((s, i) => {
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = s;
    slotSelect.appendChild(opt);
  });

  slotSelect.addEventListener('change', () => {
    currentSlot = SLOTS[slotSelect.value];
    renderGrid();
  });

  document.getElementById('btnExport').addEventListener('click', exportToExcel);
  modalClose.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });
  btnConfirm.addEventListener('click', confirmBooking);
  btnCancel.addEventListener('click', cancelBooking);

  renderGrid();
}

// ── Grid ──────────────────────────────────────────────────
function renderGrid() {
  seatGrid.innerHTML = '';
  const slotData = bookings[currentSlot] || {};
  let bookedCount = 0;

  SEATS.forEach(seat => {
    const btn = document.createElement('button');
    btn.className = 'seat';
    btn.textContent = seat;
    btn.title = seat;

    if (slotData[seat]) {
      bookedCount++;
      btn.classList.add('booked');
      btn.title = `${seat} — Booked by ${slotData[seat].name}`;
      btn.addEventListener('click', () => openModal(seat, slotData[seat]));
    } else {
      btn.classList.add('available');
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

  if (!bookings[currentSlot]) bookings[currentSlot] = {};
  bookings[currentSlot][selectedSeat] = { name, id };
  saveBookings(bookings);

  // Notify backend (email + Google Sheet) — fire and forget, don't block UI
  fetch('/api/book', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seat: selectedSeat, slot: currentSlot, name, id }),
  }).catch(() => {});

  btnConfirm.disabled = false;
  btnConfirm.textContent = 'Confirm Booking';
  closeModal();
  renderGrid();
}

function cancelBooking() {
  if (bookings[currentSlot]) delete bookings[currentSlot][selectedSeat];
  saveBookings(bookings);
  closeModal();
  renderGrid();
}

function exportToExcel() {
  const rows = [['Date', 'Time Slot', 'Seat', 'Name', 'Student/Staff ID']];
  const today = new Date().toLocaleDateString('en-IN');

  SLOTS.forEach(slot => {
    const slotData = bookings[slot] || {};
    SEATS.forEach(seat => {
      if (slotData[seat]) {
        rows.push([today, slot, seat, slotData[seat].name, slotData[seat].id]);
      }
    });
  });

  if (rows.length === 1) {
    alert('No bookings to export yet.');
    return;
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [14, 26, 6, 20, 16].map(w => ({ wch: w }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Bookings');
  XLSX.writeFile(wb, `library-bookings-${today.replace(/\//g, '-')}.xlsx`);
}

init();

// Read player chip color from URL, default red
const params = new URLSearchParams(location.search);
const playerChip = params.get('chip') || 'red';

// Generate board (6 rows × 7 columns)
const boardEl = document.getElementById('board');
for (let i = 0; i < 42; i++) {
  const cell = document.createElement('div');
  cell.classList.add('cell');
  boardEl.appendChild(cell);
}

// Example: Place chip in first available cell in column
function placeChip(colIndex, color) {
  const cells = [...boardEl.children];
  for (let row = 5; row >= 0; row--) {
    const cellIndex = row * 7 + colIndex;
    const cell = cells[cellIndex];
    if (!cell.querySelector('.chip')) {
      const chipEl = document.createElement('div');
      chipEl.classList.add('chip', color);
      cell.appendChild(chipEl);
      break;
    }
  }
}

// Click column to place chip
boardEl.addEventListener('click', e => {
  const cellIndex = [...boardEl.children].indexOf(e.target.closest('.cell'));
  if (cellIndex === -1) return;
  const col = cellIndex % 7;
  placeChip(col, playerChip);
});

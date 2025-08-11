// ==== CALIBRATION (set to align chip centers with the holes on Board.png) ====
// Fractions of boardWrapper width/height for the inner grid rectangle that contains the 7x6 holes.
let INSET_X = 0.065; // ~6.5% left & right (tweak if needed)
let INSET_Y = 0.120; // ~12% top & bottom (tweak if needed)

// Press 'g' to toggle a debug grid overlay to fine-tune INSET_X/INSET_Y.
let debugOn = false;

let currentPlayer = 'red';
const ROWS = 6, COLS = 7;
let board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

// Auto sequence (splash -> welcome -> leaderboard)
window.addEventListener('load', () => {
  showScreen('splashScreen');
  setTimeout(() => {
    showScreen('welcomeScreen');
    setTimeout(() => {
      loadLeaderboard();
      showScreen('leaderboardScreen');
    }, 2000);
  }, 2000);

  document.getElementById('playComputerBtn').addEventListener('click', startGame);
  document.getElementById('playPlayerBtn').addEventListener('click', startGame);

  window.addEventListener('resize', () => {
    if (!document.getElementById('gameScreen').classList.contains('hidden')) {
      renderBoard();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'g') {
      debugOn = !debugOn;
      renderBoard();
    }
  });
});

function loadLeaderboard() {
  const table = document.getElementById('leaderboardTable');
  table.innerHTML = '<tr><th>#</th><th>Username</th><th>Points</th></tr>';
  for (let i = 1; i <= 20; i++) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${i}</td><td>Player${i}</td><td>${Math.floor(Math.random()*100)}</td>`;
    table.appendChild(tr);
  }
}

function startGame() {
  showScreen('gameScreen');
  // Click anywhere on board to drop into the clicked column
  document.getElementById('boardWrapper').onclick = (e) => {
    const idx = columnFromEvent(e);
    if (idx !== null) placeInColumn(idx);
  };
  renderBoard();
}

function renderBoard() {
  const chipsLayer = document.getElementById('chipsLayer');
  const debugCanvas = document.getElementById('debugGrid');
  const wrapper = document.getElementById('boardWrapper');
  const w = wrapper.clientWidth, h = wrapper.clientHeight;

  chipsLayer.innerHTML = '';
  debugCanvas.width = w; debugCanvas.height = h;
  debugCanvas.classList.toggle('hidden', !debugOn);

  const gridLeft = INSET_X * w;
  const gridTop = INSET_Y * h;
  const gridW = w * (1 - 2*INSET_X);
  const gridH = h * (1 - 2*INSET_Y);
  const cellW = gridW / COLS;
  const cellH = gridH / ROWS;

  // Draw debug grid if enabled
  if (debugOn) {
    const ctx = debugCanvas.getContext('2d');
    ctx.clearRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(0,255,0,0.6)';
    ctx.lineWidth = 2;
    ctx.strokeRect(gridLeft, gridTop, gridW, gridH);
    // vertical lines
    for (let c=1;c<COLS;c++) {
      const x = gridLeft + c*cellW;
      ctx.beginPath(); ctx.moveTo(x, gridTop); ctx.lineTo(x, gridTop+gridH); ctx.stroke();
    }
    // horizontal lines
    for (let r=1;r<ROWS;r++) {
      const y = gridTop + r*cellH;
      ctx.beginPath(); ctx.moveTo(gridLeft, y); ctx.lineTo(gridLeft+gridW, y); ctx.stroke();
    }
    // centers
    ctx.fillStyle = 'rgba(255,0,0,0.8)';
    for (let r=0;r<ROWS;r++) for (let c=0;c<COLS;c++) {
      const cx = gridLeft + c*cellW + cellW/2;
      const cy = gridTop + r*cellH + cellH/2;
      ctx.beginPath(); ctx.arc(cx, cy, Math.min(cellW,cellH)*0.05, 0, Math.PI*2); ctx.fill();
    }
  }

  // Render chips already in the board
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board[r][c]) {
        const {cx, cy, size} = slotCenter(w, h, r, c);
        const chip = document.createElement('img');
        chip.src = board[r][c] === 'red' ? 'assets/Red.png' : 'assets/Yellow.png';
        chip.className = 'chip';
        chip.style.left = `${cx}px`;
        chip.style.top = `${cy}px`;
        chip.style.width = `${size}px`;
        chipsLayer.appendChild(chip);
      }
    }
  }
}

// Compute column index from a click/tap
function columnFromEvent(e){
  const wrapper = document.getElementById('boardWrapper');
  const rect = wrapper.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const x = e.clientX - rect.left;
  const gridLeft = INSET_X * w;
  const gridW = w * (1 - 2*INSET_X);
  if (x < gridLeft || x > gridLeft + gridW) return null;
  const cellW = gridW / 7;
  const col = Math.floor((x - gridLeft) / cellW);
  return Math.max(0, Math.min(6, col));
}

// Find the lowest empty row in a column and place a chip there with a falling animation
function placeInColumn(col){
  let row = -1;
  for (let r = ROWS-1; r >= 0; r--) {
    if (!board[r][col]) { row = r; break; }
  }
  if (row === -1) return; // full column

  const wrapper = document.getElementById('boardWrapper');
  const chipsLayer = document.getElementById('chipsLayer');
  const rect = wrapper.getBoundingClientRect();
  const w = rect.width, h = rect.height;
  const {cx, cy, size} = slotCenter(w,h,row,col);

  // falling chip
  const chip = document.createElement('img');
  chip.src = currentPlayer === 'red' ? 'assets/Red.png' : 'assets/Yellow.png';
  chip.className = 'chip';
  chip.style.left = `${cx}px`;
  chip.style.top = `-${size}px`; // start above
  chip.style.width = `${size}px`;
  chipsLayer.appendChild(chip);

  // animate to target
  requestAnimationFrame(()=>{
    chip.style.top = `${cy}px`;
  });

  setTimeout(()=>{
    // finalize state and render static
    board[row][col] = currentPlayer;
    renderBoard();
    // switch player (local two-player demo)
    currentPlayer = (currentPlayer === 'red') ? 'yellow' : 'red';
  }, 420);
}

// Compute center + size for a slot
function slotCenter(w, h, row, col){
  const gridLeft = INSET_X * w;
  const gridTop  = INSET_Y * h;
  const gridW = w * (1 - 2*INSET_X);
  const gridH = h * (1 - 2*INSET_Y);
  const cellW = gridW / 7;
  const cellH = gridH / 6;
  const cx = gridLeft + col*cellW + cellW/2;
  const cy = gridTop  + row*cellH + cellH/2;
  const size = Math.min(cellW, cellH) * 0.88; // chip diameter inside hole
  return {cx, cy, size};
}

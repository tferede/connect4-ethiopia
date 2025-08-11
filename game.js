\
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const screens = {
  splash: $('#screen-splash'),
  welcome: $('#screen-welcome'),
  leaderboard: $('#screen-leaderboard'),
  game: $('#screen-game'),
};

const leadersBody = $('#leaders-body');
const btnVsComputer = $('#btn-vs-computer');
const btnVsPlayer = $('#btn-vs-player');
const statusEl = $('#status');
const boardEl = $('#board');
const inviteWrap = $('#invite-wrap');
const inviteInput = $('#invite-input');
const inviteResult = $('#invite-result');

// Read Telegram user if running in WebApp
let currentUser = 'Guest';
try {
  if (window.Telegram && Telegram.WebApp && Telegram.WebApp.initDataUnsafe?.user?.username) {
    currentUser = Telegram.WebApp.initDataUnsafe.user.username;
  }
} catch(e){ /* ignore */ }

// Utility to show a screen
function showScreen(name){
  Object.values(screens).forEach(s => s.classList.remove('visible'));
  screens[name].classList.add('visible');
}

// Leaderboard helpers (localStorage)
function getLeaderboard(){
  let data = localStorage.getItem('c4_leaders');
  if (!data) return {};
  try { return JSON.parse(data); } catch { return {}; }
}
function setLeaderboard(obj){
  localStorage.setItem('c4_leaders', JSON.stringify(obj));
}
function addPoints(username, pts){
  const lb = getLeaderboard();
  lb[username] = (lb[username] || 0) + pts;
  setLeaderboard(lb);
}
function inTop20(username){
  if (!username) return false;
  const lb = getLeaderboard();
  const arr = Object.entries(lb).map(([u,p]) => ({u, p})).sort((a,b)=> b.p-a.p);
  return arr.slice(0,20).some(row => row.u === username);
}
function renderLeaderboard(){
  const lb = getLeaderboard();
  const arr = Object.entries(lb).map(([u,p]) => ({u, p}));
  arr.sort((a,b)=> b.p - a.p);
  leadersBody.innerHTML = '';
  arr.slice(0,20).forEach((row, i)=>{
    const tr = document.createElement('tr');
    const rank = document.createElement('td'); rank.textContent = i+1;
    const user = document.createElement('td'); user.textContent = row.u;
    const pts = document.createElement('td'); pts.textContent = row.p;
    tr.append(rank,user,pts);
    leadersBody.appendChild(tr);
  });
}

// Onboarding flow
function runOnboarding(){
  const params = new URLSearchParams(location.search);
  const onboarding = params.get('onboarding') === '1';
  const payload = params.get('payload') || null; // invite_... for friend matches (web app can use later)

  if (onboarding){
    showScreen('splash');
    setTimeout(()=>{
      showScreen('welcome');
      setTimeout(()=>{
        renderLeaderboard();
        showScreen('leaderboard');
      }, 2000);
    }, 2000);
  } else {
    renderLeaderboard();
    showScreen('leaderboard');
  }

  btnVsComputer.addEventListener('click', ()=> startGame({mode:'computer'}));
  btnVsPlayer.addEventListener('click', ()=> {
    // Ask for opponent username for scoring (optional)
    const opp = prompt("Enter opponent's Telegram username (without @) for scoring, or leave blank for Local Player 2:");
    const opponent = (opp && opp.trim()) ? opp.trim() : 'LocalPlayer2';
    startGame({mode:'player', opponent});
  });
}

// ---------------- Connect 4 Game ------------------
const ROWS = 6, COLS = 7;
let grid, current, vsComputer = false, gameOver = false, opponentName = 'LocalPlayer2';

function resetBoard(){
  boardEl.innerHTML='';
  for (let i=0;i<ROWS*COLS;i++){
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    boardEl.appendChild(cell);
  }
  grid = Array.from({length:ROWS}, ()=> Array(COLS).fill(0));
  current = 1; // 1=red (currentUser), 2=yellow (opponent or AI)
  gameOver = false;
  statusEl.textContent = vsComputer ? 'Your turn (Red)' : 'Red turn (You)';
}

function startGame({mode='computer', opponent='LocalPlayer2'}={}){
  vsComputer = (mode==='computer');
  opponentName = opponent;
  resetBoard();
  showScreen('game');
}

boardEl.addEventListener('click', (e)=>{
  if (gameOver) return;
  const cell = e.target.closest('.cell');
  if (!cell) return;
  const col = Number(cell.dataset.index) % COLS;
  playerMove(col);
});

function playerMove(col){
  const row = findDropRow(col);
  if (row === -1) return; // column full
  animateDrop(row,col, current === 1 ? 'red' : 'yellow', ()=>{
    grid[row][col] = current;
    if (checkWin(current)){
      endGame(current);
      return;
    }
    if (isBoardFull()){
      endGame(0); // draw
      return;
    }
    // switch
    current = (current===1?2:1);
    if (vsComputer){
      statusEl.textContent = current===1 ? 'Your turn (Red)' : 'Computer thinking…';
      if (current===2){
        setTimeout(()=>{
          const c = pickAiColumn();
          playerMove(c);
        }, 300);
      }
    } else {
      statusEl.textContent = current===1 ? 'Red turn (You)' : 'Yellow turn (' + opponentName + ')';
    }
  });
}

function findDropRow(col){
  for (let r=ROWS-1;r>=0;r--){
    if (grid[r][col] === 0) return r;
  }
  return -1;
}

// 0.4s drop animation
function animateDrop(targetRow, col, color, done){
  const cells = [...boardEl.children];
  const colXCell = cells[col]; // top cell in column for x-position
  const falling = document.createElement('div');
  falling.className = 'falling-chip ' + color;
  const columnRect = boardEl.getBoundingClientRect();
  const firstCellRect = colXCell.getBoundingClientRect();

  const colCenterX = firstCellRect.left + firstCellRect.width/2 - columnRect.left;
  falling.style.left = (colCenterX) + 'px';
  falling.style.top = '0px';
  falling.style.transform = 'translate(-50%, -50%)';

  boardEl.appendChild(falling);

  const bottomCellIndex = targetRow * COLS + col;
  const bottomCellRect = cells[bottomCellIndex].getBoundingClientRect();
  const finalY = (bottomCellRect.top + bottomCellRect.height/2) - columnRect.top;

  falling.style.transition = 'top 0.4s ease-in';
  requestAnimationFrame(()=>{
    falling.style.top = finalY + 'px';
  });

  setTimeout(()=>{
    falling.remove();
    const chip = document.createElement('div');
    chip.className = 'chip ' + color;
    const targetCell = cells[bottomCellIndex];
    targetCell.appendChild(chip);
    done && done();
  }, 420);
}

// Simple AI
function pickAiColumn(){
  const order = [3,2,4,1,5,0,6];
  for (const c of order){
    if (findDropRow(c) !== -1) return c;
  }
  return 0;
}

function isBoardFull(){
  return grid[0].every(v => v !== 0);
}

function checkWin(player){
  for (let r=0;r<ROWS;r++){
    for (let c=0;c<COLS-3;c++){
      if (grid[r][c]===player && grid[r][c+1]===player && grid[r][c+2]===player && grid[r][c+3]===player) return true;
    }
  }
  for (let c=0;c<COLS;c++){
    for (let r=0;r<ROWS-3;r++){
      if (grid[r][c]===player && grid[r+1][c]===player && grid[r+2][c]===player && grid[r+3][c]===player) return true;
    }
  }
  for (let r=0;r<ROWS-3;r++){
    for (let c=0;c<COLS-3;c++){
      if (grid[r][c]===player && grid[r+1][c+1]===player && grid[r+2][c+2]===player && grid[r+3][c+3]===player) return true;
    }
  }
  for (let r=3;r<ROWS;r++){
    for (let c=0;c<COLS-3;c++){
      if (grid[r][c]===player && grid[r-1][c+1]===player && grid[r-2][c+2]===player && grid[r-3][c+3]===player) return true;
    }
  }
  return false;
}

function endGame(winner){
  gameOver = true;

  // Determine scoring context BEFORE awarding
  const opponentIsTop20 = inTop20(opponentName);

  if (vsComputer){
    if (winner===1){
      statusEl.textContent = 'You win! (Red)';
      addPoints(currentUser, 10);
    } else if (winner===2){
      statusEl.textContent = 'Computer wins!';
      addPoints(currentUser, 3);
    } else {
      statusEl.textContent = 'Draw!';
      addPoints(currentUser, 5);
    }
  } else {
    // vs another player (local scoring using usernames)
    if (winner===1){
      // currentUser (red) wins
      if (opponentIsTop20){
        addPoints(currentUser, 60);
        addPoints(opponentName, 6);
      } else {
        addPoints(currentUser, 15);
        addPoints(opponentName, 5);
      }
      statusEl.textContent = 'You win! (Red)';
    } else if (winner===2){
      // opponent (yellow) wins
      if (opponentIsTop20){
        addPoints(opponentName, 10);
        addPoints(currentUser, 5);
      } else {
        addPoints(opponentName, 15);
        addPoints(currentUser, 5);
      }
      statusEl.textContent = 'Yellow wins! (' + opponentName + ')';
    } else {
      // draw
      addPoints(currentUser, 10);
      addPoints(opponentName, 10);
      statusEl.textContent = 'Draw!';
    }
  }

  // After short delay, return to leaderboard
  setTimeout(()=>{
    renderLeaderboard();
    showScreen('leaderboard');
  }, 1500);
}

// Back button
$('#btn-exit').addEventListener('click', ()=>{
  renderLeaderboard();
  showScreen('leaderboard');
});

// Boot
document.addEventListener('DOMContentLoaded', ()=>{
  if (window.Telegram?.WebApp) {
    Telegram.WebApp.ready();
    Telegram.WebApp.expand();
  }
  runOnboarding();
});

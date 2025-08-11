// ==== CALIBRATION (tweak to align holes) ====
let INSET_X = 0.065; // fraction of width (left & right) of inner grid
let INSET_Y = 0.120; // fraction of height (top & bottom) of inner grid

// Difficulty persists across sessions
function getLevel(){ return +(localStorage.getItem('c4_ai_level') || 1); }
function setLevel(n){ localStorage.setItem('c4_ai_level', String(Math.max(1, Math.min(5, n)))); }
let aiLevel = getLevel();

// Leaderboard (local only)
function getLeaders(){
  try { return JSON.parse(localStorage.getItem('c4_leaders')||'{}'); } catch { return {}; }
}
function setLeaders(obj){ localStorage.setItem('c4_leaders', JSON.stringify(obj)); }
function addPoints(user, pts){
  const lb = getLeaders();
  lb[user] = (lb[user] || 0) + pts;
  setLeaders(lb);
}

function username(){
  try{
    if (window.Telegram?.WebApp?.initDataUnsafe?.user?.username)
      return window.Telegram.WebApp.initDataUnsafe.user.username;
  }catch(e){}
  return 'Player';
}

// ---- Screens flow ----
function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
window.addEventListener('load', ()=>{
  show('splashScreen');
  setTimeout(()=>{
    show('welcomeScreen');
    setTimeout(()=>{
      renderLeaderboard();
      show('leaderboardScreen');
    },2000);
  },2000);

  document.getElementById('playComputerBtn').onclick = ()=> startGame('computer');
  document.getElementById('playPlayerBtn').onclick = ()=> {
    document.getElementById('invitePanel').classList.remove('hidden');
    document.getElementById('inviteInfo').textContent = '';
  };
  document.getElementById('inviteSendBtn').onclick = sendInvite;

  document.getElementById('backBtn').onclick = ()=>{
    renderLeaderboard();
    show('leaderboardScreen');
  };

  window.addEventListener('resize', ()=>{
    if (!document.getElementById('gameScreen').classList.contains('hidden')) renderBoard();
  });
});

// ---- Invitations ----
// Generates a deep-link that both starts your bot and passes a payload.
// Your running bot will receive startapp=invite_to_<target> and can DM them if they've started the bot before.
function inviteLinkFor(target){
  const bot = window.BOT_USERNAME || 'YourBot';
  const payload = 'invite_to_' + encodeURIComponent(target);
  return `https://t.me/${bot}?startapp=${payload}`;
}

function sendInvite(){
  const input = document.getElementById('inviteInput');
  const v = input.value.trim().replace(/^@/, '');
  if (!v){ document.getElementById('inviteInfo').textContent = 'Enter a username or phone number.'; return; }
  const link = inviteLinkFor(v);
  document.getElementById('inviteInfo').innerHTML = `
    Invitation link created:<br>
    <a href="${link}" target="_blank">${link}</a><br>
    It will open Telegram, start the bot, and put your friend directly into your game.
  `;
  // Also try to open Telegram immediately (user can confirm)
  window.open(link, '_blank');
}

// Leaderboard rendering: only show users with points; each name is a clickable invite
function renderLeaderboard(){
  const body = document.getElementById('leaderboardBody');
  body.innerHTML = '';
  const entries = Object.entries(getLeaders()).filter(([u,p])=> p>0).sort((a,b)=> b[1]-a[1]);
  entries.forEach(([u,p], idx)=>{
    const tr = document.createElement('tr');
    const a = document.createElement('a');
    a.textContent = u;
    a.href = inviteLinkFor(u);
    a.target = '_blank';
    const tdUser = document.createElement('td'); tdUser.appendChild(a);
    tr.innerHTML = `<td>${idx+1}</td>`;
    tr.appendChild(tdUser);
    const tdPts = document.createElement('td'); tdPts.textContent = p; tr.appendChild(tdPts);
    body.appendChild(tr);
  });
  if (entries.length === 0){
    const tr = document.createElement('tr'); tr.innerHTML = `<td colspan="3" style="color:#fff;opacity:0.8;">No scores yet — be the first!</td>`; body.appendChild(tr);
  }
}

// ---- Game (local) ----
const ROWS=6, COLS=7;
let grid, current, gameOver, vsComputer=true;
function reset(){
  grid = Array.from({length:ROWS},()=>Array(COLS).fill(0));
  current = 1; // 1=red (player), 2=yellow (AI or player2)
  gameOver=false;
}
function startGame(mode){
  vsComputer = (mode==='computer');
  reset();
  show('gameScreen');
  renderBoard();
  document.getElementById('boardWrapper').onclick = (e)=>{
    const col = columnFromEvent(e);
    if (col!=null) turn(col);
  };
  setStatus();
}
function setStatus(){
  const s = document.getElementById('status');
  if (gameOver) return;
  if (vsComputer){
    s.textContent = current===1 ? `Your turn (Red) — Level ${aiLevel}` : `Computer (Level ${aiLevel}) thinking…`;
  } else {
    s.textContent = current===1 ? 'Red turn (You)' : 'Yellow turn (Opponent)';
  }
}

function renderBoard(){
  const chips = document.getElementById('chipsLayer');
  const debug = document.getElementById('debugGrid');
  const wrap = document.getElementById('boardWrapper');
  const w = wrap.clientWidth, h = wrap.clientHeight;
  chips.innerHTML='';
  debug.width=w; debug.height=h; debug.classList.add('hidden');

  for (let r=0;r<ROWS;r++){
    for (let c=0;c<COLS;c++){
      if (grid[r][c]){
        const {cx,cy,size}=slotCenter(w,h,r,c);
        const img=document.createElement('img');
        img.src = grid[r][c]===1 ? 'assets/Red.png' : 'assets/Yellow.png';
        img.className='chip';
        img.style.left=`${cx}px`;
        img.style.top=`${cy}px`;
        img.style.width=`${size}px`;
        chips.appendChild(img);
      }
    }
  }
}

function columnFromEvent(e){
  const wrap = document.getElementById('boardWrapper');
  const rect = wrap.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const w = rect.width, h=rect.height;
  const left = INSET_X*w, right = w - INSET_X*w;
  if (x<left || x>right) return null;
  const col = Math.floor((x-left)/((right-left)/COLS));
  return Math.max(0, Math.min(COLS-1, col));
}

function slotCenter(w,h,row,col){
  const left = INSET_X*w, top = INSET_Y*h;
  const width = w - 2*INSET_X*w, height = h - 2*INSET_Y*h;
  const cellW = width/COLS, cellH = height/ROWS;
  const cx = left + col*cellW + cellW/2;
  const cy = top  + row*cellH + cellH/2;
  const size = Math.min(cellW, cellH) * 0.88;
  return {cx,cy,size};
}

function findDropRow(col){
  for (let r=ROWS-1; r>=0; r--) if (grid[r][col]===0) return r;
  return -1;
}

function animateDrop(row,col,color,cb){
  const wrap = document.getElementById('boardWrapper');
  const chips = document.getElementById('chipsLayer');
  const rect = wrap.getBoundingClientRect();
  const {cx,cy,size}=slotCenter(rect.width, rect.height, row, col);
  const img=document.createElement('img');
  img.src = color===1 ? 'assets/Red.png' : 'assets/Yellow.png';
  img.className='chip';
  img.style.left=`${cx}px`;
  img.style.top=`-${size}px`;
  img.style.width=`${size}px`;
  chips.appendChild(img);
  requestAnimationFrame(()=>{ img.style.top=`${cy}px`; });
  setTimeout(()=>{ cb && cb(); }, 420);
}

function turn(col){
  if (gameOver) return;
  const row = findDropRow(col);
  if (row===-1) return;
  animateDrop(row,col,current, ()=>{
    grid[row][col]=current;
    if (checkWin(current)) return end(current);
    if (isFull()) return end(0);
    current = 3-current;
    setStatus();
    if (vsComputer && current===2){
      setTimeout(()=>{
        const c = aiChoose();
        turn(c);
      }, 300);
    }
  });
}

function isFull(){ return grid[0].every(v=>v!==0); }

function checkWin(p){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS-3;c++)
    if (grid[r][c]===p && grid[r][c+1]===p && grid[r][c+2]===p && grid[r][c+3]===p) return true;
  for (let c=0;c<COLS;c++) for (let r=0;r<ROWS-3;r++)
    if (grid[r][c]===p && grid[r+1][c]===p && grid[r+2][c]===p && grid[r+3]===p) return true;
  for (let r=0;r<ROWS-3;r++) for (let c=0;c<COLS-3;c++)
    if (grid[r][c]===p && grid[r+1][c+1]===p && grid[r+2][c+2]===p && grid[r+3][c+3]===p) return true;
  for (let r=3;r<ROWS;r++) for (let c=0;c<COLS-3;c++)
    if (grid[r][c]===p && grid[r-1][c+1]===p && grid[r-2][c+2]===p && grid[r-3][c+3]===p) return true;
  return false;
}

function end(winner){
  gameOver=true;
  const me = username();
  if (vsComputer){
    if (winner===1){
      addPoints(me, 10);
      aiLevel = Math.min(5, aiLevel+1);
      setLevel(aiLevel);
      document.getElementById('status').textContent = `You win! Level increased to ${aiLevel}.`;
    } else if (winner===2){
      addPoints(me, 3);
      document.getElementById('status').textContent = `Computer wins (Level ${aiLevel}).`;
    } else {
      addPoints(me, 5);
      document.getElementById('status').textContent = `Draw.`;
    }
  } else {
    document.getElementById('status').textContent = winner===1 ? 'Red wins!' : winner===2 ? 'Yellow wins!' : 'Draw';
  }
  setTimeout(()=>{ renderLeaderboard(); show('leaderboardScreen'); }, 1500);
}

// ----------------- AI -----------------
function aiChoose(){
  // Level 1: random available, center bias
  // Level 2: immediate win > block > bias
  // Level 3+: lookahead (depth = level-1 up to 4)
  const avail = availableCols();
  if (aiLevel===1){
    return centerBias(avail);
  }
  // Level 2 heuristic
  if (aiLevel===2){
    let w = findImmediateWin(2); if (w!=null) return w;
    let b = findImmediateWin(1); if (b!=null) return b;
    return centerBias(avail);
  }
  // Level 3-5: minimax with depth
  const depth = Math.min(4, aiLevel-1);
  let best = -Infinity, bestCol = centerBias(avail);
  for (const c of avail){
    const r = simulateDrop(grid, c, 2);
    const score = minimax(simGrid(grid, r, c, 2), depth-1, false, -Infinity, Infinity);
    if (score > best){ best=score; bestCol=c; }
  }
  return bestCol;
}

function availableCols(){
  const a=[]; for (let c=0;c<COLS;c++) if (grid[0][c]===0) a.push(c); return a;
}

function centerBias(avail){
  // pick the available col closest to center (3)
  return avail.reduce((best, c)=>{
    if (best==null) return c;
    return Math.abs(c-3) < Math.abs(best-3) ? c : best;
  }, null);
}

function findImmediateWin(player){
  for (let c=0;c<COLS;c++){
    if (grid[0][c]!==0) continue;
    const r = simulateDrop(grid, c, player);
    if (r===-1) continue;
    const g = simGrid(grid, r, c, player);
    if (hasWin(g, player)) return c;
  }
  return null;
}

function simulateDrop(g, col, player){
  for (let r=ROWS-1;r>=0;r--) if (g[r][col]===0) return r;
  return -1;
}
function simGrid(g, r, c, player){
  const ng = g.map(row=>row.slice());
  ng[r][c]=player;
  return ng;
}
function hasWin(g, p){
  for (let r=0;r<ROWS;r++) for (let c=0;c<COLS-3;c++)
    if (g[r][c]===p && g[r][c+1]===p && g[r][c+2]===p && g[r][c+3]===p) return true;
  for (let c=0;c<COLS;c++) for (let r=0;r<ROWS-3;r++)
    if (g[r][c]===p && g[r+1][c]===p && g[r+2][c]===p && g[r+3]===p) return true;
  for (let r=0;r<ROWS-3;r++) for (let c=0;c<COLS-3;c++)
    if (g[r][c]===p && g[r+1][c+1]===p && g[r+2][c+2]===p && g[r+3][c+3]===p) return true;
  for (let r=3;r<ROWS;r++) for (let c=0;c<COLS-3;c++)
    if (g[r][c]===p && g[r-1][c+1]===p && g[r-2][c+2]===p && g[r-3][c+3]===p) return true;
  return false;
}

function scorePosition(g){
  if (hasWin(g,2)) return 1000;
  if (hasWin(g,1)) return -800;
  // small center preference
  const centerCol = 3;
  let score = 0;
  for (let r=0;r<ROWS;r++) if (g[r][centerCol]===2) score+=3;
  return score;
}

function minimax(g, depth, isMax, alpha, beta){
  if (depth===0 || hasWin(g,1) || hasWin(g,2)){
    return scorePosition(g);
  }
  const avail = []; for (let c=0;c<COLS;c++) if (g[0][c]===0) avail.push(c);
  if (avail.length===0) return 0;
  if (isMax){
    let best=-Infinity;
    for (const c of avail){
      const r=simulateDrop(g,c,2);
      const score=minimax(simGrid(g,r,c,2), depth-1, false, alpha, beta);
      best=Math.max(best,score); alpha=Math.max(alpha,score);
      if (beta<=alpha) break;
    }
    return best;
  } else {
    let best=Infinity;
    for (const c of avail){
      const r=simulateDrop(g,c,1);
      const score=minimax(simGrid(g,r,c,1), depth-1, true, alpha, beta);
      best=Math.min(best,score); beta=Math.min(beta,score);
      if (beta<=alpha) break;
    }
    return best;
  }
}

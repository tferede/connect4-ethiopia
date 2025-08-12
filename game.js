// ====== GLOBAL STATE ======
const ROWS=6, COLS=7;
let grid, current, gameOver, vsComputer=true;
let aiLevel = +(localStorage.getItem('c4_ai_level') || 1);

// Insets auto-calibrated from image; fallback defaults:
let INSET_X = 0.065, INSET_Y = 0.12;

// ====== UTILS ======
function uname(){
  try{ if (window.Telegram?.WebApp?.initDataUnsafe?.user?.username)
    return Telegram.WebApp.initDataUnsafe.user.username; }catch(e){}
  return 'Player';
}
function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.add('hidden')); document.getElementById(id).classList.remove('hidden'); }
function imgDecode(img){ if (img.decode) return img.decode().catch(()=>{}); return Promise.resolve(); }

// ====== SCREEN NAV ======
window.addEventListener('load', async ()=>{
  show('splashScreen');
  setTimeout(()=>{
    show('welcomeScreen');
    setTimeout(async ()=>{
      await ensureCalibration();
      renderLeaderboard();
      show('leaderboardScreen');
    },2000);
  },2000);

  document.getElementById('playComputerBtn').onclick = ()=> startGame('computer');
  document.getElementById('playPlayerBtn').onclick = ()=> {
    document.getElementById('invitePanel').classList.remove('hidden');
    document.getElementById('inviteInfo').textContent = '';
    document.getElementById('inviteActions').classList.add('hidden');
  };
  document.getElementById('inviteSendBtn').onclick = sendInvite;
  document.getElementById('backBtn').onclick = ()=>{ renderLeaderboard(); show('leaderboardScreen'); };

  // Input (touch+mouse)
  const wrapper = document.getElementById('boardWrapper');
  wrapper.addEventListener('pointerdown', (e)=>{
    if (document.getElementById('gameScreen').classList.contains('hidden')) return;
    const col=columnFromEvent(e);
    if (col!=null) turn(col);
  });

  window.addEventListener('resize', ()=>{
    if (!document.getElementById('gameScreen').classList.contains('hidden')) sizeBoard(); 
  });
});



// ====== HOLE MASK (chips only visible in the 7x6 circles) ======
function applyHolesMask(){
  const layer = document.getElementById('chipsLayer');
  const wrap = document.getElementById('boardWrapper');
  const W = wrap.clientWidth, H = wrap.clientHeight;
  if (!W || !H) return;

  const left = INSET_X * W, top = INSET_Y * H;
  const innerW = W - 2*INSET_X*W, innerH = H - 2*INSET_Y*H;
  const cellW = innerW / COLS, cellH = innerH / ROWS;
  const r = Math.min(cellW, cellH) * 0.49; // circle radius ~ matches hole

  // Build an SVG mask: white circles = visible; black = hidden
  let circles = '';
  for (let rIdx=0; rIdx<ROWS; rIdx++){
    for (let cIdx=0; cIdx<COLS; cIdx++){
      const cx = left + cIdx*cellW + cellW/2;
      const cy = top  + rIdx*cellH + cellH/2;
      circles += `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${r.toFixed(2)}" fill="white"/>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}"><defs><mask id="m"><rect width="100%" height="100%" fill="black"/>${circles}</mask></defs><rect width="100%" height="100%" fill="white" mask="url(#m)"/></svg>`;
  const url = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

  layer.style.webkitMaskImage = `url('${url}')`;
  layer.style.maskImage = `url('${url}')`;
  layer.style.webkitMaskRepeat = 'no-repeat';
  layer.style.maskRepeat = 'no-repeat';
  layer.style.webkitMaskSize = '100% 100%';
  layer.style.maskSize = '100% 100%';
}
// ====== BOARD SIZING (>= 55% of screen) ======
function sizeBoard(){
  const vh = Math.max(document.documentElement.clientHeight, window.innerHeight || 0);
  const vw = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
  const targetH = Math.max(0.55*vh, Math.min(0.85*vh, vw * (6/7)));
  const targetW = targetH * (7/6);
  document.getElementById('boardWrapper').style.width = targetW + 'px';
  applyHolesMask();
}

// ====== AUTO CALIBRATION ======
function clamp(v, lo, hi){ return Math.min(hi, Math.max(lo, v)); }
function applyCalibration(insetX, insetY){
  // Clamp to sane ranges for this board style
  const x = clamp(insetX, 0.04, 0.12);
  const y = clamp(insetY, 0.08, 0.18);
  INSET_X = isFinite(x) ? x : INSET_X;
  INSET_Y = isFinite(y) ? y : INSET_Y;
  applyHolesMask();
}
async function ensureCalibration(){
  const img = document.getElementById('boardImage');
  await imgDecode(img);
  try{
    const {insetX, insetY} = calibrateFromImage(img);
    if (isFinite(insetX) && isFinite(insetY)){
      applyCalibration(insetX, insetY);
      applyHolesMask();
    }
  }catch(e){ applyCalibration(INSET_X, INSET_Y); }
}

function smooth(arr, k=5){
  const out=new Array(arr.length).fill(0);
  for(let i=0;i<arr.length;i++){
    let s=0,c=0;
    for(let j=-k;j<=k;j++){
      const idx=i+j; if(idx<0||idx>=arr.length) continue;
      s+=arr[idx]; c++;
    }
    out[i]=s/c;
  }
  return out;
}
function longestRunBelow(arr, thr){
  let bestStart=0,bestLen=0,curStart=0,curLen=0;
  for(let i=0;i<arr.length;i++){
    if(arr[i]<thr){ if(curLen===0) curStart=i; curLen++; }
    else{ if(curLen>bestLen){ bestLen=curLen; bestStart=curStart; } curLen=0; }
  }
  if(curLen>bestLen){ bestLen=curLen; bestStart=curStart; }
  return [bestStart, bestStart+bestLen-1];
}
function calibrateFromImage(img){
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const cv = document.createElement('canvas'); cv.width=iw; cv.height=ih;
  const ctx=cv.getContext('2d'); ctx.drawImage(img,0,0,iw,ih);
  const data=ctx.getImageData(0,0,iw,ih).data;

  const N=100; let r=0,g=0,b=0,c=0;
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const i=(y*iw+x)*4; r+=data[i]; g+=data[i+1]; b+=data[i+2]; c++;}
  r/=c; g/=c; b/=c; const thr=50;
  const isBg=(x,y)=>{ const i=(y*iw+x)*4, dr=data[i]-r,dg=data[i+1]-g,db=data[i+2]-b; return (dr*dr+dg*dg+db*db)<thr*thr; };

  const y1=Math.floor(ih*0.15), y2=Math.floor(ih*0.85);
  const colFrac=new Array(iw).fill(0);
  for(let x=0;x<iw;x++){
    let s=0; for(let y=y1;y<y2;y++) if(isBg(x,y)) s++;
    colFrac[x]=s/(y2-y1);
  }
  const rowX1=Math.floor(iw*0.08), rowX2=Math.floor(iw*0.92);
  const rowFrac=new Array(ih).fill(0);
  for(let y=0;y<ih;y++){
    let s=0; for(let x=rowX1;x<rowX2;x++) if(isBg(x,y)) s++;
    rowFrac[y]=s/(rowX2-rowX1);
  }

  const cS=smooth(colFrac,7), rS=smooth(rowFrac,7);
  const cMin=Math.min(...cS), cMax=Math.max(...cS), cThr=(cMin+cMax)/2;
  const rMin=Math.min(...rS), rMax=Math.max(...rS), rThr=(rMin+rMax)/2;

  const [xMin,xMax]=longestRunBelow(cS, cThr);
  const [yMin,yMax]=longestRunBelow(rS, rThr);

  return { insetX: xMin/iw, insetY: yMin/ih };
}

// ====== LEADERBOARD ======
function getLeaders(){ try{return JSON.parse(localStorage.getItem('c4_leaders')||'{}');}catch{ return {}; } }
function setLeaders(o){ localStorage.setItem('c4_leaders', JSON.stringify(o)); }
function addPoints(u,p){ const lb=getLeaders(); lb[u]=(lb[u]||0)+p; setLeaders(lb); }
function renderLeaderboard(){
  const body = document.getElementById('leaderboardBody');
  body.innerHTML='';
  const rows = Object.entries(getLeaders()).filter(([u,p])=>p>0).sort((a,b)=>b[1]-a[1]);
  if (rows.length===0){
    const tr=document.createElement('tr'); tr.innerHTML='<td colspan="3" style="color:#fff;opacity:.85;">No scores yet — be the first!</td>'; body.appendChild(tr);
    return;
  }
  rows.forEach(([u,p],i)=>{
    const tr=document.createElement('tr');
    const a=document.createElement('a'); a.textContent=u; a.href=inviteLinkFor(u); a.target='_blank';
    tr.innerHTML=`<td>${i+1}</td>`;
    const td=document.createElement('td'); td.appendChild(a); tr.appendChild(td);
    tr.insertAdjacentHTML('beforeend', `<td>${p}</td>`);
    body.appendChild(tr);
  });
}

// ====== INVITES ======
function inviteLinkFor(target){
  const bot = window.BOT_USERNAME || 'YourBot';
  const payload = 'invite_to_' + encodeURIComponent(target);
  return `https://t.me/${bot}?startapp=${payload}`;
}
function buildInviteText(target){
  const id = /^@/.test(target) ? target : '@' + target;
  const link = inviteLinkFor(target.replace(/^@/,''));
  return `Please join me ${id} in a game of Connect 4 by clicking here:\n${link}`;
}
async function copyText(text){
  try{ await navigator.clipboard.writeText(text); return true; }
  catch(e){
    const ta=document.createElement('textarea'); ta.value=text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); return true;
  }
}
function clearInviteUI(){
  const panel = document.getElementById('invitePanel');
  const info  = document.getElementById('inviteInfo');
  const actions = document.getElementById('inviteActions');
  info.textContent=''; actions.classList.add('hidden'); panel.classList.add('hidden');
}
function sendInvite(){
  const input=document.getElementById('inviteInput');
  const vRaw=input.value.trim();
  if(!vRaw){ document.getElementById('inviteInfo').textContent='Enter a username or phone number.'; return; }
  const v = vRaw.replace(/^@/,'');
  const info=document.getElementById('inviteInfo');
  const actions=document.getElementById('inviteActions');

  const text=buildInviteText(vRaw);
  const linkOnly=inviteLinkFor(v);
  info.innerHTML = `<div class="invite-blob">${text.replaceAll('\n','<br>')}</div>`;
  actions.classList.remove('hidden');

  document.getElementById('copyInviteBtn').onclick = async ()=>{
    const ok=await copyText(text);
    info.innerHTML = `<div>${ok?'Copied to clipboard!':'Copy failed — please copy manually.'}</div>`;
  };
  document.getElementById('openChatBtn').onclick = async ()=>{
    await copyText(text);
    clearInviteUI();
    const isUsername = /^[A-Za-z0-9_]{5,}$/.test(v);
    const url = isUsername ? `https://t.me/${v}`
      : `https://t.me/share/url?url=${encodeURIComponent(linkOnly)}&text=${encodeURIComponent(text)}`;
    if (window.Telegram?.WebApp?.openTelegramLink) Telegram.WebApp.openTelegramLink(url);
    else window.open(url,'_blank');
  };
}

// ====== GAME ======
function reset(){ grid = Array.from({length:ROWS},()=>Array(COLS).fill(0)); current=1; gameOver=false; }
function startGame(mode){
  vsComputer=(mode==='computer'); reset(); show('gameScreen'); sizeBoard(); applyHolesMask(); renderBoard();
  document.getElementById('status').textContent = vsComputer ? `Your turn (Red) — Level ${aiLevel}` : 'Red turn (You)';
}
function renderBoard(){
  const chips=document.getElementById('chipsLayer');
  const wrap=document.getElementById('boardWrapper');
  const w=wrap.clientWidth, h=wrap.clientHeight;
  chips.innerHTML='';
  for(let r=0;r<ROWS;r++){
    for(let c=0;c<COLS;c++){
      if(grid[r][c]){
        const {cx,cy,size}=slotCenter(w,h,r,c);
        const img=document.createElement('img');
        img.src = grid[r][c]===1 ? 'assets/Red.png' : 'assets/Yellow.png';
        img.className='chip'; img.style.left=`${cx}px`; img.style.top=`${cy}px`; img.style.width=`${size}px`;
        chips.appendChild(img);
      }
    }
  }
}
function columnFromEvent(e){
  const wrap=document.getElementById('boardWrapper');
  const rect=wrap.getBoundingClientRect();
  const x=e.clientX - rect.left;
  const w=rect.width;
  const left=INSET_X*w, right=w-INSET_X*w;
  if(x<left||x>right) return null;
  return Math.max(0, Math.min(COLS-1, Math.floor((x-left)/((right-left)/COLS))));
}
function slotCenter(w,h,row,col){
  const left=INSET_X*w, top=INSET_Y*h;
  const innerW=w-2*INSET_X*w, innerH=h-2*INSET_Y*h;
  const cellW=innerW/COLS, cellH=innerH/ROWS;
  const cx=left + col*cellW + cellW/2;
  const cy=top  + row*cellH + cellH/2;
  const size=Math.min(cellW, cellH)*0.98; // bigger chips + visible
  return {cx,cy,size};
}
function findDropRow(col){ for(let r=ROWS-1;r>=0;r--) if(grid[r][col]===0) return r; return -1; }
function animateDrop(row,col,color,cb){
  const wrap=document.getElementById('boardWrapper');
  const chips=document.getElementById('chipsLayer');
  const rect=wrap.getBoundingClientRect();
  const {cx,cy,size}=slotCenter(rect.width, rect.height, row, col);
  const img=document.createElement('img');
  img.src = color===1 ? 'assets/Red.png' : 'assets/Yellow.png';
  img.className='chip'; img.style.left=`${cx}px`; img.style.top=`-${size}px`; img.style.width=`${size}px`;
  chips.appendChild(img);
  requestAnimationFrame(()=>{ img.style.top=`${cy}px`; });
  setTimeout(()=>{ cb&&cb(); }, 420);
}
function setStatus(){
  const s=document.getElementById('status'); if (gameOver) return;
  if(vsComputer) s.textContent = current===1 ? `Your turn (Red) — Level ${aiLevel}` : `Computer (Level ${aiLevel}) thinking…`;
  else s.textContent = current===1 ? 'Red turn (You)' : 'Yellow turn (Opponent)';
}
function turn(col){
  if (gameOver) return;
  const row=findDropRow(col); if(row===-1) return;
  animateDrop(row,col,current, ()=>{
    grid[row][col]=current;
    if (checkWin(current)) { end(current); return; }
    if (isFull())         { end(0); return; }
    current=3-current; setStatus();
    if (vsComputer && current===2){
      setTimeout(()=>{ const c=aiChoose(); turn(c); }, 200);
    }
  });
}
function isFull(){ return grid[0].every(v=>v!==0); }
// Robust 4-direction win detection
function checkWin(p){
  const dirs=[[0,1],[1,0],[1,1],[-1,1]];
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(grid[r][c]!==p) continue;
    for(const [dr,dc] of dirs){
      let k=1; while(k<4 && inBounds(r+dr*k,c+dc*k) && grid[r+dr*k][c+dc*k]===p) k++;
      if(k===4) return true;
    }
  }
  return false;
}
function inBounds(r,c){ return r>=0 && r<ROWS && c>=0 && c<COLS; }
function end(winner){
  gameOver=true;
  const me=uname();
  const s=document.getElementById('status');
  if (vsComputer){
    if (winner===1){ addPoints(me,10); aiLevel=Math.min(5,aiLevel+1); localStorage.setItem('c4_ai_level',String(aiLevel)); s.textContent=`You win! Level is now ${aiLevel}.`; }
    else if (winner===2){ addPoints(me,3); s.textContent=`Computer wins (Level ${aiLevel}).`; }
    else { addPoints(me,5); s.textContent='Draw.'; }
  } else {
    s.textContent = winner===1 ? 'Red wins!' : winner===2 ? 'Yellow wins!' : 'Draw.';
  }
  setTimeout(()=>{ renderLeaderboard(); show('leaderboardScreen'); }, 1500);
}

// ====== AI ======
function availableCols(){ const a=[]; for(let c=0;c<COLS;c++) if(grid[0][c]===0) a.push(c); return a; }
function centerBias(a){ return a.reduce((b,c)=> b==null?c : Math.abs(c-3)<Math.abs(b-3)?c:b, null); }
function simulateDrop(g,c,p){ for(let r=ROWS-1;r>=0;r--) if(g[r][c]===0) return r; return -1; }
function simGrid(g,r,c,p){ const ng=g.map(row=>row.slice()); ng[r][c]=p; return ng; }
function hasWinOnGrid(g,p){
  const dirs=[[0,1],[1,0],[1,1],[-1,1]];
  for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
    if(g[r][c]!==p) continue;
    for(const [dr,dc] of dirs){
      let k=1; while(k<4 && r+dr*k>=0 && r+dr*k<ROWS && c+dc*k>=0 && c+dc*k<COLS && g[r+dr*k][c+dc*k]===p) k++;
      if(k===4) return true;
    }
  }
  return false;
}
function findImmediateWin(player){
  for(const c of availableCols()){
    const r=simulateDrop(grid,c,player); if(r===-1) continue;
    const g=simGrid(grid,r,c,player); if(hasWinOnGrid(g,player)) return c;
  }
  return null;
}
function scorePosition(g){
  if (hasWinOnGrid(g,2)) return 1000;
  if (hasWinOnGrid(g,1)) return -800;
  let s=0; for(let r=0;r<ROWS;r++) if(g[r][3]===2) s+=3; return s;
}
function minimax(g, depth, isMax, alpha, beta){
  if (depth===0 || hasWinOnGrid(g,1) || hasWinOnGrid(g,2)) return scorePosition(g);
  const avail=[]; for(let c=0;c<COLS;c++) if(g[0][c]===0) avail.push(c);
  if (avail.length===0) return 0;
  if (isMax){
    let best=-Infinity;
    for(const c of avail){
      const r=simulateDrop(g,c,2);
      const score=minimax(simGrid(g,r,c,2), depth-1, false, alpha, beta);
      best=Math.max(best,score); alpha=Math.max(alpha,score); if(beta<=alpha) break;
    }
    return best;
  } else {
    let best=Infinity;
    for(const c of avail){
      const r=simulateDrop(g,c,1);
      const score=minimax(simGrid(g,r,c,1), depth-1, true, alpha, beta);
      best=Math.min(best,score); beta=Math.min(beta,score); if(beta<=alpha) break;
    }
    return best;
  }
}
function aiChoose(){
  const avail=availableCols();
  if (aiLevel<=1) return centerBias(avail);
  if (aiLevel===2){ const w=findImmediateWin(2); if(w!=null) return w; const b=findImmediateWin(1); if(b!=null) return b; return centerBias(avail); }
  const depth=Math.min(4, aiLevel-1);
  let best=-Infinity, bestCol=centerBias(avail);
  for(const c of avail){
    const r=simulateDrop(grid,c,2);
    const score=minimax(simGrid(grid,r,c,2), depth-1, false, -Infinity, Infinity);
    if(score>best){ best=score; bestCol=c; }
  }
  return bestCol;
}

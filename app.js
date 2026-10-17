const $ = s => document.querySelector(s);
const state = { user: null, games: [], mode: "login", activeGame: null, score: 0, gameCleanup: null };
const gameMeta = {
  reaction: { icon: "↯", accent: "cyan" },
  memory: { icon: "▦", accent: "purple" },
  core: { icon: "◉", accent: "pink" },
  "2048": { icon: "▩", accent: "green" }
};
const gameTitles = { reaction: "反应力测试", memory: "记忆矩阵", core: "能量核心", "2048": "NEON 2048" };
let toastTimer;
function toast(message) {
  const el = $("#toast"); el.textContent = message; el.classList.add("show");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}
async function api(url, options = {}) {
  const response = await fetch(url, { credentials: "same-origin", ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) } });
  const data = response.status === 204 ? {} : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "请求失败，请稍后重试。");
  return data;
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function setAuthMode(mode) {
  state.mode = mode;
  document.querySelectorAll(".auth-tabs button").forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
  $("#authTitle").innerHTML = mode === "login" ? "欢迎回来<span class=\"title-dot\">.</span>" : "创建玩家档案<span class=\"title-dot\">.</span>";
  $("#authHint").textContent = mode === "login" ? "登录后保存成绩和玩家档案。" : "用户名 3–20 位，密码至少 8 位。";
  $("#authSubmit").textContent = mode === "login" ? "登录系统 ↗" : "创建账号 ↗";
  $("#authForm [name=password]").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("#authMessage").textContent = "";
}
function openAuth(mode = "login") { setAuthMode(mode); $("#authModal").classList.remove("hidden"); }
function closeAuth() { $("#authModal").classList.add("hidden"); }
function renderAccount() {
  const root = $("#account");
  if (!state.user) { root.innerHTML = '<button class="btn btn-ghost" id="loginOpen">登录 / 注册</button>'; $("#loginOpen").onclick = () => openAuth(); return; }
  root.innerHTML = `<span class="muted" style="font-size:12px">HI, ${escapeHtml(state.user.username)}</span><button class="btn btn-ghost small" id="logoutBtn">退出</button>`;
  $("#logoutBtn").onclick = async () => { try { await api("/api/auth/logout", { method: "POST" }); state.user = null; renderAll(); toast("已安全退出。"); } catch(e) { toast(e.message); } };
}
function renderGames() {
  const q = $("#search").value.trim().toLowerCase(), cat = $("#category").value;
  const list = state.games.filter(g => (cat === "all" || g.category === cat) && `${g.title} ${g.category} ${g.description}`.toLowerCase().includes(q));
  $("#gameCount").textContent = String(state.games.length).padStart(2,"0");
  $("#gameGrid").innerHTML = list.length ? list.map(g => {
    const meta = gameMeta[g.id] || {icon:"✦",accent:g.accent||"cyan"};
    return `<article class="game-card" data-accent="${escapeHtml(meta.accent)}"><div class="game-card-top"><div class="game-icon">${meta.icon}</div><span class="game-tag">${escapeHtml(g.category)}</span></div><h3>${escapeHtml(g.title)}</h3><p>${escapeHtml(g.description)}</p><button class="play-btn" data-play="${escapeHtml(g.id)}">开始游戏 <span>↗</span></button></article>`;
  }).join("") : '<div class="empty">没有找到匹配的游戏，换个关键词试试。</div>';
  document.querySelectorAll("[data-play]").forEach(b => b.onclick = () => openGame(b.dataset.play));
}
function renderLeaderboard() {
  api("/api/leaderboard").then(({leaderboard}) => {
    const rows = leaderboard.slice(0,8);
    $("#leaderboard").innerHTML = rows.length ? rows.map((r,i) => `<div class="rank-row"><span class="rank-num ${i<3?"top":""}">${String(i+1).padStart(2,"0")}</span><div><div class="rank-name">${escapeHtml(r.username)}</div><div class="rank-game">${escapeHtml(gameTitles[r.game_id] || r.game_id)}</div></div><strong class="rank-score">${Number(r.score).toLocaleString()}</strong></div>`).join("") : '<p class="muted">还没有成绩。成为第一个登上榜单的玩家吧。</p>';
  }).catch(() => $("#leaderboard").innerHTML = '<p class="muted">暂时无法加载排行榜。</p>');
}
async function renderProfile() {
  if (!state.user) {
    $("#profileContent").innerHTML = '<div class="profile-icon">?</div><h3>尚未登录</h3><p class="muted">登录后保存成绩，加入排行榜。</p><button class="btn btn-primary" id="profileLogin">创建玩家档案 ↗</button>';
    $("#profileLogin").onclick = () => openAuth("register"); $("#playerLabel").textContent = "∞"; $("#adminSection").classList.add("hidden"); return;
  }
  try {
    const data = await api("/api/me");
    const scores = data.bestScores || [];
    $("#profileContent").innerHTML = `<div class="profile-icon">${escapeHtml(state.user.username.slice(0,1).toUpperCase())}</div><h3>${escapeHtml(state.user.username)}</h3><p class="muted">玩家档案已连接 · ${state.user.role === "admin" ? "管理员" : "普通玩家"}</p><div class="profile-metrics"><div><strong>${scores.length}</strong><span>已挑战游戏</span></div><div><strong>${scores.reduce((a,s)=>a+s.score,0).toLocaleString()}</strong><span>最佳成绩总和</span></div><div><strong>${scores.length ? Math.max(...scores.map(s=>s.score)).toLocaleString() : "0"}</strong><span>单项最佳</span></div></div><button class="btn btn-ghost" id="refreshProfile">刷新档案 ↻</button>`;
    $("#refreshProfile").onclick = renderProfile; $("#playerLabel").textContent = "LV.01";
    if (state.user.role === "admin") { $("#adminSection").classList.remove("hidden"); loadAdmin(); } else $("#adminSection").classList.add("hidden");
  } catch(e) { toast(e.message); }
}
async function renderAll() { renderAccount(); renderGames(); renderLeaderboard(); await renderProfile(); }
async function refreshMe() { const data = await api("/api/me"); state.user = data.user; await renderAll(); }
$("#loginOpen").onclick = () => openAuth();
$("#profileLogin").onclick = () => openAuth("register");
$("#modalClose").onclick = closeAuth;
$("#authModal").addEventListener("click", e => { if(e.target === $("#authModal")) closeAuth(); });
document.querySelectorAll(".auth-tabs button").forEach(b => b.onclick = () => setAuthMode(b.dataset.mode));
$("#authForm").addEventListener("submit", async e => {
  e.preventDefault(); const form = new FormData(e.currentTarget);
  const payload = { username: String(form.get("username")).trim(), password: String(form.get("password")) };
  const message = $("#authMessage"); message.textContent = "正在验证…";
  try {
    const result = await api(state.mode === "login" ? "/api/auth/login" : "/api/auth/register", { method:"POST", body:JSON.stringify(payload) });
    state.user = result.user; closeAuth(); e.currentTarget.reset(); await renderAll(); toast(state.mode === "login" ? "登录成功，欢迎回来。" : "账号创建成功，欢迎加入。");
  } catch(err) { message.textContent = err.message; }
});
$("#search").addEventListener("input", renderGames);
$("#category").addEventListener("change", renderGames);
document.addEventListener("keydown", e => {
  if (e.key === "Escape") { closeAuth(); closeGame(); }
  if (state.activeGame === "2048" && ["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.key)) { e.preventDefault(); move2048(e.key); }
});
async function loadAdmin() {
  try {
    const [overview, games] = await Promise.all([api("/api/admin/overview"), api("/api/admin/games")]);
    $("#overview").innerHTML = [["玩家",overview.users],["成绩",overview.scores],["游戏",overview.games]].map(([k,v])=>`<div class="overview-stat"><strong>${v}</strong><span>${k}</span></div>`).join("");
    $("#adminGames").innerHTML = games.games.map(g=>`<div class="admin-game-row"><div><strong>${escapeHtml(g.title)}</strong><small>${escapeHtml(g.id)} · ${g.visible ? "展示中" : "已隐藏"}</small></div><button class="btn btn-ghost small" data-toggle-game="${escapeHtml(g.id)}" data-visible="${g.visible ? "false":"true"}">${g.visible ? "隐藏":"恢复展示"}</button></div>`).join("");
    document.querySelectorAll("[data-toggle-game]").forEach(b=>b.onclick=async()=>{try{await api(`/api/admin/games/${encodeURIComponent(b.dataset.toggleGame)}`,{method:"PATCH",body:JSON.stringify({visible:b.dataset.visible==="true"})});await loadGames();await loadAdmin();toast("游戏状态已更新。");}catch(e){toast(e.message);}});
  } catch(e) { toast(e.message); }
}
async function loadGames() { const data = await api("/api/games"); state.games = data.games; renderGames(); renderLeaderboard(); }
$("#addGameForm").addEventListener("submit", async e => {
  e.preventDefault(); const f = new FormData(e.currentTarget);
  const payload = Object.fromEntries(["id","title","category","description"].map(k=>[k,String(f.get(k)).trim()]));
  try { await api("/api/admin/games",{method:"POST",body:JSON.stringify(payload)});e.currentTarget.reset();await loadGames();await loadAdmin();toast("游戏条目已添加。"); } catch(err) { toast(err.message); }
});

function showGame(id, title, html, status) {
  state.activeGame = id; $("#gameTitle").textContent = title; $("#gameBody").innerHTML = html; $("#gameStatus").textContent = status || "准备开始"; $("#gameModal").classList.remove("hidden");
}
function closeGame() { if ($("#gameModal").classList.contains("hidden")) return; if (state.gameCleanup) state.gameCleanup(); state.gameCleanup=null; state.activeGame=null; $("#gameModal").classList.add("hidden"); }
$("#gameClose").onclick = closeGame;
$("#gameModal").addEventListener("click",e=>{if(e.target === $("#gameModal"))closeGame();});
async function submitScore(gameId, score) {
  if (!state.user) { toast("成绩已计算。登录后即可保存并加入排行榜。"); openAuth("register"); return; }
  try { await api("/api/scores",{method:"POST",body:JSON.stringify({gameId,score:Math.max(0,Math.floor(score))})});toast("成绩已保存！");renderLeaderboard();renderProfile(); } catch(e) { toast(e.message); }
}
function openGame(id) {
  if(id==="reaction") return playReaction();
  if(id==="memory") return playMemory();
  if(id==="core") return playCore();
  if(id==="2048") return play2048();
  showGame(id, state.games.find(g=>g.id===id)?.title || "街机游戏", '<div class="game-center"><p>这是一个新添加的游戏入口。你可以在 public/app.js 中为它编写玩法。</p></div>',"新游戏入口");
}
function playReaction() {
  let started=0,timer=null,ended=false;
  showGame("reaction","反应力测试",'<div class="game-center"><p>点击开始，等待屏幕变绿后立刻点击。不要提前点击。</p><div class="big-number" id="reactionNum">READY</div><button class="btn btn-primary game-action" id="reactionStart">开始测试</button><button class="target-pad hidden" id="reactionTarget">CLICK!</button></div>',"准备测试你的反应速度。");
  $("#reactionStart").onclick=()=>{ended=false;$("#reactionStart").classList.add("hidden");$("#reactionNum").textContent="WAIT…";$("#reactionNum").style.color="var(--pink)";const delay=1200+Math.random()*2600;timer=setTimeout(()=>{started=performance.now();$("#reactionNum").textContent="NOW!";$("#reactionNum").style.color="var(--green)";$("#reactionTarget").classList.remove("hidden");},delay);};
  $("#reactionTarget").onclick=()=>{if(ended)return;ended=true;if(!started){clearTimeout(timer);$("#reactionNum").textContent="太早了！";$("#reactionTarget").classList.add("hidden");$("#reactionStart").classList.remove("hidden");$("#gameStatus").textContent="抢跑了，再试一次。";return;}const ms=Math.round(performance.now()-started);$("#reactionNum").textContent=`${ms} ms`;$("#reactionNum").style.color="var(--cyan)";$("#reactionTarget").classList.add("hidden");$("#reactionStart").classList.remove("hidden");$("#gameStatus").textContent=ms<220?"超快反应！":ms<320?"反应不错！":"再挑战一次，看看能否更快。";submitScore("reaction",Math.max(0,2000-ms));};
  state.gameCleanup=()=>clearTimeout(timer);
}
function playMemory() {
  let sequence=[],input=[],round=0,playing=false;
  showGame("memory","记忆矩阵",`<div class="game-center"><p>记住依次亮起的方格，然后按顺序点击。每通过一轮，序列会更长。</p><div class="big-number" id="memoryRound">ROUND 1</div><div class="memory-grid">${Array.from({length:9},(_,i)=>`<button class="memory-cell" data-cell="${i}" aria-label="格子 ${i+1}"></button>`).join("")}</div><button class="btn btn-primary game-action" id="memoryStart">开始记忆</button></div>`,"准备开始记忆挑战。");
  const cells=[...document.querySelectorAll("[data-cell]")];
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  async function flash(seq){playing=true;cells.forEach(c=>c.disabled=true);for(const n of seq){cells[n].classList.add("lit");await sleep(430);cells[n].classList.remove("lit");await sleep(180);}cells.forEach(c=>c.disabled=false);playing=false;input=[];}
  $("#memoryStart").onclick=async()=>{sequence=[];input=[];round=1;$("#memoryStart").classList.add("hidden");sequence.push(Math.floor(Math.random()*9));$("#memoryRound").textContent="ROUND 1";await flash(sequence);$("#gameStatus").textContent="按照亮起的顺序点击格子。";};
  cells.forEach((c,i)=>c.onclick=async()=>{if(playing||!sequence.length)return;c.classList.add("lit");setTimeout(()=>c.classList.remove("lit"),130);if(i!==sequence[input.length]){cells[i].classList.add("wrong");setTimeout(()=>cells[i].classList.remove("wrong"),300);$("#gameStatus").textContent=`挑战结束！你通过了 ${round-1} 轮。`;$("#memoryStart").textContent="再玩一次";$("#memoryStart").classList.remove("hidden");submitScore("memory",round-1);sequence=[];return;}input.push(i);if(input.length===sequence.length){round++;$("#memoryRound").textContent=`ROUND ${round}`;sequence.push(Math.floor(Math.random()*9));await sleep(350);await flash(sequence);}});
  state.gameCleanup=()=>{sequence=[];};
}
function playCore() {
  let score=0,time=15,interval=null,active=false;
  showGame("core","能量核心",'<div class="game-center"><p>15 秒内尽可能多地点击能量核心。</p><div class="big-number" id="coreScore">0</div><p>剩余时间：<strong id="coreTime">15</strong>s</p><button class="target-pad" id="coreTarget">CORE</button><div><button class="btn btn-primary game-action" id="coreStart">启动核心</button></div></div>',"准备启动。");
  $("#coreTarget").disabled=true;
  $("#coreStart").onclick=()=>{score=0;time=15;active=true;$("#coreScore").textContent="0";$("#coreTime").textContent="15";$("#coreTarget").disabled=false;$("#coreStart").disabled=true;interval=setInterval(()=>{time--;$("#coreTime").textContent=time;if(time<=0){clearInterval(interval);active=false;$("#coreTarget").disabled=true;$("#coreStart").disabled=false;$("#coreStart").textContent="再玩一次";$("#gameStatus").textContent=`时间到！最终得分：${score}`;submitScore("core",score);}},1000);};
  $("#coreTarget").onclick=()=>{if(!active)return;score++;$("#coreScore").textContent=score;$("#coreTarget").style.transform=`scale(${score%2?'.94':'1'})`;};
  state.gameCleanup=()=>clearInterval(interval);
}
function play2048() {
  let board=Array(16).fill(0),over=false;
  function spawn(){const free=board.map((v,i)=>v===0?i:-1).filter(i=>i>=0);if(free.length)board[free[Math.floor(Math.random()*free.length)]]=Math.random()<.9?2:4;}
  function draw(){const el=$("#tileBoard");if(!el)return;el.innerHTML=board.map(v=>`<div class="tile ${v?'v'+Math.min(v,32):''}">${v||""}</div>`).join("");}
  function end(){over=true;$("#gameStatus").textContent="游戏结束。最终分数："+board.reduce((a,v)=>a+v,0);submitScore("2048",board.reduce((a,v)=>a+v,0));}
  function move(key){if(over)return;const before=board.join(",");for(let line=0;line<4;line++){let indexes=[];for(let p=0;p<4;p++){if(key==="ArrowLeft")indexes.push(line*4+p);if(key==="ArrowRight")indexes.push(line*4+3-p);if(key==="ArrowUp")indexes.push(p*4+line);if(key==="ArrowDown")indexes.push((3-p)*4+line);}let vals=indexes.map(i=>board[i]).filter(Boolean),out=[];for(let j=0;j<vals.length;j++){if(vals[j]===vals[j+1]){out.push(vals[j]*2);j++;}else out.push(vals[j]);}while(out.length<4)out.push(0);indexes.forEach((idx,p)=>board[idx]=out[p]);}if(before!==board.join(",")){spawn();draw();$("#gameStatus").textContent="分数："+board.reduce((a,v)=>a+v,0)+" · 使用方向键移动";if(!board.some(v=>v===0)&&!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].some(k=>canMove(k)))end();}}
  function canMove(k){const b=board.slice();moveSilent(k);const changed=b.join(",")!==board.join(",");board=b;return changed;}
  function moveSilent(key){for(let line=0;line<4;line++){let ids=[];for(let p=0;p<4;p++){if(key==="ArrowLeft")ids.push(line*4+p);if(key==="ArrowRight")ids.push(line*4+3-p);if(key==="ArrowUp")ids.push(p*4+line);if(key==="ArrowDown")ids.push((3-p)*4+line);}let vals=ids.map(i=>board[i]).filter(Boolean),out=[];for(let j=0;j<vals.length;j++){if(vals[j]===vals[j+1]){out.push(vals[j]*2);j++;}else out.push(vals[j]);}while(out.length<4)out.push(0);ids.forEach((idx,p)=>board[idx]=out[p]);}}
  board=Array(16).fill(0);spawn();spawn();
  showGame("2048","NEON 2048",'<div class="game-center"><p>使用键盘方向键移动方块。相同数字合并，挑战更高分数。</p><div class="tile-board" id="tileBoard"></div><button class="btn btn-ghost game-action" id="restart2048">重新开始</button></div>',"使用 ↑ ↓ ← → 开始。");
  draw();$("#restart2048").onclick=()=>{board=Array(16).fill(0);over=false;spawn();spawn();draw();$("#gameStatus").textContent="新的一局开始了。";};
  const original=move2048; move2048=move;
  state.gameCleanup=()=>{move2048=original;};
}
let move2048=()=>{};
(async function init(){try{await refreshMe();await loadGames();}catch(e){$("#gameGrid").innerHTML='<div class="empty">系统连接失败，请检查服务器是否启动。</div>';toast(e.message);}})();

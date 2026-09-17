"use strict";
/* ---------------- Warren Chase: a small Pac-Man-style minigame ----------
   Spend a Chase Token (dropped by realm bosses) to run a fixed maze,
   grid-stepped rather than pixel-smooth so the rules stay simple: clear
   every crumb before either ghost catches you. Reward scales off the
   current realm's baseGold so it stays relevant at any point in a run.
   In-progress state is intentionally not saved -- closing mid-run just
   ends that attempt, the way stepping away from a real arcade cabinet
   would.
------------------------------------------------------------------------ */

var ARCADE_MAZE = [
  "#################",
  "#...............#",
  "#.###.#####.###.#",
  "#...............#",
  "#.#.#.#.#.#.#.#.#",
  "#...............#",
  "##.###.#.###.####",
  "#...............#",
  "#.#.#.#.#.#.#.#.#",
  "#...............#",
  "#.###.#####.###.#",
  "#...............#",
  "#################"
];
var ARCADE_COLS = ARCADE_MAZE[0].length;
var ARCADE_ROWS = ARCADE_MAZE.length;
var ARCADE_CELL = 20;
var ARCADE_TICK_MS = 150;
var ARCADE_GHOST_TICK_MS = 220;
var ARCADE_DIR_VECT = { up:[0,-1], down:[0,1], left:[-1,0], right:[1,0] };

var arcadeActive = false;
var arcadeState = null;
var arcadeTickTimer = null, arcadeGhostTimer = null;
var arcadeCtx = null;

function arcadeOpenCell(c){ return c !== '#'; }

function arcadeBuildState(){
  var grid = ARCADE_MAZE.map(function(row){ return row.split(''); });
  var dotsTotal = 0;
  for(var y=0;y<ARCADE_ROWS;y++) for(var x=0;x<ARCADE_COLS;x++){
    if(grid[y][x] === '.') dotsTotal++;
  }
  return {
    grid: grid,
    player: { x:1, y:11, dir:null, queuedDir:null },
    ghosts: [ { x:15, y:1, color:'#c94a4a' }, { x:8, y:6, color:'#4ac9c0' } ],
    dotsTotal: dotsTotal,
    dotsLeft: dotsTotal,
    dotsEaten: 0,
    over: false
  };
}

function arcadeCanMove(x, y){
  if(x<0||y<0||x>=ARCADE_COLS||y>=ARCADE_ROWS) return false;
  return arcadeOpenCell(arcadeState.grid[y][x]);
}

function arcadeSetDir(dir){
  if(!arcadeState || arcadeState.over || !ARCADE_DIR_VECT[dir]) return;
  arcadeState.player.queuedDir = dir;
}

function arcadeStopTimers(){
  if(arcadeTickTimer){ clearInterval(arcadeTickTimer); arcadeTickTimer = null; }
  if(arcadeGhostTimer){ clearInterval(arcadeGhostTimer); arcadeGhostTimer = null; }
}

function arcadeCheckCatch(){
  if(!arcadeState || arcadeState.over) return;
  var p = arcadeState.player;
  if(arcadeState.ghosts.some(function(g){ return g.x===p.x && g.y===p.y; })) arcadeFinish(false);
}

function arcadeTick(){
  if(!arcadeState || arcadeState.over) return;
  var p = arcadeState.player;
  if(p.queuedDir){
    var qv = ARCADE_DIR_VECT[p.queuedDir];
    if(arcadeCanMove(p.x+qv[0], p.y+qv[1])){ p.dir = p.queuedDir; p.queuedDir = null; }
  }
  if(p.dir){
    var v = ARCADE_DIR_VECT[p.dir];
    if(arcadeCanMove(p.x+v[0], p.y+v[1])){ p.x += v[0]; p.y += v[1]; }
  }
  if(arcadeState.grid[p.y][p.x] === '.'){
    arcadeState.grid[p.y][p.x] = ' ';
    arcadeState.dotsLeft--;
    arcadeState.dotsEaten++;
  }
  arcadeCheckCatch();
  if(!arcadeState.over && arcadeState.dotsLeft <= 0) arcadeFinish(true);
  arcadeRender();
  arcadeUpdateHud();
}

// Mostly chases (shortest Manhattan step toward the player), sometimes
// wanders -- a purely optimal chaser is no fun to ever escape from.
function arcadeGhostTick(){
  if(!arcadeState || arcadeState.over) return;
  var p = arcadeState.player;
  arcadeState.ghosts.forEach(function(g){
    var options = Object.keys(ARCADE_DIR_VECT).filter(function(d){
      var v = ARCADE_DIR_VECT[d];
      return arcadeCanMove(g.x+v[0], g.y+v[1]);
    });
    if(!options.length) return;
    var pick;
    if(Math.random() < 0.8){
      options.sort(function(a,b){
        var va=ARCADE_DIR_VECT[a], vb=ARCADE_DIR_VECT[b];
        var da = Math.abs(g.x+va[0]-p.x)+Math.abs(g.y+va[1]-p.y);
        var db = Math.abs(g.x+vb[0]-p.x)+Math.abs(g.y+vb[1]-p.y);
        return da-db;
      });
      pick = options[0];
    } else {
      pick = options[Math.floor(Math.random()*options.length)];
    }
    var v = ARCADE_DIR_VECT[pick];
    g.x += v[0]; g.y += v[1];
  });
  arcadeCheckCatch();
  arcadeRender();
}

function arcadeFinish(won){
  arcadeState.over = true;
  arcadeStopTimers();
  var level = currentLevel();
  var reward;
  if(won){
    reward = Math.max(10, Math.round(level.baseGold * 40));
    toast('Warren Chase cleared! +'+fmt(reward)+'g');
  } else {
    var frac = arcadeState.dotsTotal ? arcadeState.dotsEaten / arcadeState.dotsTotal : 0;
    reward = Math.round(level.baseGold * 5 * frac);
    toast(reward>0 ? ('Caught! Still salvaged +'+fmt(reward)+'g') : 'Caught! No crumbs salvaged that run.');
  }
  if(reward>0){ state.gold += reward; state.totalGoldRun += reward; }
  renderStats();
  save();
  el.arcadeHudMsg.textContent = won ? 'Cleared!' : 'Caught!';
  el.arcadePlayBtn.disabled = state.chaseTokens < 1;
  el.arcadePlayBtn.textContent = 'Play again (1 token)';
}

function arcadeUpdateHud(){
  if(!arcadeState) return;
  el.arcadeHudCrumbs.textContent = arcadeState.dotsLeft+' / '+arcadeState.dotsTotal+' crumbs';
}

function arcadeRender(){
  if(!arcadeCtx || !arcadeState) return;
  var ctx = arcadeCtx;
  ctx.fillStyle = '#0c0a09';
  ctx.fillRect(0, 0, ARCADE_COLS*ARCADE_CELL, ARCADE_ROWS*ARCADE_CELL);
  for(var y=0;y<ARCADE_ROWS;y++){
    for(var x=0;x<ARCADE_COLS;x++){
      var c = arcadeState.grid[y][x];
      var px = x*ARCADE_CELL, py = y*ARCADE_CELL;
      if(c === '#'){
        ctx.fillStyle = '#3a2f52';
        ctx.fillRect(px, py, ARCADE_CELL, ARCADE_CELL);
      } else if(c === '.'){
        ctx.fillStyle = '#e8d9c0';
        ctx.beginPath();
        ctx.arc(px+ARCADE_CELL/2, py+ARCADE_CELL/2, 2, 0, Math.PI*2);
        ctx.fill();
      }
    }
  }
  var p = arcadeState.player;
  ctx.fillStyle = '#c9a24a';
  ctx.beginPath();
  ctx.arc(p.x*ARCADE_CELL+ARCADE_CELL/2, p.y*ARCADE_CELL+ARCADE_CELL/2, ARCADE_CELL/2-2, 0, Math.PI*2);
  ctx.fill();
  arcadeState.ghosts.forEach(function(g){
    ctx.fillStyle = g.color;
    ctx.beginPath();
    ctx.arc(g.x*ARCADE_CELL+ARCADE_CELL/2, g.y*ARCADE_CELL+ARCADE_CELL/2, ARCADE_CELL/2-2, 0, Math.PI*2);
    ctx.fill();
  });
}

function arcadeStart(){
  if(state.chaseTokens < 1) return;
  state.chaseTokens--;
  renderStats();
  save();
  arcadeState = arcadeBuildState();
  arcadeStopTimers();
  arcadeTickTimer = setInterval(arcadeTick, ARCADE_TICK_MS);
  arcadeGhostTimer = setInterval(arcadeGhostTick, ARCADE_GHOST_TICK_MS);
  el.arcadePlayBtn.disabled = true;
  el.arcadePlayBtn.textContent = 'Playing...';
  el.arcadeHudMsg.textContent = '';
  arcadeRender();
  arcadeUpdateHud();
}

/* ---------------- Bog Whacker: a second Warren Chase minigame ------------
   Monsters poke out of the bog's holes at random; whack them before they
   duck back down. A skull is a trap -- whack one and the round ends right
   there, but whatever's already scored still pays out, same "you keep what
   you earned" rule as the maze. One shared tick drives spawning, despawn,
   and the round clock entirely off tick counts (no wall-clock timestamps
   and no per-hole setTimeouts to track), so every timing rule lives in
   plain state a test can read and set directly.
------------------------------------------------------------------------ */
var WHACK_HOLES = 9;
var WHACK_TICK_MS = 100;
var WHACK_ROUND_TICKS = 200;       // 20s
var WHACK_UP_TICKS = 8;            // 800ms visible per pop
var WHACK_SPAWN_MIN_TICKS = 3;
var WHACK_SPAWN_MAX_TICKS = 6;
var WHACK_SKULL_CHANCE = 0.22;
var WHACK_MOLE_KEYS = ['slime','goblin','sprig','mudpup','thornling','mosshopper','bramblewolf','gladefly'];

var whackState = null;
var whackTimer = null;
var whackMoleIconCache = null;

function whackMoleIcon(key){
  if(!whackMoleIconCache) whackMoleIconCache = {};
  if(!whackMoleIconCache[key]) whackMoleIconCache[key] = svgFromGrid(MONSTERS[key].rows, MONSTERS[key].palette);
  return whackMoleIconCache[key];
}

function whackBuildState(){
  var holes = [];
  for(var i=0;i<WHACK_HOLES;i++) holes.push(null); // null | {isSkull, key, ticksLeft}
  return { holes: holes, score:0, over:false, ticksLeft: WHACK_ROUND_TICKS, spawnInTicks: 2 };
}

function whackStopTimer(){
  if(whackTimer){ clearInterval(whackTimer); whackTimer = null; }
}

function whackSpawnOne(){
  var empties = [];
  for(var i=0;i<whackState.holes.length;i++){ if(!whackState.holes[i]) empties.push(i); }
  if(!empties.length) return;
  var idx = empties[Math.floor(Math.random()*empties.length)];
  var isSkull = Math.random() < WHACK_SKULL_CHANCE;
  var key = WHACK_MOLE_KEYS[Math.floor(Math.random()*WHACK_MOLE_KEYS.length)];
  whackState.holes[idx] = { isSkull: isSkull, key: key, ticksLeft: WHACK_UP_TICKS };
  arcadeRenderWhackHole(idx);
}

function whackTick(){
  if(!whackState || whackState.over) return;
  whackState.ticksLeft--;
  for(var i=0;i<whackState.holes.length;i++){
    var occ = whackState.holes[i];
    if(occ){
      occ.ticksLeft--;
      if(occ.ticksLeft<=0){ whackState.holes[i] = null; arcadeRenderWhackHole(i); }
    }
  }
  whackState.spawnInTicks--;
  if(whackState.spawnInTicks<=0){
    whackSpawnOne();
    whackState.spawnInTicks = WHACK_SPAWN_MIN_TICKS + Math.floor(Math.random()*(WHACK_SPAWN_MAX_TICKS-WHACK_SPAWN_MIN_TICKS+1));
  }
  arcadeUpdateWhackHud();
  if(whackState.ticksLeft<=0) whackFinish(false);
}

function whackHitHole(idx){
  if(!whackState || whackState.over) return;
  var occ = whackState.holes[idx];
  if(!occ) return;
  whackState.holes[idx] = null;
  arcadeRenderWhackHole(idx);
  if(occ.isSkull){ whackFinish(true); return; }
  whackState.score++;
  arcadeUpdateWhackHud();
}

function whackFinish(byTrap){
  if(!whackState || whackState.over) return;
  whackState.over = true;
  whackStopTimer();
  for(var i=0;i<whackState.holes.length;i++){ whackState.holes[i] = null; }
  arcadeRenderWhackAll();
  var level = currentLevel();
  // Square-root payout: a long lucky streak still tops out well short of a
  // clean Maze Chase clear (a flat 40x baseGold), so this can't quietly
  // become the strictly-better token sink just by clicking faster longer.
  var reward = Math.round(level.baseGold * 6 * Math.sqrt(whackState.score));
  if(reward>0){ state.gold += reward; state.totalGoldRun += reward; }
  renderStats();
  save();
  var msg = byTrap
    ? (whackState.score>0 ? ('Trapped! Banked '+whackState.score+' for +'+fmt(reward)+'g') : 'Trapped! Banked nothing that round.')
    : (whackState.score>0 ? ('Time! '+whackState.score+' whacks for +'+fmt(reward)+'g') : 'Time! No whacks landed that round.');
  toast(msg);
  el.arcadeWhackMsg.textContent = byTrap ? 'Trapped!' : 'Time!';
  el.arcadeWhackPlayBtn.disabled = state.chaseTokens < 1;
  el.arcadeWhackPlayBtn.textContent = 'Play again (1 token)';
}

function arcadeUpdateWhackHud(){
  if(!whackState) return;
  el.arcadeWhackScore.textContent = 'Score: '+whackState.score;
  el.arcadeWhackTime.textContent = Math.max(0, Math.ceil(whackState.ticksLeft * WHACK_TICK_MS / 1000))+'s';
}

function arcadeBuildWhackGrid(){
  if(el.whackGrid.children.length === WHACK_HOLES) return;
  el.whackGrid.innerHTML = '';
  for(var i=0;i<WHACK_HOLES;i++){
    var hole = document.createElement('div');
    hole.className = 'whack-hole';
    hole.dataset.idx = i;
    hole.appendChild(document.createElement('div')).className = 'whack-pop';
    el.whackGrid.appendChild(hole);
  }
  el.whackGrid.addEventListener('click', function(ev){
    var hole = ev.target.closest('.whack-hole');
    if(hole) whackHitHole(Number(hole.dataset.idx));
  });
}

function arcadeRenderWhackHole(idx){
  var hole = el.whackGrid.children[idx];
  if(!hole) return;
  var pop = hole.firstChild;
  var occ = whackState && whackState.holes[idx];
  if(occ){
    pop.innerHTML = occ.isSkull ? SKULL_ICON_SVG : whackMoleIcon(occ.key);
    pop.classList.add('up');
    pop.classList.toggle('skull', !!occ.isSkull);
  } else {
    pop.classList.remove('up','skull');
  }
}

function arcadeRenderWhackAll(){
  arcadeBuildWhackGrid();
  for(var i=0;i<WHACK_HOLES;i++) arcadeRenderWhackHole(i);
}

function whackStart(){
  if(state.chaseTokens < 1) return;
  state.chaseTokens--;
  renderStats();
  save();
  whackState = whackBuildState();
  whackStopTimer();
  whackTimer = setInterval(whackTick, WHACK_TICK_MS);
  el.arcadeWhackPlayBtn.disabled = true;
  el.arcadeWhackPlayBtn.textContent = 'Playing...';
  el.arcadeWhackMsg.textContent = '';
  arcadeRenderWhackAll();
  arcadeUpdateWhackHud();
}

/* ---------------- Modal plumbing: pick a game, or back out to the list -- */
var arcadeView = 'select';

function arcadeShowSelect(){
  arcadeView = 'select';
  arcadeStopTimers();
  whackStopTimer();
  el.arcadeSelect.hidden = false;
  el.arcadeMazeView.hidden = true;
  el.arcadeWhackView.hidden = true;
}

function arcadeShowMaze(){
  arcadeView = 'maze';
  el.arcadeSelect.hidden = true;
  el.arcadeMazeView.hidden = false;
  el.arcadeWhackView.hidden = true;
  if(!arcadeCtx) arcadeCtx = el.arcadeCanvas.getContext('2d');
  arcadeStopTimers();
  arcadeState = arcadeBuildState();
  el.arcadePlayBtn.disabled = state.chaseTokens < 1;
  el.arcadePlayBtn.textContent = 'Play (1 token)';
  el.arcadeHudMsg.textContent = '';
  arcadeRender();
  arcadeUpdateHud();
}

function arcadeShowWhack(){
  arcadeView = 'whack';
  el.arcadeSelect.hidden = true;
  el.arcadeMazeView.hidden = true;
  el.arcadeWhackView.hidden = false;
  whackStopTimer();
  whackState = whackBuildState();
  el.arcadeWhackPlayBtn.disabled = state.chaseTokens < 1;
  el.arcadeWhackPlayBtn.textContent = 'Play (1 token)';
  el.arcadeWhackMsg.textContent = '';
  arcadeRenderWhackAll();
  arcadeUpdateWhackHud();
}

function openArcade(){
  arcadeActive = true;
  el.arcadeOverlay.classList.add('show');
  arcadeShowSelect();
}
function closeArcade(){
  arcadeActive = false;
  arcadeStopTimers();
  whackStopTimer();
  el.arcadeOverlay.classList.remove('show');
}

var ARCADE_KEY_DIR = {
  ArrowUp:'up', ArrowDown:'down', ArrowLeft:'left', ArrowRight:'right',
  w:'up', s:'down', a:'left', d:'right', W:'up', S:'down', A:'left', D:'right'
};
document.addEventListener('keydown', function(ev){
  if(arcadeView !== 'maze') return;
  var dir = ARCADE_KEY_DIR[ev.key];
  if(dir){ arcadeSetDir(dir); ev.preventDefault(); }
});

el.arcadePlayBtn.addEventListener('click', arcadeStart);
el.arcadeDpad.querySelectorAll('.arcade-dpad-btn').forEach(function(btn){
  btn.addEventListener('click', function(){ arcadeSetDir(btn.dataset.dir); });
});
el.arcadePickMaze.addEventListener('click', arcadeShowMaze);
el.arcadePickWhack.addEventListener('click', arcadeShowWhack);
el.arcadeMazeBackBtn.addEventListener('click', arcadeShowSelect);
el.arcadeWhackBackBtn.addEventListener('click', arcadeShowSelect);
el.arcadeWhackPlayBtn.addEventListener('click', whackStart);

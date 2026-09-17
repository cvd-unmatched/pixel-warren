"use strict";
// Boots the real game (actual index.html + actual public/js/*.js, unmodified)
// inside jsdom, the same way a browser does: parse the HTML first so every
// element the scripts expect already exists, then run the scripts in their
// real <script src> order. No mocks of game code -- only the network is
// stubbed, so persistLoad()/persistSave() fall back to localStorage exactly
// like a browser opened as a static file would.
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const SCRIPT_ORDER = ['sprites.js', 'content.js', 'state.js', 'render.js', 'combat.js', 'arcade.js', 'ui.js'];

// Boot completes asynchronously (persistLoad/config are promise chains);
// this is long enough for those to settle without slowing the suite down.
const SETTLE_MS = 80;

function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

// The booted game starts real setInterval timers (auto-DPS every 1s,
// autosave every 8s) that otherwise run forever -- across a whole test
// file's worth of boots, the leftover jsdom documents and live timers pile
// up fast enough to OOM the process. Every caller MUST tear its dom down,
// e.g. `t.after(() => dom.window.close())` inside a node:test test(fn).
async function bootGame(){
  const html = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'outside-only'
  });
  const window = dom.window;

  // No real server in a unit/UI test -- always reject, so the game's own
  // existing fallback path (localStorage) is what actually gets exercised,
  // deterministically, instead of hanging on a real network call.
  window.fetch = function(){ return Promise.reject(new Error('no network in tests')); };
  // jsdom only defines requestAnimationFrame under pretendToBeVisual, which
  // pulls in a CSS engine that (as of jsdom 30) crashes under plain
  // require() (an internal ESM-only dependency) -- a plain setTimeout-based
  // stand-in is all tweenGoldTo/etc. actually need.
  if(!window.requestAnimationFrame){
    window.requestAnimationFrame = function(cb){ return setTimeout(function(){ cb(Date.now()); }, 16); };
    window.cancelAnimationFrame = function(id){ clearTimeout(id); };
  }

  // One eval call, not one per file -- jsdom's window.eval doesn't reliably
  // share top-level function declarations across separate indirect-eval
  // calls the way a real browser shares them across separate <script> tags,
  // so sprites.js's functions weren't visible yet by the time content.js
  // (evaluated next, separately) tried to call them.
  //
  // Every file starts with "use strict", and per spec, strict-mode eval
  // never leaks its top-level var/function bindings onto the global object
  // even for indirect eval -- so none of the game's internals (state, el,
  // spawnEnemy, ...) exist on `window` afterward on their own. The epilogue
  // below runs inside that same eval (same scope, so it can see everything)
  // and explicitly republishes what tests need onto window.__game. Mutable
  // module-level vars (state gets reassigned wholesale by ascend()) are
  // exposed as getters so callers always see the current value, not a
  // snapshot from whenever this epilogue happened to run.
  var epilogue = [
    'window.__game = {',
    '  get state(){ return state; },',
    '  get finalBeaten(){ return finalBeaten; },',
    '  get bossFightToken(){ return bossFightToken; },',
    '  el: el, MONSTERS: MONSTERS, LEVELS: LEVELS, VILLAGE: VILLAGE, UPGRADES: UPGRADES, BESTIARY: BESTIARY,',
    '  MONSTER_ABILITIES: MONSTER_ABILITIES, DRAGON_KILLS_TO_UNLOCK_ASCEND: DRAGON_KILLS_TO_UNLOCK_ASCEND,',
    '  spawnEnemy: spawnEnemy, dealDamage: dealDamage, killEnemy: killEnemy, ascend: ascend, resetSave: resetSave,',
    '  blessingGain: blessingGain, dpsValue: dpsValue, critChance: critChance, critMultVal: critMultVal,',
    '  currentLevel: currentLevel, save: save, persistLoad: persistLoad, applyLoadedSave: applyLoadedSave,',
    '  buildSavePayload: buildSavePayload, freshState: freshState, checkDailyStreak: checkDailyStreak,',
    '  todayKey: todayKey, onStageClick: onStageClick, renderAll: renderAll, renderEnemy: renderEnemy,',
    '  fmt: fmt, fmtDamage: fmtDamage, activeTarget: activeTarget, isShielded: isShielded,',
    '  triggerEnrage: triggerEnrage, triggerDrain: triggerDrain, triggerCamouflage: triggerCamouflage,',
    '  triggerCurse: triggerCurse, progressCurse: progressCurse, triggerFrostbite: triggerFrostbite,',
    '  triggerTaunt: triggerTaunt, triggerOvercharge: triggerOvercharge, triggerWeakpoint: triggerWeakpoint,',
    '  triggerGamble: triggerGamble, triggerShield: triggerShield, triggerSummon: triggerSummon,',
    '  triggerRegen: triggerRegen, spawnFloater: spawnFloater, applyOverkillBonus: applyOverkillBonus,',
    '  triggerWebPull: triggerWebPull, triggerMathGate: triggerMathGate, answerMathGate: answerMathGate,',
    '  triggerHydraWave: triggerHydraWave, spawnHydraHead: spawnHydraHead, clearHydraHead: clearHydraHead,',
    '  startBossAbilities: startBossAbilities, fleeBoss: fleeBoss,',
    '  get lastBossEnterAt(){ return lastBossEnterAt; }, set lastBossEnterAt(v){ lastBossEnterAt = v; },',
    '  openArcade: openArcade, closeArcade: closeArcade, arcadeStart: arcadeStart,',
    '  arcadeTick: arcadeTick, arcadeGhostTick: arcadeGhostTick, arcadeSetDir: arcadeSetDir,',
    '  ARCADE_MAZE: ARCADE_MAZE, get arcadeState(){ return arcadeState; },',
    '  renderBestiary: renderBestiary, renderAchievements: renderAchievements,',
    '  bestiaryKeys: bestiaryKeys, ACHIEVEMENTS: ACHIEVEMENTS,',
    '  get arcadeView(){ return arcadeView; }, arcadeShowSelect: arcadeShowSelect,',
    '  arcadeShowMaze: arcadeShowMaze, arcadeShowWhack: arcadeShowWhack,',
    '  whackStart: whackStart, whackTick: whackTick, whackHitHole: whackHitHole,',
    '  get whackState(){ return whackState; },',
    '  WHACK_HOLES: WHACK_HOLES, WHACK_ROUND_TICKS: WHACK_ROUND_TICKS, WHACK_UP_TICKS: WHACK_UP_TICKS,',
    '  PERKS: PERKS, buyPerk: buyPerk, hasPerk: hasPerk, momentumMult: momentumMult,',
    '  clickDamage: clickDamage, goldMultVal: goldMultVal, villageCost: villageCost',
    '};'
  ].join('\n');

  var combined = SCRIPT_ORDER.map(function(file){
    return fs.readFileSync(path.join(PUBLIC_DIR, 'js', file), 'utf8');
  }).join('\n;\n') + '\n;\n' + epilogue;
  window.eval(combined);

  await sleep(SETTLE_MS);
  return dom;
}

module.exports = { bootGame, sleep };

"use strict";

  /* ---------------- Persistence ----------------
     Tries a same-origin save API first (server.js backs it with a JSON
     file under DATA_DIR, ready to be a Docker volume mount later). If no
     such API answers (this page opened as a static file or shared link),
     it falls back to localStorage transparently. Every call site below
     just uses persistLoad()/persistSave(); neither knows which backend
     served it.
  ---------------------------------------------- */
  var SAVE_KEY = 'pixelWarrenSave_v2';
  var USE_SERVER = null;
  function persistLoad(){
    return fetch('api/save', {cache:'no-store'}).then(function(r){
      if(!r.ok) throw new Error('no server');
      return r.json();
    }).then(function(d){ USE_SERVER = true; return d; })
      .catch(function(){
        USE_SERVER = false;
        try{ var raw = localStorage.getItem(SAVE_KEY); return raw ? JSON.parse(raw) : null; }
        catch(e){ return null; }
      });
  }
  function persistSave(payload){
    var json = JSON.stringify(payload);
    if(USE_SERVER === false){
      try{ localStorage.setItem(SAVE_KEY, json); }catch(e){}
      return;
    }
    fetch('api/save', { method:'POST', headers:{'Content-Type':'application/json'}, body: json })
      .then(function(r){ if(!r.ok) throw new Error('save failed'); USE_SERVER = true; flashSaveDot(); return r.json(); })
      .then(function(d){
        // A save that lands as a guest write when this tab still thinks
        // it's signed in means the account session died server-side --
        // most likely another tab/device logged into the same account,
        // which invalidates this one on purpose (see server.js handleLogin)
        // so the two copies can't silently clobber each other's progress.
        if(d && typeof onSaveSessionStatus === 'function') onSaveSessionStatus(!!d.loggedIn);
      })
      .catch(function(){
        USE_SERVER = false;
        try{ localStorage.setItem(SAVE_KEY, json); }catch(e){}
        flashSaveDot();
      });
  }
  function flashSaveDot(){
    var dot = document.getElementById('saveDot');
    if(!dot) return;
    dot.classList.add('show');
    clearTimeout(flashSaveDot._t);
    flashSaveDot._t = setTimeout(function(){ dot.classList.remove('show'); }, 900);
  }

  /* ---------------- State ---------------- */
  var OFFLINE_CAP_SECONDS = 4*3600;
  // Blessings are meant to feel earned -- tripled from the original 1500
  // divisor per feedback that they were coming too easily.
  var BLESSING_GOLD_DIVISOR = 4500;
  function blessingGain(){ return Math.floor(Math.sqrt(state.totalGoldRun/BLESSING_GOLD_DIVISOR)); }
  var DRAGON_KILLS_TO_UNLOCK_ASCEND = 1;
  var MAX_OFFLINE_SIM_STEPS = 3000;
  function defaultLevels(list){
    var levels = {};
    list.forEach(function(x){ levels[x.id] = 0; });
    return levels;
  }
  function freshState(){
    return {
      gold:0, blessings:0, totalGoldRun:0,
      levelIndex:0, killsInLevel:0, totalKills:0, bossReady:false, dragonKills:0, gambleTokens:0,
      upgradeLevels: defaultLevels(UPGRADES),
      villageLevels: defaultLevels(VILLAGE),
      defeated:{},
      achievements:{},
      enemy:null,
      loginStreak:0, lastLoginDate:null
    };
  }
  // Local calendar day as YYYY-MM-DD, so the streak turns over at midnight
  // where the player actually is, not at UTC midnight.
  function todayKey(){
    var d = new Date();
    return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();
  }
  // Rewards Gambling Tokens instead of gold specifically to dodge the
  // realm-to-realm gold scaling problem -- a fixed gold number is either
  // trivial in the late game or overwhelming in the early game, but a
  // token is worth the same regardless of how far along you are.
  var DAILY_STREAK_CAP = 7;
  function checkDailyStreak(){
    var today = todayKey();
    if(state.lastLoginDate === today) return null;
    var y = new Date(); y.setDate(y.getDate()-1);
    var yesterday = y.getFullYear()+'-'+(y.getMonth()+1)+'-'+y.getDate();
    state.loginStreak = (state.lastLoginDate === yesterday) ? Math.min(state.loginStreak+1, DAILY_STREAK_CAP) : 1;
    state.lastLoginDate = today;
    state.gambleTokens += state.loginStreak;
    return state.loginStreak;
  }
  var state = freshState();
  var loadedSavedAt = null;
  var finalBeaten = false;

  function applyLoadedSave(d){
    if(!d || typeof d !== 'object' || !Object.keys(d).length) return;
    state.gold = d.gold||0;
    state.blessings = d.blessings||0;
    state.totalGoldRun = d.totalGoldRun||0;
    state.levelIndex = Math.min(d.levelIndex||0, LEVELS.length-1);
    state.killsInLevel = d.killsInLevel||0;
    state.totalKills = d.totalKills||0;
    state.bossReady = !!d.bossReady;
    state.dragonKills = d.dragonKills||0;
    state.gambleTokens = d.gambleTokens||0;
    state.upgradeLevels = d.upgradeLevels || state.upgradeLevels;
    state.villageLevels = d.villageLevels || state.villageLevels;
    state.defeated = d.defeated || state.defeated;
    state.achievements = d.achievements || state.achievements;
    state.enemy = d.enemy || null;
    state.loginStreak = d.loginStreak||0;
    state.lastLoginDate = d.lastLoginDate||null;
    // recompute from dragonKills too, not just the stored flag -- if a
    // balance change lowers DRAGON_KILLS_TO_UNLOCK_ASCEND after a save was
    // already written, a save that now already clears the new bar must not
    // wait for one more dragon kill just to notice
    finalBeaten = !!d.finalBeaten || state.dragonKills >= DRAGON_KILLS_TO_UNLOCK_ASCEND;
    loadedSavedAt = d.savedAt || null;
  }
  function buildSavePayload(){
    return {
      gold:state.gold, blessings:state.blessings, totalGoldRun:state.totalGoldRun,
      levelIndex:state.levelIndex, killsInLevel:state.killsInLevel, totalKills:state.totalKills, bossReady:state.bossReady,
      dragonKills:state.dragonKills, gambleTokens:state.gambleTokens,
      upgradeLevels:state.upgradeLevels, villageLevels:state.villageLevels, defeated:state.defeated, achievements:state.achievements, enemy:state.enemy,
      loginStreak:state.loginStreak, lastLoginDate:state.lastLoginDate,
      finalBeaten:finalBeaten, savedAt:Date.now()
    };
  }
  function save(){ persistSave(buildSavePayload()); }

  function formatDuration(seconds){
    seconds = Math.floor(seconds);
    var h = Math.floor(seconds/3600), m = Math.floor((seconds%3600)/60), s = seconds%60;
    if(h>0) return h+'h '+m+'m';
    if(m>0) return m+'m '+s+'s';
    return s+'s';
  }

  // Blessings themselves carry no automatic bonus -- they're spent in the
  // Village (see VILLAGE above), and every Village building already feeds
  // these same roles alongside the run's Camp Shop upgrades.
  function clickDamage(){ return (1+sumEffect('clickFlat')) * multEffect('clickMult'); }
  function dpsValue(){ return sumEffect('dpsFlat') * multEffect('dpsMult'); }
  var CRIT_CHANCE_CAP = 0.75;
  function critChance(){ return Math.min(CRIT_CHANCE_CAP, sumEffect('critChance')); }
  function critMultVal(){ return 1.5 + sumEffect('critMultAdd'); }
  function goldMultVal(){ return multEffect('goldMult'); }
  function goldFlatBonus(){ return sumEffect('goldFlat'); }
  // Luck: a regular (non-boss) kill has this chance to also drop a bonus
  // Gambling Token, on top of the guaranteed one from realm bosses --
  // capped so the minigame stays a nice extra, not the main gold engine.
  var TOKEN_LUCK_CAP = 0.25;
  function tokenLuckChance(){ return Math.min(TOKEN_LUCK_CAP, sumEffect('tokenLuck')); }
  // Roles with a hard ceiling, and the live value/cap pair to check it
  // against -- used by the shop to gray out a maxed-out upgrade instead
  // of letting gold keep buying levels that do nothing.
  var CAPPED_ROLES = {
    critChance: { cap: CRIT_CHANCE_CAP, current: critChance },
    tokenLuck: { cap: TOKEN_LUCK_CAP, current: tokenLuckChance }
  };
  function isRoleMaxed(role){
    var capped = CAPPED_ROLES[role];
    return !!capped && capped.current() >= capped.cap;
  }
  function upgradeCost(u){ return Math.round(u.baseCost * Math.pow(u.costMult, state.upgradeLevels[u.id]||0)); }

  function fmt(n){
    if(n < 1000) return Math.floor(n).toString();
    var units = ['K','M','B','T','Qa','Qi'];
    var u = -1;
    while(n >= 1000 && u < units.length-1){ n/=1000; u++; }
    return n.toFixed(n<10?2:1) + units[u];
  }
  // Damage numbers can be fractional (auto-hit ticks, crit math) -- fmt()
  // floors anything under 1000 to a whole number, which used to print a
  // confusing "-0" for a real, sub-1 hit. This keeps small hits visible.
  function fmtDamage(n){
    if(n <= 0) return '0';
    if(n < 1) return n.toFixed(1);
    return fmt(n);
  }

  /* ---------------- Enemy spawning ---------------- */
  function currentLevel(){ return LEVELS[state.levelIndex]; }
  function titleCase(key){ return key.charAt(0).toUpperCase()+key.slice(1).replace(/([A-Z])/g,' $1'); }

  var MATTI_BOSS_CHANCE = 0.02;
  function makeEnemyData(level, forceBoss){
    // Bosses never spawn automatically -- reaching the kill threshold
    // just flips state.bossReady (see killEnemy) so the player can choose
    // when to walk in via the Challenge button, and farm a while longer
    // first if the boss looks too tough. forceBoss is only ever true when
    // that button (or a resumed offline-progress fight) says so.
    var isBoss = forceBoss;
    var key, name, bossAbilities, bossIntro;
    if(isBoss){
      // Re-roll which variant this fight is, if the level has any --
      // abilities travel with the enemy instance from here on, not the
      // level, so two dragons in a row can play completely differently.
      var variant = null;
      if(level.bossVariants && level.bossVariants.length){
        variant = level.bossVariants[Math.floor(Math.random()*level.bossVariants.length)];
      }
      key = variant ? variant.boss : level.boss;
      name = variant ? variant.bossName : level.bossName;
      bossAbilities = (variant ? variant.bossAbilities : level.bossAbilities) || [];
      bossIntro = (variant && variant.bossIntro) || level.bossIntro;
      // A 2% chance any boss fight is actually Matti in disguise -- same
      // hp/gold/abilities as whatever boss was rolled, just a different
      // face on it, so he can show up anywhere.
      if(Math.random() < MATTI_BOSS_CHANCE){
        key = 'matti';
        name = 'Matti';
        bossIntro = "Wait, is that just some guy? Matti cracks his knuckles and grins.";
        // Matti always fights the same way, whatever boss he replaced --
        // Julia shows up to guard him, and he stalls for time with a math
        // question every so often that blocks all damage until you answer.
        bossAbilities = [
          { type:'summon', every:14000, addKey:'julia', addHpFrac:0.3 },
          { type:'mathGate', every:20000 }
        ];
      }
    } else {
      key = level.enemies[Math.floor(Math.random()*level.enemies.length)];
      name = titleCase(key);
    }
    if(key === 'matti') unlockAchievement('gotMattid');
    // HP/gold are a fixed amount per level (baseHp/baseGold), not scaled
    // by lifetime kill count -- farming click/auto-damage upgrades should
    // let a strong hunter blow through a level fast, not chase a treadmill
    // that always re-matches their power. The one difficulty knob left is
    // total Village levels (a slow, deliberate Ascend/Blessings choice,
    // not raw grinding), so post-Ascend runs stay meaningfully harder.
    var scale = 1 + totalVillageLevels()*0.35;
    var hp = Math.round(level.baseHp * scale * (isBoss?level.hpBossMult:1));
    var goldReward = Math.round(level.baseGold * scale * (isBoss?level.goldBossMult:1) * (0.85+Math.random()*0.3));
    return { key:key, name:name, isBoss:isBoss, maxHp:hp, hp:hp, goldReward:goldReward, regenTicksUsed:0,
      bossAbilities: isBoss ? bossAbilities : undefined, bossIntro: isBoss ? bossIntro : undefined };
  }
  function regenAbilityFor(enemy){
    return (enemy.bossAbilities||[]).filter(function(a){ return a.type==='regen'; })[0] || null;
  }

  var bossFightToken = 0;
  function spawnEnemy(forceBoss){
    bossFightToken++;
    state.addEnemy = null;
    var level = currentLevel();
    state.enemy = makeEnemyData(level, forceBoss);
    if(state.enemy.isBoss){
      startBossAbilities(state.enemy.bossAbilities, bossFightToken);
      toast(state.enemy.bossIntro);
    } else if(MONSTER_ABILITIES[state.enemy.key]){
      // a handful of regular (non-boss) monsters get one small signature
      // move of their own -- not gated behind being a boss encounter
      startBossAbilities([MONSTER_ABILITIES[state.enemy.key]], bossFightToken);
    }
    renderEnemy(true);
  }

  /* ---------------- Boss abilities (shield / summon) ----------------
     Purely data-driven from level.bossAbilities. Each ability reschedules
     itself via setTimeout, guarded by bossFightToken so a stale timer from
     a fight that already ended (boss died, or a new enemy spawned) is a
     silent no-op instead of leaking or double-firing.
  ---------------------------------------------- */
  function startBossAbilities(bossAbilities, token){
    (bossAbilities||[]).forEach(function(ability){
      // Hydra heads aren't on a timer like the others -- the first wave
      // spawns immediately, and every wave after that is triggered by
      // clearing the previous one (see clearHydraHead in combat.js).
      if(ability.type === 'hydraHeads') triggerHydraWave(ability);
      // secondWind isn't on a timer either -- it's a one-shot reaction to
      // the boss's own HP crossing a threshold, checked from dealDamage.
      else if(ability.type === 'secondWind') state.enemy.secondWindAbility = ability;
      else scheduleAbility(ability, token);
    });
  }
  function triggerHydraWave(ability){
    var e = state.enemy;
    if(!e) return;
    e.hydraActive = true;
    e.hydraAbility = ability;
    e.hydraHeadsInWave = ability.initialHeads || 1;
    e.hydraHeadsKilledInWave = 0;
    e.hydraVulnerable = false;
    spawnHydraHead(ability);
  }
  function spawnHydraHead(ability){
    var e = state.enemy;
    if(!e) return;
    var hp = Math.max(1, Math.round(e.maxHp * (ability.headHpFrac||0.08)));
    state.addEnemy = { key: ability.headKey||'hydraHead', name:'Hydra Head', hp:hp, maxHp:hp, guardFor:e.name };
    renderEnemy(true);
  }
  function scheduleAbility(ability, token){
    setTimeout(function(){
      if(token !== bossFightToken) return;
      // non-boss abilities (e.g. a deepspider's web pull) are allowed
      // through too -- only a dead/missing enemy or a stale token stops it
      if(!state.enemy || state.enemy.hp<=0) return;
      if(ability.type === 'shield') triggerShield(ability);
      else if(ability.type === 'summon') triggerSummon(ability);
      else if(ability.type === 'regen') triggerRegen(ability);
      else if(ability.type === 'mathGate') triggerMathGate(ability);
      else if(ability.type === 'webPull') triggerWebPull(ability);
      else if(ability.type === 'enrage') triggerEnrage(ability);
      else if(ability.type === 'drain') triggerDrain(ability);
      else if(ability.type === 'camouflage') triggerCamouflage(ability);
      else if(ability.type === 'curse') triggerCurse(ability);
      else if(ability.type === 'frostbite') triggerFrostbite(ability);
      else if(ability.type === 'taunt') triggerTaunt(ability);
      else if(ability.type === 'overcharge') triggerOvercharge(ability, token);
      else if(ability.type === 'weakpoint') triggerWeakpoint(ability);
      else if(ability.type === 'gamble') triggerGamble(ability);
      scheduleAbility(ability, token);
    }, ability.every);
  }
  function isShielded(e){ return !!(e && e.shieldUntil && Date.now() < e.shieldUntil); }
  function triggerShield(ability){
    if(state.addEnemy) return;
    state.enemy.shieldReduction = ability.reduction;
    state.enemy.shieldUntil = Date.now() + ability.duration;
    toast(state.enemy.name+' raises a shield!');
    screenShake('boss-shake');
    burstParticles('impact', 14);
    renderEnemy(false);
  }
  function triggerSummon(ability){
    if(state.addEnemy || !state.enemy) return;
    if(state.enemy.summonCooldownUntil && Date.now() < state.enemy.summonCooldownUntil) return;
    var addKey = ability.addKey || currentLevel().enemies[0];
    var hp = Math.max(1, Math.round(state.enemy.maxHp * (ability.addHpFrac||0.15)));
    state.addEnemy = { key:addKey, name:titleCase(addKey), hp:hp, maxHp:hp, guardFor:state.enemy.name };
    toast(state.enemy.name+' summons a guardian!');
    screenShake('boss-shake');
    burstParticles('impact', 14);
    renderEnemy(true);
  }
  // A deepspider (whether the main enemy or just a wild encounter, not
  // just as a boss add) periodically "shoots a web" -- the game can't
  // move your actual OS pointer, so this is the closest honest stand-in:
  // a visible strand plus a sharp directional tug on the whole arena.
  function triggerWebPull(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    toast('The '+e.name+' yanks at your aim!');
    webPullFx();
  }
  // ---- Newer boss/monster abilities, all following the same shape as
  // shield/regen above: read state.enemy fresh, set a Until timestamp or a
  // one-shot flag, toast, re-render. Each is checked from dealDamage in
  // combat.js at the point its effect actually matters. ----
  function triggerEnrage(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    e.enrageUntil = Date.now() + ability.duration;
    toast(e.name+' enters a rage -- no clean hits will land!');
    screenShake('boss-shake');
    renderEnemy(false);
  }
  function triggerDrain(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    e.drainUntil = Date.now() + ability.duration;
    e.drainFrac = ability.drainFrac != null ? ability.drainFrac : 0.4;
    toast(e.name+' drains at your strikes!');
    renderEnemy(false);
  }
  function triggerCamouflage(ability){
    var e = state.enemy;
    if(!e || e.hp<=0 || state.addEnemy) return;
    e.camoUntil = Date.now() + ability.duration;
    toast(e.name+' fades from sight!');
    renderEnemy(false);
  }
  // Blocks all damage, like the math gate, but broken by a burst of plain
  // clicks instead of an answer -- onStageClick in combat.js routes clicks
  // here instead of to dealDamage while curseActive is set.
  function triggerCurse(ability){
    var e = state.enemy;
    if(!e || e.hp<=0 || state.addEnemy || e.curseActive) return;
    e.curseActive = true;
    e.curseProgress = 0;
    e.curseNeeded = ability.clicksNeeded || 5;
    toast(e.name+' binds you with a curse -- click free of it!');
    renderEnemy(false);
  }
  function progressCurse(){
    var e = state.enemy;
    if(!e || !e.curseActive) return;
    e.curseProgress++;
    if(e.curseProgress >= e.curseNeeded){
      e.curseActive = false;
      toast('The curse breaks!');
      renderEnemy(false);
    } else {
      spawnFloater(e.curseProgress+'/'+e.curseNeeded, 'blocked');
    }
  }
  function triggerFrostbite(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    e.frostUntil = Date.now() + ability.duration;
    e.frostReduction = ability.flatReduction || Math.max(1, Math.round(e.maxHp*0.01));
    toast(e.name+' chills the air -- your strikes weaken!');
    renderEnemy(false);
  }
  function triggerTaunt(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    e.tauntUntil = Date.now() + ability.duration;
    e.tauntChance = ability.missChance != null ? ability.missChance : 0.4;
    toast(e.name+' taunts you -- strikes may miss!');
    renderEnemy(false);
  }
  // Channels for a moment; if it goes completely unpunished (no click at
  // all during the window) it recovers a chunk of HP -- keeps a fight from
  // being safely ignored mid-channel without threatening anything if
  // you're actually there clicking.
  function triggerOvercharge(ability, token){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    e.overchargeClicked = false;
    toast(e.name+' channels dark energy -- keep attacking!');
    renderEnemy(false);
    setTimeout(function(){
      if(token !== bossFightToken || !state.enemy || state.enemy.hp<=0) return;
      if(!state.enemy.overchargeClicked){
        var healAmount = Math.max(1, Math.round(state.enemy.maxHp * (ability.healFrac||0.08)));
        state.enemy.hp = Math.min(state.enemy.maxHp, state.enemy.hp + healAmount);
        toast(state.enemy.name+' completes the ritual, recovering '+fmt(healAmount)+' HP!');
        renderEnemy(false);
        el.hpFill.classList.remove('regen-flash'); void el.hpFill.offsetWidth; el.hpFill.classList.add('regen-flash');
      }
    }, ability.channelDuration || 4000);
  }
  function triggerWeakpoint(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    e.weakpointUntil = Date.now() + ability.duration;
    e.weakpointMult = ability.bonusMult || 2;
    toast(e.name+' exposes a weak point -- strike now!');
    renderEnemy(false);
  }
  function triggerGamble(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    e.gambleUntil = Date.now() + ability.duration;
    toast(e.name+' invites a gamble -- fortune favors the bold!');
    renderEnemy(false);
  }
  // Regen heals a fraction of MISSING hp (so it shrinks near full and near
  // dead, never runs away) and is capped at maxTicks per fight -- after
  // that the boss is permanently "exhausted" for the rest of this
  // encounter, so no matter how weak your damage is, the fight is always
  // finite and winnable once the exhaustion window passes.
  function triggerRegen(ability){
    var e = state.enemy;
    if(!e || e.hp<=0) return;
    // A desperate last stand, not a constant nuisance: it only kicks in
    // once the boss is nearly dead, so you can freely chip away early
    // and only need to worry about finishing the job decisively.
    var threshold = ability.lowHpThreshold != null ? ability.lowHpThreshold : 0.25;
    if(e.hp / e.maxHp > threshold) return;
    var used = e.regenTicksUsed||0;
    if(used >= ability.maxTicks) return;
    var missing = e.maxHp - e.hp;
    if(missing <= 0) return;
    var healAmount = Math.max(1, Math.round(missing * ability.fraction));
    e.hp = Math.min(e.maxHp, e.hp + healAmount);
    e.regenTicksUsed = used+1;
    var left = ability.maxTicks - e.regenTicksUsed;
    toast(e.name+' regenerates '+fmt(healAmount)+' HP!' + (left<=0 ? ' It looks exhausted.' : ''));
    renderEnemy(false);
    el.hpFill.classList.remove('regen-flash'); void el.hpFill.offsetWidth; el.hpFill.classList.add('regen-flash');
  }
  // Matti's stalling tactic: freezes all damage (click and auto alike)
  // until the player answers an easy arithmetic question, so even a fully
  // automated setup has to have someone actually there for a moment.
  function triggerMathGate(ability){
    if(state.addEnemy || !state.enemy || state.enemy.mathGateActive) return;
    var a = 2 + Math.floor(Math.random()*9);
    var b = 1 + Math.floor(Math.random()*9);
    var subtract = Math.random() < 0.5 && a >= b;
    var question = subtract ? (a+' - '+b) : (a+' + '+b);
    var answer = subtract ? a-b : a+b;
    state.enemy.mathGateActive = true;
    state.enemy.mathGateQuestion = question;
    state.enemy.mathGateAnswer = answer;
    toast('Matti holds up a hand: "Quick, what\'s '+question+'?"');
    renderEnemy(false);
  }
  function answerMathGate(raw){
    var e = state.enemy;
    if(!e || !e.mathGateActive) return;
    var guess = parseInt(raw, 10);
    if(!isNaN(guess) && guess === e.mathGateAnswer){
      e.mathGateActive = false;
      toast('Correct! Matti grumbles and lets you through.');
      renderEnemy(false);
    } else {
      el.mathGateBox.classList.remove('shake'); void el.mathGateBox.offsetWidth; el.mathGateBox.classList.add('shake');
      toast('Not quite -- try again.');
    }
  }
  function clearAdd(){
    if(state.enemy && state.enemy.hydraActive) return clearHydraHead();
    state.defeated[state.addEnemy.key] = true;
    var reward = Math.round(state.enemy.goldReward * 0.2 * goldMultVal());
    state.gold += reward;
    spawnFloater('+'+fmt(reward)+'g', 'gold');
    flyCoinsToGold(reward, false);
    tweenGoldTo(state.gold);
    toast('Guardian defeated! '+state.enemy.name+' is exposed again.');
    state.addEnemy = null;
    state.enemy.summonCooldownUntil = Date.now() + 4000;
    renderEnemy(true);
    renderShop();
    renderStats();
  }
  // Each head is worth a small reward on its own (there can be a lot of
  // them by the later waves); clearing the whole wave opens a short
  // window where the body itself can finally be hurt, then the next
  // wave doubles in size (capped) so the fight always keeps moving.
  function clearHydraHead(){
    var e = state.enemy;
    state.defeated[state.addEnemy.key] = true;
    var reward = Math.round(e.goldReward * 0.04 * goldMultVal());
    state.gold += reward;
    spawnFloater('+'+fmt(reward)+'g', 'gold');
    flyCoinsToGold(reward, false);
    tweenGoldTo(state.gold);
    state.addEnemy = null;
    e.hydraHeadsKilledInWave = (e.hydraHeadsKilledInWave||0) + 1;
    if(e.hydraHeadsKilledInWave < e.hydraHeadsInWave){
      toast('Another head snaps forward!');
      spawnHydraHead(e.hydraAbility);
    } else {
      e.hydraVulnerable = true;
      toast(e.name+' recoils -- strike now!');
      renderEnemy(true);
      var token = bossFightToken;
      setTimeout(function(){
        if(token !== bossFightToken || !state.enemy || state.enemy.hp<=0) return;
        var ability = e.hydraAbility;
        e.hydraVulnerable = false;
        e.hydraHeadsInWave = Math.min(ability.maxHeads||8, e.hydraHeadsInWave*2);
        e.hydraHeadsKilledInWave = 0;
        toast(e.name+' grows '+e.hydraHeadsInWave+' new head'+(e.hydraHeadsInWave===1?'':'s')+'!');
        spawnHydraHead(ability);
        renderEnemy(false);
      }, e.hydraAbility.vulnerableDuration || 6000);
    }
    renderShop();
    renderStats();
  }
  function activeTarget(){ return state.addEnemy || state.enemy; }

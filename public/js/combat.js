"use strict";

  var ELEMENTAL_HIT_FX = { dragon:'fire', dragonFrost:'ice', dragonStorm:'lightning' };

  /* ---------------- Combat ---------------- */
  function dealDamage(amount, isCrit){
    var target = activeTarget();
    if(!target || target.hp<=0) return;
    var isAdd = !!state.addEnemy;
    // GOD=true short-circuits every defense (shield, hydra invuln window,
    // math gate) -- the point is instant kills for testing, not "big hits
    // that still respect the fight's rules"
    if(godMode){
      spawnFloater('-'+fmtDamage(target.hp), 'crit');
      target.hp = 0;
      if(isAdd) clearAdd(); else killEnemy();
      return;
    }
    if(!isAdd && state.enemy.mathGateActive){
      spawnFloater('?', 'blocked');
      return;
    }
    if(!isAdd && state.enemy.curseActive){
      progressCurse();
      return;
    }
    if(!isAdd && state.enemy.hydraActive && !state.enemy.hydraVulnerable){
      spawnFloater('immune', 'blocked');
      return;
    }
    // overcharge just wants to know an attack was actually attempted during
    // its channel window -- even one that goes on to miss below still counts
    if(!isAdd) target.overchargeClicked = true;
    if(!isAdd && target.camoUntil && Date.now() < target.camoUntil){
      spawnFloater('miss', 'blocked');
      return;
    }
    if(!isAdd && target.tauntUntil && Date.now() < target.tauntUntil && Math.random() < target.tauntChance){
      spawnFloater('miss', 'blocked');
      return;
    }
    var blocked = false;
    if(!isAdd && isShielded(target)){
      amount = amount*(1-target.shieldReduction);
      blocked = true;
    }
    if(!isAdd && target.frostUntil && Date.now() < target.frostUntil){
      amount = Math.max(0, amount - target.frostReduction);
      blocked = true;
    }
    if(!isAdd && target.weakpointUntil && Date.now() < target.weakpointUntil){
      amount = amount * target.weakpointMult;
    }
    if(!isAdd && target.gambleUntil && Date.now() < target.gambleUntil){
      amount = Math.random() < 0.5 ? amount*2 : amount*0.5;
    }
    amount = Math.round(amount*10)/10;
    if(!isAdd && target.enrageUntil && Date.now() < target.enrageUntil) isCrit = false;
    spawnFloater('-'+fmtDamage(amount), blocked ? 'blocked' : (isCrit?'crit':''));
    // a small elemental flourish on a crit against a dragon -- these are
    // the flagship bosses, so they get a bit more "wow" than a plain floater
    if(isCrit && !isAdd && ELEMENTAL_HIT_FX[target.key]){
      burstParticles(ELEMENTAL_HIT_FX[target.key], 8);
    }
    target.hp -= amount;
    if(!isAdd && target.drainUntil && Date.now() < target.drainUntil){
      target.hp = Math.min(target.maxHp, target.hp + amount*target.drainFrac);
    }
    if(!isAdd && target.secondWindAbility && !target.secondWindUsed){
      var threshold = target.secondWindAbility.threshold != null ? target.secondWindAbility.threshold : 0.2;
      if(target.hp > 0 && target.hp/target.maxHp <= threshold){
        target.secondWindUsed = true;
        var healAmount = Math.max(1, Math.round(target.maxHp * (target.secondWindAbility.healFrac||0.25)));
        target.hp = Math.min(target.maxHp, target.hp + healAmount);
        toast(target.name+' catches a second wind, recovering '+fmt(healAmount)+' HP!');
      }
    }
    if(target.hp <= 0){
      if(isAdd) clearAdd(); else killEnemy();
    } else {
      renderEnemy(false);
    }
  }

  function killEnemy(){
    var e = state.enemy;
    var level = currentLevel();
    state.defeated[e.key] = true;
    unlockAchievement('firstBlood');
    checkCollectorAchievement();
    var reward = Math.round(e.goldReward * goldMultVal()) + goldFlatBonus();
    state.gold += reward;
    state.totalGoldRun += reward;
    state.totalKills++;
    spawnFloater('+'+fmt(reward)+'g', 'gold');
    flyCoinsToGold(reward, e.isBoss);
    tweenGoldTo(state.gold);
    stopSpriteAnimation();
    el.stage.classList.add('dying');
    // refresh buy-button affordability and the kill counter right away --
    // the top-bar gold number ticks up instantly (see tweenGoldTo), so the
    // shop must not wait for the enemy-respawn delay below or a
    // just-affordable upgrade can look disabled for a beat after a kill.
    renderShop();
    renderStats();
    renderLevelChrome();

    if(e.isBoss){
      el.flash.classList.remove('go'); void el.flash.offsetWidth; el.flash.classList.add('go');
      screenShake('boss-shake');
      burstParticles(ELEMENTAL_HIT_FX[e.key] || 'impact', 22);
      toast(e.name+' defeated! '+level.victory);
      unlockAchievement('giantSlayer');
      if(level.key === LEVELS[LEVELS.length-1].key){
        state.dragonKills++;
        if(state.dragonKills >= DRAGON_KILLS_TO_UNLOCK_ASCEND){
          finalBeaten = true;
          unlockAchievement('dragonslayer5');
        }
      } else {
        // Only the earlier realm bosses drop a Gambling Den token -- the
        // final boss already feeds the Ascend track instead.
        state.gambleTokens++;
        toast(e.name+' dropped a Gambling Token!');
      }
      state.bossReady = false;
      state.killsInLevel = 0;
      // guarded by bossFightToken: if the player has already moved on (e.g.
      // fled, or a new enemy spawned some other way) before this fires, it's
      // a stale respawn and must not clobber whatever's on screen now -- see
      // scheduleAbility above for the same pattern.
      var tokenAtBossKill = bossFightToken;
      setTimeout(function(){
        if(bossFightToken !== tokenAtBossKill) return;
        if(state.levelIndex < LEVELS.length-1){
          state.levelIndex++;
          lastLevelRendered = -1;
          toast('New realm unlocked: '+currentLevel().name);
        }
        spawnEnemy(false);
        renderAll();
      }, 650);
    } else {
      state.killsInLevel++;
      if(state.killsInLevel % level.killsPerBoss === 0) state.bossReady = true;
      // Luck gives regular kills their own (smaller, capped) shot at a
      // Gambling Token, instead of tokens only ever coming from bosses.
      if(Math.random() < tokenLuckChance()){
        state.gambleTokens++;
        toast('Lucky find! +1 Gambling Token');
      }
      // same staleness guard as the boss-kill path above -- without it, a
      // Challenge click during this delay gets silently overwritten by this
      // timer's regular-enemy respawn once it fires (reported as "clicking
      // Challenge does nothing" / "goes to the boss then back").
      var tokenAtKill = bossFightToken;
      setTimeout(function(){
        if(bossFightToken !== tokenAtKill) return;
        spawnEnemy(false); renderAll();
      }, 420);
    }
    save();
  }

  // Backing out of a boss fight you picked: keep bossReady set (you can
  // walk back in anytime) and just go back to farming regular enemies.
  function fleeBoss(){
    if(!state.enemy || !state.enemy.isBoss) return;
    toast('Fled from '+state.enemy.name+'. Farm up and try again anytime.');
    spawnEnemy(false);
    renderAll();
    save();
  }

  // Basic auto-clicker mitigation: ignore script-dispatched clicks
  // (isTrusted is false for those) and cap how often a real click can
  // register, so an external clicker can't turn "click damage" into
  // unlimited damage-per-second.
  var lastClickAt = 0;
  var MIN_CLICK_INTERVAL_MS = 70;
  function onStageClick(ev){
    if(ev && ev.isTrusted === false) return;
    var now = performance.now();
    if(now - lastClickAt < MIN_CLICK_INTERVAL_MS) return;
    lastClickAt = now;
    var target = activeTarget();
    if(!target || target.hp<=0) return;
    var isCrit = Math.random() < critChance();
    var dmg = clickDamage() * (isCrit ? critMultVal() : 1);
    dmg = Math.round(dmg*10)/10;
    // shake whichever sprite is actually the current target -- the add
    // standing guard, if there is one, not the boss behind it
    var hitEl = state.addEnemy ? el.addSpriteWrap : el.spriteWrap;
    hitEl.classList.remove('hit'); void hitEl.offsetWidth; hitEl.classList.add('hit');
    dealDamage(dmg, isCrit);
  }

  function buyUpgrade(u){
    if(!isUnlocked(u)) return;
    if(isRoleMaxed(u.role)) return;
    var cost = upgradeCost(u);
    if(state.gold < cost) return;
    state.gold -= cost;
    state.upgradeLevels[u.id] = (state.upgradeLevels[u.id]||0)+1;
    renderAll();
    save();
  }

  // Previews (without spending anything) how many levels of `u` the
  // player can afford right now, one purchase at a time so the cost
  // curve and any role cap are respected exactly like a single buy.
  function maxAffordableUpgrade(u){
    var lvl = state.upgradeLevels[u.id]||0;
    var gold = state.gold;
    var capped = CAPPED_ROLES[u.role];
    var capValue = capped ? capped.current() : null;
    var capStep = capped ? (u.effect(1)-u.effect(0)) : 0;
    var count = 0, spent = 0;
    for(var i=0;i<10000;i++){
      if(capped && capValue >= capped.cap) break;
      var cost = Math.round(u.baseCost * Math.pow(u.costMult, lvl+count));
      if(gold < cost) break;
      gold -= cost; spent += cost; count++;
      if(capped) capValue += capStep;
    }
    return { count:count, cost:spent };
  }

  function buyMaxUpgrade(u){
    if(!isUnlocked(u)) return;
    var preview = maxAffordableUpgrade(u);
    if(preview.count < 1) return;
    state.gold -= preview.cost;
    state.upgradeLevels[u.id] = (state.upgradeLevels[u.id]||0) + preview.count;
    renderAll();
    save();
  }

  function buyVillageBuilding(b){
    var cost = villageCost(b);
    if(state.blessings < cost) return;
    state.blessings -= cost;
    state.villageLevels[b.id] = (state.villageLevels[b.id]||0)+1;
    unlockAchievement('villageFounder');
    renderAll();
    save();
  }

  function maxAffordableVillage(b){
    var lvl = state.villageLevels[b.id]||0;
    var blessings = state.blessings;
    var count = 0, spent = 0;
    for(var i=0;i<10000;i++){
      var cost = Math.round(b.baseCost * Math.pow(b.costMult, lvl+count));
      if(blessings < cost) break;
      blessings -= cost; spent += cost; count++;
    }
    return { count:count, cost:spent };
  }

  function buyMaxVillageBuilding(b){
    var preview = maxAffordableVillage(b);
    if(preview.count < 1) return;
    state.blessings -= preview.cost;
    state.villageLevels[b.id] = (state.villageLevels[b.id]||0) + preview.count;
    unlockAchievement('villageFounder');
    renderAll();
    save();
  }

  // AUTOUPGRADE=<username> on the server auto-buys every affordable
  // upgrade/village level for that one account, on a timer -- see the
  // matching check in ui.js boot. One combined render+save at the end
  // instead of one per purchase, since this can buy a lot in one tick.
  function autoUpgradeTick(){
    var boughtAny = false;
    UPGRADES.forEach(function(u){
      if(!isUnlocked(u) || isRoleMaxed(u.role)) return;
      var preview = maxAffordableUpgrade(u);
      if(preview.count < 1) return;
      state.gold -= preview.cost;
      state.upgradeLevels[u.id] = (state.upgradeLevels[u.id]||0) + preview.count;
      boughtAny = true;
    });
    VILLAGE.forEach(function(b){
      var preview = maxAffordableVillage(b);
      if(preview.count < 1) return;
      state.blessings -= preview.cost;
      state.villageLevels[b.id] = (state.villageLevels[b.id]||0) + preview.count;
      unlockAchievement('villageFounder');
      boughtAny = true;
    });
    if(boughtAny){ renderAll(); save(); }
  }

  function ascend(){
    if(!finalBeaten) return;
    var gain = blessingGain();
    if(gain<1) return;
    var blessings = state.blessings + gain;
    var village = state.villageLevels;
    var defeated = state.defeated;
    var achievements = state.achievements;
    var dragonKills = state.dragonKills;
    state = freshState();
    state.blessings = blessings;
    state.villageLevels = village; // the Village is permanent -- it survives the reset
    state.defeated = defeated; // so does what you've already discovered
    state.achievements = achievements; // and everything you've earned
    state.dragonKills = dragonKills;
    lastLevelRendered = -1;
    toast('Ascended! +'+gain+' Blessings. Spend them in the Village for permanent power.');
    unlockAchievement('ascended');
    spawnEnemy(false);
    renderAll();
    save();
  }

  function resetSave(){
    if(!confirm('Reset all progress? This cannot be undone.')) return;
    state = freshState();
    finalBeaten = false;
    lastLevelRendered = -1;
    spawnEnemy(false);
    renderAll();
    save();
  }

  function renderAll(){
    renderLevelChrome();
    renderEnemy(true);
    renderStats();
    renderShop();
    renderVillage();
    renderPrestige();
    renderBestiary();
    renderAchievements();
  }

  // Set from GET /api/config at boot (see ui.js) -- a BESTIARY=true env
  // var on the server reveals every monster's lore/power for design
  // review, without needing a per-player toggle in the UI.
  var bestiaryShowAll = false;
  // Set from GET /api/config at boot -- a GOD=true env var on the server
  // makes every click lethal, for fast testing/design review. Never a
  // per-player toggle, same as BESTIARY=true above.
  var godMode = false;
  function renderBestiary(){
    var keys = bestiaryKeys();
    var found = keys.filter(function(k){ return state.defeated[k]; }).length;
    [el.bestiaryCount, el.bestiaryModalCount].forEach(function(n){ n.textContent = found; });
    [el.bestiaryTotal, el.bestiaryModalTotal].forEach(function(n){ n.textContent = keys.length; });
    var revealAll = bestiaryShowAll;
    el.bestiaryGrid.innerHTML = '';
    keys.forEach(function(key){
      var mon = MONSTERS[key];
      var info = BESTIARY[key];
      var known = revealAll || !!state.defeated[key];
      var tile = document.createElement('div');
      tile.className = 'bestiary-tile' + (known ? '' : ' locked');
      tile.innerHTML =
        '<div class="bestiary-sprite">'+svgFromGrid(mon.rows, mon.palette)+'</div>'+
        '<div class="bestiary-name">'+(known ? titleCase(key) : '???')+'</div>'+
        (known && info ? '<div class="bestiary-lore">'+info.lore+'</div><div class="bestiary-power"><b>Power:</b> '+info.power+'</div>' : '');
      el.bestiaryGrid.appendChild(tile);
    });
  }

  function renderAchievements(){
    var earned = ACHIEVEMENTS.filter(function(a){ return state.achievements[a.id]; }).length;
    [el.achvCount, el.achvModalCount].forEach(function(n){ n.textContent = earned; });
    [el.achvTotal, el.achvModalTotal].forEach(function(n){ n.textContent = ACHIEVEMENTS.length; });
    el.achvGrid.innerHTML = '';
    ACHIEVEMENTS.forEach(function(a){
      var known = !!state.achievements[a.id];
      var tile = document.createElement('div');
      tile.className = 'bestiary-tile' + (known ? '' : ' locked');
      tile.innerHTML =
        '<div class="bestiary-sprite">'+MEDAL_ICON_SVG+'</div>'+
        '<div class="bestiary-name">'+a.name+'</div>'+
        '<div class="bestiary-lore">'+a.desc+'</div>';
      el.achvGrid.appendChild(tile);
    });
  }

  /* ---------------- Offline progress ----------------
     Uses a bounded fast loop (MAX_OFFLINE_SIM_STEPS) instead of replaying
     every real tick, so a multi-hour absence still resolves instantly.
     Boss shield/summon/regen mechanics are intentionally skipped here:
     offline combat is plain DPS-vs-HP (a small mercy for regen bosses,
     never a hindrance), live fights are where the extra mechanics
     play out.
  ---------------------------------------------- */
  function runOfflineProgress(){
    if(!loadedSavedAt) return null;
    var elapsed = (Date.now() - loadedSavedAt)/1000;
    if(elapsed < 10) return null;
    var capped = Math.min(elapsed, OFFLINE_CAP_SECONDS);
    var dps = dpsValue();
    if(dps<=0) return null;
    // Boss fights are manual-only, so offline auto-damage can't touch one
    // either -- if you left mid-fight, it's exactly as you left it.
    if(state.enemy && state.enemy.isBoss) return null;
    if(!state.enemy) state.enemy = makeEnemyData(currentLevel(), false);
    state.addEnemy = null;
    var flatBonus = goldFlatBonus();
    var remaining = capped, goldGained = 0, kills = 0, steps = 0;
    while(remaining > 0 && steps < MAX_OFFLINE_SIM_STEPS){
      steps++;
      var e = state.enemy;
      var timeToKill = e.hp / dps;
      if(timeToKill <= remaining){
        remaining -= timeToKill;
        var reward = Math.round(e.goldReward * goldMultVal()) + flatBonus;
        goldGained += reward; kills++;
        state.totalGoldRun += reward; state.totalKills++;
        var level = currentLevel();
        // e is never a boss here -- we bailed out above if one was active,
        // and makeEnemyData(level, false) below never produces one.
        state.killsInLevel++;
        if(state.killsInLevel % level.killsPerBoss === 0) state.bossReady = true;
        state.enemy = makeEnemyData(currentLevel(), false);
      } else {
        e.hp -= dps*remaining;
        remaining = 0;
      }
    }
    state.gold += goldGained;
    return { seconds:capped, kills:kills, gold:goldGained };
  }

  /* ---------------- Auto DPS loop ---------------- */
  // Fires once per second so the floater always shows the whole dmg/s
  // number; click damage is separate and always shows immediately.
  var TICK_MS = 1000;
  setInterval(function(){
    // Challenging a boss already takes a deliberate click (and Flee is
    // always available), so once you're in the fight auto-DPS pitches in
    // same as anywhere else -- no extra click-gate on top of that.
    var dps = dpsValue();
    if(dps>0 && state.enemy){
      var target = activeTarget();
      if(target && target.hp>0){
        var isCrit = Math.random() < critChance();
        var amount = dps * (isCrit ? critMultVal() : 1);
        amount = Math.round(amount*(TICK_MS/1000)*10)/10;
        if(amount>0) dealDamage(amount, isCrit);
      }
    }
    // keep the shield badge/glow accurate even between damage events
    if(state.enemy && state.enemy.isBoss && !state.addEnemy) renderEnemy(false);
  }, TICK_MS);

  setInterval(save, 8000);
  document.addEventListener('visibilitychange', function(){ if(document.hidden) save(); });
  window.addEventListener('beforeunload', save);

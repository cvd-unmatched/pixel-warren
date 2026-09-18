"use strict";

  var ELEMENTAL_HIT_FX = { dragon:'fire', dragonFrost:'ice', dragonStorm:'lightning' };

  /* ---------------- Combat ---------------- */
  function dealDamage(amount, isCrit, isAuto){
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
      // "Click free of it" is the whole point -- auto-DPS landing on a
      // cursed boss must not progress the break-free counter, or the curse
      // resolves itself within a few seconds of passive ticks with zero
      // clicking, same as it always could before this fix.
      if(isAuto){ spawnFloater('cursed', 'blocked'); return; }
      progressCurse();
      return;
    }
    if(!isAdd && state.enemy.hydraActive && !state.enemy.hydraVulnerable){
      spawnFloater('immune', 'blocked');
      return;
    }
    // overcharge just wants to know a real click landed during its channel
    // window -- even one that goes on to miss below still counts, but an
    // auto-DPS tick must not, or any nonzero auto damage trivially satisfies
    // "keep attacking" and the punish-for-neglect heal can never fire.
    if(!isAdd && !isAuto) target.overchargeClicked = true;
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
    // null = no gamble this hit; true/false records which way the coin flip
    // landed so the floater below can actually show it -- previously this
    // was invisible, a scatter of unexplained big/small numbers with no way
    // to tell a win from a loss hit by hit.
    var gambleHigh = null;
    if(!isAdd && target.gambleUntil && Date.now() < target.gambleUntil){
      gambleHigh = Math.random() < 0.5;
      amount = gambleHigh ? amount*2 : amount*0.5;
    }
    // isCrit was already baked into `amount` by the caller (onStageClick /
    // the auto-DPS tick) before dealDamage ever saw it, so flipping it here
    // alone never actually reduced damage -- only relabeled the floater.
    // Enrage has to strip the crit multiplier back out to mean anything.
    if(!isAdd && isCrit && target.enrageUntil && Date.now() < target.enrageUntil){
      amount = amount / critMultVal();
      isCrit = false;
    }
    amount = Math.round(amount*10)/10;
    var floaterCls = blocked ? 'blocked' : (isCrit?'crit':'');
    if(gambleHigh !== null) floaterCls = (floaterCls?floaterCls+' ':'') + (gambleHigh?'gamble-high':'gamble-low');
    var gambleTag = gambleHigh === true ? ' x2' : gambleHigh === false ? ' x0.5' : '';
    spawnFloater('-'+fmtDamage(amount)+gambleTag, floaterCls);
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
      var overkill = !isAdd && -target.hp > 0 ? -target.hp : 0;
      if(isAdd) clearAdd(); else killEnemy();
      return overkill;
    } else {
      renderEnemy(false);
      return 0;
    }
  }

  // Being strongly overpowered for the current realm used to just mean
  // "hits do way more than needed" -- auto-DPS and clicks still only ever
  // finish one kill at a time, so the excess damage was pure waste and
  // progression crawled at the same pace regardless of how strong you'd
  // gotten. This converts leftover damage from a one-hit kill into extra
  // kills against the same level's pool, so a big power spike (an upgrade
  // spree, a login-streak windfall) translates into visibly faster
  // progress instead of nothing changing except the numbers on screen.
  // Capped so one hit can't clear an entire realm's boss requirement
  // outright, and skipped for bosses, which stay one-at-a-time fights.
  var MAX_OVERKILL_BONUS_KILLS = 30;
  function applyOverkillBonus(overkill){
    if(!overkill || overkill <= 0) return;
    var e = state.enemy;
    if(!e || e.isBoss || !e.maxHp) return;
    var bonusKills = Math.min(MAX_OVERKILL_BONUS_KILLS, Math.floor(overkill / e.maxHp));
    if(bonusKills < 1) return;
    var level = currentLevel();
    var bonusGold = 0;
    for(var i=0;i<bonusKills;i++){
      var reward = Math.round(e.goldReward * goldMultVal()) + goldFlatBonus();
      bonusGold += reward;
      state.gold += reward;
      state.totalGoldRun += reward;
      state.totalKills++;
      state.killsInLevel++;
      if(state.killsInLevel % level.killsPerBoss === 0) state.bossReady = true;
    }
    toast('Overkill! Also felled '+bonusKills+' more '+(bonusKills===1?'foe':'foes')+' (+'+fmt(bonusGold)+'g)');
    renderStats();
    renderLevelChrome();
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
    // otherwise the bar just sits frozen at whatever it last showed (100%,
    // if this was a one-hit kill) through the whole death/respawn gap --
    // reads as "the hit didn't register" even though it very much did
    el.hpFill.style.width = '0%';
    el.hpText.textContent = '0 / '+fmt(e.maxHp);
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
        // final boss already feeds the Ascend track instead. Every realm
        // boss also drops a Chase Token for the Warren Chase minigame,
        // a second reason to want boss kills beyond the roulette token.
        state.gambleTokens++;
        // Deeper realms drop more Chase Tokens on top of the base one --
        // deliberately NOT more gold. Gold buys permanent Camp Shop power
        // that compounds for the rest of the run, so even a small bump to
        // late-realm gold quietly undoes weeks of intended pacing (a
        // rebalance already tuned around this exact tension -- see
        // REALM_HP_RAMP_GROWTH above). Chase Tokens only ever buy a bounded,
        // one-off Warren Chase round, so they can scale generously here
        // without feeding that same snowball -- a real, felt reason to want
        // deeper realms rather than parking on an easy one to farm.
        var realmTokenBonus = Math.floor(state.levelIndex/2);
        state.chaseTokens += 1 + realmTokenBonus;
        var bonusToken = hasPerk('warrensBounty') && Math.random() < 0.1;
        if(bonusToken) state.chaseTokens++;
        var tokenMsg = 'a Gambling Token and ' + (1+realmTokenBonus+(bonusToken?1:0)) + ' Chase Token' + (realmTokenBonus+(bonusToken?1:0)>0 ? 's' : '');
        toast(e.name+' dropped '+tokenMsg+'!');
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
  //
  // Flee sits in the exact screen spot Challenge just occupied (one button
  // hides as the other appears, same slot) -- a double-click, or a second
  // tap while the first was still landing, could hit Challenge then
  // immediately hit Flee, bouncing you right back out of the fight you
  // just picked. A short grace period after entering a boss fight ignores
  // Flee clicks that land too soon to be a deliberate "back out" decision.
  var lastBossEnterAt = 0;
  var FLEE_GRACE_MS = 600;
  function fleeBoss(){
    if(!state.enemy || !state.enemy.isBoss) return;
    if(Date.now() - lastBossEnterAt < FLEE_GRACE_MS) return;
    toast('Fled from '+state.enemy.name+'. Farm up and try again anytime.');
    spawnEnemy(false);
    renderAll();
    save();
  }

  // Basic auto-clicker mitigation: ignore script-dispatched clicks
  // (isTrusted is false for those) and cap how often a real click can
  // register, so an external clicker can't turn "click damage" into
  // unlimited damage-per-second.
  //
  // 40ms held up fine in theory but not in practice -- confirmed via the
  // LOGGING overlay that real, enthusiastic human clicking regularly lands
  // gaps in the 20-30ms range (bursts of alternating-finger mashing, not
  // sustained), and every one of those was getting silently dropped with
  // no floater and no hit-shake, which read as "clicking does nothing."
  // 12ms (an 80+ clicks/sec sustained rate) is still far beyond anything a
  // human can keep up, while a real script-driven autoclicker gains
  // essentially nothing worth cheating for from the tiny bit of headroom
  // this gives up.
  var lastClickAt = 0;
  var MIN_CLICK_INTERVAL_MS = 12;
  // A tiny always-current readout of click timing, only built when
  // LOGGING=true asks for it (see loggingEnabled above) -- answers "are my
  // clicks all landing, and how far apart are they really" on a device
  // with no attached devtools to check the console on.
  var clickLogEl = null, clickLogStats = { received:0, dropped:0, landed:0 };
  function logClick(outcome, gapMs, extra){
    if(!loggingEnabled) return;
    console.log('[click] '+outcome+' gap='+Math.round(gapMs)+'ms'+(extra?' '+extra:''));
    clickLogStats.received++;
    if(outcome === 'dropped-throttle') clickLogStats.dropped++;
    else if(outcome === 'landed') clickLogStats.landed++;
    if(!clickLogEl){
      clickLogEl = document.createElement('div');
      clickLogEl.style.cssText = 'position:fixed;top:4px;left:4px;z-index:9999;background:rgba(0,0,0,0.75);color:#9f9;font:10px monospace;padding:4px 7px;border-radius:4px;pointer-events:none;white-space:pre;';
      document.body.appendChild(clickLogEl);
    }
    clickLogEl.textContent = 'clicks '+clickLogStats.received+' | landed '+clickLogStats.landed+' | dropped '+clickLogStats.dropped+' | last gap '+Math.round(gapMs)+'ms'+(extra?'\n'+extra:'');
  }
  function onStageClick(ev){
    if(ev && ev.isTrusted === false) return;
    // Fires on pointerdown now, not click -- click only fires after the
    // full press-then-release-in-place gesture completes, which is an
    // extra round trip a touchscreen doesn't need to pay: the finger
    // touching down IS the tap, there's nothing left to wait for. Desktop
    // mice are unaffected either way (that gap was never perceptible with
    // a mouse), but a mouse's pointerdown also fires for the right/middle
    // buttons, which a real "click" event never would -- skip those so a
    // right-click still only opens the context menu.
    if(ev && ev.pointerType === 'mouse' && ev.button !== 0) return;
    var now = performance.now();
    var gap = now - lastClickAt;
    if(gap < MIN_CLICK_INTERVAL_MS){ logClick('dropped-throttle', gap); return; }
    lastClickAt = now;
    var target = activeTarget();
    if(!target || target.hp<=0){ logClick('no-target', gap); return; }
    var isCrit = Math.random() < critChance();
    var dmg = clickDamage() * (isCrit ? critMultVal() : 1);
    dmg = Math.round(dmg*10)/10;
    // shake whichever sprite is actually the current target -- the add
    // standing guard, if there is one, not the boss behind it
    var hitEl = state.addEnemy ? el.addSpriteWrap : el.spriteWrap;
    hitEl.classList.remove('hit'); void hitEl.offsetWidth; hitEl.classList.add('hit');
    applyOverkillBonus(dealDamage(dmg, isCrit));
    if(hasPerk('twinStrike') && Math.random() < 0.15){
      var isCrit2 = Math.random() < critChance();
      var dmg2 = clickDamage() * (isCrit2 ? critMultVal() : 1);
      applyOverkillBonus(dealDamage(Math.round(dmg2*10)/10, isCrit2));
    }
    // Measured AFTER dealDamage returns, so this is the real end-to-end
    // synchronous cost of one click: event -> throttle check -> damage
    // math -> floater created -> HP bar's inline width already rewritten.
    // If this number is small (it should be well under 1ms) but the bar
    // still visually looked laggy before, that confirms it was the CSS
    // transition on .hp-fill lagging the paint, not this code being slow.
    var processMs = performance.now() - now;
    var hpFillWidth = el.hpFill.style.width;
    var hpText = el.hpText.textContent;
    logClick('landed', gap, 'dmg='+dmg+' processMs='+processMs.toFixed(2)+' hpFillWidth='+hpFillWidth+' hpText="'+hpText+'"');
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
    var mult = effectiveCostMult(b);
    var count = 0, spent = 0;
    for(var i=0;i<10000;i++){
      var cost = Math.round(b.baseCost * Math.pow(mult, lvl+count));
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

  function buyPerk(p){
    if(state.perks[p.id]) return;
    if(state.blessings < p.cost) return;
    state.blessings -= p.cost;
    state.perks[p.id] = true;
    toast('Unlocked: '+p.name+'!');
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
    var perks = state.perks;
    var ascendCount = state.ascendCount + 1;
    var defeated = state.defeated;
    var achievements = state.achievements;
    var dragonKills = state.dragonKills;
    var loginStreak = state.loginStreak;
    var lastLoginDate = state.lastLoginDate;
    state = freshState();
    state.blessings = blessings;
    state.villageLevels = village; // the Village is permanent -- it survives the reset
    state.perks = perks; // Prestige Perks are permanent too
    state.ascendCount = ascendCount;
    state.defeated = defeated; // so does what you've already discovered
    state.achievements = achievements; // and everything you've earned
    state.dragonKills = dragonKills;
    state.loginStreak = loginStreak; // and so does your daily streak
    state.lastLoginDate = lastLoginDate;
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
    bestiaryCounts();
    achievementCounts();
  }

  // Set from GET /api/config at boot (see ui.js) -- a BESTIARY=true env
  // var on the server reveals every monster's lore/power for design
  // review, without needing a per-player toggle in the UI.
  var bestiaryShowAll = false;
  // Set from GET /api/config at boot -- a GOD=true env var on the server
  // makes every click lethal, for fast testing/design review. Never a
  // per-player toggle, same as BESTIARY=true above.
  var godMode = false;
  // Set from GET /api/config at boot -- a LOGGING=true env var turns on a
  // tiny on-screen click-timing readout (see logClick below), for chasing
  // down "clicks don't feel instant" complaints on a device with no
  // attached devtools (a phone, mainly).
  var loggingEnabled = false;
  // Both grids below list a fixed, static set of entries (every MONSTERS
  // key / every ACHIEVEMENTS entry) -- only which ones are "known" ever
  // changes at runtime. renderAll() calls both on every single kill (every
  // auto-DPS tick that lands one), so rebuilding ~90+ tiles' worth of SVG
  // markup from scratch every time was a real cost paid constantly even
  // while neither panel was open. Build once, then only touch a tile when
  // its own known/locked state actually flips.
  function bestiaryTileHtml(key, known){
    var mon = MONSTERS[key];
    var info = BESTIARY[key];
    return '<div class="bestiary-sprite"><img src="'+spriteImg(mon.rows, mon.palette, key)+'" alt=""></div>'+
      '<div class="bestiary-name">'+(known ? titleCase(key) : '???')+'</div>'+
      (known && info ? '<div class="bestiary-lore">'+info.lore+'</div><div class="bestiary-power"><b>Power:</b> '+info.power+'</div>' : '');
  }
  // The cheap half: just the "N / 87 found" counters, visible in the
  // sidebar even with the panel closed, so renderAll() (every kill) can
  // afford to call this unconditionally.
  function bestiaryCounts(){
    var keys = bestiaryKeys();
    var found = keys.filter(function(k){ return state.defeated[k]; }).length;
    [el.bestiaryCount, el.bestiaryModalCount].forEach(function(n){ n.textContent = found; });
    [el.bestiaryTotal, el.bestiaryModalTotal].forEach(function(n){ n.textContent = keys.length; });
  }
  // The expensive half: every entry's own detailed sprite, each traced
  // monster easily 1000-2000+ individual <rect> elements once quantized
  // from real reference art. Building all 87 of those into the DOM on
  // every renderAll() (again: every kill) put a quarter million <rect>
  // nodes into the page whether or not anyone ever opened the Bestiary --
  // and a document that heavy makes every other layout-touching operation
  // slower too (a forced reflow, like the click hit-shake below, has to
  // account for the whole tree). Only called when the panel is actually
  // opened; renderAll() only keeps the cheap counters above live.
  function renderBestiary(){
    bestiaryCounts();
    var keys = bestiaryKeys();
    var revealAll = bestiaryShowAll;
    if(el.bestiaryGrid.children.length !== keys.length){
      el.bestiaryGrid.innerHTML = '';
      keys.forEach(function(key){
        var known = revealAll || !!state.defeated[key];
        var tile = document.createElement('div');
        tile.className = 'bestiary-tile' + (known ? '' : ' locked');
        tile.dataset.key = key;
        tile.dataset.known = known ? '1' : '0';
        tile.innerHTML = bestiaryTileHtml(key, known);
        el.bestiaryGrid.appendChild(tile);
      });
      return;
    }
    var rows = el.bestiaryGrid.children;
    keys.forEach(function(key, i){
      var known = revealAll || !!state.defeated[key];
      var tile = rows[i];
      if(tile.dataset.known === (known ? '1' : '0')) return;
      tile.dataset.known = known ? '1' : '0';
      tile.classList.toggle('locked', !known);
      tile.innerHTML = bestiaryTileHtml(key, known);
    });
  }

  function achievementCounts(){
    var earned = ACHIEVEMENTS.filter(function(a){ return state.achievements[a.id]; }).length;
    [el.achvCount, el.achvModalCount].forEach(function(n){ n.textContent = earned; });
    [el.achvTotal, el.achvModalTotal].forEach(function(n){ n.textContent = ACHIEVEMENTS.length; });
  }
  function renderAchievements(){
    achievementCounts();
    if(el.achvGrid.children.length !== ACHIEVEMENTS.length){
      el.achvGrid.innerHTML = '';
      ACHIEVEMENTS.forEach(function(a){
        var known = !!state.achievements[a.id];
        var tile = document.createElement('div');
        tile.className = 'bestiary-tile' + (known ? '' : ' locked');
        tile.dataset.known = known ? '1' : '0';
        tile.innerHTML =
          '<div class="bestiary-sprite">'+MEDAL_ICON_SVG+'</div>'+
          '<div class="bestiary-name">'+a.name+'</div>'+
          '<div class="bestiary-lore">'+a.desc+'</div>';
        el.achvGrid.appendChild(tile);
      });
      return;
    }
    var rows = el.achvGrid.children;
    ACHIEVEMENTS.forEach(function(a, i){
      var known = !!state.achievements[a.id];
      var tile = rows[i];
      if(tile.dataset.known === (known ? '1' : '0')) return;
      tile.dataset.known = known ? '1' : '0';
      tile.classList.toggle('locked', !known);
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
        if(amount>0) applyOverkillBonus(dealDamage(amount, isCrit, true));
      }
    }
    // keep the shield badge/glow accurate even between damage events
    if(state.enemy && state.enemy.isBoss && !state.addEnemy) renderEnemy(false);
  }, TICK_MS);

  setInterval(save, 8000);
  document.addEventListener('visibilitychange', function(){ if(document.hidden) save(); });
  window.addEventListener('beforeunload', save);

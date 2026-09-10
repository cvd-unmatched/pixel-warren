"use strict";

  /* ---------------- Rendering ---------------- */
  var el = {
    goldCurrency: document.getElementById('goldCurrency'),
    goldIconEl: document.getElementById('goldIcon'),
    goldCount: document.getElementById('goldCount'),
    blessCount: document.getElementById('blessCount'),
    tokenCount: document.getElementById('tokenCount'),
    levelName: document.getElementById('levelName'),
    levelProgress: document.getElementById('levelProgress'),
    levelCount: document.getElementById('levelCount'),
    levelLore: document.getElementById('levelLore'),
    arena: document.getElementById('arena'),
    arenaSky: document.getElementById('arenaSky'),
    arenaDecor: document.getElementById('arenaDecor'),
    enemyName: document.getElementById('enemyName'),
    enemySub: document.getElementById('enemySub'),
    stage: document.getElementById('stage'),
    arenaContent: document.getElementById('arenaContent'),
    pipBtn: document.getElementById('pipBtn'),
    mobilePanelToggle: document.getElementById('mobilePanelToggle'),
    mobilePanelClose: document.getElementById('mobilePanelClose'),
    app: document.querySelector('.app'),
    challengeBtn: document.getElementById('challengeBtn'),
    fleeBtn: document.getElementById('fleeBtn'),
    hint: document.getElementById('hint'),
    spriteWrap: document.getElementById('spriteWrap'),
    addWrap: document.getElementById('addWrap'),
    addLabel: document.getElementById('addLabel'),
    addSpriteWrap: document.getElementById('addSpriteWrap'),
    addHpFill: document.getElementById('addHpFill'),
    mattiAngels: document.getElementById('mattiAngels'),
    mathGateBox: document.getElementById('mathGateBox'),
    mathGateQ: document.getElementById('mathGateQ'),
    mathGateInput: document.getElementById('mathGateInput'),
    hpFill: document.getElementById('hpFill'),
    hpText: document.getElementById('hpText'),
    bossBanner: document.getElementById('bossBanner'),
    flash: document.getElementById('flash'),
    floaters: document.getElementById('floaters'),
    coinLayer: document.getElementById('coinLayer'),
    statClick: document.getElementById('statClick'),
    statDps: document.getElementById('statDps'),
    statCrit: document.getElementById('statCrit'),
    statCritMult: document.getElementById('statCritMult'),
    statGold: document.getElementById('statGold'),
    statKills: document.getElementById('statKills'),
    shopList: document.getElementById('shopList'),
    villageList: document.getElementById('villageList'),
    villageScene: document.getElementById('villageScene'),
    gambleResult: document.getElementById('gambleResult'),
    gambleTokenCount: document.getElementById('gambleTokenCount'),
    gambleLocked: document.getElementById('gambleLocked'),
    gambleContent: document.getElementById('gambleContent'),
    tokenCurrency: document.getElementById('tokenCurrency'),
    rouletteWheel: document.getElementById('rouletteWheel'),
    villageBlessCount: document.getElementById('villageBlessCount'),
    villageModalBlessCount: document.getElementById('villageModalBlessCount'),
    villageOverlay: document.getElementById('villageOverlay'),
    villageOpenBtn: document.getElementById('villageOpenBtn'),
    bestiaryOverlay: document.getElementById('bestiaryOverlay'),
    bestiaryOpenBtn: document.getElementById('bestiaryOpenBtn'),
    bestiaryCloseBtn: document.getElementById('bestiaryCloseBtn'),
    bestiaryGrid: document.getElementById('bestiaryGrid'),
    bestiaryCount: document.getElementById('bestiaryCount'),
    bestiaryTotal: document.getElementById('bestiaryTotal'),
    bestiaryModalCount: document.getElementById('bestiaryModalCount'),
    bestiaryModalTotal: document.getElementById('bestiaryModalTotal'),
    achvOverlay: document.getElementById('achvOverlay'),
    achvOpenBtn: document.getElementById('achvOpenBtn'),
    achvCloseBtn: document.getElementById('achvCloseBtn'),
    achvGrid: document.getElementById('achvGrid'),
    achvCount: document.getElementById('achvCount'),
    achvTotal: document.getElementById('achvTotal'),
    achvModalCount: document.getElementById('achvModalCount'),
    achvModalTotal: document.getElementById('achvModalTotal'),
    villageCloseBtn: document.getElementById('villageCloseBtn'),
    prestigeBox: document.getElementById('prestigeBox'),
    prestigeInfo: document.getElementById('prestigeInfo'),
    ascendBtn: document.getElementById('ascendBtn'),
    ascendGain: document.getElementById('ascendGain'),
    resetBtn: document.getElementById('resetBtn'),
    toastWrap: document.getElementById('toastWrap'),
    accountBtn: document.getElementById('accountBtn'),
    accountOverlay: document.getElementById('accountOverlay'),
    accountCloseBtn: document.getElementById('accountCloseBtn'),
    accountLoggedOut: document.getElementById('accountLoggedOut'),
    accountLoggedIn: document.getElementById('accountLoggedIn'),
    accountUsername: document.getElementById('accountUsername'),
    tabSignIn: document.getElementById('tabSignIn'),
    tabSignUp: document.getElementById('tabSignUp'),
    authForm: document.getElementById('authForm'),
    authUsername: document.getElementById('authUsername'),
    authPassword: document.getElementById('authPassword'),
    authSubmitBtn: document.getElementById('authSubmitBtn'),
    authError: document.getElementById('authError'),
    logoutBtn: document.getElementById('logoutBtn'),
    leaderboardList: document.getElementById('leaderboardList')
  };

  var lastLevelRendered = -1;
  function renderLevelChrome(){
    var level = currentLevel();
    if(state.levelIndex !== lastLevelRendered){
      el.levelName.textContent = level.name;
      el.levelLore.textContent = level.lore;
      el.arenaSky.style.background = level.sky;
      document.documentElement.style.setProperty('--level-accent', level.accent);
      el.arenaDecor.innerHTML = '';
      level.decor.forEach(function(d){
        var art = DECOR[d.k];
        var wrap = document.createElement('div');
        wrap.className = 'decor-item';
        wrap.style.left = d.x; wrap.style.top = d.y; wrap.style.width = d.s+'px'; wrap.style.height = d.s+'px';
        wrap.innerHTML = svgFromGrid(art.rows, art.palette);
        el.arenaDecor.appendChild(wrap);
      });
      lastLevelRendered = state.levelIndex;
    }
    var kpb = level.killsPerBoss;
    if(state.bossReady){
      el.levelProgress.style.width = '100%';
      el.levelCount.textContent = 'Ready!';
    } else {
      var pct = Math.min(100, (state.killsInLevel % kpb) / kpb * 100);
      el.levelProgress.style.width = pct+'%';
      el.levelCount.textContent = (state.killsInLevel % kpb) + ' / ' + kpb;
    }
  }

  // The boss always stays drawn in the main stage (dimmed behind while
  // guarded) so its identity and health are never hidden; a summoned
  // guardian gets its own smaller sprite + mini health bar layered in
  // front, since that's the thing your clicks actually land on.
  function renderEnemy(fresh){
    var e = state.enemy;
    if(!e) return;
    var mon = MONSTERS[e.key];
    var showingAdd = !!state.addEnemy;
    var shielded = isShielded(e);

    el.enemyName.textContent = e.name;
    el.enemyName.className = 'name' + (e.isBoss ? ' boss':'');
    var regenAbility = e.isBoss ? regenAbilityFor(e) : null;
    var regenLeft = regenAbility ? Math.max(0, regenAbility.maxTicks - (e.regenTicksUsed||0)) : 0;
    var regenThreshold = regenAbility ? (regenAbility.lowHpThreshold != null ? regenAbility.lowHpThreshold : 0.25) : 0;
    var regenArmed = regenAbility && (e.hp/e.maxHp <= regenThreshold);
    if(showingAdd && e.hydraActive){ el.enemySub.textContent = 'a head guards the body'; }
    else if(showingAdd){ el.enemySub.textContent = 'a guardian blocks the way'; }
    else if(e.hydraActive && e.hydraVulnerable){ el.enemySub.textContent = 'exposed -- strike now!'; }
    else if(e.hydraActive){ el.enemySub.textContent = 'body is safe until the heads fall'; }
    else if(e.mathGateActive){ el.enemySub.textContent = 'answer the question to keep attacking'; }
    else if(regenAbility && regenLeft<=0){ el.enemySub.textContent = 'exhausted -- no more regeneration'; }
    else if(regenArmed){ el.enemySub.textContent = 'critically wounded -- regenerating ('+regenLeft+' left)'; }
    else { el.enemySub.textContent = ''; }
    el.stage.classList.toggle('boss', e.isBoss);
    el.stage.classList.toggle('shielded', shielded);
    el.stage.classList.toggle('guarded', showingAdd);
    el.mattiAngels.classList.toggle('show', e.key === 'matti');
    el.bossBanner.classList.toggle('show', e.isBoss && !showingAdd);
    el.bossBanner.classList.toggle('shielded', shielded);
    el.bossBanner.textContent = shielded ? 'Shielded' : 'Boss encounter';
    el.hpFill.classList.toggle('shielded', shielded);
    if(fresh){
      el.spriteWrap.innerHTML = svgFromGrid(mon.rows, mon.palette);
      el.stage.classList.remove('dying');
    }
    var pct = Math.max(0, e.hp/e.maxHp*100);
    el.hpFill.style.width = pct+'%';
    el.hpText.textContent = fmt(Math.max(0,e.hp)) + ' / ' + fmt(e.maxHp);

    // Bosses only ever show up when you walk in on purpose -- farm normal
    // enemies until you're ready, then Challenge; back out anytime with
    // Flee (bossReady stays set, so you can just try again later).
    el.challengeBtn.hidden = !(state.bossReady && !e.isBoss);
    if(state.bossReady && !e.isBoss) el.challengeBtn.textContent = 'Challenge '+currentLevel().bossName;
    el.fleeBtn.hidden = !e.isBoss;
    el.hint.textContent = e.isBoss ? 'Boss fight' : 'tap the monster to attack';

    el.addWrap.classList.toggle('show', showingAdd);
    if(showingAdd){
      var add = state.addEnemy;
      if(fresh){
        var addMon = MONSTERS[add.key];
        el.addSpriteWrap.innerHTML = svgFromGrid(addMon.rows, addMon.palette);
        el.addLabel.textContent = add.name;
      }
      el.addHpFill.style.width = Math.max(0, add.hp/add.maxHp*100)+'%';
    }

    var gateOn = !showingAdd && !!e.mathGateActive;
    el.mathGateBox.classList.toggle('show', gateOn);
    if(gateOn){
      el.mathGateQ.textContent = e.mathGateQuestion;
    }
  }

  // Gold in the top bar animates toward state.gold instead of snapping,
  // so the flying coins from a kill visibly "arrive".
  var goldDisplayValue = 0;
  var goldTweenBusy = false;
  function setGoldDisplayInstant(v){ goldDisplayValue = v; el.goldCount.textContent = fmt(v); }
  function tweenGoldTo(target){
    if(REDUCED_MOTION){ setGoldDisplayInstant(target); return; }
    goldTweenBusy = true;
    var startVal = goldDisplayValue, startTime = null, dur = 650;
    function step(ts){
      if(startTime === null) startTime = ts;
      var p = Math.min(1, (ts-startTime)/dur);
      var eased = 1-Math.pow(1-p,3);
      goldDisplayValue = startVal + (target-startVal)*eased;
      el.goldCount.textContent = fmt(goldDisplayValue);
      if(p<1){ requestAnimationFrame(step); }
      else { goldDisplayValue = target; el.goldCount.textContent = fmt(target); goldTweenBusy = false; }
    }
    requestAnimationFrame(step);
  }

  function renderStats(){
    if(!goldTweenBusy) setGoldDisplayInstant(state.gold);
    el.blessCount.textContent = state.blessings;
    el.tokenCount.textContent = state.gambleTokens;
    el.statClick.textContent = fmt(clickDamage());
    el.statDps.textContent = fmt(dpsValue());
    el.statCrit.textContent = Math.round(critChance()*100)+'%';
    el.statCritMult.textContent = critMultVal().toFixed(1)+'x';
    el.statGold.textContent = goldMultVal().toFixed(2)+'x';
    el.statKills.textContent = state.totalKills;
    updateGambleButtons();
  }

  function renderUpgradeRow(u){
    var lvl = state.upgradeLevels[u.id]||0;
    var cost = upgradeCost(u);
    // A capped role (crit chance, luck) stops being worth buying once
    // its ceiling is hit -- more levels would be gold spent for nothing.
    var maxed = isRoleMaxed(u.role);
    var bulk = maxed ? {count:0} : maxAffordableUpgrade(u);
    var row = document.createElement('div');
    row.className = 'upgrade';
    row.innerHTML =
      '<div class="u-name">'+u.name+'</div>'+
      '<div class="u-desc">'+u.desc+'</div>'+
      '<div class="u-lvl">Lv.'+lvl+' &middot; now '+u.format(u.effect(lvl))+'</div>'+
      (maxed
        ? '<div class="u-buy-row"><button class="buy" disabled>Maxed</button></div>'
        : '<div class="u-buy-row">'+
            '<button class="buy" '+(state.gold<cost?'disabled':'')+'>'+fmt(cost)+'g</button>'+
            '<button class="buy buy-max" '+(bulk.count<1?'disabled':'')+'>Max x'+bulk.count+' ('+fmt(bulk.cost)+'g)</button>'+
          '</div>');
    if(!maxed){
      row.querySelector('.buy').addEventListener('click', function(){ buyUpgrade(u); });
      row.querySelector('.buy-max').addEventListener('click', function(){ buyMaxUpgrade(u); });
    }
    return row;
  }

  // Grouped by category (Click Damage / Auto Damage / Critical Hits /
  // Gold / Luck) so a growing upgrade list stays easy to scan instead of
  // one long undifferentiated column -- a category header only appears
  // once something in it is actually unlocked.
  function renderShop(){
    el.shopList.innerHTML = '';
    var unlocked = UPGRADES.filter(isUnlocked);
    UPGRADE_CATEGORIES.forEach(function(cat){
      var items = unlocked.filter(function(u){ return u.category === cat.id; });
      if(!items.length) return;
      var header = document.createElement('div');
      header.className = 'shop-category';
      header.textContent = cat.label;
      el.shopList.appendChild(header);
      items.forEach(function(u){ el.shopList.appendChild(renderUpgradeRow(u)); });
    });
  }

  function renderVillage(){
    el.villageBlessCount.textContent = state.blessings;
    el.villageModalBlessCount.textContent = state.blessings;
    renderVillageScene();
    el.villageList.innerHTML = '';
    VILLAGE.forEach(function(b){
      var lvl = state.villageLevels[b.id]||0;
      var cost = villageCost(b);
      var bulk = maxAffordableVillage(b);
      var row = document.createElement('div');
      row.className = 'upgrade';
      row.innerHTML =
        '<div class="u-name"><span class="u-icon">'+VILLAGE_ICON_SVG[b.icon]+'</span>'+b.name+'</div>'+
        '<div class="u-desc">'+b.desc+'</div>'+
        '<div class="u-lvl">Lv.'+lvl+' &middot; now '+b.format(b.effect(lvl))+'</div>'+
        '<div class="u-buy-row">'+
          '<button class="buy" '+(state.blessings<cost?'disabled':'')+'><span class="buy-icon">'+BLESS_ICON_SVG+'</span>'+cost+'</button>'+
          '<button class="buy buy-max" '+(bulk.count<1?'disabled':'')+'>Max x'+bulk.count+' ('+bulk.cost+')</button>'+
        '</div>';
      row.querySelector('.buy:not(.buy-max)').addEventListener('click', function(){ buyVillageBuilding(b); });
      row.querySelector('.buy-max').addEventListener('click', function(){ buyMaxVillageBuilding(b); });
      el.villageList.appendChild(row);
    });
    var open = casinoBuilt();
    el.gambleLocked.hidden = open;
    el.gambleContent.hidden = !open;
    el.tokenCurrency.hidden = !open;
    if(open) updateGambleButtons();
  }

  // A little town that visibly grows: one tile per building, dim and
  // grayscale until at least level 1, full color and leveled after.
  // Hand-placed so the scene reads as a scattered little clearing rather
  // than a grid -- positions are the center of each element.
  var VILLAGE_SCENE_LAYOUT = {
    watchtower: { left:'16%', top:'40%' },
    forge:      { left:'38%', top:'62%' },
    barracks:   { left:'62%', top:'42%' },
    shrine:     { left:'84%', top:'64%' },
    well:       { left:'50%', top:'82%' },
    casino:     { left:'50%', top:'30%' }
  };
  var VILLAGE_DECOR = [
    { k:'pine', left:'6%', top:'24%', s:46 },
    { k:'pine', left:'93%', top:'20%', s:38 },
    { k:'bush', left:'24%', top:'88%', s:30 },
    { k:'rock', left:'72%', top:'86%', s:28 },
    { k:'crystal', left:'90%', top:'46%', s:26 }
  ];
  function renderVillageScene(){
    el.villageScene.innerHTML = '';
    VILLAGE_DECOR.forEach(function(d){
      var art = DECOR[d.k];
      var deco = document.createElement('div');
      deco.className = 'village-decor-item';
      deco.style.left = d.left; deco.style.top = d.top;
      deco.style.width = d.s+'px'; deco.style.height = d.s+'px';
      deco.style.transform = 'translate(-50%,-50%)';
      deco.innerHTML = svgFromGrid(art.rows, art.palette);
      el.villageScene.appendChild(deco);
    });
    VILLAGE.forEach(function(b){
      var lvl = state.villageLevels[b.id]||0;
      var pos = VILLAGE_SCENE_LAYOUT[b.id] || { left:'50%', top:'50%' };
      var tile = document.createElement('div');
      tile.className = 'village-tile' + (lvl>0 ? ' built' : '');
      tile.style.left = pos.left; tile.style.top = pos.top;
      tile.title = b.name;
      tile.innerHTML =
        '<div class="village-tile-icon">'+VILLAGE_ICON_SVG[b.icon]+'</div>'+
        '<div class="village-tile-ground"></div>'+
        '<div class="village-tile-lvl">'+(lvl>0 ? ('Lv.'+lvl) : 'locked')+'</div>';
      el.villageScene.appendChild(tile);
    });
  }

  /* ---------------- Roulette ----------------
     Real European wheel order and colors, so the spin animation actually
     lands where the result says it does (not just a decorative spin).
     Red/Black pay 1:1, Green (0) pays 35:1, matching real roulette odds
     (house edge comes from the single green pocket).
  ---------------------------------------------- */
  var WHEEL_ORDER = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  var RED_NUMBERS = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  var ROULETTE_PAYOUT = { red:1, black:1, green:35 };
  var WHEEL_SEG = 360/WHEEL_ORDER.length;
  function numberColor(n){ return n===0 ? 'green' : (RED_NUMBERS.indexOf(n)>=0 ? 'red' : 'black'); }
  function buildWheelGradient(){
    var colors = { red:'#b5342a', black:'#1c1c1c', green:'#2f7d3f' };
    var stops = WHEEL_ORDER.map(function(n, i){
      return colors[numberColor(n)]+' '+(i*WHEEL_SEG).toFixed(3)+'deg '+((i+1)*WHEEL_SEG).toFixed(3)+'deg';
    });
    return 'conic-gradient(from 0deg, '+stops.join(', ')+')';
  }
  var rouletteRotation = 0;
  var rouletteSpinning = false;
  var rouletteBetColor = null;
  function selectRouletteBet(color){
    if(rouletteSpinning) return;
    rouletteBetColor = color;
    document.querySelectorAll('.roulette-bet-btn').forEach(function(btn){
      btn.classList.toggle('active', btn.dataset.color === color);
    });
  }
  function spinRoulette(fraction){
    if(rouletteSpinning) return;
    if(!casinoBuilt()) return;
    if(state.gambleTokens < 1){
      el.gambleResult.textContent = 'Defeat a realm boss to earn a Gambling Token first.';
      el.gambleResult.className = 'gamble-result lose';
      return;
    }
    if(!rouletteBetColor){
      el.gambleResult.textContent = 'Pick Red, Black, or Green first.';
      el.gambleResult.className = 'gamble-result lose';
      return;
    }
    var wager = Math.round(state.gold*fraction);
    if(wager < 1) return;
    rouletteSpinning = true;
    state.gambleTokens--;
    state.gold -= wager;
    renderShop(); renderStats(); renderLevelChrome(); updateGambleButtons();
    el.gambleResult.textContent = 'Spinning...';
    el.gambleResult.className = 'gamble-result';

    var winIndex = Math.floor(Math.random()*WHEEL_ORDER.length);
    var winNumber = WHEEL_ORDER[winIndex];
    var winColor = numberColor(winNumber);
    var centerAngle = winIndex*WHEEL_SEG + WHEEL_SEG/2;
    var currentAngle = ((rouletteRotation % 360) + 360) % 360;
    var targetAngle = (360 - centerAngle + 360) % 360;
    var delta = ((targetAngle - currentAngle) % 360 + 360) % 360;
    rouletteRotation += 4*360 + delta;
    el.rouletteWheel.style.transform = 'rotate('+rouletteRotation+'deg)';

    setTimeout(function(){
      var win = winColor === rouletteBetColor;
      if(win){
        var payout = wager*ROULETTE_PAYOUT[winColor];
        state.gold += wager + payout;
        state.totalGoldRun += payout;
        el.gambleResult.textContent = winNumber+' ('+winColor+')! Won +'+fmt(payout)+'g';
        el.gambleResult.className = 'gamble-result win';
        if(winColor === 'green') unlockAchievement('highRoller');
      } else {
        el.gambleResult.textContent = winNumber+' ('+winColor+'). Lost '+fmt(wager)+'g.';
        el.gambleResult.className = 'gamble-result lose';
      }
      rouletteSpinning = false;
      renderShop(); renderStats(); renderLevelChrome(); updateGambleButtons();
      save();
    }, REDUCED_MOTION ? 0 : 3650);
  }
  function updateGambleButtons(){
    el.gambleTokenCount.textContent = state.gambleTokens+' token'+(state.gambleTokens===1?'':'s');
    var hasToken = state.gambleTokens >= 1;
    document.querySelectorAll('.gamble-btn[data-frac]').forEach(function(btn){
      var frac = parseFloat(btn.dataset.frac);
      btn.disabled = rouletteSpinning || !hasToken || Math.round(state.gold*frac) < 1;
    });
    document.querySelectorAll('.roulette-bet-btn').forEach(function(btn){
      btn.disabled = rouletteSpinning;
    });
  }

  function renderPrestige(){
    var gain = blessingGain();
    var showBox = finalBeaten || state.blessings>0 || state.dragonKills>0;
    el.prestigeBox.style.display = showBox ? 'flex' : 'none';
    el.ascendGain.textContent = gain;
    el.ascendBtn.disabled = !finalBeaten || gain<1;
    if(!finalBeaten){
      var left = DRAGON_KILLS_TO_UNLOCK_ASCEND - state.dragonKills;
      el.prestigeInfo.textContent = 'Defeat the Ancient Dragon '+left+' more time'+(left===1?'':'s')+' to unlock Ascend. ('+state.dragonKills+'/'+DRAGON_KILLS_TO_UNLOCK_ASCEND+')';
    } else {
      el.prestigeInfo.textContent = 'Ascend to trade this run for Blessings, then spend them in the Village for permanent power.';
    }
  }

  function toast(msg, ms){
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    if(ms){
      // override the CSS fade-out delay (normally 2.6s) so a longer
      // message like the opening story line stays up for `ms` instead.
      t.style.animationDuration = '.25s, .4s';
      t.style.animationDelay = '0s, '+(ms/1000)+'s';
    }
    el.toastWrap.appendChild(t);
    setTimeout(function(){ t.remove(); }, ms ? ms+400 : 3100);
  }

  function spawnFloater(text, cls){
    var f = document.createElement('div');
    f.className = 'floater' + (cls?(' '+cls):'');
    f.textContent = text;
    f.style.left = (40 + Math.random()*40)+'%';
    f.style.top = (30 + Math.random()*20)+'%';
    el.floaters.appendChild(f);
    f.addEventListener('animationend', function(){ f.remove(); });
  }

  /* ---------------- Big moment FX (boss abilities, elemental hits) ----
     Kept deliberately generic -- one shake + one particle-burst primitive
     that any ability or hit can call, rather than a bespoke animation per
     monster. Respects REDUCED_MOTION throughout. ---------------------- */
  function screenShake(cls){
    if(REDUCED_MOTION) return;
    cls = cls || 'boss-shake';
    el.arena.classList.remove('boss-shake', 'tug-shake');
    void el.arena.offsetWidth;
    el.arena.classList.add(cls);
  }
  var PARTICLE_KINDS = {
    fire: ['#ff9d3d','#ff5c1a','#ffe08a'],
    ice: ['#8fe0ff','#c9f2ff','#ffffff'],
    lightning: ['#fff86b','#c9a8ff','#ffffff'],
    web: ['#d8d8e0','#a8a8b8'],
    impact: ['#fff3c0','#ffe066']
  };
  function burstParticles(kind, count){
    if(REDUCED_MOTION) return;
    var colors = PARTICLE_KINDS[kind] || PARTICLE_KINDS.impact;
    count = count || 10;
    for(var i=0;i<count;i++){
      var p = document.createElement('div');
      p.className = 'fx-particle';
      var ang = Math.random()*Math.PI*2;
      var dist = 30 + Math.random()*50;
      p.style.setProperty('--dx', (Math.cos(ang)*dist)+'px');
      p.style.setProperty('--dy', (Math.sin(ang)*dist)+'px');
      p.style.background = colors[Math.floor(Math.random()*colors.length)];
      p.style.left = (46 + Math.random()*8)+'%';
      p.style.top = (36 + Math.random()*8)+'%';
      p.style.animationDelay = (Math.random()*80)+'ms';
      el.floaters.appendChild(p);
      p.addEventListener('animationend', function(){ this.remove(); });
    }
  }
  // A thin strand from the monster toward the middle of the stage, plus a
  // directional tug on the arena -- the closest a web page can get to
  // "pulls your cursor" since a page can't actually move the OS pointer.
  function webPullFx(){
    if(REDUCED_MOTION){ screenShake(); return; }
    var strand = document.createElement('div');
    strand.className = 'web-strand';
    el.floaters.appendChild(strand);
    strand.addEventListener('animationend', function(){ strand.remove(); });
    burstParticles('web', 6);
    screenShake('tug-shake');
  }

  // Sends a few coin sprites arcing from the arena to the gold counter.
  function flyCoinsToGold(reward, isBoss){
    if(REDUCED_MOTION) return;
    var fromRect = el.stage.getBoundingClientRect();
    var toRect = el.goldIconEl.getBoundingClientRect();
    var originX = fromRect.left + fromRect.width/2, originY = fromRect.top + fromRect.height/2;
    var targetX = toRect.left + toRect.width/2, targetY = toRect.top + toRect.height/2;
    var count = isBoss ? 6 : Math.max(2, Math.min(4, 2+Math.floor(reward/60)));
    for(var i=0;i<count;i++){
      var coin = document.createElement('div');
      coin.className = 'coin';
      coin.innerHTML = GOLD_ICON_SVG;
      var jitterX = (Math.random()-0.5)*36, jitterY = (Math.random()-0.5)*20;
      var startX = originX+jitterX, startY = originY+jitterY;
      coin.style.left = startX+'px'; coin.style.top = startY+'px';
      var dx2 = targetX-startX, dy2 = targetY-startY;
      var arcX = dx2*0.25 + (Math.random()-0.5)*30;
      var arcY = dy2*0.35 - 55 - Math.random()*20;
      coin.style.setProperty('--dx1', arcX+'px');
      coin.style.setProperty('--dy1', arcY+'px');
      coin.style.setProperty('--dx2', dx2+'px');
      coin.style.setProperty('--dy2', dy2+'px');
      coin.style.animationDelay = (i*55)+'ms';
      el.coinLayer.appendChild(coin);
      (function(c){ c.addEventListener('animationend', function(){ c.remove(); pulseGoldIcon(); }); })(coin);
    }
  }
  function pulseGoldIcon(){
    el.goldCurrency.classList.remove('gold-pulse');
    void el.goldCurrency.offsetWidth;
    el.goldCurrency.classList.add('gold-pulse');
  }

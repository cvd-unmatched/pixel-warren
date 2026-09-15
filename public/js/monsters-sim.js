"use strict";
(function(){

  var el = {
    monsterSelect: document.getElementById('monsterSelect'),
    clickPct: document.getElementById('clickPct'),
    oneShot: document.getElementById('oneShot'),
    respawnBtn: document.getElementById('respawnBtn'),
    simInfo: document.getElementById('simInfo'),
    simAbilities: document.getElementById('simAbilities'),
    simToast: document.getElementById('simToast'),
    arena: document.getElementById('arena'),
    stage: document.getElementById('stage'),
    spriteWrap: document.getElementById('spriteWrap'),
    floaters: document.getElementById('floaters'),
    enemyName: document.getElementById('enemyName'),
    enemySub: document.getElementById('enemySub'),
    hpFill: document.getElementById('hpFill'),
    hpText: document.getElementById('hpText'),
    hint: document.getElementById('hint'),
    mattiAngels: document.getElementById('mattiAngels'),
    addWrap: document.getElementById('addWrap'),
    addLabel: document.getElementById('addLabel'),
    addSpriteWrap: document.getElementById('addSpriteWrap'),
    addHpFill: document.getElementById('addHpFill'),
    mathGateBox: document.getElementById('mathGateBox'),
    mathGateQ: document.getElementById('mathGateQ'),
    mathGateInput: document.getElementById('mathGateInput'),
    tabFight: document.getElementById('tabFight'),
    tabOverview: document.getElementById('tabOverview'),
    fightView: document.getElementById('fightView'),
    overviewView: document.getElementById('overviewView'),
    overviewGrid: document.getElementById('overviewGrid'),
    zoomModal: document.getElementById('zoomModal'),
    zoomModalBackdrop: document.getElementById('zoomModalBackdrop'),
    zoomModalClose: document.getElementById('zoomModalClose'),
    zoomModalSprite: document.getElementById('zoomModalSprite'),
    zoomModalName: document.getElementById('zoomModalName'),
    bgSwatches: document.getElementById('bgSwatches')
  };

  // Sprite background swatches: stray/leftover pixels from a bad trace are
  // easy to miss against the default dark panel (see the snowwolf/gargoyle
  // bugs) -- flipping to black/white/grey/magenta/checker makes them jump
  // out immediately. Remembered across reloads since this is a QA tool.
  (function initBgSwatches(){
    var saved = null;
    try { saved = localStorage.getItem('spriteBg'); } catch(e){}
    var active = saved || 'default';
    document.body.dataset.spriteBg = active;
    function setActive(bg){
      active = bg;
      document.body.dataset.spriteBg = bg;
      try { localStorage.setItem('spriteBg', bg); } catch(e){}
      el.bgSwatches.querySelectorAll('.bg-swatch').forEach(function(btn){
        btn.classList.toggle('active', btn.dataset.bg === bg);
      });
    }
    el.bgSwatches.querySelectorAll('.bg-swatch').forEach(function(btn){
      btn.type = 'button';
      btn.addEventListener('click', function(){ setActive(btn.dataset.bg); });
    });
    setActive(active);
  })();

  // find every level whose boss this monster key is, if any
  function bossLevelFor(key){
    return (typeof LEVELS !== 'undefined' ? LEVELS : []).find(function(l){ return l.boss === key; }) || null;
  }
  // Matti isn't any level's actual boss -- he's a random disguise any boss
  // fight can turn into (see makeEnemyData in state.js) -- so his
  // abilities live here instead of in LEVELS, for the simulator to preview.
  var MATTI_ABILITIES = [
    { type:'summon', every:14000, addKey:'julia', addHpFrac:0.3 },
    { type:'mathGate', every:20000 }
  ];

  var sim = { key: null, name: '', hp: 1, maxHp: 1, isBoss: false, abilityTimers: [], add: null,
    mathGateActive: false, mathGateQuestion: '', mathGateAnswer: 0,
    hydra: null };

  function fmt(n){
    n = Math.round(n);
    if(n >= 1e9) return (n/1e9).toFixed(2)+'B';
    if(n >= 1e6) return (n/1e6).toFixed(2)+'M';
    if(n >= 1e3) return (n/1e3).toFixed(1)+'K';
    return String(n);
  }

  function toast(msg){
    el.simToast.textContent = msg;
    clearTimeout(toast._t);
    toast._t = setTimeout(function(){ el.simToast.textContent = ''; }, 2200);
  }

  function screenShake(cls){
    el.arena.classList.remove('boss-shake', 'tug-shake');
    void el.arena.offsetWidth;
    el.arena.classList.add(cls || 'boss-shake');
  }
  var PARTICLE_KINDS = {
    fire:['#ff9d3d','#ff5c1a','#ffe08a'], ice:['#8fe0ff','#c9f2ff','#ffffff'],
    lightning:['#fff86b','#c9a8ff','#ffffff'], web:['#d8d8e0','#a8a8b8'], impact:['#fff3c0','#ffe066']
  };
  function burstParticles(kind, count){
    var colors = PARTICLE_KINDS[kind] || PARTICLE_KINDS.impact;
    count = count || 10;
    for(var i=0;i<count;i++){
      var p = document.createElement('div');
      p.className = 'fx-particle';
      var ang = Math.random()*Math.PI*2, dist = 30+Math.random()*50;
      p.style.setProperty('--dx', (Math.cos(ang)*dist)+'px');
      p.style.setProperty('--dy', (Math.sin(ang)*dist)+'px');
      p.style.background = colors[Math.floor(Math.random()*colors.length)];
      p.style.left = (46+Math.random()*8)+'%'; p.style.top = (36+Math.random()*8)+'%';
      p.style.animationDelay = (Math.random()*80)+'ms';
      el.floaters.appendChild(p);
      p.addEventListener('animationend', function(){ this.remove(); });
    }
  }
  function spawnFloater(text, cls){
    var f = document.createElement('div');
    f.className = 'floater' + (cls?(' '+cls):'');
    f.textContent = text;
    f.style.left = (40+Math.random()*40)+'%'; f.style.top = (30+Math.random()*20)+'%';
    el.floaters.appendChild(f);
    f.addEventListener('animationend', function(){ f.remove(); });
  }
  function webStrand(){
    var s = document.createElement('div');
    s.className = 'web-strand';
    el.floaters.appendChild(s);
    s.addEventListener('animationend', function(){ s.remove(); });
    burstParticles('web', 6);
    screenShake('tug-shake');
  }

  function populateSelect(){
    var keys = Object.keys(MONSTERS).sort();
    keys.forEach(function(k){
      var opt = document.createElement('option');
      opt.value = k; opt.textContent = k;
      el.monsterSelect.appendChild(opt);
    });
  }

  function stopAbilityTimers(){
    sim.abilityTimers.forEach(clearInterval);
    sim.abilityTimers = [];
  }

  function describeAbility(a){
    if(a.type === 'shield') return 'Shield every ' + (a.every/1000) + 's -- blocks ' + Math.round(a.reduction*100) + '% damage for ' + (a.duration/1000) + 's.';
    if(a.type === 'summon') return 'Summons a ' + a.addKey + ' guardian every ' + (a.every/1000) + 's.';
    if(a.type === 'regen') return 'Regenerates ' + Math.round(a.fraction*100) + '% of missing HP every ' + (a.every/1000) + 's (up to ' + a.maxTicks + ' times).';
    if(a.type === 'mathGate') return 'Blocks all damage until a math question is answered every ' + (a.every/1000) + 's.';
    if(a.type === 'hydraHeads') return 'Spawns escalating waves of heads (1,2,4...' + a.maxHeads + ' max) -- body is only vulnerable between waves.';
    if(a.type === 'webPull') return 'Fires a web every ' + (a.every/1000) + 's that tugs the whole arena.';
    if(a.type === 'enrage') return 'Enrages every ' + (a.every/1000) + 's -- no crits land on it for ' + (a.duration/1000) + 's.';
    if(a.type === 'drain') return 'Drains every ' + (a.every/1000) + 's -- heals ' + Math.round((a.drainFrac!=null?a.drainFrac:0.4)*100) + '% of damage taken back for ' + (a.duration/1000) + 's.';
    if(a.type === 'camouflage') return 'Fades from sight every ' + (a.every/1000) + 's -- clicks miss entirely for ' + (a.duration/1000) + 's.';
    if(a.type === 'curse') return 'Curses you every ' + (a.every/1000) + 's -- blocks damage until ' + (a.clicksNeeded||5) + ' plain clicks break it.';
    if(a.type === 'frostbite') return 'Chills every ' + (a.every/1000) + 's -- click damage reduced by a flat amount for ' + (a.duration/1000) + 's.';
    if(a.type === 'secondWind') return 'One-time: heals a big burst the first time it drops below ' + Math.round((a.threshold!=null?a.threshold:0.2)*100) + '% HP.';
    if(a.type === 'taunt') return 'Taunts every ' + (a.every/1000) + 's -- ' + Math.round((a.missChance!=null?a.missChance:0.4)*100) + '% of clicks miss for ' + (a.duration/1000) + 's.';
    if(a.type === 'overcharge') return 'Channels every ' + (a.every/1000) + 's -- heals a burst if not clicked within ' + (a.channelDuration/1000) + 's.';
    if(a.type === 'weakpoint') return 'Exposes a weak point every ' + (a.every/1000) + 's -- clicks deal ' + (a.bonusMult||2) + 'x damage for ' + (a.duration/1000) + 's.';
    if(a.type === 'gamble') return 'Invites a gamble every ' + (a.every/1000) + 's -- each click for ' + (a.duration/1000) + 's is a coinflip for double or half damage.';
    return a.type;
  }

  /* ---------------- add (guardian) lifecycle -- mirrors state.js's
     triggerSummon/clearAdd closely enough for a visual/behavioral
     preview, without touching any real save data. ---------------- */
  function spawnAdd(addKey){
    if(sim.add) return; // already guarded
    var addMon = MONSTERS[addKey];
    if(!addMon) return;
    var hp = Math.max(1, Math.round(sim.maxHp * 0.25));
    sim.add = { key: addKey, name: addKey, hp: hp, maxHp: hp };
    el.addSpriteWrap.innerHTML = svgFromGrid(addMon.rows, addMon.palette);
    el.addLabel.textContent = addKey;
    el.addWrap.classList.add('show');
    el.stage.classList.add('guarded');
    renderAddHp();
    toast(sim.name + ' summons a ' + addKey + ' guardian!');
  }
  function renderAddHp(){
    if(!sim.add) return;
    el.addHpFill.style.width = Math.max(0, sim.add.hp/sim.add.maxHp*100) + '%';
  }
  function clearAdd(){
    if(sim.hydra && sim.hydra.active) return clearHydraHead();
    sim.add = null;
    el.addWrap.classList.remove('show');
    el.stage.classList.remove('guarded');
    toast('Guardian defeated! ' + sim.name + ' is exposed again.');
  }

  /* ---------------- hydra escalating-heads mechanic -- mirrors
     triggerHydraWave/spawnHydraHead/clearHydraHead in state.js so this
     boss's power is actually testable here, not just described. ---------------- */
  function spawnHydraHead(ability){
    var headMon = MONSTERS[ability.headKey || 'hydraHead'];
    var hp = Math.max(1, Math.round(sim.maxHp * (ability.headHpFrac||0.08)));
    sim.add = { key: ability.headKey||'hydraHead', name:'Hydra Head', hp:hp, maxHp:hp };
    el.addSpriteWrap.innerHTML = svgFromGrid(headMon.rows, headMon.palette);
    el.addLabel.textContent = 'Hydra Head';
    el.addWrap.classList.add('show');
    el.stage.classList.add('guarded');
    renderAddHp();
  }
  function triggerHydraWave(ability){
    sim.hydra = { active:true, ability:ability, headsInWave: ability.initialHeads||1, killedInWave:0, vulnerable:false };
    spawnHydraHead(ability);
    el.enemySub.textContent = 'body is safe until the heads fall';
  }
  function clearHydraHead(){
    var h = sim.hydra;
    sim.add = null;
    el.addWrap.classList.remove('show');
    el.stage.classList.remove('guarded');
    h.killedInWave++;
    if(h.killedInWave < h.headsInWave){
      toast('Another head snaps forward!');
      spawnHydraHead(h.ability);
      el.enemySub.textContent = 'body is safe until the heads fall';
    } else {
      h.vulnerable = true;
      toast(sim.name + ' recoils, strike now!');
      el.enemySub.textContent = 'exposed, strike now!';
      setTimeout(function(){
        if(!sim.hydra || sim.hp <= 0) return;
        h.vulnerable = false;
        h.headsInWave = Math.min(h.ability.maxHeads||8, h.headsInWave*2);
        h.killedInWave = 0;
        toast(sim.name + ' grows ' + h.headsInWave + ' new head' + (h.headsInWave===1?'':'s') + '!');
        spawnHydraHead(h.ability);
        el.enemySub.textContent = 'body is safe until the heads fall';
      }, h.ability.vulnerableDuration || 6000);
    }
  }
  function clearMathGate(){
    sim.mathGateActive = false;
    el.mathGateBox.classList.remove('show');
  }

  // real math-gate behavior (mirrors triggerMathGate/answerMathGate in
  // state.js) -- damage is actually blocked in hit() below until answered,
  // so this is testable, not just a toast saying it happened.
  function triggerMathGate(){
    if(sim.add || sim.mathGateActive || sim.hp <= 0) return;
    var a = 2 + Math.floor(Math.random()*9);
    var b = 1 + Math.floor(Math.random()*9);
    var subtract = Math.random() < 0.5 && a >= b;
    sim.mathGateQuestion = subtract ? (a+' - '+b) : (a+' + '+b);
    sim.mathGateAnswer = subtract ? a-b : a+b;
    sim.mathGateActive = true;
    el.mathGateQ.textContent = sim.mathGateQuestion;
    el.mathGateBox.classList.add('show');
    el.enemySub.textContent = 'answer the question to keep attacking';
    toast(sim.name+' holds up a hand: "Quick, what\'s '+sim.mathGateQuestion+'?"');
  }
  function answerMathGate(raw){
    if(!sim.mathGateActive) return;
    var guess = parseInt(raw, 10);
    if(!isNaN(guess) && guess === sim.mathGateAnswer){
      sim.mathGateActive = false;
      el.mathGateBox.classList.remove('show');
      el.enemySub.textContent = '';
      toast('Correct! '+sim.name+' grumbles and lets you through.');
    } else {
      el.mathGateBox.classList.remove('shake'); void el.mathGateBox.offsetWidth; el.mathGateBox.classList.add('shake');
      toast('Not quite, try again.');
    }
  }
  el.mathGateBox.addEventListener('submit', function(ev){
    ev.preventDefault();
    answerMathGate(el.mathGateInput.value);
    el.mathGateInput.value = '';
  });

  function triggerAbilityFx(a){
    if(a.type === 'shield'){ toast(sim.name+' raises a shield!'); screenShake(); burstParticles('impact', 14); }
    else if(a.type === 'summon'){ spawnAdd(a.addKey); screenShake(); burstParticles('impact', 14); }
    else if(a.type === 'regen'){ toast(sim.name+' regenerates.'); }
    else if(a.type === 'mathGate'){ triggerMathGate(); }
    else if(a.type === 'webPull'){ toast('The '+sim.name+' yanks at your aim!'); webStrand(); }
  }

  var spriteAnimTimer = null;
  function stopSpriteAnimation(){
    if(spriteAnimTimer){ clearInterval(spriteAnimTimer); spriteAnimTimer = null; }
  }
  function startSpriteAnimation(mon){
    stopSpriteAnimation();
    if(!mon.frames || mon.frames.length <= 1) return;
    var frameIdx = 0;
    spriteAnimTimer = setInterval(function(){
      frameIdx = (frameIdx + 1) % mon.frames.length;
      el.spriteWrap.innerHTML = svgFromGrid(mon.frames[frameIdx], mon.palette);
    }, 1000 / (mon.fps || 6));
  }

  function loadMonster(key){
    stopAbilityTimers();
    stopSpriteAnimation();
    sim.hydra = null;
    sim.add = null;
    el.addWrap.classList.remove('show');
    el.stage.classList.remove('guarded');
    clearMathGate();
    var mon = MONSTERS[key];
    if(!mon) return;
    var bLevel = bossLevelFor(key);
    var isMatti = key === 'matti';
    var special = (typeof MONSTER_ABILITIES !== 'undefined' ? MONSTER_ABILITIES[key] : null);
    sim.key = key;
    sim.name = key;
    sim.isBoss = !!bLevel || isMatti;
    sim.maxHp = 1000;
    sim.hp = sim.maxHp;

    el.stage.classList.toggle('boss', sim.isBoss);
    el.mattiAngels.classList.toggle('show', isMatti);
    el.enemyName.textContent = (bLevel ? bLevel.bossName : key) + (sim.isBoss ? ' (boss)' : '');
    el.enemySub.textContent = bLevel ? 'guards ' + bLevel.name : (isMatti ? 'a rare disguise for any boss fight' : '');
    el.spriteWrap.innerHTML = svgFromGrid(mon.rows, mon.palette);
    startSpriteAnimation(mon);
    render();

    var lore = (typeof BESTIARY !== 'undefined' && BESTIARY[key]) ? BESTIARY[key] : null;
    el.simInfo.innerHTML = lore
      ? '<strong>Lore:</strong> ' + lore.lore + '<br><strong>Power:</strong> ' + lore.power
      : '<em>No Bestiary entry for this key.</em>';

    var abilities = (bLevel ? bLevel.bossAbilities : null) || (isMatti ? MATTI_ABILITIES : null) || (special ? [special] : []);
    if(abilities.length){
      el.simAbilities.innerHTML = abilities.map(function(a){
        return '<div class="ability-row">' + describeAbility(a) + '</div>';
      }).join('');
      abilities.forEach(function(a){
        if(a.type === 'hydraHeads'){ triggerHydraWave(a); return; }
        if(!a.every) return;
        sim.abilityTimers.push(setInterval(function(){ triggerAbilityFx(a); }, a.every));
      });
    } else {
      el.simAbilities.innerHTML = '<em>No special ability.</em>';
    }
  }

  function render(){
    var pct = Math.max(0, sim.hp / sim.maxHp * 100);
    el.hpFill.style.width = pct + '%';
    el.hpText.textContent = fmt(Math.max(0,sim.hp)) + ' / ' + fmt(sim.maxHp);
  }

  var ELEMENTAL_HIT_FX_SIM = { dragon:'fire', dragonFrost:'ice', dragonStorm:'lightning' };

  function hit(){
    if(!sim.key) return;
    if(!sim.add && sim.mathGateActive){ spawnFloater('?', 'blocked'); return; }
    if(!sim.add && sim.hydra && sim.hydra.active && !sim.hydra.vulnerable){ spawnFloater('immune', 'blocked'); return; }
    var target = sim.add || (sim.hp > 0 ? sim : null);
    if(!target) return;
    var dmg = el.oneShot.checked ? target.maxHp : sim.maxHp * (parseFloat(el.clickPct.value)||0) / 100;
    var isCrit = Math.random() < 0.15;
    if(isCrit) dmg *= 1.5;
    spawnFloater('-'+fmt(dmg), isCrit ? 'crit' : '');
    var hitEl = sim.add ? el.addSpriteWrap : el.spriteWrap;
    hitEl.classList.remove('hit'); void hitEl.offsetWidth; hitEl.classList.add('hit');

    if(sim.add){
      sim.add.hp -= dmg;
      if(sim.add.hp <= 0){ renderAddHp(); clearAdd(); }
      else renderAddHp();
      return;
    }

    if(isCrit && ELEMENTAL_HIT_FX_SIM[sim.key]) burstParticles(ELEMENTAL_HIT_FX_SIM[sim.key], 8);
    sim.hp -= dmg;
    if(sim.hp <= 0){
      sim.hp = 0;
      render();
      stopSpriteAnimation();
      el.stage.classList.add('dying');
      screenShake('boss-shake');
      burstParticles(ELEMENTAL_HIT_FX_SIM[sim.key] || 'impact', sim.isBoss ? 22 : 10);
      toast(sim.name + ' defeated!');
      setTimeout(function(){
        el.stage.classList.remove('dying');
        sim.hp = sim.maxHp;
        render();
        startSpriteAnimation(MONSTERS[sim.key]);
      }, 700);
    } else {
      render();
    }
  }

  el.stage.addEventListener('click', hit);
  el.stage.addEventListener('animationend', function(ev){
    if(ev.animationName === 'hitshake') ev.target.classList.remove('hit');
  });
  el.monsterSelect.addEventListener('change', function(){ loadMonster(el.monsterSelect.value); });
  el.respawnBtn.addEventListener('click', function(){
    sim.hp = sim.maxHp; render(); el.stage.classList.remove('dying'); clearAdd(); clearMathGate();
    el.enemySub.textContent = '';
  });

  /* ---------------- overview tab -- a browsable gallery of every monster,
     grouped by realm, with an info badge (lore/power/abilities) and a
     click-through into the fight sim for that monster. ---------------- */
  function showFight(){
    el.tabFight.classList.add('active');
    el.tabOverview.classList.remove('active');
    el.fightView.hidden = false;
    el.overviewView.hidden = true;
  }
  function showOverview(){
    el.tabOverview.classList.add('active');
    el.tabFight.classList.remove('active');
    el.overviewView.hidden = false;
    el.fightView.hidden = true;
    closeAllPopovers();
  }
  function closeAllPopovers(){
    document.querySelectorAll('.overview-popover').forEach(function(p){ p.remove(); });
  }
  function openZoom(key, name){
    var mon = MONSTERS[key];
    if(!mon) return;
    el.zoomModalSprite.innerHTML = svgFromGrid(mon.rows, mon.palette);
    el.zoomModalName.textContent = name;
    el.zoomModal.hidden = false;
  }
  function closeZoom(){ el.zoomModal.hidden = true; }
  el.zoomModalBackdrop.addEventListener('click', closeZoom);
  el.zoomModalClose.addEventListener('click', closeZoom);
  document.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape' && !el.zoomModal.hidden) closeZoom();
  });
  function abilitiesFor(key, bLevel, isMatti){
    var special = (typeof MONSTER_ABILITIES !== 'undefined' ? MONSTER_ABILITIES[key] : null);
    return (bLevel ? bLevel.bossAbilities : null) || (isMatti ? MATTI_ABILITIES : null) || (special ? [special] : []);
  }
  function buildOverviewGroups(){
    var keys = Object.keys(MONSTERS);
    var assigned = {};
    var groups = [];
    (typeof LEVELS !== 'undefined' ? LEVELS : []).forEach(function(level){
      var members = [];
      if(level.boss){ members.push(level.boss); assigned[level.boss] = true; }
      (level.enemies||[]).forEach(function(k){ members.push(k); assigned[k] = true; });
      groups.push({ title: level.name, boss: level.boss, members: members });
    });
    var leftover = keys.filter(function(k){ return !assigned[k]; });
    if(leftover.length) groups.push({ title: 'Other', boss: null, members: leftover });
    return groups;
  }
  function renderCardPopover(card, key, bLevel, isMatti){
    closeAllPopovers();
    var lore = (typeof BESTIARY !== 'undefined' && BESTIARY[key]) ? BESTIARY[key] : null;
    var abilities = abilitiesFor(key, bLevel, isMatti);
    var html = lore
      ? '<strong>Lore:</strong> ' + lore.lore + '<br><strong>Power:</strong> ' + lore.power
      : '<em>No Bestiary entry.</em>';
    if(abilities.length){
      html += abilities.map(function(a){ return '<div class="popover-ability">' + describeAbility(a) + '</div>'; }).join('');
    }
    var pop = document.createElement('div');
    pop.className = 'overview-popover';
    pop.innerHTML = html;
    card.appendChild(pop);
    setTimeout(function(){
      document.addEventListener('click', function onDoc(ev){
        if(!pop.contains(ev.target)){ pop.remove(); document.removeEventListener('click', onDoc); }
      });
    }, 0);
  }
  function renderOverview(){
    el.overviewGrid.innerHTML = '';
    var groups = buildOverviewGroups();
    var container = document.createDocumentFragment();
    groups.forEach(function(group){
      var section = document.createElement('div');
      section.className = 'overview-group';
      var h2 = document.createElement('h2');
      h2.textContent = group.title;
      section.appendChild(h2);
      var grid = document.createElement('div');
      grid.className = 'overview-grid';
      group.members.forEach(function(key){
        var mon = MONSTERS[key];
        if(!mon) return;
        var isBossHere = key === group.boss;
        var bLevel = bossLevelFor(key);
        var isMatti = key === 'matti';
        var card = document.createElement('div');
        card.className = 'overview-card' + (isBossHere ? ' is-boss' : '');
        var spriteBox = document.createElement('div');
        spriteBox.className = 'card-sprite';
        spriteBox.innerHTML = svgFromGrid(mon.rows, mon.palette);
        spriteBox.addEventListener('click', function(ev){
          ev.stopPropagation();
          openZoom(key, bLevel ? bLevel.bossName : key);
        });
        card.appendChild(spriteBox);
        var nameEl = document.createElement('div');
        nameEl.className = 'card-name';
        nameEl.textContent = bLevel ? bLevel.bossName : key;
        card.appendChild(nameEl);
        if(isBossHere){
          var badge = document.createElement('div');
          badge.className = 'card-boss-badge';
          badge.textContent = 'BOSS';
          card.appendChild(badge);
        }
        var info = document.createElement('div');
        info.className = 'info-badge';
        info.textContent = 'i';
        info.title = 'Lore, power & abilities';
        info.addEventListener('click', function(ev){
          ev.stopPropagation();
          if(card.querySelector('.overview-popover')){ closeAllPopovers(); return; }
          renderCardPopover(card, key, bLevel, isMatti);
        });
        card.appendChild(info);
        card.addEventListener('click', function(){
          closeAllPopovers();
          el.monsterSelect.value = key;
          loadMonster(key);
          showFight();
        });
        grid.appendChild(card);
      });
      section.appendChild(grid);
      container.appendChild(section);
    });
    el.overviewGrid.appendChild(container);
  }

  el.tabFight.addEventListener('click', showFight);
  el.tabOverview.addEventListener('click', function(){ showOverview(); renderOverview(); });

  populateSelect();
  el.monsterSelect.value = 'slime';
  loadMonster('slime');
})();

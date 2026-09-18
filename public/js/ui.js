"use strict";

  // Snapshotted synchronously, before anything else in boot has had any
  // chance to run and write one -- persistLoad()/checkDailyStreak()/the
  // 8s autosave interval all eventually write this same key, and every
  // one of them is reached through an async callback (a fetch().then(),
  // an interval), never before the very first yield to the event loop.
  // Capturing it this early is what makes it possible to tell "a save
  // already existed before this page load" apart from "this page load's
  // own boot already wrote one", further down when the sign-in-or-guest
  // prompt below has to decide whether this is a first-time visitor.
  var hadLocalSaveBeforeBoot = false;
  try{ hadLocalSaveBeforeBoot = !!localStorage.getItem(SAVE_KEY); }catch(e){}

  /* ---------------- Wire up ---------------- */
  el.stage.addEventListener('click', onStageClick);
  el.stage.addEventListener('animationend', function(ev){
    if(ev.animationName === 'hitshake') ev.target.classList.remove('hit');
  });
  el.ascendBtn.addEventListener('click', ascend);
  el.resetBtn.addEventListener('click', resetSave);
  // Mobile only (see the media query in style.css): the arena and the
  // upgrades panel each get the whole screen instead of splitting a
  // cramped half each, swapped with these two buttons.
  el.mobilePanelToggle.addEventListener('click', function(){ el.app.classList.add('mobile-show-panel'); });
  el.mobilePanelClose.addEventListener('click', function(){ el.app.classList.remove('mobile-show-panel'); });
  document.querySelectorAll('.roulette-bet-btn').forEach(function(btn){
    btn.addEventListener('click', function(){ selectRouletteBet(btn.dataset.color); });
  });
  document.querySelectorAll('.gamble-btn[data-frac]').forEach(function(btn){
    btn.addEventListener('click', function(){ spinRoulette(parseFloat(btn.dataset.frac)); });
  });
  document.getElementById('rouletteWheel').style.background = buildWheelGradient();
  function openVillage(){ el.villageOverlay.classList.add('show'); }
  function closeVillage(){ el.villageOverlay.classList.remove('show'); }
  el.villageOpenBtn.addEventListener('click', openVillage);
  el.villageCloseBtn.addEventListener('click', closeVillage);
  el.villageOverlay.addEventListener('click', function(ev){
    if(ev.target === el.villageOverlay) closeVillage();
  });
  function openBestiary(){ renderBestiary(); el.bestiaryOverlay.classList.add('show'); }
  function closeBestiary(){ el.bestiaryOverlay.classList.remove('show'); }
  el.bestiaryOpenBtn.addEventListener('click', openBestiary);
  el.bestiaryCloseBtn.addEventListener('click', closeBestiary);
  el.bestiaryOverlay.addEventListener('click', function(ev){
    if(ev.target === el.bestiaryOverlay) closeBestiary();
  });
  function openAchievements(){ renderAchievements(); el.achvOverlay.classList.add('show'); }
  function closeAchievements(){ el.achvOverlay.classList.remove('show'); }
  el.achvOpenBtn.addEventListener('click', openAchievements);
  el.achvCloseBtn.addEventListener('click', closeAchievements);
  el.achvOverlay.addEventListener('click', function(ev){
    if(ev.target === el.achvOverlay) closeAchievements();
  });
  el.arcadeOpenBtn.addEventListener('click', openArcade);
  el.arcadeCloseBtn.addEventListener('click', closeArcade);
  el.arcadeOverlay.addEventListener('click', function(ev){
    if(ev.target === el.arcadeOverlay) closeArcade();
  });

  /* ---------------- Account (optional MariaDB-backed login) ----------------
     Guest play never depends on this: with no account, saves keep going
     to the server's local save file (or localStorage) exactly as before.
     Signing in/up just switches where /api/save reads and writes to, via
     a session cookie the server checks on every request. */
  var authMode = 'signin';
  function setAuthMode(mode){
    authMode = mode;
    el.tabSignIn.classList.toggle('active', mode === 'signin');
    el.tabSignUp.classList.toggle('active', mode === 'signup');
    el.authSubmitBtn.textContent = mode === 'signin' ? 'Sign In' : 'Sign Up';
    el.authPassword.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    el.authError.textContent = '';
  }
  function refreshAccountUI(loggedIn, username){
    el.accountBtn.textContent = loggedIn ? username : 'Sign In';
    el.accountLoggedOut.hidden = loggedIn;
    el.accountLoggedIn.hidden = !loggedIn;
    if(loggedIn) el.accountUsername.textContent = username;
  }
  // Whether the last attempt to reach api/me actually got a server
  // response at all -- false means there's no backend to talk to (e.g.
  // this is the standalone Artifact build, or a static file:// open),
  // as opposed to a real account error like a wrong password.
  var backendReachable = true;
  // Called after every save with what the server says about this tab's
  // session (see state.js persistSave). If this tab still thinks it's
  // signed in but the server has moved on, someone logged into this
  // account elsewhere and this session was invalidated -- surface that
  // instead of silently continuing to save as a guest.
  function onSaveSessionStatus(loggedIn){
    var thoughtLoggedIn = !el.accountLoggedIn.hidden;
    if(thoughtLoggedIn && !loggedIn){
      refreshAccountUI(false, null);
      toast('Signed out. This account signed in somewhere else.', 4500);
    }
  }
  function checkAuthStatus(){
    return fetch('api/me').then(function(r){ return r.json(); }).then(function(d){
      backendReachable = true;
      el.authError.textContent = '';
      refreshAccountUI(d.loggedIn, d.username);
      return d;
    }).catch(function(){
      backendReachable = false;
      el.authError.textContent = "Accounts need the game running via its own server (node server.js), not available in this preview.";
      return { loggedIn:false };
    });
  }
  function loadLeaderboard(){
    fetch('api/leaderboard').then(function(r){ return r.json(); }).then(function(d){
      var rows = d.rows || [];
      if(!rows.length){
        el.leaderboardList.innerHTML = '<div class="leaderboard-empty">No one on the board yet. Ascend at least once to appear here.</div>';
        return;
      }
      el.leaderboardList.innerHTML = rows.map(function(r, i){
        return '<div class="leaderboard-row">'+
          '<span class="leaderboard-rank">#'+(i+1)+'</span>'+
          '<span class="leaderboard-name">'+r.username+'</span>'+
          '<span class="leaderboard-stat">'+fmt(r.blessings)+' bless.</span>'+
          '<span class="leaderboard-stat">'+r.dragon_kills+' dragons</span>'+
        '</div>';
      }).join('');
    }).catch(function(){
      el.leaderboardList.innerHTML = '<div class="leaderboard-empty">Leaderboard unavailable right now.</div>';
    });
  }
  function openAccount(){
    el.accountOverlay.classList.add('show');
    checkAuthStatus();
    loadLeaderboard();
  }
  function closeAccount(){ el.accountOverlay.classList.remove('show'); }
  el.accountBtn.addEventListener('click', openAccount);
  el.accountCloseBtn.addEventListener('click', closeAccount);
  el.continueGuestBtn.addEventListener('click', closeAccount);
  el.accountOverlay.addEventListener('click', function(ev){
    if(ev.target === el.accountOverlay) closeAccount();
  });

  // A storage/cookie disclosure banner, shown until dismissed once --
  // separate from the sign-in-or-guest prompt below, since it should keep
  // showing on every visit (a returning guest with their own local save
  // still needs to see it at least once) rather than only for brand-new
  // visitors.
  var COOKIE_NOTICE_KEY = 'pixelWarrenCookieNoticeSeen';
  try{
    if(!localStorage.getItem(COOKIE_NOTICE_KEY)) el.cookieBanner.hidden = false;
  }catch(e){}
  el.cookieBannerOkBtn.addEventListener('click', function(){
    el.cookieBanner.hidden = true;
    try{ localStorage.setItem(COOKIE_NOTICE_KEY, '1'); }catch(e){}
  });
  // Resets `state` to exactly what `d` represents (a fresh game if `d` is
  // empty/null) -- used whenever the identity behind the save changes:
  // logging in, logging out, or switching accounts. Skipping this (as the
  // login/logout handlers used to) leaves whatever was already in memory
  // -- guest progress, or a *different* account's data -- sitting there
  // unchanged, and the very next autosave then writes it back out as if
  // it belonged to the new identity. Doesn't render or touch boss-ability
  // timers itself; callers differ on exactly when that should happen
  // (boot also runs offline-progress catch-up first, for one).
  function replaceStateWithSave(d){
    state = freshState();
    applyLoadedSave(d);
    if(!state.enemy || state.enemy.hp <= 0) state.enemy = makeEnemyData(currentLevel(), false);
    if(!state.enemy.isBoss){
      var freshMaxHp = Math.round(currentLevel().baseHp * villageScale());
      if(freshMaxHp !== state.enemy.maxHp){
        state.enemy.maxHp = freshMaxHp;
        state.enemy.hp = Math.min(state.enemy.hp, freshMaxHp);
      }
    }
    goldDisplayValue = state.gold;
    lastLevelRendered = -1;
  }
  el.tabSignIn.addEventListener('click', function(){ setAuthMode('signin'); });
  el.tabSignUp.addEventListener('click', function(){ setAuthMode('signup'); });
  el.authForm.addEventListener('submit', function(ev){
    ev.preventDefault();
    if(!backendReachable){
      el.authError.textContent = "Accounts need the game running via its own server (node server.js), not available in this preview.";
      return;
    }
    var username = el.authUsername.value.trim();
    var password = el.authPassword.value;
    el.authError.textContent = '';
    el.authSubmitBtn.disabled = true;
    var endpoint = authMode === 'signin' ? 'api/login' : 'api/signup';
    fetch(endpoint, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:username, password:password })
    }).then(function(r){ return r.json().then(function(d){ return { ok:r.ok, body:d }; }); })
      .then(function(res){
        if(!res.ok){
          el.authError.textContent = res.body.error || 'Something went wrong.';
          return;
        }
        refreshAccountUI(true, res.body.username);
        el.authUsername.value = ''; el.authPassword.value = '';
        if(authMode === 'signup'){
          // Brand-new account: seed it with whatever's been played so far
          // on this device instead of starting from a blank slate.
          save();
          setTimeout(loadLeaderboard, 400);
          toast('Account created. This device\'s progress is now saved to your account.');
        } else {
          loadLeaderboard();
          // Existing account: its own save is the source of truth, so pull
          // it down and replace whatever was showing locally -- even if
          // that account has no save yet (a fresh signup elsewhere, or an
          // empty {} back from the server), which must still reset to a
          // clean slate rather than silently keeping whatever this device
          // had shown a moment ago as a guest or a different account.
          // persistLoad() (not a raw fetch) so USE_SERVER actually flips to
          // true here too -- it was never previously updated by this path,
          // so saves kept quietly going to localStorage post-login until
          // the next full page reload noticed the real session.
          persistLoad().then(function(d){
            replaceStateWithSave(d);
            renderAll();
            toast('Welcome back, '+res.body.username+'!');
          });
        }
      })
      .catch(function(){
        backendReachable = false;
        el.authError.textContent = "Couldn't reach the server. Accounts don't work without the game running via node server.js.";
      })
      .finally(function(){ el.authSubmitBtn.disabled = false; });
  });
  el.logoutBtn.addEventListener('click', function(){
    fetch('api/logout', { method:'POST' }).then(function(){
      refreshAccountUI(false, null);
      loadLeaderboard();
      // Same reset as signing in: without it, the account's progress just
      // stayed in memory after logout and got written into this device's
      // guest save (localStorage) on the very next autosave, clobbering
      // whatever guest progress was actually there before. persistLoad()
      // now correctly sees no session and loads this browser's own local
      // save instead (and flips USE_SERVER to false in the process).
      return persistLoad().then(function(d){
        replaceStateWithSave(d);
        renderAll();
        toast('Signed out. Progress now saves to this device only.');
      });
    });
  });
  // First-time visitors (not signed in, and no local guest save yet) get
  // asked up front rather than silently defaulting to guest -- returning
  // guests and signed-in accounts both skip straight past this.
  checkAuthStatus().then(function(me){
    if(me && !me.loggedIn && !hadLocalSaveBeforeBoot) openAccount();
  });

  document.addEventListener('keydown', function(ev){
    if(ev.key === 'Escape'){ closeVillage(); closeBestiary(); closeAchievements(); closeAccount(); }
  });

  /* ---------------- Pop-out battle view ----------------
     Chromium's Document Picture-in-Picture API moves the actual
     .arena-content node into a small always-on-top window instead of
     just a video. We move the real node (not a clone), so every
     existing render function keeps working unchanged -- they don't
     care which document currently owns the element they're updating.
     Unsupported browsers (Firefox/Safari) just don't get the button.
  ---------------------------------------------- */
  var pipWindow = null;
  var pipPlaceholder = null;
  if(!('documentPictureInPicture' in window)){
    el.pipBtn.hidden = true;
  }
  function inIframe(){
    try { return window.top !== window; } catch(e) { return true; }
  }
  function openPip(){
    if(pipWindow || !('documentPictureInPicture' in window)) return;
    documentPictureInPicture.requestWindow({ width:280, height:380 }).then(function(win){
      pipWindow = win;
      document.querySelectorAll('link[rel="stylesheet"], style').forEach(function(node){
        pipWindow.document.head.appendChild(node.cloneNode(true));
      });
      pipWindow.document.body.className = 'pip-doc-root';
      pipWindow.document.body.style.display = 'flex';
      pipWindow.document.body.style.minHeight = '100vh';
      pipPlaceholder = document.createElement('div');
      pipPlaceholder.className = 'pip-placeholder';
      pipPlaceholder.innerHTML = '<p>The battle popped out into its own window.</p>';
      var backBtn = document.createElement('button');
      backBtn.type = 'button';
      backBtn.textContent = 'Bring it back';
      backBtn.addEventListener('click', closePip);
      pipPlaceholder.appendChild(backBtn);
      el.arenaContent.parentNode.insertBefore(pipPlaceholder, el.arenaContent);
      pipWindow.document.body.appendChild(el.arenaContent);
      pipWindow.addEventListener('pagehide', closePip);
    }).catch(function(){
      // Chrome silently rejects this inside an embedded preview/iframe
      // (an artifact viewer, this dev tool's own preview pane, etc.) since
      // Document Picture-in-Picture requires a top-level, unframed page.
      toast(inIframe()
        ? 'Pop-out isn\'t available in an embedded preview. Open the game in its own browser tab to use it.'
        : 'Pop-out is blocked by the browser right now.');
    });
  }
  function closePip(){
    if(!pipWindow) return;
    var win = pipWindow;
    pipWindow = null;
    if(pipPlaceholder && pipPlaceholder.parentNode){
      pipPlaceholder.parentNode.replaceChild(el.arenaContent, pipPlaceholder);
    }
    pipPlaceholder = null;
    try{ win.close(); }catch(e){}
  }
  el.pipBtn.addEventListener('click', function(){ pipWindow ? closePip() : openPip(); });
  el.challengeBtn.addEventListener('click', function(){ lastBossEnterAt = Date.now(); spawnEnemy(true); renderAll(); save(); });
  el.fleeBtn.addEventListener('click', fleeBoss);
  el.mathGateBox.addEventListener('submit', function(ev){
    ev.preventDefault();
    answerMathGate(el.mathGateInput.value);
    el.mathGateInput.value = '';
  });

  /* ---------------- Boot ---------------- */
  // Design-review switch: BESTIARY=true on the server reveals every
  // monster's lore/power regardless of what's actually been defeated.
  // Fails silently (stays false) on a server that doesn't expose this,
  // or on the Artifact build which has no server at all.
  fetch('api/config').then(function(r){ return r.json(); }).then(function(cfg){
    if(cfg && cfg.version){ el.versionTag.textContent = '· v'+cfg.version; }
    if(cfg && cfg.bestiaryShowAll){ bestiaryShowAll = true; renderBestiary(); }
    if(cfg && cfg.godMode){ godMode = true; }
    if(cfg && cfg.clickLogging){ loggingEnabled = true; }
    // AUTOUPGRADE=<username> on the server: only the matching logged-in
    // account gets a background loop that auto-buys everything it can
    // afford. Never a per-player toggle -- has to match a real session.
    if(cfg && cfg.autoUpgradeUser){
      checkAuthStatus().then(function(me){
        if(me && me.loggedIn && me.username === cfg.autoUpgradeUser){
          setInterval(autoUpgradeTick, 1500);
        }
      });
    }
  }).catch(function(){});
  renderAll(); // paint an immediate default frame while the save loads
  persistLoad().then(function(d){
    var isNewGame = !d || typeof d !== 'object' || !Object.keys(d).length;
    // replaceStateWithSave also covers the half-dead-enemy-on-load and
    // stale-HP-after-a-balance-change cases (see its own comment) -- boot
    // just adds offline-progress catch-up and the first-run story toast on
    // top, which only make sense for an actual page load, not a live
    // identity switch mid-session.
    replaceStateWithSave(d);
    var offline = runOfflineProgress();
    if(state.enemy.isBoss) startBossAbilities(state.enemy.bossAbilities, bossFightToken);
    renderAll();
    if(isNewGame){
      toast(STORY_INTRO, 5500);
    } else if(offline && offline.kills>0){
      toast('Welcome back! Away '+formatDuration(offline.seconds)+'. Felled '+offline.kills+' foes, gathered '+fmt(offline.gold)+'g.');
    }
    // not for a brand-new game -- there's nothing to have a "streak" of yet
    if(!isNewGame){
      var streak = checkDailyStreak();
      if(streak){
        toast('Day '+streak+' streak! +'+streak+' Gambling Token'+(streak===1?'':'s')+'.', 4500);
        renderAll();
      }
    }
    save();
  });

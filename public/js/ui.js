"use strict";

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
      toast('Signed out -- this account signed in somewhere else.', 4500);
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
      el.authError.textContent = "Accounts need the game running via its own server (node server.js) -- not available in this preview.";
      return { loggedIn:false };
    });
  }
  function loadLeaderboard(){
    fetch('api/leaderboard').then(function(r){ return r.json(); }).then(function(d){
      var rows = d.rows || [];
      if(!rows.length){
        el.leaderboardList.innerHTML = '<div class="leaderboard-empty">No one on the board yet -- Ascend at least once to appear here.</div>';
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
  el.accountOverlay.addEventListener('click', function(ev){
    if(ev.target === el.accountOverlay) closeAccount();
  });
  el.tabSignIn.addEventListener('click', function(){ setAuthMode('signin'); });
  el.tabSignUp.addEventListener('click', function(){ setAuthMode('signup'); });
  el.authForm.addEventListener('submit', function(ev){
    ev.preventDefault();
    if(!backendReachable){
      el.authError.textContent = "Accounts need the game running via its own server (node server.js) -- not available in this preview.";
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
          toast('Account created -- this device\'s progress is now saved to your account.');
        } else {
          loadLeaderboard();
          // Existing account: its own save is the source of truth, so pull
          // it down and replace whatever was showing locally.
          fetch('api/save').then(function(r){ return r.json(); }).then(function(d){
            if(d && Object.keys(d).length){
              applyLoadedSave(d);
              goldDisplayValue = state.gold;
              lastLevelRendered = -1;
              renderAll();
              toast('Welcome back, '+res.body.username+'!');
            }
          });
        }
      })
      .catch(function(){
        backendReachable = false;
        el.authError.textContent = "Couldn't reach the server -- accounts don't work without the game running via node server.js.";
      })
      .finally(function(){ el.authSubmitBtn.disabled = false; });
  });
  el.logoutBtn.addEventListener('click', function(){
    fetch('api/logout', { method:'POST' }).then(function(){
      refreshAccountUI(false, null);
      loadLeaderboard();
      toast('Signed out -- progress now saves to this device only.');
    });
  });
  checkAuthStatus();

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
        ? 'Pop-out isn\'t available in an embedded preview -- open the game in its own browser tab to use it.'
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
  el.challengeBtn.addEventListener('click', function(){ spawnEnemy(true); renderAll(); save(); });
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
    if(cfg && cfg.bestiaryShowAll){ bestiaryShowAll = true; renderBestiary(); }
    if(cfg && cfg.godMode){ godMode = true; }
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
    applyLoadedSave(d);
    if(!state.enemy) state.enemy = makeEnemyData(currentLevel(), false);
    var offline = runOfflineProgress();
    if(state.enemy.isBoss) startBossAbilities(state.enemy.bossAbilities, bossFightToken);
    goldDisplayValue = state.gold;
    renderAll();
    if(isNewGame){
      toast(STORY_INTRO, 5500);
    } else if(offline && offline.kills>0){
      toast('Welcome back! Away '+formatDuration(offline.seconds)+'. Felled '+offline.kills+' foes, gathered '+fmt(offline.gold)+'g.');
    }
    save();
  });

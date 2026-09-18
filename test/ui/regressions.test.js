"use strict";
// One test per real bug found and fixed this session -- these exist
// specifically so none of them can silently come back.
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, sleep } = require('../helpers/bootGame');

describe('death/respawn/save regressions', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  test('killing an enemy zeroes the HP bar immediately instead of leaving it frozen', () => {
    g.spawnEnemy(false);
    g.state.enemy.hp = g.state.enemy.maxHp; // a clean one-hit kill, not a chip-away
    g.dealDamage(g.state.enemy.maxHp, false);
    assert.equal(g.el.hpFill.style.width, '0%', 'the bar must show 0% the instant the kill lands, not the pre-death value');
    assert.equal(g.el.hpText.textContent, '0 / ' + g.fmt(g.state.enemy.hp <= 0 ? g.state.enemy.maxHp : g.state.enemy.maxHp));
  });

  test('a dead enemy loaded from a save is replaced with a live one at boot, not left as a zombie', async () => {
    // Simulate a save landing in the death/respawn gap: an enemy with
    // hp <= 0 is exactly what gets persisted if the tab is backgrounded or
    // closed in the ~0.5s between a kill and its delayed respawn.
    const payload = g.buildSavePayload();
    payload.enemy = { key: 'slime', name: 'Slime', hp: -40, maxHp: 100, goldReward: 5 };

    const dom2 = await bootGame({ presetSave: payload });
    try {
      const g2 = dom2.window.__game;
      assert.ok(g2.state.enemy.hp > 0, 'a half-dead loaded enemy must be replaced with a fresh, living one');
    } finally {
      dom2.window.close();
    }
  });

  test('a still-alive enemy loaded from a save gets its HP refreshed to the current balance, not left stale', async () => {
    // Unlike the dead-enemy case above, nothing else ever re-derives a
    // *live* enemy's stats -- so a realm HP/gold rebalance (or a Village-
    // scale coefficient change) left an already-spawned regular monster
    // showing whatever numbers were true when it spawned, indefinitely,
    // not just until its next kill. Reported live: a fresh realm-1 monster
    // still showing 4200 HP (the pre-rebalance flat-350x value) well after
    // the fix shipped, because the enemy already on screen predated it.
    const payload = g.buildSavePayload();
    payload.levelIndex = 0;
    payload.villageLevels = {};
    payload.enemy = { key: 'slime', name: 'Slime', isBoss: false, hp: 4200, maxHp: 4200, goldReward: 500 };

    const dom2 = await bootGame({ presetSave: payload });
    try {
      const g2 = dom2.window.__game;
      assert.equal(g2.state.enemy.key, 'slime', "the monster's identity must be preserved, only its numbers refreshed");
      assert.equal(g2.state.enemy.maxHp, g2.LEVELS[0].baseHp, "a stale live enemy's maxHp must be refreshed to the current realm baseHp");
      assert.ok(g2.state.enemy.hp <= g2.state.enemy.maxHp, 'hp must never be left exceeding the refreshed maxHp');
    } finally {
      dom2.window.close();
    }
  });

  test('a boss fight loaded from a save keeps its own HP untouched', async () => {
    // Bosses are deliberately left out of the refresh above -- mid-fight
    // ability state (shieldUntil, curseActive, hydra wave progress, ...)
    // isn't safe to silently recompute around, and a boss fight in
    // progress is a much shorter-lived scenario than a regular monster
    // just sitting on screen across a content update.
    const payload = g.buildSavePayload();
    payload.levelIndex = 0;
    payload.villageLevels = {};
    payload.enemy = { key: 'ent', name: 'Elder Ent', isBoss: true, hp: 4200, maxHp: 4200, goldReward: 500 };

    const dom2 = await bootGame({ presetSave: payload });
    try {
      const g2 = dom2.window.__game;
      assert.equal(g2.state.enemy.key, 'ent', 'a boss fight in progress must not be swapped out for a different enemy');
      assert.equal(g2.state.enemy.maxHp, 4200, 'a boss fight in progress must not have its HP silently rewritten');
    } finally {
      dom2.window.close();
    }
  });

  test('a floater is removed by its timer fallback even if animationend never fires', async () => {
    const dom3 = await bootGame();
    try {
      const g3 = dom3.window.__game;
      // jsdom has no real CSS animation engine, so animationend never
      // fires here regardless -- this exercises exactly the fallback path
      // that prefers-reduced-motion (animation:none) relies on in a real
      // browser. REDUCED_MOTION is false in this environment (no
      // matchMedia), so spawnFloater's fallback timer is 1000ms.
      const before = dom3.window.document.querySelectorAll('.floater').length;
      g3.spawnFloater('-5', '');
      assert.equal(dom3.window.document.querySelectorAll('.floater').length, before + 1);
      await sleep(1150);
      assert.equal(
        dom3.window.document.querySelectorAll('.floater').length, before,
        'a floater must clean itself up via the timer fallback even with no animationend event'
      );
    } finally {
      dom3.window.close();
    }
  });

  test('a Challenge click during a pending regular-kill respawn is not silently reverted', () => {
    // Reproduces the exact race: kill a regular monster (schedules a
    // respawn 420ms out), then challenge the boss before that timer fires.
    // The stale timer must not overwrite the boss fight it finds in
    // progress -- see the bossFightToken guard in killEnemy().
    g.spawnEnemy(false);
    while (g.state.enemy.isBoss) g.spawnEnemy(false);
    g.dealDamage(g.state.enemy.maxHp, false); // schedules the 420ms respawn
    g.spawnEnemy(true); // Challenge, immediately after
    assert.ok(g.state.enemy.isBoss, 'challenging right after a kill should land on the boss');
    const bossKey = g.state.enemy.key;
    // the stale regular-kill respawn would fire around here if unguarded
    return sleep(500).then(() => {
      assert.equal(g.state.enemy.key, bossKey, 'the boss fight must still be in progress once the stale timer would have fired');
      assert.ok(g.state.enemy.isBoss, 'a stale respawn must not have quietly swapped the boss back out for a regular monster');
    });
  });

  test('a Flee click landing right after Challenge is ignored, but a deliberate Flee later works', () => {
    // Flee sits in the exact screen spot Challenge just occupied (one
    // button hides as the other appears in the same slot) -- a double
    // click, or a second tap while the first was still landing, could hit
    // Challenge then immediately hit Flee, bouncing the player right back
    // out of the fight they just picked. See lastBossEnterAt in combat.js.
    g.spawnEnemy(true);
    assert.ok(g.state.enemy.isBoss);
    g.lastBossEnterAt = Date.now();
    g.fleeBoss();
    assert.ok(g.state.enemy.isBoss, 'a Flee click landing right after Challenge must be ignored');

    g.lastBossEnterAt = Date.now() - 1000; // grace period has elapsed
    g.fleeBoss();
    assert.ok(!g.state.enemy.isBoss, 'a deliberate Flee after the grace period should still work');
  });
});

describe('shop/village re-render stability', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  test('an upgrade buy button keeps the same DOM node across repeated renderAll() calls', () => {
    // Reproduces the click-loss bug: renderShop() used to rebuild every
    // button from scratch (innerHTML = '') on every renderAll(), which
    // fires on every kill. A click's mousedown/mouseup straddling one of
    // those rebuilds landed on a button that no longer existed, so the
    // click silently never fired. Node identity must survive as long as
    // the upgrade set and maxed-state don't change.
    const before_ = g.el.shopList.querySelector('.upgrade .buy:not(.buy-max)');
    assert.ok(before_, 'expected at least one unlocked, unmaxed upgrade to render a buy button');
    for (let i = 0; i < 5; i++) g.renderAll();
    const after_ = g.el.shopList.querySelector('.upgrade .buy:not(.buy-max)');
    assert.equal(after_, before_, 'the buy button node must be the same object after repeated re-renders');
  });

  test('a village building buy button keeps the same DOM node across repeated renderAll() calls', () => {
    const before_ = g.el.villageList.querySelector('.upgrade .buy:not(.buy-max)');
    assert.ok(before_, 'expected at least one village building to render a buy button');
    for (let i = 0; i < 5; i++) g.renderAll();
    const after_ = g.el.villageList.querySelector('.upgrade .buy:not(.buy-max)');
    assert.equal(after_, before_, 'the village buy button node must be the same object after repeated re-renders');
  });

  test('a click on the Max button still fires after renderAll() has run in between', () => {
    const maxBtn = g.el.shopList.querySelector('.upgrade .buy-max');
    assert.ok(maxBtn, 'expected an unmaxed upgrade with a Max button');
    g.renderAll(); // simulate a re-render landing between mousedown and click
    let fired = false;
    maxBtn.addEventListener('click', () => { fired = true; }, { once: true });
    maxBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    assert.ok(fired, 'the Max button must still be a live, listening element after a re-render');
  });
});

describe('ascend', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  test('is disabled until the dragon is beaten enough times, and until there is gold to convert', () => {
    g.state.dragonKills = 0;
    g.state.totalGoldRun = 999999;
    assert.equal(g.finalBeaten, false);

    g.state.dragonKills = g.DRAGON_KILLS_TO_UNLOCK_ASCEND;
    g.state.totalGoldRun = 0;
    g.applyLoadedSave(g.buildSavePayload()); // recompute finalBeaten the same way boot does
    assert.equal(g.finalBeaten, true);
    assert.equal(g.blessingGain(), 0, 'zero run gold should mean zero blessings on offer');
  });

  test('carries Village levels, achievements, and login streak across the reset; resets run gold', () => {
    g.state.dragonKills = g.DRAGON_KILLS_TO_UNLOCK_ASCEND;
    g.applyLoadedSave(g.buildSavePayload());
    g.state.totalGoldRun = 4500 * 25; // gain = 5
    g.state.villageLevels.watchtower = 3;
    g.state.loginStreak = 4;
    g.state.blessings = 10;

    g.ascend();

    assert.equal(g.state.blessings, 15, 'blessings should be old total plus the computed gain');
    assert.equal(g.state.totalGoldRun, 0, 'ascending starts a fresh run');
    assert.equal(g.state.villageLevels.watchtower, 3, 'Village levels must survive Ascend');
    assert.equal(g.state.loginStreak, 4, 'the login streak must survive Ascend too');
  });
});

describe('bestiary/achievements lazy rendering', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  test('renderAll() never builds the Bestiary/Achievements grids -- only opening the panel does', () => {
    // Each traced monster's sprite can run well over a thousand individual
    // <rect> elements once quantized from real reference art. Building all
    // ~87 of those into the DOM on every renderAll() (every single kill)
    // put a quarter million <rect> nodes into the page whether or not the
    // player ever opened the Bestiary -- and a document that heavy made
    // every other layout-touching operation slower too, which is what
    // turned into "clicks feel delayed" and "health drains after I stop
    // clicking" reports. renderAll() must only keep the cheap found/total
    // counters live; the actual tiles are built lazily on open.
    g.renderAll();
    assert.equal(g.el.bestiaryGrid.children.length, 0, 'renderAll() must not build Bestiary tiles');
    assert.equal(g.el.achvGrid.children.length, 0, 'renderAll() must not build Achievement tiles');
    assert.equal(g.el.bestiaryCount.textContent, String(g.bestiaryKeys().filter(k => g.state.defeated[k]).length),
      'the found-count must still stay live without the grid being built');

    g.renderBestiary();
    assert.equal(g.el.bestiaryGrid.children.length, g.bestiaryKeys().length, 'opening the panel must build every tile');

    g.renderAchievements();
    assert.equal(g.el.achvGrid.children.length, g.ACHIEVEMENTS.length, 'opening the panel must build every achievement tile');

    // Once built, a later renderAll() must not tear the grid back down --
    // only rebuild-on-open, never destroy-on-close.
    g.renderAll();
    assert.equal(g.el.bestiaryGrid.children.length, g.bestiaryKeys().length, 'an already-open Bestiary must not get cleared by a background renderAll()');
  });

  test('Bestiary tiles render sprites as a single cached image, not hundreds of inline SVG rects', () => {
    // Building the grid only on open (rather than on every renderAll())
    // fixed the constant-rebuild version of the DOM-bloat bug, but the grid
    // is deliberately never torn back down (see the comment above), so a
    // single visit to the Bestiary still left ~87 monsters' worth of inline
    // SVG -- each easily 1000-2000+ <rect> elements once quantized from
    // real reference art -- sitting in the page for the rest of the
    // session. That's a quarter-million-plus nodes from one click, which is
    // exactly the same class of slowdown reported as "lags after opening
    // the Bestiary". Sprites must rasterize to a single cached <img> per
    // tile instead, however detailed the source art is.
    g.renderBestiary();
    assert.equal(g.el.bestiaryGrid.querySelectorAll('rect').length, 0, 'Bestiary tiles must not contain inline SVG rects');
    assert.equal(g.el.bestiaryGrid.querySelectorAll('.bestiary-sprite img').length, g.bestiaryKeys().length,
      'every tile must render its sprite as a single cached <img> instead');
  });

  test('the HP bar has no width transition, so it cannot lag behind rapid clicks', () => {
    // A CSS transition on .hp-fill's width meant every hit re-targeted an
    // in-flight 180ms animation before it finished, so clicking faster
    // than that kept the bar visibly behind the true HP and left it still
    // draining for a moment after the player stopped -- reported as
    // "health goes down after we stop clicking". jsdom doesn't run real
    // CSS (and can't parse the <link>-loaded stylesheet anyway), so this
    // checks the source file's rule text directly.
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'style.css'), 'utf8');
    const hpFillRule = css.match(/\.hp-fill\{[^}]*\}/)[0];
    assert.ok(!/transition\s*:[^;}]*width/.test(hpFillRule), '.hp-fill must not transition its width property');
  });
});

describe('guest/account gating', () => {
  test('a first-time guest (no local save yet, not logged in) is prompted to sign in or continue as guest', async () => {
    const dom = await bootGame();
    try {
      const g = dom.window.__game;
      assert.equal(g.hadLocalSaveBeforeBoot, false);
      assert.ok(g.el.accountOverlay.classList.contains('show'), 'a first-time visitor should see the sign-in-or-guest prompt');
    } finally {
      dom.window.close();
    }
  });

  test('a returning guest (already has a local save) is not prompted again', async () => {
    // hadLocalSaveBeforeBoot has to be captured synchronously, before
    // anything in boot (persistLoad, checkDailyStreak, the periodic
    // autosave) gets a chance to write its own save and make a brand-new
    // guest look like a returning one by the time the check runs.
    const dom = await bootGame({ presetSave: { gold: 5, levelIndex: 0 } });
    try {
      const g = dom.window.__game;
      assert.equal(g.hadLocalSaveBeforeBoot, true);
      assert.ok(!g.el.accountOverlay.classList.contains('show'), 'a returning guest should not see the prompt again');
    } finally {
      dom.window.close();
    }
  });

  test('the cookie banner actually disappears when dismissed, not just its hidden property', () => {
    // .cookie-banner's own unconditional display:flex silently beat the
    // browser's default [hidden]{display:none} rule -- el.hidden = true
    // took effect on the property/DOM level (confirmed live) but the
    // banner stayed visually on screen, because nothing in the CSS ever
    // said what [hidden] should actually look like once that rule lost.
    // jsdom doesn't run real CSS, so this checks the source text directly,
    // same approach as the .hp-fill transition check above.
    const fs = require('fs');
    const path = require('path');
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'public', 'style.css'), 'utf8');
    assert.ok(/\.cookie-banner\[hidden\]\s*\{[^}]*display\s*:\s*none/.test(css),
      '.cookie-banner needs an explicit [hidden] rule, or its own display:flex always wins');
  });
});

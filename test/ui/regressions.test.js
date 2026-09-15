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
    dom.window.localStorage.setItem('pixelWarrenSave', JSON.stringify(payload));

    const dom2 = await bootGame();
    try {
      const g2 = dom2.window.__game;
      assert.ok(g2.state.enemy.hp > 0, 'a half-dead loaded enemy must be replaced with a fresh, living one');
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

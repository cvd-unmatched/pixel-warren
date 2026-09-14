"use strict";
// Pure-calculation unit tests: no clicking, no DOM assertions, just "does
// the math the game relies on come out right." Ability math especially --
// it's easy to get a sign or an order-of-operations wrong in dealDamage's
// modifier pipeline and not notice until a real fight behaves oddly.
//
// One shared boot for the whole file (not one per test): booting is the
// slow part (jsdom parsing the real index.html + ~770KB of real game
// script), and these tests don't need isolation from each other since each
// one calls spawnEnemy(true) itself before asserting.
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame } = require('../helpers/bootGame');

describe('damage-modifier formulas', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  // A fresh, flag-free enemy before every test -- otherwise a survivor from
  // the previous test drags its ability flags (shieldUntil, weakpointUntil,
  // ...) along and silently stacks with whatever the next test sets.
  beforeEach(() => { g.spawnEnemy(true); });

  test('blessingGain scales as sqrt(totalGoldRun / 4500), floored', () => {
    g.state.totalGoldRun = 0;
    assert.equal(g.blessingGain(), 0);
    g.state.totalGoldRun = 4500; // sqrt(1) = 1
    assert.equal(g.blessingGain(), 1);
    g.state.totalGoldRun = 4500 * 100; // sqrt(100) = 10
    assert.equal(g.blessingGain(), 10);
    g.state.totalGoldRun = 4499; // just under the next threshold
    assert.equal(g.blessingGain(), 0);
  });

  test('enrage suppresses crit styling without changing the damage amount', () => {
    g.triggerEnrage({ duration: 30000 });
    const before_ = g.state.enemy.hp;
    g.dealDamage(10, true);
    assert.equal(before_ - g.state.enemy.hp, 10, 'enrage must not change the damage amount, only crit styling');
    const floaters = Array.from(dom.window.document.querySelectorAll('.floater'));
    const last = floaters[floaters.length - 1];
    assert.ok(!last.className.includes('crit'), 'a crit hit during enrage should not render as a crit');
  });

  test('frostbite reduces damage by a flat amount, never below zero', () => {
    g.state.enemy.frostUntil = Date.now() + 30000;
    g.state.enemy.frostReduction = 100;
    const before1 = g.state.enemy.hp;
    g.dealDamage(30, false); // less than the flat reduction
    assert.equal(before1 - g.state.enemy.hp, 0, 'damage below the flat reduction should deal zero, not negative healing');
    const before2 = g.state.enemy.hp;
    g.dealDamage(150, false);
    assert.equal(before2 - g.state.enemy.hp, 50, '150 damage minus a flat 100 reduction should land 50');
  });

  test('weakpoint multiplies damage', () => {
    g.state.enemy.weakpointUntil = Date.now() + 30000;
    g.state.enemy.weakpointMult = 3;
    const before_ = g.state.enemy.hp;
    g.dealDamage(20, false);
    assert.equal(before_ - g.state.enemy.hp, 60, '20 damage at a 3x weakpoint multiplier should land 60');
  });

  test('gamble lands either double or half the base damage', () => {
    for (let i = 0; i < 20; i++) {
      // force a genuinely clean enemy every iteration -- reusing a survivor
      // from an earlier test (or an earlier loop iteration) would drag its
      // leftover ability flags (e.g. the previous test's weakpointUntil)
      // along, stacking modifiers this test never asked for
      g.spawnEnemy(true);
      g.state.enemy.gambleUntil = Date.now() + 30000;
      const before_ = g.state.enemy.hp;
      g.dealDamage(10, false);
      const dealt = before_ - g.state.enemy.hp;
      assert.ok(dealt === 20 || dealt === 5, 'a gamble hit must land as either double (20) or half (5) of 10, got ' + dealt);
    }
  });

  test('shield reduction is percentage-based', () => {
    g.triggerShield({ duration: 30000, reduction: 0.5 });
    const before_ = g.state.enemy.hp;
    g.dealDamage(100, false);
    assert.equal(before_ - g.state.enemy.hp, 50, '100 damage at 50% shield reduction should land 50');
  });
});

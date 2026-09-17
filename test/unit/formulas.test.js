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

  test('enrage strips the crit multiplier back out, actually reducing damage, not just hiding crit styling', () => {
    // onStageClick/the auto-DPS tick both bake the crit multiplier into
    // `amount` themselves before dealDamage ever sees it, so this simulates
    // a real crit hit the same way: base 10 damage, already multiplied.
    // Previously enrage only flipped isCrit for the floater's CSS class
    // *after* that multiplied amount was fixed, so the "no clean hits will
    // land" boss was actually landing full, un-nerfed crits the entire
    // time -- see combat.js's dealDamage.
    g.triggerEnrage({ duration: 30000 });
    const before_ = g.state.enemy.hp;
    g.dealDamage(10 * g.critMultVal(), true);
    assert.equal(before_ - g.state.enemy.hp, 10, 'enrage should undo the crit multiplier, landing the plain base amount');
    const floaters = Array.from(dom.window.document.querySelectorAll('.floater'));
    const last = floaters[floaters.length - 1];
    assert.ok(!last.className.includes('crit'), 'a crit hit during enrage should not render as a crit');
  });

  test('enrage leaves a non-crit hit completely alone', () => {
    g.triggerEnrage({ duration: 30000 });
    const before_ = g.state.enemy.hp;
    g.dealDamage(10, false);
    assert.equal(before_ - g.state.enemy.hp, 10, 'enrage only targets crits -- an ordinary hit must land unchanged');
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

  test('a gamble hit\'s floater visibly says which way the coin flip landed', () => {
    // Previously a doubled and a halved hit rendered as an identical plain
    // number -- with the coin re-flipped independently on every single hit
    // (clicks and auto-DPS ticks alike) during the window, the player just
    // saw a scatter of unexplained big/small numbers with no way to tell a
    // win from a loss. See combat.js's dealDamage.
    g.state.enemy.gambleUntil = Date.now() + 30000;
    g.dealDamage(10, false);
    const floaters = Array.from(dom.window.document.querySelectorAll('.floater'));
    const last = floaters[floaters.length - 1];
    const wonHigh = last.className.includes('gamble-high');
    const wonLow = last.className.includes('gamble-low');
    assert.ok(wonHigh || wonLow, 'the floater must carry a gamble-high or gamble-low class');
    assert.ok(!(wonHigh && wonLow), 'a single hit cannot be both outcomes');
    assert.ok(last.textContent.includes(wonHigh ? 'x2' : 'x0.5'), 'the floater text itself must say the multiplier, not rely on color alone');
  });

  test('shield reduction is percentage-based', () => {
    g.triggerShield({ duration: 30000, reduction: 0.5 });
    const before_ = g.state.enemy.hp;
    g.dealDamage(100, false);
    assert.equal(before_ - g.state.enemy.hp, 50, '100 damage at 50% shield reduction should land 50');
  });

  test('dealDamage returns the overkill amount on a kill, 0 otherwise', () => {
    g.state.enemy.hp = 100; g.state.enemy.maxHp = 100;
    assert.equal(g.dealDamage(40, false), 0, 'a non-lethal hit has no overkill');
    assert.equal(g.dealDamage(1000, false), 940, '60 hp remained, so a 1000-damage hit should overkill by 940');
  });
});

describe('overkill bonus (progression from excess damage)', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  beforeEach(() => { g.spawnEnemy(false); while (g.state.enemy.isBoss) g.spawnEnemy(false); });

  test('excess damage past a kill converts into extra kills against the same level pool', () => {
    var e = g.state.enemy;
    e.maxHp = 100; e.hp = 100;
    var killsBefore = g.state.totalKills, goldBefore = g.state.gold;
    g.applyOverkillBonus(550); // one kill's worth already happened elsewhere; this is the leftover
    assert.equal(g.state.totalKills, killsBefore + 5, '550 excess hp at 100 maxHp each should award 5 bonus kills');
    assert.ok(g.state.gold > goldBefore, 'bonus kills must pay out gold same as a normal kill');
  });

  test('the bonus is capped so one hit cannot clear an entire realm at once', () => {
    var e = g.state.enemy;
    e.maxHp = 10; e.hp = 10;
    var killsBefore = g.state.totalKills;
    g.applyOverkillBonus(100000); // absurd overkill relative to a 10-hp enemy
    assert.equal(g.state.totalKills, killsBefore + 30, 'bonus kills must be capped, not unbounded');
  });

  test('bosses never grant the overkill bonus', () => {
    g.spawnEnemy(true);
    var e = g.state.enemy;
    e.maxHp = 100; e.hp = 100;
    var killsBefore = g.state.totalKills;
    g.applyOverkillBonus(5000);
    assert.equal(g.state.totalKills, killsBefore, 'a boss kill must stay a one-at-a-time fight, no bonus chain');
  });

  test('zero or missing overkill is a no-op', () => {
    var killsBefore = g.state.totalKills;
    g.applyOverkillBonus(0);
    g.applyOverkillBonus(undefined);
    assert.equal(g.state.totalKills, killsBefore);
  });
});

"use strict";
// Prestige Perks: one-time, Blessing-bought unlocks that survive Ascend the
// same way Village levels do, but change a rule of the run instead of
// adding another stacking percentage. One test per perk's actual mechanical
// hook, plus the generic buy/persist plumbing they all share.
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, sleep } = require('../helpers/bootGame');

describe('Prestige Perks', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  beforeEach(() => {
    g.state.perks = {};
    g.state.ascendCount = 0;
    g.state.blessings = 0;
    g.spawnEnemy(true);
  });

  test('buyPerk spends Blessings exactly once, refuses without enough, and refuses a second purchase', () => {
    const p = g.PERKS[0];
    g.state.blessings = p.cost - 1;
    g.buyPerk(p);
    assert.equal(g.hasPerk(p.id), false, 'must not unlock without enough Blessings');
    assert.equal(g.state.blessings, p.cost - 1, 'a failed purchase must not spend anything');

    g.state.blessings = p.cost;
    g.buyPerk(p);
    assert.equal(g.hasPerk(p.id), true);
    assert.equal(g.state.blessings, 0);

    g.state.blessings = 1000;
    g.buyPerk(p);
    assert.equal(g.state.blessings, 1000, 'an already-owned perk must not charge again');
  });

  test('perks and the Ascend counter survive Ascend, the same as Village levels', () => {
    g.state.perks.twinStrike = true;
    g.state.dragonKills = g.DRAGON_KILLS_TO_UNLOCK_ASCEND;
    g.state.totalGoldRun = 4500; // exactly 1 blessing
    g.applyLoadedSave(g.buildSavePayload()); // recompute finalBeaten the way boot does
    g.ascend();
    assert.equal(g.hasPerk('twinStrike'), true, 'a purchased perk must survive Ascend');
    assert.equal(g.state.ascendCount, 1, 'the Ascend counter must increment');

    g.state.dragonKills = g.DRAGON_KILLS_TO_UNLOCK_ASCEND;
    g.state.totalGoldRun = 4500;
    g.applyLoadedSave(g.buildSavePayload());
    g.ascend();
    assert.equal(g.state.ascendCount, 2, 'the counter must keep counting across repeated Ascends');
  });

  test('Ascendant Momentum scales click/auto/gold with Ascend count, and does nothing unowned', () => {
    g.state.upgradeLevels.dps = 1; // dpsValue is flat 0 with no upgrades at all -- give it something to scale
    g.state.ascendCount = 10;
    assert.equal(g.momentumMult(), 1, 'the bonus must not apply before the perk is bought');
    const baseClick = g.clickDamage();
    const baseDps = g.dpsValue();

    g.state.perks.ascendantMomentum = true;
    assert.equal(g.momentumMult(), 1.2, '+2% per Ascend: 10 Ascends should be a 1.2x multiplier');
    assert.ok(Math.abs(g.clickDamage() - baseClick*1.2) < 1e-9, 'click damage should scale by the same multiplier');
    assert.ok(Math.abs(g.dpsValue() - baseDps*1.2) < 1e-9, 'auto damage should scale by the same multiplier');

    g.state.ascendCount = 200; // far past the cap
    assert.equal(g.momentumMult(), 2, 'the bonus must cap at +100% (2x) no matter how many Ascends past the cap');
  });

  test("Elder's Wisdom softens Village cost growth, floored at half the original rate", () => {
    const b = g.VILLAGE[0];
    g.state.villageLevels[b.id] = 5;
    const baseCost = g.villageCost(b);

    g.state.perks.eldersWisdom = true;
    g.state.ascendCount = 0;
    assert.equal(g.villageCost(b), baseCost, 'at 0 Ascends the perk should not have softened anything yet');

    g.state.ascendCount = 30; // 30% softening: costMult-1 shrinks to 70% of its original
    const softened = 1 + (b.costMult - 1) * 0.7;
    const expected = Math.round(b.baseCost * Math.pow(softened, 5));
    assert.equal(g.villageCost(b), expected);

    g.state.ascendCount = 500; // far past the floor
    const floored = 1 + (b.costMult - 1) * 0.5;
    const expectedFloored = Math.round(b.baseCost * Math.pow(floored, 5));
    assert.equal(g.villageCost(b), expectedFloored, 'growth-rate softening must floor at half the original rate');
  });

  test("Warren's Bounty gives boss kills a chance at a second Chase Token", () => {
    g.state.perks.warrensBounty = true;
    let sawBonus = false;
    for (let i = 0; i < 80 && !sawBonus; i++) {
      g.spawnEnemy(true);
      g.state.chaseTokens = 0;
      g.dealDamage(g.state.enemy.maxHp, false); // one-shot the boss
      if (g.state.chaseTokens >= 2) sawBonus = true;
    }
    assert.ok(sawBonus, 'across 80 boss kills at a 10% bonus chance, at least one should have dropped a second token');
  });

  test('Twin Strike gives clicks a real chance to land a second, independent hit', async () => {
    // onStageClick (not dealDamage) is where Twin Strike lives, so this
    // drives real clicks through the actual throttle -- MIN_CLICK_INTERVAL_MS
    // is well under 15ms, so spacing calls by that much keeps every one of
    // them a "landed" click rather than a dropped one.
    g.state.perks.twinStrike = true;
    g.state.enemy.maxHp = 1e9;
    g.state.enemy.hp = 1e9;
    let doubles = 0;
    const trials = 60;
    for (let i = 0; i < trials; i++) {
      g.el.floaters.innerHTML = '';
      g.onStageClick({ isTrusted: true });
      if (g.el.floaters.children.length === 2) doubles++;
      await sleep(15);
    }
    assert.ok(doubles > 0, 'across 60 clicks at a 15% proc chance, at least one double-hit should have landed');
    assert.ok(doubles < trials, 'not every click should double-hit');
  });
});

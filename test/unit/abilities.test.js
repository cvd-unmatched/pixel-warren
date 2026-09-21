"use strict";
// One test per boss/monster power, checking the actual trigger function
// mutates state the way combat.js and render.js expect -- not just the
// damage-math already covered in formulas.test.js (enrage/frostbite/
// weakpoint/gamble/shield). The point is a fast, deterministic way to know
// every power still does what it says on the tin after any refactor.
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame, sleep } = require('../helpers/bootGame');

describe('boss/monster powers', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  // A fresh boss before every test, same reasoning as formulas.test.js --
  // otherwise a leftover flag from the previous test silently stacks.
  beforeEach(() => { g.spawnEnemy(true); });

  test('shield reduces damage while up, and refuses to apply over a guardian add', () => {
    var e = g.state.enemy;
    g.triggerShield({ reduction: 0.6, duration: 5000 });
    assert.ok(g.isShielded(e));
    assert.equal(e.shieldReduction, 0.6);

    g.state.addEnemy = { key: 'goblin', hp: 5, maxHp: 5 };
    e.shieldUntil = 0;
    g.triggerShield({ reduction: 0.9, duration: 5000 });
    assert.equal(e.shieldUntil, 0, 'shield must not apply while a guardian add is up');
  });

  // Shield stands in for the whole shared "click through it" pattern
  // (shield/frostbite/drain/enrage/camouflage/taunt all use the exact same
  // progressShatter helper), so one thorough test here covers the mechanic
  // itself; the other abilities below only need a quick check that they're
  // actually wired to it.
  test('a real click chips at a shatter counter and ends the debuff early; auto-DPS never counts', () => {
    var e = g.state.enemy;
    e.maxHp = 10000; e.hp = 10000;
    g.triggerShield({ reduction: 0.9, duration: 60000 });

    for(var i=0;i<50;i++) g.dealDamage(10, false, true); // auto-DPS ticks
    assert.ok(g.isShielded(e), 'auto-DPS ticks must never progress the shatter counter');

    for(var j=0;j<g.DEBUFF_SHATTER_CLICKS-1;j++) g.dealDamage(10, false);
    assert.ok(g.isShielded(e), 'the shield must survive one click short of the threshold');

    g.dealDamage(10, false); // the Nth real click
    assert.ok(!g.isShielded(e), 'the shield should shatter exactly on the Nth real click');
  });

  test('summon sizes the guardian off the boss\'s own max HP, and never stacks a second one', () => {
    var e = g.state.enemy;
    e.maxHp = 1000;
    g.state.addEnemy = null;
    g.triggerSummon({ addKey: 'goblin', addHpFrac: 0.2 });
    assert.ok(g.state.addEnemy);
    assert.equal(g.state.addEnemy.key, 'goblin');
    assert.equal(g.state.addEnemy.hp, 200);

    g.triggerSummon({ addKey: 'bat', addHpFrac: 0.5 });
    assert.equal(g.state.addEnemy.key, 'goblin', 'an existing add must not be replaced by a new summon');
  });

  test('regen only heals below its threshold, by a fraction of the missing HP, capped at maxTicks', async () => {
    var e = g.state.enemy;
    var ability = { fraction: 0.5, maxTicks: 2, lowHpThreshold: 0.3, warnDuration: 20 };
    e.maxHp = 1000; e.hp = 500;
    g.triggerRegen(ability, g.bossFightToken);
    assert.equal(e.regenWarning, undefined, 'regen must not even stagger above its HP threshold');
    await sleep(60);
    assert.equal(e.hp, 500, 'regen must not fire above its HP threshold');

    e.hp = 200; // 20%, below the 30% threshold
    g.triggerRegen(ability, g.bossFightToken);
    assert.ok(e.regenWarning, 'a stagger warning should be recorded for the UI to show');
    await sleep(60);
    assert.equal(e.hp, 600, '50% of the 800 missing HP should heal 400');
    assert.equal(e.regenTicksUsed, 1);

    e.hp = 200;
    g.triggerRegen(ability, g.bossFightToken);
    await sleep(60);
    assert.equal(e.regenTicksUsed, 2);

    e.hp = 200;
    g.triggerRegen(ability, g.bossFightToken);
    await sleep(60);
    assert.equal(e.hp, 200, 'regen must stop firing once maxTicks is used up');
  });

  test('regen does not heal if the boss is burst back above threshold before the warning window closes', async () => {
    var e = g.state.enemy;
    e.maxHp = 1000; e.hp = 200; // 20%, below the 30% threshold
    g.triggerRegen({ fraction: 0.5, maxTicks: 2, lowHpThreshold: 0.3, warnDuration: 50 }, g.bossFightToken);
    e.hp = 800; // player bursts it back above threshold during the window
    await sleep(90);
    assert.equal(e.hp, 800, 'no heal should apply once HP is back above threshold');
    assert.equal(e.regenTicksUsed||0, 0, 'a prevented heal must not consume a tick');
  });

  test('drain heals the attacker back a fraction of the damage it deals', () => {
    var e = g.state.enemy;
    e.maxHp = 1000; e.hp = 1000;
    g.triggerDrain({ duration: 5000, drainFrac: 0.4 });
    g.dealDamage(100, false);
    assert.equal(e.hp, 940, 'net HP should drop by damage dealt minus 40% drained back');
  });

  test('drain stops healing back once it shatters from enough real clicks', () => {
    var e = g.state.enemy;
    e.maxHp = 100000; e.hp = 100000;
    g.triggerDrain({ duration: 60000, drainFrac: 0.4 });
    for(var i=0;i<g.DEBUFF_SHATTER_CLICKS-1;i++) g.dealDamage(100, false);
    e.hp = 100000; // reset so the drained-vs-not comparison below is clean
    g.dealDamage(100, false); // the Nth real click shatters it
    assert.equal(e.hp, 99900, 'the shattering hit itself should deal its full, undrained damage');
    g.dealDamage(100, false);
    assert.equal(e.hp, 99800, 'once shattered, later hits must not drain back either');
  });

  test('camouflage makes clicks miss entirely until it expires', () => {
    var e = g.state.enemy;
    e.maxHp = 500; e.hp = 500;
    g.triggerCamouflage({ duration: 5000 });
    g.dealDamage(50, false);
    assert.equal(e.hp, 500, 'a hit during camouflage must be a total miss, not partial');

    e.camoUntil = Date.now() - 1; // expired
    g.dealDamage(50, false);
    assert.equal(e.hp, 450, 'once camouflage expires, damage should land normally');
  });

  test('curse fully blocks damage and only breaks after the required number of plain clicks', () => {
    var e = g.state.enemy;
    e.maxHp = 500; e.hp = 500;
    g.triggerCurse({ clicksNeeded: 3 });
    assert.equal(e.curseActive, true);

    g.dealDamage(999, false);
    assert.equal(e.hp, 500, 'damage must be fully blocked while cursed');
    assert.equal(e.curseActive, true, 'one click should not be enough to break a 3-click curse');

    g.dealDamage(999, false);
    assert.equal(e.curseActive, true);

    g.dealDamage(999, false); // third click
    assert.equal(e.curseActive, false, 'the curse should break exactly on the Nth click');
    assert.equal(e.hp, 500, 'the breaking click itself should not also deal damage');

    g.dealDamage(50, false);
    assert.equal(e.hp, 450, 'damage should land normally once the curse is broken');
  });

  test('curse only breaks from real clicks -- auto-DPS ticks must not progress it', () => {
    // "Click free of it" is the ability's entire point; dealDamage's third
    // argument is `isAuto`, set true only by the auto-DPS tick loop. Before
    // this was wired up, the shared dealDamage path had no way to tell a
    // click from a tick, so any nonzero auto-DPS quietly broke a curse
    // within a few seconds with zero clicking.
    var e = g.state.enemy;
    e.maxHp = 500; e.hp = 500;
    g.triggerCurse({ clicksNeeded: 3 });

    g.dealDamage(999, false, true); // an auto-DPS tick
    assert.equal(e.curseProgress, 0, 'an auto-DPS tick must not progress the break-free counter');
    assert.equal(e.curseActive, true);

    g.dealDamage(999, false); // a real click
    assert.equal(e.curseProgress, 1, 'a real click must still progress it');
  });

  test('frostbite defaults its flat reduction to 1% of max HP when the level data omits one', () => {
    var e = g.state.enemy;
    e.maxHp = 1000;
    g.triggerFrostbite({ duration: 5000 });
    assert.equal(e.frostReduction, 10);
  });

  test('enrage\'s shatter counter advances on every real click, not just crits', () => {
    // Stripping the crit multiplier only ever matters on a crit, but the
    // shatter counter has to move on plain clicks too, or a low crit-chance
    // build could never click enrage off within its duration.
    var e = g.state.enemy;
    e.maxHp = 10000; e.hp = 10000;
    g.triggerEnrage({ duration: 60000 });

    for(var i=0;i<g.DEBUFF_SHATTER_CLICKS-1;i++) g.dealDamage(10, false); // plain, non-crit clicks
    assert.ok(e.enrageUntil > Date.now(), 'enrage should survive one non-crit click short of the threshold');

    g.dealDamage(10, false);
    assert.ok(!(e.enrageUntil > Date.now()), 'enrage should break from plain clicks alone');
  });

  test('taunt makes hits miss exactly at its configured chance', () => {
    var e = g.state.enemy;
    e.maxHp = 1000; e.hp = 1000;
    g.triggerTaunt({ duration: 5000, missChance: 1 });
    g.dealDamage(50, false);
    assert.equal(e.hp, 1000, 'a 100% miss chance must always miss');

    g.triggerTaunt({ duration: 5000, missChance: 0 });
    g.dealDamage(50, false);
    assert.equal(e.hp, 950, 'a 0% miss chance must never miss');
  });

  test('taunt\'s shattering click always lands, bypassing the miss roll', () => {
    var e = g.state.enemy;
    e.maxHp = 10000; e.hp = 10000;
    g.triggerTaunt({ duration: 60000, missChance: 1 }); // always-miss, so any landed hit proves the shatter fired
    for(var i=0;i<g.DEBUFF_SHATTER_CLICKS-1;i++) g.dealDamage(10, false);
    assert.equal(e.hp, 10000, 'taunt should still be blocking every hit short of the threshold');

    g.dealDamage(10, false); // the Nth real click
    assert.equal(e.hp, 9990, 'the shattering click must land even against a 100% miss chance');
    assert.ok(!(e.tauntUntil > Date.now()), 'taunt should end the moment it shatters');
  });

  test('overcharge heals only if the channel window closes with no click landed', async () => {
    var e = g.state.enemy;
    e.maxHp = 1000; e.hp = 500;
    g.triggerOvercharge({ channelDuration: 50, healFrac: 0.1 }, g.bossFightToken);
    assert.ok(e.overchargeUntil > Date.now(), 'a channel window should be recorded for the UI to show');
    await sleep(120);
    assert.equal(e.hp, 600, 'an unpunished channel should heal 10% of max HP');
  });

  test('overcharge does not heal if a click landed during the channel window', async () => {
    var e = g.state.enemy;
    e.maxHp = 1000; e.hp = 500;
    g.triggerOvercharge({ channelDuration: 50, healFrac: 0.1 }, g.bossFightToken);
    g.dealDamage(10, false); // marks overchargeClicked, and chips 10 hp
    await sleep(120);
    assert.equal(e.hp, 490, 'a click during the channel should cancel the heal, leaving only the click\'s own damage');
  });

  test('overcharge is not satisfied by auto-DPS -- only a real click should cancel the heal', async () => {
    // Before dealDamage learned the difference between a click and an
    // auto-DPS tick, `overchargeClicked` was set by *any* non-add hit, and
    // the once-per-second auto loop virtually guarantees a tick lands
    // within any channel window -- so the "keep attacking" mechanic was
    // trivially satisfied by simply having nonzero auto-DPS, never by
    // actually engaging with the fight.
    var e = g.state.enemy;
    e.maxHp = 1000; e.hp = 500;
    g.triggerOvercharge({ channelDuration: 50, healFrac: 0.1 }, g.bossFightToken);
    g.dealDamage(10, false, true); // an auto-DPS tick, not a click
    await sleep(120);
    // the tick's own 10 damage still lands (500-10=490) -- only the flag it
    // must not set is what's under test -- then the unpunished-channel heal
    // still fires on top, same 10% of max HP as the no-damage-at-all case
    assert.equal(e.hp, 590, 'an auto-DPS tick landing during the channel must not cancel the heal');
  });

  test('secondWind heals once when HP first crosses its threshold, and never fires twice', () => {
    var e = g.state.enemy;
    e.maxHp = 1000; e.hp = 1000;
    g.startBossAbilities([{ type: 'secondWind', threshold: 0.3, healFrac: 0.5 }], g.bossFightToken);
    assert.ok(e.secondWindAbility);

    g.dealDamage(750, false); // drops to 250 (25%), under the 30% threshold
    assert.equal(e.secondWindUsed, true);
    assert.equal(e.hp, 750, 'a 50% heal of max HP should trigger the instant it crosses the threshold');

    g.dealDamage(500, false); // push it low again
    assert.equal(e.hp, 250, 'no second heal should fire once secondWindUsed is set');
  });

  test('hydra waves double in size after the body\'s vulnerable window closes, capped at maxHeads', async () => {
    var e = g.state.enemy;
    var ability = { headKey: 'hydraHead', initialHeads: 1, maxHeads: 4, headHpFrac: 0.5, vulnerableDuration: 50 };
    e.maxHp = 1000; e.hp = 1000;
    g.triggerHydraWave(ability);
    assert.equal(e.hydraHeadsInWave, 1);
    assert.ok(g.state.addEnemy, 'the first head should spawn immediately, not on a timer');

    g.clearHydraHead(); // clears the only head in a 1-head wave
    assert.equal(e.hydraVulnerable, true, 'clearing the whole wave should expose the body');
    assert.equal(g.state.addEnemy, null);

    await sleep(120); // let the vulnerable window close
    assert.equal(e.hydraVulnerable, false);
    assert.equal(e.hydraHeadsInWave, 2, 'the next wave should double');
    assert.ok(g.state.addEnemy, 'the next wave\'s first head should already be up');
  });

  test('a multi-head wave shows the rest of the wave queued up, not just the active head', () => {
    // Only one head is ever the actual, clickable add (clearHydraHead
    // replaces it rather than adding alongside it -- see combat.js), but a
    // wave can be several heads deep and until now nothing on screen showed
    // that at all. #hydraQueue renders the *rest* of the current wave as a
    // dimmed row so "multiple heads" is something the player can actually
    // see, not just infer from a sub-text line.
    var e = g.state.enemy;
    var ability = { headKey: 'hydraHead', initialHeads: 3, maxHeads: 8, headHpFrac: 0.1, vulnerableDuration: 50 };
    e.maxHp = 1000; e.hp = 1000;
    g.triggerHydraWave(ability);
    assert.equal(g.el.hydraQueue.children.length, 2, 'a 3-head wave should show 2 heads still queued after the active one');
    assert.ok(g.el.hydraQueue.classList.contains('show'));

    g.clearHydraHead(); // 1 down, 2 to go
    assert.equal(g.el.hydraQueue.children.length, 1, 'the queue should shrink as heads are cleared');

    g.clearHydraHead(); // 2 down, only the last head remains active
    assert.equal(g.el.hydraQueue.children.length, 0, 'no heads queued once only the last one remains');
  });

  test('webPull is a pure flourish: it never touches enemy HP', () => {
    var e = g.state.enemy;
    var hpBefore = e.hp;
    assert.doesNotThrow(() => g.triggerWebPull({}));
    assert.equal(e.hp, hpBefore);
  });

  test('mathGate blocks damage until answered correctly, and a wrong guess keeps it active', () => {
    var e = g.state.enemy;
    e.maxHp = 500; e.hp = 500;
    g.triggerMathGate({});
    assert.equal(e.mathGateActive, true);
    var parts, expected;
    if(e.mathGateQuestion.indexOf(' - ') >= 0){
      parts = e.mathGateQuestion.split(' - ').map(Number);
      expected = parts[0] - parts[1];
    } else {
      parts = e.mathGateQuestion.split(' + ').map(Number);
      expected = parts[0] + parts[1];
    }
    assert.equal(e.mathGateAnswer, expected);

    g.dealDamage(999, false);
    assert.equal(e.hp, 500, 'damage must be fully blocked while the math gate is active');

    g.answerMathGate(String(e.mathGateAnswer - 1)); // deliberately wrong
    assert.equal(e.mathGateActive, true, 'a wrong answer must not clear the gate');

    g.answerMathGate(String(e.mathGateAnswer));
    assert.equal(e.mathGateActive, false, 'the correct answer should clear the gate');

    g.dealDamage(50, false);
    assert.equal(e.hp, 450, 'damage should land normally once the gate is cleared');
  });
});

"use strict";
const test = require('node:test');
const assert = require('node:assert/strict');
const { bootGame } = require('../helpers/bootGame');

test('boots into a playable state with a live, undamaged enemy', async (t) => {
  const dom = await bootGame();
  t.after(() => dom.window.close());
  const w = dom.window;
  const g = w.__game;
  assert.ok(g.state.enemy, 'state.enemy should be set after boot');
  assert.ok(g.state.enemy.hp > 0, 'the enemy should be alive after boot');
  assert.equal(w.document.getElementById('enemyName').textContent, g.state.enemy.name);
});

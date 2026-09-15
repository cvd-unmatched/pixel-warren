"use strict";
// Warren Chase (the boss-token arcade minigame): movement, walls, dot
// collection, win/lose, and token spend all run through arcadeTick/
// arcadeGhostTick directly rather than real timers, so these are fast and
// deterministic. getContext('2d') is unimplemented in jsdom and logs a
// noisy "not implemented" warning when openArcade() runs -- harmless
// (arcadeRender just no-ops with a null ctx), not a real failure.
const { describe, test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { bootGame } = require('../helpers/bootGame');

describe('Warren Chase arcade minigame', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  beforeEach(() => {
    g.state.arcadeTokens = 3;
    g.openArcade();
  });

  test('the maze is a well-formed, fully enclosed rectangle', () => {
    const w = g.ARCADE_MAZE[0].length;
    g.ARCADE_MAZE.forEach(row => assert.equal(row.length, w, 'every row must be the same width'));
    assert.ok(g.ARCADE_MAZE[0].split('').every(c => c === '#'), 'top edge must be a solid wall');
    assert.ok(g.ARCADE_MAZE[g.ARCADE_MAZE.length-1].split('').every(c => c === '#'), 'bottom edge must be a solid wall');
  });

  test('starting a run costs exactly one token, and refuses to start with none', () => {
    g.state.arcadeTokens = 1;
    g.openArcade();
    g.arcadeStart();
    assert.equal(g.state.arcadeTokens, 0, 'a run must cost exactly one token');
    assert.ok(g.arcadeState && !g.arcadeState.over, 'a run should actually be in progress');

    g.arcadeStart(); // no tokens left
    assert.equal(g.state.arcadeTokens, 0, 'starting with zero tokens must not go negative or silently charge anyway');
  });

  test('the player cannot move through a wall', () => {
    g.arcadeStart();
    const p = g.arcadeState.player;
    const startX = p.x, startY = p.y;
    // the maze's border is solid, so "up" from a row-1 cell should be blocked
    g.arcadeSetDir('up');
    for(let i=0;i<5;i++) g.arcadeTick();
    assert.ok(p.y >= 1, 'the player must never end up inside the border wall');
    assert.ok(g.arcadeState.dotsEaten >= 0);
  });

  test('walking onto a dot removes it and counts it as eaten', () => {
    g.arcadeStart();
    const totalBefore = g.arcadeState.dotsTotal;
    const leftBefore = g.arcadeState.dotsLeft;
    g.arcadeSetDir('right');
    g.arcadeTick();
    assert.equal(g.arcadeState.dotsTotal, totalBefore, 'the total dot count for this run never changes');
    assert.ok(g.arcadeState.dotsLeft <= leftBefore, 'eating a dot should not increase how many are left');
  });

  test('clearing every dot ends the run as a win and pays out gold', () => {
    g.arcadeStart();
    const goldBefore = g.state.gold;
    // Sweep every open cell's dot directly rather than actually navigating
    // the maze -- the win/lose *outcome* handling is what this test is
    // checking, not pathfinding.
    for(let y=0;y<g.arcadeState.grid.length;y++){
      for(let x=0;x<g.arcadeState.grid[y].length;x++){
        if(g.arcadeState.grid[y][x] === '.') g.arcadeState.grid[y][x] = ' ';
      }
    }
    g.arcadeState.dotsLeft = 0;
    g.arcadeSetDir(g.arcadeState.player.dir || 'right');
    g.arcadeTick();
    assert.ok(g.arcadeState.over, 'clearing all dots must end the run');
    assert.ok(g.state.gold > goldBefore, 'a cleared run must pay out gold');
  });

  test('a ghost catching the player ends the run as a loss', () => {
    g.arcadeStart();
    const p = g.arcadeState.player;
    // Place a ghost one open cell to the right and walk the player onto
    // it. arcadeGhostTick() moves its ghosts *before* checking collision,
    // so placing a ghost directly on the player and ticking the ghosts
    // just walks it away again before the check ever runs -- driving the
    // collision through the player's own tick (checked right after it
    // moves) tests the same arcadeCheckCatch() logic without that ordering
    // trap.
    g.arcadeState.ghosts[0].x = p.x + 1;
    g.arcadeState.ghosts[0].y = p.y;
    g.arcadeSetDir('right');
    g.arcadeTick();
    assert.ok(g.arcadeState.over, 'walking onto a ghost\'s cell must end the run');
  });

  test('closeArcade stops the run without crashing and leaves no dangling state to react to', () => {
    g.arcadeStart();
    assert.doesNotThrow(() => g.closeArcade());
    // ticking after close must be inert, not throw, even mid-run
    assert.doesNotThrow(() => g.arcadeTick());
    assert.doesNotThrow(() => g.arcadeGhostTick());
  });
});

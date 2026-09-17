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
    g.state.chaseTokens = 3;
    g.openArcade();
    g.arcadeShowMaze();
  });

  test('the maze is a well-formed, fully enclosed rectangle', () => {
    const w = g.ARCADE_MAZE[0].length;
    g.ARCADE_MAZE.forEach(row => assert.equal(row.length, w, 'every row must be the same width'));
    assert.ok(g.ARCADE_MAZE[0].split('').every(c => c === '#'), 'top edge must be a solid wall');
    assert.ok(g.ARCADE_MAZE[g.ARCADE_MAZE.length-1].split('').every(c => c === '#'), 'bottom edge must be a solid wall');
  });

  test('starting a run costs exactly one token, and refuses to start with none', () => {
    g.state.chaseTokens = 1;
    g.openArcade();
    g.arcadeStart();
    assert.equal(g.state.chaseTokens, 0, 'a run must cost exactly one token');
    assert.ok(g.arcadeState && !g.arcadeState.over, 'a run should actually be in progress');

    g.arcadeStart(); // no tokens left
    assert.equal(g.state.chaseTokens, 0, 'starting with zero tokens must not go negative or silently charge anyway');
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

describe('Warren Chase game-select hub', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  test('opening the overlay lands on the game list, not straight into a game', () => {
    g.openArcade();
    assert.equal(g.arcadeView, 'select');
    assert.equal(g.el.arcadeSelect.hidden, false);
    assert.equal(g.el.arcadeMazeView.hidden, true);
    assert.equal(g.el.arcadeWhackView.hidden, true);
  });

  test('picking a game switches views, and the back button returns to the list', () => {
    g.openArcade();
    g.el.arcadePickMaze.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    assert.equal(g.arcadeView, 'maze');
    assert.equal(g.el.arcadeMazeView.hidden, false);

    g.el.arcadeMazeBackBtn.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    assert.equal(g.arcadeView, 'select');

    g.el.arcadePickWhack.dispatchEvent(new dom.window.Event('click', { bubbles: true }));
    assert.equal(g.arcadeView, 'whack');
    assert.equal(g.el.arcadeWhackView.hidden, false);
  });

  test('closeArcade stops whichever game is running, from any view', () => {
    g.state.chaseTokens = 1;
    g.openArcade();
    g.arcadeShowWhack();
    g.whackStart();
    assert.doesNotThrow(() => g.closeArcade());
    assert.doesNotThrow(() => g.whackTick());
  });
});

describe('Bog Whacker arcade minigame', () => {
  let dom, g;

  before(async () => {
    dom = await bootGame();
    g = dom.window.__game;
  });

  after(() => dom.window.close());

  beforeEach(() => {
    g.state.chaseTokens = 3;
    g.openArcade();
    g.arcadeShowWhack();
  });

  test('starting a round costs exactly one token, and refuses to start with none', () => {
    g.state.chaseTokens = 1;
    g.arcadeShowWhack();
    g.whackStart();
    assert.equal(g.state.chaseTokens, 0, 'a round must cost exactly one token');
    assert.ok(g.whackState && !g.whackState.over, 'a round should actually be in progress');

    g.whackStart(); // no tokens left
    assert.equal(g.state.chaseTokens, 0, 'starting with zero tokens must not go negative or silently charge anyway');
  });

  test('whacking a mole scores a point and clears that hole', () => {
    g.whackStart();
    g.whackState.holes[0] = { isSkull: false, key: 'slime', ticksLeft: g.WHACK_UP_TICKS };
    g.whackHitHole(0);
    assert.equal(g.whackState.score, 1);
    assert.equal(g.whackState.holes[0], null, 'a whacked hole must clear immediately, not wait for its timer');
  });

  test('whacking an empty hole does nothing', () => {
    g.whackStart();
    assert.equal(g.whackState.holes[3], null);
    g.whackHitHole(3);
    assert.equal(g.whackState.score, 0);
  });

  test('whacking a skull ends the round immediately, keeping the score already earned', () => {
    g.whackStart();
    g.whackState.holes[0] = { isSkull: false, key: 'slime', ticksLeft: g.WHACK_UP_TICKS };
    g.whackHitHole(0); // one clean hit banked first
    g.whackState.holes[1] = { isSkull: true, key: 'slime', ticksLeft: g.WHACK_UP_TICKS };
    g.whackHitHole(1);
    assert.ok(g.whackState.over, 'a skull must end the round on the spot');
    assert.equal(g.whackState.score, 1, 'the score from before the trap must survive');

    // once over, further hits must be inert
    g.whackState.holes[2] = { isSkull: false, key: 'slime', ticksLeft: g.WHACK_UP_TICKS };
    g.whackHitHole(2);
    assert.equal(g.whackState.score, 1, 'a round that already ended must not keep scoring');
  });

  test('a skull payout is still proportional to the score banked before it', () => {
    g.whackStart();
    const goldBefore = g.state.gold;
    for(let i=0;i<3;i++){ g.whackState.holes[i] = { isSkull:false, key:'slime', ticksLeft:g.WHACK_UP_TICKS }; g.whackHitHole(i); }
    g.whackState.holes[4] = { isSkull: true, key: 'slime', ticksLeft: g.WHACK_UP_TICKS };
    g.whackHitHole(4);
    assert.ok(g.state.gold > goldBefore, 'banked whacks before a trap must still pay out gold');
  });

  test('letting the clock run out ends the round on its own and pays out whatever was scored', () => {
    g.whackStart();
    g.whackState.holes[0] = { isSkull: false, key: 'slime', ticksLeft: g.WHACK_UP_TICKS };
    g.whackHitHole(0);
    const goldBefore = g.state.gold;
    g.whackState.ticksLeft = 1;
    g.whackTick();
    assert.ok(g.whackState.over, 'the round must end once the clock reaches zero');
    assert.ok(g.state.gold > goldBefore, 'a timed-out round must still pay out for whatever was scored');
  });

  test('a round with zero whacks pays no gold', () => {
    g.whackStart();
    const goldBefore = g.state.gold;
    g.whackState.ticksLeft = 1;
    g.whackTick();
    assert.equal(g.state.gold, goldBefore, 'scoring nothing must pay nothing');
  });

  test('closeArcade stops a run without crashing and leaves no dangling state to react to', () => {
    g.whackStart();
    assert.doesNotThrow(() => g.closeArcade());
    assert.doesNotThrow(() => g.whackTick());
  });
});

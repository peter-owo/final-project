import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/ghost-game.js';

test('three ghosts can be selected and switching preserves position and cooldown', () => {
  const game = new Game();
  assert.equal(game.selection.length, 3);
  game.toggleSelection('purple');
  assert.deepEqual(game.selection, ['red', 'pink', 'purple']);
  game.start();
  const first = game.activeGhost;
  first.cooldown = 5;
  const original = { face: first.face, x: first.x, y: first.y };
  assert.equal(game.switchGhost(), true);
  assert.equal(game.activeGhost.id, 'pink');
  assert.deepEqual({ face: first.face, x: first.x, y: first.y }, original);
  assert.equal(first.cooldown, 5);
  assert.equal(game.switchGhost(), false);
});

test('switching during movement waits for the next tile and the old ghost resumes AI', () => {
  const game = new Game();
  game.start();
  const red = game.activeGhost;
  const next = game.canMove(red, 'left');
  game.beginMotion(red, next, 0.1);
  assert.equal(game.switchGhost(), true);
  assert.equal(game.activeGhost.id, 'red');
  game.update(0.05);
  game.update(0.05);
  assert.equal(game.activeGhost.id, 'pink');
  const redPosition = { face: red.face, x: red.x, y: red.y };
  for (let i = 0; i < 30; i++) game.update(0.05);
  assert.notDeepEqual({ face: red.face, x: red.x, y: red.y }, redPosition);
});

test('the four skills work and cooldowns stay with their ghosts', () => {
  const game = new Game();
  game.start();
  const red = game.activeGhost;
  red.direction = 'left';
  assert.equal(game.useSkill(), true);
  assert.equal(red.dashSteps, 2);
  assert.equal(red.cooldown, 8);

  game.switchTime = 0;
  game.switchGhost();
  const pink = game.activeGhost;
  assert.equal(game.useSkill(), true);
  assert.equal(game.traps.length, 1);
  assert.equal(pink.cooldown, 12);

  game.switchTime = 0;
  game.switchGhost();
  const cyan = game.activeGhost;
  Object.assign(cyan, { face: 'front', x: 1, y: 2, direction: 'right' });
  assert.equal(game.useSkill(), true);
  assert.equal(cyan.motion.to.x, 3);
  assert.equal(cyan.motion.to.y, 2);
  assert.equal(cyan.cooldown, 10);

  game.reset();
  game.selection = ['purple', 'red', 'pink'];
  game.start();
  assert.equal(game.useSkill(), true);
  assert.equal(game.senseTime, 5);
  assert.equal(game.activeGhost.cooldown, 14);
});

test('powered Pac-Man stuns a ghost and control moves to another available ghost', () => {
  const game = new Game();
  game.start();
  game.powerTime = 6;
  Object.assign(game.player, { face: 'front', x: 5, y: 5 });
  game.checkCollisions();
  assert.ok(game.ghosts[0].inactive > 0);
  assert.equal(game.activeGhost.id, 'pink');
  assert.equal(game.captures, 0);
});

test('three catches win; Pac-Man can also escape or survive the timer', () => {
  const game = new Game();
  game.start();
  for (let i = 0; i < 3; i++) {
    game.player.invulnerable = 0;
    Object.assign(game.player, { face: 'front', x: 5, y: 5 });
    game.checkCollisions();
  }
  assert.equal(game.captures, 3);
  assert.equal(game.status, 'won');

  game.start();
  game.dots = game.dotGoal;
  game.cores = 2;
  Object.assign(game.player, { face: 'front', x: 5, y: 5 });
  game.collect();
  assert.equal(game.status, 'lost');

  game.start();
  game.elapsed = 179.99;
  game.update(0.05);
  assert.equal(game.status, 'lost');
});

test('AI Pac-Man completes a full match without getting stuck', () => {
  const game = new Game();
  game.start();
  for (let i = 0; i < 3600 && game.status === 'playing'; i++) game.update(0.05);
  assert.notEqual(game.status, 'playing');
  assert.ok(game.dots > 0);
  assert.equal(game.cores, 2);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { FACE_ORDER, createMaze, nextCell, shortestPath, cellKey } from '../src/maze.js';
import { Game } from '../src/game.js';

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

test('all six maze faces are connected and reachable from the start', () => {
  const cells = createMaze();
  const start = cells.get('front:5:5');
  const reachable = new Set(shortestPath(cells, start, cells.get('bottom:5:5')).map(cellKey));
  assert.ok(reachable.size > 1);
  for (const cell of cells.values()) {
    if (!cell.wall) assert.ok(shortestPath(cells, start, cell).length, `unreachable: ${cellKey(cell)}`);
  }
});

test('crossing every open edge has a valid reverse route', () => {
  const cells = createMaze();
  for (const face of FACE_ORDER) {
    for (const [direction, x, y] of [['up', 5, 0], ['right', 10, 5], ['down', 5, 10], ['left', 0, 5]]) {
      const source = { face, x, y };
      const target = nextCell(source, direction);
      assert.equal(cells.get(cellKey(target))?.wall, false);
      const back = nextCell(target, OPPOSITE[target.direction]);
      assert.equal(cellKey(back), cellKey(source));
    }
  }
});

test('items affect play and one shield absorbs exactly one ghost hit', () => {
  const game = new Game();
  game.start();
  Object.assign(game.player, { face: 'front', x: 5, y: 1 });
  game.collect();
  assert.ok(game.powerTime > 0);
  assert.equal(game.score, 50);
  Object.assign(game.player, { face: 'front', x: 1, y: 5 });
  game.collect();
  assert.equal(game.shield, true);
  game.powerTime = 0;
  Object.assign(game.ghosts[0], { face: 'front', x: 1, y: 5, inactive: 0 });
  game.checkCollision();
  assert.equal(game.lives, 3);
  assert.equal(game.shield, false);
  game.player.invulnerable = 0;
  game.checkCollision();
  assert.equal(game.lives, 2);
});

test('powered player can eat ghosts without losing a life', () => {
  const game = new Game();
  game.start();
  game.powerTime = 5;
  Object.assign(game.ghosts[0], { face: 'front', x: 5, y: 5, inactive: 0 });
  game.checkCollision();
  assert.equal(game.lives, 3);
  assert.equal(game.score, 200);
  assert.equal(game.stats.ghosts, 1);
  assert.ok(game.ghosts[0].inactive > 0);
});

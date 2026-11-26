import test from 'node:test';
import assert from 'node:assert/strict';
import { FACE_ORDER, createMaze, nextCell, shortestPath, cellKey } from '../src/maze.js';

const OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };

test('all six maze faces are connected and reachable from the start', () => {
  const cells = createMaze();
  const start = cells.get('front:5:5');
  for (const cell of cells.values()) {
    if (!cell.wall) assert.ok(shortestPath(cells, start, cell).length, `unreachable: ${cellKey(cell)}`);
  }
});

test('every open edge has a valid reverse route', () => {
  const cells = createMaze();
  for (const face of FACE_ORDER) {
    for (const [direction, x, y] of [['up', 5, 0], ['right', 10, 5], ['down', 5, 10], ['left', 0, 5]]) {
      const source = { face, x, y };
      const target = nextCell(source, direction);
      assert.equal(cells.get(cellKey(target))?.wall, false);
      assert.equal(cellKey(nextCell(target, OPPOSITE[target.direction])), cellKey(source));
    }
  }
});

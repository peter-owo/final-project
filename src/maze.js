export const SIZE = 11;
export const HALF = (SIZE - 1) / 2;
export const FACE_ORDER = ['front', 'right', 'back', 'left', 'top', 'bottom'];
export const FACE_NAMES = { front: '前面 FRONT', right: '右面 RIGHT', back: '後面 BACK', left: '左面 LEFT', top: '上面 TOP', bottom: '下面 BOTTOM' };

// U points right on screen, V points down on screen. The cross-face mapping
// derives from these bases, so every edge uses the same movement rules.
export const FACES = {
  front:  { n: [0, 0, 1], u: [1, 0, 0], v: [0, -1, 0] },
  right:  { n: [1, 0, 0], u: [0, 0, -1], v: [0, -1, 0] },
  back:   { n: [0, 0, -1], u: [-1, 0, 0], v: [0, -1, 0] },
  left:   { n: [-1, 0, 0], u: [0, 0, 1], v: [0, -1, 0] },
  top:    { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  bottom: { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, -1] },
};
export const DIRECTIONS = { up: [0, -1], right: [1, 0], down: [0, 1], left: [-1, 0] };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b, scale = 1) => a.map((value, i) => value + b[i] * scale);
const key = ({ face, x, y }) => `${face}:${x}:${y}`;
export { key as cellKey };

const TEMPLATE = [
  '#####.#####',
  '#...#.#...#',
  '#.#.#.#.#.#',
  '#.#.....#.#',
  '#.###.###.#',
  '...........',
  '#.###.###.#',
  '#.#.....#.#',
  '#.#.#.#.#.#',
  '#...#.#...#',
  '#####.#####',
];

export function createMaze() {
  const cells = new Map();
  for (const face of FACE_ORDER) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const wall = TEMPLATE[y][x] === '#';
        cells.set(key({ face, x, y }), { face, x, y, wall, item: wall ? null : 'dot' });
      }
    }
  }
  const put = (face, x, y, item) => { const cell = cells.get(key({ face, x, y })); if (!cell.wall) cell.item = item; };
  const clear = (face, x, y) => put(face, x, y, null);
  clear('front', 5, 5);
  for (const [face, x, y] of [['front', 5, 1], ['right', 5, 9], ['back', 5, 1], ['left', 5, 9], ['top', 5, 5], ['bottom', 5, 5]]) put(face, x, y, 'power');
  for (const [face, x, y] of [['front', 1, 5], ['back', 9, 5], ['top', 1, 5]]) put(face, x, y, 'shield');
  for (const [face, x, y] of [['right', 9, 5], ['left', 1, 5], ['bottom', 9, 5]]) put(face, x, y, 'speed');
  for (const [face, x, y] of [['right', 5, 5], ['back', 5, 5], ['left', 5, 5]]) clear(face, x, y);
  return cells;
}

export function nextCell(cell, direction) {
  const [dx, dy] = DIRECTIONS[direction];
  const x = cell.x + dx;
  const y = cell.y + dy;
  if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) return { face: cell.face, x, y, direction };

  const source = FACES[cell.face];
  const outward = dx ? source.u.map(v => v * dx) : source.v.map(v => v * dy);
  const targetFace = FACE_ORDER.find(face => dot(FACES[face].n, outward) === 1);
  const target = FACES[targetFace];
  const point = add(add(source.n.map(v => v * HALF), source.u, cell.x - HALF), source.v, cell.y - HALF);
  const nx = Math.round(dot(point, target.u) + HALF);
  const ny = Math.round(dot(point, target.v) + HALF);
  const heading = source.n.map(v => -v);
  const newDirection = Object.keys(DIRECTIONS).find(name => {
    const [mx, my] = DIRECTIONS[name];
    return dot(heading, target.u) === mx && dot(heading, target.v) === my;
  });
  return { face: targetFace, x: nx, y: ny, direction: newDirection };
}

export function neighbors(cells, cell, { throughWalls = false } = {}) {
  return Object.keys(DIRECTIONS).map(direction => nextCell(cell, direction)).filter(next => {
    const target = cells.get(key(next));
    return target && (!target.wall || (throughWalls && next.face === cell.face && next.x > 0 && next.x < SIZE - 1 && next.y > 0 && next.y < SIZE - 1));
  });
}

export function shortestPath(cells, start, goal, options = {}) {
  const startKey = key(start), goalKey = key(goal);
  if (startKey === goalKey) return [start];
  const queue = [start];
  const seen = new Set([startKey]);
  const previous = new Map();
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    for (const next of neighbors(cells, cell, options)) {
      const id = key(next);
      if (seen.has(id)) continue;
      seen.add(id);
      previous.set(id, cell);
      if (id === goalKey) {
        const path = [next];
        let cursor = cell;
        while (key(cursor) !== startKey) { path.unshift(cursor); cursor = previous.get(key(cursor)); }
        path.unshift(start);
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

export function distance(cells, a, b) {
  const path = shortestPath(cells, a, b);
  return path.length ? path.length - 1 : Infinity;
}

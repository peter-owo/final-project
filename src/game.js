import { cellKey, createMaze, distance, neighbors, nextCell, shortestPath } from './maze.js';

const SPAWN = { face: 'front', x: 5, y: 5 };
const GHOST_STARTS = [
  { face: 'right', x: 5, y: 5 },
  { face: 'back', x: 5, y: 5 },
  { face: 'left', x: 5, y: 5 },
];
const PATROL = [
  { face: 'front', x: 5, y: 5 },
  { face: 'top', x: 5, y: 5 },
  { face: 'back', x: 5, y: 5 },
  { face: 'bottom', x: 5, y: 5 },
  { face: 'left', x: 5, y: 5 },
  { face: 'right', x: 5, y: 5 },
];

export class Game {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.reset();
  }

  reset() {
    this.cells = createMaze();
    this.status = 'ready';
    this.score = 0;
    this.lives = 3;
    this.remaining = [...this.cells.values()].filter(cell => cell.item).length;
    this.player = { ...SPAWN, direction: 'right', queued: null, motion: null, invulnerable: 0 };
    this.ghosts = GHOST_STARTS.map((start, index) => ({ ...start, index, direction: 'left', motion: null, wait: 0.4 + index * 0.5, inactive: 0, wallCooldown: 3 + index * 2, patrolIndex: index, mode: 'patrol' }));
    this.powerTime = 0;
    this.speedTime = 0;
    this.shield = false;
    this.elapsed = 0;
    this.stats = { dots: 0, ghosts: 0, faces: new Set(['front']) };
  }

  start() {
    if (this.status === 'ready' || this.status === 'won' || this.status === 'lost') {
      this.reset();
      this.status = 'playing';
      this.onEvent('start');
    } else if (this.status === 'paused') {
      this.status = 'playing';
      this.onEvent('resume');
    }
  }

  togglePause() {
    if (this.status === 'playing') { this.status = 'paused'; this.onEvent('pause'); }
    else if (this.status === 'paused') this.start();
  }

  queue(direction) {
    if (this.status !== 'playing') return;
    this.player.queued = direction;
  }

  canMove(cell, direction) {
    const next = nextCell(cell, direction);
    return this.cells.get(cellKey(next))?.wall === false ? next : null;
  }

  beginPlayerMove() {
    const player = this.player;
    let next = player.queued && this.canMove(player, player.queued);
    if (next) player.queued = null;
    else next = this.canMove(player, player.direction);
    if (!next) return;
    player.motion = { from: { face: player.face, x: player.x, y: player.y }, to: next, progress: 0, duration: this.speedTime > 0 ? 0.12 : 0.2 };
    player.direction = next.direction;
    if (next.face !== player.face) this.onEvent('cross', next.face);
  }

  finishPlayerMove() {
    const player = this.player;
    Object.assign(player, { face: player.motion.to.face, x: player.motion.to.x, y: player.motion.to.y, direction: player.motion.to.direction });
    player.motion = null;
    this.stats.faces.add(player.face);
    this.collect();
    this.checkCollision();
  }

  collect() {
    const cell = this.cells.get(cellKey(this.player));
    if (!cell?.item) return;
    const item = cell.item;
    cell.item = null;
    this.remaining--;
    this.stats.dots++;
    this.score += item === 'dot' ? 10 : 50;
    if (item === 'power') this.powerTime = 8;
    if (item === 'shield') this.shield = true;
    if (item === 'speed') this.speedTime = 8;
    this.onEvent('collect', { item, cell });
    if (this.remaining === 0) this.finish('won');
  }

  ghostTarget(ghost) {
    if (ghost.index !== 1) return this.player;
    // The pink ghost aims three cells ahead along the player's planned route.
    let target = this.player;
    for (let i = 0; i < 3; i++) {
      const next = this.canMove(target, this.player.direction);
      if (!next) break;
      target = next;
    }
    return target;
  }

  beginGhostMove(ghost) {
    const options = neighbors(this.cells, ghost, { throughWalls: ghost.index === 2 && ghost.wallCooldown <= 0 });
    if (!options.length) return;
    const frightened = this.powerTime > 0;
    const nearby = distance(this.cells, ghost, this.player) <= 9;
    ghost.mode = frightened ? 'flee' : nearby ? 'chase' : 'patrol';
    if (ghost.mode === 'patrol' && cellKey(ghost) === cellKey(PATROL[ghost.patrolIndex])) ghost.patrolIndex = (ghost.patrolIndex + 1) % PATROL.length;
    const target = ghost.mode === 'patrol' ? PATROL[ghost.patrolIndex] : this.ghostTarget(ghost);
    const ranked = options.map(option => ({ option, distance: distance(this.cells, option, target) }));
    ranked.sort((a, b) => frightened ? b.distance - a.distance : a.distance - b.distance);
    let choice = ranked[0]?.option;
    if (!frightened && ghost.index === 2 && ghost.wallCooldown <= 0) {
      const path = shortestPath(this.cells, ghost, target, { throughWalls: true });
      if (path[1] && this.cells.get(cellKey(path[1]))?.wall) choice = path[1];
    }
    if (this.cells.get(cellKey(choice))?.wall) ghost.wallCooldown = 8;
    ghost.motion = { from: { face: ghost.face, x: ghost.x, y: ghost.y }, to: choice, progress: 0, duration: frightened ? 0.42 : 0.3 + ghost.index * 0.015 };
    ghost.direction = choice.direction;
  }

  checkCollision() {
    if (this.status !== 'playing' || this.player.invulnerable > 0) return;
    for (const ghost of this.ghosts) {
      if (ghost.inactive > 0 || cellKey(ghost) !== cellKey(this.player)) continue;
      if (this.powerTime > 0) {
        this.score += 200;
        this.stats.ghosts++;
        ghost.inactive = 4;
        ghost.motion = null;
        Object.assign(ghost, GHOST_STARTS[ghost.index]);
        this.onEvent('ghost');
      } else if (this.shield) {
        this.shield = false;
        this.player.invulnerable = 1.5;
        this.onEvent('shield');
      } else {
        this.lives--;
        this.onEvent('hit');
        if (this.lives === 0) { this.finish('lost'); return; }
        Object.assign(this.player, SPAWN, { direction: 'right', queued: null, motion: null, invulnerable: 2.5 });
        this.ghosts.forEach((entry, i) => Object.assign(entry, GHOST_STARTS[i], { motion: null, wait: 1 + i * 0.5 }));
      }
      return;
    }
  }

  finish(result) {
    this.status = result;
    this.onEvent(result);
  }

  update(dt) {
    if (this.status !== 'playing') return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.powerTime = Math.max(0, this.powerTime - dt);
    this.speedTime = Math.max(0, this.speedTime - dt);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    for (const ghost of this.ghosts) {
      ghost.inactive = Math.max(0, ghost.inactive - dt);
      ghost.wallCooldown = Math.max(0, ghost.wallCooldown - dt);
      if (ghost.inactive > 0) continue;
      if (ghost.motion) {
        ghost.motion.progress += dt / ghost.motion.duration;
        if (ghost.motion.progress >= 1) {
          Object.assign(ghost, ghost.motion.to);
          ghost.motion = null;
          this.checkCollision();
        }
      } else {
        ghost.wait -= dt;
        if (ghost.wait <= 0) this.beginGhostMove(ghost);
      }
    }
    if (this.status !== 'playing') return;
    if (this.player.motion) {
      this.player.motion.progress += dt / this.player.motion.duration;
      if (this.player.motion.progress >= 1) this.finishPlayerMove();
    } else this.beginPlayerMove();
  }
}

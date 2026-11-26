import { FACE_ORDER, cellKey, createMaze, distance, neighbors, nextCell, shortestPath } from './maze.js';

export const GHOST_TYPES = {
  red: { id: 'red', name: '追獵鬼', skill: '衝刺', cooldown: 8, color: '#ff5359', symbol: '●', spawn: { face: 'front', x: 5, y: 5 } },
  pink: { id: 'pink', name: '伏擊鬼', skill: '陷阱', cooldown: 12, color: '#ff7fd4', symbol: '◆', spawn: { face: 'right', x: 5, y: 5 } },
  cyan: { id: 'cyan', name: '穿牆鬼', skill: '穿牆', cooldown: 10, color: '#61eaff', symbol: '⬡', spawn: { face: 'left', x: 5, y: 5 } },
  purple: { id: 'purple', name: '感應鬼', skill: '感應', cooldown: 14, color: '#b38bff', symbol: '▲', spawn: { face: 'top', x: 5, y: 5 } },
};

const PAC_SPAWN = { face: 'back', x: 5, y: 5 };
const CORE_SPOTS = [{ face: 'top', x: 1, y: 5 }, { face: 'bottom', x: 9, y: 5 }];
const EXIT = { face: 'front', x: 5, y: 5 };
const DOT_GOAL = 220;
const CAPTURE_GOAL = 3;
const MATCH_TIME = 180;
const copyCell = actor => ({ face: actor.face, x: actor.x, y: actor.y });
const sameCell = (a, b) => a && b && cellKey(a) === cellKey(b);

export class Game {
  constructor(onEvent = () => {}) {
    this.onEvent = onEvent;
    this.selection = ['red', 'pink', 'cyan'];
    this.reset();
  }

  get activeGhost() { return this.ghosts[this.activeIndex]; }
  get dotGoal() { return DOT_GOAL; }
  get captureGoal() { return CAPTURE_GOAL; }
  get exitReady() { return this.dots >= DOT_GOAL && this.cores >= 2; }

  reset() {
    this.cells = createMaze();
    this.cells.get('top:5:5').item = null;
    this.cells.get('top:5:1').item = 'power';
    for (const spot of CORE_SPOTS) this.cells.get(cellKey(spot)).item = 'core';
    this.cells.get(cellKey(EXIT)).item = 'exit';
    this.status = 'ready';
    this.elapsed = 0;
    this.timeLeft = MATCH_TIME;
    this.captures = 0;
    this.dots = 0;
    this.cores = 0;
    this.powerTime = 0;
    this.senseTime = 0;
    this.switchTime = 0;
    this.traps = [];
    this.player = { ...PAC_SPAWN, direction: 'left', motion: null, wait: 0.4, invulnerable: 0, slowTime: 0, lastMove: null };
    this.ghosts = this.selection.map((id, index) => ({ ...GHOST_TYPES[id].spawn, id, index, direction: 'left', queued: null, motion: null, wait: 0.5 + index * 0.2, inactive: 0, cooldown: 0, dashSteps: 0, pendingSkill: false, pendingSwitch: false, patrolIndex: index, lastMove: null }));
    this.activeIndex = 0;
  }

  toggleSelection(id) {
    if (!GHOST_TYPES[id] || !['ready', 'won', 'lost'].includes(this.status)) return false;
    if (this.selection.includes(id)) this.selection = this.selection.filter(value => value !== id);
    else if (this.selection.length < 3) this.selection.push(id);
    else this.selection[this.selection.length - 1] = id;
    this.onEvent('selection');
    return true;
  }

  start() {
    if (this.status === 'paused') {
      this.status = 'playing';
      this.onEvent('resume');
      return true;
    }
    if (this.selection.length !== 3) return false;
    this.reset();
    this.status = 'playing';
    this.onEvent('start');
    return true;
  }

  togglePause() {
    if (this.status === 'playing') { this.status = 'paused'; this.onEvent('pause'); }
    else if (this.status === 'paused') this.start();
  }

  queue(direction) {
    if (this.status === 'playing' && this.activeGhost?.inactive <= 0) this.activeGhost.queued = direction;
  }

  canMove(actor, direction) {
    const next = nextCell(actor, direction);
    return this.cells.get(cellKey(next))?.wall === false ? next : null;
  }

  switchGhost(force = false) {
    if (this.status !== 'playing') return false;
    if (!force && this.switchTime > 0) { this.onEvent('switchBlocked'); return false; }
    const current = this.activeGhost;
    const available = this.ghosts.filter(ghost => ghost.inactive <= 0);
    if (!available.length) return false;
    if (!force && current?.motion) { current.pendingSwitch = true; return true; }
    let nextIndex = this.activeIndex;
    for (let step = 1; step <= this.ghosts.length; step++) {
      const candidate = (this.activeIndex + step) % this.ghosts.length;
      if (this.ghosts[candidate].inactive <= 0) { nextIndex = candidate; break; }
    }
    if (nextIndex === this.activeIndex && !force) return false;
    if (current) { current.queued = null; current.pendingSwitch = false; current.pendingSkill = false; current.dashSteps = 0; }
    this.activeIndex = nextIndex;
    this.activeGhost.queued = null;
    this.activeGhost.wait = 0.12;
    this.switchTime = force ? 0.25 : 0.8;
    this.onEvent('switch', this.activeGhost);
    return true;
  }

  useSkill() {
    const ghost = this.activeGhost;
    if (this.status !== 'playing' || !ghost) return false;
    if (ghost.inactive > 0) { this.onEvent('skillInvalid', '這隻鬼魂暫時失能'); return false; }
    if (ghost.cooldown > 0) { this.onEvent('skillInvalid', `技能冷卻中，剩餘 ${Math.ceil(ghost.cooldown)} 秒`); return false; }
    if (ghost.motion) { ghost.pendingSkill = true; this.onEvent('skillQueued'); return true; }
    return this.activateSkill(ghost);
  }

  activateSkill(ghost) {
    const type = GHOST_TYPES[ghost.id];
    if (ghost.id === 'red') {
      if (!this.canMove(ghost, ghost.direction)) { this.onEvent('skillInvalid', '前方無法衝刺'); return false; }
      ghost.dashSteps = 2;
    } else if (ghost.id === 'pink') {
      if (this.traps.some(trap => sameCell(trap, ghost))) { this.onEvent('skillInvalid', '這格已有陷阱'); return false; }
      this.traps.push({ ...copyCell(ghost), time: 8 });
    } else if (ghost.id === 'cyan') {
      const wall = nextCell(ghost, ghost.direction);
      const landing = nextCell(wall, wall.direction);
      if (wall.face !== ghost.face || landing.face !== ghost.face || !this.cells.get(cellKey(wall))?.wall || this.cells.get(cellKey(landing))?.wall !== false) {
        this.onEvent('skillInvalid', '前方需要一格牆與可走的落點');
        return false;
      }
      this.beginMotion(ghost, landing, 0.18);
    } else if (ghost.id === 'purple') this.senseTime = 5;
    ghost.cooldown = type.cooldown;
    ghost.pendingSkill = false;
    this.onEvent('skill', ghost);
    return true;
  }

  beginMotion(actor, to, duration) {
    actor.motion = { from: copyCell(actor), to, progress: 0, duration };
    actor.direction = to.direction || actor.direction;
  }

  nearestTarget(start, predicate) {
    const queue = [start];
    const seen = new Set([cellKey(start)]);
    for (let head = 0; head < queue.length; head++) {
      const cell = queue[head];
      if (predicate(this.cells.get(cellKey(cell)))) return cell;
      for (const next of neighbors(this.cells, cell)) {
        const id = cellKey(next);
        if (!seen.has(id)) { seen.add(id); queue.push(next); }
      }
    }
    return start;
  }

  pacTarget() {
    if (this.powerTime > 0) {
      const close = this.ghosts.filter(ghost => ghost.inactive <= 0).sort((a, b) => distance(this.cells, this.player, a) - distance(this.cells, this.player, b))[0];
      if (close && distance(this.cells, this.player, close) <= 4) return close;
    }
    if (this.exitReady) return EXIT;
    if (this.cores < 2) return this.nearestTarget(this.player, cell => cell?.item === 'core');
    return this.nearestTarget(this.player, cell => cell?.item === 'dot' || cell?.item === 'power');
  }

  beginPacMove() {
    const pac = this.player;
    const target = this.pacTarget();
    const options = neighbors(this.cells, pac);
    if (!options.length) return;
    const scored = options.map(option => {
      const goalDistance = distance(this.cells, option, target);
      let danger = 0;
      if (this.powerTime <= 0) {
        for (const ghost of this.ghosts) {
          if (ghost.inactive > 0) continue;
          const d = distance(this.cells, option, ghost.motion?.to || ghost);
          if (d < 6) danger += (6 - d) * 2.4;
        }
      }
      if (this.traps.some(trap => sameCell(trap, option))) danger += 8;
      const reverse = pac.lastMove && sameCell(option, pac.lastMove.from) ? 0.7 : 0;
      return { option, value: goalDistance + danger + reverse };
    }).sort((a, b) => a.value - b.value);
    this.beginMotion(pac, scored[0].option, pac.slowTime > 0 ? 0.35 : 0.22);
  }

  ghostTarget(ghost) {
    if (ghost.id !== 'pink') return this.player;
    let target = this.player;
    for (let i = 0; i < 3; i++) {
      const next = this.canMove(target, this.player.direction);
      if (!next) break;
      target = next;
    }
    return target;
  }

  beginAiGhostMove(ghost) {
    const options = neighbors(this.cells, ghost);
    if (!options.length) return;
    const pacDistance = distance(this.cells, ghost, this.player);
    let target;
    if (this.powerTime > 0 && pacDistance <= 7) {
      options.sort((a, b) => distance(this.cells, b, this.player) - distance(this.cells, a, this.player));
      target = options[0];
    } else if (this.senseTime > 0 || pacDistance <= 6) target = this.ghostTarget(ghost);
    else {
      const patrol = FACE_ORDER[(ghost.patrolIndex + this.elapsed / 20 | 0) % FACE_ORDER.length];
      target = { face: patrol, x: 5, y: 5 };
      if (sameCell(ghost, target)) ghost.patrolIndex++;
    }
    const path = shortestPath(this.cells, ghost, target);
    const next = path[1] || options[0];
    this.beginMotion(ghost, next, 0.32);
  }

  collect() {
    const cell = this.cells.get(cellKey(this.player));
    if (!cell?.item) return;
    const item = cell.item;
    if (item === 'exit') {
      if (this.exitReady) this.finish('lost', '小精靈抵達出口');
      return;
    }
    cell.item = null;
    if (item === 'dot') this.dots++;
    if (item === 'core') this.cores++;
    if (item === 'power') this.powerTime = 6;
    this.onEvent('collect', { item, cell });
    if (this.exitReady) this.onEvent('exitReady');
  }

  stun(ghost) {
    ghost.inactive = 3;
    ghost.motion = null;
    ghost.queued = null;
    ghost.dashSteps = 0;
    ghost.pendingSkill = false;
    ghost.lastMove = null;
    Object.assign(ghost, GHOST_TYPES[ghost.id].spawn);
    this.onEvent('stun', ghost);
    if (ghost === this.activeGhost) this.switchGhost(true);
  }

  respawnPac() {
    const centers = FACE_ORDER.map(face => ({ face, x: 5, y: 5 }));
    centers.sort((a, b) => Math.min(...this.ghosts.map(ghost => distance(this.cells, b, ghost))) - Math.min(...this.ghosts.map(ghost => distance(this.cells, a, ghost))));
    Object.assign(this.player, centers[0], { motion: null, wait: 0.35, invulnerable: 2, lastMove: null });
  }

  checkCollisions() {
    if (this.status !== 'playing' || this.player.invulnerable > 0) return;
    for (const ghost of this.ghosts) {
      if (ghost.inactive > 0) continue;
      const same = sameCell(ghost, this.player);
      const exchange = ghost.lastMove && this.player.lastMove && Math.abs(ghost.lastMove.at - this.player.lastMove.at) < 0.25 && sameCell(ghost.lastMove.from, this.player.lastMove.to) && sameCell(ghost.lastMove.to, this.player.lastMove.from);
      if (!same && !exchange) continue;
      if (this.powerTime > 0) this.stun(ghost);
      else {
        this.captures++;
        this.onEvent('capture', ghost);
        if (this.captures >= CAPTURE_GOAL) this.finish('won', '鬼魂隊完成抓捕');
        else this.respawnPac();
      }
      ghost.lastMove = null;
      this.player.lastMove = null;
      return;
    }
  }

  finish(status, reason) {
    this.status = status;
    this.onEvent(status, reason);
  }

  update(dt) {
    if (this.status !== 'playing') return;
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.timeLeft = Math.max(0, MATCH_TIME - this.elapsed);
    if (this.timeLeft === 0) { this.finish('lost', '時間結束'); return; }
    this.powerTime = Math.max(0, this.powerTime - dt);
    this.senseTime = Math.max(0, this.senseTime - dt);
    this.switchTime = Math.max(0, this.switchTime - dt);
    this.player.invulnerable = Math.max(0, this.player.invulnerable - dt);
    this.player.slowTime = Math.max(0, this.player.slowTime - dt);
    this.traps = this.traps.filter(trap => (trap.time -= dt) > 0);
    if (this.activeGhost?.inactive > 0 && this.ghosts.some(ghost => ghost.inactive <= 0)) this.switchGhost(true);
    for (const ghost of this.ghosts) {
      ghost.cooldown = Math.max(0, ghost.cooldown - dt);
      ghost.inactive = Math.max(0, ghost.inactive - dt);
      if (ghost.inactive > 0) continue;
      if (ghost.motion) {
        ghost.motion.progress += dt / ghost.motion.duration;
        if (ghost.motion.progress >= 1) {
          const motion = ghost.motion;
          Object.assign(ghost, motion.to);
          ghost.motion = null;
          ghost.lastMove = { from: motion.from, to: motion.to, at: this.elapsed };
          if (motion.duration === 0.085 && ghost.dashSteps > 0) ghost.dashSteps--;
          if (ghost === this.activeGhost && motion.to.face !== motion.from.face) this.onEvent('cross', motion.to.face);
          this.checkCollisions();
          if (this.status !== 'playing') return;
          if (ghost.pendingSwitch) this.switchGhost(true);
          if (ghost.pendingSkill && ghost === this.activeGhost) this.activateSkill(ghost);
        }
      } else {
        ghost.wait -= dt;
        if (ghost.wait > 0) continue;
        if (ghost === this.activeGhost) {
          const direction = ghost.dashSteps > 0 ? ghost.direction : ghost.queued || ghost.direction;
          const next = this.canMove(ghost, direction);
          if (next) {
            if (ghost.dashSteps === 0) ghost.queued = null;
            this.beginMotion(ghost, next, ghost.dashSteps > 0 ? 0.085 : 0.19);
          } else {
            if (ghost.dashSteps > 0) ghost.dashSteps = 0;
            else ghost.queued = null;
          }
        } else this.beginAiGhostMove(ghost);
      }
    }
    const pac = this.player;
    if (pac.motion) {
      pac.motion.progress += dt / pac.motion.duration;
      if (pac.motion.progress >= 1) {
        const motion = pac.motion;
        Object.assign(pac, motion.to);
        pac.motion = null;
        pac.lastMove = { from: motion.from, to: motion.to, at: this.elapsed };
        for (const trap of this.traps) {
          if (sameCell(trap, pac)) { pac.slowTime = 2; trap.time = 0; this.onEvent('trap'); }
        }
        this.collect();
        this.checkCollisions();
      }
    } else {
      pac.wait -= dt;
      if (pac.wait <= 0) this.beginPacMove();
    }
  }
}

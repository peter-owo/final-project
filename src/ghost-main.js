import './style.css';
import { Game, GHOST_TYPES } from './ghost-game.js';
import { GameScene } from './scene.js';
import { FACE_NAMES, FACE_ORDER, SIZE, cellKey, distance } from './maze.js';

const $ = selector => document.querySelector(selector);
const overlay = $('#overlay');
const startButton = $('#start-button');
const statusEl = $('#status-message');
const mapCells = new Map();
let soundEnabled = true;
let audioContext;
let scene;

function tone(frequency, length = 0.1, type = 'sine') {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + length);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + length);
  } catch { /* Sound is optional. */ }
}

function setOverlay(title, description, buttonText, showSelection = true) {
  $('#overlay-title').innerHTML = title;
  $('#overlay-description').textContent = description;
  startButton.innerHTML = `${buttonText} <span>→</span>`;
  $('#selection-wrap').hidden = !showSelection;
  overlay.classList.remove('hidden');
  renderSelection();
}

function renderSelection() {
  $('#selection-count').textContent = `${game.selection.length} / 3`;
  startButton.disabled = game.status !== 'paused' && game.selection.length !== 3;
  $('#selection-grid').innerHTML = Object.values(GHOST_TYPES).map(type => {
    const index = game.selection.indexOf(type.id);
    return `<button type="button" class="selection-card ${index >= 0 ? 'selected' : ''}" data-ghost="${type.id}" style="--ghost-color:${type.color}" aria-pressed="${index >= 0}"><span class="selection-symbol">${type.symbol}</span><span class="selection-info"><strong>${type.name}</strong><small>${type.skill} · ${type.cooldown} 秒</small></span><span class="selection-number">${index >= 0 ? index + 1 : '+'}</span></button>`;
  }).join('');
}

function onEvent(type, detail) {
  if (type === 'selection') renderSelection();
  if (type === 'start' || type === 'resume') {
    scene?.syncItems();
    overlay.classList.add('hidden');
    statusEl.textContent = '切換三隻鬼魂，包抄 AI 小精靈！';
  }
  if (type === 'pause') setOverlay('暫停中<span>。</span>', '回到遊戲後，倒數與技能冷卻會繼續。', '繼續追捕', false);
  if (type === 'switch') { statusEl.textContent = `切換至${GHOST_TYPES[detail.id].name} · ${GHOST_TYPES[detail.id].skill}`; tone(560, 0.12); }
  if (type === 'switchBlocked') statusEl.textContent = '切換還在冷卻，稍等一下';
  if (type === 'cross') { statusEl.textContent = `跨到${FACE_NAMES[detail].split(' ')[0]}！`; tone(300, 0.12); }
  if (type === 'skill') { statusEl.textContent = `${GHOST_TYPES[detail.id].name}使用${GHOST_TYPES[detail.id].skill}！`; tone(820, 0.2, 'triangle'); }
  if (type === 'skillQueued') statusEl.textContent = '抵達下一格後施放技能';
  if (type === 'skillInvalid') statusEl.textContent = detail;
  if (type === 'trap') { statusEl.textContent = '小精靈踩到陷阱！'; tone(500, 0.18, 'square'); }
  if (type === 'stun') { statusEl.textContent = `${GHOST_TYPES[detail.id].name}被能量球反擊，暫時失能！`; tone(180, 0.35, 'sawtooth'); }
  if (type === 'collect') {
    scene?.syncItems();
    if (detail.item === 'power') { statusEl.textContent = '小精靈吃到能量球！現在要躲開牠'; tone(220, 0.35, 'sawtooth'); }
    if (detail.item === 'core') { statusEl.textContent = '小精靈取得一個核心！'; tone(670, 0.22); }
  }
  if (type === 'exitReady') { scene?.syncItems(); statusEl.textContent = '出口已開啟！快阻止小精靈'; }
  if (type === 'capture') { statusEl.textContent = `抓到小精靈！${game.captures} / ${game.captureGoal}`; tone(950, 0.3, 'triangle'); }
  if (type === 'won' || type === 'lost') {
    const success = type === 'won';
    setOverlay(success ? '鬼魂隊<span>獲勝！</span>' : '小精靈<span>逃脫了。</span>', `${detail} · 抓捕 ${game.captures} / ${game.captureGoal} 次 · 剩餘 ${Math.ceil(game.timeLeft)} 秒。可以調整隊伍再挑戰。`, '再玩一次');
    statusEl.textContent = success ? '包抄成功！' : '下一局換個組合試試';
    tone(success ? 940 : 170, 0.45, success ? 'triangle' : 'sawtooth');
  }
  updateHud();
}

const game = new Game(onEvent);

function buildMap() {
  const positions = { top: [2, 1], left: [1, 2], front: [2, 2], right: [3, 2], back: [4, 2], bottom: [2, 3] };
  const map = $('#mini-map');
  for (const face of FACE_ORDER) {
    const tile = document.createElement('div');
    tile.className = 'map-face';
    tile.dataset.face = face;
    tile.style.gridColumn = positions[face][0];
    tile.style.gridRow = positions[face][1];
    const grid = document.createElement('div');
    grid.className = 'map-grid';
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const point = document.createElement('i');
        point.className = 'map-cell';
        grid.appendChild(point);
        mapCells.set(cellKey({ face, x, y }), point);
      }
    }
    const name = document.createElement('span');
    name.className = 'map-face-name';
    name.textContent = FACE_NAMES[face].split(' ')[0];
    tile.append(grid, name);
    map.appendChild(tile);
  }
}

function updateMap() {
  for (const cell of game.cells.values()) {
    const classes = ['map-cell'];
    if (cell.wall) classes.push('wall');
    else if (cell.item === 'core') classes.push('core');
    else if (cell.item === 'exit' && game.exitReady) classes.push('exit');
    else if (cell.item === 'dot' || cell.item === 'power') classes.push('pellet');
    mapCells.get(cellKey(cell)).className = classes.join(' ');
  }
  for (const ghost of game.ghosts) {
    if (ghost.inactive > 0) continue;
    mapCells.get(cellKey(ghost))?.classList.add('ghost', ghost.id);
    if (ghost === game.activeGhost) mapCells.get(cellKey(ghost))?.classList.add('active-ghost');
  }
  const visible = game.senseTime > 0 || game.ghosts.some(ghost => ghost.inactive <= 0 && distance(game.cells, ghost, game.player) <= 6);
  if (visible) mapCells.get(cellKey(game.player))?.classList.add('pacman');
  document.querySelectorAll('.map-face').forEach(tile => tile.classList.toggle('active', tile.dataset.face === game.activeGhost?.face));
}

function updateHud() {
  const seconds = Math.ceil(game.timeLeft);
  $('#time-left').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#captures').textContent = `${game.captures} / ${game.captureGoal}`;
  $('#dots').textContent = `${Math.min(game.dots, game.dotGoal)} / ${game.dotGoal}`;
  $('#cores').textContent = `${game.cores} / 2`;
  $('#exit-status').textContent = game.exitReady ? '已開啟' : '未開啟';
  $('#power-timer').textContent = game.powerTime > 0 ? `危險 ${Math.ceil(game.powerTime)}s` : '安全';
  const active = game.activeGhost;
  $('#face-label').textContent = active ? `${GHOST_TYPES[active.id].symbol} ${FACE_NAMES[active.face]}` : '六面迷宮';
  $('#pause-button').textContent = game.status === 'paused' ? '▶' : 'Ⅱ';
  $('#team-hud').innerHTML = game.ghosts.map(ghost => {
    const type = GHOST_TYPES[ghost.id];
    const skill = ghost.inactive > 0 ? `失能 ${Math.ceil(ghost.inactive)}s` : ghost.cooldown > 0 ? `${Math.ceil(ghost.cooldown)}s` : 'READY';
    return `<div class="team-row ${ghost === active ? 'current' : ''}" style="--ghost-color:${type.color}"><span class="team-symbol">${type.symbol}</span><span class="team-info"><strong>${type.name}</strong><small>${FACE_NAMES[ghost.face].split(' ')[0]} · ${type.skill}</small></span><span class="team-timer">${skill}</span></div>`;
  }).join('');
  updateMap();
}

buildMap();
scene = new GameScene($('#game-view'), game);
scene.syncItems();
renderSelection();
updateHud();
setInterval(updateHud, 180);

$('#selection-grid').addEventListener('click', event => {
  const card = event.target.closest('[data-ghost]');
  if (card) game.toggleSelection(card.dataset.ghost);
});
startButton.addEventListener('click', () => game.start());
$('#pause-button').addEventListener('click', () => game.togglePause());
$('#sound-button').addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  $('#sound-button').classList.toggle('muted', !soundEnabled);
  $('#sound-button').setAttribute('aria-label', soundEnabled ? '關閉音效' : '開啟音效');
});
$('#mobile-switch').addEventListener('click', () => game.switchGhost());
$('#mobile-skill').addEventListener('click', () => game.useSkill());

const directions = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left', w: 'up', a: 'left', s: 'down', d: 'right' };
document.addEventListener('keydown', event => {
  const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
  if (directions[key]) { event.preventDefault(); game.queue(directions[key]); }
  else if (event.code === 'Space') { event.preventDefault(); if (!event.repeat) game.switchGhost(); }
  else if (key === 'e') { event.preventDefault(); if (!event.repeat) game.useSkill(); }
  else if (key === 'p' || key === 'Escape') { event.preventDefault(); if (!event.repeat) game.togglePause(); }
});

let touchStart;
$('#game-view').addEventListener('touchstart', event => { touchStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY }; }, { passive: true });
$('#game-view').addEventListener('touchend', event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 25) game.queue(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  touchStart = null;
}, { passive: true });

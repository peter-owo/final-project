import './style.css';
import { Game } from './game.js';
import { GameScene } from './scene.js';
import { FACE_NAMES, FACE_ORDER, SIZE, cellKey } from './maze.js';

const $ = selector => document.querySelector(selector);
const scoreEl = $('#score');
const bestEl = $('#best-score');
const remainingEl = $('#remaining');
const livesEl = $('#lives');
const faceEl = $('#face-label');
const statusEl = $('#status-message');
const overlay = $('#overlay');
const titleEl = $('#overlay-title');
const descriptionEl = $('#overlay-description');
const startButton = $('#start-button');
const pauseButton = $('#pause-button');
const soundButton = $('#sound-button');
const mapEl = $('#mini-map');
const mapCells = new Map();

let bestScore = 0;
try { bestScore = Number(localStorage.getItem('cube-man-best') || 0); } catch { /* private mode */ }
let soundEnabled = true;
let audioContext;
const formatScore = value => String(value).padStart(6, '0');

function tone(frequency, length = 0.08, type = 'sine', gain = 0.04) {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const osc = audioContext.createOscillator();
    const volume = audioContext.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    volume.gain.setValueAtTime(gain, audioContext.currentTime);
    volume.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + length);
    osc.connect(volume).connect(audioContext.destination);
    osc.start();
    osc.stop(audioContext.currentTime + length);
  } catch { /* audio is optional */ }
}

function setOverlay(title, description, buttonText) {
  titleEl.innerHTML = title;
  descriptionEl.textContent = description;
  startButton.innerHTML = `${buttonText} <span>→</span>`;
  overlay.classList.remove('hidden');
}

function hideOverlay() { overlay.classList.add('hidden'); }

function updateBest() {
  if (game.score <= bestScore) return;
  bestScore = game.score;
  try { localStorage.setItem('cube-man-best', String(bestScore)); } catch { /* private mode */ }
}

function onEvent(type, detail) {
  if (type === 'collect') {
    scene?.syncItems();
    statusEl.textContent = detail.item === 'dot' ? '吃到豆子！' : { power: '能量爆發！現在可以吃鬼魂', shield: '護盾已啟動', speed: '加速衝刺！' }[detail.item];
    tone(detail.item === 'dot' ? 440 + (game.stats.dots % 2) * 90 : 780, detail.item === 'dot' ? 0.045 : 0.25, 'square', 0.018);
  }
  if (type === 'cross') { statusEl.textContent = `進入${FACE_NAMES[detail].split(' ')[0]}！`; tone(260, 0.15, 'sine', 0.035); }
  if (type === 'ghost') { statusEl.textContent = '反擊成功！+200'; tone(980, 0.24, 'triangle'); }
  if (type === 'shield') { statusEl.textContent = '護盾擋住了鬼魂！'; tone(650, 0.2, 'sawtooth'); }
  if (type === 'hit') { statusEl.textContent = '被鬼魂抓到了！'; tone(170, 0.4, 'sawtooth', 0.06); }
  if (type === 'start' || type === 'resume') { scene?.syncItems(); hideOverlay(); statusEl.textContent = '吃光六個面的豆子！'; }
  if (type === 'pause') setOverlay('暫停中<span>。</span>', '休息一下，按下繼續即可返回迷宮。', '繼續遊戲');
  if (type === 'won' || type === 'lost') {
    updateBest();
    const report = `得分 ${formatScore(game.score)} · 吃掉 ${game.stats.dots} 顆豆子 · 走過 ${game.stats.faces.size} 個面 · 擊退 ${game.stats.ghosts} 隻鬼魂`;
    setOverlay(type === 'won' ? '全部吃光<span>！</span>' : '遊戲結束<span>。</span>', report, '再玩一次');
    statusEl.textContent = type === 'won' ? '六面迷宮成功通關！' : '下次再挑戰六面迷宮';
    tone(type === 'won' ? 880 : 190, 0.5, 'triangle');
  }
  updateHud();
}

const game = new Game(onEvent);
let scene;

function buildMap() {
  const positions = { top: [2, 1], left: [1, 2], front: [2, 2], right: [3, 2], back: [4, 2], bottom: [2, 3] };
  for (const face of FACE_ORDER) {
    const tile = document.createElement('div');
    tile.className = 'map-face';
    tile.dataset.face = face;
    tile.style.gridColumn = positions[face][0];
    tile.style.gridRow = positions[face][1];
    const name = document.createElement('span');
    name.className = 'map-face-name';
    name.textContent = FACE_NAMES[face].split(' ')[0];
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
    tile.append(grid, name);
    mapEl.appendChild(tile);
  }
}

function updateMap() {
  for (const cell of game.cells.values()) {
    const point = mapCells.get(cellKey(cell));
    point.className = `map-cell${cell.wall ? ' wall' : ''}${cell.item ? ' pellet' : ''}`;
  }
  for (const ghost of game.ghosts) if (ghost.inactive <= 0) mapCells.get(cellKey(ghost))?.classList.add('ghost');
  mapCells.get(cellKey(game.player))?.classList.add('player');
  document.querySelectorAll('.map-face').forEach(tile => tile.classList.toggle('active', tile.dataset.face === game.player.face));
}

function updateHud() {
  updateBest();
  scoreEl.textContent = formatScore(game.score);
  bestEl.textContent = formatScore(bestScore);
  remainingEl.textContent = String(game.remaining).padStart(3, '0');
  livesEl.innerHTML = Array.from({ length: 3 }, (_, index) => `<span class="life${index < game.lives ? '' : ' empty'}">◕</span>`).join('');
  faceEl.textContent = `● ${FACE_NAMES[game.player.face]}`;
  $('#power-timer').textContent = game.powerTime > 0 ? `${Math.ceil(game.powerTime)}s` : '—';
  $('#speed-timer').textContent = game.speedTime > 0 ? `${Math.ceil(game.speedTime)}s` : '—';
  $('#shield-status').textContent = game.shield ? 'READY' : '—';
  pauseButton.textContent = game.status === 'paused' ? '▶' : 'Ⅱ';
  updateMap();
}

buildMap();
scene = new GameScene($('#game-view'), game);
updateHud();
setInterval(updateHud, 150);

startButton.addEventListener('click', () => game.start());
pauseButton.addEventListener('click', () => game.togglePause());
soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  soundButton.classList.toggle('muted', !soundEnabled);
  soundButton.setAttribute('aria-label', soundEnabled ? '關閉音效' : '開啟音效');
});

const keyDirections = { ArrowUp: 'up', ArrowRight: 'right', ArrowDown: 'down', ArrowLeft: 'left' };
document.addEventListener('keydown', event => {
  if (keyDirections[event.key]) {
    event.preventDefault();
    if (game.status === 'ready') game.start();
    game.queue(keyDirections[event.key]);
  } else if (event.key.toLowerCase() === 'p' || event.key === 'Escape') {
    event.preventDefault();
    game.togglePause();
  }
});

let touchStart;
$('#game-view').addEventListener('touchstart', event => {
  touchStart = { x: event.changedTouches[0].clientX, y: event.changedTouches[0].clientY };
}, { passive: true });
$('#game-view').addEventListener('touchend', event => {
  if (!touchStart) return;
  const dx = event.changedTouches[0].clientX - touchStart.x;
  const dy = event.changedTouches[0].clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) > 25) {
    if (game.status === 'ready') game.start();
    game.queue(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  }
  touchStart = null;
}, { passive: true });

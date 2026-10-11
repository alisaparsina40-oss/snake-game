'use strict';

/* =========================================================
   Змейка — только мультиплеер (комната на 2 игрока).
   Хост авторитетен, гость предсказывает свою змейку и
   интерполирует змейку соперника — сетевой лаг почти не виден.
   ========================================================= */

/* ---------------- DOM ---------------- */

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const stage = canvas.parentElement;

const scoreEl = document.getElementById('score');
const foeScoreEl = document.getElementById('foeScore');
const hudEl = document.getElementById('hud');
const roomChipEl = document.getElementById('roomChip');
const roomCodeEl = document.getElementById('roomCode');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const gameOverEl = document.getElementById('gameOver');
const resultTitleEl = document.getElementById('resultTitle');
const finalYouEl = document.getElementById('finalYou');
const finalFoeEl = document.getElementById('finalFoe');
const restartBtn = document.getElementById('restartBtn');
const startMenuEl = document.getElementById('startMenu');
const roomInputEl = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const roomStatusEl = document.getElementById('roomStatus');

/* ---------------- настройки ---------------- */

const TICK = 80;                              // длительность одного шага (мс)
const COUNTDOWN_TICKS = Math.round(3000 / TICK);
const INTERP_DELAY = 110;                     // буфер для плавного соперника (мс)
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clientId = Math.random().toString(36).slice(2, 10);

let tileCount = 20;
let tileSize = 24;

/* ---------------- состояние ---------------- */

let role = null;               // 'host' | 'guest' | null
let roomCode = '';
let channel = null;
let db = null;
let opponentOnline = false;
let stateSeen = false;

let food = { x: 0, y: 0, type: 0 };

let mySnake = [];              // моя змейка
let foeSnake = [];             // змейка соперника

let myVel = { x: 1, y: 0 };
let myNext = { x: 1, y: 0 };
let foeVel = { x: 1, y: 0 };
let foeNext = { x: 1, y: 0 };

let scores = [0, 0];           // [хост, гость]
let countdown = 0;
let over = false;
let winner = 0;                // 1 хост, 2 гость, 0 ничья
let resultShown = false;
let roundActive = false;

let roundId = 0;               // хост увеличивает при старте раунда
let seenRound = -1;            // гость запоминает последний раунд

let simTick = 0;               // текущий тик симуляции (для предсказания гостя)
let dirHistory = [];           // гость: [{tick, x, y}] — история поворотов

let playerHue = Math.floor(Math.random() * 360);
let foeHue = (playerHue + 180) % 360;

let simLoop = null;
let joinTimer = null;
let hostGoneTimer = null;
let resizeTimer = null;

/* состояние интерполяции отрисовки */
let myPrevRender = [];
let myVelPrev = { x: 1, y: 0 };
let myTickStart = 0;

let foePrevRender = [];
let foeVelPrev = { x: 1, y: 0 };
let foeTickStart = 0;
let foeSnapshots = [];         // гость: [{ t, segs, vel }]

/* ---------------- утилиты ---------------- */

function cloneSegs(a) {
    return a.map(p => ({ x: p.x, y: p.y }));
}

function wrapCell(x, y) {
    if (x < 0) x = tileCount - 1;
    else if (x >= tileCount) x = 0;
    if (y < 0) y = tileCount - 1;
    else if (y >= tileCount) y = 0;
    return { x: x, y: y };
}

function isInList(list, x, y) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].x === x && list[i].y === y) return true;
    }
    return false;
}

function isOnSnake(x, y) {
    return isInList(mySnake, x, y) || isInList(foeSnake, x, y);
}

function placeFood() {
    let x, y, guard = 0;
    do {
        x = Math.floor(Math.random() * tileCount);
        y = Math.floor(Math.random() * tileCount);
        guard++;
    } while (isOnSnake(x, y) && guard < 200);
    food.x = x;
    food.y = y;
    food.type = Math.floor(Math.random() * FRUITS.length);
}

/* один шаг змейки без коллизий (для предсказания гостя) */
function stepCells(cells, dir) {
    const head = wrapCell(cells[0].x + dir.x, cells[0].y + dir.y);
    const out = [{ x: head.x, y: head.y }].concat(cells);
    const eats = head.x === food.x && head.y === food.y;
    if (!eats) out.pop();
    return out;
}

/* ---------------- звук ---------------- */

let AC = null;
function beep(f0, f1, dur, type, vol) {
    if (!AC) return;
    try {
        const o = AC.createOscillator();
        const g = AC.createGain();
        o.type = type || 'square';
        o.frequency.setValueAtTime(f0, AC.currentTime);
        if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), AC.currentTime + dur);
        g.gain.setValueAtTime(vol || 0.12, AC.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, AC.currentTime + dur);
        o.connect(g);
        g.connect(AC.destination);
        o.start();
        o.stop(AC.currentTime + dur);
    } catch (e) { /* ignore */ }
}

function sfx(name) {
    try {
        if (!AC) {
            const C = window.AudioContext || window.webkitAudioContext;
            if (!C) return;
            AC = new C();
        }
        if (AC.state === 'suspended') AC.resume();
    } catch (e) { return; }

    if (name === 'eat') beep(680, 1080, 0.09, 'square', 0.09);
    else if (name === 'start') beep(520, 900, 0.12, 'square', 0.1);
    else if (name === 'lose') beep(320, 70, 0.5, 'sawtooth', 0.14);
    else if (name === 'win') {
        [523, 659, 784, 1047].forEach((n, i) => setTimeout(() => beep(n, n, 0.13, 'square', 0.12), i * 110));
    }
    else if (name === 'ui') beep(620, 620, 0.05, 'square', 0.07);
}

/* ---------------- размеры ---------------- */

function availMinDim() {
    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    return Math.max(160, Math.min(availW, availH));
}

function fitCanvasTo(minDim) {
    tileSize = Math.max(10, Math.floor(minDim / tileCount));
    const size = tileSize * tileCount;
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';
}

function resizeCanvas() {
    const minDim = availMinDim();
    if (!roundActive) tileCount = Math.max(12, Math.min(40, Math.round(minDim / 26)));
    fitCanvasTo(minDim);
}

function applyTileCount(tc) {
    if (!tc || tc === tileCount) return;
    tileCount = tc;
    fitCanvasTo(availMinDim());
}

/* ---------------- рисование: фон / эффекты ---------------- */

function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#111c33');
    g.addColorStop(1, '#0b1224');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = 'rgba(148, 163, 184, 0.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < tileCount; i++) {
        ctx.moveTo(i * tileSize + 0.5, 0);
        ctx.lineTo(i * tileSize + 0.5, canvas.height);
        ctx.moveTo(0, i * tileSize + 0.5);
        ctx.lineTo(canvas.width, i * tileSize + 0.5);
    }
    ctx.stroke();

    const v = ctx.createRadialGradient(
        canvas.width / 2, canvas.height / 2, canvas.width * 0.25,
        canvas.width / 2, canvas.height / 2, canvas.width * 0.75
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function glow(cx, cy, r, color) {
    const g = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 2.1);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
}

function softShadow(cx, cy, rx, ry) {
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.filter = 'blur(2px)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function specular(cx, cy, r, dx, dy) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.ellipse(cx + dx, cy + dy, r * 0.3, r * 0.18, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(cx + dx * 1.15, cy + dy * 1.1, r * 0.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

/* ---------------- рисование: фрукты ---------------- */

function drawApple(cx, cy, r, t) {
    softShadow(cx, cy + r * 1.1, r * 0.85, r * 0.22);

    ctx.strokeStyle = '#7c4a1e';
    ctx.lineWidth = Math.max(1.5, r * 0.16);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.5);
    ctx.quadraticCurveTo(cx + r * 0.05, cy - r * 1.0, cx + r * 0.3, cy - r * 1.2);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx + r * 0.35, cy - r * 1.05);
    ctx.rotate(-0.55 + Math.sin(t * 2) * 0.08);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(r * 0.38, 0, r * 0.45, r * 0.19, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,78,30,0.7)';
    ctx.lineWidth = Math.max(1, r * 0.06);
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, 0);
    ctx.lineTo(r * 0.75, 0);
    ctx.stroke();
    ctx.restore();

    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy + r * 0.1, r * 1.3);
    g.addColorStop(0, '#ff9a9a');
    g.addColorStop(0.4, '#ef4444');
    g.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.55);
    ctx.bezierCurveTo(cx - r * 0.3, cy - r * 1.0, cx - r * 1.1, cy - r * 0.7, cx - r * 0.98, cy + r * 0.12);
    ctx.bezierCurveTo(cx - r * 0.92, cy + r * 0.85, cx - r * 0.35, cy + r * 1.05, cx, cy + r * 0.72);
    ctx.bezierCurveTo(cx + r * 0.35, cy + r * 1.05, cx + r * 0.92, cy + r * 0.85, cx + r * 0.98, cy + r * 0.12);
    ctx.bezierCurveTo(cx + r * 1.1, cy - r * 0.7, cx + r * 0.3, cy - r * 1.0, cx, cy - r * 0.55);
    ctx.closePath();
    ctx.fill();

    specular(cx, cy, r, -r * 0.32, -r * 0.3);
}

function drawOrange(cx, cy, r, t) {
    softShadow(cx, cy + r * 1.0, r * 0.85, r * 0.22);

    const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.25);
    g.addColorStop(0, '#ffd8a8');
    g.addColorStop(0.4, '#fb923c');
    g.addColorStop(1, '#9a3412');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.95, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    for (let i = 0; i < 26; i++) {
        const a = i * 2.399;
        const rad = r * 0.15 + (i % 5) * r * 0.16;
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, r * 0.055, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.05, cy - r * 0.95, r * 0.14, r * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(cx + r * 0.2, cy - r * 0.9);
    ctx.rotate(0.5 + Math.sin(t * 2) * 0.08);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(r * 0.3, 0, r * 0.36, r * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    specular(cx, cy, r, -r * 0.3, -r * 0.32);
}

function drawGrapes(cx, cy, r, t) {
    softShadow(cx, cy + r * 1.0, r * 0.8, r * 0.2);

    ctx.strokeStyle = '#7c4a1e';
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.55);
    ctx.quadraticCurveTo(cx + r * 0.1, cy - r * 1.1, cx - r * 0.1, cy - r * 1.35);
    ctx.stroke();

    ctx.save();
    ctx.translate(cx - r * 0.15, cy - r * 1.25);
    ctx.rotate(-0.3 + Math.sin(t * 2) * 0.08);
    ctx.fillStyle = '#22c55e';
    ctx.beginPath();
    ctx.ellipse(-r * 0.35, 0, r * 0.4, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const rows = [
        [{ x: 0, y: -0.5 }],
        [{ x: -0.45, y: -0.05 }, { x: 0.45, y: -0.05 }],
        [{ x: -0.7, y: 0.45 }, { x: 0, y: 0.45 }, { x: 0.7, y: 0.45 }],
        [{ x: -0.35, y: 0.95 }, { x: 0.35, y: 0.95 }],
        [{ x: 0, y: 1.4 }]
    ];

    rows.forEach(row => {
        row.forEach(p => {
            const gx = cx + p.x * r * 0.8;
            const gy = cy + p.y * r * 0.75;
            const g = ctx.createRadialGradient(gx - r * 0.2, gy - r * 0.22, r * 0.05, gx, gy, r * 0.5);
            g.addColorStop(0, '#c4b5fd');
            g.addColorStop(0.45, '#8b5cf6');
            g.addColorStop(1, '#4c1d95');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(gx, gy, r * 0.45, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.arc(gx - r * 0.14, gy - r * 0.16, r * 0.1, 0, Math.PI * 2);
            ctx.fill();
        });
    });
}

function drawStrawberry(cx, cy, r, t) {
    softShadow(cx, cy + r * 1.0, r * 0.75, r * 0.2);

    ctx.strokeStyle = '#166534';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy - r * 0.6);
    ctx.lineTo(cx + r * 0.1, cy - r * 1.15);
    ctx.stroke();

    const g = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r * 1.25);
    g.addColorStop(0, '#ff8fa3');
    g.addColorStop(0.4, '#f43f5e');
    g.addColorStop(1, '#881337');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.9, cy - r * 0.55);
    ctx.bezierCurveTo(cx - r * 0.95, cy + r * 0.15, cx - r * 0.5, cy + r * 0.75, cx, cy + r * 1.05);
    ctx.bezierCurveTo(cx + r * 0.5, cy + r * 0.75, cx + r * 0.95, cy + r * 0.15, cx + r * 0.9, cy - r * 0.55);
    ctx.bezierCurveTo(cx + r * 0.6, cy - r * 0.95, cx - r * 0.6, cy - r * 0.95, cx - r * 0.9, cy - r * 0.55);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fde68a';
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
            const sx = cx + (col - 1) * r * 0.42 + (row % 2 ? r * 0.2 : 0);
            const sy = cy - r * 0.35 + row * r * 0.4;
            if (sy > cy + r * 0.75) continue;
            ctx.beginPath();
            ctx.ellipse(sx, sy, r * 0.07, r * 0.1, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.fillStyle = '#22c55e';
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.3;
        ctx.save();
        ctx.translate(cx, cy - r * 0.55);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.ellipse(r * 0.3, 0, r * 0.36, r * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    specular(cx, cy, r, -r * 0.3, -r * 0.15);
}

function drawMelon(cx, cy, r, t) {
    softShadow(cx, cy + r * 0.95, r * 0.85, r * 0.2);

    const wob = Math.sin(t * 2) * 0.04;
    ctx.save();
    ctx.translate(cx, cy + r * 0.2);
    ctx.rotate(wob);

    ctx.fillStyle = '#166534';
    ctx.beginPath();
    ctx.arc(0, 0, r, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#bbf7d0';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.88, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    const g = ctx.createLinearGradient(0, -r * 0.8, 0, 0);
    g.addColorStop(0, '#fb7185');
    g.addColorStop(1, '#e11d48');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, Math.PI, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1c1917';
    for (let i = -2; i <= 2; i++) {
        ctx.save();
        ctx.translate(i * r * 0.3, -r * 0.32 - Math.abs(i) * r * 0.06);
        ctx.rotate(i * 0.2);
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.07, r * 0.11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.5, r * 0.2, r * 0.09, -0.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

function drawCherry(cx, cy, r, t) {
    softShadow(cx, cy + r * 1.0, r * 0.85, r * 0.2);

    const swing = Math.sin(t * 2) * 0.1;

    ctx.strokeStyle = '#7c4a1e';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.lineCap = 'round';

    const cherryA = { x: cx - r * 0.5, y: cy + r * 0.35 };
    const cherryB = { x: cx + r * 0.55, y: cy + r * 0.5 };

    ctx.beginPath();
    ctx.moveTo(cherryA.x, cherryA.y - r * 0.3);
    ctx.quadraticCurveTo(cx - r * 0.2 + swing * r, cy - r * 0.6, cx + swing * r, cy - r * 1.35);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cherryB.x, cherryB.y - r * 0.3);
    ctx.quadraticCurveTo(cx + r * 0.35 + swing * r, cy - r * 0.5, cx + swing * r, cy - r * 1.35);
    ctx.stroke();

    [cherryA, cherryB].forEach((p, i) => {
        const g = ctx.createRadialGradient(p.x - r * 0.18, p.y - r * 0.2, r * 0.05, p.x, p.y, r * 0.62);
        g.addColorStop(0, '#ff9a9a');
        g.addColorStop(0.4, '#ef4444');
        g.addColorStop(1, '#7f1d1d');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.arc(p.x - r * 0.15, p.y - r * 0.16, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
        if (i === 1) {
            ctx.fillStyle = 'rgba(0,0,0,0.18)';
            ctx.beginPath();
            ctx.arc(p.x + r * 0.16, p.y + r * 0.18, r * 0.3, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

const FRUITS = [drawApple, drawOrange, drawGrapes, drawStrawberry, drawMelon, drawCherry];

function drawFood(t) {
    const cx = food.x * tileSize + tileSize / 2;
    const cy = food.y * tileSize + tileSize / 2;
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    const bob = Math.sin(t * 3) * tileSize * 0.05;
    const r = tileSize * 0.36 * pulse;

    const colors = ['rgba(239,68,68,0.35)', 'rgba(251,146,60,0.35)', 'rgba(139,92,246,0.32)', 'rgba(244,63,94,0.32)', 'rgba(34,197,94,0.3)', 'rgba(239,68,68,0.32)'];
    glow(cx, cy + bob, r, colors[food.type] || colors[0]);

    FRUITS[food.type](cx, cy + bob, r, t);
}

/* ---------------- рисование: змейка ---------------- */

function drawConnector(x1, y1, x2, y2, tint, hue) {
    const dark = `hsl(${hue}, 55%, ${Math.max(22, 34 - tint * 0.12)}%)`;
    const mid = `hsl(${hue}, 60%, ${Math.max(32, 46 - tint * 0.18)}%)`;
    const light = `hsl(${hue}, 65%, ${Math.max(40, 58 - tint * 0.2)}%)`;

    ctx.lineCap = 'round';

    ctx.strokeStyle = dark;
    ctx.lineWidth = tileSize * 0.8;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = mid;
    ctx.lineWidth = tileSize * 0.6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.save();
    ctx.translate(-tileSize * 0.06, -tileSize * 0.1);
    ctx.strokeStyle = light;
    ctx.lineWidth = tileSize * 0.26;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

function drawSegment(cx, cy, index, t, vx, vy, hue) {
    const r = tileSize * 0.46;
    const isHead = index === 0;
    const lightness = Math.max(30, 58 - index * 0.9);

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = tileSize * 0.35;
    ctx.shadowOffsetY = tileSize * 0.14;

    const g = ctx.createRadialGradient(cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r * 1.15);
    if (isHead) {
        g.addColorStop(0, `hsl(${hue}, 60%, 90%)`);
        g.addColorStop(0.35, `hsl(${hue}, 70%, ${lightness + 8}%)`);
        g.addColorStop(1, `hsl(${hue + 5}, 65%, ${lightness - 22}%)`);
    } else {
        g.addColorStop(0, `hsl(${hue}, 65%, ${lightness + 12}%)`);
        g.addColorStop(0.4, `hsl(${hue}, 60%, ${lightness}%)`);
        g.addColorStop(1, `hsl(${hue + 5}, 60%, ${lightness - 24}%)`);
    }

    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();
    const shade = ctx.createLinearGradient(cx, cy, cx, cy + r);
    shade.addColorStop(0, 'rgba(0,0,0,0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.4)');
    ctx.fillStyle = shade;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.36, r * 0.3, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.34, cy - r * 0.4, r * 0.09, 0, Math.PI * 2);
    ctx.fill();

    if (isHead) drawHeadFace(cx, cy, r, t, vx, vy);
}

function drawHeadFace(cx, cy, r, t, vx, vy) {
    let fx = vx, fy = vy;
    if (fx === undefined || (fx === 0 && fy === 0)) { fx = 1; fy = 0; }
    const rx = -fy, ry = fx;

    const eyeForward = r * 0.34;
    const eyeSide = r * 0.44;
    const eyeR = r * 0.3;

    [1, -1].forEach(sgn => {
        const ex = cx + fx * eyeForward + rx * eyeSide * sgn;
        const ey = cy + fy * eyeForward + ry * eyeSide * sgn;

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0b1120';
        ctx.beginPath();
        ctx.arc(ex + fx * eyeR * 0.35, ey + fy * eyeR * 0.35, eyeR * 0.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.beginPath();
        ctx.arc(ex + fx * eyeR * 0.1 - eyeR * 0.25, ey + fy * eyeR * 0.1 - eyeR * 0.25, eyeR * 0.18, 0, Math.PI * 2);
        ctx.fill();
    });

    if (Math.sin(t * 7) > 0.55) {
        const len = r * 1.5;
        const sx = cx + fx * r * 0.8;
        const sy = cy + fy * r * 0.8;
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = Math.max(1.5, r * 0.12);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + fx * len * 0.5, sy + fy * len * 0.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(sx + fx * len * 0.5, sy + fy * len * 0.5);
        ctx.lineTo(sx + fx * len + rx * r * 0.3, sy + fy * len + ry * r * 0.3);
        ctx.moveTo(sx + fx * len * 0.5, sy + fy * len * 0.5);
        ctx.lineTo(sx + fx * len - rx * r * 0.3, sy + fy * len - ry * r * 0.3);
        ctx.stroke();
    }
}

/* нарисовать все копии с учётом заворачивания по краям */
function copyDraw(fx, fy, fn) {
    fn(fx, fy);
    const L = fx < 1.5, R = fx > tileCount - 1.5;
    const T = fy < 1.5, B = fy > tileCount - 1.5;
    if (L) fn(fx + tileCount, fy);
    if (R) fn(fx - tileCount, fy);
    if (T) fn(fx, fy + tileCount);
    if (B) fn(fx, fy - tileCount);
    if (L && T) fn(fx + tileCount, fy + tileCount);
    if (R && T) fn(fx - tileCount, fy + tileCount);
    if (L && B) fn(fx + tileCount, fy - tileCount);
    if (R && B) fn(fx - tileCount, fy - tileCount);
}

function cellCenter(fx, fy) {
    return { x: fx * tileSize + tileSize / 2, y: fy * tileSize + tileSize / 2 };
}

/* интерполяция между двумя состояниями змейки (плавное движение) */
function drawSnakeInterp(prev, next, vx, vy, alpha, hue, t) {
    let src = (next && next.length) ? next : prev;
    if (!src || !src.length) return;

    if (!prev || !next || prev.length !== next.length || prev.length === 0) {
        prev = src;
        next = src;
        alpha = 1;
    }

    const pos = [];
    for (let i = 0; i < next.length; i++) {
        const p = prev[i], n = next[i];
        let dx = n.x - p.x, dy = n.y - p.y;
        dx -= Math.round(dx / tileCount) * tileCount;
        dy -= Math.round(dy / tileCount) * tileCount;
        const cur = { x: p.x + dx * alpha, y: p.y + dy * alpha };
        if (i > 0) {
            const ox = pos[i - 1].x - cur.x;
            const oy = pos[i - 1].y - cur.y;
            cur.x += Math.round(ox / tileCount) * tileCount;
            cur.y += Math.round(oy / tileCount) * tileCount;
        }
        pos.push(cur);
    }

    for (let i = 0; i < pos.length - 1; i++) {
        const a = pos[i], b = pos[i + 1];
        copyDraw(a.x, a.y, (ax, ay) => {
            const ox = ax - a.x, oy = ay - a.y;
            const A = cellCenter(ax, ay);
            const B = cellCenter(b.x + ox, b.y + oy);
            drawConnector(A.x, A.y, B.x, B.y, i, hue);
        });
    }

    for (let i = pos.length - 1; i >= 0; i--) {
        const p = pos[i];
        copyDraw(p.x, p.y, (px, py) => {
            const c = cellCenter(px, py);
            drawSegment(c.x, c.y, i, t, vx, vy, hue);
        });
    }
}

function renderFoeHue() {
    if (Math.abs(foeHue - playerHue) < 40) return (foeHue + 180) % 360;
    return foeHue;
}

function drawSelf(t, now) {
    if (!mySnake.length) return;
    const alpha = Math.max(0, Math.min(1, (now - myTickStart) / TICK));
    drawSnakeInterp(myPrevRender, mySnake, myVel.x, myVel.y, alpha, playerHue, t);
}

function drawFoe(t, now) {
    const hue = renderFoeHue();

    if (role === 'host') {
        if (!foeSnake.length) return;
        const alpha = Math.max(0, Math.min(1, (now - foeTickStart) / TICK));
        drawSnakeInterp(foePrevRender, foeSnake, foeVel.x, foeVel.y, alpha, hue, t);
        return;
    }

    if (!foeSnapshots.length) return;
    const rt = now - INTERP_DELAY;
    let a = foeSnapshots[0];
    let b = foeSnapshots[foeSnapshots.length - 1];
    for (let i = 0; i < foeSnapshots.length - 1; i++) {
        if (foeSnapshots[i].t <= rt && foeSnapshots[i + 1].t >= rt) {
            a = foeSnapshots[i];
            b = foeSnapshots[i + 1];
            break;
        }
    }
    if (rt <= a.t || a === b) {
        drawSnakeInterp(a.segs, a.segs, a.vel.x, a.vel.y, 1, hue, t);
        return;
    }
    if (rt >= b.t) {
        drawSnakeInterp(b.segs, b.segs, b.vel.x, b.vel.y, 1, hue, t);
        return;
    }
    const alpha = (rt - a.t) / Math.max(1, b.t - a.t);
    drawSnakeInterp(a.segs, b.segs, a.vel.x, a.vel.y, alpha, hue, t);
}

function drawCountdown() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.floor(tileSize * 3)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, tileSize * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(String(countdown), canvas.width / 2, canvas.height / 2);
    ctx.restore();
}

/* ---------------- ввод ---------------- */

function handleDir(x, y) {
    if (!role || !roundActive || over || countdown > 0) return;

    if (role === 'host') {
        if (x === -myVel.x && y === -myVel.y) return;
        if (x === -myNext.x && y === -myNext.y) return;
        myNext = { x: x, y: y };
        return;
    }

    if (x === -myVel.x && y === -myVel.y) return;
    if (x === -myNext.x && y === -myNext.y) return;
    myNext = { x: x, y: y };
    dirHistory.push({ tick: simTick + 1, x: x, y: y });
    mpSend('dir', [x, y]);
}

document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    const code = e.code || '';
    const key = (e.key || '').toLowerCase();

    const isUp = code === 'ArrowUp' || code === 'KeyW' || key === 'w' || key === 'ц';
    const isDown = code === 'ArrowDown' || code === 'KeyS' || key === 's' || key === 'ы';
    const isLeft = code === 'ArrowLeft' || code === 'KeyA' || key === 'a' || key === 'ф';
    const isRight = code === 'ArrowRight' || code === 'KeyD' || key === 'd' || key === 'в';

    if (isUp) { e.preventDefault(); handleDir(0, -1); }
    else if (isDown) { e.preventDefault(); handleDir(0, 1); }
    else if (isLeft) { e.preventDefault(); handleDir(-1, 0); }
    else if (isRight) { e.preventDefault(); handleDir(1, 0); }
    else if (code === 'Enter' && over) {
        restartRound();
    }
});

let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });

canvas.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const absDx = Math.abs(dx), absDy = Math.abs(dy);
    if (Math.max(absDx, absDy) < 30) return;
    if (absDx > absDy) handleDir(dx > 0 ? 1 : -1, 0);
    else handleDir(0, dy > 0 ? 1 : -1);
    e.preventDefault();
}, { passive: false });

/* ---------------- интерфейс ---------------- */

function mpStatus(text) { roomStatusEl.textContent = text; }
function hud(on) { hudEl.classList.toggle('hidden', !on); }

function setMenuWaiting(inRoom) {
    createRoomBtn.classList.toggle('hidden', inRoom);
    joinRoomBtn.classList.toggle('hidden', inRoom);
    roomInputEl.classList.toggle('hidden', inRoom);
}

function updateHud() {
    const mine = role === 'host' ? scores[0] : scores[1];
    const foe = role === 'host' ? scores[1] : scores[0];
    scoreEl.textContent = mine;
    foeScoreEl.textContent = foe;
}

function showResult() {
    resultShown = true;
    const iWon = (winner === 1 && role === 'host') || (winner === 2 && role === 'guest');
    if (winner === 0) {
        resultTitleEl.textContent = 'НИЧЬЯ';
        resultTitleEl.className = 'result draw';
    } else if (iWon) {
        resultTitleEl.textContent = 'ПОБЕДА';
        resultTitleEl.className = 'result winner';
        sfx('win');
    } else {
        resultTitleEl.textContent = 'ПОРАЖЕНИЕ';
        resultTitleEl.className = 'result loser';
        sfx('lose');
    }

    const mine = role === 'host' ? scores[0] : scores[1];
    const foe = role === 'host' ? scores[1] : scores[0];
    finalYouEl.textContent = mine;
    finalFoeEl.textContent = foe;
    gameOverEl.classList.remove('hidden');
}

function hideResult() {
    resultShown = false;
    gameOverEl.classList.add('hidden');
}

function restartRound() {
    if (role === 'host') {
        startRound();
    } else if (role === 'guest') {
        mpSend('again', {});
        mpStatus('Ждём соперника…');
    }
}

restartBtn.addEventListener('click', restartRound);

/* ---------------- цикл симуляции ---------------- */

function startSim(fn) {
    stopSim();
    simLoop = setInterval(fn, TICK);
}

function stopSim() {
    if (simLoop) { clearInterval(simLoop); simLoop = null; }
}

/* ---------------- сеть ---------------- */

function mpSend(event, payload) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: event, payload: payload });
}

function mpRandomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    return code;
}

/* -------- хост: авторитетная симуляция -------- */

function hostTick() {
    if (over || !mySnake.length) return;
    myTickStart = performance.now();
    foeTickStart = myTickStart;

    if (countdown > 0) {
        countdown--;
        broadcast();
        return;
    }

    myPrevRender = cloneSegs(mySnake);
    myVelPrev = { x: myVel.x, y: myVel.y };
    foePrevRender = cloneSegs(foeSnake);
    foeVelPrev = { x: foeVel.x, y: foeVel.y };

    simTick++;
    myVel = { x: myNext.x, y: myNext.y };
    foeVel = { x: foeNext.x, y: foeNext.y };

    const h1 = wrapCell(mySnake[0].x + myVel.x, mySnake[0].y + myVel.y);
    const h2 = wrapCell(foeSnake[0].x + foeVel.x, foeSnake[0].y + foeVel.y);

    mySnake.unshift(h1);
    foeSnake.unshift(h2);

    const eat1 = h1.x === food.x && h1.y === food.y;
    const eat2 = h2.x === food.x && h2.y === food.y;

    const selfHit1 = isInList(mySnake.slice(1), h1.x, h1.y);
    const selfHit2 = isInList(foeSnake.slice(1), h2.x, h2.y);
    const cross1 = isInList(foeSnake, h1.x, h1.y);
    const cross2 = isInList(mySnake, h2.x, h2.y);

    const alive1 = !selfHit1 && !cross1;
    const alive2 = !selfHit2 && !cross2;

    if (!eat1) mySnake.pop();
    if (!eat2) foeSnake.pop();

    if (alive1 && eat1) { scores[0]++; sfx('eat'); }
    if (alive2 && eat2) { scores[1]++; sfx('eat'); }
    if ((alive1 && eat1) || (alive2 && eat2)) placeFood();

    updateHud();

    if (!alive1 || !alive2) {
        over = true;
        winner = alive1 && !alive2 ? 1 : (!alive1 && alive2 ? 2 : 0);
        showResult();
        broadcast();
        return;
    }

    broadcast();
}

function broadcast() {
    if (!channel) return;
    mpSend('state', {
        n: simTick,
        r: roundId,
        tc: tileCount,
        h: mySnake.map(p => [p.x, p.y]),
        g: foeSnake.map(p => [p.x, p.y]),
        hv: [myVel.x, myVel.y],
        gv: [foeVel.x, foeVel.y],
        f: [food.x, food.y, food.type],
        sc: [scores[0], scores[1]],
        c: countdown,
        over: over,
        w: winner,
        sk: [playerHue, foeHue]
    });
}

/* -------- гость: предсказание своей змейки -------- */

function dirAtTick(tick) {
    let d = null;
    for (let i = 0; i < dirHistory.length; i++) {
        if (dirHistory[i].tick <= tick) d = dirHistory[i];
        else break;
    }
    return d ? { x: d.x, y: d.y } : null;
}

function guestTick() {
    if (over || !mySnake.length) return;
    myTickStart = performance.now();
    if (countdown > 0) return;

    myPrevRender = cloneSegs(mySnake);
    myVelPrev = { x: myVel.x, y: myVel.y };

    simTick++;
    myVel = { x: myNext.x, y: myNext.y };
    mySnake = stepCells(mySnake, myVel);
}

function reconcile(st) {
    // змейка хоста -> буфер для плавной интерполяции
    foeSnapshots.push({
        t: performance.now(),
        segs: st.h.map(a => ({ x: a[0], y: a[1] })),
        vel: { x: st.hv[0], y: st.hv[1] }
    });
    if (foeSnapshots.length > 10) foeSnapshots.shift();

    // своя змейка: база от хоста + повтор своих поворотов
    const base = st.g.map(a => ({ x: a[0], y: a[1] }));
    let dir = { x: st.gv[0], y: st.gv[1] };
    const fromTick = st.n;

    if (fromTick > simTick) simTick = fromTick;

    let predicted = base;
    for (let tick = fromTick + 1; tick <= simTick; tick++) {
        const d = dirAtTick(tick);
        if (d) dir = d;
        predicted = stepCells(predicted, dir);
    }

    mySnake = predicted;
    myVel = dir;

    // подчистить историю
    const cut = simTick - 60;
    while (dirHistory.length && dirHistory[0].tick <= cut) dirHistory.shift();
}

function onState(st) {
    if (role !== 'guest' || !st || !st.h || !st.g) return;
    stateSeen = true;

    if (st.tc) applyTileCount(st.tc);

    const newRound = st.r !== seenRound;
    if (newRound) {
        seenRound = st.r;
        roundActive = true;
        over = false;
        resultShown = false;
        winner = 0;
        scores = [0, 0];
        dirHistory = [];
        foeSnapshots = [];
        myNext = { x: 1, y: 0 };
        myVel = { x: 1, y: 0 };
        simTick = st.n;
        mySnake = st.g.map(a => ({ x: a[0], y: a[1] }));
        myPrevRender = cloneSegs(mySnake);
        myVelPrev = { x: 1, y: 0 };
        myTickStart = performance.now();
        foeSnapshots.push({
            t: performance.now(),
            segs: st.h.map(a => ({ x: a[0], y: a[1] })),
            vel: { x: st.hv[0], y: st.hv[1] }
        });
        hideResult();
        startMenuEl.classList.add('hidden');
        hud(true);
        setMenuWaiting(true);
        startSim(guestTick);
        sfx('start');
    }

    reconcile(st);

    food = { x: st.f[0], y: st.f[1], type: st.f[2] };
    scores = [st.sc[0], st.sc[1]];
    countdown = st.c;
    foeHue = (st.sk && typeof st.sk[0] === 'number') ? st.sk[0] : foeHue;

    updateHud();

    if (st.over) {
        over = true;
        winner = st.w;
        if (!resultShown) showResult();
    } else if (resultShown) {
        hideResult();
    }

    mpStatus(countdown > 0 ? 'Отсчёт…' : 'Бой! Комната: ' + roomCode);
}

function onDir(p) {
    if (role !== 'host' || !p) return;
    const dx = p[0], dy = p[1];
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    if (dx === -foeVel.x && dy === -foeVel.y) return;
    if (dx === -foeNext.x && dy === -foeNext.y) return;
    foeNext = { x: dx, y: dy };
}

/* -------- старт раунда (host) -------- */

function startRound() {
    const midY = Math.floor(tileCount / 2);
    const col = Math.max(3, Math.floor(tileCount * 0.35));
    const gap = Math.max(2, Math.floor(tileCount * 0.2));
    const row1 = Math.max(1, midY - gap);
    const row2 = Math.min(tileCount - 2, midY + gap);

    mySnake = [{ x: col, y: row1 }, { x: col - 1, y: row1 }, { x: col - 2, y: row1 }];
    foeSnake = [{ x: col, y: row2 }, { x: col - 1, y: row2 }, { x: col - 2, y: row2 }];

    myVel = { x: 1, y: 0 }; myNext = { x: 1, y: 0 };
    foeVel = { x: 1, y: 0 }; foeNext = { x: 1, y: 0 };
    myPrevRender = cloneSegs(mySnake);
    myVelPrev = { x: 1, y: 0 };
    foePrevRender = cloneSegs(foeSnake);
    foeVelPrev = { x: 1, y: 0 };
    myTickStart = performance.now();
    foeTickStart = myTickStart;

    scores = [0, 0];
    over = false;
    resultShown = false;
    winner = 0;
    countdown = COUNTDOWN_TICKS;
    simTick = 0;
    roundActive = true;
    roundId++;
    dirHistory = [];
    foeSnapshots = [];

    placeFood();
    hideResult();
    startMenuEl.classList.add('hidden');
    hud(true);
    setMenuWaiting(true);
    updateHud();
    mpStatus('Код: ' + roomCode + ' — раунд начинается!');
    sfx('start');

    startSim(hostTick);
    broadcast();
}

/* -------- присутствие / подключение -------- */

function onPresence() {
    if (!channel) return;
    const count = Object.keys(channel.presenceState()).length;

    if (role === 'guest') {
        if (count < 2 && stateSeen) {
            if (!hostGoneTimer) {
                hostGoneTimer = setTimeout(() => {
                    hostGoneTimer = null;
                    if (channel && stateSeen && Object.keys(channel.presenceState()).length < 2) {
                        leaveRoom();
                        mpStatus('Соперник вышел');
                    }
                }, 2000);
            }
        } else if (hostGoneTimer) {
            clearTimeout(hostGoneTimer);
            hostGoneTimer = null;
        }
        return;
    }

    if (role !== 'host') return;

    if (count >= 2) {
        if (!opponentOnline) {
            opponentOnline = true;
            mpStatus('Соперник найден!');
            startRound();
        }
        return;
    }

    if (opponentOnline) {
        opponentOnline = false;
        mpStatus('Соперник вышел. Ждём нового… Код: ' + roomCode);
        if (!over) {
            over = true;
            winner = 1;
            updateHud();
            showResult();
            stopSim();
            broadcast();
        }
    }
}

function connectRoom(code, asHost) {
    if (!db) {
        mpStatus('Ошибка: Supabase не настроен (supabase-config.js)');
        return;
    }

    leaveRoom(true);

    role = asHost ? 'host' : 'guest';
    roomCode = code;
    stateSeen = false;
    roundActive = false;
    over = false;
    resultShown = false;
    opponentOnline = false;
    seenRound = -1;
    roundId = 0;

    roomCodeEl.textContent = code;
    roomChipEl.classList.remove('hidden');
    leaveRoomBtn.classList.remove('hidden');
    startMenuEl.classList.remove('hidden');
    hud(false);
    setMenuWaiting(true);

    channel = db.channel('snake-room-' + code, {
        config: { presence: { key: clientId }, broadcast: { self: false } }
    });

    channel.on('broadcast', { event: 'state' }, (msg) => { stateSeen = true; onState(msg.payload); });
    channel.on('broadcast', { event: 'dir' }, (msg) => onDir(msg.payload));
    channel.on('broadcast', { event: 'skin' }, (msg) => {
        if (role === 'host' && msg.payload && typeof msg.payload.hue === 'number') foeHue = msg.payload.hue;
    });
    channel.on('broadcast', { event: 'again' }, () => {
        if (role === 'host' && over) startRound();
    });
    channel.on('presence', { event: 'sync' }, onPresence);

    let subscribeRetries = 0;

    const onStatus = (status) => {
        if (!channel) return;

        if (status === 'SUBSCRIBED') {
            subscribeRetries = 0;
            channel.track({ role: role, id: clientId });
            if (role === 'host') {
                mpStatus('Комната ' + code + ' — ждём соперника…');
            } else {
                mpSend('skin', { hue: playerHue });
                mpStatus('Подключение к комнате ' + code + '…');
                clearTimeout(joinTimer);
                joinTimer = setTimeout(() => {
                    if (channel && !stateSeen) {
                        leaveRoom();
                        mpStatus('Комната не найдена');
                    }
                }, 7000);
            }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            if (subscribeRetries < 5) {
                subscribeRetries++;
                mpStatus('Плохая связь с Realtime — переподключаемся… (' + subscribeRetries + '/5)');
                clearTimeout(joinTimer);
                setTimeout(() => {
                    if (channel) channel.subscribe(onStatus);
                }, 1000 * subscribeRetries);
            } else {
                mpStatus('Не удалось подключиться. Проверьте интернет и обновите страницу.');
            }
        }
    };

    channel.subscribe(onStatus);
}

function leaveRoom(silent) {
    clearTimeout(joinTimer);
    clearTimeout(hostGoneTimer);
    joinTimer = null;
    hostGoneTimer = null;
    stopSim();

    if (channel) {
        try { channel.unsubscribe(); } catch (e) { /* ignore */ }
        channel = null;
    }

    const wasInRoom = !!role;
    role = null;
    roomCode = '';
    opponentOnline = false;
    stateSeen = false;
    roundActive = false;
    over = false;
    countdown = 0;
    seenRound = -1;
    roundId = 0;
    winner = 0;
    resultShown = false;
    mySnake = [];
    foeSnake = [];
    foeSnapshots = [];
    dirHistory = [];

    roomChipEl.classList.add('hidden');
    leaveRoomBtn.classList.add('hidden');
    hud(false);
    hideResult();

    if (!silent) {
        startMenuEl.classList.remove('hidden');
        setMenuWaiting(false);
        if (wasInRoom) mpStatus('Создай комнату или введи код друга');
    }
}

createRoomBtn.addEventListener('click', () => {
    const code = mpRandomCode();
    roomInputEl.value = code;
    connectRoom(code, true);
});

joinRoomBtn.addEventListener('click', () => {
    const code = (roomInputEl.value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
        mpStatus('Код — 4 символа (буквы и цифры)');
        return;
    }
    connectRoom(code, false);
});

leaveRoomBtn.addEventListener('click', () => leaveRoom());

roomInputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinRoomBtn.click();
});

/* ---------------- полный экран ---------------- */

function updateFullscreenIcons() {
    const isFs = !!document.fullscreenElement;
    const ex = fullscreenBtn.querySelector('.icon-expand');
    const co = fullscreenBtn.querySelector('.icon-compress');
    if (ex) ex.classList.toggle('hidden', isFs);
    if (co) co.classList.toggle('hidden', !isFs);
}

fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
});

document.addEventListener('fullscreenchange', updateFullscreenIcons);

/* ---------------- инициализация ---------------- */

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        db = null;
    }
}

window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 80);
});

function renderFrame(now) {
    const t = now / 1000;
    drawBackground();
    if (roundActive && (mySnake.length || foeSnake.length)) {
        drawFood(t);
        drawFoe(t, now);
        drawSelf(t, now);
        if (countdown > 0) drawCountdown();
    }
    requestAnimationFrame(renderFrame);
}

resizeCanvas();
hud(false);
updateHud();
updateFullscreenIcons();
if (!db) mpStatus('Supabase не настроен: проверь supabase-config.js');
requestAnimationFrame(renderFrame);

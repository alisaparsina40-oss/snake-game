const canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d');
const stage = canvas.parentElement;

const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');
const gameOverEl = document.getElementById('gameOver');
const finalScoreEl = document.getElementById('finalScore');
const restartBtn = document.getElementById('restartBtn');
const pauseEl = document.getElementById('pause');
const dirBtns = document.querySelectorAll('.dir-btn');
const tabs = document.querySelectorAll('.tab');
const panels = document.querySelectorAll('.panel');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const panelsEl = document.getElementById('panels');
const leadersListEl = document.getElementById('leadersList');
const playerNameEl = document.getElementById('playerName');
const saveScoreBtn = document.getElementById('saveScoreBtn');
const saveStatusEl = document.getElementById('saveStatus');
const authGuestBox = document.getElementById('authGuest');
const authUserBox = document.getElementById('authUserBox');
const authEmailEl = document.getElementById('authEmail');
const authPassEl = document.getElementById('authPass');
const authLoginBtn = document.getElementById('authLoginBtn');
const authSignupBtn = document.getElementById('authSignupBtn');
const authLogoutBtn = document.getElementById('authLogoutBtn');
const authWhoEl = document.getElementById('authWho');
const authStatusEl = document.getElementById('authStatus');
const foeChipEl = document.getElementById('foeChip');
const foeScoreEl = document.getElementById('foeScore');
const resultTitleEl = document.getElementById('resultTitle');
const soloResultEl = document.getElementById('soloResult');
const mpResultEl = document.getElementById('mpResult');
const mpScoreYouEl = document.getElementById('mpScoreYou');
const mpScoreFoeEl = document.getElementById('mpScoreFoe');
const roomInputEl = document.getElementById('roomInput');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const leaveRoomBtn = document.getElementById('leaveRoomBtn');
const roomStatusEl = document.getElementById('roomStatus');

const INITIAL_SPEED = 150;
const SPEED_INCREASE = 1.5;
const MIN_SPEED = 70;

let tileCount = 20;
let tileSize = 24;
let gameLoopId = null;
let isPaused = false;
let isGameOver = false;

let snake = [];
let food = { x: 0, y: 0, type: 0 };
let velocityX = 1;
let velocityY = 0;
let nextVelocityX = 1;
let nextVelocityY = 0;
let score = 0;
let isSubmitted = false;
let lastScoreValue = 0;

/* multiplayer */
let mode = 'solo';
let role = null;
let roomCode = '';
let channel = null;
let mpSelf = [];
let mpOther = [];
let mpSelfVel = { x: 1, y: 0 };
let mpOtherVel = { x: -1, y: 0 };
let mpOtherNext = { x: -1, y: 0 };
let mpCountdown = 0;
let mpOver = false;
let mpWinner = 0;
let mpScores = [0, 0];
let mpOpponentOnline = false;
let mpOverlayShown = false;
let mpJoinTimer = null;
let mpHostGoneTimer = null;

/* wardrobe */
const DEFAULT_SKIN = { hue: 145, pattern: 'none', hat: 'none' };

function loadSkin() {
    try {
        const s = JSON.parse(localStorage.getItem('snakeSkin'));
        if (s && typeof s.hue === 'number') {
            return { hue: s.hue, pattern: s.pattern || 'none', hat: s.hat || 'none' };
        }
    } catch (e) { }
    return { hue: DEFAULT_SKIN.hue, pattern: DEFAULT_SKIN.pattern, hat: DEFAULT_SKIN.hat };
}

function saveSkin() {
    localStorage.setItem('snakeSkin', JSON.stringify(playerSkin));
}

const BASE_HUE = 145;

function loadUnlocks() {
    try {
        const u = JSON.parse(localStorage.getItem('snakeUnlocks'));
        if (u && Array.isArray(u.hues) && u.hues.indexOf(BASE_HUE) >= 0) {
            return {
                hues: u.hues,
                patterns: Array.isArray(u.patterns) && u.patterns.length ? u.patterns : ['none'],
                hats: Array.isArray(u.hats) && u.hats.length ? u.hats : ['none'],
                chests: Math.max(0, parseInt(u.chests) || 0)
            };
        }
    } catch (e) { }
    return { hues: [BASE_HUE], patterns: ['none'], hats: ['none'], chests: 0 };
}

function saveUnlocks() {
    localStorage.setItem('snakeUnlocks', JSON.stringify(unlocks));
}

let unlocks = loadUnlocks();
let playerSkin = loadSkin();
if (unlocks.hues.indexOf(playerSkin.hue) < 0) playerSkin.hue = BASE_HUE;
if (unlocks.patterns.indexOf(playerSkin.pattern) < 0) playerSkin.pattern = 'none';
if (unlocks.hats.indexOf(playerSkin.hat) < 0) playerSkin.hat = 'none';
let mpOtherSkin = { hue: 210, pattern: 'none', hat: 'none' };

let previewSkin = null;

function activeLook() {
    const inWardrobe = wardPanelEl && wardPanelEl.classList.contains('active');
    return (previewSkin && inWardrobe) ? previewSkin : playerSkin;
}
let highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
let speed = INITIAL_SPEED;

highScoreEl.textContent = highScore;

/* ---------------- tabs ---------------- */

tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const panel = document.getElementById('panel-' + tab.dataset.panel);
        panel.classList.add('active');

        const id = tab.dataset.panel;
        const isLeaders = id === 'leaders';
        panelsEl.classList.toggle('tall', isLeaders || id === 'auth' || id === 'mp' || id === 'wardrobe');
        if (isLeaders) refreshLeaders();
        if (id === 'wardrobe') {
            previewSkin = null;
            skinNameEl.value = playerNameEl.value || localStorage.getItem('snakeName') || '';
            setWardStatus('Кликни любую вещь — примерь её на змейке');
            wardMarkActive();
        } else if (previewSkin) {
            previewSkin = null;
            wardMarkActive();
        }
        setTimeout(resizeCanvas, 0);
    });
});

if (window.matchMedia('(hover: none) and (pointer: coarse)').matches) {
    tabs[0].classList.remove('active');
    panels[0].classList.remove('active');
    tabs[2].classList.add('active');
    panels[2].classList.add('active');
}

/* ---------------- fullscreen ---------------- */

function updateFullscreenIcons() {
    const isFs = !!document.fullscreenElement;
    fullscreenBtn.querySelector('.icon-expand').classList.toggle('hidden', isFs);
    fullscreenBtn.querySelector('.icon-compress').classList.toggle('hidden', !isFs);
}

fullscreenBtn.addEventListener('click', () => {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen();
    }
});

document.addEventListener('fullscreenchange', updateFullscreenIcons);

/* ---------------- sizing ---------------- */

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
    const inMpRound = mode === 'mp' && mpSelf.length > 0;

    if (!inMpRound) {
        tileCount = Math.max(12, Math.min(40, Math.round(minDim / 26)));
    }
    fitCanvasTo(minDim);

    snake.forEach(s => {
        s.x = ((s.x % tileCount) + tileCount) % tileCount;
        s.y = ((s.y % tileCount) + tileCount) % tileCount;
    });
    food.x = ((food.x % tileCount) + tileCount) % tileCount;
    food.y = ((food.y % tileCount) + tileCount) % tileCount;
}

// гость подстраивает сетку под хоста
function applyTileCount(tc) {
    if (tc === tileCount) return;
    tileCount = tc;
    fitCanvasTo(availMinDim());
}

/* ---------------- fruits ---------------- */

const FRUITS = [drawApple, drawOrange, drawGrapes, drawStrawberry, drawMelon, drawCherry];

function placeFood() {
    let x, y;
    do {
        x = Math.floor(Math.random() * tileCount);
        y = Math.floor(Math.random() * tileCount);
    } while (isOnSnake(x, y));

    food.x = x;
    food.y = y;
    food.type = Math.floor(Math.random() * FRUITS.length);
}

function isInList(list, x, y) {
    for (let i = 0; i < list.length; i++) {
        if (list[i].x === x && list[i].y === y) return true;
    }
    return false;
}

function isOnSnake(x, y) {
    if (mode === 'mp') {
        return isInList(mpSelf, x, y) || isInList(mpOther, x, y);
    }
    return isInList(snake, x, y);
}

/* ---------------- game flow ---------------- */

function initGame() {
    resizeCanvas();

    snake = [];
    const startX = Math.floor(tileCount / 2);
    const startY = Math.floor(tileCount / 2);
    for (let i = 0; i < 3; i++) {
        snake.push({ x: startX - i, y: startY });
    }

    velocityX = 1;
    velocityY = 0;
    nextVelocityX = 1;
    nextVelocityY = 0;

    score = 0;
    speed = INITIAL_SPEED;
    scoreEl.textContent = score;

    isGameOver = false;
    isPaused = false;
    gameOverEl.classList.add('hidden');
    pauseEl.classList.add('hidden');
    foeChipEl.classList.add('hidden');

    placeFood();
    clearInterval(gameLoopId);
    gameLoopId = setInterval(gameLoop, speed);
}

function gameLoop() {
    if (isPaused || isGameOver) return;

    if (mode === 'mp') {
        mpHostTick();
        return;
    }

    velocityX = nextVelocityX;
    velocityY = nextVelocityY;

    let hx = snake[0].x + velocityX;
    let hy = snake[0].y + velocityY;

    // выход из противоположной стены
    if (hx < 0) hx = tileCount - 1;
    else if (hx >= tileCount) hx = 0;
    if (hy < 0) hy = tileCount - 1;
    else if (hy >= tileCount) hy = 0;

    const head = { x: hx, y: hy };

    for (let i = 1; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            gameOver();
            return;
        }
    }

    snake.unshift(head);

    if (head.x === food.x && head.y === food.y) {
        score++;
        scoreEl.textContent = score;

        if (score > highScore) {
            highScore = score;
            highScoreEl.textContent = highScore;
            localStorage.setItem('snakeHighScore', highScore);
        }

        speed = Math.max(MIN_SPEED, speed - SPEED_INCREASE);
        clearInterval(gameLoopId);
        gameLoopId = setInterval(gameLoop, speed);

        placeFood();
    } else {
        snake.pop();
    }
}

function gameOver() {
    isGameOver = true;
    lastScoreValue = score;
    finalScoreEl.textContent = score;
    isSubmitted = false;
    saveStatusEl.textContent = '';
    saveScoreBtn.disabled = false;
    playerNameEl.value = localStorage.getItem('snakeName') || '';
    foeChipEl.classList.add('hidden');
    showResultOverlay('solo');
    clearInterval(gameLoopId);
    refreshLeaders();
}

function togglePause() {
    if (isGameOver || mode === 'mp') return;
    isPaused = !isPaused;
    pauseEl.classList.toggle('hidden', !isPaused);
}

function changeDirection(x, y) {
    if (isGameOver) return;

    if (mode === 'mp') {
        if (role === 'guest') {
            mpSend('dir', [x, y]);
            return;
        }
        if (x === -velocityX && y === -velocityY) return;
        if (x === -nextVelocityX && y === -nextVelocityY) return;
        nextVelocityX = x;
        nextVelocityY = y;
        return;
    }

    if (x === -velocityX && y === -velocityY) {
        return;
    }

    nextVelocityX = x;
    nextVelocityY = y;
}

/* ---------------- drawing helpers ---------------- */

function wrappedCopies(s) {
    const list = [{ x: s.x, y: s.y }];
    const x0 = s.x === 0, x1 = s.x === tileCount - 1;
    const y0 = s.y === 0, y1 = s.y === tileCount - 1;
    if (x0) list.push({ x: tileCount, y: s.y });
    if (x1) list.push({ x: -1, y: s.y });
    if (y0) list.push({ x: s.x, y: tileCount });
    if (y1) list.push({ x: s.x, y: -1 });
    if (x0 && y0) list.push({ x: tileCount, y: tileCount });
    if (x1 && y0) list.push({ x: -1, y: tileCount });
    if (x0 && y1) list.push({ x: tileCount, y: -1 });
    if (x1 && y1) list.push({ x: -1, y: -1 });
    return list;
}

function torusDelta(a, b) {
    let dx = b.x - a.x;
    let dy = b.y - a.y;
    if (dx > 1) dx -= tileCount;
    if (dx < -1) dx += tileCount;
    if (dy > 1) dy -= tileCount;
    if (dy < -1) dy += tileCount;
    return { dx, dy };
}

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

/* ---------------- fruits ---------------- */

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

function drawFood(t) {
    const cx = food.x * tileSize + tileSize / 2;
    const cy = food.y * tileSize + tileSize / 2;
    const pulse = 1 + Math.sin(t * 4) * 0.06;
    const bob = Math.sin(t * 3) * tileSize * 0.05;
    const r = tileSize * 0.36 * pulse;

    const colors = ['rgba(239,68,68,0.35)', 'rgba(251,146,60,0.35)', 'rgba(139,92,246,0.32)', 'rgba(244,63,94,0.32)', 'rgba(34,197,94,0.3)', 'rgba(239,68,68,0.32)'];
    glow(cx, cy + bob, r, colors[food.type]);

    FRUITS[food.type](cx, cy + bob, r, t);
}

/* ---------------- snake ---------------- */

function skinHue(skin) {
    return (skin && typeof skin.hue === 'number') ? skin.hue : 145;
}

function drawConnector(x1, y1, x2, y2, tint, skin) {
    const hue = skinHue(skin);
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

function drawSegment(px, py, index, t, vx, vy, skin) {
    const hue = skinHue(skin);
    const cx = px * tileSize + tileSize / 2;
    const cy = py * tileSize + tileSize / 2;
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

    // тень снизу (объём)
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

    // блик
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.ellipse(cx - r * 0.3, cy - r * 0.36, r * 0.3, r * 0.16, -0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.arc(cx - r * 0.34, cy - r * 0.4, r * 0.09, 0, Math.PI * 2);
    ctx.fill();

    const pattern = isHead ? 'none' : ((skin && skin.pattern) || 'none');
    if (pattern === 'stripes' && index % 2 === 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = `hsla(${hue + 6}, 65%, 22%, 0.35)`;
        const bandW = r * 0.45;
        const dx = (vx === undefined || (vx === 0 && vy === 0)) ? 1 : vx;
        const dy = vy === undefined ? 0 : vy;
        ctx.translate(cx, cy);
        ctx.rotate(Math.atan2(dy, dx) + Math.PI / 2);
        ctx.fillRect(-r, -bandW / 2, r * 2, bandW);
        ctx.restore();
    } else if (pattern === 'spots') {
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.98, 0, Math.PI * 2);
        ctx.clip();
        ctx.fillStyle = `hsla(${hue + 8}, 70%, 25%, 0.4)`;
        [[-0.3, -0.25], [0.28, 0.1], [-0.05, 0.42]].forEach(o => {
            ctx.beginPath();
            ctx.arc(cx + o[0] * r, cy + o[1] * r, r * 0.17, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }

    if (isHead) {
        drawHat(cx, cy, r, vx, vy, (skin && skin.hat) || 'none');
        drawHeadFace(cx, cy, r, t, vx, vy);
    }
}

function drawHat(cx, cy, r, vx, vy, hat) {
    if (!hat || hat === 'none') return;

    let fx = vx === undefined ? velocityX : vx;
    let fy = vy === undefined ? velocityY : vy;
    if (fx === 0 && fy === 0) { fx = 1; fy = 0; }

    ctx.save();
    ctx.lineJoin = 'round';

    if (hat === 'crown') {
        const w = r * 0.85;
        const h = r * 0.62;
        const baseY = cy - r * 0.55;
        ctx.fillStyle = '#fbbf24';
        ctx.strokeStyle = '#b45309';
        ctx.lineWidth = Math.max(1, r * 0.06);
        ctx.beginPath();
        ctx.moveTo(cx - w, baseY);
        ctx.lineTo(cx - w, baseY - h);
        ctx.lineTo(cx - w * 0.45, baseY - h * 0.45);
        ctx.lineTo(cx, baseY - h);
        ctx.lineTo(cx + w * 0.45, baseY - h * 0.45);
        ctx.lineTo(cx + w, baseY - h);
        ctx.lineTo(cx + w, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, baseY - h * 0.18, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
    } else if (hat === 'party') {
        const baseY = cy - r * 0.5;
        const topX = cx - fx * r * 0.18;
        const topY = baseY - r * 1.5;
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.moveTo(cx - r * 0.75, baseY);
        ctx.lineTo(topX, topY);
        ctx.lineTo(cx + r * 0.75, baseY);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = Math.max(1, r * 0.1);
        for (let i = 1; i <= 2; i++) {
            const k = i / 3;
            const y = baseY + (topY - baseY) * k;
            const half = r * 0.75 * (1 - k);
            ctx.beginPath();
            ctx.moveTo(cx - half, y);
            ctx.lineTo(cx + half, y);
            ctx.stroke();
        }
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(topX, topY, r * 0.16, 0, Math.PI * 2);
        ctx.fill();
    } else if (hat === 'cap') {
        const topY = cy - r * 0.35;
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(cx, topY, r * 0.72, Math.PI, 0);
        ctx.lineTo(cx + r * 0.72, topY);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.ellipse(cx + fx * r * 0.62, topY + fy * r * 0.55, r * 0.5, r * 0.24, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.arc(cx, topY - r * 0.05, r * 0.1, 0, Math.PI * 2);
        ctx.fill();
    } else if (hat === 'helm') {
        ctx.fillStyle = '#94a3b8';
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = Math.max(1, r * 0.07);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.92, Math.PI * 1.02, Math.PI * 1.98);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(15,23,42,0.55)';
        ctx.beginPath();
        ctx.ellipse(cx + fx * r * 0.42, cy + fy * r * 0.42, r * 0.42, r * 0.3, Math.atan2(fy, fx), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

function drawHeadFace(cx, cy, r, t, vx, vy) {
    let fx = vx === undefined ? velocityX : vx;
    let fy = vy === undefined ? velocityY : vy;
    if (fx === 0 && fy === 0) { fx = 1; fy = 0; }
    const rx = -fy, ry = fx;

    const eyeForward = r * 0.34;
    const eyeSide = r * 0.44;
    const eyeR = r * 0.3;

    [[1], [-1]].forEach(s => {
        const sgn = s[0];
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

    // язык
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

function drawSnakeSet(segments, vx, vy, skin, t) {
    if (!segments || segments.length === 0) return;

    for (let i = 0; i < segments.length - 1; i++) {
        const a = segments[i];
        const b = segments[i + 1];
        const d = torusDelta(a, b);
        if (d.dx === 0 && d.dy === 0) continue;
        const ax = a.x * tileSize + tileSize / 2;
        const ay = a.y * tileSize + tileSize / 2;
        const bx = ax + d.dx * tileSize;
        const by = ay + d.dy * tileSize;

        wrappedCopies(a).forEach(p => {
            const px = p.x * tileSize + tileSize / 2;
            const py = p.y * tileSize + tileSize / 2;
            const ox = px - ax;
            const oy = py - ay;
            drawConnector(px, py, bx + ox, by + oy, i, skin);
        });
    }

    for (let i = segments.length - 1; i >= 0; i--) {
        const s = segments[i];
        wrappedCopies(s).forEach(p => drawSegment(p.x, p.y, i, t, vx, vy, skin));
    }
}

function drawSnake(t) {
    drawSnakeSet(snake, velocityX, velocityY, activeLook(), t);
}

function drawCountdown() {
    const text = String(mpCountdown);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.floor(tileSize * 3)}px system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, tileSize * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    ctx.restore();
}

function draw(t) {
    drawBackground();
    drawFood(t);

    if (mode === 'mp') {
        drawSnakeSet(mpOther, mpOtherVel.x, mpOtherVel.y, mpOtherSkin, t);
        drawSnakeSet(mpSelf, mpSelfVel.x, mpSelfVel.y, playerSkin, t);
        if (mpCountdown > 0) drawCountdown();
    } else {
        drawSnake(t);
    }
}

function renderFrame(now) {
    const t = now / 1000;
    draw(t);
    if (wardPanelEl.classList.contains('active')) drawWardrobePreview(t);
    requestAnimationFrame(renderFrame);
}

/* ---------------- input ---------------- */

document.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    // физические клавиши (e.code) — раскладка не влияет
    const code = e.code || '';
    const key = (e.key || '').toLowerCase();

    const isUp = code === 'ArrowUp' || code === 'KeyW' || key === 'arrowup' || key === 'w' || key === 'ц';
    const isDown = code === 'ArrowDown' || code === 'KeyS' || key === 'arrowdown' || key === 's' || key === 'ы';
    const isLeft = code === 'ArrowLeft' || code === 'KeyA' || key === 'arrowleft' || key === 'a' || key === 'ф';
    const isRight = code === 'ArrowRight' || code === 'KeyD' || key === 'arrowright' || key === 'd' || key === 'в';
    const isSpace = code === 'Space' || key === ' ' || key === 'spacebar';
    const isEnter = code === 'Enter' || key === 'enter';

    if (isUp) {
        e.preventDefault();
        changeDirection(0, -1);
    } else if (isDown) {
        e.preventDefault();
        changeDirection(0, 1);
    } else if (isLeft) {
        e.preventDefault();
        changeDirection(-1, 0);
    } else if (isRight) {
        e.preventDefault();
        changeDirection(1, 0);
    } else if (isSpace) {
        e.preventDefault();
        togglePause();
    } else if (isEnter) {
        if (isGameOver) handleRestart();
    }
});

dirBtns.forEach(btn => {
    const apply = (e) => {
        e.preventDefault();
        switch (btn.dataset.dir) {
            case 'up': changeDirection(0, -1); break;
            case 'down': changeDirection(0, 1); break;
            case 'left': changeDirection(-1, 0); break;
            case 'right': changeDirection(1, 0); break;
        }
    };
    btn.addEventListener('click', apply);
    btn.addEventListener('touchstart', apply, { passive: false });
});

let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
    const touch = e.touches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    const touch = e.changedTouches[0];
    const dx = touch.clientX - touchStartX;
    const dy = touch.clientY - touchStartY;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (Math.max(absDx, absDy) < 30) return;

    if (absDx > absDy) {
        changeDirection(dx > 0 ? 1 : -1, 0);
    } else {
        changeDirection(0, dy > 0 ? 1 : -1);
    }
    e.preventDefault();
}, { passive: false });

/* ---------------- multiplayer ---------------- */

const MP_TICK = 110;
const MP_COUNTDOWN_TICKS = Math.round(3000 / MP_TICK);
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const clientId = Math.random().toString(36).slice(2, 10);
let mpStateSeen = false;

function mpStatus(text) {
    roomStatusEl.textContent = text;
}

function mpRandomCode() {
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += ROOM_ALPHABET[Math.floor(Math.random() * ROOM_ALPHABET.length)];
    }
    return code;
}

function mpSend(event, payload) {
    if (!channel) return;
    channel.send({ type: 'broadcast', event: event, payload: payload });
}

function mpMyIndex() {
    return role === 'host' ? 0 : 1;
}

function wrapCell(x, y) {
    if (x < 0) x = tileCount - 1;
    else if (x >= tileCount) x = 0;
    if (y < 0) y = tileCount - 1;
    else if (y >= tileCount) y = 0;
    return { x: x, y: y };
}

function mpUpdateHud() {
    const my = mpMyIndex();
    scoreEl.textContent = mpScores[my];
    foeScoreEl.textContent = mpScores[1 - my];
    foeChipEl.classList.remove('hidden');
}

function roomUi(inRoom) {
    createRoomBtn.classList.toggle('hidden', inRoom);
    joinRoomBtn.classList.toggle('hidden', inRoom);
    roomInputEl.classList.toggle('hidden', inRoom);
    leaveRoomBtn.classList.toggle('hidden', !inRoom);
}

function showResultOverlay(kind) {
    isGameOver = true;
    resultTitleEl.classList.remove('loser', 'winner', 'draw');
    if (kind === 'win') {
        resultTitleEl.textContent = 'WINNER!';
        resultTitleEl.classList.add('winner');
        grantChest();
    } else if (kind === 'draw') {
        resultTitleEl.textContent = 'НИЧЬЯ';
        resultTitleEl.classList.add('draw');
    } else {
        resultTitleEl.textContent = 'LOSER';
        resultTitleEl.classList.add('loser');
    }

    const solo = kind === 'solo';
    soloResultEl.classList.toggle('hidden', !solo);
    mpResultEl.classList.toggle('hidden', solo);

    if (!solo) {
        const my = mpMyIndex();
        lastScoreValue = mpScores[my];
        mpScoreYouEl.textContent = mpScores[my];
        mpScoreFoeEl.textContent = mpScores[1 - my];
        isSubmitted = false;
        saveScoreBtn.disabled = false;
        saveStatusEl.textContent = '';
        updateChestUi();
        chestBtn.classList.toggle('hidden', unlocks.chests === 0);
    }

    gameOverEl.classList.remove('hidden');
}

function hideResultOverlay() {
    isGameOver = false;
    mpOverlayShown = false;
    gameOverEl.classList.add('hidden');
    pauseEl.classList.add('hidden');
    isPaused = false;
}

function mpStartRound() {
    const midY = Math.floor(tileCount / 2);
    const sx = Math.max(4, Math.floor(tileCount * 0.3));
    const ox = Math.min(tileCount - 5, Math.floor(tileCount * 0.7));

    mpSelf = [
        { x: sx, y: midY },
        { x: sx - 1, y: midY },
        { x: sx - 2, y: midY }
    ];
    mpOther = [
        { x: ox, y: midY },
        { x: ox + 1, y: midY },
        { x: ox + 2, y: midY }
    ];

    velocityX = 1;
    velocityY = 0;
    nextVelocityX = 1;
    nextVelocityY = 0;
    mpSelfVel = { x: 1, y: 0 };
    mpOtherVel = { x: -1, y: 0 };
    mpOtherNext = { x: -1, y: 0 };
    mpScores = [0, 0];
    mpOver = false;
    mpWinner = 0;
    mpCountdown = MP_COUNTDOWN_TICKS;
    mpOverlayShown = false;
    isGameOver = false;
    isPaused = false;
    mode = 'mp';

    gameOverEl.classList.add('hidden');
    pauseEl.classList.add('hidden');

    placeFood();
    mpUpdateHud();
    mpStatus('Код: ' + roomCode + ' — раунд начинается!');

    clearInterval(gameLoopId);
    gameLoopId = setInterval(gameLoop, MP_TICK);
}

function mpBroadcast() {
    mpSend('state', {
        tc: tileCount,
        c: mpCountdown,
        s1: mpSelf.map(p => [p.x, p.y]),
        s2: mpOther.map(p => [p.x, p.y]),
        v1: [mpSelfVel.x, mpSelfVel.y],
        v2: [mpOtherVel.x, mpOtherVel.y],
        f: [food.x, food.y, food.type],
        sc: mpScores.slice(),
        over: mpOver,
        w: mpWinner,
        sk: [playerSkin, mpOtherSkin]
    });
}

function mpHostTick() {
    if (role !== 'host' || mpOver || !mpSelf.length) return;

    if (mpCountdown > 0) {
        mpCountdown--;
        mpBroadcast();
        return;
    }

    velocityX = nextVelocityX;
    velocityY = nextVelocityY;
    mpSelfVel = { x: velocityX, y: velocityY };
    mpOtherVel = { x: mpOtherNext.x, y: mpOtherNext.y };

    const h1 = wrapCell(mpSelf[0].x + velocityX, mpSelf[0].y + velocityY);
    const h2 = wrapCell(mpOther[0].x + mpOtherVel.x, mpOther[0].y + mpOtherVel.y);

    mpSelf.unshift(h1);
    mpOther.unshift(h2);

    const eat1 = h1.x === food.x && h1.y === food.y;
    const eat2 = h2.x === food.x && h2.y === food.y;

    const selfHit = isInList(mpSelf.slice(1), h1.x, h1.y);
    const otherSelfHit = isInList(mpOther.slice(1), h2.x, h2.y);
    const cross1 = isInList(mpOther, h1.x, h1.y);
    const cross2 = isInList(mpSelf, h2.x, h2.y);

    const alive1 = !selfHit && !cross1;
    const alive2 = !otherSelfHit && !cross2;

    if (!eat1) mpSelf.pop();
    if (!eat2) mpOther.pop();

    if (alive1 && eat1) mpScores[0]++;
    if (alive2 && eat2) mpScores[1]++;
    if ((alive1 && eat1) || (alive2 && eat2)) placeFood();

    if (!alive1 || !alive2) {
        mpOver = true;
        mpWinner = alive1 && !alive2 ? 1 : (!alive1 && alive2 ? 2 : 0);
        mpUpdateHud();
        showResultOverlay(mpWinner === 1 ? 'win' : mpWinner === 2 ? 'lose' : 'draw');
        mpBroadcast();
        return;
    }

    mpUpdateHud();
    mpBroadcast();
}

function onMpState(st) {
    if (role !== 'guest' || !st.s1 || !st.s2 || !st.s1.length || !st.s2.length) return;

    if (st.tc) applyTileCount(st.tc);

    mpSelf = st.s2.map(a => ({ x: a[0], y: a[1] }));
    mpOther = st.s1.map(a => ({ x: a[0], y: a[1] }));
    mpSelfVel = { x: st.v2[0], y: st.v2[1] };
    mpOtherVel = { x: st.v1[0], y: st.v1[1] };
    food = { x: st.f[0], y: st.f[1], type: st.f[2] };
    mpScores = st.sc.slice();
    mpCountdown = st.c;
    mpOver = st.over;
    mpWinner = st.w;
    if (st.sk && st.sk[0]) mpOtherSkin = st.sk[0];

    mpUpdateHud();

    if (st.over) {
        if (!mpOverlayShown) {
            mpOverlayShown = true;
            const iWon = (st.w === 1 && role === 'host') || (st.w === 2 && role === 'guest');
            showResultOverlay(st.w === 0 ? 'draw' : (iWon ? 'win' : 'lose'));
        }
        return;
    }

    if (!gameOverEl.classList.contains('hidden')) hideResultOverlay();

    if (st.c > 0) {
        mpStatus('Отсчёт…');
    } else {
        mpStatus('Бой идёт! Код: ' + roomCode);
    }
}

function onMpDir(p) {
    if (role !== 'host' || !p) return;
    const dx = p[0];
    const dy = p[1];
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;
    if (dx === -mpOtherVel.x && dy === -mpOtherVel.y) return;
    if (dx === -mpOtherNext.x && dy === -mpOtherNext.y) return;
    mpOtherNext = { x: dx, y: dy };
}

function onMpPresence() {
    if (!channel) return;

    const count = Object.keys(channel.presenceState()).length;

    if (role === 'guest') {
        if (count < 2 && mpStateSeen) {
            if (!mpHostGoneTimer) {
                mpHostGoneTimer = setTimeout(() => {
                    mpHostGoneTimer = null;
                    if (channel && mpStateSeen && Object.keys(channel.presenceState()).length < 2) {
                        leaveRoom();
                        mpStatus('Соперник вышел — игра окончена');
                    }
                }, 1500);
            }
        } else if (mpHostGoneTimer) {
            clearTimeout(mpHostGoneTimer);
            mpHostGoneTimer = null;
        }
        return;
    }

    if (role !== 'host') return;

    if (count >= 2) {
        if (!mpOpponentOnline) {
            mpOpponentOnline = true;
            mpStatus('Соперник найден! Код: ' + roomCode);
            mpStartRound();
        }
        return;
    }

    if (mpOpponentOnline) {
        mpOpponentOnline = false;
        mpStatus('Соперник вышел. Ждём нового… Код: ' + roomCode);
        if (!mpOver) {
            mpOver = true;
            mpWinner = 1;
            mpUpdateHud();
            showResultOverlay('win');
            mpBroadcast();
        }
    }
}

function connectRoom(code, asHost) {
    if (!db) {
        mpStatus('Нужны ключи Supabase в supabase-config.js');
        return;
    }

    leaveRoom(true);

    mode = 'mp';
    role = asHost ? 'host' : 'guest';
    roomCode = code;
    mpStateSeen = false;
    mpOver = false;
    isGameOver = false;
    mpOtherSkin = { hue: 210, pattern: 'none', hat: 'none' };
    gameOverEl.classList.add('hidden');
    roomUi(true);

    channel = db.channel('snake-room-' + code, {
        config: { presence: { key: clientId }, broadcast: { self: false } }
    });

    channel.on('broadcast', { event: 'state' }, (msg) => {
        mpStateSeen = true;
        onMpState(msg.payload);
    });
    channel.on('broadcast', { event: 'dir' }, (msg) => onMpDir(msg.payload));
    channel.on('broadcast', { event: 'skin' }, (msg) => {
        if (role === 'host' && msg.payload && typeof msg.payload.hue === 'number') {
            mpOtherSkin = msg.payload;
            if (mpSelf.length) mpBroadcast();
        }
    });
    channel.on('broadcast', { event: 'again' }, () => {
        if (role === 'host' && mpOver) mpStartRound();
    });
    channel.on('presence', { event: 'sync' }, onMpPresence);

    channel.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
            channel.track({ role: role, id: clientId });
            if (role === 'host') {
                mpStatus('Код: ' + code + ' — ждём соперника…');
            } else {
                mpSend('skin', playerSkin);
                mpStatus('Подключение…');
                clearTimeout(mpJoinTimer);
                mpJoinTimer = setTimeout(() => {
                    if (!mpStateSeen) {
                        leaveRoom();
                        mpStatus('Комната не найдена');
                    }
                }, 4000);
            }
        } else if (status === 'CHANNEL_ERROR') {
            mpStatus('Ошибка подключения к Realtime');
        }
    });
}

function leaveRoom(silent) {
    clearTimeout(mpJoinTimer);
    clearTimeout(mpHostGoneTimer);
    mpHostGoneTimer = null;
    if (channel) {
        try { channel.unsubscribe(); } catch (e) { console.warn(e.message); }
        channel = null;
    }

    const wasMp = mode === 'mp';
    mode = 'solo';
    role = null;
    roomCode = '';
    mpOpponentOnline = false;
    mpStateSeen = false;
    mpSelf = [];
    mpOther = [];
    mpOver = false;
    mpCountdown = 0;
    mpOverlayShown = false;
    foeChipEl.classList.add('hidden');
    roomUi(false);

    if (!silent && wasMp) {
        initGame();
        mpStatus('Создай комнату или введи код друга');
    }
}

function handleRestart() {
    if (mode === 'mp') {
        if (role === 'host') {
            mpStartRound();
        } else {
            mpSend('again', {});
            mpStatus('Ждём соперника…');
        }
        return;
    }
    initGame();
}

createRoomBtn.addEventListener('click', () => {
    const code = mpRandomCode();
    roomInputEl.value = code;
    connectRoom(code, true);
});

joinRoomBtn.addEventListener('click', () => {
    const code = (roomInputEl.value || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(code)) {
        mpStatus('Код — 4 символа: буквы и цифры');
        return;
    }
    connectRoom(code, false);
});

leaveRoomBtn.addEventListener('click', () => leaveRoom());

restartBtn.addEventListener('click', handleRestart);

let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resizeCanvas, 80);
});

const SUPABASE_URL = window.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || '';
const LEADERS_LIMIT = 10;

let db = null;
if (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (e) {
        db = null;
    }
}

function readLocalLeaders() {
    try {
        return JSON.parse(localStorage.getItem('snakeLeaders')) || [];
    } catch (e) {
        return [];
    }
}

async function fetchLeaders() {
    if (db) {
        try {
            const { data, error } = await db
                .from('scores')
                .select('name, score')
                .order('score', { ascending: false })
                .limit(LEADERS_LIMIT);
            if (error) throw error;
            return { rows: data || [], online: true };
        } catch (e) {
            console.warn('Не удалось загрузить таблицу лидеров:', e.message);
        }
    }
    return { rows: readLocalLeaders().slice(0, LEADERS_LIMIT), online: false };
}

async function submitScore(name, value) {
    if (db) {
        try {
            const { error } = await db.from('scores').insert({ name: name, score: value });
            if (error) throw error;
            return true;
        } catch (e) {
            console.warn('Не удалось сохранить результат:', e.message);
            return false;
        }
    }

    const list = readLocalLeaders();
    list.push({ name: name, score: value });
    list.sort((a, b) => b.score - a.score);
    localStorage.setItem('snakeLeaders', JSON.stringify(list.slice(0, 50)));
    return true;
}

function renderLeaders(res) {
    leadersListEl.innerHTML = '';

    const head = document.createElement('li');
    head.className = 'leaders-head';
    head.textContent = res.online
        ? 'Онлайн-таблица лидеров'
        : 'Локальная таблица (Supabase не настроен)';
    leadersListEl.appendChild(head);

    if (!res.rows.length) {
        const empty = document.createElement('li');
        empty.className = 'leaders-empty';
        empty.textContent = 'Пока пусто — будь первым!';
        leadersListEl.appendChild(empty);
        return;
    }

    res.rows.forEach((row, i) => {
        const li = document.createElement('li');
        li.className = 'leaders-row' + (row.name === playerNameEl.value ? ' me' : '');

        const rank = document.createElement('span');
        rank.className = 'rank';
        rank.textContent = (i + 1) + '.';

        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = String(row.name).slice(0, 16);

        const pts = document.createElement('span');
        pts.className = 'pts';
        pts.textContent = row.score;

        li.append(rank, name, pts);
        leadersListEl.appendChild(li);
    });
}

async function refreshLeaders() {
    renderLeaders(await fetchLeaders());
}

saveScoreBtn.addEventListener('click', async () => {
    if (isSubmitted) return;

    const name = (playerNameEl.value || '').trim().slice(0, 16);
    if (!name) {
        saveStatusEl.textContent = 'Введи имя';
        playerNameEl.focus();
        return;
    }

    localStorage.setItem('snakeName', name);
    saveScoreBtn.disabled = true;
    saveStatusEl.textContent = 'Отправка…';

    const ok = await submitScore(name, lastScoreValue);
    isSubmitted = ok;
    saveStatusEl.textContent = ok ? 'Результат сохранён!' : 'Нет связи — попробуй ещё раз';
    saveScoreBtn.disabled = ok;

    if (ok) syncNameToProfile();
    refreshLeaders();
});

playerNameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveScoreBtn.click();
    }
});

let authUser = null;

function authProfileName() {
    const meta = authUser && authUser.user_metadata;
    return (meta && meta.name ? String(meta.name) : '').trim();
}

function renderAuth() {
    const loggedIn = !!authUser;
    authGuestBox.classList.toggle('hidden', loggedIn);
    authUserBox.classList.toggle('hidden', !loggedIn);

    if (loggedIn) {
        authWhoEl.textContent = 'Ты: ' + (authUser.email || '');
        const n = authProfileName();
        if (n) playerNameEl.value = n;
    }

    saveScoreBtn.textContent = loggedIn ? 'Сохранить результат' : 'В таблицу лидеров';
}

async function syncNameToProfile() {
    if (!db || !authUser) return;
    const name = (playerNameEl.value || '').trim().slice(0, 16);
    if (!name || name === authProfileName()) return;
    try {
        await db.auth.updateUser({ data: { name: name } });
    } catch (e) {
        console.warn('Не удалось сохранить имя профиля:', e.message);
    }
}

async function initAuth() {
    if (!db) {
        authStatusEl.textContent = 'Авторизация недоступна — не вставлены ключи Supabase';
        renderAuth();
        return;
    }

    try {
        const { data } = await db.auth.getSession();
        authUser = data.session ? data.session.user : null;
    } catch (e) {
        authUser = null;
    }
    renderAuth();

    db.auth.onAuthStateChange((event, session) => {
        authUser = session ? session.user : null;
        renderAuth();
        if (event === 'SIGNED_IN') refreshLeaders();
    });
}

authLoginBtn.addEventListener('click', async () => {
    if (!db) return;
    const email = authEmailEl.value.trim();
    const pass = authPassEl.value;
    if (!email || !pass) {
        authStatusEl.textContent = 'Введи e-mail и пароль';
        return;
    }

    authStatusEl.textContent = 'Вход…';
    authLoginBtn.disabled = true;
    authSignupBtn.disabled = true;

    const { error } = await db.auth.signInWithPassword({ email: email, password: pass });

    authLoginBtn.disabled = false;
    authSignupBtn.disabled = false;

    if (error) {
        authStatusEl.textContent = error.message === 'Invalid login credentials'
            ? 'Неверный e-mail или пароль'
            : error.message;
        return;
    }

    authPassEl.value = '';
    authStatusEl.textContent = 'Вход выполнен — имя подтянуто из профиля';
    syncNameToProfile();
});

authSignupBtn.addEventListener('click', async () => {
    if (!db) return;
    const email = authEmailEl.value.trim();
    const pass = authPassEl.value;
    if (!email || !pass) {
        authStatusEl.textContent = 'Введи e-mail и пароль';
        return;
    }
    if (pass.length < 6) {
        authStatusEl.textContent = 'Пароль минимум 6 символов';
        return;
    }

    authStatusEl.textContent = 'Создание аккаунта…';
    authLoginBtn.disabled = true;
    authSignupBtn.disabled = true;

    const { data, error } = await db.auth.signUp({ email: email, password: pass });

    authLoginBtn.disabled = false;
    authSignupBtn.disabled = false;

    if (error) {
        authStatusEl.textContent = error.message;
        return;
    }

    authPassEl.value = '';

    if (data.session) {
        authStatusEl.textContent = 'Аккаунт создан — вход выполнен';
        syncNameToProfile();
    } else {
        authStatusEl.textContent = 'Аккаунт создан — подтверди e-mail по ссылке из письма';
    }
});

authLogoutBtn.addEventListener('click', async () => {
    if (db) {
        try {
            await db.auth.signOut();
        } catch (e) {
            console.warn(e.message);
        }
    }
    authUser = null;
    authStatusEl.textContent = 'Выход выполнен';
    renderAuth();
});


/* ---------------- wardrobe ---------------- */

const HUE_SWATCHES = [
    { label: 'Зелёный', hue: 145 },
    { label: 'Синий', hue: 210 },
    { label: 'Бирюзовый', hue: 175 },
    { label: 'Фиолетовый', hue: 275 },
    { label: 'Красный', hue: 355 },
    { label: 'Оранжевый', hue: 28 },
    { label: 'Жёлтый', hue: 48 },
    { label: 'Розовый', hue: 330 }
];

const PATTERN_OPTIONS = [
    { id: 'none', label: 'Нет' },
    { id: 'stripes', label: 'Полосы' },
    { id: 'spots', label: 'Точки' }
];

const HAT_OPTIONS = [
    { id: 'none', label: 'Без шапки' },
    { id: 'crown', label: 'Корона' },
    { id: 'party', label: 'Колпак' },
    { id: 'cap', label: 'Кепка' },
    { id: 'helm', label: 'Шлем' }
];

const wardPanelEl = document.getElementById('panel-wardrobe');
const wardPreviewEl = document.getElementById('wardPreview');
const skinNameEl = document.getElementById('skinName');
const skinNameBtn = document.getElementById('skinNameBtn');
const wardStatusEl = document.getElementById('wardStatus');
const hueSwatchesEl = document.getElementById('hueSwatches');
const patternBtnsEl = document.getElementById('patternBtns');
const hatBtnsEl = document.getElementById('hatBtns');
const wardChestBtn = document.getElementById('wardChestBtn');
const wardChestHint = document.getElementById('wardChestHint');
const chestBtn = document.getElementById('chestBtn');
const chestOverlayEl = document.getElementById('chestOverlay');
const chestCanvasEl = document.getElementById('chestCanvas');
const chestResultEl = document.getElementById('chestResult');
const chestOpenBtn = document.getElementById('chestOpenBtn');
const chestCloseBtn = document.getElementById('chestCloseBtn');

function isHueOpen(hue) { return unlocks.hues.indexOf(hue) >= 0; }
function isPatternOpen(id) { return unlocks.patterns.indexOf(id) >= 0; }
function isHatOpen(id) { return unlocks.hats.indexOf(id) >= 0; }

function wardMarkActive() {
    const look = activeLook();
    const tryOn = !!previewSkin;

    hueSwatchesEl.querySelectorAll('button').forEach(b => {
        const hue = Number(b.dataset.hue);
        const shown = hue === look.hue;
        b.classList.toggle('active', shown);
        b.classList.toggle('locked', !isHueOpen(hue));
        b.classList.toggle('trying', tryOn && shown && hue !== playerSkin.hue);
    });
    patternBtnsEl.querySelectorAll('button').forEach(b => {
        const shown = b.dataset.pattern === look.pattern;
        b.classList.toggle('active', shown);
        b.classList.toggle('locked', !isPatternOpen(b.dataset.pattern));
        b.classList.toggle('trying', tryOn && shown && b.dataset.pattern !== playerSkin.pattern);
    });
    hatBtnsEl.querySelectorAll('button').forEach(b => {
        const shown = b.dataset.hat === look.hat;
        b.classList.toggle('active', shown);
        b.classList.toggle('locked', !isHatOpen(b.dataset.hat));
        b.classList.toggle('trying', tryOn && shown && b.dataset.hat !== playerSkin.hat);
    });
}

function setWardStatus(text) {
    wardStatusEl.textContent = text;
}

function notifySkinChanged() {
    if (role === 'guest') mpSend('skin', playerSkin);
}

function applySkin() {
    saveSkin();
    wardMarkActive();
    notifySkinChanged();
}

function buildWardrobe() {
    HUE_SWATCHES.forEach(s => {
        const b = document.createElement('button');
        b.className = 'swatch';
        b.type = 'button';
        b.dataset.hue = s.hue;
        b.title = s.label;
        b.style.background = `hsl(${s.hue}, 65%, 52%)`;
        b.addEventListener('click', () => {
            if (!isHueOpen(s.hue)) {
                previewSkin = { hue: s.hue, pattern: playerSkin.pattern, hat: playerSkin.hat };
                setWardStatus('Примерка: цвет «' + s.label + '» — закрыто, нужен сундук');
                wardMarkActive();
                return;
            }
            playerSkin.hue = s.hue;
            previewSkin = null;
            applySkin();
        });
        hueSwatchesEl.appendChild(b);
    });

    PATTERN_OPTIONS.forEach(p => {
        const b = document.createElement('button');
        b.className = 'ward-chip';
        b.type = 'button';
        b.dataset.pattern = p.id;
        b.textContent = p.label;
        b.addEventListener('click', () => {
            if (!isPatternOpen(p.id)) {
                previewSkin = { hue: playerSkin.hue, pattern: p.id, hat: playerSkin.hat };
                setWardStatus('Примерка: детали «' + p.label + '» — закрыто, нужен сундук');
                wardMarkActive();
                return;
            }
            playerSkin.pattern = p.id;
            previewSkin = null;
            applySkin();
        });
        patternBtnsEl.appendChild(b);
    });

    HAT_OPTIONS.forEach(h => {
        const b = document.createElement('button');
        b.className = 'ward-chip';
        b.type = 'button';
        b.dataset.hat = h.id;
        b.textContent = h.label;
        b.addEventListener('click', () => {
            if (!isHatOpen(h.id)) {
                previewSkin = { hue: playerSkin.hue, pattern: playerSkin.pattern, hat: h.id };
                setWardStatus('Примерка: шапка «' + h.label + '» — закрыто, нужен сундук');
                wardMarkActive();
                return;
            }
            playerSkin.hat = h.id;
            previewSkin = null;
            applySkin();
        });
        hatBtnsEl.appendChild(b);
    });

    wardMarkActive();
    updateChestUi();
}

function saveMyName() {
    const name = (skinNameEl.value || '').trim().slice(0, 16);
    if (!name) {
        setWardStatus('Имя не может быть пустым');
        skinNameEl.focus();
        return;
    }
    skinNameEl.value = name;
    playerNameEl.value = name;
    localStorage.setItem('snakeName', name);
    syncNameToProfile();
    refreshLeaders();
    setWardStatus('Имя сохранено: ' + name);
}

skinNameBtn.addEventListener('click', saveMyName);
skinNameEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        saveMyName();
    }
});

/* ---------------- chests ---------------- */

const chestCtx = chestCanvasEl.getContext('2d');
let chestState = 'closed';
let chestAnimStart = 0;
let chestFrameId = null;
let pendingItem = null;

function grantChest() {
    unlocks.chests++;
    saveUnlocks();
    updateChestUi();
}

function updateChestUi() {
    const n = unlocks.chests;
    const label = n > 0 ? 'Открыть сундук (' + n + ')' : 'Открыть сундук';
    chestBtn.textContent = label;
    wardChestBtn.textContent = label;
    chestBtn.classList.toggle('hidden', n === 0);
    wardChestBtn.classList.toggle('hidden', n === 0);
    wardChestHint.classList.toggle('hidden', n > 0);
}

function randomLockedItem() {
    const pool = [];
    HUE_SWATCHES.forEach(s => {
        if (!isHueOpen(s.hue)) pool.push({ type: 'hue', id: s.hue, label: 'цвет «' + s.label + '»' });
    });
    PATTERN_OPTIONS.forEach(p => {
        if (p.id !== 'none' && !isPatternOpen(p.id)) pool.push({ type: 'pattern', id: p.id, label: 'детали «' + p.label + '»' });
    });
    HAT_OPTIONS.forEach(h => {
        if (h.id !== 'none' && !isHatOpen(h.id)) pool.push({ type: 'hat', id: h.id, label: 'шапка «' + h.label + '»' });
    });
    if (!pool.length) return null;
    return pool[Math.floor(Math.random() * pool.length)];
}

function openChestModal() {
    chestState = 'closed';
    pendingItem = null;
    chestResultEl.textContent = 'Сундук заперт — нажми «Открыть»';
    chestOpenBtn.textContent = 'Открыть';
    chestOpenBtn.disabled = false;
    chestCloseBtn.disabled = false;
    chestOverlayEl.classList.remove('hidden');
    chestAnimStart = performance.now();
    cancelAnimationFrame(chestFrameId);
    chestFrameId = requestAnimationFrame(chestFrame);
}

function closeChestModal() {
    cancelAnimationFrame(chestFrameId);
    chestFrameId = null;
    chestState = 'closed';
    pendingItem = null;
    chestOverlayEl.classList.add('hidden');
}

function revealChestItem() {
    chestState = 'opened';
    pendingItem = randomLockedItem();

    if (pendingItem) {
        if (pendingItem.type === 'hue') unlocks.hues.push(pendingItem.id);
        else if (pendingItem.type === 'pattern') unlocks.patterns.push(pendingItem.id);
        else unlocks.hats.push(pendingItem.id);
        saveUnlocks();
        wardMarkActive();
        setWardStatus('Новое в гардеробе: ' + pendingItem.label);
    }

    chestResultEl.textContent = pendingItem
        ? 'Получено: ' + pendingItem.label
        : 'Все награды уже собраны!';
    chestOpenBtn.textContent = 'Забрать';
    chestOpenBtn.disabled = false;
    chestCloseBtn.disabled = true;
    updateChestUi();
}

chestBtn.addEventListener('click', openChestModal);
wardChestBtn.addEventListener('click', openChestModal);

chestCloseBtn.addEventListener('click', closeChestModal);

chestOpenBtn.addEventListener('click', () => {
    if (chestState === 'closed') {
        if (unlocks.chests < 1) {
            closeChestModal();
            return;
        }
        unlocks.chests--;
        saveUnlocks();
        updateChestUi();
        chestState = 'opening';
        chestAnimStart = performance.now();
        chestOpenBtn.disabled = true;
        chestCloseBtn.disabled = true;
        chestResultEl.textContent = 'Сундук открывается…';
    } else if (chestState === 'opened') {
        closeChestModal();
    }
});

function chestFrame(now) {
    if (chestState === 'opening' && now - chestAnimStart >= 1400) revealChestItem();
    const t = now / 1000;
    drawChestScene(t);
    drawChestReveal(t);
    chestFrameId = requestAnimationFrame(chestFrame);
}

function roundRectPath(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.lineTo(x + w - r, y);
    g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r);
    g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h);
    g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r);
    g.arcTo(x, y, x + r, y, r);
    g.closePath();
}

function drawOuroboros(g, cx, cy, R, t, glow) {
    const N = 14;
    g.save();

    if (glow > 0) {
        g.shadowColor = 'rgba(74,222,128,0.95)';
        g.shadowBlur = 8 + glow * 14 + Math.sin(t * 6) * 4;
    }

    for (let i = N - 1; i >= 1; i--) {
        const a = -Math.PI / 2 + (i / N) * Math.PI * 1.94;
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * R;
        const light = Math.max(26, 58 - i * 2.2);
        g.fillStyle = `hsl(${BASE_HUE}, 62%, ${light}%)`;
        g.beginPath();
        g.arc(x, y, R * 0.17 * (1 - i / N * 0.45), 0, Math.PI * 2);
        g.fill();
    }

    g.shadowBlur = glow > 0 ? 10 + glow * 12 : 0;
    const hx = cx;
    const hy = cy - R;
    g.fillStyle = `hsl(${BASE_HUE}, 65%, 48%)`;
    g.beginPath();
    g.arc(hx, hy, R * 0.24, 0, Math.PI * 2);
    g.fill();

    g.fillStyle = '#0b1120';
    g.beginPath();
    g.arc(hx - R * 0.07, hy - R * 0.06, Math.max(1.4, R * 0.06), 0, Math.PI * 2);
    g.fill();

    g.shadowBlur = 0;
    g.strokeStyle = '#f43f5e';
    g.lineWidth = Math.max(1.2, R * 0.06);
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(hx - R * 0.2, hy + R * 0.04);
    g.lineTo(hx - R * 0.55, hy + R * 0.02);
    g.stroke();
    g.beginPath();
    g.moveTo(hx - R * 0.55, hy + R * 0.02);
    g.lineTo(hx - R * 0.7, hy - R * 0.1);
    g.moveTo(hx - R * 0.55, hy + R * 0.02);
    g.lineTo(hx - R * 0.7, hy + R * 0.14);
    g.stroke();

    g.restore();
}

function drawChestScene(t) {
    const g = chestCtx;
    const W = chestCanvasEl.width;
    const H = chestCanvasEl.height;
    g.clearRect(0, 0, W, H);

    const elapsed = chestState === 'closed' ? 0 : (performance.now() - chestAnimStart);
    let shake = 0, lidLift = 0, beam = 0, glow = 0.35 + Math.sin(t * 2) * 0.15;

    if (chestState === 'opening') {
        const p = Math.min(1, elapsed / 1400);
        shake = Math.sin(elapsed / 28) * 7 * Math.min(1, p * 4) * (1 - p * 0.5);
        glow = Math.min(1, p * 1.3);
        lidLift = p > 0.8 ? (p - 0.8) / 0.2 : 0;
        beam = lidLift;
    } else if (chestState === 'opened') {
        shake = Math.sin(t * 3) * 1.5;
        glow = 1;
        lidLift = 1;
        beam = 1;
    }

    const cx = W / 2 + shake;
    const bodyX = cx - 95;
    const bodyY = 152;
    const bodyW = 190;
    const bodyH = 74;
    const lidX = bodyX;
    const lidY = bodyY - 44;
    const lidH = 48;

    if (glow > 0.05) {
        const rg = g.createRadialGradient(cx, 160, 8, cx, 160, 140);
        rg.addColorStop(0, `rgba(251,191,36,${0.4 * glow})`);
        rg.addColorStop(1, 'rgba(251,191,36,0)');
        g.fillStyle = rg;
        g.fillRect(0, 0, W, H);
    }

    if (beam > 0) {
        const bg = g.createLinearGradient(0, 30, 0, bodyY);
        bg.addColorStop(0, `rgba(251,191,36,0)`);
        bg.addColorStop(1, `rgba(255,237,160,${0.55 * beam})`);
        g.fillStyle = bg;
        g.beginPath();
        g.moveTo(cx - 68, bodyY);
        g.lineTo(cx + 68, bodyY);
        g.lineTo(cx + 26, 30);
        g.lineTo(cx - 26, 30);
        g.closePath();
        g.fill();
    }

    const bodyGrad = g.createLinearGradient(0, bodyY, 0, bodyY + bodyH);
    bodyGrad.addColorStop(0, '#8a5a2b');
    bodyGrad.addColorStop(1, '#543417');
    g.fillStyle = bodyGrad;
    g.strokeStyle = '#3a2410';
    g.lineWidth = 3;
    roundRectPath(g, bodyX, bodyY, bodyW, bodyH, 8);
    g.fill();
    g.stroke();

    if (beam > 0) {
        const inner = g.createLinearGradient(0, bodyY, 0, bodyY + 26);
        inner.addColorStop(0, `rgba(255,235,150,${0.85 * beam})`);
        inner.addColorStop(1, 'rgba(120,70,20,0)');
        g.fillStyle = inner;
        g.fillRect(bodyX + 12, bodyY, bodyW - 24, 26);
    }

    g.fillStyle = '#c9a227';
    g.fillRect(bodyX + 22, bodyY, 14, bodyH);
    g.fillRect(bodyX + bodyW - 36, bodyY, 14, bodyH);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(bodyX + 22, bodyY, 4, bodyH);
    g.fillRect(bodyX + bodyW - 36, bodyY, 4, bodyH);

    g.fillStyle = '#e0b73a';
    g.strokeStyle = '#7c5a12';
    g.lineWidth = 2;
    roundRectPath(g, cx - 17, bodyY + 22, 34, 30, 7);
    g.fill();
    g.stroke();
    g.fillStyle = '#4a3208';
    g.beginPath();
    g.arc(cx, bodyY + 33, 5, 0, Math.PI * 2);
    g.fill();
    g.fillRect(cx - 2.5, bodyY + 33, 5, 9);

    g.save();
    g.translate(cx, bodyY);
    g.translate(0, -34 * lidLift);
    g.rotate(-0.3 * lidLift);
    g.translate(-cx, -bodyY);

    const lidGrad = g.createLinearGradient(0, lidY, 0, lidY + lidH);
    lidGrad.addColorStop(0, '#a06a32');
    lidGrad.addColorStop(1, '#6b431e');
    g.fillStyle = lidGrad;
    g.strokeStyle = '#3a2410';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(lidX, lidY + lidH);
    g.lineTo(lidX, lidY + 22);
    g.quadraticCurveTo(lidX + 6, lidY, lidX + bodyW / 2, lidY);
    g.quadraticCurveTo(lidX + bodyW - 6, lidY, lidX + bodyW, lidY + 22);
    g.lineTo(lidX + bodyW, lidY + lidH);
    g.closePath();
    g.fill();
    g.stroke();

    g.fillStyle = '#c9a227';
    g.fillRect(lidX + 22, lidY + lidH - 13, bodyW - 44, 13);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(lidX + 22, lidY + lidH - 13, bodyW - 44, 4);

    drawOuroboros(g, lidX + bodyW / 2, lidY + lidH / 2 - 1, 17, t, glow);
    g.restore();
}

function drawChestReveal(t) {
    if (chestState !== 'opened') return;
    const prevCtx = ctx;
    const prevTile = tileSize;
    const prevCount = tileCount;

    ctx = chestCanvasEl.getContext('2d');
    tileSize = 34;
    tileCount = 50;

    const skin = { hue: playerSkin.hue, pattern: playerSkin.pattern, hat: playerSkin.hat };
    if (pendingItem) {
        if (pendingItem.type === 'hue') skin.hue = pendingItem.id;
        else if (pendingItem.type === 'pattern') skin.pattern = pendingItem.id;
        else if (pendingItem.type === 'hat') skin.hat = pendingItem.id;
    }

    ctx.save();
    ctx.translate(52, 2);
    drawSnakeSet([
        { x: 3, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 1 }
    ], 1, 0, skin, t);
    ctx.restore();

    ctx = prevCtx;
    tileSize = prevTile;
    tileCount = prevCount;
}

function drawWardrobePreview(t) {
    const prevCtx = ctx;
    const prevTile = tileSize;
    const prevCount = tileCount;

    ctx = wardPreviewEl.getContext('2d');
    tileCount = 50;
    tileSize = 40;

    const w = wardPreviewEl.width;
    const h = wardPreviewEl.height;

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#0b1220');
    bg.addColorStop(1, '#14213b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(148,163,184,0.14)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx <= w; gx += tileSize) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke();
    }
    for (let gy = 0; gy <= h; gy += tileSize) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(w, gy); ctx.stroke();
    }

    const cy = 1;
    const seg = [
        { x: 9, y: cy },
        { x: 8, y: cy },
        { x: 7, y: cy },
        { x: 6, y: cy },
        { x: 5, y: cy },
        { x: 4, y: cy },
        { x: 3, y: cy }
    ];

    FRUITS[0](11 * tileSize + tileSize / 2, cy * tileSize + tileSize / 2, tileSize * 0.5, t);
    drawSnakeSet(seg, 1, 0, activeLook(), t);

    ctx = prevCtx;
    tileSize = prevTile;
    tileCount = prevCount;
}

buildWardrobe();

initGame();
playerNameEl.value = localStorage.getItem('snakeName') || '';
skinNameEl.value = playerNameEl.value;
refreshLeaders();
initAuth();
requestAnimationFrame(renderFrame);

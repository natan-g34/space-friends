// =============================================
// חברים מהחלל — SPACE FRIENDS
// =============================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width;   // 480
const H = canvas.height;  // 640

// ---- Game States ----
const STATE = {
  TITLE:      'TITLE',
  PLAYING:    'PLAYING',
  BOSS_INTRO: 'BOSS_INTRO',
  BOSS:       'BOSS',
  WAVE_CLEAR: 'WAVE_CLEAR',
  VICTORY:    'VICTORY',
  GAME_OVER:  'GAME_OVER',
};

// ---- Wave / Boss config ----
const WAVES = [
  {
    name: 'אלון',
    imageKey: 'alon',
    bossText: 'זהירות — אלון יורה את הלשון!',
    bossHp: 20,
    bossColor: '#ff6b6b',
  },
  {
    name: 'שליו',
    imageKey: 'shalev',
    bossText: 'שליו מגיע עם המשקפיים המלייזריות!',
    bossHp: 30,
    bossColor: '#ffd93d',
  },
  {
    name: 'יעקב',
    imageKey: 'yakov',
    bossText: 'יעקב הגיע וכולם בצרות!',
    bossHp: 40,
    bossColor: '#6bcb77',
  },
];

// ---- Asset Loading ----
const images = {};
let assetsLoaded = 0;
const ASSET_NAMES = ['alon', 'shalev', 'yakov'];
const ASSET_FILES  = { alon: 'Alon.png', shalev: 'Shalev.png', yakov: 'Yakov.png' };

function loadAssets(callback) {
  ASSET_NAMES.forEach(name => {
    const img = new Image();
    img.onload  = () => { assetsLoaded++; if (assetsLoaded === ASSET_NAMES.length) callback(); };
    img.onerror = () => { assetsLoaded++; if (assetsLoaded === ASSET_NAMES.length) callback(); };
    img.src = ASSET_FILES[name];
    images[name] = img;
  });
}

// Pre-render circular face sprites to offscreen canvases
const faceCanvases = {};
function prepareFaceSprites(size) {
  ASSET_NAMES.forEach(name => {
    const key = name + '_' + size;
    if (faceCanvases[key]) return; // already done
    const oc = document.createElement('canvas');
    oc.width = size; oc.height = size;
    const octx = oc.getContext('2d');
    octx.save();
    octx.beginPath();
    octx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    octx.closePath();
    octx.clip();
    if (images[name] && images[name].naturalWidth > 0) {
      octx.drawImage(images[name], 0, 0, size, size);
    } else {
      octx.fillStyle = '#666';
      octx.fill();
    }
    octx.restore();
    faceCanvases[key] = oc;
  });
}

// ---- Helpers ----
function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}

function spawnExplosion(particles, x, y, color) {
  for (let i = 0; i < 8; i++) particles.push(new Particle(x, y, color));
}

// ---- Screen Shake ----
let shakeTimer = 0, shakeMag = 0;
function triggerShake(mag = 8, dur = 0.3) { shakeMag = mag; shakeTimer = dur; }

// ---- Stars ----
class Star {
  constructor(layer) {
    this.layer = layer;
    this.reset(true);
  }
  reset(init = false) {
    this.x = Math.random() * W;
    this.y = init ? Math.random() * H : -2;
    const speeds = [30, 70, 130];
    const sizes  = [1, 1.5, 2.5];
    const alphas = [0.25, 0.55, 0.9];
    this.speed = speeds[this.layer];
    this.size  = sizes[this.layer];
    this.alpha = alphas[this.layer];
  }
  update(dt) {
    this.y += this.speed * dt;
    if (this.y > H + 4) this.reset();
  }
  draw() {
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = '#fff';
    ctx.fillRect(this.x, this.y, this.size, this.size);
    ctx.globalAlpha = 1;
  }
}

// ---- Bullet ----
class Bullet {
  constructor(x, y, vy, isPlayer) {
    this.x = x; this.y = y;
    this.vy = vy;
    this.vx = 0;
    this.isPlayer = isPlayer;
    this.w = isPlayer ? 4 : 5;
    this.h = isPlayer ? 14 : 10;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -30 || this.y > H + 30 || this.x < -30 || this.x > W + 30) this.dead = true;
  }
  draw() {
    if (this.isPlayer) {
      ctx.shadowBlur = 10; ctx.shadowColor = '#00ffff';
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    } else {
      ctx.shadowBlur = 8; ctx.shadowColor = '#ff4400';
      ctx.fillStyle = '#ff6600';
      ctx.fillRect(this.x - this.w / 2, this.y - this.h / 2, this.w, this.h);
    }
    ctx.shadowBlur = 0;
  }
  get rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
}

// Angled spread bullet used by boss
class SpreadBullet extends Bullet {
  constructor(x, y, vx, vy) {
    super(x, y, vy, false);
    this.vx = vx;
    this.w = 10; this.h = 10;
  }
  draw() {
    ctx.shadowBlur = 8; ctx.shadowColor = '#ff0088';
    ctx.fillStyle = '#ff44aa';
    ctx.beginPath();
    ctx.arc(this.x, this.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
  get rect() { return { x: this.x - 5, y: this.y - 5, w: 10, h: 10 }; }
}

// ---- Particle ----
class Particle {
  constructor(x, y, color) {
    this.x = x; this.y = y;
    this.vx = (Math.random() - 0.5) * 220;
    this.vy = (Math.random() - 0.5) * 220 - 40;
    this.maxLife = 0.5 + Math.random() * 0.4;
    this.life = this.maxLife;
    this.size = 2 + Math.random() * 4;
    this.color = color;
    this.dead = false;
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 120 * dt;
    this.life -= dt;
    if (this.life <= 0) this.dead = true;
  }
  draw() {
    const a = Math.max(0, this.life / this.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * a, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

// ---- Enemy ----
class Enemy {
  constructor(imageKey, x, y) {
    this.imageKey = imageKey;
    this.x = x; this.y = y;
    this.dead = false;
  }
  draw() {
    const face = faceCanvases[this.imageKey + '_52'];
    // alien body
    ctx.fillStyle = '#111133';
    roundRect(ctx, this.x - 28, this.y - 26, 56, 56, 9);
    ctx.fill();
    ctx.strokeStyle = '#3344bb';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // face
    if (face) ctx.drawImage(face, this.x - 26, this.y - 26, 52, 52);
  }
  get rect() { return { x: this.x - 26, y: this.y - 26, w: 52, h: 52 }; }
}

// ---- EnemyGrid ----
class EnemyGrid {
  constructor(imageKey) {
    this.imageKey = imageKey;
    this.cols = 6;
    this.rows = 3;
    const spacingX = 70;
    const spacingY = 64;
    const startX = (W - (this.cols - 1) * spacingX) / 2;
    const startY = 85;
    this.enemies = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        this.enemies.push(new Enemy(imageKey, startX + c * spacingX, startY + r * spacingY));
      }
    }
    this.dx = 55;
    this.direction = 1;
    this.dropQueue = 0;
    this.dropAmount = 20;
    this.shootTimer = 1.2;
    this.shootInterval = 1.5;
  }
  get alive() { return this.enemies.filter(e => !e.dead); }
  update(dt, bullets, particles, onKill) {
    const living = this.alive;
    if (living.length === 0) return;

    const killed = this.enemies.length - living.length;
    const speed = this.dx * (1 + 0.045 * killed);

    // Find bounds
    let minX = Infinity, maxX = -Infinity;
    living.forEach(e => { minX = Math.min(minX, e.x - 28); maxX = Math.max(maxX, e.x + 28); });

    if (this.dropQueue > 0) {
      const step = Math.min(this.dropQueue, 80 * dt);
      living.forEach(e => e.y += step);
      this.dropQueue -= step;
    } else {
      if (this.direction === 1 && maxX >= W - 12) { this.direction = -1; this.dropQueue = this.dropAmount; }
      if (this.direction === -1 && minX <= 12)    { this.direction =  1; this.dropQueue = this.dropAmount; }
      living.forEach(e => e.x += speed * this.direction * dt);
    }

    // Shooting
    this.shootTimer -= dt;
    if (this.shootTimer <= 0 && living.length > 0) {
      const shooter = living[Math.floor(Math.random() * living.length)];
      bullets.push(new Bullet(shooter.x, shooter.y + 28, 260, false));
      this.shootTimer = this.shootInterval * (0.6 + Math.random() * 0.8);
    }

    // Collide with player bullets
    const pBullets = bullets.filter(b => b.isPlayer && !b.dead);
    living.forEach(enemy => {
      pBullets.forEach(b => {
        if (!b.dead && !enemy.dead && rectsOverlap(b.rect, enemy.rect)) {
          b.dead = true;
          enemy.dead = true;
          spawnExplosion(particles, enemy.x, enemy.y, '#aaaaff');
          onKill(100);
        }
      });
    });
  }
  draw() { this.enemies.forEach(e => { if (!e.dead) e.draw(); }); }
  hasReachedBottom() { return this.alive.some(e => e.y + 26 >= H - 90); }
}

// ---- Boss ----
class Boss {
  constructor(waveData) {
    this.imageKey = waveData.imageKey;
    this.name     = waveData.name;
    this.color    = waveData.bossColor;
    this.maxHp    = waveData.bossHp;
    this.hp       = this.maxHp;
    this.x        = W / 2;
    this.y        = 140;
    this.size     = 120;
    this.dx       = 85;
    this.direction = 1;
    this.shootTimer = 0;
    this.shootInterval = 2.0;
    this.dead = false;
    prepareFaceSprites(this.size);
  }
  get angry() { return this.hp <= this.maxHp * 0.5; }
  update(dt, bullets, particles, onKill) {
    const speed = this.angry ? this.dx * 1.8 : this.dx;
    this.x += speed * this.direction * dt;
    if (this.x + this.size / 2 >= W - 20) this.direction = -1;
    if (this.x - this.size / 2 <= 20)     this.direction =  1;

    // Shoot
    this.shootTimer -= dt;
    if (this.shootTimer <= 0) {
      const count = this.angry ? 5 : 3;
      const spread = Math.PI / 3;
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI / 2) + spread * (i / (count - 1) - 0.5);
        const spd = 210;
        bullets.push(new SpreadBullet(this.x, this.y + this.size / 2, Math.cos(angle) * spd, Math.sin(angle) * spd));
      }
      this.shootTimer = (this.angry ? this.shootInterval * 0.55 : this.shootInterval) * (0.8 + Math.random() * 0.4);
    }

    // Hits from player
    const pBullets = bullets.filter(b => b.isPlayer && !b.dead);
    pBullets.forEach(b => {
      if (!b.dead && rectsOverlap(b.rect, this.rect)) {
        b.dead = true;
        this.hp--;
        spawnExplosion(particles, b.x, b.y, this.color);
        if (this.hp <= 0) {
          this.dead = true;
          for (let i = 0; i < 35; i++) {
            spawnExplosion(particles,
              this.x + (Math.random() - 0.5) * 120,
              this.y + (Math.random() - 0.5) * 120,
              this.color);
          }
          onKill(1000);
        }
      }
    });
  }
  draw() {
    const glowColor = this.angry ? '#ff0044' : this.color;
    // Outer glow ring
    ctx.save();
    ctx.shadowBlur = 35;
    ctx.shadowColor = glowColor;
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size / 2 + 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Face clipped to circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
    ctx.clip();
    if (images[this.imageKey] && images[this.imageKey].naturalWidth > 0) {
      ctx.drawImage(images[this.imageKey], this.x - this.size / 2, this.y - this.size / 2, this.size, this.size);
    }
    ctx.restore();
    // HP bar
    const barW = 200, barH = 14;
    const bx = W / 2 - barW / 2, by = 22;
    ctx.fillStyle = '#222';
    ctx.fillRect(bx, by, barW, barH);
    const ratio = this.hp / this.maxHp;
    ctx.fillStyle = ratio > 0.5 ? '#44ee44' : ratio > 0.25 ? '#ffcc00' : '#ff2222';
    ctx.fillRect(bx, by, barW * ratio, barH);
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.fillStyle = '#fff';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(this.name, W / 2, by + barH + 15);
  }
  get rect() { return { x: this.x - this.size / 2, y: this.y - this.size / 2, w: this.size, h: this.size }; }
}

// ---- Player ----
class Player {
  constructor() {
    this.x = W / 2;
    this.y = H - 60;
    this.w = 36; this.h = 44;
    this.speed = 300;
    this.lives = 3;
    this.score = 0;
    this.shootCooldown = 0;
    this.shootInterval = 0.28;
    this.invTimer = 0;
    this.invDuration = 0.8;
    this.dead = false;
    this._lastLifeBonus = 0;
  }
  update(dt, keys, bullets) {
    if (this.dead) return;
    if ((keys['ArrowLeft'] || keys['a'] || keys['A']))  this.x -= this.speed * dt;
    if ((keys['ArrowRight'] || keys['d'] || keys['D'])) this.x += this.speed * dt;
    this.x = Math.max(this.w / 2, Math.min(W - this.w / 2, this.x));

    this.shootCooldown -= dt;
    if ((keys[' '] || keys['Space']) && this.shootCooldown <= 0) {
      bullets.push(new Bullet(this.x, this.y - this.h / 2, -580, true));
      this.shootCooldown = this.shootInterval;
    }
    if (this.invTimer > 0) this.invTimer -= dt;

    // Extra life every 3000 pts
    const bonus = Math.floor(this.score / 3000);
    if (bonus > this._lastLifeBonus) {
      this._lastLifeBonus = bonus;
      this.lives = Math.min(5, this.lives + 1);
    }
  }
  hit(particles) {
    if (this.invTimer > 0) return false;
    this.lives--;
    this.invTimer = this.invDuration;
    spawnExplosion(particles, this.x, this.y, '#00ffff');
    if (this.lives <= 0) this.dead = true;
    return true;
  }
  draw() {
    if (this.invTimer > 0 && Math.floor(this.invTimer * 12) % 2 === 0) return;
    const x = this.x, y = this.y;
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#00ccff';
    // Wings
    ctx.fillStyle = '#007799';
    ctx.beginPath();
    ctx.moveTo(x - this.w / 2, y + this.h / 2);
    ctx.lineTo(x - this.w / 4, y + this.h / 4);
    ctx.lineTo(x - this.w / 4, y - this.h / 6);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + this.w / 2, y + this.h / 2);
    ctx.lineTo(x + this.w / 4, y + this.h / 4);
    ctx.lineTo(x + this.w / 4, y - this.h / 6);
    ctx.closePath();
    ctx.fill();
    // Body
    ctx.fillStyle = '#00ccff';
    ctx.beginPath();
    ctx.moveTo(x, y - this.h / 2);
    ctx.lineTo(x - this.w / 4, y + this.h / 4);
    ctx.lineTo(x - this.w / 4, y + this.h / 2 - 8);
    ctx.lineTo(x, y + this.h / 2 - 4);
    ctx.lineTo(x + this.w / 4, y + this.h / 2 - 8);
    ctx.lineTo(x + this.w / 4, y + this.h / 4);
    ctx.closePath();
    ctx.fill();
    // Cockpit
    ctx.fillStyle = '#ccf4ff';
    ctx.beginPath();
    ctx.ellipse(x, y - 4, 7, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // Flame
    const flameH = 7 + Math.random() * 9;
    ctx.fillStyle = '#ff8800';
    ctx.beginPath();
    ctx.moveTo(x - 5, y + this.h / 2 - 8);
    ctx.lineTo(x, y + this.h / 2 - 8 + flameH);
    ctx.lineTo(x + 5, y + this.h / 2 - 8);
    ctx.closePath();
    ctx.fill();
  }
  get rect() { return { x: this.x - this.w / 2, y: this.y - this.h / 2, w: this.w, h: this.h }; }
}

// ---- HUD ----
function drawHUD(player, waveIndex) {
  ctx.textAlign = 'left';
  ctx.fillStyle = '#556';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText('SCORE', 12, 20);
  ctx.fillStyle = '#00ffff';
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.fillText(String(player.score).padStart(6, '0'), 12, 38);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#556';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText('WAVE ' + (waveIndex + 1) + ' / 3', W / 2, 20);

  ctx.textAlign = 'right';
  ctx.fillStyle = player.lives > 1 ? '#ff8888' : '#ff2222';
  ctx.font = '11px "Press Start 2P", monospace';
  ctx.fillText('\u2665 x' + player.lives, W - 12, 28);
}

// ---- Screen Renderers ----
function drawTitle() {
  ctx.textAlign = 'center';
  ctx.shadowBlur = 24; ctx.shadowColor = '#00ffff';
  ctx.fillStyle = '#00ffff';
  ctx.font = '24px "Press Start 2P", monospace';
  ctx.fillText('\u05d7\u05d1\u05e8\u05d9\u05dd', W / 2, 190);
  ctx.fillText('\u05de\u05d4\u05d7\u05dc\u05dc', W / 2, 228);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#445';
  ctx.font = '9px "Press Start 2P", monospace';
  ctx.fillText('SPACE FRIENDS', W / 2, 264);

  // Three faces preview
  const names = ['alon', 'shalev', 'yakov'];
  names.forEach((n, i) => {
    const fx = W / 2 + (i - 1) * 90;
    const fc = faceCanvases[n + '_60'];
    if (fc) ctx.drawImage(fc, fx - 30, 310, 60, 60);
  });

  if (Math.floor(Date.now() / 500) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.font = '11px "Press Start 2P", monospace';
    ctx.fillText(isTouchDevice ? 'TAP TO START' : 'PRESS SPACE', W / 2, 430);
    if (!isTouchDevice) {
      ctx.fillStyle = '#888';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('TO START', W / 2, 452);
    }
  }

  ctx.fillStyle = '#333';
  ctx.font = '7px "Press Start 2P", monospace';
  ctx.fillText('\u2190 \u2192  MOVE      SPACE  SHOOT', W / 2, H - 18);
}

function drawBossIntro(waveData, timer) {
  const alpha = Math.min(1, timer * 2.5);
  ctx.globalAlpha = alpha * 0.88;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center';
  ctx.shadowBlur = 25; ctx.shadowColor = '#ff0000';
  ctx.fillStyle = '#ff2244';
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillText('\u26a0 BOSS \u26a0', W / 2, H / 2 - 50);
  ctx.shadowBlur = 0;

  // Wrap boss text
  ctx.font = '9px "Press Start 2P", monospace';
  ctx.fillStyle = '#fff';
  const words = waveData.bossText.split(' ');
  let line = '', lines = [];
  words.forEach(w => {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > 340) { lines.push(line); line = w; }
    else line = test;
  });
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, W / 2, H / 2 + i * 26));
}

function drawWaveClearScreen(waveIndex, timer) {
  const a = Math.min(1, timer * 3.5);
  ctx.globalAlpha = a;
  ctx.textAlign = 'center';
  ctx.shadowBlur = 18; ctx.shadowColor = '#44ff88';
  ctx.fillStyle = '#44ff88';
  ctx.font = '16px "Press Start 2P", monospace';
  ctx.fillText('WAVE ' + (waveIndex + 1) + ' CLEAR!', W / 2, H / 2 - 10);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#aaa';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText('+1000 PTS', W / 2, H / 2 + 18);
  ctx.globalAlpha = 1;
}

function drawGameOver() {
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.shadowBlur = 22; ctx.shadowColor = '#ff0000';
  ctx.fillStyle = '#ff2244';
  ctx.font = '20px "Press Start 2P", monospace';
  ctx.fillText('GAME OVER', W / 2, H / 2 - 70);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '9px "Press Start 2P", monospace';
  ctx.fillText('SCORE: ' + player.score, W / 2, H / 2 - 30);
  ctx.fillStyle = '#888';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText('\u05d4\u05d7\u05d1\u05e8\u05d9\u05dd \u05e0\u05d9\u05e6\u05d7\u05d5... \u05d4\u05e4\u05e2\u05dd', W / 2, H / 2 + 10);
  if (Math.floor(Date.now() / 600) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(isTouchDevice ? 'TAP TO RETRY' : 'PRESS SPACE', W / 2, H / 2 + 70);
    if (!isTouchDevice) {
      ctx.fillStyle = '#777';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('TO RETRY', W / 2, H / 2 + 92);
    }
  }
}

function drawVictory() {
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center';
  ctx.shadowBlur = 28; ctx.shadowColor = '#ffd700';
  ctx.fillStyle = '#ffd700';
  ctx.font = '18px "Press Start 2P", monospace';
  ctx.fillText('YOU WIN! \uD83C\uDFC6', W / 2, H / 2 - 100);
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff';
  ctx.font = '10px "Press Start 2P", monospace';
  ctx.fillText('SCORE: ' + player.score, W / 2, H / 2 - 58);
  ctx.fillStyle = '#aaffaa';
  ctx.font = '8px "Press Start 2P", monospace';
  ctx.fillText('\u05e0\u05d9\u05e6\u05d7\u05ea \u05d0\u05ea \u05db\u05dc \u05d4\u05d7\u05d1\u05e8\u05d9\u05dd!', W / 2, H / 2 - 20);
  ctx.fillText('\u05d0\u05dc\u05d5\u05df, \u05e9\u05dc\u05d9\u05d5 \u05d5\u05d9\u05e2\u05e7\u05d1', W / 2, H / 2 + 4);
  ctx.fillText('\u05db\u05d5\u05e8\u05e2\u05d9\u05dd \u05dc\u05e4\u05e0\u05d9\u05da \uD83D\uDC51', W / 2, H / 2 + 28);
  if (Math.floor(Date.now() / 600) % 2 === 0) {
    ctx.fillStyle = '#fff';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.fillText(isTouchDevice ? 'TAP TO PLAY AGAIN' : 'PRESS SPACE', W / 2, H / 2 + 90);
    if (!isTouchDevice) {
      ctx.fillStyle = '#888';
      ctx.font = '8px "Press Start 2P", monospace';
      ctx.fillText('TO PLAY AGAIN', W / 2, H / 2 + 112);
    }
  }
}

// ---- Game State ----
let state = STATE.TITLE;
let player, bullets, particles, enemyGrid, boss;
let waveIndex = 0, stateTimer = 0;
const keys = {};
const isTouchDevice = navigator.maxTouchPoints > 0;

function initGame() {
  player    = new Player();
  bullets   = [];
  particles = [];
  waveIndex = 0;
  enemyGrid = new EnemyGrid(WAVES[0].imageKey);
  boss      = null;
  stateTimer = 0;
  shakeTimer = 0;
  state = STATE.PLAYING;
}

function startNextWave() {
  waveIndex++;
  if (waveIndex >= WAVES.length) { state = STATE.VICTORY; return; }
  bullets   = bullets.filter(b => b.isPlayer);
  enemyGrid = new EnemyGrid(WAVES[waveIndex].imageKey);
  boss      = null;
  state     = STATE.PLAYING;
}

// ---- Input ----
window.addEventListener('keydown', e => {
  keys[e.key] = true;
  if (e.key === ' ') e.preventDefault();
  if (state === STATE.TITLE && e.key === ' ')                          initGame();
  if ((state === STATE.GAME_OVER || state === STATE.VICTORY) && e.key === ' ') state = STATE.TITLE;
});
window.addEventListener('keyup', e => { keys[e.key] = false; });

// Tap anywhere on canvas to advance screens (mobile)
canvas.addEventListener('touchstart', e => {
  e.preventDefault();
  if (state === STATE.TITLE)                              initGame();
  if (state === STATE.GAME_OVER || state === STATE.VICTORY) state = STATE.TITLE;
}, { passive: false });

// ---- Update phases ----
function updatePlaying(dt) {
  player.update(dt, keys, bullets);
  bullets.forEach(b => b.update(dt));
  bullets   = bullets.filter(b => !b.dead);
  particles.forEach(p => p.update(dt));
  particles = particles.filter(p => !p.dead);

  if (enemyGrid) {
    enemyGrid.update(dt, bullets, particles, pts => { player.score += pts; });
    if (enemyGrid.alive.length === 0) {
      state = STATE.BOSS_INTRO;
      stateTimer = 0;
      bullets = bullets.filter(b => b.isPlayer);
      return;
    }
    if (enemyGrid.hasReachedBottom()) { player.lives = 0; player.dead = true; }
  }

  // Enemy bullets hit player
  bullets.filter(b => !b.isPlayer).forEach(b => {
    if (rectsOverlap(b.rect, player.rect)) {
      b.dead = true;
      if (player.hit(particles)) triggerShake();
    }
  });

  if (player.dead) state = STATE.GAME_OVER;
}

function updateBoss(dt) {
  player.update(dt, keys, bullets);
  bullets.forEach(b => b.update(dt));
  bullets   = bullets.filter(b => !b.dead);
  particles.forEach(p => p.update(dt));
  particles = particles.filter(p => !p.dead);

  if (boss && !boss.dead) boss.update(dt, bullets, particles, pts => { player.score += pts; });

  bullets.filter(b => !b.isPlayer).forEach(b => {
    if (rectsOverlap(b.rect, player.rect)) {
      b.dead = true;
      if (player.hit(particles)) triggerShake();
    }
  });

  if (player.dead) { state = STATE.GAME_OVER; return; }

  if (boss && boss.dead) {
    bullets = [];
    state = waveIndex >= WAVES.length - 1 ? STATE.VICTORY : STATE.WAVE_CLEAR;
    stateTimer = 0;
  }
}

// ---- Draw phases ----
function drawGameLayer() {
  if (enemyGrid) enemyGrid.draw();
  bullets.forEach(b => b.draw());
  particles.forEach(p => p.draw());
  if (player && !player.dead) player.draw();
  if (player) drawHUD(player, waveIndex);
}

function drawBossLayer() {
  if (boss && !boss.dead) boss.draw();
  bullets.forEach(b => b.draw());
  particles.forEach(p => p.draw());
  if (player && !player.dead) player.draw();
  if (player) drawHUD(player, waveIndex);
}

// ---- Stars ----
const stars = [];
for (let i = 0; i < 40; i++) stars.push(new Star(0));
for (let i = 0; i < 25; i++) stars.push(new Star(1));
for (let i = 0; i < 15; i++) stars.push(new Star(2));

// ---- Main Loop ----
let lastTime = 0;
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  // Shake offset
  let sx = 0, sy = 0;
  if (shakeTimer > 0) {
    shakeTimer -= dt;
    sx = (Math.random() - 0.5) * shakeMag * 2;
    sy = (Math.random() - 0.5) * shakeMag * 2;
  }

  ctx.save();
  ctx.translate(sx, sy);

  // Clear
  ctx.fillStyle = '#05050f';
  ctx.fillRect(-10, -10, W + 20, H + 20);

  // Stars (always)
  stars.forEach(s => { s.update(dt); s.draw(); });

  switch (state) {
    case STATE.TITLE:
      drawTitle();
      break;

    case STATE.PLAYING:
      updatePlaying(dt);
      drawGameLayer();
      break;

    case STATE.BOSS_INTRO:
      stateTimer += dt;
      drawGameLayer(); // show empty field during intro
      drawBossIntro(WAVES[waveIndex], stateTimer);
      if (stateTimer >= 2.6) {
        stateTimer = 0;
        state = STATE.BOSS;
        boss = new Boss(WAVES[waveIndex]);
      }
      break;

    case STATE.BOSS:
      updateBoss(dt);
      drawBossLayer();
      break;

    case STATE.WAVE_CLEAR:
      stateTimer += dt;
      drawBossLayer();
      drawWaveClearScreen(waveIndex, stateTimer);
      if (stateTimer >= 1.9) { stateTimer = 0; startNextWave(); }
      break;

    case STATE.GAME_OVER:
      drawBossLayer();
      drawGameOver();
      break;

    case STATE.VICTORY:
      drawBossLayer();
      drawVictory();
      break;
  }

  ctx.restore();
  requestAnimationFrame(loop);
}

// ---- Boot ----
loadAssets(() => {
  prepareFaceSprites(52);
  prepareFaceSprites(60);
  requestAnimationFrame(ts => { lastTime = ts; requestAnimationFrame(loop); });
});

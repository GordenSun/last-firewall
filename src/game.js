'use strict';
const W = 480, H = 270, DT = 1 / 60, TAU = Math.PI * 2;
const $ = id => document.getElementById(id);
const cv = $('game'), ctx = cv.getContext('2d');
const wrap = $('wrap');
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const QS = new URLSearchParams(location.search);
const BOT = QS.has('bot'), FAST = +QS.get('fast') || 1;
const fmt = t => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

let state = 'loading', G = null, scale = 1, offX = 0, offY = 0, TILES = null;
let touchMode = false, titleT = 0, storyT = 0;
const MOVE_DEAD = 8, MOVE_RAMP = 44;
const keys = {}, mouse = { x: W / 2, y: H / 2, inside: false };
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0, active: false };

// ============ text rendering (pixel font, cached) ============
const tcache = new Map();
function textSpr(str, color, size, outline) {
  const key = str + '|' + color + '|' + size + '|' + outline;
  let c = tcache.get(key); if (c) return c;
  if (tcache.size > 2500) tcache.clear();
  const m = newCanvas(1, 1).getContext('2d'); m.font = size + 'px FP';
  const w = Math.ceil(m.measureText(str).width) + 4;
  c = newCanvas(w, size + 4); const x = c.getContext('2d');
  x.font = size + 'px FP'; x.textBaseline = 'top';
  const o = size >= 24 ? 2 : 1;
  if (outline) {
    x.fillStyle = outline;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) x.fillText(str, 2 + dx * o, 1 + dy * o);
    if (size >= 24) x.fillText(str, 2, 1 + 3);
  }
  x.fillStyle = color; x.fillText(str, 2, 1);
  tcache.set(key, c); return c;
}
function text(str, x, y, color = '#f4f4f4', align = 'l', size = 12, outline = '#1a1c2c') {
  const c = textSpr(String(str), color, size, outline);
  const dx = align === 'c' ? -c.width / 2 : align === 'r' ? -c.width : 0;
  ctx.drawImage(c, Math.round(x + dx), Math.round(y));
  return c.width;
}

// ============ pixel primitives ============
const spanCache = {};
function spans(r) {
  if (spanCache[r]) return spanCache[r];
  const a = []; for (let y = -r; y <= r; y++) a.push(Math.floor(Math.sqrt(Math.max(0, r * r + r * 0.8 - y * y))));
  return (spanCache[r] = a);
}
function disc(cx, cy, r) {
  r = Math.max(0, Math.round(r)); const s = spans(r); cx = Math.round(cx); cy = Math.round(cy);
  for (let i = 0; i < s.length; i++) ctx.fillRect(cx - s[i], cy - r + i, s[i] * 2 + 1, 1);
}
function ringPx(cx, cy, r, th = 1) {
  const n = Math.max(8, Math.ceil(TAU * r / 1.2));
  for (let k = 0; k < n; k++) { const a = k / n * TAU; ctx.fillRect(Math.round(cx + Math.cos(a) * r - th / 2), Math.round(cy + Math.sin(a) * r - th / 2), th, th); }
}
function pline(x0, y0, x1, y1, w = 1) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) | 0, h = w >> 1;
  for (let i = 0; i <= n; i++) { const t = n ? i / n : 0; ctx.fillRect(Math.round(x0 + (x1 - x0) * t) - h, Math.round(y0 + (y1 - y0) * t) - h, w, w); }
}

// ============ definitions ============
const ETYPES = {
  crawler: { hp: 14, r: 5, spd: 50, dmg: 8, coin: 1, mass: 1, cols: ['#b13e53', '#e04060', '#ffcd75'] },
  brute: { hp: 110, r: 7, spd: 27, dmg: 18, coin: 4, mass: 5, cols: ['#8a3cc0', '#c070f0', '#f4f4f4'] },
  spitter: { hp: 32, r: 6, spd: 38, dmg: 10, coin: 2, mass: 1.5, cols: ['#38b764', '#a7f070', '#f4f4f4'] },
  charger: { hp: 48, r: 6, spd: 44, dmg: 16, coin: 3, mass: 2, cols: ['#ef7d57', '#ffcd75', '#f4f4f4'] },
  splitter: { hp: 46, r: 6, spd: 36, dmg: 10, coin: 2, mass: 2, cols: ['#38b764', '#a7f070', '#257179'] },
  mini: { hp: 8, r: 4, spd: 66, dmg: 6, coin: 1, mass: 0.7, cols: ['#38b764', '#a7f070'] },
  boss: { hp: 2600, r: 18, spd: 40, dmg: 25, coin: 0, mass: 40, cols: ['#b13e53', '#e04060', '#ffcd75', '#f4f4f4'] },
};
const BOSSES = [
  { name: '零号病毒母体', en: 'PATIENT ZERO', c1: '#b13e53', c2: '#e04060', c3: '#ffcd75', b1: '#ff3355', b2: '#ff66cc', b3: '#c070f0' },
  { name: '深渊协议', en: 'ABYSS PROTOCOL', c1: '#29366f', c2: '#41a6f6', c3: '#73eff7', b1: '#c070f0', b2: '#ff3355', b3: '#ff66cc' },
  { name: '终焉之核', en: 'OMEGA CORE', c1: '#5d275d', c2: '#c070f0', c3: '#f4f4f4', b1: '#ff66cc', b2: '#c070f0', b3: '#ff3355' },
];
const TYPE_NAME = { boost: '加成', barrage: '弹幕', summon: '召唤' };
const UPG = [
  { id: 'dmg', name: '过载弹芯', g: '力', type: 'boost', max: 8, desc: '子弹伤害 +30%', apply: S => S.dmg += 3 },
  { id: 'rate', name: '超频扳机', g: '速', type: 'boost', max: 8, desc: '射速 +20%', apply: S => S.rate += 1.2 },
  { id: 'multi', name: '散射模块', g: '散', type: 'barrage', max: 4, desc: '主武器每次\n额外 +1 发弹丸', apply: S => S.multi++ },
  { id: 'pierce', name: '穿甲钨芯', g: '穿', type: 'barrage', max: 4, desc: '子弹可多穿透\n1 个敌人', apply: S => S.pierce++ },
  { id: 'crit', name: '致命代码', g: '暴', type: 'boost', max: 5, desc: '暴击率 +8%\n暴击伤害 +30%', apply: S => { S.crit += 0.08; S.critMul += 0.3; } },
  { id: 'hp', name: '纳米装甲', g: '甲', type: 'boost', max: 6, desc: '生命上限 +25\n并回复 25 生命', apply: (S, p) => { p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); } },
  { id: 'regen', name: '自修复协议', g: '愈', type: 'boost', max: 5, desc: '每秒回复\n0.5 点生命', apply: S => S.regen += 0.5 },
  { id: 'magnet', name: '引力核心', g: '引', type: 'boost', max: 4, desc: '拾取范围 +45%', apply: S => S.magnet *= 1.45 },
  { id: 'speed', name: '疾风协议', g: '风', type: 'boost', max: 4, desc: '移动速度 +10%\n冲刺冷却 -15%', apply: S => { S.speed *= 1.1; S.dashCd *= 0.85; } },
  { id: 'bounce', name: '跳弹算法', g: '跳', type: 'barrage', max: 3, desc: '子弹命中后\n弹射向下个敌人', apply: S => S.bounce++ },
  { id: 'boom', name: '爆裂弹头', g: '爆', type: 'barrage', max: 4, desc: '子弹命中时爆炸\n升级扩大范围', apply: S => S.boom++ },
  { id: 'energy', name: '能量虹吸', g: '能', type: 'boost', max: 4, desc: '能量获取 +35%\n超载时长 +1.5秒', apply: S => { S.energyMul *= 1.35; S.odDur += 1.5; } },
  { id: 'rear', name: '全向火力', g: '全', type: 'barrage', max: 3, desc: l => ['向正后方\n追加射击', '向左右两侧\n追加射击', '向斜后方\n追加射击'][l], apply: S => S.rear++ },
  { id: 'drone', name: '僚机无人机', g: '僚', type: 'summon', max: 4, desc: '召唤 1 架自动\n索敌射击的僚机' },
  { id: 'blade', name: '环绕光刃', g: '刃', type: 'summon', max: 5, desc: l => l ? '光刃 +1\n旋转速度提升' : '召唤 2 把绕身\n旋转的光刃' },
  { id: 'thunder', name: '雷霆链', g: '雷', type: 'summon', max: 5, desc: '周期召唤连锁雷\n升级增加链数' },
  { id: 'turret', name: '哨戒炮台', g: '炮', type: 'summon', max: 4, desc: '定期空投炮台\n自动扫射敌人' },
  { id: 'missile', name: '蜂群导弹', g: '蜂', type: 'summon', max: 5, desc: '定期齐射追踪弹\n升级 +1 枚导弹' },
  { id: 'nova', name: '冰霜新星', g: '冰', type: 'summon', max: 4, desc: '周期释放冰环\n伤害并冻结敌人' },
  { id: 'orbital', name: '天罚轨道炮', g: '天', type: 'summon', max: 3, desc: '卫星锁定敌群\n降下毁灭光柱' },
];
const HEAL = { id: 'heal', name: '紧急维修', g: '修', type: 'boost', max: 999, desc: '立即回复\n50% 生命', apply: (S, p) => { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.5); } };
const WAVE_SUB = ['数据洪流加剧', '病毒正在进化', '警报：防线承压', '更多的它们来了', '核心温度上升', '坚持住，守夜人'];

// ============ game setup ============
function newGame() {
  G = {
    t: 0, eid: 0,
    player: { x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, hpShown: 100, r: 4, inv: 0, dashCd: 0, dashT: 0, dx: 1, dy: 0, aim: 0, fireT: 0, recoil: 0, walk: 0, face: 1, moving: false },
    S: { dmg: 10, rate: 6, bspeed: 290, multi: 1, pierce: 0, crit: 0.05, critMul: 2, bounce: 0, boom: 0, magnet: 38, speed: 92, regen: 0, energyMul: 1, odDur: 8, rear: 0, dashCd: 1.1 },
    up: {}, enemies: [], bullets: [], ebullets: [], pickups: [], parts: [], fx: [], decals: [], banners: [],
    drones: [], turrets: [], bladeA: 0, bladePos: [], thT: 1, tuT: 1, miT: 1, noT: 1, orT: 3,
    scarf: [], coins: 0, coinFrac: 0, milestone: 0, prevAt: 0, nextAt: 10, pending: 0, rerolls: 3,
    kills: 0, combo: 0, comboT: 0, maxCombo: 0, comboPop: 0, grazes: 0, nums: 0,
    energy: 0, od: 0, odSpin: 0, odAcc: 0, energyReady: false,
    wave: 1, spawnAcc: 0, boss: null, bossCount: 0, bossKills: 0, nextBoss: 150, bossWarned: false, nextEvent: 55, eventIdx: 0,
    shake: 0, kick: 0, hitstop: 0, slowT: 0, timeScale: 1, flash: 0, flashColor: '#ffffff', dying: 0, choices: null, upOpen: 0,
  };
  for (let i = 0; i < 6; i++) G.scarf.push({ x: 0, y: 0 });
}

// ============ spatial grid ============
const CELL = 24; const grid = new Map();
const gkey = (cx, cy) => (cx + 32768) * 65536 + (cy + 32768);
function buildGrid() {
  grid.clear();
  for (const e of G.enemies) {
    if (e.dead) continue;
    const k = gkey(Math.floor(e.x / CELL), Math.floor(e.y / CELL));
    let a = grid.get(k); if (!a) { a = []; grid.set(k, a); } a.push(e);
  }
}
function forNear(x, y, r, fn) {
  const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) {
    const a = grid.get(gkey(cx, cy)); if (!a) continue;
    for (let i = 0; i < a.length; i++) { const e = a[i]; if (!e.dead && fn(e) === true) return true; }
  }
  return false;
}
function nearest(x, y, R, excl) {
  let best = null, bd = R * R;
  for (const e of G.enemies) {
    if (e.dead || (excl && excl.includes(e.id))) continue;
    const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

// ============ effects helpers ============
const MAXP = 2600;
function part(o) { if (G.parts.length < MAXP) G.parts.push(o); }
function burst(x, y, n, cols, spd = 80, life = 0.5, size = 2, spark = false) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(spd * 0.3, spd);
    part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(life * 0.5, life), max: life, color: cols[(Math.random() * cols.length) | 0], size: Math.random() < 0.3 ? size + 1 : size, drag: 4, spark });
  }
}
function addNum(x, y, v, crit) {
  if (G.nums > (crit ? 70 : 35) || G.parts.length > 2200) return;
  G.nums++;
  part({ x, y, vx: rand(-15, 15), vy: crit ? -70 : -50, life: crit ? 0.7 : 0.45, max: 0.7, num: crit ? Math.round(v) + '!' : String(Math.round(v)), color: crit ? '#ffcd75' : '#f4f4f4', drag: 5, size: crit ? 1 : 0 });
}
function floatText(x, y, str, color, life = 1) { part({ x, y, vx: 0, vy: -24, life, max: life, num: str, color, drag: 2, size: 0, keep: true }); }
function addShake(v) { G.shake = Math.min(10, G.shake + v); }
function banner(title, sub, color = '#ffcd75', life = 2.6) { G.banners.push({ title, sub, color, t: 0, life }); }
function ring(x, y, R, color, life = 0.35, th = 2) { G.fx.push({ type: 'ring', x, y, R, color, t: 0, life, th }); }

// ============ shooting ============
function pBullet(x, y, ang, spd, dmg, o = {}) {
  if (G.bullets.length > 800) return;
  G.bullets.push({
    x, y, px: x, py: y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, dmg, life: o.life || 1.1, r: o.r || 2,
    pierce: o.pierce ?? G.S.pierce, bounce: o.bounce ?? G.S.bounce, color: o.color || '#ffcd75', kind: o.kind || 'main', hits: [], kb: o.kb || 1,
    boomR: o.boomR || 0, target: null, dead: false,
  });
}
function eShot(x, y, ang, spd, r, color, o = {}) {
  if (G.ebullets.length > 1000) return;
  G.ebullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r, color, life: o.life || 7, av: o.av || 0, acc: o.acc || 0, dmg: (o.dmg || 10) * (1 + G.t / 500), grazed: false, t: 0 });
}
// friendly bullets: cyan / white / gold streaks. hostile bullets: red / pink / purple orbs (see HOSTILE)
function odHue(i) { return ['#ffcd75', '#f4f4f4', '#73eff7', '#ffe9a8', '#9ff4ff'][i % 5]; }
const HOSTILE = { red: '#ff3355', pink: '#ff66cc', purple: '#c070f0' };

function fireMain() {
  const p = G.player, S = G.S, a = p.aim;
  const bx = p.x + Math.cos(a) * 9, by = p.y + Math.sin(a) * 9 - 1;
  const dmg = S.dmg * (G.od > 0 ? 1.5 : 1);
  const n = S.multi, spread = 0.11;
  const col = G.od > 0 ? odHue((G.t * 20) | 0) : '#73eff7';
  for (let i = 0; i < n; i++) pBullet(bx, by, a + (i - (n - 1) / 2) * spread + rand(-0.035, 0.035), S.bspeed, dmg, { color: col });
  const extra = [];
  if (S.rear >= 1) extra.push(Math.PI);
  if (S.rear >= 2) extra.push(Math.PI / 2, -Math.PI / 2);
  if (S.rear >= 3) extra.push(Math.PI * 0.75, -Math.PI * 0.75);
  for (const e of extra) pBullet(p.x, p.y - 1, a + e, S.bspeed * 0.9, dmg * 0.7, { color: '#41a6f6' });
  G.fx.push({ type: 'muzzle', x: bx, y: by, a, t: 0, life: 0.05 });
  const pa = a + Math.PI / 2 * -p.face;
  part({ x: p.x, y: p.y, vx: Math.cos(pa) * 50 + rand(-15, 15), vy: Math.sin(pa) * 50 - 30, life: 0.4, max: 0.4, color: '#ffcd75', size: 1, drag: 5 });
  p.recoil = 2; G.kick = 1.2;
  Sound.sfx.shoot();
}

function activateOverdrive() {
  if (G.energy < 100 || G.od > 0 || G.dying) return;
  const p = G.player, S = G.S;
  G.energy = 0; G.od = S.odDur; G.energyReady = false;
  G.hitstop = 0.12; G.flash = 0.35; G.flashColor = '#ffffff'; addShake(9);
  ring(p.x, p.y, 220, '#ffcd75', 0.6, 3); ring(p.x, p.y, 150, '#ff5577', 0.45, 2);
  for (const b of G.ebullets) burst(b.x, b.y, 1, ['#ffcd75', '#f4f4f4'], 40, 0.4, 1);
  G.ebullets.length = 0;
  buildGrid();
  forNear(p.x, p.y, 200, e => {
    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
    if (d < 200) damageEnemy(e, 60 + S.dmg * 5, dx / d, dy / d, true, 6);
  });
  for (const k of G.pickups) k.attract = true;
  burst(p.x, p.y, 60, ['#ffcd75', '#ff5577', '#f4f4f4', '#73eff7'], 220, 0.8, 2, true);
  banner('燃魂超载!!', 'OVERDRIVE · 火力全开', '#ff5577', 1.8);
  Sound.sfx.overdrive();
}

function tryDash() {
  const p = G.player;
  if (p.dashCd > 0 || p.dashT > 0 || G.dying) return;
  let dx = p.vx, dy = p.vy, l = Math.hypot(dx, dy);
  if (!touchMode && mouse.inside && Math.hypot(mouse.x - W / 2, mouse.y - H / 2) > 4) { dx = mouse.x - W / 2; dy = mouse.y - H / 2; l = Math.hypot(dx, dy); }
  if (l < 5) { dx = Math.cos(p.aim); dy = Math.sin(p.aim); l = 1; }
  p.dx = dx / l; p.dy = dy / l; p.dashT = 0.2; p.dashCd = G.S.dashCd;
  burst(p.x, p.y + 4, 8, ['#73eff7', '#f4f4f4'], 60, 0.35, 1);
  Sound.sfx.dash();
}

// ============ damage & kills ============
function damageEnemy(e, dmg, dx, dy, crit, kb = 1) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.05;
  const k = 70 * kb / e.mass; e.kx += dx * k; e.ky += dy * k;
  addNum(e.x + rand(-3, 3), e.y - e.r - 3, dmg, crit);
  if (G.parts.length < 2000) for (let i = 0; i < 2; i++) {
    const a = Math.atan2(dy, dx) + rand(-0.8, 0.8), s = rand(60, 140);
    part({ x: e.x - dx * e.r, y: e.y - dy * e.r, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.18, max: 0.18, color: crit ? '#ffcd75' : '#f4f4f4', size: 1, drag: 6, spark: true });
  }
  Sound.sfx.hit();
  if (e.hp <= 0) killEnemy(e);
}

function dropPickup(type, x, y, v = 1, big = false) {
  if (G.pickups.length > 450) { const i = G.pickups.findIndex(k => !k.attract); if (i >= 0) G.pickups.splice(i, 1); }
  const a = rand(TAU), s = rand(20, 70);
  G.pickups.push({ type, x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, v, big, t: rand(1), attract: false });
}

function killEnemy(e) {
  e.dead = true;
  const d = ETYPES[e.type], S = G.S;
  if (e.type === 'boss') return bossDeath(e);
  G.kills++; G.combo++; G.comboT = 2.4; G.comboPop = 1; G.maxCombo = Math.max(G.maxCombo, G.combo);
  if (G.combo % 50 === 0) {
    banner(`${G.combo} COMBO!`, G.combo >= 200 ? '杀意沸腾 · 无人可挡' : G.combo >= 100 ? '热血燃烧中！' : '连斩不断！', '#ff5577', 1.4);
    G.energy = Math.min(100, G.energy + 10 * S.energyMul); Sound.sfx.combo();
  }
  const mult = 1 + Math.min(G.combo, 300) / 300;
  let value = d.coin * (e.elite ? 6 : 1) * mult + G.coinFrac;
  let v = Math.floor(value); G.coinFrac = value - v;
  while (v >= 5) { dropPickup('coin', e.x, e.y, 5, true); v -= 5; }
  while (v-- > 0) dropPickup('coin', e.x, e.y, 1);
  if (Math.random() < 0.5 || e.elite) for (let i = 0; i < (e.elite ? 6 : 1); i++) dropPickup('energy', e.x, e.y, e.type === 'mini' ? 1 : 2);
  if ((e.elite && Math.random() < 0.3) || Math.random() < 0.005) dropPickup('heart', e.x, e.y, 20);
  const big = e.elite || e.type === 'brute';
  burst(e.x, e.y, big ? 26 : 12, d.cols.concat(['#f4f4f4']), big ? 130 : 90, big ? 0.7 : 0.5, big ? 2 : 2);
  burst(e.x, e.y, big ? 10 : 4, ['#ffffff', '#ffcd75'], 160, 0.25, 1, true);
  G.fx.push({ type: 'pop', x: e.x, y: e.y, r: e.r + 4, t: 0, life: 0.12 });
  G.decals.push({ x: e.x, y: e.y, r: big ? 9 : 5, t: 0, color: d.cols[0] });
  if (G.decals.length > 120) G.decals.shift();
  addShake(big ? 3 : 0.8);
  if (big) { Sound.sfx.bigKill(); if (e.elite) G.hitstop = Math.max(G.hitstop, 0.05); } else Sound.sfx.kill();
  if (e.type === 'splitter') for (let i = 0; i < 3; i++) spawnEnemy('mini', e.x + rand(-6, 6), e.y + rand(-6, 6), false);
  if (e.elite || (e.type === 'brute' && G.t > 200)) {
    const n = e.elite ? 16 : 8, o = rand(TAU);
    for (let i = 0; i < n; i++) eShot(e.x, e.y, o + i / n * TAU, 50, 3, HOSTILE.purple);
  }
}

function hurtPlayer(dmg) {
  const p = G.player;
  if (p.inv > 0 || p.dashT > 0 || G.dying || BOT && QS.has('god')) return;
  if (G.od > 0) dmg *= 0.5;
  p.hp -= dmg; p.inv = 0.8;
  addShake(6); G.hitstop = Math.max(G.hitstop, 0.07); G.flash = 0.3; G.flashColor = '#e04060';
  part({ x: p.x, y: p.y - 10, vx: 0, vy: -40, life: 0.6, max: 0.6, num: '-' + Math.round(dmg), color: '#e04060', drag: 3, size: 1 });
  burst(p.x, p.y, 14, ['#e04060', '#b13e53', '#f4f4f4'], 110, 0.5, 2);
  if (G.combo >= 10) floatText(p.x, p.y - 22, 'COMBO BREAK', '#566c86', 0.9);
  G.combo = 0;
  Sound.sfx.hurt();
  if (p.hp <= 0) { p.hp = 0; die(); }
}

function die() {
  const p = G.player;
  G.dying = 2.4; G.slowT = 1.8; G.flash = 0.6; G.flashColor = '#ffffff'; addShake(10);
  burst(p.x, p.y, 80, ['#41a6f6', '#73eff7', '#f4f4f4', '#ef7d57', '#3b5dc9'], 200, 1.4, 2);
  ring(p.x, p.y, 160, '#73eff7', 0.8, 3);
  Sound.sfx.bigKill(); Sound.sfx.laser();
}

function explode(x, y, R, dmg, small) {
  forNear(x, y, R + 20, e => {
    const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
    if (d < R + e.r) damageEnemy(e, dmg, dx / d, dy / d, false, small ? 0.6 : 2);
  });
  G.fx.push({ type: 'boom', x, y, R, t: 0, life: small ? 0.18 : 0.3 });
  if (G.parts.length < 2000) burst(x, y, small ? 4 : 12, ['#ffcd75', '#ef7d57', '#f4f4f4', '#b13e53'], R * 4, small ? 0.3 : 0.5, small ? 1 : 2);
  if (!small) { addShake(2); G.decals.push({ x, y, r: R * 0.6, t: 0, color: '#1a1c2c' }); }
  Sound.sfx.boom();
}

// ============ enemies ============
function spawnPos() {
  const p = G.player, m = 18;
  const hw = W / 2 + m, hh = H / 2 + m, per = rand(2 * (hw + hh) * 2);
  let x, y, q = per;
  if (q < 2 * hw) { x = -hw + q; y = -hh; } else if ((q -= 2 * hw) < 2 * hh) { x = hw; y = -hh + q; }
  else if ((q -= 2 * hh) < 2 * hw) { x = hw - q; y = hh; } else { q -= 2 * hw; x = -hw; y = hh - q; }
  return [p.x + x, p.y + y];
}
function spawnEnemy(type, x, y, elite) {
  const T = G.t;
  if (x === undefined) [x, y] = spawnPos();
  if (elite === undefined) elite = T > 60 && type !== 'mini' && Math.random() < 0.012 + T / 9000;
  const d = ETYPES[type];
  const late = T > 420 ? Math.pow(1.004, T - 420) : 1;
  const hs = (1 + T / 80 + Math.pow(T / 180, 2)) * late * (elite ? 5 : 1);
  const hp = d.hp * hs;
  const e = {
    id: ++G.eid, type, x, y, vx: 0, vy: 0, kx: 0, ky: 0, hp, maxHp: hp, r: d.r * (elite ? 1.7 : 1),
    spd: d.spd * (1 + Math.min(T / 700, 0.45) + (T > 420 ? Math.min(0.4, (T - 420) / 800) : 0)) * (elite ? 0.9 : 1), dmg: d.dmg * (1 + T / 400) * Math.sqrt(late), mass: d.mass * (elite ? 3 : 1),
    flash: 0, slow: 0, t: rand(10), cd: rand(1, 3), dir: Math.random() < 0.5 ? -1 : 1, st: 0, stT: 0, elite, face: 1, dead: false, bcd: 0,
  };
  G.enemies.push(e); return e;
}
function pickType(T) {
  const w = [['crawler', 10], ['brute', T > 40 ? 1.5 + T / 110 : 0], ['spitter', T > 70 ? 1.5 + T / 130 : 0], ['charger', T > 100 ? 1.5 + T / 130 : 0], ['splitter', T > 130 ? 1.5 + T / 150 : 0]];
  let s = 0; for (const [, v] of w) s += v;
  let r = rand(s); for (const [k, v] of w) { if ((r -= v) < 0) return k; }
  return 'crawler';
}
const EVENTS = [
  () => { banner('包围网', '它们从四面八方合拢了!', '#e04060'); const p = G.player, n = 26 + G.wave * 2; for (let i = 0; i < n; i++) { const a = i / n * TAU; spawnEnemy('crawler', p.x + Math.cos(a) * 250, p.y + Math.sin(a) * 160, false); } },
  () => { banner('虫潮来袭', '一整片数据蠕虫正在涌来', '#a7f070'); const p = G.player, a = rand(TAU); for (let i = 0; i < 34 + G.wave * 2; i++) spawnEnemy('mini', p.x + Math.cos(a) * 290 + rand(-50, 50), p.y + Math.sin(a) * 290 + rand(-50, 50), false); },
  () => { banner('狙击阵列', '远程单位集结 · 注意弹幕', '#a7f070'); const p = G.player; for (let i = 0; i < 6 + G.wave; i++) { const a = i / (6 + G.wave) * TAU; spawnEnemy('spitter', p.x + Math.cos(a) * 260, p.y + Math.sin(a) * 170); } },
  () => { banner('精英降临', '强大的变异体出现了', '#ffcd75'); for (let i = 0; i < 2 + Math.floor(G.t / 150); i++) spawnEnemy(['brute', 'charger', 'spitter', 'splitter'][i % 4], undefined, undefined, true); },
];

function director(dt) {
  const T = G.t, p = G.player;
  const w = 1 + Math.floor(T / 30);
  if (w !== G.wave) { G.wave = w; banner(`WAVE ${w}`, WAVE_SUB[w % WAVE_SUB.length], '#73eff7', 2); }
  if (!G.boss && !G.bossWarned && T >= G.nextBoss - 3.5) { G.bossWarned = true; G.fx.push({ type: 'warn', t: 0, life: 3.5 }); Sound.sfx.warn(); }
  if (!G.boss && T >= G.nextBoss) { spawnBoss(); G.bossWarned = false; G.nextBoss += 180; }
  if (T >= 420 && !G.lateWarned) { G.lateWarned = true; banner('终焉时刻', '警告：病毒开始指数级进化!', '#ff5577', 3); Sound.sfx.warn(); }
  if (T >= G.nextEvent) { G.nextEvent += 50; if (!G.boss) EVENTS[G.eventIdx++ % EVENTS.length](); }
  let rate = 1.5 + T * 0.025 + Math.max(0, T - 240) * 0.03;
  if (G.boss) rate *= 0.35;
  if (G.enemies.length < Math.min(320, 50 + T * 0.6)) {
    G.spawnAcc += rate * dt;
    while (G.spawnAcc >= 1) { G.spawnAcc--; spawnEnemy(pickType(T)); }
  }
  // keep enemies around the player
  for (const e of G.enemies) {
    if (e.type === 'boss') continue;
    if (Math.abs(e.x - p.x) > 420 || Math.abs(e.y - p.y) > 320) { const [x, y] = spawnPos(); e.x = x; e.y = y; }
  }
}

function spitterFire(e, ux, uy) {
  const n = G.t > 240 ? 5 : 3, a = Math.atan2(uy, ux);
  for (let i = 0; i < n; i++) eShot(e.x, e.y, a + (i - (n - 1) / 2) * 0.22, 78, 3, HOSTILE.pink, { dmg: 9 });
  if (e.elite) for (let i = 0; i < 12; i++) eShot(e.x, e.y, i / 12 * TAU, 55, 3, HOSTILE.purple, { dmg: 9 });
  Sound.sfx.eshot();
}

function updateEnemies(dt) {
  const p = G.player;
  G.enemies = G.enemies.filter(e => !e.dead);
  for (const e of G.enemies) {
    e.t += dt; if (e.flash > 0) e.flash -= dt; if (e.slow > 0) e.slow -= dt;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    if (e.type === 'boss') { updateBoss(e, dt, dx, dy, d); continue; }
    const sm = e.slow > 0 ? 0.4 : 1;
    let mx = ux, my = uy, spd = e.spd * sm;
    if (G.dying) { mx = -ux * 0.3; my = -uy * 0.3; }
    else if (e.type === 'spitter') {
      if (d < 140) { const back = d < 95 ? -0.7 : 0; mx = -uy * e.dir * 0.8 + ux * back; my = ux * e.dir * 0.8 + uy * back; }
      e.cd -= dt; if (e.cd <= 0 && d < 230) { e.cd = 2.3 + rand(0.8); spitterFire(e, ux, uy); }
    } else if (e.type === 'charger') {
      if (e.st === 0) { e.cd -= dt; if (d < 130 && e.cd <= 0) { e.st = 1; e.stT = 0.55; e.dx = ux; e.dy = uy; } }
      else if (e.st === 1) { spd = 0; e.stT -= dt; e.dx = ux; e.dy = uy; if (e.stT <= 0) { e.st = 2; e.stT = 0.5; } }
      else { mx = e.dx; my = e.dy; spd = 250 * sm; e.stT -= dt; if (Math.random() < 0.5) part({ x: e.x, y: e.y, vx: 0, vy: 0, life: 0.25, max: 0.25, color: '#ef7d57', size: 2, drag: 1 }); if (e.stT <= 0) { e.st = 0; e.cd = 2.2 + rand(1); } }
    }
    e.vx = mx * spd; e.vy = my * spd;
    const kd = Math.exp(-dt * 10); e.kx *= kd; e.ky *= kd;
    e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
    let c = 0;
    forNear(e.x, e.y, e.r + 8, o => {
      if (o === e || o.type === 'boss') return;
      const sx = e.x - o.x, sy = e.y - o.y, rr = e.r + o.r, dd = sx * sx + sy * sy;
      if (dd < rr * rr && dd > 0.01) { const dl = Math.sqrt(dd), push = (rr - dl) * 0.35; e.x += sx / dl * push; e.y += sy / dl * push; }
      if (++c > 6) return true;
    });
    e.face = dx >= 0 ? 1 : -1;
    if (d < e.r + p.r + 1) { hurtPlayer(e.dmg); e.kx -= ux * 90; e.ky -= uy * 90; }
  }
}

// ============ boss ============
function spawnBoss() {
  const i = G.bossCount, B = BOSSES[i % BOSSES.length], p = G.player;
  const hp = ETYPES.boss.hp * (1 + i * 1.4) * (1 + G.t / 400);
  const e = spawnEnemy('boss', p.x, p.y - 220, false);
  Object.assign(e, { hp, maxHp: hp, r: 18, mass: 40, spd: 40, dmg: 25, pat: 'rest', patT: 1.5, spin: 0, acc: 0, orbit: -Math.PI / 2, phase: 1, bi: i, B, dashT: 0, eyeX: 0, eyeY: 0 });
  G.boss = e;
  banner(B.name, `${B.en} · 已入侵`, B.c3, 3);
  Sound.setBoss(true); addShake(6);
}
function bossFire(e, dx, dy) {
  const ph = e.phase, rm = 1 + (ph - 1) * 0.25 + e.bi * 0.12, B = e.B;
  const aim = Math.atan2(dy, dx);
  const every = (iv, fn) => { while (e.acc >= iv / rm) { e.acc -= iv / rm; fn(); } };
  switch (e.pat) {
    case 'spiral': every(0.075, () => { const n = 3 + ph; for (let k = 0; k < n; k++) eShot(e.x, e.y, e.spin + k * TAU / n, 72, 3, B.b1, { dmg: 12 }); e.spin += 0.2; Sound.sfx.eshot(); }); break;
    case 'fan': every(0.5, () => { const n = 7 + ph * 2; for (let k = 0; k < n; k++) eShot(e.x, e.y, aim + (k - (n - 1) / 2) * 0.12, 112, 3, B.b2, { dmg: 12 }); Sound.sfx.eshot(); }); break;
    case 'ring': every(0.8, () => { const n = 22 + ph * 4; e.spin += TAU / n / 2; for (let k = 0; k < n; k++) { eShot(e.x, e.y, e.spin + k * TAU / n, 62, 4, B.b1, { dmg: 14 }); if (ph > 1) eShot(e.x, e.y, e.spin + (k + 0.5) * TAU / n, 40, 2, B.b3, { dmg: 10 }); } Sound.sfx.eshot(); }); break;
    case 'flower': every(0.1, () => { for (let k = 0; k < 5; k++) { eShot(e.x, e.y, e.spin + k * TAU / 5, 58, 3, B.b3, { av: 0.55, dmg: 12 }); eShot(e.x, e.y, -e.spin + k * TAU / 5, 76, 3, B.b1, { av: -0.55, dmg: 12 }); } e.spin += 0.17; Sound.sfx.eshot(); }); break;
    case 'summon':
      if (!e.summoned) { e.summoned = true; for (let k = 0; k < 5 + ph; k++) { const a = k / (5 + ph) * TAU; spawnEnemy(ph >= 3 ? 'charger' : 'crawler', e.x + Math.cos(a) * 30, e.y + Math.sin(a) * 30, ph >= 3); } ring(e.x, e.y, 40, B.c3, 0.4); }
      every(0.9, () => { for (let k = 0; k < 14; k++) eShot(e.x, e.y, e.spin + k * TAU / 14, 36, 5, HOSTILE.purple, { dmg: 15, acc: 30 }); e.spin += 0.3; });
      break;
    case 'dash':
      if (e.dashT > 0) every(0.04, () => { const a = Math.atan2(e.vy, e.vx); eShot(e.x, e.y, a + Math.PI / 2, 30, 3, B.b2, { dmg: 10 }); eShot(e.x, e.y, a - Math.PI / 2, 30, 3, B.b2, { dmg: 10 }); });
      break;
  }
}
function updateBoss(e, dt, dx, dy, d) {
  const hpF = e.hp / e.maxHp, ph = hpF < 0.33 ? 3 : hpF < 0.66 ? 2 : 1;
  if (ph > e.phase) {
    e.phase = ph; e.pat = 'rest'; e.patT = 1.2; G.hitstop = 0.15; addShake(8); G.flash = 0.25; G.flashColor = e.B.c3;
    ring(e.x, e.y, 120, e.B.c3, 0.5, 3); burst(e.x, e.y, 40, [e.B.c1, e.B.c2, e.B.c3], 180, 0.8, 2);
    banner(ph === 2 ? '形态 II · 狂暴化' : '形态 III · 最终协议', e.B.name + ' 正在变异', '#ff5577', 1.8);
    Sound.sfx.bigKill();
    for (let k = 0; k < 36; k++) eShot(e.x, e.y, k / 36 * TAU, 90, 3, e.B.b3, { dmg: 12 });
  }
  const kd = Math.exp(-dt * 6); e.kx *= kd; e.ky *= kd;
  e.orbit += dt * 0.35;
  if (e.pat === 'dash') {
    if (e.st === 0) { e.st = 1; e.stT = 0.7; e.vx = 0; e.vy = 0; }
    if (e.st === 1) { e.stT -= dt; e.ddx = dx / d; e.ddy = dy / d; if (e.stT <= 0) { e.st = 2; e.dashT = 0.65; Sound.sfx.dash(); addShake(3); } }
    else if (e.st === 2) { e.vx = e.ddx * 270; e.vy = e.ddy * 270; e.dashT -= dt; if (e.dashT <= 0) { e.st = 3; } }
    else { e.vx *= 0.9; e.vy *= 0.9; }
  } else {
    const tx = G.player.x + Math.cos(e.orbit) * 115, ty = G.player.y + Math.sin(e.orbit) * 75;
    const mx = tx - e.x, my = ty - e.y, ml = Math.hypot(mx, my) || 1, sp = Math.min(ml * 2, 55 + ph * 15);
    e.vx = mx / ml * sp; e.vy = my / ml * sp;
  }
  e.x += (e.vx + e.kx) * dt; e.y += (e.vy + e.ky) * dt;
  e.eyeX = dx / d * 3; e.eyeY = dy / d * 3;
  if (G.dying) return;
  if (d < e.r + G.player.r) hurtPlayer(e.dmg);
  e.patT -= dt; e.acc += dt;
  if (e.patT <= 0) {
    if (e.pat !== 'rest') { e.pat = 'rest'; e.patT = 0.8 - ph * 0.15; }
    else {
      const list = ph === 1 ? ['spiral', 'fan', 'ring', 'summon'] : ph === 2 ? ['spiral', 'fan', 'ring', 'flower', 'dash', 'summon'] : ['flower', 'spiral', 'dash', 'ring', 'fan', 'flower'];
      let np; do np = list[(Math.random() * list.length) | 0]; while (np === e.last && list.length > 1);
      e.pat = e.last = np; e.patT = np === 'dash' ? 1.6 : 3.6; e.acc = 0; e.st = 0; e.summoned = false;
    }
  }
  bossFire(e, dx, dy);
}
function bossDeath(e) {
  const p = G.player;
  G.boss = null; G.bossKills++; G.bossCount++; G.kills++;
  G.slowT = 1.3; G.hitstop = 0.2; G.flash = 0.6; G.flashColor = '#ffffff'; addShake(10);
  for (let i = 0; i < 14; i++) G.fx.push({ type: 'delayBoom', x: e.x + rand(-24, 24), y: e.y + rand(-24, 24), t: -i * 0.08, life: 0.01 });
  ring(e.x, e.y, 260, e.B.c3, 0.9, 3); ring(e.x, e.y, 180, '#f4f4f4', 0.6, 2);
  burst(e.x, e.y, 120, [e.B.c1, e.B.c2, e.B.c3, '#f4f4f4'], 260, 1.4, 2);
  for (const b of G.ebullets) burst(b.x, b.y, 1, ['#ffcd75'], 30, 0.4, 1);
  G.ebullets.length = 0;
  for (let i = 0; i < 40 + e.bi * 20; i++) dropPickup('coin', e.x + rand(-10, 10), e.y + rand(-10, 10), 5, true);
  for (let i = 0; i < 12; i++) dropPickup('energy', e.x, e.y, 4);
  for (let i = 0; i < 2; i++) dropPickup('heart', e.x, e.y, 25);
  G.energy = 100; p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.3);
  G.decals.push({ x: e.x, y: e.y, r: 26, t: 0, color: '#1a1c2c' });
  banner('BOSS 击破!!', `${e.B.name} 已被格式化`, '#ffcd75', 3);
  Sound.setBoss(false); Sound.sfx.bigKill(); Sound.sfx.laser(); setTimeout(() => Sound.sfx.levelup(), 400);
  setTimeout(() => { if (G) for (const k of G.pickups) k.attract = true; }, 1200);
}

// ============ player ============
function updatePlayer(dt) {
  const p = G.player, S = G.S;
  if (G.dying) return;
  let ix = 0, iy = 0;
  // mouse steering: the hero runs toward the cursor; farther from center = faster, small dead zone = stop
  if (!touchMode && mouse.inside) {
    const dx = mouse.x - W / 2, dy = mouse.y - H / 2, d = Math.hypot(dx, dy);
    if (d > MOVE_DEAD) { const m = Math.min(1, (d - MOVE_DEAD) / MOVE_RAMP); ix = dx / d * m; iy = dy / d * m; }
  }
  if (joy.active) { ix = joy.x; iy = joy.y; }
  if (BOT) [ix, iy] = botMove();
  const l = Math.hypot(ix, iy); if (l > 1) { ix /= l; iy /= l; }
  if (p.dashT > 0) {
    p.dashT -= dt; p.vx = p.dx * 340; p.vy = p.dy * 340;
    G.fx.push({ type: 'ghost', x: p.x, y: p.y, face: p.face, t: 0, life: 0.22 });
  } else {
    const k = Math.min(1, dt * 14); p.vx += (ix * S.speed - p.vx) * k; p.vy += (iy * S.speed - p.vy) * k;
  }
  p.x += p.vx * dt; p.y += p.vy * dt;
  p.moving = l > 0.1; if (p.moving) p.walk += dt * 9;
  p.inv -= dt; p.dashCd -= dt; p.recoil = Math.max(0, p.recoil - dt * 25);
  if (S.regen) p.hp = Math.min(p.maxHp, p.hp + S.regen * dt);
  p.hpShown += (p.hp - p.hpShown) * Math.min(1, dt * 4);
  // aim
  const target = nearest(p.x, p.y, 250);
  G.target = target;
  if (target) p.aim = Math.atan2(target.y - p.y, target.x - p.x);
  else if (l > 0.2) p.aim = Math.atan2(iy, ix);
  p.face = Math.cos(p.aim) >= 0 ? 1 : -1;
  // fire (always auto-locks the nearest enemy)
  const rate = S.rate * (G.od > 0 ? 2 : 1);
  p.fireT -= dt;
  if (target) { while (p.fireT <= 0) { fireMain(); p.fireT += 1 / rate; } } else p.fireT = Math.max(p.fireT, 0);
  // overdrive barrage
  if (G.od > 0) {
    G.od -= dt; G.odSpin += dt * 5.5; G.odAcc += dt;
    while (G.odAcc > 0.05) {
      G.odAcc -= 0.05;
      for (let k = 0; k < 4; k++) pBullet(p.x, p.y - 2, G.odSpin + k * TAU / 4, 210, S.dmg * 0.6, { color: odHue(k + ((G.t * 8) | 0)), pierce: 1, life: 1.3 });
    }
    if (Math.random() < 0.6) part({ x: p.x + rand(-6, 6), y: p.y + 5, vx: rand(-10, 10), vy: rand(-60, -30), life: 0.4, max: 0.4, color: pickArr(['#ff5577', '#ffcd75', '#ef7d57']), size: 2, drag: 2 });
    if (G.od <= 0) floatText(p.x, p.y - 20, '超载结束', '#566c86', 0.8);
  }
  if (!G.energyReady && G.energy >= 100) { G.energyReady = true; floatText(p.x, p.y - 22, touchMode ? '超载就绪! 点[燃]' : '超载就绪! [右键]', '#ffcd75', 1.4); Sound.sfx.ready(); }
  if (BOT && G.energy >= 100) activateOverdrive();
  // scarf
  const sc = G.scarf; sc[0].x = p.x - p.face * 3; sc[0].y = p.y - 1;
  for (let i = 1; i < sc.length; i++) {
    const a = sc[i], b = sc[i - 1];
    const tx = b.x - p.face * 2 - p.vx * 0.012, ty = b.y + Math.sin(G.t * 12 + i) * 0.6 - p.vy * 0.012;
    a.x += (tx - a.x) * 0.5; a.y += (ty - a.y) * 0.5;
  }
}
const pickArr = a => a[(Math.random() * a.length) | 0];

function botMove() {
  const p = G.player; let ix = 0, iy = 0;
  for (const e of G.enemies) { const dx = p.x - e.x, dy = p.y - e.y, d2 = dx * dx + dy * dy; if (d2 < 110 * 110) { const w = (e.type === 'boss' ? 3000 : 400) / (d2 + 50); ix += dx * w; iy += dy * w; } }
  for (const b of G.ebullets) { const dx = p.x - b.x, dy = p.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 40 * 40) { const w = 120 / (d2 + 10); ix += dx * w; iy += dy * w; } }
  ix += Math.cos(G.t * 0.3) * 0.3; iy += Math.sin(G.t * 0.3) * 0.3;
  for (const k of G.pickups) { const dx = k.x - p.x, dy = k.y - p.y, d2 = dx * dx + dy * dy; if (d2 < 70 * 70) { ix += dx * 0.004; iy += dy * 0.004; } }
  if (G.player.hp < 40) { const h = G.pickups.find(k => k.type === 'heart'); if (h) { ix += (h.x - p.x) * 0.02; iy += (h.y - p.y) * 0.02; } }
  const l = Math.hypot(ix, iy); if (l > 0.3 && Math.random() < 0.01) tryDash();
  return l > 0 ? [ix / l, iy / l] : [0, 0];
}

// ============ summons ============
function updateSummons(dt) {
  const U = G.up, S = G.S, p = G.player, odm = G.od > 0 ? 1.5 : 1;
  if (G.dying) return;
  const nd = U.drone || 0;
  for (let i = 0; i < nd; i++) {
    const d = G.drones[i] || (G.drones[i] = { x: p.x, y: p.y, cd: rand(0.4), ang: 0 });
    const a = G.t * 1.7 + i * TAU / nd, tx = p.x + Math.cos(a) * 24, ty = p.y + Math.sin(a) * 15 - 8;
    d.x += (tx - d.x) * Math.min(1, dt * 8); d.y += (ty - d.y) * Math.min(1, dt * 8);
    d.cd -= dt;
    if (d.cd <= 0) {
      const e = nearest(d.x, d.y, 200);
      if (e) { d.cd = 0.42 / (G.od > 0 ? 2 : 1); d.ang = Math.atan2(e.y - d.y, e.x - d.x); pBullet(d.x, d.y, d.ang, 320, S.dmg * 0.6 * odm, { color: '#73eff7', kind: 'drone', pierce: 0, bounce: 0 }); Sound.sfx.drone(); }
      else d.cd = 0.1;
    }
  }
  const nb = U.blade ? U.blade + 1 : 0; G.bladePos.length = 0;
  if (nb) {
    G.bladeA += dt * (3.2 + U.blade * 0.35);
    for (let i = 0; i < nb; i++) {
      const a = G.bladeA + i * TAU / nb, bx = p.x + Math.cos(a) * 36, by = p.y + Math.sin(a) * 36;
      G.bladePos.push([bx, by, a]);
      forNear(bx, by, 26, e => {
        const dx = e.x - bx, dy = e.y - by;
        if (dx * dx + dy * dy < (e.r + 6) ** 2 && e.bcd < G.t) { e.bcd = G.t + 0.3; damageEnemy(e, (8 + S.dmg * 0.9) * odm, Math.cos(a), Math.sin(a), false, 2.5); }
      });
    }
  }
  if (U.thunder) { G.thT -= dt; if (G.thT <= 0) { G.thT = Math.max(0.8, 2.6 - 0.35 * U.thunder); lightning(); } }
  if (U.turret) {
    G.tuT -= dt;
    if (G.tuT <= 0) { G.tuT = Math.max(4, 10 - U.turret * 1.2); G.turrets.push({ x: p.x + rand(-10, 10), y: p.y + rand(-10, 10), life: 8 + U.turret * 1.5, cd: 0.5, drop: 0.35, ang: 0 }); if (G.turrets.length > U.turret) G.turrets.shift(); Sound.sfx.deploy(); }
  }
  for (let i = G.turrets.length - 1; i >= 0; i--) {
    const t = G.turrets[i]; t.life -= dt;
    if (t.drop > 0) { t.drop -= dt; if (t.drop <= 0) { addShake(2); burst(t.x, t.y, 12, ['#566c86', '#c0cbdc', '#ef7d57'], 80, 0.4); ring(t.x, t.y, 20, '#ef7d57', 0.25); } continue; }
    if (t.life <= 0) { burst(t.x, t.y, 10, ['#566c86', '#c0cbdc'], 60, 0.4); G.turrets.splice(i, 1); continue; }
    t.cd -= dt;
    if (t.cd <= 0) {
      const e = nearest(t.x, t.y, 210);
      if (e) { t.cd = 0.2; t.ang = Math.atan2(e.y - t.y, e.x - t.x); for (let k = -1; k <= 1; k++) pBullet(t.x + Math.cos(t.ang) * 6, t.y - 3 + Math.sin(t.ang) * 6, t.ang + k * 0.14, 300, S.dmg * 0.55 * odm, { color: '#41a6f6', kind: 'turret', pierce: 0, bounce: 0 }); Sound.sfx.drone(); }
      else t.cd = 0.15;
    }
  }
  if (U.missile) {
    G.miT -= dt;
    if (G.miT <= 0) {
      G.miT = 2.6 - 0.22 * U.missile; Sound.sfx.missile();
      for (let k = 0; k < 1 + U.missile; k++) { const a = p.aim + Math.PI + rand(-1.4, 1.4); pBullet(p.x, p.y - 4, a, 90, (18 + S.dmg * 1.3) * odm, { kind: 'missile', color: '#ffcd75', life: 3, r: 3, pierce: 0, bounce: 0, boomR: 20 + U.missile * 3 }); }
    }
  }
  if (U.nova) {
    G.noT -= dt;
    if (G.noT <= 0) {
      G.noT = Math.max(2.5, 5.5 - 0.6 * U.nova); const R = 55 + U.nova * 12;
      ring(p.x, p.y, R, '#73eff7', 0.35, 2); ring(p.x, p.y, R * 0.7, '#f4f4f4', 0.25, 1);
      forNear(p.x, p.y, R + 20, e => { const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1; if (d < R + e.r) { e.slow = 2; damageEnemy(e, (10 + S.dmg * 0.8) * odm, dx / d, dy / d, false, 3); burst(e.x, e.y, 2, ['#73eff7', '#f4f4f4'], 40, 0.4, 1); } });
      Sound.sfx.nova();
    }
  }
  if (U.orbital) {
    G.orT -= dt;
    if (G.orT <= 0) {
      let best = null, bc = -1;
      for (let i = 0; i < 24 && G.enemies.length; i++) {
        const e = G.enemies[(Math.random() * G.enemies.length) | 0];
        if (e.dead || Math.abs(e.x - p.x) > W / 2 || Math.abs(e.y - p.y) > H / 2) continue;
        let c = 0; forNear(e.x, e.y, 40, () => { c++; }); if (e.type === 'boss') c += 20;
        if (c > bc) { bc = c; best = e; }
      }
      if (best) { G.orT = Math.max(6, 15 - 2.5 * U.orbital); G.fx.push({ type: 'mark', x: best.x, y: best.y, tgt: best, t: 0, life: 0.8, R: 26 + 6 * U.orbital, dmg: (120 + S.dmg * 6) * U.orbital * odm }); Sound.sfx.lock(); }
      else G.orT = 1;
    }
  }
}
function lightning() {
  const U = G.up, S = G.S, p = G.player;
  let e = nearest(p.x, p.y, 220); if (!e) { G.thT = 0.3; return; }
  const hit = [], pts = [[p.x, p.y - 6]];
  for (let k = 0; k < 2 + U.thunder && e; k++) {
    hit.push(e.id); pts.push([e.x, e.y]);
    damageEnemy(e, (18 + S.dmg * 1.4) * (G.od > 0 ? 1.5 : 1), 0, 0, false, 0); e.slow = Math.max(e.slow, 0.3);
    burst(e.x, e.y, 5, ['#73eff7', '#f4f4f4', '#41a6f6'], 90, 0.3, 1, true);
    e = nearest(e.x, e.y, 90, hit);
  }
  G.fx.push({ type: 'bolt', pts, t: 0, life: 0.2 });
  Sound.sfx.zap();
}

// ============ bullets ============
function updateBullets(dt) {
  const bs = G.bullets;
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i]; b.px = b.x; b.py = b.y;
    if (b.kind === 'missile') {
      if (!b.target || b.target.dead) b.target = nearest(b.x, b.y, 320);
      let a = Math.atan2(b.vy, b.vx), sp = Math.min(280, Math.hypot(b.vx, b.vy) + 420 * dt);
      if (b.target) { let da = Math.atan2(b.target.y - b.y, b.target.x - b.x) - a; da = Math.atan2(Math.sin(da), Math.cos(da)); a += clamp(da, -7 * dt, 7 * dt); }
      b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
      if (Math.random() < 0.7) part({ x: b.x, y: b.y, vx: rand(-8, 8), vy: rand(-8, 8), life: 0.35, max: 0.35, color: pickArr(['#566c86', '#333c57', '#ef7d57']), size: 2, drag: 3 });
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    if (b.life <= 0) { if (b.kind === 'missile') explode(b.x, b.y, b.boomR, b.dmg); bs[i] = bs[bs.length - 1]; bs.pop(); continue; }
    forNear(b.x, b.y, b.r + 20, e => {
      if (b.hits.includes(e.id)) return;
      const rr = e.r + b.r, dx = e.x - b.x, dy = e.y - b.y;
      if (dx * dx + dy * dy < rr * rr) { bulletHit(b, e); if (b.dead) return true; }
    });
    if (b.dead) { bs[i] = bs[bs.length - 1]; bs.pop(); }
  }
}
function bulletHit(b, e) {
  const S = G.S, crit = Math.random() < S.crit, dmg = b.dmg * (crit ? S.critMul : 1);
  const sp = Math.hypot(b.vx, b.vy) || 1;
  b.hits.push(e.id);
  if (b.kind === 'missile') { b.dead = true; explode(b.x, b.y, b.boomR, dmg); return; }
  damageEnemy(e, dmg, b.vx / sp, b.vy / sp, crit, b.kb);
  if (S.boom > 0 && b.kind === 'main') explode(b.x, b.y, 10 + S.boom * 4, dmg * (0.2 + 0.1 * S.boom), true);
  if (b.bounce > 0) {
    b.bounce--; const t = nearest(b.x, b.y, 130, b.hits);
    if (t) { const a = Math.atan2(t.y - b.y, t.x - b.x); b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.life = Math.max(b.life, 0.6); return; }
  }
  if (b.pierce > 0) { b.pierce--; return; }
  b.dead = true;
}
function updateEBullets(dt) {
  const p = G.player, bs = G.ebullets, S = G.S;
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i]; b.t += dt;
    if (b.av) { const c = Math.cos(b.av * dt), s = Math.sin(b.av * dt), vx = b.vx * c - b.vy * s; b.vy = b.vx * s + b.vy * c; b.vx = vx; }
    if (b.acc) { const sp = Math.hypot(b.vx, b.vy), ns = Math.min(140, sp + b.acc * dt); b.vx *= ns / sp; b.vy *= ns / sp; }
    b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
    const dx = b.x - p.x, dy = b.y - p.y;
    if (b.life <= 0 || Math.abs(dx) > W * 0.85 || Math.abs(dy) > H * 0.85) { bs[i] = bs[bs.length - 1]; bs.pop(); continue; }
    if (G.dying) continue;
    const dd = dx * dx + dy * dy, hr = b.r + 1.5;
    if (dd < hr * hr) {
      if (p.inv <= 0 && p.dashT <= 0) { hurtPlayer(b.dmg); burst(b.x, b.y, 6, [b.color, '#f4f4f4'], 60, 0.3, 1); bs[i] = bs[bs.length - 1]; bs.pop(); }
    } else if (!b.grazed && dd < (b.r + 9) ** 2) {
      b.grazed = true; G.grazes++; G.energy = Math.min(100, G.energy + 0.8 * S.energyMul);
      part({ x: b.x, y: b.y, vx: -dx * 3, vy: -dy * 3, life: 0.2, max: 0.2, color: '#f4f4f4', size: 1, drag: 4, spark: true });
      Sound.sfx.graze();
    }
  }
}

// ============ pickups / particles / fx ============
function onMilestone() {
  while (G.coins >= G.nextAt) { G.pending++; G.milestone++; G.prevAt = G.nextAt; const n = G.milestone; G.nextAt += Math.round(10 + 6 * n + n * n); }
}
function updatePickups(dt) {
  const p = G.player, S = G.S, mag = S.magnet * (G.od > 0 ? 2 : 1);
  const ks = G.pickups;
  for (let i = ks.length - 1; i >= 0; i--) {
    const k = ks[i]; k.t += dt;
    const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
    if (!k.attract && k.type !== 'heart' && k.t > 0.9 && d < 260) k.attract = true;
    let got = false;
    if (!G.dying && (k.attract || d < mag)) {
      // direct homing (no orbiting): fly straight at the player, accelerating, and get absorbed on arrival
      if (!k.attract || k.at === undefined) { k.attract = true; k.at = 0; }
      k.at += dt;
      const sp = Math.min(520, 150 + k.at * 900) + Math.hypot(p.vx, p.vy), step = sp * dt;
      if (d <= step + 6) got = true;
      else { k.vx = dx / d * sp; k.vy = dy / d * sp; k.x += k.vx * dt; k.y += k.vy * dt; }
    } else { const dr = Math.exp(-dt * 4); k.vx *= dr; k.vy *= dr; k.x += k.vx * dt; k.y += k.vy * dt; }
    if (got || (!G.dying && d < 8)) {
      if (k.type === 'coin') { G.coins += k.v; onMilestone(); Sound.sfx.coin(); part({ x: k.x, y: k.y, vx: 0, vy: -20, life: 0.2, max: 0.2, color: '#ffcd75', size: 1, drag: 1 }); }
      else if (k.type === 'energy') { G.energy = Math.min(100, G.energy + k.v * 0.9 * S.energyMul); Sound.sfx.energy(); }
      else { p.hp = Math.min(p.maxHp, p.hp + k.v); floatText(p.x, p.y - 14, '+' + k.v, '#a7f070', 0.8); Sound.sfx.heal(); burst(p.x, p.y, 10, ['#a7f070', '#38b764', '#f4f4f4'], 60, 0.5, 1); }
      ks[i] = ks[ks.length - 1]; ks.pop(); continue;
    }
    if (k.t > 30 && !k.attract) { ks[i] = ks[ks.length - 1]; ks.pop(); }
  }
}
function updateParts(dt) {
  const ps = G.parts;
  for (let i = ps.length - 1; i >= 0; i--) {
    const q = ps[i]; q.life -= dt;
    if (q.life <= 0) { if (q.num && !q.keep) G.nums--; ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    const dr = Math.exp(-dt * q.drag); q.vx *= dr; q.vy *= dr; q.x += q.vx * dt; q.y += q.vy * dt;
  }
}
function updateFx(dt) {
  const fs = G.fx;
  for (let i = fs.length - 1; i >= 0; i--) {
    const f = fs[i]; f.t += dt;
    if (f.type === 'mark' && f.tgt && !f.tgt.dead) { f.x += (f.tgt.x - f.x) * Math.min(1, dt * 6); f.y += (f.tgt.y - f.y) * Math.min(1, dt * 6); }
    if (f.t >= f.life) {
      if (f.type === 'mark') {
        explode(f.x, f.y, f.R, f.dmg); G.fx.push({ type: 'beam', x: f.x, y: f.y, R: f.R, t: 0, life: 0.45 });
        G.hitstop = Math.max(G.hitstop, 0.06); G.flash = 0.2; G.flashColor = '#73eff7'; addShake(7); Sound.sfx.laser();
        burst(f.x, f.y, 40, ['#73eff7', '#f4f4f4', '#41a6f6'], 200, 0.7, 2, true);
      } else if (f.type === 'delayBoom') {
        G.fx.push({ type: 'boom', x: f.x, y: f.y, R: 22, t: 0, life: 0.35 }); burst(f.x, f.y, 16, ['#ffcd75', '#ef7d57', '#f4f4f4'], 140, 0.6, 2); addShake(3); Sound.sfx.boom();
      }
      fs[i] = fs[fs.length - 1]; fs.pop();
    }
  }
  for (const d of G.decals) d.t += dt;
  G.decals = G.decals.filter(d => d.t < 8);
  G.banners = G.banners.filter(b => (b.t += dt) < b.life);
  if (G.banners.length > 2) G.banners.splice(0, G.banners.length - 2);
}

// ============ main step ============
function step(dt) {
  const g = G;
  g.shake *= Math.exp(-dt * 9); g.kick *= Math.exp(-dt * 20);
  if (g.flash > 0) g.flash -= dt;
  if (g.hitstop > 0) { g.hitstop -= dt; return; }
  if (g.slowT > 0) g.slowT -= dt;
  g.timeScale = g.slowT > 0 ? 0.3 : 1;
  const d = dt * g.timeScale;
  if (!g.dying) g.t += d;
  if (g.comboT > 0) { g.comboT -= d; if (g.comboT <= 0) g.combo = 0; }
  g.comboPop = Math.max(0, g.comboPop - d * 6);
  updatePlayer(d);
  if (!g.dying) director(d);
  updateEnemies(d);
  buildGrid();
  updateSummons(d);
  updateBullets(d);
  updateEBullets(d);
  updatePickups(d);
  updateParts(d);
  updateFx(d);
  if (g.dying) { g.dying -= dt; if (g.dying <= 0) return gameOver(); }
  if (g.pending > 0 && !g.dying && state === 'play') openUpgrade();
  if (BOT && ((g.t / 30) | 0) !== (((g.t - d) / 30) | 0)) console.log('BOT', JSON.stringify({ t: Math.round(g.t), hp: Math.round(g.player.hp), kills: g.kills, lvl: g.milestone, en: g.enemies.length, eb: g.ebullets.length, pb: g.bullets.length, parts: g.parts.length, boss: !!g.boss, bk: g.bossKills, ms: +(perf.ms / Math.max(1, perf.n)).toFixed(2), maxms: +perf.max.toFixed(1) })), perf.ms = perf.n = perf.max = 0;
}

// ============ rendering ============
let camX = 0, camY = 0;
const sx = x => Math.round(x - camX), sy = y => Math.round(y - camY);
function onScreen(x, y, m = 30) { return x > camX - m && x < camX + W + m && y > camY - m && y < camY + H + m; }

function drawBackground(cx, cy, dark) {
  const t0x = Math.floor(cx / 64), t0y = Math.floor(cy / 64);
  for (let ty = t0y; ty <= t0y + 5; ty++) for (let tx = t0x; tx <= t0x + 8; tx++) {
    const h = ((tx * 73856093) ^ (ty * 19349663)) >>> 0;
    const v = h % 11 < 5 ? 0 : 1 + (h >>> 4) % 5;
    ctx.drawImage(TILES[v], tx * 64 - cx, ty * 64 - cy);
  }
  if (dark) { ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H); }
}

function drawSet(set, f, x, y, face, white, gold) {
  const fr = (set.r.length > 1) ? f % set.r.length : 0;
  const img = white ? (face < 0 ? set.wl : set.wr)[fr] : (face < 0 ? set.l : set.r)[fr];
  const X = Math.round(x - set.w / 2), Y = Math.round(y - set.h / 2);
  if (gold) { const gi = (face < 0 ? set.gl : set.gr)[fr]; ctx.drawImage(gi, X - 1, Y); ctx.drawImage(gi, X + 1, Y); ctx.drawImage(gi, X, Y - 1); ctx.drawImage(gi, X, Y + 1); }
  ctx.drawImage(img, X, Y);
}

function drawBoss(e) {
  const x = sx(e.x), y = sy(e.y), B = e.B, fl = e.flash > 0, t = e.t;
  const pulse = Math.round(Math.sin(t * 6) * 1);
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite(B.c2, 40, 0.35), x - 40, y - 40); ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 16, y + 18, 32, 3);
  const n = 10;
  for (let k = 0; k < n; k++) {
    const a = t * (e.phase === 3 ? 2.2 : 1.2) + k * TAU / n, R = 22 + pulse + (k % 2) * 2;
    const px = x + Math.cos(a) * R, py = y + Math.sin(a) * R;
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 5, 5);
    ctx.fillStyle = fl ? '#fff' : (k % 2 ? B.c3 : B.c2); ctx.fillRect(Math.round(px) - 1, Math.round(py) - 1, 3, 3);
  }
  ctx.fillStyle = '#1a1c2c'; disc(x, y, 19 + pulse);
  ctx.fillStyle = fl ? '#fff' : B.c1; disc(x, y, 18 + pulse);
  ctx.fillStyle = fl ? '#fff' : B.c2; disc(x - 2, y - 3, 13 + pulse);
  if (!fl) {
    ctx.fillStyle = B.c1;
    for (let k = 0; k < 6; k++) { const a = k * TAU / 6 + t * 0.5; ctx.fillRect(Math.round(x + Math.cos(a) * 12) - 1, Math.round(y + Math.sin(a) * 12) - 1, 3, 3); }
  }
  const tele = (e.pat === 'dash' && e.st === 1);
  ctx.fillStyle = '#1a1c2c'; disc(x, y, 9);
  ctx.fillStyle = tele && ((t * 20) | 0) % 2 ? '#e04060' : '#f4f4f4'; disc(x, y, 8);
  ctx.fillStyle = e.phase === 3 ? '#e04060' : B.c1 === '#29366f' ? '#3b5dc9' : '#b13e53';
  disc(x + e.eyeX, y + e.eyeY, 5);
  ctx.fillStyle = '#1a1c2c'; disc(x + e.eyeX * 1.3, y + e.eyeY * 1.3, 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(x + Math.round(e.eyeX) - 3, y + Math.round(e.eyeY) - 3, 2, 2);
  if (tele) { ctx.fillStyle = 'rgba(224,64,96,0.7)'; for (let i = 20; i < 200; i += 6) ctx.fillRect(Math.round(x + e.ddx * i), Math.round(y + e.ddy * i), 2, 2); }
}

function drawEnemies() {
  for (const e of G.enemies) {
    if (e.dead || !onScreen(e.x, e.y)) continue;
    if (e.type === 'boss') { drawBoss(e); continue; }
    const set = SPR[e.elite ? e.type + '2' : e.type];
    const x = sx(e.x), y = sy(e.y);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - (set.w >> 1) + 1, y + (set.h >> 1) - 1, set.w - 2, 2);
    let white = e.flash > 0, ox = 0;
    if (e.type === 'charger' && e.st === 1) {
      white = ((e.t * 24) | 0) % 2 === 0; ox = rand(-1, 1);
      ctx.fillStyle = 'rgba(224,64,96,0.8)'; for (let i = 10; i < 130; i += 5) ctx.fillRect(Math.round(x + e.dx * i), Math.round(y + e.dy * i), 1, 1);
    }
    if (e.slow > 0 && !white) { ctx.fillStyle = 'rgba(115,239,247,0.45)'; disc(x, y, e.r + 2); }
    const bob = e.type === 'spitter' ? Math.round(Math.sin(e.t * 4) * 1.5) : 0;
    drawSet(set, (e.t * 7) | 0, x + ox, y + bob, e.face, white, e.elite && ((e.t * 4) | 0) % 2 === 0);
    if ((e.elite || e.type === 'brute') && e.hp < e.maxHp) {
      const w = set.w; ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x - w / 2, y - set.h / 2 - 5, w, 3);
      ctx.fillStyle = e.elite ? '#ffcd75' : '#e04060'; ctx.fillRect(x - w / 2 + 1, y - set.h / 2 - 4, Math.max(0, (w - 2) * e.hp / e.maxHp), 1);
    }
  }
}

function drawPlayer() {
  const p = G.player;
  if (G.dying) return;
  const blink = p.inv > 0 && ((p.inv * 20) | 0) % 2 === 0;
  const x = sx(p.x) - Math.round(Math.cos(p.aim) * p.recoil), y = sy(p.y) - Math.round(Math.sin(p.aim) * p.recoil);
  const bob = p.moving ? (((p.walk | 0) % 2) ? -1 : 0) : 0;
  if (G.od > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(glowSprite('#ffcd75', 22, 0.45 + Math.sin(G.t * 20) * 0.15), x - 22, y - 22);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(x - 4, y + 6, 9, 2);
  // scarf
  for (let i = G.scarf.length - 1; i >= 1; i--) { const s = G.scarf[i]; ctx.fillStyle = i % 2 ? '#ef7d57' : '#b13e53'; ctx.fillRect(sx(s.x) - 1, sy(s.y) + bob, i < 3 ? 3 : 2, 2); }
  if (!blink) drawSet(SPR.player, p.moving ? (p.walk | 0) : 0, x, y + bob, p.face, p.inv > 0.6);
  // gun
  const a = p.aim, gx = x + Math.cos(a) * 3, gy = y + 1 + bob + Math.sin(a) * 2;
  ctx.fillStyle = '#1a1c2c'; pline(gx, gy, gx + Math.cos(a) * 8, gy + Math.sin(a) * 8, 3);
  ctx.fillStyle = G.od > 0 ? '#ffcd75' : '#c0cbdc'; pline(gx, gy, gx + Math.cos(a) * 7, gy + Math.sin(a) * 7, 1);
  ctx.fillStyle = '#ffcd75'; ctx.fillRect(Math.round(gx + Math.cos(a) * 7), Math.round(gy + Math.sin(a) * 7), 1, 1);
  if (G.ebullets.length) { ctx.fillStyle = '#e04060'; ctx.fillRect(sx(p.x) - 1, sy(p.y) - 1, 3, 3); ctx.fillStyle = '#fff'; ctx.fillRect(sx(p.x), sy(p.y), 1, 1); }
  if (p.dashCd > 0) { const w = 10 * (1 - p.dashCd / G.S.dashCd); ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x - 5, y + 9, 11, 2); ctx.fillStyle = '#73eff7'; ctx.fillRect(x - 5, y + 9, Math.round(w), 1); }
}

function drawSummons() {
  const p = G.player;
  for (const t of G.turrets) {
    let x = sx(t.x), y = sy(t.y);
    if (t.drop > 0) { const k = t.drop / 0.35; ctx.fillStyle = 'rgba(239,125,87,0.6)'; ringPx(x, y, 4 + k * 10, 1); y -= Math.round(k * 120); }
    drawSet(SPR.turret, 0, x, y, 1, t.life < 1.5 && ((t.life * 10) | 0) % 2);
    ctx.fillStyle = '#1a1c2c'; pline(x, y - 1, x + Math.cos(t.ang) * 7, y - 1 + Math.sin(t.ang) * 7, 3);
    ctx.fillStyle = '#ef7d57'; pline(x, y - 1, x + Math.cos(t.ang) * 6, y - 1 + Math.sin(t.ang) * 6, 1);
  }
  for (let i = 0; i < (G.up.drone || 0); i++) {
    const d = G.drones[i]; if (!d) continue;
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#41a6f6', 7, 0.4), sx(d.x) - 7, sy(d.y) - 7); ctx.globalCompositeOperation = 'source-over';
    drawSet(SPR.drone, (G.t * 20) | 0, sx(d.x), sy(d.y) + Math.round(Math.sin(G.t * 5 + i)), 1);
  }
  if (G.bladePos.length) {
    ctx.globalCompositeOperation = 'lighter';
    for (const [bx, by, a] of G.bladePos) {
      for (let k = 1; k <= 4; k++) { const aa = a - k * 0.09; ctx.fillStyle = `rgba(115,239,247,${0.5 - k * 0.1})`; ctx.fillRect(sx(p.x + Math.cos(aa) * 36) - 1, sy(p.y + Math.sin(aa) * 36) - 1, 3, 3); }
      ctx.drawImage(glowSprite('#73eff7', 8, 0.5), sx(bx) - 8, sy(by) - 8);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (const [bx, by, a] of G.bladePos) {
      const tx = Math.cos(a + Math.PI / 2), ty = Math.sin(a + Math.PI / 2), X = sx(bx), Y = sy(by);
      ctx.fillStyle = '#41a6f6'; pline(X - tx * 4, Y - ty * 4, X + tx * 4, Y + ty * 4, 2);
      ctx.fillStyle = '#f4f4f4'; pline(X - tx * 3, Y - ty * 3, X + tx * 3, Y + ty * 3, 1);
    }
  }
}

function drawPickups() {
  for (const k of G.pickups) {
    if (!onScreen(k.x, k.y, 10)) continue;
    const x = sx(k.x), y = sy(k.y) + Math.round(Math.sin(k.t * 5) * (k.attract ? 0 : 1));
    if (k.type === 'coin') drawSet(k.big ? SPR.bigcoin : SPR.coin, ((k.t * 6) | 0), x, y, 1);
    else if (k.type === 'energy') {
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#41a6f6', 6, 0.6), x - 6, y - 6); ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#73eff7'; ctx.fillRect(x - 1, y - 2, 3, 5); ctx.fillRect(x - 2, y - 1, 5, 3); ctx.fillStyle = '#fff'; ctx.fillRect(x, y - 1, 1, 3);
    } else {
      if (((k.t * 6) | 0) % 2) { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#e04060', 8, 0.5), x - 8, y - 8); ctx.globalCompositeOperation = 'source-over'; }
      drawSet(SPR.heart, 0, x, y, 1);
    }
  }
}

// friendly: thin translucent streaks drawn UNDER enemies
function drawPBullets() {
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.bullets) {
    if (!onScreen(b.x, b.y, 10)) continue;
    const g = b.kind === 'missile' ? 6 : 3;
    ctx.drawImage(glowSprite(b.color, g, 0.3), sx(b.x) - g, sy(b.y) - g);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.85;
  for (const b of G.bullets) {
    if (!onScreen(b.x, b.y, 10)) continue;
    const x = sx(b.x), y = sy(b.y), sp = Math.hypot(b.vx, b.vy) || 1, ux = b.vx / sp, uy = b.vy / sp;
    if (b.kind === 'missile') { ctx.fillStyle = b.color; pline(x - ux * 4, y - uy * 4, x, y, 2); ctx.fillStyle = '#fff'; ctx.fillRect(x - 1, y - 1, 2, 2); continue; }
    ctx.fillStyle = b.color; pline(x - ux * 7, y - uy * 7, x - ux * 2, y - uy * 2, 1);
    ctx.fillStyle = '#fff'; pline(x - ux * 2, y - uy * 2, x, y, 1);
  }
  ctx.globalAlpha = 1;
}
// hostile: outlined round orbs with a pulsing halo, drawn ON TOP of everything
function drawEBullets() {
  const pulse = 0.28 + Math.sin(G.t * 14) * 0.1;
  ctx.globalCompositeOperation = 'lighter';
  for (const b of G.ebullets) {
    if (!onScreen(b.x, b.y, 8)) continue;
    const g = b.r + 4; ctx.drawImage(glowSprite(b.color, g, pulse), sx(b.x) - g, sy(b.y) - g);
  }
  ctx.globalCompositeOperation = 'source-over';
  for (const b of G.ebullets) {
    if (!onScreen(b.x, b.y, 8)) continue;
    ctx.drawImage(bulletSprite(b.color, b.r), sx(b.x) - b.r - 1, sy(b.y) - b.r - 1);
  }
}

function drawLockOn() {
  const e = G.target; if (!e || e.dead || G.dying) return;
  const x = sx(e.x), y = sy(e.y), r = Math.round(e.r + 4 + Math.sin(G.t * 12) * 1.5), L = 3;
  ctx.fillStyle = '#73eff7';
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = x + dx * r, cy = y + dy * r;
    ctx.fillRect(dx < 0 ? cx : cx - L + 1, cy, L, 1); ctx.fillRect(cx, dy < 0 ? cy : cy - L + 1, 1, L);
  }
}
function drawMoveCursor() {
  if (touchMode || !mouse.inside || state !== 'play' || G.dying) return;
  const mx = Math.round(mouse.x), my = Math.round(mouse.y), dx = mx - W / 2, dy = my - H / 2, d = Math.hypot(dx, dy);
  const active = d > MOVE_DEAD;
  if (active) {
    const n = Math.floor((d - 10) / 7), off = (G.t * 30) % 7;
    ctx.fillStyle = 'rgba(244,244,244,0.35)';
    for (let i = 0; i < n; i++) { const k = (10 + i * 7 + off) / d; ctx.fillRect(Math.round(W / 2 + dx * k), Math.round(H / 2 + dy * k), 1, 1); }
  }
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(mx - 3, my - 1, 7, 3); ctx.fillRect(mx - 1, my - 3, 3, 7);
  ctx.fillStyle = active ? '#f4f4f4' : '#566c86';
  ctx.fillRect(mx - 2, my, 5, 1); ctx.fillRect(mx, my - 2, 1, 5);
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(mx, my, 1, 1);
}

function drawParts() {
  for (const q of G.parts) {
    if (!onScreen(q.x, q.y, 10)) continue;
    const x = sx(q.x), y = sy(q.y);
    if (q.num) {
      ctx.globalAlpha = Math.min(1, q.life / (q.max * 0.4));
      text(q.num, x, y - 6, q.color, 'c', 12);
      ctx.globalAlpha = 1; continue;
    }
    ctx.fillStyle = q.color;
    if (q.spark) { pline(x, y, x - q.vx * 0.03, y - q.vy * 0.03, 1); continue; }
    const s = q.life < q.max * 0.35 ? Math.max(1, q.size - 1) : q.size;
    ctx.fillRect(x - (s >> 1), y - (s >> 1), s, s);
  }
}

function drawFx(layer) {
  for (const f of G.fx) {
    const k = f.t / f.life;
    if (layer === 0) {
      if (f.type === 'ring') { ctx.fillStyle = f.color; ctx.globalAlpha = 1 - k * 0.7; ringPx(sx(f.x), sy(f.y), f.R * (0.2 + 0.8 * Math.sqrt(k)), f.th); ctx.globalAlpha = 1; }
      else if (f.type === 'ghost') { ctx.globalAlpha = 0.5 * (1 - k); const s = f.face < 0 ? SPR.ghostL : SPR.ghost; ctx.drawImage(s[0], sx(f.x) - 5, sy(f.y) - 6); ctx.globalAlpha = 1; }
      else if (f.type === 'mark') {
        const on = ((f.t * 16) | 0) % 2; ctx.fillStyle = on ? '#e04060' : '#ffcd75';
        const r = Math.round(f.R * (1.5 - k * 0.5)); ringPx(sx(f.x), sy(f.y), r, 1);
        pline(sx(f.x) - r - 4, sy(f.y), sx(f.x) - r + 4, sy(f.y), 1); pline(sx(f.x) + r - 4, sy(f.y), sx(f.x) + r + 4, sy(f.y), 1);
        pline(sx(f.x), sy(f.y) - r - 4, sx(f.x), sy(f.y) - r + 4, 1); pline(sx(f.x), sy(f.y) + r - 4, sx(f.x), sy(f.y) + r + 4, 1);
      }
    } else {
      if (f.type === 'muzzle') { ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#ffcd75', 6, 0.9), sx(f.x) - 6, sy(f.y) - 6); ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#fff'; ctx.fillRect(sx(f.x) - 1, sy(f.y) - 1, 3, 3); }
      else if (f.type === 'pop') { ctx.fillStyle = k < 0.5 ? '#fff' : '#ffcd75'; disc(sx(f.x), sy(f.y), f.r * (1 - k * 0.5)); }
      else if (f.type === 'boom') {
        const r = f.R * (0.4 + 0.6 * k), X = sx(f.x), Y = sy(f.y);
        ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#ef7d57', Math.max(4, Math.round(r * 1.6)), 0.7 * (1 - k)), X - Math.max(4, Math.round(r * 1.6)), Y - Math.max(4, Math.round(r * 1.6))); ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = k < 0.3 ? '#fff' : k < 0.6 ? '#ffcd75' : '#ef7d57'; disc(X, Y, r * (1 - k));
        ctx.fillStyle = '#ffcd75'; ctx.globalAlpha = 1 - k; ringPx(X, Y, r, 1); ctx.globalAlpha = 1;
      }
      else if (f.type === 'bolt') {
        ctx.globalCompositeOperation = 'lighter';
        for (let pass = 0; pass < 2; pass++) {
          ctx.fillStyle = pass ? '#ffffff' : '#41a6f6';
          for (let i = 0; i < f.pts.length - 1; i++) {
            const [x0, y0] = f.pts[i], [x1, y1] = f.pts[i + 1]; let lx = x0, ly = y0;
            for (let s = 1; s <= 5; s++) { const t = s / 5, nx = x0 + (x1 - x0) * t + (s < 5 ? rand(-6, 6) : 0), ny = y0 + (y1 - y0) * t + (s < 5 ? rand(-6, 6) : 0); pline(sx(lx), sy(ly), sx(nx), sy(ny), pass ? 1 : 3); lx = nx; ly = ny; }
          }
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      else if (f.type === 'beam') {
        const X = sx(f.x), Y = sy(f.y), w = Math.round(f.R * (1 - k) * 1.2);
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = `rgba(65,166,246,${0.6 * (1 - k)})`; ctx.fillRect(X - w - 4, 0, (w + 4) * 2, Y + 4);
        ctx.fillStyle = `rgba(115,239,247,${0.9 * (1 - k)})`; ctx.fillRect(X - w, 0, w * 2, Y + 2);
        ctx.fillStyle = `rgba(255,255,255,${1 - k})`; ctx.fillRect(X - (w >> 1), 0, w, Y);
        ctx.drawImage(glowSprite('#73eff7', f.R + 10, 0.8 * (1 - k)), X - f.R - 10, Y - f.R - 10);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
}

function bar(x, y, w, h, frac, col, bg = '#1a1c2c', hi) {
  ctx.fillStyle = '#1a1c2c'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = bg === '#1a1c2c' ? '#262b44' : bg; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), h);
  if (hi) { ctx.fillStyle = hi; ctx.fillRect(x, y, Math.round(w * clamp(frac, 0, 1)), 1); }
}

function drawHUD() {
  const p = G.player, g = G;
  // HP
  text('HP', 4, 2, '#e04060');
  bar(22, 5, 96, 6, p.hpShown / p.maxHp, '#f4f4f4');
  ctx.fillStyle = p.hp / p.maxHp < 0.3 && ((g.t * 6) | 0) % 2 ? '#ff5577' : '#e04060'; ctx.fillRect(22, 5, Math.round(96 * clamp(p.hp / p.maxHp, 0, 1)), 6);
  ctx.fillStyle = '#ff8aa0'; ctx.fillRect(22, 5, Math.round(96 * clamp(p.hp / p.maxHp, 0, 1)), 1);
  for (let i = 1; i < 8; i++) { ctx.fillStyle = 'rgba(26,28,44,0.5)'; ctx.fillRect(22 + i * 12, 5, 1, 6); }
  text(`${Math.ceil(p.hp)}/${p.maxHp}`, 122, 2, '#f4f4f4');
  // energy
  const full = g.energy >= 100;
  text('EN', 4, 13, '#73eff7');
  if (g.od > 0) bar(22, 16, 96, 4, g.od / g.S.odDur, odHue((g.t * 12) | 0), '#1a1c2c', '#fff');
  else bar(22, 16, 96, 4, g.energy / 100, full && ((g.t * 8) | 0) % 2 ? '#f4f4f4' : '#41a6f6', '#1a1c2c', '#73eff7');
  if (g.od > 0) text('OVERDRIVE!', 122, 13, odHue((g.t * 12) | 0));
  else if (full) text(touchMode ? '点击 [燃] 超载!' : '右键 燃魂超载!', 122, 13, ((g.t * 4) | 0) % 2 ? '#ffcd75' : '#ff5577');
  // time & wave
  text(fmt(g.t), W / 2, 1, '#f4f4f4', 'c', 12);
  text(`WAVE ${g.wave}`, W / 2, 12, '#73eff7', 'c');
  // coins
  drawSet(SPR.bigcoin, 0, W - 150, 8, 1);
  text(String(g.coins), W - 144, 2, '#ffcd75');
  text(`击杀 ${g.kills}`, W - 4, 2, '#c0cbdc', 'r');
  const need = g.nextAt - g.prevAt, have = g.coins - g.prevAt;
  text('强化', W - 154, 13, '#c070f0');
  bar(W - 128, 17, 124, 3, have / need, '#c070f0', '#1a1c2c', '#e0a0ff');
  text(`${g.nextAt}`, W - 4, 19, '#8a6cb0', 'r');
  // combo
  if (g.combo >= 5) {
    const c = g.combo, col = c >= 200 ? '#ff5577' : c >= 100 ? '#ffcd75' : c >= 50 ? '#ef7d57' : '#f4f4f4';
    const pop = Math.round(g.comboPop * 3), jx = c >= 100 ? Math.round(rand(-1, 1)) : 0;
    text(String(c), W - 8 + jx, 34 - pop, col, 'r', 24);
    text('COMBO', W - 8, 58, col, 'r');
    bar(W - 44, 71, 36, 2, g.comboT / 2.4, col);
    text(`金币 x${(1 + Math.min(c, 300) / 300).toFixed(1)}`, W - 8, 74, '#ffcd75', 'r');
  }
  // boss bar
  if (g.boss) {
    const b = g.boss, bw = 220, bx = (W - bw) / 2, by = H - 16;
    text(`${b.B.name} · ${b.B.en}`, W / 2, by - 13, b.B.c3, 'c');
    bar(bx, by, bw, 5, b.hp / b.maxHp, b.phase === 3 ? '#ff5577' : '#e04060', '#1a1c2c', '#ffcd75');
    for (let i = 1; i < 3; i++) { ctx.fillStyle = '#1a1c2c'; ctx.fillRect(bx + Math.round(bw * i / 3), by, 1, 5); }
    const ex = b.x - camX, ey = b.y - camY;
    if (ex < -10 || ex > W + 10 || ey < -10 || ey > H + 10) {
      const dx = ex - W / 2, dy = ey - H / 2, k = Math.min((W / 2 - 22) / Math.abs(dx || 1e-3), (H / 2 - 30) / Math.abs(dy || 1e-3));
      const ax = W / 2 + dx * k, ay = H / 2 + dy * k, a = Math.atan2(dy, dx);
      if (((g.t * 4) | 0) % 2) {
        ctx.fillStyle = '#e04060';
        const c = Math.cos(a), s = Math.sin(a);
        for (let i = 0; i < 7; i++) { const w = 6 - i, px = ax + c * i, py = ay + s * i; pline(px - s * w, py + c * w, px + s * w, py - c * w, 2); }
      }
      text('BOSS', ax - Math.cos(a) * 14, ay - Math.sin(a) * 12 - 6, '#ff5577', 'c');
    }
  }
  // upgrades strip
  let ui = 0;
  for (const u of UPG) {
    const l = g.up[u.id]; if (!l) continue;
    const c = u.type === 'summon' ? '#c070f0' : u.type === 'barrage' ? '#ef7d57' : '#41a6f6';
    const ux = 4 + (ui % 7) * 18, uy = H - 21 - ((ui / 7) | 0) * 21; ui++;
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(ux, uy, 16, 16); ctx.fillStyle = c; ctx.fillRect(ux + 1, uy + 1, 14, 1); ctx.fillRect(ux + 1, uy + 14, 14, 1);
    text(u.g, ux + 8, uy + 1, '#f4f4f4', 'c', 12, null);
    ctx.fillStyle = '#1a1c2c'; ctx.fillRect(ux, uy + 16, 16, 3);
    ctx.fillStyle = c; for (let k = 0; k < l; k++) ctx.fillRect(ux + 1 + k * 2, uy + 17, 1, 1);
  }
}

function drawBanners() {
  const b = G.banners[G.banners.length - 1]; if (!b) return;
  const inT = Math.min(1, b.t / 0.18), outT = Math.max(0, (b.t - b.life + 0.25) / 0.25);
  const off = Math.round((1 - inT) * W * 0.6 - outT * W * 0.6), y = 62;
  ctx.fillStyle = 'rgba(10,11,22,0.7)'; ctx.fillRect(0, y - 4, W, 42);
  ctx.fillStyle = b.color; ctx.fillRect(0, y - 5, W, 1); ctx.fillRect(0, y + 38, W, 1);
  for (let i = 0; i < 6; i++) { ctx.fillStyle = b.color; ctx.globalAlpha = 0.3; ctx.fillRect(((b.t * 300 + i * 90) % (W + 40)) - 40, y - 4, 20, 42); } ctx.globalAlpha = 1;
  text(b.title, W / 2 + off, y - 1, b.color, 'c', 24);
  if (b.sub) text(b.sub, W / 2 - off, y + 23, '#f4f4f4', 'c');
}

function drawWarn(f) {
  const on = ((f.t * 4) | 0) % 2 === 0;
  ctx.fillStyle = 'rgba(224,64,96,0.18)'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#e04060';
  for (let i = -1; i < W / 16 + 1; i++) { const x = i * 16 + ((f.t * 60) % 16); ctx.fillRect(x, 96, 8, 4); ctx.fillRect(W - x, 150, 8, 4); }
  if (on) text('!! WARNING !!', W / 2, 106, '#ff5577', 'c', 24);
  text('巨大病毒反应接近中', W / 2, 132, '#f4f4f4', 'c');
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingEnabled = false;
  if (!G || state === 'title' || state === 'story' || state === 'help' || state === 'loading') return renderTitleBg();
  const p = G.player;
  const shx = G.shake > 0.2 ? rand(-G.shake, G.shake) : 0, shy = G.shake > 0.2 ? rand(-G.shake, G.shake) : 0;
  camX = Math.round(p.x - W / 2 + shx - Math.cos(p.aim) * G.kick); camY = Math.round(p.y - H / 2 + shy - Math.sin(p.aim) * G.kick);
  drawBackground(camX, camY);
  for (const d of G.decals) { ctx.globalAlpha = 0.35 * (1 - d.t / 8); ctx.fillStyle = d.color === '#1a1c2c' ? '#07080f' : d.color; disc(sx(d.x), sy(d.y), d.r); } ctx.globalAlpha = 1;
  drawFx(0);
  drawPickups();
  drawPBullets();
  drawEnemies();
  drawLockOn();
  drawSummons();
  drawPlayer();
  drawParts();
  drawFx(1);
  drawEBullets();
  // screen overlays
  if (G.od > 0) { ctx.fillStyle = `rgba(255,205,117,${0.05 + Math.sin(G.t * 10) * 0.025})`; ctx.fillRect(0, 0, W, H); }
  if (p.hp / p.maxHp < 0.3 && !G.dying) { ctx.globalAlpha = 0.25 + Math.sin(G.t * 8) * 0.12; ctx.drawImage(VIG_RED, 0, 0); ctx.globalAlpha = 1; }
  ctx.drawImage(VIG, 0, 0);
  if (G.flash > 0) { ctx.globalAlpha = Math.min(0.7, G.flash * 1.6); ctx.fillStyle = G.flashColor; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
  for (const f of G.fx) if (f.type === 'warn') drawWarn(f);
  drawBanners();
  drawHUD();
  drawMoveCursor();
  if (joy.active) { ctx.fillStyle = 'rgba(244,244,244,0.25)'; ringPx(joy.ox, joy.oy, 22, 1); ctx.fillStyle = 'rgba(244,244,244,0.5)'; disc(joy.ox + joy.x * 18, joy.oy + joy.y * 18, 6); }
}

// title background
const rain = Array.from({ length: 40 }, () => ({ x: rand(W), y: rand(H), s: rand(20, 70), l: (rand(4, 14)) | 0 }));
function renderTitleBg() {
  titleT += 1 / 60;
  if (!TILES) { ctx.fillStyle = '#0a0b16'; ctx.fillRect(0, 0, W, H); return; }
  drawBackground(Math.round(titleT * 12), Math.round(titleT * 6), 'rgba(10,11,22,0.35)');
  for (const r of rain) {
    r.y += r.s / 60; if (r.y > H + 20) { r.y = -20; r.x = rand(W); }
    for (let i = 0; i < r.l; i++) { ctx.fillStyle = i === 0 ? '#73eff7' : `rgba(65,166,246,${0.5 - i / r.l * 0.5})`; ctx.fillRect(Math.round(r.x), Math.round(r.y) - i * 3, 1, 2); }
  }
  const cx = W / 2, cy = H - 44;
  ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowSprite('#3b5dc9', 40, 0.5), cx - 40, cy - 40); ctx.globalCompositeOperation = 'source-over';
  const t = titleT;
  for (let i = 0; i < 7; i++) {
    const a = t * 0.4 + i * TAU / 7, R = 70 + Math.sin(t * 2 + i) * 6;
    const set = SPR[['crawler', 'spitter', 'brute', 'charger', 'splitter', 'crawler', 'mini'][i]];
    drawSet(set, (t * 6) | 0, cx + Math.cos(a) * R * 1.6, cy + Math.sin(a) * R * 0.35 - 6, Math.cos(a) > 0 ? -1 : 1);
  }
  drawSet(SPR.player, (t * 4) | 0, cx, cy, Math.cos(t) > 0 ? 1 : -1);
  if (((t * 3) | 0) % 5 === 0) { ctx.fillStyle = 'rgba(224,64,96,0.15)'; ctx.fillRect(0, (rand(H)) | 0, W, 2); }
  ctx.drawImage(VIG, 0, 0);
}

let VIG, VIG_RED;
function makeVignettes() {
  const mk = (col, a) => {
    const c = newCanvas(W, H), x = c.getContext('2d');
    const [r, g, b] = hexRgb(col);
    for (let j = 0; j < H; j += 2) for (let i = 0; i < W; i += 2) {
      const dx = (i - W / 2) / (W / 2), dy = (j - H / 2) / (H / 2), d = Math.sqrt(dx * dx * 0.7 + dy * dy * 0.9);
      const v = Math.max(0, d - 0.65) / 0.5; if (v <= 0) continue;
      x.fillStyle = `rgba(${r},${g},${b},${(Math.min(1, Math.ceil(v * 5) / 5) * a).toFixed(2)})`; x.fillRect(i, j, 2, 2);
    }
    return c;
  };
  VIG = mk('#05060d', 0.55); VIG_RED = mk('#e04060', 0.9);
}

// ============ UI / state ============
function showOverlay(id) { for (const o of document.querySelectorAll('.ov')) o.classList.toggle('hidden', o.id !== id); wrap.classList.toggle('playing', !id); }

function toTitle() {
  state = 'title'; G = null; showOverlay('title'); Sound.setBoss(false);
  const best = JSON.parse(localStorage.getItem('lf_best') || 'null');
  $('best').textContent = best ? `最佳记录  ${fmt(best.t)}  ·  击杀 ${best.kills}  ·  最高连击 ${best.combo}` : '';
}
const STORY = [
  '公元 2099 年，全球算力网络「盖亚」',
  '被一种自我进化的病毒——「虚空码」吞噬。',
  '城市熄灭，机器暴走，数据化作怪物涌出屏幕。',
  '你是 V-7「守夜人」，',
  '最后一道还没被格式化的防火墙。',
  '你的身后，是人类仅存的记忆核心。',
  '没有退路。没有援军。',
  '燃尽每一发子弹，击碎每一个比特——',
  '守住，直到黎明重启。',
];
const STORY_LEN = STORY.join('').length;
function startStory(force) {
  if (!force && localStorage.getItem('lf_story')) return startGame();
  state = 'story'; storyT = 0; showOverlay('story');
}
function renderStory() {
  let n = Math.floor(storyT * 24), html = '';
  for (const l of STORY) { if (n <= 0) break; html += `<div>${l.slice(0, n)}${n < l.length ? '<span class="cur">_</span>' : ''}</div>`; n -= l.length; }
  $('story-text').innerHTML = html;
  $('story-skip').textContent = storyT * 24 >= STORY_LEN ? '> 点击或按任意键 · 进入战场' : '点击跳过';
}
function storyAdvance() {
  if (storyT * 24 < STORY_LEN) storyT = STORY_LEN / 24 + 0.01;
  else { localStorage.setItem('lf_story', '1'); startGame(); }
}
function startGame() {
  newGame(); state = 'play'; showOverlay(null);
  Sound.music(true); Sound.setBoss(false);
  banner('守住核心', '击杀病毒 · 收集金币 · 解锁强化', '#73eff7', 2.8);
}
function togglePause() {
  if (state === 'play') {
    state = 'pause'; showOverlay('pause');
    const list = UPG.filter(u => G.up[u.id]).map(u => `<span class="chip t-${u.type}">${u.name} Lv${G.up[u.id]}</span>`).join('');
    $('build').innerHTML = list || '<span class="dim">尚未获得任何强化</span>';
    $('pause-stats').textContent = `存活 ${fmt(G.t)}  ·  击杀 ${G.kills}  ·  金币 ${G.coins}`;
    $('btn-mute').textContent = Sound.muted ? '声音：关' : '声音：开';
  } else if (state === 'pause') { state = 'play'; showOverlay(null); }
}
function gameOver() {
  state = 'over'; showOverlay('over'); Sound.setBoss(false);
  const g = G, t = g.t;
  const rank = t < 90 ? '见习守夜人' : t < 180 ? '钢铁防线' : t < 330 ? '不灭火种' : t < 510 ? '赤焰壁垒' : '黎明之光';
  const best = JSON.parse(localStorage.getItem('lf_best') || 'null');
  const isBest = !best || t > best.t;
  if (isBest) localStorage.setItem('lf_best', JSON.stringify({ t, kills: g.kills, combo: g.maxCombo }));
  $('over-stats').innerHTML = [
    ['存活时间', fmt(t)], ['击杀数', g.kills], ['最高连击', g.maxCombo], ['累计金币', g.coins], ['BOSS 击破', g.bossKills], ['擦弹', g.grazes],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
  $('over-rank').innerHTML = `称号：<b>${rank}</b>${isBest ? '　<i>NEW RECORD!</i>' : ''}`;
  if (BOT) console.log('BOT_OVER', JSON.stringify({ t: Math.round(t), kills: g.kills, lvl: g.milestone, bk: g.bossKills, up: g.up }));
}

function rollChoices() {
  const pool = UPG.filter(u => (G.up[u.id] || 0) < u.max), out = [];
  while (out.length < 3 && pool.length) {
    const ws = pool.map(u => (u.type === 'summon' && !G.up[u.id] ? 1.2 : 1) * (G.up[u.id] ? 1.15 : 1));
    let r = rand(ws.reduce((a, b) => a + b, 0)), i = 0;
    for (; i < ws.length - 1; i++) if ((r -= ws[i]) < 0) break;
    out.push(pool.splice(i, 1)[0]);
  }
  while (out.length < 3) out.push(HEAL);
  return out;
}
function openUpgrade() {
  state = 'upgrade'; G.upOpen = performance.now(); G.choices = rollChoices();
  renderCards(); showOverlay('upgrade'); Sound.sfx.levelup();
}
function renderCards() {
  $('up-sub').textContent = `金币突破阈值 · 第 ${G.milestone - G.pending + 1} 阶强化${G.pending > 1 ? `（还有 ${G.pending - 1} 次）` : ''}`;
  $('cards').innerHTML = G.choices.map((u, i) => {
    const l = G.up[u.id] || 0, desc = typeof u.desc === 'function' ? u.desc(l) : u.desc;
    const pips = u.max < 99 ? Array.from({ length: u.max }, (_, k) => `<i class="${k < l ? 'on' : k === l ? 'nx' : ''}"></i>`).join('') : '';
    return `<div class="card t-${u.type}" data-pick="${i}" style="animation-delay:${i * 70}ms">
      <div class="tag">${TYPE_NAME[u.type]}</div>${l === 0 && u.max < 99 ? '<div class="new">NEW</div>' : ''}
      <div class="glyph">${u.g}</div><div class="name">${u.name}</div><div class="pips">${pips}</div>
      <div class="desc">${desc.replace(/\n/g, '<br>')}</div><div class="key">${touchMode ? '点击选择' : `[ ${i + 1} ]`}</div></div>`;
  }).join('');
  $('btn-reroll').textContent = `重抽 [R] ×${G.rerolls}`;
  $('btn-reroll').disabled = G.rerolls <= 0;
}
function choose(i) {
  if (state !== 'upgrade' || performance.now() - G.upOpen < 350) return;
  const u = G.choices[i]; if (!u) return;
  const p = G.player;
  if (u.id !== 'heal') G.up[u.id] = (G.up[u.id] || 0) + 1;
  if (u.apply) u.apply(G.S, p);
  if (u.id === 'thunder') G.thT = 0.3; if (u.id === 'turret') G.tuT = 0.3; if (u.id === 'missile') G.miT = 0.3; if (u.id === 'nova') G.noT = 0.5; if (u.id === 'orbital') G.orT = 1;
  G.pending--;
  Sound.sfx.select();
  const col = u.type === 'summon' ? '#c070f0' : u.type === 'barrage' ? '#ef7d57' : '#73eff7';
  burst(p.x, p.y, 40, [col, '#f4f4f4', '#ffcd75'], 160, 0.7, 2, true); ring(p.x, p.y, 70, col, 0.4, 2);
  floatText(p.x, p.y - 20, `${u.name}${u.id !== 'heal' ? ' Lv' + G.up[u.id] : ''}`, col, 1.3);
  G.hitstop = 0.05;
  if (G.pending > 0) openUpgrade(); else { state = 'play'; showOverlay(null); }
}
function reroll() {
  if (state !== 'upgrade' || G.rerolls <= 0) return;
  G.rerolls--; G.choices = rollChoices(); renderCards(); Sound.sfx.coin();
}

// ============ input ============
function onKey(code) {
  Sound.init();
  if (state === 'play') {
    if (code === 'Space') activateOverdrive();
    else if (code === 'ShiftLeft' || code === 'ShiftRight') tryDash();
    else if (code === 'Escape' || code === 'KeyP') togglePause();
    else if (code === 'KeyM') Sound.toggleMute();
  } else if (state === 'upgrade') {
    if (code === 'Digit1' || code === 'Numpad1') choose(0);
    else if (code === 'Digit2' || code === 'Numpad2') choose(1);
    else if (code === 'Digit3' || code === 'Numpad3') choose(2);
    else if (code === 'KeyR') reroll();
  } else if (state === 'pause') { if (code === 'Escape' || code === 'KeyP') togglePause(); }
  else if (state === 'title') { if (code === 'Enter' || code === 'Space') startStory(); }
  else if (state === 'story') storyAdvance();
  else if (state === 'help') { if (code === 'Escape' || code === 'Enter') toTitle(); }
  else if (state === 'over') { if (code === 'Enter') startGame(); }
}
addEventListener('keydown', e => {
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
  if (!keys[e.code]) onKey(e.code);
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play') togglePause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') togglePause(); });
function toGame(cx, cy) { return [(cx - offX) / scale, (cy - offY) / scale]; }
// mouse = movement: the hero steers toward the cursor. left click = dash, right click = overdrive
function setTouchMode(on) { touchMode = on; wrap.classList.toggle('touch', on); }
addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse') return;
  if (touchMode) setTouchMode(false);
  [mouse.x, mouse.y] = toGame(e.clientX, e.clientY);
  mouse.inside = mouse.x >= 0 && mouse.x <= W && mouse.y >= 0 && mouse.y <= H;
});
document.addEventListener('mouseleave', () => { mouse.inside = false; });
wrap.addEventListener('contextmenu', e => e.preventDefault());
wrap.addEventListener('mousedown', e => {
  Sound.init();
  if (state === 'play' && !touchMode && !e.target.closest('[data-act]')) { if (e.button === 0) tryDash(); else if (e.button === 2) activateOverdrive(); }
  if (state === 'story') storyAdvance();
});
wrap.addEventListener('click', e => {
  const a = e.target.closest('[data-act]'), pk = e.target.closest('[data-pick]');
  if (pk) return choose(+pk.dataset.pick);
  if (a) handleAct(a);
});
function handleAct(a) {
  Sound.init();
  const act = a.dataset.act;
  if (act === 'start') startStory();
  else if (act === 'story') startStory(true);
  else if (act === 'help') { state = 'help'; showOverlay('help'); }
  else if (act === 'title') toTitle();
  else if (act === 'resume') togglePause();
  else if (act === 'restart') startGame();
  else if (act === 'reroll') reroll();
  else if (act === 'mute') { Sound.toggleMute(); a.textContent = Sound.muted ? '声音：关' : '声音：开'; }
  else if (act === 'od') activateOverdrive();
  else if (act === 'dash') tryDash();
  else if (act === 'pause') togglePause();
}
// touch: left side virtual joystick
wrap.addEventListener('touchstart', e => {
  if (!touchMode) setTouchMode(true);
  mouse.inside = false;
  Sound.init();
  if (state !== 'play') return;
  for (const t of e.changedTouches) {
    const a = t.target.closest && t.target.closest('[data-act]');
    if (a) { handleAct(a); continue; }
    const [x, y] = toGame(t.clientX, t.clientY);
    if (joy.id === null) { joy.id = t.identifier; joy.ox = x; joy.oy = y; joy.x = joy.y = 0; joy.active = true; }
  }
  e.preventDefault();
}, { passive: false });
wrap.addEventListener('touchmove', e => {
  for (const t of e.changedTouches) if (t.identifier === joy.id) {
    const [x, y] = toGame(t.clientX, t.clientY); let dx = (x - joy.ox) / 18, dy = (y - joy.oy) / 18; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
    joy.x = dx; joy.y = dy;
  }
  e.preventDefault();
}, { passive: false });
const endTouch = e => { for (const t of e.changedTouches) if (t.identifier === joy.id) { joy.id = null; joy.active = false; joy.x = joy.y = 0; } };
wrap.addEventListener('touchend', endTouch); wrap.addEventListener('touchcancel', endTouch);

function fit() {
  const s0 = Math.min(innerWidth / W, innerHeight / H);
  scale = s0 >= 1 && Math.floor(s0) / s0 > 0.85 ? Math.floor(s0) : s0;
  offX = Math.round((innerWidth - W * scale) / 2); offY = Math.round((innerHeight - H * scale) / 2);
  wrap.style.transform = `translate(${offX}px,${offY}px) scale(${scale})`;
}
addEventListener('resize', fit);

// ============ main loop ============
let last = performance.now(), acc = 0;
const perf = { ms: 0, n: 0, max: 0 };
function frame(now) {
  const el = Math.min(0.1, (now - last) / 1000); last = now;
  const p0 = performance.now();
  if (state === 'play') { acc += el * FAST; let n = 0; while (acc >= DT && n++ < 8 * FAST) { acc -= DT; step(DT); if (state !== 'play') break; } if (acc > DT * 8 * FAST) acc = 0; }
  else if (state === 'story') { storyT += el; renderStory(); }
  else if (state === 'upgrade' && BOT && performance.now() - G.upOpen > 400) { G.upOpen = 0; choose((Math.random() * 3) | 0); }
  else if (state === 'over' && BOT && QS.has('loop')) startGame();
  render();
  if (BOT) { const d = performance.now() - p0; perf.ms += d; perf.n++; perf.max = Math.max(perf.max, d); }
  requestAnimationFrame(frame);
}

async function boot() {
  fit();
  try { const f = new FontFace('FP', 'url(assets/fusion-pixel-12.woff2)'); await f.load(); document.fonts.add(f); } catch (e) { console.warn('font load failed', e); }
  buildSprites(); TILES = makeTiles(); makeVignettes();
  if (matchMedia('(pointer: coarse)').matches) setTouchMode(true);
  toTitle();
  if (BOT) startGame();
}
window.__dbg = { get G() { return G; }, get state() { return state; }, spawnBoss, activateOverdrive };
requestAnimationFrame(frame);
boot();

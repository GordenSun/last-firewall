'use strict';
// Pixel-art sprites defined as palette strings, baked into offscreen canvases.
const PAL = {
  k: '#1a1c2c', w: '#f4f4f4', W: '#c0cbdc', b: '#3b5dc9', n: '#29366f', c: '#41a6f6', C: '#73eff7',
  g: '#566c86', d: '#333c57', o: '#ef7d57', y: '#ffcd75', r: '#b13e53', R: '#e04060',
  p: '#5d275d', P: '#8a3cc0', q: '#c070f0', L: '#38b764', l: '#a7f070', G: '#257179',
};

function newCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function spriteFrom(rows) {
  const h = rows.length, w = Math.max(...rows.map(r => r.length));
  const c = newCanvas(w, h), x = c.getContext('2d');
  for (let j = 0; j < h; j++) for (let i = 0; i < rows[j].length; i++) {
    const ch = rows[j][i];
    if (ch !== '.' && PAL[ch]) { x.fillStyle = PAL[ch]; x.fillRect(i, j, 1, 1); }
  }
  return c;
}
function tinted(src, color) {
  const c = newCanvas(src.width, src.height), x = c.getContext('2d');
  x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in';
  x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c;
}
function flipped(src) {
  const c = newCanvas(src.width, src.height), x = c.getContext('2d');
  x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); return c;
}
function scaled(src, s) {
  const c = newCanvas(src.width * s, src.height * s), x = c.getContext('2d');
  x.imageSmoothingEnabled = false; x.drawImage(src, 0, 0, c.width, c.height); return c;
}
function makeSet(frames, s = 1) {
  let fr = frames.map(spriteFrom);
  if (s !== 1) fr = fr.map(f => scaled(f, s));
  const set = { w: fr[0].width, h: fr[0].height, r: fr, l: fr.map(flipped) };
  set.wr = set.r.map(f => tinted(f, '#ffffff')); set.wl = set.l.map(f => tinted(f, '#ffffff'));
  set.gr = set.r.map(f => tinted(f, '#ffcd75')); set.gl = set.l.map(f => tinted(f, '#ffcd75'));
  return set;
}

const SPR_SRC = {
  player: [[
    '...kkkkk...',
    '..kbbbbbk..',
    '.kbbbbbbbk.',
    '.kbkkkkkbk.',
    '.kkccwccck.',
    '.kbkkkkkbk.',
    '..kbbbbbk..',
    '.kooooooook',
    '.kgbbbbbgk.',
    '.kgbbbbbgk.',
    '..kbbkbbk..',
    '..kkk.kkk..',
  ], [
    '...kkkkk...',
    '..kbbbbbk..',
    '.kbbbbbbbk.',
    '.kbkkkkkbk.',
    '.kkccwccck.',
    '.kbkkkkkbk.',
    '..kbbbbbk..',
    '.kooooooook',
    '.kgbbbbbgk.',
    '.kgbbbbbgk.',
    '...kbkbk...',
    '...kk.kk...',
  ]],
  crawler: [[
    '..k....k..',
    '...k..k...',
    '..kkkkkk..',
    '.krrrrrrk.',
    'krywrrwyrk',
    'krrrrrrrrk',
    '.kkrkkrkk.',
    '.k.k..k.k.',
  ], [
    '..k....k..',
    '...k..k...',
    '..kkkkkk..',
    '.kRRRRRRk.',
    'kRywRRwyRk',
    'kRRRRRRRRk',
    '.kkRkkRkk.',
    'k.k....k.k',
  ]],
  brute: [[
    '....kkkkkkkk....',
    '..kkPPPPPPPPkk..',
    '.kPPqqPPPPPPPPk.',
    'kPPwwPPPPPPwwPPk',
    'kPPwkPPPPPPkwPPk',
    'kPPPPPPPPPPPPPPk',
    'kPPkwkwkwkwkwPPk',
    'kPPkkkkkkkkkkPPk',
    'kPPPPPPPPPPPPPPk',
    '.kPPPPPPPPPPPPk.',
    'kkPPkPPPPPPkPPkk',
    'kPPk.kkkkkk.kPPk',
    'kkkk........kkkk',
  ], [
    '....kkkkkkkk....',
    '..kkPPPPPPPPkk..',
    '.kPPqqPPPPPPPPk.',
    'kPPwwPPPPPPwwPPk',
    'kPPwkPPPPPPkwPPk',
    'kPPPPPPPPPPPPPPk',
    'kPPkkkkkkkkkkPPk',
    'kPPkwkwkwkwkwPPk',
    'kPPPPPPPPPPPPPPk',
    '.kPPPPPPPPPPPPk.',
    '.kPPkPPPPPPkPPk.',
    '.kPPkkkkkkkkPPk.',
    '.kkkk......kkkk.',
  ]],
  spitter: [[
    '....kkkk....',
    '..kkLLLLkk..',
    '.kLLllllLLk.',
    '.kLlwwwwlLk.',
    'kLlwwkkwwlLk',
    'kLlwkRRkwlLk',
    'kLlwwkkwwlLk',
    '.kLlwwwwlLk.',
    '.kLLllllLLk.',
    '..kkLLLLkk..',
    '..k.k..k.k..',
    '.k..k..k..k.',
  ], [
    '....kkkk....',
    '..kkLLLLkk..',
    '.kLLllllLLk.',
    '.kLlwwwwlLk.',
    'kLlwwkkwwlLk',
    'kLlwkRRkwlLk',
    'kLlwwkkwwlLk',
    '.kLlwwwwlLk.',
    '.kLLllllLLk.',
    '..kkLLLLkk..',
    '...k.kk.k...',
    '...k.kk.k...',
  ]],
  charger: [[
    'kk........kk',
    'kwk......kwk',
    '.kwkkkkkkwk.',
    'kooooooooook',
    'kooyooooyook',
    'koookkkkoook',
    'kooooooooook',
    '.kookkkkook.',
    '.kk.k..k.kk.',
  ], [
    'kk........kk',
    'kwk......kwk',
    '.kwkkkkkkwk.',
    'kooooooooook',
    'kooyooooyook',
    'koookkkkoook',
    'kooooooooook',
    '.kookkkkook.',
    'kk..k..k..kk',
  ]],
  splitter: [[
    '....kkkk....',
    '..kklllLkk..',
    '.klllllLLLk.',
    'klwkllllwkLk',
    'klkkllllkkLk',
    'kllllllllLLk',
    'kLllllllLLLk',
    '.kLLLLLLLLk.',
    '..kkkkkkkk..',
  ], [
    '............',
    '...kkkkkk...',
    '.kklllllLkk.',
    'klwkllllwkLk',
    'klkkllllkkLk',
    'kllllllllLLk',
    'kLllllllLLLk',
    'kLLLLLLLLLLk',
    '.kkkkkkkkkk.',
  ]],
  mini: [[
    '..kkk..',
    '.klllk.',
    'klwlwlk',
    'klllllk',
    '.kLLLk.',
    '..kkk..',
  ], [
    '.......',
    '.kkkkk.',
    'klwlwlk',
    'klllllk',
    'kLLLLLk',
    '.kkkkk.',
  ]],
  drone: [[
    'k.....k',
    'kkkkkkk',
    'kcCwCck',
    '.kkkkk.',
  ], [
    '.k...k.',
    'kkkkkkk',
    'kcCwCck',
    '.kkkkk.',
  ]],
  turret: [[
    '..kkkkk..',
    '.kgWWWgk.',
    'kgWdddWgk',
    'kgddoddgk',
    'kgWdddWgk',
    '.kgWWWgk.',
    '..kkkkk..',
    '.kk...kk.',
    'kk.....kk',
  ]],
  coin: [[
    '.yyy.',
    'ywyyo',
    'yyyyo',
    'yyyoo',
    '.ooo.',
  ], [
    '..y..',
    '.ywo.',
    '.yyo.',
    '.yoo.',
    '..o..',
  ]],
  bigcoin: [[
    '..yyy..',
    '.ywwyy.',
    'ywyyyyo',
    'yyyyyyo',
    'yyyyyoo',
    '.yyooo.',
    '..ooo..',
  ], [
    '...y...',
    '..ywy..',
    '..yyo..',
    '..yyo..',
    '..yoo..',
    '..yoo..',
    '...o...',
  ]],
  heart: [[
    '.RR.RR.',
    'RwRRRRR',
    'RRRRRRR',
    '.RRRRR.',
    '..RRR..',
    '...R...',
  ]],
};

const SPR = {};
function buildSprites() {
  for (const k in SPR_SRC) SPR[k] = makeSet(SPR_SRC[k]);
  for (const k of ['crawler', 'brute', 'spitter', 'charger', 'splitter', 'mini']) SPR[k + '2'] = makeSet(SPR_SRC[k], 2);
  SPR.ghost = SPR.player.r.map(f => tinted(f, '#73eff7'));
  SPR.ghostL = SPR.player.l.map(f => tinted(f, '#73eff7'));
}

// --- danmaku bullets & glows ---
const _bcache = {}, _gcache = {};
function bulletSprite(color, r) {
  const key = color + r; if (_bcache[key]) return _bcache[key];
  // hostile orb: dark outline ring + colored body + white core
  const R = r + 1, s = R * 2 + 1, c = newCanvas(s, s), x = c.getContext('2d');
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const dx = i - R, dy = j - R, d = Math.sqrt(dx * dx + dy * dy);
    if (d > r + 1.3) continue;
    x.fillStyle = d > r + 0.3 ? '#12061a' : d <= Math.max(0.5, r - 1.5) ? '#ffffff' : color;
    x.fillRect(i, j, 1, 1);
  }
  return (_bcache[key] = c);
}
function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
// Cached per (color, radius) only — NEVER put a varying alpha in the key (that leaked a new canvas
// every frame and exhausted GPU memory after a few minutes). Fade at draw time via drawGlow().
function glowSprite(color, R, a = 1) {
  R = Math.max(2, Math.round(R));
  const key = color + '|' + R + '|' + a; if (_gcache[key]) return _gcache[key];
  const s = R * 2, c = newCanvas(s, s), x = c.getContext('2d');
  const [rr, gg, bb] = hexRgb(color);
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) {
    const d = Math.hypot(i + 0.5 - R, j + 0.5 - R) / R;
    if (d >= 1) continue;
    const q = Math.ceil((1 - d) * 4) / 4;
    x.fillStyle = `rgba(${rr},${gg},${bb},${(q * q * a).toFixed(3)})`; x.fillRect(i, j, 1, 1);
  }
  return (_gcache[key] = c);
}
function drawGlow(ctx, color, R, a, x, y) {
  if (a <= 0.01) return;
  R = Math.max(2, Math.round(R));
  const pa = ctx.globalAlpha; ctx.globalAlpha = pa * Math.min(1, a);
  ctx.drawImage(glowSprite(color, R), x - R, y - R);
  ctx.globalAlpha = pa;
}

// --- background tiles ---
function makeTiles() {
  const tiles = [];
  for (let v = 0; v < 6; v++) {
    const c = newCanvas(64, 64), x = c.getContext('2d');
    x.fillStyle = '#0e1022'; x.fillRect(0, 0, 64, 64);
    x.fillStyle = '#151933';
    x.fillRect(0, 0, 64, 1); x.fillRect(0, 0, 1, 64); x.fillRect(0, 32, 64, 1); x.fillRect(32, 0, 1, 64);
    x.fillStyle = '#1d2446';
    x.fillRect(0, 0, 2, 2); x.fillRect(31, 31, 3, 3);
    let seed = v * 9301 + 49297;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    if (v > 0) {
      x.fillStyle = '#19203f';
      for (let t = 0; t < 2 + v % 3; t++) {
        let px = 4 + (rnd() * 56) | 0, py = 4 + (rnd() * 56) | 0;
        const len = 6 + (rnd() * 14) | 0; let dir = rnd() < 0.5;
        for (let i = 0; i < len; i++) { x.fillRect(px, py, 1, 1); if (dir) px++; else py++; if (i === (len >> 1)) dir = !dir; }
        x.fillStyle = v === 3 ? '#2b3a78' : '#222b55'; x.fillRect(px - 1, py - 1, 3, 3); x.fillStyle = '#19203f';
      }
    }
    if (v === 5) { x.fillStyle = '#12152c'; x.fillRect(8, 40, 14, 14); x.fillStyle = '#1b2143'; x.fillRect(10, 42, 10, 1); x.fillRect(10, 46, 7, 1); x.fillRect(10, 50, 9, 1); }
    tiles.push(c);
  }
  return tiles;
}

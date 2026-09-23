# 终焉防火墙 LAST FIREWALL — project notes

Pixel-art survival bullet-hell shooter. Plain static site (no build): `index.html`, `style.css`, `src/{audio,sprites,game}.js`, `assets/` (Fusion Pixel 12px font, OFL).

- Game renders at 480x270 on a canvas; `#wrap` (canvas + DOM overlays) is CSS-scaled as a whole, so UI is laid out in game pixels. Pixel font sizes must be 12/24/36.
- `src/sprites.js`: palette-string sprites; `src/audio.js`: WebAudio synth SFX + chiptune BGM; `src/game.js`: everything else (upgrades in `UPG`, enemies in `ETYPES`, bosses in `BOSSES`, spawn curve in `director`/`spawnEnemy`).
- Controls: no keyboard movement. Mouse position relative to screen center steers the hero (`MOVE_DEAD`/`MOVE_RAMP`); aiming is always auto-lock nearest (`G.target`). Touch = floating joystick anywhere; `touchMode` flips on pointer type.
- Keys: Space/Shift dash, right click/E overdrive, left click does nothing in play. Upgrade cards: `UP_ARM` ms lockout, pointer press must start after arming, touch needs select-then-confirm.
- Late-game readability LOD (keep when adding effects): hit flash & damage numbers throttle when `G.enemies.length > 90`, small 爆裂弹 explosions are quiet ring-only (max 2/step), halos/glows skip above bullet-count thresholds, frequent notices use `toast()` not `banner()`.
- Bullet readability rule: friendly = cyan/white/gold streaks (drawn under enemies), hostile = `HOSTILE` red/pink/purple outlined orbs (drawn on top). Keep new colors inside these families.
- Debug URL params: `?bot=1` (auto-play), `&fast=N` (N× sim speed), `&god=1`, `&loop=1`. `window.__dbg` exposes `G`, `state`, `spawnBoss`, `activateOverdrive`.

## Commands
- Local: `python3 -m http.server 8777` → http://localhost:8777/
- Playtest harness (gitignored, `.dev/`, uses playwright-core + cached headless shell): `cd .dev && node playtest.mjs bot 6 200` (balance log), `node playtest.mjs shots|run|mobile` (screenshots into `.dev/shots/`)
- Deploy: push to `main` of GordenSun/last-firewall → GitHub Pages (branch main, root).

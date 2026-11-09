// بوابات الإجابات، العملات، العوائق
import * as THREE from 'three';
import { canvasTex, FONT } from './util.js';
import { LANES, PW } from './world.js';

export const LETTERS = ['أ', 'ب', 'ج', 'د'];
const GATE_COLS = ['#e8673a', '#1e9bb5', '#7a52c9', '#2fae5c'];

function wrapLines(c, text, maxW) {
  const words = String(text).split(/\s+/), lines = []; let cur = '';
  words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; });
  if (cur) lines.push(cur); return lines;
}
export function panelTex(letter, text, col) {
  return canvasTex(512, 440, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 440); g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#f3e6cb'); c.fillStyle = g;
    c.beginPath(); c.roundRect(6, 6, 500, 428, 40); c.fill();
    c.lineWidth = 14; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; c.beginPath(); c.roundRect(176, -10, 160, 104, 30); c.fill();
    c.fillStyle = '#fff'; c.font = `900 78px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letter, 256, 48);
    c.fillStyle = '#1f2140'; c.direction = 'rtl';
    let size = 120, lines; for (; size >= 44; size -= 6) { c.font = `900 ${size}px ${FONT}`; lines = wrapLines(c, String(text).replace(/[.。]$/, ''), 460); if (lines.length * size * 1.1 <= 300 && lines.length <= 3) break; }
    const y0 = 272 - (lines.length - 1) * size * 1.1 / 2; lines.forEach((l, i) => c.fillText(l, 256, y0 + i * size * 1.1));
  });
}
// بوابة كبيرة على عرض الممشى؛ opts: نصوص الخيارات (2 أو 4)
export function buildGate(opts) {
  const g = new THREE.Group(), u = g.userData;
  const stone = new THREE.MeshStandardMaterial({ color: 0xe9d6b0, roughness: .85 }), trim = new THREE.MeshStandardMaterial({ color: 0xb5543a, roughness: .7 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xe8c45a, metalness: .8, roughness: .3 });
  const H = 5.6, n = opts.length, span = PW * 2 + .6, w = span / n;
  // الأعمدة على الطرفين وبين الفتحات
  for (let k = 0; k <= n; k++) {
    const x = PW + .3 - k * w;
    const col = new THREE.Mesh(new THREE.BoxGeometry(.42, H, .5), stone); col.position.set(x, H / 2, 0); col.castShadow = true; g.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(.6, .25, .7), trim); cap.position.set(x, H + .1, 0); g.add(cap);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(span + .6, .9, .7), stone); beam.position.set(0, H + .55, 0); beam.castShadow = true; g.add(beam);
  const band = new THREE.Mesh(new THREE.BoxGeometry(span + .62, .16, .72), trim); band.position.set(0, H + .2, 0); g.add(band);
  // شرفات مسنّنة عُمانية فوق العارضة
  for (let k = 0; k < 14; k++) { const m = new THREE.Mesh(new THREE.ConeGeometry(.24, .6, 4), stone); m.rotation.y = Math.PI / 4; m.position.set(-span / 2 + .3 + k * (span / 13), H + 1.3, 0); g.add(m); }
  const orb = new THREE.Mesh(new THREE.SphereGeometry(.25, 14, 10), gold); orb.position.set(0, H + 1.75, 0); g.add(orb);
  // لافتة الخيار وستارة الضوء لكل فتحة
  u.panels = []; u.curtains = []; u.lanes = [];
  opts.forEach((t, i) => {
    const x = PW + .3 - (i + .5) * w;
    const pt = panelTex(LETTERS[i] || '', t, GATE_COLS[i % 4]);
    const pw = Math.min(w - .4, 2.3), ph = pw * .86;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: pt, roughness: .6, emissive: 0xffffff, emissiveMap: pt, emissiveIntensity: .35 }));
    p.position.set(x, H - ph / 2 - .05, .37); g.add(p); u.panels.push(p);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), stone); back.position.set(x, H - ph / 2 - .05, .36); back.rotation.y = Math.PI; g.add(back);
    const cc = canvasTex(64, 256, (c) => { const gr = c.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.6, GATE_COLS[i % 4] + '55'); gr.addColorStop(1, GATE_COLS[i % 4] + 'aa'); c.fillStyle = gr; c.fillRect(0, 0, 64, 256); });
    const cu = new THREE.Mesh(new THREE.PlaneGeometry(w - .42, H - ph - .1), new THREE.MeshBasicMaterial({ map: cc, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    cu.position.set(x, (H - ph - .1) / 2, 0); g.add(cu); u.curtains.push(cu); u.lanes.push(x);
  });
  return g;
}
export function coinGeo() { return new THREE.CylinderGeometry(.32, .32, .07, 28).rotateX(Math.PI / 2); }
export function coinMat() {
  const t = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(54, 50, 6, 64, 64, 64); g.addColorStop(0, '#fff3b0'); g.addColorStop(.6, '#f2c13a'); g.addColorStop(1, '#b8861a'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); c.strokeStyle = '#a8761a'; c.lineWidth = 8; c.beginPath(); c.arc(64, 64, 48, 0, 7); c.stroke(); c.fillStyle = '#a8761a'; c.font = `900 60px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('★', 64, 68); });
  return [new THREE.MeshStandardMaterial({ color: 0xd9a52a, metalness: .9, roughness: .25 }), new THREE.MeshStandardMaterial({ map: t, metalness: .7, roughness: .3 }), new THREE.MeshStandardMaterial({ map: t, metalness: .7, roughness: .3 })];
}
// عائق: عربة خضار خشبية أو حاجز مخطط (يُقفز فوقه)
export function buildObstacle(kind = 0) {
  const g = new THREE.Group();
  if (kind === 0) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a34, roughness: .8 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, .45, .9), wood); box.position.y = .6; box.castShadow = true; g.add(box);
    [-1, 1].forEach(s => { const wh = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .08, 14), new THREE.MeshStandardMaterial({ color: 0x3a2618 })); wh.rotation.z = Math.PI / 2; wh.position.set(s * .8, .28, 0); g.add(wh); });
    const cols = [0xe8462a, 0xf2a23a, 0x7cbf3a, 0xffd23f];
    for (let i = 0; i < 9; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), new THREE.MeshStandardMaterial({ color: cols[i % 4], roughness: .5 })); f.position.set(-.5 + (i % 3) * .5, .9, -.25 + Math.floor(i / 3) * .25); g.add(f); }
  } else {
    const st = canvasTex(256, 64, (c) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8322a'; c.beginPath(); c.moveTo(i * 40 - 20, 64); c.lineTo(i * 40 + 20, 0); c.lineTo(i * 40 + 60, 0); c.lineTo(i * 40 + 20, 64); c.fill(); } });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, .32, .12), new THREE.MeshStandardMaterial({ map: st, roughness: .6 })); bar.position.y = .7; bar.castShadow = true; g.add(bar);
    [-1, 1].forEach(s => { const l = new THREE.Mesh(new THREE.BoxGeometry(.1, .7, .5), new THREE.MeshStandardMaterial({ color: 0x555a60 })); l.position.set(s * .7, .35, 0); g.add(l); });
  }
  return g;
}
export { LANES };

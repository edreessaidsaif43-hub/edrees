// حلقات الأسئلة، النجوم، النوارس، الغيوم، المنطاد
import * as THREE from 'three';
import { canvasTex, FONT, rnd } from './util.js';
import { toon, outline } from './toon.js';

export const LETTERS = ['أ', 'ب', 'ج', 'د'];
export const RCOLS = ['#ff8a3c', '#2bb6d9', '#a07bff', '#3fd17a'];
function wrapLines(c, text, maxW) { const words = String(text).split(/\s+/), lines = []; let cur = ''; words.forEach(w => { const t = cur ? cur + ' ' + w : w; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }); if (cur) lines.push(cur); return lines; }
export function panelTex(letter, text, col) {
  return canvasTex(640, 300, (c) => {
    c.fillStyle = 'rgba(14,18,40,.88)'; c.beginPath(); c.roundRect(8, 8, 624, 284, 44); c.fill();
    c.lineWidth = 10; c.strokeStyle = col; c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(78, 150, 50, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = `900 64px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(letter, 78, 156);
    c.direction = 'rtl'; c.textAlign = 'center';
    let size = 88, lines; for (; size >= 36; size -= 6) { c.font = `900 ${size}px ${FONT}`; lines = wrapLines(c, String(text).replace(/[.]$/, ''), 470); if (lines.length * size * 1.12 <= 240 && lines.length <= 3) break; }
    const y0 = 152 - (lines.length - 1) * size * 1.12 / 2; lines.forEach((l, i) => c.fillText(l, 375, y0 + i * size * 1.12));
  });
}
// حلقة ذهبية بخيار؛ يطير الطالب عبرها
export function buildRing(letter, text, colHex, R = 4.6) {
  const g = new THREE.Group();
  const gold = toon(0xffd21a, { emissive: new THREE.Color(colHex), emissiveIntensity: .35 });
  const tor = new THREE.Mesh(new THREE.TorusGeometry(R, .42, 20, 64), gold); g.add(tor);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(R - .5, .1, 8, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(colHex), toneMapped: false })); g.add(inner);
  // ستارة ضوئية شفافة داخل الحلقة
  const ft = canvasTex(128, 128, (c) => { const gr = c.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.75, colHex + '22'); gr.addColorStop(1, colHex + '88'); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); });
  const film = new THREE.Mesh(new THREE.CircleGeometry(R - .3, 48), new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); g.add(film);
  const pt = panelTex(letter, text, colHex);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(8.5, 4), new THREE.MeshBasicMaterial({ map: pt, transparent: true, toneMapped: false, side: THREE.DoubleSide })); panel.position.y = R + 2.6; g.add(panel);
  outline(tor, .09, 0x6a3a10);
  g.userData = { tor, film, panel, inner, R };
  return g;
}
// نجمة ذهبية للجمع
export function starGeo() {
  const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 + Math.PI / 2, r = i % 2 ? .45 : 1; const x = Math.cos(a) * r, y = Math.sin(a) * r; i ? s.lineTo(x, y) : s.moveTo(x, y); } s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: .25, bevelEnabled: true, bevelThickness: .12, bevelSize: .1, bevelSegments: 3 }); g.center(); return g;
}
export const starMat = () => toon(0xffd83a, { emissive: 0xffa000, emissiveIntensity: .35 });
// نورس بجناحين يرفرفان
export function buildGull() {
  const g = new THREE.Group(), w = toon(0xffffff, { side: THREE.DoubleSide }), gy = toon(0x5a6a80, { side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.13, .5, 4, 10), w); body.rotation.x = Math.PI / 2; g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), w); head.position.set(0, .06, -.38); g.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.03, .14, 6), toon(0xffa020)); beak.rotation.x = -Math.PI / 2; beak.position.set(0, .05, -.52); g.add(beak);
  const wings = [-1, 1].map(s => { const pv = new THREE.Group(); pv.position.set(s * .1, .05, -.05); const sh = new THREE.Shape(); sh.moveTo(0, -.15); sh.lineTo(s * .55, -.1); sh.lineTo(s * 1.05, .08); sh.lineTo(s * .5, .18); sh.lineTo(0, .2); sh.closePath(); const m = new THREE.Mesh(new THREE.ShapeGeometry(sh), w); m.rotation.x = -Math.PI / 2; pv.add(m); const tip = new THREE.Mesh(new THREE.PlaneGeometry(.35, .22), gy); tip.rotation.x = -Math.PI / 2; tip.position.set(s * .88, 0, -.03); pv.add(tip); g.add(pv); return pv; });
  g.userData = { wings, ph: Math.random() * 6 };
  return g;
}
export function flapGull(g, t) { const a = Math.sin(t * 7 + g.userData.ph) * .55; g.userData.wings[0].rotation.z = -a; g.userData.wings[1].rotation.z = a; }
// غيمة كرتونية منفوخة: كرات بيضاء مدمجة بقاعدة مسطحة
const cloudMat = () => toon(0xffffff, { emissive: 0xd8ecff, emissiveIntensity: .35 });
export function buildCloud(r, scale = 1) {
  const g = new THREE.Group(), m = cloudMat(), n = 6 + (r() * 5 | 0), geos = [];
  for (let i = 0; i < n; i++) { const rr = (7 + r() * 8) * (i === 0 || i === n - 2 ? 1.5 : 1); const s = new THREE.SphereGeometry(rr, 20, 14); s.scale(1, .82, 1); s.translate((i - n / 2) * 7 + (r() - .5) * 4, rr * .35 + (i % 2) * 3, (r() - .5) * 10); geos.push(s); }
  geos.forEach(s => { const mesh = new THREE.Mesh(s, m); mesh.castShadow = false; g.add(mesh); });
  g.scale.setScalar(scale);
  return g;
}
// منطاد بألوان زاهية (عائق)
export function buildBalloon(cols = ['#ff2d55', '#ffffff', '#00c853', '#ffd21a']) {
  const g = new THREE.Group();
  const t = canvasTex(512, 256, (c) => { const w = 512 / 12; for (let i = 0; i < 12; i++) { c.fillStyle = cols[i % cols.length]; c.fillRect(i * w, 0, w + 1, 256); } });
  const env = new THREE.Mesh(new THREE.SphereGeometry(5, 36, 24), toon(0xffffff, { map: t })); env.scale.y = 1.18; env.position.y = 7; env.castShadow = true; g.add(env);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, .8, 2.2, 24, 1, true), toon(0xffffff, { map: t, side: THREE.DoubleSide })); neck.position.y = 1.8; g.add(neck);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1, 1.3), toon(0xb07038)); basket.position.y = -1.3; g.add(basket);
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .78; const rope = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 2.3, 4), toon(0x3a2a1a)); rope.position.set(Math.cos(a) * .7, -.15, Math.sin(a) * .7); rope.rotation.set(Math.sin(a) * .2, 0, -Math.cos(a) * .2); g.add(rope); }
  outline(g, .12);
  return g;
}

// بريق متلألئ حول الحلقات والنجوم
let spT = null;
export function sparkles(n = 40, spread = 8, col = 0xfff2a0) {
  if (!spT) spT = canvasTex(64, 64, (c) => { c.translate(32, 32); const g = c.createRadialGradient(0, 0, 0, 0, 0, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(-32, -32, 64, 64); c.fillStyle = '#fff'; c.fillRect(-1.5, -30, 3, 60); c.fillRect(-30, -1.5, 60, 3); });
  const pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = spread * (.7 + Math.random() * .5); pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = Math.sin(a) * r; pos[i * 3 + 2] = (Math.random() - .5) * 2; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ map: spT, size: 1.4, color: col, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
}

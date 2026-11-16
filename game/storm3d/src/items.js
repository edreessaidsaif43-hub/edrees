// منحدرات القفز، التمور، الجِمال والمها، الزوابع، ورذاذ الرمل
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from './util.js';
import { toon, outline } from './toon.js';
import { panelTex } from './props.js';

export const RAMP_LEN = 12, RAMP_H = 3.2;
export const rampY = (zl, len = RAMP_LEN, h = RAMP_H) => zl >= len ? 0 : h * Math.pow(1 - Math.max(0, zl) / len, 1.6);
// منحدر قفز خشبي ملوّن فوقه لوحة الخيار؛ يبدأ عند z=+len وينتهي بحافة القفز عند z=0
export function buildRamp(letter, text, colHex, w = 6.2) {
  const g = new THREE.Group(), u = g.userData, len = RAMP_LEN, h = RAMP_H, col = new THREE.Color(colHex);
  const s = new THREE.Shape(); s.moveTo(len, -2.5); for (let i = 0; i <= 12; i++) { const zl = len * (1 - i / 12); s.lineTo(zl, rampY(zl)); } s.lineTo(0, -2.5); s.closePath();
  const wg = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); wg.rotateY(-Math.PI / 2); wg.translate(w / 2, 0, 0);
  const wedge = new THREE.Mesh(wg, toon(col.clone().multiplyScalar(.82))); wedge.castShadow = true; wedge.receiveShadow = true;
  const body = new THREE.Group(); body.add(wedge); g.add(body);
  const tt = canvasTex(128, 256, (c) => { c.fillStyle = '#f4dcae'; c.fillRect(0, 0, 128, 256); c.strokeStyle = 'rgba(120,70,30,.35)'; c.lineWidth = 3; for (let y = 0; y < 256; y += 32) { c.beginPath(); c.moveTo(0, y); c.lineTo(128, y); c.stroke(); } c.fillStyle = colHex; for (let k = 0; k < 4; k++) { const y = 30 + k * 62; c.beginPath(); c.moveTo(18, y + 30); c.lineTo(64, y); c.lineTo(110, y + 30); c.lineTo(110, y + 48); c.lineTo(64, y + 18); c.lineTo(18, y + 48); c.closePath(); c.fill(); } c.fillStyle = colHex; c.fillRect(0, 0, 10, 256); c.fillRect(118, 0, 10, 256); });
  const tp = new THREE.PlaneGeometry(w - .1, len, 1, 12); tp.rotateX(-Math.PI / 2); tp.translate(0, 0, len / 2);
  { const p = tp.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, rampY(p.getZ(i)) + .04); tp.computeVertexNormals(); }
  const top = new THREE.Mesh(tp, toon(0xffffff, { map: tt })); top.receiveShadow = true; top.userData.noOut = 1; body.add(top);
  // عمودا اللوحة واللوحة نفسها
  const pm = toon(0xfafaf6), ph = h + 7.4, pw = w + .9, phh = pw * 300 / 640;
  [-1, 1].forEach(sx => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, ph + 2, 8), pm); p.position.set(sx * (w / 2 + .1), ph / 2 - 1, .2); p.castShadow = true; g.add(p); const b = new THREE.Mesh(new THREE.SphereGeometry(.24, 10, 8), toon(col)); b.position.set(sx * (w / 2 + .1), ph + .1, .2); g.add(b); });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(pw, phh), new THREE.MeshBasicMaterial({ map: panelTex(letter, text, colHex), transparent: true, toneMapped: false })); panel.position.set(0, ph - phh / 2 + .1, .2); g.add(panel);
  const bk = new THREE.Mesh(new THREE.PlaneGeometry(pw - .3, phh - .3), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(.55) })); bk.rotation.y = Math.PI; bk.position.z = -.02; panel.add(bk);
  outline(wedge, .05, 0x5a3418);
  Object.assign(u, { body, wedge, top, panel, w });
  return g;
}
// تلّة رملية صغيرة للقفز الحر
export function buildKicker(w = 30) {
  const len = 7, h = 1.25, s = new THREE.Shape(); s.moveTo(len, -1.5); for (let i = 0; i <= 8; i++) { const zl = len * (1 - i / 8); s.lineTo(zl, rampY(zl, len, h)); } s.lineTo(-1.2, -1.5); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); g.rotateY(-Math.PI / 2); g.translate(w / 2, 0, 0);
  const m = new THREE.Mesh(g, toon(0xf7c264)); m.receiveShadow = true; m.userData.noOut = 1;
  const gr = new THREE.Group(); gr.add(m);
  const st = new THREE.Mesh(new THREE.BoxGeometry(w, .08, .5), toon(0xff7a1a)); st.position.set(0, h + .02, .25); st.userData.noOut = 1; gr.add(st);
  gr.userData = { len, h };
  return gr;
}
// عنقود تمر للجمع
let dateG = null;
export function dateGeo() {
  if (dateG) return dateG;
  const parts = []; [[0, 0, 0], [.34, .12, .05], [-.32, .1, -.05], [.05, .42, 0]].forEach(([x, y, z]) => { const s = new THREE.SphereGeometry(.3, 12, 10); s.scale(.72, 1.15, .72); s.rotateZ(x * .8); s.translate(x, y, z); parts.push(s); });
  dateG = mergeGeometries(parts); return dateG;
}
export const dateMat = () => toon(0xc8641e, { emissive: 0xff8a1a, emissiveIntensity: .45 });

// ---------- الحيوانات ----------
function legs(g, mat, list, hgt, rad) { const out = []; list.forEach(([x, z]) => { const pv = new THREE.Group(); pv.position.set(x, hgt, z); const l = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad * .7, hgt, 8), mat); l.position.y = -hgt / 2; l.castShadow = true; pv.add(l); g.add(pv); out.push(pv); }); return out; }
export function buildCamel() {
  const g = new THREE.Group(), fur = toon(0xdcab6c), drk = toon(0xb9854a);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 14), fur); body.scale.set(.78, .8, 1.5); body.position.y = 2.25; body.castShadow = true; g.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(.62, 14, 10), fur); hump.scale.set(.9, 1.1, 1); hump.position.set(0, 3.05, .1); hump.castShadow = true; g.add(hump);
  const rug = new THREE.Mesh(new THREE.SphereGeometry(.66, 14, 10, 0, Math.PI * 2, 0, Math.PI * .55), toon(0xc8202a)); rug.scale.set(1.25, 1.12, 1.3); rug.position.set(0, 3.0, .1); g.add(rug);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.26, 1.5, 6, 12), fur); neck.position.set(0, 3.15, -1.55); neck.rotation.x = -.55; neck.castShadow = true; g.add(neck);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .55, 6, 12), fur); head.rotation.x = Math.PI / 2 - .15; head.position.set(0, 4.05, -2.2); head.castShadow = true; g.add(head);
  const muz = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), drk); muz.position.set(0, 3.93, -2.62); g.add(muz);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(.05, 8, 6), toon(0x1a1a1a)); e.position.set(s * .22, 4.15, -2.3); e.userData.noOut = 1; g.add(e); const ear = new THREE.Mesh(new THREE.ConeGeometry(.08, .2, 6), fur); ear.position.set(s * .2, 4.35, -1.98); g.add(ear); });
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(.04, .06, 1.1, 6), drk); tail.position.set(0, 2.0, 1.5); tail.rotation.x = .3; g.add(tail);
  const lg = legs(g, fur, [[-.42, -1.0], [.42, -1.0], [-.42, 1.0], [.42, 1.0]], 1.85, .17);
  outline(g, .03); g.userData = { legs: lg, r: 2.4, h: 2.2 };
  return g;
}
export function buildOryx() {
  const g = new THREE.Group(), wht = toon(0xfafaf4), blk = toon(0x2a2422);
  const body = new THREE.Mesh(new THREE.SphereGeometry(.7, 16, 12), wht); body.scale.set(.75, .8, 1.5); body.position.y = 1.35; body.castShadow = true; g.add(body);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .6, 6, 10), wht); neck.position.set(0, 1.8, -.95); neck.rotation.x = -.7; g.add(neck);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(.19, .4, 6, 10), wht); head.rotation.x = Math.PI / 2 + .5; head.position.set(0, 2.1, -1.35); g.add(head);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), blk); mask.scale.set(1, .7, 1.4); mask.position.set(0, 2.02, -1.5); mask.userData.noOut = 1; g.add(mask);
  [-1, 1].forEach(s => { const h = new THREE.Mesh(new THREE.CylinderGeometry(.015, .04, 1.5, 6), blk); h.position.set(s * .1, 2.9, -1.0); h.rotation.x = .45; h.userData.noOut = 1; g.add(h); });
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(.03, .04, .7, 6), blk); tail.position.set(0, 1.2, 1.05); tail.rotation.x = .3; tail.userData.noOut = 1; g.add(tail);
  const lg = legs(g, blk, [[-.3, -.7], [.3, -.7], [-.3, .7], [.3, .7]], 1.05, .09);
  outline(g, .025); g.userData = { legs: lg, r: 1.5, h: 1.4 };
  return g;
}
export function animWalk(a, t, f = 6) { a.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * f + (i === 0 || i === 3 ? 0 : Math.PI)) * .5; }); }
// زوبعة رملية صغيرة
export function buildDevil() {
  const g = new THREE.Group(), rings = [];
  for (let i = 0; i < 9; i++) { const k = i / 8, r = .5 + k * k * 2.6, m = new THREE.Mesh(new THREE.TorusGeometry(r, .22 + k * .35, 6, 18), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe9bf82 : 0xd49a58, transparent: true, opacity: .62, depthWrite: false })); m.rotation.x = Math.PI / 2; m.position.y = .4 + k * 6.5; m.userData.ph = i; g.add(m); rings.push(m); }
  g.userData = { rings, r: 2.6 };
  return g;
}
export function animDevil(d, t) { d.userData.rings.forEach((r, i) => { r.position.x = Math.sin(t * 5 + i * .7) * (.15 + i * .09); r.position.z = Math.cos(t * 5 + i * .7) * (.15 + i * .09); r.rotation.z = t * 6 + i; }); }

// ---------- رذاذ الرمل خلف العجلات ----------
export function makeSpray(S, n = 320, size = 1.5, hex = 0xf6cf8a) {
  const tex = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.6, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const pos = new Float32Array(n * 3).fill(-9999), vel = new Float32Array(n * 3), life = new Float32Array(n), geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: tex, size, color: hex, transparent: true, opacity: .85, depthWrite: false })); pts.frustumCulled = false; S.add(pts);
  let k = 0;
  return {
    pts,
    emit(p, v, spread, count) { for (let i = 0; i < count; i++) { const j = k * 3; pos[j] = p.x + (Math.random() - .5) * spread; pos[j + 1] = p.y + Math.random() * .3; pos[j + 2] = p.z + (Math.random() - .5) * spread; vel[j] = v.x + (Math.random() - .5) * 4; vel[j + 1] = v.y * (.5 + Math.random()); vel[j + 2] = v.z + (Math.random() - .5) * 4; life[k] = .5 + Math.random() * .6; k = (k + 1) % n; } },
    update(dt) { for (let i = 0; i < n; i++) { if (life[i] <= 0) continue; life[i] -= dt; const j = i * 3; if (life[i] <= 0) { pos[j + 1] = -9999; continue; } vel[j + 1] -= 9 * dt; pos[j] += vel[j] * dt; pos[j + 1] += vel[j + 1] * dt; pos[j + 2] += vel[j + 2] * dt; } geo.attributes.position.needsUpdate = true; },
    clear() { pos.fill(-9999); life.fill(0); geo.attributes.position.needsUpdate = true; }
  };
}

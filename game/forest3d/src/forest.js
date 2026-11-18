// غابة ظفار في الخريف: مرج أخضر، بركة وشلال، أشجار التين والباوباب واللبان، جبال يلفّها الضباب
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, rnd } from './util.js';
import { toon, outline } from './toon.js';
import { fbm, smooth } from './sky.js';

export const POND = { x: -10, z: -6, r: 7.2 };
export const CLIFF = { x: -15, z: -17.5 };
// ارتفاع الأرض
export function heightAt(x, z) {
  let h = 1.6 * (fbm(x / 22 + 3, z / 22 + 7, 3) - .5) + .9 * smooth(-6, -40, z) * (fbm(x / 12, z / 12, 3) * 2.2);
  h += 5 * smooth(-30, -48, z) + 3 * smooth(18, 34, Math.abs(x)) * smooth(-2, -30, z);
  const dp = Math.hypot((x - POND.x) / 1.25, z - POND.z);
  h = THREE.MathUtils.lerp(h, -.9, 1 - smooth(POND.r - 1.2, POND.r + 2.5, dp));
  return h;
}
// ---------- دمج مجسّمات بألوان الرؤوس ----------
export function mg(parts) {
  return mergeGeometries(parts.map(([g, hex]) => { if (g.index) g = g.toNonIndexed(); const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); if (g.attributes.uv) g.deleteAttribute('uv'); return g; }));
}
export const vmat = () => toon(0xffffff, { vertexColors: true });
export function inst(S, geom, list, shadow, mat) {
  const m = new THREE.InstancedMesh(geom, mat || vmat(), list.length), M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach(([x, y, z, sc, ry], i) => { e.set(0, ry || 0, 0); q.setFromEuler(e); v.set(x, y, z); s.setScalar(sc || 1); M4.compose(v, q, s); m.setMatrixAt(i, M4); });
  m.castShadow = !!shadow; m.receiveShadow = true; m.userData.noOut = 1; S.add(m); return m;
}

// ---------- الأرض ----------
export function grassTex() {
  const t = canvasTex(256, 256, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) { const x = Math.random() * 256, y = Math.random() * 256, a = .08 + Math.random() * .12; c.strokeStyle = Math.random() < .5 ? `rgba(30,110,40,${a})` : `rgba(255,255,200,${a})`; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (Math.random() - .5) * 4, y - 5 - Math.random() * 5); c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function buildGround(S, Q) {
  const g = new THREE.PlaneGeometry(150, 130, Q.low ? 90 : 150, Q.low ? 80 : 130); g.rotateX(-Math.PI / 2); g.translate(0, 0, -35);
  const p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const cA = new THREE.Color(0x5fd04a), cB = new THREE.Color(0x8ee05a), cC = new THREE.Color(0x3fb24a), cMud = new THREE.Color(0xc8b07a), cPath = new THREE.Color(0xe8d49a);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = heightAt(x, z); p.setY(i, h); uv.setXY(i, x / 6, z / 6);
    const n = fbm(x / 9, z / 9, 3);
    c.copy(cA).lerp(cB, smooth(.45, .7, n)).lerp(cC, smooth(.5, .2, n) * .7);
    const dp = Math.hypot((x - POND.x) / 1.25, z - POND.z); c.lerp(cMud, (1 - smooth(POND.r - .4, POND.r + .9, dp)) * .9);
    // درب ترابي صغير يعبر المرج
    const px = 6 + Math.sin(z / 9) * 3; c.lerp(cPath, (1 - smooth(.6, 1.9, Math.abs(x - px))) * smooth(16, 4, z) * smooth(-30, -18, z) * .85);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  const m = new THREE.Mesh(g, toon(0xffffff, { vertexColors: true, map: grassTex() })); m.receiveShadow = true; m.userData.noOut = 1; S.add(m);
  return m;
}

// ---------- البركة والشلال ----------
export function buildPond(S, Q) {
  const g = new THREE.Group(); S.add(g);
  const wt = canvasTex(512, 512, (c) => { const gr = c.createRadialGradient(256, 256, 40, 256, 256, 256); gr.addColorStop(0, '#2fc8e8'); gr.addColorStop(.75, '#38d4ec'); gr.addColorStop(1, '#8ff0f4'); c.fillStyle = gr; c.fillRect(0, 0, 512, 512); c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 5; for (let i = 0; i < 14; i++) { const x = 60 + Math.random() * 390, y = 60 + Math.random() * 390, w = 20 + Math.random() * 40; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - 6, x + w, y); c.stroke(); } });
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), toon(0xffffff, { map: wt, transparent: true, opacity: .93, emissive: 0x0a5a70, emissiveIntensity: .25 }));
  water.rotation.x = -Math.PI / 2; water.scale.set(POND.r * 1.25 + .6, POND.r + .6, 1); water.position.set(POND.x, -.05, POND.z); water.receiveShadow = true; water.userData.noOut = 1; g.add(water);
  // حلقات تموّج
  const rings = []; const rt = canvasTex(128, 128, (c) => { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 6; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.stroke(); });
  for (let i = 0; i < 5; i++) { const r = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.userData = { t: i / 5, noOut: 1 }; g.add(r); rings.push(r); }
  // زنابق الماء
  const lily = mg([[new THREE.CircleGeometry(.55, 14, .3, Math.PI * 2 - .6).rotateX(-Math.PI / 2), 0x2fa84a]]);
  const lilies = []; for (let i = 0; i < 9; i++) { const a = i * 2.4, rr = 2.5 + (i % 3) * 1.4; lilies.push([POND.x + Math.cos(a) * rr * 1.2, .0, POND.z + Math.sin(a) * rr * .8, .8 + (i % 2) * .5, a]); }
  inst(g, lily, lilies, false);
  const fl = mg([[new THREE.SphereGeometry(.2, 8, 6).scale(1, .6, 1), 0xff8fc0], [new THREE.SphereGeometry(.08, 6, 4).translate(0, .1, 0), 0xffe040]]);
  inst(g, fl, lilies.filter((_, i) => i % 3 === 0).map(l => [l[0] + .1, .08, l[2], 1, 0]), false);
  // القصب على الحافة
  const reed = mg([[new THREE.CylinderGeometry(.03, .05, 2.2, 5).translate(0, 1.1, 0), 0x4a9a3a], [new THREE.CapsuleGeometry(.08, .45, 3, 6).translate(0, 2.1, 0), 0x8a5a2a]]);
  const reeds = []; for (let i = 0; i < 40; i++) { const a = -.6 + Math.random() * 2.6 + (i % 2) * Math.PI * .9, rr = POND.r - .2 + Math.random() * .8; const x = POND.x + Math.cos(a) * rr * 1.25, z = POND.z + Math.sin(a) * rr; if (z > POND.z + 3) continue; reeds.push([x, heightAt(x, z) - .1, z, .7 + Math.random() * .6, Math.random() * 6]); }
  inst(g, reed, reeds, true);
  // الجرف والشلال
  const cliff = new THREE.Group(); cliff.position.set(CLIFF.x, 0, CLIFF.z); cliff.scale.setScalar(.82); g.add(cliff);
  const rock = [0x9a8e86, 0xa89c92, 0x8a7e78], moss = toon(0x58c048);
  const rk = (x, y, z, s, sy, i) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), toon(rock[i % 3])); m.scale.set(s, s * sy, s * .9); m.position.set(x, y, z); m.rotation.set(i, i * 2, 0); m.castShadow = true; m.receiveShadow = true; cliff.add(m); const t = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI * .32), moss); t.scale.set(s * 1.02, s * sy * 1.05, s * .92); t.position.copy(m.position); cliff.add(t); };
  [[-7, 3, 0, 5, 1.2], [-2.6, 5.5, -1, 4.2, 1.6], [3.4, 5.2, -1, 4.2, 1.6], [7.6, 3.2, 0, 5, 1.1], [-4.5, 9.5, -3, 4, 1], [5, 9.8, -3, 4.3, 1], [0, 12, -5, 5, 1], [-9.5, 6.5, -3, 4, 1.2], [10, 7, -4, 4.5, 1.2]].forEach((r, i) => rk(r[0], r[1], r[2], r[3], r[4], i));
  const ft = canvasTex(64, 256, (c) => { c.fillStyle = '#bff4ff'; c.fillRect(0, 0, 64, 256); for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(255,255,255,${.5 + Math.random() * .5})`; c.fillRect(Math.random() * 60, Math.random() * 256, 3 + Math.random() * 6, 20 + Math.random() * 50); } });
  ft.wrapS = ft.wrapT = THREE.RepeatWrapping; ft.repeat.set(2, 1.5);
  const fallG = new THREE.CylinderGeometry(1.5, 2.4, 13.5, 20, 6, true, -Math.PI / 2 - .9, 1.8); const fall = new THREE.Mesh(fallG, new THREE.MeshBasicMaterial({ map: ft, transparent: true, opacity: .92, side: THREE.DoubleSide, toneMapped: false }));
  fall.position.set(.3, 6.6, 4.9); fall.scale.set(1, 1, 1); fall.userData.noOut = 1; cliff.add(fall);
  // رذاذ أسفل الشلال
  const mist = []; const mt = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  for (let i = 0; i < 14; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: mt, transparent: true, depthWrite: false, opacity: .8 })); s.userData.ph = i / 14; cliff.add(s); mist.push(s); }
  return { water, rings, fall, ft, mist, mt };
}
export function animPond(P, t, dt) {
  P.ft.offset.y = -t * .9;
  P.rings.forEach((r, i) => { const k = (t * .25 + r.userData.t) % 1; if (k < .02) { const a = Math.random() * 6.28, rr = Math.random() * 4; r.userData.x = POND.x + Math.cos(a) * rr * 1.2; r.userData.z = POND.z + Math.sin(a) * rr * .7; } r.position.set(r.userData.x || POND.x, .02, r.userData.z || POND.z); r.scale.setScalar(.3 + k * 2.6); r.material.opacity = .7 * (1 - k); });
  P.mist.forEach(s => { const k = (t * .35 + s.userData.ph) % 1; s.position.set(.3 + Math.sin(s.userData.ph * 40) * 2.4, .4 + k * 3, 4.3 + Math.cos(s.userData.ph * 30)); s.scale.setScalar(1.4 + k * 3); s.material.opacity = .75 * (1 - k); });
}

// ---------- الأشجار ----------
export function figTree(r, s = 1) {
  const parts = [], h = 4.2 * s;
  const tr = new THREE.CylinderGeometry(.42 * s, .7 * s, h, 9); tr.translate(0, h / 2, 0); parts.push([tr, 0x8a5a3a]);
  for (let i = 0; i < 4; i++) { const a = i / 4 * 6.28 + r(), b = new THREE.CylinderGeometry(.12 * s, .26 * s, 2.6 * s, 6); b.translate(0, 1.3 * s, 0); b.rotateZ(.75); b.rotateY(a); b.translate(0, h * .78, 0); parts.push([b, 0x7a4e32]); }
  const greens = [0x2fa847, 0x45c25a, 0x5fd468, 0x3bb54f];
  for (let i = 0; i < 9; i++) { const a = i / 9 * 6.28 + r() * .6, d = (i ? 1.8 + r() * 1.2 : 0) * s, rr = (1.6 + r() * .9) * s, sp = new THREE.SphereGeometry(rr, 14, 10); sp.scale(1, .8, 1); sp.translate(Math.cos(a) * d, h + .9 * s + (i ? r() * 1.4 * s : 1.6 * s), Math.sin(a) * d); parts.push([sp, greens[i % 4]]); }
  return mg(parts);
}
function baobab(r, s = 1) {
  const parts = [], pts = [[0, 0], [1.5, 0], [1.6, .6], [1.45, 2], [1.1, 4], [.9, 5.4], [1.05, 6], [0, 6.1]].map(p => new THREE.Vector2(p[0] * s, p[1] * s));
  parts.push([new THREE.LatheGeometry(pts, 14), 0xb48a6a]);
  for (let i = 0; i < 6; i++) { const a = i / 6 * 6.28 + r() * .4, b = new THREE.CylinderGeometry(.1 * s, .3 * s, 2.4 * s, 6); b.translate(0, 1.2 * s, 0); b.rotateZ(.85); b.rotateY(a); b.translate(0, 5.9 * s, 0); parts.push([b, 0xa07a5c]); const c = new THREE.SphereGeometry(.9 * s, 10, 8); c.scale(1.2, .55, 1.2); c.translate(Math.cos(-a + Math.PI / 2) * 0 + Math.sin(a) * 1.9 * s, 7.4 * s, Math.cos(a) * 1.9 * s); parts.push([c, i % 2 ? 0x6ccc4e : 0x55b845]); }
  return mg(parts);
}
export function frank(r, s = 1) {
  const parts = []; let x = 0, y = 0, z = 0;
  for (let i = 0; i < 3; i++) { const dx = (r() - .5) * .8 * s, len = 1.1 * s, b = new THREE.CylinderGeometry(.13 * s, .2 * s, len, 6); const a = new THREE.Vector3(x, y, z), e = new THREE.Vector3(x + dx, y + len, z + (r() - .5) * .5 * s); b.translate(0, len / 2, 0); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.clone().sub(a).normalize()); b.applyQuaternion(q); b.translate(a.x, a.y, a.z); parts.push([b, 0xc8a88a]); x = e.x; y = e.y; z = e.z; }
  for (let i = 0; i < 6; i++) { const a = i * 1.1, c = new THREE.SphereGeometry(.55 * s, 9, 7); c.scale(1.3, .6, 1.3); c.translate(x + Math.cos(a) * 1.1 * s, y - .2 * s + (i % 3) * .3 * s, z + Math.sin(a) * 1.1 * s); parts.push([c, i % 2 ? 0x78c850 : 0x5aae42]); }
  return mg(parts);
}
export function bushG() { const parts = []; [[0, .5, 0, .9], [.8, .38, .3, .65], [-.75, .4, -.2, .7], [.2, .45, -.6, .6]].forEach(([x, y, z, rr], i) => { const s = new THREE.SphereGeometry(rr, 10, 8); s.translate(x, y, z); parts.push([s, [0x3aae48, 0x4cc458, 0x2f9e40, 0x5ad064][i]]); }); return mg(parts); }
function berryBush() { const parts = [[bushG(), 0x3aae48]]; return bushG(); }
export function grassG() { const parts = []; for (let i = 0; i < 6; i++) { const c = new THREE.ConeGeometry(.07, .7 + (i % 3) * .2, 3); c.translate(0, .35, 0); c.rotateZ((i - 2.5) * .18); c.rotateY(i * 1.1); parts.push([c, i % 2 ? 0x3fa83c : 0x6ccf4a]); } return mg(parts); }
export function flowerG(hex) { const parts = []; const st = new THREE.CylinderGeometry(.02, .025, .55, 4); st.translate(0, .27, 0); parts.push([st, 0x3a9a3a]); for (let i = 0; i < 5; i++) { const p = new THREE.SphereGeometry(.09, 6, 4); p.scale(1, .45, 1); p.translate(Math.cos(i * 1.256) * .1, .56, Math.sin(i * 1.256) * .1); parts.push([p, hex]); } const c = new THREE.SphereGeometry(.06, 6, 4); c.translate(0, .58, 0); parts.push([c, 0xffd21a]); return mg(parts); }
export function rockG() { const parts = []; [[0, .4, 0, .9], [.8, .25, .3, .55]].forEach(([x, y, z, rr], i) => { const s = new THREE.DodecahedronGeometry(rr, 0); s.scale(1.2, .75, 1); s.translate(x, y, z); parts.push([s, i ? 0xa49890 : 0x958a84]); }); return mg(parts); }
export function mtnG(r, w, h) {
  const g = new THREE.ConeGeometry(w, h, 16, 6); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (fbm(x / 8 + w, z / 8, 3) - .5) * .5; p.setXYZ(i, x * k, y * (y > 0 ? .85 + r() * .1 : 1), z * k); }
  g.translate(0, h / 2, 0); g.computeVertexNormals(); return g;
}

export function buildForest(S, Q) {
  const r = rnd(1977), g = new THREE.Group(); S.add(g); const sway = [];
  const tree = (geoF, x, z, s, rot) => { const m = new THREE.Mesh(geoF, vmat()); m.position.set(x, heightAt(x, z) - .2, z); m.rotation.y = rot || r() * 6.28; m.scale.setScalar(s); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
  // أشجار تؤطّر المشهد في المقدّمة
  const big1 = tree(figTree(r, 1.35), -22, 9, 1); const big2 = tree(figTree(r, 1.25), 23, 7, 1); sway.push(big1, big2);
  [[-30, -2, 1.1], [30, -6, 1.15], [-26, -14, 1], [25, -20, 1.05], [-35, 14, 1.2], [34, 13, 1.1], [-4, -30, 1], [10, -33, 1.1], [-20, -30, .95], [20, -38, 1], [-32, -28, 1], [33, -32, 1]].forEach(([x, z, s]) => sway.push(tree(figTree(r, s), x, z, 1)));
  tree(baobab(r, 1.2), 17, -12, 1, .4); tree(baobab(r, .9), -24, -22, 1);
  [[12, -4, 1], [-1, -17, .9], [16, 2, .8], [-18, 3, .85], [3, -24, .9], [-28, 4, .9], [28, -12, .85]].forEach(([x, z, s]) => tree(frank(r, s), x, z, 1));
  // شجيرات وأعشاب وزهور وصخور
  const bl = []; for (let i = 0; i < (Q.low ? 30 : 55); i++) { const x = (r() - .5) * 80, z = 16 - r() * 52; if (Math.abs(x) < 15 && z > -12 && z < 14) continue; if (Math.hypot((x - POND.x) / 1.25, z - POND.z) < POND.r + 1.5) continue; bl.push([x, heightAt(x, z) - .1, z, .8 + r() * .9, r() * 6]); }
  inst(g, bushG(), bl, true);
  const gl = []; for (let i = 0; i < (Q.low ? 260 : 600); i++) { const x = (r() - .5) * 70, z = 20 - r() * 45; if (Math.hypot((x - POND.x) / 1.25, z - POND.z) < POND.r) continue; gl.push([x, heightAt(x, z) - .05, z, .7 + r() * .8, r() * 6]); }
  inst(g, grassG(), gl, false);
  [0xff6fa8, 0xffffff, 0xffd23f, 0xb48aff, 0xff8a3c].forEach((hex, k) => { const fl = []; for (let i = 0; i < (Q.low ? 30 : 60); i++) { const cx = (r() - .5) * 50, cz = 14 - r() * 30; for (let j = 0; j < 3; j++) { const x = cx + (r() - .5) * 2, z = cz + (r() - .5) * 2; if (Math.hypot((x - POND.x) / 1.25, z - POND.z) < POND.r + .5) continue; fl.push([x, heightAt(x, z) - .03, z, .9 + r() * .6, r() * 6]); } } inst(g, flowerG(hex), fl, false); });
  const rl = []; [[9, 1, 1.4], [-15, 8, 1], [13, 9, 1.1], [-3, -11, .9], [20, -2, 1.2], [-20, -6, 1]].forEach(([x, z, s]) => rl.push([x, heightAt(x, z) - .15, z, s, r() * 6])); inst(g, rockG(), rl, true);
  // صخرة النمر وحافة الوعل
  const lr = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), toon(0xa89c92)); lr.scale.set(3.2, 1.2, 2.2); lr.position.set(11, heightAt(11, -5) + .5, -5); lr.castShadow = lr.receiveShadow = true; g.add(lr);
  const lt = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8, 0, 6.28, 0, .5), toon(0x58c048)); lt.scale.set(3.25, 1.25, 2.25); lt.position.copy(lr.position); g.add(lt);
  const ledge = new THREE.Group(); ledge.position.set(19, 0, -24); g.add(ledge);
  [[0, 3, 0, 4.2, 1.3], [-3.5, 1.6, 1, 3.4, 1], [3.6, 1.8, .5, 3.5, 1], [0, 6.4, -2, 3.6, 1.2]].forEach(([x, y, z, s, sy], i) => { const m = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 1), toon([0x9a8e86, 0xa89c92][i % 2])); m.scale.set(s, s * sy * .7, s * .8); m.position.set(x, y + heightAt(19, -24), z); m.castShadow = m.receiveShadow = true; ledge.add(m); const t = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, 6.28, 0, .42), toon(0x58c048)); t.scale.set(s * 1.02, s * sy * .72, s * .82); t.position.copy(m.position); ledge.add(t); });
  // الجبال البعيدة
  const mg2 = new THREE.Group(); g.add(mg2);
  [[-70, -95, 38, 34, 0x4fae6a], [-20, -110, 46, 42, 0x58b874], [35, -100, 42, 36, 0x4aa868], [80, -90, 34, 30, 0x55b470], [5, -135, 60, 55, 0x6ac08a], [-60, -140, 50, 48, 0x72c494], [70, -140, 52, 46, 0x6ec290]].forEach(([x, z, w, h, hex]) => { const m = new THREE.Mesh(mtnG(r, w, h), toon(hex)); m.position.set(x, -2, z); m.userData.noOut = 1; mg2.add(m); });
  outline(g, .04, 0x1f3a24);
  return { sway, ledgeTop: new THREE.Vector3(19, heightAt(19, -24) + 4.6, -24.5), leoRock: new THREE.Vector3(11, lr.position.y + 1.15, -5) };
}

// ---------- الضباب المتحرّك (ضباب الخريف) ----------
export function buildMist(S, Q) {
  const t = canvasTex(256, 128, (c) => { for (let i = 0; i < 9; i++) { const x = 30 + Math.random() * 196, y = 40 + Math.random() * 50, rr = 26 + Math.random() * 34, gr = c.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 256, 128); } });
  const list = []; for (let i = 0; i < (Q.low ? 7 : 14); i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, opacity: .55, fog: false })); const z = -40 - Math.random() * 70; s.position.set((Math.random() - .5) * 200, 6 + Math.random() * 18, z); s.scale.set(70 + Math.random() * 50, 18 + Math.random() * 10, 1); s.userData.v = .6 + Math.random() * 1.2; S.add(s); list.push(s); }
  return list;
}
export function animMist(list, dt) { list.forEach(s => { s.position.x += s.userData.v * dt; if (s.position.x > 120) s.position.x = -120; }); }

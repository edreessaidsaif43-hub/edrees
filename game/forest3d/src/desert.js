// رمال الشرقية: كثبان، أشجار، خيام، مخيم بدوي، وجدار العاصفة
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, rnd, FONT } from './util.js';
import { toon, outline } from './toon.js';
import { fbm, smooth } from './sky.js';

const n1 = (x, y) => fbm(x, y, 1) * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- هندسة المسار ----------
export function makeDesert(L) {
  const campD = L - 150;                       // مركز المخيم (مسافة من البداية)
  const amp = z => smooth(0, 300, -z) * (1 - smooth(L - 760, L - 430, -z));
  const corridorX = z => amp(z) * (38 * Math.sin(z / 260) + 22 * Math.sin(z / 117 + 1));
  const roll = z => amp(z) * (2.2 * Math.sin(z / 47) + 1.4 * Math.sin(z / 23 + 2));
  const halfW = z => 17 + 34 * smooth(L - 420, L - 260, -z);
  const dune = (x, z) => { const u = (x * .9 + z * .3) / 52 + 3 * n1(x / 130, z / 130); return 24 * Math.pow(1 - Math.abs(Math.sin(u)), 1.4) * (.45 + n1(x / 210, z / 210)) + 6 * n1(x / 60, z / 60); };
  const heightAt = (x, z) => { const d = Math.abs(x - corridorX(z)), W = halfW(z), m = smooth(W, W + 50, d); return roll(z) + m * (dune(x, z) + 5); };
  const heading = z => -Math.atan((corridorX(z - 1.5) - corridorX(z + 1.5)) / 3);
  const pitch = z => Math.atan((roll(z - 1.5) - roll(z + 1.5)) / 3);
  const cull = [];
  return { L, campD, campZ: -campD, corridorX, roll, halfW, heightAt, heading, pitch, cull, addCull(o, zmin, zmax) { cull.push({ o, zmin, zmax }); return o; } };
}

// ---------- الكثبان ----------
function sandTex() {
  const t = canvasTex(256, 256, (c) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256); c.lineWidth = 3;
    for (let i = -2; i < 22; i++) { c.strokeStyle = i % 3 ? 'rgba(214,140,70,.16)' : 'rgba(255,255,255,.5)'; c.beginPath(); for (let x = 0; x <= 256; x += 8) { const y = i * 13 + Math.sin(x / 256 * Math.PI * 4 + i) * 5; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function buildTerrain(S, Q, geo) {
  const g = new THREE.Group(); S.add(g);
  const CL = 160, sx = Q.low ? 40 : 70, sz = Q.low ? 14 : 24, cell = Q.low ? 11 : 8, Wd = sx * cell;
  const mat = toon(0xffffff, { vertexColors: true, map: sandTex() });
  const cLow = new THREE.Color(0xf4b455), cMid = new THREE.Color(0xfbcf74), cHi = new THREE.Color(0xffe6a6), cOr = new THREE.Color(0xf09a52), cTr = new THREE.Color(0xfbdc98), c = new THREE.Color();
  for (let z0 = 240; z0 > -(geo.L + 520); z0 -= CL) {
    const zc = z0 - CL / 2, xc = Math.round(geo.corridorX(zc) / cell) * cell;
    const gm = new THREE.PlaneGeometry(Wd, CL, sx, sz); gm.rotateX(-Math.PI / 2);
    const p = gm.attributes.position, nr = gm.attributes.normal, uv = gm.attributes.uv, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i) + xc, z = p.getZ(i) + zc, h = geo.heightAt(x, z);
      p.setXYZ(i, x, h, z); uv.setXY(i, x / 16, z / 16);
      const hx = geo.heightAt(x + 2, z) - geo.heightAt(x - 2, z), hz = geo.heightAt(x, z + 2) - geo.heightAt(x, z - 2), il = 1 / Math.hypot(hx, 4, hz);
      nr.setXYZ(i, -hx * il, 4 * il, -hz * il);
      const rel = h - geo.roll(z), d = Math.abs(x - geo.corridorX(z));
      c.copy(cLow).lerp(cMid, clamp(rel / 9, 0, 1)).lerp(cHi, clamp((rel - 9) / 16, 0, 1)).lerp(cOr, .45 * smooth(.45, .75, n1(x / 85 + 9, z / 85)));
      c.lerp(cTr, 1 - smooth(geo.halfW(z) - 4, geo.halfW(z) + 10, d));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    gm.setAttribute('color', new THREE.BufferAttribute(col, 3)); gm.computeBoundingSphere();
    const m = new THREE.Mesh(gm, mat); m.receiveShadow = true; m.userData.noOut = 1; m.frustumCulled = false; g.add(m); geo.addCull(m, z0 - CL, z0);
  }
  const far = new THREE.Mesh(new THREE.PlaneGeometry(40000, 40000), toon(0xf4b455)); far.rotation.x = -Math.PI / 2; far.position.set(0, -4, -geo.L / 2); g.add(far);
  return g;
}

// ---------- أدوات الدمج ----------
function mg(parts) {
  return mergeGeometries(parts.map(([g, hex]) => { if (g.index) g = g.toNonIndexed(); const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }));
}
const vmat = () => toon(0xffffff, { vertexColors: true });
export function palmGeo(r) {
  const parts = [], h = 6.5; const t = new THREE.CylinderGeometry(.24, .38, h, 8); t.translate(0, h / 2, 0); parts.push([t, 0xb5773c]);
  for (let i = 0; i < 8; i++) { const l = new THREE.ConeGeometry(.75, 4.2, 4); l.scale(1, 1, .35); l.rotateZ(-Math.PI / 2 + .55); l.translate(1.9, -.35, 0); l.rotateY(i / 8 * Math.PI * 2 + r() * .4); l.translate(0, h, 0); parts.push([l, i % 2 ? 0x2fbf55 : 0x45d066]); }
  for (let i = 0; i < 3; i++) { const d = new THREE.SphereGeometry(.3, 8, 6); d.translate(Math.cos(i * 2.1) * .4, h - .55, Math.sin(i * 2.1) * .4); parts.push([d, 0xe0902a]); }
  return mg(parts);
}
export function acaciaGeo(r) {
  const parts = []; const t = new THREE.CylinderGeometry(.2, .36, 3.4, 7); t.rotateZ(.14); t.translate(0, 1.7, 0); parts.push([t, 0x8a5a3a]);
  [[-.2, 3.7, 0, 2.6], [1.5, 3.9, .6, 1.9], [-1.5, 3.5, -.5, 1.7]].forEach(([x, y, z, rr], i) => { const s = new THREE.SphereGeometry(rr, 14, 10); s.scale(1, .36, 1); s.translate(x, y, z); parts.push([s, i ? 0x86c64c : 0x6db53e]); });
  return mg(parts);
}
export function bushGeoD() { const parts = []; [[0, .35, 0, .6], [.55, .25, .2, .42], [-.5, .28, -.15, .45]].forEach(([x, y, z, rr], i) => { const s = new THREE.SphereGeometry(rr, 8, 6); s.translate(x, y, z); parts.push([s, i ? 0xb9c45e : 0x9fb04a]); }); return mg(parts); }
export function rockGeoD() { const parts = []; [[0, .5, 0, 1], [.9, .3, .3, .6]].forEach(([x, y, z, rr], i) => { const s = new THREE.DodecahedronGeometry(rr, 0); s.scale(1.2, .8, 1); s.translate(x, y, z); parts.push([s, i ? 0xb9805a : 0xa66f4c]); }); return mg(parts); }
function flagGeo(hex) { const parts = []; const p = new THREE.CylinderGeometry(.07, .09, 3.6, 6); p.translate(0, 1.8, 0); parts.push([p, 0xffffff]); const f = new THREE.ConeGeometry(.42, 1.2, 3); f.scale(1, 1, .12); f.rotateZ(-Math.PI / 2); f.translate(.65, 3.15, 0); parts.push([f, hex]); const b = new THREE.SphereGeometry(.12, 8, 6); b.translate(0, 3.65, 0); parts.push([b, 0xffd21a]); return mg(parts); }
function inst(S, geom, list, shadow, geo) {
  if (!list.length) return null;
  const buckets = {}; if (geo) list.forEach(it => { const k = Math.floor(-it[2] / 600); (buckets[k] = buckets[k] || []).push(it); }); else buckets[0] = list;
  const M4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), mat = vmat();
  Object.keys(buckets).forEach(k => {
    const l = buckets[k], m = new THREE.InstancedMesh(geom, mat, l.length);
    l.forEach(([x, y, z, sc, ry], i) => { e.set(0, ry || 0, 0); q.setFromEuler(e); v.set(x, y, z); s.setScalar(sc || 1); M4.compose(v, q, s); m.setMatrixAt(i, M4); });
    m.castShadow = !!shadow; m.userData.noOut = 1; m.frustumCulled = false; S.add(m);
    if (geo) geo.addCull(m, -(+k + 1) * 600, -k * 600);
  });
}

// ---------- زينة الطريق: أشجار، شجيرات، صخور، أعلام ----------
export function buildScenery(S, Q, geo) {
  const r = rnd(2024), L = geo.L, dens = Q.dens || 1;
  const spot = (z, dMin, dMax) => { const side = r() < .5 ? -1 : 1, d = dMin + r() * r() * (dMax - dMin), x = geo.corridorX(z) + side * (geo.halfW(z) - 17 + d); return [x, geo.heightAt(x, z) - .15, z, .8 + r() * .6, r() * 6.28]; };
  const many = (n, dMin, dMax) => { const a = []; for (let i = 0; i < n; i++) a.push(spot(140 - r() * (L + 300), dMin, dMax)); return a; };
  inst(S, acaciaGeo(r), many(Math.round(L / 55 * dens), 24, 200), true, geo);
  inst(S, bushGeo(), many(Math.round(L / 22 * dens), 19, 150), false, geo);
  inst(S, rockGeo(), many(Math.round(L / 40 * dens), 20, 160), true, geo);
  // واحات نخيل متفرقة
  const palms = []; for (let k = 0; k < Math.round(L / 650); k++) { const z = -250 - r() * (L - 500), side = r() < .5 ? -1 : 1, x0 = geo.corridorX(z) + side * (34 + r() * 30); for (let i = 0; i < 7; i++) { const x = x0 + (r() - .5) * 26, zz = z + (r() - .5) * 30; palms.push([x, geo.heightAt(x, zz) - .2, zz, .8 + r() * .5, r() * 6.28]); } }
  inst(S, palmGeo(r), palms, true, geo);
  // أعلام على جانبي المسار تُظهر السرعة
  const fl = [[], [], []]; let k = 0;
  for (let z = -40; z > -(L - 320); z -= 46) { [-1, 1].forEach(s => { const x = geo.corridorX(z) + s * (geo.halfW(z) + 2.5); fl[k % 3].push([x, geo.heightAt(x, z) - .1, z, 1, s > 0 ? Math.PI : 0]); }); k++; }
  [0xe0202a, 0xffffff, 0x18a048].forEach((hex, i) => inst(S, flagGeo(hex), fl[i], false, geo));
  // خيام بدوية متفرقة على الطريق
  for (let i = 0; i < Math.round(L / 900); i++) { const z = -400 - r() * (L - 1100), side = r() < .5 ? -1 : 1, x = geo.corridorX(z) + side * (32 + r() * 14), t = buildTent(8); t.position.set(x, geo.heightAt(x, z) + .1, z); t.rotation.y = side > 0 ? -Math.PI / 2 - .3 : Math.PI / 2 + .3; S.add(t); geo.addCull(t, z - 12, z + 12); }
}

// ---------- الخيمة البدوية (بيت الشعر) ----------
let tentT = null, carpetT = null;
function tentTex() {
  if (tentT) return tentT;
  tentT = canvasTex(256, 128, (c) => { c.fillStyle = '#2a2224'; c.fillRect(0, 0, 256, 128); [[10, 10, '#f4ead8'], [26, 4, '#c8202a'], [58, 14, '#f4ead8'], [78, 4, '#c8202a'], [100, 8, '#f4ead8'], [116, 6, '#e8a020']].forEach(([y, h, col]) => { c.fillStyle = col; c.fillRect(0, y, 256, h); }); c.fillStyle = '#2a2224'; for (let x = 0; x < 256; x += 16) { c.fillRect(x, 60, 8, 5); c.fillRect(x + 8, 66, 8, 5); } });
  return tentT;
}
function carpetTex() {
  if (carpetT) return carpetT;
  carpetT = canvasTex(256, 160, (c) => { c.fillStyle = '#b3202c'; c.fillRect(0, 0, 256, 160); c.strokeStyle = '#f4d9a0'; c.lineWidth = 6; c.strokeRect(8, 8, 240, 144); c.fillStyle = '#1d2a5a'; c.fillRect(22, 22, 212, 116); c.fillStyle = '#f4d9a0'; for (let i = 0; i < 5; i++) { const x = 46 + i * 41; c.beginPath(); c.moveTo(x, 50); c.lineTo(x + 16, 80); c.lineTo(x, 110); c.lineTo(x - 16, 80); c.closePath(); c.fill(); } c.fillStyle = '#b3202c'; for (let i = 0; i < 5; i++) { const x = 46 + i * 41; c.beginPath(); c.arc(x, 80, 6, 0, 7); c.fill(); } });
  return carpetT;
}
export function buildTent(w = 9) {
  const g = new THREE.Group(), cloth = toon(0xffffff, { map: tentTex(), side: THREE.DoubleSide }), wood = toon(0x8a5a3a);
  const roof = new THREE.PlaneGeometry(w + 1.4, 6.2, 8, 3); roof.rotateX(-Math.PI / 2);
  const p = roof.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), k = (z + 3.1) / 6.2; p.setY(i, 1.5 + k * 1.3 + .28 * Math.cos(x / w * Math.PI * 4) * (.4 + k)); } roof.computeVertexNormals();
  const rf = new THREE.Mesh(roof, cloth); rf.castShadow = true; rf.userData.noOut = 1; g.add(rf);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w + 1, 1.7), cloth); back.position.set(0, .85, -3); back.userData.noOut = 1; g.add(back);
  [-1, 1].forEach(s => { const sd = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.9), cloth); sd.rotation.y = Math.PI / 2; sd.position.set(s * (w / 2 + .5), .95, -.2); sd.userData.noOut = 1; g.add(sd); });
  for (let i = 0; i < 3; i++) { const pl = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, 3.1, 6), wood); pl.position.set((i - 1) * w / 2, 1.55, 3); g.add(pl); }
  const cp = new THREE.Mesh(new THREE.PlaneGeometry(w - 1.5, 4.6), toon(0xffffff, { map: carpetTex() })); cp.rotation.x = -Math.PI / 2; cp.position.set(0, .06, .4); cp.receiveShadow = true; cp.userData.noOut = 1; g.add(cp);
  [[-2.4, 0xe8a020], [-.8, 0x1f8f6a], [1, 0xc8202a], [2.5, 0x2a4fb0]].forEach(([x, hex]) => { const cu = new THREE.Mesh(new THREE.CapsuleGeometry(.3, .7, 4, 10), toon(hex)); cu.rotation.z = Math.PI / 2; cu.position.set(x * w / 9, .36, -2.2); g.add(cu); });
  return g;
}
export function omanFlag(s = 1) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 4, 6), toon(0xdddddd)); pole.position.y = 2; g.add(pole);
  const t = canvasTex(192, 128, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 192, 43); c.fillStyle = '#db161b'; c.fillRect(0, 43, 192, 42); c.fillStyle = '#008000'; c.fillRect(0, 85, 192, 43); c.fillStyle = '#db161b'; c.fillRect(0, 0, 60, 128); c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('⚔', 30, 42); });
  const geo = new THREE.PlaneGeometry(1.8, 1.2, 12, 4); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 3) * .08 * (x + .9)); } geo.translate(.9, 0, 0);
  const f = new THREE.Mesh(geo, toon(0xffffff, { map: t, side: THREE.DoubleSide })); f.position.y = 3.4; f.rotation.y = -.6; f.userData.noOut = 1; g.add(f);
  g.scale.setScalar(s * 1.6); return g;
}

// ---------- المخيم البدوي عند خط النهاية ----------
export function buildCamp(S, Q, geo) {
  const g = new THREE.Group(), zc = geo.campZ, y0 = geo.heightAt(0, zc); g.position.set(0, y0, zc); S.add(g); geo.addCull(g, zc - 90, zc + 110);
  const u = g.userData, r = rnd(5);
  // قوس الوصول
  const arch = new THREE.Group(); arch.position.set(0, 0, 95);
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, 9, 10), toon(0xb5773c)); p.position.set(s * 15, 4.5, 0); p.castShadow = true; arch.add(p); const f = omanFlag(1.1); f.position.set(s * 15, 8.6, 0); arch.add(f); });
  const bt = canvasTex(1024, 160, (c) => { c.fillStyle = '#b3202c'; c.fillRect(0, 0, 1024, 160); c.fillStyle = '#f4d9a0'; c.fillRect(0, 0, 1024, 14); c.fillRect(0, 146, 1024, 14); c.fillStyle = '#fff'; c.font = `900 92px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.fillText('⛺ مخيم رمال الشرقية ⛺', 512, 84); });
  const ban = new THREE.Mesh(new THREE.PlaneGeometry(30, 4.6), new THREE.MeshBasicMaterial({ map: bt, side: THREE.DoubleSide, toneMapped: false })); ban.position.y = 8.2; arch.add(ban);
  g.add(arch);
  // الخيام في نصف دائرة
  for (let i = 0; i < 5; i++) { const a = Math.PI * (.12 + i * .19), R = 30, t = buildTent(i === 2 ? 11 : 8); t.position.set(Math.cos(a) * R, .1, -Math.sin(a) * R + 4); t.rotation.y = Math.atan2(-t.position.x, -(t.position.z - 4)) ; g.add(t); }
  // النار
  const fire = new THREE.Group(); fire.position.set(9, 0, -2);
  for (let i = 0; i < 5; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(.14, .16, 1.9, 6), toon(0x6a3e22)); lg.rotation.set(Math.PI / 2 - .5, i / 5 * Math.PI * 2, 0, 'YXZ'); lg.position.y = .35; fire.add(lg); }
  const fl = []; [[0, 1.0, 1.8, 0xff7a1a], [.25, .7, 1.2, 0xffc02a], [-.3, .6, 1.0, 0xff4a1a]].forEach(([x, rr, h, hex]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(rr * .55, h, 8), new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })); f.position.set(x, h / 2 + .3, x * .5); f.userData.noOut = 1; f.userData.h = h; fire.add(f); fl.push(f); });
  for (let i = 0; i < 9; i++) { const st = new THREE.Mesh(new THREE.DodecahedronGeometry(.3, 0), toon(0x9a8a80)); const a = i / 9 * Math.PI * 2; st.position.set(Math.cos(a) * 1.4, .15, Math.sin(a) * 1.4); fire.add(st); }
  if (!Q.low) { const pl = new THREE.PointLight(0xff9a40, 60, 40, 1.6); pl.position.y = 2; fire.add(pl); u.fireLight = pl; }
  g.add(fire); u.flames = fl;
  // دلّة القهوة والفناجين
  const dal = new THREE.Group(), gold = toon(0xf0b830, { emissive: 0x9a6a10, emissiveIntensity: .25 });
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [.42, 0], [.5, .25], [.34, .7], [.24, 1.0], [.3, 1.25], [.2, 1.5], [.06, 1.7], [0, 1.85]].map(p => new THREE.Vector2(p[0], p[1])), 24), gold); body.castShadow = true; dal.add(body);
  const sp = new THREE.Mesh(new THREE.ConeGeometry(.12, .8, 8), gold); sp.rotation.z = -1.0; sp.position.set(.5, 1.05, 0); dal.add(sp);
  const hd = new THREE.Mesh(new THREE.TorusGeometry(.32, .05, 8, 16, Math.PI), gold); hd.rotation.z = Math.PI / 2; hd.position.set(-.34, .85, 0); dal.add(hd);
  dal.position.set(5.5, .05, -1.5); dal.scale.setScalar(1.3); g.add(dal);
  for (let i = 0; i < 3; i++) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.14, .09, .16, 10), toon(0xffffff)); cup.position.set(4.3 + i * .4, .1, -.4 - i * .3); g.add(cup); }
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(7, 4.4), toon(0xffffff, { map: carpetTex() })); mat.rotation.x = -Math.PI / 2; mat.position.set(3, .07, -2); mat.userData.noOut = 1; mat.receiveShadow = true; g.add(mat);
  // فوانيس معلّقة بين أعمدة
  const lm = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false }), posts = [[-22, 14], [0, 22], [22, 14], [26, -16], [-26, -16]];
  posts.forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.09, .11, 5.4, 6), toon(0x8a5a3a)); p.position.set(x, 2.7, z); g.add(p); });
  for (let k = 0; k < posts.length; k++) { const a = posts[k], b = posts[(k + 1) % posts.length]; for (let i = 1; i < 9; i++) { const t = i / 9, l = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 6), lm); l.position.set(a[0] + (b[0] - a[0]) * t, 5.3 - Math.sin(t * Math.PI) * 1.3, a[1] + (b[1] - a[1]) * t); l.userData.noOut = 1; g.add(l); } }
  // نخيل وأعلام
  const pg = palmGeo(r), pl = []; for (let i = 0; i < 12; i++) { const a = r() * 6.28, R = 36 + r() * 14; const x = Math.cos(a) * R, z = Math.sin(a) * R * .8 - 6; pl.push([x, geo.heightAt(x, zc + z) - y0 - .2, z, .9 + r() * .5, r() * 6]); }
  inst(g, pg, pl, true);
  [[-12, -20], [12, -20]].forEach(([x, z]) => { const f = omanFlag(1.5); f.position.set(x, 0, z); g.add(f); });
  outline(g, .03);
  u.center = new THREE.Vector3(0, y0, zc);
  return g;
}
export function animCamp(c, t) { const u = c.userData; u.flames.forEach((f, i) => { const k = 1 + Math.sin(t * (9 + i * 3) + i) * .18; f.scale.set(1, k, 1); f.position.y = f.userData.h * k / 2 + .3; }); if (u.fireLight) u.fireLight.intensity = 55 + Math.sin(t * 13) * 12 + Math.sin(t * 7.3) * 8; }

// ---------- جدار العاصفة الرملية ----------
export function buildStorm(Q) {
  const g = new THREE.Group(), r = rnd(31), blobs = [];
  const cols = [0xd9954a, 0xc47f3c, 0xa8683a, 0xe6a85a];
  const n = Q.low ? 34 : 60;
  for (let i = 0; i < n; i++) {
    const row = i % 3, rr = (row === 0 ? 46 : row === 1 ? 38 : 30) * (.8 + r() * .5);
    const m = new THREE.Mesh(new THREE.SphereGeometry(rr, 16, 12), toon(row === 0 ? (i % 2 ? 0x9a5c30 : 0xab6a36) : row === 1 ? (i % 2 ? 0xc47f3c : 0xd08c44) : (i % 2 ? 0xe6a85a : 0xf0b96a), { emissive: 0x6a3a18, emissiveIntensity: .25, fog: false }));
    m.position.set((r() - .5) * 760, row * 42 + r() * 20 - 6, r() * 60 + row * 26); m.userData.noOut = 1; m.userData.ph = r() * 6; m.userData.y0 = m.position.y; m.userData.s0 = 1; g.add(m); blobs.push(m);
  }
  const back = new THREE.Mesh(new THREE.PlaneGeometry(2400, 900), new THREE.MeshBasicMaterial({ color: 0x8a5632, fog: false })); back.position.set(0, 380, 120); back.rotation.y = Math.PI; g.add(back);
  const flash = new THREE.Mesh(new THREE.SphereGeometry(60, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0, fog: false, depthWrite: false })); flash.position.set(0, 90, 40); g.add(flash);
  g.userData = { blobs, flash, nextFlash: 2 };
  return g;
}
export function animStorm(s, t, dt) {
  const u = s.userData;
  u.blobs.forEach(b => { const k = 1 + Math.sin(t * 1.3 + b.userData.ph) * .09; b.scale.setScalar(k); b.position.y = b.userData.y0 + Math.sin(t * .9 + b.userData.ph * 2) * 5; b.rotation.y += dt * .3; });
  u.nextFlash -= dt; if (u.nextFlash <= 0) { u.nextFlash = 2.5 + Math.random() * 5; u.flash.position.x = (Math.random() - .5) * 400; u.flash.material.opacity = .85; u.thunder = true; }
  u.flash.material.opacity = Math.max(0, u.flash.material.opacity - dt * 3.5);
}

// غيمة مدمجة في مجسّم واحد
export function buildCloudM(r, scale = 1) {
  const n = 5 + (r() * 4 | 0), geos = [];
  for (let i = 0; i < n; i++) { const rr = (7 + r() * 8) * (i === 0 || i === n - 2 ? 1.5 : 1); const sp = new THREE.SphereGeometry(rr, 12, 8); sp.scale(1, .8, 1); sp.translate((i - n / 2) * 7 + (r() - .5) * 4, rr * .35 + (i % 2) * 3, (r() - .5) * 10); geos.push(sp); }
  const m = new THREE.Mesh(mergeGeometries(geos), toon(0xffffff, { emissive: 0xffe8d0, emissiveIntensity: .35 })); m.scale.setScalar(scale); m.userData.noOut = 1; return m;
}

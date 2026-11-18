// البيئات الجديدة: رمال الشرقية، شاطئ رأس الجنز، أعماق جزر الديمانيات، الجبل الأخضر
import * as THREE from 'three';
import { canvasTex, rnd } from './util.js';
import { toon, outline } from './toon.js';
import { fbm, smooth } from './sky.js';
import { mg, vmat, inst, mtnG, figTree, bushG, grassG, flowerG, rockG } from './forest.js';
import { palmGeo, acaciaGeo, bushGeoD, buildTent } from './desert.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// أرض عامة بألوان الرؤوس
function terrain(S, Q, H, colorAt, opts = {}) {
  const W = opts.w || 170, D = opts.d || 150, g = new THREE.PlaneGeometry(W, D, Q.low ? 100 : 170, Q.low ? 90 : 150); g.rotateX(-Math.PI / 2); g.translate(0, 0, opts.z0 !== undefined ? opts.z0 : -45);
  const p = g.attributes.position, uv = g.attributes.uv, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), h = H(x, z); p.setY(i, h); uv.setXY(i, x / 6, z / 6); colorAt(c, x, z, h); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
  if (opts.slopeCol) { const n = g.attributes.normal, sc = new THREE.Color(opts.slopeCol); for (let i = 0; i < p.count; i++) { const k = smooth(.88, .7, n.getY(i)); col[i * 3] += (sc.r - col[i * 3]) * k; col[i * 3 + 1] += (sc.g - col[i * 3 + 1]) * k; col[i * 3 + 2] += (sc.b - col[i * 3 + 2]) * k; } }
  const m = new THREE.Mesh(g, toon(0xffffff, { vertexColors: true, map: opts.map || null })); m.receiveShadow = true; m.userData.noOut = 1; S.add(m); return m;
}
function rippleTex(a, b) { const t = canvasTex(256, 256, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 256, 256); c.lineWidth = 3; for (let i = -2; i < 22; i++) { c.strokeStyle = i % 2 ? a : b; c.beginPath(); for (let x = 0; x <= 256; x += 8) { const y = i * 13 + Math.sin(x / 256 * Math.PI * 4 + i) * 5; x ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; }
const place = (S, geo, x, z, H, s = 1, ry, shadow = true) => { const m = new THREE.Mesh(geo, vmat()); m.position.set(x, H(x, z) - .15, z); m.scale.setScalar(s); m.rotation.y = ry === undefined ? Math.random() * 6.28 : ry; m.castShadow = shadow; m.receiveShadow = true; S.add(m); outline(m, .035, 0x2a2a24); return m; };
function puffTex() { return canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); }); }

// ======================= رمال الشرقية =======================
export function buildDesertWorld(S, Q) {
  const r = rnd(812);
  const H = (x, z) => { const m = clamp(smooth(-10, -30, z) + smooth(16, 32, Math.abs(x)) * smooth(16, -4, z), 0, 1), u = (x * .8 + z * .35) / 13 + 2.2 * fbm(x / 60, z / 60, 2); return .9 * (fbm(x / 18, z / 18, 3) - .5) + m * (10 * Math.pow(1 - Math.abs(Math.sin(u)), 1.5) * (.5 + fbm(x / 90, z / 90, 2)) + 2) + 7 * smooth(-35, -70, z); };
  const cL = new THREE.Color(0xf6c46a), cM = new THREE.Color(0xfbd88a), cH = new THREE.Color(0xffeab4), cO = new THREE.Color(0xf2a058);
  terrain(S, Q, H, (c, x, z, h) => { c.copy(cL).lerp(cM, clamp(h / 4, 0, 1)).lerp(cH, clamp((h - 4) / 8, 0, 1)).lerp(cO, .45 * smooth(.45, .75, fbm(x / 40 + 7, z / 40, 3))); }, { map: rippleTex('rgba(210,140,70,.18)', 'rgba(255,255,255,.45)') });
  // أشجار الغاف والنخيل والشجيرات
  [[-21, 6, 1.5], [22, 4, 1.6], [-25, -8, 1.3], [26, -12, 1.4], [-6, -24, 1.1], [12, -26, 1.2]].forEach(([x, z, s]) => place(S, acaciaGeo(r), x, z, H, s));
  const pg = palmGeo(r); [[15, -14], [18, -12], [13.5, -11.5], [19.5, -16], [16.5, -17.5]].forEach(([x, z], i) => place(S, pg, x, z, H, 1.1 + (i % 2) * .25));
  const pool = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), toon(0x3ad0e8, { emissive: 0x0a5a70, emissiveIntensity: .2 })); pool.rotation.x = -Math.PI / 2; pool.scale.set(1.3, 1, 1); pool.position.set(16, H(16, -14) + .05, -14); pool.userData.noOut = 1; S.add(pool);
  const bl = []; for (let i = 0; i < 40; i++) { const x = (r() - .5) * 70, z = 14 - r() * 45; if (Math.abs(x) < 13 && z > -10 && z < 12) continue; bl.push([x, H(x, z) - .1, z, .7 + r() * .8, r() * 6]); } inst(S, bushGeoD(), bl, true);
  const tuft = mg([...Array(5)].map((_, i) => [new THREE.ConeGeometry(.05, .6, 3).translate(0, .3, 0).rotateZ((i - 2) * .25).rotateY(i), 0xc8b46a])); const tl = []; for (let i = 0; i < 160; i++) { const x = (r() - .5) * 60, z = 16 - r() * 36; tl.push([x, H(x, z) - .05, z, .8 + r() * .7, r() * 6]); } inst(S, tuft, tl, false);
  const rk = mg([[new THREE.DodecahedronGeometry(.9, 0).scale(1.2, .7, 1).translate(0, .3, 0), 0xc88a5a], [new THREE.DodecahedronGeometry(.55, 0).scale(1.2, .7, 1).translate(.8, .2, .3), 0xd89a68]]); inst(S, rk, [[9, H(9, 2), 2, 1.2, 1], [-12, H(-12, 9), 9, 1, 2], [-3, H(-3, -10), -10, 1.4, 0], [7, H(7, -7), -7, .9, 3]].map(a => [a[0], a[1] - .15, a[2], a[3], a[4]]), true);
  // خيمة بدوية ونار
  const t = buildTent(9); t.position.set(-15, H(-15, -13), -13); t.rotation.y = .5; outline(t, .03); S.add(t);
  const fire = new THREE.Group(); fire.position.set(-9.5, H(-9.5, -9), -9); S.add(fire); const flames = [];
  [[0, 1, 1.6, 0xff7a1a], [.2, .7, 1.1, 0xffc02a]].forEach(([x, rr, h, hex]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(rr * .5, h, 8), new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })); f.position.set(x, h / 2 + .2, 0); f.userData.h = h; fire.add(f); flames.push(f); });
  for (let i = 0; i < 4; i++) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, 1.6, 6), toon(0x6a3e22)); lg.rotation.set(Math.PI / 2 - .5, i * 1.57, 0, 'YXZ'); lg.position.y = .3; fire.add(lg); }
  const dunes = new THREE.Group(); S.add(dunes); [[-60, -110, 60, 22], [10, -130, 80, 30], [70, -105, 55, 20], [-90, -140, 70, 26]].forEach(([x, z, w, h]) => { const m = new THREE.Mesh(mtnG(r, w, h), toon(0xf4b860)); m.position.set(x, 0, z); m.scale.y = .6; m.userData.noOut = 1; dunes.add(m); });
  return { H, update(t) { flames.forEach((f, i) => { const k = 1 + Math.sin(t * (9 + i * 4)) * .18; f.scale.set(1, k, 1); f.position.y = f.userData.h * k / 2 + .2; }); } };
}

// ======================= شاطئ رأس الجنز =======================
export function buildBeachWorld(S, Q) {
  const r = rnd(331), SH = z => -8 + Math.sin(z) * 0;
  const H = (x, z) => { const shore = -8 + 1.4 * Math.sin(x / 9) + .8 * Math.sin(x / 4.3 + 1); const d = z - shore; let h = d > 0 ? .9 * (1 - Math.exp(-d / 6)) + d * .02 : d * .12 - .05; h += .25 * (fbm(x / 9, z / 9, 3) - .5); h += 6 * smooth(19, 34, Math.abs(x)) * smooth(-22, 4, z) * (fbm(x / 7, z / 7, 2) + .5); return h; };
  const cW = new THREE.Color(0xd8b878), cD = new THREE.Color(0xfff0c8), cS = new THREE.Color(0xffe2a0), cR = new THREE.Color(0xb08a6a);
  terrain(S, Q, H, (c, x, z, h) => { c.copy(cS).lerp(cD, clamp(h / 1.2, 0, 1)).lerp(cW, clamp(-h * 3 + .3, 0, 1)).lerp(cR, smooth(1.8, 3.5, h)); }, { map: rippleTex('rgba(200,150,80,.12)', 'rgba(255,255,255,.4)'), slopeCol: 0xa88a72 });
  // البحر
  const wt = canvasTex(512, 512, (c) => { c.fillStyle = '#1ab8e0'; c.fillRect(0, 0, 512, 512); c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 4; for (let i = 0; i < 40; i++) { const x = Math.random() * 512, y = Math.random() * 512, w = 20 + Math.random() * 40; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + w / 2, y - 6, x + w, y); c.stroke(); } }); wt.wrapS = wt.wrapT = THREE.RepeatWrapping; wt.repeat.set(14, 10);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 500, 1, 1), toon(0xffffff, { map: wt, transparent: true, opacity: .9 })); sea.rotation.x = -Math.PI / 2; sea.position.set(0, 0, -240); sea.userData.noOut = 1; sea.receiveShadow = true; S.add(sea);
  const shallow = new THREE.Mesh(new THREE.PlaneGeometry(120, 14), new THREE.MeshBasicMaterial({ color: 0x7af0f0, transparent: true, opacity: .45, depthWrite: false })); shallow.rotation.x = -Math.PI / 2; shallow.position.set(0, .02, -13); S.add(shallow);
  // زبد الموج على الشاطئ
  const ft = canvasTex(512, 64, (c) => { c.fillStyle = 'rgba(255,255,255,0)'; c.clearRect(0, 0, 512, 64); c.fillStyle = 'rgba(255,255,255,.95)'; c.beginPath(); c.moveTo(0, 40); for (let x = 0; x <= 512; x += 16) c.lineTo(x, 28 + Math.sin(x / 20) * 6 + Math.random() * 4); c.lineTo(512, 64); c.lineTo(0, 64); c.closePath(); c.fill(); }); ft.wrapS = THREE.RepeatWrapping; ft.repeat.set(6, 1);
  const foamG = new THREE.PlaneGeometry(120, 2.4, 120, 1); foamG.rotateX(-Math.PI / 2); const fp = foamG.attributes.position; for (let i = 0; i < fp.count; i++) { const x = fp.getX(i); fp.setZ(i, fp.getZ(i) + 1.4 * Math.sin(x / 9) + .8 * Math.sin(x / 4.3 + 1)); }
  const foam = new THREE.Mesh(foamG, new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false })); foam.position.set(0, .06, -8.6); S.add(foam);
  // جزر بعيدة وسفينة شراعية (داو)
  [[-80, -160, 30, 10], [60, -190, 40, 14], [130, -170, 26, 8]].forEach(([x, z, w, h]) => { const m = new THREE.Mesh(mtnG(r, w, h), toon(0xb89a7a)); m.position.set(x, -1, z); m.userData.noOut = 1; S.add(m); });
  const dhow = new THREE.Group(); const hull = new THREE.Mesh(new THREE.CylinderGeometry(.6, .9, 7, 8, 1, false, 0, Math.PI), toon(0x8a5a3a, { side: THREE.DoubleSide })); hull.rotation.set(Math.PI / 2, 0, Math.PI); dhow.add(hull); const mast = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 7, 6), toon(0x6a4a2a)); mast.position.y = 3.3; dhow.add(mast); const sail = new THREE.Mesh(new THREE.ConeGeometry(2.6, 6, 3, 1, true), toon(0xfff6e6, { side: THREE.DoubleSide })); sail.scale.z = .08; sail.position.set(0, 3.8, .6); sail.rotation.z = .25; dhow.add(sail); dhow.position.set(30, .1, -70); dhow.rotation.y = 1.2; S.add(dhow);
  // نخيل وصخور على الجانبين
  const pg = palmGeo(r); [[-24, 10, 1.5, .3], [-29, 2, 1.3, .2], [25, 12, 1.4, -.3], [30, 4, 1.5, -.2], [-20, 15, 1.2, .1]].forEach(([x, z, s, lean]) => { const m = place(S, pg, x, z, H, s); m.rotation.z = lean; });
  const rk = mg([[new THREE.DodecahedronGeometry(1.4, 1).scale(1.3, .8, 1).translate(0, .4, 0), 0x9a8478], [new THREE.DodecahedronGeometry(.8, 1).scale(1.2, .8, 1).translate(1.3, .2, .6), 0xa89488]]);
  inst(S, rk, [[-15, -6, 1.2], [-18, -2, 1.5], [16, -7, 1.3], [19, -3, 1.6], [-12, -10, .8], [13, -11, .9]].map(([x, z, s]) => [x, H(x, z) - .2, z, s, r() * 6]), true);
  const shells = mg([[new THREE.SphereGeometry(.18, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, .5, 1.2), 0xffd8d0]]); const sl = []; for (let i = 0; i < 40; i++) { const x = (r() - .5) * 40, z = -6 + r() * 20; sl.push([x, H(x, z) - .02, z, .8 + r() * .8, r() * 6]); } inst(S, shells, sl, false);
  // آثار السلاحف على الرمل
  return { H, water: 0, update(t) { wt.offset.set(t * .006, t * .01); foam.position.z = -8.6 + Math.sin(t * .8) * .7; foam.material.opacity = .75 + Math.sin(t * .8) * .25; dhow.position.y = .1 + Math.sin(t * 1.1) * .12; dhow.rotation.z = Math.sin(t * .9) * .05; } };
}

// ======================= أعماق جزر الديمانيات =======================
export function buildReefWorld(S, Q) {
  const r = rnd(4242);
  const H = (x, z) => .9 * (fbm(x / 14, z / 14, 3) - .5) + 3.5 * smooth(-18, -45, z) * fbm(x / 10, z / 10, 2) + 2.5 * smooth(18, 34, Math.abs(x));
  const cA = new THREE.Color(0xf4e2b0), cB = new THREE.Color(0xe8d0a0), cC = new THREE.Color(0xc8b890);
  terrain(S, Q, H, (c, x, z, h) => { c.copy(cA).lerp(cB, smooth(.4, .7, fbm(x / 8, z / 8, 3))).lerp(cC, clamp(h / 4, 0, 1)); }, { map: rippleTex('rgba(180,140,90,.2)', 'rgba(255,255,255,.4)') });
  // أشعة الضوء والكاوستكس
  const ct = canvasTex(256, 256, (c) => { c.clearRect(0, 0, 256, 256); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; for (let i = 0; i < 26; i++) { const x = Math.random() * 256, y = Math.random() * 256, rr = 14 + Math.random() * 22; c.beginPath(); for (let k = 0; k <= 7; k++) { const a = k / 7 * Math.PI * 2; c.lineTo(x + Math.cos(a) * rr * (.8 + Math.random() * .4), y + Math.sin(a) * rr * (.8 + Math.random() * .4)); } c.stroke(); } }); ct.wrapS = ct.wrapT = THREE.RepeatWrapping; ct.repeat.set(8, 8);
  const cg = new THREE.PlaneGeometry(90, 70, 60, 50); cg.rotateX(-Math.PI / 2); cg.translate(0, 0, -15); { const p = cg.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, H(p.getX(i), p.getZ(i)) + .06); }
  const caus = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: .32, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xbff8ff })); caus.userData.noOut = 1; S.add(caus);
  const rt = canvasTex(64, 256, (c) => { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 256); }); const rays = [];
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(3 + r() * 4, 40), new THREE.MeshBasicMaterial({ map: rt, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: .25, color: 0xd8fbff, side: THREE.DoubleSide, fog: false })); m.position.set(-30 + i * 8 + r() * 4, 16, -10 - r() * 25); m.rotation.z = .35; m.userData.ph = r() * 6; S.add(m); rays.push(m); }
  // المرجان
  const brain = mg([[new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55).scale(1.2, .9, 1.2), 0xf0a0c8]]);
  const branch = (hex) => { const parts = []; for (let i = 0; i < 9; i++) { const a = i * 2.4, l = .8 + (i % 3) * .3, c = new THREE.CylinderGeometry(.07, .12, l, 6); c.translate(0, l / 2, 0); c.rotateZ(.35 * Math.sin(i)); c.rotateY(a); c.translate(Math.cos(a) * .2, 0, Math.sin(a) * .2); parts.push([c, hex]); const t = new THREE.SphereGeometry(.12, 6, 4); t.translate(0, l, 0); t.rotateZ(.35 * Math.sin(i)); t.rotateY(a); t.translate(Math.cos(a) * .2, 0, Math.sin(a) * .2); parts.push([t, 0xffffff]); } return mg(parts); };
  const table = mg([[new THREE.CylinderGeometry(.18, .3, .9, 8).translate(0, .45, 0), 0x6ac8a8], [new THREE.CylinderGeometry(1.4, 1.2, .2, 14).translate(0, 1, 0), 0x7ad8b8]]);
  const fanT = canvasTex(128, 128, (c) => { c.strokeStyle = '#b05ad8'; c.lineWidth = 3; for (let i = 0; i < 14; i++) { c.beginPath(); c.moveTo(64, 128); c.quadraticCurveTo(64 + (i - 7) * 6, 70, 64 + (i - 7) * 9, 8); c.stroke(); } for (let y = 20; y < 120; y += 10) { c.beginPath(); c.arc(64, 128, 128 - y, Math.PI, 0); c.stroke(); } });
  const rockC = mg([[new THREE.DodecahedronGeometry(1.6, 1).scale(1.3, .8, 1), 0x8a8a9a], [new THREE.DodecahedronGeometry(1, 1).scale(1.2, .9, 1).translate(1.6, .2, .5), 0x7a7a8c]]);
  const reefAt = [[-9, -6, 1.3], [8, -8, 1.4], [-15, 2, 1.1], [15, 1, 1.2], [0, -14, 1.5], [-20, -12, 1.4], [21, -14, 1.3], [-4, -22, 1.6], [10, -24, 1.5]];
  const cols = [0xff7a8a, 0xffb21a, 0xb06ae8, 0xff5ab0, 0x5ad8e8];
  reefAt.forEach(([x, z, s], i) => {
    const rk = place(S, rockC, x, z, H, s);
    place(S, brain, x + 1.4 * s, z + 1.2, H, .7 * s, 0); place(S, branch(cols[i % 5]), x - 1.2 * s, z + 1.4, H, s, 0, true); place(S, branch(cols[(i + 2) % 5]), x + .3, z + 1.8, H, .8 * s, 0, true);
    if (i % 2) place(S, table, x + 2.2, z - .8, H, .9, 0);
    const fan = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ map: fanT, transparent: true, side: THREE.DoubleSide, alphaTest: .2 })); fan.position.set(x - .4, H(x, z) + 2.6 * s, z - .6); fan.rotation.y = r(); S.add(fan);
  });
  // الأعشاب البحرية المتمايلة
  const weeds = []; const wg = new THREE.PlaneGeometry(.5, 4, 1, 8); wg.translate(0, 2, 0); { const p = wg.attributes.position; for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) * (1 - p.getY(i) / 5)); }
  for (let i = 0; i < (Q.low ? 24 : 46); i++) { const x = (r() - .5) * 60, z = 6 - r() * 34; if (Math.abs(x) < 6 && z > -4) continue; const m = new THREE.Mesh(wg, toon(r() < .5 ? 0x3ab84a : 0x6ad050, { side: THREE.DoubleSide })); m.position.set(x, H(x, z) - .1, z); m.scale.setScalar(.7 + r() * .9); m.rotation.y = r() * 6; m.userData = { ph: r() * 6, noOut: 1 }; S.add(m); weeds.push(m); }
  // شقائق النعمان (بيت سمكة المهرج)
  const anem = new THREE.Group(); anem.position.set(-4.5, H(-4.5, 3), 3); S.add(anem); const tents = [];
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, .6, 14), toon(0xb05ab0)); base.position.y = .3; anem.add(base);
  for (let i = 0; i < 34; i++) { const a = r() * 6.28, rr = r() * .8, p = new THREE.Group(); p.position.set(Math.cos(a) * rr, .55, Math.sin(a) * rr); const t = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .7, 3, 6), toon(0xff9ad8)); t.position.y = .4; p.add(t); const tip = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 4), toon(0xfff0f8)); tip.position.y = .8; p.add(tip); p.userData.ph = r() * 6; anem.add(p); tents.push(p); }
  outline(anem, .02);
  // فقاعات
  const bt = canvasTex(64, 64, (c) => { c.strokeStyle = 'rgba(255,255,255,.95)'; c.lineWidth = 5; c.beginPath(); c.arc(32, 32, 24, 0, 7); c.stroke(); c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.arc(24, 24, 6, 0, 7); c.fill(); });
  const bubbles = []; for (let i = 0; i < (Q.low ? 20 : 40); i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: bt, transparent: true, depthWrite: false, opacity: .8 })); s.userData = { x: (r() - .5) * 40, z: 4 - r() * 30, v: .8 + r() * 1.2, y: r() * 20 }; s.scale.setScalar(.2 + r() * .3); S.add(s); bubbles.push(s); }
  return { H, under: true, anemone: anem, update(t, dt) {
    ct.offset.set(Math.sin(t * .2) * .05, t * .015); caus.material.opacity = .26 + Math.sin(t * 1.3) * .06;
    rays.forEach(m => { m.material.opacity = .14 + Math.sin(t * .5 + m.userData.ph) * .1; });
    weeds.forEach(m => { m.rotation.z = Math.sin(t * .9 + m.userData.ph) * .18; m.rotation.x = Math.sin(t * .7 + m.userData.ph) * .1; });
    tents.forEach(p => { p.rotation.x = Math.sin(t * 1.3 + p.userData.ph) * .3; p.rotation.z = Math.cos(t * 1.1 + p.userData.ph) * .3; });
    bubbles.forEach(b => { const u = b.userData; u.y += u.v * dt; if (u.y > 22) u.y = 0; b.position.set(u.x + Math.sin(t * 2 + u.v * 9) * .3, H(u.x, u.z) + u.y, u.z); });
  } };
}

// ======================= الجبل الأخضر =======================
export function buildMountainWorld(S, Q) {
  const r = rnd(909), STEP = 1.7;
  const H = (x, z) => {
    const s = Math.max(0, (-6 - z) * .5 + .012 * x * x - .2); const k = s / STEP, f = k - Math.floor(k);
    let h = (Math.floor(k) + smooth(.8, .97, f)) * STEP * smooth(0, 1.2, s);
    h += .35 * (fbm(x / 10, z / 10, 3) - .5) * (1 - smooth(-4, -8, z)); h += 30 * smooth(-38, -80, z) * (fbm(x / 25, z / 25, 3) + .3);
    return h;
  };
  const cG = new THREE.Color(0x6cd050), cG2 = new THREE.Color(0x9ae060), cT = new THREE.Color(0x58c048), cY = new THREE.Color(0xd8e070), cW = new THREE.Color(0xc8a07a), cM = new THREE.Color(0xc8885a);
  terrain(S, Q, H, (c, x, z, h) => { const s = (-6 - z) * .5 + .012 * x * x; if (s < .3) c.copy(cG).lerp(cG2, smooth(.45, .7, fbm(x / 8, z / 8, 3))); else c.copy(Math.floor(s / STEP) % 2 ? cT : cY).lerp(cG2, .3 * fbm(x / 5, z / 5, 2)); c.lerp(cM, smooth(14, 26, h)); }, { slopeCol: 0xc8a07a, map: null });
  // الفلج
  const fg = new THREE.PlaneGeometry(44, .8, 60, 1); fg.rotateX(-Math.PI / 2); const fp = fg.attributes.position; for (let i = 0; i < fp.count; i++) { const x = fp.getX(i), zc = -9.6 + .024 * x * x; fp.setZ(i, zc + fp.getZ(i)); fp.setY(i, H(x, zc) + .1); }
  const ft = canvasTex(256, 32, (c) => { c.fillStyle = '#3ac8e8'; c.fillRect(0, 0, 256, 32); c.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 20; i++) c.fillRect(Math.random() * 256, Math.random() * 32, 18, 3); }); ft.wrapS = THREE.RepeatWrapping; ft.repeat.set(10, 1);
  const falaj = new THREE.Mesh(fg, toon(0xffffff, { map: ft, emissive: 0x0a5a70, emissiveIntensity: .2 })); falaj.userData.noOut = 1; S.add(falaj);
  // رمان وورد وجوز
  const pom = (rr) => { const parts = [], h = 1.6; const tr = new THREE.CylinderGeometry(.14, .22, h, 7); tr.translate(0, h / 2, 0); parts.push([tr, 0x7a5a3a]); for (let i = 0; i < 6; i++) { const a = i * 1.05, c = new THREE.SphereGeometry(.75, 10, 8); c.translate(Math.cos(a) * .6, h + .5 + (i % 2) * .4, Math.sin(a) * .6); parts.push([c, i % 2 ? 0x3aa848 : 0x4cbc56]); } for (let i = 0; i < 9; i++) { const a = i * 2.1, f = new THREE.SphereGeometry(.16, 8, 6); f.translate(Math.cos(a) * 1.05, h + .3 + (i % 3) * .45, Math.sin(a) * 1.05); parts.push([f, 0xe8202a]); } return mg(parts); };
  const pg = pom(r); [[-11, 5], [12, 6], [-17, -2], [17, -1], [-7, -9], [8, -10], [-14, -12], [14, -13], [0, -12], [-22, 6], [22, 8]].forEach(([x, z]) => place(S, pg, x, z, H, 1 + r() * .3));
  [[-26, 12, 1.5], [26, 13, 1.4], [-30, -4, 1.3], [30, -6, 1.3]].forEach(([x, z, s]) => place(S, figTree(r, s), x, z, H, 1));
  const rose = mg([[new THREE.SphereGeometry(.6, 10, 8).scale(1.2, .8, 1.2).translate(0, .45, 0), 0x3a9a3a], ...[...Array(7)].map((_, i) => [new THREE.SphereGeometry(.13, 8, 6).translate(Math.cos(i * .9) * .55, .75 + (i % 2) * .15, Math.sin(i * .9) * .55), i % 3 ? 0xff7ab0 : 0xff4a90])]);
  const rl = []; for (let i = 0; i < 26; i++) { const x = (r() - .5) * 50, z = 12 - r() * 30; if (Math.abs(x) < 10 && z > -4 && z < 10) continue; rl.push([x, H(x, z) - .05, z, .8 + r() * .6, r() * 6]); } inst(S, rose, rl, true);
  const gl = []; for (let i = 0; i < (Q.low ? 200 : 450); i++) { const x = (r() - .5) * 60, z = 18 - r() * 26; gl.push([x, H(x, z) - .05, z, .7 + r() * .8, r() * 6]); } inst(S, grassG(), gl, false);
  [0xffffff, 0xffd23f, 0xff8ad0].forEach(hex => { const fl = []; for (let i = 0; i < 40; i++) { const x = (r() - .5) * 46, z = 14 - r() * 20; fl.push([x, H(x, z) - .03, z, 1, r() * 6]); } inst(S, flowerG(hex), fl, false); });
  // بيوت طينية قديمة على المدرجات
  const mud = toon(0xd8a878), mud2 = toon(0xc89868), win = toon(0x5a3a2a), door = toon(0x3a7ac8);
  const house = (x, z, w, h, d) => { const g = new THREE.Group(), y = H(x, z); g.position.set(x, y - .2, z); const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mud); b.position.y = h / 2; b.castShadow = b.receiveShadow = true; g.add(b); for (let i = 0; i < Math.floor(w / .7); i++) { const c = new THREE.Mesh(new THREE.BoxGeometry(.35, .35, .35), mud2); c.position.set(-w / 2 + .35 + i * .7, h + .17, d / 2 - .2); g.add(c); } for (let i = 0; i < 2; i++) { const wn = new THREE.Mesh(new THREE.BoxGeometry(.5, .6, .05), win); wn.position.set(-w / 4 + i * w / 2, h * .62, d / 2 + .02); g.add(wn); } const dr = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.4, .05), door); dr.position.set(0, .7, d / 2 + .02); g.add(dr); g.rotation.y = -x * .015; S.add(g); return g; };
  [[-14, -22, 4, 3, 3.5], [-9, -25, 3.5, 3.6, 3], [-18, -27, 3.5, 2.8, 3], [10, -24, 4.2, 3.2, 3.4], [15, -27, 3.5, 2.6, 3], [4, -30, 3, 3.4, 3]].forEach(a => outline(house(...a), .03));
  // جبال صخرية خلفية
  [[-60, -110, 50, 46, 0xc8885a], [0, -130, 70, 60, 0xb87a50], [60, -110, 50, 44, 0xd09868], [-110, -150, 60, 50, 0xa86a48], [110, -150, 60, 52, 0xb87a50]].forEach(([x, z, w, h, hex]) => { const m = new THREE.Mesh(mtnG(r, w, h), toon(hex)); m.position.set(x, 0, z); m.userData.noOut = 1; S.add(m); });
  return { H, update(t) { ft.offset.x = -t * .12; } };
}

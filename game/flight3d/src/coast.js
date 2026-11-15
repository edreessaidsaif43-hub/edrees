// جغرافيا رحلة ساحل مسقط ومعالمها — الطيران نحو -z، اليابسة يسارًا (x أصغر) والبحر يمينًا
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, rnd } from './util.js';
import { toon, outline } from './toon.js';
import { fbm, ridged, smooth } from './world.js';

const G = (d, w) => Math.exp(-(d / w) * (d / w));

export function makeCoast(L) {
  const st = { jal: -380, mut: -Math.round(L * .27), opera: -Math.round(L * .5), mosque: -Math.round(L * .72) };
  const air = { z0: -(L - 150), len: 1500 }; air.z1 = air.z0 - air.len; air.zc = (air.z0 + air.z1) / 2;
  const plain = z => smooth(L - 1700, L - 1050, -z); // 1 عند سهل المطار
  function shoreX(z) {
    const a = plain(z), wig = 60 * Math.sin(z / 430) + 30 * Math.sin(z / 170 + 1.3);
    return -140 + wig * (1 - a) - 90 * G(z - st.mut, 160) - 75 * G(z - st.jal, 95) + 35 * G(z - st.opera, 300) * (1 - a);
  }
  air.x = -150 - 230; // المدرج على السهل بموازاة الشاطئ
  const sites = [];
  function heightAt(x, z) {
    const sx = shoreX(z), d = sx - x;
    if (d < -40) return -12;
    const a = plain(z), land = smooth(-10, 60, d);
    const dStart = 20 + 280 * G(z - st.opera, 520) + 300 * G(z - st.mosque, 560) + 1000 * a;
    const m = ridged(x * .0036 + 11, z * .0036 - 7, 4) * 400 * smooth(dStart, dStart + 420, d) * (1 - .25 * a) + fbm(x * .012, z * .012, 3) * 18 * (1 - a * .8);
    let h = land * (5 + m) - (1 - land) * 10;
    // تلّا قلعتي الجلالي والميراني على طرفي الخليج
    [[st.jal + 135, 52], [st.jal - 140, 46]].forEach(([zz, hh]) => { const cx = shoreX(zz) - 4; h += hh * G(Math.hypot(x - cx, z - zz), 42); });
    // تل مبخرة ريام
    { const zz = st.mut - 205, cx = shoreX(zz) - 26; h += 46 * G(Math.hypot(x - cx, z - zz), 42); }
    // سهل مطرح
    h -= .85 * Math.max(0, h - 4) * G(z - st.mut, 120) * smooth(160, 60, d);
    // مواقع مستوية (الأوبرا، الجامع، المطار)
    for (const s of sites) { const k = smooth(s.r + s.f, s.r, Math.max(Math.abs(x - s.x) - s.rx, 0) + Math.max(Math.abs(z - s.z) - s.rz, 0)); h = h * (1 - k) + s.h * k; }
    return h;
  }
  const geo = { L, st, air, shoreX, heightAt, plain, sites, corridorX: z => shoreX(z) + 150 * (1 - plain(z)) + 0 };
  sites.push({ x: shoreX(st.opera) - 190, z: st.opera, rx: 110, rz: 120, r: 0, f: 90, h: 4 });
  sites.push({ x: shoreX(st.mosque) - 270, z: st.mosque, rx: 150, rz: 150, r: 0, f: 110, h: 5 });
  sites.push({ x: air.x, z: air.zc, rx: 260, rz: air.len / 2 + 260, r: 0, f: 200, h: 3 });
  return geo;
}

// ---------- التضاريس ----------
export function buildTerrain(S, Q, geo) {
  const x0 = -1500, x1 = 260, z0 = 600, z1 = -(geo.L + 1700), W = x1 - x0, H = z0 - z1;
  const sx = Q.low ? 34 : 24, segX = Math.round(W / sx), segZ = Math.round(H / sx);
  const g = new THREE.PlaneGeometry(W, H, segX, segZ); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) p.setY(i, geo.heightAt(p.getX(i), p.getZ(i)));
  g.computeVertexNormals(); const nrm = g.attributes.normal;
  const sand = new THREE.Color(0xfff0bf), gold = new THREE.Color(0xffd27a), orange = new THREE.Color(0xffa866), rose = new THREE.Color(0xf7a0a6), lav = new THREE.Color(0xc9b0ff), green = new THREE.Color(0x86d86a), dgreen = new THREE.Color(0x5cbf6a), plainC = new THREE.Color(0xf6dca0);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i), ny = nrm.getY(i), nl = fbm(x * .006 + 5, z * .006, 3);
    if (y < 3) c.copy(sand);
    else {
      const t = Math.min(1, y / 380);
      if (t < .3) c.copy(gold).lerp(orange, t / .3); else if (t < .65) c.copy(orange).lerp(rose, (t - .3) / .35); else c.copy(rose).lerp(lav, (t - .65) / .35);
      if (y < 12) c.lerp(plainC, .6);
      if (Math.sin(y * .09 + nl * 4) > .6) c.offsetHSL(0, 0, .035);
      if (y < 55 && ny > .84 && nl > .5) c.lerp(nl > .6 ? dgreen : green, Math.min(.8, (nl - .5) * 8));
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mesh = new THREE.Mesh(g, toon(0xffffff, { vertexColors: true })); mesh.receiveShadow = true; S.add(mesh);
  // المياه الضحلة وخطوط الزبد على طول الشاطئ
  const zs = [], N = Math.round(H / 12); for (let k = 0; k <= N; k++) zs.push(z0 - k * (H / N));
  const strip = (o0, o1, mat, y) => { const pos = [], idx = [], uv = []; zs.forEach((z, k) => { const s = geo.shoreX(z); pos.push(s + o0, y, z, s + o1, y, z); uv.push(0, k / 6, 1, k / 6); if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx); gg.computeVertexNormals(); const mm = new THREE.Mesh(gg, mat); mm.renderOrder = 2; S.add(mm); return mm; };
  const shT = canvasTex(64, 8, (cx) => { const gr = cx.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(120,255,240,.85)'); gr.addColorStop(.5, 'rgba(70,235,240,.55)'); gr.addColorStop(1, 'rgba(0,200,230,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 8); });
  strip(-6, 70, new THREE.MeshBasicMaterial({ map: shT, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }), .25);
  const foT = canvasTex(64, 256, (cx) => { cx.strokeStyle = '#ffffff'; cx.lineWidth = 7; for (let k = 0; k < 2; k++) { cx.beginPath(); for (let y = 0; y <= 256; y += 8) { const x = 16 + k * 28 + Math.sin(y / 256 * Math.PI * 4 + k) * 6; y ? cx.lineTo(x, y) : cx.moveTo(x, y); } cx.stroke(); } });
  foT.wrapT = THREE.RepeatWrapping;
  strip(-2, 16, new THREE.MeshBasicMaterial({ map: foT, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }), .32);
  mesh.userData.foam = foT;
  return mesh;
}

// ---------- أدوات بناء مشتركة ----------
const WHITE = () => toon(0xffffff), SAND = () => toon(0xf2d39a);
export function tower(mat, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 8, 24), mat); body.position.y = 4; body.castShadow = true; g.add(body);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(.75, 1, .55), mat); m.position.set(Math.cos(a) * 2.45, 8.45, Math.sin(a) * 2.45); m.rotation.y = -a; g.add(m); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4; const w = new THREE.Mesh(new THREE.BoxGeometry(.3, 1, .4), toon(0x5a3a28)); w.position.set(Math.cos(a) * 2.8, 5.5, Math.sin(a) * 2.8); w.rotation.y = -a; g.add(w); }
  return g;
}
export function omanFlag(s = 1) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 4, 6), toon(0xdddddd)); pole.position.y = 2; g.add(pole);
  const t = canvasTex(192, 128, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 192, 43); c.fillStyle = '#db161b'; c.fillRect(0, 43, 192, 42); c.fillStyle = '#008000'; c.fillRect(0, 85, 192, 43); c.fillStyle = '#db161b'; c.fillRect(0, 0, 60, 128); c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('⚔', 30, 42); });
  const geo = new THREE.PlaneGeometry(1.8, 1.2, 12, 4); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 3) * .08 * (x + .9)); } geo.translate(.9, 0, 0);
  const f = new THREE.Mesh(geo, toon(0xffffff, { map: t, side: THREE.DoubleSide })); f.position.y = 3.4; f.rotation.y = -.6; g.add(f);
  g.scale.setScalar(s * 1.6); return g;
}
function addPalms(S, list, r) {
  const tr = [], lv = [];
  list.forEach(([x, y0, z, hh]) => {
    const h = hh || 9 + r() * 4; const t = new THREE.CylinderGeometry(.45, .7, h, 8); t.translate(x, y0 + h / 2, z); tr.push(t.toNonIndexed());
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + r(); const l = new THREE.ConeGeometry(1.2, 6.5, 4); l.rotateZ(-Math.PI / 2 + .5); l.translate(3, 0, 0); l.rotateY(a); l.translate(x, y0 + h, z); lv.push(l.toNonIndexed()); }
  });
  if (!tr.length) return;
  const pt = new THREE.Mesh(mergeGeometries(tr), toon(0xc07a3a)), pl = new THREE.Mesh(mergeGeometries(lv), toon(0x2fd05a)); pt.castShadow = pl.castShadow = true; S.add(pt, pl);
}
function dhow(r) {
  const g = new THREE.Group(), wood = toon(0xa0602e);
  const sh = new THREE.Shape(); sh.moveTo(-6, 1.6); sh.quadraticCurveTo(-4.5, -.4, 0, -.6); sh.quadraticCurveTo(4.2, -.4, 5.6, 2.2); sh.lineTo(5, 2.2); sh.lineTo(-5.4, 1.8); sh.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: true, bevelThickness: .4, bevelSize: .3, bevelSegments: 2 }), wood); hull.position.z = -1.3; g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 9, 6), wood); mast.position.set(.5, 6, 0); mast.rotation.z = .12; g.add(mast);
  const sail = new THREE.Shape(); sail.moveTo(-5, 9); sail.lineTo(5.5, 11.5); sail.lineTo(1, 2.6); sail.closePath();
  g.add(new THREE.Mesh(new THREE.ShapeGeometry(sail), toon(0xfff6e0, { side: THREE.DoubleSide })));
  return g;
}

// ---------- مسقط القديمة: قلعتا الجلالي والميراني ----------
export function buildForts(S, geo) {
  const sand = SAND(), r = rnd(31), out = [];
  [[geo.st.jal + 135, 'jalali'], [geo.st.jal - 140, 'mirani']].forEach(([z, n], i) => {
    const x = geo.shoreX(z) - 4, y = geo.heightAt(x, z) - 3, g = new THREE.Group(); g.position.set(x, y, z); S.add(g);
    g.add(tower(sand, 0, 0, 0, 1.9)); g.add(tower(sand, -16, -4, i ? 12 : -12, 1.5)); if (!i) g.add(tower(sand, -8, -2, 14, 1.3));
    const wall = new THREE.Mesh(new THREE.BoxGeometry(5, 9, 26), sand); wall.position.set(-8, 2, 0); g.add(wall);
    const keep = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 12), sand); keep.position.set(-10, 3, i ? 6 : -6); g.add(keep);
    const f = omanFlag(1.4); f.position.set(0, 16.5, 0); g.add(f);
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); outline(g, .2, 0x6a4a3a); out.push(g);
  });
  // بيوت مسقط القديمة في الخليج بين القلعتين
  const geos = [], m = toon(0xffffff, { vertexColors: true });
  for (let k = 0; k < 40; k++) { const z = geo.st.jal + 100 - r() * 200, x = geo.shoreX(z) - 30 - r() * 90, y0 = Math.max(0, geo.heightAt(x, z)) - 1; if (y0 > 25) continue; const w = 8 + r() * 6, h = 6 + r() * 8; const b = new THREE.BoxGeometry(w, h, w); b.translate(x, y0 + h / 2, z); const cc = new THREE.Color().setHSL([.13, .5, .95, .58][(r() * 4) | 0], .7, r() < .6 ? 1 : .85), ca = new Float32Array(b.attributes.position.count * 3); for (let i = 0; i < ca.length; i += 3) { ca[i] = cc.r; ca[i + 1] = cc.g; ca[i + 2] = cc.b; } b.setAttribute('color', new THREE.BufferAttribute(ca, 3)); geos.push(b.toNonIndexed()); }
  if (geos.length) { const t = new THREE.Mesh(mergeGeometries(geos), m); t.castShadow = true; S.add(t); }
  return out;
}

// ---------- مطرح ومبخرة ريام ----------
function facadeTex() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#e8e2d8'; c.fillRect(0, 240, 256, 16);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { const x = 18 + i * 60, y = 30 + r * 76; c.fillStyle = (i + r) % 3 ? '#1f8fc8' : '#2fae6a'; c.beginPath(); c.moveTo(x, y + 44); c.lineTo(x, y + 12); c.arc(x + 14, y + 12, 14, Math.PI, 0); c.lineTo(x + 28, y + 44); c.fill(); c.fillStyle = '#2a3b55'; c.fillRect(x + 6, y + 16, 16, 24); }
  });
}
export function buildMuttrah(S, geo) {
  const r = rnd(12), geos = [], ft = facadeTex(), mut = geo.st.mut; ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
  const mat = toon(0xffffff, { map: ft, vertexColors: true });
  for (let z = mut + 140; z > mut - 180; z -= 7 + r() * 5) {
    const sx = geo.shoreX(z);
    for (let k = 0; k < 4; k++) {
      const x = sx - 22 - k * 16 - r() * 6, w = 8 + r() * 6, d = 9 + r() * 5, h = 8 + r() * 10 + (k === 0 ? 4 : 0), y0 = Math.max(0, geo.heightAt(x, z)) - 1;
      if (y0 > 30) continue;
      const g = new THREE.BoxGeometry(d, h, w); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 16, uv.getY(i) * h / 15);
      g.translate(x, y0 + h / 2, z);
      const cc = new THREE.Color().setHSL([.13, .5, .95, .33, .58][(r() * 5) | 0], .85, r() < .45 ? 1 : .8), ca = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < ca.length; i += 3) { ca[i] = cc.r; ca[i + 1] = cc.g; ca[i + 2] = cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); geos.push(g.toNonIndexed());
    }
  }
  const town = new THREE.Mesh(mergeGeometries(geos), mat); town.castShadow = town.receiveShadow = true; S.add(town);
  const mx = geo.shoreX(mut) - 30, wht = WHITE(), blue = toon(0x1a7dff);
  const base = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 30), wht); base.position.set(mx, 6, mut); S.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), blue); dome.scale.y = 1.25; dome.position.set(mx, 12, mut); S.add(dome);
  [-1, 1].forEach(s => { const mn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 34, 12), wht); mn.position.set(mx + 10, 17, mut + s * 13); S.add(mn); const tp = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.5, 12), blue); tp.position.set(mx + 10, 36, mut + s * 13); S.add(tp); });
  const dhows = [];
  for (let i = 0; i < 7; i++) { const z = mut + 100 - i * 45 - r() * 20 - 120, d = dhow(r); d.position.set(geo.shoreX(z) + 40 + r() * 70, 0, z); d.rotation.y = r() * 6; d.scale.setScalar(2.2); S.add(d); dhows.push(d); }
  const pl = []; for (let z = mut + 160; z > mut - 200; z -= 9 + r() * 6) { const x = geo.shoreX(z) - 8 - r() * 6; pl.push([x, Math.max(0, geo.heightAt(x, z)) - .5, z]); } addPalms(S, pl, r);
  // مبخرة ريام
  const g = new THREE.Group(), zz = mut - 205, x = geo.shoreX(zz) - 26; g.position.set(x, geo.heightAt(x, zz) - 1, zz); g.scale.setScalar(1.45); S.add(g);
  const gold = toon(0xffc83a);
  const b0 = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 10, 4, 1), wht); b0.rotation.y = Math.PI / 4; b0.position.y = 5; g.add(b0);
  const body = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [8, 0], [10.5, 3], [11.5, 8], [10, 13], [7, 16], [6, 17]].map(p => new THREE.Vector2(p[0], p[1])), 48), wht); body.position.y = 10; g.add(body);
  const holeT = canvasTex(512, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#3a3a44'; for (let i = 0; i < 12; i++) { const cx = 21 + i * 42.6; c.beginPath(); c.moveTo(cx, 30); c.lineTo(cx + 9, 64); c.lineTo(cx, 98); c.lineTo(cx - 9, 64); c.closePath(); c.fill(); } });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(11.55, 11.55, 6, 48, 1, true), toon(0xffffff, { map: holeT })); band.position.y = 18; g.add(band);
  const lid = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [7.5, 0], [7.8, 1], [6, 4], [3.5, 9], [1.2, 14], [0, 15]].map(p => new THREE.Vector2(p[0], p[1])), 48), wht); lid.position.y = 27; g.add(lid);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), gold); fin.position.y = 43; g.add(fin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.6, .5, 8, 48), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 27.3; g.add(ring);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); outline(g, .25, 0x5a4a6a);
  return { dhows };
}

// ---------- دار الأوبرا السلطانية ----------
function archTex(base, arch, rows = 1) {
  return canvasTex(512, 256, (c) => {
    c.fillStyle = base; c.fillRect(0, 0, 512, 256);
    for (let r = 0; r < rows; r++) for (let i = 0; i < 6; i++) { const x = 16 + i * 84, y = 30 + r * (220 / rows), w = 52, h = 200 / rows - 20; c.fillStyle = arch; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w / 2); c.arc(x + w / 2, y + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.fill(); c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 4; c.beginPath(); c.arc(x + w / 2, y + w / 2, w / 2 + 6, Math.PI, 0); c.stroke(); }
  });
}
export function buildOpera(S, geo) {
  const site = geo.sites[0], g = new THREE.Group(); g.position.set(site.x, site.h, site.z); S.add(g);
  const stone = toon(0xf6e2bd), at = archTex('#f6e2bd', '#7a5a3a', 2); at.wrapS = THREE.RepeatWrapping; at.repeat.x = 3;
  const am = toon(0xffffff, { map: at });
  const box = (w, h, d, x, y, z, mats) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats || stone); m.position.set(x, y + h / 2, z); m.castShadow = true; g.add(m); return m; };
  box(60, 16, 150, 0, 0, 0, [am, am, stone, stone, am, am]);
  box(70, 6, 160, 0, 0, 0, stone);
  box(36, 30, 50, 4, 0, 0, [am, am, stone, stone, am, am]);
  const top = new THREE.Mesh(new THREE.ConeGeometry(16, 10, 4), toon(0xe8c48a)); top.rotation.y = Math.PI / 4; top.position.set(4, 35, 0); g.add(top);
  [-1, 1].forEach(s => box(26, 22, 30, 8, 0, s * 60, [am, am, stone, stone, am, am]));
  // حدائق ونوافير ونخيل
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(90, 190), toon(0x7ed957)); lawn.rotation.x = -Math.PI / 2; lawn.position.set(60, .3, 0); g.add(lawn);
  [-50, 0, 50].forEach(z => { const f = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, .8, 24), toon(0x3fd4ff)); f.position.set(70, .6, z); g.add(f); const jet = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 10), toon(0xdff8ff)); jet.position.set(70, 3.6, z); g.add(jet); });
  outline(g, .25, 0x7a5a3a);
  const r = rnd(8), pl = []; for (let z = -90; z <= 90; z += 15) [42, 100].forEach(x => pl.push([site.x + x, site.h, site.z + z, 10])); addPalms(S, pl, r);
  // لافتة اسم المعلم الطائرة فوق المبنى للتعريف
  return g;
}

// ---------- جامع السلطان قابوس الأكبر ----------
export function buildMosque(S, geo) {
  const site = geo.sites[1], g = new THREE.Group(); g.position.set(site.x, site.h, site.z); S.add(g);
  const cream = toon(0xfbf1dc), gold = toon(0xffc83a), blue = toon(0x2a7de0);
  const at = archTex('#fbf1dc', '#b08a5a', 1); at.wrapS = THREE.RepeatWrapping; at.repeat.x = 6; const am = toon(0xffffff, { map: at });
  // الأروقة حول الصحن
  [[0, 105, 220, 8], [0, -105, 220, 8], [105, 0, 8, 220], [-105, 0, 8, 220]].forEach(([x, z, w, d]) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 9, d), [am, am, cream, cream, am, am]); m.position.set(x, 4.5, z); m.castShadow = true; g.add(m); });
  const court = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), toon(0xfff8ec)); court.rotation.x = -Math.PI / 2; court.position.y = .3; g.add(court);
  // قاعة الصلاة والقبة الكبيرة
  const hall = new THREE.Mesh(new THREE.BoxGeometry(70, 22, 70), [am, am, cream, cream, am, am]); hall.position.set(-50, 11, 0); hall.castShadow = true; g.add(hall);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 10, 40), cream); drum.position.set(-50, 27, 0); g.add(drum);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(20.3, 20.3, 3, 40), blue); band.position.set(-50, 30.5, 0); g.add(band);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 40, 24, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xf4e3c0)); dome.scale.y = 1.2; dome.position.set(-50, 32, 0); dome.castShadow = true; g.add(dome);
  const gb = new THREE.Mesh(new THREE.TorusGeometry(14, 1, 8, 40), gold); gb.rotation.x = Math.PI / 2; gb.position.set(-50, 44, 0); g.add(gb);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(1.6, 9, 12), gold); fin.position.set(-50, 60, 0); g.add(fin);
  // المئذنة الرئيسية والمآذن الأربع
  const minaret = (x, z, h, r0) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0 * .8, r0, h, 12), cream); m.position.set(x, h / 2, z); m.castShadow = true; g.add(m); [.55, .82].forEach(f => { const b = new THREE.Mesh(new THREE.CylinderGeometry(r0 * 1.5, r0 * 1.1, 1.6, 12), cream); b.position.set(x, h * f, z); g.add(b); }); const tp = new THREE.Mesh(new THREE.ConeGeometry(r0 * .9, h * .12, 12), gold); tp.position.set(x, h + h * .06, z); g.add(tp); };
  minaret(100, 100, 90, 4.5); [[100, -100], [-100, 100], [-100, -100], [10, 0]].forEach(([x, z], i) => { if (i < 3) minaret(x, z, 45, 3); });
  const lawn = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), toon(0x7ed957)); lawn.rotation.x = -Math.PI / 2; lawn.position.y = .15; g.add(lawn);
  outline(g, .3, 0x7a5a3a);
  const r = rnd(9), pl = []; for (let k = -130; k <= 130; k += 20) { pl.push([site.x + 135, site.h, site.z + k, 9]); pl.push([site.x + k, site.h, site.z + 135, 9]); pl.push([site.x + k, site.h, site.z - 135, 9]); } addPalms(S, pl, r);
  return g;
}

// ---------- مطار مسقط ----------
export function buildAirport(S, geo) {
  const A = geo.air, g = new THREE.Group(); S.add(g);
  const rt = canvasTex(256, 2048, (c) => {
    c.fillStyle = '#6e7590'; c.fillRect(0, 0, 256, 2048);
    c.fillStyle = '#ffffff'; c.fillRect(10, 0, 6, 2048); c.fillRect(240, 0, 6, 2048);
    for (let y = 200; y < 1850; y += 70) c.fillRect(124, y, 8, 40);
    [30, 2018 - 120].forEach(y0 => { for (let i = 0; i < 8; i++) c.fillRect(28 + i * 26, y0, 14, 90); });
    c.font = 'bold 80px sans-serif'; c.textAlign = 'center'; c.fillText('26', 128, 2048 - 170); c.save(); c.translate(128, 210); c.rotate(Math.PI); c.fillText('08', 0, 0); c.restore();
  });
  const run = new THREE.Mesh(new THREE.PlaneGeometry(50, A.len), toon(0xffffff, { map: rt })); run.rotation.x = -Math.PI / 2; run.position.set(A.x, 3.15, A.zc); run.receiveShadow = true; g.add(run);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(80, A.len + 60), toon(0x9ae070)); sh.rotation.x = -Math.PI / 2; sh.position.set(A.x, 3.08, A.zc); g.add(sh);
  const taxi = new THREE.Mesh(new THREE.PlaneGeometry(24, A.len * .8), toon(0x5a6070)); taxi.rotation.x = -Math.PI / 2; taxi.position.set(A.x - 90, 3.12, A.zc); g.add(taxi);
  // أضواء المدرج
  const lm = new THREE.MeshBasicMaterial({ color: 0xffe08a, toneMapped: false }), lg = new THREE.SphereGeometry(.45, 8, 6), n = Math.round(A.len / 40) * 2, lights = new THREE.InstancedMesh(lg, lm, n), m4 = new THREE.Matrix4();
  for (let i = 0; i < n / 2; i++) [-1, 1].forEach((s, j) => { m4.makeTranslation(A.x + s * 27, 3.5, A.z0 - i * 40); lights.setMatrixAt(i * 2 + j, m4); });
  g.add(lights);
  // مبنى المسافرين بسقف متموّج
  const roofS = new THREE.Shape(); roofS.moveTo(0, 0); for (let i = 0; i <= 40; i++) roofS.lineTo(i * 10, 22 + Math.sin(i / 40 * Math.PI * 3) * 4); roofS.lineTo(400, 0); roofS.closePath();
  const tg = new THREE.ExtrudeGeometry(roofS, { depth: 70, bevelEnabled: false }); tg.rotateY(Math.PI / 2); tg.translate(A.x - 200, 3, A.zc + 200);
  const term = new THREE.Mesh(tg, toon(0xf4f8ff)); term.castShadow = true; g.add(term);
  const glass = new THREE.Mesh(new THREE.BoxGeometry(2, 14, 400), toon(0x3fa8ff)); glass.position.set(A.x - 164, 10, A.zc); g.add(glass);
  const twr = new THREE.Mesh(new THREE.CylinderGeometry(3, 4.5, 60, 16), toon(0xffffff)); twr.position.set(A.x - 140, 33, A.zc - 260); g.add(twr);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(8, 6, 8, 16), toon(0x2a7de0)); cab.position.set(A.x - 140, 66, A.zc - 260); g.add(cab);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 1.5, 16), toon(0xffffff)); cap.position.set(A.x - 140, 70.5, A.zc - 260); g.add(cap);
  // كمّ الرياح
  const ws = new THREE.Mesh(new THREE.ConeGeometry(1.2, 6, 12, 1, true), toon(0xff7a1a, { side: THREE.DoubleSide })); ws.rotation.z = Math.PI / 2; ws.position.set(A.x + 45, 12, A.z0 - 60); g.add(ws);
  // مهبط الهليكوبتر
  const hpT = canvasTex(256, 256, (c) => { c.fillStyle = '#5c6478'; c.beginPath(); c.arc(128, 128, 124, 0, 7); c.fill(); c.strokeStyle = '#ffd21a'; c.lineWidth = 10; c.beginPath(); c.arc(128, 128, 100, 0, 7); c.stroke(); c.fillStyle = '#fff'; c.font = 'bold 130px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('H', 128, 136); });
  const hp = new THREE.Mesh(new THREE.CircleGeometry(16, 40), toon(0xffffff, { map: hpT, transparent: true })); hp.rotation.x = -Math.PI / 2; hp.position.set(A.x - 60, 3.3, A.z0 - 200); g.add(hp);
  A.heli = new THREE.Vector3(A.x - 60, 3.3, A.z0 - 200);
  outline(g, .3, 0x4a5a70);
  return g;
}

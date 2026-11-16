// المركبات الصحراوية: دفع رباعي، باجي، دراجة رباعية — الاتجاه الأمامي هو ‎-z
import * as THREE from 'three';
import { RoundedBoxGeometry } from './vendor/jsm/geometries/RoundedBoxGeometry.js';
import { toon, outline } from './toon.js';
import { buildKid } from './kid.js';
import { canvasTex } from './util.js';

const PI = Math.PI;
const rb = (w, h, d, r, mat) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, r), mat); m.castShadow = true; return m; };
const box = (w, h, d, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.castShadow = true; return m; };
function tube(a, b, rad, mat) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), m = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, d.length(), 8), mat);
  m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; return m;
}
function wheel(R, w, hubHex) {
  const g = new THREE.Group(), spin = new THREE.Group(); g.add(spin);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(R, R, w, 22), toon(0x3d3d48)); tire.rotation.z = PI / 2; tire.castShadow = true; spin.add(tire);
  const tm = toon(0x24242b);
  for (let i = 0; i < 12; i++) { const a = i / 12 * PI * 2, t = new THREE.Mesh(new THREE.BoxGeometry(w * 1.04, .09, R * .3), tm); t.position.set(0, Math.cos(a) * R, Math.sin(a) * R); t.rotation.x = a; t.userData.noOut = 1; spin.add(t); }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(R * .56, R * .56, w * 1.06, 14), toon(hubHex)); hub.rotation.z = PI / 2; spin.add(hub);
  [0, PI / 2].forEach(a => { const s = new THREE.Mesh(new THREE.BoxGeometry(w * 1.1, R * 1.0, R * .16), toon(0x3a3a44)); s.rotation.x = a; s.userData.noOut = 1; spin.add(s); });
  g.userData.spin = spin; g.userData.R = R;
  return g;
}
function addWheels(g, u, list) {
  u.wheels = []; u.front = []; u.rear = [];
  list.forEach(([x, z, R, w, hub, front]) => { const st = new THREE.Group(); st.position.set(x, R, z); const wh = wheel(R, w, hub); st.add(wh); g.add(st); u.wheels.push(wh); if (front) u.front.push(st); else u.rear.push(new THREE.Vector3(x, .1, z + R)); });
}
function seatKid(body, kidType, y, z, s) {
  const k = buildKid(kidType, { bust: true }); k.rotation.y = PI; k.scale.setScalar(s); k.position.set(0, y - .58 * s, z);
  const ku = k.userData; ku.armL.sh.rotation.set(-1.15, 0, .12); ku.armR.sh.rotation.set(-1.15, 0, -.12); ku.armL.el.rotation.x = -.35; ku.armR.el.rotation.x = -.35;
  body.add(k); return k;
}
function pennant(h = 2.2) {
  const g = new THREE.Group(), p = new THREE.Mesh(new THREE.CylinderGeometry(.018, .022, h, 5), toon(0x2a2a31)); p.position.y = h / 2; p.userData.noOut = 1; g.add(p);
  const t = canvasTex(96, 64, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 96, 22); c.fillStyle = '#db161b'; c.fillRect(0, 22, 96, 21); c.fillStyle = '#008000'; c.fillRect(0, 43, 96, 21); c.fillStyle = '#db161b'; c.fillRect(0, 0, 30, 64); });
  const f = new THREE.Mesh(new THREE.PlaneGeometry(.6, .4), toon(0xffffff, { map: t, side: THREE.DoubleSide })); f.position.set(0, h - .22, .32); f.rotation.y = PI / 2; f.userData.noOut = 1; g.add(f); g.userData.flag = f;
  return g;
}
const lamp = (r, hex) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), new THREE.MeshBasicMaterial({ color: hex, toneMapped: false })); m.userData.noOut = 1; return m; };

// ---------- سيارة الدفع الرباعي ----------
function buildJeep(kidType) {
  const g = new THREE.Group(), u = g.userData, body = new THREE.Group(); g.add(body); u.body = body;
  const wht = toon(0xfafaf6), red = toon(0xd61f2c), grn = toon(0x129a4a), dark = toon(0x2c2f38), org = toon(0xff8a1f), chrome = toon(0xd8dce4);
  const tub = rb(2.0, .78, 4.1, .2, wht); tub.position.y = 1.0; body.add(tub);
  const hood = rb(1.86, .34, 1.5, .14, wht); hood.position.set(0, 1.5, -1.25); body.add(hood);
  const s1 = box(2.03, .15, 4.0, red); s1.position.y = 1.08; s1.userData.noOut = 1; body.add(s1);
  const s2 = box(2.03, .1, 4.0, grn); s2.position.y = .9; s2.userData.noOut = 1; body.add(s2);
  [-1, 1].forEach(s => [-1.35, 1.35].forEach(z => { const f = rb(.5, .14, 1.35, .06, org); f.position.set(s * 1.05, 1.16, z); body.add(f); }));
  const bump = rb(2.15, .26, .3, .1, chrome); bump.position.set(0, .78, -2.12); body.add(bump);
  const bump2 = rb(2.15, .26, .3, .1, chrome); bump2.position.set(0, .78, 2.12); body.add(bump2);
  const grille = box(1.2, .3, .06, dark); grille.position.set(0, 1.35, -2.03); grille.userData.noOut = 1; body.add(grille);
  [-1, 1].forEach(s => { const l = lamp(.17, 0xfff2a0); l.position.set(s * .72, 1.36, -2.04); body.add(l); const t = lamp(.11, 0xff3020); t.position.set(s * .8, 1.2, 2.06); body.add(t); });
  // الزجاج الأمامي
  const fr = tube([-.92, 1.55, -.55], [-.86, 2.25, -.3], .05, dark), fr2 = tube([.92, 1.55, -.55], [.86, 2.25, -.3], .05, dark), fr3 = tube([-.86, 2.25, -.3], [.86, 2.25, -.3], .05, dark); body.add(fr, fr2, fr3);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.74, .72), new THREE.MeshBasicMaterial({ color: 0xbfe8ff, transparent: true, opacity: .28, side: THREE.DoubleSide, depthWrite: false })); glass.position.set(0, 1.9, -.425); glass.rotation.x = -.34; body.add(glass);
  // قفص الحماية والأضواء
  [.5, 1.6].forEach(z => { const a = tube([-.92, 1.35, z], [-.84, 2.5, z], .06, org), b = tube([.92, 1.35, z], [.84, 2.5, z], .06, org), c = tube([-.84, 2.5, z], [.84, 2.5, z], .06, org); body.add(a, b, c); });
  [-1, 1].forEach(s => body.add(tube([s * .84, 2.5, .5], [s * .84, 2.5, 1.6], .06, org)));
  for (let i = 0; i < 4; i++) { const l = lamp(.13, 0xfff2a0); l.position.set(-.54 + i * .36, 2.66, .5); body.add(l); }
  // المقاعد والمقود
  const seat = rb(.9, .9, .22, .08, red); seat.position.set(0, 1.75, .42); body.add(seat);
  const floor = box(1.7, .1, 2.2, dark); floor.position.set(0, 1.36, .7); floor.userData.noOut = 1; body.add(floor);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 8, 18), dark); sw.position.set(0, 1.86, -.28); sw.rotation.x = -.5; body.add(sw);
  u.kid = seatKid(body, kidType, 1.42, .15, 1.36);
  // العجلة الاحتياطية وعلم
  const sp = wheel(.44, .3, 0xd8dce4); sp.rotation.y = PI / 2; sp.position.set(0, 1.42, 2.28); body.add(sp);
  const cvT = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 62, 0, 7); c.fill(); c.lineWidth = 12; c.strokeStyle = '#db161b'; c.beginPath(); c.arc(64, 64, 52, 0, 7); c.stroke(); c.strokeStyle = '#108a40'; c.lineWidth = 8; c.beginPath(); c.arc(64, 64, 38, 0, 7); c.stroke(); c.fillStyle = '#ff8a1f'; c.beginPath(); for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 11 : 26; c.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); } c.fill(); });
  const cv = new THREE.Mesh(new THREE.CircleGeometry(.4, 24), toon(0xffffff, { map: cvT })); cv.position.set(0, 1.42, 2.45); cv.userData.noOut = 1; body.add(cv);
  const tail = box(1.9, .5, .05, wht); tail.position.set(0, 1.12, 2.06); tail.userData.noOut = 1; body.add(tail);
  const can = rb(.26, .44, .34, .05, red); can.position.set(.72, 1.62, 1.9); body.add(can);
  const pn = pennant(2.3); pn.position.set(-.86, 1.4, 1.9); body.add(pn); u.flag = pn;
  const ex = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .5, 8), chrome); ex.rotation.x = PI / 2; ex.position.set(.6, .7, 2.2); body.add(ex);
  addWheels(g, u, [[-1.08, -1.35, .54, .42, 0xd8dce4, 1], [1.08, -1.35, .54, .42, 0xd8dce4, 1], [-1.08, 1.35, .54, .42, 0xd8dce4, 0], [1.08, 1.35, .54, .42, 0xd8dce4, 0]]);
  u.len = 4.2; u.camH = 1;
  return g;
}

// ---------- الباجي الصحراوي ----------
function buildBuggy(kidType) {
  const g = new THREE.Group(), u = g.userData, body = new THREE.Group(); g.add(body); u.body = body;
  const org = toon(0xff7a1a), blue = toon(0x1d6fe0), dark = toon(0x2a2c34), chrome = toon(0xd8dce4), yel = toon(0xffd21a);
  const pan = rb(1.3, .3, 3.3, .12, org); pan.position.set(0, .72, -.1); body.add(pan);
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(.16, .7, 1.5, 4, 1), org); nose.rotation.set(-PI / 2, 0, PI / 4, 'YXZ'); nose.rotation.x = -PI / 2; nose.scale.set(1, 1, .5); nose.position.set(0, .82, -2.3); nose.castShadow = true; body.add(nose);
  const num = canvasTex(128, 128, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill(); c.fillStyle = '#1d6fe0'; c.font = '900 84px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('7', 64, 70); });
  [-1, 1].forEach(s => { const side = rb(.1, .62, 2.0, .04, blue); side.position.set(s * .7, 1.1, .1); body.add(side); const n = new THREE.Mesh(new THREE.CircleGeometry(.24, 20), new THREE.MeshBasicMaterial({ map: num, toneMapped: false })); n.position.set(s * .76, 1.12, .1); n.rotation.y = s * PI / 2; n.userData.noOut = 1; body.add(n); });
  // القفص الأنبوبي
  const P = { fl: [-.66, .9, -.75], fr: [.66, .9, -.75], bl: [-.66, .9, 1.05], br: [.66, .9, 1.05], tfl: [-.56, 2.25, -.2], tfr: [.56, 2.25, -.2], tbl: [-.56, 2.25, .8], tbr: [.56, 2.25, .8] };
  [['fl', 'tfl'], ['fr', 'tfr'], ['bl', 'tbl'], ['br', 'tbr'], ['tfl', 'tfr'], ['tbl', 'tbr'], ['tfl', 'tbl'], ['tfr', 'tbr']].forEach(([a, b]) => body.add(tube(P[a], P[b], .06, blue)));
  body.add(tube([-.6, .9, -.75], [-.2, .9, -2.6], .05, blue), tube([.6, .9, -.75], [.2, .9, -2.6], .05, blue), tube(P.tbl, [-.5, 1.1, 1.9], .05, blue), tube(P.tbr, [.5, 1.1, 1.9], .05, blue));
  for (let i = 0; i < 3; i++) { const l = lamp(.14, 0xfff2a0); l.position.set(-.36 + i * .36, 2.42, -.2); body.add(l); }
  // المحرك والعادم والجناح
  const eng = rb(1.0, .6, .9, .1, dark); eng.position.set(0, 1.0, 1.55); body.add(eng);
  [-1, 1].forEach(s => { const ex = tube([s * .3, 1.2, 1.7], [s * .36, 1.75, 2.3], .07, chrome); body.add(ex); });
  const wing = rb(1.7, .08, .5, .03, yel); wing.position.set(0, 2.0, 1.95); body.add(wing);
  [-1, 1].forEach(s => { const e = box(.06, .4, .5, yel); e.position.set(s * .85, 1.95, 1.95); body.add(e); });
  // المقعد والمقود
  const seat = rb(.8, .95, .2, .08, dark); seat.position.set(0, 1.4, .68); body.add(seat);
  const sw = new THREE.Mesh(new THREE.TorusGeometry(.19, .035, 8, 18), dark); sw.position.set(0, 1.5, -.3); sw.rotation.x = -.6; body.add(sw);
  u.kid = seatKid(body, kidType, 1.02, .38, 1.34);
  // أذرع التعليق
  [[-1, -1.55, 1.08], [1, -1.55, 1.08], [-1, 1.3, 1.22], [1, 1.3, 1.22]].forEach(([s, z, x]) => { body.add(tube([s * .5, .75, z - .2], [s * x, .5, z], .04, chrome), tube([s * .5, .75, z + .2], [s * x, .5, z], .04, chrome)); });
  const pn = pennant(2.0); pn.position.set(.56, 2.25, .8); body.add(pn); u.flag = pn;
  addWheels(g, u, [[-1.08, -1.55, .44, .32, 0xffd21a, 1], [1.08, -1.55, .44, .32, 0xffd21a, 1], [-1.22, 1.3, .6, .5, 0xffd21a, 0], [1.22, 1.3, .6, .5, 0xffd21a, 0]]);
  u.len = 4; u.camH = .9;
  return g;
}

// ---------- الدراجة الرباعية ----------
function buildQuad(kidType) {
  const g = new THREE.Group(), u = g.userData, body = new THREE.Group(); g.add(body); u.body = body;
  const red = toon(0xe0202c), dark = toon(0x2a2c34), chrome = toon(0xd8dce4), wht = toon(0xfafaf6), grn = toon(0x129a4a);
  const core = rb(.7, .6, 2.0, .14, dark); core.position.set(0, .82, 0); body.add(core);
  const ff = rb(1.7, .16, .95, .07, red); ff.position.set(0, 1.12, -.82); ff.rotation.x = .1; body.add(ff);
  const rf = rb(1.7, .16, 1.0, .07, red); rf.position.set(0, 1.12, .86); rf.rotation.x = -.08; body.add(rf);
  const nose = rb(.78, .46, .6, .14, red); nose.position.set(0, 1.12, -1.15); body.add(nose);
  const st = box(.8, .08, .1, wht); st.position.set(0, 1.25, -1.44); st.userData.noOut = 1; body.add(st);
  const st2 = box(.8, .06, .1, grn); st2.position.set(0, 1.14, -1.45); st2.userData.noOut = 1; body.add(st2);
  [-1, 1].forEach(s => { const l = lamp(.13, 0xfff2a0); l.position.set(s * .22, 1.02, -1.46); body.add(l); const gd = rb(.14, .5, 1.1, .05, red); gd.position.set(s * .44, .98, .05); body.add(gd); const ft = box(.3, .06, .7, dark); ft.position.set(s * .58, .62, .05); body.add(ft); });
  const tank = rb(.6, .34, .7, .14, red); tank.position.set(0, 1.26, -.3); body.add(tank);
  const seat = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .7, 6, 12), dark); seat.rotation.x = PI / 2; seat.scale.set(1.15, 1, .6); seat.position.set(0, 1.3, .45); seat.castShadow = true; body.add(seat);
  // المقود
  body.add(tube([0, 1.3, -.62], [0, 1.78, -.46], .05, chrome), tube([-.62, 1.8, -.42], [.62, 1.8, -.42], .045, chrome));
  [-1, 1].forEach(s => { const gr = new THREE.Mesh(new THREE.CapsuleGeometry(.06, .16, 4, 8), dark); gr.rotation.z = PI / 2; gr.position.set(s * .6, 1.8, -.42); body.add(gr); });
  // حامل خلفي
  const rack = box(1.0, .05, .6, chrome); rack.position.set(0, 1.28, 1.05); body.add(rack);
  const bag = rb(.7, .3, .44, .1, toon(0xc98a3a)); bag.position.set(0, 1.46, 1.05); body.add(bag);
  u.kid = seatKid(body, kidType, 1.5, .3, 1.36);
  u.kid.userData.armL.sh.rotation.set(-1.0, 0, .42); u.kid.userData.armR.sh.rotation.set(-1.0, 0, -.42);
  const pn = pennant(2.1); pn.position.set(.42, 1.3, 1.25); body.add(pn); u.flag = pn;
  addWheels(g, u, [[-.74, -.86, .48, .46, 0xe8e8ee, 1], [.74, -.86, .48, .46, 0xe8e8ee, 1], [-.74, .86, .5, .5, 0xe8e8ee, 0], [.74, .86, .5, .5, 0xe8e8ee, 0]]);
  u.len = 2.6; u.camH = .8;
  return g;
}

export function buildVehicle(kind, kidType) {
  const g = kind === 'buggy' ? buildBuggy(kidType) : kind === 'quad' ? buildQuad(kidType) : buildJeep(kidType);
  g.userData.kind = kind; g.rotation.order = 'YXZ';
  outline(g, .022);
  return g;
}
export function animVehicle(v, t, dt, speed, steer, air) {
  const u = v.userData;
  u.wheels.forEach(w => { w.userData.spin.rotation.x -= speed * dt / w.userData.R; });
  u.front.forEach(f => { f.rotation.y = -steer * .38; });
  const k = Math.min(1, speed / 30);
  u.body.position.y = air ? 0 : Math.sin(t * 19) * .025 * k + Math.sin(t * 7.3) * .02 * k;
  u.body.rotation.z = steer * .07; u.body.rotation.x = air ? 0 : Math.sin(t * 5.1) * .012 * k;
  if (u.flag) u.flag.rotation.x = .12 + k * .25 + Math.sin(t * 9) * .05;
  if (u.kid) u.kid.userData.head.rotation.set(Math.sin(t * 6) * .03 * k, steer * -.25, 0);
}

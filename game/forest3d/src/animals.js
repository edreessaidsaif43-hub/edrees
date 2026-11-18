// حيوانات الغابة الكرتونية — الاتجاه الأمامي لكل حيوان هو ‎+z
import * as THREE from 'three';
import { toon, outline } from './toon.js';
import { canvasTex } from './util.js';

const PI = Math.PI;
const M = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const pivot = (parent, x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p); return p; };
const wM = toon(0xffffff), kM = new THREE.MeshBasicMaterial({ color: 0x1a1214 }), hiM = new THREE.MeshBasicMaterial({ color: 0xffffff });

// عينان كبيرتان لامعتان
function eyes(head, r, x, y, z, rot = .35) {
  const out = [];
  [-1, 1].forEach(s => {
    const g = pivot(head, s * x, y, z); g.rotation.y = s * rot;
    const w = M(sph(r, 14, 10), wM); w.userData.noOut = 1; w.castShadow = false; g.add(w);
    const p = M(sph(r * .72, 14, 10), kM, 0, r * .05, r * .42); p.userData.noOut = 1; p.castShadow = false; g.add(p);
    const h = M(sph(r * .24, 8, 6), hiM, r * .2 * -s, r * .32, r * .9); h.userData.noOut = 1; h.castShadow = false; g.add(h);
    out.push(g);
  });
  return out;
}
function blink(r, t) { const k = (t + r.userData.blinkOff) % 4.2, s = k < .13 ? .12 : 1; r.userData.eyes.forEach(e => e.scale.y = s); }

// ---------- رباعي الأرجل عام ----------
function quad(o) {
  const root = new THREE.Group(), torso = pivot(root, 0, 0, 0), u = root.userData;
  const bm = toon(o.col), lm = toon(o.legCol || o.col), bY = o.legH + o.body[1] * .55;
  const body = M(sph(1, 20, 14), o.bodyMat || bm, 0, bY, 0); body.scale.set(...o.body); torso.add(body);
  if (o.belly) { const b = M(sph(1, 16, 12), toon(o.belly), 0, bY - o.body[1] * .28, 0); b.scale.set(o.body[0] * .82, o.body[1] * .78, o.body[2] * .9); b.userData.noOut = 1; torso.add(b); }
  u.legs = [];
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => {
    const p = pivot(torso, sx * o.body[0] * .52, o.legH + o.body[1] * .15, sz * o.body[2] * .58);
    const L = o.legH + o.body[1] * .15, leg = M(new THREE.CapsuleGeometry(o.legR, L - o.legR * 2, 4, 10), lm, 0, -L / 2 + o.legR * .2, 0); p.add(leg);
    if (o.hoof) { const h = M(new THREE.CylinderGeometry(o.legR * 1.05, o.legR * 1.15, o.legR * 1.6, 10), toon(o.hoof), 0, -L + o.legR * .6, 0); p.add(h); }
    u.legs.push(p);
  });
  // الرقبة والرأس
  const nk = pivot(torso, 0, bY + o.body[1] * .35, o.body[2] * .72); nk.rotation.x = o.neckTilt; u.neck = nk; u.neck0 = o.neckTilt;
  if (o.neckL > 0) { const n = M(new THREE.CapsuleGeometry(o.neckR, o.neckL, 4, 10), o.neckMat || bm, 0, o.neckL / 2, 0); nk.add(n); }
  const hp = pivot(nk, 0, o.neckL + o.neckR * .4, 0); hp.rotation.x = -o.neckTilt; u.head = hp;
  const hd = M(sph(o.headR, 18, 14), o.headMat || bm); hd.scale.set(1, .92, 1.05); hp.add(hd);
  if (o.snout) { const sn = M(sph(o.snout[0], 14, 10), toon(o.snout[2] || o.col), 0, -o.headR * .2, o.headR * .7); sn.scale.set(1, .8, o.snout[1]); hp.add(sn); const no = M(sph(o.snout[0] * .32, 10, 8), kM, 0, -o.headR * .12 + o.snout[0] * .3, o.headR * .7 + o.snout[0] * o.snout[1] * .92); no.userData.noOut = 1; hp.add(no); }
  u.eyes = eyes(hp, o.eyeR, o.headR * .48, o.headR * .22, o.headR * .72, o.eyeRot || .45);
  u.ears = [];
  [-1, 1].forEach(s => { const ep = pivot(hp, s * o.headR * .55, o.headR * .65, -o.headR * .1); ep.rotation.z = -s * (o.earTilt || .5); const e = M(new THREE.ConeGeometry(o.ear[1], o.ear[0], 10), toon(o.earCol || o.col), 0, o.ear[0] / 2, 0); e.scale.z = .45; ep.add(e); if (o.earIn) { const ei = M(new THREE.ConeGeometry(o.ear[1] * .6, o.ear[0] * .78, 8), toon(o.earIn), 0, o.ear[0] * .42, o.ear[1] * .14); ei.scale.z = .3; ei.userData.noOut = 1; ep.add(ei); } u.ears.push(ep); });
  // الذيل
  const tp = pivot(torso, 0, bY + o.body[1] * .3, -o.body[2] * .92); u.tail = tp;
  if (o.tail === 'bushy') { const t = M(sph(.5, 14, 10), toon(o.col), 0, -.1, -o.tailL * .55); t.scale.set(o.tailR, o.tailR, o.tailL); tp.add(t); const tip = M(sph(.5, 12, 8), toon(0xffffff), 0, -.1, -o.tailL * 1.0); tip.scale.setScalar(o.tailR * .8); tp.add(tip); tp.rotation.x = .5; }
  else if (o.tail === 'long') { const t = M(new THREE.CapsuleGeometry(o.tailR, o.tailL, 4, 8), toon(o.tailCol || o.col), 0, 0, -o.tailL / 2); t.rotation.x = PI / 2; tp.add(t); tp.rotation.x = 1.1; }
  else { const t = M(new THREE.CapsuleGeometry(o.tailR, o.tailL, 4, 8), toon(o.tailCol || o.col), 0, -o.tailL / 2, 0); tp.add(t); tp.rotation.x = -.4; }
  Object.assign(u, { torso, body, bY, legH: o.legH, blinkOff: Math.random() * 4 });
  return root;
}

// ---------- الأنواع ----------
function hornCurve(len, rad, col, back = 1.2, rings) {
  const pts = []; for (let i = 0; i <= 12; i++) { const k = i / 12, a = k * back; pts.push(new THREE.Vector3(0, Math.sin(a) * len / back * 1.0, -(1 - Math.cos(a)) * len / back)); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, rad, 8); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = Math.min(1, Math.max(0, (p.getY(i)) / (len * .9))); } // تدرّج بسيط
  return M(g, toon(col));
}
export function buildGazelle() {
  const r = quad({ body: [.52, .56, 1.1], col: 0xdca668, belly: 0xfff6ea, legH: 1.25, legR: .1, hoof: 0x3a2a24, neckL: .95, neckR: .2, neckTilt: .55, headR: .42, snout: [.24, 1.4, 0xe8b880], eyeR: .14, ear: [.6, .16], earIn: 0xffd0c0, earTilt: .9, tail: 'short', tailL: .3, tailR: .07, tailCol: 0x3a2a24 });
  const u = r.userData;
  [-1, 1].forEach(s => { const h = hornCurve(.95, .055, 0x3a2a24, 1.1); h.position.set(s * .15, .32, -.05); h.rotation.z = s * -.12; u.head.add(h); const st = M(sph(1, 12, 8), toon(0x8a5a3a), s * .035, u.bY - .12, 0); st.scale.set(.5, .07, 1.0); st.userData.noOut = 1; u.torso.add(st); const fs = M(sph(.1, 8, 6), toon(0xffffff), s * .19, .02, .25); fs.scale.set(.6, .8, 3); fs.userData.noOut = 1; u.head.add(fs); });
  outline(r, .025); r.userData.kind = 'gazelle'; return r;
}
export function buildIbex() {
  const r = quad({ body: [.72, .72, 1.2], col: 0xa8865e, belly: 0xe8dcc8, legH: 1.0, legR: .13, legCol: 0x8a6a4a, hoof: 0x2a2220, neckL: .7, neckR: .26, neckTilt: .45, headR: .44, snout: [.25, 1.3, 0xb89870], eyeR: .13, ear: [.42, .13], earTilt: 1.2, tail: 'short', tailL: .25, tailR: .08, tailCol: 0x5a4030 });
  const u = r.userData;
  [-1, 1].forEach(s => { const h = hornCurve(2.2, .1, 0x6a5a48, 2.6); h.position.set(s * .17, .3, 0); h.rotation.z = s * -.1; u.head.add(h); for (let i = 0; i < 7; i++) { const a = .15 + i * .3, rr = M(new THREE.TorusGeometry(.105, .03, 6, 10), toon(0x4a3e32)); const len = 2.2, b = 2.6; rr.position.set(s * .17, .3 + Math.sin(a) * len / b, -(1 - Math.cos(a)) * len / b); rr.rotation.x = a + PI / 2; rr.userData.noOut = 1; u.head.add(rr); } });
  const bd = M(new THREE.ConeGeometry(.12, .5, 8), toon(0x5a4030), 0, -.55, .5); bd.rotation.x = PI; u.head.add(bd);
  outline(r, .025); r.userData.kind = 'ibex'; return r;
}
export function buildFox() {
  const r = quad({ body: [.48, .48, .95], col: 0xf0782a, belly: 0xfff4e8, legH: .62, legR: .09, legCol: 0x3a2a2a, neckL: .25, neckR: .22, neckTilt: .6, headR: .46, snout: [.22, 1.9, 0xfff4e8], eyeR: .13, eyeRot: .4, ear: [.62, .24], earIn: 0xfff0e0, earTilt: .3, tail: 'bushy', tailL: 1.3, tailR: .38 });
  const u = r.userData; const ch = M(sph(.3, 12, 10), toon(0xfff4e8), 0, u.bY + .1, .7); ch.scale.set(1, 1.1, .8); u.torso.add(ch);
  [-1, 1].forEach(s => { const c = M(sph(.2, 10, 8), toon(0xfff4e8), s * .22, -.15, .22); c.scale.set(1, .8, 1.2); c.userData.noOut = 1; u.head.add(c); });
  outline(r, .022); r.userData.kind = 'fox'; return r;
}
function spotTex() { return canvasTex(256, 128, (c) => { c.fillStyle = '#f4c052'; c.fillRect(0, 0, 256, 128); for (let i = 0; i < 70; i++) { const x = Math.random() * 256, y = Math.random() * 128, r = 4 + Math.random() * 4; c.fillStyle = '#5a3a1a'; for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(x + Math.cos(k * 1.26) * r, y + Math.sin(k * 1.26) * r, r * .45, 0, 7); c.fill(); } c.fillStyle = '#d89a3a'; c.beginPath(); c.arc(x, y, r * .55, 0, 7); c.fill(); } }); }
export function buildLeopard() {
  const st = spotTex(), sm = toon(0xffffff, { map: st });
  const r = quad({ body: [.62, .58, 1.45], col: 0xf4c052, bodyMat: sm, neckMat: sm, headMat: sm, belly: 0xfff4e0, legH: .85, legR: .15, legCol: 0xf0bc50, neckL: .3, neckR: .3, neckTilt: .4, headR: .5, snout: [.26, 1.1, 0xfff4e0], eyeR: .13, ear: [.28, .2], earIn: 0x5a3a1a, earTilt: .7, tail: 'long', tailL: 2, tailR: .12 });
  outline(r, .025); r.userData.kind = 'leopard'; return r;
}
export function buildHare() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(0xc9a882), lt = toon(0xfff6ee);
  const body = M(sph(.55, 16, 12), c, 0, .52, 0); body.scale.set(.85, .85, 1.1); torso.add(body);
  const bl = M(sph(.45, 12, 10), lt, 0, .42, .12); bl.scale.set(.8, .75, 1); bl.userData.noOut = 1; torso.add(bl);
  const hp = pivot(torso, 0, .95, .48); u.head = hp; const hd = M(sph(.36, 16, 12), c); hd.scale.set(1, .95, 1.1); hp.add(hd);
  const mz = M(sph(.16, 10, 8), lt, 0, -.12, .3); mz.scale.set(1.2, .8, .8); hp.add(mz); const no = M(sph(.06, 8, 6), toon(0xff8aa0), 0, -.04, .43); no.userData.noOut = 1; hp.add(no);
  u.eyes = eyes(hp, .1, .2, .08, .24, .6); u.ears = [];
  [-1, 1].forEach(s => { const ep = pivot(hp, s * .14, .25, -.05); ep.rotation.set(-.25, 0, -s * .18); const e = M(new THREE.CapsuleGeometry(.1, .75, 4, 10), c, 0, .45, 0); e.scale.z = .5; ep.add(e); const ei = M(new THREE.CapsuleGeometry(.06, .6, 4, 8), toon(0xffc8d0), 0, .45, .04); ei.scale.z = .3; ei.userData.noOut = 1; ep.add(ei); u.ears.push(ep); });
  u.legs = []; [[-1, .35, .15, .12], [1, .35, .15, .12], [-1, -.3, .24, .2], [1, -.3, .24, .2]].forEach(([s, z, len, rr]) => { const p = pivot(torso, s * .3, .3, z); const l = M(new THREE.CapsuleGeometry(rr * .7, len, 4, 8), c, 0, -.15, z < 0 ? .1 : 0); if (z < 0) { l.rotation.x = PI / 2; l.position.set(0, -.2, .12); } p.add(l); u.legs.push(p); });
  const tp = pivot(torso, 0, .62, -.6); u.tail = tp; tp.add(M(sph(.17, 10, 8), lt));
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'hare' }); outline(root, .02); return root;
}
export function buildHedgehog() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0);
  const sp = M(new THREE.SphereGeometry(.55, 18, 12, 0, PI * 2, 0, PI * .62), toon(0x7a5a42), 0, .35, -.05); sp.scale.set(1, .85, 1.15); torso.add(sp);
  const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(.07, .3, 5), toon(0x5a3e2c), 70), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(); let k = 0;
  for (let i = 0; i < 70; i++) { const th = Math.acos(1 - Math.random() * 1.35), ph = Math.random() * PI * 2; const n = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph) * 1.15 - .05); if (n.z > .7) continue; v.set(n.x * .55, .35 + n.y * .47, n.z * .6 - .05); q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n.clone().normalize()); m4.compose(v, q, new THREE.Vector3(1, 1, 1)); cones.setMatrixAt(k++, m4); }
  cones.count = k; cones.castShadow = true; cones.userData.noOut = 1; torso.add(cones);
  const hp = pivot(torso, 0, .3, .5); u.head = hp; const hd = M(sph(.3, 14, 10), toon(0xf0dcc0)); hd.scale.set(.9, .85, 1.2); hp.add(hd);
  const sn = M(new THREE.ConeGeometry(.15, .35, 10), toon(0xf0dcc0), 0, -.05, .38); sn.rotation.x = PI / 2; hp.add(sn); const no = M(sph(.07, 8, 6), kM, 0, -.05, .56); no.userData.noOut = 1; hp.add(no);
  u.eyes = eyes(hp, .07, .14, .08, .2, .5); u.ears = [];
  u.legs = []; [[-1, .25], [1, .25], [-1, -.3], [1, -.3]].forEach(([s, z]) => { const p = pivot(torso, s * .3, .16, z); p.add(M(new THREE.CapsuleGeometry(.06, .08, 3, 6), toon(0xd8c0a0), 0, -.08, 0)); u.legs.push(p); });
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'hedgehog' }); outline(root, .02); return root;
}
export function buildTurtle() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0);
  const st = canvasTex(256, 128, (c) => { c.fillStyle = '#5a9a3a'; c.fillRect(0, 0, 256, 128); c.strokeStyle = '#2f5a24'; c.lineWidth = 5; for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) { const cx = x * 46 + (y % 2) * 23, cy = y * 44 + 10; c.fillStyle = (x + y) % 2 ? '#7ab84a' : '#6aa840'; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; c.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 18); } c.closePath(); c.fill(); c.stroke(); } });
  const sh = M(new THREE.SphereGeometry(.8, 20, 12, 0, PI * 2, 0, PI / 2), toon(0xffffff, { map: st }), 0, .25, 0); sh.scale.set(1, .75, 1.15); torso.add(sh);
  const rim = M(new THREE.CylinderGeometry(.82, .82, .14, 22), toon(0xe0c070), 0, .25, 0); rim.scale.z = 1.15; torso.add(rim);
  const hp = pivot(torso, 0, .32, .85); u.head = hp; const hd = M(sph(.27, 14, 10), toon(0x9ac860)); hd.scale.set(1, .85, 1.2); hp.add(hd);
  u.eyes = eyes(hp, .08, .14, .08, .2, .55); u.ears = [];
  u.legs = []; [[-1, .55], [1, .55], [-1, -.55], [1, -.55]].forEach(([s, z]) => { const p = pivot(torso, s * .62, .2, z); p.add(M(sph(.17, 10, 8), toon(0x9ac860), 0, -.06, 0)); u.legs.push(p); });
  const smile = M(new THREE.TorusGeometry(.08, .015, 6, 12, PI), kM, 0, -.08, .3); smile.rotation.z = PI; smile.userData.noOut = 1; hp.add(smile);
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'turtle', hide: 0 }); outline(root, .02); return root;
}
// طيور: [لون الجسم، لون الرأس، الحجم، طول المنقار، لون المنقار، طول الساق، طول الرقبة، لون الجناح]
const BIRDS = {
  hoopoe: [0xf0a050, 0xf0a050, .9, .5, 0x2a2224, .24, 0, 0x2a2224], beeeater: [0x3ac85a, 0x3ac85a, .75, .28, 0x2a2224, .24, 0], bulbul: [0x8a7a6a, 0x2a2224, .7, .28, 0x2a2224, .24, 0], sunbird: [0x5a4ac8, 0x5a4ac8, .55, .5, 0x2a2224, .24, 0], duck: [0xf4ead8, 0x2a9a5a, 1.3, 0, 0xffb21a, 0, 0, 0xc8b8a0],
  falcon: [0x8a7a6a, 0xf0e6d6, 1.05, .18, 0xffc21a, .26, 0, 0x6a5a4a], sandgrouse: [0xd8b080, 0xe0a860, .8, .14, 0x6a5a4a, .14, 0, 0xc89a68], gull: [0xffffff, 0xffffff, 1.05, .3, 0xffc21a, .32, 0, 0xb8c4d0],
  heron: [0xb8c2cc, 0xffffff, 1.15, .6, 0xffb21a, 1.25, .8, 0x8a96a4], flamingo: [0xff9ab8, 0xff9ab8, 1.25, .34, 0xfff0f0, 1.6, 1.0, 0xff6a90], hen: [0xc8743a, 0xc8743a, .95, .15, 0xffc21a, .26, 0, 0xa85a2a], rooster: [0xa8401a, 0xf0a030, 1.1, .16, 0xffc21a, .3, 0, 0x2a6a4a],
  partridge: [0xb8b0a8, 0xe0d0b8, .85, .14, 0xe8302a, .2, 0, 0x9a9088], eagle: [0x6a4a2a, 0xe8dcc8, 1.5, .26, 0xffc21a, .26, 0, 0x5a3a1e]
};
export function buildBird(type) {
  const P = BIRDS[type], s = P[2], root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), bm = toon(P[0]);
  const lift = Math.max(0, P[5] - .24) * s, bY = .42 * s + lift;
  const body = M(sph(.36 * s, 14, 10), bm, 0, bY, 0); body.scale.set(1, .9, 1.35); torso.add(body);
  let hp;
  if (P[6]) { // رقبة طويلة
    const nk = pivot(torso, 0, bY + .15 * s, .32 * s); nk.rotation.x = .25; const n = M(new THREE.CapsuleGeometry(.07 * s, P[6] * s, 4, 8), toon(P[1]), 0, P[6] * s / 2, 0); nk.add(n);
    hp = pivot(nk, 0, P[6] * s + .05 * s, 0); hp.rotation.x = -.25; u.neck = nk; u.neck0 = .25;
  } else hp = pivot(torso, 0, bY + .36 * s, .32 * s);
  u.head = hp; const hd = M(sph(.24 * s * (P[6] ? .75 : 1), 14, 10), toon(P[1])); hp.add(hd);
  let bk;
  if (type === 'duck') { bk = M(sph(.12 * s, 10, 8), toon(P[4]), 0, -.04 * s, .25 * s); bk.scale.set(1.3, .45, 1.6); }
  else if (type === 'flamingo') { bk = M(new THREE.CapsuleGeometry(.05 * s, P[3] * s, 4, 8), toon(P[4]), 0, -.12 * s, .16 * s); bk.rotation.x = 2.3; const tip = M(sph(.055 * s, 8, 6), kM, 0, -.3 * s, .26 * s); hp.add(tip); }
  else { bk = M(new THREE.ConeGeometry(.05 * s * (type === 'falcon' || type === 'eagle' ? 1.6 : 1), P[3] * s, 8), toon(P[4]), 0, -.02 * s, (.18 + P[3] * .4) * s * (P[6] ? .8 : 1)); bk.rotation.x = PI / 2 + (type === 'hoopoe' || type === 'sunbird' ? .25 : type === 'falcon' || type === 'eagle' ? .5 : 0); }
  hp.add(bk);
  u.eyes = eyes(hp, .07 * s, .13 * s * (P[6] ? .8 : 1), .05 * s, .15 * s * (P[6] ? .75 : 1), .7); u.ears = [];
  if (type === 'hoopoe') { for (let i = 0; i < 6; i++) { const f = M(new THREE.CapsuleGeometry(.04 * s, .26 * s, 3, 6), toon(i % 2 ? 0xf0a050 : 0xe08a3a), 0, .26 * s, -.05 * s - i * .05 * s); f.rotation.x = -.5 - i * .14; hp.add(f); const tip = M(sph(.035 * s, 6, 4), kM, 0, .4 * s, -.12 * s - i * .08 * s); tip.userData.noOut = 1; hp.add(tip); } }
  if (type === 'beeeater') { const m = M(sph(.11 * s, 8, 6), toon(0xffd23f), 0, -.12 * s, .1 * s); m.userData.noOut = 1; hp.add(m); }
  if (type === 'bulbul') { const v = M(sph(.08 * s, 8, 6), toon(0xffd23f), 0, bY - .17 * s, -.42 * s); torso.add(v); }
  if (type === 'hen' || type === 'rooster') { for (let i = 0; i < 3; i++) { const c = M(sph(.07 * s, 8, 6), toon(0xe8202a), 0, .22 * s, .08 * s - i * .08 * s); c.scale.set(.6, 1.2, 1); hp.add(c); } const w = M(sph(.06 * s, 8, 6), toon(0xe8202a), 0, -.16 * s, .2 * s); w.scale.set(.6, 1.4, .8); hp.add(w); }
  if (type === 'rooster') { [[0x1a5a3a, .5], [0x2a2224, .2], [0x1a5a3a, -.1]].forEach(([c, a], i) => { const f = M(new THREE.CapsuleGeometry(.07 * s, .6 * s, 4, 8), toon(c), 0, bY + .3 * s, -.55 * s); f.rotation.x = -.6 - a; torso.add(f); }); }
  if (type === 'partridge') { const st = M(sph(.25 * s, 10, 8), kM, 0, -.02 * s, .05 * s); st.scale.set(1.02, .25, 1); st.userData.noOut = 1; hp.add(st); }
  if (type === 'sandgrouse') { const st = M(sph(.37 * s, 10, 8), toon(0x8a6a4a), 0, bY, 0); st.scale.set(1.01, .12, 1.36); st.userData.noOut = 1; torso.add(st); }
  // الجناحان
  const wc = P[7] || P[0];
  u.wings = []; [-1, 1].forEach(sd => { const wp = pivot(torso, sd * .3 * s, bY + .1 * s, 0); const w = M(sph(.3 * s, 12, 8), toon(wc), sd * .18 * s, 0, -.05 * s); w.scale.set(1.1, .2, 1.35); wp.add(w); if (type === 'eagle' || type === 'falcon' || type === 'gull' || type === 'heron' || type === 'flamingo') wp.userData.big = 1;
    if (type === 'hoopoe') { for (let k = 0; k < 3; k++) { const b = M(new THREE.BoxGeometry(.5 * s, .03 * s, .06 * s), toon(0xffffff), sd * .2 * s, .05 * s, -.12 * s + k * .12 * s); b.userData.noOut = 1; wp.add(b); } }
    if (type === 'gull' || type === 'flamingo') { const t = M(sph(.12 * s, 8, 6), kM, sd * .58 * s, 0, -.2 * s); t.scale.set(1.2, .3, 1); t.userData.noOut = 1; wp.add(t); }
    u.wings.push(wp); });
  const tl = M(sph(.18 * s, 10, 8), type === 'beeeater' ? toon(0x2a8ad8) : toon(wc), 0, bY + .06 * s, -.48 * s); tl.scale.set(.8, .25, 1.6); torso.add(tl);
  if (type !== 'duck') { const ll = P[5] * s; u.legs = [-1, 1].map(sd => { const p = pivot(torso, sd * .1 * s, bY - .2 * s, 0); p.add(M(new THREE.CylinderGeometry(.02 * s * (P[5] > 1 ? 1.4 : 1), .02 * s * (P[5] > 1 ? 1.4 : 1), ll, 5), toon(type === 'flamingo' ? 0xff8aa8 : type === 'heron' ? 0xe8c060 : 0xd8803a), 0, -ll / 2, 0)); return p; }); } else u.legs = [];
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: type === 'duck' ? 'duck' : 'bird', bird: type, s }); outline(root, .015); return root;
}
export function buildButterfly(hexA, hexB) {
  const root = new THREE.Group(), u = root.userData;
  const t = canvasTex(128, 128, (c) => { c.fillStyle = hexA; c.beginPath(); c.ellipse(64, 50, 56, 44, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(64, 100, 36, 26, 0, 0, 7); c.fill(); c.fillStyle = hexB; [[64, 46, 18], [64, 100, 11]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }); c.strokeStyle = '#2a1a1a'; c.lineWidth = 6; c.beginPath(); c.ellipse(64, 50, 56, 44, 0, 0, 7); c.stroke(); });
  u.wings = [-1, 1].map(s => { const p = pivot(root, 0, 0, 0); const g = new THREE.PlaneGeometry(.5, .5); g.translate(s * .25, 0, 0); if (s < 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); } const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, alphaTest: .3 })); m.rotation.x = -PI / 2; p.add(m); return p; });
  const b = M(new THREE.CapsuleGeometry(.03, .28, 3, 6), kM); b.rotation.x = PI / 2; root.add(b);
  u.kind = 'butterfly'; u.blinkOff = Math.random() * 4; return root;
}

// ---------- الحركة ----------
const lerp = (a, b, k) => a + (b - a) * k;
export function animate(r, s, dt) {
  const u = r.userData, k = Math.min(1, dt * 8), K = u.kind;
  if (u.eyes) blink(r, s.t);
  if (ANIM2[K]) return ANIM2[K](r, s, dt, k);
  if (K === 'butterfly') { const f = Math.sin(s.t * (s.gait ? 30 : 18) + u.blinkOff * 3) * 1.1; u.wings[0].rotation.z = -f; u.wings[1].rotation.z = f; return; }
  if (u.wings) { const fl = s.gait === 'fly'; u.wings.forEach((w, i) => { const sd = i ? 1 : -1; w.rotation.z = fl ? sd * Math.sin(s.t * (w.userData.big ? 9 : 22)) * (w.userData.big ? .6 : 1.1) : lerp(w.rotation.z, 0, k); if (w.userData.big) w.scale.x = lerp(w.scale.x, fl ? 1.9 : 1, k); }); }
  if (u.head) { const ty = s.alert ? s.lookYaw : Math.sin(s.t * .5 + u.blinkOff) * .35 * (s.gait ? 0 : 1); u.head.rotation.y = lerp(u.head.rotation.y, Math.max(-1.2, Math.min(1.2, ty)), k * .6); }
  if (u.ears) u.ears.forEach((e, i) => { const tw = Math.max(0, Math.sin(s.t * 2.3 + i * 2 + u.blinkOff) - .94) * 8; e.rotation.x = lerp(e.rotation.x, (s.alert ? -.35 : 0) + tw * .3 - (s.gait === 'run' ? .5 : 0) + (K === 'hare' ? -.25 : 0), k); });
  const g = s.gait, ph = s.ph;
  if (K === 'hare') {
    const hop = g ? Math.abs(Math.sin(ph)) : 0; u.torso.position.y = hop * (g === 'run' ? .9 : .4); u.torso.rotation.x = g ? -Math.cos(ph) * .35 : lerp(u.torso.rotation.x, 0, k);
    u.legs.forEach((l, i) => l.rotation.x = g ? (i < 2 ? -1 : 1) * Math.cos(ph) * .8 : 0);
    if (!g) { u.head.position.y = (u.headY0 || .95) + (s.alert ? .12 : Math.sin(s.t * 9) * .01); }
    return;
  }
  if (K === 'turtle') { const h = u.hide = lerp(u.hide, s.hide ? 1 : 0, Math.min(1, dt * 5)), sc = Math.max(.01, 1 - h); u.head.scale.setScalar(sc); u.legs.forEach((l, i) => { l.scale.setScalar(sc); l.rotation.x = g ? Math.sin(ph + i * PI) * .6 : 0; }); u.head.position.z = .85 - h * .5; return; }
  if (u.wings && K !== 'butterfly') { // طائر على الأرض
    if (g === 'fly') { u.torso.rotation.x = -.2; if (u.legs) u.legs.forEach(l => l.rotation.x = .9); if (u.neck) { u.neck.rotation.x = 1.2; u.head.rotation.x = -1.2; } return; }
    if (g === 'run' || g === 'walk') { const f = g === 'run' ? 1 : .5; u.legs.forEach((l, i) => l.rotation.x = Math.sin(s.ph * 1.6 + i * PI) * .9 * f); u.torso.position.y = Math.abs(Math.sin(s.ph * 1.6)) * .12 * u.s; u.torso.rotation.x = .25 * f; u.wings.forEach((w, i) => w.rotation.z = (i ? 1 : -1) * (.3 + Math.sin(s.t * 18) * .4) * f); u.head.rotation.x = 0; return; }
    u.torso.rotation.x = lerp(u.torso.rotation.x, 0, k); if (u.legs) u.legs.forEach((l, i) => l.rotation.x = u.bird === 'flamingo' && i === 1 && !s.alert ? lerp(l.rotation.x, -1.5, k) : lerp(l.rotation.x, 0, k));
    const peck = !s.alert && K !== 'duck' && u.bird !== 'flamingo' && u.bird !== 'heron' ? Math.max(0, Math.sin(s.t * 1.8 + u.blinkOff * 2) - .55) * 2.2 : (u.bird === 'flamingo' || u.bird === 'heron') && !s.alert ? Math.max(0, Math.sin(s.t * .6 + u.blinkOff) - .3) * 1.2 : 0;
    if (u.neck) { u.neck.rotation.x = lerp(u.neck.rotation.x, u.neck0 + peck * 1.6, k * .5); u.head.rotation.x = -u.neck.rotation.x + peck * .4; } else u.head.rotation.x = peck;
    u.torso.position.y = K === 'duck' ? Math.sin(s.t * 2 + u.blinkOff) * .03 : 0;
    return;
  }
  // رباعيات الأرجل
  const run = g === 'run', amp = run ? .95 : g === 'walk' ? .45 : 0;
  if (s.pose === 'lie' && !g) {
    const tall = u.legH > 1.4; u.torso.position.y = lerp(u.torso.position.y, -u.legH * (tall ? .78 : .82), k); u.legs.forEach((l, i) => { l.rotation.x = lerp(l.rotation.x, tall ? (i < 2 ? 1.5 : -1.5) : (i < 2 ? -1.45 : 1.45), k); l.scale.y = lerp(l.scale.y, tall ? .42 : 1, k); }); u.torso.rotation.x = 0;
  } else if (s.pose === 'sit' && !g) {
    u.legs.forEach(l => l.scale.y = 1);
    u.torso.rotation.x = lerp(u.torso.rotation.x, -.5, k); u.torso.position.y = lerp(u.torso.position.y, -u.legH * .32, k);
    u.legs.forEach((l, i) => l.rotation.x = lerp(l.rotation.x, i < 2 ? .5 : -.9, k));
  } else {
    u.legs.forEach(l => l.scale.y = lerp(l.scale.y, 1, k));
    u.torso.rotation.x = lerp(u.torso.rotation.x, run ? -Math.cos(ph) * .08 : 0, k);
    u.torso.position.y = g ? Math.abs(Math.sin(ph)) * (run ? .35 : .06) : lerp(u.torso.position.y, 0, k);
    u.legs.forEach((l, i) => { const o = run ? (i < 2 ? 0 : PI * .85) + (i % 2) * .35 : (i === 0 || i === 3 ? 0 : PI); l.rotation.x = g ? Math.sin(ph + o) * amp : lerp(l.rotation.x, 0, k); });
  }
  if (u.neck) { const graze = !g && !s.alert && s.pose === 'graze' ? Math.max(0, Math.sin(s.t * .45 + u.blinkOff)) : 0; const tgt = u.neck0 + graze * 1.25 - (s.alert ? .35 : 0) + (run ? .25 : 0); u.neck.rotation.x = lerp(u.neck.rotation.x, tgt, k * .5); u.head.rotation.x = -u.neck.rotation.x + (graze > .5 ? .5 : 0); }
  if (u.tail) u.tail.rotation.z = Math.sin(s.t * (s.alert ? 9 : 2.5) + u.blinkOff) * (K === 'fox' || K === 'leopard' ? .35 : .5);
}

// =================== حيوانات البيئات الجديدة ===================
const flat = (m, x, y, z) => { m.scale.set(x, y, z); return m; };
// ---------- الصحراء ----------
export function buildCamel(calf) {
  const r = quad({ body: [.78, .78, 1.45], col: 0xdcae74, belly: 0xecc898, legH: 1.85, legR: .15, hoof: 0xc89a6a, neckL: 1.45, neckR: .24, neckTilt: 1.05, headR: .36, snout: [.25, 1.7, 0xecc898], eyeR: .12, ear: [.22, .1], earTilt: 1, tail: 'short', tailL: .55, tailR: .07 });
  const u = r.userData, hump = M(sph(.72, 16, 12), toon(0xdcae74), 0, u.bY + .62, -.1); flat(hump, 1, .95, 1.15); u.torso.add(hump);
  if (!calf) {
    const bl = M(new THREE.SphereGeometry(.78, 18, 10, 0, PI * 2, 0, PI * .42), toon(0xc8202a), 0, u.bY + .62, -.1); flat(bl, 1.05, 1.0, 1.2); u.torso.add(bl);
    const tr = M(new THREE.TorusGeometry(.62, .06, 6, 22), toon(0x1a8a4a), 0, u.bY + .62 + .38, -.1); tr.rotation.x = PI / 2; flat(tr, 1.05, 1.25, 1); u.torso.add(tr);
    for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2, t = M(sph(.08, 8, 6), toon(i % 2 ? 0xffd23f : 0xffffff), Math.cos(a) * .7, u.bY + .58, Math.sin(a) * .85 - .1); t.userData.noOut = 1; u.torso.add(t); }
    const hl = M(new THREE.TorusGeometry(.2, .03, 6, 14), toon(0xc8202a), 0, -.02, .3); hl.rotation.y = PI / 2; u.head.add(hl);
  }
  outline(r, .025); u.kind = 'camel'; return r;
}
export function buildOryx() {
  const r = quad({ body: [.6, .64, 1.2], col: 0xfaf8f2, belly: 0xffffff, legH: 1.2, legR: .11, legCol: 0xf2eee6, hoof: 0x2a2220, neckL: .75, neckR: .22, neckTilt: .5, headR: .4, snout: [.23, 1.4, 0xfaf8f2], eyeR: .12, ear: [.42, .13], earIn: 0xe8d0c0, earTilt: 1.1, tail: 'long', tailL: .8, tailR: .07, tailCol: 0x3a2a24 });
  const u = r.userData;
  [-1, 1].forEach(s => { const h = M(new THREE.ConeGeometry(.06, 2.3, 8), toon(0x2a2224), s * .14, 1.2, -.55); h.rotation.x = -.42; h.rotation.z = -s * .05; u.head.add(h);
    const f = M(sph(.18, 10, 8), toon(0x3a2a24), s * .2, .05, .22); flat(f, .5, 1.3, 1.1); f.userData.noOut = 1; u.head.add(f);
    [[.62, 0], [.62, 1]].forEach(([y], i) => { const k = M(sph(.12, 8, 6), toon(0x3a2a24), 0, -.55 - i * .25, 0); flat(k, 1.1, 1.4, 1.1); k.userData.noOut = 1; u.legs[i].add(k); }); });
  const nb = M(sph(.12, 8, 6), toon(0x3a2a24), 0, .25, .3); flat(nb, .8, .6, 1.8); nb.userData.noOut = 1; u.head.add(nb);
  const fl = M(sph(1, 12, 8), toon(0x6a4a3a), 0, u.bY - .3, 0); flat(fl, .61, .08, 1.0); fl.userData.noOut = 1; u.torso.add(fl);
  outline(r, .024); u.kind = 'oryx'; return r;
}
export function buildSandFox() {
  const r = quad({ body: [.4, .4, .78], col: 0xf2cc94, belly: 0xfff6e8, legH: .52, legR: .07, legCol: 0xe8bc84, neckL: .2, neckR: .18, neckTilt: .6, headR: .38, snout: [.17, 1.9, 0xfff6e8], eyeR: .12, eyeRot: .4, ear: [.85, .3], earIn: 0xffe0d0, earTilt: .35, tail: 'bushy', tailL: 1.0, tailR: .3 });
  outline(r, .02); r.userData.kind = 'fox'; return r;
}
export function buildJerboa() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(0xe8c08a), lt = toon(0xfff6ee);
  const body = M(sph(.3, 14, 10), c, 0, .48, -.05); flat(body, 1, 1.05, 1.15); torso.add(body);
  const bl = M(sph(.25, 12, 8), lt, 0, .43, .05); bl.userData.noOut = 1; torso.add(bl);
  const hp = pivot(torso, 0, .78, .2); u.head = hp; u.headY0 = .78; hp.add(M(sph(.22, 14, 10), c));
  const no = M(sph(.04, 8, 6), toon(0xff8aa0), 0, -.04, .21); no.userData.noOut = 1; hp.add(no);
  u.eyes = eyes(hp, .085, .13, .05, .14, .65); u.ears = [];
  [-1, 1].forEach(s => { const ep = pivot(hp, s * .12, .16, -.04); ep.rotation.z = -s * .35; const e = M(sph(.13, 10, 8), c, 0, .15, 0); flat(e, .7, 1.3, .25); ep.add(e); const ei = M(sph(.1, 8, 6), toon(0xffc8d0), 0, .15, .02); flat(ei, .6, 1.1, .15); ei.userData.noOut = 1; ep.add(ei); u.ears.push(ep); });
  u.legs = []; [[-1, .15, .14, .05], [1, .15, .14, .05], [-1, -.12, .36, .08], [1, -.12, .36, .08]].forEach(([s, z, len, rr]) => { const p = pivot(torso, s * .17, .32, z); const l = M(new THREE.CapsuleGeometry(rr, len, 4, 8), c, 0, -.16, z < 0 ? .08 : .03); if (z < 0) l.rotation.x = -.5; p.add(l); u.legs.push(p); });
  const tp = pivot(torso, 0, .4, -.3); u.tail = tp; const tl = M(new THREE.CapsuleGeometry(.025, 1.0, 3, 6), c, 0, 0, -.5); tl.rotation.x = PI / 2 - .2; tp.add(tl);
  const tuft = M(sph(.09, 10, 8), kM, 0, .1, -1.0); flat(tuft, 1, 1, 1.8); tp.add(tuft); const tw = M(sph(.07, 8, 6), lt, 0, .11, -1.14); tp.add(tw);
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'hare' }); outline(root, .015); return root;
}
export function buildLizard() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(0xd8c070), d = toon(0xc88a3a);
  const body = M(sph(.4, 16, 10), c, 0, .26, 0); flat(body, 1.1, .5, 1.9); torso.add(body);
  for (let i = 0; i < 6; i++) { const sp = M(sph(.07, 8, 6), d, (i % 2 ? .18 : -.18), .44, -.4 + i * .16); flat(sp, 1.3, .4, 1); sp.userData.noOut = 1; torso.add(sp); }
  const hp = pivot(torso, 0, .3, .72); u.head = hp; const hd = M(sph(.24, 14, 10), c); flat(hd, 1, .75, 1.25); hp.add(hd);
  u.eyes = eyes(hp, .07, .14, .08, .14, .9); u.ears = [];
  // ذيل شوكي من حلقات
  u.tailSeg = []; let par = torso, z0 = -.7;
  for (let i = 0; i < 4; i++) { const p = pivot(par, 0, i ? 0 : .25, z0); const r = .2 - i * .04, m = M(sph(r, 10, 8), c, 0, 0, -.22); flat(m, 1, .8, 1.6); p.add(m); for (let k = 0; k < 2; k++) { const sp = M(new THREE.ConeGeometry(.05, .14, 5), d, 0, r * .75, -.12 - k * .18); sp.userData.noOut = 1; p.add(sp); } u.tailSeg.push(p); par = p; z0 = -.42; }
  u.legs = []; [[-1, .45], [1, .45], [-1, -.45], [1, -.45]].forEach(([s, z]) => { const p = pivot(torso, s * .38, .22, z); const l = M(new THREE.CapsuleGeometry(.06, .16, 3, 6), c, s * .1, -.1, 0); l.rotation.z = s * .7; p.add(l); u.legs.push(p); });
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'lizard' }); outline(root, .015); return root;
}
// ---------- الشاطئ والبحر ----------
function turtleShellTex(base, line) { return canvasTex(256, 128, (c) => { c.fillStyle = base; c.fillRect(0, 0, 256, 128); c.strokeStyle = line; c.lineWidth = 5; for (let y = 0; y < 3; y++) for (let x = 0; x < 6; x++) { const cx = x * 46 + (y % 2) * 23, cy = y * 44 + 10; c.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * PI * 2; c.lineTo(cx + Math.cos(a) * 20, cy + Math.sin(a) * 18); } c.closePath(); c.stroke(); } }); }
export function buildSeaTurtle() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), sk = toon(0x9ab88a);
  const sh = M(new THREE.SphereGeometry(.9, 22, 12, 0, PI * 2, 0, PI / 2), toon(0xffffff, { map: turtleShellTex('#8a6a3a', '#4a3a1e') }), 0, .2, 0); flat(sh, 1, .48, 1.25); torso.add(sh);
  const pl = M(sph(.9, 18, 8), toon(0xe8d8a8), 0, .2, 0); flat(pl, .98, .12, 1.22); pl.userData.noOut = 1; torso.add(pl);
  const hp = pivot(torso, 0, .3, 1.1); u.head = hp; hp.add(flat(M(sph(.3, 14, 10), sk), .95, .8, 1.25));
  u.eyes = eyes(hp, .08, .16, .08, .2, .6); u.ears = [];
  u.flip = []; [[-1, .5, 1.0], [1, .5, 1.0], [-1, -.7, .55], [1, -.7, .55]].forEach(([s, z, L]) => { const p = pivot(torso, s * .75, .2, z); const f = M(sph(.3, 12, 8), sk, s * .45 * L, 0, -.1); flat(f, 1.6 * L, .2, .6); p.add(f); u.flip.push(p); });
  u.legs = [];
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'seaturtle' }); outline(root, .018); return root;
}
export function buildCrab(col = 0xf06a2a) {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(col);
  const body = M(sph(.36, 16, 10), c, 0, .32, 0); flat(body, 1.4, .55, 1); torso.add(body);
  u.eyes = []; [-1, 1].forEach(s => { const st = M(new THREE.CylinderGeometry(.03, .03, .22, 6), c, s * .14, .5, .26); torso.add(st); const e = pivot(torso, s * .14, .63, .27); e.add(M(sph(.07, 10, 8), wM)); const pp = M(sph(.045, 8, 6), kM, 0, 0, .05); pp.userData.noOut = 1; e.add(pp); u.eyes.push(e); });
  u.claws = []; [-1, 1].forEach(s => { const p = pivot(torso, s * .42, .32, .25); p.rotation.y = s * -.5; const a = M(new THREE.CapsuleGeometry(.05, .25, 3, 6), c, 0, 0, .15); a.rotation.x = PI / 2; p.add(a); const cl = pivot(p, 0, 0, .38); cl.add(flat(M(sph(.16, 12, 8), c), .8, .7, 1.2)); const t = pivot(cl, 0, .06, .1); t.add(flat(M(sph(.08, 8, 6), c, 0, 0, .1), .6, .5, 1.4)); cl.userData.top = t; p.add(cl); u.claws.push(cl); });
  u.legs = []; [-1, 1].forEach(s => { for (let i = 0; i < 3; i++) { const p = pivot(torso, s * .42, .3, .1 - i * .18); const l = M(new THREE.CapsuleGeometry(.035, .4, 3, 6), c, s * .2, -.1, 0); l.rotation.z = s * 1.1; p.add(l); u.legs.push(p); } });
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'crab', head: null }); outline(root, .015); return root;
}
function cetacean(o) {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(o.col), b = toon(o.belly);
  const body = M(sph(1, 20, 14), c); flat(body, o.w, o.h, o.l); torso.add(body);
  const bl = M(sph(1, 16, 10), b, 0, -o.h * .3, o.l * .05); flat(bl, o.w * .82, o.h * .72, o.l * .92); bl.userData.noOut = 1; torso.add(bl);
  if (o.beak) { const bk = M(new THREE.CapsuleGeometry(o.h * .22, o.beak, 4, 8), c, 0, -o.h * .15, o.l * .95); bk.rotation.x = PI / 2; torso.add(bk); }
  u.eyes = eyes(torso, o.eye, o.w * .62, o.h * .05, o.l * .72, 1.0); u.ears = [];
  const df = M(new THREE.ConeGeometry(o.h * .35, o.h * .9, 6), c, 0, o.h * 1.05, -o.l * .12); df.rotation.x = -.6; flat(df, .3, 1, 1); torso.add(df);
  [-1, 1].forEach(s => { const f = M(sph(1, 10, 8), o.finCol ? toon(o.finCol) : c, s * o.w * 1.05, -o.h * .4, o.l * .35); f.rotation.z = s * .6; f.rotation.y = s * .4; flat(f, o.fin, .1, o.fin * .4); torso.add(f); });
  const tp = pivot(torso, 0, 0, -o.l * .85); u.tail = tp; const st = M(sph(1, 12, 8), c, 0, 0, -o.l * .25); flat(st, o.w * .45, o.h * .45, o.l * .35); tp.add(st);
  [-1, 1].forEach(s => { const fl = M(sph(1, 12, 8), c, s * o.w * .55, 0, -o.l * .52); flat(fl, o.w * .7, o.h * .08, o.l * .14); fl.rotation.y = s * .45; tp.add(fl); });
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'dolphin', head: null, legs: [] }); outline(root, .02); return root;
}
export function buildDolphin() { return cetacean({ col: 0x7aa0c8, belly: 0xe8f0f8, w: .5, h: .5, l: 1.5, beak: .4, eye: .1, fin: .5 }); }
export function buildWhale() { const r = cetacean({ col: 0x3a4a62, belly: 0xe8eef4, w: 1.6, h: 1.35, l: 4.6, beak: 0, eye: .16, fin: 3.0, finCol: 0xe8eef4 }); r.userData.whale = true; return r; }
// ---------- أعماق البحر ----------
export function buildFish(o) {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(o.col, o.emis ? { emissive: o.col, emissiveIntensity: .2 } : undefined);
  const body = M(sph(1, 18, 12), c); flat(body, o.w, o.h, o.l); torso.add(body);
  (o.bands || []).forEach(([z, wd, col]) => { const b = M(sph(1, 16, 10), toon(col), 0, 0, z * o.l); flat(b, o.w * 1.04, o.h * (1 - Math.abs(z) * .6) * 1.03, wd * o.l); b.userData.noOut = 1; torso.add(b); });
  u.eyes = eyes(torso, o.h * .2, o.w * .55, o.h * .25, o.l * .6, 1.25); u.ears = [];
  const tp = pivot(torso, 0, 0, -o.l * .9); u.tail = tp; const tf = M(new THREE.ConeGeometry(o.h * .75, o.l * .6, 3), toon(o.fin || o.col), 0, 0, -o.l * .25); tf.rotation.x = -PI / 2; flat(tf, .25, 1, 1); tp.add(tf);
  const df = M(new THREE.ConeGeometry(o.l * .35, o.h * .7, 3), toon(o.fin || o.col), 0, o.h * .95, -o.l * .1); flat(df, .2, 1, 1.6); torso.add(df);
  [-1, 1].forEach(s => { const pf = M(sph(1, 8, 6), toon(o.fin || o.col), s * o.w * .9, -o.h * .25, o.l * .25); flat(pf, o.w * .1, o.h * .25, o.l * .3); pf.rotation.y = s * .5; torso.add(pf); });
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'fish', head: null, legs: [] }); outline(root, o.l > 2 ? .03 : .012); return root;
}
export const FISH = {
  clown: { col: 0xff7a1a, w: .2, h: .3, l: .5, fin: 0xff7a1a, bands: [[.45, .12, 0xffffff], [0, .14, 0xffffff], [-.55, .1, 0xffffff]], emis: 1 },
  butterfly: { col: 0xffd21a, w: .12, h: .55, l: .45, fin: 0xffe060, bands: [[.42, .1, 0x1a1a2a]], emis: 1 },
  parrot: { col: 0x2ac8b8, w: .3, h: .45, l: .9, fin: 0xff7ab0, bands: [[.75, .12, 0xff9ac8]] },
  tang: { col: 0x2a6ae8, w: .14, h: .45, l: .55, fin: 0xffd21a, emis: 1 },
  school: { col: 0xc8d8f0, w: .1, h: .17, l: .38, fin: 0xffd21a },
  shark: { col: 0x3a5a7a, w: 1.0, h: .9, l: 3.8, fin: 0x3a5a7a }
};
export function buildSchool(n = 10) {
  const root = new THREE.Group(), u = root.userData; u.fish = [];
  for (let i = 0; i < n; i++) { const f = buildFish(FISH.school); f.position.set((Math.random() - .5) * 2.4, (Math.random() - .5) * 1.4, (Math.random() - .5) * 2.4); f.userData.ph = Math.random() * 6; root.add(f); u.fish.push(f); }
  Object.assign(u, { kind: 'school', blinkOff: 0 }); return root;
}
export function buildWhaleShark() {
  const r = buildFish(FISH.shark), u = r.userData, t = canvasTex(256, 128, (c) => { c.fillStyle = '#3a5a7a'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#e8f4ff'; for (let i = 0; i < 160; i++) { c.beginPath(); c.arc(Math.random() * 256, Math.random() * 90, 2 + Math.random() * 2.5, 0, 7); c.fill(); } c.fillStyle = '#d8e8f4'; c.fillRect(0, 96, 256, 32); });
  u.torso.children[0].material = toon(0xffffff, { map: t });
  const m = M(new THREE.TorusGeometry(.42, .06, 6, 16, PI), kM, 0, -.2, 3.4); m.rotation.set(PI / 2, 0, PI); m.userData.noOut = 1; u.torso.add(m);
  return r;
}
export function buildPuffer() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(0xe8d070);
  const body = M(sph(.5, 18, 12), c); flat(body, 1, .95, 1.1); torso.add(body); const bl = M(sph(.48, 14, 10), toon(0xffffff), 0, -.12, .05); flat(bl, .9, .7, 1); bl.userData.noOut = 1; torso.add(bl);
  for (let i = 0; i < 40; i++) { const th = Math.acos(1 - 2 * Math.random()), ph = Math.random() * PI * 2, n = new THREE.Vector3(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph)); if (n.z > .75) continue; const sp = M(new THREE.ConeGeometry(.04, .16, 4), toon(0xc8a040), n.x * .52, n.y * .5, n.z * .55); sp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n); sp.userData.noOut = 1; torso.add(sp); }
  for (let i = 0; i < 8; i++) { const s = M(sph(.06, 8, 6), toon(0x6a5a2a), Math.cos(i) * .35, .3 + Math.sin(i * 3) * .1, Math.sin(i) * .3); s.userData.noOut = 1; torso.add(s); }
  u.eyes = eyes(torso, .13, .26, .14, .38, .8); u.ears = [];
  const tp = pivot(torso, 0, 0, -.55); u.tail = tp; const tf = M(new THREE.ConeGeometry(.2, .3, 3), toon(0xe8d070), 0, 0, -.1); tf.rotation.x = -PI / 2; flat(tf, .3, 1, 1); tp.add(tf);
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'puffer', head: null, legs: [], puff: 1 }); outline(root, .015); return root;
}
export function buildRay() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(0x8a7a9a), b = toon(0xf0ecf4);
  const body = M(sph(1, 16, 10), c); flat(body, .5, .18, .9); torso.add(body);
  for (let i = 0; i < 14; i++) { const d = M(sph(.06, 8, 6), toon(0x3ab8e8), (Math.random() - .5) * 1.6, .15, (Math.random() - .5) * 1.1); d.userData.noOut = 1; torso.add(d); }
  u.wings = [-1, 1].map(s => { const p = pivot(torso, s * .3, 0, 0); const w = M(sph(1, 14, 8), c, s * .7, 0, -.05); flat(w, .85, .1, .8); w.rotation.y = s * .35; p.add(w); return p; });
  u.eyes = eyes(torso, .07, .2, .14, .55, .3); u.ears = [];
  const tp = pivot(torso, 0, 0, -.8); u.tail = tp; const tl = M(new THREE.CapsuleGeometry(.04, 1.8, 3, 6), c, 0, 0, -.9); tl.rotation.x = PI / 2; tp.add(tl);
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'ray', head: null, legs: [] }); outline(root, .015); return root;
}
export function buildOctopus() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(0xd86ab0);
  const hd = M(sph(.55, 18, 14), c, 0, 1.0, -.1); flat(hd, 1, 1.15, 1.05); torso.add(hd);
  for (let i = 0; i < 9; i++) { const s = M(sph(.07, 8, 6), toon(0xf8a8d8), Math.cos(i * 2.3) * .4, 1.1 + Math.sin(i * 1.7) * .3, -.1 + Math.sin(i * 2.3) * .4); s.userData.noOut = 1; torso.add(s); }
  u.eyes = eyes(torso, .13, .22, .85, .35, .5); u.ears = [];
  u.arms = []; for (let i = 0; i < 8; i++) { const a = i / 8 * PI * 2, p = pivot(torso, Math.sin(a) * .35, .55, Math.cos(a) * .35 - .1); p.rotation.y = a; let par = p; const segs = []; for (let k = 0; k < 3; k++) { const sg = pivot(par, 0, k ? -.32 : 0, 0); sg.rotation.x = .5; const m = M(new THREE.CapsuleGeometry(.1 - k * .025, .26, 3, 6), c, 0, -.15, 0); sg.add(m); segs.push(sg); par = sg; } u.arms.push(segs); }
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'octopus', head: null, legs: [] }); outline(root, .018); return root;
}
export function buildSeahorse() {
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), c = toon(0xffb21a, { emissive: 0xff8a1a, emissiveIntensity: .2 });
  const pts = []; for (let i = 0; i <= 14; i++) { const k = i / 14; pts.push(new THREE.Vector3(0, 1.3 - k * 1.4 + (k > .75 ? -0 : 0), (k < .75 ? Math.sin(k * 3) * .18 : .1 + Math.sin((k - .75) * 14) * .2))); }
  for (let i = 0; i < pts.length; i++) { const k = i / (pts.length - 1), r = k < .15 ? .14 : k < .7 ? .22 - (k - .15) * .1 : .14 - (k - .7) * .35; const s = M(sph(Math.max(.03, r), 10, 8), c, pts[i].x, pts[i].y, pts[i].z); torso.add(s); }
  const hp = pivot(torso, 0, 1.38, .02); u.head = hp; hp.add(M(sph(.18, 12, 10), c)); const sn = M(new THREE.CylinderGeometry(.04, .07, .32, 8), c, 0, -.02, .24); sn.rotation.x = PI / 2; hp.add(sn);
  const cr = M(new THREE.ConeGeometry(.08, .2, 5), c, 0, .2, -.04); hp.add(cr);
  u.eyes = eyes(hp, .07, .12, .04, .07, .9); u.ears = [];
  const df = M(new THREE.ConeGeometry(.16, .3, 3), toon(0xfff0a0), 0, .75, -.2); df.rotation.x = -PI / 2; flat(df, .2, 1, 1); torso.add(df);
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: 'seahorse', legs: [] }); outline(root, .012); return root;
}
// ---------- الجبل الأخضر ----------
export function buildGoat(col = 0x9a6a3a, patch = 0xffffff, kid) {
  const r = quad({ body: [.46, .48, .82], col, belly: patch, legH: .78, legR: .085, legCol: col, hoof: 0x2a2220, neckL: .42, neckR: .16, neckTilt: .55, headR: .3, snout: [.17, 1.4, col], eyeR: .1, ear: [.36, .1], earIn: 0xffd0c0, earTilt: 1.55, tail: 'short', tailL: .18, tailR: .06 });
  const u = r.userData; u.tail.rotation.x = -1.2;
  if (!kid) { [-1, 1].forEach(s => { const h = hornCurve(.6, .045, 0x8a7a68, 1.6); h.position.set(s * .1, .22, -.04); h.rotation.z = s * -.15; u.head.add(h); }); const bd = M(new THREE.ConeGeometry(.07, .3, 6), toon(0x4a3a2a), 0, -.38, .28); bd.rotation.x = PI; u.head.add(bd); }
  const p2 = M(sph(.3, 10, 8), toon(patch), .3, u.bY + .1, -.25); flat(p2, .6, .9, 1.2); p2.userData.noOut = 1; u.torso.add(p2);
  outline(r, .02); u.kind = 'goat'; return r;
}
export function buildDonkey() {
  const r = quad({ body: [.6, .6, 1.12], col: 0x9a9aa4, belly: 0xeeeef0, legH: 1.0, legR: .12, hoof: 0x3a3438, neckL: .7, neckR: .22, neckTilt: .6, headR: .38, snout: [.27, 1.7, 0xe8e8ec], eyeR: .12, ear: [.85, .14], earIn: 0x5a5a64, earTilt: .35, tail: 'long', tailL: .9, tailR: .05 });
  const u = r.userData;
  for (let i = 0; i < 6; i++) { const m = M(sph(.09, 8, 6), toon(0x3a3438), 0, .25 + i * .12, -.17); m.userData.noOut = 1; u.neck.add(m); }
  const cs = M(sph(1, 10, 6), toon(0x5a5a64), 0, u.bY + .5, 0); flat(cs, .08, .1, 1.05); cs.userData.noOut = 1; u.torso.add(cs);
  const tt = M(sph(.12, 8, 6), toon(0x3a3438), 0, 0, -.95); u.tail.add(tt);
  outline(r, .022); u.kind = 'donkey'; return r;
}
export function buildCat() {
  const t = canvasTex(256, 128, (c) => { c.fillStyle = '#f2a050'; c.fillRect(0, 0, 256, 128); c.fillStyle = '#d07a2a'; for (let i = 0; i < 12; i++) c.fillRect(i * 22, 0, 9, 128); });
  const m = toon(0xffffff, { map: t });
  const r = quad({ body: [.3, .3, .62], col: 0xf2a050, bodyMat: m, belly: 0xfff6ee, legH: .42, legR: .07, neckL: .08, neckR: .14, neckTilt: .3, headR: .32, snout: [.13, 1.0, 0xfff6ee], eyeR: .12, eyeRot: .35, ear: [.26, .14], earIn: 0xffc8d0, earTilt: .3, tail: 'long', tailL: .9, tailR: .06 });
  r.userData.tail.rotation.x = -.9;
  [-1, 1].forEach(s => { for (let k = 0; k < 2; k++) { const w = M(new THREE.CylinderGeometry(.006, .006, .38, 3), kM, s * .2, -.07 - k * .05, .36); w.rotation.z = PI / 2 + s * k * .2; w.userData.noOut = 1; r.userData.head.add(w); } });
  outline(r, .016); r.userData.kind = 'cat'; return r;
}
export function buildTahr() {
  const r = quad({ body: [.66, .68, 1.05], col: 0x8a5a36, belly: 0xc89a6a, legH: .9, legR: .13, legCol: 0x6a4228, hoof: 0x2a2220, neckL: .45, neckR: .34, neckTilt: .45, headR: .38, snout: [.22, 1.3, 0x7a4e2e], eyeR: .12, ear: [.3, .1], earTilt: 1.3, tail: 'short', tailL: .2, tailR: .07 });
  const u = r.userData; for (let i = 0; i < 7; i++) { const m = M(sph(.2, 8, 6), toon(0x5a3a22), 0, u.bY + .5 - i * .05, .65 - i * .22); flat(m, 1, .5, 1); m.userData.noOut = 1; u.torso.add(m); }
  [-1, 1].forEach(s => { const h = hornCurve(.55, .06, 0x5a5048, 1.4); h.position.set(s * .12, .26, -.05); u.head.add(h); });
  outline(r, .024); u.kind = 'tahr'; return r;
}

// ---------- حركات الأنواع الجديدة ----------
const ANIM2 = {
  lizard(r, s, dt, k) { const u = r.userData, g = s.gait; if (g) { u.legs.forEach((l, i) => l.rotation.y = Math.sin(s.ph * 2.2 + (i === 0 || i === 3 ? 0 : PI)) * .7); u.torso.rotation.y = Math.sin(s.ph * 2.2) * .22; u.torso.position.y = 0; } else { const pu = Math.max(0, Math.sin(s.t * 2.2 + u.blinkOff) - .6) * 2.5; u.torso.position.y = pu * .12; u.torso.rotation.x = -pu * .15; u.torso.rotation.y = 0; u.legs.forEach(l => l.rotation.y = 0); }
    u.tailSeg.forEach((p, i) => p.rotation.y = Math.sin((g ? s.ph * 2.2 : s.t * 1.5) - i * .8) * (g ? .3 : .12)); if (u.head) u.head.rotation.y = lerp(u.head.rotation.y, s.alert ? s.lookYaw : Math.sin(s.t * .7 + u.blinkOff) * .4, k * .6); },
  seaturtle(r, s, dt, k) { const u = r.userData, g = s.gait, sw = g === 'swim' || s.under; const f = g ? (sw ? Math.sin(s.t * 3) : Math.sin(s.ph * 1.2)) : Math.sin(s.t * .8) * .15; u.flip.forEach((p, i) => { if (sw) { p.rotation.z = (i % 2 ? -1 : 1) * f * (i < 2 ? .7 : .3); p.rotation.y = 0; } else { p.rotation.y = (i % 2 ? -1 : 1) * f * .6 * (i < 2 ? 1 : -.6); p.rotation.z = 0; } }); if (u.head) u.head.rotation.y = lerp(u.head.rotation.y, s.alert ? Math.max(-.8, Math.min(.8, s.lookYaw)) : Math.sin(s.t * .5 + u.blinkOff) * .3, k * .5); },
  crab(r, s, dt, k) { const u = r.userData, g = s.gait; u.legs.forEach((l, i) => l.rotation.z = g ? Math.sin(s.ph * 3 + i * 1.3) * .5 : Math.sin(s.t * 1.5 + i) * .05); u.torso.position.y = g ? Math.abs(Math.sin(s.ph * 3)) * .06 : 0; u.claws.forEach((c, i) => { const o = s.alert ? Math.abs(Math.sin(s.t * 8)) * .6 : Math.max(0, Math.sin(s.t * 1.3 + i * 1.5 + u.blinkOff) - .5) * 1.2; c.userData.top.rotation.x = -o; c.rotation.x = s.alert ? -.6 : 0; }); },
  dolphin(r, s, dt, k) { const u = r.userData, sp = s.gait ? 6 : 2.5; u.tail.rotation.x = Math.sin(s.t * sp) * (u.whale ? .18 : .35); },
  fish(r, s, dt, k) { const u = r.userData; u.tail.rotation.y = Math.sin(s.t * (s.gait ? 14 : 6) + u.blinkOff) * .5; u.torso.rotation.y = -u.tail.rotation.y * .15; },
  school(r, s) { r.userData.fish.forEach((f, i) => { const fu = f.userData; fu.tail.rotation.y = Math.sin(s.t * (s.gait ? 16 : 8) + fu.ph) * .5; f.position.y += Math.sin(s.t * 1.5 + fu.ph) * .003; }); },
  puffer(r, s, dt, k) { const u = r.userData; u.puff = lerp(u.puff, s.alert || s.gait ? 1.45 : 1, Math.min(1, dt * 4)); u.torso.scale.setScalar(u.puff); u.tail.rotation.y = Math.sin(s.t * 9) * .5; },
  ray(r, s, dt, k) { const u = r.userData, a = Math.sin(s.t * (s.gait ? 5 : 2) + u.blinkOff) * (s.gait ? .45 : .18); u.wings[0].rotation.z = a; u.wings[1].rotation.z = -a; u.tail.rotation.y = Math.sin(s.t * 1.2) * .2; },
  octopus(r, s, dt, k) { const u = r.userData; u.arms.forEach((segs, i) => segs.forEach((sg, j) => { sg.rotation.x = (s.gait ? .2 : .5) + Math.sin(s.t * (s.gait ? 6 : 1.6) + i * .8 + j * .9) * (.25 + j * .1); })); },
  seahorse(r, s, dt, k) { const u = r.userData; u.torso.position.y = Math.sin(s.t * 1.4 + u.blinkOff) * .12; u.torso.rotation.z = Math.sin(s.t * .9 + u.blinkOff) * .08; if (u.head) u.head.rotation.y = lerp(u.head.rotation.y, s.alert ? s.lookYaw * .6 : 0, k * .5); }
};

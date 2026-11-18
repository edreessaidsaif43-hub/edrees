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
// طيور: هدهد، وروار، بلبل، طائر الشمس، بطّ
export function buildBird(type) {
  const P = { hoopoe: [0xf0a050, 0xf8c890, .9], beeeater: [0x3ac85a, 0xffd23f, .75], bulbul: [0x8a7a6a, 0xfff2d8, .7], sunbird: [0x5a4ac8, 0x3a8aff, .55], duck: [0xf4ead8, 0x2a9a5a, 1.3] }[type];
  const root = new THREE.Group(), u = root.userData, torso = pivot(root, 0, 0, 0), s = P[2], bm = toon(P[0]);
  const body = M(sph(.36 * s, 14, 10), bm, 0, .42 * s, 0); body.scale.set(1, .9, 1.35); torso.add(body);
  const hp = pivot(torso, 0, .78 * s, .32 * s); u.head = hp; const hd = M(sph(.24 * s, 14, 10), type === 'duck' ? toon(P[1]) : bm); hp.add(hd);
  const bk = type === 'duck' ? M(sph(.12 * s, 10, 8), toon(0xffb21a), 0, -.04 * s, .25 * s) : M(new THREE.ConeGeometry(.05 * s, (type === 'hoopoe' || type === 'sunbird' ? .5 : .28) * s, 8), toon(0x2a2224), 0, -.02 * s, .3 * s);
  if (type === 'duck') bk.scale.set(1.3, .45, 1.6); else bk.rotation.x = PI / 2 + (type === 'hoopoe' || type === 'sunbird' ? .25 : 0); hp.add(bk);
  u.eyes = eyes(hp, .07 * s, .13 * s, .05 * s, .15 * s, .7); u.ears = [];
  if (type === 'hoopoe') { for (let i = 0; i < 6; i++) { const f = M(new THREE.CapsuleGeometry(.04 * s, .26 * s, 3, 6), toon(i % 2 ? 0xf0a050 : 0xe08a3a), 0, .26 * s, -.05 * s - i * .05 * s); f.rotation.x = -.5 - i * .14; hp.add(f); const tip = M(sph(.035 * s, 6, 4), kM, 0, .4 * s, -.12 * s - i * .08 * s); tip.userData.noOut = 1; hp.add(tip); } }
  if (type === 'beeeater') { const m = M(sph(.11 * s, 8, 6), toon(0xffd23f), 0, -.12 * s, .1 * s); m.userData.noOut = 1; hp.add(m); }
  if (type === 'bulbul') { const v = M(sph(.08 * s, 8, 6), toon(0xffd23f), 0, .25 * s, -.42 * s); torso.add(v); hd.material = toon(0x2a2224); }
  // الجناحان
  u.wings = []; [-1, 1].forEach(sd => { const wp = pivot(torso, sd * .3 * s, .52 * s, 0); const w = M(sph(.3 * s, 12, 8), type === 'hoopoe' ? toon(0x2a2224) : toon(type === 'duck' ? 0xc8b8a0 : P[0]), sd * .18 * s, 0, -.05 * s); w.scale.set(1.1, .2, 1.35); wp.add(w); if (type === 'hoopoe') { for (let k = 0; k < 3; k++) { const b = M(new THREE.BoxGeometry(.5 * s, .03 * s, .06 * s), toon(0xffffff), sd * .2 * s, .05 * s, -.12 * s + k * .12 * s); b.userData.noOut = 1; wp.add(b); } } u.wings.push(wp); });
  const tl = M(sph(.18 * s, 10, 8), type === 'beeeater' ? toon(0x2a8ad8) : bm, 0, .48 * s, -.48 * s); tl.scale.set(.8, .25, 1.6); torso.add(tl);
  if (type !== 'duck') { u.legs = [-1, 1].map(sd => { const p = pivot(torso, sd * .1 * s, .22 * s, 0); p.add(M(new THREE.CylinderGeometry(.02 * s, .02 * s, .24 * s, 5), toon(0xd8803a), 0, -.1 * s, 0)); return p; }); } else u.legs = [];
  Object.assign(u, { torso, blinkOff: Math.random() * 4, kind: type, s }); outline(root, .015); return root;
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
  if (K === 'butterfly') { const f = Math.sin(s.t * (s.gait ? 30 : 18) + u.blinkOff * 3) * 1.1; u.wings[0].rotation.z = -f; u.wings[1].rotation.z = f; return; }
  if (u.wings) { const fl = s.gait === 'fly'; u.wings.forEach((w, i) => { const sd = i ? 1 : -1; w.rotation.z = fl ? sd * Math.sin(s.t * 22) * 1.1 : lerp(w.rotation.z, 0, k); }); }
  if (u.head) { const ty = s.alert ? s.lookYaw : Math.sin(s.t * .5 + u.blinkOff) * .35 * (s.gait ? 0 : 1); u.head.rotation.y = lerp(u.head.rotation.y, Math.max(-1.2, Math.min(1.2, ty)), k * .6); }
  if (u.ears) u.ears.forEach((e, i) => { const tw = Math.max(0, Math.sin(s.t * 2.3 + i * 2 + u.blinkOff) - .94) * 8; e.rotation.x = lerp(e.rotation.x, (s.alert ? -.35 : 0) + tw * .3 - (s.gait === 'run' ? .5 : 0) + (K === 'hare' ? -.25 : 0), k); });
  const g = s.gait, ph = s.ph;
  if (K === 'hare') {
    const hop = g ? Math.abs(Math.sin(ph)) : 0; u.torso.position.y = hop * (g === 'run' ? .9 : .4); u.torso.rotation.x = g ? -Math.cos(ph) * .35 : lerp(u.torso.rotation.x, 0, k);
    u.legs.forEach((l, i) => l.rotation.x = g ? (i < 2 ? -1 : 1) * Math.cos(ph) * .8 : 0);
    if (!g) { u.head.position.y = .95 + (s.alert ? .12 : Math.sin(s.t * 9) * .01); }
    return;
  }
  if (K === 'turtle') { const h = u.hide = lerp(u.hide, s.hide ? 1 : 0, Math.min(1, dt * 5)), sc = Math.max(.01, 1 - h); u.head.scale.setScalar(sc); u.legs.forEach((l, i) => { l.scale.setScalar(sc); l.rotation.x = g ? Math.sin(ph + i * PI) * .6 : 0; }); u.head.position.z = .85 - h * .5; return; }
  if (u.wings && K !== 'butterfly') { // طائر على الأرض
    if (g === 'fly') { u.torso.rotation.x = -.2; if (u.legs) u.legs.forEach(l => l.rotation.x = .9); return; }
    u.torso.rotation.x = lerp(u.torso.rotation.x, 0, k); if (u.legs) u.legs.forEach(l => l.rotation.x = 0);
    const peck = !s.alert && K !== 'duck' ? Math.max(0, Math.sin(s.t * 1.8 + u.blinkOff * 2) - .55) * 2.2 : 0; u.head.rotation.x = peck; u.torso.position.y = K === 'duck' ? Math.sin(s.t * 2 + u.blinkOff) * .03 : 0;
    return;
  }
  // رباعيات الأرجل
  const run = g === 'run', amp = run ? .95 : g === 'walk' ? .45 : 0;
  if (s.pose === 'lie' && !g) {
    u.torso.position.y = lerp(u.torso.position.y, -u.legH * .82, k); u.legs.forEach((l, i) => l.rotation.x = lerp(l.rotation.x, i < 2 ? -1.45 : 1.45, k)); u.torso.rotation.x = 0;
  } else if (s.pose === 'sit' && !g) {
    u.torso.rotation.x = lerp(u.torso.rotation.x, -.5, k); u.torso.position.y = lerp(u.torso.position.y, -u.legH * .32, k);
    u.legs.forEach((l, i) => l.rotation.x = lerp(l.rotation.x, i < 2 ? .5 : -.9, k));
  } else {
    u.torso.rotation.x = lerp(u.torso.rotation.x, run ? -Math.cos(ph) * .08 : 0, k);
    u.torso.position.y = g ? Math.abs(Math.sin(ph)) * (run ? .35 : .06) : lerp(u.torso.position.y, 0, k);
    u.legs.forEach((l, i) => { const o = run ? (i < 2 ? 0 : PI * .85) + (i % 2) * .35 : (i === 0 || i === 3 ? 0 : PI); l.rotation.x = g ? Math.sin(ph + o) * amp : lerp(l.rotation.x, 0, k); });
  }
  if (u.neck) { const graze = !g && !s.alert && s.pose === 'graze' ? Math.max(0, Math.sin(s.t * .45 + u.blinkOff)) : 0; const tgt = u.neck0 + graze * 1.25 - (s.alert ? .35 : 0) + (run ? .25 : 0); u.neck.rotation.x = lerp(u.neck.rotation.x, tgt, k * .5); u.head.rotation.x = -u.neck.rotation.x + (graze > .5 ? .5 : 0); }
  if (u.tail) u.tail.rotation.z = Math.sin(s.t * (s.alert ? 9 : 2.5) + u.blinkOff) * (K === 'fox' || K === 'leopard' ? .35 : .5);
}

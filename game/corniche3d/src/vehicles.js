// سيارات الكورنيش (تاكسي عُماني، سيدان، دفع رباعي، حافلة) والدراجات الهوائية
import * as THREE from 'three';
import { canvasTex } from './util.js';
import { buildKid } from './kid.js';

const glass = new THREE.MeshStandardMaterial({ color: 0x1c2733, roughness: .08, metalness: .6 });
const tire = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: .85 });
const rim = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: .3, metalness: .9 });
const chrome = rim;

function wheel(r = .34, w = .24) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 22), tire); t.rotation.z = Math.PI / 2; t.castShadow = true; g.add(t);
  const h = new THREE.Mesh(new THREE.CylinderGeometry(r * .62, r * .62, w + .02, 14), rim); h.rotation.z = Math.PI / 2; g.add(h);
  for (let i = 0; i < 5; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(w + .04, r * .9, .05), tire); s.rotation.x = i / 5 * Math.PI; g.add(s); }
  return g;
}
// مقطع جانبي للسيارة يُبثق على العرض (الطول على محور z، المقدمة نحو -z)
function profile(pts, width, mat, bevel = .06) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => s.lineTo(p[0], p[1])); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2); g.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; return m;
}
const KINDS = {
  sedan: { L: 4.5, W: 1.78, body: [[-2.25, .32], [2.25, .32], [2.25, .78], [1.35, .9], [.75, 1.36], [-.95, 1.38], [-1.75, .95], [-2.25, .88]], win: [[.66, 1.0], [-1.65, .98], [-.9, 1.32], [.6, 1.3]], wr: .33 },
  suv: { L: 4.8, W: 1.95, body: [[-2.4, .38], [2.4, .38], [2.4, 1.0], [1.7, 1.08], [1.25, 1.74], [-2.25, 1.76], [-2.4, 1.2]], win: [[1.18, 1.16], [-2.2, 1.16], [-2.2, 1.66], [1.08, 1.66]], wr: .38 },
  pickup: { L: 5.1, W: 1.9, body: [[-2.55, .4], [2.55, .4], [2.55, 1.02], [1.75, 1.08], [1.3, 1.72], [-.3, 1.74], [-.4, 1.05], [-2.55, 1.05]], win: [[1.2, 1.16], [-.3, 1.16], [-.3, 1.64], [1.1, 1.64]], wr: .38 }
};
export function buildCar(kind = 'sedan', color = 0xd8dde3, taxi = false) {
  const K = KINDS[kind], g = new THREE.Group();
  const paint = new THREE.MeshStandardMaterial({ color, roughness: .28, metalness: .55 });
  const body = profile(K.body, K.W, paint); g.add(body);
  const w = profile(K.win, K.W + .04, glass, .03); g.add(w);
  // المصابيح الأمامية والخلفية
  const head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2c8, emissiveIntensity: 1.6 }), tail = new THREE.MeshStandardMaterial({ color: 0xc81e1e, emissive: 0xff2a1a, emissiveIntensity: 1.2 });
  [-1, 1].forEach(s => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(.38, .14, .06), head); hl.position.set(s * (K.W / 2 - .3), K.body[2][1] - .12, -K.L / 2 - .02); g.add(hl);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(.34, .14, .06), tail); tl.position.set(s * (K.W / 2 - .28), K.body[K.body.length - 1][1] - .14, K.L / 2 + .02); g.add(tl);
  });
  const grill = new THREE.Mesh(new THREE.BoxGeometry(K.W * .45, .16, .04), chrome); grill.position.set(0, K.body[2][1] - .2, -K.L / 2 - .03); g.add(grill);
  const bump = new THREE.Mesh(new THREE.BoxGeometry(K.W + .04, .16, .2), new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: .6 })); bump.position.set(0, .4, -K.L / 2); g.add(bump); const bb = bump.clone(); bb.position.z = K.L / 2; g.add(bb);
  // التاكسي العُماني: أبيض مع البرتقالي ولافتة على السقف
  if (taxi) {
    const or = new THREE.MeshStandardMaterial({ color: 0xf08a1e, roughness: .35, metalness: .4 });
    [-1, 1].forEach(s => { [-1, 1].forEach(e => { const p = new THREE.Mesh(new THREE.BoxGeometry(.03, .34, 1.1), or); p.position.set(s * (K.W / 2 + .01), .58, e * (K.L / 2 - .7)); g.add(p); }); });
    const st = canvasTex(256, 64, (c) => { c.fillStyle = '#f08a1e'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#fff'; c.font = 'bold 40px Taj, sans-serif'; c.textAlign = 'center'; c.fillText('TAXI  تاكسي', 128, 46); });
    const sg = new THREE.Mesh(new THREE.BoxGeometry(.75, .2, .28), [or, or, or, or, new THREE.MeshStandardMaterial({ map: st }), new THREE.MeshStandardMaterial({ map: st })]); sg.rotation.y = Math.PI / 2; sg.position.set(0, K.body[4][1] + .12, -.1); g.add(sg);
  }
  // العجلات
  g.userData.wheels = [];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => { const wh = wheel(K.wr); wh.position.set(sx * (K.W / 2 - .12), K.wr, sz * (K.L / 2 - .82)); g.add(wh); g.userData.wheels.push(wh); });
  // ظل تحت السيارة
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(K.W + .3, K.L + .2), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .32, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; g.add(sh);
  g.userData.len = K.L; g.userData.wr = K.wr;
  return g;
}
export function buildBus() {
  const g = new THREE.Group();
  const t = canvasTex(1024, 256, (c) => {
    c.fillStyle = '#f7f7f4'; c.fillRect(0, 0, 1024, 256);
    c.fillStyle = '#c8202a'; c.fillRect(0, 168, 1024, 26); c.fillStyle = '#16884a'; c.fillRect(0, 196, 1024, 18);
    c.fillStyle = '#1c2733'; for (let i = 0; i < 9; i++) c.fillRect(30 + i * 108, 30, 92, 100);
    c.fillStyle = '#c8202a'; c.font = 'bold 36px Taj, sans-serif'; c.textAlign = 'center'; c.fillText('مطرح — روي', 512, 238);
  });
  const side = new THREE.MeshStandardMaterial({ map: t, roughness: .4, metalness: .2 }), wh = new THREE.MeshStandardMaterial({ color: 0xf7f7f4, roughness: .4, metalness: .2 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 11.5), [side, side, wh, wh, wh, wh]); body.position.y = 1.85; body.castShadow = true; g.add(body);
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 1.3), glass); ws.position.set(0, 2.35, -5.76); ws.rotation.y = Math.PI; g.add(ws);
  const sg = canvasTex(256, 48, (c) => { c.fillStyle = '#111'; c.fillRect(0, 0, 256, 48); c.fillStyle = '#ffb21a'; c.font = 'bold 34px Taj, sans-serif'; c.textAlign = 'center'; c.fillText('مطرح', 128, 36); });
  const dest = new THREE.Mesh(new THREE.PlaneGeometry(1.6, .3), new THREE.MeshBasicMaterial({ map: sg })); dest.position.set(0, 3.15, -5.77); dest.rotation.y = Math.PI; g.add(dest);
  g.userData.wheels = [];
  [[-1, -3.6], [1, -3.6], [-1, 3.4], [1, 3.4]].forEach(([sx, z]) => { const w = wheel(.5, .32); w.position.set(sx * 1.15, .5, z); g.add(w); g.userData.wheels.push(w); });
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 11.8), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .32, depthWrite: false })); sh.rotation.x = -Math.PI / 2; sh.position.y = .02; g.add(sh);
  g.userData.len = 11.5; g.userData.wr = .5;
  return g;
}
// دراجة هوائية يقودها أحد الشخصيات (المقدمة نحو -z)
export function buildBike(type = 'boy', color = 0x2fae5c, env) {
  const g = new THREE.Group(), fm = new THREE.MeshStandardMaterial({ color, roughness: .35, metalness: .5 });
  const tube = (a, b, r = .025) => { const d = new THREE.Vector3().subVectors(b, a), m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), fm); m.position.copy(a).add(b).multiplyScalar(.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); m.castShadow = true; g.add(m); return m; };
  const V = (y, z) => new THREE.Vector3(0, y, z);
  const wr = .33, rear = V(wr, .52), front = V(wr, -.52), crank = V(.32, .1), seat = V(.88, .25), head = V(.92, -.42);
  tube(rear, crank); tube(crank, seat); tube(seat, rear); tube(crank, head); tube(seat, head, .022); tube(head, front);
  const wheels = [rear, front].map(p => { const w = new THREE.Group(); w.position.copy(p); const t = new THREE.Mesh(new THREE.TorusGeometry(wr, .025, 8, 28), tire); t.rotation.y = Math.PI / 2; w.add(t); for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(.004, .004, wr * 2, 4), rim); s.rotation.x = i / 8 * Math.PI; w.add(s); } g.add(w); return w; });
  const saddle = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .12, 4, 8), tire); saddle.rotation.x = Math.PI / 2; saddle.position.set(0, .95, .25); g.add(saddle);
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(.018, .018, .5, 8), chrome); bar.rotation.z = Math.PI / 2; bar.position.set(0, 1.02, -.44); g.add(bar);
  const stem = tube(head, V(1.02, -.44), .02);
  const basket = new THREE.Mesh(new THREE.BoxGeometry(.3, .18, .22), new THREE.MeshStandardMaterial({ color: 0xc9a26a, roughness: .9 })); basket.position.set(0, .95, -.66); g.add(basket);
  // الراكب
  const kid = buildKid(type, env); kid.rotation.y = Math.PI; kid.position.set(0, .3, .28); g.add(kid);
  const u = kid.userData;
  u.hips.position.y = .66; u.spine.rotation.x = .35;
  u.armL.sh.rotation.set(1.15, 0, .15); u.armR.sh.rotation.set(1.15, 0, -.15); u.armL.el.rotation.x = -.3; u.armR.el.rotation.x = -.3;
  g.userData = { wheels, kid, wr, ph: Math.random() * 6 };
  pedal(g, 0);
  return g;
}
export function pedal(b, ph) {
  const u = b.userData.kid.userData, s = Math.sin(ph), c = Math.cos(ph);
  u.legL.hp.rotation.x = -1.25 + s * .35; u.legR.hp.rotation.x = -1.25 - s * .35;
  u.legL.kn.rotation.x = 1.45 + c * .35; u.legR.kn.rotation.x = 1.45 - c * .35;
  b.userData.wheels.forEach(w => w.rotation.x = -ph * 1.4);
}

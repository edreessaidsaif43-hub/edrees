// شخصيات المنصة بنسخة ثلاثية الأبعاد: الولد (دشداشة وكمة)، البنت (حجاب ومريول كحلي)، البنت 2 (مريول عنابي)
import * as THREE from 'three';
import { canvasTex } from './util.js';

const SKIN = 0xf3d2b8;
function kummaTex() {
  return canvasTex(512, 128, (c) => {
    c.fillStyle = '#fbfbf7'; c.fillRect(0, 0, 512, 128);
    const nv = '#1f3a8a', bl = '#3a6fd1';
    for (let x = 0; x < 512; x += 32) {
      c.fillStyle = nv; c.beginPath(); c.moveTo(x + 16, 18); c.lineTo(x + 30, 46); c.lineTo(x + 16, 74); c.lineTo(x + 2, 46); c.closePath(); c.fill();
      c.fillStyle = '#fbfbf7'; c.beginPath(); c.moveTo(x + 16, 30); c.lineTo(x + 24, 46); c.lineTo(x + 16, 62); c.lineTo(x + 8, 46); c.closePath(); c.fill();
      c.fillStyle = bl; c.beginPath(); c.arc(x + 16, 46, 4, 0, 7); c.fill();
      c.fillStyle = nv; c.fillRect(x + 4, 90, 24, 6); c.beginPath(); c.arc(x + 16, 110, 5, 0, 7); c.fill();
    }
    c.fillStyle = nv; c.fillRect(0, 0, 512, 6); c.fillRect(0, 80, 512, 4); c.fillRect(0, 122, 512, 6);
  });
}
function kummaTop() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#fbfbf7'; c.fillRect(0, 0, 256, 256); c.translate(128, 128);
    for (let r = 0; r < 3; r++) { c.strokeStyle = r % 2 ? '#3a6fd1' : '#1f3a8a'; c.lineWidth = 7; c.beginPath(); c.arc(0, 0, 40 + r * 34, 0, 7); c.stroke(); }
    for (let i = 0; i < 16; i++) { c.save(); c.rotate(i / 16 * Math.PI * 2); c.fillStyle = '#1f3a8a'; c.beginPath(); c.moveTo(0, -58); c.lineTo(9, -74); c.lineTo(0, -90); c.lineTo(-9, -74); c.closePath(); c.fill(); c.restore(); }
    c.fillStyle = '#1f3a8a'; c.beginPath(); c.arc(0, 0, 18, 0, 7); c.fill();
  });
}
const lathe = (pts, mat, seg = 28) => { const v = pts.map(p => new THREE.Vector2(p[0], p[1])); if (v[0].y > v[v.length - 1].y) v.reverse(); const g = new THREE.LatheGeometry(v, seg); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
const M = (c, r = .75, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, side: THREE.DoubleSide, ...o });

export function buildKid(type = 'boy', env) {
  const girl = type !== 'boy';
  const dress = type === 'girl2' ? 0x5e1222 : 0x1c2a52;
  const mSkin = M(SKIN, .6), mWhite = M(0xf6f4ee, .85), mDress = M(dress, .85), mShoe = M(girl ? 0x16161a : 0x3a2618, .5), mSock = M(0xf4f4f0, .9), mHair = M(0x2a1c14, .7), mDark = M(0x1a1a22, .3), mPack = M(type === 'girl2' ? 0x581020 : 0x1e2c56, .6);
  const root = new THREE.Group(), u = root.userData;
  const hips = new THREE.Group(); hips.position.y = .64; root.add(hips); u.hips = hips;
  // الساقان
  const leg = (sx) => {
    const hp = new THREE.Group(); hp.position.set(sx * .075, 0, 0); hips.add(hp);
    const th = new THREE.Mesh(new THREE.CylinderGeometry(.058, .05, .32, 10), girl ? mSock : mSkin); th.position.y = -.16; th.castShadow = true; hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -.32; hp.add(kn);
    const sh = new THREE.Mesh(new THREE.CylinderGeometry(.05, .042, .28, 10), girl ? mSock : mSkin); sh.position.y = -.14; sh.castShadow = true; kn.add(sh);
    const an = new THREE.Group(); an.position.y = -.29; kn.add(an);
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .1, 4, 10), mShoe); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -.015, .045); shoe.scale.set(1.15, 1, .75); shoe.castShadow = true; an.add(shoe);
    if (!girl) { const st = new THREE.Mesh(new THREE.BoxGeometry(.1, .012, .2), M(0x2a1a10, .6)); st.position.set(0, -.045, .04); an.add(st); }
    return { hp, kn, an };
  };
  u.legL = leg(1); u.legR = leg(-1);
  // الجذع
  const spine = new THREE.Group(); hips.add(spine); u.spine = spine;
  if (!girl) {
    // الدشداشة البيضاء حتى الكاحل
    spine.add(lathe([[0, .44], [.085, .44], [.15, .4], [.17, .32], [.155, .14], [.17, 0], [.22, -.25], [.25, -.54], [.24, -.54]], mWhite));
    const tas = new THREE.Mesh(new THREE.CylinderGeometry(.012, .02, .14, 6), mWhite); tas.position.set(.02, .3, .16); spine.add(tas);
    const col = new THREE.Mesh(new THREE.TorusGeometry(.08, .012, 6, 20), mWhite); col.rotation.x = Math.PI / 2; col.position.y = .44; spine.add(col);
  } else {
    spine.add(lathe([[0, .44], [.08, .44], [.145, .4], [.16, .3], [.15, .14], [.14, .02]], mWhite)); // القميص الأبيض
    // المريول: صدرية + تنورة بثنيات واسعة حتى منتصف الساق
    const pin = lathe([[.148, .345], [.168, .29], [.165, .14], [.166, .02], [.205, -.22], [.255, -.5], [.25, -.5]], mDress, 40);
    { const p = pin.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < .02) { const a = Math.atan2(z, x), f = 1 + .045 * Math.abs(Math.sin(a * 8)) * Math.min(1, (.02 - y) / .2); p.setX(i, x * f); p.setZ(i, z * f); } } pin.geometry.computeVertexNormals(); }
    spine.add(pin);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(.168, .014, 6, 32), mDress); belt.rotation.x = Math.PI / 2; belt.position.y = .03; spine.add(belt);
    [-1, 1].forEach(s => { const st = new THREE.Mesh(new THREE.BoxGeometry(.05, .14, .33), mDress); st.position.set(s * .09, .38, 0); spine.add(st); });
    // الحقيبة المدرسية
    const pack = new THREE.Group(); pack.position.set(0, .2, -.2); spine.add(pack);
    const pb = new THREE.Mesh(new THREE.CapsuleGeometry(.12, .16, 6, 14), mPack); pb.scale.set(1.15, 1, .55); pb.castShadow = true; pack.add(pb);
    const pk = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .05, 6, 12), mPack); pk.scale.set(1.2, 1, .45); pk.position.set(0, -.08, -.055); pack.add(pk);
    const zp = new THREE.Mesh(new THREE.TorusGeometry(.085, .006, 4, 24, Math.PI), M(0xcfcfd6, .3, { metalness: .6 })); zp.position.set(0, -.05, -.09); zp.userData.noOut = 1; pack.add(zp);
    const hd = new THREE.Mesh(new THREE.TorusGeometry(.04, .01, 6, 12, Math.PI), mPack); hd.position.set(0, .2, 0); pack.add(hd);
    u.pack = pack;
  }
  // الذراعان
  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * .17, .36, 0); spine.add(sh);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.068, 12, 10), mWhite); sh.add(cap);
    const up = new THREE.Mesh(new THREE.CylinderGeometry(.066, .058, .19, 12), mWhite); up.position.y = -.1; up.castShadow = true; sh.add(up);
    const el = new THREE.Group(); el.position.y = -.19; sh.add(el);
    const fo = new THREE.Mesh(new THREE.CylinderGeometry(.058, .055, .15, 12), mWhite); fo.position.y = -.075; fo.castShadow = true; el.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.05, 12, 10), mSkin); hand.position.y = -.17; el.add(hand);
    sh.rotation.z = sx * .1;
    return { sh, el };
  };
  u.armL = arm(1); u.armR = arm(-1);
  // الرأس (كبير على طريقة الشخصيات)
  const head = new THREE.Group(); head.position.y = .63; head.scale.setScalar(1.14); spine.add(head); u.head = head;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.055, .06, .1, 10), mSkin); neck.position.y = -.14; head.add(neck);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.185, 28, 22), mSkin); face.scale.set(1, 1.06, .98); face.castShadow = true; head.add(face);
  // ملامح الوجه
  [-1, 1].forEach(s => {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.034, 14, 12), mDark); eye.userData.noOut = 1; eye.scale.set(.85, 1.1, .5); eye.position.set(s * .065, .02, .165); head.add(eye);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.01, 8, 6), M(0xffffff, .2)); hl.userData.noOut = 1; hl.position.set(s * .065 + .01, .035, .182); head.add(hl);
    const br = new THREE.Mesh(new THREE.BoxGeometry(.055, .011, .01), mHair); br.userData.noOut = 1; br.position.set(s * .066, .085, .172); br.rotation.z = -s * .12; head.add(br);
    const ck = new THREE.Mesh(new THREE.SphereGeometry(.03, 10, 8), M(0xf2a3a0, .8, { transparent: true, opacity: .55 })); ck.scale.set(1, .6, .3); ck.userData.noOut = 1; ck.position.set(s * .1, -.05, .158); head.add(ck);
  });
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.03, .007, 6, 14, Math.PI), M(0xb4473f, .6)); mouth.rotation.z = Math.PI; mouth.userData.noOut = 1; mouth.position.set(0, -.07, .172); head.add(mouth);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.016, 8, 6), mSkin); nose.userData.noOut = 1; nose.position.set(0, -.02, .185); head.add(nose);
  if (!girl) {
    [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.SphereGeometry(.04, 10, 8), mSkin); ear.scale.set(.5, 1, .8); ear.position.set(s * .185, 0, 0); head.add(ear); });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.192, 24, 16, 0, Math.PI * 2, 0, Math.PI * .52), mHair); hair.position.y = .012; hair.rotation.x = -.25; head.add(hair);
    // الكمة العُمانية المطرّزة
    const kt = kummaTex(); kt.wrapS = THREE.RepeatWrapping; kt.repeat.x = 1;
    const k = new THREE.Mesh(new THREE.CylinderGeometry(.19, .197, .13, 32, 1, true), new THREE.MeshStandardMaterial({ map: kt, roughness: .85, side: THREE.DoubleSide })); k.position.y = .12; k.rotation.x = -.12; k.castShadow = true; head.add(k);
    const kt2 = new THREE.Mesh(new THREE.CircleGeometry(.19, 32), new THREE.MeshStandardMaterial({ map: kummaTop(), roughness: .85 })); kt2.rotation.x = -Math.PI / 2; kt2.position.set(0, .065, 0); k.add(kt2);
  } else {
    // الحجاب الأبيض: يغطي الرأس ويحيط بالوجه وينسدل على الكتفين والصدر والظهر
    const hj = new THREE.Mesh(new THREE.SphereGeometry(.212, 28, 22), mWhite); hj.position.set(0, .015, -.03); hj.scale.set(1.04, 1.1, 1.02); hj.castShadow = true; head.add(hj);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.162, .032, 10, 30), mWhite); rim.position.set(0, .0, .1); rim.scale.set(1, 1.2, 1); head.add(rim);
    const dr = lathe([[.09, -.12], [.15, -.17], [.2, -.22], [.218, -.27], [.21, -.295], [.2, -.3]], mWhite, 36); dr.scale.set(1, 1, .92); head.add(dr);
    const back = lathe([[.0, -.1], [.13, -.12], [.18, -.22], [.17, -.4], [.13, -.5], [.0, -.51]], mWhite); back.scale.set(1, 1, .5); back.position.set(0, 0, -.11); head.add(back);
    const fold = new THREE.Mesh(new THREE.TorusGeometry(.205, .01, 6, 30, Math.PI), M(0xe2ded5, .9)); fold.rotation.set(Math.PI / 2, 0, Math.PI); fold.position.set(0, -.16, -.03); fold.userData.noOut = 1; head.add(fold);
    u.hijab = dr;
  }
  root.traverse(o => { if (o.isMesh && env && o.material && o.material.isMeshStandardMaterial) o.material.envMapIntensity = .5; });
  outline(root);
  u.type = type;
  return root;
}

// خط محيطي داكن (أسلوب الرسوم الكرتونية) يوضّح الشخصية فوق الخلفية
const OUT = new THREE.MeshBasicMaterial({ color: 0x2a1f2a, side: THREE.BackSide });
OUT.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.011;'); };
export function outline(root) {
  const list = []; root.traverse(o => { if (o.isMesh && !o.userData.noOut && !o.userData.isOut) list.push(o); });
  list.forEach(o => { const m = new THREE.Mesh(o.geometry, OUT); m.userData.isOut = 1; o.add(m); });
}
export function restKid(K) {
  const u = K.userData;
  [u.legL, u.legR].forEach(l => { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); l.an.rotation.set(0, 0, 0); });
  u.armL.sh.rotation.set(0, 0, .1); u.armR.sh.rotation.set(0, 0, -.1); u.armL.el.rotation.set(0, 0, 0); u.armR.el.rotation.set(0, 0, 0);
  u.spine.rotation.set(0, 0, 0); u.head.rotation.set(0, 0, 0); u.hips.position.y = .64; u.hips.rotation.set(0, 0, 0);
}
// جري: ph طور الخطوة، a شدة الجري (0..1)
export function poseRunKid(K, ph, a = 1) {
  const u = K.userData, s = Math.sin(ph), c = Math.cos(ph), st = u.type === 'boy' ? .38 : .42;
  u.legL.hp.rotation.x = -s * st * a; u.legR.hp.rotation.x = s * st * a;
  u.legL.kn.rotation.x = Math.max(0, c) * 1.25 * a + .1; u.legR.kn.rotation.x = Math.max(0, -c) * 1.25 * a + .1;
  u.legL.an.rotation.x = -.2 * a; u.legR.an.rotation.x = -.2 * a;
  u.armL.sh.rotation.set(s * .9 * a, 0, .18); u.armR.sh.rotation.set(-s * .9 * a, 0, -.18);
  u.armL.el.rotation.x = -1.1 * a; u.armR.el.rotation.x = -1.1 * a;
  u.spine.rotation.x = .14 * a; u.spine.rotation.y = s * .12 * a; u.head.rotation.x = -.1 * a;
  u.hips.position.y = .64 + Math.abs(c) * .05 * a - .02 * a;
  if (u.pack) u.pack.rotation.x = -.05 + Math.abs(c) * .06;
}
export function poseJumpKid(K, k) {
  const u = K.userData;
  u.legL.hp.rotation.x = -.9; u.legL.kn.rotation.x = 1.4; u.legR.hp.rotation.x = .3; u.legR.kn.rotation.x = .9;
  u.armL.sh.rotation.set(-2.4, 0, .3); u.armR.sh.rotation.set(-2.1, 0, -.3); u.armL.el.rotation.x = -.3; u.armR.el.rotation.x = -.3;
  u.spine.rotation.x = .05; u.head.rotation.x = -.15;
}
export function poseCheerKid(K, t) {
  const u = K.userData, w = Math.sin(t * 8);
  u.armL.sh.rotation.set(0, 0, 2.6 + w * .15); u.armR.sh.rotation.set(0, 0, -2.6 - w * .15); u.armL.el.rotation.x = -.3; u.armR.el.rotation.x = -.3;
  u.head.rotation.x = -.2;
}
export function poseStumbleKid(K, k) {
  const u = K.userData, e = Math.sin(k * Math.PI);
  u.spine.rotation.x = .6 * e; u.head.rotation.x = .3 * e; u.armL.sh.rotation.set(-1.5 * e, 0, .6); u.armR.sh.rotation.set(-1.3 * e, 0, -.6);
  u.legL.hp.rotation.x = -.6 * e; u.legL.kn.rotation.x = .9 * e; u.legR.kn.rotation.x = .3 * e; u.hips.position.y = .64 - .12 * e;
}

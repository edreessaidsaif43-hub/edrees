// شخصيات المنصة بأسلوب كرتوني: الولد (دشداشة وكمة)، البنت (حجاب ومريول كحلي)، البنت 2 (مريول عنابي)
import * as THREE from 'three';
import { canvasTex } from './util.js';
import { toon, outline } from './toon.js';

const SKIN = 0xf8d2b4, SKIN_CSS = '#f8d2b4';
// وجه مرسوم على نسيج يلتف حول كرة الرأس (المقدمة عند u = 0.25)
function faceTex(girl) {
  return canvasTex(1024, 512, (c) => {
    c.fillStyle = SKIN_CSS; c.fillRect(0, 0, 1024, 512);
    const cx = 256, ey = 262;
    // ظل خفيف أسفل الذقن
    const sh = c.createLinearGradient(0, 330, 0, 420); sh.addColorStop(0, 'rgba(220,150,120,0)'); sh.addColorStop(1, 'rgba(220,150,120,.35)'); c.fillStyle = sh; c.fillRect(0, 330, 1024, 182);
    if (girl) { c.fillStyle = '#3a2216'; c.beginPath(); c.ellipse(cx, 146, 130, 26, 0, 0, Math.PI * 2); c.fill(); c.strokeStyle = 'rgba(255,255,255,.18)'; c.lineWidth = 3; c.beginPath(); c.moveTo(cx, 124); c.lineTo(cx + 4, 168); c.stroke(); }
    // الخدود الوردية
    [-1, 1].forEach(s => { const g = c.createRadialGradient(cx + s * 80, ey + 52, 0, cx + s * 80, ey + 52, 34); g.addColorStop(0, 'rgba(255,120,120,.45)'); g.addColorStop(1, 'rgba(255,120,120,0)'); c.fillStyle = g; c.fillRect(cx + s * 80 - 40, ey + 12, 80, 80); });
    // العينان
    [-1, 1].forEach(s => {
      const x = cx + s * 54, y = ey;
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(x, y, 26, 24, 0, 0, Math.PI * 2); c.fill();
      const ig = c.createRadialGradient(x, y + 4, 2, x, y, 21); ig.addColorStop(0, '#8a5226'); ig.addColorStop(.6, '#5a3214'); ig.addColorStop(1, '#2a1608'); c.fillStyle = ig; c.beginPath(); c.arc(x, y + 2, 20, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#120a05'; c.beginPath(); c.arc(x, y + 3, 9.5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(x + 7, y - 6, 6.5, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x - 7, y + 10, 3, 0, Math.PI * 2); c.fill();
      // الجفن العلوي والرموش
      c.strokeStyle = '#1a0f0a'; c.lineCap = 'round'; c.lineWidth = girl ? 7 : 6; c.beginPath(); c.ellipse(x, y + 1, 27, 25, 0, Math.PI * 1.08, Math.PI * 1.92); c.stroke();
      if (girl) { c.lineWidth = 3.5; for (let k = 0; k < 3; k++) { const a = Math.PI * (s > 0 ? 1.82 + k * .05 : 1.18 - k * .05), x0 = x + Math.cos(a) * 27, y0 = y + 1 + Math.sin(a) * 25; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + s * (6 + k * 2), y0 - 7 + k); c.stroke(); } }
      c.strokeStyle = 'rgba(120,60,40,.35)'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 25, 23, 0, Math.PI * .2, Math.PI * .8); c.stroke();
      // الحاجبان
      c.strokeStyle = '#2b1a12'; c.lineWidth = girl ? 7 : 9; c.beginPath(); c.moveTo(x - s * 24, y - 38); c.quadraticCurveTo(x - s * 2, y - 50, x + s * 26, y - 40); c.stroke();
    });
    // الأنف
    c.strokeStyle = 'rgba(190,110,80,.55)'; c.lineWidth = 4; c.beginPath(); c.moveTo(cx - 9, ey + 42); c.quadraticCurveTo(cx, ey + 48, cx + 9, ey + 42); c.stroke();
    // الابتسامة
    c.fillStyle = '#c4554a'; c.beginPath(); c.moveTo(cx - 28, ey + 66); c.quadraticCurveTo(cx, ey + 92, cx + 28, ey + 66); c.quadraticCurveTo(cx, ey + 78, cx - 28, ey + 66); c.fill();
    c.strokeStyle = '#8a2e28'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(cx - 30, ey + 65); c.quadraticCurveTo(cx, ey + 86, cx + 30, ey + 65); c.stroke();
  });
}
function kummaTex() {
  return canvasTex(1024, 192, (c) => {
    c.fillStyle = '#fbfbf7'; c.fillRect(0, 0, 1024, 192);
    const nv = '#1d3584', bl = '#3c6fd0';
    c.fillStyle = nv; c.fillRect(0, 0, 1024, 12); c.fillRect(0, 178, 1024, 14); c.fillRect(0, 140, 1024, 6);
    for (let x = 0; x < 1024; x += 64) {
      c.fillStyle = nv; c.beginPath(); c.moveTo(x + 32, 22); c.lineTo(x + 60, 76); c.lineTo(x + 32, 130); c.lineTo(x + 4, 76); c.closePath(); c.fill();
      c.fillStyle = '#fbfbf7'; c.beginPath(); c.moveTo(x + 32, 40); c.lineTo(x + 49, 76); c.lineTo(x + 32, 112); c.lineTo(x + 15, 76); c.closePath(); c.fill();
      c.fillStyle = bl; c.beginPath(); c.moveTo(x + 32, 56); c.lineTo(x + 41, 76); c.lineTo(x + 32, 96); c.lineTo(x + 23, 76); c.closePath(); c.fill();
      c.fillStyle = nv; [[x, 22], [x, 130], [x + 64, 22]].forEach(p => { c.beginPath(); c.arc(p[0], p[1] + 3, 5, 0, 7); c.fill(); });
      c.fillStyle = bl; c.fillRect(x + 8, 154, 48, 14);
    }
  });
}
function kummaTop() {
  return canvasTex(512, 512, (c) => {
    c.fillStyle = '#fbfbf7'; c.fillRect(0, 0, 512, 512); c.translate(256, 256);
    for (let r = 0; r < 4; r++) { c.strokeStyle = r % 2 ? '#3c6fd0' : '#1d3584'; c.lineWidth = 12; c.beginPath(); c.arc(0, 0, 70 + r * 52, 0, 7); c.stroke(); }
    for (let i = 0; i < 20; i++) { c.save(); c.rotate(i / 20 * Math.PI * 2); c.fillStyle = '#1d3584'; c.beginPath(); c.moveTo(0, -110); c.lineTo(14, -140); c.lineTo(0, -170); c.lineTo(-14, -140); c.closePath(); c.fill(); c.restore(); }
    c.fillStyle = '#1d3584'; c.beginPath(); c.arc(0, 0, 36, 0, 7); c.fill();
  });
}
const lathe = (pts, mat, seg = 40) => { const v = pts.map(p => new THREE.Vector2(p[0], p[1])); if (v[0].y > v[v.length - 1].y) v.reverse(); const g = new THREE.LatheGeometry(v, seg); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };

export function buildKid(type = 'boy', opt = {}) {
  const bust = !!opt.bust; // نصف علوي فقط (للجلوس في قمرة القيادة)
  const girl = type !== 'boy';
  const dress = type === 'girl2' ? 0x9c1c40 : 0x2848a8;
  const mSkin = toon(SKIN), mWhite = toon(0xffffff), mDress = toon(dress), mShoe = toon(girl ? 0x1a1a22 : 0x4a2c18), mSock = toon(0xffffff), mHair = toon(0x2b1a12), mPack = toon(type === 'girl2' ? 0x8a1638 : 0x223c96);
  mWhite.side = mDress.side = THREE.DoubleSide;
  const root = new THREE.Group(), u = root.userData;
  const hips = new THREE.Group(); hips.position.y = .64; root.add(hips); u.hips = hips;
  const leg = (sx) => {
    const hp = new THREE.Group(); hp.position.set(sx * .075, 0, 0); hips.add(hp);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(.056, .26, 6, 14), girl ? mSock : mSkin); th.position.y = -.16; th.castShadow = true; hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -.32; hp.add(kn);
    const sh = new THREE.Mesh(new THREE.CapsuleGeometry(.05, .22, 6, 14), girl ? mSock : mSkin); sh.position.y = -.14; sh.castShadow = true; kn.add(sh);
    const an = new THREE.Group(); an.position.y = -.29; kn.add(an);
    const shoe = new THREE.Mesh(new THREE.CapsuleGeometry(.058, .1, 6, 16), mShoe); shoe.rotation.x = Math.PI / 2; shoe.position.set(0, -.015, .05); shoe.scale.set(1.15, 1, .72); shoe.castShadow = true; an.add(shoe);
    if (!girl) { const st = new THREE.Mesh(new THREE.BoxGeometry(.11, .014, .21), toon(0x2a1a10)); st.position.set(0, -.05, .045); an.add(st); }
    return { hp, kn, an };
  };
  if (!bust) { u.legL = leg(1); u.legR = leg(-1); } else { const dummy = () => { const hp = new THREE.Group(), kn = new THREE.Group(), an = new THREE.Group(); return { hp, kn, an }; }; u.legL = dummy(); u.legR = dummy(); }
  const spine = new THREE.Group(); hips.add(spine); u.spine = spine;
  if (!girl) {
    spine.add(lathe(bust ? [[0, .44], [.085, .44], [.15, .41], [.172, .33], [.158, .14], [.165, -.05], [.0, -.06]] : [[0, .44], [.085, .44], [.15, .41], [.172, .33], [.158, .14], [.172, 0], [.222, -.25], [.25, -.54], [.24, -.54]], mWhite));
    const tas = new THREE.Mesh(new THREE.CylinderGeometry(.012, .022, .16, 10), mWhite); tas.position.set(.025, .3, .165); spine.add(tas);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(.022, 10, 8), mWhite); knot.position.set(.025, .2, .17); spine.add(knot);
    const col = new THREE.Mesh(new THREE.TorusGeometry(.08, .014, 8, 24), mWhite); col.rotation.x = Math.PI / 2; col.position.y = .44; spine.add(col);
  } else {
    spine.add(lathe([[0, .44], [.08, .44], [.145, .4], [.16, .3], [.15, .14], [.14, .02]], mWhite));
    const pin = lathe(bust ? [[.148, .345], [.168, .29], [.165, .14], [.166, -.05], [.0, -.06]] : [[.148, .345], [.168, .29], [.165, .14], [.166, .02], [.205, -.22], [.255, -.5], [.25, -.5]], mDress, 48);
    { const p = pin.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y < .02) { const a = Math.atan2(z, x), f = 1 + .045 * Math.abs(Math.sin(a * 8)) * Math.min(1, (.02 - y) / .2); p.setX(i, x * f); p.setZ(i, z * f); } } pin.geometry.computeVertexNormals(); }
    spine.add(pin);
    [-1, 1].forEach(s => { const st = new THREE.Mesh(new THREE.BoxGeometry(.05, .08, .34), mDress); st.position.set(s * .09, .33, 0); spine.add(st); const bt = new THREE.Mesh(new THREE.SphereGeometry(.018, 10, 8), toon(0x111111)); bt.position.set(s * .09, .33, .17); spine.add(bt); });
    const pack = new THREE.Group(); pack.position.set(0, .2, -.2); spine.add(pack);
    const pb = new THREE.Mesh(new THREE.CapsuleGeometry(.12, .16, 8, 18), mPack); pb.scale.set(1.15, 1, .55); pb.castShadow = true; pack.add(pb);
    const pk = new THREE.Mesh(new THREE.CapsuleGeometry(.08, .05, 8, 14), mPack); pk.scale.set(1.2, 1, .45); pk.position.set(0, -.08, -.055); pack.add(pk);
    u.pack = pack;
  }
  // الذراعان واليدان
  const arm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * .17, .36, 0); spine.add(sh);
    sh.add(new THREE.Mesh(new THREE.SphereGeometry(.068, 16, 12), mWhite));
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(.063, .13, 6, 14), mWhite); up.position.y = -.1; up.castShadow = true; sh.add(up);
    const el = new THREE.Group(); el.position.y = -.19; sh.add(el);
    const fo = new THREE.Mesh(new THREE.CapsuleGeometry(.056, .1, 6, 14), mWhite); fo.position.y = -.075; el.add(fo);
    const hand = new THREE.Group(); hand.position.y = -.17; el.add(hand);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(.05, 16, 12), mSkin); palm.scale.set(1, 1.1, .8); hand.add(palm);
    const th = new THREE.Mesh(new THREE.CapsuleGeometry(.016, .03, 4, 8), mSkin); th.position.set(-sx * .04, .0, .025); th.rotation.z = sx * .6; hand.add(th);
    sh.rotation.z = sx * .1;
    return { sh, el };
  };
  u.armL = arm(1); u.armR = arm(-1);
  // الرأس الكبير بوجه مرسوم
  const head = new THREE.Group(); head.position.y = .63; head.scale.setScalar(1.18); spine.add(head); u.head = head;
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.055, .062, .1, 12), mSkin); neck.position.y = -.14; head.add(neck);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.185, 64, 48), toon(0xffffff, { map: faceTex(girl) })); face.scale.set(1, 1.07, .98); face.castShadow = true; head.add(face);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.02, 12, 10), mSkin); nose.position.set(0, -.035, .183); nose.userData.noOut = 1; head.add(nose);
  if (!girl) {
    [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.SphereGeometry(.048, 16, 12), mSkin); ear.scale.set(.45, 1, .75); ear.position.set(s * .186, -.005, -.005); head.add(ear); });
    const hair = new THREE.Mesh(new THREE.SphereGeometry(.193, 40, 24, 0, Math.PI * 2, 0, Math.PI * .5), mHair); hair.position.y = .006; hair.rotation.x = -.28; head.add(hair);
    [-1, 1].forEach(s => { const sb = new THREE.Mesh(new THREE.BoxGeometry(.02, .07, .05), mHair); sb.position.set(s * .178, .03, .05); sb.userData.noOut = 1; head.add(sb); });
    const fr = new THREE.Mesh(new THREE.TorusGeometry(.15, .03, 8, 24, Math.PI), mHair); fr.position.set(0, .095, .08); fr.rotation.x = -.2; fr.scale.set(1, .5, .6); head.add(fr);
    const kt = kummaTex(); kt.wrapS = THREE.RepeatWrapping;
    const k = new THREE.Mesh(new THREE.CylinderGeometry(.192, .2, .14, 64, 1, true), toon(0xffffff, { map: kt, side: THREE.DoubleSide })); k.position.y = .125; k.rotation.x = -.14; k.castShadow = true; head.add(k);
    const kt2 = new THREE.Mesh(new THREE.CircleGeometry(.192, 48), toon(0xffffff, { map: kummaTop() })); kt2.rotation.x = -Math.PI / 2; kt2.position.y = .07; k.add(kt2);
  } else {
    // الحجاب الأبيض: يغطي الرأس ويحيط بالوجه ثم ينسدل على الكتفين والصدر
    const R0 = .212, gap = 1.75, T0 = Math.PI * .3, T1 = Math.PI * .8;
    [[0, Math.PI * 2, 0, T0], [Math.PI / 2 + gap / 2, Math.PI * 2 - gap, T0, T1 - T0], [0, Math.PI * 2, T1, Math.PI - T1]].forEach(([p0, pl, t0, tl]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(R0, 64, 40, p0, pl, t0, tl), mWhite); m.position.set(0, .012, -.012); m.scale.set(1.02, 1.08, 1.02); m.castShadow = true; head.add(m); });
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.152, .03, 14, 48), mWhite); rim.position.set(0, .005, .125); rim.scale.set(1, 1.22, 1); head.add(rim);
    const dr = lathe([[.09, -.12], [.15, -.17], [.2, -.22], [.222, -.28], [.214, -.31], [.2, -.315]], mWhite, 48); dr.scale.set(1, 1, .92); head.add(dr);
    const back = lathe([[.0, -.1], [.13, -.12], [.18, -.22], [.17, -.4], [.13, -.5], [.0, -.51]], mWhite); back.scale.set(1, 1, .5); back.position.set(0, 0, -.11); head.add(back);
    const fold = new THREE.Mesh(new THREE.TorusGeometry(.2, .012, 8, 36, Math.PI * .8), toon(0xe6e6ee)); fold.rotation.set(Math.PI / 2, 0, Math.PI * 1.1); fold.position.set(0, -.2, .0); fold.userData.noOut = 1; head.add(fold);
  }
  outline(root, .011);
  u.type = type;
  return root;
}

export function restKid(K) {
  const u = K.userData;
  [u.legL, u.legR].forEach(l => { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); l.an.rotation.set(0, 0, 0); });
  u.armL.sh.rotation.set(0, 0, .1); u.armR.sh.rotation.set(0, 0, -.1); u.armL.el.rotation.set(0, 0, 0); u.armR.el.rotation.set(0, 0, 0);
  u.spine.rotation.set(0, 0, 0); u.head.rotation.set(0, 0, 0); u.hips.position.y = .64; u.hips.rotation.set(0, 0, 0);
}
export function poseCheerKid(K, t) {
  const u = K.userData, w = Math.sin(t * 8);
  u.armL.sh.rotation.set(0, 0, 2.6 + w * .15); u.armR.sh.rotation.set(0, 0, -2.6 - w * .15); u.armL.el.rotation.x = -.3; u.armR.el.rotation.x = -.3;
  u.head.rotation.x = -.15;
}

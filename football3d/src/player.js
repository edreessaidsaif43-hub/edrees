// لاعب كرة قدم ثلاثي الأبعاد بأسلوب مبسّط وأنيق — هيكل بمفاصل قابلة للتحريك
import * as THREE from 'three';
import { canvasTex, FONT } from './util.js';

const cap = (r, l, m, seg = 12) => { const g = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, seg), m); g.castShadow = true; return g; };

function jerseyTex(main, accent, num, name) {
  const hex = c => '#' + new THREE.Color(c).getHexString();
  return canvasTex(512, 512, (c) => {
    c.fillStyle = hex(main); c.fillRect(0, 0, 512, 512);
    // خطوط جانبية وتدرّج قماش
    c.fillStyle = hex(accent); c.fillRect(0, 0, 40, 512); c.fillRect(472, 0, 40, 512);
    c.fillStyle = 'rgba(255,255,255,.08)'; for (let x = 0; x < 512; x += 16) c.fillRect(x, 0, 6, 512);
    const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(0,0,0,.2)'); c.fillStyle = g; c.fillRect(0, 0, 512, 512);
  });
}

function numberTex(num, color, outline, name) {
  return canvasTex(256, 256, (c) => {
    c.clearRect(0, 0, 256, 256); c.textAlign = 'center'; c.textBaseline = 'middle';
    if (name) { c.font = `800 38px ${FONT}`; c.direction = 'rtl'; c.lineWidth = 5; c.strokeStyle = outline; c.strokeText(name, 128, 40); c.fillStyle = color; c.fillText(name, 128, 40); }
    c.font = `900 150px ${FONT}`; c.direction = 'ltr'; c.lineWidth = 10; c.strokeStyle = outline; c.strokeText(num, 128, 150); c.fillStyle = color; c.fillText(num, 128, 150);
  });
}

export function buildPlayer({ main = 0xd81f3a, accent = 0xffffff, shorts = 0xffffff, socks = 0xd81f3a, skin = 0xf3d2b8, hair = 0x2a1c14, num = '9', name = '', gk = false, gloves = 0x7dff6a, boots = 0x111111, env }) {
  const P = new THREE.Group();
  const shirtM = new THREE.MeshStandardMaterial({ map: jerseyTex(main, accent), roughness: .65, envMap: env, envMapIntensity: .25 });
  const sleeveM = new THREE.MeshStandardMaterial({ color: main, roughness: .65 });
  const cuffM = new THREE.MeshStandardMaterial({ color: accent, roughness: .6 });
  const shortsM = new THREE.MeshStandardMaterial({ color: shorts, roughness: .7 });
  const socksM = new THREE.MeshStandardMaterial({ color: socks, roughness: .8 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: .55 });
  const hairM = new THREE.MeshStandardMaterial({ color: hair, roughness: .9 });
  const bootM = new THREE.MeshStandardMaterial({ color: boots, roughness: .35, metalness: .1, envMap: env, envMapIntensity: .6 });
  const studM = new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: .4 });

  const hips = new THREE.Group(); hips.position.y = .98; P.add(hips);
  // الحوض والشورت
  const pelvis = new THREE.Mesh(new THREE.CylinderGeometry(.165, .175, .2, 20), shortsM); pelvis.scale.z = .72; pelvis.position.y = -.02; pelvis.castShadow = true; hips.add(pelvis);
  const spine = new THREE.Group(); spine.position.y = .06; hips.add(spine);
  // الجذع: مقطع جانبي بتدرّج عرض (خصر ← صدر ← أكتاف)
  const prof = [[.0, -.02], [.165, -.02], [.168, .08], [.16, .2], [.175, .32], [.19, .42], [.185, .5], [.14, .56], [.07, .6], [0, .61]].map(([x, y]) => new THREE.Vector2(x, y));
  const tg = new THREE.LatheGeometry(prof, 28); const torso = new THREE.Mesh(tg, shirtM); torso.scale.set(1.15, 1, .66); torso.castShadow = true; spine.add(torso);
  const hem = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .03, 24, 1, true), shirtM); hem.scale.set(1, 1, .7); hem.position.y = -.01; spine.add(hem);
  [-1, 1].forEach(sd => { const shd = new THREE.Mesh(new THREE.SphereGeometry(.085, 16, 12), sleeveM); shd.scale.set(1, .85, 1); shd.position.set(sd * .2, .5, 0); shd.castShadow = true; spine.add(shd); });
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.075, .022, 8, 18), cuffM); collar.rotation.x = Math.PI / 2; collar.position.y = .6; spine.add(collar);
  // الرقم على الظهر والصدر
  const nt = numberTex(num, '#' + new THREE.Color(accent).getHexString(), 'rgba(0,0,0,.35)', name);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(.34, .34), new THREE.MeshStandardMaterial({ map: nt, transparent: true, roughness: .6, polygonOffset: true, polygonOffsetFactor: -2 }));
  back.position.set(0, .33, -.128); back.rotation.y = Math.PI; spine.add(back);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(.13, .13), back.material); front.position.set(-.08, .4, .128); spine.add(front);
  // الرقبة والرأس
  const neck = cap(.058, .07, skinM); neck.position.y = .65; spine.add(neck);
  const headG = new THREE.Group(); headG.position.y = .79; spine.add(headG);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.122, 24, 18), skinM); head.scale.set(.9, 1.06, .98); head.castShadow = true; headG.add(head);
  const hairC = new THREE.Mesh(new THREE.SphereGeometry(.129, 24, 12, 0, Math.PI * 2, 0, Math.PI * .5), hairM); hairC.scale.set(.92, 1.04, 1.02); hairC.position.set(0, .015, -.008); hairC.rotation.x = -.25; headG.add(hairC);
  [-1, 1].forEach(s => { const ear = new THREE.Mesh(new THREE.SphereGeometry(.025, 8, 6), skinM); ear.position.set(s * .105, 0, 0); headG.add(ear); });
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.02, 8, 6), skinM); nose.position.set(0, -.01, .11); headG.add(nose);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(.014, 8, 6), new THREE.MeshStandardMaterial({ color: 0x1a1a1a })); e.position.set(s * .04, .025, .1); headG.add(e); });

  // الذراعان
  const arm = (s) => {
    const sh = new THREE.Group(); sh.position.set(s * .225, .49, 0); spine.add(sh);
    const up = cap(.06, .2, sleeveM); up.position.y = -.12; sh.add(up);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.066, .066, .04, 12), cuffM); cuff.position.y = -.21; sh.add(cuff);
    const el = new THREE.Group(); el.position.y = -.27; sh.add(el);
    const fo = cap(.048, .18, gk ? sleeveM : skinM); fo.position.y = -.12; el.add(fo);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(gk ? .075 : .05, 10, 8), gk ? new THREE.MeshStandardMaterial({ color: gloves, roughness: .5 }) : skinM); hand.scale.set(.85, 1.2, .7); hand.position.y = -.27; hand.castShadow = true; el.add(hand);
    sh.rotation.z = s * .12; return { sh, el };
  };
  const armL = arm(1), armR = arm(-1);
  // الساقان
  const leg = (s) => {
    const hp = new THREE.Group(); hp.position.set(s * .1, -.04, 0); hips.add(hp);
    const sh = cap(.09, .14, shortsM); sh.position.y = -.1; sh.scale.set(1.08, 1, 1); hp.add(sh);
    const th = cap(.078, .26, skinM); th.position.y = -.22; hp.add(th);
    const kn = new THREE.Group(); kn.position.y = -.44; hp.add(kn);
    const sk = cap(.068, .3, socksM); sk.position.y = -.2; kn.add(sk);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(.071, .071, .045, 12), cuffM); band.position.y = -.05; kn.add(band);
    const an = new THREE.Group(); an.position.y = -.44; kn.add(an);
    const boot = new THREE.Mesh(new THREE.CapsuleGeometry(.055, .13, 4, 10), bootM); boot.rotation.x = Math.PI / 2; boot.scale.set(1.15, 1, .8); boot.position.set(0, -.02, .06); boot.castShadow = true; an.add(boot);
    const sw = new THREE.Mesh(new THREE.BoxGeometry(.03, .02, .1), studM); sw.position.set(s * .06, -.01, .06); an.add(sw);
    return { hp, kn, an };
  };
  const legL = leg(1), legR = leg(-1);
  P.userData = { hips, spine, headG, armL, armR, legL, legR, phase: Math.random() * 6 };
  return P;
}

// إعادة المفاصل إلى الوضع الطبيعي
export function rest(P) {
  const u = P.userData;
  [u.legL, u.legR].forEach(l => { l.hp.rotation.set(0, 0, 0); l.kn.rotation.set(0, 0, 0); l.an.rotation.set(0, 0, 0); });
  u.armL.sh.rotation.set(0, 0, .12); u.armR.sh.rotation.set(0, 0, -.12); u.armL.el.rotation.set(0, 0, 0); u.armR.el.rotation.set(0, 0, 0);
  u.spine.rotation.set(0, 0, 0); u.headG.rotation.set(0, 0, 0); u.hips.position.y = .98;
}
export function poseIdle(P, t) { // وقفة متحفّزة مع تنفّس خفيف
  const u = P.userData, b = Math.sin(t * 2.2 + u.phase);
  u.legL.hp.rotation.set(-.12, 0, .06); u.legR.hp.rotation.set(-.12, 0, -.06); u.legL.kn.rotation.x = .22; u.legR.kn.rotation.x = .22;
  u.armL.sh.rotation.set(.1, 0, .2); u.armR.sh.rotation.set(.1, 0, -.2); u.armL.el.rotation.x = -.5; u.armR.el.rotation.x = -.5;
  u.spine.rotation.x = .12 + b * .02; u.hips.position.y = .95 + b * .008;
}
export function poseArmsUp(P, t) { // احتفال: ذراعان للأعلى
  const u = P.userData, w = Math.sin(t * 9);
  u.armL.sh.rotation.set(0, 0, 2.5 + w * .15); u.armR.sh.rotation.set(0, 0, -2.5 - w * .15); u.armL.el.rotation.x = -.2; u.armR.el.rotation.x = -.2;
  u.spine.rotation.x = -.15; u.headG.rotation.x = -.25;
}
// وضعيات: run(phase, amount) ، kick(t) ، gk ready/dive
export function poseRun(P, ph, amt = 1) {
  const u = P.userData, s = Math.sin(ph), c = Math.cos(ph);
  u.legL.hp.rotation.x = -s * .75 * amt; u.legR.hp.rotation.x = s * .75 * amt;
  u.legL.kn.rotation.x = Math.max(0, c) * 1.25 * amt + .15; u.legR.kn.rotation.x = Math.max(0, -c) * 1.25 * amt + .15;
  u.legL.an.rotation.x = -.15; u.legR.an.rotation.x = -.15;
  u.armL.sh.rotation.x = s * .7 * amt; u.armR.sh.rotation.x = -s * .7 * amt;
  u.armL.el.rotation.x = -1.1 * amt - .2; u.armR.el.rotation.x = -1.1 * amt - .2;
  u.spine.rotation.x = .2 * amt; u.spine.rotation.y = s * .12 * amt;
  u.hips.position.y = .98 - .05 * amt + Math.abs(c) * .06 * amt;
}
export function poseKick(P, t) { // t: 0 رجوع، .5 ضربة، 1 متابعة
  const u = P.userData, k = t < .5 ? t / .5 : 1, f = t < .5 ? 0 : (t - .5) / .5;
  u.legR.hp.rotation.x = .9 * (1 - k) * (t < .5 ? 1 : 0) - (t < .5 ? 0 : 1.3 * Math.sin(f * Math.PI / 2));
  u.legR.kn.rotation.x = t < .5 ? 1.6 * k : 1.6 * (1 - f) * .3;
  u.legL.hp.rotation.x = -.15; u.legL.kn.rotation.x = .35;
  u.armL.sh.rotation.set(-.4, 0, 1.0); u.armR.sh.rotation.set(.5, 0, -.6); u.armL.el.rotation.x = -.4; u.armR.el.rotation.x = -.4;
  u.spine.rotation.x = .15 - .35 * f; u.spine.rotation.y = .2;
  u.hips.position.y = .93;
}
export function poseGK(P, t = 0) { // وقفة الاستعداد
  const u = P.userData;
  u.legL.hp.rotation.set(-.55, 0, .22); u.legR.hp.rotation.set(-.55, 0, -.22);
  u.legL.kn.rotation.x = 1.05; u.legR.kn.rotation.x = 1.05; u.legL.an.rotation.x = -.45; u.legR.an.rotation.x = -.45;
  u.armL.sh.rotation.set(-.9, 0, .75 + Math.sin(t * 3) * .05); u.armR.sh.rotation.set(-.9, 0, -.75 - Math.sin(t * 3) * .05);
  u.armL.el.rotation.x = -.5; u.armR.el.rotation.x = -.5;
  u.spine.rotation.x = .45; u.hips.position.y = .78;
}

export function buildBall(env) {
  const g = new THREE.IcosahedronGeometry(.11, 6);
  const ico = new THREE.IcosahedronGeometry(1, 0).attributes.position; const dirs = [];
  for (let i = 0; i < ico.count; i++) { const v = new THREE.Vector3(ico.getX(i), ico.getY(i), ico.getZ(i)).normalize(); if (!dirs.some(d => d.distanceTo(v) < 1e-3)) dirs.push(v); }
  const p = g.attributes.position, col = []; const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize(); let m = 0, m2 = 0; dirs.forEach(d => { const x = v.dot(d); if (x > m) { m2 = m; m = x; } else if (x > m2) m2 = x; });
    const dark = m > .915; const seam = !dark && m - m2 < .025;
    if (dark) col.push(.05, .07, .12); else if (seam) col.push(.6, .6, .62); else col.push(.97, .97, .97);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const ball = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .35, clearcoat: .8, clearcoatRoughness: .2, envMap: env, envMapIntensity: .8 }));
  ball.castShadow = true; return ball;
}

// شارة الشخصية فوق اللاعب
export function avatarTag(img, color) {
  const t = canvasTex(256, 300, (c) => {
    c.fillStyle = color; c.beginPath(); c.arc(128, 120, 112, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(100, 220); c.lineTo(156, 220); c.lineTo(128, 286); c.closePath(); c.fill();
    c.save(); c.beginPath(); c.arc(128, 120, 98, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.clip();
    if (img) { const s = 196 / img.width * 2.1; c.drawImage(img, 128 - img.width * s / 2, 30, img.width * s, img.height * s); }
    c.restore();
  });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(1.0, 1.17, 1); s.renderOrder = 10; return s;
}

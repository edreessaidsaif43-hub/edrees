// كورنيش مطرح عند الغروب — مسار مستقيم نحو -z
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, rnd } from './util.js';

export const LANES = [3.15, 1.05, -1.05, -3.15]; // من اليمين (أ) إلى اليسار (د)
export const PW = 4.6; // نصف عرض الممشى
// مسارات الطريق: سيارات باتجاه الجري، سيارات بالاتجاه المعاكس، الدراجات
export const ROAD = { same: -8.0, opp: -12.0, bike: -5.85 };
const SUN_DIR = new THREE.Vector3(.42, .13, -1).normalize();

function skyTex() {
  return canvasTex(1024, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, '#1d2f6b'); g.addColorStop(.32, '#5a5f9e'); g.addColorStop(.5, '#d98a7a'); g.addColorStop(.58, '#ffb27a'); g.addColorStop(.66, '#ffd9a0'); g.addColorStop(1, '#ffe7c2');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    const r = rnd(7);
    for (let i = 0; i < 26; i++) { const x = r() * 1024, y = 150 + r() * 120, w = 80 + r() * 220; const cg = c.createLinearGradient(0, y - 8, 0, y + 10); cg.addColorStop(0, 'rgba(255,190,160,0)'); cg.addColorStop(.5, 'rgba(255,170,140,' + (.25 + r() * .3) + ')'); cg.addColorStop(1, 'rgba(255,190,160,0)'); c.fillStyle = cg; c.beginPath(); c.ellipse(x, y, w, 6 + r() * 8, 0, 0, 7); c.fill(); }
  });
}
export function buildSky(S) {
  const t = skyTex(); t.mapping = THREE.EquirectangularReflectionMapping;
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, fog: false, depthWrite: false }));
  t.mapping = THREE.UVMapping; S.add(sky);
  // قرص الشمس وهالتها
  const glow = canvasTex(256, 256, (c) => { const g = c.createRadialGradient(128, 128, 0, 128, 128, 128); g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(.12, 'rgba(255,236,170,1)'); g.addColorStop(.22, 'rgba(255,190,110,.55)'); g.addColorStop(1, 'rgba(255,150,90,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256); });
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending })); sun.position.copy(SUN_DIR).multiplyScalar(820); sun.scale.set(260, 260, 1); S.add(sun);
  return { sky, sun };
}
export function skyEnv(R) {
  const s = new THREE.Scene(); buildSky(s);
  const pm = new THREE.PMREMGenerator(R); const env = pm.fromScene(s, .02, .1, 2000).texture; pm.dispose(); return env;
}

function tilesTex() {
  return canvasTex(512, 1024, (c) => {
    c.fillStyle = '#e8d8bc'; c.fillRect(0, 0, 512, 1024);
    const r = rnd(3);
    for (let y = 0; y < 1024; y += 64) for (let x = 0; x < 512; x += 64) { const v = 220 + r() * 18 | 0; c.fillStyle = `rgb(${v + 8},${v - 6},${v - 30})`; c.fillRect(x + 1, y + 1, 62, 62); }
    // شريط زخرفي بين المسارات
    [128, 256, 384].forEach(x => { c.fillStyle = '#b5543a'; c.fillRect(x - 5, 0, 10, 1024); c.fillStyle = '#f6efe2'; for (let y = 0; y < 1024; y += 32) { c.beginPath(); c.moveTo(x, y + 4); c.lineTo(x + 4, y + 16); c.lineTo(x, y + 28); c.lineTo(x - 4, y + 16); c.fill(); } });
    c.fillStyle = '#8e3d2a'; c.fillRect(0, 0, 10, 1024); c.fillRect(502, 0, 10, 1024);
  });
}
function noiseNormal() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), im = x.createImageData(n, n), r = rnd(11);
  const h = new Float32Array(n * n); const waves = []; for (let i = 0; i < 14; i++) waves.push([1 + (r() * 8 | 0), (r() * 8 | 0) - 4, r() * 6.28, .3 + r() * .7]);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0; waves.forEach(w => s += Math.sin((i * w[0] + j * w[1] * 3) / n * 6.2832 + w[2]) * w[3]); h[j * n + i] = s; }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const dx = h[j * n + (i + 1) % n] - h[j * n + (i + n - 1) % n], dy = h[((j + 1) % n) * n + i] - h[((j + n - 1) % n) * n + i]; const k = (j * n + i) * 4; im.data[k] = 128 + dx * 22; im.data[k + 1] = 128 + dy * 22; im.data[k + 2] = 255; im.data[k + 3] = 255; }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
function facadeTex(seed, base, shut) {
  return canvasTex(512, 512, (c) => {
    const r = rnd(seed); c.fillStyle = base; c.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 600; i++) { c.fillStyle = `rgba(120,90,60,${r() * .05})`; c.fillRect(r() * 512, r() * 512, 2 + r() * 30, 2 + r() * 30); }
    // صفّان من النوافذ المقوّسة
    for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
      const x = 40 + i * 120, y = 70 + row * 230, w = 62, h = 120;
      c.fillStyle = '#3b2a1e'; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + 30); c.arc(x + w / 2, y + 30, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.fill();
      c.fillStyle = shut; c.fillRect(x + 4, y + 34, w / 2 - 6, h - 38); c.fillRect(x + w / 2 + 2, y + 34, w / 2 - 6, h - 38);
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(x + 6, y + 44 + k * 13); c.lineTo(x + w - 6, y + 44 + k * 13); c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 6; c.beginPath(); c.arc(x + w / 2, y + 30, w / 2 + 6, Math.PI, 0); c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(0, 496, 512, 16);
  });
}

// يُبنى الكورنيش من مقطع طوله L يتكرر مرتين (z من +40 إلى -2L)؛ المحرك يعيد العدّاء L مترًا للخلف كلما تجاوزه
export function buildCorniche(R, S, Q, o = {}) {
  const env = o.env, L = o.L || 600, z0 = 40, LL = 2 * L + z0 + 20, zc = z0 - LL / 2, out = { L };
  const lowQ = Q.low;
  // الممشى
  const tt = tilesTex(); tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(1, LL / (L / 32)); tt.offset.y = -(z0 % (L / 32)) / (L / 32); tt.anisotropy = 8;
  const prom = new THREE.Mesh(new THREE.PlaneGeometry(PW * 2, LL), new THREE.MeshStandardMaterial({ map: tt, roughness: .85 }));
  prom.rotation.x = -Math.PI / 2; prom.position.set(0, 0, zc); prom.receiveShadow = true; S.add(prom);
  const mk = (w, x, col, y = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, LL), new THREE.MeshStandardMaterial({ color: col, roughness: .9 })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, zc); m.receiveShadow = true; S.add(m); return m; };
  const curb = new THREE.Mesh(new THREE.BoxGeometry(.5, .25, LL), new THREE.MeshStandardMaterial({ color: 0xcfc4b0, roughness: .8 })); curb.position.set(-PW - .25, .02, zc); curb.receiveShadow = true; S.add(curb);
  const roadT = canvasTex(256, 512, (c) => {
    c.fillStyle = '#4a4a4f'; c.fillRect(0, 0, 256, 512); const rr = rnd(9); for (let i = 0; i < 2000; i++) { c.fillStyle = `rgba(255,255,255,${rr() * .05})`; c.fillRect(rr() * 256, rr() * 512, 2, 2); }
    c.fillStyle = '#2f8a4e'; c.fillRect(214, 0, 42, 512); c.fillStyle = '#f2f2f2'; c.fillRect(210, 0, 5, 512);
    c.save(); c.translate(235, 256); c.strokeStyle = '#f2f2f2'; c.lineWidth = 3; c.beginPath(); c.arc(0, -16, 9, 0, 7); c.stroke(); c.beginPath(); c.arc(0, 16, 9, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0, -16); c.lineTo(-6, 0); c.lineTo(0, 16); c.stroke(); c.restore();
    c.fillStyle = '#f2f2f2'; c.fillRect(110, 0, 6, 260); c.fillStyle = '#e8c547'; c.fillRect(6, 0, 6, 512);
  });
  roadT.wrapT = THREE.RepeatWrapping; roadT.repeat.set(1, LL / (L / 40)); roadT.offset.y = -(z0 % (L / 40)) / (L / 40);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(9, LL), new THREE.MeshStandardMaterial({ map: roadT, roughness: .75 })); road.rotation.x = -Math.PI / 2; road.position.set(-PW - .5 - 4.5, -.08, zc); road.receiveShadow = true; S.add(road);
  mk(4, -PW - 9.5 - 2, 0xd9ccb4, .06);
  // الحاجز الأبيض على البحر
  const wmat = new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: .7 });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(.7, .45, LL), wmat); plinth.position.set(PW + .35, .22, zc); plinth.castShadow = plinth.receiveShadow = true; S.add(plinth);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(.32, .12, LL), wmat); rail.position.set(PW + .35, 1.12, zc); rail.castShadow = true; S.add(rail);
  const balN = Math.floor(LL / .5), bal = new THREE.InstancedMesh(new THREE.LatheGeometry([[.07, 0], [.09, .05], [.05, .15], [.085, .38], [.05, .55], [.08, .62]].map(p => new THREE.Vector2(p[0], p[1])), 6), wmat, balN);
  const m4 = new THREE.Matrix4(); for (let i = 0; i < balN; i++) { m4.makeTranslation(PW + .35, .45, z0 - i * .5); bal.setMatrixAt(i, m4); } bal.castShadow = !lowQ; S.add(bal);
  // البحر
  const nn = noiseNormal(); nn.repeat.set(40, (LL + 600) / (L / 60));
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(1400, LL + 600), new THREE.MeshStandardMaterial({ color: 0x2a6f8f, roughness: .14, metalness: .2, normalMap: nn, normalScale: new THREE.Vector2(.35, .35), envMap: env, envMapIntensity: 1.3 }));
  sea.rotation.x = -Math.PI / 2; sea.position.set(PW + 700.6, -1.1, zc - 300); S.add(sea); out.sea = sea; out.seaN = nn;
  const seawall = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.3, LL), new THREE.MeshStandardMaterial({ color: 0xd8cdb8, roughness: .9 })); seawall.position.set(PW + .6, -.5, zc); S.add(seawall);
  // مواد مشتركة
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x7a5a44, roughness: 1, flatShading: true });
  const sand = new THREE.MeshStandardMaterial({ color: 0xd8b98c, roughness: .95 });
  const facMats = [['#f4ecdc', '#2f6f8a'], ['#efe2c6', '#3a7a4a'], ['#f7f2e8', '#7a4a2a'], ['#e9d8b8', '#2f6f8a'], ['#f2e6d0', '#8a2f3a']].map((c, i) => { const t = facadeTex(20 + i, c[0], c[1]); t.wrapS = t.wrapT = THREE.RepeatWrapping; return new THREE.MeshStandardMaterial({ map: t, roughness: .9 }); });
  const plain = new THREE.MeshStandardMaterial({ color: 0xf0e6d2, roughness: .9 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4428, roughness: .8 });
  const palmG = palmGeo(), palmMat = [new THREE.MeshStandardMaterial({ color: 0x8a6a46, roughness: .9 }), new THREE.MeshStandardMaterial({ color: 0x3f7a2e, roughness: .8, side: THREE.DoubleSide })];
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x2b3a32, roughness: .5, metalness: .6 }), glowMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffc46a, emissiveIntensity: 2.2 });
  out.dhows = [];
  const bx = -PW - 13.6;
  // مقطع واحد (يُكرَّر بنفس البذرة فيتطابق تمامًا)
  const segment = (off) => {
    const r = rnd(5), Gfac = facMats.map(() => []), Gplain = [], Gwood = [], Gm = [];
    // سفن الداو
    for (let i = 0; i < 5; i++) { const d = dhow(r); d.position.set(PW + 22 + r() * 90, -1.1, off - 30 - i * 120 - r() * 30); d.rotation.y = (r() - .5) * 2; d.scale.setScalar(.8 + r() * .7); S.add(d); out.dhows.push(d); }
    // التلال عبر الخليج وخلف البيوت
    const hills = [];
    const bump = (g, i, a, b2) => { const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const v = new THREE.Vector3().fromBufferAttribute(p, k); v.multiplyScalar(1 + (Math.sin(v.x * a + i) + Math.cos(v.z * b2 + i * 2)) * .13 + (r() - .5) * .1); p.setXYZ(k, v.x, v.y, v.z); } };
    for (let i = 0; i < 8; i++) { const g = new THREE.IcosahedronGeometry(1, 3); bump(g, i, 4.1, 3.7); g.scale(40 + r() * 50, 30 + r() * 40, 40 + r() * 40); g.translate(PW + 260 + r() * 140, -8, off - i * 75); hills.push(g.toNonIndexed()); }
    for (let i = 0; i < 14; i++) { const g = new THREE.IcosahedronGeometry(1, lowQ ? 2 : 3); bump(g, i * 3, 5, 4); g.scale(26 + r() * 18, 34 + r() * 36, 26 + r() * 20); g.translate(-PW - 66 - r() * 40, -6, off - i * 45); hills.push(g.toNonIndexed()); }
    const hm = new THREE.Mesh(mergeGeometries(hills), hillMat); hm.receiveShadow = true; S.add(hm);
    [[-PW - 50, 34, -60], [-PW - 62, 40, -230], [-PW - 48, 30, -410], [PW + 250, 30, -180]].forEach(([x, y, z]) => S.add(tower(sand, x, y, off + z, 1.4)));
    // البيوت
    let z = off;
    while (z > off - L) {
      const w = 9 + r() * 7, h = 7 + r() * 8, dd = 10, fi = (r() * facMats.length) | 0, ba = r(), ac = r();
      if (Math.abs(z - (off - 175)) < 14) { mosque(S, bx - 8, z - 12); z -= 30; continue; }
      if (Math.abs(z - (off - 100)) < 10) { souqGate(S, bx, z - 8, sand, wood); z -= 18; continue; }
      if (z - w < off - L) { const ww = z - (off - L); if (ww > 1) { const g = new THREE.BoxGeometry(dd, h, ww); g.translate(bx - dd / 2, h / 2, z - ww / 2); Gplain.push(g); } break; }
      const body = new THREE.BoxGeometry(dd, h, w); body.translate(bx - dd / 2, h / 2, z - w / 2); Gplain.push(body);
      const f = new THREE.PlaneGeometry(w, h); const uv = f.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 10, uv.getY(k) * h / 7); f.rotateY(Math.PI / 2); f.translate(bx + .02, h / 2, z - w / 2); Gfac[fi].push(f);
      if (ba < .6) { const b1 = new THREE.BoxGeometry(1.1, 1.6, w * .45); b1.translate(bx + .55, h * .55, z - w / 2); Gwood.push(b1); }
      const mer = Math.floor(w / .9); for (let k = 0; k < mer; k++) { const m = new THREE.ConeGeometry(.28, .7, 4); m.rotateY(Math.PI / 4); m.translate(bx - .2, h + .32, z - .45 - k * .9); Gm.push(m); }
      if (ac < .3) { const a = new THREE.BoxGeometry(1.2, .8, 1); a.translate(bx - 3, h + .4, z - w * .3); Gplain.push(a); }
      z -= w + .2;
    }
    const add = (gs, mat, sh = true) => { if (!gs.length) return; const m = new THREE.Mesh(mergeGeometries(gs.map(g => g.index ? g.toNonIndexed() : g)), mat); m.castShadow = sh; m.receiveShadow = true; S.add(m); };
    Gfac.forEach((gs, i) => add(gs, facMats[i], false)); add(Gplain, plain); add(Gwood, wood); add(Gm, plain, false);
    // النخيل والفوانيس والأعلام (مسافات تقسم L)
    const nP = Math.round(L / 15), trunk = new THREE.InstancedMesh(palmG.trunk, palmMat[0], nP), lv = new THREE.InstancedMesh(palmG.leaves, palmMat[1], nP);
    const q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3();
    for (let i = 0; i < nP; i++) { const s2 = .9 + r() * .35; q.setFromEuler(new THREE.Euler((r() - .5) * .08, r() * 6, (r() - .5) * .08)); sc.setScalar(s2); ps.set(-PW - 11.8, 0, off - 6 - i * 15); m4.compose(ps, q, sc); trunk.setMatrixAt(i, m4); lv.setMatrixAt(i, m4); }
    trunk.castShadow = lv.castShadow = !lowQ; S.add(trunk, lv);
    const nL = Math.round(L / 15), poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .11, 4.6, 8).translate(0, 2.3, 0), lampMat, nL), lan = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .16, .55, 6).translate(0, 4.9, 0), glowMat, nL), cap = new THREE.InstancedMesh(new THREE.ConeGeometry(.3, .35, 6).translate(0, 5.35, 0), lampMat, nL);
    for (let i = 0; i < nL; i++) { m4.makeTranslation(PW + .35, 1.18, off - 4 - i * 15); poles.setMatrixAt(i, m4); lan.setMatrixAt(i, m4); cap.setMatrixAt(i, m4); }
    poles.castShadow = !lowQ; S.add(poles, lan, cap);
    for (let i = 0; i < Math.round(L / 75); i++) { const fl = omanFlag(.6); fl.position.set(PW + .35, 1.2, off - 30 - i * 75); S.add(fl); }
  };
  segment(0); segment(-L);
  // ما خلف نقطة البداية (+40 متر) نسخة من نهاية المقطع
  return out;
}
// قلعة مطرح على الصخرة: خط النهاية (عنصر متحرك يضعه المحرك)
export function buildFort() {
  const g = new THREE.Group(), sand = new THREE.MeshStandardMaterial({ color: 0xd8b98c, roughness: .95 }), hillMat = new THREE.MeshStandardMaterial({ color: 0x7a5a44, roughness: 1, flatShading: true });
  const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), hillMat); rock.scale.set(13, 17, 18); rock.position.set(28, 0, -42); g.add(rock);
  const rock2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), hillMat); rock2.scale.set(10, 11, 12); rock2.position.set(19, -2, -30); g.add(rock2);
  [[27, 15, -40, 5], [33, 12, -50, 4], [20, 8, -30, 3.6]].forEach(([x, y, zz, rr]) => g.add(tower(sand, x, y, zz, rr / 3)));
  const wl = new THREE.Mesh(new THREE.BoxGeometry(2, 6, 16), sand); wl.position.set(24, 12, -36); wl.rotation.y = .3; g.add(wl);
  const flag = omanFlag(); flag.position.set(27, 15 + 12 * 1.67 + 1, -40); g.add(flag);
  // قوس خط النهاية على الممشى
  const st = new THREE.MeshStandardMaterial({ color: 0xe9d6b0, roughness: .85 }), red = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: .6 });
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(.7, 6.2, .7), st); p.position.set(s * (PW + .1), 3.1, 0); p.castShadow = true; g.add(p); });
  const ban = canvasTex(1024, 160, (c) => { c.fillStyle = '#c8202a'; c.fillRect(0, 0, 1024, 160); for (let i = 0; i < 32; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * 32, j * 20, 32, 20); c.fillRect(i * 32, 120 + j * 20, 32, 20); } c.fillStyle = '#fff'; c.font = '900 72px Taj, sans-serif'; c.textAlign = 'center'; c.direction = 'rtl'; c.fillText('خط النهاية — قلعة مطرح', 512, 100); });
  const b = new THREE.Mesh(new THREE.BoxGeometry(PW * 2 + .8, 1.2, .4), [red, red, red, red, new THREE.MeshStandardMaterial({ map: ban, roughness: .6 }), new THREE.MeshStandardMaterial({ map: ban, roughness: .6 })]); b.position.y = 6.4; g.add(b);
  const line = canvasTex(256, 32, (c) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * 16, j * 16, 16, 16); } });
  const ln = new THREE.Mesh(new THREE.PlaneGeometry(PW * 2, .8), new THREE.MeshStandardMaterial({ map: line })); ln.rotation.x = -Math.PI / 2; ln.position.y = .02; g.add(ln);
  return g;
}

function tower(mat, x, y, z, s = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.scale.setScalar(s);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.1, 8, 20), mat); body.position.y = 4; body.castShadow = true; g.add(body);
  for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; const m = new THREE.Mesh(new THREE.BoxGeometry(.7, .9, .5), mat); m.position.set(Math.cos(a) * 2.45, 8.4, Math.sin(a) * 2.45); m.rotation.y = -a; g.add(m); }
  for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + .4; const w = new THREE.Mesh(new THREE.BoxGeometry(.25, .9, .4), new THREE.MeshBasicMaterial({ color: 0x2a1d14 })); w.position.set(Math.cos(a) * 2.75, 5.5, Math.sin(a) * 2.75); w.rotation.y = -a; g.add(w); }
  return g;
}
function omanFlag(s = 1) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .05, 4, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: .6, roughness: .3 })); pole.position.y = 2; g.add(pole);
  const t = canvasTex(192, 128, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 192, 43); c.fillStyle = '#db161b'; c.fillRect(0, 43, 192, 42); c.fillStyle = '#008000'; c.fillRect(0, 85, 192, 43); c.fillStyle = '#db161b'; c.fillRect(0, 0, 60, 128); c.fillStyle = '#fff'; c.font = 'bold 30px sans-serif'; c.textAlign = 'center'; c.fillText('⚔', 30, 42); });
  const geo = new THREE.PlaneGeometry(1.8, 1.2, 12, 4); const p = geo.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, Math.sin(x * 3) * .08 * (x + .9)); } geo.translate(.9, 0, 0);
  const f = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: .8 })); f.position.y = 3.4; f.rotation.y = -.6; g.add(f);
  g.scale.setScalar(s * 1.6); return g;
}
function dhow(r) {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x7a4e2a, roughness: .7 });
  const sh = new THREE.Shape(); sh.moveTo(-6, 1.6); sh.quadraticCurveTo(-4.5, -.4, 0, -.6); sh.quadraticCurveTo(4.2, -.4, 5.6, 2.2); sh.lineTo(5, 2.2); sh.lineTo(-5.4, 1.8); sh.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: true, bevelThickness: .4, bevelSize: .3, bevelSegments: 2 }), wood); hull.position.z = -1.3; hull.castShadow = true; g.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, .2, 2.4), new THREE.MeshStandardMaterial({ color: 0xc89a62 })); deck.position.y = 1.7; g.add(deck);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 9, 6), wood); mast.position.set(.5, 6, 0); mast.rotation.z = .12; g.add(mast);
  const sail = new THREE.Shape(); sail.moveTo(-5, 9); sail.lineTo(5.5, 11.5); sail.lineTo(1, 2.6); sail.closePath();
  const sm = new THREE.Mesh(new THREE.ShapeGeometry(sail), new THREE.MeshStandardMaterial({ color: 0xf6eedc, roughness: .9, side: THREE.DoubleSide })); sm.position.z = .15; g.add(sm);
  const st = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xe8dcc4 })); st.position.set(-3.6, 2.4, 0); g.add(st);
  return g;
}
function mosque(S, x, z) {
  const wht = new THREE.MeshStandardMaterial({ color: 0xf6f2ea, roughness: .7 }), blue = new THREE.MeshStandardMaterial({ color: 0x2f7fc4, roughness: .25, metalness: .4 }), gold = new THREE.MeshStandardMaterial({ color: 0xe8c45a, metalness: .8, roughness: .3 });
  const g = new THREE.Group(); g.position.set(x, 0, z); S.add(g);
  const b = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 22), wht); b.position.y = 4.5; b.castShadow = true; g.add(b);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 2.4, 24), wht); drum.position.y = 10.2; g.add(drum);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(5.2, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), blue); dome.position.y = 11.4; dome.scale.y = 1.25; dome.castShadow = true; g.add(dome);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(.4, 10, 8), gold); fin.position.y = 18.2; g.add(fin);
  [[7, 9.5], [7, -9.5]].forEach(([mx, mz]) => {
    const mn = new THREE.Mesh(new THREE.CylinderGeometry(.9, 1.1, 22, 12), wht); mn.position.set(mx, 11, mz); mn.castShadow = true; g.add(mn);
    const bal = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, .8, 12), wht); bal.position.set(mx, 17, mz); g.add(bal);
    const top = new THREE.Mesh(new THREE.ConeGeometry(1, 3, 12), blue); top.position.set(mx, 23.5, mz); g.add(top);
  });
  for (let k = 0; k < 4; k++) { const a = new THREE.Mesh(new THREE.BoxGeometry(.3, 4, 2.4), new THREE.MeshStandardMaterial({ color: 0x24506e })); a.position.set(8.05, 3.5, -7.5 + k * 5); g.add(a); }
}
function souqGate(S, x, z, sand, wood) {
  const g = new THREE.Group(); g.position.set(x + .5, 0, z); S.add(g);
  const wht = new THREE.MeshStandardMaterial({ color: 0xf3ead8, roughness: .8 });
  [-6, 6].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(3, 10, 3), wht); p.position.set(0, 5, s); p.castShadow = true; g.add(p); });
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3, 15), wht); top.position.set(0, 10.5, 0); top.castShadow = true; g.add(top);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(4.5, .5, 8, 24, Math.PI), wht); arch.rotation.y = Math.PI / 2; arch.position.set(1.4, 4.5, 0); g.add(arch);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, .5, 15.4), wood); roof.position.set(0, 12.2, 0); g.add(roof);
  const sign = canvasTex(512, 128, (c) => { c.fillStyle = '#6b4428'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#ffe2a0'; c.font = 'bold 74px Taj, sans-serif'; c.textAlign = 'center'; c.direction = 'rtl'; c.fillText('سوق مطرح', 256, 92); });
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.75), new THREE.MeshStandardMaterial({ map: sign, roughness: .6 })); sg.rotation.y = Math.PI / 2; sg.position.set(1.65, 10.5, 0); g.add(sg);
  const dark = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ color: 0x2a1c12 })); dark.rotation.y = Math.PI / 2; dark.position.set(-1, 4.5, 0); g.add(dark);
}
function palmGeo() {
  const tr = []; for (let i = 0; i < 8; i++) { const c = new THREE.CylinderGeometry(.19 - i * .008, .22 - i * .008, .9, 8); c.translate(Math.sin(i * .4) * .06, .45 + i * .88, 0); tr.push(c); }
  const lf = []; for (let i = 0; i < 11; i++) { const a = i / 11 * Math.PI * 2; const p = new THREE.PlaneGeometry(.75, 3.4, 1, 6); const pa = p.attributes.position; for (let k = 0; k < pa.count; k++) { const y = pa.getY(k) + 1.7; pa.setZ(k, -y * y * .09); pa.setX(k, pa.getX(k) * (1 - y / 3.6)); pa.setY(k, y); } p.rotateX(-1.05); p.rotateY(a); p.translate(0, 7.1, 0); lf.push(p); }
  return { trunk: mergeGeometries(tr), leaves: mergeGeometries(lf) };
}

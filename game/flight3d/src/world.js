// ساحل مسقط: سماء فيزيائية، بحر بانعكاسات، جبال، مطرح، مبخرة ريام
import * as THREE from 'three';
import { Sky } from './vendor/jsm/objects/Sky.js';
import { Water } from './vendor/jsm/objects/Water.js';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, rnd } from './util.js';
import { toon, outline } from './toon.js';

// ---------- ضوضاء ----------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export function fbm(x, y, o = 5) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
export function ridged(x, y, o = 5) { let s = 0, a = .5, f = 1, w = 1; for (let i = 0; i < o; i++) { let n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); n *= n; n *= w; w = Math.min(1, n * 1.6); s += a * n; f *= 2.1; a *= .5; } return s; }
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- السماء الكرتونية: تدرّج لوني وشمس، بألوان تتغيّر مع وقت اليوم ----------
export const SKIES = {
  sunrise: { top: 0x5ab8ff, mid: 0xffc6a8, bot: 0xffe6b8, sun: 0xfff2c0, glow: 0xffb070, light: 0xffe0b8, hemi: [0xbfe0ff, 0xffc89a], fog: 0xffd9bb },
  morning: { top: 0x0077ff, mid: 0x3fc0ff, bot: 0xaaf0ff, sun: 0xffffff, glow: 0xfff3a0, light: 0xfff6e6, hemi: [0xb8e8ff, 0xffb8c8], fog: 0x9fe4ff },
  noon: { top: 0x1f8ff0, mid: 0x6ccaff, bot: 0xc9f0ff, sun: 0xffffff, glow: 0xfff8d0, light: 0xffffff, hemi: [0xd4f0ff, 0xfff0c8], fog: 0xbfe9ff },
  afternoon: { top: 0x3a8ff0, mid: 0x9ccfff, bot: 0xffe8c4, sun: 0xfff6d8, glow: 0xffd890, light: 0xfff0d4, hemi: [0xc8e2ff, 0xffd8a8], fog: 0xffe6cc },
  sunset: { top: 0x5a5fd8, mid: 0xff8fa0, bot: 0xffc070, sun: 0xffe2a0, glow: 0xff8a50, light: 0xffb888, hemi: [0xb0a8ff, 0xff9e70], fog: 0xffb89a }
};
export function buildSky(S) {
  const U = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, .3, -1).normalize() } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, mid, bot, sunCol, glow, sunDir; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0. ? mix(mid, top, smoothstep(0., .55, h)) : mix(mid, bot, smoothstep(0., -.25, h));
        c = mix(c, bot, smoothstep(.12, -.02, h) * .6);
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.);
        c += glow * pow(d, 18.) * .55; c = mix(c, sunCol, smoothstep(.9975, .9985, d));
        gl_FragColor = vec4(c, 1.); }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), mat); sky.renderOrder = -1; sky.frustumCulled = false; S.add(sky);
  const sunT = canvasTex(512, 512, (c) => { c.translate(256, 256); const g = c.createRadialGradient(0, 0, 40, 0, 0, 256); g.addColorStop(0, 'rgba(255,250,210,.9)'); g.addColorStop(.35, 'rgba(255,230,140,.35)'); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; c.fillRect(-256, -256, 512, 512); for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.fillStyle = 'rgba(255,240,170,.22)'; c.beginPath(); c.moveTo(-14, 70); c.lineTo(14, 70); c.lineTo(5, 250); c.lineTo(-5, 250); c.fill(); } c.fillStyle = '#fff8d8'; c.beginPath(); c.arc(0, 0, 56, 0, 7); c.fill(); c.strokeStyle = '#ffd860'; c.lineWidth = 10; c.stroke(); });
  const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunT, depthWrite: false, fog: false, transparent: true, toneMapped: false })); sunS.scale.setScalar(1300); sky.add(sunS);
  const cA = new THREE.Color(), cB = new THREE.Color();
  // مزج بين وقتين من اليوم (t من 0 إلى 1)
  function blend(kA, kB, t, sunDir) {
    const A = SKIES[kA], B = SKIES[kB], mix = (a, b) => cA.setHex(a).lerp(cB.setHex(b), t).getHex();
    const P = { top: mix(A.top, B.top), mid: mix(A.mid, B.mid), bot: mix(A.bot, B.bot), sun: mix(A.sun, B.sun), glow: mix(A.glow, B.glow), light: mix(A.light, B.light), hemi: [mix(A.hemi[0], B.hemi[0]), mix(A.hemi[1], B.hemi[1])], fog: mix(A.fog, B.fog) };
    U.top.value.setHex(P.top); U.mid.value.setHex(P.mid); U.bot.value.setHex(P.bot); U.sunCol.value.setHex(P.sun); U.glow.value.setHex(P.glow); U.sunDir.value.copy(sunDir).normalize(); sunS.position.copy(sunDir).normalize().multiplyScalar(7000);
    return P;
  }
  function setTime(key, sunDir) { const P = SKIES[key]; U.top.value.setHex(P.top); U.mid.value.setHex(P.mid); U.bot.value.setHex(P.bot); U.sunCol.value.setHex(P.sun); U.glow.value.setHex(P.glow); U.sunDir.value.copy(sunDir).normalize(); sunS.position.copy(sunDir).normalize().multiplyScalar(7000); return P; }
  return { sky, setTime, blend, U, sunS };
}

// ---------- البحر ----------
function waterNormals() {
  const n = 512, c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), im = x.createImageData(n, n);
  const r = rnd(4), waves = []; for (let i = 0; i < 26; i++) { const k = 1 + (r() * 12 | 0); waves.push([k * Math.cos(r() * 6.28) | 0 || 1, k * Math.sin(r() * 6.28) | 0, r() * 6.28, (.3 + r() * .7) / Math.sqrt(k)]); }
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { let s = 0; for (const w of waves) s += Math.sin((i * w[0] + j * w[1]) / n * 6.2832 + w[2]) * w[3]; h[j * n + i] = s; }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const dx = h[j * n + (i + 1) % n] - h[j * n + (i + n - 1) % n], dy = h[((j + 1) % n) * n + i] - h[((j + n - 1) % n) * n + i]; const k = (j * n + i) * 4; im.data[k] = 128 + dx * 40; im.data[k + 1] = 128 + dy * 40; im.data[k + 2] = 255; im.data[k + 3] = 255; }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
export function buildWater(S, sunDir, Q) {
  if (Q.low) { const nn = waterNormals(); nn.repeat.set(400, 400); const m = new THREE.MeshPhongMaterial({ color: 0x14c0d8, specular: 0xffffff, shininess: 80, normalMap: nn, normalScale: new THREE.Vector2(.25, .25) }); const w = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), m); w.rotation.x = -Math.PI / 2; S.add(w); w.userData.simple = nn; return w; }
  const g = new THREE.PlaneGeometry(30000, 30000);
  const water = new Water(g, { textureWidth: Q.waterRes || 512, textureHeight: Q.waterRes || 512, waterNormals: waterNormals(), sunDirection: sunDir.clone(), sunColor: 0xffffff, waterColor: 0x00c4dc, distortionScale: 1.4, fog: true, alpha: 1 });
  water.rotation.x = -Math.PI / 2; water.material.uniforms.size.value = 1.6; S.add(water);
  return water;
}

// ---------- الساحل والجبال ----------
// خط الشاطئ: اليابسة عند x < shoreX(z)، والبحر يمينًا
export function shoreX(z) { return -140 + 70 * Math.sin(z / 420) + 45 * Math.sin(z / 170 + 1.3) - 90 * Math.exp(-Math.pow((z + 700) / 160, 2)); }
export function heightAt(x, z) {
  const sx = shoreX(z), d = sx - x; // المسافة داخل اليابسة
  if (d < -40) return -12;
  const land = smooth(-10, 60, d);
  const m = ridged(x * .0036 + 11, z * .0036 - 7, 4) * 400 * smooth(20, 420, d) + fbm(x * .012, z * .012, 3) * 22;
  let h = land * (6 + m) - (1 - land) * 10;
  // تلّ مبخرة ريام عند الطرف الشرقي لمطرح
  const rx = shoreX(-905) - 26, rz = -905; h += 46 * Math.exp(-((x - rx) ** 2 + (z - rz) ** 2) / (2 * 30 ** 2));
  // سهل مطرح المنخفض (البيوت)
  h -= 0.85 * Math.max(0, h - 4) * Math.exp(-Math.pow((z + 700) / 120, 2)) * smooth(160, 60, d);
  return h;
}
export function buildTerrain(S, Q) {
  const size = 3600, seg = Q.terrainSeg || 260, g = new THREE.PlaneGeometry(size, size, seg, seg); g.rotateX(-Math.PI / 2); g.translate(-900, 0, -900);
  const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
  const sand = new THREE.Color(0xfff0bf), gold = new THREE.Color(0xffd27a), orange = new THREE.Color(0xffa866), rose = new THREE.Color(0xf7a0a6), lav = new THREE.Color(0xc9b0ff), green = new THREE.Color(0x86d86a), dgreen = new THREE.Color(0x5cbf6a);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, heightAt(x, z)); }
  g.computeVertexNormals(); const nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), y = p.getY(i), ny = nrm.getY(i), n = fbm(x * .03, z * .03, 3), nl = fbm(x * .006 + 5, z * .006, 3);
    if (y < 3) c.copy(sand);
    else {
      const t = Math.min(1, y / 380);
      if (t < .3) c.copy(gold).lerp(orange, t / .3); else if (t < .65) c.copy(orange).lerp(rose, (t - .3) / .35); else c.copy(rose).lerp(lav, (t - .65) / .35);
      // طبقات صخرية كرتونية
      const band = Math.sin(y * .09 + nl * 4) > .6 ? 1 : 0; c.offsetHSL(0, 0, band ? .035 : 0);
      if (ny < .55) c.offsetHSL(.0, -.05, -.06);
      if (y < 55 && ny > .84 && nl > .5) c.lerp(nl > .6 ? dgreen : green, Math.min(.8, (nl - .5) * 8));
    }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const detail = canvasTex(256, 256, (cx) => { const r = rnd(2); cx.fillStyle = '#808080'; cx.fillRect(0, 0, 256, 256); for (let i = 0; i < 5000; i++) { const v = 100 + r() * 60 | 0; cx.fillStyle = `rgb(${v},${v},${v})`; cx.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3); } });
  detail.colorSpace = THREE.NoColorSpace; detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.repeat.set(220, 220);
  const m = toon(0xffffff, { vertexColors: true });
  const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; S.add(mesh);
  // مياه ضحلة فيروزية فاتحة وخطوط زبد بيضاء على طول الشاطئ
  const zs = [], N = 260; for (let k = 0; k <= N; k++) zs.push(400 - k * (2600 / N));
  const strip = (off0, off1, mat, y) => { const pos = [], idx = [], uv = []; zs.forEach((z, k) => { const sx = shoreX(z); pos.push(sx + off0, y, z, sx + off1, y, z); uv.push(0, k / 6, 1, k / 6); if (k) { const a = (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); gg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); gg.setIndex(idx); gg.computeVertexNormals(); const mm = new THREE.Mesh(gg, mat); mm.renderOrder = 2; S.add(mm); return mm; };
  const shT = canvasTex(64, 8, (c) => { const gr = c.createLinearGradient(0, 0, 64, 0); gr.addColorStop(0, 'rgba(120,255,240,.85)'); gr.addColorStop(.5, 'rgba(70,235,240,.55)'); gr.addColorStop(1, 'rgba(0,200,230,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 8); });
  strip(-6, 70, new THREE.MeshBasicMaterial({ map: shT, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }), .25);
  const foT = canvasTex(64, 256, (c) => { c.fillStyle = 'rgba(255,255,255,0)'; c.fillRect(0, 0, 64, 256); c.strokeStyle = '#ffffff'; c.lineWidth = 7; for (let k = 0; k < 2; k++) { c.beginPath(); for (let y = 0; y <= 256; y += 8) { const x = 16 + k * 28 + Math.sin(y / 256 * Math.PI * 4 + k) * 6; y ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke(); } });
  foT.wrapT = THREE.RepeatWrapping;
  const foam = strip(-2, 16, new THREE.MeshBasicMaterial({ map: foT, transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide }), .32); mesh.userData.foam = foT;
  return mesh;
}

// ---------- مطرح: البيوت على الكورنيش ----------
function facadeTex() {
  return canvasTex(256, 256, (c) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 256); c.fillStyle = '#e8e2d8'; c.fillRect(0, 240, 256, 16);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { const x = 18 + i * 60, y = 30 + r * 76; c.fillStyle = (i + r) % 3 ? '#1f8fc8' : '#2fae6a'; c.beginPath(); c.moveTo(x, y + 44); c.lineTo(x, y + 12); c.arc(x + 14, y + 12, 14, Math.PI, 0); c.lineTo(x + 28, y + 44); c.fill(); c.fillStyle = '#2a3b55'; c.fillRect(x + 6, y + 16, 16, 24); c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 14, y + 16); c.lineTo(x + 14, y + 40); c.stroke(); }
  });
}
export function buildMuttrah(S, Q) {
  const r = rnd(12), geos = [], tint = [], ft = facadeTex(); ft.wrapS = ft.wrapT = THREE.RepeatWrapping;
  const mat = toon(0xffffff, { map: ft, vertexColors: true });
  for (let z = -560; z > -880; z -= 7 + r() * 5) {
    const sx = shoreX(z), rows = 4;
    for (let k = 0; k < rows; k++) {
      const x = sx - 22 - k * 16 - r() * 6, w = 8 + r() * 6, d = 9 + r() * 5, h = 8 + r() * 10 + (k === 0 ? 4 : 0), y0 = Math.max(0, heightAt(x, z)) - 1;
      if (y0 > 30) continue;
      const g = new THREE.BoxGeometry(d, h, w); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 16, uv.getY(i) * h / 15);
      g.translate(x, y0 + h / 2, z);
      const cc = new THREE.Color().setHSL([.13, .5, .95, .33, .58][(r() * 5) | 0], .85, r() < .45 ? 1 : .8), ca = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < ca.length; i += 3) { ca[i] = cc.r; ca[i + 1] = cc.g; ca[i + 2] = cc.b; }
      g.setAttribute('color', new THREE.BufferAttribute(ca, 3)); geos.push(g.toNonIndexed());
    }
  }
  const town = new THREE.Mesh(mergeGeometries(geos), mat); town.castShadow = town.receiveShadow = true; S.add(town);
  // مسجد بقبة زرقاء على الكورنيش
  const mx = shoreX(-700) - 30, mz = -700, wht = toon(0xffffff), blue = toon(0x1a7dff);
  const base = new THREE.Mesh(new THREE.BoxGeometry(24, 12, 30), wht); base.position.set(mx, 6, mz); S.add(base);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(8, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), blue); dome.scale.y = 1.25; dome.position.set(mx, 12, mz); S.add(dome);
  [-1, 1].forEach(s => { const mn = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 34, 12), wht); mn.position.set(mx + 10, 17, mz + s * 13); S.add(mn); const tp = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4.5, 12), blue); tp.position.set(mx + 10, 36, mz + s * 13); S.add(tp); });
  // سفن الداو في الميناء
  const dhows = [];
  for (let i = 0; i < 7; i++) { const z = -600 - i * 45 - r() * 20, d = dhow(r); d.position.set(shoreX(z) + 40 + r() * 70, 0, z - 120); d.rotation.y = r() * 6; d.scale.setScalar(2.2); S.add(d); dhows.push(d); }
  // نخيل أخضر على الشاطئ
  const tr = [], lv = [];
  for (let z = -540; z > -900; z -= 9 + r() * 6) {
    const x = shoreX(z) - 8 - r() * 6, y0 = Math.max(0, heightAt(x, z)) - .5, h = 9 + r() * 4;
    const t = new THREE.CylinderGeometry(.45, .7, h, 8); t.translate(x, y0 + h / 2, z); tr.push(t.toNonIndexed());
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + r(); const l = new THREE.ConeGeometry(1.2, 6.5, 4); l.rotateZ(-Math.PI / 2 + .5); l.translate(3, 0, 0); l.rotateY(a); l.translate(x, y0 + h, z); lv.push(l.toNonIndexed()); }
  }
  const pt = new THREE.Mesh(mergeGeometries(tr), toon(0xc07a3a)), pl = new THREE.Mesh(mergeGeometries(lv), toon(0x2fd05a)); pt.castShadow = pl.castShadow = true; S.add(pt, pl);
  return { dhows };
}
function dhow(r) {
  const g = new THREE.Group(), wood = toon(0xa0602e);
  const sh = new THREE.Shape(); sh.moveTo(-6, 1.6); sh.quadraticCurveTo(-4.5, -.4, 0, -.6); sh.quadraticCurveTo(4.2, -.4, 5.6, 2.2); sh.lineTo(5, 2.2); sh.lineTo(-5.4, 1.8); sh.closePath();
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 2.6, bevelEnabled: true, bevelThickness: .4, bevelSize: .3, bevelSegments: 2 }), wood); hull.position.z = -1.3; hull.castShadow = true; g.add(hull);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 9, 6), wood); mast.position.set(.5, 6, 0); mast.rotation.z = .12; g.add(mast);
  const sail = new THREE.Shape(); sail.moveTo(-5, 9); sail.lineTo(5.5, 11.5); sail.lineTo(1, 2.6); sail.closePath();
  const sm = new THREE.Mesh(new THREE.ShapeGeometry(sail), toon(0xfff6e0, { side: THREE.DoubleSide })); sm.position.z = .15; g.add(sm);
  return g;
}

// ---------- مبخرة ريام: مبخرة عُمانية بيضاء ضخمة على التل ----------
export function buildRiyam(S) {
  const g = new THREE.Group(), x = shoreX(-905) - 26, z = -905; g.position.set(x, heightAt(x, z) - 1, z); g.scale.setScalar(1.45); S.add(g);
  const wht = toon(0xffffff), gold = toon(0xffc83a);
  // القاعدة المربعة المتسعة
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 10, 4, 1), wht); base.rotation.y = Math.PI / 4; base.position.y = 5; g.add(base);
  // الجسم المنحني بفتحات زخرفية
  const prof = [[0, 0], [8, 0], [10.5, 3], [11.5, 8], [10, 13], [7, 16], [6, 17]].map(p => new THREE.Vector2(p[0], p[1]));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), wht); body.position.y = 10; g.add(body);
  const holeT = canvasTex(512, 128, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 512, 128); c.fillStyle = '#3a3a44'; for (let i = 0; i < 12; i++) { const cx = 21 + i * 42.6; c.beginPath(); c.moveTo(cx, 30); c.lineTo(cx + 9, 64); c.lineTo(cx, 98); c.lineTo(cx - 9, 64); c.closePath(); c.fill(); } });
  const band = new THREE.Mesh(new THREE.CylinderGeometry(11.55, 11.55, 6, 48, 1, true), toon(0xffffff, { map: holeT })); band.position.y = 18; g.add(band);
  // الغطاء المخروطي المقبب ونهايته الذهبية
  const lid = new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [7.5, 0], [7.8, 1], [6, 4], [3.5, 9], [1.2, 14], [0, 15]].map(p => new THREE.Vector2(p[0], p[1])), 48), wht); lid.position.y = 27; g.add(lid);
  const fin = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 12), gold); fin.position.y = 43; g.add(fin);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7.6, .5, 8, 48), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 27.3; g.add(ring);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; }); outline(g, .25, 0x5a4a6a);
  return g;
}

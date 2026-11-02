// سيارة سباق مفصّلة (فورمولا) تُبنى برمجيًا — المقدمة باتجاه +z
import * as THREE from 'three';

export function canvasTex(w, h, f) { const c = document.createElement('canvas'); c.width = w; c.height = h; f(c.getContext('2d'), c); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; }

// جسم مُنسَّق من مقاطع «سوبر-إهليلجية» على طول z مع ألوان للرؤوس
function lerpCat(a, b, c, d, t) { const t2 = t * t, t3 = t2 * t; return 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3); }
export function loft(st, { seg = 40, sub = 6, color, cx = 0, capStart = true, capEnd = true } = {}) {
  const S = []; // كثافة المقاطع بالاستيفاء
  for (let i = 0; i < st.length - 1; i++) for (let k = 0; k < sub; k++) {
    const t = k / sub, g = (j) => st[Math.max(0, Math.min(st.length - 1, j))], o = {};
    for (const key of ['z', 'w', 'h', 'y', 'n', 'x']) o[key] = lerpCat(g(i - 1)[key] ?? g(i)[key] ?? 0, g(i)[key] ?? 0, g(i + 1)[key] ?? 0, g(i + 2)[key] ?? g(i + 1)[key] ?? 0, t);
    o.i = i + t; S.push(o);
  }
  S.push({ ...st[st.length - 1], i: st.length - 1 });
  const pos = [], col = [], idx = [], c = new THREE.Color();
  S.forEach((s, si) => {
    for (let a = 0; a <= seg; a++) {
      const th = a / seg * Math.PI * 2, ca = Math.cos(th), sa = Math.sin(th), n = s.n || 3;
      const x = (s.x || 0) + cx + s.w / 2 * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n), y = s.y + s.h / 2 * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n);
      pos.push(x, y, s.z); color(c, { s, th, x: x - cx - (s.x || 0), y, z: s.z, u: (y - s.y) / (s.h / 2), v: (x - cx - (s.x || 0)) / (s.w / 2), si: s.i }); col.push(c.r, c.g, c.b);
    }
  });
  const R = seg + 1;
  for (let i = 0; i < S.length - 1; i++) for (let a = 0; a < seg; a++) { const p = i * R + a; idx.push(p, p + R, p + 1, p + 1, p + R, p + R + 1); }
  function cap(si, flip) { const s = S[si], ci = pos.length / 3; pos.push(cx + (s.x || 0), s.y, s.z); color(c, { s, th: 0, x: 0, y: s.y, z: s.z, u: 0, v: 0, si: s.i, cap: true }); col.push(c.r, c.g, c.b); for (let a = 0; a < seg; a++) { const p = si * R + a; flip ? idx.push(ci, p + 1, p) : idx.push(ci, p, p + 1); } }
  if (capStart) cap(0, false); if (capEnd) cap(S.length - 1, true);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function airfoil(chord, thick, camber = .06) {
  const s = new THREE.Shape(); const N = 18, up = [], lo = [];
  for (let i = 0; i <= N; i++) { const x = i / N, yt = 5 * thick * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x * x + 0.2843 * x ** 3 - 0.1015 * x ** 4), yc = camber * 4 * x * (1 - x); up.push([x * chord, (yc + yt) * chord]); lo.push([x * chord, (yc - yt) * chord]); }
  s.moveTo(up[0][0], up[0][1]); up.slice(1).forEach(p => s.lineTo(p[0], p[1])); lo.reverse().forEach(p => s.lineTo(p[0], p[1]));
  return s;
}
// جناح: مقطع هوائي يمتد على x — حافة الهجوم باتجاه +z
function wing(chord, thick, span, mat, aoa = 0.12, camber = .07) {
  const g = new THREE.ExtrudeGeometry(airfoil(chord, thick, camber), { depth: span, bevelEnabled: false, curveSegments: 4 });
  g.translate(0, 0, -span / 2); const m = new THREE.Mesh(g, mat);
  // الشكل في المستوى (x=الوتر,y)، والبثق على z => ندوّر ليصبح الوتر على -z والامتداد على x
  m.rotation.y = Math.PI / 2; const holder = new THREE.Group(); const inner = new THREE.Group(); inner.add(m); inner.rotation.x = aoa; holder.add(inner); m.castShadow = true; return holder;
}
function plateShape(pts) { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); pts.slice(1).forEach(p => s.lineTo(p[0], p[1])); return s; }

export async function buildCar({ main, accent, dark = 0x15151c, num, driver, sponsor = 'التحضير الذكي', env, view = 'front' }) {
  const car = new THREE.Group();
  const M = (o) => new THREE.MeshPhysicalMaterial(Object.assign({ envMap: env, envMapIntensity: 1 }, o));
  const paint = M({ vertexColors: true, metalness: .35, roughness: .32, clearcoat: 1, clearcoatRoughness: .06 });
  const carbon = M({ color: 0x18181d, metalness: .4, roughness: .45, clearcoat: .6, clearcoatRoughness: .2 });
  const carbonT = canvasTex(64, 64, (g) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { g.fillStyle = (x + y) % 2 ? '#1d1d24' : '#121218'; g.fillRect(x * 8, y * 8, 8, 8); } }); carbonT.wrapS = carbonT.wrapT = THREE.RepeatWrapping; carbonT.repeat.set(10, 10); carbon.map = carbonT;
  const accentM = M({ color: accent, metalness: .4, roughness: .3, clearcoat: 1 });
  const mainM = M({ color: main, metalness: .35, roughness: .3, clearcoat: 1 });
  const chrome = M({ color: 0xe8e8ef, metalness: 1, roughness: .12 });
  const Cm = new THREE.Color(main), Ca = new THREE.Color(accent), Cd = new THREE.Color(dark), Cw = new THREE.Color(0xffffff);
  const add = (geo, mat, x = 0, y = 0, z = 0, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cast; m.receiveShadow = true; car.add(m); return m; };

  // الهيكل الرئيسي: أنف ← قمرة ← غطاء المحرك
  const chassis = loft([
    { z: 2.95, w: .16, h: .12, y: .30, n: 2.4 }, { z: 2.6, w: .30, h: .20, y: .34, n: 2.6 }, { z: 2.0, w: .42, h: .30, y: .42, n: 3 },
    { z: 1.35, w: .56, h: .40, y: .50, n: 3.2 }, { z: .7, w: .72, h: .52, y: .56, n: 3.4 }, { z: 0, w: .80, h: .56, y: .56, n: 3.6 },
    { z: -.7, w: .78, h: .58, y: .58, n: 3.6 }, { z: -1.3, w: .62, h: .62, y: .62, n: 3.2 }, { z: -1.9, w: .40, h: .46, y: .56, n: 3 }, { z: -2.35, w: .2, h: .24, y: .48, n: 2.6 }
  ], { color: (c, p) => {
    const top = p.u > .25, stripe = Math.abs(p.v) < .16 && p.u > .55;
    if (p.u < -.35) c.copy(Cd); else if (p.z > 2.55) c.copy(Ca); else if (stripe) c.copy(Cw); else if (p.z > .65 && p.z < 1.05 && top) c.copy(Ca); else c.copy(Cm);
  } });
  add(chassis, paint);

  // صندوق سحب الهواء فوق رأس السائق + الزعنفة
  add(loft([{ z: -.45, w: .30, h: .26, y: 1.05, n: 3 }, { z: -.8, w: .32, h: .30, y: 1.02, n: 3 }, { z: -1.3, w: .22, h: .24, y: .92, n: 3 }, { z: -1.9, w: .10, h: .14, y: .78, n: 3 }],
    { color: (c, p) => p.cap && p.z > -.5 ? c.setHex(0x050505) : (Math.abs(p.v) < .3 && p.u > .4 ? c.copy(Cw) : c.copy(Cm)) }), paint);
  const finG = new THREE.ExtrudeGeometry(plateShape([[0, 0], [1.3, 0], [1.5, .34], [.2, .2]]), { depth: .02, bevelEnabled: false }); finG.translate(0, 0, -.01);
  const fin = add(finG, accentM, 0, .82, -.95); fin.rotation.y = Math.PI / 2;
  // فتحة القمرة
  const cockpit = add(new THREE.CylinderGeometry(.27, .27, .12, 32), carbon, 0, .85, -.05); cockpit.scale.z = 1.55;
  const rimC = add(new THREE.TorusGeometry(.28, .025, 8, 40), accentM, 0, .9, -.05); rimC.rotation.x = Math.PI / 2; rimC.scale.y = 1.55;
  const sw = add(new THREE.BoxGeometry(.26, .12, .04), carbon, 0, .9, .25); sw.rotation.x = -.5;

  // الحاضنتان الجانبيتان
  [-1, 1].forEach(sd => {
    add(loft([{ z: .55, w: .34, h: .30, y: .46, n: 3 }, { z: .3, w: .46, h: .42, y: .46, n: 3.4 }, { z: -.4, w: .5, h: .42, y: .44, n: 3.6 }, { z: -1.2, w: .36, h: .30, y: .39, n: 3.2 }, { z: -1.9, w: .14, h: .16, y: .32, n: 3 }],
      { cx: sd * .64, color: (c, p) => p.cap && p.z > .5 ? c.setHex(0x050505) : (p.u < -.4 ? c.copy(Cd) : (p.u > .55 ? c.copy(Ca) : c.copy(Cm))) }), paint);
    // ملصق الراعي ورقم السيارة على الجانب
    const dec = canvasTex(512, 160, (g) => { g.font = '78px Taj'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillStyle = '#fff'; g.fillText(sponsor, 256, 86); });
    const d = add(new THREE.PlaneGeometry(.78, .24), new THREE.MeshStandardMaterial({ map: dec, transparent: true, polygonOffset: true, polygonOffsetFactor: -4, roughness: .4 }), sd * (.64 + .255), .47, -.45, false); d.rotation.y = sd * Math.PI / 2;
    const nt = canvasTex(256, 256, (g) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = '170px Taj'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 128, 140); });
    const nd = add(new THREE.CircleGeometry(.16, 32), new THREE.MeshStandardMaterial({ map: nt, polygonOffset: true, polygonOffsetFactor: -4 }), sd * .405, .62, .55, false); nd.rotation.y = sd * Math.PI / 2;
    // مرآة جانبية
    add(new THREE.CylinderGeometry(.015, .015, .26), carbon, sd * .43, .9, .38).rotation.z = sd * 1.1;
    add(new RoundBox(.16, .08, .06), mainM, sd * .56, .98, .38);
  });
  // الأرضية والناشر الخلفي
  const floorG = new THREE.ExtrudeGeometry(plateShape([[-.8, 1.0], [.8, 1.0], [.85, -1.7], [.6, -2.3], [-.6, -2.3], [-.85, -1.7]]), { depth: .03, bevelEnabled: false }); floorG.rotateX(Math.PI / 2);
  add(floorG, carbon, 0, .16, 0);
  const diff = add(new THREE.BoxGeometry(1.2, .03, .55), carbon, 0, .26, -2.45); diff.rotation.x = -.35;
  for (let i = -2; i <= 2; i++) { const f = add(new THREE.BoxGeometry(.02, .2, .5), carbon, i * .26, .25, -2.45); f.rotation.x = -.35; }
  const rl = add(new THREE.BoxGeometry(.16, .08, .04), new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff1020, emissiveIntensity: 4 }), 0, .44, -2.4, false);

  // الجناح الأمامي (3 عناصر) + الصفائح الطرفية
  [[.34, .30, 0], [.26, .37, -.22], [.2, .45, -.38]].forEach(([ch, y, dz], i) => { const w = wing(ch, .11, 1.9, i ? mainM : carbon, .1 + i * .18, .08); w.position.set(0, y - .1, 3.25 + dz); car.add(w); });
  [-1, 1].forEach(sd => { const ep = new THREE.ExtrudeGeometry(plateShape([[0, 0], [.6, 0], [.62, .2], [.25, .26], [0, .16]]), { depth: .02, bevelEnabled: false }); const m = add(ep, mainM, sd * .955, .1, 2.82); m.rotation.y = -Math.PI / 2; });
  // الجناح الخلفي
  const rw = new THREE.Group(); car.add(rw); rw.position.set(0, 0, -2.35);
  const mw = wing(.42, .12, 1.15, mainM, .18, .09); mw.position.set(0, .98, .15); rw.add(mw);
  const fl = wing(.26, .1, 1.15, accentM, .55, .08); fl.position.set(0, 1.15, -.18); rw.add(fl);
  const bw = wing(.22, .1, .9, carbon, .2, .06); bw.position.set(0, .52, .05); rw.add(bw);
  const ept = canvasTex(256, 256, (g) => { g.fillStyle = '#' + Cm.getHexString(); g.fillRect(0, 0, 256, 256); g.fillStyle = '#' + Ca.getHexString(); g.fillRect(0, 170, 256, 86); g.fillStyle = '#fff'; g.font = '150px Taj'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 128, 92); });
  [-1, 1].forEach(sd => { const p = new THREE.Mesh(new THREE.BoxGeometry(.03, .72, .7), [carbon, carbon, carbon, carbon, new THREE.MeshPhysicalMaterial({ map: ept, clearcoat: 1, roughness: .3 }), new THREE.MeshPhysicalMaterial({ map: ept, clearcoat: 1, roughness: .3 })]); p.position.set(sd * .6, .95, -.05); p.rotation.y = Math.PI / 2 * 0; p.castShadow = true; rw.add(p);
    // نعطي الصفيحة نقش الرقم على وجهيها الجانبيين
    p.material = [new THREE.MeshPhysicalMaterial({ map: ept, clearcoat: 1, roughness: .3 }), new THREE.MeshPhysicalMaterial({ map: ept, clearcoat: 1, roughness: .3 }), carbon, carbon, carbon, carbon]; });
  const py = new THREE.Mesh(new THREE.BoxGeometry(.06, .5, .2), carbon); py.position.set(0, .72, .05); rw.add(py);

  // الهالة (Halo)
  const halo = new THREE.CatmullRomCurve3([[-.34, .82, -.5], [-.37, .99, -.22], [-.3, 1.05, .12], [0, 1.07, .3], [.3, 1.05, .12], [.37, .99, -.22], [.34, .82, -.5]].map(p => new THREE.Vector3(...p)));
  add(new THREE.TubeGeometry(halo, 64, .032, 10), carbon);
  add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(0, .78, .62), new THREE.Vector3(0, .98, .45), new THREE.Vector3(0, 1.07, .3)]), 20, .03, 10), carbon);

  // العجلات والتعليق
  const wheels = []; car.userData.wheels = wheels;
  function wheel(x, z, r, w, front) {
    const g = new THREE.Group(); g.position.set(x, r, z); car.add(g); wheels.push(g); const sd = Math.sign(x);
    const prof = [[.22, -w / 2], [.30, -w / 2], [r - .03, -w / 2 + .01], [r, -w / 2 + .05], [r, w / 2 - .05], [r - .03, w / 2 - .01], [.30, w / 2], [.22, w / 2]].map(p => new THREE.Vector2(p[0], p[1]));
    const tg = new THREE.LatheGeometry(prof, 48); tg.rotateZ(Math.PI / 2);
    const tread = canvasTex(256, 16, (c) => { c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, 256, 16); });
    const tire = new THREE.Mesh(tg, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: .82 })); tire.castShadow = true; g.add(tire);
    const band = new THREE.Mesh(new THREE.TorusGeometry(r - .055, .012, 6, 60), new THREE.MeshStandardMaterial({ color: front ? 0xffd23f : 0xe53950, roughness: .5 })); band.rotation.y = Math.PI / 2; band.position.x = sd * (w / 2 + .002); g.add(band);
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(.225, .225, w - .04, 40, 1, true), M({ color: 0x2a2a30, metalness: .9, roughness: .3, side: THREE.DoubleSide })); rim.rotation.z = Math.PI / 2; g.add(rim);
    const face = new THREE.Mesh(new THREE.CircleGeometry(.21, 40), M({ color: 0x111116, metalness: .5, roughness: .5 })); face.rotation.y = sd * Math.PI / 2; face.position.x = sd * (w / 2 - .06); g.add(face);
    for (let k = 0; k < 10; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.02, .19, .035), chrome); const a = k / 10 * Math.PI * 2; sp.position.set(sd * (w / 2 - .045), Math.cos(a) * .11, Math.sin(a) * .11); sp.rotation.x = a; g.add(sp); }
    const nut = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .06, 6), M({ color: front ? 0xffd23f : 0xe53950, metalness: .7, roughness: .3 })); nut.rotation.z = Math.PI / 2; nut.position.x = sd * (w / 2 - .02); g.add(nut);
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .03, 32), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: .8, roughness: .4 })); disc.rotation.z = Math.PI / 2; disc.position.x = -sd * .05; g.add(disc);
    const cal = new THREE.Mesh(new THREE.BoxGeometry(.06, .12, .16), new THREE.MeshStandardMaterial({ color: 0xff3b30, roughness: .4 })); cal.position.set(-sd * .05, .12, -.08); g.add(cal);
    // ذراعا التعليق
    const hub = new THREE.Vector3(x - sd * w / 2, r, z);
    [[.47, .1], [.33, -.12]].forEach(([y, dz]) => [[.12, .2], [.12, -.2]].forEach(([xi, zi]) => { const a = new THREE.Vector3(sd * xi * 2.2, y, z + zi + dz * 0), b = hub.clone().setY(y - .02 + (y > .4 ? .02 : 0)); const d = b.clone().sub(a), L = d.length(); const arm = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, L, 6), carbon); arm.position.copy(a).add(b).multiplyScalar(.5); arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); arm.castShadow = true; car.add(arm); }));
    // غطاء الفرامل (المجرى)
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, .14, 16), carbon); duct.rotation.z = Math.PI / 2; duct.position.set(x - sd * (w / 2 + .07), r, z); car.add(duct);
  }
  wheel(.84, 1.85, .34, .3, true); wheel(-.84, 1.85, .34, .3, true); wheel(.82, -1.6, .36, .4, false); wheel(-.82, -1.6, .36, .4, false);

  // السائق
  const img = await new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = driver; });
  if (view === 'front') {
    const h = Math.round(img.height * .36), tex = canvasTex(img.width, h, (c) => c.drawImage(img, 0, 0, img.width, h, 0, 0, img.width, h));
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex })); const hh = .95; spr.scale.set(hh * img.width / h, hh, 1); spr.center.set(.5, .22); spr.position.set(0, .9, -.08); car.add(spr);
  } else {
    // من الخلف: خوذة بألوان الفريق + شارة الشخصية فوق السيارة
    const helT = canvasTex(512, 256, (g) => { g.fillStyle = '#' + Cm.getHexString(); g.fillRect(0, 0, 512, 256); g.fillStyle = '#fff'; g.fillRect(0, 96, 512, 22); g.fillStyle = '#' + Ca.getHexString(); g.fillRect(0, 118, 512, 14); g.fillStyle = '#fff'; g.font = '70px Taj'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(num, 384, 190); g.fillText(num, 128, 190); });
    const helmet = add(new THREE.SphereGeometry(.2, 32, 24), M({ map: helT, metalness: .3, roughness: .25, clearcoat: 1 }), 0, 1.0, -.12); helmet.scale.set(1, 1.05, 1.15); helmet.rotation.y = Math.PI / 2;
    const visor = add(new THREE.SphereGeometry(.205, 32, 12, -Math.PI * .32, Math.PI * .64, Math.PI * .36, Math.PI * .2), M({ color: 0x0a0a12, metalness: .9, roughness: .05 }), 0, 1.0, -.12); visor.scale.set(1, 1.05, 1.15);
    add(new THREE.BoxGeometry(.5, .14, .3), carbon, 0, .86, -.15);
    const r0 = Math.min(img.width, img.height * .3);
    const tagT = canvasTex(256, 300, (g) => {
      g.fillStyle = '#' + Cm.getHexString(); g.beginPath(); g.moveTo(128, 296); g.lineTo(104, 244); g.lineTo(152, 244); g.fill();
      g.beginPath(); g.arc(128, 128, 122, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 128, 108, 0, 7); g.fill();
      g.save(); g.beginPath(); g.arc(128, 128, 104, 0, 7); g.clip(); const sw = img.width * .78, sx = (img.width - sw) / 2; g.drawImage(img, sx, img.height * .01, sw, sw, 24, 30, 208, 208); g.restore();
    });
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagT, depthTest: false })); tag.scale.set(.85, 1.0, 1); tag.center.set(.5, 0); tag.position.set(0, 1.55, -.2); tag.renderOrder = 10; car.add(tag);
  }
  return car;
}
// صندوق مستدير الحواف بسيط
class RoundBox extends THREE.BufferGeometry { constructor(w, h, d) { super(); const g = new THREE.SphereGeometry(.5, 16, 10); g.scale(w, h, d); this.copy(g); } }

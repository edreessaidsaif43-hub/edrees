// عالم «سباق المعرفة 3D»: حلبة مغلقة في بيئة عُمانية
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from './car.js';

export function buildWorld(R, S, Q) {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const FONT = 'Taj, Tahoma, sans-serif';

  // السماء والإضاءة والانعكاسات
  const skyT = canvasTex(1024, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#1f5fb8'); gr.addColorStop(.32, '#5fa6e6'); gr.addColorStop(.47, '#bfe0f5'); gr.addColorStop(.5, '#ffe7c2'); gr.addColorStop(.52, '#d9b483'); gr.addColorStop(1, '#a37a4c');
    g.fillStyle = gr; g.fillRect(0, 0, 1024, 512);
    const sg = g.createRadialGradient(300, 150, 0, 300, 150, 120); sg.addColorStop(0, 'rgba(255,255,240,1)'); sg.addColorStop(.12, 'rgba(255,248,220,.9)'); sg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = sg; g.fillRect(0, 0, 1024, 512);
  });
  skyT.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(R); const env = pm.fromEquirectangular(skyT).texture; pm.dispose();
  S.environment = env; S.environmentIntensity = .55;
  S.background = canvasTex(8, 512, (g) => { const gr = g.createLinearGradient(0, 0, 0, 512); gr.addColorStop(0, '#2c6cc4'); gr.addColorStop(.42, '#7fbbe9'); gr.addColorStop(.6, '#e9eef0'); gr.addColorStop(.66, '#ffe1b3'); gr.addColorStop(1, '#ffe1b3'); g.fillStyle = gr; g.fillRect(0, 0, 8, 512); });
  S.fog = new THREE.Fog(0xf0dcb8, 260, 1500);
  S.add(new THREE.HemisphereLight(0xd6ecff, 0xb98d5a, Q.shadows ? .9 : 1.4));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  if (Q.shadows) { sun.castShadow = true; sun.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 220 }); sun.shadow.bias = -0.0003; sun.shadow.normalBias = .02; }
  S.add(sun, sun.target);

  // السحب
  const cloudT = canvasTex(256, 128, (g) => { for (let i = 0; i < 26; i++) { const x = 30 + rnd() * 196, y = 50 + rnd() * 40, r = 18 + rnd() * 30, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 128); } });
  for (let i = 0; i < 22; i++) { const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudT, transparent: true, opacity: .85, fog: false, depthWrite: false })); const s = 120 + rnd() * 160, a = rnd() * Math.PI * 2; c.scale.set(s, s / 2, 1); c.position.set(150 + Math.cos(a) * 1100, 160 + rnd() * 160, Math.sin(a) * 1100); S.add(c); }

  // الأرض الرملية
  const sandT = canvasTex(512, 512, (g) => { g.fillStyle = '#d8b07a'; g.fillRect(0, 0, 512, 512); for (let i = 0; i < 14000; i++) { const v = rnd(); g.fillStyle = v < .4 ? 'rgba(150,100,55,.12)' : v < .8 ? 'rgba(255,238,200,.14)' : 'rgba(120,80,40,.2)'; g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 2, 1 + rnd() * 2); } for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(170,120,70,.12)'; g.lineWidth = 2; g.beginPath(); const y = rnd() * 512; g.moveTo(0, y); g.bezierCurveTo(170, y + 20, 340, y - 20, 512, y); g.stroke(); } });
  sandT.wrapS = sandT.wrapT = THREE.RepeatWrapping; sandT.repeat.set(120, 120);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: sandT, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.set(150, 0, 0); ground.receiveShadow = true; S.add(ground);

  // الحلبة (مسار مغلق)
  const P = [[0, 260], [0, 80], [0, -100], [10, -220], [70, -300], [170, -320], [260, -270], [290, -170], [250, -80], [270, 20], [330, 100], [320, 220], [240, 300], [120, 320], [30, 310]];
  const curve = new THREE.CatmullRomCurve3(P.map(p => new THREE.Vector3(p[0], 0, p[1])), true, 'centripetal');
  const LEN = curve.getLength();
  const frame = (t) => { t = ((t % 1) + 1) % 1; const p = curve.getPointAt(t), tg = curve.getTangentAt(t), n = new THREE.Vector3(-tg.z, 0, tg.x).normalize(); return { p, tg, n, ang: Math.atan2(tg.x, tg.z) }; };
  const along = (t, off, y = 0) => { const f = frame(t); return f.p.clone().addScaledVector(f.n, off).setY(y); };
  const SEG = 1400;
  function ribbon(off, w, y, mat, vrep, h = 0) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= SEG; i++) { const t = i / SEG, f = frame(t), v = t * LEN / vrep;
      if (h) { const a = f.p.clone().addScaledVector(f.n, off); pos.push(a.x, y, a.z, a.x, y + h, a.z); uv.push(v, 0, v, 1); }
      else { const a = f.p.clone().addScaledVector(f.n, off - w / 2), b = f.p.clone().addScaledVector(f.n, off + w / 2); pos.push(a.x, y, a.z, b.x, y, b.z); uv.push(0, v, 1, v); }
      if (i < SEG) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    mat.side = THREE.DoubleSide; const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = !!h && Q.shadows; S.add(m); return m;
  }
  const asphT = canvasTex(512, 1024, (g) => {
    g.fillStyle = '#3c3f46'; g.fillRect(0, 0, 512, 1024);
    for (let i = 0; i < 60000; i++) { const v = rnd(); g.fillStyle = v < .5 ? 'rgba(0,0,0,.22)' : 'rgba(255,255,255,.07)'; g.fillRect(rnd() * 512, rnd() * 1024, 1.5, 1.5); }
    for (const x of [150, 200, 312, 362]) { const gr = g.createLinearGradient(x - 22, 0, x + 22, 0); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(.5, 'rgba(10,10,12,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x - 22, 0, 44, 1024); }
    g.fillStyle = '#f2f2f2'; g.fillRect(14, 0, 12, 1024); g.fillRect(486, 0, 12, 1024);
  });
  asphT.wrapS = asphT.wrapT = THREE.RepeatWrapping;
  ribbon(0, 16, .06, new THREE.MeshStandardMaterial({ map: asphT, roughness: .78, metalness: .05, polygonOffset: true, polygonOffsetFactor: -2 }), 32);
  const kerbT = canvasTex(64, 128, (g) => { g.fillStyle = '#e0283c'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#f7f7f7'; g.fillRect(0, 64, 64, 64); g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, 0, 6, 128); }); kerbT.wrapS = kerbT.wrapT = THREE.RepeatWrapping;
  [-1, 1].forEach(s => ribbon(s * 8.9, 1.8, .1, new THREE.MeshStandardMaterial({ map: kerbT, roughness: .55, polygonOffset: true, polygonOffsetFactor: -3 }), 4));
  const gravT = canvasTex(256, 256, (g) => { g.fillStyle = '#c4b59a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 9000; i++) { const v = rnd(); g.fillStyle = v < .5 ? 'rgba(90,80,70,.3)' : 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(rnd() * 256, rnd() * 256, .6 + rnd() * 1.4, 0, 7); g.fill(); } }); gravT.wrapS = gravT.wrapT = THREE.RepeatWrapping;
  [-1, 1].forEach(s => ribbon(s * 13.5, 7.4, .05, new THREE.MeshStandardMaterial({ map: gravT, roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }), 7));
  const armT = canvasTex(64, 64, (g) => { const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, '#f4f6f8'); gr.addColorStop(.25, '#9aa3ad'); gr.addColorStop(.5, '#eef1f4'); gr.addColorStop(.75, '#8d96a0'); gr.addColorStop(1, '#e2e6ea'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const fenceT = canvasTex(64, 64, (g) => { g.strokeStyle = 'rgba(60,70,80,.85)'; g.lineWidth = 2; g.beginPath(); for (let i = -64; i < 128; i += 10) { g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); } g.stroke(); }); fenceT.wrapS = fenceT.wrapT = THREE.RepeatWrapping; fenceT.repeat.set(LEN / 3, 1);
  const armM = new THREE.MeshStandardMaterial({ map: armT, metalness: .85, roughness: .3 }), fenceM = new THREE.MeshStandardMaterial({ map: fenceT, transparent: true, alphaTest: .2, metalness: .6, roughness: .5 });
  [-1, 1].forEach(s => { ribbon(s * 17.4, 0, .45, armM, 4, .38); ribbon(s * 17.4, 0, 1.0, armM, 4, .32); ribbon(s * 17.9, 0, 1.4, fenceM, 1, 3.4); });
  (function () {
    const N = Math.round(LEN / 4), post = new THREE.InstancedMesh(new THREE.BoxGeometry(.12, 1.3, .12), new THREE.MeshStandardMaterial({ color: 0x8b939c, metalness: .7, roughness: .4 }), N * 2);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .06, 4.8, 8), new THREE.MeshStandardMaterial({ color: 0x5c6670, metalness: .7, roughness: .4 }), N);
    const m = new THREE.Matrix4(); let k = 0, q = 0;
    for (let i = 0; i < N; i++) { const t = i / N; [-1, 1].forEach(s => { const p = along(t, s * 17.55, .65); m.makeTranslation(p.x, p.y, p.z); post.setMatrixAt(k++, m); if (i % 2 === 0 && q < N) { const p2 = along(t, s * 17.95, 2.4); m.makeTranslation(p2.x, p2.y, p2.z); pole.setMatrixAt(q++, m); } }); }
    pole.count = q; S.add(post, pole);
  })();
  // لوحات إعلانية
  const ADS = [['التحضير الذكي للمعلم العماني', '#e53950', '#fff'], ['سباق المعرفة', '#1a2a6c', '#ffd23f'], ['تعلّم • نافس • انطلق', '#16a3a0', '#fff'], ['ألعاب تعليمية لطلاب عُمان', '#ff7a1a', '#fff']];
  const adMat = ADS.map(([t, bg, fg]) => new THREE.MeshStandardMaterial({ roughness: .5, side: THREE.DoubleSide, map: canvasTex(1024, 128, (g) => { g.fillStyle = bg; g.fillRect(0, 0, 1024, 128); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, 0, 1024, 10); g.fillStyle = fg; g.font = '72px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText(t, 512, 70); }) }));
  const adG = new THREE.PlaneGeometry(9, 1.1);
  const NA = Math.round(LEN / 26);
  for (let i = 0; i < NA; i++) { const t = i / NA; [-1, 1].forEach(s => { if ((i + (s > 0 ? 0 : 1)) % 2) return; const f = frame(t), p = along(t, s * 17.25, .78); const b = new THREE.Mesh(adG, adMat[(i + (s > 0 ? 1 : 0)) % 4]); b.position.copy(p); b.rotation.y = f.ang + (s > 0 ? Math.PI / 2 : -Math.PI / 2); S.add(b); }); }
  // جدار إطارات عند المنعطفات الحادّة
  (function () {
    const tg = new THREE.TorusGeometry(.42, .2, 8, 16); tg.rotateX(Math.PI / 2);
    const N = 900, im = new THREE.InstancedMesh(tg, new THREE.MeshStandardMaterial({ roughness: .8 }), N), m = new THREE.Matrix4(), c = new THREE.Color(); let k = 0;
    [.2, .43, .75].forEach(t0 => { for (let i = 0; i < 60 && k < N - 6; i++) { const t = t0 + i * .0006; for (let st = 0; st < 3; st++) for (let r = 0; r < 2; r++) { const p = along(t, -(19 + r * .9), .2 + st * .4); m.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(k, m); im.setColorAt(k, c.setHex(st === 1 ? ((i >> 1) % 2 ? 0xe53950 : 0xf7f7f7) : 0x1b1b1b)); k++; } } });
    im.count = k; im.castShadow = Q.shadows; S.add(im);
  })();
  // أقماع
  (function () { const N = 60, im = new THREE.InstancedMesh(new THREE.ConeGeometry(.28, .8, 14), new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: .5 }), N), m = new THREE.Matrix4(); for (let i = 0; i < N; i++) { const p = along(i / N + .004, (i % 2 ? 1 : -1) * 11.2, .4); m.makeTranslation(p.x, p.y, p.z); im.setMatrixAt(i, m); } S.add(im); })();

  // خط البداية/النهاية: جسر بشاشة وأضواء انطلاق
  const tFinish = (function () { let best = 0, bd = 1e9; for (let i = 0; i < 2000; i++) { const p = curve.getPointAt(i / 2000), d = Math.abs(p.x) + Math.abs(p.z - 40); if (d < bd) { bd = d; best = i / 2000; } } return best; })();
  const startLights = [];
  (function () {
    const f = frame(tFinish), g = new THREE.Group(); g.position.copy(f.p); g.rotation.y = f.ang; S.add(g);
    const steel = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, metalness: .8, roughness: .35 });
    [-12, 12].forEach(x => { const c = new THREE.Mesh(new THREE.BoxGeometry(1.2, 13, 1.2), steel); c.position.set(x, 6.5, 0); c.castShadow = Q.shadows; g.add(c); for (let y = 1; y < 13; y += 1.5) { const d = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.9, .08), steel); d.position.set(x + .62, y, 0); d.rotation.z = .6; g.add(d); } });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(25.4, 3.6, 1.6), steel); beam.position.y = 12.4; g.add(beam);
    const scr = canvasTex(1536, 220, (c) => { c.fillStyle = '#0b0e1a'; c.fillRect(0, 0, 1536, 220); for (let i = 0; i < 48; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * 32, j * 16, 32, 16); c.fillRect(i * 32, 188 + j * 16, 32, 16); } c.fillStyle = '#ffd23f'; c.font = '110px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.fillText('سباق المعرفة', 768, 112); });
    [[-.81, 0], [.81, Math.PI]].forEach(([z, ry]) => { const sm = new THREE.Mesh(new THREE.PlaneGeometry(24, 3.2), new THREE.MeshStandardMaterial({ map: scr, emissive: 0xffffff, emissiveMap: scr, emissiveIntensity: .9 })); sm.position.set(0, 12.4, z); sm.rotation.y = ry; g.add(sm); });
    for (let i = 0; i < 5; i++) { const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, .5), steel); hood.position.set(-2.8 + i * 1.4, 9.8, 0); g.add(hood); const l = new THREE.Mesh(new THREE.CircleGeometry(.42, 24), new THREE.MeshStandardMaterial({ color: 0x220808, emissive: 0xff2020, emissiveIntensity: 0 })); l.position.set(-2.8 + i * 1.4, 9.8, -.26); l.rotation.y = Math.PI; g.add(l); startLights.push(l); }
    const chk = canvasTex(256, 32, (c) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? '#fff' : '#111'; c.fillRect(i * 16, j * 16, 16, 16); } });
    const line = new THREE.Mesh(new THREE.PlaneGeometry(16, 2), new THREE.MeshStandardMaterial({ map: chk, polygonOffset: true, polygonOffsetFactor: -6 })); line.rotation.x = -Math.PI / 2; line.position.y = .08; g.add(line);
  })();

  // المدرجات (خارج الخط المستقيم) مع الجمهور والسقف والشاشة
  let bigScreen = null;
  (function () {
    const g = new THREE.Group(); g.position.set(-31, 0, 70); g.rotation.y = -Math.PI / 2; S.add(g);
    const conc = new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: .9 }), L = 120, rows = 12;
    for (let r = 0; r < rows; r++) { const st = new THREE.Mesh(new THREE.BoxGeometry(L, .9, 1.4), conc); st.position.set(0, .45 + r * .9, r * 1.3); st.receiveShadow = true; g.add(st); }
    const back = new THREE.Mesh(new THREE.BoxGeometry(L, rows * .9 + 4, 1), conc); back.position.set(0, (rows * .9 + 4) / 2, rows * 1.3 + .6); g.add(back);
    const N = Q.crowd, body = new THREE.InstancedMesh(new THREE.BoxGeometry(.42, .55, .3), new THREE.MeshStandardMaterial({ roughness: .8 }), N), head = new THREE.InstancedMesh(new THREE.SphereGeometry(.15, 8, 6), new THREE.MeshStandardMaterial({ roughness: .8 }), N);
    const m = new THREE.Matrix4(), c = new THREE.Color(); let k = 0; const shirt = [0xffffff, 0xffffff, 0xf5f0e6, 0xe53950, 0x16a3a0, 0x1a2a6c, 0xffd23f, 0x2b2b2b, 0xc5d8f0];
    const step = Math.max(.62, L * rows / N * .8);
    for (let r = 0; r < rows; r++) for (let x = -L / 2 + 1; x < L / 2 - 1 && k < N; x += step) { if (rnd() < .12) continue; const y = .9 + r * .9 + .28, z = r * 1.3 + .1 + rnd() * .1; m.makeTranslation(x + rnd() * .1, y + (rnd() < .15 ? .25 : 0), z); body.setMatrixAt(k, m); body.setColorAt(k, c.setHex(shirt[(rnd() * shirt.length) | 0])); m.makeTranslation(x, y + .42, z); head.setMatrixAt(k, m); head.setColorAt(k, c.setHex(rnd() < .55 ? 0xffffff : 0x8a5a3c)); k++; }
    body.count = head.count = k; g.add(body, head);
    const flagT = canvasTex(60, 39, (cx) => { cx.fillStyle = '#fff'; cx.fillRect(0, 0, 60, 13); cx.fillStyle = '#d52b1e'; cx.fillRect(0, 13, 60, 13); cx.fillStyle = '#008000'; cx.fillRect(0, 26, 60, 13); cx.fillStyle = '#d52b1e'; cx.fillRect(0, 0, 18, 39); });
    const flagM = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: flagT }), flagG = new THREE.PlaneGeometry(1, .65);
    for (let i = 0; i < 40; i++) { const fl = new THREE.Mesh(flagG, flagM); const r = (rnd() * rows) | 0; fl.position.set(-L / 2 + 3 + rnd() * (L - 6), 2.4 + r * .9, r * 1.3); fl.rotation.y = .3 - rnd() * .6; g.add(fl); }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(L + 4, .5, rows * 1.3 + 6), new THREE.MeshStandardMaterial({ color: 0xf7f7f7, roughness: .5 })); roof.position.set(0, rows * .9 + 5, rows * .65 - 1); roof.rotation.x = -.06; roof.castShadow = Q.shadows; g.add(roof);
    const roofEdge = new THREE.Mesh(new THREE.BoxGeometry(L + 4, .7, .3), new THREE.MeshStandardMaterial({ color: 0xe53950 })); roofEdge.position.set(0, rows * .9 + 4.9, -3.6); g.add(roofEdge);
    for (let x = -L / 2; x <= L / 2; x += 15) { const col = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, rows * .9 + 5), new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: .6, roughness: .4 })); col.position.set(x, (rows * .9 + 5) / 2, rows * 1.3 + .2); g.add(col); }
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; const bs = new THREE.CanvasTexture(cv); bs.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(18, 9), new THREE.MeshStandardMaterial({ map: bs, emissive: 0xffffff, emissiveMap: bs, emissiveIntensity: .8 })); scr.position.set(-30, rows * .9 + 11, rows * .65 - 3); scr.rotation.y = Math.PI; g.add(scr);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(18.8, 9.8, .6), new THREE.MeshStandardMaterial({ color: 0x1b1f2a, metalness: .6 })); fr.position.copy(scr.position).add(new THREE.Vector3(0, 0, .32)); g.add(fr);
    bigScreen = { cv, tex: bs };
  })();

  // جبال الحجر (هندسة واحدة مدموجة)
  (function () {
    const cA = new THREE.Color(0x8a6347), cB = new THREE.Color(0x6a4a3a), cC = new THREE.Color(0xa77d58), cS = new THREE.Color(0xd9b98f), parts = [];
    for (let i = 0; i < 90; i++) {
      const g = new THREE.IcosahedronGeometry(1, 3).toNonIndexed(), p = g.attributes.position, sd = rnd() * 100, col = [];
      for (let k = 0; k < p.count; k++) { let x = p.getX(k), y = p.getY(k), z = p.getZ(k); const n = 1 + .3 * Math.sin(x * 5 + sd) * Math.cos(z * 4 + sd) + .16 * Math.sin(y * 11 + x * 7 + sd) + .07 * Math.sin(x * 23 + z * 19); y = Math.max(y, -.15); p.setXYZ(k, x * n, y * n, z * n); const c = (Math.sin(y * n * 14 + sd) > .3 ? cA : cB).clone().lerp(cC, Math.max(0, y)); if (y < 0) c.lerp(cS, .6); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const a = i / 90 * Math.PI * 2 + rnd() * .05, rr = 820 + rnd() * 200, w = 60 + rnd() * 80;
      g.scale(w, 40 + rnd() * 90, w * .7); g.rotateY(rnd() * 3); g.translate(150 + Math.cos(a) * rr, 0, Math.sin(a) * rr); g.computeVertexNormals(); parts.push(g);
    }
    S.add(new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true })));
  })();
  const duneM = new THREE.MeshStandardMaterial({ map: sandT, color: 0xf2d6a8, roughness: 1 });
  [[-150, -120, 50], [450, -260, 70], [-180, -400, 80], [480, 120, 60], [-140, 300, 50], [150, 500, 70], [140, -520, 90], [150, 10, 60]].forEach(([x, z, r]) => { const d = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 16), duneM); d.scale.y = .2; d.position.set(x, -r * .04, z); d.receiveShadow = true; S.add(d); });

  // النخيل (instanced)
  (function () {
    const trunkT = canvasTex(64, 256, (g) => { g.fillStyle = '#7a5230'; g.fillRect(0, 0, 64, 256); for (let y = 0; y < 256; y += 12) { g.fillStyle = 'rgba(40,25,10,.45)'; g.beginPath(); g.moveTo(0, y); g.lineTo(32, y + 8); g.lineTo(64, y); g.lineTo(64, y + 3); g.lineTo(32, y + 11); g.lineTo(0, y + 3); g.fill(); } }); trunkT.wrapS = trunkT.wrapT = THREE.RepeatWrapping; trunkT.repeat.set(2, 6);
    const leafT = canvasTex(64, 256, (g) => { g.fillStyle = '#5d9e3a'; g.fillRect(30, 0, 4, 256); for (let y = 6; y < 250; y += 7) { const w = 30 * Math.sin(y / 256 * Math.PI); g.strokeStyle = y % 14 ? '#3f8a35' : '#2f7a2c'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, y); g.lineTo(32 - w, y - 10); g.moveTo(32, y); g.lineTo(32 + w, y - 10); g.stroke(); } });
    const H = 9, path = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(.25, H * .5, 0), new THREE.Vector3(.7, H, 0)]), top = path.getPoint(1);
    const trunkG = new THREE.TubeGeometry(path, 12, .32, 8);
    const leaves = []; for (let k = 0; k < 14; k++) { const lg = new THREE.PlaneGeometry(1.3, 5.4, 1, 8); const p = lg.attributes.position; for (let j = 0; j < p.count; j++) { const y = p.getY(j) + 2.7; p.setZ(j, -0.07 * y * y + (k % 2 ? .3 : 0)); p.setY(j, y); } lg.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(-(k % 2 ? .6 : 1.05), k / 14 * Math.PI * 2, 0, 'YXZ'))); lg.translate(top.x, top.y, top.z); leaves.push(lg); }
    const leafG = mergeGeometries(leaves); leafG.computeVertexNormals();
    const dates = []; for (let k = 0; k < 3; k++) { const a = k * 2.1; for (let j = 0; j < 9; j++) { const d = new THREE.SphereGeometry(.09, 6, 5); d.translate(top.x + Math.cos(a) * .45 + (rnd() - .5) * .25, top.y - .4 - rnd() * .7, top.z + Math.sin(a) * .45 + (rnd() - .5) * .25); dates.push(d); } }
    const dateG = mergeGeometries(dates);
    const spots = [];
    const NP = Q.palms;
    for (let i = 0; i < NP; i++) { const t = i / NP; [-1, 1].forEach(sd => { const p = along(t, sd * (22 + rnd() * 8)); if (sd < 0 && p.x < -10 && p.z > -40 && p.z < 190) return; spots.push(p); }); }
    for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, r = 380 + rnd() * 250; spots.push(new THREE.Vector3(150 + Math.cos(a) * r, 0, Math.sin(a) * r)); }
    const mk = (geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, spots.length); im.castShadow = Q.shadows; S.add(im); return im; };
    const iT = mk(trunkG, new THREE.MeshStandardMaterial({ map: trunkT, roughness: 1 })), iL = mk(leafG, new THREE.MeshStandardMaterial({ map: leafT, transparent: true, alphaTest: .4, side: THREE.DoubleSide, roughness: .8 })), iD = mk(dateG, new THREE.MeshStandardMaterial({ color: 0xb8641c, roughness: .55 }));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    spots.forEach((p, i) => { q.setFromEuler(new THREE.Euler(0, rnd() * 6.28, 0)); const s = 1 + rnd() * .35; sc.set(s, s * (.9 + rnd() * .3), s); m.compose(p, q, sc); iT.setMatrixAt(i, m); iL.setMatrixAt(i, m); iD.setMatrixAt(i, m); });
  })();

  // عمارة عُمانية: قلعة + مسجد + بيوت
  const wallT = canvasTex(256, 256, (g) => { g.fillStyle = '#d4a873'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 6000; i++) { g.fillStyle = rnd() < .5 ? 'rgba(120,80,40,.10)' : 'rgba(255,240,210,.12)'; g.fillRect(rnd() * 256, rnd() * 256, 3, 3); } }); wallT.wrapS = wallT.wrapT = THREE.RepeatWrapping;
  const wallM = new THREE.MeshStandardMaterial({ map: wallT, roughness: 1 }), darkM = new THREE.MeshStandardMaterial({ color: 0x3b2614 });
  function tower(r, h, x, z, g) { const t = new THREE.Mesh(new THREE.CylinderGeometry(r * .9, r, h, 32), wallM); t.position.set(x, h / 2, z); t.castShadow = Q.shadows; g.add(t); const n = Math.round(r * 4); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, c = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.3, .6), wallM); c.position.set(x + Math.cos(a) * r * .88, h + .6, z + Math.sin(a) * r * .88); c.rotation.y = -a; g.add(c); } for (let k = 0; k < 4; k++) { const w = new THREE.Mesh(new THREE.PlaneGeometry(.5, 1), darkM); const a = k * 1.4 + .5; w.position.set(x + Math.cos(a) * r * .93, h * .7, z + Math.sin(a) * r * .93); w.lookAt(x + Math.cos(a) * r * 3, h * .7, z + Math.sin(a) * r * 3); g.add(w); } }
  (function () {
    const g = new THREE.Group(); g.position.set(-120, 0, -170); g.rotation.y = .6; g.scale.setScalar(1.8); S.add(g);
    tower(6, 16, 0, 0, g); tower(3.5, 12, 28, -2, g); tower(3.5, 12, -2, -24, g);
    const w1 = new THREE.Mesh(new THREE.BoxGeometry(28, 9, 2.4), wallM); w1.position.set(14, 4.5, -1); g.add(w1);
    const w2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 9, 24), wallM); w2.position.set(-1, 4.5, -12); g.add(w2);
    for (let k = 0; k < 13; k++) { const c = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 2.4), wallM); c.position.set(4 + k * 1.9, 9.6, -1); g.add(c); }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5), new THREE.MeshStandardMaterial({ color: 0x6b3f1d })); door.position.set(14, 2.5, .22); g.add(door);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 6), new THREE.MeshStandardMaterial({ color: 0xdddddd })); pole.position.set(0, 20, 0); g.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 2.2), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, map: canvasTex(120, 72, (c) => { c.fillStyle = '#fff'; c.fillRect(0, 0, 120, 24); c.fillStyle = '#d52b1e'; c.fillRect(0, 24, 120, 24); c.fillStyle = '#008000'; c.fillRect(0, 48, 120, 24); c.fillStyle = '#d52b1e'; c.fillRect(0, 0, 36, 72); }) })); fl.position.set(1.8, 21.8, 0); g.add(fl);
  })();
  (function () {
    const g = new THREE.Group(); g.position.set(470, 0, -60); g.rotation.y = 1.2; g.scale.setScalar(1.4); S.add(g);
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f1ea, roughness: .8 }), gold = new THREE.MeshStandardMaterial({ color: 0xd8b04a, metalness: .9, roughness: .25 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(34, 10, 30), white); base.position.y = 5; g.add(base);
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(7, 7, 4, 32), white); drum.position.y = 12; g.add(drum);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), gold); dome.position.y = 14; dome.scale.y = 1.15; g.add(dome);
    [[-17, -15], [17, -15]].forEach(([x, z]) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.6, 34, 16), white); m.position.set(x, 17, z); g.add(m); const b = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 1.2, 16), white); b.position.set(x, 26, z); g.add(b); const c = new THREE.Mesh(new THREE.ConeGeometry(1.4, 4, 16), gold); c.position.set(x, 36, z); g.add(c); });
    for (let k = 0; k < 7; k++) { const a = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5), new THREE.MeshStandardMaterial({ color: 0x9a7b4f })); a.position.set(-12 + k * 4, 4, 15.02); g.add(a); }
  })();
  (function () {
    const white = new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: .9 }), win = new THREE.MeshStandardMaterial({ color: 0x5b4a3a }), parts = [], wins = [];
    for (let i = 0; i < 26; i++) { const w = 8 + rnd() * 8, h = 5 + rnd() * 6, d = 8 + rnd() * 6, x = -80 + i * 17 + rnd() * 6, z = 430 + rnd() * 70; const b = new THREE.BoxGeometry(w, h, d); b.translate(x, h / 2, z); parts.push(b); for (let k = 0; k < Math.floor(w / 3); k++) { const c = new THREE.BoxGeometry(.8, .8, d); c.translate(x - w / 2 + 1 + k * 3, h + .4, z); parts.push(c); const wn = new THREE.PlaneGeometry(1, 1.6); wn.rotateY(Math.PI); wn.translate(x - w / 2 + 1.5 + k * 3, h * .55, z - d / 2 - .02); wins.push(wn); } }
    S.add(new THREE.Mesh(mergeGeometries(parts), white), new THREE.Mesh(mergeGeometries(wins), win));
  })();
  // أعمدة الإنارة
  for (let i = 0; i < 22; i++) { const t = i / 22, s = i % 2 ? 1 : -1, p = along(t, s * 20); const g = new THREE.Group(); g.position.copy(p); S.add(g); const pl = new THREE.Mesh(new THREE.CylinderGeometry(.2, .3, 16, 10), new THREE.MeshStandardMaterial({ color: 0xb8bec6, metalness: .7, roughness: .35 })); pl.position.y = 8; g.add(pl); const hd = new THREE.Mesh(new THREE.BoxGeometry(3, .9, 1.2), new THREE.MeshStandardMaterial({ color: 0x2b2f3a, metalness: .6 })); hd.position.y = 16.2; g.add(hd); g.rotation.y = frame(t).ang; }

  return { curve, LEN, frame, along, sun, env, tFinish, startLights, bigScreen };
}

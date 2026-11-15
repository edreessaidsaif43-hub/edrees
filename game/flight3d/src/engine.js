// محرك «طيّار المعرفة 3D» — يُجمَّع بـ esbuild إلى ملف عادي يعمل دون إنترنت (window.FlyEngine)
import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from './vendor/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from './vendor/jsm/postprocessing/ShaderPass.js';
import { HueSaturationShader } from './vendor/jsm/shaders/HueSaturationShader.js';
import { VignetteShader } from './vendor/jsm/shaders/VignetteShader.js';
import { buildSky, buildWater } from './world.js';
import { makeCoast, buildTerrain, buildForts, buildMuttrah, buildOpera, buildMosque, buildAirport } from './coast.js';
import { buildAircraft, animPlane } from './plane.js';
import { buildRing, LETTERS, RCOLS, starGeo, starMat, buildGull, flapGull, buildCloud, buildBalloon, sparkles } from './props.js';
import { rnd } from './util.js';

const QUALITY = {
  high: { pr: 1.25, shadow: 2048, waterRes: 512, post: 'full', clouds: 1 },
  medium: { pr: 1, shadow: 1024, waterRes: 256, post: 'grade', clouds: .8 },
  low: { pr: .75, shadow: 0, low: true, post: 'none', clouds: .55 }
};
const TIMES = [[0, 'sunrise', 12, 150], [.27, 'morning', 30, 120], [.5, 'noon', 68, 60], [.72, 'afternoon', 38, -20], [1, 'sunset', 9, -35]];
function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function create(container, opts) {
  const Q = QUALITY[opts.quality] || QUALITY.medium;
  const R = new THREE.WebGLRenderer({ antialias: Q.post !== 'full' && Q.pr >= 1, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NeutralToneMapping;
  R.shadowMap.enabled = Q.shadow > 0; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.domElement.className = 'fl-canvas'; container.appendChild(R.domElement);
  const S = new THREE.Scene();
  const sky = buildSky(S), sunDir = V(.3, .3, 1).normalize();
  const water = buildWater(S, sunDir, Q);
  S.fog = new THREE.FogExp2(0x9fe4ff, .00017);
  const hemi = new THREE.HemisphereLight(0xb8e8ff, 0xffb8c8, 1.05); S.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); S.add(sun, sun.target);
  if (Q.shadow) { sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 10, far: 900 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .05; }
  const rim = new THREE.DirectionalLight(0xffffff, .8); S.add(rim, rim.target);
  const cam = new THREE.PerspectiveCamera(58, 1, .3, 30000);
  // المعالجة اللاحقة
  let comp = null;
  function makeComposer(w, h) {
    if (Q.post === 'none') { comp = null; return; }
    comp = new EffectComposer(R); comp.addPass(new RenderPass(S, cam));
    if (Q.post === 'full') comp.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), .35, .5, 1.6));
    comp.addPass(new OutputPass());
    const hs = new ShaderPass(HueSaturationShader); hs.uniforms.saturation.value = .1; comp.addPass(hs);
    const vg = new ShaderPass(VignetteShader); vg.uniforms.offset.value = .95; vg.uniforms.darkness.value = .5; comp.addPass(vg);
    if (Q.post === 'full') comp.addPass(new SMAAPass(w, h));
  }
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; R.setSize(w, h, false); R.domElement.style.width = w + 'px'; R.domElement.style.height = h + 'px'; cam.aspect = w / h; E.fov0 = w / h < 1.1 ? 74 : 58; cam.fov = E.fov0; cam.updateProjectionMatrix(); if (comp) comp.setSize(w, h); else if (Q.post !== 'none') makeComposer(w, h); }

  const E = {
    t: 0, dt: 1 / 60, running: false, state: 'idle', L: 0, geo: null, world: null, plane: null, kind: 'prop', kid: 'boy',
    pos: V(0, 50, 0), off: 0, alt: 50, vx: 0, vy: 0, input: { x: 0, y: 0 }, speed: 0, base: 38, boost: 0, shake: 0, fov0: 58,
    gates: [], stars: [], obs: [], clouds: [], amb: [], camMode: 'chase', camT: 0, cloudV: 0, auto: null, done: false, pending: null
  };
  window.addEventListener('resize', resize); resize();
  const camLook = V(0, 0, 0);

  // ---------- العالم (يُبنى مرة لكل طول رحلة) ----------
  let worldGroup = null;
  function buildWorld(L) {
    if (E.L === L && worldGroup) return;
    if (worldGroup) { S.remove(worldGroup); worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    worldGroup = new THREE.Group(); S.add(worldGroup);
    const geo = makeCoast(L); E.geo = geo; E.L = L;
    E.terrain = buildTerrain(worldGroup, Q, geo); buildForts(worldGroup, geo); E.mut = buildMuttrah(worldGroup, geo); buildOpera(worldGroup, geo); buildMosque(worldGroup, geo); buildAirport(worldGroup, geo);
    // غيوم وطيور ومناطيد للزينة على طول الرحلة
    const r = rnd(77);
    E.amb = [];
    const nC = Math.round(L / 260 * Q.clouds);
    for (let i = 0; i < nC; i++) { const z = -r() * (L + 600), side = r() < .5 ? -1 : 1, c = buildCloud(r, 1.4 + r() * 1.6); c.position.set(geo.corridorX(z) + side * (90 + r() * 400), 110 + r() * 120, z); worldGroup.add(c); }
    for (let i = 0; i < Math.round(L / 700); i++) { const z = -300 - r() * L, b = buildBalloon([['#ff2d55', '#ffffff', '#00c853', '#ffd21a'], ['#2a7dff', '#ffd21a', '#ff7a1a', '#ffffff'], ['#a050ff', '#3fd4ff', '#ffffff', '#ff4fa0']][i % 3]); b.position.set(geo.corridorX(z) + (r() < .5 ? -1 : 1) * (70 + r() * 120), 60 + r() * 60, z); b.scale.setScalar(3); worldGroup.add(b); E.amb.push({ o: b, kind: 'balloon', ph: r() * 6 }); }
    for (let i = 0; i < Math.round(L / 500); i++) { const z = -200 - r() * L, fl = new THREE.Group(); for (let k = 0; k < 6; k++) { const gl = buildGull(); gl.position.set((k % 3) * 3 - 3, (k / 3 | 0) * 1.6, k * 2.2); gl.scale.setScalar(1.6); fl.add(gl); } fl.position.set(geo.corridorX(z) + (r() - .5) * 160, 70 + r() * 50, z); worldGroup.add(fl); E.amb.push({ o: fl, kind: 'gulls', v: 9 + r() * 4 }); }
  }
  // طائرة ركاب بعيدة تعبر السماء
  const liner = (() => { const g = new THREE.Group(), w = new THREE.MeshToonMaterial({ color: 0xffffff }); const b = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 22, 6, 16), w); b.rotation.z = Math.PI / 2; g.add(b); const wg = new THREE.Mesh(new THREE.BoxGeometry(8, .4, 30), w); wg.rotation.y = Math.PI / 2; g.add(wg); const tl = new THREE.Mesh(new THREE.BoxGeometry(5, 6, .5), new THREE.MeshToonMaterial({ color: 0xd8102a })); tl.position.set(-12, 3, 0); g.add(tl); return g; })();
  S.add(liner);

  function setAircraft(kind, kid) {
    if (E.plane) S.remove(E.plane);
    E.kind = kind; E.kid = kid; E.plane = buildAircraft(kind, kid); E.plane.rotation.order = 'YXZ';
    E.plane.traverse(o => { if (o.isMesh && !o.userData.isOut) o.castShadow = Q.shadow > 0; });
    S.add(E.plane);
  }
  function clearDyn() { [...E.gates, ...E.stars, ...E.obs, ...E.clouds].forEach(o => o.obj.parent && o.obj.parent.remove(o.obj)); E.gates = []; E.stars = []; E.obs = []; E.clouds = []; E.pending = null; }

  // ---------- عناصر المسار (المسافات أمام الطائرة) ----------
  const sg = starGeo(), sm = starMat();
  function zAhead(d) { return E.pos.z - d; }
  function addStars(d0, n, ox, oy, wave) {
    for (let i = 0; i < n; i++) { const z = zAhead(d0 + i * 9), m = new THREE.Mesh(sg, sm); m.scale.setScalar(1.3); m.castShadow = Q.shadow > 0; const x = E.geo.corridorX(z) + ox + Math.sin(i * .7) * (wave || 0), y = oy + Math.sin(i / Math.max(1, n - 1) * Math.PI) * 4; m.position.set(x, y, z); S.add(m); E.stars.push({ obj: m, got: false }); }
  }
  function freeRun(d0, d1) {
    const r = Math.random;
    let d = d0 + 20;
    while (d < d1 - 40) {
      const k = r();
      if (k < .5) addStars(d, 7, (r() - .5) * 30, 38 + r() * 26, 6);
      else if (k < .75) { const b = buildBalloon(); const z = zAhead(d); b.position.set(E.geo.corridorX(z) + (r() - .5) * 34, 36 + r() * 30, z); b.scale.setScalar(1.6); S.add(b); E.obs.push({ obj: b, r: 9, kind: 'balloon', hit: false }); addStars(d + 30, 5, (r() - .5) * 30, 50, 0); }
      else if (k < .9) { const fl = new THREE.Group(); for (let i = 0; i < 5; i++) { const gl = buildGull(); gl.position.set((i % 3 - 1) * 2.4, (i / 3 | 0) * 1.6, i * 1.5); gl.scale.setScalar(1.8); fl.add(gl); } const z = zAhead(d); fl.position.set(E.geo.corridorX(z) + (r() < .5 ? -30 : 30), 40 + r() * 25, z); S.add(fl); E.obs.push({ obj: fl, r: 6, kind: 'gulls', hit: false, vx: (fl.position.x < E.geo.corridorX(z) ? 1 : -1) * 7 }); }
      else { const c = buildCloud(Math.random, 1.1); const z = zAhead(d); c.position.set(E.geo.corridorX(z) + (r() - .5) * 20, 44 + r() * 14, z); S.add(c); E.clouds.push({ obj: c, r: 34 }); }
      d += 90 + r() * 80;
    }
  }
  // حلقات الخيارات على بُعد D متر؛ texts بترتيب الحلقات (أ يمين أعلى)
  function ask(texts, D) {
    const z = zAhead(D), cx = E.geo.corridorX(z), cy = 50, g = new THREE.Group(); g.position.set(cx, cy, z); S.add(g);
    const n = texts.length, rings = [];
    texts.forEach((t, i) => {
      const ring = buildRing(n === 2 ? (i ? '✗' : '✓') : LETTERS[i], t, RCOLS[i]);
      let ox, oy; if (n === 2) { ox = i ? -9 : 9; oy = 0; } else { ox = i % 2 ? -8.5 : 8.5; oy = i < 2 ? 6.8 : -6.8; if (i >= 2) ring.userData.panel.position.y = -(4.6 + 2.6); }
      ring.position.set(ox, oy, 0); const sp = sparkles(24, 5.2, new THREE.Color(RCOLS[i]).lerp(new THREE.Color(0xffffff), .5)); ring.add(sp); ring.userData.sp = sp;
      g.add(ring); rings.push(ring);
    });
    const gate = { obj: g, z, n, rings, passed: false, D };
    E.gates.push(gate); E.pending = gate;
    addStars(D * .3, 6, 0, 50, 4);
    return gate;
  }

  // ---------- التحديث ----------
  function timeOfDay(p) {
    p = clamp(p, 0, 1); let i = 0; while (i < TIMES.length - 2 && p > TIMES[i + 1][0]) i++;
    const A = TIMES[i], B = TIMES[i + 1], t = clamp((p - A[0]) / (B[0] - A[0]), 0, 1);
    const el = THREE.MathUtils.degToRad(A[2] + (B[2] - A[2]) * t), az = THREE.MathUtils.degToRad(A[3] + (B[3] - A[3]) * t);
    sunDir.setFromSphericalCoords(1, Math.PI / 2 - el, az);
    const P = sky.blend(A[1], B[1], t, sunDir);
    hemi.color.setHex(P.hemi[0]); hemi.groundColor.setHex(P.hemi[1]); sun.color.setHex(P.light); S.fog.color.setHex(P.fog);
    if (water.material.uniforms) { water.material.uniforms.sunDirection.value.copy(sunDir); }
    E.timeKey = t < .5 ? A[1] : B[1];
  }
  function update(dt) {
    E.t += dt; const pl = E.plane; if (!pl || !E.geo) return;
    const geo = E.geo;
    // التحكم والحركة
    if (E.state === 'fly' || E.state === 'cruise') {
      const tx = E.input.x * 26, ty = E.input.y * 20;
      E.vx += (tx - E.vx) * Math.min(1, dt * 3.2); E.vy += (ty - E.vy) * Math.min(1, dt * 3.2);
      E.off = clamp(E.off + E.vx * dt, -30, 30); E.alt = clamp(E.alt + E.vy * dt, 24, 82);
      if (Math.abs(E.off) >= 30) E.vx *= .5; if (E.alt <= 24 || E.alt >= 82) E.vy *= .5;
      const target = E.base * (1 + .35 * Math.min(1, E.boost));
      E.speed += (target - E.speed) * Math.min(1, dt * 1.5);
      E.pos.z -= E.speed * dt; E.pos.x = geo.corridorX(E.pos.z) + E.off; E.pos.y = E.alt;
      const look = geo.corridorX(E.pos.z - 30) - geo.corridorX(E.pos.z);
      pl.rotation.set(clamp(E.vy * .025, -.35, .35), Math.atan2(-look, 30) * .6, clamp(-E.vx * .03, -.6, .6));
      if (E.kind === 'heli') pl.rotation.x = -.18 - E.boost * .1 + E.vy * .01;
    } else if (E.state === 'intro') {
      E.pos.x = geo.corridorX(E.pos.z) + E.off; E.pos.y = E.alt; pl.rotation.set(0, 0, Math.sin(E.t) * .05);
    } else if (E.auto) E.auto(dt);
    E.boost = Math.max(0, E.boost - dt * .6); E.shake = Math.max(0, E.shake - dt * 1.6);
    const wob = E.shake > 0 ? Math.sin(E.t * 38) * E.shake * .25 : 0;
    pl.position.copy(E.pos); pl.rotation.z += wob; pl.position.y += Math.sin(E.t * 1.6) * .25;
    animPlane(pl, E.t, dt, E.boost);
    // البوابات
    E.gates.forEach(g => {
      g.rings.forEach((r, i) => { r.rotation.z = Math.sin(E.t * .8 + i) * .05; if (r.userData.sp) r.userData.sp.rotation.z += dt * .4; });
      if (!g.passed && E.pos.z <= g.z) {
        g.passed = true; if (E.pending === g) E.pending = null;
        let best = 0, bd = 1e9; g.rings.forEach((r, i) => { const w = r.getWorldPosition(V(0, 0, 0)), d = Math.hypot(w.x - E.pos.x, w.y - E.pos.y); if (d < bd) { bd = d; best = i; } });
        g.idx = best; E.onGate && E.onGate(best, g);
      }
      if (g.fx) { g.fx.t += dt; const r = g.rings[g.fx.i]; if (r) { if (g.fx.ok) r.scale.setScalar(1 + Math.sin(Math.min(1, g.fx.t * 2) * Math.PI) * .35); else r.position.y = r.userData.y0 + Math.sin(g.fx.t * 30) * .5 * Math.max(0, 1 - g.fx.t); } }
    });
    E.gates = E.gates.filter(g => { if (g.z > E.pos.z + 60) { S.remove(g.obj); return false; } return true; });
    // النجوم
    E.stars.forEach(s => { s.obj.rotation.y += dt * 3; if (!s.got && s.obj.position.distanceTo(E.pos) < 4.2) { s.got = true; s.pop = 0; E.onStar && E.onStar(); sfx('star'); } if (s.got) { s.pop += dt; s.obj.scale.setScalar(1.3 * (1 + s.pop * 4)); s.obj.material = sm; s.obj.visible = s.pop < .25; } });
    E.stars = E.stars.filter(s => { if (s.obj.position.z > E.pos.z + 40) { S.remove(s.obj); return false; } return true; });
    // العوائق
    E.obs.forEach(o => {
      if (o.kind === 'gulls') { o.obj.position.x += o.vx * dt; o.obj.rotation.y = o.vx > 0 ? -Math.PI / 2 : Math.PI / 2; o.obj.children.forEach(gl => flapGull(gl, E.t)); }
      else o.obj.position.y += Math.sin(E.t + o.obj.position.z) * dt * .6;
      const c = o.obj.position.clone(); if (o.kind === 'balloon') c.y += 9;
      if (!o.hit && (E.state === 'fly' || E.state === 'cruise') && c.distanceTo(E.pos) < o.r) { o.hit = true; E.shake = 1; E.onHit && E.onHit(o.kind); sfx('hit'); }
    });
    E.obs = E.obs.filter(o => { if (o.obj.position.z > E.pos.z + 60) { S.remove(o.obj); return false; } return true; });
    // عبور الغيوم
    let inC = 0; E.clouds.forEach(c => { const d = c.obj.position.distanceTo(E.pos); inC = Math.max(inC, clamp(1 - d / c.r, 0, 1)); });
    E.clouds = E.clouds.filter(c => { if (c.obj.position.z > E.pos.z + 80) { S.remove(c.obj); return false; } return true; });
    if (inC > .05 && E.cloudV < .05) sfx('cloud'); E.cloudV += (inC - E.cloudV) * Math.min(1, dt * 6); E.onCloud && E.onCloud(E.cloudV);
    // الزينة
    E.amb.forEach(a => { if (a.kind === 'gulls') { a.o.position.z -= a.v * dt; a.o.children.forEach(g => flapGull(g, E.t)); } else a.o.position.y += Math.sin(E.t * .5 + a.ph) * dt * .8; });
    if (E.mut) E.mut.dhows.forEach((d, i) => { d.position.y = Math.sin(E.t * .8 + i) * .15; });
    liner.position.set(E.pos.x + 900 - ((E.t * 60) % 2400), 420, E.pos.z - 1400); liner.rotation.y = 0;
    // الماء والإضاءة والوقت
    if (water.material.uniforms) water.material.uniforms.time.value += dt * .6; else if (water.userData.simple) { water.userData.simple.offset.x += dt * .004; water.userData.simple.offset.y += dt * .006; }
    if (E.terrain && E.terrain.userData.foam) E.terrain.userData.foam.offset.y -= dt * .25;
    timeOfDay(-E.pos.z / E.L);
    sun.position.copy(E.pos).addScaledVector(sunDir, 400); sun.target.position.copy(E.pos);
    rim.position.copy(E.pos).add(V(-40, 60, -120)); rim.target.position.copy(E.pos);
    updCam(dt);
  }
  // ---------- الكاميرا ----------
  function updCam(dt) {
    const p = E.pos, pl = E.plane; let pos, look, f = 1 - Math.pow(.003, dt);
    const kid = pl.userData.kid;
    if (E.camMode === 'intro') {
      E.camT += dt; const u = ease(Math.min(1, E.camT / E.camDur)), a = Math.PI * .85 * (1 - u) - Math.PI / 2;
      const r = 16 + 2 * (1 - u); pos = V(p.x + Math.cos(a) * r * (1 - u * .9), p.y + 3 + 1.5 * (1 - u), p.z - Math.sin(a) * r);
      if (u >= 1) { E.camMode = 'chase'; }
      pos.lerp(V(p.x + .8, p.y + 3.6, p.z + 12.5), u); look = V(p.x, p.y + 2 * u + .5, p.z - 40 * u); f = 1;
    } else if (E.camMode === 'cockpit') {
      const hp = kid ? kid.userData.head.getWorldPosition(V(0, 0, 0)) : p.clone(); pos = hp.add(V(0, .15, -.15)); look = pos.clone().add(V(0, -1.2, -40).applyEuler(new THREE.Euler(pl.rotation.x * .5, pl.rotation.y, 0))); f = 1;
    } else if (E.camMode === 'land') {
      E.camT += dt; const A = E.geo.air; pos = V(A.x + 60, 14, Math.max(A.z1 + 80, Math.min(A.z0 - 300, p.z - 60))); look = p.clone(); f = 1 - Math.pow(.02, dt);
    } else if (E.camMode === 'orbit') {
      E.camT += dt; const a = E.camT * .25; pos = V(p.x + Math.cos(a) * 14, p.y + 4, p.z + Math.sin(a) * 14); look = p.clone().add(V(0, 1, 0)); f = 1 - Math.pow(.05, dt);
    } else {
      pos = V(p.x + .8 - E.vx * .06, p.y + 3.6 - E.vy * .03, p.z + 12.5 + E.boost * 2); look = V(p.x, p.y + 4.2, p.z - 40);
    }
    if (kid) kid.userData.head.visible = E.camMode !== 'cockpit';
    if (E.snap) { cam.position.copy(pos); camLook.copy(look); E.snap = false; } else { cam.position.lerp(pos, f); camLook.lerp(look, f); }
    if (E.shake > 0) cam.position.add(V((Math.random() - .5) * E.shake * .6, (Math.random() - .5) * E.shake * .6, 0));
    cam.lookAt(camLook);
    const fov = E.fov0 + Math.min(1, E.boost) * 9; if (Math.abs(cam.fov - fov) > .05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }
  function sfx(n, a) { E.onSfx && E.onSfx(n, a); }

  // ---------- الهبوط والطوارئ ----------
  function startLanding(cb) {
    const A = E.geo.air; E.state = 'land'; E.camMode = 'land'; E.camT = 0; E.snap = false; clearDyn();
    const heli = E.kind === 'heli', gearY = E.kind === 'jet' ? 1.15 : 1.35;
    const p0 = E.pos.clone(), tdZ = A.z0 - 160, endZ = A.z0 - (E.kind === 'jet' ? 900 : 650);
    let ph = 0, v = E.speed; const v0 = Math.max(18, E.speed);
    E.auto = (dt) => {
      const pl = E.plane;
      if (heli) {
        const H = A.heli;
        if (ph === 0) { const tgt = V(H.x, 30, H.z + 5), d = tgt.clone().sub(E.pos), l = d.length(); v = Math.max(8, Math.min(v, l * .6)); if (l < 2) ph = 1; else E.pos.addScaledVector(d.normalize(), Math.min(l, v * dt)); pl.rotation.set(-.12, 0, 0); }
        else if (ph === 1) { E.pos.y = Math.max(H.y + 1.69, E.pos.y - dt * 6); pl.rotation.x *= .95; if (E.pos.y <= H.y + 1.7) { ph = 2; E.speed = 0; sfx('land'); E.camMode = 'orbit'; E.camT = 0; E.landed = true; cb && cb(); } }
        return;
      }
      if (ph === 0) {
        // اقتراب: محاذاة المدرج والنزول التدريجي
        const k = clamp((p0.z - E.pos.z) / (p0.z - tdZ), 0, 1); v = v0 * (1 - .45 * k);
        E.pos.z -= v * dt; E.pos.x += (A.x - E.pos.x) * Math.min(1, dt * .9 * (.3 + k)); E.pos.y = 3.15 + gearY + (p0.y - 3.15 - gearY) * Math.pow(1 - k, 1.6);
        pl.rotation.set(-.06 + k * .14, 0, (A.x - E.pos.x) * -.004);
        if (E.pos.z <= tdZ) { ph = 1; E.pos.y = 3.15 + gearY; sfx('land'); }
      } else if (ph === 1) {
        v = Math.max(0, v - dt * (v * .55 + 4)); E.pos.z -= v * dt; E.pos.x += (A.x - E.pos.x) * dt; pl.rotation.set(Math.max(0, pl.rotation.x - dt * .3), 0, 0);
        if (v <= 0.3 || E.pos.z < endZ) { ph = 2; E.camMode = 'orbit'; E.camT = 0; E.landed = true; cb && cb(); }
      }
      E.speed = v;
    };
  }
  function startCrash(cb) {
    E.state = 'crash'; E.camMode = 'chase'; clearDyn(); let v = E.speed, done = false;
    E.auto = (dt) => {
      const pl = E.plane; v = Math.max(18, v - dt * 6); E.pos.z -= v * dt; E.pos.y -= dt * 9; pl.rotation.x = -.25; pl.rotation.z = Math.sin(E.t * 2) * .2;
      if (E.pos.y <= 1 && !done) { done = true; E.pos.y = .6; sfx('splash'); E.shake = 1.2; E.camMode = 'orbit'; E.camT = 0; E.auto = () => { E.plane.rotation.x *= .95; E.pos.y = .6 + Math.sin(E.t * 2) * .15; }; cb && cb(); }
    };
  }

  // ---------- الحلقة ----------
  let last = performance.now(), raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.2, Math.max(0, (now - last) / 1000)); last = now;
    if (!E.running) return;
    E.dt = dt || 1 / 60;
    update(dt);
    sky.sky.position.copy(cam.position);
    if (comp) comp.render(); else R.render(S, cam);
  }

  const api = {
    supported: true,
    // تهيئة رحلة جديدة: L طول المسار، base السرعة
    setup(o) {
      buildWorld(o.L); setAircraft(o.kind || 'prop', o.kid || 'boy'); clearDyn();
      E.base = o.base || 38; E.speed = E.base; E.pos.set(E.geo.corridorX(0), 50, 0); E.off = 0; E.alt = 50; E.vx = E.vy = 0; E.input.x = E.input.y = 0;
      E.boost = 0; E.shake = 0; E.state = 'idle'; E.auto = null; E.landed = false; E.camMode = 'chase'; E.snap = true; E.cloudV = 0;
      update(0);
    },
    start() { E.running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    stop() { E.running = false; cancelAnimationFrame(raf); raf = 0; },
    intro(dur) { E.state = 'intro'; E.camMode = 'intro'; E.camT = 0; E.camDur = dur || 3.5; },
    go() { E.state = 'fly'; E.camMode = E.camMode === 'cockpit' ? 'cockpit' : 'chase'; },
    cruise() { E.state = 'cruise'; },
    ask, freeRun, addStars,
    gateResult(g, ok) { const r = g.rings[g.idx]; if (r) r.userData.y0 = r.position.y; g.fx = { t: 0, i: g.idx, ok }; if (ok) { E.boost = 1.8; sfx('ring'); if (r) { r.userData.tor.material = r.userData.tor.material.clone(); r.userData.tor.material.emissive.setHex(0x7dff9a); r.userData.tor.material.emissiveIntensity = .8; } } else { E.shake = 1.1; sfx('bump'); if (r) { r.userData.tor.material = r.userData.tor.material.clone(); r.userData.tor.material.color.setHex(0x9a9aa8); r.userData.tor.material.emissiveIntensity = 0; } } },
    land: startLanding, crash: startCrash,
    setInput(x, y) { E.input.x = clamp(x, -1, 1); E.input.y = clamp(y, -1, 1); },
    toggleCam() { if (E.camMode === 'chase') E.camMode = 'cockpit'; else if (E.camMode === 'cockpit') E.camMode = 'chase'; return E.camMode; },
    gateDist() { return E.pending ? Math.max(0, E.pos.z - E.pending.z) : null; },
    dist() { return -E.pos.z; },
    snapshot() { return R.domElement.toDataURL('image/jpeg', .85); },
    debug: E, renderer: R
  };
  return api;
}
window.FlyEngine = { supported, create, QUALITY };

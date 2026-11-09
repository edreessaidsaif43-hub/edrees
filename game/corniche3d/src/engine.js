// محرك «عدّاء الكورنيش 3D» — يُجمَّع بـ esbuild إلى ملف عادي يعمل دون إنترنت (window.RunEngine)
import * as THREE from 'three';
import { buildCorniche, buildSky, skyEnv, buildFort, LANES, PW, ROAD } from './world.js';
import { buildKid, restKid, poseRunKid, poseJumpKid, poseCheerKid, poseStumbleKid } from './kid.js';
import { buildGate, buildObstacle, coinGeo, coinMat } from './props.js';
import { buildCar, buildBus, buildBike, pedal } from './vehicles.js';

const QUALITY = {
  high: { pr: 1.5, shadow: 2048, low: false, cars: 6, bikes: 3 },
  medium: { pr: 1, shadow: 1024, low: false, cars: 5, bikes: 3 },
  low: { pr: .75, shadow: 0, low: true, cars: 4, bikes: 2 }
};
const L = 600, START_Z = -60;
function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function create(container, opts) {
  const Q = QUALITY[opts.quality] || QUALITY.medium;
  const R = new THREE.WebGLRenderer({ antialias: Q.pr >= 1, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1;
  R.shadowMap.enabled = Q.shadow > 0; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.domElement.className = 'cr-canvas'; container.appendChild(R.domElement);
  const S = new THREE.Scene(), env = skyEnv(R); S.environment = env; S.fog = new THREE.Fog(0xf2b98e, 70, 520);
  const skyG = new THREE.Group(); S.add(skyG); buildSky(skyG);
  const world = buildCorniche(R, S, Q, { env, L });
  S.add(new THREE.HemisphereLight(0xa9c0ff, 0x8a6a4a, .9));
  const sun = new THREE.DirectionalLight(0xffc48a, 2.6); S.add(sun, sun.target);
  if (Q.shadow) { sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 34, bottom: -26, near: 1, far: 140 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .03; }
  const fill = new THREE.DirectionalLight(0xbcd0ff, .6); S.add(fill, fill.target);

  const cam = new THREE.PerspectiveCamera(56, 1, .1, 2000);
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; R.setSize(w, h, false); R.domElement.style.width = w + 'px'; R.domElement.style.height = h + 'px'; cam.aspect = w / h; E.fov0 = w / h < 1.1 ? 72 : 56; cam.updateProjectionMatrix(); }

  const cg = coinGeo(), cm = coinMat();
  const E = {
    t: 0, dt: 1 / 60, running: false, state: 'idle', dist: 0, base: 9, speed: 0, lane: 1, x: LANES[1], y: 0, vy: 0, ph: 0, stumble: 0, boost: 0, cheer: 0, fov0: 56,
    kid: null, kidType: 'girl', gates: [], coins: [], obs: [], vehicles: [], fort: null, fortD: null, finished: false, plan: [], camMode: 'behind', camT: 0, conf: null, hitLock: 0, pending: null
  };
  resize(); window.addEventListener('resize', resize);
  const zOf = d => E.kid.position.z - (d - E.dist);

  function setKid(type) {
    if (E.kid) S.remove(E.kid);
    E.kidType = type; E.kid = buildKid(type, env); E.kid.rotation.y = Math.PI; E.kid.position.set(LANES[1], 0, START_Z);
    E.kid.traverse(o => { if (o.isMesh && !o.userData.isOut) o.castShadow = Q.shadow > 0; });
    S.add(E.kid);
  }
  function clearDyn() {
    [...E.gates, ...E.coins, ...E.obs].forEach(o => S.remove(o.obj)); E.gates = []; E.coins = []; E.obs = [];
    if (E.fort) { S.remove(E.fort); E.fort = null; } E.fortD = null; if (E.conf) E.conf.visible = false;
  }
  // حركة السير: سيارات في الاتجاهين وحافلة ودراجات
  function makeTraffic() {
    E.vehicles.forEach(v => S.remove(v.obj)); E.vehicles = [];
    const cols = [0xf4f4f2, 0x1f2a3a, 0xc9ccd2, 0xb3202a, 0x2a5aa8, 0xe8e8e8, 0x3a3a3f];
    for (let i = 0; i < Q.cars; i++) {
      const kinds = ['taxi', 'sedan', 'suv', 'pickup', 'sedan', 'taxi'], k = kinds[i % kinds.length];
      const o = k === 'taxi' ? buildCar('sedan', 0xf4f4f2, true) : buildCar(k, cols[(i * 3) % cols.length]);
      E.vehicles.push({ obj: o, kind: 'car', taxi: k === 'taxi', x: ROAD.same, dir: 1, v: 13 + (i % 3) * 1.6, d: -40 + i * 55, side: 0 });
      const o2 = i === 1 ? buildBus() : (i % 3 === 2 ? buildCar('sedan', 0xf4f4f2, true) : buildCar(['suv', 'sedan', 'pickup'][i % 3], cols[(i * 5 + 1) % cols.length]));
      o2.rotation.y = Math.PI;
      E.vehicles.push({ obj: o2, kind: i === 1 ? 'bus' : 'car', taxi: i % 3 === 2 && i !== 1, x: ROAD.opp, dir: -1, v: 12 + (i % 2) * 2, d: 40 + i * 70, side: 0 });
    }
    const bt = ['boy', 'girl', 'girl2'], bc = [0x2fae5c, 0x1e9bb5, 0xe8673a];
    for (let i = 0; i < Q.bikes; i++) { const o = buildBike(bt[i % 3], bc[i % 3], env); E.vehicles.push({ obj: o, kind: 'bike', x: ROAD.bike, dir: 1, v: 4.6 + i * .5, d: 25 + i * 60, side: 0 }); }
    E.vehicles.forEach(v => { v.obj.traverse(m => { if (m.isMesh) m.castShadow = Q.shadow > 0 && !m.userData.isOut; }); S.add(v.obj); });
  }

  // ---------- عناصر المسار ----------
  function addCoins(d0, lane, n, arc) {
    for (let i = 0; i < n; i++) { const m = new THREE.Mesh(cg, cm); m.castShadow = Q.shadow > 0; S.add(m); const y = arc ? .95 + Math.sin(i / (n - 1) * Math.PI) * 1.25 : .95; E.coins.push({ obj: m, d: d0 + i * 2.2, x: LANES[lane], y, got: false }); }
  }
  function addObstacle(d, lane, kind) { const o = buildObstacle(kind); o.traverse(m => { if (m.isMesh) m.castShadow = Q.shadow > 0; }); S.add(o); E.obs.push({ obj: o, d, x: LANES[lane], hit: false, kind }); }
  // مقطع جري حر بين البوابات: عائقان وعملات
  function freeRun(d0, d1) {
    let d = d0;
    while (d < d1 - 6) {
      const lane = (Math.random() * 4) | 0, kind = Math.random() < .5 ? 0 : 1;
      addObstacle(d, lane, kind);
      if (Math.random() < .6) addCoins(d - 4.4, lane, 5, true);
      const cl = (lane + 1 + ((Math.random() * 3) | 0)) % 4; addCoins(d - 3, cl, 4, false);
      d += 16 + Math.random() * 8;
    }
  }
  // بوابة سؤال على بعد D متر؛ texts: نصوص الخيارات بترتيب الفتحات من اليمين
  function ask(texts, D) {
    const g = buildGate(texts); g.traverse(m => { if (m.isMesh) m.castShadow = Q.shadow > 0 && !m.material.transparent; }); S.add(g);
    const gate = { obj: g, d: E.dist + D, n: texts.length, passed: false, D };
    E.gates.push(gate);
    // عملات خفيفة في الطريق إلى البوابة
    addCoins(E.dist + D * .35, (Math.random() * 4) | 0, 4, false);
    E.pending = gate;
    return gate;
  }
  function gateIndex(n) { const w = (PW * 2 + .6) / n; return Math.max(0, Math.min(n - 1, Math.floor((PW + .3 - E.x) / w))); }

  // ---------- قصاصات الاحتفال ----------
  function confetti() {
    if (!E.conf) {
      const n = 400; E.conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(.3, .18), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), n); E.conf.frustumCulled = false; S.add(E.conf);
      const c = new THREE.Color(), cols = [0xe53950, 0xffd23f, 0x16a3a0, 0xffffff, 0x2fae5c, 0xff7a1a]; E.confD = [];
      for (let i = 0; i < n; i++) { E.conf.setColorAt(i, c.setHex(cols[i % cols.length])); E.confD.push({ p: V(0, 0, 0), v: V(0, 0, 0), r: new THREE.Euler(), w: V(0, 0, 0) }); }
    }
    E.conf.visible = true; const k = E.kid.position;
    E.confD.forEach(d => { d.p.set(k.x + (Math.random() - .5) * 10, 7 + Math.random() * 6, k.z + (Math.random() - .5) * 10); d.v.set((Math.random() - .5) * 4, Math.random() * 3, (Math.random() - .5) * 4); d.w.set(Math.random() * 8, Math.random() * 8, 0); });
  }

  // ---------- التحديث ----------
  function update(dt) {
    const k = E.kid; if (!k) return;
    E.t += dt;
    // السرعة
    let target = E.state === 'run' ? E.base * (1 + .45 * Math.min(1, E.boost)) : E.state === 'finish' ? Math.max(0, E.speed - dt * 6) : 0;
    if (E.stumble > 0) target *= .35;
    if (E.state === 'run') E.speed += (target - E.speed) * Math.min(1, dt * 3); else E.speed = target;
    E.boost = Math.max(0, E.boost - dt * .7); E.stumble = Math.max(0, E.stumble - dt); E.hitLock = Math.max(0, E.hitLock - dt);
    const step = E.speed * dt; E.dist += step; k.position.z -= step;
    // إعادة العدّاء L مترًا للخلف (العالم متكرر فلا يظهر الانتقال)
    if (k.position.z < START_Z - L) { k.position.z += L; cam.position.z += L; camLook.z += L; }
    // المسار والقفز
    E.x += (LANES[E.lane] - E.x) * Math.min(1, dt * 11); k.position.x = E.x;
    if (E.y > 0 || E.vy > 0) { E.vy -= 24 * dt; E.y = Math.max(0, E.y + E.vy * dt); if (E.y === 0) E.vy = 0; }
    k.position.y = E.y;
    // الوضعيات
    restKid(k); E.ph += step * 1.3;
    if (E.state === 'finish' && E.finished && E.speed < .3) { E.cheer += dt; poseCheerKid(k, E.t); k.position.y = Math.abs(Math.sin(E.cheer * 5)) * .25; }
    else if (E.stumble > 0) poseStumbleKid(k, 1 - E.stumble / .9);
    else if (E.y > .02) poseJumpKid(k);
    else if (E.speed > .2) poseRunKid(k, E.ph, Math.min(1, E.speed / 8));
    k.rotation.z = (E.x - LANES[E.lane]) * .12;
    // العملات
    E.coins.forEach(c => {
      c.obj.position.set(c.x, c.y, zOf(c.d)); c.obj.rotation.y += dt * 3;
      if (!c.got && Math.abs(c.d - E.dist) < .8 && Math.abs(c.x - E.x) < .95 && Math.abs(c.y - (E.y + .9)) < 1) { c.got = true; c.obj.visible = false; E.onCoin && E.onCoin(1); sfx('coin'); }
    });
    E.coins = E.coins.filter(c => { if (c.d < E.dist - 12) { S.remove(c.obj); return false; } return true; });
    // العوائق
    E.obs.forEach(o => {
      o.obj.position.set(o.x, 0, zOf(o.d));
      if (!o.hit && E.state === 'run' && Math.abs(o.d - E.dist) < .7 && Math.abs(o.x - E.x) < 1.05 && E.y < .75) { o.hit = true; E.stumble = .9; E.hitLock = 1; sfx('bump'); E.onHit && E.onHit(); }
    });
    E.obs = E.obs.filter(o => { if (o.d < E.dist - 15) { S.remove(o.obj); return false; } return true; });
    // البوابات
    E.gates.forEach(g => {
      g.obj.position.z = zOf(g.d);
      g.obj.userData.curtains.forEach((c, i) => { c.material.opacity = .75 + Math.sin(E.t * 4 + i) * .2; });
      if (!g.passed && E.dist >= g.d) { g.passed = true; if (E.pending === g) E.pending = null; g.idx = gateIndex(g.n); E.onGate && E.onGate(g.idx, g); }
      if (g.fx) { g.fx.t += dt; const p = g.obj.userData.panels[g.fx.i]; if (p) { if (g.fx.ok) { p.material.emissiveIntensity = .35 + Math.max(0, 1 - g.fx.t) * 1.5; } else { p.position.x = g.fx.x0 + Math.sin(g.fx.t * 40) * .08 * Math.max(0, 1 - g.fx.t * 1.5); } } }
    });
    E.gates = E.gates.filter(g => { if (g.d < E.dist - 20) { S.remove(g.obj); return false; } return true; });
    // خط النهاية
    if (E.fort) { E.fort.position.z = zOf(E.fortD); if (!E.finished && E.dist >= E.fortD) { E.finished = true; E.state = 'finish'; E.camMode = 'orbit'; E.camT = 0; confetti(); sfx('cheer'); E.onFinish && E.onFinish(); } }
    // حركة السير وأصواتها
    let traffic = 0;
    E.vehicles.forEach(v => {
      const prevZ = v.obj.position.z;
      v.d += v.dir * v.v * dt; const rel = v.d - E.dist;
      if (v.dir > 0 && rel > 260) v.d = E.dist - 50 - Math.random() * 60;
      if (v.dir > 0 && rel < -80) v.d = E.dist + 180 + Math.random() * 80;
      if (v.dir < 0 && rel < -50) v.d = E.dist + 260 + Math.random() * 120;
      v.obj.position.set(v.x, 0, zOf(v.d));
      const spin = v.dir * v.v * dt / (v.obj.userData.wr || .33);
      if (v.kind === 'bike') { v.ph = (v.ph || 0) + v.v * dt * 2.2; pedal(v.obj, v.ph); }
      else v.obj.userData.wheels.forEach(w => w.rotation.x -= spin);
      const dz = v.obj.position.z - k.position.z, dx = v.x - E.x, dd = Math.hypot(dx, dz);
      if (v.kind !== 'bike') traffic += (v.kind === 'bus' ? 1.6 : 1) / (1 + (dd / 9) ** 2);
      // لحظة مرور السيارة بجانب العدّاء
      const side = dz > 0 ? 1 : -1;
      if (v.side && side !== v.side && Math.abs(dz) < 20 && E.state !== 'idle') {
        if (v.kind === 'bike') sfx('bell'); else { sfx('pass', { bus: v.kind === 'bus' }); if (v.taxi && Math.random() < .35) sfx('horn'); }
      }
      v.side = side;
    });
    E.onTraffic && E.onTraffic(Math.min(1, traffic));
    // البحر والسفن
    world.seaN.offset.x += dt * .01; world.seaN.offset.y += dt * .02;
    world.dhows.forEach((d, i) => { d.position.y = -1.1 + Math.sin(E.t * .8 + i) * .08; d.rotation.z = Math.sin(E.t * .6 + i * 2) * .03; });
    // القصاصات
    if (E.conf && E.conf.visible) { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1); E.confD.forEach((d, i) => { d.v.y -= 4 * dt; d.v.multiplyScalar(.99); d.p.addScaledVector(d.v, dt); d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; if (d.p.y < .02) d.p.y = .02; q.setFromEuler(d.r); m.compose(d.p, q, one); E.conf.setMatrixAt(i, m); }); E.conf.instanceMatrix.needsUpdate = true; }
    // الضوء والسماء يتبعان العدّاء
    sun.position.set(k.position.x + 30, 16, k.position.z - 50); sun.target.position.set(k.position.x, 0, k.position.z - 6);
    fill.position.set(k.position.x + 10, 8, k.position.z + 20); fill.target.position.copy(k.position);
    skyG.position.set(cam.position.x, 0, cam.position.z);
    updCam(dt);
  }
  // ---------- الكاميرا ----------
  const camLook = V(0, 1, 0);
  function updCam(dt) {
    const k = E.kid.position;
    let pos, look, f = 1 - Math.pow(.002, dt);
    if (E.camMode === 'intro') {
      E.camT += dt; const u = ease(Math.min(1, E.camT / E.camDur));
      const front = V(k.x - 1.4, 1.3, k.z - 4.2), behind = V(k.x * .6, 2.45, k.z + 4.5), mid = V(k.x - 5, 2.4, k.z);
      pos = u < .5 ? new THREE.Vector3().lerpVectors(front, mid, u * 2) : new THREE.Vector3().lerpVectors(mid, behind, (u - .5) * 2);
      look = new THREE.Vector3().lerpVectors(V(k.x, 1.05, k.z), V(k.x * .45, 1.15, k.z - 10), u); f = 1;
    } else if (E.camMode === 'orbit') {
      // خلف العدّاء والقلعة أمامه، ثم تلتف الكاميرا ببطء لترى وجهه
      E.camT += dt; const u = Math.max(0, Math.min(1, (E.camT - 2.2) / 3.5)), a = Math.PI / 2 - .55 - ease(u) * 1.75, r = 5.6 - u * 1.4;
      pos = V(k.x + Math.cos(a) * r, 2.5 - u * .9, k.z + Math.sin(a) * r);
      look = new THREE.Vector3().lerpVectors(V(k.x + 7, 5, k.z - 26), V(k.x, 1.1, k.z), ease(u)); f = 1 - Math.pow(.02, dt);
    } else {
      pos = V(E.x * .6, 2.45 + E.y * .35, k.z + 4.5); look = V(E.x * .45, 1.15, k.z - 10);
    }
    if (E.snap) { cam.position.copy(pos); camLook.copy(look); E.snap = false; }
    else { cam.position.lerp(pos, f); camLook.lerp(look, f); }
    cam.lookAt(camLook);
    const fov = E.fov0 + Math.min(1, E.boost) * 8; if (Math.abs(cam.fov - fov) > .05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }
  function sfx(n, a) { E.onSfx && E.onSfx(n, a); }

  // ---------- الحلقة ----------
  let last = performance.now(), raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!E.running) return;
    E.dt = dt || 1 / 60;
    update(dt);
    R.render(S, cam);
  }

  const api = {
    supported: true,
    setKid,
    reset(o) {
      clearDyn(); E.dist = 0; E.speed = 0; E.base = o.speed || 9; E.lane = 1; E.x = LANES[1]; E.y = 0; E.vy = 0; E.stumble = 0; E.boost = 0; E.cheer = 0; E.finished = false; E.state = 'idle'; E.pending = null;
      E.kid.position.set(LANES[1], 0, START_Z); E.camMode = 'behind'; E.snap = true; makeTraffic(); update(0);
    },
    start() { E.running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    stop() { E.running = false; cancelAnimationFrame(raf); raf = 0; },
    // مشهد البداية: الكاميرا أمام الشخصية ثم تلتف خلفها
    intro(dur) { E.camMode = 'intro'; E.camT = 0; E.camDur = dur || 3; },
    go() { E.state = 'run'; E.camMode = 'behind'; },
    freeRun, ask, addCoins, addObstacle,
    gateResult(g, ok) { g.fx = { t: 0, i: g.idx, ok, x0: g.obj.userData.panels[g.idx] ? g.obj.userData.panels[g.idx].position.x : 0 }; if (ok) { E.boost = 1.6; sfx('boost'); } else { E.stumble = .9; } const p = g.obj.userData.panels[g.idx]; if (p && ok) p.material.emissive.setHex(0x7dff9a); if (p && !ok) p.material.emissive.setHex(0xff6a6a); },
    finishAt(m) { E.fort = buildFort(); E.fort.traverse(o => { if (o.isMesh) o.castShadow = Q.shadow > 0; }); E.fortD = E.dist + m; S.add(E.fort); },
    // التحكم: dir = +1 نحو اليمين على الشاشة (المسار أ)، -1 نحو اليسار
    move(dir) { if (E.state !== 'run') return; const n = E.lane - dir; if (n >= 0 && n <= 3) { E.lane = n; sfx('swoosh'); } },
    lane(i) { E.lane = Math.max(0, Math.min(3, i)); },
    jump() { if (E.state !== 'run' || E.y > 0) return; E.vy = 8; E.y = .001; sfx('jump'); },
    gateDist() { return E.pending ? Math.max(0, E.pending.d - E.dist) : null; },
    snapshot() { return R.domElement.toDataURL('image/jpeg', .85); },
    debug: E, renderer: R
  };
  return api;
}
window.RunEngine = { supported, create, QUALITY };

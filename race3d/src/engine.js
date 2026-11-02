// محرك «سباق المعرفة 3D» — يُجمَّع بـ esbuild إلى ملف عادي يعمل دون إنترنت (window.RaceEngine)
import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { buildCar, canvasTex } from './car.js';
import { buildWorld } from './world.js';

const QUALITY = {
  high: { pr: 1.5, shadows: true, shadowSize: 2048, bloom: false, crowd: 1600, palms: 90 },
  medium: { pr: 1, shadows: true, shadowSize: 1024, bloom: false, crowd: 900, palms: 60 },
  low: { pr: .75, shadows: false, shadowSize: 512, bloom: false, crowd: 400, palms: 36 }
};
const V0 = 40;          // السرعة الأساسية (م/ث)
const BOOST = 32;       // التقدّم بعد الإجابة الصحيحة (م)
const SLIP = 9;         // التراجع بعد الخطأ (م)
const LANE = 3.4;

function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }

function create(container, opts) {
  const Q = QUALITY[opts.quality] || QUALITY.medium;
  const R = new THREE.WebGLRenderer({ antialias: Q.pr >= 1, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping;
  R.shadowMap.enabled = Q.shadows; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.domElement.className = 'rc-canvas'; container.appendChild(R.domElement);
  const S = new THREE.Scene();
  const W = buildWorld(R, S, Q);
  const cam = new THREE.PerspectiveCamera(50, 1, .1, 3000);
  let comp = null;
  if (Q.bloom) { comp = new EffectComposer(R); comp.addPass(new RenderPass(S, cam)); comp.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), .35, .5, .96)); comp.addPass(new OutputPass()); }
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; R.setSize(w, h, false); R.domElement.style.width = w + 'px'; R.domElement.style.height = h + 'px'; cam.aspect = w / h; cam.updateProjectionMatrix(); if (comp) { comp.setPixelRatio(R.getPixelRatio()); comp.setSize(w, h); } }
  resize(); window.addEventListener('resize', resize);

  // مؤثرات مشتركة
  const smokeT = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(120,120,125,.85)'); gr.addColorStop(1, 'rgba(120,120,125,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  const dustT = canvasTex(64, 64, (c) => { const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(230,205,165,.8)'); gr.addColorStop(1, 'rgba(230,205,165,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 64); });
  const puffs = []; // {spr, life, vel}
  function puff(pos, tex, size, life, vel, op) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: op })); s.position.copy(pos); s.scale.setScalar(size); S.add(s); puffs.push({ s, life, t: 0, vel, size, op }); }
  // قصاصات الاحتفال
  const confN = 500, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(.35, .2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), confN); conf.visible = false; conf.frustumCulled = false; S.add(conf);
  const confD = []; { const c = new THREE.Color(), cols = [0xe53950, 0xffd23f, 0x16a3a0, 0xffffff, 0x1a2a6c, 0xff7a1a]; for (let i = 0; i < confN; i++) { conf.setColorAt(i, c.setHex(cols[i % cols.length])); confD.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }); } }

  const E = { cars: [], base: 0, active: 0, mult: 1, running: false, phase: 'idle', camT: 0, finish: null, fovKick: 0, t: 0 };
  async function setTeams(teams) {
    E.cars.forEach(c => { S.remove(c.obj); });
    E.cars = [];
    for (let i = 0; i < teams.length; i++) {
      const T = teams[i];
      const obj = await buildCar({ main: T.main, accent: T.accent, num: String(i + 1), driver: T.img, env: W.env, view: 'back', sponsor: 'التحضير الذكي' });
      obj.traverse(o => { if (o.isMesh) o.castShadow = Q.shadows && o.castShadow; });
      obj.scale.setScalar(1.25); S.add(obj);
      // اللهب
      const fl = new THREE.Group(); obj.add(fl); fl.visible = false;
      [[1.9, .2, 0xff5a1a, .6], [1.3, .14, 0xffb02e, .75], [.8, .08, 0xffffff, .95]].forEach(([len, r, c, o]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, len, 16, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); f.rotation.x = -Math.PI / 2; f.position.set(0, .45, -2.5 - len / 2); fl.add(f); });
      const glow = new THREE.PointLight(0xff8a1f, 0, 14, 2); glow.position.set(0, .6, -3.4); obj.add(glow);
      E.cars.push({ obj, fl, glow, lane: i ? LANE : -LANE, off: 0, anim: null, wob: 0, speed: V0 });
    }
    reset();
  }
  function reset() {
    clearInterval(E.cdIv); E.base = W.tFinish * W.LEN - 22; E.mult = 0; E.phase = 'grid'; E.finish = null; E.fovKick = 0; conf.visible = false;
    E.cars.forEach(c => { c.off = 0; c.anim = null; c.wob = 0; c.fl.visible = false; c.glow.intensity = 0; });
    W.startLights.forEach(l => l.material.emissiveIntensity = 0);
    place(0); snapCam();
  }
  const sPos = (c) => E.base + c.off;
  function place(dt) {
    E.cars.forEach((c, i) => {
      const s = sPos(c), t = s / W.LEN, f = W.frame(t), p = f.p.clone().addScaledVector(f.n, c.lane + Math.sin(c.wob * 9) * .25 * Math.min(1, c.wob));
      c.obj.position.copy(p); c.obj.rotation.y = f.ang + Math.sin(c.wob * 13) * .18 * Math.min(1, c.wob);
      c.obj.userData.wheels.forEach(w => w.rotation.x += c.speed * dt / .45);
    });
  }
  function camTarget(i) {
    const c = E.cars[i], s = sPos(c), f = W.frame(s / W.LEN), f2 = W.frame((s + 16) / W.LEN);
    const pos = f.p.clone().addScaledVector(f.tg, -9.8).addScaledVector(f.n, c.lane * .6); pos.y = 3.5;
    const look = f2.p.clone().addScaledVector(f2.n, c.lane * .55); look.y = -.5;
    return { pos, look };
  }
  const camLook = new THREE.Vector3();
  function snapCam() { if (!E.cars.length) return; const T = camTarget(E.active); cam.position.copy(T.pos); camLook.copy(T.look); cam.lookAt(camLook); }

  function easeIO(x) { return x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2; }
  let last = performance.now(), raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.2, (now - last) / 1000); last = now; E.t += dt;
    if (!E.running) return;
    // الحركة الأساسية
    if (E.phase === 'race' || E.phase === 'final') E.mult = Math.min(E.phase === 'final' ? 1.6 : 1, E.mult + dt * .8);
    if (E.phase === 'stop') E.mult = Math.max(0, E.mult - dt * .9);
    const vb = V0 * E.mult; E.base += vb * dt;
    E.cars.forEach((c, i) => {
      let extra = 0;
      if (c.anim) { c.anim.t += dt; const k = Math.min(1, c.anim.t / c.anim.d), o = c.anim.from + (c.anim.to - c.anim.from) * easeIO(k); extra = (o - c.off) / Math.max(dt, 1e-4); c.off = o; if (k >= 1) { const a = c.anim; c.anim = null; a.done && a.done(); } }
      c.speed = vb + extra;
      if (c.wob > 0) { c.wob = Math.max(0, c.wob - dt * .7); if (Math.random() < .5) puff(c.obj.localToWorld(new THREE.Vector3((Math.random() - .5) * .6, .9, -2.4)), smokeT, 1.2, 1.4, new THREE.Vector3(0, 1.4, 0), .7); }
      if (c.fl.visible) { c.fl.scale.set(1, 1, .8 + Math.random() * .45); c.glow.intensity = 8 + Math.random() * 4; if (Math.random() < .4) puff(c.obj.localToWorld(new THREE.Vector3((Math.random() < .5 ? -1 : 1) * .8, .3, -2.2)), dustT, 1.5, .9, new THREE.Vector3(0, .5, 0), .35); }
    });
    place(dt);
    // الدخان والغبار
    for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.t += dt; const k = p.t / p.life; p.s.position.addScaledVector(p.vel, dt); p.s.scale.setScalar(p.size * (1 + k * 2)); p.s.material.opacity = p.op * (1 - k); if (k >= 1) { S.remove(p.s); p.s.material.dispose(); puffs.splice(i, 1); } }
    // الاحتفال
    if (conf.visible) { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1); confD.forEach((d, i) => { d.v.y -= 6 * dt; d.v.multiplyScalar(.99); d.p.addScaledVector(d.v, dt); d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; if (d.p.y < 0) d.p.y = 0; q.setFromEuler(d.r); m.compose(d.p, q, one); conf.setMatrixAt(i, m); }); conf.instanceMatrix.needsUpdate = true; }
    // النهاية: إيقاف الفائز بعد عبور خط النهاية
    if (E.phase === 'final' && E.finish) { const c = E.cars[E.finish.win]; if (sPos(c) >= E.finish.line) { E.phase = 'stop'; celebrate(c); setTimeout(() => E.finish && E.finish.cb && E.finish.cb(), 2600); } }
    // الكاميرا
    const T = camTarget(E.active), k = 1 - Math.pow(.02, dt);
    if (E.camT > 0 && E.prev != null && E.prev !== E.active) { const F = camTarget(E.prev), b = easeIO(1 - E.camT / 1.2); F.pos.lerp(T.pos, b); F.look.lerp(T.look, b); T.pos = F.pos; T.look = F.look; }
    if (E.phase !== 'stop' || E.mult >= .3) { cam.position.copy(T.pos); camLook.copy(T.look); }
    E.camT = Math.max(0, E.camT - dt);
    if (E.phase === 'stop' && E.mult < .3) { const c = E.cars[E.active], ang = E.t * .35, cp = c.obj.position; cam.position.lerp(new THREE.Vector3(cp.x + Math.cos(ang) * 9, 3.2, cp.z + Math.sin(ang) * 9), k * .5); camLook.lerp(cp.clone().setY(1), k); }
    cam.lookAt(camLook);
    const fov = 50 + E.fovKick * 12; if (Math.abs(cam.fov - fov) > .05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
    E.fovKick = Math.max(0, E.fovKick - dt * .5);
    W.sun.position.copy(camLook).add(new THREE.Vector3(-50, 70, 35)); W.sun.target.position.copy(camLook);
    if (comp) comp.render(); else R.render(S, cam);
  }
  function celebrate(c) {
    conf.visible = true; const o = c.obj.position;
    confD.forEach(d => { d.p.set(o.x + (Math.random() - .5) * 6, 8 + Math.random() * 6, o.z + (Math.random() - .5) * 6); d.v.set((Math.random() - .5) * 8, Math.random() * 6, (Math.random() - .5) * 8); d.w.set(Math.random() * 8, Math.random() * 8, 0); });
  }
  const api = {
    supported: true,
    setTeams, reset,
    start() { E.running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    stop() { E.running = false; cancelAnimationFrame(raf); raf = 0; },
    // عدّ تنازلي بأضواء الانطلاق ثم الانطلاق
    countdown(onTick, done) {
      let n = 0; W.startLights.forEach(l => { l.material.emissive.setHex(0xff2020); l.material.emissiveIntensity = 0; });
      clearInterval(E.cdIv); const iv = E.cdIv = setInterval(() => {
        if (n < 5) { W.startLights[n].material.emissiveIntensity = 4; onTick && onTick(5 - n); n++; return; }
        clearInterval(iv); W.startLights.forEach(l => { l.material.emissive.setHex(0x22ff55); l.material.emissiveIntensity = 4; });
        E.phase = 'race'; onTick && onTick(0); done && done();
        setTimeout(() => W.startLights.forEach(l => l.material.emissiveIntensity = 0), 2500);
      }, 650);
    },
    focus(i) { if (E.active !== i) { E.prev = E.active; E.active = i; E.camT = 1.2; } },
    nitro(i, done) { const c = E.cars[i]; c.fl.visible = true; E.fovKick = E.active === i ? 1 : E.fovKick; c.anim = { t: 0, d: 2.4, from: c.off, to: c.off + BOOST, done: () => { c.fl.visible = false; c.glow.intensity = 0; done && done(); } }; },
    slip(i, done) { const c = E.cars[i]; c.wob = 1.6; c.anim = { t: 0, d: 1.6, from: c.off, to: c.off - SLIP, done }; },
    // ينهي السباق: يتأكد أن الفائز متقدّم، ثم يعبر خط النهاية التالي
    finish(win, cb) {
      const c = E.cars[win], o = E.cars[1 - win];
      if (o && c.off < o.off + 12) c.anim = { t: 0, d: 1.6, from: c.off, to: o.off + 14 };
      if (E.active !== win) { E.prev = E.active; E.active = win; E.camT = 1.2; }
      const lineS = W.tFinish * W.LEN; let line = Math.ceil((sPos(c) + 60 - lineS) / W.LEN) * W.LEN + lineS;
      if (line - sPos(c) > W.LEN * .55) line -= W.LEN; if (line < sPos(c) + 60) line += W.LEN;
      E.finish = { win, cb, line }; E.phase = 'final'; c.fl.visible = true;
    },
    speedKmh() { const c = E.cars[E.active]; return c ? Math.round(c.speed * 3.6 * 1.4) : 0; },
    gap() { return E.cars.length > 1 ? E.cars[0].off - E.cars[1].off : 0; },
    board(lines) { const B = W.bigScreen; if (!B) return; const c = B.cv.getContext('2d'); c.fillStyle = '#0b0e1a'; c.fillRect(0, 0, 1024, 512); c.fillStyle = '#ffd23f'; c.font = '80px Taj, Tahoma, sans-serif'; c.textAlign = 'center'; c.direction = 'rtl'; c.fillText('ترتيب السباق', 512, 100); lines.forEach((L, i) => { c.fillStyle = L.color; c.fillRect(100, 160 + i * 160, 824, 128); c.fillStyle = '#fff'; c.font = '64px Taj, Tahoma, sans-serif'; c.fillText(L.text, 512, 245 + i * 160); }); B.tex.needsUpdate = true; },
    snapshot() { return R.domElement.toDataURL('image/jpeg', .85); },
    debug: E, renderer: R
  };
  return api;
}
window.RaceEngine = { supported, create, QUALITY };

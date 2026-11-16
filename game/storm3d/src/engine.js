// محرك «سباق العاصفة 3D» — يُجمَّع بـ esbuild إلى ملف عادي يعمل دون إنترنت (window.StormEngine)
import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from './vendor/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from './vendor/jsm/postprocessing/ShaderPass.js';
import { HueSaturationShader } from './vendor/jsm/shaders/HueSaturationShader.js';
import { VignetteShader } from './vendor/jsm/shaders/VignetteShader.js';
import { buildSky } from './sky.js';
import { makeDesert, buildTerrain, buildScenery, buildCamp, animCamp, buildStorm, animStorm, buildCloudM } from './desert.js';
import { buildVehicle, animVehicle } from './vehicle.js';
import { buildRamp, buildKicker, rampY, RAMP_LEN, RAMP_H, dateGeo, dateMat, buildCamel, buildOryx, animWalk, buildDevil, animDevil, makeSpray } from './items.js';
import { LETTERS, RCOLS, starGeo, starMat, sparkles } from './props.js';
import { buildKid, restKid, poseCheerKid } from './kid.js';
import { rnd } from './util.js';

const QUALITY = {
  high: { pr: 1.25, shadow: 2048, post: 'full', dens: 1 },
  medium: { pr: 1, shadow: 1024, post: 'grade', dens: .8 },
  low: { pr: .75, shadow: 0, low: true, post: 'none', dens: .5 }
};
// [تقدّم الرحلة، لوحة السماء، ارتفاع الشمس، اتجاهها] — من الظهيرة إلى الغروب، والشمس أمام السائق
const TIMES = [[0, 'noon', 58, 118], [.5, 'afternoon', 34, 150], [1, 'sunset', 8, 166]];
function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const G = 17;

function create(container, opts) {
  const Q = QUALITY[opts.quality] || QUALITY.medium;
  const R = new THREE.WebGLRenderer({ antialias: Q.post !== 'full' && Q.pr >= 1, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NeutralToneMapping;
  R.shadowMap.enabled = Q.shadow > 0; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.domElement.className = 'sr-canvas'; container.appendChild(R.domElement);
  const S = new THREE.Scene();
  const sky = buildSky(S), sunDir = V(.3, .3, 1).normalize();
  S.fog = new THREE.FogExp2(0xffe0b0, .0013);
  const hemi = new THREE.HemisphereLight(0xb8e8ff, 0xffc890, 1.1); S.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.9); S.add(sun, sun.target);
  if (Q.shadow) { sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 900 }); sun.shadow.bias = -.0004; sun.shadow.normalBias = .05; }
  const rim = new THREE.DirectionalLight(0xffffff, .7); S.add(rim, rim.target);
  const cam = new THREE.PerspectiveCamera(60, 1, .3, 30000);
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
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; R.setSize(w, h, false); R.domElement.style.width = w + 'px'; R.domElement.style.height = h + 'px'; cam.aspect = w / h; E.fov0 = w / h < 1.1 ? 78 : 60; cam.fov = E.fov0; cam.updateProjectionMatrix(); if (comp) comp.setSize(w, h); else if (Q.post !== 'none') makeComposer(w, h); }

  const E = {
    t: 0, dt: 1 / 60, ts: 1, running: false, state: 'idle', L: 0, geo: null, car: null, kind: 'jeep', kid: 'boy',
    pos: V(0, 0, 0), off: 0, vx: 0, input: 0, speed: 0, base: 38, boost: 0, shake: 0, fov0: 60, pitch: 0, prevSup: 0,
    air: false, vyv: 0, bog: 0, brake: 0, spin: 0, slowT: 0, trick: null, ramp: null, gap: 70, gapS: 70,
    gates: [], stars: [], dates: [], obs: [], camMode: 'chase', camT: 0, back: false, auto: null, pending: null, arrived: false
  };
  E.scene = S; E.cam = cam;
  window.addEventListener('resize', resize); resize();
  const camLook = V(0, 0, 0);
  const spray = makeSpray(S, Q.low ? 180 : 360);
  // خيوط الرمل التي تسبق العاصفة
  const wind = (() => { const n = Q.low ? 90 : 200, pos = new Float32Array(n * 3), g = new THREE.BufferGeometry(); for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - .5) * 60; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - .5) * 80; } g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); const p = new THREE.Points(g, new THREE.PointsMaterial({ size: .7, map: spray.pts.material.map, color: 0xf2c88a, transparent: true, opacity: 0, depthWrite: false })); p.frustumCulled = false; S.add(p); return { p, pos, n, g }; })();
  const storm = buildStorm(Q); S.add(storm);
  const stormCol = new THREE.Color(0xc88a4c), tmpC = new THREE.Color();

  // ---------- العالم ----------
  let worldGroup = null;
  function buildWorld(L) {
    if (E.L === L && worldGroup) return;
    if (worldGroup) { S.remove(worldGroup); worldGroup.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    worldGroup = new THREE.Group(); S.add(worldGroup);
    const geo = makeDesert(L); E.geo = geo; E.L = L;
    buildTerrain(worldGroup, Q, geo); buildScenery(worldGroup, Q, geo); E.camp = buildCamp(worldGroup, Q, geo);
    const r = rnd(77);
    for (let i = 0; i < Math.round(L / 420 * Q.dens); i++) { const z = 200 - r() * (L + 900), c = buildCloudM(r, 1.5 + r() * 1.8); c.position.set((r() - .5) * 1400, 190 + r() * 150, z); worldGroup.add(c); }
    // جِمال ترعى بعيدًا عن المسار
    E.amb = [];
    for (let i = 0; i < Math.round(L / 800); i++) { const z = -300 - r() * (L - 700), s = r() < .5 ? -1 : 1, x = geo.corridorX(z) + s * (30 + r() * 26), c = buildCamel(); c.position.set(x, geo.heightAt(x, z), z); c.rotation.y = r() * 6.28; worldGroup.add(c); geo.addCull(c, z - 5, z + 5); }
  }
  function setVehicle(kind, kid) {
    if (E.car) S.remove(E.car);
    E.kind = kind; E.kid = kid; E.car = buildVehicle(kind, kid);
    E.car.traverse(o => { if (o.isMesh && !o.userData.isOut) o.castShadow = Q.shadow > 0; });
    S.add(E.car);
    // مستقبِلون في المخيم: الشخصيتان الأخريان
    if (E.greet) E.greet.forEach(k => k.parent && k.parent.remove(k));
    E.greet = ['boy', 'girl', 'girl2'].filter(k => k !== kid).map((k, i) => { const K = buildKid(k); K.scale.setScalar(1.5); K.position.set(i ? 7 : -5.5, .05, i ? 1 : 3); K.rotation.y = i ? -.5 : .5; E.camp.add(K); K.traverse(o => { if (o.isMesh && !o.userData.isOut) o.castShadow = Q.shadow > 0; }); return K; });
  }
  function clearDyn() { [...E.gates, ...E.stars, ...E.dates, ...E.obs].forEach(o => o.obj.parent && o.obj.parent.remove(o.obj)); E.gates = []; E.stars = []; E.dates = []; E.obs = []; E.pending = null; E.ramp = null; }

  // ---------- عناصر المسار ----------
  const sg = starGeo(), sm = starMat(), dg = dateGeo(), dm = dateMat();
  const zAhead = d => E.pos.z - d;
  const gy = (x, z) => E.geo.heightAt(x, z);
  function addRow(d0, n, ox, wave, kind) {
    for (let i = 0; i < n; i++) {
      const z = zAhead(d0 + i * 7), x = E.geo.corridorX(z) + clamp(ox + Math.sin(i * .8) * (wave || 0), -13, 13), m = new THREE.Mesh(kind === 'date' ? dg : sg, kind === 'date' ? dm : sm);
      m.scale.setScalar(kind === 'date' ? 1.15 : .85); m.castShadow = Q.shadow > 0; m.position.set(x, gy(x, z) + 1.5, z); S.add(m); (kind === 'date' ? E.dates : E.stars).push({ obj: m, got: false, kind });
    }
  }
  function addArc(d0, ox) { for (let i = 0; i < 6; i++) { const z = zAhead(d0 + 6 + i * 6.5), x = E.geo.corridorX(z) + ox, m = new THREE.Mesh(sg, sm); m.scale.setScalar(.85); m.position.set(x, gy(x, z) + 2 + Math.sin((i + .5) / 6 * Math.PI) * 3.6, z); S.add(m); E.stars.push({ obj: m, got: false }); } }
  function freeRun(d0, d1) {
    const r = Math.random; let d = d0 + 14;
    while (d < d1 - 30) {
      const k = r(), z = zAhead(d), cx = E.geo.corridorX(z);
      if (k < .3) addRow(d, 7, (r() - .5) * 20, 3, 'star');
      else if (k < .5) addRow(d, 6, (r() - .5) * 22, 2, 'date');
      else if (k < .64) { const s = r() < .5 ? -1 : 1, c = buildCamel(); c.position.set(cx + s * 19, 0, z); c.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; S.add(c); E.obs.push({ obj: c, kind: 'camel', r: 2.5, vx: -s * 3.2, hit: false }); addRow(d + 16, 4, s * 9, 0, 'date'); }
      else if (k < .76) { const s = r() < .5 ? -1 : 1, g = new THREE.Group(); for (let i = 0; i < 3; i++) { const o = buildOryx(); o.position.set(-s * i * 2.6, 0, (i % 2) * 2.2); g.add(o); } g.position.set(cx + s * 24, 0, z); g.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; S.add(g); E.obs.push({ obj: g, kind: 'oryx', r: 2.2, vx: -s * 7, hit: false, herd: true }); }
      else if (k < .9) { const dv = buildDevil(), ox = (r() - .5) * 20; dv.position.set(cx + ox, 0, z); S.add(dv); E.obs.push({ obj: dv, kind: 'devil', r: 2.7, ox, ph: r() * 6, hit: false }); addRow(d + 14, 4, -ox * .6, 0, 'star'); }
      else { const kk = buildKicker(34); kk.position.set(cx, gy(cx, z + 7) - .05, z); kk.rotation.y = E.geo.heading(z); S.add(kk); E.obs.push({ obj: kk, kind: 'kick', z, hit: false }); addArc(d, (r() - .5) * 16); }
      d += 46 + r() * 44;
    }
  }
  // منحدرات الخيارات: حافة القفز على بُعد D + طول المنحدر؛ texts بترتيب المنحدرات (أ في اليمين)
  function ask(texts, D) {
    const z = zAhead(D + RAMP_LEN), cx = E.geo.corridorX(z), g = new THREE.Group(); g.position.set(cx, gy(cx, z + RAMP_LEN) - .05, z); g.rotation.y = E.geo.heading(z); S.add(g);
    const n = texts.length, w = n === 2 ? 9 : n === 3 ? 7.4 : 6.2, gapW = n === 2 ? 3 : 1.5, tot = n * w + (n - 1) * gapW, rings = [];
    texts.forEach((t, i) => {
      const rp = buildRamp(n === 2 ? (i ? '✗' : '✓') : LETTERS[i], t, RCOLS[i], w);
      rp.position.set(tot / 2 - w / 2 - i * (w + gapW), 0, 0); g.add(rp); rings.push(rp);
    });
    // إزالة ما يقع على المنحدرات من عناصر
    [E.stars, E.dates, E.obs].forEach(list => list.forEach(o => { const oz = o.z !== undefined ? o.z : o.obj.position.z; if (oz < z + 75 && oz > z - 90 && o.obj.parent) { o.obj.parent.remove(o.obj); o.dead = true; } }));
    const gate = { obj: g, z, n, rings, passed: false, D, len: RAMP_LEN };
    E.gates.push(gate); E.pending = gate;
    return gate;
  }

  // ---------- التحديث ----------
  function timeOfDay(p) {
    p = clamp(p, 0, 1); let i = 0; while (i < TIMES.length - 2 && p > TIMES[i + 1][0]) i++;
    const A = TIMES[i], B = TIMES[i + 1], t = clamp((p - A[0]) / (B[0] - A[0]), 0, 1);
    const el = THREE.MathUtils.degToRad(A[2] + (B[2] - A[2]) * t), az = THREE.MathUtils.degToRad(A[3] + (B[3] - A[3]) * t);
    sunDir.setFromSphericalCoords(1, Math.PI / 2 - el, az);
    const P = sky.blend(A[1], B[1], t, sunDir), k = clamp(1 - E.gapS / 100, 0, 1);
    hemi.color.setHex(P.hemi[0]); hemi.groundColor.setHex(P.hemi[1]); sun.color.setHex(P.light);
    tmpC.setHex(P.fog).lerp(new THREE.Color(0xffd9a0), .5).lerp(stormCol, k * .75); S.fog.color.copy(tmpC); S.fog.density = .0013 + k * k * .0075;
  }
  const fwd = V(0, 0, -1), right = V(1, 0, 0), tmp = V(0, 0, 0);
  function basis(z) { const h = E.geo.heading(z); fwd.set(-Math.sin(h), 0, -Math.cos(h)); right.set(Math.cos(h), 0, -Math.sin(h)); return h; }
  function burst(n, up) { tmp.copy(E.pos); spray.emit(tmp, V(0, up || 6, 0), 2.6, n); }
  function update(rdt) {
    const car = E.car; if (!car || !E.geo) return;
    // الحركة البطيئة
    if (E.slowT > 0) E.slowT -= rdt;
    E.ts += ((E.slowT > 0 ? .27 : 1) - E.ts) * Math.min(1, rdt * 9);
    const dt = rdt * E.ts; E.t += dt;
    const geo = E.geo, driving = E.state === 'drive' || E.state === 'cruise';
    let steer = 0;
    if (driving) {
      const lim = geo.halfW(E.pos.z) - 2.6;
      if (E.ramp && !E.air) { E.vx = 0; E.off += (E.ramp.off - E.off) * Math.min(1, dt * 9); }
      else { const ctl = E.air ? .35 : E.bog > 0 ? .4 : 1; E.vx += (E.input * 15 * ctl - E.vx) * Math.min(1, dt * 5.5); E.off = clamp(E.off + E.vx * dt, -lim, lim); if (Math.abs(E.off) >= lim) E.vx *= .4; }
      steer = E.vx / 15;
      const target = E.base * (1 + .4 * Math.min(1, E.boost)) * (E.bog > 0 ? .26 : 1) * (E.brake > 0 ? .5 : 1);
      E.speed += (target - E.speed) * Math.min(1, dt * (E.bog > 0 || E.brake > 0 ? 5 : 1.7));
      E.pos.z -= E.speed * dt; E.pos.x = geo.corridorX(E.pos.z) + E.off;
      if (E.bog > 0) { E.bog -= dt; if (E.bog <= 0 && E.camMode === 'bog') E.camMode = 'chase'; }
      if (E.brake > 0) E.brake -= dt;
      // المنحدرات
      const g = E.pending;
      if (g && !g.passed && E.pos.z <= g.z + g.len) {
        g.passed = true; E.pending = null;
        let best = 0, bd = 1e9; g.rings.forEach((r, i) => { const w = r.getWorldPosition(V(0, 0, 0)), d = Math.abs(w.x - E.pos.x); if (d < bd) { bd = d; best = i; } });
        g.idx = best; const wp = g.rings[best].getWorldPosition(V(0, 0, 0)); E.ramp = { g, y0: g.obj.position.y, off: wp.x - geo.corridorX(g.z + g.len / 2), ok: null };
        E.onGate && E.onGate(best, g);
      }
    } else if (E.state === 'intro') { E.pos.x = geo.corridorX(E.pos.z) + E.off; }
    else if (E.auto) steer = E.auto(dt) || 0;
    // الارتفاع: أرض، منحدر، قفز
    let sup = gy(E.pos.x, E.pos.z);
    if (E.ramp && !E.ramp.left) {
      const zl = E.pos.z - E.ramp.g.z;
      if (zl > 0) sup = Math.max(sup, E.ramp.y0 + rampY(zl));
      else { // الانطلاق من الحافة
        const ok = E.ramp.ok !== false; E.ramp.left = true; E.launchOk = ok; if (E.ramp.g.fx) E.ramp.g.fx.go = true;
        if (!E.air) { E.air = true; E.pos.y = Math.max(sup, E.ramp.y0 + RAMP_H); }
        E.vyv = ok ? 10.5 : 4.2;
        if (ok) { E.jumpDelay = .28; E.trick = { t: 0, dur: 1.5 }; E.speed = E.base * 1.3; sfx('jump'); } else sfx('crack');
        burst(18, 5);
      }
    }
    if (driving) E.obs.forEach(o => { if (o.kind === 'kick' && !o.hit && E.pos.z <= o.z + 7) { const zl = E.pos.z - o.z; if (zl > 0) { if (!E.air) sup = Math.max(sup, o.obj.position.y + rampY(zl, 7, 1.25)); } else { o.hit = true; if (!E.air) { E.air = true; E.vyv = 6.6; E.pos.y = sup + 1.2; E.launchOk = null; sfx('hop'); burst(10, 4); } } } });
    if (E.air && E.jumpDelay > 0) { E.jumpDelay -= dt; if (E.jumpDelay <= 0) { E.slowT = 1.35; if (!E.back) { E.camMode = 'jump'; E.camT = 0; } } }
    if (E.air) {
      E.vyv -= G * dt; E.pos.y += E.vyv * dt;
      if (E.pos.y <= sup) {
        E.pos.y = sup; E.air = false; E.trick = null; E.shake = Math.max(E.shake, .7); burst(Q.low ? 30 : 60, 7); sfx('land');
        if (E.ramp && E.ramp.left) {
          if (E.launchOk === false) { E.bog = 1.8; E.camMode = 'bog'; E.camT = 0; sfx('bog'); } else { E.boost = 1.8; if (E.camMode === 'jump') E.camMode = 'chase'; }
          E.ramp = null;
        }
      }
    } else E.pos.y = sup;
    // اتجاه المركبة
    const h = basis(E.pos.z), adv = Math.max(.02, E.speed * dt);
    const tp = E.air ? clamp(E.vyv * .035, -.42, .42) : clamp(Math.atan((sup - E.prevSup) / adv), -.6, .6);
    E.pitch += (tp - E.pitch) * Math.min(1, rdt * (E.air ? 5 : 12)); E.prevSup = sup;
    if (!E.auto || driving) {
      let yaw = h - steer * .22;
      if (E.trick) { E.trick.t += dt; yaw += ease(clamp(E.trick.t / E.trick.dur, 0, 1)) * Math.PI * 2; }
      if (E.spin > 0) { E.spin -= dt; yaw += (1 - ease(clamp(E.spin / 1.1, 0, 1))) * Math.PI * 2; }
      car.rotation.set(E.pitch + (E.bog > 0 ? -.1 : 0), yaw, E.air ? Math.sin(E.t * 3) * .06 : -steer * .05);
    }
    E.boost = Math.max(0, E.boost - dt * .6); E.shake = Math.max(0, E.shake - rdt * 1.6);
    car.position.copy(E.pos);
    const wheelSp = E.bog > 0 ? E.base * 1.6 : E.speed;
    animVehicle(car, E.t, dt, wheelSp, steer, E.air);
    // رذاذ الرمل
    if (!E.air && wheelSp > 4 && E.state !== 'idle') {
      const n = E.bog > 0 ? 5 : E.boost > .3 ? 3 : 1;
      car.updateMatrixWorld(); car.userData.rear.forEach(rp => { tmp.copy(rp).applyMatrix4(car.matrixWorld); spray.emit(tmp, V(-fwd.x * wheelSp * .25, 3.2 + wheelSp * .05, -fwd.z * wheelSp * .25), .5, n); });
    }
    car.updateMatrixWorld();
    spray.update(dt);
    // المنحدرات: تأثير النتيجة
    E.gates.forEach(g => { if (g.fx && !g.fx.ok && g.fx.go) { const r = g.rings[g.fx.i]; if (r) { const u = r.userData; u.body.position.y = Math.max(-3, u.body.position.y - dt * 7); u.body.rotation.x = Math.min(.25, u.body.rotation.x + dt * .5); u.panel.rotation.z = Math.min(.5, u.panel.rotation.z + dt * 1.2); } } });
    E.gates = E.gates.filter(g => { if (g.z > E.pos.z + 90) { S.remove(g.obj); return false; } return true; });
    // النجوم والتمور
    const collect = (list, cb) => { list.forEach(s => { if (s.dead) return; s.obj.rotation.y += dt * 3; if (!s.got && driving && Math.abs(s.obj.position.z - E.pos.z) < 2.6 && Math.abs(s.obj.position.x - E.pos.x) < 2.3 && Math.abs(s.obj.position.y - E.pos.y - 1.2) < 3.2) { s.got = true; s.pop = 0; cb(); } if (s.got) { s.pop += dt; s.obj.scale.setScalar(1 + Math.min(.3, s.pop) * 5); s.obj.position.y += dt * 6; s.obj.visible = s.pop < .25; } }); };
    collect(E.stars, () => { E.onStar && E.onStar(); sfx('star'); }); collect(E.dates, () => { E.onDate && E.onDate(); sfx('date'); });
    const keep = s => { if (s.dead) return false; if (s.obj.position.z > E.pos.z + 30) { S.remove(s.obj); return false; } return true; };
    E.stars = E.stars.filter(keep); E.dates = E.dates.filter(keep);
    // العوائق
    E.obs.forEach(o => {
      if (o.dead || o.kind === 'kick') return; const p = o.obj.position;
      if (o.kind === 'camel' || o.kind === 'oryx') { if (Math.abs(p.z - E.pos.z) < 260) { p.x += o.vx * dt; (o.herd ? o.obj.children : [o.obj]).forEach(a => animWalk(a, E.t, o.kind === 'oryx' ? 12 : 6)); } p.y = gy(p.x, p.z); }
      else if (o.kind === 'devil') { p.x = geo.corridorX(p.z) + o.ox + Math.sin(E.t * .9 + o.ph) * 5; p.y = gy(p.x, p.z); animDevil(o.obj, E.t); }
      if (!o.hit && driving && !E.air && Math.abs(p.z - E.pos.z) < o.r + 1 && Math.abs(p.x - E.pos.x) < o.r + (o.herd ? 3 : 0)) {
        o.hit = true; E.shake = 1; if (o.kind === 'devil') { E.spin = 1.1; burst(40, 8); } else { E.brake = 1; o.vx *= 2.2; }
        E.onHit && E.onHit(o.kind); sfx(o.kind === 'devil' ? 'devil' : 'animal');
      }
    });
    E.obs = E.obs.filter(o => { if (o.dead) return false; const oz = o.z !== undefined ? o.z : o.obj.position.z; if (oz > E.pos.z + 50) { S.remove(o.obj); return false; } return true; });
    // العاصفة
    E.gapS += (E.gap - E.gapS) * Math.min(1, rdt * (E.state === 'swallow' ? 2.2 : 1.4));
    const zs = E.pos.z + 34 + E.gapS * 2.3; storm.position.set(geo.corridorX(zs), gy(geo.corridorX(zs), zs) - 6, zs);
    animStorm(storm, E.t, dt); if (storm.userData.thunder) { storm.userData.thunder = false; if (E.gapS < 60) sfx('thunder'); }
    const wk = clamp(1 - E.gapS / 60, 0, 1); wind.p.material.opacity = wk * .9;
    if (wk > 0) { const a = wind.pos; for (let i = 0; i < wind.n; i++) { a[i * 3 + 2] -= (70 + (i % 7) * 9) * rdt; a[i * 3] += Math.sin(E.t * 3 + i) * rdt * 3; if (a[i * 3 + 2] < -50) a[i * 3 + 2] += 80; } wind.g.attributes.position.needsUpdate = true; wind.p.position.set(E.pos.x, E.pos.y, E.pos.z); }
    // إخفاء ما هو بعيد
    for (const c of geo.cull) c.o.visible = c.zmax > E.pos.z - 1500 && c.zmin < E.pos.z + 260;
    // المخيم
    if (E.camp.visible) animCamp(E.camp, E.t);
    if (E.greet) E.greet.forEach((K, i) => { if (-E.pos.z > E.L - 520) { poseCheerKid(K, E.t + i); K.position.y = .05 + Math.abs(Math.sin(E.t * 6 + i * 1.3)) * .35; } });
    if (E.arrived && car.userData.kid) { const ku = car.userData.kid.userData, w = Math.sin(E.t * 8) * .15; ku.armL.sh.rotation.set(0, 0, 2.6 + w); ku.armR.sh.rotation.set(0, 0, -2.6 - w); }
    timeOfDay(-E.pos.z / E.L);
    sun.position.copy(E.pos).addScaledVector(sunDir, 400); sun.target.position.copy(E.pos);
    rim.position.copy(E.pos).add(V(60, 80, 120)); rim.target.position.copy(E.pos);
    updCam(rdt);
  }
  // ---------- الكاميرا ----------
  function updCam(dt) {
    const p = E.pos; let pos, look, f = 1 - Math.pow(.002, dt);
    const at = (a, b, c) => V(p.x + fwd.x * a + right.x * b, p.y + c, p.z + fwd.z * a + right.z * b);
    if (E.camMode === 'intro') {
      E.camT += dt; const u = ease(Math.min(1, E.camT / E.camDur)), a = u * Math.PI, r = 11 - u * 1.5;
      pos = at(Math.cos(a) * r, Math.sin(a) * r * .8, 3 + Math.sin(a) * 1.2 + u); look = at(-34, 0, 9).lerp(at(16, 0, 1.2), ease(clamp(u * 1.5 - .5, 0, 1))); f = 1;
      if (u >= 1) E.camMode = 'chase';
    } else if (E.back || E.camMode === 'bog' || E.camMode === 'swallow') { pos = at(17, -3, 6.2); look = at(-20, 1, 2); f = 1 - Math.pow(.0005, dt); }
    else if (E.camMode === 'jump') { E.camT += dt; const a = .5 + E.camT * .35; pos = at(-Math.cos(a) * 11, Math.sin(a) * 11, 2); pos.y = Math.max(pos.y, gy(pos.x, pos.z) + 1.2); look = at(0, 0, .8); f = 1 - Math.pow(.0002, dt); }
    else if (E.camMode === 'orbit') { E.camT += dt; const a = E.camT * .22 + .9; pos = V(p.x + Math.cos(a) * 13, p.y + 4.4, p.z + Math.sin(a) * 13); look = V(p.x, p.y + 1.6, p.z); f = 1 - Math.pow(.05, dt); }
    else { pos = at(-(8.4 + E.boost * 1.6), -E.vx * .05, 3.7 + (E.car.userData.camH || 1) * .3); look = at(17, 0, 1.6); pos.y = Math.max(pos.y, gy(pos.x, pos.z) + 1.6); }
    if (E.snap) { cam.position.copy(pos); camLook.copy(look); E.snap = false; } else { cam.position.lerp(pos, f); camLook.lerp(look, f); }
    if (E.shake > 0) cam.position.add(V((Math.random() - .5) * E.shake * .5, (Math.random() - .5) * E.shake * .5, 0));
    cam.lookAt(camLook);
    const fov = E.fov0 + Math.min(1, E.boost) * 10 + (E.camMode === 'jump' ? -8 : 0); if (Math.abs(cam.fov - fov) > .05) { cam.fov += (fov - cam.fov) * Math.min(1, dt * 4); cam.updateProjectionMatrix(); }
  }
  function sfx(n, a) { E.onSfx && E.onSfx(n, a); }

  // ---------- الوصول إلى المخيم / ابتلاع العاصفة ----------
  function startFinish(cb) {
    E.state = 'finish'; E.camMode = 'chase'; E.back = false; E.bog = 0; E.brake = 0; E.spin = 0; let ph = 0, slide = 0, v = Math.max(16, E.speed), yaw0 = 0;
    [...E.obs, ...E.stars, ...E.dates].forEach(o => { if (o.obj.position.z < E.pos.z - 30 || o.kind === 'camel' || o.kind === 'oryx' || o.kind === 'devil') { o.obj.parent && o.obj.parent.remove(o.obj); o.dead = true; } });
    const stopZ = E.geo.campZ + 12;
    E.auto = (dt) => {
      const car = E.car, rem = E.pos.z - stopZ;
      if (ph === 0) {
        v = clamp(rem * .55, 13, Math.max(13, v)); E.speed = v; E.pos.z -= v * dt; E.off += (0 - E.off) * Math.min(1, dt * 1.2); E.pos.x = E.geo.corridorX(E.pos.z) + E.off;
        car.rotation.set(E.pitch, E.geo.heading(E.pos.z), 0);
        if (rem < 16) { ph = 1; yaw0 = car.rotation.y; sfx('skid'); }
      } else if (ph === 1) {
        slide += dt; const k = clamp(slide / 1.1, 0, 1); v = 13 * (1 - k); E.speed = v; E.pos.z -= v * dt; E.pos.x += v * dt * .25 * k;
        car.rotation.set(0, yaw0 - ease(k) * 1.9, -.05 * Math.sin(k * Math.PI));
        tmp.copy(E.pos); spray.emit(tmp, V(-4, 5, -6), 2.4, Q.low ? 3 : 6);
        if (k >= 1) { ph = 2; E.speed = 0; E.arrived = true; E.camMode = 'orbit'; E.camT = 0; E.gap = 150; sfx('arrive'); cb && cb(); }
      }
      return ph === 1 ? .6 : 0;
    };
  }
  function startSwallow(cb) {
    E.state = 'swallow'; E.camMode = 'swallow'; E.gap = -14; let t = 0, done = false;
    E.auto = (dt) => { t += dt; E.speed = Math.max(0, E.speed - dt * 22); E.pos.z -= E.speed * dt; E.pos.x = E.geo.corridorX(E.pos.z) + E.off; E.car.rotation.set(E.pitch, E.geo.heading(E.pos.z) + Math.sin(E.t * 9) * .04, Math.sin(E.t * 11) * .03); E.shake = .5; if (t > 2.3 && !done) { done = true; cb && cb(); } return 0; };
  }

  // ---------- الحلقة ----------
  let last = performance.now(), raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!E.running) return;
    E.dt = dt || 1 / 60;
    update(dt);
    sky.sky.position.copy(cam.position);
    if (comp) comp.render(); else R.render(S, cam);
  }

  const api = {
    supported: true,
    setup(o) {
      buildWorld(o.L); setVehicle(o.kind || 'jeep', o.kid || 'boy'); clearDyn(); spray.clear();
      E.base = o.base || 38; E.speed = 0; E.pos.set(0, 0, 0); E.off = 0; E.vx = 0; E.input = 0; E.pos.y = gy(0, 0); E.prevSup = E.pos.y; E.pitch = 0;
      E.boost = 0; E.shake = 0; E.state = 'idle'; E.auto = null; E.arrived = false; E.camMode = 'chase'; E.snap = true; E.air = false; E.vyv = 0; E.bog = 0; E.brake = 0; E.spin = 0; E.slowT = 0; E.ts = 1; E.trick = null; E.back = false; E.jumpDelay = 0;
      E.gap = E.gapS = o.gap === undefined ? 70 : o.gap;
      E.greet.forEach(K => { restKid(K); K.position.y = .05; });
      basis(0); update(0);
    },
    start() { E.running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    stop() { E.running = false; cancelAnimationFrame(raf); raf = 0; },
    intro(dur) { E.state = 'intro'; E.camMode = 'intro'; E.camT = 0; E.camDur = dur || 3.5; },
    go() { E.state = 'drive'; E.camMode = 'chase'; E.speed = E.base * .5; E.boost = 1; },
    cruise() { E.state = 'cruise'; },
    ask, freeRun,
    // نتيجة المنحدر المختار: يُستدعى فور onGate
    gateResult(g, ok) {
      const r = g.rings[g.idx]; g.fx = { t: 0, i: g.idx, ok }; if (E.ramp && E.ramp.g === g) E.ramp.ok = ok;
      if (ok && r) { r.userData.top.material = r.userData.top.material.clone(); r.userData.top.material.emissive.setHex(0x38d86a); r.userData.top.material.emissiveIntensity = .55; const sp = sparkles(40, 5, 0xfff2a0); sp.position.set(0, RAMP_H + 3, 0); r.add(sp); }
    },
    finish: startFinish, swallow: startSwallow,
    setInput(x) { E.input = clamp(x, -1, 1); },
    lookBack(b) { E.back = !!b; },
    setStorm(gap) { if (E.state !== 'swallow' && !E.arrived) E.gap = gap; },
    gateDist() { return E.pending ? Math.max(0, E.pos.z - (E.pending.z + E.pending.len)) : null; },
    dist() { return -E.pos.z; },
    snapshot() { return R.domElement.toDataURL('image/jpeg', .85); },
    debug: E, renderer: R
  };
  return api;
}
window.StormEngine = { supported, create, QUALITY };

// محرك «غابة الهدوء 3D» — مشهد ثابت الكاميرا لغابة ظفار وحيوانات تهرب عند الضجيج وتعود مع الهدوء
import * as THREE from 'three';
import { EffectComposer } from './vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from './vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from './vendor/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from './vendor/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from './vendor/jsm/postprocessing/ShaderPass.js';
import { HueSaturationShader } from './vendor/jsm/shaders/HueSaturationShader.js';
import { VignetteShader } from './vendor/jsm/shaders/VignetteShader.js';
import { buildSky, SKIES } from './sky.js';
import { SCENES } from './scenes.js';
import { animate } from './animals.js';
import { canvasTex, FONT } from './util.js';

const QUALITY = {
  high: { pr: 1.5, shadow: 2048, post: 'full' },
  medium: { pr: 1, shadow: 2048, post: 'grade' },
  low: { pr: .8, shadow: 1024, low: true, post: 'none', fps: 30 }
};
SKIES.khareef = { top: 0x3aa0f0, mid: 0x9ad8ff, bot: 0xe4fff2, sun: 0xffffff, glow: 0xfff6c8, light: 0xfff8ea, hemi: [0xd0f0ff, 0xa8e090], fog: 0xd8f4ea };
SKIES.desertGold = { top: 0x2f86ec, mid: 0x8cc4ff, bot: 0xffdca8, sun: 0xfff2c8, glow: 0xffc070, light: 0xfff0d0, hemi: [0xc8e2ff, 0xffd0a0], fog: 0xffe2c0 };
function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const angLerp = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
const wrapA = a => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;

function create(container, opts) {
  const Q = QUALITY[opts.quality] || QUALITY.medium;
  const R = new THREE.WebGLRenderer({ antialias: Q.post !== 'full', powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.NeutralToneMapping;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.domElement.className = 'fo-canvas'; container.appendChild(R.domElement);
  const SC = SCENES.find(x => x.id === opts.scene) || SCENES[0];
  const S = new THREE.Scene(), sky = buildSky(S), sunDir = V(...SC.sun).normalize();
  let hemi, sun;
  if (SC.under) {
    sky.sky.visible = false; sky.sunS.visible = false;
    S.background = canvasTex(4, 256, (c) => { const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, '#' + new THREE.Color(SC.bg[1]).getHexString()); g.addColorStop(1, '#' + new THREE.Color(SC.bg[0]).getHexString()); c.fillStyle = g; c.fillRect(0, 0, 4, 256); });
    S.fog = new THREE.FogExp2(SC.fog[0], SC.fog[1]);
    hemi = new THREE.HemisphereLight(0xbff4ff, 0x2a6a8a, 1.5); sun = new THREE.DirectionalLight(0xe8fbff, 1.6);
  } else {
    const P = sky.setTime(SC.sky, sunDir);
    S.fog = new THREE.Fog(SC.fog[0], SC.fog[1], SC.fog[2]);
    hemi = new THREE.HemisphereLight(P.hemi[0], P.hemi[1], 1.15); sun = new THREE.DirectionalLight(P.light, 2.0);
  }
  S.add(hemi); sun.position.copy(sunDir).multiplyScalar(80); S.add(sun, sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(Q.shadow, Q.shadow); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 40, bottom: -40, near: 10, far: 200 }); sun.shadow.bias = -.0005; sun.shadow.normalBias = .04;
  const cam = new THREE.PerspectiveCamera(42, 1, .3, 20000), CAM0 = SC.cam ? SC.cam[0] : V(0, 7.4, 26.5), LOOK0 = SC.cam ? SC.cam[1] : V(0, 2.1, -4);
  let comp = null;
  function makeComposer(w, h) {
    if (Q.post === 'none') return;
    comp = new EffectComposer(R); comp.addPass(new RenderPass(S, cam));
    if (Q.post === 'full') comp.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), .3, .5, 1.5));
    comp.addPass(new OutputPass());
    const hs = new ShaderPass(HueSaturationShader); hs.uniforms.saturation.value = .12; comp.addPass(hs);
    const vg = new ShaderPass(VignetteShader); vg.uniforms.offset.value = .95; vg.uniforms.darkness.value = .45; comp.addPass(vg);
    if (Q.post === 'full') comp.addPass(new SMAAPass(w, h));
  }
  const E = { sceneId: SC.id, t: 0, alert: 0, alertT: 0, running: false, agents: [], groups: [], shake: 0, scene: S, cam };
  let onResize;
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; R.setSize(w, h, false); R.domElement.style.width = w + 'px'; R.domElement.style.height = h + 'px'; cam.aspect = w / h; cam.fov = w / h < 1.2 ? 62 : 42; cam.updateProjectionMatrix(); if (comp) comp.setSize(w, h); else makeComposer(w, h); }
  onResize = resize; window.addEventListener('resize', onResize); resize();

  // ---------- العالم ----------
  const W = SC.build(S, Q), Y = W.H; E.world = W;
  S.traverse(o => { if (o.isMesh && !o.userData.isOut && o.castShadow === undefined) o.castShadow = true; });

  // ---------- شارات فوق الرؤوس (!، ♥، ✨) ----------
  const badgeT = {}; function badgeTex(ch, bg) { const k = ch + bg; if (badgeT[k]) return badgeT[k]; return (badgeT[k] = canvasTex(128, 128, (c) => { c.fillStyle = bg; c.beginPath(); c.arc(64, 64, 56, 0, 7); c.fill(); c.lineWidth = 8; c.strokeStyle = '#fff'; c.stroke(); c.fillStyle = '#fff'; c.font = `900 82px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 64, 70); })); }
  const badges = [];
  function badge(a, ch, bg) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: badgeTex(ch, bg), depthTest: false, transparent: true })); s.renderOrder = 10; S.add(s); badges.push({ s, a, t: 0 }); }
  // نفخات غبار وأوراق متطايرة
  const puffT = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const puffs = [];
  function puff(p, n, col) { for (let i = 0; i < n; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffT, color: col || 0xf4ecd8, transparent: true, depthWrite: false })); s.position.copy(p).add(V((Math.random() - .5) * 1.2, Math.random() * .4, (Math.random() - .5) * 1.2)); s.userData = { v: V((Math.random() - .5) * 3, 1 + Math.random() * 2, (Math.random() - .5) * 3), t: 0, life: .7 + Math.random() * .5 }; S.add(s); puffs.push(s); } }

  // ---------- الحيوانات ----------
  const cfg = SC.agents(W), ORDER = SC.order;
  cfg.forEach(c => {
    const o = c.b(); o.rotation.order = 'YXZ'; o.rotation.y = c.yaw; const sc = (c.sc || (c.bfly ? 1.6 : c.swim ? 1.25 : 1.45)); o.scale.multiplyScalar(sc); c.scl = o.scale.x; S.add(o);
    o.traverse(m => { if (m.isMesh && !m.userData.isOut && !m.material.transparent) m.castShadow = true; });
    if (c.swim) c.home.y = -.12;
    else if (!c.fly) c.home.y = c.home.y || Y(c.home.x, c.home.z);
    else if (c.home.y === 0) c.home.y = Y(c.home.x, c.home.z) + (c.bfly ? 1.1 : 0);
    if (c.hole) c.exit = c.exit.map(p => V(p.x, 0, p.z));
    o.position.copy(c.home);
    const a = { c, o, state: c.rare ? 'gone' : 'idle', path: null, d: 0, ph: Math.random() * 6, look: 0, gait: null, off: Math.random() * 10, startle: 0, hs: 1 };
    o.visible = !c.rare; o.userData.agent = a; E.agents.push(a);
  });
  E.groups = ORDER.map(g => ({ g, list: E.agents.filter(a => a.c.g === g) }));
  const present = gr => gr.list.some(a => a.state === 'idle' || a.state === 'enter');
  const gone = gr => gr.list.every(a => a.state === 'gone' || a.state === 'hidden');

  // ---------- المسارات ----------
  function polyLen(P) { let L = 0; for (let i = 1; i < P.length; i++) L += P[i].distanceTo(P[i - 1]); return L; }
  function polyAt(P, d) { for (let i = 1; i < P.length; i++) { const l = P[i].distanceTo(P[i - 1]); if (d <= l || i === P.length - 1) { const k = Math.min(1, d / l); return { p: P[i - 1].clone().lerp(P[i], k), seg: i, k }; } d -= l; } return { p: P[P.length - 1].clone(), seg: P.length - 1, k: 1 }; }
  function flyPath(a, b, up) { const m = a.clone().lerp(b, .5); m.y = Math.max(a.y, b.y) + up; const curve = new THREE.QuadraticBezierCurve3(a.clone(), m, b.clone()); return curve.getPoints(24); }
  function flee(a) {
    const c = a.c;
    if (c.hider) { a.state = 'hidden'; a.o.userData.hideReq = true; badge(a, '!', '#ff5a3a'); E.onSfx && E.onSfx(W.under ? 'splash' : 'rustle', c); return; }
    const pts = c.fly ? flyPath(a.o.position, c.exit[0], c.up !== undefined ? c.up : c.swim ? 6 : 8) : [a.o.position.clone(), ...c.exit];
    a.path = pts; a.L = polyLen(pts); a.d = 0; a.state = 'flee'; a.startle = c.fly ? .15 : .38; a.y0 = a.o.position.y;
    badge(a, '!', '#ff5a3a'); if (!c.fly && !W.under) puff(a.o.position, 6); E.onSfx && E.onSfx(W.under || c.leap ? 'splash' : c.fly ? 'wings' : 'rustle', c);
  }
  function comeBack(a) {
    const c = a.c;
    if (c.hider) { a.state = 'idle'; a.o.userData.hideReq = false; badge(a, '♥', '#ff6fa8'); return; }
    const from = c.fly ? c.exit[0].clone() : c.exit[c.exit.length - 1].clone();
    const pts = c.fly ? flyPath(from, c.home, c.up !== undefined ? c.up : 6) : [...c.exit.slice().reverse(), c.home.clone()];
    a.path = pts; a.L = polyLen(pts); a.d = 0; a.state = 'enter'; a.o.visible = true; a.o.position.copy(pts[0]);
  }
  function groundY(a, p, seg, k) {
    const c = a.c, h = Y(p.x, p.z);
    if (c.fly) return p.y;
    // الخروج من صخرة/حافة مرتفعة أو العودة إليها
    if (a.state === 'flee' && seg === 1 && a.y0 > h + .5) return Math.max(h, a.y0 + (h - a.y0) * k) + Math.sin(k * Math.PI) * 1.4;
    if (a.state === 'enter' && seg === a.path.length - 1 && c.home.y > Y(c.home.x, c.home.z) + .5) return Math.max(h, h + (c.home.y - h) * k) + Math.sin(k * Math.PI) * 1.4;
    return h;
  }
  // ---------- التحديث ----------
  const camV = V(0, 0, 0);
  function update(dt) {
    E.t += dt; const t = E.t; camV.copy(cam.position);
    E.agents.forEach(a => {
      const c = a.c, o = a.o; let gait = null, pose = c.pose;
      if (a.state === 'gone') { o.visible = false; return; }
      if (a.state === 'flee' || a.state === 'enter') {
        if (a.startle > 0) { a.startle -= dt; o.position.y = (a.y0 || o.position.y) + Math.sin((1 - a.startle / .38) * Math.PI) * (c.fly ? 0 : .45); const nx = a.path[1]; o.rotation.y = angLerp(o.rotation.y, Math.atan2(nx.x - o.position.x, nx.z - o.position.z), Math.min(1, dt * 12)); }
        else {
          const sp = (a.state === 'flee' ? c.spd : c.spd * (c.fly ? .7 : .42));
          a.d += sp * dt; const r = polyAt(a.path, a.d), p = r.p; const prev = o.position.clone();
          o.position.set(p.x, groundY(a, p, r.seg, r.k), p.z);
          const dx = o.position.x - prev.x, dz = o.position.z - prev.z; if (Math.hypot(dx, dz) > 1e-4) o.rotation.y = angLerp(o.rotation.y, Math.atan2(dx, dz) - (c.side ? Math.PI / 2 : 0), Math.min(1, dt * 8));
          if (c.fly && (c.swim3 || c.leap)) { const dy = o.position.y - prev.y, hd = Math.hypot(dx, dz) || 1e-4; o.rotation.x = -Math.atan2(dy, hd) * .8; }
          gait = c.swim3 || c.leap ? 'swim' : c.fly ? 'fly' : a.state === 'flee' ? 'run' : 'walk';
          a.ph += dt * (c.fly ? 0 : sp * (c.id.startsWith('hr') ? .9 : c.id === 'hog' ? 3.2 : 1.25));
          if (c.bound && a.state === 'flee') o.position.y += Math.abs(Math.sin(a.ph * .5)) * .9;
          if (a.d >= a.L) { if (a.state === 'flee') { a.state = 'gone'; o.visible = false; if (c.hole) puff(o.position, 4); } else { a.state = 'idle'; o.position.copy(c.home); o.rotation.x = 0; badge(a, '♥', '#ff6fa8'); } }
        }
      } else if (a.state === 'idle') {
        if (c.wander) { const wd = c.wander, w = t * wd.w + a.off, nx = c.home.x + Math.sin(w) * wd.r[0], nz = c.home.z + Math.sin(w * 2) * .5 * wd.r[2] + Math.cos(w) * wd.r[2] * .5; let ny = c.home.y + Math.sin(w * 1.7) * wd.r[1];
          if (c.leap) { const L = c.leap, ph = ((t + a.off * 3) % L.every) / L.every, k = ph < .22 ? Math.sin(ph / .22 * Math.PI) : 0; ny += k * L.h; o.rotation.x = ph < .22 ? -Math.cos(ph / .22 * Math.PI) * .7 : angLerp(o.rotation.x, 0, dt * 3); if (ph < .01 && !a.splashed) { a.splashed = true; } if (ph > .2 && ph < .23 && a.splashed) { a.splashed = false; puff(V(nx, .2, nz), 8, 0xffffff); } }
          const dx = nx - o.position.x, dz = nz - o.position.z; if (Math.hypot(dx, dz) > 1e-4) o.rotation.y = angLerp(o.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 4));
          if (c.swim3 && !c.leap) o.rotation.x = angLerp(o.rotation.x, -Math.atan2(ny - o.position.y, Math.hypot(dx, dz) + 1e-4) * .6, dt * 3);
          o.position.set(nx, ny, nz); gait = c.idleGait || null; }
        else if (c.swim) { const w = t * .22 + a.off; o.position.set(c.home.x + Math.cos(w) * 1.6, -.12, c.home.z + Math.sin(w) * 1.1); o.rotation.y = Math.atan2(-Math.sin(w) * 1.6, Math.cos(w) * 1.1); }
        else if (c.bfly) { const w = t * .6 + a.off; const nx = c.home.x + Math.sin(w) * 2.2, nz = c.home.z + Math.cos(w * .8) * 1.8; o.rotation.y = Math.atan2(nx - o.position.x, nz - o.position.z) || o.rotation.y; o.position.set(nx, Y(nx, nz) + 1.1 + Math.sin(w * 2.3) * .4, nz); gait = 'fly'; }
        else { o.rotation.y = angLerp(o.rotation.y, c.yaw, Math.min(1, dt * 3)); o.position.y += (c.home.y - o.position.y) * Math.min(1, dt * 6); }
        if (a.hop > 0) { a.hop -= dt; o.position.y = c.home.y + Math.sin((1 - a.hop / .5) * Math.PI) * .6; }
      }
      if (a.state === 'hidden' && !c.hider) { o.visible = false; return; }
      if (c.hider && o.userData.kind !== 'turtle') { a.hs += ((a.state === 'hidden' ? .02 : 1) - a.hs) * Math.min(1, dt * 6); o.scale.setScalar(c.scl * a.hs); o.visible = a.hs > .04; }
      const toCam = wrapA(Math.atan2(camV.x - o.position.x, camV.z - o.position.z) - o.rotation.y);
      a.look = toCam;
      animate(o, { t: t + a.off, gait: gait === 'swim' && !c.swimGait && o.userData.kind === 'seaturtle' ? 'swim' : gait, ph: a.ph, alert: E.alert > .45 && a.state === 'idle', lookYaw: toCam, pose: gait ? null : pose, hide: c.hider && a.state === 'hidden', under: W.under || c.swimGait }, dt);
    });
    // الشارات والنفخات
    for (let i = badges.length - 1; i >= 0; i--) { const b = badges[i]; b.t += dt; const o = b.a.o, K = o.userData.kind, h = ({ gazelle: 3.4, ibex: 3.4, camel: 4.6, oryx: 3.4, donkey: 3.2, tahr: 3, goat: 2.6, leopard: 2.6, bird: 2.2, fish: 1, school: 1, dolphin: 1.6, puffer: 1.2, octopus: 2.4, seahorse: 2, ray: 1, seaturtle: 1.4 }[K] || 2) * (K === 'bird' && o.userData.bird === 'flamingo' ? 1.8 : 1) * (b.a.c.scl || 1) / 1.45 * 1.45; b.s.position.set(o.position.x, o.position.y + h + Math.min(.4, b.t * 2), o.position.z); const k = b.t < .15 ? b.t / .15 : 1; b.s.scale.setScalar(1.1 * k * (1 + Math.max(0, .2 - b.t) * 2)); b.s.material.opacity = b.t > 1.1 ? Math.max(0, 1 - (b.t - 1.1) * 3) : 1; if (b.t > 1.45 || (!o.visible && b.t > .3)) { S.remove(b.s); badges.splice(i, 1); } }
    for (let i = puffs.length - 1; i >= 0; i--) { const s = puffs[i], u = s.userData; u.t += dt; s.position.addScaledVector(u.v, dt); s.scale.setScalar(.6 + u.t * 2.5); s.material.opacity = Math.max(0, 1 - u.t / u.life) * .9; if (u.t > u.life) { S.remove(s); puffs.splice(i, 1); } }
    W.update && W.update(t, dt);
    // الكاميرا: تنفّس خفيف
    E.shake = Math.max(0, E.shake - dt * 1.5);
    cam.position.set(CAM0.x + Math.sin(t * .13) * .6 + (Math.random() - .5) * E.shake * .4, CAM0.y + Math.sin(t * .21) * .2 + (Math.random() - .5) * E.shake * .4, CAM0.z);
    cam.lookAt(LOOK0);
    if (E.camOv) { cam.position.copy(E.camOv[0]); cam.lookAt(E.camOv[1]); }
  }
  // ---------- الحلقة ----------
  let last = performance.now(), raf = 0, acc = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000)); last = now;
    if (!E.running) return;
    if (Q.fps) { acc += dt; if (acc < 1 / Q.fps - .002) return; } const step = Q.fps ? Math.min(.1, acc) : dt; acc = 0;
    update(step);
    if (sky.sky.visible) sky.sky.position.copy(cam.position);
    if (comp) comp.render(); else R.render(S, cam);
  }
  // اللمس على حيوان: قفزة فرح
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx, cy) {
    const r = R.domElement.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1); ray.setFromCamera(ndc, cam);
    const hits = ray.intersectObjects(E.agents.filter(a => a.o.visible).map(a => a.o), true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.agent) o = o.parent; if (o && o.userData.agent.state === 'idle') { const a = o.userData.agent; a.hop = .5; badge(a, '♥', '#ff6fa8'); return a; } }
    return null;
  }
  update(0);
  const api = {
    start() { E.running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    stop() { E.running = false; cancelAnimationFrame(raf); raf = 0; },
    setAlert(v) { E.alert = v; },
    // يهرب أول مجموعة حاضرة حسب الترتيب؛ يعيد اسمها أو null
    fleeNext() { const last = ORDER[ORDER.length - 1]; const gr = E.groups.find(g => present(g) && !(g.g === last && E.groups.filter(present).length > 1)); if (!gr) return null; gr.list.forEach(flee); E.fled.push(gr); return { ar: gr.list[0].c.ar, em: gr.list[0].c.em, g: gr.g, n: gr.list.length }; },
    returnNext() { const gr = E.fled.shift(); if (!gr) return null; if (gr.g === 'rare') return api.returnNext(); gr.list.forEach(comeBack); E.onSfx && E.onSfx('return', gr.list[0].c); return { ar: gr.list[0].c.ar, em: gr.list[0].c.em, g: gr.g }; },
    returnAll() { while (E.fled.length) api.returnNext(); },
    leopardVisit() { const gr = E.groups[0]; if (present(gr)) return false; gr.list.forEach(comeBack); return true; },
    hasLeopard() { return present(E.groups[0]); },
    counts() { const regular = E.groups.slice(1); let here = 0, tot = 0; regular.forEach(g => { tot += g.list.length; if (present(g)) here += g.list.length; }); return { here, tot, groupsHere: regular.filter(present).length, groups: regular.length }; },
    shake(v) { E.shake = Math.max(E.shake, v); },
    pick, debug: E, renderer: R, sceneInfo: { id: SC.id, ar: SC.ar, em: SC.em, rare: SC.rare, under: !!SC.under },
    dispose() { api.stop(); window.removeEventListener('resize', onResize); try { R.dispose(); } catch (e) {} R.domElement.remove(); },
    snapshot() { return R.domElement.toDataURL('image/jpeg', .85); }
  };
  E.fled = [];
  return api;
}
window.ForestEngine = { supported, create, QUALITY, SCENES: SCENES.map(s => ({ id: s.id, ar: s.ar, em: s.em, desc: s.desc, rare: s.rare })) };

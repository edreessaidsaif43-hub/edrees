// محرك «ملعب المعرفة 3D» — يُجمَّع بـ esbuild إلى ملف عادي يعمل دون إنترنت (window.FootEngine)
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';
import { buildStadium, drawScreen, HL, HW, GOAL_W } from './stadium.js';
import { buildPlayer, rest, poseRun, poseGK, poseKick, poseIdle, poseArmsUp, buildBall, avatarTag } from './player.js';
import { loadImg, canvasTex } from './util.js';

const QUALITY = {
  high: { pr: 1.5, shadows: 2, shadowSize: 2048, tex: 4096, crowd: 99999 },
  medium: { pr: 1, shadows: 1, shadowSize: 1024, tex: 2048, crowd: 9000 },
  low: { pr: .75, shadows: 0, shadowSize: 512, tex: 2048, crowd: 4000 }
};
const KITS = [
  { main: 0xd81f3a, accent: 0xffffff, shorts: 0xffffff, socks: 0xd81f3a, gk: { main: 0x23283a, accent: 0x7dff6a, shorts: 0x23283a, socks: 0x23283a, gloves: 0x7dff6a }, nums: ['1', '9', '7', '11', '4'] },
  { main: 0x0e9c95, accent: 0xffd23f, shorts: 0x0b2f4a, socks: 0x0e9c95, gk: { main: 0xffc928, accent: 0x14162b, shorts: 0x14162b, socks: 0xffc928, gloves: 0x2a6cff }, nums: ['1', '10', '8', '5', '3'] }
];
const SKINS = [0xf3d2b8, 0xeec4a4, 0xf6dcc6, 0xe8bb98, 0xf0caa8];
const HAIRS = [0x2a1c14, 0x3b2a1c, 0x1a120c, 0x5a3d26, 0x241810];
const COLS = ['#e53950', '#16a3a0'];

function supported() { try { const c = document.createElement('canvas'); return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl'))); } catch (e) { return false; } }
const ease = x => x < .5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
const V = (x, y, z) => new THREE.Vector3(x, y, z);

function create(container, opts) {
  const Q = QUALITY[opts.quality] || QUALITY.medium;
  const R = new THREE.WebGLRenderer({ antialias: Q.pr >= 1, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.preserve });
  R.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr)); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  R.shadowMap.enabled = Q.shadows > 0; R.shadowMap.type = THREE.PCFSoftShadowMap;
  R.domElement.className = 'fb-canvas'; container.appendChild(R.domElement);
  const S = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(R); const env = pm.fromScene(new RoomEnvironment(), .04).texture; pm.dispose();
  const st = buildStadium(R, S, Q, { env });
  // الإضاءة الليلية من الأبراج
  S.add(new THREE.HemisphereLight(0x9fb4ff, 0x203020, .55));
  const key = (x, z, i, sh) => { const d = new THREE.DirectionalLight(0xfff3e0, i); d.position.set(x, 60, z); d.target.position.set(x * .25, 0, z * .25); S.add(d.target); if (sh) { d.castShadow = true; d.shadow.mapSize.set(Q.shadowSize, Q.shadowSize); const c = d.shadow.camera; c.left = -70; c.right = 70; c.top = 50; c.bottom = -50; c.near = 10; c.far = 200; d.shadow.bias = -.0004; d.shadow.normalBias = .02; } S.add(d); return d; };
  key(-75, -60, 1.25, Q.shadows >= 1); key(75, 60, .9, Q.shadows >= 2); key(75, -60, .55, false); key(-75, 60, .55, false);

  const cam = new THREE.PerspectiveCamera(48, 1, .1, 2000);
  function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; R.setSize(w, h, false); R.domElement.style.width = w + 'px'; R.domElement.style.height = h + 'px'; cam.aspect = w / h; cam.fov = w / h < 1.2 ? 62 : 48; cam.updateProjectionMatrix(); }
  resize(); window.addEventListener('resize', resize);

  const ball = buildBall(env); S.add(ball);
  // قصاصات الاحتفال
  const confN = 600, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(.35, .2), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), confN); conf.visible = false; conf.frustumCulled = false; S.add(conf);
  const confD = []; { const c = new THREE.Color(), cols = [0xe53950, 0xffd23f, 0x16a3a0, 0xffffff, 0x1a2a6c, 0xff7a1a]; for (let i = 0; i < confN; i++) { conf.setColorAt(i, c.setHex(cols[i % cols.length])); confD.push({ p: V(0, 0, 0), v: V(0, 0, 0), r: new THREE.Euler(), w: V(0, 0, 0) }); } }
  // ظل دائري خفيف تحت الكرة (يفيد عند إيقاف الظلال)
  const blobT = canvasTex(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(0,0,0,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(.5, .5), new THREE.MeshBasicMaterial({ map: blobT, transparent: true, depthWrite: false })); blob.rotation.x = -Math.PI / 2; S.add(blob);

  const E = { dt: 1 / 60, teams: [], pl: [[], []], imgs: [], tags: [], t: 0, running: false, phase: 'idle', att: 0, co: null, coWait: 0, coDone: null, cam: { mode: 'fixed', pos: V(0, 30, -60), look: V(0, 0, 0), snap: true }, bulge: null, scores: [0, 0], sub: '', outcome: null };
  const B = { mode: 'foot', p: null, fly: null, vel: V(0, 0, 0), spinAxis: V(1, 0, 0), spin: 0, hold: null, net: null };

  function mkPlayer(team, k) {
    const K = KITS[team], gk = k === 0, kit = gk ? K.gk : K;
    const obj = buildPlayer({ main: kit.main, accent: kit.accent, shorts: kit.shorts, socks: kit.socks, gloves: kit.gloves, gk, num: K.nums[k], skin: SKINS[(k + team * 2) % SKINS.length], hair: HAIRS[(k * 3 + team) % HAIRS.length], env });
    obj.rotation.order = 'YXZ';
    obj.traverse(o => { if (o.isMesh) o.castShadow = Q.shadows > 0 && o.castShadow; });
    S.add(obj);
    return { obj, team, k, gk, tgt: V(0, 0, 0), spd: 0, moving: false, ph: Math.random() * 6, yaw: 0, face: null, kickT: -1, dive: null, fall: 0, cel: false, sad: false, jump: 0 };
  }
  async function setTeams(teams) {
    E.pl.flat().forEach(p => S.remove(p.obj)); E.tags.forEach(t => t.parent && t.parent.remove(t));
    E.teams = teams; E.pl = [[], []];
    for (let t = 0; t < 2; t++) for (let k = 0; k < 5; k++) E.pl[t].push(mkPlayer(t, k));
    E.imgs = await Promise.all(teams.map(T => loadImg(T.img)));
    E.tags = [0, 1].map(i => { const s = avatarTag(E.imgs[i], COLS[i]); s.scale.multiplyScalar(.8); s.position.set(0, 2.5, 0); return s; });
    E.scores = [0, 0]; E.sub = 'صافرة البداية'; screens();
    setup(0);
  }
  function screens() { st.screens.forEach(s => drawScreen(s, { s0: E.scores[0], s1: E.scores[1], n0: E.teams[0] ? E.teams[0].name : '', n1: E.teams[1] ? E.teams[1].name : '', c0: COLS[0], c1: COLS[1], img0: E.imgs[0], img1: E.imgs[1], sub: E.sub, title: 'ملعب المعرفة' })); }

  const place = (p, x, z, faceX, faceZ) => { p.obj.position.set(x, 0, z); p.tgt.set(x, 0, z); p.spd = 0; p.moving = false; p.kickT = -1; p.dive = null; p.fall = 0; p.cel = false; p.sad = false; p.jump = 0; p.obj.rotation.set(0, 0, 0); p.yaw = Math.atan2(faceX - x, faceZ - z); p.obj.rotation.y = p.yaw; p.face = V(faceX, 0, faceZ); };
  // ترتيب اللاعبين قبل هجمة الفريق i
  function setup(i) {
    E.att = i; E.co = null; E.outcome = null; E.phase = 'ready'; conf.visible = false; E.bulge = null;
    const d = i === 0 ? 1 : -1, gx = d * HL, A = E.pl[i], Bt = E.pl[1 - i];
    st.goals.forEach(g => { g.userData.net[1].position.x = 0; g.userData.net[0].scale.x = 1; });
    place(A[0], -d * (HL - 1.6), 0, 0, 0);
    place(A[1], d * 22, -2.4, gx, -.6);
    place(A[2], d * 30, 10, gx, 0);
    place(A[3], d * 28, -13, gx, 0);
    place(A[4], d * 10, 3, gx, 0);
    place(Bt[0], gx - d * 1.4, -.7, 0, 0);
    place(Bt[1], d * 30, .6, d * 22, -2.4);
    place(Bt[2], d * 36, -8, d * 22, -2.4);
    place(Bt[3], d * 16, 8, d * 22, -2.4);
    place(Bt[4], d * 40, 6, d * 22, -2.4);
    E.tags[i].parent && E.tags[i].parent.remove(E.tags[i]); A[1].obj.add(E.tags[i]);
    E.tags[1 - i].parent && E.tags[1 - i].parent.remove(E.tags[1 - i]); Bt[1].obj.add(E.tags[1 - i]);
    B.mode = 'foot'; B.p = A[1]; B.hold = null; B.net = null; B.fly = null;
    E.crowdJ = [0, 0];
    camFollow(true);
  }
  function camFollow(snap) { const d = E.att === 0 ? 1 : -1; E.cam.mode = 'follow'; E.cam.d = d; E.cam.snap = !!snap; }

  // ---------- الكرة ----------
  function kickBall(to, dur, h, after) { B.mode = 'fly'; B.fly = { a: ball.position.clone(), b: to.clone(), t: 0, d: dur, h, after }; B.p = null; }
  function updBall(dt) {
    const prev = ball.position.clone();
    if (B.mode === 'foot' && B.p) {
      const p = B.p, o = p.obj, f = V(Math.sin(p.yaw), 0, Math.cos(p.yaw));
      const touch = p.moving ? Math.abs(Math.sin(p.ph * .5)) * .35 : 0;
      ball.position.copy(o.position).addScaledVector(f, .55 + touch); ball.position.y = .11;
    } else if (B.mode === 'fly') {
      const F = B.fly; F.t += dt; const k = Math.min(1, F.t / F.d);
      ball.position.lerpVectors(F.a, F.b, k); ball.position.y += F.h * 4 * k * (1 - k);
      if (k >= 1) { B.mode = 'free'; B.vel.subVectors(F.b, F.a).divideScalar(F.d); B.vel.y = 0; const a = F.after; B.fly = null; a && a(); }
    } else if (B.mode === 'free') {
      B.vel.y -= 9.8 * dt; ball.position.addScaledVector(B.vel, dt);
      if (ball.position.y < .11) { ball.position.y = .11; if (B.vel.y < 0) B.vel.y *= -.45; B.vel.x *= .985; B.vel.z *= .985; }
      B.vel.multiplyScalar(1 - dt * .25);
    } else if (B.mode === 'net') {
      const N = B.net; N.t += dt; const k = Math.min(1, N.t / .45);
      ball.position.lerpVectors(N.a, N.b, 1 - Math.pow(1 - k, 3)); if (k >= 1) { N.b.y = Math.max(.11, N.b.y - dt * 3.5); }
    } else if (B.mode === 'hold' && B.hold) {
      ball.position.copy(B.hold.obj.localToWorld(V(0, B.hold.dive ? 2.05 : 1.15, B.hold.dive ? .1 : .35)));
    }
    const mv = ball.position.clone().sub(prev); const l = mv.length();
    if (l > 1e-4) { const ax = V(mv.z, 0, -mv.x).normalize(); if (ax.lengthSq() > .1) ball.rotateOnWorldAxis(ax, l / .11); }
    blob.position.set(ball.position.x, .02, ball.position.z); blob.scale.setScalar(1 + ball.position.y * .4); blob.material.opacity = Math.max(0, 1 - ball.position.y * .25);
  }

  // ---------- اللاعبون ----------
  const run = (p, x, z, spd) => { p.tgt.set(x, 0, z); p.spd = spd; };
  function updPlayers(dt) {
    E.pl.flat().forEach(p => {
      const o = p.obj, dx = p.tgt.x - o.position.x, dz = p.tgt.z - o.position.z, dist = Math.hypot(dx, dz);
      if (!p.dive && p.fall <= 0 && dist > .06 && p.spd > 0) {
        const step = Math.min(dist, p.spd * dt); o.position.x += dx / dist * step; o.position.z += dz / dist * step; p.ph += step * 1.9; p.moving = true;
        const ty = Math.atan2(dx, dz); let dy = ty - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 10);
      } else {
        p.moving = false;
        if (p.face) { const ty = Math.atan2(p.face.x - o.position.x, p.face.z - o.position.z); let dy = ty - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); p.yaw += dy * Math.min(1, dt * 5); }
      }
      rest(o);
      o.rotation.y = p.yaw; o.rotation.x = 0; o.rotation.z = 0; o.position.y = 0;
      if (p.dive) {
        const D = p.dive; D.t += dt; const k = Math.min(1, D.t / D.d), e = ease(Math.min(1, k * 1.25));
        const sgn = D.s * (Math.sin(p.yaw) >= 0 ? 1 : -1);
        o.rotation.z = sgn * 1.25 * e; o.position.y = Math.sin(Math.min(1, k * 1.25) * Math.PI) * .5;
        o.position.z = D.z0 + D.s * D.reach * e;
        const u = o.userData; u.armL.sh.rotation.set(0, 0, 2.7); u.armR.sh.rotation.set(0, 0, -2.7); u.legL.hp.rotation.set(-.2, 0, .25); u.legR.hp.rotation.set(.3, 0, -.15); u.legL.kn.rotation.x = .5; u.legR.kn.rotation.x = .9; u.hips.position.y = .98;
      } else if (p.fall > 0) {
        p.fall = Math.max(0, p.fall - dt); const k = Math.sin(Math.min(1, (1.2 - p.fall) / 1.2) * Math.PI);
        o.userData.spine.rotation.x = .9 * k; o.userData.hips.position.y = .98 - .35 * k; o.userData.legL.kn.rotation.x = 1.2 * k; o.userData.legR.kn.rotation.x = .6 * k; o.userData.legL.hp.rotation.x = -.8 * k;
        o.userData.armL.sh.rotation.set(-1.2 * k, 0, .4); o.userData.armR.sh.rotation.set(-1.2 * k, 0, -.4);
      } else if (p.kickT >= 0) {
        p.kickT += dt; poseKick(o, Math.min(1, p.kickT / .55)); if (p.kickT > .9) p.kickT = -1;
      } else if (p.moving) {
        poseRun(o, p.ph, Math.min(1, p.spd / 6));
        if (p.cel) poseArmsUp(o, E.t);
      } else if (p.cel) {
        poseIdle(o, E.t); poseArmsUp(o, E.t); p.jump += dt; o.position.y = Math.abs(Math.sin(p.jump * 6 + p.k)) * .35;
      } else if (p.sad) {
        poseIdle(o, E.t); o.userData.spine.rotation.x = .45; o.userData.headG.rotation.x = .5; o.userData.armL.sh.rotation.set(0, 0, .05); o.userData.armR.sh.rotation.set(0, 0, -.05); o.userData.armL.el.rotation.x = 0; o.userData.armR.el.rotation.x = 0;
      } else if (p.gk) {
        poseGK(o, E.t);
      } else {
        // جري خفيف في المكان أثناء انتظار الإجابة
        poseIdle(o, E.t);
      }
    });
  }

  // ---------- المشاهد ----------
  function* waitUntil(fn, max = 4) { let t = 0; while (!fn() && t < max) { yield 1e-4; t += E.dt; } }
  const arrived = p => Math.hypot(p.obj.position.x - p.tgt.x, p.obj.position.z - p.tgt.z) < .1;
  function goalCamFor(d, s) { const gx = d * HL; E.cam.mode = 'fixed'; E.cam.snap = true; E.cam.pos.set(gx + d * 4.4, 1.9, s * 4.6); E.cam.look.set(gx - d * 13, 1.1, -s * 2.2); }
  function netHit(d, s) {
    const gx = d * HL; B.mode = 'net'; B.net = { a: ball.position.clone(), b: V(gx + d * 1.85, ball.position.y * .6 + .15, ball.position.z * .92), t: 0 };
    E.bulge = { g: st.goals[d > 0 ? 1 : 0], d, t: 0 }; sfx('net');
  }
  function* scoreGoal(i, scorer, d, s) {
    const gx = d * HL, A = E.pl[i], Bt = E.pl[1 - i], gk = Bt[0];
    const wrong = Math.random() < .55; const tz = s * (2.3 + Math.random() * .6), ty = .5 + Math.random() * 1.3;
    const tok = p_kick(scorer, V(gx + d * .4, ty, tz), .62, .4);
    yield .12; goalCamFor(d, -s);
    yield .18; gk.dive = { t: 0, d: .75, s: wrong ? -s : s, reach: wrong ? 1.1 : 1.0, z0: gk.obj.position.z }; gk.face = null;
    yield* waitUntil(() => tok.landed, 3);
    netHit(d, s); E.outcome = 'goal'; E.scores[i]++; E.sub = '⚽ هدف ' + (E.teams[i] ? E.teams[i].name : ''); screens(); E.crowdJ[i] = 1;
    E.onEvent && E.onEvent('goal');
    sfx('roar');
    yield 1.7;
    // الاحتفال: الهداف يجري نحو الزاوية ورفاقه خلفه
    const cz = (scorer.obj.position.z >= 0 ? 1 : -1) * (HW - 6), cx = d * (HL - 9);
    scorer.cel = true; run(scorer, cx, cz, 7.2);
    A.slice(1).forEach((p, k) => { if (p !== scorer) { p.cel = true; run(p, cx - d * (2 + k * 1.3), cz - Math.sign(cz) * (1.5 + k), 7.6 + k * .3); } });
    Bt.slice(1).forEach(p => { p.sad = true; run(p, p.obj.position.x - d * 2, p.obj.position.z * .9, 1.5); });
    E.cam.mode = 'track'; E.cam.obj = scorer; E.cam.d = d; E.cam.snap = true;
    yield 3.2;
  }
  function p_kick(p, to, dur, h) { const tok = { landed: false }; p.kickT = 0; p.spd = 0; p.tgt.copy(p.obj.position); p.face = to.clone().setY(0); setTimeout0(.24, () => { kickBall(to, dur, h, () => { tok.landed = true; }); sfx('kick'); }); return tok; }
  // مؤقّت مرتبط بزمن المحرك
  const timers = [];
  function setTimeout0(sec, fn) { timers.push({ t: sec, fn }); }

  function* seqGoalSolo(i) {
    const d = i === 0 ? 1 : -1, A = E.pl[i], Bt = E.pl[1 - i], c = A[1], s = Math.random() < .5 ? -1 : 1;
    E.cam.mode = 'follow'; E.cam.snap = false;
    run(c, d * 36, -4.5, 6.8); run(A[2], d * 40, 8, 6); run(A[3], d * 38, -12, 6); run(A[4], d * 24, 2, 5);
    yield .25; run(Bt[1], d * 31.5, -3.2, 6.2); run(Bt[2], d * 38, -6, 4); run(Bt[3], d * 30, 4, 6.5); run(Bt[4], d * 42, 4, 3);
    run(Bt[0], Bt[0].obj.position.x, -1.4, 1.5);
    yield* waitUntil(() => Math.abs(c.obj.position.x - d * 31.5) < 1.2, 3);
    Bt[1].fall = 1.2; sfx('whoosh');
    yield* waitUntil(() => arrived(c), 3);
    yield* scoreGoal(i, c, d, s);
  }
  function* seqGoalPass(i) {
    const d = i === 0 ? 1 : -1, A = E.pl[i], Bt = E.pl[1 - i], c = A[1], m = A[2], s = -1;
    E.cam.mode = 'follow'; E.cam.snap = false;
    run(c, d * 28, -2, 6.5); run(m, d * 37, 6.5, 6.8); run(A[3], d * 38, -10, 6); run(A[4], d * 22, 2, 5);
    run(Bt[1], d * 29, -1.5, 5); run(Bt[2], d * 37, -3, 4); run(Bt[3], d * 25, 4, 6); run(Bt[4], d * 40, 3, 4.5);
    yield* waitUntil(() => arrived(c), 3);
    const tok = p_kick(c, V(d * 37.6, .11, 6.3), .75, .25);
    yield .26; E.cam.obj = m;
    yield* waitUntil(() => tok.landed, 3);
    B.mode = 'foot'; B.p = m; m.face = V(d * HL, 0, -2); run(m, d * 38.6, 5.8, 3);
    yield .35;
    yield* scoreGoal(i, m, d, s);
  }
  function* seqTackle(i) {
    const d = i === 0 ? 1 : -1, A = E.pl[i], Bt = E.pl[1 - i], c = A[1], df = Bt[1];
    E.cam.mode = 'follow'; E.cam.snap = false;
    run(c, d * 35, -4, 6.4); run(A[2], d * 38, 8, 5.5); run(A[3], d * 36, -12, 5.5);
    yield .3; run(df, d * 29.5, -3.4, 7.6); run(Bt[3], d * 27, 2, 6);
    { let t = 0; while (ball.position.distanceTo(df.obj.position) > 1.1 && t < 3) { run(df, ball.position.x, ball.position.z, 7.8); yield 1e-4; t += E.dt; } }
    // قطع الكرة
    B.p = df; c.fall = 1.2; c.spd = 0; c.tgt.copy(c.obj.position); sfx('whoosh'); E.outcome = 'tackle'; E.onEvent && E.onEvent('tackle');
    run(df, d * 12, 7, 6.2); run(Bt[3], d * 8, -4, 6); run(Bt[2], d * 18, -10, 5);
    E.cam.obj = df;
    yield 1.6;
    A.slice(1).forEach(p => p.sad = true);
    yield 1.2;
  }
  function* seqSave(i, post) {
    const d = i === 0 ? 1 : -1, gx = d * HL, A = E.pl[i], Bt = E.pl[1 - i], c = A[1], gk = Bt[0], s = Math.random() < .5 ? -1 : 1;
    E.cam.mode = 'follow'; E.cam.snap = false;
    run(c, d * 35, -4, 6.6); run(A[2], d * 40, 8, 6); run(A[3], d * 38, -12, 6);
    yield .3; run(Bt[1], d * 33, -1, 5); run(Bt[3], d * 30, 3, 6);
    yield* waitUntil(() => arrived(c), 3);
    if (post) {
      const pz = s * (GOAL_W / 2 + .05);
      const tok = p_kick(c, V(gx, 1.15, pz), .6, .35);
      yield .12; goalCamFor(d, -s);
      yield .2; gk.dive = { t: 0, d: .75, s: -s, reach: .7, z0: gk.obj.position.z }; gk.face = null;
      yield* waitUntil(() => tok.landed, 3);
      B.mode = 'free'; B.vel.set(-d * 4.5, 2.2, s * 5.5); sfx('post'); E.outcome = 'post'; E.onEvent && E.onEvent('post');
      yield 2.2;
    } else {
      const tz = s * (1.4 + Math.random() * .6);
      const tok = p_kick(c, V(gx - d * .3, 1.25, tz), .62, .45);
      yield .12; goalCamFor(d, -s);
      yield .14; gk.dive = { t: 0, d: .62, s, reach: Math.max(.2, Math.abs(tz) - .9), z0: gk.obj.position.z }; gk.face = null;
      yield* waitUntil(() => tok.landed || (B.mode === 'fly' && ball.position.distanceTo(gk.obj.localToWorld(V(0, 2.05, .1))) < .45), 3);
      B.mode = 'hold'; B.hold = gk; B.fly = null; sfx('catch'); E.outcome = 'save'; E.onEvent && E.onEvent('save');
      yield 2.4;
    }
    A.slice(1).forEach(p => p.sad = true);
    yield .6;
  }

  // ---------- الكاميرا ----------
  const camLook = V(0, 0, 0);
  function updCam(dt) {
    const C = E.cam, k = C.snap ? 1 : 1 - Math.pow(.004, dt);
    let pos, look;
    if (C.mode === 'follow') {
      const d = C.d, f = (C.obj && B.mode === 'foot' && B.p === C.obj) ? C.obj.obj.position : ball.position;
      pos = V(f.x - d * 6.4, 3.3, f.z - 1.2); look = V(d * (HL - 2.5), 1.6, f.z * .35 - .4);
      if (E.outcome === 'tackle') look = V(f.x + d * 4, .8, f.z);
    } else if (C.mode === 'track') {
      const o = C.obj.obj.position, d = C.d; pos = V(o.x + d * 7.5, 2.6, o.z * .7); look = V(o.x, 1.3, o.z);
    } else if (C.mode === 'orbit') {
      const a = E.t * .28; pos = V(C.c.x + Math.cos(a) * 12, 4.2, C.c.z + Math.sin(a) * 12); look = V(C.c.x, 1.3, C.c.z);
    } else if (C.mode === 'fly') {
      C.t += dt; const u = ease(Math.min(1, C.t / C.dur));
      pos = new THREE.Vector3().lerpVectors(C.p0, C.p1, u); pos.y = C.p0.y + (C.p1.y - C.p0.y) * u; look = new THREE.Vector3().lerpVectors(C.l0, C.l1, u);
      const a = (1 - u) * 1.4; const cx = pos.x, cz = pos.z; pos.x = cx * Math.cos(a) - cz * Math.sin(a); pos.z = cx * Math.sin(a) + cz * Math.cos(a);
      if (C.t >= C.dur) { const cb = C.cb; C.cb = null; camFollow(false); cb && cb(); }
    } else { pos = C.pos; look = C.look; }
    if (C.snap) { cam.position.copy(pos); camLook.copy(look); C.snap = false; }
    else { cam.position.lerp(pos, k); camLook.lerp(look, k); }
    cam.lookAt(camLook);
  }

  // ---------- الحلقة ----------
  let last = performance.now(), raf = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(.2, Math.max(0, (now - last) / 1000)); last = now;
    if (!E.running) return;
    E.t += dt; E.dt = dt || 1 / 60;
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    if (E.co) {
      E.coWait -= dt;
      let guard = 0;
      while (E.co && E.coWait <= 0 && guard++ < 50) { const r = E.co.next(); if (r.done) { E.co = null; const cb = E.coDone; E.coDone = null; cb && cb(); } else E.coWait = r.value <= 1e-3 ? 1e-4 : E.coWait + r.value; }
    }
    updPlayers(dt); updBall(dt);
    if (E.bulge) { const b = E.bulge; b.t += dt; const k = Math.min(1, b.t / 1.1), w = Math.sin(k * Math.PI) * Math.exp(-k * 1.5); b.g.userData.net[1].position.x = b.d * .45 * w; b.g.userData.net[0].scale.x = 1 + .25 * w; if (k >= 1) E.bulge = null; }
    // الجمهور
    const U = st.crowd.U; U.uTime.value = E.t; [0, 1].forEach(i => { const tgt = E.crowdJ ? E.crowdJ[i] : 0; const cur = i ? U.uJ1 : U.uJ0; cur.value += (tgt - cur.value) * Math.min(1, dt * 3); if (E.crowdJ && E.crowdJ[i] > 0 && E.phase !== 'final') E.crowdJ[i] = Math.max(0, E.crowdJ[i] - dt * .2); });
    if (conf.visible) { const m = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V(1, 1, 1); confD.forEach((d, i) => { d.v.y -= 5 * dt; d.v.multiplyScalar(.99); d.p.addScaledVector(d.v, dt); d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; if (d.p.y < 0) d.p.y = 0; q.setFromEuler(d.r); m.compose(d.p, q, one); conf.setMatrixAt(i, m); }); conf.instanceMatrix.needsUpdate = true; }
    updCam(dt);
    R.render(S, cam);
  }
  function confetti(c) { conf.visible = true; confD.forEach(d => { d.p.set(c.x + (Math.random() - .5) * 16, 10 + Math.random() * 8, c.z + (Math.random() - .5) * 16); d.v.set((Math.random() - .5) * 6, Math.random() * 4, (Math.random() - .5) * 6); d.w.set(Math.random() * 8, Math.random() * 8, 0); }); }

  // أصوات المحرك (تُمرَّر من اللعبة)
  function sfx(n) { E.onSfx && E.onSfx(n); }

  const api = {
    supported: true, setTeams, setup,
    start() { E.running = true; last = performance.now(); if (!raf) raf = requestAnimationFrame(loop); },
    stop() { E.running = false; cancelAnimationFrame(raf); raf = 0; E.co = null; timers.length = 0; },
    // جولة كاميرا حول الملعب قبل صافرة البداية
    intro(cb) { E.phase = 'intro'; const C = E.cam; C.mode = 'fly'; C.t = 0; C.dur = 4.2; C.p0 = V(-6, 40, -38); C.l0 = V(0, 0, 0); camFollow(true); updBall(0); updCam(0); const p1 = cam.position.clone(), l1 = camLook.clone(); C.mode = 'fly'; C.p1 = p1; C.l1 = l1; C.cb = cb; C.snap = false; C.t = 0; cam.position.copy(C.p0); camLook.copy(C.l0); },
    // تنفيذ الهجمة: ok = إجابة صحيحة (هدف) أو خاطئة (قطع/تصدٍّ/قائم)
    attack(i, ok, cb, v) {
      E.phase = 'play'; E.att = i;
      if (!v) v = ok ? (Math.random() < .5 ? 'solo' : 'pass') : (r => r < .4 ? 'tackle' : r < .75 ? 'save' : 'post')(Math.random());
      const g = v === 'solo' ? seqGoalSolo(i) : v === 'pass' ? seqGoalPass(i) : v === 'tackle' ? seqTackle(i) : seqSave(i, v === 'post');
      E.co = g; E.coWait = 0; E.coDone = () => { if (!E.outcome) { E.outcome = ok ? 'goal' : 'tackle'; if (ok) { E.scores[i]++; screens(); } E.onEvent && E.onEvent(E.outcome); } E.phase = 'ready'; cb && cb(E.outcome); };
    },
    score(s0, s1, sub) { E.scores = [s0, s1]; if (sub != null) E.sub = sub; screens(); },
    sub(t) { E.sub = t; screens(); },
    // صافرة النهاية: الفائز يحتفل في وسط الملعب
    finale(win, cb) {
      E.phase = 'final'; E.co = null; B.mode = 'free'; B.vel.set(0, 0, 0); ball.position.set(0, .11, 0);
      [0, 1].forEach(t => E.pl[t].forEach((p, k) => {
        const ang = (k / 5) * Math.PI * 2 + t * .6, r = t === win || win < 0 ? 2.2 + (k % 2) * 1.2 : 0;
        const x = win < 0 ? (t ? 1 : -1) * (6 + k * 1.5) : t === win ? Math.cos(ang) * r : (t ? 1 : -1) * (14 + k * 1.6), z = win < 0 ? -3 + k * 1.6 : t === win ? Math.sin(ang) * r : -6 + k * 3;
        place(p, x, z, 0, 0); p.cel = t === win; p.sad = win >= 0 && t !== win;
      }));
      E.crowdJ = [win === 0 ? 1 : 0, win === 1 ? 1 : 0];
      E.cam.mode = 'orbit'; E.cam.c = V(0, 0, 0); E.cam.snap = true;
      if (win >= 0) confetti(V(0, 0, 0));
      E.sub = win < 0 ? 'تعادل' : '🏆 فوز ' + E.teams[win].name; screens();
      setTimeout0(3.2, () => cb && cb());
    },
    snapshot() { return R.domElement.toDataURL('image/jpeg', .85); },
    debug: E, renderer: R, ball, B
  };
  return api;
}
window.FootEngine = { supported, create, QUALITY };

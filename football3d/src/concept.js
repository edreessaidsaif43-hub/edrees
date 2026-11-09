import * as THREE from 'three';
import { RoomEnvironment } from './vendor/jsm/environments/RoomEnvironment.js';
import { buildStadium, drawScreen, HL } from './stadium.js';
import { buildPlayer, poseRun, poseGK, poseKick, buildBall, avatarTag } from './player.js';
import { loadImg } from './util.js';

(async () => {
  const P = new URLSearchParams(location.search);
  const W = innerWidth, H = innerHeight;
  const R = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  R.setPixelRatio(+P.get('pr') || 1); R.setSize(W, H); R.outputColorSpace = THREE.SRGBColorSpace; R.toneMapping = THREE.ACESFilmicToneMapping; R.toneMappingExposure = 1.05;
  R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFSoftShadowMap;
  document.getElementById('stage').appendChild(R.domElement);
  const S = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(R); const env = pm.fromScene(new RoomEnvironment(), .04).texture;
  const Q = { tex: 4096, crowd: 99999 };
  const st = buildStadium(R, S, Q, { env });
  const imgs = { boy: await loadImg(RACE_CHARS.boy), girl: await loadImg(RACE_CHARS.girl), girl2: await loadImg(RACE_CHARS.girl2) };

  // الإضاءة الليلية من الأبراج
  S.add(new THREE.HemisphereLight(0x9fb4ff, 0x203020, .55));
  const key = (x, z, i, sh) => { const d = new THREE.DirectionalLight(0xfff3e0, i); d.position.set(x, 60, z); d.target.position.set(x * .25, 0, z * .25); S.add(d.target); if (sh) { d.castShadow = true; d.shadow.mapSize.set(2048, 2048); const c = d.shadow.camera; c.left = -70; c.right = 70; c.top = 50; c.bottom = -50; c.near = 10; c.far = 200; d.shadow.bias = -.0004; d.shadow.normalBias = .02; } S.add(d); return d; };
  key(-75, -60, 1.25, true); key(75, 60, .9, true); key(75, -60, .55, false); key(-75, 60, .55, false);

  const ball = buildBall(env); S.add(ball);
  const RED = { main: 0xd81f3a, accent: 0xffffff, shorts: 0xffffff, socks: 0xd81f3a, env };
  const TEAL = { main: 0x0e9c95, accent: 0xffd23f, shorts: 0x0b2f4a, socks: 0x0e9c95, env };
  const add = (o, x, z, ry) => { o.position.set(x, 0, z); o.rotation.y = ry; S.add(o); return o; };
  const carrier = add(buildPlayer({ ...RED, num: '9', skin: 0xb47c56 }), 29.6, -2.4, Math.PI / 2 + .08); poseRun(carrier, 1.1, 1);
  ball.position.set(30.35, .11, -2.33);
  const def1 = add(buildPlayer({ ...TEAL, num: '4', skin: 0x8d5a3b, hair: 0x0e0b09 }), 36.2, .6, -Math.PI / 2 - .35); poseRun(def1, 3.6, 1);
  const def2 = add(buildPlayer({ ...TEAL, num: '5', skin: 0xd29a74 }), 41.5, -8.2, -Math.PI / 2 + .5); poseRun(def2, 5.2, .8);
  const mate = add(buildPlayer({ ...RED, num: '11', skin: 0xc68a62 }), 35.2, 8.6, Math.PI / 2 - .25); poseRun(mate, 4.4, 1);
  const mate2 = add(buildPlayer({ ...RED, num: '7', skin: 0xa8714f }), 24, 7, Math.PI / 2 - .1); poseRun(mate2, 2.2, .9);
  const gk = add(buildPlayer({ main: 0xffc928, accent: 0x14162b, shorts: 0x14162b, socks: 0xffc928, gk: true, num: '1', skin: 0xc68a62, env }), HL - 1.4, -.7, -Math.PI / 2 + .12); poseGK(gk);
  const tagA = avatarTag(imgs.boy, '#e53950'); tagA.position.set(0, 2.45, 0); tagA.scale.multiplyScalar(.72); carrier.add(tagA);
  const tagB = avatarTag(imgs.girl, '#16a3a0'); tagB.position.set(0, 2.45, 0); tagB.scale.multiplyScalar(.85); def1.add(tagB);

  st.screens.forEach(s => drawScreen(s, { s0: 1, s1: 0, n0: 'الصقور', n1: 'المها', c0: '#e53950', c1: '#16a3a0', img0: imgs.boy, img1: imgs.girl, sub: 'هجمة الصقور ⚽', title: 'ملعب المعرفة' }));

  const view = P.get('view') || 'main';
  const cam = new THREE.PerspectiveCamera(48, W / H, .1, 2000);
  if (view === 'main') { cam.position.set(+(P.get('cx')||23.2), +(P.get('cy')||3.3), +(P.get('cz')||-3.6)); cam.lookAt(+(P.get('lx')||50), +(P.get('ly')||2.6), +(P.get('lz')||-.6)); }
  else if (view === 'wide') { cam.fov = 45; cam.position.set(-40, 120, -190); cam.lookAt(10, 0, 0); }
  else if (view === 'close') { cam.fov = 35; cam.position.set(33.2, 1.25, -4.6); cam.lookAt(29.4, 1.2, -2.2); }
  else if (view === 'goal') {
    cam.fov = 50; cam.position.set(HL + 4.2, 1.9, 4.6); cam.lookAt(HL - 12, 1.1, -2.2);
    ball.position.set(HL + .75, 1.3, 1.9);
    gk.position.set(HL - .9, .55, -1.9); gk.rotation.set(0, -Math.PI / 2, 0); gk.rotateX(0); gk.rotation.z = 0; gk.rotateOnWorldAxis(new THREE.Vector3(1, 0, 0), -1.15);
    const u = gk.userData; u.armL.sh.rotation.set(0, 0, 2.6); u.armR.sh.rotation.set(0, 0, -2.6); u.armL.el.rotation.x = 0; u.armR.el.rotation.x = 0; u.legL.hp.rotation.set(-.2, 0, .3); u.legR.hp.rotation.set(.3, 0, -.2); u.legL.kn.rotation.x = .5; u.legR.kn.rotation.x = .9; u.spine.rotation.x = 0; u.hips.position.y = .98;
    carrier.position.set(HL - 14, 0, -3.6); carrier.rotation.y = Math.PI / 2 + .12; poseKick(carrier, .78);
    def1.position.set(HL - 9.5, 0, -1); def1.rotation.y = Math.PI / 2 + 2.6; poseRun(def1, 1.4, 1);
    mate.position.set(HL - 20, 0, 4); def2.position.set(HL - 12, 0, 5.5); def2.rotation.y = -Math.PI / 2 - .4;
    S.children.filter(o => o.isGroup && o.userData.net).forEach(gl => gl.userData.net.forEach(n => { const p = n.geometry.attributes.position; }));
  }
  cam.updateProjectionMatrix();
  R.render(S, cam);
  window.__done = true;
})();

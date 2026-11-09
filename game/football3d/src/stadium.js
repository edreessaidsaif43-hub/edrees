// ملعب كرة قدم ليلي — أرضية، خطوط، مرميان بشباك، لوحات إعلانية، مدرجات بطابقين وجمهور، أبراج إضاءة، شاشتان
import * as THREE from 'three';
import { mergeGeometries } from './vendor/jsm/utils/BufferGeometryUtils.js';
import { canvasTex, rnd, FONT } from './util.js';

export const PL = 105, PW = 68, HL = PL / 2, HW = PW / 2;  // أبعاد الملعب
export const GOAL_W = 7.32, GOAL_H = 2.44;

function pitchTexture(Q) {
  const MX = 115, MZ = 78, W = Q.tex || 4096, s = W / MX, H = Math.round(MZ * s);
  return canvasTex(W, H, (c) => {
    const X = x => (x + MX / 2) * s, Y = z => (z + MZ / 2) * s;
    // شرائط القص
    const n = 18, sw = PL / n;
    c.fillStyle = '#2f7d32'; c.fillRect(0, 0, W, H);
    for (let i = -2; i < n + 2; i++) { c.fillStyle = i % 2 ? '#2a742d' : '#348a37'; c.fillRect(X(-HL + i * sw), 0, sw * s + 1, H); }
    // دوائر قص خفيفة وضوضاء
    const r = rnd(7);
    for (let i = 0; i < 26000; i++) { const g = 90 + r() * 70; c.fillStyle = `rgba(${g * .45 | 0},${g | 0},${g * .4 | 0},${.05 + r() * .07})`; c.fillRect(r() * W, r() * H, 2 + r() * 4, 1 + r() * 3); }
    const gr = c.createRadialGradient(W / 2, H / 2, H * .1, W / 2, H / 2, W * .65); gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(1, 'rgba(0,0,0,.22)'); c.fillStyle = gr; c.fillRect(0, 0, W, H);
    // الخطوط
    c.strokeStyle = 'rgba(250,250,245,.95)'; c.lineWidth = .12 * s; c.lineJoin = 'round';
    const rect = (x0, z0, x1, z1) => c.strokeRect(X(x0), Y(z0), (x1 - x0) * s, (z1 - z0) * s);
    rect(-HL, -HW, HL, HW);
    c.beginPath(); c.moveTo(X(0), Y(-HW)); c.lineTo(X(0), Y(HW)); c.stroke();
    c.beginPath(); c.arc(X(0), Y(0), 9.15 * s, 0, Math.PI * 2); c.stroke();
    const spot = (x, z, rr = .2) => { c.fillStyle = '#fafaf5'; c.beginPath(); c.arc(X(x), Y(z), rr * s, 0, Math.PI * 2); c.fill(); };
    spot(0, 0, .3);
    [-1, 1].forEach(d => {
      const gx = d * HL;
      rect(Math.min(gx, gx - d * 16.5), -20.16, Math.max(gx, gx - d * 16.5), 20.16);
      rect(Math.min(gx, gx - d * 5.5), -9.16, Math.max(gx, gx - d * 5.5), 9.16);
      spot(gx - d * 11, 0);
      const a = Math.acos(5.5 / 9.15); c.beginPath();
      if (d > 0) c.arc(X(gx - 11), Y(0), 9.15 * s, Math.PI - a, Math.PI + a); else c.arc(X(gx + 11), Y(0), 9.15 * s, -a, a);
      c.stroke();
      [-1, 1].forEach(e => { c.beginPath(); c.arc(X(gx), Y(e * HW), 1 * s, d > 0 ? (e > 0 ? Math.PI : Math.PI / 2) : (e > 0 ? -Math.PI / 2 : 0), d > 0 ? (e > 0 ? Math.PI * 1.5 : Math.PI) : (e > 0 ? 0 : Math.PI / 2)); c.stroke(); });
    });
  });
}

function netTexture() {
  const t = canvasTex(64, 64, (c) => { c.clearRect(0, 0, 64, 64); c.strokeStyle = 'rgba(255,255,255,1)'; c.lineWidth = 3; c.beginPath(); c.moveTo(32, 0); c.lineTo(64, 32); c.lineTo(32, 64); c.lineTo(0, 32); c.closePath(); c.stroke(); });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function buildGoal(d, env) {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .25, metalness: .2, envMap: env, envMapIntensity: .8 });
  const R = .06, D = 2.2, W2 = GOAL_W / 2;
  const cyl = (len, ax) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 14), white); m.castShadow = true; if (ax === 'z') m.rotation.x = Math.PI / 2; if (ax === 'x') m.rotation.z = Math.PI / 2; return m; };
  [-1, 1].forEach(e => { const p = cyl(GOAL_H + R, 'y'); p.position.set(0, GOAL_H / 2, e * (W2 + R)); g.add(p); });
  const bar = cyl(GOAL_W + R * 4, 'z'); bar.position.set(0, GOAL_H + R / 2, 0); g.add(bar);
  // الإطار الخلفي
  const sup = new THREE.MeshStandardMaterial({ color: 0xdadde4, roughness: .5, metalness: .3 });
  [-1, 1].forEach(e => {
    const top = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, D * .55, 8), sup); top.rotation.z = Math.PI / 2; top.position.set(d * D * .27, GOAL_H, e * W2); g.add(top);
    const diag = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, Math.hypot(D * .45, GOAL_H), 8), sup); diag.position.set(d * (D * .55 + D * .45 / 2), GOAL_H / 2, e * W2); diag.rotation.z = d * Math.atan2(D * .45, GOAL_H); g.add(diag);
    const gb = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, D, 8), sup); gb.rotation.z = Math.PI / 2; gb.position.set(d * D / 2, .03, e * W2); g.add(gb);
  });
  const back = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, GOAL_W, 8), sup); back.rotation.x = Math.PI / 2; back.position.set(d * D, .03, 0); g.add(back);
  // الشبكة
  const nt = netTexture();
  const netM = (rx, ry) => { const t = nt.clone(); t.needsUpdate = true; t.repeat.set(rx, ry); return new THREE.MeshStandardMaterial({ map: t, alphaMap: null, transparent: true, alphaTest: .35, side: THREE.DoubleSide, roughness: .9, color: 0xf4f4f4, depthWrite: true }); };
  const cell = .16;
  const quad = (p, uvs) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p.flat(), 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs.flat(), 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g; };
  const xa = d * D * .55, xb = d * D, bl = Math.hypot(D * .45, GOAL_H), u1 = GOAL_W / cell;
  const netMat = () => { const t = nt.clone(); t.needsUpdate = true; return new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: .35, side: THREE.DoubleSide, roughness: .9, color: 0xf4f4f4 }); };
  const roof = new THREE.Mesh(quad([[0, GOAL_H, -W2], [0, GOAL_H, W2], [xa, GOAL_H, W2], [xa, GOAL_H, -W2]], [[0, 0], [u1, 0], [u1, D * .55 / cell], [0, D * .55 / cell]]), netMat()); g.add(roof);
  const bp = new THREE.Mesh(quad([[xa, GOAL_H, -W2], [xa, GOAL_H, W2], [xb, 0, W2], [xb, 0, -W2]], [[0, 0], [u1, 0], [u1, bl / cell], [0, bl / cell]]), netMat()); g.add(bp);
  // جانبان
  [-1, 1].forEach(e => {
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(0, GOAL_H); sh.lineTo(D * .55, GOAL_H); sh.lineTo(D, 0); sh.closePath();
    const sg = new THREE.ShapeGeometry(sh); const uv = sg.attributes.uv; const ps = sg.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, ps.getX(i) / cell, ps.getY(i) / cell);
    const t = nt.clone(); t.needsUpdate = true; const m = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: .35, side: THREE.DoubleSide, roughness: .9 }));
    if (d < 0) m.scale.x = -1; m.position.set(0, 0, e * W2); g.add(m);
  });
  g.userData.net = [roof, bp];
  return g;
}

function adTexture(i) {
  const items = [
    ['#0b1c4d', '#ffd23f', 'التحضير الذكي للمعلم العماني'],
    ['#d81f3a', '#ffffff', 'ملعب المعرفة ⚽'],
    ['#0e9c95', '#ffffff', 'altahdir.app'],
    ['#111522', '#7dffb0', 'تعلّم • العب • انتصر'],
    ['#ffd23f', '#14162b', 'ألعاب تعليمية لطلاب عُمان'],
    ['#1a2a6c', '#ffffff', 'التحضير الذكي'],
  ];
  const [bg, fg, txt] = items[i % items.length];
  return canvasTex(1024, 96, (c) => {
    c.fillStyle = bg; c.fillRect(0, 0, 1024, 96);
    const gr = c.createLinearGradient(0, 0, 0, 96); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(.5, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 1024, 96);
    c.fillStyle = fg; c.font = `800 58px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl'; c.fillText(txt, 512, 52);
    c.fillStyle = 'rgba(0,0,0,.25)'; for (let y = 0; y < 96; y += 3) c.fillRect(0, y, 1024, 1);
  });
}

function standProfile(rows, rd, rh, base = 0) {
  const s = new THREE.Shape(); s.moveTo(0, -2); s.lineTo(0, base);
  for (let r = 0; r < rows; r++) { s.lineTo(r * rd, base + (r + 1) * rh); s.lineTo((r + 1) * rd, base + (r + 1) * rh); }
  s.lineTo(rows * rd + .6, base + rows * rh + 1.2); s.lineTo(rows * rd + .6, -2); s.closePath(); return s;
}

export function buildStadium(R, S, Q, opts = {}) {
  const env = opts.env;
  const out = { screens: [], crowd: [] };
  // السماء
  const skyT = canvasTex(1024, 512, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 512); g.addColorStop(0, '#02040f'); g.addColorStop(.42, '#0a1534'); g.addColorStop(.5, '#1f2d5c'); g.addColorStop(.53, '#2b3354'); g.addColorStop(1, '#05070f');
    c.fillStyle = g; c.fillRect(0, 0, 1024, 512);
    const r = rnd(3); for (let i = 0; i < 900; i++) { const y = r() * 230; c.fillStyle = `rgba(255,255,255,${.25 + r() * .7})`; const z = r() < .06 ? 2 : 1; c.fillRect(r() * 1024, y, z, z); }
    const m = c.createRadialGradient(780, 90, 0, 780, 90, 40); m.addColorStop(0, 'rgba(255,250,230,1)'); m.addColorStop(.3, 'rgba(255,250,230,.9)'); m.addColorStop(.35, 'rgba(200,210,255,.25)'); m.addColorStop(1, 'rgba(200,210,255,0)'); c.fillStyle = m; c.fillRect(700, 30, 160, 120);
  });
  skyT.mapping = THREE.EquirectangularReflectionMapping; S.background = skyT;
  S.fog = new THREE.Fog(0x0a1230, 260, 620);

  // الأرض المحيطة
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: 0x15201a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -.05; ground.receiveShadow = true; S.add(ground);
  // الحافة حول الملعب (عشب صناعي داكن)
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(PL + 26, PW + 22), new THREE.MeshStandardMaterial({ color: 0x1f5a28, roughness: .95 }));
  apron.rotation.x = -Math.PI / 2; apron.position.y = -.02; apron.receiveShadow = true; S.add(apron);
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(115, 78), new THREE.MeshStandardMaterial({ map: pitchTexture(Q), roughness: .92, metalness: 0 }));
  pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; S.add(pitch);

  // المرميان
  out.goals = [-1, 1].map(d => { const g = buildGoal(d, env); g.position.x = d * HL; S.add(g); return g; });
  // رايات الزوايا
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b], i) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 1.6, 6), new THREE.MeshStandardMaterial({ color: 0xffffff })); p.position.set(a * HL, .8, b * HW); S.add(p);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(.45, .32), new THREE.MeshStandardMaterial({ color: i % 2 ? 0xffd23f : 0xd81f3a, side: THREE.DoubleSide })); f.position.set(a * HL + .22, 1.43, b * HW); S.add(f);
  });

  // اللوحات الإعلانية
  const boardH = 1, boardY = .5;
  const boardMats = Array.from({ length: 6 }, (_, i) => new THREE.MeshStandardMaterial({ map: adTexture(i), emissiveMap: adTexture(i), emissive: 0xffffff, emissiveIntensity: .9, roughness: .4 }));
  const darkM = new THREE.MeshStandardMaterial({ color: 0x0c0e16, roughness: .6 });
  let bi = 0;
  const addBoards = (len, pos, rotY) => {
    const n = Math.round(len / 12), w = len / n;
    for (let k = 0; k < n; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w - .05, boardH, .25), [darkM, darkM, darkM, darkM, boardMats[bi++ % 6], darkM]);
      const g = new THREE.Group(); g.add(m); m.position.x = -len / 2 + w * (k + .5); g.position.copy(pos); g.position.y = boardY; g.rotation.y = rotY; S.add(g);
    }
  };
  addBoards(PL + 10, new THREE.Vector3(0, 0, -HW - 4.5), 0);
  addBoards(PL + 10, new THREE.Vector3(0, 0, HW + 4.5), Math.PI);
  addBoards(PW - 4, new THREE.Vector3(-HL - 5, 0, 0), Math.PI / 2);
  addBoards(PW - 4, new THREE.Vector3(HL + 5, 0, 0), -Math.PI / 2);

  // المدرجات: طابقان + سقف
  const concrete = new THREE.MeshStandardMaterial({ color: 0x3b4152, roughness: .9, side: THREE.DoubleSide });
  const seatsM = new THREE.MeshStandardMaterial({ color: 0x1b2a6c, roughness: .7 });
  const fasciaMats = [new THREE.MeshStandardMaterial({ map: adTexture(0), emissiveMap: adTexture(0), emissive: 0xffffff, emissiveIntensity: .8 }), new THREE.MeshStandardMaterial({ map: adTexture(1), emissiveMap: adTexture(1), emissive: 0xffffff, emissiveIntensity: .8 })];
  const roofM = new THREE.MeshStandardMaterial({ color: 0xe6e9f0, roughness: .5, metalness: .4, side: THREE.DoubleSide, emissive: 0x2a3042 });
  const trussM = new THREE.MeshStandardMaterial({ color: 0xb8bfcc, roughness: .4, metalness: .6 });
  const lampM = new THREE.MeshBasicMaterial({ color: 0xfff6e0 });
  const glowT = canvasTex(128, 128, (c) => { const g = c.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,250,235,1)'); g.addColorStop(.15, 'rgba(255,245,220,.75)'); g.addColorStop(.45, 'rgba(200,215,255,.18)'); g.addColorStop(1, 'rgba(200,215,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 128, 128); });
  const crowdPts = []; // {x,y,z,ry,team}
  const r = rnd(11);
  const lowRows = 16, upRows = 14, rd = .85, rh = .42;
  const stands = [
    { len: PL + 18, dist: HW + 7.5, rot: 0, side: 0 },
    { len: PL + 18, dist: HW + 7.5, rot: Math.PI, side: 1 },
    { len: PW + 8, dist: HL + 8.5, rot: Math.PI / 2, side: 2 },
    { len: PW + 8, dist: HL + 8.5, rot: -Math.PI / 2, side: 3 },
  ];
  const lampGeo = new THREE.BoxGeometry(.9, .25, .5);
  stands.forEach((st, si) => {
    const grp = new THREE.Group(); grp.rotation.y = st.rot;
    // الطابق السفلي
    const prof1 = standProfile(lowRows, rd, rh, 1.2);
    const g1 = new THREE.ExtrudeGeometry(prof1, { depth: st.len, bevelEnabled: false });
    const m1 = new THREE.Mesh(g1, concrete); m1.rotation.y = -Math.PI / 2; m1.position.set(st.len / 2, 0, -st.dist); m1.scale.x = -1;
    // الإسقاط: المحور x للشكل = بُعد عن الملعب (للخارج = -z)، y = ارتفاع
    const lowerG = new THREE.Group(); lowerG.add(m1); grp.add(lowerG);
    m1.receiveShadow = true;
    const z0 = -st.dist;
    // الواجهة الإعلانية بين الطابقين
    const fz = z0 - lowRows * rd - 1.6, fy = 1.2 + lowRows * rh + 2.2;
    const fas = new THREE.Mesh(new THREE.PlaneGeometry(st.len, 1.4), fasciaMats[si % 2]); fas.material.map.wrapS = THREE.RepeatWrapping; fas.position.set(0, fy - .2, fz + .05); grp.add(fas);
    // الطابق العلوي
    const prof2 = standProfile(upRows, rd, rh * 1.25, 0);
    const g2 = new THREE.ExtrudeGeometry(prof2, { depth: st.len, bevelEnabled: false });
    const m2 = new THREE.Mesh(g2, concrete); m2.rotation.y = -Math.PI / 2; m2.scale.x = -1; m2.position.set(st.len / 2, fy + .5, fz); grp.add(m2);
    // الجمهور
    const addRows = (rows, zs, ys, rhh, upper) => {
      for (let rr = 0; rr < rows; rr++) {
        const y = ys + (rr + 1) * rhh, z = zs - rr * rd - rd * .55;
        for (let x = -st.len / 2 + .6; x < st.len / 2 - .6; x += .58) {
          if (r() > (Q.crowdFill || .9)) continue;
          if (upper && si >= 2 && Math.abs(x) < 10.8) continue;
          crowdPts.push({ grp, x: x + (r() - .5) * .12, y, z, team: si === 1 || si === 2 ? 0 : 1 });
        }
      }
    };
    addRows(lowRows, z0, 1.2, rh);
    addRows(upRows, fz, fy + .5, rh * 1.25, true);
    // السقف
    const backZ = fz - upRows * rd - .6, topY = fy + .5 + upRows * rh * 1.25 + 1.2;
    const roofDepth = (backZ - z0) * -1 + 4;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(st.len + 2, .35, roofDepth), roofM); roof.position.set(0, topY + 6, backZ + roofDepth / 2 - 1); roof.rotation.x = -.08; grp.add(roof);
    // دعامات
    for (let x = -st.len / 2; x <= st.len / 2 + .1; x += st.len / Math.round(st.len / 12)) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(.5, topY + 6, .5), trussM); col.position.set(x, (topY + 6) / 2, backZ - .3); grp.add(col);
      const tr = new THREE.Mesh(new THREE.BoxGeometry(.35, 1.4, roofDepth), trussM); tr.position.set(x, topY + 6.9, backZ + roofDepth / 2 - 1); tr.rotation.x = -.08; grp.add(tr);
    }
    // جدار خلفي
    const wall = new THREE.Mesh(new THREE.BoxGeometry(st.len, topY + 6, .4), concrete); wall.position.set(0, (topY + 6) / 2, backZ - .6); grp.add(wall);
    // أضواء حافة السقف
    const nl = Math.floor(st.len / 3.2);
    const lamps = new THREE.InstancedMesh(lampGeo, lampM, nl); const mm = new THREE.Matrix4();
    const frontZ = backZ + roofDepth - 1.4, frontY = topY + 6 + Math.sin(.08) * roofDepth * .5 - .5;
    for (let k = 0; k < nl; k++) { mm.makeRotationX(-.5); mm.setPosition(-st.len / 2 + (k + .5) * st.len / nl, frontY, frontZ); lamps.setMatrixAt(k, mm); }
    grp.add(lamps);
    st.front = { y: frontY, z: frontZ }; st.grp = grp; st.topY = topY; st.backZ = backZ; st.fz = fz; st.fy = fy;
    // توهّج أضواء السقف
    for (let k = 0; k < nl; k += 3) { const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .55, fog: false })); gl.scale.setScalar(5); gl.position.set(-st.len / 2 + (k + .5) * st.len / nl, frontY - .4, frontZ + .3); grp.add(gl); }
    S.add(grp);
  });

  // الجمهور (مثيلات)
  {
    const N = Math.min(crowdPts.length, Q.crowd || 99999);
    const pick = crowdPts.length > N ? crowdPts.filter((_, i) => i % Math.ceil(crowdPts.length / N) === 0) : crowdPts;
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(.44, .62, .3), new THREE.MeshStandardMaterial({ roughness: .8 }), pick.length);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshStandardMaterial({ roughness: .7 }), pick.length);
    const arms = new THREE.InstancedMesh(new THREE.BoxGeometry(.1, .5, .1), new THREE.MeshStandardMaterial({ roughness: .8 }), pick.length * 2);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), c = new THREE.Color(), sc = new THREE.Vector3(1, 1, 1);
    const teamCols = [[0xd81f3a, 0xe53950, 0xffffff, 0xb3162e, 0xff4a5e], [0x0e9c95, 0x16a3a0, 0xffd23f, 0x0b7d78, 0xffffff]];
    const misc = [0xffffff, 0x222633, 0x6b7bb3, 0xdcdcdc, 0x3a3f55];
    const skins = [0xf3d2b8, 0xeec4a4, 0xf6dcc6, 0xe8bb98, 0xf0caa8];
    const wm = new THREE.Matrix4();
    pick.forEach((p, i) => {
      p.grp.updateMatrixWorld();
      v.set(p.x, p.y + .31, p.z); const wp = v.clone().applyMatrix4(p.grp.matrixWorld);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.grp.rotation.y + (r() - .5) * .4);
      m.compose(wp, q, sc); body.setMatrixAt(i, m);
      const col = r() < .78 ? teamCols[p.team][Math.floor(r() * 5)] : misc[Math.floor(r() * 5)];
      body.setColorAt(i, c.setHex(col));
      const hp = wp.clone(); hp.y += .44; m.compose(hp, q, sc); head.setMatrixAt(i, m); head.setColorAt(i, c.setHex(skins[Math.floor(r() * 5)]));
      const up = r() < .3;
      [-1, 1].forEach((s, k) => {
        const ap = new THREE.Vector3(s * .27, up ? .55 : .02, 0).applyQuaternion(q).add(wp);
        const aq = q.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), up ? s * .25 : s * .08));
        m.compose(ap, aq, sc); arms.setMatrixAt(i * 2 + k, m); arms.setColorAt(i * 2 + k, c.setHex(col));
      });
    });
    // قفز الجمهور عند الهدف: سمة لكل مثيل (الفريق + الطور) وتعديل في الـ shader
    const U = { uTime: { value: 0 }, uJ0: { value: 0 }, uJ1: { value: 0 } };
    const addAttr = (o, per) => {
      const n = o.count, tm = new Float32Array(n), ph = new Float32Array(n);
      for (let i = 0; i < n; i++) { const p = pick[Math.floor(i / per)]; tm[i] = p.team; ph[i] = (Math.floor(i / per) * 0.6180339) % 1; }
      o.geometry.setAttribute('aTeam', new THREE.InstancedBufferAttribute(tm, 1)); o.geometry.setAttribute('aPh', new THREE.InstancedBufferAttribute(ph, 1));
      o.material.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, U);
        sh.vertexShader = 'attribute float aTeam;\nattribute float aPh;\nuniform float uTime, uJ0, uJ1;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float jj = aTeam < .5 ? uJ0 : uJ1; transformed.y += jj * max(0., sin(uTime * 11. + aPh * 6.2831)) * .38 + (1. - jj) * sin(uTime * 1.7 + aPh * 6.2831) * .015;');
      };
    };
    addAttr(body, 1); addAttr(head, 1); addAttr(arms, 2);
    [body, head, arms].forEach(o => { o.instanceMatrix.needsUpdate = true; o.instanceColor.needsUpdate = true; o.frustumCulled = false; S.add(o); });
    out.crowd = { body, head, arms, pick, U };
  }

  // أعلام عُمان في المدرجات
  const flagT = canvasTex(192, 96, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 192, 32); c.fillStyle = '#d81f3a'; c.fillRect(0, 32, 192, 32); c.fillStyle = '#108a3e'; c.fillRect(0, 64, 192, 32); c.fillStyle = '#d81f3a'; c.fillRect(0, 0, 56, 96); });
  const flagM = new THREE.MeshStandardMaterial({ map: flagT, side: THREE.DoubleSide, roughness: .8 });
  for (let i = 0; i < 18; i++) {
    const st = stands[i % 4], f = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1, 8, 1), flagM);
    const pa = f.geometry.attributes.position; for (let k = 0; k < pa.count; k++) pa.setZ(k, Math.sin(pa.getX(k) * 2.4 + i) * .18);
    f.position.set((r() - .5) * st.len * .85, 1.2 + (3 + r() * 9) * rh + 1.4, -st.dist - (3 + r() * 9) * rd); f.rotation.x = -.2; st.grp.add(f);
  }

  // أبراج الإضاءة
  const towerM = new THREE.MeshStandardMaterial({ color: 0x8e96a8, roughness: .5, metalness: .6 });
  out.towers = [];
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => {
    const t = new THREE.Group(); t.position.set(a * (HL + 22), 0, b * (HW + 26));
    const H = 52;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.55, 1.4, H, 8), towerM); mast.position.y = H / 2; t.add(mast);
    const head = new THREE.Group(); head.position.y = H + 2; t.add(head);
    head.lookAt(new THREE.Vector3(-a * 60, -40, -b * 60).add(t.position));
    const frame = new THREE.Mesh(new THREE.BoxGeometry(11, 7, .6), new THREE.MeshStandardMaterial({ color: 0x2a2f3c, roughness: .6, metalness: .5 })); head.add(frame);
    const lg = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.1, .3), lampM, 24); const mm = new THREE.Matrix4();
    for (let k = 0; k < 24; k++) { mm.makeTranslation(-4.5 + (k % 6) * 1.8, -2.6 + Math.floor(k / 6) * 1.75, .4); lg.setMatrixAt(k, mm); } head.add(lg);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowT, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .9, fog: false })); glow.scale.setScalar(34); glow.position.z = 1.5; head.add(glow);
    S.add(t); out.towers.push(t);
  });

  // الشاشتان خلف المرميين
  const mkScreen = (si) => {
    const st = stands[si]; const c = document.createElement('canvas'); c.width = 1024; c.height = 448;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(18, 7.9), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    const fr = new THREE.Mesh(new THREE.BoxGeometry(19.2, 9, .6), new THREE.MeshStandardMaterial({ color: 0x14161f, roughness: .5 }));
    const g = new THREE.Group(); g.add(fr); scr.position.z = .31; g.add(scr);
    g.position.set(0, st.fy + 5.6, st.fz - 3.2); g.rotation.x = -.12; st.grp.add(g);
    return { c, tex, g };
  };
  out.screens = [mkScreen(2), mkScreen(3)];
  out.stands = stands;
  return out;
}

export function drawScreen(scr, d) {
  const c = scr.c.getContext('2d'), W = 1024, H = 448;
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0b1440'); g.addColorStop(1, '#060a20'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.direction = 'rtl';
  c.fillStyle = '#ffd23f'; c.font = `800 46px ${FONT}`; c.fillText(d.title || 'ملعب المعرفة', W / 2, 52);
  const team = (x, col, name, img) => {
    c.fillStyle = col; c.beginPath(); c.arc(x, 200, 82, 0, Math.PI * 2); c.fill();
    c.save(); c.beginPath(); c.arc(x, 200, 72, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.clip(); if (img) { const s = 144 / img.width * 1.9; c.drawImage(img, x - img.width * s / 2, 128 + 8, img.width * s, img.height * s); } c.restore();
    c.fillStyle = '#fff'; c.font = `800 40px ${FONT}`; c.fillText(name, x, 330);
  };
  team(W - 170, d.c0, d.n0, d.img0); team(170, d.c1, d.n1, d.img1);
  c.fillStyle = '#ffffff'; c.font = `900 150px ${FONT}`; c.direction = 'ltr'; c.fillText(`${d.s1}  -  ${d.s0}`, W / 2, 215);
  c.fillStyle = '#7dffb0'; c.font = `800 36px ${FONT}`; c.direction = 'rtl'; c.fillText(d.sub || '', W / 2, 330);
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(0, H - 60, W, 60); c.fillStyle = '#fff'; c.font = `700 30px ${FONT}`; c.fillText(d.foot || 'التحضير الذكي للمعلم العماني', W / 2, H - 30);
  c.fillStyle = 'rgba(0,0,0,.18)'; for (let y = 0; y < H; y += 4) c.fillRect(0, y, W, 1);
  scr.tex.needsUpdate = true;
}

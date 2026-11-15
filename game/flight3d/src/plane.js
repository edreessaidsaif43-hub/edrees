// الطائرات: مروحية صغيرة (افتراضية)، نفاثة، هليكوبتر — المقدمة نحو -z
import * as THREE from 'three';
import { canvasTex } from './util.js';
import { buildKid } from './kid.js';
import { toon, outline } from './toon.js';

const M = (c, r, m, o = {}) => toon(c, o);
function bodyTex() {
  // u حول الجسم: 0 البطن، .25 الجانب الأيمن، .5 الظهر، .75 الجانب الأيسر — v: 0 المقدمة (أسفل اللوحة)
  return canvasTex(1024, 1024, (c) => {
    c.fillStyle = '#f7f7f5'; c.fillRect(0, 0, 1024, 1024);
    c.fillStyle = '#d9dde2'; c.fillRect(0, 0, 150, 1024); c.fillRect(874, 0, 150, 1024);
    // شريطا العلم على الجانبين: الأخضر أسفل والأحمر فوقه
    c.fillStyle = '#108040'; c.fillRect(200, 60, 46, 840); c.fillRect(778, 60, 46, 840);
    c.fillStyle = '#c8202a'; c.fillRect(262, 60, 46, 840); c.fillRect(716, 60, 46, 840);
    // المقدمة حمراء
    c.fillStyle = '#c8202a'; c.fillRect(0, 900, 1024, 124);
    c.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 120; y < 900; y += 130) c.fillRect(0, y, 1024, 2);
    const hl = c.createLinearGradient(440, 0, 584, 0); hl.addColorStop(0, 'rgba(255,255,255,0)'); hl.addColorStop(.5, 'rgba(255,255,255,1)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = hl; c.fillRect(440, 140, 144, 700);
  });
}
function finTex() {
  return canvasTex(256, 256, (c) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, 256, 86); c.fillStyle = '#c8202a'; c.fillRect(0, 86, 256, 84); c.fillStyle = '#108040'; c.fillRect(0, 170, 256, 86); c.fillStyle = '#c8202a'; c.fillRect(0, 0, 80, 256); c.fillStyle = '#ffffff'; c.font = 'bold 54px sans-serif'; c.textAlign = 'center'; c.fillText('⚔', 40, 64); });
}
// جناح بمقطع انسيابي يُبثق على طول الجناح (x)
function wing(span, chord, thick, sweep = 0, taper = .7, mat) {
  const s = new THREE.Shape(), n = 16;
  for (let i = 0; i <= n; i++) { const t = i / n, x = t * chord, y = thick * 5 * (.2969 * Math.sqrt(t) - .126 * t - .3516 * t * t + .2843 * t ** 3 - .1015 * t ** 4) * chord; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  for (let i = n; i >= 0; i--) { const t = i / n, x = t * chord, y = -thick * 5 * (.2969 * Math.sqrt(t) - .126 * t - .3516 * t * t + .2843 * t ** 3 - .1015 * t ** 4) * chord * .6; s.lineTo(x, y); }
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: false, steps: 8 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const zz = p.getZ(i) / span, k = 1 - (1 - taper) * zz; p.setX(i, p.getX(i) * k + zz * sweep); p.setY(i, p.getY(i) * k); }
  g.computeVertexNormals();
  g.rotateY(-Math.PI / 2); // الطول على x، المقطع على z (المقدمة -z)
  const m = new THREE.Mesh(g, mat); m.castShadow = true; m.userData.noOut = 1; return m;
}
export function buildProp(kidType, env) {
  const g = new THREE.Group(), u = g.userData;
  const wht = M(0xf7f7f5, .3, .1), red = M(0xc8202a, .35, .1), green = M(0x108040, .35, .1), dark = M(0x1d2026, .5, .4), chrome = M(0xd8dbe0, .2, .9);
  // الجسم
  const prof = [[0, -.15], [.32, 0], [.52, .5], [.62, 1.4], [.64, 2.4], [.58, 3.4], [.42, 4.6], [.22, 5.8], [.1, 6.5], [0, 6.6]];
  const lg = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 40); lg.rotateX(Math.PI / 2); lg.translate(0, 0, -3.4);
  const bt = bodyTex(); const body = new THREE.Mesh(lg, toon(0xffffff, { map: bt })); body.castShadow = true; body.scale.set(1, .92, 1); g.add(body);
  // غطاء المحرك والمروحة
  const spin = new THREE.Mesh(new THREE.ConeGeometry(.24, .6, 24), red); spin.rotation.x = -Math.PI / 2; spin.position.z = -3.55; g.add(spin);
  const prop = new THREE.Group(); prop.position.z = -3.3; g.add(prop); u.prop = prop;
  [0, Math.PI].forEach(a => { const b = new THREE.Mesh(new THREE.BoxGeometry(.14, 1.25, .05), dark); b.position.y = .62; b.userData.noOut = 1; const h = new THREE.Group(); h.rotation.z = a; h.add(b); const tip = new THREE.Mesh(new THREE.BoxGeometry(.15, .16, .055), M(0xffd23f, .4)); tip.position.y = 1.18; tip.userData.noOut = 1; h.add(tip); prop.add(h); });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.32, 48), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide })); disc.position.z = -3.31; g.add(disc); u.disc = disc;
  // فتحات العادم
  [-1, 1].forEach(s => { const ex = new THREE.Mesh(new THREE.CylinderGeometry(.05, .06, .3, 8), chrome); ex.rotation.z = Math.PI / 2; ex.position.set(s * .6, -.2, -2.2); ex.userData.noOut = 1; g.add(ex); });
  // الجناحان (منخفضان) بأطراف حمراء
  [-1, 1].forEach(s => {
    const w = wing(4.6, 1.7, .14, -.25, .62, wht); w.position.set(0, -.32, -1.15); if (s < 0) { w.scale.x = -1; } g.add(w);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.12, 12, 8), red); tip.scale.set(1.2, .7, 5.5); tip.position.set(s * 4.55, -.3, -.6); g.add(tip);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), new THREE.MeshBasicMaterial({ color: s > 0 ? 0x30ff60 : 0xff3030 })); nav.position.set(s * 4.62, -.28, -1.05); nav.userData.noOut = 1; g.add(nav);
    const str = new THREE.Mesh(new THREE.BoxGeometry(1.4, .05, .3), green); str.position.set(s * 3.4, -.22, -.55); str.userData.noOut = 1; g.add(str);
  });
  // الذيل
  [-1, 1].forEach(s => { const t = wing(1.7, .95, .1, -.2, .6, wht); t.position.set(0, .05, 2.25); if (s < 0) t.scale.x = -1; g.add(t); });
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(1.5, 0); fs.lineTo(1.45, 1.55); fs.lineTo(.85, 1.6); fs.closePath();
  const fg = new THREE.ExtrudeGeometry(fs, { depth: .08, bevelEnabled: true, bevelThickness: .03, bevelSize: .03, bevelSegments: 2 }); fg.rotateY(-Math.PI / 2); fg.translate(.04, .1, 1.6);
  const ft = finTex(); const fin = new THREE.Mesh(fg, toon(0xffffff, { map: ft })); fin.userData.noOut = 1; fin.castShadow = true; g.add(fin);
  // عجلات ثابتة بأغطية انسيابية
  [-1, 1].forEach(s => { const leg = new THREE.Mesh(new THREE.BoxGeometry(.08, .75, .2), wht); leg.position.set(s * 1.1, -.75, -1); leg.rotation.z = s * .35; g.add(leg); const pant = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .55, 6, 14), red); pant.rotation.x = Math.PI / 2; pant.position.set(s * 1.32, -1.12, -1); g.add(pant); });
  // قمرة القيادة الزجاجية والطالب داخلها
  const kid = buildKid(kidType, { bust: true }); kid.scale.setScalar(1.34); kid.rotation.y = Math.PI; kid.position.set(0, -.86, -.12);
  const ku = kid.userData; ku.armL.sh.rotation.set(-1.1, 0, .25); ku.armR.sh.rotation.set(-1.1, 0, -.25); ku.armL.el.rotation.x = -.6; ku.armR.el.rotation.x = -.6;
  g.add(kid); u.kid = kid;
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.7, .9, .2), dark); seat.position.set(0, .05, .35); seat.userData.noOut = 1; g.add(seat);
  const can = new THREE.Mesh(new THREE.SphereGeometry(.7, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xdff2ff, roughness: .04, metalness: 0, transparent: true, opacity: .08, envMapIntensity: .35, depthWrite: false, specularIntensity: .6 })); can.scale.set(1.08, 1.45, 1.9); can.position.set(0, .42, -.12); g.add(can);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(.63, .035, 6, 32, Math.PI), dark); frame.position.set(0, .42, -.12); frame.rotation.y = Math.PI / 2; frame.scale.set(1.9, 1.5, 1.1); frame.userData.noOut = 1; g.add(frame);
  // ضوء أحمر وامض أسفل الجسم
  const bcn = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); bcn.position.set(0, -.62, .8); bcn.userData.noOut = 1; g.add(bcn); u.beacon = bcn;
  g.traverse(o => { if (o.isMesh && o.material && 'envMapIntensity' in o.material && !o.userData.isOut) o.material.envMapIntensity = o.material.envMapIntensity || 1; });
  outline(g, .018);
  u.kind = 'prop';
  return g;
}
export function animPlane(p, t, dt, boost = 0) {
  const u = p.userData;
  if (u.prop) u.prop.rotation.z += dt * 55;
  if (u.beacon) u.beacon.visible = (t % 1.2) < .12;
  if (u.rotor) u.rotor.rotation.y += dt * 30;
  if (u.trotor) u.trotor.rotation.x += dt * 45;
  if (u.flame) { const k = .7 + boost * .9 + Math.sin(t * 40) * .08; u.flame.scale.set(1, k, 1); u.flame.position.z = 3.95 + 1.3 * k; }
}

// ---------- نفاثة رشيقة ----------
export function buildJet(kidType) {
  const g = new THREE.Group(), u = g.userData;
  const wht = toon(0xffffff), red = toon(0xd8102a), green = toon(0x0a9a4a), dark = toon(0x1d2026), metal = toon(0xb8c0cc);
  const prof = [[0, -.1], [.18, .3], [.42, 1.2], [.6, 2.6], [.66, 3.8], [.64, 5.2], [.55, 6.6], [.5, 7.4], [.46, 7.6]];
  const lg = new THREE.LatheGeometry(prof.map(p => new THREE.Vector2(p[0], p[1])), 40); lg.rotateX(Math.PI / 2); lg.translate(0, 0, -4);
  const body = new THREE.Mesh(lg, toon(0xffffff, { map: bodyTex() })); body.scale.set(1, .9, 1); body.castShadow = true; g.add(body);
  // جناحان مثلثيان مائلان
  [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(s * 4.4, 2.2); sh.lineTo(s * 4.4, 3.1); sh.lineTo(0, 3.3); sh.closePath(); const wg = new THREE.ExtrudeGeometry(sh, { depth: .14, bevelEnabled: true, bevelThickness: .05, bevelSize: .05, bevelSegments: 2 }); wg.rotateX(Math.PI / 2); const w = new THREE.Mesh(wg, wht); w.position.set(0, -.15, -.2); w.castShadow = true; w.userData.noOut = 1; g.add(w); const tip = new THREE.Mesh(new THREE.BoxGeometry(.12, .5, 1), red); tip.position.set(s * 4.42, 0, 2.6); g.add(tip); const str = new THREE.Mesh(new THREE.BoxGeometry(2.4, .04, .3), green); str.position.set(s * 2.6, -.05, 2.1); str.rotation.y = -s * .45; str.userData.noOut = 1; g.add(str); });
  // ذيلان عموديان ومثبّتان أفقيان
  [-1, 1].forEach(s => { const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(1.6, 0); fs.lineTo(1.9, 1.7); fs.lineTo(1.2, 1.75); fs.closePath(); const fg = new THREE.ExtrudeGeometry(fs, { depth: .08, bevelEnabled: false }); fg.rotateY(-Math.PI / 2); const f = new THREE.Mesh(fg, toon(0xffffff, { map: finTex() })); f.position.set(s * .45, .3, 1.7); f.rotation.z = -s * .25; f.userData.noOut = 1; g.add(f); const hs = new THREE.Mesh(new THREE.BoxGeometry(1.7, .08, 1), wht); hs.position.set(s * 1.1, 0, 3.2); hs.rotation.y = -s * .3; hs.userData.noOut = 1; g.add(hs); });
  // فتحتا الهواء والعادم واللهب
  [-1, 1].forEach(s => { const it = new THREE.Mesh(new THREE.CylinderGeometry(.28, .32, 1.2, 16, 1, true), dark); it.rotation.x = Math.PI / 2; it.position.set(s * .62, -.15, .2); g.add(it); });
  const noz = new THREE.Mesh(new THREE.CylinderGeometry(.42, .5, .6, 20, 1, true), metal); noz.rotation.x = Math.PI / 2; noz.position.z = 3.8; g.add(noz);
  const flT = canvasTex(64, 256, (c) => { const gr = c.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,220,90,1)'); gr.addColorStop(.6, 'rgba(255,110,40,.8)'); gr.addColorStop(1, 'rgba(255,60,40,0)'); c.fillStyle = gr; c.fillRect(0, 0, 64, 256); });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(.38, 2.6, 16, 1, true), new THREE.MeshBasicMaterial({ map: flT, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, side: THREE.DoubleSide })); flame.rotation.x = -Math.PI / 2; flame.position.z = 5.3; g.add(flame); u.flame = flame;
  // قمرة القيادة والطيار
  const kid = buildKid(kidType, { bust: true }); kid.scale.setScalar(1.2); kid.rotation.y = Math.PI; kid.position.set(0, -.62, -1.6); const ku = kid.userData; ku.armL.sh.rotation.set(-1.1, 0, .25); ku.armR.sh.rotation.set(-1.1, 0, -.25); ku.armL.el.rotation.x = -.6; ku.armR.el.rotation.x = -.6; g.add(kid); u.kid = kid;
  const can = new THREE.Mesh(new THREE.SphereGeometry(.7, 32, 18, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: .05, transparent: true, opacity: .12, depthWrite: false })); can.scale.set(.85, 1.15, 2.4); can.position.set(0, .38, -1.5); g.add(can);
  outline(g, .02); u.kind = 'jet';
  return g;
}
// ---------- هليكوبتر ----------
export function buildHeli(kidType) {
  const g = new THREE.Group(), u = g.userData;
  const red = toon(0xd8102a), wht = toon(0xffffff), green = toon(0x0a9a4a), dark = toon(0x1d2026), glassM = new THREE.MeshPhysicalMaterial({ color: 0xbfe6ff, roughness: .05, transparent: true, opacity: .16, depthWrite: false });
  const gap = 2.3, T0 = Math.PI * .12, T1 = Math.PI * .66; let cab = null;
  [[0, Math.PI * 2, 0, T0], [Math.PI * 1.5 + gap / 2, Math.PI * 2 - gap, T0, T1 - T0], [0, Math.PI * 2, T1, Math.PI - T1]].forEach(([p0, pl, t0, tl]) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1.35, 40, 28, p0, pl, t0, tl), red); m.scale.set(1, .95, 1.25); m.castShadow = true; g.add(m); cab = cab || m; });
  const seatH = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, .3), dark); seatH.position.set(0, -.35, .55); seatH.userData.noOut = 1; g.add(seatH);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(1.36, .12, 8, 40), wht); stripe.rotation.y = Math.PI / 2; stripe.scale.set(1, .95, 1.25); g.add(stripe);
  const glass = new THREE.Mesh(new THREE.SphereGeometry(1.36, 32, 20, Math.PI * 1.5 - 1.2, 2.4, Math.PI * .1, Math.PI * .58), glassM); glass.scale.set(1, .95, 1.25); g.add(glass);
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(.18, .38, 4.6, 16), wht); boom.rotation.x = Math.PI / 2; boom.position.set(0, .25, 3.3); g.add(boom);
  const bs = new THREE.Mesh(new THREE.CylinderGeometry(.19, .26, 1.6, 16), green); bs.rotation.x = Math.PI / 2; bs.position.set(0, .25, 4.6); g.add(bs);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.3, .9), red); fin.position.set(0, .8, 5.5); g.add(fin);
  const hs = new THREE.Mesh(new THREE.BoxGeometry(1.6, .08, .5), red); hs.position.set(0, .3, 5); g.add(hs);
  const tr = new THREE.Group(); tr.position.set(.16, .9, 5.6); g.add(tr); [0, Math.PI / 2].forEach(a => { const b = new THREE.Mesh(new THREE.BoxGeometry(.04, 1.1, .1), dark); b.rotation.x = a; b.userData.noOut = 1; tr.add(b); }); u.trotor = tr;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .6, 10), dark); mast.position.set(0, 1.55, 0); g.add(mast);
  const rotor = new THREE.Group(); rotor.position.set(0, 1.85, 0); g.add(rotor); u.rotor = rotor;
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.28, .05, 4.8), dark); b.position.z = 2.4; const h = new THREE.Group(); h.rotation.y = i * Math.PI / 2; h.add(b); b.userData.noOut = 1; const tp = new THREE.Mesh(new THREE.BoxGeometry(.3, .06, .3), toon(0xffd21a)); tp.position.z = 4.7; tp.userData.noOut = 1; h.add(tp); rotor.add(h); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.9, 48), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: .1, depthWrite: false, side: THREE.DoubleSide })); disc.rotation.x = -Math.PI / 2; disc.position.y = 1.86; g.add(disc);
  [-1, 1].forEach(s => { const sk = new THREE.Mesh(new THREE.CapsuleGeometry(.09, 3, 4, 8), dark); sk.rotation.x = Math.PI / 2; sk.position.set(s * 1.05, -1.6, 0); g.add(sk); [-.7, .7].forEach(z => { const st = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .6, 6), dark); st.position.set(s * .95, -1.3, z); st.rotation.z = s * .3; g.add(st); }); });
  const kid = buildKid(kidType, { bust: true }); kid.scale.setScalar(1.15); kid.rotation.y = Math.PI; kid.position.set(0, -1.45, -.15); const ku = kid.userData; ku.armL.sh.rotation.set(-1, 0, .25); ku.armR.sh.rotation.set(-1, 0, -.25); ku.armL.el.rotation.x = -.6; ku.armR.el.rotation.x = -.6; g.add(kid); u.kid = kid;
  outline(g, .022); u.kind = 'heli';
  return g;
}
export function buildAircraft(kind, kidType) { return kind === 'jet' ? buildJet(kidType) : kind === 'heli' ? buildHeli(kidType) : buildProp(kidType); }

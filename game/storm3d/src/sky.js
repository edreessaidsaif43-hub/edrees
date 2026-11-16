// ضوضاء + سماء كرتونية بألوان تتغيّر مع وقت اليوم
import * as THREE from 'three';
import { canvasTex } from './util.js';
// ---------- ضوضاء ----------
function hash(x, y) { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
export function fbm(x, y, o = 5) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= .5; } return s; }
export function ridged(x, y, o = 5) { let s = 0, a = .5, f = 1, w = 1; for (let i = 0; i < o; i++) { let n = 1 - Math.abs(vnoise(x * f, y * f) * 2 - 1); n *= n; n *= w; w = Math.min(1, n * 1.6); s += a * n; f *= 2.1; a *= .5; } return s; }
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- السماء الكرتونية: تدرّج لوني وشمس، بألوان تتغيّر مع وقت اليوم ----------
export const SKIES = {
  sunrise: { top: 0x5ab8ff, mid: 0xffc6a8, bot: 0xffe6b8, sun: 0xfff2c0, glow: 0xffb070, light: 0xffe0b8, hemi: [0xbfe0ff, 0xffc89a], fog: 0xffd9bb },
  morning: { top: 0x0077ff, mid: 0x3fc0ff, bot: 0xaaf0ff, sun: 0xffffff, glow: 0xfff3a0, light: 0xfff6e6, hemi: [0xb8e8ff, 0xffb8c8], fog: 0x9fe4ff },
  noon: { top: 0x1f8ff0, mid: 0x6ccaff, bot: 0xc9f0ff, sun: 0xffffff, glow: 0xfff8d0, light: 0xffffff, hemi: [0xd4f0ff, 0xfff0c8], fog: 0xbfe9ff },
  afternoon: { top: 0x3a8ff0, mid: 0x9ccfff, bot: 0xffe8c4, sun: 0xfff6d8, glow: 0xffd890, light: 0xfff0d4, hemi: [0xc8e2ff, 0xffd8a8], fog: 0xffe6cc },
  sunset: { top: 0x5a5fd8, mid: 0xff8fa0, bot: 0xffc070, sun: 0xffe2a0, glow: 0xff8a50, light: 0xffb888, hemi: [0xb0a8ff, 0xff9e70], fog: 0xffb89a }
};
export function buildSky(S) {
  const U = { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, bot: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() }, glow: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, .3, -1).normalize() } };
  const mat = new THREE.ShaderMaterial({
    uniforms: U, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }',
    fragmentShader: `uniform vec3 top, mid, bot, sunCol, glow, sunDir; varying vec3 vDir;
      void main(){ float h = vDir.y; vec3 c = h > 0. ? mix(mid, top, smoothstep(0., .55, h)) : mix(mid, bot, smoothstep(0., -.25, h));
        c = mix(c, bot, smoothstep(.12, -.02, h) * .6);
        float d = max(dot(normalize(vDir), normalize(sunDir)), 0.);
        c += glow * pow(d, 18.) * .55; c = mix(c, sunCol, smoothstep(.9975, .9985, d));
        gl_FragColor = vec4(c, 1.); }`
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 16), mat); sky.renderOrder = -1; sky.frustumCulled = false; S.add(sky);
  const sunT = canvasTex(512, 512, (c) => { c.translate(256, 256); const g = c.createRadialGradient(0, 0, 40, 0, 0, 256); g.addColorStop(0, 'rgba(255,250,210,.9)'); g.addColorStop(.35, 'rgba(255,230,140,.35)'); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; c.fillRect(-256, -256, 512, 512); for (let i = 0; i < 16; i++) { c.rotate(Math.PI / 8); c.fillStyle = 'rgba(255,240,170,.22)'; c.beginPath(); c.moveTo(-14, 70); c.lineTo(14, 70); c.lineTo(5, 250); c.lineTo(-5, 250); c.fill(); } c.fillStyle = '#fff8d8'; c.beginPath(); c.arc(0, 0, 56, 0, 7); c.fill(); c.strokeStyle = '#ffd860'; c.lineWidth = 10; c.stroke(); });
  const sunS = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunT, depthWrite: false, fog: false, transparent: true, toneMapped: false })); sunS.scale.setScalar(1300); sky.add(sunS);
  const cA = new THREE.Color(), cB = new THREE.Color();
  // مزج بين وقتين من اليوم (t من 0 إلى 1)
  function blend(kA, kB, t, sunDir) {
    const A = SKIES[kA], B = SKIES[kB], mix = (a, b) => cA.setHex(a).lerp(cB.setHex(b), t).getHex();
    const P = { top: mix(A.top, B.top), mid: mix(A.mid, B.mid), bot: mix(A.bot, B.bot), sun: mix(A.sun, B.sun), glow: mix(A.glow, B.glow), light: mix(A.light, B.light), hemi: [mix(A.hemi[0], B.hemi[0]), mix(A.hemi[1], B.hemi[1])], fog: mix(A.fog, B.fog) };
    U.top.value.setHex(P.top); U.mid.value.setHex(P.mid); U.bot.value.setHex(P.bot); U.sunCol.value.setHex(P.sun); U.glow.value.setHex(P.glow); U.sunDir.value.copy(sunDir).normalize(); sunS.position.copy(sunDir).normalize().multiplyScalar(7000);
    return P;
  }
  function setTime(key, sunDir) { const P = SKIES[key]; U.top.value.setHex(P.top); U.mid.value.setHex(P.mid); U.bot.value.setHex(P.bot); U.sunCol.value.setHex(P.sun); U.glow.value.setHex(P.glow); U.sunDir.value.copy(sunDir).normalize(); sunS.position.copy(sunDir).normalize().multiplyScalar(7000); return P; }
  return { sky, setTime, blend, U, sunS };
}

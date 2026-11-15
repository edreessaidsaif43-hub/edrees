// تظليل كرتوني: درجات لونية واضحة + خط محيطي داكن
import * as THREE from 'three';
let GRAD = null;
export function gradMap() {
  if (GRAD) return GRAD;
  const d = new Uint8Array([165, 165, 165, 255, 212, 212, 212, 255, 245, 245, 245, 255, 255, 255, 255, 255]);
  GRAD = new THREE.DataTexture(d, 4, 1, THREE.RGBAFormat); GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter; GRAD.needsUpdate = true; return GRAD;
}
export const toon = (color, o = {}) => new THREE.MeshToonMaterial({ color, gradientMap: gradMap(), ...o });
const OUTS = {};
function outMat(th, col) {
  const k = th + ':' + col; if (OUTS[k]) return OUTS[k];
  const m = new THREE.MeshBasicMaterial({ color: col, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * ' + th.toFixed(4) + ';'); };
  return (OUTS[k] = m);
}
export function outline(root, th = .012, col = 0x2a1f2a) {
  const list = []; root.traverse(o => { if (o.isMesh && !o.userData.noOut && !o.userData.isOut && !o.material.transparent && !o.children.some(c => c.userData.isOut)) list.push(o); });
  list.forEach(o => { const m = new THREE.Mesh(o.geometry, outMat(th / Math.max(.2, o.getWorldScale(new THREE.Vector3()).x), col)); m.userData.isOut = 1; m.castShadow = false; o.add(m); });
}

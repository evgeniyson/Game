// Иконки снаряжения: рендер воксельной модели предмета во вне-экранную текстуру, кэш в dataURL.
import * as THREE from 'three';
import { buildGear, WS, RARITY_GLOW } from './weaponModels';

let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<string, string | null>();
const SIZE = 96;
let scene: THREE.Scene | null = null;
let cam: THREE.OrthographicCamera | null = null;
let rt: THREE.WebGLRenderTarget | null = null;

export function initIcons(r: THREE.WebGLRenderer) {
  renderer = r;
}

function setup() {
  if (scene) return;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a7a6a, 1.6));
  const d = new THREE.DirectionalLight(0xfff2dc, 2.4);
  d.position.set(2, 4, 5);
  scene.add(d);
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 50);
  cam.position.set(0, 0, 10);
  rt = new THREE.WebGLRenderTarget(SIZE, SIZE);
}

/** dataURL иконки предмета или null, если модели нет */
export function iconUrl(id: string, rarity = 0): string | null {
  const key = id + ':' + rarity;
  if (cache.has(key)) return cache.get(key)!;
  if (!renderer || typeof document === 'undefined') return null;
  const gm = buildGear(id);
  if (!gm) {
    cache.set(key, null);
    return null;
  }
  setup();
  const geo = gm.grid.toGeometry(WS);
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const center = box.getCenter(new THREE.Vector3());
  geo.translate(-center.x, -center.y, -center.z);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(RARITY_GLOW[Math.min(4, rarity)]) });
  const mesh = new THREE.Mesh(geo, mat);
  const isLong = gm.mount === 'hand' || gm.mount === 'bow';
  if (isLong) mesh.rotation.set(0.35, gm.mount === 'bow' ? Math.PI / 2 : 0.6, -Math.PI / 4);
  else mesh.rotation.set(0.45, -0.6, 0);
  scene!.add(mesh);
  mesh.updateMatrixWorld();
  const wb = new THREE.Box3().setFromObject(mesh);
  const half = Math.max(wb.max.x - wb.min.x, wb.max.y - wb.min.y) * 0.56;
  cam!.left = -half;
  cam!.right = half;
  cam!.top = half;
  cam!.bottom = -half;
  cam!.updateProjectionMatrix();

  const prevTarget = renderer.getRenderTarget();
  const prevClear = renderer.getClearColor(new THREE.Color());
  const prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(scene!, cam!);
  const px = new Uint8Array(SIZE * SIZE * 4);
  renderer.readRenderTargetPixels(rt!, 0, 0, SIZE, SIZE, px);
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  scene!.remove(mesh);
  geo.dispose();
  mat.dispose();

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const src = ((SIZE - 1 - y) * SIZE + x) * 4;
      const dst = (y * SIZE + x) * 4;
      for (let c = 0; c < 3; c++) img.data[dst + c] = Math.round(255 * Math.pow(px[src + c] / 255, 1 / 2.2));
      img.data[dst + 3] = px[src + 3];
    }
  ctx.putImageData(img, 0, 0);
  const url = canvas.toDataURL();
  cache.set(key, url);
  return url;
}

/** Узел для слота: картинка модели или эмодзи */
export function iconNode(id: string, emoji: string, rarity = 0): HTMLElement | string {
  const url = iconUrl(id, rarity);
  if (!url) return emoji;
  const img = document.createElement('img');
  img.src = url;
  img.alt = emoji;
  img.className = 'ico';
  img.draggable = false;
  return img;
}

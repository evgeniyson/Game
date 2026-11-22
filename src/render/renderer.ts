// Рендерер: сцена, мягкие тени вокруг игрока, атмосфера биомов, цикл дня и ночи,
// камера 3/4 и пост-обработка «диорама».
import * as THREE from 'three';
import { PostFX } from './post';
import { Atmosphere } from './atmosphere';
import { settings, onSettings } from '../core/settings';
import { U } from './uniforms';
import type { Biome } from '../world/gen';

export const IS_TOUCH = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

export class Renderer {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  ambient: THREE.AmbientLight;
  target = new THREE.Vector3();
  zoom = 27;
  shake = 0;
  pixelRatio: number;
  post: PostFX;
  atmo = new Atmosphere();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  dayFactor = 1;
  private dusk = 0;
  aspectZoom = 1;
  focus = new THREE.Vector3();
  private time = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 200);
    this.scene.fog = new THREE.Fog(0xd8e6d0, 40, 92);
    this.scene.background = new THREE.Color(0xbfe2f2);

    this.hemi = new THREE.HemisphereLight(0xd6ecff, 0x6f8f3e, 1.0);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.18);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xffe2b8, 2.6);
    this.sun.castShadow = true;
    const sc = this.sun.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 1;
    sc.far = 140;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.035;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.post = new PostFX(this.renderer, this.scene, this.camera);
    this.applySettings();
    onSettings(() => this.applySettings());

    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener(
      'wheel',
      (e) => {
        this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 2, 14, 42);
      },
      { passive: true },
    );
    this.resize();
  }

  applySettings() {
    const q = settings.quality;
    const size = q === 'high' ? (IS_TOUCH ? 2048 : 4096) : q === 'medium' ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.sun.shadow.radius = q === 'low' ? 1 : 3.5;
    this.post.configure({ ao: q !== 'low', dof: settings.dof });
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.pixelRatio);
    this.camera.aspect = w / h;
    // на узком портретном экране отодвигаем камеру, чтобы видеть больше
    this.camera.fov = w < h ? 46 : 36;
    this.aspectZoom = w < h ? 1.32 : 1;
    this.camera.updateProjectionMatrix();
  }

  setBiome(b: Biome) {
    this.atmo.setBiome(b);
  }

  /** t: 0..1 (0 — полночь, 0.5 — полдень) */
  setDayTime(t: number) {
    const sunH = Math.sin((t - 0.25) * Math.PI * 2); // -1..1
    this.dayFactor = THREE.MathUtils.smoothstep(sunH, -0.25, 0.35);
    this.dusk = Math.max(0, 1 - Math.abs(sunH) * 3.2) * (sunH > -0.3 ? 1 : 0);
  }

  private applyAtmosphere(dt: number) {
    const a = this.atmo.update(dt, this.dayFactor, this.dusk);
    (this.scene.background as THREE.Color).copy(a.sky);
    const fog = this.scene.fog as THREE.Fog;
    fog.color.copy(a.fog);
    const camDist = this.zoom * this.aspectZoom;
    fog.near = camDist + a.fogNear;
    fog.far = camDist + a.fogFar;
    this.sun.color.copy(a.sun);
    this.sun.intensity = a.sunI;
    this.hemi.color.copy(a.hemiSky);
    this.hemi.groundColor.copy(a.hemiGround);
    this.hemi.intensity = a.hemiI;
    this.ambient.intensity = 0.14 + (1 - this.dayFactor) * 0.2;
    this.post.setGrade(a.gain, a.lift, a.saturation, a.vignette, this.time);
  }

  follow(pos: THREE.Vector3, dt: number) {
    this.target.lerp(pos, Math.min(1, dt * 8));
    this.focus.copy(this.target).setY(this.target.y + 0.9);
    const ang = THREE.MathUtils.degToRad(50);
    const off = new THREE.Vector3(0, Math.sin(ang), Math.cos(ang)).multiplyScalar(this.zoom * this.aspectZoom);
    this.camera.position.copy(this.target).add(off);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.target.x, this.target.y + 0.8, this.target.z);
    // низкое тёплое солнце сбоку — длинные мягкие тени, как на диорамах
    const sunOff = new THREE.Vector3(-30, 32, 18);
    this.sun.position.copy(this.target).add(sunOff);
    this.sun.target.position.copy(this.target);
    U.uPlayer.value.copy(pos);
  }

  render(dt: number) {
    this.time += dt;
    U.uTime.value = this.time;
    this.applyAtmosphere(dt);
    this.camera.updateMatrixWorld();
    this.post.setFocus(this.focus);
    this.post.render();
  }

  screenToGround(sx: number, sy: number, groundY: number): THREE.Vector3 | null {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera);
    this.plane.constant = -groundY;
    const out = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.plane, out);
  }

  private tmp = new THREE.Vector3();
  worldToScreen(v: THREE.Vector3): { x: number; y: number; vis: boolean } {
    this.tmp.copy(v).project(this.camera);
    return {
      x: (this.tmp.x * 0.5 + 0.5) * window.innerWidth,
      y: (-this.tmp.y * 0.5 + 0.5) * window.innerHeight,
      vis: this.tmp.z < 1 && Math.abs(this.tmp.x) < 1.1 && Math.abs(this.tmp.y) < 1.1,
    };
  }
}

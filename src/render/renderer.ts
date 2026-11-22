// Рендерер: сцена, свет, тени вокруг игрока, цикл дня и ночи, камера 3/4, авто-качество.
import * as THREE from 'three';

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
  maxPixelRatio: number;
  shadows = true;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private skyColor = new THREE.Color();
  private ray = new THREE.Raycaster();
  private plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  dayFactor = 1;
  aspectZoom = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !IS_TOUCH, powerPreference: 'high-performance' });
    this.maxPixelRatio = Math.min(window.devicePixelRatio || 1, IS_TOUCH ? 2 : 2);
    this.pixelRatio = IS_TOUCH ? Math.min(1.5, this.maxPixelRatio) : this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.5, 220);
    this.scene.fog = new THREE.Fog(0x9fd8ff, 40, 92);
    this.scene.background = new THREE.Color(0x9fd8ff);

    this.hemi = new THREE.HemisphereLight(0xcfeaff, 0x5a7a3a, 1.1);
    this.scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xffffff, 0.25);
    this.scene.add(this.ambient);
    this.sun = new THREE.DirectionalLight(0xfff1d6, 2.4);
    this.sun.castShadow = true;
    const size = IS_TOUCH ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 120;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    window.addEventListener('resize', () => this.resize());
    canvas.addEventListener('wheel', (e) => {
      this.zoom = THREE.MathUtils.clamp(this.zoom + Math.sign(e.deltaY) * 2, 16, 42);
    }, { passive: true });
    this.resize();
  }

  resize() {
    const w = window.innerWidth,
      h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // на узком портретном экране отодвигаем камеру, чтобы видеть больше
    this.camera.fov = w < h ? 46 : 38;
    this.aspectZoom = w < h ? 1.32 : 1;
    this.camera.updateProjectionMatrix();
  }

  /** t: 0..1 (0 — полночь, 0.5 — полдень) */
  setDayTime(t: number) {
    const sunH = Math.sin((t - 0.25) * Math.PI * 2); // -1..1
    const day = THREE.MathUtils.smoothstep(sunH, -0.25, 0.35);
    this.dayFactor = day;
    const dusk = Math.max(0, 1 - Math.abs(sunH) * 3.5) * (sunH > -0.3 ? 1 : 0);
    const night = new THREE.Color(0x1b2550);
    const dawn = new THREE.Color(0xffa070);
    const noon = new THREE.Color(0x9fd8ff);
    this.skyColor.copy(night).lerp(noon, day).lerp(dawn, dusk * 0.55);
    (this.scene.background as THREE.Color).copy(this.skyColor);
    (this.scene.fog as THREE.Fog).color.copy(this.skyColor);
    this.sun.intensity = 0.25 + day * 2.3;
    this.sun.color.setHex(0xfff1d6).lerp(new THREE.Color(0xffa060), dusk * 0.7).lerp(new THREE.Color(0x8aa0ff), 1 - day);
    this.hemi.intensity = 0.45 + day * 0.7;
    this.hemi.color.setHex(0xcfeaff).lerp(new THREE.Color(0x4a5aa0), 1 - day);
    this.ambient.intensity = 0.18 + (1 - day) * 0.25;
  }

  follow(pos: THREE.Vector3, dt: number) {
    this.target.lerp(pos, Math.min(1, dt * 8));
    const ang = THREE.MathUtils.degToRad(52);
    const off = new THREE.Vector3(0, Math.sin(ang), Math.cos(ang)).multiplyScalar(this.zoom * this.aspectZoom);
    this.camera.position.copy(this.target).add(off);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.camera.lookAt(this.target.x, this.target.y + 0.8, this.target.z);
    const sunOff = new THREE.Vector3(-18, 34, 14);
    this.sun.position.copy(this.target).add(sunOff);
    this.sun.target.position.copy(this.target);
  }

  render(dt: number) {
    this.renderer.render(this.scene, this.camera);
    this.adapt(dt);
  }

  private adapt(dt: number) {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 2.5) return;
    const fps = this.fpsFrames / this.fpsAcc;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    if (fps < 38) {
      if (this.pixelRatio > 0.8) {
        this.pixelRatio = Math.max(0.75, this.pixelRatio - 0.25);
        this.renderer.setPixelRatio(this.pixelRatio);
        this.resize();
      } else if (this.shadows) {
        this.shadows = false;
        this.sun.castShadow = false;
      }
    } else if (fps > 57 && this.pixelRatio < this.maxPixelRatio) {
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
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

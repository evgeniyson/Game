// Пост-обработка в стиле «диорамы»: мягкое затенение (GTAO), глубина резкости + tilt-shift,
// цветокоррекция по биому, виньетка и плёночное зерно.
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Pass, FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import type { DofMode } from '../core/settings';

/** GTAO в половинном разрешении — вдвое дешевле, на вид почти так же */
class HalfGTAOPass extends GTAOPass {
  setSize(width: number, height: number) {
    super.setSize(Math.max(1, Math.floor(width * 0.5)), Math.max(1, Math.floor(height * 0.5)));
  }
}

const COC_GLSL = /* glsl */ `
uniform sampler2D tDepth;
uniform float useDepth;
uniform float cameraNear;
uniform float cameraFar;
uniform float focusDist;
uniform float focusY;
uniform float band;
uniform float ramp;
uniform float depthBand;
uniform float depthRamp;
float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return (2.0 * cameraNear * cameraFar) / (cameraFar + cameraNear - z * (cameraFar - cameraNear));
}
float cocAt(vec2 uv) {
  float c2 = smoothstep(band, band + ramp, abs(uv.y - focusY));
  if (useDepth < 0.5) return c2;
  float d = linDepth(texture2D(tDepth, uv).x);
  float rel = abs(d - focusDist) / focusDist;
  float c1 = smoothstep(depthBand, depthBand + depthRamp, rel);
  // ближний план размываем чуть слабее, чем дальний
  if (d < focusDist) c1 *= 0.75;
  return clamp(max(c1, c2 * 0.9), 0.0, 1.0);
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

function cocUniforms() {
  return {
    tDepth: { value: null as THREE.Texture | null },
    useDepth: { value: 1 },
    cameraNear: { value: 0.5 },
    cameraFar: { value: 220 },
    focusDist: { value: 30 },
    focusY: { value: 0.45 },
    band: { value: 0.08 },
    ramp: { value: 0.3 },
    depthBand: { value: 0.1 },
    depthRamp: { value: 0.4 },
  };
}

/** Размытие боке с «весом по CoC» в половинном разрешении + композиция с резким кадром */
class DioramaPass extends Pass {
  private blurRT: THREE.WebGLRenderTarget;
  private blurMat: THREE.ShaderMaterial;
  private compMat: THREE.ShaderMaterial;
  private quad: FullScreenQuad;
  maxRadius = 9;

  constructor() {
    super();
    this.blurRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
    this.blurMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, maxR: { value: 9 }, ...cocUniforms() },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float maxR;
        varying vec2 vUv;
        ${COC_GLSL}
        void main() {
          float cc = cocAt(vUv);
          vec3 acc = vec3(0.0);
          float wsum = 0.0;
          const int N = 28;
          float golden = 2.39996323;
          vec2 px = 1.0 / resolution;
          for (int i = 0; i < N; i++) {
            float fi = float(i) + 0.5;
            float r = sqrt(fi / float(N)) * maxR * max(cc, 0.12);
            float a = fi * golden;
            vec2 uv = vUv + vec2(cos(a), sin(a)) * r * px;
            float sc = cocAt(uv) * maxR;
            float w = smoothstep(r - 1.5, r + 0.5, sc) + 0.02;
            vec3 c = texture2D(tDiffuse, uv).rgb;
            float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
            w *= 1.0 + smoothstep(0.7, 1.6, lum) * 2.0; // яркие пятна боке
            acc += c * w;
            wsum += w;
          }
          gl_FragColor = vec4(acc / max(wsum, 1e-4), cc);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.compMat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tBlur: { value: null }, ...cocUniforms() },
      vertexShader: VERT,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tBlur;
        varying vec2 vUv;
        ${COC_GLSL}
        void main() {
          vec4 sharp = texture2D(tDiffuse, vUv);
          vec3 blur = texture2D(tBlur, vUv).rgb;
          float c = cocAt(vUv);
          float k = smoothstep(0.02, 0.45, c);
          gl_FragColor = vec4(mix(sharp.rgb, blur, k), sharp.a);
        }`,
      depthTest: false,
      depthWrite: false,
    });
    this.quad = new FullScreenQuad(this.blurMat);
  }

  setCoc(params: Record<string, number | THREE.Texture | null>) {
    for (const m of [this.blurMat, this.compMat])
      for (const k in params) if (m.uniforms[k]) m.uniforms[k].value = params[k];
  }

  setSize(w: number, h: number) {
    const hw = Math.max(1, Math.floor(w / 2)),
      hh = Math.max(1, Math.floor(h / 2));
    this.blurRT.setSize(hw, hh);
    this.blurMat.uniforms.resolution.value.set(hw, hh);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.blurMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.blurMat.uniforms.maxR.value = this.maxRadius;
    this.quad.material = this.blurMat;
    renderer.setRenderTarget(this.blurRT);
    this.quad.render(renderer);
    this.compMat.uniforms.tDiffuse.value = readBuffer.texture;
    this.compMat.uniforms.tBlur.value = this.blurRT.texture;
    this.quad.material = this.compMat;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.blurRT.dispose();
    this.blurMat.dispose();
    this.compMat.dispose();
    this.quad.dispose();
  }
}

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    gain: { value: new THREE.Vector3(1, 1, 1) },
    lift: { value: new THREE.Vector3(0, 0, 0) },
    saturation: { value: 1.1 },
    vignette: { value: 0.35 },
    grain: { value: 0.035 },
    time: { value: 0 },
  },
  vertexShader: VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec3 gain;
    uniform vec3 lift;
    uniform float saturation;
    uniform float vignette;
    uniform float grain;
    uniform float time;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb * gain + lift;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = max(mix(vec3(l), col, saturation), 0.0);
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d, d) * 1.6;
      col *= mix(1.0, clamp(v, 0.0, 1.0), vignette);
      float n = hash(vUv * 1000.0 + fract(time) * 37.0) - 0.5;
      col += n * grain * (0.35 + l);
      gl_FragColor = vec4(col, c.a);
    }`,
};

export class PostFX {
  composer: EffectComposer;
  private renderPass: RenderPass;
  gtao: HalfGTAOPass;
  diorama: DioramaPass;
  grade: ShaderPass;
  private output: OutputPass;
  private tmp = new THREE.Vector3();

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.gtao = new HalfGTAOPass(scene, camera, size.x, size.y);
    this.gtao.blendIntensity = 0.85;
    this.gtao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.2, thickness: 1.2, scale: 1.1, samples: 12 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    this.composer.addPass(this.gtao);
    this.diorama = new DioramaPass();
    this.composer.addPass(this.diorama);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.grade);
    this.output = new OutputPass();
    this.composer.addPass(this.output);
  }

  setSize(w: number, h: number, pr: number) {
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
  }

  configure(opts: { ao: boolean; dof: DofMode }) {
    this.gtao.enabled = opts.ao;
    this.diorama.enabled = opts.dof !== 'off';
    const strong = opts.dof === 'strong';
    this.diorama.maxRadius = strong ? 10 : 6;
    this.diorama.setCoc({
      band: strong ? 0.07 : 0.16,
      ramp: strong ? 0.28 : 0.36,
      depthBand: strong ? 0.08 : 0.18,
      depthRamp: strong ? 0.35 : 0.5,
    });
  }

  /** Фокус на точке (игроке) */
  setFocus(p: THREE.Vector3) {
    const cam = this.camera;
    this.tmp.copy(p).applyMatrix4(cam.matrixWorldInverse);
    const dist = Math.max(1, -this.tmp.z);
    this.tmp.copy(p).project(cam);
    this.diorama.setCoc({
      focusDist: dist,
      focusY: this.tmp.y * 0.5 + 0.5,
      cameraNear: cam.near,
      cameraFar: cam.far,
      tDepth: this.gtao.enabled ? this.gtao.depthTexture : null,
      useDepth: this.gtao.enabled ? 1 : 0,
    });
  }

  setGrade(gain: THREE.Vector3, lift: THREE.Vector3, saturation: number, vignette: number, time: number) {
    const u = this.grade.uniforms;
    u.gain.value.copy(gain);
    u.lift.value.copy(lift);
    u.saturation.value = saturation;
    u.vignette.value = vignette;
    u.time.value = time;
  }

  render() {
    this.composer.render();
  }
}

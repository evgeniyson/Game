// Визуальные эффекты: воксельные частицы, кольца, линии-телеграфы, молнии, индикаторы прицела.
import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  grav: number;
}

interface Timed {
  obj: THREE.Object3D;
  t: number;
  max: number;
  kind: 'ring' | 'line' | 'bolt';
  r?: number;
}

export class FX {
  private particles: Particle[] = [];
  private inst: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();
  private timed: Timed[] = [];
  private ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  private discGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  private planeGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
  onShake: (a: number) => void = () => {};
  readonly MAX = 900;

  // Индикаторы прицеливания
  aimRange: THREE.Mesh;
  aimCircle: THREE.Mesh;
  aimLine: THREE.Mesh;
  selectRing: THREE.Mesh;

  constructor(public scene: THREE.Scene) {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.inst = new THREE.InstancedMesh(geo, mat, this.MAX);
    this.inst.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.inst.count = 0;
    this.inst.frustumCulled = false;
    this.inst.setColorAt(0, new THREE.Color());
    scene.add(this.inst);

    const aimMat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, toneMapped: false });
    this.aimRange = new THREE.Mesh(this.ringGeo, aimMat(0xffffff, 0.35));
    this.aimCircle = new THREE.Mesh(this.discGeo, aimMat(0x7ad0ff, 0.3));
    this.aimLine = new THREE.Mesh(this.planeGeo, aimMat(0x7ad0ff, 0.3));
    this.selectRing = new THREE.Mesh(this.ringGeo, aimMat(0xff5a4a, 0.8));
    for (const m of [this.aimRange, this.aimCircle, this.aimLine, this.selectRing]) {
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
    }
  }

  burst(pos: THREE.Vector3, color: number, count = 10, speed = 3) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX) this.particles.shift();
      const v = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 1.4 + 0.3, (Math.random() - 0.5) * 2).normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      this.particles.push({ pos: pos.clone(), vel: v, life: 0, max: 0.5 + Math.random() * 0.5, size: 0.08 + Math.random() * 0.1, color: c.clone().offsetHSL(0, 0, (Math.random() - 0.5) * 0.15), grav: 9 });
    }
  }

  /** Медленно поднимающиеся частицы (огонь, магия, светлячки) */
  float(pos: THREE.Vector3, color: number, count = 1, spread = 0.3, size = 0.08, life = 1) {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.MAX) this.particles.shift();
      this.particles.push({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, 0, (Math.random() - 0.5) * spread)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.8 + Math.random() * 0.8, (Math.random() - 0.5) * 0.3),
        life: 0, max: life * (0.6 + Math.random() * 0.6), size, color: c, grav: -0.5,
      });
    }
  }

  ring(pos: THREE.Vector3, radius: number, color: number, dur = 0.4) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    m.position.copy(pos).setY(pos.y + 0.08);
    m.scale.setScalar(radius * 0.3);
    m.renderOrder = 3;
    this.scene.add(m);
    this.timed.push({ obj: m, t: 0, max: dur, kind: 'ring', r: radius });
  }

  line(from: THREE.Vector3, dir: THREE.Vector3, len: number, width: number, color: number, dur = 0.4) {
    const m = new THREE.Mesh(this.planeGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }));
    m.position.copy(from).setY(from.y + 0.08);
    m.scale.set(width, 1, len);
    m.rotation.y = Math.atan2(dir.x, dir.z);
    m.renderOrder = 3;
    this.scene.add(m);
    this.timed.push({ obj: m, t: 0, max: dur, kind: 'line' });
  }

  lightning(points: THREE.Vector3[], color: number) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i],
        b = points[i + 1];
      for (let s = 0; s <= 5; s++) {
        const p = a.clone().lerp(b, s / 5);
        if (s > 0 && s < 5) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6));
        pts.push(p);
      }
      this.burst(b, color, 6, 2);
    }
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, toneMapped: false }));
    this.scene.add(l);
    this.timed.push({ obj: l, t: 0, max: 0.35, kind: 'bolt' });
  }

  shake(a: number) {
    this.onShake(a);
  }

  /** Постоянная зона на земле (капкан, град стрел, телеграф босса) */
  zoneMesh(radius: number, color: number, opacity = 0.25): THREE.Group {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(this.discGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false }));
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: Math.min(1, opacity * 3), depthWrite: false, toneMapped: false }));
    disc.renderOrder = 2;
    ring.renderOrder = 2;
    g.add(disc, ring);
    g.scale.setScalar(radius);
    this.scene.add(g);
    return g;
  }

  disposeObj(o: THREE.Object3D) {
    this.scene.remove(o);
    o.traverse((c) => {
      const m = (c as THREE.Mesh).material as THREE.Material | undefined;
      if (m) m.dispose();
      if (c instanceof THREE.Line) c.geometry.dispose();
    });
  }

  update(dt: number) {
    // частицы
    let n = 0;
    const alive: Particle[] = [];
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vel.y -= p.grav * dt;
      p.pos.addScaledVector(p.vel, dt);
      alive.push(p);
      const k = 1 - p.life / p.max;
      this.dummy.position.copy(p.pos);
      this.dummy.scale.setScalar(p.size * (0.4 + 0.6 * k));
      this.dummy.rotation.set(p.life * 3, p.life * 2, 0);
      this.dummy.updateMatrix();
      this.inst.setMatrixAt(n, this.dummy.matrix);
      this.inst.setColorAt(n, p.color);
      n++;
    }
    this.particles = alive;
    this.inst.count = n;
    this.inst.instanceMatrix.needsUpdate = true;
    if (this.inst.instanceColor) this.inst.instanceColor.needsUpdate = true;

    // временные объекты
    this.timed = this.timed.filter((t) => {
      t.t += dt;
      const k = t.t / t.max;
      if (k >= 1) {
        this.disposeObj(t.obj);
        return false;
      }
      const mat = ((t.obj as THREE.Mesh).material as THREE.MeshBasicMaterial) ?? null;
      if (t.kind === 'ring') {
        t.obj.scale.setScalar(t.r! * (0.3 + 0.7 * Math.min(1, k * 1.6)));
        mat.opacity = 0.9 * (1 - k);
      } else if (t.kind === 'line') mat.opacity = 0.45 * (1 - k);
      else mat.opacity = 1 - k;
      return true;
    });
  }
}

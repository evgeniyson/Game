// Главное меню и создание персонажа с 3D-превью.
import * as THREE from 'three';
import { el, clear } from './dom';
import { CLASSES, type ClassId } from '../data/classes';
import { ABILITIES } from '../combat/abilities';
import { buildCharacter, SKINS, HAIRS, type Appearance, type Rig } from '../render/models';
import { World } from '../world/world';
import type { Renderer } from '../render/renderer';
import type { SaveData } from '../game/game';
import { sfx } from '../core/audio';
import { GROUND } from '../world/gen';

export interface NewGame {
  name: string;
  cls: ClassId;
  appearance: Appearance;
  seed: number;
}

const NAMES = ['Кайра', 'Рен', 'Мира', 'Тайо', 'Лис', 'Ярра', 'Нико', 'Веста', 'Дэн', 'Ая'];

export class Menu {
  root: HTMLElement;
  private world: World | null = null;
  private seed = (Math.random() * 1e9) >>> 0;
  private angle = 0;
  private prev: { r: THREE.WebGLRenderer; scene: THREE.Scene; cam: THREE.PerspectiveCamera; rig: Rig | null } | null = null;
  private ap: Appearance = { cls: 'warden', skin: SKINS[0], hair: HAIRS[1], longHair: true };
  private name = NAMES[Math.floor(Math.random() * NAMES.length)];

  constructor(private app: HTMLElement, private r: Renderer, private save: SaveData | null, private onStart: (ng: NewGame | null) => void) {
    this.root = el('div', { class: 'menu' });
    app.appendChild(this.root);
    this.world = new World(r.scene, save?.seed ?? this.seed);
    this.world.radius = 1;
    r.setDayTime(0.33);
    this.renderMain();
  }

  update(dt: number) {
    this.angle += dt * 0.08;
    if (this.world) this.world.update(0, 0);
    const R = 34;
    const c = this.r.camera;
    c.position.set(Math.sin(this.angle) * R, GROUND + 22, Math.cos(this.angle) * R);
    c.lookAt(0, GROUND + 2, 0);
    this.r.focus.set(0, GROUND + 2, 0);
    this.r.sun.position.set(-18, GROUND + 40, 14);
    this.r.sun.target.position.set(0, GROUND, 0);
    if (this.prev) {
      if (this.prev.rig) {
        this.prev.rig.group.rotation.y += dt * 0.8;
        this.prev.rig.animate(dt, { moving: false, speed: 0, attack: -1, cast: -1, dead: -1, stunned: false });
      }
      this.prev.r.render(this.prev.scene, this.prev.cam);
    }
  }

  dispose() {
    this.world?.dispose();
    this.world = null;
    this.prev?.r.dispose();
    this.prev = null;
    this.root.remove();
  }

  private renderMain() {
    clear(this.root);
    const card = el('div', { class: 'card', style: { maxWidth: '520px' } });
    card.append(el('div', { class: 'logo' }, el('h1', {}, 'Руины Рассвета'), el('p', {}, 'Воксельная RPG в мире, который поглотила природа')));
    const btns = el('div', { class: 'main-btns' });
    if (this.save) {
      const p = this.save.player;
      const b = el('button', { class: 'btn gold' }, `▶ Продолжить — ${p.name}, ${CLASSES[p.cls].name} ${p.level} ур.`);
      b.addEventListener('click', () => {
        sfx('click');
        this.onStart(null);
      });
      btns.append(b);
    }
    const nb = el('button', { class: 'btn' + (this.save ? '' : ' gold') }, '✦ Новый персонаж');
    nb.addEventListener('click', () => {
      if (this.save && !confirm('Начать новую игру? Текущее сохранение будет перезаписано.')) return;
      sfx('click');
      this.renderCreator();
    });
    btns.append(nb);
    card.append(btns);
    card.append(
      el(
        'div',
        { class: 'help', style: { marginTop: '16px', textAlign: 'center' } },
        'Через три века после Тихого Цветения города стали лесами. Исследуйте бесконечные руины, охотьтесь на мутировавших зверей, собирайте ресурсы, создавайте снаряжение с рунами и бросьте вызов стражам поваленных Колоссов.',
      ),
    );
    this.root.append(card);
  }

  private renderCreator() {
    clear(this.root);
    const card = el('div', { class: 'card' });
    card.append(el('div', { class: 'logo' }, el('h1', { style: { fontSize: 'clamp(26px,5vw,40px)' } }, 'Создание героя')));
    // классы
    const cls = el('div', { class: 'classes' });
    for (const c of Object.values(CLASSES)) {
      const abl = el('div', { class: 'abl' });
      for (const id of c.abilities) abl.append(el('span', { title: ABILITIES[id].desc(1) }, `${ABILITIES[id].icon} ${ABILITIES[id].name}`));
      const cc = el('div', { class: 'ccard' + (this.ap.cls === c.id ? ' on' : '') }, el('div', { class: 'top' }, el('div', { class: 'i' }, c.icon), el('div', {}, el('div', { class: 'n' }, c.name), el('div', { class: 'r' }, c.role))), el('p', {}, c.desc), abl, el('p', { style: { marginBottom: 0 } }, `${c.passive.icon} ${c.passive.name}: ${c.passive.desc}`));
      cc.addEventListener('click', () => {
        this.ap.cls = c.id;
        sfx('click');
        this.renderCreator();
      });
      cls.append(cc);
    }
    card.append(cls);

    // внешность
    const prevBox = el('div', { class: 'preview' });
    const form = el('div');
    const nameIn = el('input', { value: this.name, maxlength: 16 }) as HTMLInputElement;
    nameIn.addEventListener('input', () => (this.name = nameIn.value));
    form.append(el('div', { class: 'field' }, el('label', {}, 'Имя'), nameIn));
    const sw = (label: string, list: number[], cur: number, set: (v: number) => void) => {
      const row = el('div', { class: 'sw-row' });
      for (const c of list) {
        const b = el('button', { class: 'swatch' + (c === cur ? ' on' : ''), style: { background: '#' + c.toString(16).padStart(6, '0') } });
        b.addEventListener('click', () => {
          set(c);
          this.renderCreator();
        });
        row.append(b);
      }
      form.append(el('div', { class: 'field' }, el('label', {}, label), row));
    };
    sw('Кожа', SKINS, this.ap.skin, (v) => (this.ap.skin = v));
    sw('Волосы', HAIRS, this.ap.hair, (v) => (this.ap.hair = v));
    const hl = el('div', { class: 'sw-row' });
    for (const [v, l] of [[true, 'Длинные'], [false, 'Короткие']] as [boolean, string][]) {
      const b = el('button', { class: 'btn' + (this.ap.longHair === v ? ' gold' : '') }, l);
      b.addEventListener('click', () => {
        this.ap.longHair = v;
        this.renderCreator();
      });
      hl.append(b);
    }
    form.append(el('div', { class: 'field' }, el('label', {}, 'Причёска'), hl));
    const go = el('button', { class: 'btn gold', style: { fontSize: '18px', padding: '12px 22px', marginTop: '6px' } }, 'Начать путь →');
    go.addEventListener('click', () => {
      sfx('click');
      this.onStart({ name: (this.name || 'Странник').trim().slice(0, 16), cls: this.ap.cls, appearance: { ...this.ap }, seed: this.seed });
    });
    const back = el('button', { class: 'btn', style: { marginLeft: '8px' } }, '← Назад');
    back.addEventListener('click', () => this.renderMain());
    form.append(el('div', {}, go, back));
    card.append(el('div', { class: 'creator' }, prevBox, form));
    this.root.append(card);
    this.mountPreview(prevBox);
  }

  private mountPreview(box: HTMLElement) {
    if (!this.prev) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      r.outputColorSpace = THREE.SRGBColorSpace;
      r.toneMapping = THREE.ACESFilmicToneMapping;
      const scene = new THREE.Scene();
      scene.add(new THREE.HemisphereLight(0xffffff, 0x88aa66, 1.6));
      const d = new THREE.DirectionalLight(0xfff1d6, 2.2);
      d.position.set(2, 4, 3);
      scene.add(d);
      const cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
      cam.position.set(0, 1.4, 5.2);
      cam.lookAt(0, 1.0, 0);
      this.prev = { r, scene, cam, rig: null };
    }
    const pv = this.prev;
    if (pv.rig) pv.scene.remove(pv.rig.group);
    pv.rig = buildCharacter(this.ap);
    pv.rig.group.scale.setScalar(1.15);
    pv.scene.add(pv.rig.group);
    box.append(pv.r.domElement);
    requestAnimationFrame(() => {
      const w = box.clientWidth || 240;
      pv.r.setSize(w, w, false);
    });
  }
}

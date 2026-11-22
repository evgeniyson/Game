// Точка входа: рендерер, ввод, меню, игровой цикл.
import './ui/styles.css';
import { Renderer } from './render/renderer';
import { Input } from './input/input';
import { Hud } from './ui/hud';
import { Menu, type NewGame } from './ui/menu';
import { Game, loadSave } from './game/game';
import { initAudio } from './core/audio';

const app = document.getElementById('app')!;
const canvas = document.createElement('canvas');
app.appendChild(canvas);

const renderer = new Renderer(canvas);
const input = new Input(app);
const hud = new Hud(app, input);
let game: Game | null = null;
let menu: Menu | null = null;

const save = loadSave();

function start(ng: NewGame | null) {
  menu?.dispose();
  menu = null;
  game = new Game(renderer, input, ng ? null : save, ng ?? undefined);
  hud.attach(game);
  if (ng) {
    game.save();
    hud.banner('Руины Рассвета', `${ng.name}, ваш путь начинается`);
    hud.log('Добро пожаловать в лагерь выживших! Подойдите к станциям, чтобы создавать предметы.', '#ffd76a');
    hud.log('Изучите первую способность: нажмите «+» над кнопкой способности.', '#9ad0ff');
  } else hud.log('С возвращением! Игра загружена.', '#8aff8a');
  (window as any).__game = game;
}

menu = new Menu(app, renderer, save, start);

const unlock = () => initAudio();
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) game?.save();
});
window.addEventListener('beforeunload', () => game?.save());

let last = performance.now();
function frame(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game) {
    game.update(dt);
    hud.update(dt);
  } else menu?.update(dt);
  renderer.render(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

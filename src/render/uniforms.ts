// Общие uniform-переменные для шейдеров (время, ветер, позиция игрока).
import * as THREE from 'three';

export const U = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(1, 0.4) },
  uPlayer: { value: new THREE.Vector3() },
};

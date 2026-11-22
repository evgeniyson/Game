// Материалы ландшафта: «микро-воксели» на крупных блоках и анимированная вода с пеной.
import * as THREE from 'three';
import { U } from './uniforms';

const HASH = /* glsl */ `
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/** Каждый блок визуально собран из вокселей 1/8: вариация цвета по ячейкам + мягкие пятна + тонкие рёбра */
export function makeTerrainMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\n' + HASH)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        {
          vec3 n = normalize(vWNorm);
          vec3 p = vWPos * 8.0 - n * 0.5;
          vec3 cell = floor(p);
          float h1 = hash13(cell);
          float h2 = hash13(floor(vWPos * 2.0 - n * 0.25) + 11.0);
          diffuseColor.rgb *= 0.92 + h1 * 0.14;
          diffuseColor.rgb *= mix(vec3(1.035, 1.01, 0.94), vec3(0.95, 1.0, 1.04), h2);
          vec3 f = fract(p);
          vec3 an = abs(n);
          vec2 t = an.x > 0.5 ? f.yz : (an.y > 0.5 ? f.xz : f.xy);
          vec2 e = min(t, 1.0 - t);
          float edge = smoothstep(0.0, 0.1, min(e.x, e.y));
          diffuseColor.rgb *= mix(0.94 + h1 * 0.03, 1.0, edge);
          // верхние грани чуть светлее — мягкий «скайлайт»
          diffuseColor.rgb *= 1.0 + max(n.y, 0.0) * 0.04;
        }`,
      );
  };
  return m;
}

export function makeWaterMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.78, depthWrite: false });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vec3 wp0 = (modelMatrix * vec4(transformed, 1.0)).xyz;
        if (objectNormal.y > 0.5) transformed.y += sin(uTime * 1.6 + wp0.x * 1.3 + wp0.z * 0.9) * 0.03;
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying vec3 vWPos;\n' + HASH)
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        float foam = smoothstep(0.22, 0.55, diffuseColor.r);
        vec3 q = floor(vWPos * 8.0);
        float rip = sin(uTime * 2.0 + vWPos.x * 2.3 + sin(vWPos.z * 1.7 + uTime)) * 0.5 + 0.5;
        float sparkle = step(0.985, hash13(q + floor(uTime * 3.0)));
        diffuseColor.rgb *= 0.9 + rip * 0.16;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.98, 1.0), foam * (0.55 + 0.45 * sin(uTime * 2.5 + vWPos.x * 4.0 + vWPos.z * 3.0)));
        diffuseColor.rgb += sparkle * 0.5;
        diffuseColor.a = mix(diffuseColor.a, 0.95, foam);`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{ float fres = pow(1.0 - clamp(abs(dot(normalize(vViewPosition), normal)), 0.0, 1.0), 3.0);
           outgoingLight = mix(outgoingLight, vec3(0.85, 0.93, 1.0), fres * 0.35); }
        #include <opaque_fragment>`,
      );
  };
  return m;
}

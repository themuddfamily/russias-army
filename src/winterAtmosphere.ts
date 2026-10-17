import * as THREE from 'three';

/** Shared grading values keep the clear colour, horizon, fog and snow coherent. */
// Bright flat white-out overcast, matching the original game's Barrack sky.
export const WINTER_PALETTE = Object.freeze({
  zenith: 0x9caab0,
  upperCloud: 0xc3cccc,
  lowerCloud: 0xa5b0b1,
  horizon: 0xd3d9d6,
  fog: 0xb7c1be,
  snow: 0xeef4f1,
});

export const WINTER_SNOW_COUNTS = Object.freeze({ enhanced: 5200, fallback: 1600 });
export const DEFAULT_WINTER_FOG_DENSITY = .0092;

/** Matches Three.js FogExp2 attenuation and documents the authored visibility curve. */
export function winterFogFactorAtDistance(
  distance: number,
  density = DEFAULT_WINTER_FOG_DENSITY,
): number {
  const safeDistance = Number.isFinite(distance) ? Math.max(0, distance) : 0;
  const safeDensity = Number.isFinite(density) ? Math.max(0, density) : DEFAULT_WINTER_FOG_DENSITY;
  return 1 - Math.exp(-(safeDensity * safeDensity * safeDistance * safeDistance));
}

export interface WinterAtmosphereOptions {
  /** Changes particle placement while keeping it deterministic. */
  seed?: number | string;
  /** Generate and apply one PMREM environment to both supplied scenes. Defaults to `enhanced`. */
  environment?: boolean;
  skyRadius?: number;
  snowRadius?: number;
  snowHeight?: number;
  snowCount?: number;
  fogDensity?: number;
}

export interface WinterAtmosphere {
  readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  readonly snow: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  readonly fog: THREE.FogExp2;
  readonly environment: THREE.Texture | null;
  /** Time is absolute elapsed seconds; no geometry attribute is changed by this call. */
  update(time: number, camera: THREE.Camera): void;
  dispose(): void;
}

interface SnowSeedData {
  positions: Float32Array;
  characteristics: Float32Array;
}

const DEFAULT_SEED = 'russias-army-winter-v1';
const DEFAULT_SKY_RADIUS = 250;
const DEFAULT_SNOW_RADIUS = 72;
const DEFAULT_SNOW_HEIGHT = 34;

function finitePositive(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be finite and greater than zero.`);
  return value;
}

function finiteCount(value: number | undefined, fallback: number): number {
  const count = finitePositive(value, fallback, 'snowCount');
  if (!Number.isInteger(count)) throw new RangeError('snowCount must be an integer.');
  return count;
}

function seedHash(seed: number | string): number {
  const text = String(seed);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash ^ (hash >>> 16)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/** Static particle attributes. All motion is deliberately performed by the vertex shader. */
function createSnowSeedData(count: number, radius: number, height: number, seed: number | string): SnowSeedData {
  const random = mulberry32(seedHash(seed));
  const positions = new Float32Array(count * 3);
  const characteristics = new Float32Array(count * 4);

  for (let i = 0; i < count; i++) {
    const positionOffset = i * 3;
    const dataOffset = i * 4;
    // sqrt distributes points uniformly over a disc and avoids visible square corners.
    const distance = Math.sqrt(random()) * radius;
    const angle = random() * Math.PI * 2;
    positions[positionOffset] = Math.cos(angle) * distance;
    positions[positionOffset + 1] = (random() - .5) * height;
    positions[positionOffset + 2] = Math.sin(angle) * distance;
    characteristics[dataOffset] = random(); // fall speed
    characteristics[dataOffset + 1] = random(); // sway frequency
    characteristics[dataOffset + 2] = random(); // phase
    characteristics[dataOffset + 3] = random(); // size / gust response
  }

  return { positions, characteristics };
}

function createSkyMaterial(enhanced: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'WinterOvercastSky',
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: true,
    uniforms: {
      uTime: { value: 0 },
      uZenith: { value: new THREE.Color(WINTER_PALETTE.zenith) },
      uUpperCloud: { value: new THREE.Color(WINTER_PALETTE.upperCloud) },
      uLowerCloud: { value: new THREE.Color(WINTER_PALETTE.lowerCloud) },
      uHorizon: { value: new THREE.Color(WINTER_PALETTE.horizon) },
      uFog: { value: new THREE.Color(WINTER_PALETTE.fog) },
    },
    defines: { ENHANCED_SKY: enhanced ? 1 : 0 },
    vertexShader: /* glsl */`
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(position);
        vec4 clipPosition = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = clipPosition.xyww;
      }
    `,
    fragmentShader: /* glsl */`
      precision highp float;

      uniform float uTime;
      uniform vec3 uZenith;
      uniform vec3 uUpperCloud;
      uniform vec3 uLowerCloud;
      uniform vec3 uHorizon;
      uniform vec3 uFog;
      varying vec3 vDirection;

      float hash31(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.yzx + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float valueNoise(vec3 p) {
        vec3 cell = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash31(cell);
        float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(cell + vec3(1.0));
        return mix(
          mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
          mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
          f.z
        );
      }

      float fbm(vec3 p) {
        float value = 0.0;
        value += valueNoise(p) * 0.52;
        p = p * 2.03 + vec3(7.1, 3.7, 5.9);
        value += valueNoise(p) * 0.27;
        p = p * 2.07 + vec3(2.4, 8.3, 1.7);
        value += valueNoise(p) * 0.14;
        p = p * 2.01 + vec3(4.8, 1.2, 9.1);
        value += valueNoise(p) * 0.07;
        return value;
      }

      void main() {
        vec3 direction = normalize(vDirection);
        float height = direction.y;
        float skyAmount = smoothstep(-0.12, 0.78, height);
        vec3 colour = mix(uHorizon, uZenith, skyAmount);

        vec3 wind = vec3(uTime * 0.0035, 0.0, uTime * 0.0015);
        #if ENHANCED_SKY == 1
          float broadCloud = fbm(direction * 3.0 + wind);
          float detailCloud = fbm(direction * 7.5 - wind * 1.7 + vec3(13.0));
          float cloud = smoothstep(0.34, 0.73, broadCloud * 0.77 + detailCloud * 0.23);
        #else
          float broadCloud = sin((direction.x + wind.x) * 8.0) * 0.18
            + cos((direction.z + wind.z) * 6.0) * 0.14 + 0.52;
          float cloud = smoothstep(0.39, 0.66, broadCloud);
        #endif
        cloud *= smoothstep(-0.10, 0.15, height);
        float underside = smoothstep(0.40, 0.82, broadCloud - height * 0.13);
        vec3 cloudColour = mix(uUpperCloud, uLowerCloud, underside * 0.84);
        colour = mix(colour, cloudColour, cloud * 0.82);

        // Fog-coloured horizon veil hides the dome seam and visually anchors distant geometry.
        float horizonVeil = 1.0 - smoothstep(0.015, 0.25, abs(height));
        colour = mix(colour, uFog, horizonVeil * 0.72);
        gl_FragColor = vec4(colour, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function createSnowMaterial(radius: number, height: number, pixelRatio: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'CameraRelativeGpuSnow',
    transparent: true,
    depthTest: true,
    depthWrite: false,
    fog: false,
    toneMapped: true,
    blending: THREE.NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: radius },
      uHeight: { value: height },
      uPixelRatio: { value: pixelRatio },
      uSnowColour: { value: new THREE.Color(WINTER_PALETTE.snow) },
    },
    vertexShader: /* glsl */`
      attribute vec4 snowData;
      uniform float uTime;
      uniform float uRadius;
      uniform float uHeight;
      uniform float uPixelRatio;
      varying float vOpacity;
      varying float vSparkle;

      void main() {
        float halfHeight = uHeight * 0.5;
        float fallSpeed = mix(1.15, 3.2, snowData.x);
        vec3 particle = position;
        particle.y = mod(position.y - uTime * fallSpeed + halfHeight, uHeight) - halfHeight;
        float gust = sin(uTime * mix(0.35, 0.92, snowData.y) + snowData.z * 6.2831853);
        particle.x += uTime * mix(0.14, 0.42, snowData.x) + gust * mix(0.14, 0.9, snowData.w);
        particle.z += cos(uTime * 0.23 + snowData.z * 6.2831853) * mix(0.08, 0.48, snowData.w);
        // Wrap horizontal drift without touching the immutable source buffer.
        particle.x = mod(particle.x + uRadius, uRadius * 2.0) - uRadius;

        vec4 viewPosition = modelViewMatrix * vec4(particle, 1.0);
        gl_Position = projectionMatrix * viewPosition;
        float perspectiveSize = 420.0 / max(1.0, -viewPosition.z);
        gl_PointSize = clamp(mix(0.055, 0.13, snowData.w) * uPixelRatio * perspectiveSize, 1.0, 6.5);

        float radial = length(particle.xz) / uRadius;
        float edgeFade = 1.0 - smoothstep(0.78, 1.0, radial);
        float depthFade = 1.0 - smoothstep(uRadius * 0.58, uRadius, length(viewPosition.xyz));
        vOpacity = edgeFade * mix(0.30, 0.82, snowData.w) * max(0.22, depthFade);
        vSparkle = snowData.z;
      }
    `,
    fragmentShader: /* glsl */`
      precision mediump float;

      uniform vec3 uSnowColour;
      varying float vOpacity;
      varying float vSparkle;

      void main() {
        vec2 centred = gl_PointCoord - 0.5;
        float radius = length(centred);
        float softDisc = 1.0 - smoothstep(0.24, 0.50, radius);
        float crystallineCore = 1.0 - smoothstep(0.02, 0.22, radius);
        float alpha = softDisc * vOpacity;
        if (alpha < 0.012) discard;
        vec3 colour = uSnowColour * mix(0.88, 1.16, crystallineCore * (0.55 + vSparkle * 0.45));
        gl_FragColor = vec4(colour, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

function generateEnvironment(
  renderer: THREE.WebGLRenderer,
  skyMaterial: THREE.ShaderMaterial,
  enhanced: boolean,
): THREE.WebGLRenderTarget {
  const generator = new THREE.PMREMGenerator(renderer);
  const environmentScene = new THREE.Scene();
  const geometry = new THREE.SphereGeometry(20, enhanced ? 32 : 16, enhanced ? 16 : 8);
  const material = skyMaterial.clone();
  material.uniforms.uTime!.value = 173;
  const dome = new THREE.Mesh(geometry, material);
  environmentScene.add(dome);

  try {
    generator.compileCubemapShader();
    return generator.fromScene(environmentScene, enhanced ? .08 : .14, .1, 30);
  } finally {
    geometry.dispose();
    material.dispose();
    generator.dispose();
  }
}

/**
 * Installs a camera-relative winter sky and GPU snow volume into `scene`.
 * Call `update` once per frame, after the camera transform has been resolved.
 */
export function createWinterAtmosphere(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  viewScene: THREE.Scene,
  enhanced: boolean,
  options: WinterAtmosphereOptions = {},
): WinterAtmosphere {
  const skyRadius = finitePositive(options.skyRadius, DEFAULT_SKY_RADIUS, 'skyRadius');
  const snowRadius = finitePositive(options.snowRadius, DEFAULT_SNOW_RADIUS, 'snowRadius');
  const snowHeight = finitePositive(options.snowHeight, DEFAULT_SNOW_HEIGHT, 'snowHeight');
  const snowCount = finiteCount(options.snowCount, enhanced ? WINTER_SNOW_COUNTS.enhanced : WINTER_SNOW_COUNTS.fallback);
  const fogDensity = finitePositive(options.fogDensity, DEFAULT_WINTER_FOG_DENSITY, 'fogDensity');
  const pixelRatio = Math.min(2, Math.max(.5, renderer.getPixelRatio()));

  const previousBackground = scene.background;
  const previousFog = scene.fog;
  const previousEnvironment = scene.environment;
  const previousViewEnvironment = viewScene.environment;

  const fog = new THREE.FogExp2(WINTER_PALETTE.fog, fogDensity);
  scene.fog = fog;
  scene.background = new THREE.Color(WINTER_PALETTE.fog);

  const skyMaterial = createSkyMaterial(enhanced);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(skyRadius, enhanced ? 40 : 24, enhanced ? 20 : 12), skyMaterial);
  sky.name = 'winter-overcast-sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  scene.add(sky);

  const seedData = createSnowSeedData(snowCount, snowRadius, snowHeight, options.seed ?? DEFAULT_SEED);
  const snowGeometry = new THREE.BufferGeometry();
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(seedData.positions, 3).setUsage(THREE.StaticDrawUsage));
  snowGeometry.setAttribute('snowData', new THREE.BufferAttribute(seedData.characteristics, 4).setUsage(THREE.StaticDrawUsage));
  const snowMaterial = createSnowMaterial(snowRadius, snowHeight, pixelRatio);
  const snow = new THREE.Points(snowGeometry, snowMaterial);
  snow.name = 'camera-relative-gpu-snow';
  snow.frustumCulled = false;
  snow.renderOrder = 60;
  scene.add(snow);

  let environmentTarget: THREE.WebGLRenderTarget | null = null;
  if (options.environment ?? enhanced) {
    environmentTarget = generateEnvironment(renderer, skyMaterial, enhanced);
    scene.environment = environmentTarget.texture;
    viewScene.environment = environmentTarget.texture;
  }

  const worldPosition = new THREE.Vector3();
  let disposed = false;

  return {
    sky,
    snow,
    fog,
    environment: environmentTarget?.texture ?? null,
    update(time: number, camera: THREE.Camera): void {
      if (disposed) return;
      const safeTime = Number.isFinite(time) ? Math.max(0, time) % 4096 : 0;
      camera.getWorldPosition(worldPosition);
      sky.position.copy(worldPosition);
      snow.position.copy(worldPosition);
      skyMaterial.uniforms.uTime!.value = safeTime;
      snowMaterial.uniforms.uTime!.value = safeTime;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      scene.remove(sky, snow);
      sky.geometry.dispose();
      skyMaterial.dispose();
      snowGeometry.dispose();
      snowMaterial.dispose();
      if (scene.fog === fog) scene.fog = previousFog;
      if (scene.background instanceof THREE.Color && scene.background.getHex() === WINTER_PALETTE.fog) {
        scene.background = previousBackground;
      }
      if (environmentTarget) {
        if (scene.environment === environmentTarget.texture) scene.environment = previousEnvironment;
        if (viewScene.environment === environmentTarget.texture) viewScene.environment = previousViewEnvironment;
        environmentTarget.dispose();
        environmentTarget = null;
      }
    },
  };
}

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const fract = (x) => x - Math.floor(x);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(0xa9f31c7d);

function hash2(x, y) {
  return fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453123);
}
function vnoise(x, y) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
function fbm(x, y, octaves = 4) {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < octaves; i++) {
    v += amp * vnoise(x * freq, y * freq);
    freq *= 2.03;
    amp *= 0.5;
  }
  return v;
}
function noise3(x, y, z) {
  return (
    Math.sin(x * 1.7 + Math.cos(y * 2.1 + z * 0.7)) *
      Math.cos(y * 1.9 + Math.sin(z * 2.3 + x * 0.5)) *
      0.55 +
    Math.sin(x * 3.2 + y * 2.7 + z * 1.3) * 0.25 +
    Math.cos(x * 4.1 - y * 3.6 + z * 2.2) * 0.15
  );
}

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
function showWebGLFallback() {
  const fallback = document.getElementById('webglFallback');
  const loading = document.getElementById('loading');
  if (fallback) fallback.hidden = false;
  if (loading) {
    loading.classList.add('hidden');
    loading.setAttribute('aria-hidden', 'true');
  }
  document.body.classList.add('webgl-unavailable');
}

function canvasTexture(canvas, srgb = true, repeatX = 1, repeatY = 1) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 4;
  return tex;
}

// ---------------------------------------------------------------------------
// Renderer / scene / camera
// ---------------------------------------------------------------------------
const container = document.getElementById('app');
let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
} catch (error) {
  console.error('Aquascape: WebGL renderer could not be created.', error);
  showWebGLFallback();
}

if (renderer) {
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03080b);
scene.fog = new THREE.FogExp2(0x03171c, 0.038);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 80);
const cameraLook = new THREE.Vector3(0, 2.15, 0);
let cameraZBase = 10.2;

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.26,
  0.62,
  0.80
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const clock = new THREE.Clock();
let elapsed = 0;

const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduceMotionQuery.matches;
let manualMotionChoice = false;
let rafId = 0;
let firstFrame = true;
let feedSerial = 0;

// ---------------------------------------------------------------------------
// Procedural environment map (for fish / glass / metal highlights)
// ---------------------------------------------------------------------------
function buildEnvironmentTexture() {
  const c = makeCanvas(1024, 512);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#0a2228');
  g.addColorStop(0.32, '#0d3034');
  g.addColorStop(0.52, '#06171a');
  g.addColorStop(0.72, '#02090b');
  g.addColorStop(1, '#010304');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1024, 512);

  // soft overhead light bars
  for (let i = 0; i < 5; i++) {
    const x = 180 + i * 165;
    const rg = ctx.createRadialGradient(x, 40, 0, x, 40, 170);
    rg.addColorStop(0, 'rgba(180,235,240,0.45)');
    rg.addColorStop(0.3, 'rgba(90,170,180,0.18)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(x - 180, 0, 360, 230);
  }
  // faint green reflected glow near the lower front
  const rg2 = ctx.createRadialGradient(512, 340, 10, 512, 340, 330);
  rg2.addColorStop(0, 'rgba(20,74,63,0.28)');
  rg2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg2;
  ctx.fillRect(0, 120, 1024, 392);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
scene.environment = buildEnvironmentTexture();
scene.environmentIntensity = 0.7;

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------
const hemi = new THREE.HemisphereLight(0x9bdbe4, 0x061012, 0.85);
scene.add(hemi);

const keyLight = new THREE.DirectionalLight(0xd8f2f5, 2.2);
keyLight.position.set(2.5, 9.5, 4.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6.5;
keyLight.shadow.camera.right = 6.5;
keyLight.shadow.camera.top = 6.5;
keyLight.shadow.camera.bottom = -1.5;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 22;
keyLight.shadow.bias = -0.0007;
keyLight.shadow.normalBias = 0.025;
keyLight.target.position.set(0, 1.8, 0);
scene.add(keyLight);
scene.add(keyLight.target);

const fill = new THREE.PointLight(0x2b8a95, 18, 9, 2);
fill.position.set(-3.85, 2.15, 1.25);
scene.add(fill);

const rim = new THREE.PointLight(0x4d9c8a, 15, 7, 2);
rim.position.set(3.2, 2.1, -1.2);
scene.add(rim);

const surfaceLight = new THREE.SpotLight(0xbdeff5, 70, 14, 0.7, 1, 1.7);
surfaceLight.position.set(0.5, 7.2, 1.5);
surfaceLight.target.position.set(0, 1.5, -0.2);
scene.add(surfaceLight);
scene.add(surfaceLight.target);

const warmLight = new THREE.PointLight(0xffb877, 16, 7, 2);
warmLight.position.set(-1.2, 3.9, 0.8);
scene.add(warmLight);

// soft frontal fill so mid-ground fish keep their colour instead of reading as silhouettes
const frontFill = new THREE.PointLight(0xa8d6de, 8, 11, 2);
frontFill.position.set(0, 3.1, 2.2);
scene.add(frontFill);

// ---------------------------------------------------------------------------
// Aquarium dimensions and frame
// ---------------------------------------------------------------------------
const TANK = {
  w: 8.4,
  h: 4.4,
  d: 4.6,
  frontZ: 2.36,
  backZ: -2.3,
  waterY: 4.05,
};

function sandHeight(x, z) {
  const back = (z + TANK.d / 2) / TANK.d; // 0 front, 1 back
  let h = 0.10 + 0.30 * back;
  h += 0.16 * fbm(x * 0.62 + 4.3, z * 0.62 - 2.1);
  h += 0.17 * Math.exp(-(((x + 2.8) ** 2) / 3.2 + ((z + 0.55) ** 2) / 2.2));
  h += 0.10 * Math.exp(-(((x - 2.6) ** 2) / 3.5 + ((z + 1.15) ** 2) / 2.6));
  h -= 0.035 * Math.exp(-(((z - 1.55) ** 2) / 0.7));
  return h;
}

const metal = new THREE.MeshStandardMaterial({
  color: 0x101416,
  metalness: 0.9,
  roughness: 0.28,
});
const metalEdge = new THREE.MeshStandardMaterial({
  color: 0x2a3033,
  metalness: 0.95,
  roughness: 0.2,
});

function box(w, h, d, x, y, z, mat, parent = scene) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// cabinet
const cabinetMat = new THREE.MeshStandardMaterial({
  color: 0x151a1c,
  metalness: 0.35,
  roughness: 0.52,
});
box(9.55, 1.55, 4.4, 0, -0.88, -0.2, cabinetMat);
box(9.8, 0.16, 4.65, 0, -0.08, -0.2, metal);
box(9.7, 0.08, 4.55, 0, 0.03, -0.2, metalEdge);
// cabinet door seams and handles
box(0.02, 1.25, 0.03, -2.5, -0.9, 2.01, metalEdge);
box(0.02, 1.25, 0.03, 2.5, -0.9, 2.01, metalEdge);
box(0.9, 0.025, 0.04, -1.1, -0.55, 2.03, metalEdge);
box(0.9, 0.025, 0.04, 1.1, -0.55, 2.03, metalEdge);

// frame rails
box(9.2, 0.22, 0.28, 0, 4.51, 2.35, metal);
box(9.2, 0.22, 0.28, 0, 0.01, 2.35, metal);
box(0.22, 4.5, 0.28, -4.48, 2.25, 2.35, metal);
box(0.22, 4.5, 0.28, 4.48, 2.25, 2.35, metal);
// slim highlight on frame edges
box(9.0, 0.035, 0.03, 0, 4.63, 2.49, metalEdge);
box(9.0, 0.035, 0.03, 0, -0.1, 2.49, metalEdge);

// top hood / LED fixture
const hood = new THREE.Mesh(
  new THREE.BoxGeometry(9.0, 0.22, 1.0),
  new THREE.MeshStandardMaterial({ color: 0x0b0e10, metalness: 0.7, roughness: 0.35 })
);
hood.position.set(0, 4.66, -0.35);
scene.add(hood);
const ledBar = new THREE.Mesh(
  new THREE.BoxGeometry(7.2, 0.035, 0.13),
  new THREE.MeshBasicMaterial({ color: 0xcaf6ff, toneMapped: false })
);
ledBar.position.set(0, 4.54, 0.1);
scene.add(ledBar);
const ledGlow = new THREE.Mesh(
  new THREE.BoxGeometry(7.5, 0.05, 0.55),
  new THREE.MeshBasicMaterial({
    color: 0x5db9c7,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  })
);
ledGlow.position.set(0, 4.53, 0.1);
scene.add(ledGlow);

// room backdrop
const backdrop = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 22),
  new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
    `,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      void main(){
        vec2 p = vUv - vec2(0.5,0.45);
        float glow = exp(-length(p*vec2(1.1,2.2))*5.0);
        vec3 col = mix(vec3(0.005,0.012,0.016), vec3(0.018,0.043,0.050), glow);
        col += vec3(0.01,0.025,0.03) * smoothstep(0.0,0.8,vUv.y);
        float d = length(vUv-0.5);
        col *= 1.0 - smoothstep(0.35,0.85,d)*0.55;
        gl_FragColor = vec4(col,1.0);
      }
    `,
    depthWrite: false,
  })
);
backdrop.position.set(0, 4, -7.5);
scene.add(backdrop);

// ---------------------------------------------------------------------------
// Front glass
// ---------------------------------------------------------------------------
const glassUniforms = {
  uTime: { value: 0 },
};
const glassMat = new THREE.ShaderMaterial({
  uniforms: glassUniforms,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    void main(){
      vUv = uv;
      vec4 wp = modelMatrix * vec4(position,1.0);
      vWorld = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    varying vec2 vUv;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    uniform float uTime;
    void main(){
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - abs(dot(normalize(vNormalW), V)), 3.0);
      // broad diagonal reflection of the room's softbox
      float band = smoothstep(0.12, 0.22, vUv.x) * (1.0 - smoothstep(0.22, 0.34, vUv.x));
      band *= smoothstep(0.18, 0.55, vUv.y) * (1.0 - smoothstep(0.58, 0.92, vUv.y));
      float streak = smoothstep(0.72, 0.735, vUv.x) * (1.0 - smoothstep(0.735, 0.78, vUv.x));
      streak *= smoothstep(0.0, 0.8, vUv.y);
      // waterline haze
      float line = exp(-pow((vUv.y - 0.79) * 45.0, 2.0));
      float smudge = 0.5 + 0.5*sin(vUv.x*31.0 + uTime*0.02) * sin(vUv.y*17.0);
      vec3 col = vec3(0.035,0.11,0.13);
      col += vec3(0.13,0.26,0.29) * (fres*0.45 + band*0.24 + streak*0.18);
      col += vec3(0.14,0.25,0.26) * line * 0.18;
      col += vec3(0.02,0.06,0.06) * smudge * 0.25;
      float alpha = 0.014 + fres*0.085 + band*0.025 + streak*0.022 + line*0.018;
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.16));
    }
  `,
});
const frontGlass = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w, TANK.h), glassMat);
frontGlass.position.set(0, 2.2, TANK.frontZ);
frontGlass.renderOrder = 20;
scene.add(frontGlass);


// ---------------------------------------------------------------------------
// Tank interior backdrop
// ---------------------------------------------------------------------------
const backWallMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime;
    float caustic(vec2 p, float t){
      vec2 q = p*1.2;
      float v = sin(q.x + sin(q.y*1.4 + t*0.7)) + sin(q.y*1.15 + cos(q.x*1.1 - t*0.55));
      v += 0.55*sin((q.x+q.y)*1.9 + t*0.35);
      return pow(max(0.0, 1.0-abs(v)*0.33), 5.0);
    }
    void main(){
      float depth = smoothstep(0.0,1.0,vUv.y);
      vec3 col = mix(vec3(0.012,0.062,0.066), vec3(0.004,0.018,0.024), depth);
      // soft light shafts from above
      float shaft = 0.0;
      shaft += exp(-pow((vUv.x-0.22-sin(uTime*0.07)*0.03)*7.0,2.0));
      shaft += exp(-pow((vUv.x-0.51+cos(uTime*0.06)*0.03)*10.0,2.0))*0.7;
      shaft += exp(-pow((vUv.x-0.76)*9.0,2.0))*0.55;
      col += vec3(0.035,0.115,0.125) * shaft * smoothstep(0.05,0.75,vUv.y) * 0.55;
      float c = caustic(vUv*vec2(9.0,6.0), uTime*0.22);
      col += vec3(0.09,0.24,0.22) * c * 0.35;
      // vignette / floor shadow
      float vg = smoothstep(0.0,0.55,vUv.y);
      col *= 0.7 + 0.3*vg;
      gl_FragColor = vec4(col,1.0);
    }
  `,
});
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w, TANK.h), backWallMat);
backWall.position.set(0, 2.2, TANK.backZ + 0.01);
scene.add(backWall);

// ---------------------------------------------------------------------------
// Sand / substrate
// ---------------------------------------------------------------------------
const sandGeo = new THREE.PlaneGeometry(TANK.w, TANK.d, 150, 100);
sandGeo.rotateX(-Math.PI / 2);
const sandPos = sandGeo.attributes.position;
for (let i = 0; i < sandPos.count; i++) {
  const x = sandPos.getX(i);
  const z = sandPos.getZ(i);
  sandPos.setY(i, sandHeight(x, z));
}
sandGeo.computeVertexNormals();

const sandMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0x03171c) },
    uFogDensity: { value: 0.038 },
  },
  vertexShader: `
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying float vFogDepth;
    void main(){
      vec4 wp = modelMatrix * vec4(position,1.0);
      vWorld = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 mv = viewMatrix * wp;
      vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying float vFogDepth;
    uniform float uTime;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
    float noise(vec2 p){
      vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y);
    }
    float caustic(vec2 p, float t){
      vec2 q = p*1.3;
      float v = sin(q.x + sin(q.y*1.35 + t*0.8)) + sin(q.y*1.18 + cos(q.x*1.07 - t*0.62));
      v += 0.5*sin((q.x+q.y)*1.8 + t*0.4);
      return pow(max(0.0, 1.0-abs(v)*0.33), 6.0);
    }
    void main(){
      float n = noise(vWorld.xz*7.0)*0.55 + noise(vWorld.xz*22.0)*0.3 + noise(vWorld.xz*61.0)*0.15;
      vec3 darkSand = vec3(0.17,0.135,0.095);
      vec3 lightSand = vec3(0.50,0.39,0.25);
      vec3 col = mix(darkSand, lightSand, smoothstep(0.15,0.9,n));
      float grain = hash(floor(vWorld.xz*160.0));
      col *= 0.84 + 0.28*grain;
      // small pebble-like flecks
      float fleck = smoothstep(0.90,0.985,hash(floor(vWorld.xz*34.0)+3.0));
      col = mix(col, vec3(0.72,0.65,0.52), fleck*0.35);
      float c = caustic(vWorld.xz*0.62, uTime*0.36);
      float light = 0.64 + 0.36*max(vNormalW.y,0.0);
      col *= light;
      col += c * vec3(0.42,0.66,0.54) * 0.72;
      col += pow(grain, 18.0) * c * vec3(0.6,0.55,0.4) * 1.1;
      float fog = 1.0 - exp(-uFogDensity*uFogDensity*vFogDepth*vFogDepth);
      col = mix(col, uFogColor, fog);
      gl_FragColor = vec4(col,1.0);
    }
  `,
});
const sand = new THREE.Mesh(sandGeo, sandMat);
sand.receiveShadow = true;
scene.add(sand);

// scattered pebbles
const pebbleGeo = new THREE.IcosahedronGeometry(1, 0);
const pebbleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.03 });
const pebbleCount = 260;
const pebbles = new THREE.InstancedMesh(pebbleGeo, pebbleMat, pebbleCount);
const dummy = new THREE.Object3D();
const pebbleColors = [0x9f927e, 0x7d7468, 0xb9a98f, 0x5f5b53, 0xc7b99d, 0x8b806d];
for (let i = 0; i < pebbleCount; i++) {
  const x = (rand() - 0.5) * (TANK.w - 0.35);
  const z = (rand() - 0.5) * (TANK.d - 0.3);
  const s = 0.035 + rand() * 0.13;
  dummy.position.set(x, sandHeight(x, z) + s * 0.25, z);
  dummy.rotation.set(rand() * 2, rand() * 6.28, rand() * 2);
  dummy.scale.set(s * (0.7 + rand() * 0.7), s * (0.4 + rand() * 0.4), s * (0.8 + rand() * 0.6));
  dummy.updateMatrix();
  pebbles.setMatrixAt(i, dummy.matrix);
  pebbles.setColorAt(i, new THREE.Color(pebbleColors[(rand() * pebbleColors.length) | 0]));
}
pebbles.instanceMatrix.needsUpdate = true;
pebbles.instanceColor.needsUpdate = true;
pebbles.receiveShadow = true;
scene.add(pebbles);

// ---------------------------------------------------------------------------
// Rocks
// ---------------------------------------------------------------------------
function createRockTexture() {
  const c = makeCanvas(256, 256);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5b5a52';
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    const x = rand() * 256;
    const y = rand() * 256;
    const v = 35 + rand() * 120;
    ctx.fillStyle = `rgba(${v},${v * 0.96},${v * 0.84},${0.04 + rand() * 0.13})`;
    ctx.fillRect(x, y, 1 + rand() * 5, 1 + rand() * 2);
  }
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(20,22,20,${0.06 + rand() * 0.08})`;
    ctx.lineWidth = 0.5 + rand() * 1.5;
    ctx.beginPath();
    ctx.moveTo(rand() * 256, rand() * 256);
    ctx.bezierCurveTo(rand() * 256, rand() * 256, rand() * 256, rand() * 256, rand() * 256, rand() * 256);
    ctx.stroke();
  }
  return canvasTexture(c, false, 2, 2);
}
const rockBump = createRockTexture();

function createShadowTexture() {
  const c = makeCanvas(128, 128);
  const ctx = c.getContext('2d');
  const grd = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grd.addColorStop(0.0, 'rgba(0,0,0,0.78)');
  grd.addColorStop(0.42, 'rgba(0,0,0,0.5)');
  grd.addColorStop(0.78, 'rgba(0,0,0,0.14)');
  grd.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(c, false, 1, 1);
}
const shadowTex = createShadowTexture();
const contactShadowMat = new THREE.MeshBasicMaterial({
  map: shadowTex,
  transparent: true,
  opacity: 0.5,
  depthWrite: false,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
});

function createRock(radius, seed, opts = {}) {
  let geo = new THREE.IcosahedronGeometry(radius, opts.detail || 4);
  // IcosahedronGeometry is non-indexed; weld it so the rock reads as a smooth
  // weathered stone instead of a faceted low-poly boulder.
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo, 1e-4);
  const pos = geo.attributes.position;
  const colors = [];
  const uvs = [];
  const colorBase = new THREE.Color(opts.color || 0x4b4f48);
  const colorDark = new THREE.Color(0x252a28);
  const colorLight = new THREE.Color(0x7c7a6d);
  const mossColor = new THREE.Color(0x2e4f2e);
  const tmp = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const r = mulberry32(seed);
  for (let i = 0; i < pos.count; i++) {
    tmp.set(pos.getX(i), pos.getY(i), pos.getZ(i));
    normal.copy(tmp).normalize();
    const n = noise3(tmp.x * 1.2 + seed, tmp.y * 1.2 - seed, tmp.z * 1.2);
    const n2 = noise3(tmp.x * 3.7, tmp.y * 3.7 + seed * 0.2, tmp.z * 3.7);
    const disp = 0.86 + n * 0.13 + n2 * 0.06 + r() * 0.022;
    tmp.multiplyScalar(disp);
    // flatten the base a little and create a broader shoulder
    tmp.y *= opts.flatten || 0.82;
    if (tmp.y < -radius * 0.5) tmp.y = -radius * 0.5 + (tmp.y + radius * 0.5) * 0.35;
    pos.setXYZ(i, tmp.x, tmp.y, tmp.z);
    const theta = Math.atan2(tmp.z, tmp.x) / (Math.PI * 2) + 0.5;
    uvs.push(theta * 2.0, tmp.y / radius * 0.5 + 0.5);

    const up = normal.y;
    const mixA = clamp(0.24 + n * 0.85 + n2 * 0.35 + r() * 0.3, 0, 1);
    const col = colorBase.clone().lerp(colorLight, mixA * 0.65).lerp(colorDark, r() * 0.3);
    if (up > 0.35 && n2 > 0.1) {
      col.lerp(mossColor, clamp((up - 0.35) * 1.3 + n2 * 0.3, 0, 0.55));
    }
    colors.push(col.r, col.g, col.b);
  }
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.93,
    metalness: 0.02,
    bumpMap: rockBump,
    bumpScale: 0.16,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const rockGroup = new THREE.Group();
scene.add(rockGroup);
const rockDefs = [
  { x: -2.85, z: -0.78, radius: 1.32, yOff: 0.57, seed: 11, scale: [1.15, 0.92, 1.0], flatten: 0.82 },
  { x: -1.55, z: -1.28, radius: 0.88, yOff: 0.37, seed: 23, scale: [1.0, 0.9, 0.9], flatten: 0.8 },
  { x: 3.12, z: -1.05, radius: 1.02, yOff: 0.45, seed: 37, scale: [1.05, 0.82, 1.05], flatten: 0.78 },
  { x: 0.48, z: -1.88, radius: 0.82, yOff: 0.32, seed: 53, scale: [1.1, 0.86, 0.9], flatten: 0.8 },
  { x: 1.42, z: 0.95, radius: 0.34, yOff: 0.12, seed: 71, scale: [1.1, 0.75, 1.0], flatten: 0.75 },
  { x: -3.78, z: 0.9, radius: 0.42, yOff: 0.15, seed: 89, scale: [1.0, 0.8, 0.9], flatten: 0.75 },
];
const rocks = [];
for (const d of rockDefs) {
  const mesh = createRock(d.radius, d.seed, { flatten: d.flatten });
  mesh.position.set(d.x, sandHeight(d.x, d.z) + d.yOff, d.z);
  mesh.scale.set(d.scale[0], d.scale[1], d.scale[2]);
  rockGroup.add(mesh);
  rocks.push(mesh);

  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactShadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(d.x, sandHeight(d.x, d.z) + 0.022, d.z);
  shadow.scale.set(d.radius * d.scale[0] * 2.45, d.radius * d.scale[2] * 2.05, 1);
  shadow.renderOrder = 2;
  scene.add(shadow);
}

// soft shadows where the driftwood meets the substrate
for (const [sx, sz, sxScale, szScale] of [[-2.75, 0.0, 1.15, 0.48], [2.35, -0.28, 0.72, 0.4]]) {
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactShadowMat);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(sx, sandHeight(sx, sz) + 0.021, sz);
  shadow.scale.set(sxScale, szScale, 1);
  shadow.renderOrder = 2;
  scene.add(shadow);
}

// obstacle spheres for fish avoidance
const obstacles = rockDefs.map((d) => ({
  x: d.x,
  y: sandHeight(d.x, d.z) + d.yOff,
  z: d.z,
  r: d.radius * Math.max(d.scale[0], d.scale[2]) * 0.88,
}));

// moss tufts on rock shoulders
const mossGeo = new THREE.SphereGeometry(1, 5, 4);
const mossMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 });
const mossCount = 330;
const moss = new THREE.InstancedMesh(mossGeo, mossMat, mossCount);
const mossColors = [0x2e5b33, 0x3d6e3b, 0x244a2d, 0x537c44];
let mi = 0;
for (const rock of rocks) {
  const geo = rock.geometry;
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  const candidates = [];
  for (let i = 0; i < p.count; i++) {
    if (n.getY(i) > 0.18 && rand() < 0.075) candidates.push(i);
  }
  for (const i of candidates) {
    if (mi >= mossCount) break;
    const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
    v.multiply(rock.scale).add(rock.position);
    dummy.position.copy(v).add(new THREE.Vector3(0, 0.015, 0));
    dummy.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    const s = 0.018 + rand() * 0.045;
    dummy.scale.set(s, s * (0.35 + rand() * 0.4), s);
    dummy.updateMatrix();
    moss.setMatrixAt(mi, dummy.matrix);
    moss.setColorAt(mi, new THREE.Color(mossColors[(rand() * mossColors.length) | 0]));
    mi++;
  }
}
for (; mi < mossCount; mi++) {
  dummy.scale.set(0, 0, 0);
  dummy.updateMatrix();
  moss.setMatrixAt(mi, dummy.matrix);
}
moss.instanceMatrix.needsUpdate = true;
moss.instanceColor.needsUpdate = true;
scene.add(moss);

// ---------------------------------------------------------------------------
// Driftwood
// ---------------------------------------------------------------------------
function createBarkTexture() {
  const c = makeCanvas(512, 128);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#4a3527';
  ctx.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 420; i++) {
    const x = rand() * 512;
    const v = 25 + rand() * 70;
    ctx.strokeStyle = `rgba(${v},${v * 0.72},${v * 0.5},${0.08 + rand() * 0.2})`;
    ctx.lineWidth = 0.5 + rand() * 2.2;
    ctx.beginPath();
    ctx.moveTo(x, rand() * 128);
    ctx.bezierCurveTo(x + rand() * 20 - 10, rand() * 128, x + rand() * 30 - 15, rand() * 128, x + rand() * 10 - 5, 128);
    ctx.stroke();
  }
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = `rgba(15,10,7,${0.1 + rand() * 0.2})`;
    ctx.beginPath();
    ctx.ellipse(rand() * 512, rand() * 128, 1 + rand() * 4, 1 + rand() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return canvasTexture(c, true, 2, 2);
}
const barkTex = createBarkTexture();
const woodMat = new THREE.MeshStandardMaterial({
  map: barkTex,
  bumpMap: barkTex,
  bumpScale: 0.05,
  color: 0xa08065,
  roughness: 0.88,
  metalness: 0.02,
});

function taperedTube(curve, segments, radialSegments, radiusFn, seed = 0) {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const r = mulberry32(seed);
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    const radius = radiusFn(t);
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      const n = new THREE.Vector3(
        cos * N.x + sin * B.x,
        cos * N.y + sin * B.y,
        cos * N.z + sin * B.z
      ).normalize();
      const bump = 1 + (r() - 0.5) * 0.12;
      positions.push(p.x + n.x * radius * bump, p.y + n.y * radius * bump, p.z + n.z * radius * bump);
      normals.push(n.x, n.y, n.z);
      uvs.push(t * 4, j / radialSegments);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * (radialSegments + 1) + j;
      const b = a + 1;
      const c = a + radialSegments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

const woodGroup = new THREE.Group();
scene.add(woodGroup);
const woodCurves = [
  {
    pts: [
      [-3.65, 0.44, -0.45],
      [-3.0, 0.75, -0.7],
      [-2.25, 1.35, -0.9],
      [-1.3, 1.95, -1.05],
      [-0.2, 2.24, -1.12],
      [1.1, 2.24, -1.26],
      [2.75, 1.95, -1.5],
    ],
    radius: (t) => 0.21 * (1 - t) + 0.055 * t,
    seed: 101,
    segs: 80,
  },
  {
    pts: [
      [-1.75, 1.55, -0.96],
      [-1.25, 2.15, -1.2],
      [-0.65, 2.55, -1.34],
      [-0.1, 2.8, -1.45],
    ],
    radius: (t) => 0.095 * (1 - t) + 0.018 * t,
    seed: 102,
    segs: 40,
  },
  {
    pts: [
      [0.3, 2.22, -1.2],
      [1.0, 1.85, -1.02],
      [1.7, 1.45, -0.82],
      [2.4, 1.2, -0.6],
    ],
    radius: (t) => 0.075 * (1 - t) + 0.015 * t,
    seed: 103,
    segs: 40,
  },
  {
    pts: [
      [-2.9, 0.72, -0.68],
      [-2.65, 0.3, -0.2],
      [-2.55, 0.12, 0.3],
    ],
    radius: (t) => 0.07 * (1 - t) + 0.025 * t,
    seed: 104,
    segs: 24,
  },
  {
    pts: [
      [2.65, 1.98, -1.48],
      [3.2, 2.35, -1.65],
      [3.7, 2.6, -1.7],
    ],
    radius: (t) => 0.06 * (1 - t) + 0.012 * t,
    seed: 105,
    segs: 24,
  },
];
for (const w of woodCurves) {
  const curve = new THREE.CatmullRomCurve3(w.pts.map((p) => new THREE.Vector3(...p)));
  const geo = taperedTube(curve, w.segs, 10, w.radius, w.seed);
  const mesh = new THREE.Mesh(geo, woodMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  woodGroup.add(mesh);
}
// small knots
const knotGeo = new THREE.SphereGeometry(0.11, 10, 8);
for (const p of [[-2.1, 1.25, -0.93], [0.2, 2.24, -1.2], [1.6, 1.42, -0.88]]) {
  const knot = new THREE.Mesh(knotGeo, woodMat);
  knot.position.set(...p);
  knot.scale.set(1.3, 0.7, 1.1);
  knot.castShadow = true;
  woodGroup.add(knot);
}
// wood obstacles for fish
const woodObstacles = [
  { x: -2.1, y: 1.2, z: -0.95, r: 0.34 },
  { x: -0.7, y: 2.2, z: -1.15, r: 0.33 },
  { x: 1.2, y: 2.15, z: -1.28, r: 0.3 },
  { x: 2.5, y: 1.9, z: -1.45, r: 0.3 },
];
obstacles.push(...woodObstacles);

// ---------------------------------------------------------------------------
// Aquatic plants
// ---------------------------------------------------------------------------
const plantUniforms = {
  uTime: { value: 0 },
  uFogColor: { value: new THREE.Color(0x03171c) },
  uFogDensity: { value: 0.038 },
};
const plantMat = new THREE.ShaderMaterial({
  uniforms: plantUniforms,
  side: THREE.DoubleSide,
  vertexShader: `
    attribute float aPhase;
    attribute float aSway;
    attribute float aFlex;
    attribute vec3 aColor;
    varying vec3 vColor;
    varying vec3 vNormalW;
    varying vec3 vWorld;
    varying vec2 vUv;
    varying float vFogDepth;
    uniform float uTime;
    void main(){
      vUv = uv;
      vColor = aColor;
      vec3 pos = position;
      float w = aSway;
      float s1 = sin(uTime*1.10 + aPhase + pos.y*1.05 + pos.x*0.35);
      float s2 = sin(uTime*0.47 + aPhase*2.3 + pos.z*1.7);
      float s3 = sin(uTime*2.35 + aPhase*0.7 + pos.x*2.0);
      float bend = (s1*0.56 + s2*0.29 + s3*0.15) * aFlex * w * w;
      pos.x += bend;
      pos.z += bend*0.46;
      pos.y -= abs(bend)*0.12;
      vec4 wp = modelMatrix * vec4(pos,1.0);
      vWorld = wp.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vec4 mv = viewMatrix * wp;
      vFogDepth = -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: `
    varying vec3 vColor;
    varying vec3 vNormalW;
    varying vec3 vWorld;
    varying vec2 vUv;
    varying float vFogDepth;
    uniform vec3 uFogColor;
    uniform float uFogDensity;
    void main(){
      vec3 N = normalize(vNormalW);
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 L = normalize(vec3(0.25,0.9,0.45));
      float diff = max(dot(N,L),0.0);
      float trans = max(dot(-N,L),0.0);
      vec3 col = vColor * (0.32 + 0.78*diff);
      col += vColor * vec3(0.26,0.42,0.22) * trans * 0.62;
      float rim = pow(1.0 - max(dot(N,V),0.0), 2.5);
      col += vec3(0.05,0.16,0.12) * rim * 0.5;
      float vein = smoothstep(0.055,0.0,abs(vUv.x-0.5));
      col *= 1.0 - vein*0.13;
      // very subtle mottling
      float mott = 0.94 + 0.06*sin(vUv.y*37.0 + vUv.x*11.0);
      col *= mott;
      float fog = 1.0 - exp(-uFogDensity*uFogDensity*vFogDepth*vFogDepth);
      col = mix(col, uFogColor, fog);
      gl_FragColor = vec4(col,1.0);
    }
  `,
});

class LeafBuilder {
  constructor() {
    this.positions = [];
    this.uvs = [];
    this.colors = [];
    this.sway = [];
    this.phase = [];
    this.flex = [];
    this.indices = [];
    this.count = 0;
  }
  addLeaf(opts) {
    const {
      base,
      dir,
      side,
      length,
      width,
      lengthSegments = 8,
      widthSegments = 2,
      bend = 0,
      cup = 0,
      flex = 0.4,
      phase = rand() * 6.28,
      colorBase = new THREE.Color(0x3c7a45),
      colorTip = new THREE.Color(0x7fb968),
      widthProfile = (t) => (0.35 + 0.65 * Math.sin(Math.PI * t)) * (1 - 0.2 * t),
      edgeWave = 0,
      edgeWaveFreq = 8,
    } = opts;

    const d = dir.clone().normalize();
    const s = side.clone().normalize();
    const n = new THREE.Vector3().crossVectors(d, s).normalize();
    const startIndex = this.count;
    const colorTmp = new THREE.Color();

    for (let i = 0; i <= lengthSegments; i++) {
      const t = i / lengthSegments;
      const spine = base
        .clone()
        .addScaledVector(d, length * t)
        .addScaledVector(n, bend * t * t)
        .addScaledVector(s, Math.sin(t * Math.PI) * 0.01);
      const halfW = width * widthProfile(t) * 0.5;
      for (let j = 0; j <= widthSegments; j++) {
        const u = j / widthSegments;
        const lateral = (u - 0.5) * 2;
        const cupOffset = cup * (1 - Math.abs(lateral)) * Math.sin(t * Math.PI);
        const wave = edgeWave * Math.sin(t * edgeWaveFreq * Math.PI + phase) * lateral;
        const p = spine
          .clone()
          .addScaledVector(s, lateral * halfW)
          .addScaledVector(n, cupOffset + wave);
        this.positions.push(p.x, p.y, p.z);
        this.uvs.push(u, t);
        colorTmp.copy(colorBase).lerp(colorTip, Math.pow(t, 1.15));
        const vary = 0.92 + 0.16 * Math.sin(t * 9 + u * 7 + phase);
        colorTmp.multiplyScalar(vary);
        this.colors.push(colorTmp.r, colorTmp.g, colorTmp.b);
        this.sway.push(Math.pow(t, 1.45));
        this.phase.push(phase);
        this.flex.push(flex);
        this.count++;
      }
    }
    for (let i = 0; i < lengthSegments; i++) {
      for (let j = 0; j < widthSegments; j++) {
        const a = startIndex + i * (widthSegments + 1) + j;
        const b = a + 1;
        const c = a + widthSegments + 1;
        const dIndex = c + 1;
        this.indices.push(a, c, b, b, c, dIndex);
      }
    }
  }
  build() {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    geo.setAttribute('aColor', new THREE.Float32BufferAttribute(this.colors, 3));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.phase, 1));
    geo.setAttribute('aSway', new THREE.Float32BufferAttribute(this.sway, 1));
    geo.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flex, 1));
    geo.setIndex(this.indices);
    geo.computeVertexNormals();
    return geo;
  }
}

const plantGroup = new THREE.Group();
scene.add(plantGroup);

// Vallisneria
const vallisBuilder = new LeafBuilder();
const vallisClusters = [
  { x: -3.55, z: -1.65, n: 20, hMin: 1.2, hMax: 2.9 },
  { x: 3.45, z: -1.75, n: 17, hMin: 1.1, hMax: 2.6 },
  { x: 0.85, z: -2.0, n: 14, hMin: 1.0, hMax: 2.2 },
  { x: -2.15, z: -1.45, n: 11, hMin: 0.9, hMax: 1.9 },
];
for (const cl of vallisClusters) {
  for (let i = 0; i < cl.n; i++) {
    const x = cl.x + (rand() - 0.5) * 0.72;
    const z = cl.z + (rand() - 0.5) * 0.48;
    const y = sandHeight(x, z) + 0.02;
    const angle = rand() * Math.PI * 2;
    const tilt = 0.06 + rand() * 0.17;
    const dir = new THREE.Vector3(Math.cos(angle) * tilt, 1, Math.sin(angle) * tilt);
    const side = new THREE.Vector3(Math.cos(angle + Math.PI / 2), 0, Math.sin(angle + Math.PI / 2));
    const length = lerp(cl.hMin, cl.hMax, rand());
    const colorBase = new THREE.Color().setHSL(0.29 + rand() * 0.035, 0.45 + rand() * 0.16, 0.16 + rand() * 0.05);
    const colorTip = new THREE.Color().setHSL(0.27 + rand() * 0.04, 0.42 + rand() * 0.18, 0.36 + rand() * 0.1);
    vallisBuilder.addLeaf({
      base: new THREE.Vector3(x, y, z),
      dir,
      side,
      length,
      width: 0.06 + rand() * 0.075,
      lengthSegments: 12,
      widthSegments: 2,
      bend: (rand() - 0.5) * 0.45,
      cup: 0.008,
      flex: 0.55 + rand() * 0.2,
      phase: rand() * 6.28,
      colorBase,
      colorTip,
    });
  }
}
const vallis = new THREE.Mesh(vallisBuilder.build(), plantMat);
plantGroup.add(vallis);

// hairgrass carpet
const grassBuilder = new LeafBuilder();
let grassCount = 0;
const grassTargets = 920;
let guard = 0;
while (grassCount < grassTargets && guard < 8000) {
  guard++;
  const x = (rand() - 0.5) * (TANK.w - 0.35);
  const z = -2.0 + rand() * 3.75;
  // keep the foreground carpet, and sparse patches elsewhere
  const frontBias = smoothstep(1.9, 0.0, z);
  if (rand() > 0.25 + frontBias * 0.75) continue;
  let blocked = false;
  for (const o of obstacles) {
    if (Math.hypot(x - o.x, z - o.z) < o.r * 0.92) {
      blocked = true;
      break;
    }
  }
  if (blocked) continue;
  const y = sandHeight(x, z) + 0.015;
  const angle = rand() * Math.PI * 2;
  const tilt = 0.04 + rand() * 0.25;
  const dir = new THREE.Vector3(Math.cos(angle) * tilt, 1, Math.sin(angle) * tilt);
  const side = new THREE.Vector3(Math.cos(angle + Math.PI / 2), 0, Math.sin(angle + Math.PI / 2));
  const length = 0.13 + rand() * 0.3;
  const colorBase = new THREE.Color().setHSL(0.27 + rand() * 0.04, 0.4 + rand() * 0.2, 0.13 + rand() * 0.04);
  const colorTip = new THREE.Color().setHSL(0.25 + rand() * 0.06, 0.42 + rand() * 0.2, 0.31 + rand() * 0.12);
  grassBuilder.addLeaf({
    base: new THREE.Vector3(x, y, z),
    dir,
    side,
    length,
    width: 0.012 + rand() * 0.014,
    lengthSegments: 5,
    widthSegments: 1,
    bend: (rand() - 0.5) * 0.14,
    cup: 0.002,
    flex: 0.3 + rand() * 0.16,
    phase: rand() * 6.28,
    colorBase,
    colorTip,
  });
  grassCount++;
}
const grass = new THREE.Mesh(grassBuilder.build(), plantMat);
plantGroup.add(grass);

// Rotala stems and leaves
const rotalaBuilder = new LeafBuilder();
const rotalaClusters = [
  { x: 2.55, z: -0.55, n: 6 },
  { x: -0.95, z: -1.82, n: 4 },
  { x: 1.75, z: -1.92, n: 3 },
];
for (const cl of rotalaClusters) {
  for (let s = 0; s < cl.n; s++) {
    const bx = cl.x + (rand() - 0.5) * 0.55;
    const bz = cl.z + (rand() - 0.5) * 0.4;
    const by = sandHeight(bx, bz) + 0.01;
    const h = 1.15 + rand() * 0.95;
    const lean = (rand() - 0.5) * 0.14;
    const stemDir = new THREE.Vector3(lean, 1, (rand() - 0.5) * 0.1);
    const stemSide = new THREE.Vector3(1, 0, 0);
    rotalaBuilder.addLeaf({
      base: new THREE.Vector3(bx, by, bz),
      dir: stemDir,
      side: stemSide,
      length: h,
      width: 0.018,
      lengthSegments: 10,
      widthSegments: 1,
      bend: (rand() - 0.5) * 0.08,
      flex: 0.34,
      phase: rand() * 6.28,
      colorBase: new THREE.Color(0x3a4e31),
      colorTip: new THREE.Color(0x6e5b47),
      widthProfile: () => 1,
    });
    const stemCurve = stemDir.clone().normalize();
    const pairs = 17;
    for (let i = 0; i < pairs; i++) {
      const t = 0.12 + (i / pairs) * 0.82;
      const base = new THREE.Vector3(bx, by, bz).addScaledVector(stemCurve, h * t);
      const ang = rand() * Math.PI * 2;
      const out = new THREE.Vector3(Math.cos(ang), 0.25 + rand() * 0.3, Math.sin(ang));
      const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
      const tipMix = clamp(t * 1.15 + rand() * 0.1, 0, 1);
      const cBase = new THREE.Color().setHSL(0.34 - tipMix * 0.24, 0.5 + rand() * 0.2, 0.18 + tipMix * 0.07);
      const cTip = new THREE.Color().setHSL(0.98 + rand() * 0.04, 0.62 + rand() * 0.2, 0.32 + tipMix * 0.16);
      rotalaBuilder.addLeaf({
        base,
        dir: out,
        side,
        length: 0.14 + rand() * 0.1,
        width: 0.055 + rand() * 0.03,
        lengthSegments: 4,
        widthSegments: 2,
        bend: (rand() - 0.5) * 0.04,
        cup: 0.003,
        flex: 0.4,
        phase: rand() * 6.28,
        colorBase: cBase,
        colorTip: cTip,
      });
    }
  }
}
const rotala = new THREE.Mesh(rotalaBuilder.build(), plantMat);
plantGroup.add(rotala);

// Anubias and Java fern attached to hardscape
const broadBuilder = new LeafBuilder();
function addAnubias(base, dir, side, scale = 1, phase = rand() * 6.28) {
  broadBuilder.addLeaf({
    base,
    dir,
    side,
    length: 0.34 * scale + rand() * 0.12,
    width: 0.21 * scale + rand() * 0.08,
    lengthSegments: 9,
    widthSegments: 4,
    bend: 0.05 * scale,
    cup: 0.025 * scale,
    flex: 0.06,
    phase,
    colorBase: new THREE.Color().setHSL(0.32, 0.46, 0.11 + rand() * 0.02),
    colorTip: new THREE.Color().setHSL(0.31, 0.43, 0.23 + rand() * 0.05),
    widthProfile: (t) => Math.sin(Math.PI * Math.pow(t, 0.72)) * 0.96,
  });
}
function addJavaFern(base, dir, side, scale = 1, phase = rand() * 6.28) {
  broadBuilder.addLeaf({
    base,
    dir,
    side,
    length: 0.38 * scale + rand() * 0.12,
    width: 0.075 * scale + rand() * 0.03,
    lengthSegments: 10,
    widthSegments: 2,
    bend: 0.05 * scale,
    cup: 0.008,
    flex: 0.2,
    phase,
    colorBase: new THREE.Color().setHSL(0.33, 0.48, 0.10 + rand() * 0.03),
    colorTip: new THREE.Color().setHSL(0.29, 0.4, 0.25 + rand() * 0.06),
    widthProfile: (t) => Math.sin(Math.PI * Math.pow(t, 0.55)) * 0.8,
    edgeWave: 0.012 * scale,
    edgeWaveFreq: 9,
  });
}

// anubias clusters at rock/wood bases
const anubiasSpots = [
  { base: [-2.15, 1.05, -0.15], dir: [0.55, 0.55, 0.65], side: [0.65, 0, -0.55], n: 6 },
  { base: [-3.25, 0.92, -0.2], dir: [-0.55, 0.5, 0.6], side: [0.55, 0, 0.4], n: 5 },
  { base: [2.65, 1.05, -0.45], dir: [0.35, 0.55, 0.75], side: [0.8, 0, -0.3], n: 5 },
  { base: [-0.25, 2.18, -1.05], dir: [0.2, 0.65, 0.72], side: [0.85, 0, -0.25], n: 4 },
  { base: [1.4, 1.38, -0.85], dir: [0.4, 0.55, 0.72], side: [0.75, 0, -0.35], n: 4 },
];
for (const spot of anubiasSpots) {
  const baseCenter = new THREE.Vector3(...spot.base);
  for (let i = 0; i < spot.n; i++) {
    const ang = (i / spot.n) * Math.PI * 2 + rand() * 0.6;
    const base = baseCenter.clone().add(new THREE.Vector3(Math.cos(ang) * 0.08, rand() * 0.06, Math.sin(ang) * 0.08));
    const dir = new THREE.Vector3(...spot.dir).add(new THREE.Vector3((rand() - 0.5) * 0.3, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.3)).normalize();
    const side = new THREE.Vector3(...spot.side).add(new THREE.Vector3((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2)).normalize();
    addAnubias(base, dir, side, 0.85 + rand() * 0.45);
  }
}
// java fern clusters on wood
const fernSpots = [
  { base: [-1.8, 1.6, -1.02], dir: [0.3, 0.7, 0.65], side: [0.8, 0, -0.3], n: 6 },
  { base: [0.45, 2.24, -1.2], dir: [0.15, 0.8, 0.55], side: [0.9, 0, -0.2], n: 5 },
  { base: [1.55, 1.46, -0.88], dir: [0.35, 0.7, 0.62], side: [0.8, 0, -0.3], n: 5 },
];
for (const spot of fernSpots) {
  const baseCenter = new THREE.Vector3(...spot.base);
  for (let i = 0; i < spot.n; i++) {
    const base = baseCenter.clone().add(new THREE.Vector3((rand() - 0.5) * 0.16, (rand() - 0.5) * 0.08, (rand() - 0.5) * 0.12));
    const dir = new THREE.Vector3(...spot.dir).add(new THREE.Vector3((rand() - 0.5) * 0.4, (rand() - 0.5) * 0.2, (rand() - 0.5) * 0.3)).normalize();
    const side = new THREE.Vector3(...spot.side).add(new THREE.Vector3((rand() - 0.5) * 0.2, 0, (rand() - 0.5) * 0.2)).normalize();
    addJavaFern(base, dir, side, 0.8 + rand() * 0.5);
  }
}
const broadPlants = new THREE.Mesh(broadBuilder.build(), plantMat);
plantGroup.add(broadPlants);

// red tiger lotus accent at the right foreground
const lotusBuilder = new LeafBuilder();
const lotusBaseX = 2.05;
const lotusBaseZ = 0.52;
const lotusBaseY = sandHeight(lotusBaseX, lotusBaseZ) + 0.02;
for (let i = 0; i < 9; i++) {
  const ang = (i / 9) * Math.PI * 2 + rand() * 0.6;
  const base = new THREE.Vector3(lotusBaseX, lotusBaseY, lotusBaseZ);
  const dir = new THREE.Vector3(Math.cos(ang) * (0.35 + rand() * 0.3), 0.75 + rand() * 0.25, Math.sin(ang) * (0.35 + rand() * 0.3)).normalize();
  const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
  lotusBuilder.addLeaf({
    base,
    dir,
    side,
    length: 0.46 + rand() * 0.16,
    width: 0.3 + rand() * 0.12,
    lengthSegments: 9,
    widthSegments: 4,
    bend: 0.05,
    cup: 0.05,
    flex: 0.1,
    phase: rand() * 6.28,
    colorBase: new THREE.Color().setHSL(0.99, 0.52, 0.16 + rand() * 0.04),
    colorTip: new THREE.Color().setHSL(0.97, 0.5, 0.3 + rand() * 0.09),
    widthProfile: (t) => Math.sin(Math.PI * Math.pow(t, 0.62)) * 0.94,
  });
}
const lotus = new THREE.Mesh(lotusBuilder.build(), plantMat);
plantGroup.add(lotus);

// floating plants
const floatBuilder = new LeafBuilder();
const floatGroup = new THREE.Group();
const floaters = [];
for (let f = 0; f < 11; f++) {
  const cx = (rand() - 0.5) * (TANK.w - 1.2);
  const cz = (rand() - 0.5) * (TANK.d - 1.2);
  const phase = rand() * 6.28;
  const n = 4 + ((rand() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + rand() * 0.5;
    const base = new THREE.Vector3(cx + Math.cos(ang) * 0.035, TANK.waterY + 0.02, cz + Math.sin(ang) * 0.035);
    const dir = new THREE.Vector3(Math.cos(ang) * 0.95, 0.18, Math.sin(ang) * 0.95);
    const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
    floatBuilder.addLeaf({
      base,
      dir,
      side,
      length: 0.14 + rand() * 0.09,
      width: 0.07 + rand() * 0.035,
      lengthSegments: 5,
      widthSegments: 3,
      bend: 0.02,
      cup: 0.004,
      flex: 0.18,
      phase,
      colorBase: new THREE.Color().setHSL(0.29, 0.55, 0.22),
      colorTip: new THREE.Color().setHSL(0.26, 0.52, 0.4),
      widthProfile: (t) => Math.sin(Math.PI * Math.pow(t, 0.7)) * 0.95,
    });
  }
  // roots
  for (let r = 0; r < 3; r++) {
    const ang = rand() * Math.PI * 2;
    const base = new THREE.Vector3(cx + Math.cos(ang) * 0.04, TANK.waterY - 0.02, cz + Math.sin(ang) * 0.04);
    const dir = new THREE.Vector3(Math.cos(ang) * 0.15, -1, Math.sin(ang) * 0.15);
    const side = new THREE.Vector3(-Math.sin(ang), 0, Math.cos(ang));
    floatBuilder.addLeaf({
      base,
      dir,
      side,
      length: 0.18 + rand() * 0.16,
      width: 0.006,
      lengthSegments: 4,
      widthSegments: 1,
      bend: 0.03,
      flex: 0.28,
      phase,
      colorBase: new THREE.Color(0x6d7654),
      colorTip: new THREE.Color(0x99a878),
      widthProfile: (t) => 1 - t * 0.3,
    });
  }
}
const floatingMesh = new THREE.Mesh(floatBuilder.build(), plantMat);
floatGroup.add(floatingMesh);
scene.add(floatGroup);

// ---------------------------------------------------------------------------
// Water surface
// ---------------------------------------------------------------------------
const waterSurfaceMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
  },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  vertexShader: `
    uniform float uTime;
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying vec2 vUv;
    void main(){
      vUv = uv;
      vec3 p = position;
      float w = sin(p.x*2.25 + uTime*1.35)*0.032
              + sin(p.y*2.9 - uTime*1.1)*0.024
              + sin((p.x+p.y)*1.55 + uTime*0.72)*0.018;
      p.z += w;
      vec4 wp = modelMatrix * vec4(p,1.0);
      vWorld = wp.xyz;
      float dx = cos(p.x*2.25 + uTime*1.35)*0.032*2.25
               + cos((p.x+p.y)*1.55 + uTime*0.72)*0.018*1.55;
      float dy = cos(p.y*2.9 - uTime*1.1)*0.024*2.9
               + cos((p.x+p.y)*1.55 + uTime*0.72)*0.018*1.55;
      vec3 localN = normalize(vec3(-dx, -dy, 1.0));
      vNormalW = normalize(mat3(modelMatrix)*localN);
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: `
    varying vec3 vWorld;
    varying vec3 vNormalW;
    varying vec2 vUv;
    uniform float uTime;
    float caustic(vec2 p, float t){
      vec2 q=p*1.8;
      float v = sin(q.x + sin(q.y*1.4+t*0.8)) + sin(q.y*1.2+cos(q.x*1.1-t*0.6));
      v += 0.5*sin((q.x+q.y)*1.8+t*0.4);
      return pow(max(0.0,1.0-abs(v)*0.32), 6.0);
    }
    void main(){
      vec3 V = normalize(cameraPosition - vWorld);
      float fres = pow(1.0 - abs(dot(normalize(vNormalW),V)), 2.0);
      vec3 deep = vec3(0.010,0.055,0.068);
      vec3 bright = vec3(0.24,0.45,0.48);
      vec3 col = mix(deep, bright, fres*0.55);
      float c = caustic(vWorld.xz*1.1, uTime*0.5);
      col += vec3(0.20,0.42,0.40)*c*0.36;
      float sparkle = pow(max(0.0,sin(vWorld.x*12.0+uTime*1.4)*sin(vWorld.z*10.0-uTime*1.1)),18.0);
      col += vec3(0.55,0.78,0.76)*sparkle*0.35;
      float edge = smoothstep(0.0,0.035,vUv.x)*(1.0-smoothstep(0.965,1.0,vUv.x))
                 * smoothstep(0.0,0.035,vUv.y)*(1.0-smoothstep(0.965,1.0,vUv.y));
      float alpha = (0.14 + fres*0.12 + c*0.05) * edge;
      gl_FragColor = vec4(col, clamp(alpha,0.0,0.30));
    }
  `,
});
const waterSurface = new THREE.Mesh(new THREE.PlaneGeometry(TANK.w, TANK.d, 80, 60), waterSurfaceMat);
waterSurface.rotation.x = -Math.PI / 2;
waterSurface.position.set(0, TANK.waterY, 0);
waterSurface.renderOrder = 15;
scene.add(waterSurface);

// ---------------------------------------------------------------------------
// Light shafts
// ---------------------------------------------------------------------------
const shaftMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }
  `,
  fragmentShader: `
    varying vec2 vUv;
    uniform float uTime;
    void main(){
      float edge = smoothstep(0.0,0.16,vUv.x)*(1.0-smoothstep(0.84,1.0,vUv.x));
      float vert = smoothstep(0.02,0.22,vUv.y)*(1.0-smoothstep(0.55,1.0,vUv.y));
      float n = 0.65 + 0.35*sin(vUv.y*19.0 + uTime*0.4 + vUv.x*12.0);
      vec3 col = mix(vec3(0.12,0.34,0.38), vec3(0.5,0.82,0.86), vert);
      gl_FragColor = vec4(col, edge*vert*n*0.055);
    }
  `,
});
const shafts = new THREE.Group();
const shaftDefs = [
  { x: -1.9, z: -0.5, rot: 0.08, scale: 1.0 },
  { x: 0.6, z: -0.9, rot: -0.06, scale: 0.8 },
  { x: 2.45, z: 0.0, rot: 0.04, scale: 0.65 },
];
for (const d of shaftDefs) {
  const geo = new THREE.CylinderGeometry(0.18, 1.05, 4.4, 28, 1, true);
  const m = new THREE.Mesh(geo, shaftMat);
  m.position.set(d.x, 2.1, d.z);
  m.rotation.z = d.rot;
  m.rotation.x = 0.03;
  m.scale.set(d.scale, 1, d.scale);
  shafts.add(m);
}
scene.add(shafts);

// ---------------------------------------------------------------------------
// Bubbles
// ---------------------------------------------------------------------------
const bubbleCount = 130;
const bubbleGeo = new THREE.BufferGeometry();
const bubblePositions = new Float32Array(bubbleCount * 3);
const bubbleSizes = new Float32Array(bubbleCount);
const bubblePhases = new Float32Array(bubbleCount);
const bubbleData = [];
const bubR = mulberry32(0xbb77aa11);
for (let i = 0; i < bubbleCount; i++) {
  const stream = i < 92;
  const bx = stream ? 2.72 + (bubR() - 0.5) * 0.16 : (bubR() - 0.5) * (TANK.w - 0.5);
  const bz = stream ? 1.18 + (bubR() - 0.5) * 0.16 : (bubR() - 0.5) * (TANK.d - 0.5);
  const speed = stream ? 0.55 + bubR() * 0.65 : 0.2 + bubR() * 0.28;
  const phase = bubR() * 6.28;
  const startY = bubR() * 3.8 + 0.15;
  const size = stream ? 0.045 + bubR() * 0.065 : 0.025 + bubR() * 0.04;
  bubbleData.push({ bx, bz, speed, phase, startY, size, wobble: 0.02 + bubR() * 0.055 });
  bubblePositions[i * 3] = bx;
  bubblePositions[i * 3 + 1] = startY;
  bubblePositions[i * 3 + 2] = bz;
  bubbleSizes[i] = size;
  bubblePhases[i] = phase;
}
bubbleGeo.setAttribute('position', new THREE.BufferAttribute(bubblePositions, 3));
bubbleGeo.setAttribute('aSize', new THREE.BufferAttribute(bubbleSizes, 1));
bubbleGeo.setAttribute('aPhase', new THREE.BufferAttribute(bubblePhases, 1));

const bubbleMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  },
  transparent: true,
  depthWrite: false,
  vertexShader: `
    attribute float aSize;
    attribute float aPhase;
    uniform float uTime;
    uniform float uPixelRatio;
    varying float vAlpha;
    void main(){
      vec4 mv = modelViewMatrix * vec4(position,1.0);
      gl_PointSize = aSize * (320.0 / -mv.z) * uPixelRatio;
      gl_Position = projectionMatrix * mv;
      vAlpha = smoothstep(0.0,0.6,position.y) * (1.0-smoothstep(3.7,4.05,position.y));
    }
  `,
  fragmentShader: `
    varying float vAlpha;
    void main(){
      vec2 uv = gl_PointCoord*2.0-1.0;
      float r = length(uv);
      if(r>1.0) discard;
      float rim = smoothstep(0.62,0.93,r)*(1.0-smoothstep(0.94,1.0,r));
      float glow = smoothstep(1.0,0.0,r)*0.08;
      float hi = smoothstep(0.22,0.0,length(uv-vec2(-0.28,0.32)));
      vec3 col = mix(vec3(0.35,0.68,0.72), vec3(0.85,1.0,1.0), rim);
      float a = (rim*0.7 + glow + hi*0.9)*vAlpha;
      gl_FragColor = vec4(col, a);
    }
  `,
});
const bubbles = new THREE.Points(bubbleGeo, bubbleMat);
bubbles.renderOrder = 18;
scene.add(bubbles);

// tiny bubbles at the bubble stream source
const sourceBubbles = new THREE.Group();
const sourceGeo = new THREE.SphereGeometry(0.05, 8, 6);
const sourceMat = new THREE.MeshBasicMaterial({
  color: 0x9fe8ee,
  transparent: true,
  opacity: 0.3,
  depthWrite: false,
});
for (let i = 0; i < 8; i++) {
  const b = new THREE.Mesh(sourceGeo, sourceMat);
  b.position.set(2.72 + (rand() - 0.5) * 0.08, 0.32 + rand() * 0.1, 1.18 + (rand() - 0.5) * 0.08);
  b.userData.phase = rand() * 6.28;
  sourceBubbles.add(b);
}
scene.add(sourceBubbles);
const airStone = new THREE.Mesh(
  new THREE.CylinderGeometry(0.1, 0.13, 0.12, 14),
  new THREE.MeshStandardMaterial({ color: 0x262b29, roughness: 0.95 })
);
airStone.position.set(2.72, sandHeight(2.72, 1.18) + 0.07, 1.18);
airStone.castShadow = true;
scene.add(airStone);

// ---------------------------------------------------------------------------
// Suspended particles / plankton
// ---------------------------------------------------------------------------
const particleCount = 520;
const particleGeo = new THREE.BufferGeometry();
const particlePos = new Float32Array(particleCount * 3);
const particleSize = new Float32Array(particleCount);
const particlePhase = new Float32Array(particleCount);
const pr = mulberry32(0xc0ffee42);
for (let i = 0; i < particleCount; i++) {
  particlePos[i * 3] = (pr() - 0.5) * (TANK.w - 0.2);
  particlePos[i * 3 + 1] = 0.1 + pr() * (TANK.waterY - 0.2);
  particlePos[i * 3 + 2] = (pr() - 0.5) * (TANK.d - 0.2);
  particleSize[i] = 0.006 + pr() * 0.016;
  particlePhase[i] = pr() * 6.28;
}
particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
particleGeo.setAttribute('aSize', new THREE.BufferAttribute(particleSize, 1));
particleGeo.setAttribute('aPhase', new THREE.BufferAttribute(particlePhase, 1));
const particleMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uPixelRatio: { value: renderer.getPixelRatio() } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: `
    attribute float aSize;
    attribute float aPhase;
    uniform float uTime;
    uniform float uPixelRatio;
    varying float vAlpha;
    void main(){
      vec3 p = position;
      p.x += sin(uTime*0.17 + aPhase)*0.18;
      p.y += sin(uTime*0.11 + aPhase*1.7)*0.12;
      p.z += cos(uTime*0.14 + aPhase*0.8)*0.15;
      vec4 mv = modelViewMatrix * vec4(p,1.0);
      gl_PointSize = aSize * (340.0 / -mv.z) * uPixelRatio;
      gl_Position = projectionMatrix * mv;
      vAlpha = 0.35 + 0.65*abs(sin(uTime*0.6 + aPhase*2.0));
      vAlpha *= smoothstep(0.0,0.5,p.y) * (1.0-smoothstep(3.6,4.05,p.y));
    }
  `,
  fragmentShader: `
    varying float vAlpha;
    void main(){
      vec2 uv = gl_PointCoord*2.0-1.0;
      float r = length(uv);
      if(r>1.0) discard;
      float a = smoothstep(1.0,0.0,r)*0.65*vAlpha;
      gl_FragColor = vec4(0.55,0.85,0.72,a);
    }
  `,
});
const particles = new THREE.Points(particleGeo, particleMat);
particles.renderOrder = 17;
scene.add(particles);

// ---------------------------------------------------------------------------
// Fish textures
// ---------------------------------------------------------------------------
function createFishTexture(species, seed) {
  const w = 512;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const r = mulberry32(seed);
  const cfg = {
    neon: {
      back: '#1d5966',
      mid: '#a8c7c3',
      belly: '#f1e7cf',
      stripes: [],
    },
    angel: {
      back: '#3a4a52',
      mid: '#b8c6c2',
      belly: '#e2ded0',
      stripes: [0.16, 0.39, 0.62, 0.83],
    },
    guppy: {
      back: '#236c73',
      mid: '#d0a35b',
      belly: '#f2dcaa',
      stripes: [],
    },
    cory: {
      back: '#5d5544',
      mid: '#b6a17e',
      belly: '#ddcfb2',
      stripes: [],
    },
  }[species];

  // vertical body gradient, v wraps around the body
  for (let y = 0; y < h; y++) {
    const v = y / h;
    // v wraps around the body: 0/1 = dorsal ridge, 0.25/0.75 = flank, 0.5 = belly
    const d = Math.abs(v - 0.5) * 2;
    const backMix = smoothstep(0.55, 1.0, d);
    const bellyMix = smoothstep(0.0, 0.5, 1 - d);
    const topCol = new THREE.Color(cfg.back);
    const midCol = new THREE.Color(cfg.mid);
    const bellyCol = new THREE.Color(cfg.belly);
    let col = midCol.clone().lerp(topCol, backMix).lerp(bellyCol, bellyMix);
    // subtle iridescence along the side
    if (v > 0.14 && v < 0.36) {
      col.lerp(new THREE.Color(species === 'guppy' ? '#4ea7b8' : species === 'angel' ? '#6fa6b0' : '#88b9b6'), species === 'angel' ? 0.3 : 0.2);
    }
    if (v > 0.64 && v < 0.86) {
      col.lerp(new THREE.Color(species === 'guppy' ? '#4ea7b8' : species === 'angel' ? '#6fa6b0' : '#88b9b6'), species === 'angel' ? 0.24 : 0.16);
    }
    ctx.fillStyle = `rgb(${col.r * 255},${col.g * 255},${col.b * 255})`;
    ctx.fillRect(0, y, w, 1);
  }

  // fine scale texture
  ctx.save();
  ctx.globalAlpha = species === 'angel' ? 0.09 : 0.10;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;
  for (let row = 0; row < 26; row++) {
    const yy = (row / 26) * h;
    for (let col = 0; col < 44; col++) {
      const xx = (col / 44) * w + (row % 2) * 6;
      ctx.beginPath();
      ctx.arc(xx, yy, 4.2, 0.15, Math.PI - 0.15);
      ctx.stroke();
    }
  }
  ctx.restore();

  // speckle noise
  for (let i = 0; i < 1500; i++) {
    const x = r() * w;
    const y = r() * h;
    const a = 0.02 + r() * 0.06;
    ctx.fillStyle = r() > 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }

  // species-specific markings
  if (species === 'neon') {
    // iridescent cyan lateral stripe, visible on both sides of the wrap
    for (const yy of [0.245, 0.755]) {
      const y = yy * h;
      const g = ctx.createLinearGradient(0, y - 6, 0, y + 6);
      g.addColorStop(0, 'rgba(20,120,150,0)');
      g.addColorStop(0.3, 'rgba(58,222,245,0.95)');
      g.addColorStop(0.55, 'rgba(190,255,255,1)');
      g.addColorStop(0.75, 'rgba(58,222,245,0.95)');
      g.addColorStop(1, 'rgba(20,120,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.22, y - 7, w * 0.66, 14);
    }
    // red posterior stripe
    for (const yy of [0.355, 0.645]) {
      const y = yy * h;
      const g = ctx.createLinearGradient(0, y - 5, 0, y + 5);
      g.addColorStop(0, 'rgba(200,20,20,0)');
      g.addColorStop(0.45, 'rgba(255,66,48,0.96)');
      g.addColorStop(1, 'rgba(200,20,20,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.12, y - 5, w * 0.4, 10);
    }
    // silver highlight
    const sg = ctx.createLinearGradient(w * 0.3, 0, w * 0.8, 0);
    sg.addColorStop(0, 'rgba(210,245,255,0)');
    sg.addColorStop(0.5, 'rgba(210,245,255,0.18)');
    sg.addColorStop(1, 'rgba(210,245,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(w * 0.25, h * 0.18, w * 0.6, h * 0.1);
  } else if (species === 'angel') {
    // tall dark vertical stripes with soft irregular edges
    for (const u of cfg.stripes) {
      const x = u * w;
      const grd = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
      grd.addColorStop(0, 'rgba(23,37,34,0)');
      grd.addColorStop(0.45, 'rgba(13,23,22,0.95)');
      grd.addColorStop(0.55, 'rgba(13,23,22,0.95)');
      grd.addColorStop(1, 'rgba(23,37,34,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(x - 18, h * 0.03, 36, h * 0.9);
    }
    // golden dorsal shimmer
    const gg = ctx.createLinearGradient(0, 0, 0, h * 0.22);
    gg.addColorStop(0, 'rgba(205,172,98,0.04)');
    gg.addColorStop(1, 'rgba(220,185,105,0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, w, h * 0.24);
    // faint blue iridescent spots
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(120,220,230,${0.04 + r() * 0.1})`;
      ctx.beginPath();
      ctx.arc(r() * w, h * 0.18 + r() * h * 0.35, 1 + r() * 2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (species === 'guppy') {
    // rich orange / blue metallic body
    const og = ctx.createLinearGradient(0, h * 0.25, w, h * 0.65);
    og.addColorStop(0, 'rgba(230,116,35,0.5)');
    og.addColorStop(0.5, 'rgba(255,190,75,0.55)');
    og.addColorStop(1, 'rgba(215,80,30,0.4)');
    ctx.fillStyle = og;
    ctx.fillRect(w * 0.18, h * 0.22, w * 0.68, h * 0.3);
    // iridescent blue patches
    for (let i = 0; i < 55; i++) {
      ctx.fillStyle = `rgba(70,190,225,${0.08 + r() * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(w * (0.3 + r() * 0.55), h * (0.2 + r() * 0.16), 2 + r() * 5, 1 + r() * 2, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // dark spots
    for (let i = 0; i < 40; i++) {
      ctx.fillStyle = `rgba(20,20,20,${0.15 + r() * 0.35})`;
      ctx.beginPath();
      ctx.arc(w * (0.25 + r() * 0.6), h * (0.2 + r() * 0.3), 1 + r() * 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (species === 'cory') {
    // armored plates and speckles
    for (let i = 0; i < 260; i++) {
      const x = w * (0.18 + r() * 0.7);
      const y = h * (0.08 + r() * 0.42);
      ctx.fillStyle = `rgba(42,36,26,${0.08 + r() * 0.25})`;
      ctx.beginPath();
      ctx.arc(x, y, 1 + r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // dark band through the eye
    const bg = ctx.createLinearGradient(w * 0.72, 0, w * 0.95, 0);
    bg.addColorStop(0, 'rgba(30,28,22,0)');
    bg.addColorStop(0.4, 'rgba(30,28,22,0.55)');
    bg.addColorStop(1, 'rgba(30,28,22,0)');
    ctx.fillStyle = bg;
    ctx.fillRect(w * 0.7, h * 0.12, w * 0.25, h * 0.28);
  }

  // gill line
  ctx.strokeStyle = species === 'angel' ? 'rgba(20,35,35,0.4)' : 'rgba(20,40,40,0.22)';
  ctx.lineWidth = species === 'angel' ? 4 : 3;
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.25, h * 0.18, 0.2, Math.PI - 0.1);
  ctx.stroke();
  if (species === 'angel') {
    // faint lateral line and operculum shading
    ctx.strokeStyle = 'rgba(25,40,42,0.18)';
    ctx.lineWidth = 2;
    for (const yy of [0.3, 0.7]) {
      ctx.beginPath();
      ctx.moveTo(w * 0.2, h * yy);
      ctx.quadraticCurveTo(w * 0.5, h * (yy + 0.015), w * 0.92, h * yy);
      ctx.stroke();
    }
    const og = ctx.createLinearGradient(w * 0.72, 0, w * 0.86, 0);
    og.addColorStop(0, 'rgba(20,35,36,0)');
    og.addColorStop(0.5, 'rgba(20,35,36,0.18)');
    og.addColorStop(1, 'rgba(20,35,36,0)');
    ctx.fillStyle = og;
    ctx.fillRect(w * 0.72, h * 0.08, w * 0.14, h * 0.4);
  }

  const tex = canvasTexture(c, true, 1, 1);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

function createFishEmissiveTexture(species) {
  const w = 256;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  if (species === 'neon') {
    for (const yy of [0.245, 0.755]) {
      const y = yy * h;
      const g = ctx.createLinearGradient(0, y - 4, 0, y + 4);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.4, 'rgba(30,170,210,0.9)');
      g.addColorStop(0.5, 'rgba(130,255,255,1)');
      g.addColorStop(0.6, 'rgba(30,170,210,0.9)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.2, y - 4, w * 0.7, 8);
    }
    for (const yy of [0.355, 0.645]) {
      const y = yy * h;
      const g = ctx.createLinearGradient(0, y - 3, 0, y + 3);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(0.5, 'rgba(220,45,35,0.8)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(w * 0.1, y - 3, w * 0.42, 6);
    }
  } else if (species === 'guppy') {
    for (let i = 0; i < 24; i++) {
      ctx.fillStyle = `rgba(60,200,220,${0.15 + Math.random() * 0.25})`;
      ctx.beginPath();
      ctx.arc(w * (0.3 + Math.random() * 0.5), h * (0.2 + Math.random() * 0.2), 1 + Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvasTexture(c, true, 1, 1);
}

function createEyeTexture() {
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#050707';
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(26, 24, 1, 26, 24, 16);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.18, 'rgba(220,245,250,0.85)');
  g.addColorStop(0.5, 'rgba(80,115,125,0.35)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(26, 24, 16, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.beginPath();
  ctx.arc(22, 20, 4.2, 0, Math.PI * 2);
  ctx.fill();
  return canvasTexture(c, true, 1, 1);
}
const eyeTex = createEyeTexture();

function createFinTexture(species, mode = 'fan') {
  const w = 256;
  const h = 256;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  const sail = mode === 'sail';
  const palette = {
    neon: ['rgba(85,150,150,0.66)', 'rgba(150,210,205,0.54)', 'rgba(215,250,240,0.34)'],
    angel: ['rgba(72,88,86,0.88)', 'rgba(132,144,136,0.70)', 'rgba(196,202,188,0.42)'],
    guppy: ['rgba(205,85,28,0.68)', 'rgba(245,160,50,0.58)', 'rgba(90,190,210,0.38)'],
    cory: ['rgba(120,105,82,0.68)', 'rgba(185,170,140,0.54)', 'rgba(225,210,180,0.36)'],
  }[species];
  const g = sail
    ? ctx.createLinearGradient(0, h, 0, 0)
    : ctx.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, palette[0]);
  g.addColorStop(0.55, palette[1]);
  g.addColorStop(1, palette[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // fin rays: sail rays run base-to-tip; fan rays run root-to-edge
  ctx.strokeStyle = sail ? 'rgba(255,255,255,0.24)' : 'rgba(255,255,255,0.30)';
  ctx.lineWidth = 1.4;
  if (sail) {
    for (let i = 0; i < 26; i++) {
      const x = (i / 26) * w;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + (x - w * 0.5) * 0.06, h * 0.45, x + (x - w * 0.5) * 0.13, 0);
      ctx.stroke();
    }
  } else {
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * h;
      ctx.beginPath();
      ctx.moveTo(w * 0.06, h * 0.5);
      ctx.quadraticCurveTo(w * 0.5, y, w, y);
      ctx.stroke();
    }
  }

  // membrane shimmer
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 110; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 4, 1);
  }
  ctx.globalCompositeOperation = 'source-over';

  // dark margin only along the free outer edge
  ctx.strokeStyle = 'rgba(15,24,22,0.30)';
  ctx.lineWidth = 9;
  ctx.beginPath();
  if (sail) { ctx.moveTo(0, 4); ctx.lineTo(w, 4); }
  else { ctx.moveTo(w - 4, 0); ctx.lineTo(w - 4, h); }
  ctx.stroke();

  if (species === 'angel') {
    // bars continue from the body across the fin membrane
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(24,34,30,0.20)';
      ctx.fillRect(w * (0.18 + i * 0.21), 0, w * 0.026, h);
    }
  }
  if (species === 'guppy') {
    for (let i = 0; i < 35; i++) {
      ctx.fillStyle = `rgba(40,130,190,${0.12 + Math.random() * 0.25})`;
      ctx.beginPath();
      ctx.arc(w * (0.35 + Math.random() * 0.55), h * (0.2 + Math.random() * 0.6), 2 + Math.random() * 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return canvasTexture(c, true, 1, 1);
}

// ---------------------------------------------------------------------------
// Fish geometry
// ---------------------------------------------------------------------------
function defaultFishProfile(t) {
  const bell = Math.sin(Math.PI * Math.pow(clamp(t, 0.001, 0.999), 0.82));
  return 0.075 + 0.925 * Math.pow(bell, 0.58);
}
function angelProfile(t) {
  const x = clamp(t, 0.001, 0.999);
  const peak = 0.44;
  const rise = Math.pow(x / peak, 0.82);
  const fall = Math.pow((1 - x) / (1 - peak), 0.82);
  return 0.05 + 0.95 * Math.min(rise, fall);
}

function createFishGeometry(L, H, W, profileFn) {
  const N = 58;
  const R = 22;
  const positions = [];
  const uvs = [];
  const indices = [];

  const profile = profileFn || defaultFishProfile;

  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = -L / 2 + t * L;
    const p = profile(t);
    const ry = (H / 2) * p;
    const rz = (W / 2) * p;
    const centerY = Math.sin(t * Math.PI) * H * 0.045;
    for (let j = 0; j <= R; j++) {
      const theta = (j / R) * Math.PI * 2;
      let y = centerY + Math.cos(theta) * ry;
      const z = Math.sin(theta) * rz;
      if (y < centerY) y = centerY + (y - centerY) * 1.08;
      positions.push(x, y, z);
      uvs.push(t, j / R);
    }
  }
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < R; j++) {
      const a = i * (R + 1) + j;
      const b = a + 1;
      const c = a + R + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  // end caps
  const noseIndex = positions.length / 3;
  positions.push(L / 2 + 0.01 * L, 0, 0);
  uvs.push(1, 0.5);
  const tailIndex = positions.length / 3;
  positions.push(-L / 2 - 0.01 * L, 0, 0);
  uvs.push(0, 0.5);
  for (let j = 0; j < R; j++) {
    indices.push(N * (R + 1) + j, N * (R + 1) + j + 1, noseIndex);
    indices.push(j, tailIndex, j + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildFanGeometry(root, edgePoints, uvMode = 'radial') {
  const positions = [root.x, root.y, root.z];
  const uvs = [0, 0.5];
  const indices = [];
  for (let i = 0; i < edgePoints.length; i++) {
    const p = edgePoints[i];
    positions.push(p.x, p.y, p.z);
    uvs.push(1, i / (edgePoints.length - 1));
  }
  for (let i = 1; i < edgePoints.length; i++) {
    indices.push(0, i, i + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildTailGeometry(kind, len, height) {
  const edge = [];
  const seg = 24;
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * 2 - 1;
    let x;
    if (kind === 'forked') x = -len * (0.58 + 0.42 * Math.abs(t));
    else if (kind === 'rounded') x = -len * (0.82 + 0.18 * Math.cos(t * Math.PI * 0.5));
    else x = -len * (0.72 + 0.28 * Math.cos(t * Math.PI * 0.5));
    const y = t * height;
    const z = Math.sin(t * Math.PI) * 0.018;
    edge.push(new THREE.Vector3(x, y, z));
  }
  return buildFanGeometry(new THREE.Vector3(0, 0, 0), edge);
}

function finShape(t) {
  const peak = 0.72;
  if (t < peak) return 0.08 + 0.92 * Math.pow(t / peak, 0.62);
  return 0.08 + 0.92 * Math.pow((1 - t) / (1 - peak), 1.15);
}

function buildDorsalGeometry(baseX0, baseX1, baseYFn, height, backwardLean = 0) {
  const seg = 16;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = lerp(baseX0, baseX1, t);
    const baseY = baseYFn(x);
    const outerX = x + backwardLean * t;
    const outerY = baseY + height * finShape(t);
    const bow = Math.sin(Math.PI * t) * 0.035;
    positions.push(x, baseY, 0);
    uvs.push(t, 0);
    positions.push(outerX, outerY, bow);
    uvs.push(t, 1);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildAnalGeometry(baseX0, baseX1, baseYFn, height, backwardLean = 0) {
  const seg = 14;
  const positions = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const x = lerp(baseX0, baseX1, t);
    const baseY = baseYFn(x);
    const outerX = x + backwardLean * t;
    const outerY = baseY - height * finShape(t);
    const bow = Math.sin(Math.PI * t) * 0.035;
    positions.push(x, baseY, 0);
    uvs.push(t, 0);
    positions.push(outerX, outerY, bow);
    uvs.push(t, 1);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function buildPectoralGeometry(x, y, z, side, len, height, mirror = 1) {
  const root = new THREE.Vector3(x, y, z);
  const edge = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    const ang = (t - 0.5) * 1.25;
    const ex = x - len * (0.6 + 0.4 * Math.cos(t * Math.PI));
    const ey = y - height * Math.sin(t * Math.PI) * 0.75 - Math.abs(ang) * height * 0.2;
    const ez = z + side * len * (0.12 + 0.35 * Math.sin(t * Math.PI)) * mirror;
    edge.push(new THREE.Vector3(ex, ey, ez));
  }
  return buildFanGeometry(root, edge);
}

function buildPelvicGeometry(x, y, z, side, len) {
  const root = new THREE.Vector3(x, y, z);
  const edge = [];
  for (let i = 0; i <= 7; i++) {
    const t = i / 7;
    const ex = x - len * (0.12 + 0.88 * t);
    const ey = y - len * (0.16 + 0.84 * t);
    const ez = z + side * len * 0.06 * Math.sin(t * Math.PI) * (1 - 0.55 * t);
    edge.push(new THREE.Vector3(ex, ey, ez));
  }
  return buildFanGeometry(root, edge);
}

function buildFishFins(cfg, mode = 'all') {
  const L = cfg.length;
  const H = cfg.height;
  const W = cfg.width;
  const geos = [];
  const profile = cfg.profile || defaultFishProfile;
  const topY = (x) => {
    const t = (x + L / 2) / L;
    return (H / 2) * profile(t) * 0.92;
  };
  const bottomY = (x) => -topY(x);

  if (mode !== 'fan') {
    const dorsalH = cfg.dorsalH ?? H * 0.42;
    const db = cfg.dorsalBase || [-0.28, 0.24];
    geos.push(buildDorsalGeometry(L * db[0], L * db[1], topY, dorsalH, -L * (cfg.dorsalLean ?? 0.12)));
    const analH = cfg.analH ?? H * 0.3;
    const ab = cfg.analBase || [-0.3, 0.2];
    geos.push(buildAnalGeometry(L * ab[0], L * ab[1], bottomY, analH, -L * (cfg.analLean ?? 0.1)));
  }
  if (mode !== 'sail') {
    const pecLen = cfg.pectoralLen ?? L * 0.28;
    const pecH = cfg.pectoralH ?? H * 0.18;
    const pecX = L * 0.12;
    const pecY = -H * 0.06;
    const pecZ = W * 0.36;
    geos.push(buildPectoralGeometry(pecX, pecY, pecZ, 1, pecLen, pecH, 1));
    geos.push(buildPectoralGeometry(pecX, pecY, -pecZ, 1, pecLen, pecH, -1));
    if (cfg.pelvicLen) {
      const pvX = L * 0.17;
      const pvY = -H * 0.31;
      const pvZ = W * 0.2;
      geos.push(buildPelvicGeometry(pvX, pvY, pvZ, 1, cfg.pelvicLen));
      geos.push(buildPelvicGeometry(pvX, pvY, -pvZ, -1, cfg.pelvicLen));
    }
  }

  return mergeGeometries(geos, false);
}

// species definitions
const SPECIES = {
  neon: {
    name: 'Neon Tetra',
    color: '#57e7ff',
    count: 18,
    length: 0.34,
    height: 0.125,
    width: 0.075,
    tailLen: 0.17,
    tailHeight: 0.095,
    tailKind: 'forked',
    dorsalH: 0.055,
    analH: 0.04,
    pectoralLen: 0.095,
    pectoralH: 0.055,
    speedMin: 0.42,
    speedMax: 0.92,
    agility: 3.6,
    drag: 1.6,
    school: true,
    eyeScale: 0.06,
    eyeX: 0.34,
    eyeY: 0.12,
    emissive: 0.8,
    finColor: 0xa8e8e5,
  },
  angel: {
    name: 'Angelfish',
    color: '#f4ddb0',
    count: 3,
    length: 0.56,
    height: 0.62,
    width: 0.16,
    tailLen: 0.22,
    tailHeight: 0.16,
    tailKind: 'rounded',
    dorsalH: 0.33,
    analH: 0.29,
    dorsalBase: [-0.29, 0.30],
    analBase: [-0.29, 0.26],
    dorsalLean: 0.18,
    analLean: 0.16,
    pectoralLen: 0.17,
    pectoralH: 0.09,
    speedMin: 0.25,
    speedMax: 0.5,
    agility: 1.8,
    drag: 1.9,
    school: false,
    eyeScale: 0.038,
    eyeX: 0.34,
    profile: angelProfile,
    eyeY: 0.14,
    emissive: 0.1,
    finColor: 0xc2c4b4,
  },
  guppy: {
    name: 'Guppy',
    color: '#ffb35c',
    count: 8,
    length: 0.35,
    height: 0.15,
    width: 0.095,
    tailLen: 0.22,
    tailHeight: 0.15,
    tailKind: 'rounded',
    dorsalH: 0.085,
    analH: 0.065,
    pectoralLen: 0.11,
    pectoralH: 0.07,
    speedMin: 0.35,
    speedMax: 0.75,
    agility: 3.0,
    drag: 1.7,
    school: false,
    eyeScale: 0.065,
    eyeX: 0.33,
    eyeY: 0.13,
    emissive: 0.3,
    finColor: 0xffb85e,
  },
  cory: {
    name: 'Corydoras',
    color: '#d8c8a8',
    count: 5,
    length: 0.39,
    height: 0.17,
    width: 0.15,
    tailLen: 0.17,
    tailHeight: 0.12,
    tailKind: 'rounded',
    dorsalH: 0.11,
    analH: 0.07,
    pectoralLen: 0.13,
    pectoralH: 0.09,
    speedMin: 0.18,
    speedMax: 0.38,
    agility: 2.1,
    drag: 2.1,
    school: false,
    eyeScale: 0.055,
    eyeX: 0.3,
    eyeY: 0.1,
    emissive: 0.05,
    finColor: 0xd8c8a8,
  },
};

const fishTextures = {};
const emissiveTextures = {};
const finTexturesSail = {};
const finTexturesFan = {};
for (const key of Object.keys(SPECIES)) {
  fishTextures[key] = createFishTexture(key, 0xabc000 + key.length * 131);
  emissiveTextures[key] = createFishEmissiveTexture(key);
  finTexturesSail[key] = createFinTexture(key, 'sail');
  finTexturesFan[key] = createFinTexture(key, 'fan');
}

const fishGroup = new THREE.Group();
scene.add(fishGroup);
const fishes = [];

function createFish(speciesKey, pos, seed) {
  const cfg = SPECIES[speciesKey];
  const r = mulberry32(seed);
  const group = new THREE.Group();

  const bodyGeo = createFishGeometry(cfg.length, cfg.height, cfg.width, cfg.profile);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: speciesKey === 'angel' ? new THREE.Color(1.18, 1.16, 1.12) : new THREE.Color(1, 1, 1),
    map: fishTextures[speciesKey],
    emissiveMap: emissiveTextures[speciesKey],
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: cfg.emissive,
    roughness: 0.33,
    metalness: 0.08,
    clearcoat: 0.26,
    clearcoatRoughness: 0.5,
    iridescence: speciesKey === 'neon' ? 0.9 : 0.35,
    iridescenceIOR: 1.35,
    envMapIntensity: 0.7,
  });
  bodyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uPhase = { value: r() * 6.28 };
    shader.uniforms.uFreq = { value: 4.5 + r() * 2 };
    shader.uniforms.uAmp = { value: cfg.length * 0.075 };
    shader.vertexShader = `
      uniform float uTime;
      uniform float uPhase;
      uniform float uFreq;
      uniform float uAmp;
    ` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      float tx = clamp((-transformed.x + ${cfg.length.toFixed(4)} * 0.5) / ${cfg.length.toFixed(4)}, 0.0, 1.0);
      float tailW = smoothstep(0.18, 0.96, tx);
      float wave = sin(uTime * uFreq + uPhase - tx * 3.4);
      transformed.z += wave * uAmp * tailW;
      transformed.y += sin(uTime * uFreq * 0.5 + uPhase) * uAmp * 0.12 * tailW;
      `
    );
    bodyMat.userData.shader = shader;
  };
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // eyes
  const eyeRadius = cfg.length * cfg.eyeScale;
  const eyeZ = cfg.width * 0.36;
  const eyeGeo1 = new THREE.SphereGeometry(eyeRadius, 10, 8);
  eyeGeo1.translate(cfg.length * cfg.eyeX, cfg.height * cfg.eyeY, eyeZ);
  const eyeGeo2 = new THREE.SphereGeometry(eyeRadius, 10, 8);
  eyeGeo2.translate(cfg.length * cfg.eyeX, cfg.height * cfg.eyeY, -eyeZ);
  const eyesGeo = mergeGeometries([eyeGeo1, eyeGeo2], false);
  const eyesMat = new THREE.MeshPhysicalMaterial({
    map: eyeTex,
    roughness: 0.12,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.2,
  });
  const eyes = new THREE.Mesh(eyesGeo, eyesMat);
  group.add(eyes);

  // tail
  const tailPivot = new THREE.Group();
  tailPivot.position.set(-cfg.length / 2, 0, 0);
  const tailGeo = buildTailGeometry(cfg.tailKind, cfg.tailLen, cfg.tailHeight);
  const finMatSail = new THREE.MeshStandardMaterial({
    map: finTexturesSail[speciesKey],
    color: new THREE.Color(cfg.finColor),
    transparent: true,
    opacity: speciesKey === 'angel' ? 0.76 : 0.7,
    side: THREE.DoubleSide,
    depthWrite: false,
    roughness: 0.48,
    metalness: 0.0,
    envMapIntensity: 0.5,
    alphaTest: 0.015,
  });
  const finMatFan = new THREE.MeshStandardMaterial({
    map: finTexturesFan[speciesKey],
    color: new THREE.Color(cfg.finColor),
    transparent: true,
    opacity: speciesKey === 'angel' ? 0.8 : 0.72,
    side: THREE.DoubleSide,
    depthWrite: false,
    roughness: 0.46,
    metalness: 0.0,
    envMapIntensity: 0.55,
    alphaTest: 0.015,
  });
  const tailMat = finMatFan.clone();
  tailMat.opacity = speciesKey === 'angel' ? 0.92 : 0.82;
  tailMat.color = new THREE.Color(cfg.finColor).multiplyScalar(0.96);
  const tail = new THREE.Mesh(tailGeo, tailMat);
  tail.castShadow = false;
  tailPivot.add(tail);
  group.add(tailPivot);

  // dorsal / anal sails
  const finsSailGeo = buildFishFins(cfg, 'sail');
  const finsSail = new THREE.Mesh(finsSailGeo, finMatSail);
  group.add(finsSail);

  // pectoral fins
  const finsFanGeo = buildFishFins(cfg, 'fan');
  const finsFan = new THREE.Mesh(finsFanGeo, finMatFan);
  group.add(finsFan);

  // cory barbels
  let barbels = null;
  if (speciesKey === 'cory') {
    const barbelGeos = [];
    for (const s of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(cfg.length * 0.46, -cfg.height * 0.08, s * cfg.width * 0.18),
        new THREE.Vector3(cfg.length * 0.52, -cfg.height * 0.17, s * cfg.width * 0.3),
        new THREE.Vector3(cfg.length * 0.53, -cfg.height * 0.25, s * cfg.width * 0.38),
      ]);
      const g = new THREE.TubeGeometry(curve, 6, 0.006, 4, false);
      barbelGeos.push(g);
    }
    barbels = new THREE.Mesh(
      mergeGeometries(barbelGeos, false),
      new THREE.MeshStandardMaterial({ color: 0xcfc1a4, roughness: 0.7 })
    );
    group.add(barbels);
  }

  let shadow = null;
  if (speciesKey === 'cory') {
    shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), contactShadowMat.clone());
    shadow.material.opacity = 0.34;
    shadow.rotation.x = -Math.PI / 2;
    shadow.scale.set(cfg.length * 1.5, cfg.length * 1.0, 1);
    shadow.renderOrder = 2;
    scene.add(shadow);
  }

  const fish = {
    species: speciesKey,
    cfg,
    group,
    body,
    bodyMat,
    tailPivot,
    pos: pos.clone(),
    vel: new THREE.Vector3((r() - 0.5) * 0.3, (r() - 0.5) * 0.1, (r() - 0.5) * 0.2),
    target: pos.clone(),
    targetTimer: r() * 4,
    seed: r() * 1000,
    phase: r() * 6.28,
    bank: 0,
    bankTarget: 0,
    lastDir: new THREE.Vector3(1, 0, 0),
    quat: new THREE.Quaternion(),
    speedMul: 0.8 + r() * 0.4,
    burst: 0,
    burstTimer: r() * 8,
    foodTarget: null,
    baseY: pos.y,
    wander: r() * 6.28,
    sizeScale: 0.92 + r() * 0.16,
    shadow,
  };
  group.scale.setScalar(fish.sizeScale);
  group.position.copy(fish.pos);
  fishGroup.add(group);
  fishes.push(fish);
  return fish;
}

function spawnInitialFish() {
  const r = mulberry32(0xf15a9e);
  // neon school
  for (let i = 0; i < SPECIES.neon.count; i++) {
    const pos = new THREE.Vector3(
      -0.5 + (r() - 0.5) * 2.4,
      2.15 + (r() - 0.5) * 0.7,
      0.2 + (r() - 0.5) * 1.5
    );
    createFish('neon', pos, 100 + i);
  }
  // angelfish
  const angelXs = [-2.55, 0.15, 2.55];
  for (let i = 0; i < SPECIES.angel.count; i++) {
    const pos = new THREE.Vector3(
      angelXs[i] + (r() - 0.5) * 0.3,
      2.25 + (r() - 0.5) * 0.55,
      0.35 + (r() - 0.5) * 0.35
    );
    const fish = createFish('angel', pos, 200 + i);
    fish.vel.set(i % 2 === 0 ? 0.20 : -0.20, 0, 0.015);
    fish.target.set(pos.x + (i % 2 === 0 ? 1.6 : -1.6), pos.y, pos.z);
  }
  // guppies
  for (let i = 0; i < SPECIES.guppy.count; i++) {
    const pos = new THREE.Vector3(
      1.4 + (r() - 0.5) * 1.7,
      3.05 + (r() - 0.5) * 0.55,
      0.35 + (r() - 0.5) * 1.0
    );
    createFish('guppy', pos, 300 + i);
  }
  // corydoras
  const corySpots = [[-1.85, 1.05], [0.7, 1.2], [2.15, 0.3], [-0.25, 0.55], [1.15, -0.75]];
  for (let i = 0; i < SPECIES.cory.count; i++) {
    const [x, z] = corySpots[i];
    const pos = new THREE.Vector3(x + (r() - 0.5) * 0.25, sandHeight(x, z) + 0.22, z + (r() - 0.5) * 0.2);
    createFish('cory', pos, 400 + i);
  }
}
spawnInitialFish();

// ---------------------------------------------------------------------------
// Food / feeding
// ---------------------------------------------------------------------------
const foodGroup = new THREE.Group();
scene.add(foodGroup);
const foodGeo = new THREE.IcosahedronGeometry(0.035, 1);
const foodMat = new THREE.MeshStandardMaterial({
  color: 0xd29a58,
  roughness: 0.75,
  emissive: 0x6d3f16,
  emissiveIntensity: 0.25,
});
const foods = [];
const MAX_FOOD = 28;
const clickPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -1.05);
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();

function spawnFood(point) {
  const r = mulberry32((((elapsed * 10000) | 0) ^ (feedSerial++ * 2654435761)) >>> 0);
  const n = 9 + ((r() * 5) | 0);
  for (let i = 0; i < n; i++) {
    if (foods.length >= MAX_FOOD) {
      const old = foods.shift();
      foodGroup.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(foodGeo, foodMat);
    mesh.position.set(
      clamp(point.x + (r() - 0.5) * 0.45, -3.9, 3.9),
      clamp(point.y + (r() - 0.5) * 0.35, 0.55, 3.75),
      clamp(point.z + (r() - 0.5) * 0.45, -1.5, 1.5)
    );
    const scale = 0.7 + r() * 0.7;
    mesh.scale.setScalar(scale);
    foodGroup.add(mesh);
    foods.push({
      mesh,
      vel: new THREE.Vector3((r() - 0.5) * 0.06, -0.12 - r() * 0.06, (r() - 0.5) * 0.06),
      life: 22 + r() * 10,
      phase: r() * 6.28,
      eaten: false,
      scale,
    });
  }
  // little burst of bubbles near the surface where food entered
  for (let i = 0; i < 6; i++) {
    const b = new THREE.Mesh(sourceGeo, sourceMat.clone());
    b.material.opacity = 0.18;
    b.position.set(point.x + (r() - 0.5) * 0.2, point.y + (r() - 0.5) * 0.15, point.z + (r() - 0.5) * 0.2);
    b.userData.life = 1.5;
    foodGroup.add(b);
    foods.push({ mesh: b, vel: new THREE.Vector3(0, 0.4, 0), life: 1.5, bubble: true });
  }
}

function noteFeeding() {
  const hint = document.getElementById('hint');
  if (hint) hint.classList.add('fed');
  const status = document.getElementById('sceneStatus');
  if (status) {
    status.textContent = paused
      ? 'Food added. The scene is paused; press Play scene to animate.'
      : 'Food added to the aquarium.';
  }
}

function feedAtCenter() {
  spawnFood(new THREE.Vector3(0, 3.15, 0.25));
  noteFeeding();
}

function onPointerDown(e) {
  if (e.target !== renderer.domElement) return;
  pointerNDC.x = (e.clientX / window.innerWidth) * 2 - 1;
  pointerNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(pointerNDC, camera);
  const point = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(clickPlane, point)) {
    spawnFood(point);
    noteFeeding();
  }
}
renderer.domElement.addEventListener('pointerdown', onPointerDown);

// ---------------------------------------------------------------------------
// Fish behaviour
// ---------------------------------------------------------------------------
const schoolTarget = new THREE.Vector3(-0.5, 2.2, 0.0);
const schoolNext = new THREE.Vector3();
let schoolTimer = 0;
const tempV = new THREE.Vector3();
const tempV2 = new THREE.Vector3();
const tempQ = new THREE.Quaternion();
const tempM = new THREE.Matrix4();

function updateFish(dt, time) {
  // school target wanders
  schoolTimer -= dt;
  if (schoolTimer <= 0) {
    schoolTimer = 7 + rand() * 5;
    schoolNext.set(
      -1.2 + rand() * 2.6,
      1.7 + rand() * 1.0,
      -0.7 + rand() * 1.4
    );
  }
  schoolTarget.lerp(schoolNext, 1 - Math.exp(-dt * 0.28));

  // nearest food per fish
  for (const f of fishes) {
    f.foodTarget = null;
    let best = 99;
    for (const food of foods) {
      if (food.eaten || food.bubble) continue;
      const d = f.pos.distanceTo(food.mesh.position);
      if (d < best) {
        best = d;
        f.foodTarget = food;
      }
    }
    if (best > 3.6) f.foodTarget = null;
  }

  for (const f of fishes) {
    const cfg = f.cfg;
    f.burstTimer -= dt;
    if (f.burstTimer <= 0) {
      f.burst = 1.6 + rand() * 1.2;
      f.burstTimer = 5 + rand() * 11;
    }
    f.burst = Math.max(0, f.burst - dt * 0.8);

    const steer = tempV.set(0, 0, 0);

    // base target / wander
    f.targetTimer -= dt;
    if (f.targetTimer <= 0) {
      f.targetTimer = 3.5 + rand() * 6;
      if (f.species === 'neon') {
        f.target.set(
          schoolTarget.x + (rand() - 0.5) * 1.1,
          schoolTarget.y + (rand() - 0.5) * 0.75,
          schoolTarget.z + (rand() - 0.5) * 1.2
        );
      } else if (f.species === 'angel') {
        f.target.set(
          -2.4 + rand() * 4.2,
          1.6 + rand() * 1.5,
          clamp(f.pos.z + (rand() - 0.5) * 0.45, 0.0, 0.7)
        );
      } else if (f.species === 'guppy') {
        f.target.set(
          0.2 + rand() * 3.2,
          2.65 + rand() * 1.0,
          -0.8 + rand() * 2.1
        );
      } else {
        const tx = -3.2 + rand() * 6.4;
        const tz = -1.2 + rand() * 2.4;
        f.target.set(tx, sandHeight(tx, tz) + 0.24, tz);
      }
    }

    const toTarget = tempV2.copy(f.target).sub(f.pos);
    const dist = toTarget.length();
    if (dist > 0.001) {
      const seek = f.species === 'cory' ? 1.2 : f.species === 'angel' ? 0.7 : 1.15;
      steer.addScaledVector(toTarget.normalize(), seek);
    }

    if (f.species === 'angel') {
      // angelfish glide across the front glass, showing their tall profile
      steer.z *= 0.28;
      steer.x *= 1.15;
    }

    // food seek
    if (f.foodTarget) {
      const d = f.pos.distanceTo(f.foodTarget.mesh.position);
      const pull = clamp(1.4 - d * 0.22, 0.4, 2.4);
      steer.addScaledVector(tempV2.copy(f.foodTarget.mesh.position).sub(f.pos).normalize(), pull);
      if (d < 0.18 + cfg.length * 0.2) {
        f.foodTarget.eaten = true;
        foodGroup.remove(f.foodTarget.mesh);
      }
    }

    // schooling / separation
    let sepCount = 0;
    for (const other of fishes) {
      if (other === f) continue;
      const dx = f.pos.x - other.pos.x;
      const dy = f.pos.y - other.pos.y;
      const dz = f.pos.z - other.pos.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      const range = other.species === f.species ? Math.max(0.55, (cfg.length + other.cfg.length) * 0.9) : Math.max(0.38, (cfg.length + other.cfg.length) * 0.55);
      if (d2 < range * range && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (range - d) / range;
        steer.x += (dx / d) * push * 1.9;
        steer.y += (dy / d) * push * 1.4;
        steer.z += (dz / d) * push * 1.9;
        sepCount++;
      }
      if (f.species === 'angel' && other.species === 'angel' && d2 < 2.25) {
        const d = Math.sqrt(Math.max(d2, 0.0001));
        const push = (1.5 - d) / 1.5;
        steer.x += (dx / d) * push * 2.8;
        steer.z += (dz / d) * push * 2.8;
      }
      if (f.species === 'neon' && other.species === 'neon') {
        const d = Math.sqrt(d2);
        if (d < 1.5 && d > 0.001) {
          // alignment toward school direction
          steer.x += other.vel.x * 0.012;
          steer.y += other.vel.y * 0.01;
          steer.z += other.vel.z * 0.012;
        }
      }
    }

    // wall avoidance
    const margin = 0.65;
    if (f.pos.x > TANK.w / 2 - margin) steer.x -= (f.pos.x - (TANK.w / 2 - margin)) * 5.0;
    if (f.pos.x < -TANK.w / 2 + margin) steer.x += (-TANK.w / 2 + margin - f.pos.x) * 5.0;
    if (f.pos.y > 3.75) steer.y -= (f.pos.y - 3.75) * 4.0;
    if (f.pos.y < 0.4) steer.y += (0.4 - f.pos.y) * 6.0;
    if (f.pos.z > 1.72) steer.z -= (f.pos.z - 1.72) * 5.0;
    if (f.pos.z < -2.0) steer.z += (-2.0 - f.pos.z) * 5.0;

    // hardscape avoidance
    for (const o of obstacles) {
      const dx = f.pos.x - o.x;
      const dy = f.pos.y - o.y;
      const dz = f.pos.z - o.z;
      const rr = o.r + cfg.length * 0.45;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < rr * rr && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (rr - d) / rr;
        steer.x += (dx / d) * push * 5.2;
        steer.y += (dy / d) * push * 4.0;
        steer.z += (dz / d) * push * 5.2;
      }
    }

    // corydoras hug the substrate
    if (f.species === 'cory') {
      const floor = sandHeight(f.pos.x, f.pos.z) + 0.22;
      steer.y += (floor - f.pos.y) * 2.6;
      if (f.pos.y < floor - 0.03) f.pos.y = floor - 0.03;
      f.target.y = sandHeight(f.target.x, f.target.z) + 0.24;
    }

    // soft wander noise
    f.wander += dt * (0.6 + Math.sin(time * 0.4 + f.seed) * 0.5);
    steer.x += Math.sin(time * 0.63 + f.seed) * 0.09;
    steer.y += Math.sin(time * 0.47 + f.seed * 1.7) * 0.07;
    steer.z += Math.cos(time * 0.55 + f.seed * 0.7) * 0.09;

    // burst speed
    const baseSpeed = lerp(cfg.speedMin, cfg.speedMax, 0.5 + 0.5 * Math.sin(time * 0.31 + f.seed));
    const speed = baseSpeed * f.speedMul * (1 + f.burst * 0.6);
    const desiredVel = tempV2.copy(steer).normalize().multiplyScalar(speed);
    f.vel.lerp(desiredVel, 1 - Math.exp(-dt * cfg.agility));

    // drag and clamp
    const sp = f.vel.length();
    if (sp > cfg.speedMax * 1.6) f.vel.multiplyScalar((cfg.speedMax * 1.6) / sp);
    if (sp < 0.06) {
      f.vel.x += Math.sin(time * 0.7 + f.seed) * 0.04;
      f.vel.z += Math.cos(time * 0.6 + f.seed) * 0.04;
    }

    f.pos.addScaledVector(f.vel, dt);

    // keep inside hard bounds
    f.pos.x = clamp(f.pos.x, -TANK.w / 2 + 0.2, TANK.w / 2 - 0.2);
    f.pos.z = clamp(f.pos.z, -TANK.d / 2 + 0.2, 1.72);
    const minY = f.species === 'cory' ? sandHeight(f.pos.x, f.pos.z) + 0.16 : 0.34;
    f.pos.y = clamp(f.pos.y, minY, TANK.waterY - 0.25);

    // orientation
    const dir = tempV.copy(f.vel);
    if (dir.lengthSq() < 0.0001) dir.set(1, 0, 0);
    dir.normalize();
    const up = tempV2.set(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(dir, up).normalize();
    const upAdj = new THREE.Vector3().crossVectors(side, dir).normalize();
    tempM.makeBasis(dir, upAdj, side);
    tempQ.setFromRotationMatrix(tempM);
    // bank into turns
    const lateral = f.vel.x * side.x + f.vel.z * side.z;
    f.bankTarget = clamp(-lateral * 0.8, -0.28, 0.28);
    f.bank = lerp(f.bank, f.bankTarget, 1 - Math.exp(-dt * 3.2));
    tempQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), f.bank));
    f.group.quaternion.slerp(tempQ, 1 - Math.exp(-dt * 4.5));
    f.group.position.copy(f.pos);
    if (f.shadow) {
      const floor = sandHeight(f.pos.x, f.pos.z);
      f.shadow.position.set(f.pos.x, floor + 0.019, f.pos.z);
      const h = Math.max(0, f.pos.y - floor);
      f.shadow.material.opacity = 0.3 * clamp(1.0 - h / 1.5, 0.15, 1.0);
      const sc = 1.0 + h * 0.18;
      f.shadow.scale.set(f.cfg.length * 1.5 * sc, f.cfg.length * 1.0 * sc, 1);
    }

    // body / tail animation
    const shader = f.bodyMat.userData.shader;
    if (shader) {
      shader.uniforms.uTime.value = time;
      shader.uniforms.uFreq.value = 3.8 + speed * 3.8 + f.burst * 2.0;
    }
    const beat = time * (3.8 + speed * 3.8) + f.phase;
    f.tailPivot.rotation.y = Math.sin(beat) * (0.28 + speed * 0.22 + f.burst * 0.08);
    f.tailPivot.rotation.z = Math.sin(beat * 0.5 + 1.2) * 0.035;
    f.tailPivot.position.z = Math.sin(beat - 3.4) * cfg.length * 0.045;

    // subtle pectoral / body roll already baked into quaternion
    f.group.position.y += Math.sin(time * 1.1 + f.phase) * 0.002;
  }
}

// ---------------------------------------------------------------------------
// Food update
// ---------------------------------------------------------------------------
function updateFood(dt, time) {
  for (let i = foods.length - 1; i >= 0; i--) {
    const food = foods[i];
    if (food.eaten) {
      foods.splice(i, 1);
      continue;
    }
    food.life -= dt;
    if (food.bubble) {
      food.mesh.position.y += dt * 0.55;
      food.mesh.material.opacity = clamp(food.life, 0, 0.2);
      if (food.life <= 0) {
        foodGroup.remove(food.mesh);
        foods.splice(i, 1);
      }
      continue;
    }
    food.vel.y -= dt * 0.12;
    food.vel.multiplyScalar(1 - dt * 0.6);
    food.vel.x += Math.sin(time * 0.9 + food.phase) * dt * 0.04;
    food.vel.z += Math.cos(time * 0.7 + food.phase) * dt * 0.035;
    food.mesh.position.addScaledVector(food.vel, dt);
    const floor = sandHeight(food.mesh.position.x, food.mesh.position.z) + 0.035;
    if (food.mesh.position.y < floor) {
      food.mesh.position.y = floor;
      food.vel.set(0, 0, 0);
      food.mesh.rotation.x += dt * 0.2;
    }
    if (food.life <= 0) {
      food.mesh.scale.setScalar(Math.max(0, food.scale * (food.life / 2)));
      if (food.life < -1) {
        foodGroup.remove(food.mesh);
        foods.splice(i, 1);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Bubbles / particles / surface update
// ---------------------------------------------------------------------------
function updateBubbles(dt, time) {
  const posAttr = bubbleGeo.attributes.position;
  for (let i = 0; i < bubbleCount; i++) {
    const b = bubbleData[i];
    let y = b.startY + time * b.speed;
    y = ((y + 0.2) % (TANK.waterY + 0.2));
    const x = b.bx + Math.sin(time * 2.0 + b.phase) * b.wobble;
    const z = b.bz + Math.cos(time * 1.6 + b.phase * 1.3) * b.wobble;
    posAttr.setXYZ(i, x, y, z);
  }
  posAttr.needsUpdate = true;
  bubbleMat.uniforms.uTime.value = time;
  bubbleMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  particleMat.uniforms.uTime.value = time;
  particleMat.uniforms.uPixelRatio.value = renderer.getPixelRatio();

  for (const b of sourceBubbles.children) {
    b.position.y = 0.32 + ((time * 0.18 + b.userData.phase) % 0.35);
    b.material.opacity = 0.18 + 0.12 * Math.sin(time * 3 + b.userData.phase);
  }
}

// ---------------------------------------------------------------------------
// Camera / UI / animation loop
// ---------------------------------------------------------------------------
const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
window.addEventListener('pointermove', (e) => {
  mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
  mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
});

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloomPass.resolution.set(w, h);

  const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const portrait = camera.aspect < 0.8;
  // On a phone the tank is much wider than the viewport. Cropping the outer
  // sides of the frame keeps the central fish and planting readable instead
  // of shrinking the whole aquarium into a thin band.
  const fitWidth = portrait ? 4.8 : 9.2;
  const fitHeight = portrait ? 4.9 : 5.25;
  const verticalFit = fitHeight / (2 * tan);
  const horizontalFit = fitWidth / (2 * tan * camera.aspect);
  cameraZBase = Math.max(
    9.7,
    verticalFit + (portrait ? 1.4 : 2.2),
    horizontalFit + (portrait ? 1.2 : 2.4)
  );

  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
  renderer.setPixelRatio(pixelRatio);
  composer.setPixelRatio(pixelRatio);
  bubbleMat.uniforms.uPixelRatio.value = pixelRatio;
  particleMat.uniforms.uPixelRatio.value = pixelRatio;

  // Resizing clears the render targets. While paused, redraw one still frame
  // so the scene does not vanish; simulation time and pause state stay put.
  if (paused && window.__aquarium) renderScene();
}
window.addEventListener('resize', resize);
resize();

// initial camera placement
camera.position.set(0, 2.3, cameraZBase);
camera.lookAt(cameraLook);

function hideLoading() {
  const loading = document.getElementById('loading');
  if (loading) {
    loading.classList.add('hidden');
    setTimeout(() => loading.remove(), 1200);
  }
}

function renderScene() {
  composer.render();
  if (firstFrame) {
    firstFrame = false;
    hideLoading();
  }
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  clock.getDelta();
}

function startLoop() {
  if (rafId || paused || document.hidden) return;
  clock.getDelta();
  rafId = requestAnimationFrame(animate);
}

function animate() {
  rafId = 0;
  if (document.hidden || paused) return;

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // camera drift / parallax
  mouse.x = lerp(mouse.x, mouse.tx, 1 - Math.exp(-dt * 1.8));
  mouse.y = lerp(mouse.y, mouse.ty, 1 - Math.exp(-dt * 1.8));
  const driftX = Math.sin(elapsed * 0.055) * 0.42 + mouse.x * 0.52;
  const driftY = 2.26 + Math.sin(elapsed * 0.09) * 0.055 - mouse.y * 0.24;
  const driftZ = cameraZBase + Math.sin(elapsed * 0.041) * 0.18;
  if (!window.__aquarium || !window.__aquarium.freezeCamera) {
    camera.position.set(driftX, driftY, driftZ);
    camera.lookAt(cameraLook);
  }

  // animate world
  sandMat.uniforms.uTime.value = elapsed;
  backWallMat.uniforms.uTime.value = elapsed;
  waterSurfaceMat.uniforms.uTime.value = elapsed;
  plantUniforms.uTime.value = elapsed;
  glassUniforms.uTime.value = elapsed;
  shaftMat.uniforms.uTime.value = elapsed;
  floatingMesh.position.y = Math.sin(elapsed * 0.6) * 0.012;

  updateFish(dt, elapsed);
  updateFood(dt, elapsed);
  updateBubbles(dt, elapsed);

  renderScene();
  rafId = requestAnimationFrame(animate);
}

function updatePauseButton() {
  const button = document.getElementById('pauseBtn');
  if (!button) return;
  button.textContent = paused ? 'Play scene' : 'Pause scene';
  button.setAttribute('aria-pressed', String(paused));
  button.setAttribute('aria-label', paused ? 'Play aquarium scene' : 'Pause aquarium scene');
  document.body.classList.toggle('paused', paused);
}

function announceScene(message) {
  const status = document.getElementById('sceneStatus');
  if (status) status.textContent = message;
}

function setPaused(value, announce = true) {
  const next = Boolean(value);
  if (next === paused) {
    updatePauseButton();
    return;
  }
  paused = next;
  updatePauseButton();
  if (paused) {
    stopLoop();
    renderScene();
  } else {
    startLoop();
  }
  if (announce) {
    announceScene(
      paused
        ? 'Scene paused. Fish, plants, water and camera are still.'
        : 'Scene playing.'
    );
  }
}

function togglePause() {
  manualMotionChoice = true;
  setPaused(!paused);
}

function onMotionPreferenceChange(event) {
  if (!manualMotionChoice) setPaused(event.matches, false);
}

const pauseBtn = document.getElementById('pauseBtn');
if (pauseBtn) pauseBtn.addEventListener('click', togglePause);

const feedBtn = document.getElementById('feedBtn');
if (feedBtn) feedBtn.addEventListener('click', feedAtCenter);

if (reduceMotionQuery.addEventListener) {
  reduceMotionQuery.addEventListener('change', onMotionPreferenceChange);
} else if (reduceMotionQuery.addListener) {
  reduceMotionQuery.addListener(onMotionPreferenceChange);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLoop();
  } else {
    clock.getDelta();
    if (paused) renderScene();
    else startLoop();
  }
});

window.addEventListener('keydown', (event) => {
  if (event.defaultPrevented || event.isComposing) return;
  const target = event.target;
  const tag = target && target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (target && target.isContentEditable)) return;
  if (target && target.closest && target.closest('button, a')) return;
  if (event.code === 'Space' || event.key === 'p' || event.key === 'P') {
    event.preventDefault();
    togglePause();
  } else if (event.key === 'f' || event.key === 'F') {
    event.preventDefault();
    feedAtCenter();
  }
});

// set UI species dots
document.querySelectorAll('[data-species]').forEach((el) => {
  const key = el.dataset.species;
  const cfg = SPECIES[key];
  if (cfg) el.style.setProperty('--dot', cfg.color);
});

window.__aquarium = {
  camera,
  scene,
  fishes,
  renderer,
  freezeCamera: false,
  get paused() { return paused; },
  get elapsed() { return elapsed; },
  get rafId() { return rafId; },
};

updatePauseButton();
if (paused) {
  // Reduced motion: draw one still frame and offer an explicit Play control.
  renderScene();
} else {
  startLoop();
}
}

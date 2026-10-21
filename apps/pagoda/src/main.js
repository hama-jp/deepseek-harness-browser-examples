
/* ============================================================
   SAKURA PAGODA — a hand-built voxel garden
   Single-file scene. No external assets, no network.
   ============================================================ */
(() => {
'use strict';

const THREE = window.THREE;
const TAU = Math.PI * 2;

/* ---------- tiny utilities ---------- */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const mixColor = (a, b, t) => a.clone().lerp(b, t);

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash3(x, y, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hash2(x, z) { return hash3(x, 913, z); }

function valueNoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi);
  const c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

/* ---------- palette ---------- */
const C = {
  grass:      [0x79a94a, 0x86b653, 0x6f9d42, 0x91c05c, 0x7cab4d],
  grassDark:  [0x5b8238, 0x658e3e, 0x527a33],
  moss:       [0x4f7a3c, 0x5c8a45, 0x456f35, 0x6b9450],
  dirt:       [0x71543c, 0x664a34, 0x7b5e43, 0x5d4531],
  stone:      [0x9b9890, 0x8b887f, 0xa6a39a, 0x7e7b74],
  stoneDark:  [0x6f6d67, 0x63615b, 0x77756e],
  path:       [0xb8b1a1, 0xaaa393, 0xc2bbaa, 0x9e9789],
  gravel:     [0xd6cfbc, 0xcdc6b3, 0xded7c4],
  gravelDark: [0xbcb5a2, 0xb1aa97],
  sand:       [0xcdbb94, 0xbfae88, 0xd8c6a0, 0xb3a37f],
  pebble:     [0xaaa79c, 0x96948a, 0xb7b3a6, 0x827f76],
  trunk:      [0x5a4038, 0x4c352f, 0x674b40, 0x533a31],
  trunkLight: [0x7a5a4a, 0x6d4f40],
  pineTrunk:  [0x6b4b3a, 0x5d4032, 0x78553f],
  bamboo:     [0x79a83e, 0x86b94a, 0x6a9635, 0x92c456],
  bambooNode: [0xa3c96a, 0x8fb857],
  pine:       [0x2f6649, 0x397555, 0x25573e, 0x43805e, 0x1e4b34],
  pineLight:  [0x4f8a68, 0x5d9873],
  sakura:     [0xffb6d3, 0xff9fc6, 0xf58bb7, 0xffd0e4, 0xffe3ef, 0xf7a7c9],
  sakuraDeep: [0xe87aa8, 0xf08bb4, 0xd96b99],
  sakuraWhite:[0xfff0f6, 0xffe6f0, 0xffffff],
  red:        [0xc0392b, 0xb43327, 0xcf4434, 0xa92e23],
  vermilion:  [0xd94b32, 0xe0563b, 0xc9402a, 0xee6244],
  redDark:    [0x8e2a21, 0x7d241d, 0x9b3025],
  cream:      [0xf2e6c8, 0xeaddbc, 0xf7edd2, 0xe3d4b2],
  plaster:    [0xece0c4, 0xe4d6b7, 0xf3e8cd],
  wood:       [0x6d4a33, 0x62422e, 0x78543a, 0x563a28],
  woodLight:  [0x8a6548, 0x7d5a3f, 0x96704f],
  roof:       [0x315f68, 0x3a6c75, 0x2a545c, 0x447982, 0x356771],
  roofLight:  [0x538d96, 0x5f9aa2],
  roofEdge:   [0xd9cba6, 0xcfc09b, 0xe4d6b2],
  gold:       [0xe7b64b, 0xf0c65e, 0xd9a83c, 0xf7d477],
  goldDark:   [0xb8882c, 0xc99735, 0xa87b26],
  bronze:     [0x8d6a3b, 0x9c7742, 0x7d5d34],
  glow:       [0xffcf7a, 0xffd98c, 0xffc061, 0xffe6ae],
  waterPlant: [0x3f7a55, 0x4b8a62, 0x35694a],
  lily:       [0x4e8c54, 0x5c9c60, 0x3f7b47],
  lotus:      [0xffb7cf, 0xffc9dc, 0xffa3c2, 0xfff0f5],
  hydrangea:  [0x7f9fdd, 0x9a8ad6, 0x6e8ecb, 0xb29ee0, 0x8fb4e8],
  azalea:     [0xe2608e, 0xd94b7b, 0xef7ba3, 0xc93d6c],
  tulip:      [0xe8433f, 0xf2b33d, 0xb56ad6, 0xf5f0e6, 0xf07b35, 0xe66fa4],
  daisy:      [0xfff7e8, 0xfff3da, 0xffffff],
  daisyCenter:[0xf4c24c, 0xe8b23c],
  iris:       [0x6d5bbd, 0x7d68cc, 0x5a49a8],
  cloud:      [0xfbf3e8, 0xffe9df, 0xf6e7dc, 0xfff6ee],
  cloudShade: [0xe6d5cd, 0xdccbc4, 0xf0ded5],
  bird:       [0xf7f4ea, 0xffffff, 0x2d3338],
  craneRed:   [0xd94a3a, 0xe85a45],
  star:       0xfff4d6
};

/* ---------- voxel world ---------- */
const KIND_MATTE = 0, KIND_METAL = 1, KIND_GLOW = 2;

class VoxelWorld {
  constructor() {
    this.map = new Map();
  }
  static key(x, y, z) {
    return (x + 128) + (z + 128) * 256 + (y + 40) * 65536;
  }
  set(x, y, z, color, kind = KIND_MATTE) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    if (y < -40 || y > 200) return;
    this.map.set(VoxelWorld.key(x, y, z), (color & 0xffffff) | (kind << 24));
  }
  setIfEmpty(x, y, z, color, kind = KIND_MATTE) {
    x = Math.round(x); y = Math.round(y); z = Math.round(z);
    const k = VoxelWorld.key(x, y, z);
    if (!this.map.has(k)) this.map.set(k, (color & 0xffffff) | (kind << 24));
  }
  get(x, y, z) {
    return this.map.get(VoxelWorld.key(Math.round(x), Math.round(y), Math.round(z)));
  }
  has(x, y, z) {
    return this.map.has(VoxelWorld.key(x, y, z));
  }
  box(x0, y0, z0, x1, y1, z1, color, kind = KIND_MATTE) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          this.set(x, y, z, color, kind);
  }
  ring(x0, y0, z0, x1, y1, z1, color, kind = KIND_MATTE) {
    // hollow box walls, floor and ceiling optional via y0===y1
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
    const ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const az = Math.min(z0, z1), bz = Math.max(z0, z1);
    for (let x = ax; x <= bx; x++)
      for (let y = ay; y <= by; y++)
        for (let z = az; z <= bz; z++)
          if (x === ax || x === bx || z === az || z === bz || y === ay || y === by)
            this.set(x, y, z, color, kind);
  }
  ellipsoid(cx, cy, cz, rx, ry, rz, colorFn, opts = {}) {
    const jitter = opts.jitter !== undefined ? opts.jitter : 0.32;
    const hollow = !!opts.hollow;
    const minX = Math.floor(cx - rx), maxX = Math.ceil(cx + rx);
    const minY = Math.floor(cy - ry), maxY = Math.ceil(cy + ry);
    const minZ = Math.floor(cz - rz), maxZ = Math.ceil(cz + rz);
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        for (let z = minZ; z <= maxZ; z++) {
          const dx = (x - cx) / rx, dy = (y - cy) / ry, dz = (z - cz) / rz;
          const d = dx * dx + dy * dy + dz * dz;
          if (d > 1) continue;
          if (hollow && d < 0.45) continue;
          if (jitter > 0) {
            const n = hash3(x, y, z);
            if (n < jitter * (1 - d) * 0.9) continue;
          }
          const col = typeof colorFn === 'function' ? colorFn(x, y, z, d) : colorFn;
          this.set(x, y, z, col, opts.kind || KIND_MATTE);
        }
      }
    }
  }
  line(x0, y0, z0, x1, y1, z1, radius, colorFn, kind = KIND_MATTE) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x0 + dx * t, py = y0 + dy * t, pz = z0 + dz * t;
      const r = typeof radius === 'function' ? radius(t) : radius;
      const col = typeof colorFn === 'function' ? colorFn(t, px, py, pz) : colorFn;
      const ri = Math.ceil(r);
      for (let ox = -ri; ox <= ri; ox++)
        for (let oy = -ri; oy <= ri; oy++)
          for (let oz = -ri; oz <= ri; oz++) {
            if (ox * ox + oy * oy + oz * oz <= r * r + 0.25)
              this.set(px + ox, py + oy, pz + oz, col, kind);
          }
    }
  }
  disc(cx, y, cz, rx, rz, colorFn, opts = {}) {
    const jitter = opts.jitter !== undefined ? opts.jitter : 0.15;
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++)
      for (let z = Math.floor(cz - rz); z <= Math.ceil(cz + rz); z++) {
        const dx = (x - cx) / rx, dz = (z - cz) / rz;
        const d = dx * dx + dz * dz;
        if (d > 1) continue;
        if (jitter > 0 && hash3(x, y, z) < jitter * (1 - d) * 0.7) continue;
        const col = typeof colorFn === 'function' ? colorFn(x, y, z, d) : colorFn;
        this.set(x, y, z, col, opts.kind || KIND_MATTE);
      }
  }
}

/* ---------- color variation cache ---------- */
const colorVariantCache = new Map();
function colorVariants(hex) {
  let v = colorVariantCache.get(hex);
  if (v) return v;
  const base = new THREE.Color(hex);
  v = [];
  const shifts = [
    [0, 0, 0],
    [0.004, 0.02, 0.025],
    [-0.004, 0.0, -0.022],
    [0.008, 0.03, 0.012],
    [-0.006, -0.01, 0.028],
    [0.002, 0.02, -0.03]
  ];
  for (const s of shifts) {
    const c = base.clone();
    c.offsetHSL(s[0], s[1], s[2]);
    v.push(c);
  }
  colorVariantCache.set(hex, v);
  return v;
}

/* ---------- exposed-face voxel mesher with ambient occlusion ---------- */
const FACE_DEFS = [
  { // +X
    n: [1, 0, 0], shade: 0.90,
    corners: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]],
    ao: [[0,-1,-1],[0,1,-1],[0,1,1],[0,-1,1]],
    aoAxis: [1, 0], offset: [1,0,0]
  },
  { // -X
    n: [-1, 0, 0], shade: 0.82,
    corners: [[0,0,0],[0,0,1],[0,1,1],[0,1,0]],
    ao: [[0,-1,-1],[0,-1,1],[0,1,1],[0,1,-1]],
    aoAxis: [1, 2], offset: [-1,0,0]
  },
  { // +Y
    n: [0, 1, 0], shade: 1.0,
    corners: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]],
    ao: [[-1,0,-1],[-1,0,1],[1,0,1],[1,0,-1]],
    aoAxis: [0, 2], offset: [0,1,0]
  },
  { // -Y
    n: [0, -1, 0], shade: 0.58,
    corners: [[0,0,0],[1,0,0],[1,0,1],[0,0,1]],
    ao: [[-1,0,-1],[1,0,-1],[1,0,1],[-1,0,1]],
    aoAxis: [0, 2], offset: [0,-1,0]
  },
  { // +Z
    n: [0, 0, 1], shade: 0.95,
    corners: [[0,0,1],[1,0,1],[1,1,1],[0,1,1]],
    ao: [[-1,-1,0],[1,-1,0],[1,1,0],[-1,1,0]],
    aoAxis: [0, 1], offset: [0,0,1]
  },
  { // -Z
    n: [0, 0, -1], shade: 0.78,
    corners: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]],
    ao: [[-1,-1,0],[-1,1,0],[1,1,0],[1,-1,0]],
    aoAxis: [0, 1], offset: [0,0,-1]
  }
];

const AO_LEVELS = [0.68, 0.80, 0.92, 1.0];

function decodeKey(k) {
  const x = (k % 256) - 128;
  const z = (Math.floor(k / 256) % 256) - 128;
  const y = Math.floor(k / 65536) - 40;
  return [x, y, z];
}

function meshVoxels(world, kind) {
  const positions = [], normals = [], colors = [], indices = [];
  let vi = 0;
  const map = world.map;

  for (const [key, packed] of map) {
    const vk = packed >>> 24;
    if (vk !== kind) continue;
    const hex = packed & 0xffffff;
    const [x, y, z] = decodeKey(key);
    const variants = colorVariants(hex);

    for (let f = 0; f < 6; f++) {
      const face = FACE_DEFS[f];
      const nx = x + face.offset[0], ny = y + face.offset[1], nz = z + face.offset[2];
      if (map.has(VoxelWorld.key(nx, ny, nz))) continue;

      const varIdx = Math.floor(hash3(x, y, z) * variants.length);
      const base = variants[varIdx];
      const shade = face.shade;

      for (let c = 0; c < 4; c++) {
        const cor = face.corners[c];
        const ao = face.ao[c];
        // neighbors in the plane just outside this face
        const s1 = map.has(VoxelWorld.key(nx + ao[0], ny + ao[1], nz + ao[2]));
        const s2 = map.has(VoxelWorld.key(nx + ao[0] * 0, ny + ao[1] * 0, nz + ao[2] * 0));
        // use the two orthogonal neighbours + diagonal
        let sideA, sideB, corner;
        if (f === 0 || f === 1) { // X faces: axes y,z
          sideA = map.has(VoxelWorld.key(nx, y + ao[1], z));
          sideB = map.has(VoxelWorld.key(nx, y, z + ao[2]));
          corner = map.has(VoxelWorld.key(nx, y + ao[1], z + ao[2]));
        } else if (f === 2 || f === 3) { // Y faces: axes x,z
          sideA = map.has(VoxelWorld.key(x + ao[0], ny, z));
          sideB = map.has(VoxelWorld.key(x, ny, z + ao[2]));
          corner = map.has(VoxelWorld.key(x + ao[0], ny, z + ao[2]));
        } else { // Z faces: axes x,y
          sideA = map.has(VoxelWorld.key(x + ao[0], y, nz));
          sideB = map.has(VoxelWorld.key(x, y + ao[1], nz));
          corner = map.has(VoxelWorld.key(x + ao[0], y + ao[1], nz));
        }
        let level;
        if (sideA && sideB) level = 0;
        else level = 3 - ((sideA ? 1 : 0) + (sideB ? 1 : 0) + (corner ? 1 : 0));
        const aoMul = AO_LEVELS[level];
        const m = shade * aoMul;

        positions.push(x + cor[0], y + cor[1], z + cor[2]);
        normals.push(face.n[0], face.n[1], face.n[2]);
        colors.push(base.r * m, base.g * m, base.b * m);
      }
      indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
      vi += 4;
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}

/* ---------- world constants ---------- */
const GROUND_Y = 3;
const WATER_Y = 2.35;
const PAGODA = { x: 0, z: -20, base: 6 };
const POND_ELLIPSES = [
  { x: -24, z: 14, rx: 13, rz: 10 },
  { x: -12, z: 19, rx: 6, rz: 5 },
  { x: -29, z: 6, rx: 5.5, rz: 5 }
];

const SAKURA = [
  { x: 33, z: 12, ground: 3, height: 23, lean: [-3.5, 2.0], seed: 11, size: 0.92, hue: 0 },
  { x: -43, z: 30, ground: 3, height: 20, lean: [2.5, -2.0], seed: 23, size: 0.9, hue: 1 },
  { x: 38, z: -6, ground: 3, height: 18, lean: [-3.0, -1.0], seed: 37, size: 0.82, hue: 2 },
  { x: -47, z: -6, ground: 3, height: 22, lean: [3.0, 2.5], seed: 51, size: 0.9, hue: 3, weep: true }
];

const PINES = [
  { x: 46, z: -32, ground: 4, height: 26, seed: 71 },
  { x: -55, z: -25, ground: 4, height: 23, seed: 83 },
  { x: 54, z: 20, ground: 3, height: 20, seed: 97 }
];

const TEA = { x: -44, z: 16, base: 4 };
const TORII = { x: 16, z: 48 };
const ZEN = { x0: 26, z0: -36, x1: 44, z1: -20 };

/* ---------- paths ---------- */
const PATHS = [
  // main approach from torii to pagoda steps
  [[18,52],[18,44],[15,34],[10,26],[6,18],[4,10],[2,4],[0,-1],[0,-4]],
  // branch to bridge east landing
  [[10,26],[4,22],[-1,18],[-5,15]],
  // across the bridge to tea house
  [[-36,14],[-40,16],[-44,18]],
  // south shore walk
  [[-43,32],[-35,28],[-27,25],[-18,25],[-8,24],[-1,20],[4,18]],
  // garden walk to the raked gravel garden
  [[6,18],[14,10],[22,2],[28,-6],[32,-14]]
];

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  if (l2 === 0) return Math.hypot(px - ax, pz - az);
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = clamp(t, 0, 1);
  return Math.hypot(px - (ax + dx * t), pz - (az + dz * t));
}

function pathDistance(x, z) {
  let best = 1e9;
  for (const line of PATHS) {
    for (let i = 0; i < line.length - 1; i++) {
      const d = distToSegment(x, z, line[i][0], line[i][1], line[i + 1][0], line[i + 1][1]);
      if (d < best) best = d;
    }
  }
  return best;
}

function pondField(x, z) {
  let m = -1;
  for (const e of POND_ELLIPSES) {
    const dx = (x - e.x) / e.rx, dz = (z - e.z) / e.rz;
    m = Math.max(m, 1 - dx * dx - dz * dz);
  }
  return m;
}

function inZen(x, z) {
  return x >= ZEN.x0 && x <= ZEN.x1 && z >= ZEN.z0 && z <= ZEN.z1;
}

function terrainHeight(x, z) {
  let h = GROUND_Y;
  // hillside rising behind the pagoda
  h += smoothstep(-40, -72, z) * (7.5 + 2.5 * valueNoise(x * 0.06, z * 0.06));
  // flanking mounds
  h += 4.2 * Math.exp(-(((x - 48) / 24) ** 2 + ((z + 44) / 21) ** 2));
  h += 3.6 * Math.exp(-(((x + 54) / 22) ** 2 + ((z + 43) / 20) ** 2));
  h += 1.1 * valueNoise(x * 0.16 + 8, z * 0.16 - 3);
  h = Math.round(h);

  // flat central garden / pagoda court
  if (x > -21 && x < 21 && z > -47 && z < 7) h = GROUND_Y;
  // tea house terrace
  if (x > -53 && x < -36 && z > 5 && z < 31) h = GROUND_Y;
  // raked gravel garden
  if (inZen(x, z)) h = GROUND_Y;
  // paths are level
  if (pathDistance(x, z) < 2.5) h = GROUND_Y;

  // pond basin
  const m = pondField(x, z);
  if (m > 0) h = -1;
  else if (m > -0.14) h = GROUND_Y;
  return h;
}

/* ---------- scene setup ---------- */
const canvas = document.getElementById('scene');

function showWebGLFallback() {
  const fallback = document.getElementById('webglFallback');
  if (fallback) {
    fallback.hidden = false;
    fallback.classList.add('show');
  }
  const loading = document.getElementById('loading');
  if (loading) loading.classList.add('hide');
  document.body.classList.add('webgl-unavailable');
}

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: true, alpha: false, powerPreference: 'high-performance'
  });
} catch (error) {
  console.error('WebGL unavailable:', error);
  showWebGLFallback();
  return;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.LinearToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe4c8ad, 105, 290);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 1600);
const cameraTarget = new THREE.Vector3(-2, 30, -6);

/* camera orbit state */
const orbit = {
  theta: -0.30,
  phi: 1.04,
  radius: 142,
  target: cameraTarget.clone(),
  tTheta: -0.30,
  tPhi: 1.04,
  tRadius: 142,
  tTarget: cameraTarget.clone(),
  auto: true,
  idle: 0,
  dragging: false,
  panning: false
};

/* ---------- sky ---------- */
const skyUniforms = {
  uTop:     { value: new THREE.Color(0x4f7fb8) },
  uMid:     { value: new THREE.Color(0xf0b98f) },
  uHorizon: { value: new THREE.Color(0xffd2a0) },
  uSunDir:  { value: new THREE.Vector3(-0.74, 0.24, -0.30).normalize() },
  uSunColor:{ value: new THREE.Color(0xffd9a0) },
  uGlow:    { value: 0.85 },
  uNight:   { value: 0 }
};
const skyMat = new THREE.ShaderMaterial({
  uniforms: skyUniforms,
  side: THREE.BackSide,
  depthWrite: false,
  fog: false,
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = normalize(position);
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    varying vec3 vDir;
    uniform vec3 uTop, uMid, uHorizon, uSunColor, uSunDir;
    uniform float uGlow, uNight;
    void main() {
      vec3 d = normalize(vDir);
      float h = clamp((d.y + 0.22) / 0.62, 0.0, 1.0);
      vec3 col = mix(uHorizon, uMid, smoothstep(0.03, 0.40, h));
      col = mix(col, uTop, smoothstep(0.30, 0.78, h));
      float sd = max(dot(d, normalize(uSunDir)), 0.0);
      col += uSunColor * pow(sd, 5.0) * 0.34 * uGlow;
      col += uSunColor * pow(sd, 60.0) * 0.55 * uGlow;
      col += uSunColor * smoothstep(0.9992, 0.99965, sd) * 1.2 * uGlow;
      // soft haze band near the horizon
      col = mix(col, uHorizon, smoothstep(0.12, 0.0, h) * 0.22);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(700, 40, 24), skyMat);
skyMesh.renderOrder = -100;
scene.add(skyMesh);

/* sun / moon halo sprite */
function makeGlowTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,210,140,0)') {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0, inner);
  g.addColorStop(0.18, 'rgba(255,236,200,0.82)');
  g.addColorStop(0.45, 'rgba(255,205,145,0.30)');
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTex = makeGlowTexture();

const sunSpriteMat = new THREE.SpriteMaterial({
  map: glowTex, color: 0xffe2b0, transparent: true, opacity: 0.95,
  blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false
});
const sunSprite = new THREE.Sprite(sunSpriteMat);
sunSprite.scale.set(95, 95, 1);
sunSprite.position.copy(skyUniforms.uSunDir.value).multiplyScalar(520);
skyMesh.add(sunSprite);

/* moon disc and halo, revealed at night */
function makeMoonTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(s*0.46, s*0.44, 4, s/2, s/2, s*0.42);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#eef4ff');
  g.addColorStop(0.88, '#cfdcf4');
  g.addColorStop(1, 'rgba(190,210,240,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s/2, s/2, s*0.40, 0, TAU);
  ctx.fill();
  ctx.globalAlpha = 0.10;
  ctx.fillStyle = '#8fa4c4';
  for (const [x, y, r] of [[48,52,7],[72,44,4],[64,72,9],[44,78,5],[82,66,3]]) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const moonTex = makeMoonTexture();
const moonSpriteMat = new THREE.SpriteMaterial({
  map: moonTex, color: 0xe8f0ff, transparent: true, opacity: 0,
  blending: THREE.NormalBlending, depthWrite: false, depthTest: true, fog: false
});
const moonSprite = new THREE.Sprite(moonSpriteMat);
moonSprite.scale.set(32, 32, 1);
moonSprite.position.set(0.42, -0.25, -0.88).normalize().multiplyScalar(520);
moonSprite.renderOrder = -99;
skyMesh.add(moonSprite);
const moonHaloMat = new THREE.SpriteMaterial({
  map: glowTex, color: 0xbcd4ff, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, fog: false
});
const moonHalo = new THREE.Sprite(moonHaloMat);
moonHalo.scale.set(118, 118, 1);
moonHalo.position.copy(moonSprite.position);
moonHalo.renderOrder = -100;
skyMesh.add(moonHalo);

/* stars */
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  const rnd = mulberry32(999);
  for (let i = 0; i < 900; i++) {
    const az = rnd() * TAU;
    const el = Math.asin(rnd() * 0.96 + 0.04);
    const r = 560;
    pts.push(Math.cos(el) * Math.cos(az) * r, Math.sin(el) * r, Math.cos(el) * Math.sin(az) * r);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const starMat = new THREE.PointsMaterial({
  color: 0xfff2d2, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0,
  depthWrite: false, fog: false, blending: THREE.AdditiveBlending
});
const stars = new THREE.Points(starGeo, starMat);
skyMesh.add(stars);

/* ---------- lights ---------- */
const hemi = new THREE.HemisphereLight(0xb8d2ee, 0x6f7d52, 1.18);
scene.add(hemi);

const sunDir = skyUniforms.uSunDir.value.clone();
const sunLight = new THREE.DirectionalLight(0xffd7a8, 2.55);
sunLight.position.copy(sunDir).multiplyScalar(130);
sunLight.target.position.set(0, 10, -10);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.left = -95;
sunLight.shadow.camera.right = 95;
sunLight.shadow.camera.top = 95;
sunLight.shadow.camera.bottom = -95;
sunLight.shadow.camera.near = 20;
sunLight.shadow.camera.far = 320;
sunLight.shadow.bias = -0.0008;
sunLight.shadow.normalBias = 0.055;
scene.add(sunLight, sunLight.target);

const fillLight = new THREE.DirectionalLight(0xa9c4e2, 0.58);
fillLight.position.set(60, 40, -80);
scene.add(fillLight);

const ambient = new THREE.AmbientLight(0xffe2c8, 0.18);
scene.add(ambient);

/* ---------- build state ---------- */
const world = new VoxelWorld();
const glowSprites = [];
const pointLights = [];
let waterMesh, waterUniforms;
let petals, petalData = [];
let koiGroup, koiFish = [];
let cloudGroup;
let birds = [];
let fireflies, fireflyData = [];
let lanternGlowMat;

/* ---------- terrain ---------- */
function surfaceColor(x, z, h) {
  const m = pondField(x, z);
  if (m > 0) {
    // pond bed: sand, pebbles, occasional dark stone
    const r = hash3(x, h, z);
    if (r < 0.12) return C.stoneDark[(x + z) & 3];
    if (r < 0.36) return C.pebble[(x * 3 + z) & 3];
    return C.sand[(x + z * 2) & 3];
  }
  if (inZen(x, z)) {
    // raked gravel: alternating lines and rings around the rocks
    const dx = x - 35, dz = z - 28;
    const d1 = Math.hypot(x - 30, z - 28), d2 = Math.hypot(x - 40, z - 25);
    const ring = Math.abs(((d1 * 0.9) % 3) - 1.5) < 0.45 || Math.abs(((d2 * 0.8) % 2.6) - 1.3) < 0.4;
    if (ring) return C.gravelDark[(x + z) & 3];
    if ((z & 1) === 0) return C.gravel[(x + z) & 3];
    return C.gravelDark[(x + z) & 3];
  }
  const pd = pathDistance(x, z);
  if (pd < 1.9) {
    // stone paving, with a lighter center line
    const slab = (Math.floor(x / 2) + Math.floor(z / 2)) & 3;
    if (pd < 0.9) return C.path[(slab + 1) & 3];
    return C.path[slab];
  }
  if (m > -0.14) {
    // shoreline pebbles and mossy stones
    const r = hash3(x, h, z);
    if (r < 0.45) return C.pebble[(x + z) & 3];
    if (r < 0.75) return C.moss[(x + z) & 3];
    return C.sand[(x + z) & 3];
  }
  // mossy pockets near water
  if (m > -0.9 && hash3(x, 5, z) < 0.35) return C.moss[(x + z) & 3];
  // fallen petal carpets under the cherry trees
  for (const t of SAKURA) {
    const d = Math.hypot(x - t.x, z - t.z);
    const rad = 7.5 * t.size;
    if (d < rad) {
      const r = hash3(x, 9, z);
      if (r < 0.30 * (1 - d / rad)) return C.sakura[(x * 2 + z) & 5];
      if (r < 0.38 * (1 - d / rad)) return C.sakuraWhite[(x + z) & 2];
    }
  }
  // grass with patchy tones
  const n = valueNoise(x * 0.22, z * 0.22);
  const r = hash3(x, h, z);
  if (n > 0.66) return C.grassDark[(x + z) & 2];
  if (r < 0.06) return C.moss[(x + z) & 3];
  return C.grass[(x * 3 + z) & 4];
}

function buildTerrain() {
  for (let x = -75; x <= 75; x++) {
    for (let z = -75; z <= 75; z++) {
      const h = terrainHeight(x, z);
      const top = surfaceColor(x, z, h);
      const m = pondField(x, z);
      // column fill
      const bottom = -2;
      for (let y = bottom; y < h; y++) {
        let col;
        if (m > 0) {
          col = y > h - 3 ? C.sand[(x + y + z) & 3] : C.stoneDark[(x + z) & 3];
        } else if (y > h - 3) {
          col = C.dirt[(x + y + z) & 3];
        } else {
          col = C.stone[(x + y * 2 + z) & 3];
        }
        world.set(x, y, z, col);
      }
      world.set(x, h, z, top);

      // grass tufts on open grass
      if (m < -0.3 && pathDistance(x, z) > 2.5 && !inZen(x, z) &&
          !(x > -21 && x < 21 && z > -47 && z < 7) &&
          hash3(x, 77, z) < 0.055) {
        const tuft = hash3(x, 78, z) < 0.55 ? C.grassDark[(x + z) & 2] : C.grass[(x + z) & 4];
        world.set(x, h + 1, z, tuft);
        if (hash3(x, 79, z) < 0.12) world.set(x, h + 2, z, tuft);
      }
    }
  }
  // big quiet earth skirt beneath the garden
  const skirt = new THREE.Mesh(
    new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ color: 0x46543b, roughness: 1, metalness: 0 })
  );
  skirt.rotation.x = -Math.PI / 2;
  skirt.position.y = -2.1;
  skirt.receiveShadow = false;
  scene.add(skirt);
}

/* ---------- placeholders (filled in below) ---------- */
function buildPagoda() {
  const cx = PAGODA.x, cz = PAGODA.z;
  const g = GROUND_Y;

  /* ---- stone foundation and approach steps ---- */
  world.box(-17, g, -39, 17, 5, -4, C.stone[(cx + cz) & 3]);
  // top border trim
  for (let x = -17; x <= 17; x++) {
    for (let z = -39; z <= -4; z++) {
      if (x === -17 || x === 17 || z === -39 || z === -4) {
        world.set(x, 5, z, hash3(x, 5, z) < 0.3 ? C.stoneDark[0] : C.stone[2]);
      }
    }
  }
  // broad shallow steps at the front
  world.box(-7, g, -4, 7, 4, -2, C.path[0]);
  world.box(-7, g, -2, 7, 3, 0, C.path[1]);
  for (let x = -7; x <= 7; x += 2) {
    world.set(x, 4, -3, C.stoneDark[1]);
    world.set(x, 3, -1, C.stoneDark[1]);
  }
  // moss creeping over the foundation corners
  for (let i = 0; i < 70; i++) {
    const x = -17 + Math.floor(hash3(i, 1, 2) * 35);
    const z = -39 + Math.floor(hash3(i, 3, 4) * 35);
    if (x > -15 && x < 15 && z > -37 && z < -6) continue;
    if (hash3(i, 8, 9) < 0.55) world.set(x, 5, z, C.moss[i & 3]);
  }
  // stone plinth for the first storey
  world.box(-12, 5, -34, 12, 5, -8, C.stoneDark[(cx + cz) & 3]);
  world.box(-11, 6, -33, 11, 6, -9, C.stone[1]);

  /* ---- five storeys ---- */
  const tiers = [
    { half: 10, base: 6,  h: 7, roof: 13 },
    { half: 8,  base: 17, h: 5, roof: 22 },
    { half: 6,  base: 26, h: 4, roof: 30 },
    { half: 5,  base: 34, h: 4, roof: 38 },
    { half: 3,  base: 42, h: 3, roof: 45 }
  ];

  const addLantern = (x, y, z, seed, scale = 2.6, light = false) => {
    // small bronze hanging lantern with a warm glowing core
    world.set(x, y + 1, z, C.bronze[0]);
    world.set(x, y, z, C.glow[seed & 3], KIND_GLOW);
    world.set(x, y - 1, z, C.redDark[seed & 2]);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: 0xffcf86, transparent: true, opacity: 0.62,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false
    }));
    sp.position.set(x, y, z);
    sp.scale.setScalar(scale);
    sp.userData = { seed, baseScale: scale, baseOpacity: 0.62 };
    scene.add(sp);
    glowSprites.push(sp);
    if (light) {
      const pl = new THREE.PointLight(0xffb45e, 16, 26, 2);
      pl.position.set(x, y, z);
      pl.userData = { base: 16 };
      scene.add(pl);
      pointLights.push(pl);
    }
  };

  const buildRoof = (y0, eaveHalf, bodyHalf, seed) => {
    // four stepped tile courses
    for (let layer = 0; layer < 4; layer++) {
      const half = eaveHalf - layer;
      const y = y0 + layer;
      for (let x = -half; x <= half; x++) {
        for (let z = -half; z <= half; z++) {
          const wx = cx + x, wz = cz + z;
          const edge = Math.abs(x) === half || Math.abs(z) === half;
          let col;
          if (edge && layer === 0) {
            col = C.roofEdge[(x + z + seed) & 3];
          } else if (layer === 0 && (Math.abs(x) === half - 1 || Math.abs(z) === half - 1)) {
            col = C.roofLight[(x + z) & 1];
          } else {
            col = C.roof[(Math.floor((x + 200) / 2) + Math.floor((z + 200) / 2) + seed + layer) % C.roof.length];
            if (hash3(wx, y, wz) < 0.18) col = C.roofLight[(x + z) & 1];
          }
          world.set(wx, y, wz, col);
        }
      }
      // cream hip ridges running down the four corners
      if (layer > 0) {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
          world.set(cx + sx * half, y, cz + sz * half, C.roofEdge[(layer + seed) & 3]);
        }
      }
    }
    // upturned eave tips at the four corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const ex = eaveHalf, ez = eaveHalf;
      world.set(cx + sx * ex, y0 + 1, cz + sz * ez, C.roof[(seed + 1) % C.roof.length]);
      world.set(cx + sx * (ex + 1), y0 + 1, cz + sz * ez, C.roof[(seed + 2) % C.roof.length]);
      world.set(cx + sx * ex, y0 + 1, cz + sz * (ez + 1), C.roof[(seed + 2) % C.roof.length]);
      world.set(cx + sx * (ex + 1), y0 + 2, cz + sz * (ez + 1), C.roofEdge[seed & 3]);
      world.set(cx + sx * (ex + 1), y0 + 3, cz + sz * (ez + 1), C.gold[seed & 3], KIND_METAL);
      // a little bell beneath the tip
      world.set(cx + sx * (ex + 1), y0 - 1, cz + sz * (ez + 1), C.bronze[(seed + 1) & 2], KIND_METAL);
    }
    // ridge cap ring at the top course
    const topHalf = eaveHalf - 3;
    for (let x = -topHalf; x <= topHalf; x++) {
      for (let z = -topHalf; z <= topHalf; z++) {
        if (Math.abs(x) === topHalf || Math.abs(z) === topHalf)
          world.set(cx + x, y0 + 3, cz + z, C.goldDark[(x + z + seed) & 2], KIND_METAL);
      }
    }
    // bracket sets beneath the eaves
    for (let i = -bodyHalf + 2; i <= bodyHalf - 2; i += 2) {
      for (const s of [-1, 1]) {
        world.set(cx + i, y0 - 1, cz + s * (bodyHalf + 1), C.vermilion[(i + seed) & 3]);
        world.set(cx + s * (bodyHalf + 1), y0 - 1, cz + i, C.vermilion[(i + seed) & 3]);
        if ((i + seed) % 4 === 0) {
          world.set(cx + i, y0 - 1, cz + s * (bodyHalf + 2), C.goldDark[0], KIND_METAL);
          world.set(cx + s * (bodyHalf + 2), y0 - 1, cz + i, C.goldDark[0], KIND_METAL);
        }
      }
    }
  };

  const addWindow = (x, y, z, axis, width = 3, height = 2) => {
    // axis 'x' means the wall faces +/-z (window runs along x)
    if (axis === 'x') {
      for (let i = -Math.floor(width / 2); i <= Math.floor(width / 2); i++) {
        for (let j = 0; j < height; j++) {
          const frame = i === -Math.floor(width / 2) || i === Math.floor(width / 2) || j === 0 || j === height - 1;
          if (frame) world.set(cx + x + i, y + j, cz + z, C.wood[(i + j) & 2]);
          else world.set(cx + x + i, y + j, cz + z, C.glow[(i + j) & 3], KIND_GLOW);
        }
      }
      // lattice bars
      for (let j = 1; j < height - 1; j++) {
        world.set(cx + x, y + j, cz + z, C.woodLight[j & 1]);
      }
    } else {
      for (let i = -Math.floor(width / 2); i <= Math.floor(width / 2); i++) {
        for (let j = 0; j < height; j++) {
          const frame = i === -Math.floor(width / 2) || i === Math.floor(width / 2) || j === 0 || j === height - 1;
          if (frame) world.set(cx + z, y + j, cz + x + i, C.wood[(i + j) & 2]);
          else world.set(cx + z, y + j, cz + x + i, C.glow[(i + j) & 3], KIND_GLOW);
        }
      }
      for (let j = 1; j < height - 1; j++) {
        world.set(cx + z, y + j, cz + x, C.woodLight[j & 1]);
      }
    }
  };

  tiers.forEach((t, ti) => {
    const { half, base, h } = t;
    const top = base + h - 1;
    const z0 = cz - half, z1 = cz + half;

    // wall shell
    world.ring(cx - half, base, z0, cx + half, top, z1, C.plaster[(ti + half) & 3]);
    // dark timber sill and head beams
    world.ring(cx - half, base, z0, cx + half, base, z1, C.wood[(ti + 1) & 3]);
    world.ring(cx - half, top, z0, cx + half, top, z1, C.wood[(ti + 2) & 3]);
    world.ring(cx - half, base + 2, z0, cx + half, base + 2, z1, C.redDark[(ti + 1) & 2]);

    // corner pillars, two voxels square
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x0 = sx > 0 ? cx + half - 1 : cx - half;
      const zz0 = sz > 0 ? cz + half - 1 : cz - half;
      world.box(x0, base, zz0, x0 + 1, top, zz0 + 1, C.vermilion[(ti + 1) & 3]);
    }
    // intermediate pillars on each face
    const midStep = Math.max(2, Math.floor(half / 2));
    for (let i = -half + midStep; i <= half - midStep; i += midStep) {
      if (Math.abs(i) === half) continue;
      world.box(cx + i, base, cz - half, cx + i, top, cz - half, C.red[(ti + i) & 3]);
      world.box(cx + i, base, cz + half, cx + i, top, cz + half, C.red[(ti + i) & 3]);
      world.box(cx - half, base, cz + i, cx - half, top, cz + i, C.red[(ti + i) & 3]);
      world.box(cx + half, base, cz + i, cx + half, top, cz + i, C.red[(ti + i) & 3]);
    }

    // balcony walkway and railing
    const bal = half + 2;
    world.box(cx - bal, base, cz - bal, cx + bal, base, cz + bal, C.wood[(ti + 2) & 3]);
    for (let x = -bal; x <= bal; x++) {
      for (let z = -bal; z <= bal; z++) {
        if (Math.max(Math.abs(x), Math.abs(z)) !== bal) continue;
        const post = ((x + bal) % 2 === 0) && ((z + bal) % 2 === 0) ||
                     (Math.abs(x) === bal && Math.abs(z) === bal) ||
                     (x === 0 || z === 0);
        if (post) {
          world.set(cx + x, base + 1, cz + z, C.vermilion[(x + z + ti) & 3]);
          world.set(cx + x, base + 2, cz + z, C.vermilion[(x + z + ti) & 3]);
        } else {
          world.set(cx + x, base + 1, cz + z, C.redDark[(x + z) & 2]);
        }
        world.set(cx + x, base + 2, cz + z, C.red[(x + z + ti) & 3]);
      }
    }
    // balcony underside brackets
    for (let i = -bal + 2; i <= bal - 2; i += 3) {
      world.set(cx + i, base - 1, cz - bal, C.woodLight[(i + ti) & 2]);
      world.set(cx + i, base - 1, cz + bal, C.woodLight[(i + ti) & 2]);
      world.set(cx - bal, base - 1, cz + i, C.woodLight[(i + ti) & 2]);
      world.set(cx + bal, base - 1, cz + i, C.woodLight[(i + ti) & 2]);
    }

    // windows (front, back and both sides)
    const wy = ti === 0 ? base + 3 : base + Math.min(2, h - 2);
    if (ti === 0) {
      addWindow(-5, wy, half, 'x', 3, 2);
      addWindow(5, wy, half, 'x', 3, 2);
      addWindow(-5, wy, -half, 'x', 3, 2);
      addWindow(5, wy, -half, 'x', 3, 2);
      addWindow(-4, wy, half, 'z', 3, 2);
      addWindow(4, wy, half, 'z', 3, 2);
      addWindow(-4, wy, -half, 'z', 3, 2);
      addWindow(4, wy, -half, 'z', 3, 2);
    } else {
      addWindow(0, wy, half, 'x', 3, 2);
      addWindow(0, wy, -half, 'x', 3, 2);
      addWindow(0, wy, half, 'z', 3, 2);
      addWindow(0, wy, -half, 'z', 3, 2);
    }

    // front door only on the ground storey
    if (ti === 0) {
      const dz = half;
      world.box(cx - 3, base, cz + dz, cx + 3, base + 5, cz + dz, C.redDark[(cx + dz) & 2]);
      world.box(cx - 2, base + 1, cz + dz, cx + 2, base + 4, cz + dz, C.wood[0]);
      for (let x = -2; x <= 2; x++) {
        world.set(cx + x, base + 3, cz + dz, C.goldDark[(x + 2) & 2], KIND_METAL);
        world.set(cx + x, base + 1, cz + dz, C.woodLight[(x + 2) & 2]);
      }
      world.set(cx, base + 1, cz + dz, C.gold[1], KIND_METAL);
      world.set(cx, base + 4, cz + dz, C.gold[2], KIND_METAL);
      world.box(cx - 1, base + 5, cz + dz, cx + 1, base + 5, cz + dz, C.gold[0], KIND_METAL);
      // door lanterns
      addLantern(cx - 4, base + 4, cz + dz + 1, 2, 2.2, false);
      addLantern(cx + 4, base + 4, cz + dz + 1, 3, 2.2, false);
    }

    // roof
    buildRoof(t.roof, half + 4, half, ti * 3 + 1);

    // hanging lanterns at the eave corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = cx + sx * (half + 2);
      const lz = cz + sz * (half + 2);
      addLantern(lx, t.roof - 1, lz, ti * 4 + (sx + 1) + (sz + 1), ti === 0 ? 3.0 : 2.2, ti === 0);
    }
  });

  /* ---- finial (sōrin) ---- */
  const topRoof = 48;
  const fx = cx, fz = cz;
  // pedestal
  world.box(fx - 2, topRoof, fz - 2, fx + 2, topRoof + 1, fz + 2, C.goldDark[1], KIND_METAL);
  world.box(fx - 1, topRoof + 1, fz - 1, fx + 1, topRoof + 2, fz + 1, C.gold[0], KIND_METAL);
  // mast
  for (let y = topRoof + 2; y <= topRoof + 14; y++) {
    world.set(fx, y, fz, C.gold[(y & 1) ? 1 : 2], KIND_METAL);
  }
  // nine rings of the sōrin
  for (let r = 0; r < 5; r++) {
    const y = topRoof + 4 + r * 2;
    world.disc(fx, y, fz, 2.3, 2.3, (x, yy, z) => C.gold[(r + x + z) & 3], { kind: KIND_METAL, jitter: 0 });
    world.disc(fx, y + 1, fz, 1.7, 1.7, C.goldDark[(r + 1) & 2], { kind: KIND_METAL, jitter: 0 });
  }
  // flame and jewel
  world.ellipsoid(fx, topRoof + 15, fz, 1.7, 2.0, 1.7, (x, y, z) => C.gold[(x + y + z) & 3], { kind: KIND_METAL, jitter: 0 });
  world.set(fx, topRoof + 17, fz, C.gold[1], KIND_METAL);
  world.set(fx, topRoof + 18, fz, C.gold[0], KIND_METAL);

  // warm light at the heart of the ground storey
  const doorLight = new THREE.PointLight(0xffb15a, 24, 32, 2);
  doorLight.position.set(cx, 10, cz + 11);
  doorLight.userData = { base: 24 };
  scene.add(doorLight);
  pointLights.push(doorLight);

  // a pair of stone lanterns flanking the steps
  addStoneLantern(-10, -1, 3, 0.9, false);
  addStoneLantern(10, -1, 3, 1.1, false);
}
/* ---------- garden props ---------- */
function addStoneLantern(x, z, seed, scale = 1, light = false) {
  const g = terrainHeight(x, z);
  const stone = C.stone[(seed + 1) & 3];
  const dark = C.stoneDark[seed & 2];
  // base
  world.box(x - 2, g + 1, z - 2, x + 2, g + 1, z + 2, stone);
  world.box(x - 1, g + 2, z - 1, x + 1, g + 2, z + 1, dark);
  // pedestal column
  world.box(x - 1, g + 3, z - 1, x + 1, g + 4, z + 1, stone);
  world.box(x, g + 3, z, x, g + 4, z, C.moss[(seed + x) & 3]);
  // light housing
  world.box(x - 1, g + 5, z - 1, x + 1, g + 5, z + 1, dark);
  for (const sx of [-1, 0, 1]) for (const sz of [-1, 0, 1]) {
    if (Math.abs(sx) === 1 && Math.abs(sz) === 1) {
      world.set(x + sx, g + 6, z + sz, stone);
      world.set(x + sx, g + 7, z + sz, stone);
    }
  }
  world.set(x, g + 6, z, C.glow[seed & 3], KIND_GLOW);
  world.set(x, g + 7, z, C.glow[(seed + 1) & 3], KIND_GLOW);
  // cap and finial
  world.box(x - 2, g + 8, z - 2, x + 2, g + 8, z + 2, dark);
  world.box(x - 1, g + 9, z - 1, x + 1, g + 9, z + 1, stone);
  world.set(x, g + 10, z, stone);
  world.set(x, g + 11, z, C.gold[seed & 3], KIND_METAL);

  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc87a, transparent: true, opacity: 0.72,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  sp.position.set(x, g + 6.7, z);
  sp.scale.setScalar(4.2 * scale);
  sp.userData = { seed, baseScale: 4.2 * scale, baseOpacity: 0.72 };
  scene.add(sp);
  glowSprites.push(sp);

  if (light) {
    const pl = new THREE.PointLight(0xffb45e, 20, 30, 2);
    pl.position.set(x, g + 7, z);
    pl.userData = { base: 20 };
    scene.add(pl);
    pointLights.push(pl);
  }
}

function addRock(cx, cz, rx, ry, rz, seed = 1, mossy = true) {
  const g = terrainHeight(cx, cz);
  const cy = g + ry * 0.55;
  world.ellipsoid(cx, cy, cz, rx, ry, rz, (x, y, z, d) => {
    const r = hash3(x + seed, y, z);
    if (r < 0.12) return C.stoneDark[(x + z) & 2];
    if (mossy && y > cy + ry * 0.15 && r < 0.58) return C.moss[(x + z + seed) & 3];
    return C.stone[(x + z + seed) & 3];
  }, { jitter: 0.22 });
  // a few pebbles at the foot
  for (let i = 0; i < 7; i++) {
    const a = hash3(i, seed, 3) * TAU;
    const rr = 1 + hash3(i, seed, 5) * Math.max(rx, rz);
    const px = Math.round(cx + Math.cos(a) * rr);
    const pz = Math.round(cz + Math.sin(a) * rr);
    world.setIfEmpty(px, terrainHeight(px, pz) + 1, pz, C.pebble[(i + seed) & 3]);
  }
}

function addBush(cx, cz, r, flowers, seed = 1) {
  const g = terrainHeight(cx, cz);
  const cy = g + r * 0.68;
  world.ellipsoid(cx, cy, cz, r, r * 0.72, r, (x, y, z, d) => {
    const h = hash3(x + seed, y, z);
    if (h < 0.20) return flowers[(x + y + z) % flowers.length];
    if (h < 0.30) return C.moss[(x + z) & 3];
    return C.grassDark[(x + y) & 2];
  }, { jitter: 0.16 });
  // flower crown
  for (let i = 0; i < Math.floor(r * 7); i++) {
    const a = hash3(i, seed, 1) * TAU;
    const rr = hash3(i, seed, 2) * r * 0.8;
    const px = Math.round(cx + Math.cos(a) * rr);
    const pz = Math.round(cz + Math.sin(a) * rr);
    const top = Math.round(cy + r * 0.72 * Math.sqrt(Math.max(0, 1 - (rr / r) ** 2)));
    world.setIfEmpty(px, top + 1, pz, flowers[(i + seed) % flowers.length]);
  }
}

function addFlowerPatch(cx, cz, r, flowers, seed = 1, tall = false) {
  const n = Math.floor(r * r * 5.5);
  for (let i = 0; i < n; i++) {
    const a = hash3(i, seed, 11) * TAU;
    const rr = Math.sqrt(hash3(i, seed, 12)) * r;
    const px = Math.round(cx + Math.cos(a) * rr);
    const pz = Math.round(cz + Math.sin(a) * rr);
    if (pathDistance(px, pz) < 2.2) continue;
    if (pondField(px, pz) > -0.2) continue;
    const g = terrainHeight(px, pz);
    if (world.has(px, g + 1, pz)) continue;
    const col = flowers[(i + seed) % flowers.length];
    world.set(px, g + 1, pz, C.grassDark[i & 2]);
    if (tall) {
      world.set(px, g + 2, pz, C.grassDark[(i + 1) & 2]);
      world.set(px, g + 3, pz, col);
    } else {
      world.set(px, g + 2, pz, col);
      if (hash3(i, seed, 14) < 0.18) world.set(px, g + 3, pz, C.daisyCenter[i & 1]);
    }
  }
}

function addBamboo(cx, cz, height, seed = 1) {
  const g = terrainHeight(cx, cz);
  for (let y = g + 1; y <= g + height; y++) {
    const node = ((y - g) % 4 === 0);
    world.set(cx, y, cz, node ? C.bambooNode[(seed + y) & 1] : C.bamboo[(seed + y) & 3]);
  }
  // little side branches and leaf clusters near the top
  for (let k = 0; k < 3; k++) {
    const y = g + height - 1 - k * 3;
    if (y <= g + 4) continue;
    const a = hash3(cx, k, seed) * TAU;
    const dx = Math.round(Math.cos(a) * (1 + k * 0.4));
    const dz = Math.round(Math.sin(a) * (1 + k * 0.4));
    world.set(cx + dx, y, cz + dz, C.bambooNode[(seed + k) & 1]);
    for (let j = 0; j < 4; j++) {
      const lx = cx + dx + Math.round(Math.cos(a + j) * 1.2);
      const lz = cz + dz + Math.round(Math.sin(a + j) * 1.2);
      const ly = y + (j % 2);
      world.setIfEmpty(lx, ly, lz, C.pine[(seed + j) & 4]);
      world.setIfEmpty(lx, ly + 1, lz, C.bamboo[(seed + j) & 3]);
    }
  }
}

function addFence(x0, z0, x1, z1, height = 3, color = C.bamboo) {
  const len = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
  for (let i = 0; i <= len; i++) {
    const t = len === 0 ? 0 : i / len;
    const x = Math.round(lerp(x0, x1, t));
    const z = Math.round(lerp(z0, z1, t));
    const g = terrainHeight(x, z);
    if (i % 2 === 0) world.set(x, g + 1, z, C.bambooNode[(x + z) & 1]);
    world.set(x, g + height, z, color[(x + z) & 3]);
    if (height > 2) world.set(x, g + height - 1, z, color[(x + z + 1) & 3]);
  }
}

function addBench(cx, cz, len, seed = 1) {
  const g = terrainHeight(cx, cz);
  for (let i = -Math.floor(len / 2); i <= Math.floor(len / 2); i++) {
    world.set(cx + i, g + 2, cz, C.woodLight[(i + seed) & 2]);
    world.set(cx + i, g + 3, cz - 1, C.woodLight[(i + seed) & 2]);
  }
  world.set(cx - Math.floor(len / 2), g + 1, cz, C.wood[seed & 2]);
  world.set(cx + Math.floor(len / 2), g + 1, cz, C.wood[seed & 2]);
  for (let i = -Math.floor(len / 2); i <= Math.floor(len / 2); i += 2) {
    world.set(cx + i, g + 3, cz - 1, C.wood[(i + seed) & 3]);
  }
}

function addPathLantern(cx, cz, seed = 1) {
  const g = terrainHeight(cx, cz);
  world.set(cx, g + 1, cz, C.wood[seed & 3]);
  world.set(cx, g + 2, cz, C.wood[(seed + 1) & 3]);
  world.set(cx, g + 3, cz, C.redDark[seed & 2]);
  world.set(cx, g + 4, cz, C.glow[seed & 3], KIND_GLOW);
  world.box(cx - 1, g + 5, cz - 1, cx + 1, g + 5, cz + 1, C.wood[0]);
  world.set(cx, g + 6, cz, C.goldDark[seed & 2], KIND_METAL);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffc06a, transparent: true, opacity: 0.58,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false
  }));
  sp.position.set(cx, g + 4.4, cz);
  sp.scale.setScalar(3.4);
  sp.userData = { seed, baseScale: 3.4, baseOpacity: 0.58 };
  scene.add(sp);
  glowSprites.push(sp);
}

/* ---------- bridge ---------- */
function buildBridge() {
  const zc = 14, x0 = -36, x1 = -5;
  const span = x1 - x0;
  for (let x = x0; x <= x1; x++) {
    const t = (x - x0) / span;
    const arch = Math.sin(Math.PI * t);
    const deckY = 4 + Math.round(3.2 * arch);
    for (let z = zc - 2; z <= zc + 2; z++) {
      const plank = ((x + 40) % 3 === 0) ? C.wood[0] : C.woodLight[(x + z) & 1];
      world.set(x, deckY, z, plank);
      world.set(x, deckY - 1, z, C.wood[(x + z) & 2]);
    }
    // deck edge beams
    world.set(x, deckY, zc - 2, C.wood[1]);
    world.set(x, deckY, zc + 2, C.wood[1]);
    // railing posts
    if ((x - x0) % 3 === 0 || x === x1) {
      for (const z of [zc - 2, zc + 2]) {
        world.set(x, deckY + 1, z, C.vermilion[(x + z) & 3]);
        world.set(x, deckY + 2, z, C.vermilion[(x + z + 1) & 3]);
        world.set(x, deckY + 3, z, C.gold[1], KIND_METAL);
      }
    }
    // top rail
    for (const z of [zc - 2, zc + 2]) {
      world.set(x, deckY + 2, z, C.red[(x + z) & 3]);
    }
    // support piles
    if ((x - x0) % 5 === 0) {
      for (const z of [zc - 1, zc + 1]) {
        for (let y = -1; y < deckY - 1; y++) {
          world.set(x, y, z, C.wood[(x + y) & 2]);
        }
      }
    }
  }
  // a pair of small stone lanterns at the bridgeheads
  addStoneLantern(-37, zc - 3, 4, 0.8, false);
  addStoneLantern(-4, zc + 3, 5, 0.8, false);
}

/* ---------- torii ---------- */
function buildTorii() {
  const tx = 17, tz = TORII.z;
  const g = GROUND_Y;
  for (const sx of [-1, 1]) {
    const px = tx + sx * 6;
    world.box(px - 1, g + 1, tz - 1, px + 1, g + 2, tz + 1, C.stoneDark[(sx + 2) & 2]);
    world.box(px, g + 2, tz, px + 1, g + 13, tz + 1, C.vermilion[(sx + 3) & 3]);
    // black base sleeve
    world.box(px, g + 2, tz, px + 1, g + 4, tz + 1, C.redDark[sx & 1]);
  }
  // lower tie beam
  world.box(tx - 8, g + 10, tz, tx + 8, g + 11, tz + 1, C.red[0]);
  world.box(tx - 8, g + 10, tz + 1, tx + 8, g + 11, tz + 1, C.vermilion[1]);
  // upper lintel
  world.box(tx - 9, g + 13, tz - 1, tx + 9, g + 14, tz + 2, C.redDark[1]);
  world.box(tx - 8, g + 14, tz - 1, tx + 8, g + 15, tz + 2, C.vermilion[0]);
  // upswept lintel ends
  for (const sx of [-1, 1]) {
    const ex = tx + sx * 10;
    world.set(ex, g + 14, tz, C.redDark[0]);
    world.set(ex, g + 15, tz, C.vermilion[2]);
    world.set(ex + sx, g + 15, tz, C.gold[1], KIND_METAL);
    world.set(ex + sx, g + 16, tz, C.gold[2], KIND_METAL);
  }
  // central plaque
  world.box(tx - 2, g + 11, tz + 1, tx + 2, g + 13, tz + 1, C.cream[0]);
  world.box(tx - 2, g + 11, tz + 2, tx + 2, g + 13, tz + 2, C.cream[0]);
  world.set(tx, g + 12, tz + 2, C.goldDark[1], KIND_METAL);
  world.set(tx - 1, g + 12, tz + 2, C.redDark[0]);
  world.set(tx + 1, g + 12, tz + 2, C.redDark[0]);
  // little stone foxes on plinths
  for (const sx of [-1, 1]) {
    const fx = tx + sx * 4;
    world.box(fx - 1, g + 1, tz + 2, fx + 1, g + 2, tz + 4, C.stoneDark[1]);
    world.box(fx, g + 3, tz + 3, fx, g + 4, tz + 3, C.stone[1]);
    world.set(fx, g + 5, tz + 3, C.stone[2]);
    world.set(fx, g + 5, tz + 4, C.stone[1]);
    world.set(fx - 1, g + 5, tz + 3, C.stone[1]);
    world.set(fx + 1, g + 5, tz + 3, C.stone[1]);
  }
}

/* ---------- tea house ---------- */
function buildTeaHouse() {
  const tx = TEA.x, tz = TEA.z;
  const g = GROUND_Y;
  // raised floor
  world.box(tx - 7, g + 1, tz - 10, tx + 7, g + 1, tz + 10, C.wood[1]);
  // floor joists visible at the front
  for (let x = tx - 7; x <= tx + 7; x += 2) {
    world.set(x, g, tz - 10, C.wood[0]);
  }
  // back and side walls
  world.box(tx - 7, g + 2, tz - 10, tx - 7, g + 7, tz + 10, C.plaster[0]);
  world.box(tx - 7, g + 2, tz - 10, tx + 7, g + 7, tz - 10, C.plaster[0]);
  world.box(tx - 7, g + 2, tz + 10, tx + 7, g + 7, tz + 10, C.plaster[0]);
  // timber frame
  for (let y = g + 2; y <= g + 7; y += 2) {
    world.box(tx - 7, y, tz - 10, tx + 7, y, tz - 10, C.wood[(y + 1) & 3]);
    world.box(tx - 7, y, tz + 10, tx + 7, y, tz + 10, C.wood[(y + 1) & 3]);
    world.box(tx - 7, y, tz - 10, tx - 7, y, tz + 10, C.wood[(y + 1) & 3]);
  }
  // front posts and open side
  for (const z of [tz - 10, tz - 4, tz + 2, tz + 8, tz + 10]) {
    world.box(tx + 7, g + 2, z, tx + 7, g + 8, z, C.vermilion[(z + 1) & 3]);
  }
  // low front rail
  for (let z = tz - 9; z <= tz + 9; z++) {
    world.set(tx + 7, g + 3, z, C.wood[(z + 1) & 2]);
  }
  // veranda over the pond
  world.box(tx + 8, g + 1, tz - 9, tx + 10, g + 1, tz + 9, C.woodLight[0]);
  for (let z = tz - 9; z <= tz + 9; z += 3) {
    world.set(tx + 10, g + 2, z, C.vermilion[(z + 1) & 3]);
    world.set(tx + 10, g + 3, z, C.red[(z + 2) & 3]);
  }
  for (let z = tz - 8; z <= tz + 8; z += 4) {
    for (let y = -1; y <= g; y++) world.set(tx + 10, y, z, C.wood[(y + z) & 2]);
  }
  // roof: a sweeping gable with deep eaves
  for (let x = tx - 9; x <= tx + 9; x++) {
    const yTop = g + 10 - Math.floor(Math.abs(x - tx) / 2);
    for (let z = tz - 12; z <= tz + 12; z++) {
      const edge = Math.abs(x - tx) === 9;
      let col = C.roof[(Math.floor((z + 100) / 2) + x) % C.roof.length];
      if (edge) col = C.roofEdge[(x + z) & 3];
      world.set(x, yTop, z, col);
      world.set(x, yTop + 1, z, col);
    }
  }
  // ridge beam and gold ends
  world.box(tx, g + 11, tz - 12, tx, g + 12, tz + 12, C.wood[0]);
  for (const z of [tz - 12, tz + 12]) {
    world.set(tx, g + 13, z, C.gold[1], KIND_METAL);
  }
  // gable triangles
  for (const z of [tz - 10, tz + 10]) {
    for (let i = 0; i < 5; i++) {
      const y = g + 8 + i;
      const half = 6 - i;
      world.box(tx - half, y, z, tx + half, y, z, C.plaster[(i + 1) & 3]);
      world.set(tx - half, y, z, C.wood[i & 2]);
      world.set(tx + half, y, z, C.wood[i & 2]);
    }
  }
  // roof upturn at the four corners
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = tx + sx * 9, z = tz + sz * 12;
    world.set(x + sx, g + 10, z, C.roofEdge[1]);
    world.set(x + sx, g + 11, z + sz, C.gold[2], KIND_METAL);
  }
  // shoji screen on the back wall
  for (let z = tz - 5; z <= tz + 5; z++) {
    for (let y = g + 3; y <= g + 6; y++) {
      const frame = z === tz - 5 || z === tz + 5 || y === g + 3 || y === g + 6;
      world.set(tx - 7, y, z, frame ? C.wood[(y + z) & 2] : C.glow[(y + z) & 3], frame ? KIND_MATTE : KIND_GLOW);
    }
  }
  // noren curtain across the open front
  for (let z = tz - 4; z <= tz + 4; z++) {
    const panel = Math.floor((z - (tz - 4)) / 3);
    const col = panel % 2 === 0 ? 0x33456b : 0x3d5078;
    for (let y = g + 5; y <= g + 7; y++) {
      world.set(tx + 7, y, z, col);
    }
  }
  world.box(tx + 7, g + 8, tz - 4, tx + 7, g + 8, tz + 4, C.wood[0]);
  // interior table and tea
  world.box(tx - 2, g + 2, tz - 2, tx + 1, g + 2, tz + 2, C.woodLight[1]);
  world.set(tx - 1, g + 3, tz, C.cream[0]);
  world.set(tx + 1, g + 3, tz + 1, C.cream[1]);
  world.set(tx - 1, g + 3, tz + 2, C.glow[1], KIND_GLOW);
  world.set(tx + 2, g + 2, tz - 3, C.azalea[0]);
  world.set(tx - 3, g + 2, tz + 3, C.azalea[1]);
  // hanging scroll
  world.box(tx - 7, g + 4, tz - 1, tx - 7, g + 6, tz + 1, C.cream[2]);
  world.set(tx - 7, g + 5, tz, C.wood[0]);
  // stone basin and bamboo ladle outside
  addRock(tx - 4, tz + 14, 2, 1, 2, 3, false);
  world.set(tx - 4, g + 1, tz + 14, C.stoneDark[0]);
  world.set(tx - 4, g + 2, tz + 14, C.waterPlant[1]);
  world.set(tx - 3, g + 2, tz + 14, C.bamboo[1]);
  // bamboo fence around the tea garden
  addFence(tx - 10, tz - 12, tx - 10, tz + 14, 3);
  addFence(tx - 10, tz + 14, tx + 2, tz + 14, 3);
  addFence(tx - 10, tz - 12, tx + 2, tz - 12, 3);
  // stepping stone path to the veranda
  for (let i = 0; i < 7; i++) {
    const x = tx + 14 - i * 2;
    const z = tz + Math.round(Math.sin(i * 0.7) * 1.5);
    world.set(x, terrainHeight(x, z), z, C.path[(i + 1) & 3]);
  }
  // tea garden lantern
  addStoneLantern(tx - 7, tz + 13, 6, 0.8, true);
}

/* ---------- zen garden ---------- */
function buildZenGarden() {
  const { x0, z0, x1, z1 } = ZEN;
  // low timber edging
  for (let x = x0; x <= x1; x++) {
    world.set(x, GROUND_Y + 1, z0, C.wood[1]);
    world.set(x, GROUND_Y + 1, z1, C.wood[1]);
  }
  for (let z = z0; z <= z1; z++) {
    world.set(x0, GROUND_Y + 1, z, C.wood[1]);
    world.set(x1, GROUND_Y + 1, z, C.wood[1]);
  }
  // three islands of rock
  addRock(31, -29, 4.5, 2.4, 3.6, 12, true);
  addRock(39, -24, 3.2, 1.8, 2.6, 13, true);
  addRock(35, -34, 2.6, 1.5, 2.2, 14, true);
  addRock(27, -22, 1.7, 1.0, 1.5, 15, true);
  // mossy islets at the feet
  for (let i = 0; i < 45; i++) {
    const a = hash3(i, 21, 2) * TAU;
    const rr = 2 + hash3(i, 21, 3) * 6;
    const x = Math.round(34 + Math.cos(a) * rr);
    const z = Math.round(-29 + Math.sin(a) * rr * 0.7);
    if (x < x0 + 1 || x > x1 - 1 || z < z0 + 1 || z > z1 - 1) continue;
    if (hash3(i, 22, 3) < 0.55) world.set(x, GROUND_Y, z, C.moss[i & 3]);
  }
  // miniature three-tier pagoda at the far corner
  const px = 41, pz = -33;
  world.box(px - 2, GROUND_Y, pz - 2, px + 2, GROUND_Y + 1, pz + 2, C.stoneDark[1]);
  world.box(px - 1, GROUND_Y + 2, pz - 1, px + 1, GROUND_Y + 4, pz + 1, C.plaster[0]);
  world.box(px - 2, GROUND_Y + 5, pz - 2, px + 2, GROUND_Y + 5, pz + 2, C.roof[1]);
  world.box(px - 1, GROUND_Y + 5, pz - 1, px + 1, GROUND_Y + 5, pz + 1, C.roof[2]);
  world.box(px, GROUND_Y + 6, pz, px, GROUND_Y + 8, pz, C.plaster[1]);
  world.box(px - 1, GROUND_Y + 9, pz - 1, px + 1, GROUND_Y + 9, pz + 1, C.roof[0]);
  world.set(px, GROUND_Y + 10, pz, C.gold[1], KIND_METAL);
  // viewing bench facing the raked gravel
  addBench(35, -18, 4, 2);
  addStoneLantern(27, -19, 7, 0.75, false);
  // a small maple at the corner
  addBush(45, -20, 2.4, [C.azalea[0], C.azalea[2], C.red[0]], 31);
}

/* ---------- pond edge, rocks and garden detail ---------- */
function buildPondEdge() {
  const shore = [
    [-38, 17], [-37, 9], [-34, 4], [-28, 2], [-21, 3], [-14, 5],
    [-9, 9], [-7, 14], [-8, 21], [-12, 26], [-19, 27], [-27, 26],
    [-33, 23], [-38, 20], [-30, 3], [-18, 24]
  ];
  shore.forEach(([x, z], i) => {
    addRock(x, z, 1.5 + hash3(i, 1, 2) * 2.2, 0.8 + hash3(i, 2, 3) * 1.1, 1.4 + hash3(i, 3, 4) * 2.0, i + 20, true);
  });
  // a large mossy island stone in the western lobe
  addRock(-30, 8, 2.6, 1.4, 2.2, 44, true);
  // reeds and iris at the waterline
  for (let i = 0; i < 70; i++) {
    const a = hash3(i, 31, 2) * TAU;
    const rr = 0.94 + hash3(i, 31, 3) * 0.14;
    const x = Math.round(-24 + Math.cos(a) * 13 * rr);
    const z = Math.round(14 + Math.sin(a) * 10 * rr);
    if (pondField(x, z) < -0.2) continue;
    const g = terrainHeight(x, z);
    if (g < 0) continue;
    const h = 2 + Math.floor(hash3(i, 32, 4) * 3);
    for (let j = 1; j <= h; j++) {
      world.set(x, g + j, z, j === h ? C.iris[(i + j) & 2] : C.waterPlant[(i + j) & 2]);
    }
  }
  // little wooden boat moored near the bridge
  const bx = -15, bz = 22;
  for (let i = -3; i <= 3; i++) {
    const w = i === -3 || i === 3 ? 1 : 2;
    for (let z = -w; z <= w; z++) {
      world.set(bx + i, 3, bz + z, C.wood[(i + z) & 2]);
    }
    if (i > -3 && i < 3) {
      world.set(bx + i, 4, bz - 2, C.woodLight[0]);
      world.set(bx + i, 4, bz + 2, C.woodLight[0]);
    }
  }
  world.set(bx - 2, 4, bz, C.woodLight[1]);
  world.set(bx + 2, 4, bz, C.wood[0]);
  world.set(bx + 4, 3, bz + 1, C.woodLight[1]);
  world.set(bx + 5, 3, bz + 2, C.woodLight[1]);
  // stepping stones near the shore
  for (let i = 0; i < 10; i++) {
    const x = -40 + i * 3;
    const z = 31 - Math.floor(Math.sin(i * 0.6) * 2);
    world.set(x, GROUND_Y, z, C.path[(i + 2) & 3]);
  }
}

function buildGarden() {
  buildBridge();
  buildTorii();
  buildTeaHouse();
  buildZenGarden();
  buildPondEdge();

  // stone lanterns along the approach
  addStoneLantern(-4, 5, 8, 0.9, false);
  addStoneLantern(9, 31, 9, 1.0, true);
  addStoneLantern(-2, 27, 10, 0.9, false);
  addStoneLantern(24, 17, 11, 0.9, false);
  addStoneLantern(29, -10, 12, 0.85, true);
  addStoneLantern(-46, 26, 13, 0.9, false);
  addStoneLantern(-34, 30, 14, 0.85, false);
  addStoneLantern(22, -2, 15, 0.8, false);

  // paper lanterns along the main path
  addPathLantern(12, 20, 2);
  addPathLantern(3, 7, 4);
  addPathLantern(17, 40, 6);
  addPathLantern(27, -2, 8);

  // flowering shrubs
  addBush(21, -1, 2.6, [C.azalea[0], C.azalea[2], C.azalea[3]], 2);
  addBush(-14, -1, 2.3, [C.azalea[1], C.azalea[2]], 4);
  addBush(13, -12, 2.1, [C.hydrangea[0], C.hydrangea[2], C.hydrangea[4]], 6);
  addBush(-31, 31, 2.5, [C.azalea[0], C.azalea[1]], 8);
  addBush(40, 11, 2.4, [C.hydrangea[1], C.hydrangea[3]], 10);
  addBush(-53, 4, 2.2, [C.azalea[3], C.azalea[2]], 12);
  addBush(34, 2, 2.0, [C.hydrangea[0], C.hydrangea[1]], 14);
  addBush(48, 2, 2.2, [C.azalea[0], C.azalea[1]], 16);
  addBush(-24, -3, 2.0, [C.hydrangea[2], C.hydrangea[4]], 18);
  addBush(7, -35, 2.3, [C.azalea[0], C.azalea[3]], 20);

  // flower beds
  addFlowerPatch(7, 38, 4.5, C.tulip, 1, true);
  addFlowerPatch(25, 32, 3.8, C.tulip, 2, true);
  addFlowerPatch(-8, 34, 3.2, C.daisy, 3, false);
  addFlowerPatch(-48, 34, 4.0, C.iris, 4, true);
  addFlowerPatch(33, 6, 3.4, C.daisy, 5, false);
  addFlowerPatch(-12, -2, 2.8, C.tulip, 6, true);
  addFlowerPatch(43, -8, 3.0, C.iris, 7, true);
  addFlowerPatch(-2, 45, 3.2, C.daisy, 8, false);
  addFlowerPatch(-55, 16, 3.2, C.hydrangea, 9, false);
  addFlowerPatch(20, -38, 3.6, C.daisy, 10, false);

  // bamboo grove on the east side
  const rnd = mulberry32(4242);
  for (let i = 0; i < 22; i++) {
    const x = Math.round(47 + rnd() * 8);
    const z = Math.round(-16 + rnd() * 14);
    if (pathDistance(x, z) < 2.2) continue;
    addBamboo(x, z, 14 + Math.floor(rnd() * 9), i + 3);
  }
  addFence(45, -17, 45, 0, 4, C.bamboo);
  addFence(45, 0, 56, 0, 4, C.bamboo);

  // small shrine lanterns and a bench by the pond
  addBench(-12, 30, 4, 5);
  addBench(-45, 34, 4, 6);
  addStoneLantern(2, 33, 16, 0.7, false);

  // rocks near the pagoda court
  addRock(-16, -2, 2.2, 1.1, 1.8, 51, true);
  addRock(16, -3, 2.0, 1.0, 1.7, 52, true);
  addRock(-18, 12, 1.6, 0.9, 1.4, 53, true);
}
/* ---------- trees ---------- */
function blossomColor(x, y, z, cy, seed) {
  const r = hash3(x + seed, y, z);
  if (y < cy - 1.2) return C.sakuraDeep[(x + z) & 3];
  if (r < 0.10) return C.sakuraWhite[(x + y + z) & 2];
  if (r < 0.26) return C.sakuraDeep[(x + z) & 3];
  if (r < 0.44) return C.sakura[(x + y) & 5];
  if (r < 0.56) return C.sakuraWhite[(x + z) & 1];
  return C.sakura[(x * 3 + y + z) & 5];
}

function addSakura(t) {
  const g = t.ground;
  const rnd = mulberry32(t.seed);
  const h = t.height;
  const leanX = t.lean[0], leanZ = t.lean[1];
  const topY = g + h;
  const size = t.size;

  // roots
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + rnd() * 0.5;
    const len = 2 + rnd() * 2.5;
    world.line(t.x, g + 1, t.z, t.x + Math.cos(a) * len, g, t.z + Math.sin(a) * len,
      t => 0.8 - t * 0.5, C.trunk[(i + t.seed) & 3]);
  }
  // trunk, curving toward the lean
  const p0 = [t.x, g + 1, t.z];
  const p1 = [t.x + leanX * 0.12, g + h * 0.34, t.z + leanZ * 0.12];
  const p2 = [t.x + leanX * 0.55, g + h * 0.66, t.z + leanZ * 0.55];
  const p3 = [t.x + leanX * 0.9, topY - 1, t.z + leanZ * 0.9];
  world.line(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], tt => 1.9 - tt * 0.5, C.trunk[(t.seed + 1) & 3]);
  world.line(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], tt => 1.4 - tt * 0.4, C.trunk[(t.seed + 2) & 3]);
  world.line(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], tt => 1.0 - tt * 0.4, C.trunk[(t.seed + 3) & 3]);

  // major limbs
  const limbs = [];
  const limbCount = 6;
  for (let i = 0; i < limbCount; i++) {
    const f = 0.38 + i * 0.09;
    const bx = lerp(p0[0], p3[0], f);
    const by = lerp(p0[1], p3[1], f);
    const bz = lerp(p0[2], p3[2], f);
    const a = (i / limbCount) * TAU + rnd() * 0.6;
    const len = (4.5 + rnd() * 3.8) * size;
    const ex = bx + Math.cos(a) * len;
    const ez = bz + Math.sin(a) * len;
    const ey = by + 1.5 + rnd() * 3.5;
    world.line(bx, by, bz, ex, ey, ez, tt => 0.8 - tt * 0.45, C.trunk[(t.seed + i) & 3]);
    limbs.push([ex, ey, ez, len]);
  }

  // crown clusters
  const cy = topY - 1.5;
  const clusters = [[t.x + leanX * 0.9, cy, t.z + leanZ * 0.9, 6.2 * size]];
  for (const [ex, ey, ez, len] of limbs) {
    clusters.push([ex, ey + 1.0, ez, (3.4 + len * 0.20) * size]);
  }
  for (let i = 0; i < 7; i++) {
    const a = rnd() * TAU;
    const rr = (2.5 + rnd() * 4.0) * size;
    clusters.push([
      t.x + leanX * 0.9 + Math.cos(a) * rr,
      cy - 1 + rnd() * 4,
      t.z + leanZ * 0.9 + Math.sin(a) * rr,
      (2.6 + rnd() * 2.2) * size
    ]);
  }
  clusters.forEach(([cx, cyy, cz, r], idx) => {
    world.ellipsoid(cx, cyy, cz, r, r * 0.58, r,
      (x, y, z, d) => blossomColor(x, y, z, cyy, t.seed + idx), { jitter: 0.16 });
  });

  // airy trailing sprays
  for (let i = 0; i < 14; i++) {
    const a = rnd() * TAU;
    const rr = (4 + rnd() * 4) * size;
    const sx = t.x + leanX * 0.9 + Math.cos(a) * rr;
    const sz = t.z + leanZ * 0.9 + Math.sin(a) * rr;
    const sy = cy - 1 + rnd() * 2;
    const len = 2 + Math.floor(rnd() * 4);
    for (let j = 0; j < len; j++) {
      const px = Math.round(sx + Math.cos(a) * j * 0.8);
      const pz = Math.round(sz + Math.sin(a) * j * 0.8);
      world.setIfEmpty(px, Math.round(sy - j * 0.7), pz, blossomColor(px, sy - j, pz, cy, t.seed));
    }
  }

  if (t.weep) {
    // long cascading blossom strands
    for (let i = 0; i < 34; i++) {
      const a = rnd() * TAU;
      const rr = (4 + rnd() * 5) * size;
      const sx = t.x + leanX * 0.9 + Math.cos(a) * rr;
      const sz = t.z + leanZ * 0.9 + Math.sin(a) * rr;
      const sy = cy - 2 + rnd() * 3;
      const len = 5 + Math.floor(rnd() * 8);
      for (let j = 0; j < len; j++) {
        if (hash3(i, j, t.seed) < 0.20) continue;
        const px = Math.round(sx + Math.cos(a) * j * 0.30);
        const pz = Math.round(sz + Math.sin(a) * j * 0.30);
        world.set(px, Math.round(sy - j), pz,
          j > len - 3 ? C.sakuraWhite[(i + j) & 1] : C.sakura[(i + j) & 5]);
      }
    }
  }
}

function addPine(t) {
  const g = t.ground;
  const rnd = mulberry32(t.seed);
  const h = t.height;
  const leanX = (rnd() - 0.5) * 5;
  const leanZ = (rnd() - 0.5) * 4;
  // trunk
  const p0 = [t.x, g + 1, t.z];
  const p1 = [t.x + leanX * 0.4, g + h * 0.45, t.z + leanZ * 0.4];
  const p2 = [t.x + leanX * 0.8, g + h * 0.78, t.z + leanZ * 0.8];
  const p3 = [t.x + leanX, g + h, t.z + leanZ];
  world.line(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], tt => 1.6 - tt * 0.4, C.pineTrunk[(t.seed + 1) & 2]);
  world.line(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], tt => 1.1 - tt * 0.3, C.pineTrunk[(t.seed + 2) & 2]);
  world.line(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], tt => 0.8 - tt * 0.3, C.pineTrunk[t.seed & 2]);

  // branch pads
  const pads = 6;
  for (let i = 0; i < pads; i++) {
    const f = 0.32 + i * 0.11;
    const bx = lerp(p0[0], p3[0], f);
    const by = lerp(p0[1], p3[1], f);
    const bz = lerp(p0[2], p3[2], f);
    const a = (i / pads) * TAU + rnd() * 0.7;
    const len = (3.5 + rnd() * 3.5);
    const ex = bx + Math.cos(a) * len;
    const ez = bz + Math.sin(a) * len;
    world.line(bx, by, bz, ex, by + 0.8, ez, tt => 0.6 - tt * 0.25, C.pineTrunk[(i + 1) & 2]);
    const r = 2.8 + rnd() * 2.2;
    world.ellipsoid(ex, by + 1.2, ez, r, 1.1 + rnd() * 0.5, r,
      (x, y, z) => {
        const hh = hash3(x, y, z);
        if (hh < 0.12) return C.pineTrunk[(x + z) & 2];
        if (hh < 0.30) return C.pineLight[(x + y) & 1];
        return C.pine[(x * 2 + y + z) & 4];
      }, { jitter: 0.18 });
  }
  // crown pad
  world.ellipsoid(p3[0], p3[1] + 1.0, p3[2], 4.2, 1.7, 4.2,
    (x, y, z) => C.pine[(x + y + z) & 4], { jitter: 0.2 });
  world.ellipsoid(p3[0] + 1.5, p3[1] + 2.4, p3[2] - 1, 2.4, 1.2, 2.4,
    (x, y, z) => C.pineLight[(x + z) & 1], { jitter: 0.25 });
}

function addMaple(cx, cz, h, seed) {
  const g = terrainHeight(cx, cz);
  const rnd = mulberry32(seed);
  const leanX = (rnd() - 0.5) * 4;
  const leanZ = (rnd() - 0.5) * 3;
  const top = [cx + leanX, g + h, cz + leanZ];
  world.line(cx, g + 1, cz, cx + leanX * 0.4, g + h * 0.5, cz + leanZ * 0.4, tt => 1.2 - tt * 0.4, C.trunk[0]);
  world.line(cx + leanX * 0.4, g + h * 0.5, cz + leanZ * 0.4, top[0], top[1], top[2], tt => 0.8 - tt * 0.3, C.trunk[1]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + rnd();
    const bx = cx + leanX * 0.7 + Math.cos(a) * (2 + rnd() * 2);
    const bz = cz + leanZ * 0.7 + Math.sin(a) * (2 + rnd() * 2);
    const by = g + h * (0.55 + rnd() * 0.25);
    world.line(cx + leanX * 0.6, g + h * 0.6, cz + leanZ * 0.6, bx, by, bz, 0.6, C.trunk[2]);
    const r = 2.6 + rnd() * 2.2;
    world.ellipsoid(bx, by + 1, bz, r, r * 0.55, r, (x, y, z) => {
      const hh = hash3(x, y, z);
      if (hh < 0.20) return 0xc94a32;
      if (hh < 0.40) return 0xe2703a;
      if (hh < 0.55) return 0xb83b2e;
      if (hh < 0.68) return 0xf0a13d;
      return 0xd85a34;
    }, { jitter: 0.24 });
  }
  world.ellipsoid(top[0], top[1] + 1, top[2], 4.0, 2.4, 4.0, (x, y, z) => {
    const hh = hash3(x, y, z);
    if (hh < 0.18) return 0xe2703a;
    if (hh < 0.34) return 0xc94a32;
    if (hh < 0.48) return 0xf0a13d;
    return 0xb83b2e;
  }, { jitter: 0.22 });
}

function addForestTree(cx, cz, h, seed, palette) {
  const g = terrainHeight(cx, cz);
  const rnd = mulberry32(seed);
  const lean = (rnd() - 0.5) * 2;
  world.line(cx, g + 1, cz, cx + lean, g + h * 0.55, cz + lean * 0.6, tt => 1.0 - tt * 0.4, C.trunk[seed & 3]);
  world.line(cx + lean, g + h * 0.55, cz + lean * 0.6, cx + lean * 1.5, g + h, cz + lean, 0.6, C.trunk[(seed + 1) & 3]);
  const r = 4 + rnd() * 3;
  world.ellipsoid(cx + lean * 1.4, g + h * 0.8, cz + lean, r, r * 0.8, r,
    (x, y, z) => palette[(x + y + z + seed) % palette.length], { jitter: 0.20 });
  world.ellipsoid(cx + lean * 1.4 + r * 0.4, g + h * 0.9, cz + lean - r * 0.3, r * 0.6, r * 0.55, r * 0.6,
    (x, y, z) => palette[(x + z + seed + 2) % palette.length], { jitter: 0.25 });
}

function buildTrees() {
  for (const t of SAKURA) addSakura(t);
  for (const t of PINES) addPine(t);

  // maples for autumn colour
  addMaple(-55, 7, 15, 61);
  addMaple(51, 9, 14, 62);

  // perimeter woodland — dense in the back and at the sides
  const rnd = mulberry32(777);
  const forestPalettes = [
    [0x2f6649, 0x397555, 0x25573e, 0x43805e],
    [0x3b6e4c, 0x477d57, 0x2e5e40, 0x548a62],
    [0x4b7048, 0x567c50, 0x3e623c, 0x62885a],
    [0x2b5a4b, 0x356a58, 0x234c40, 0x3f7862]
  ];
  let count = 0;
  while (count < 46) {
    const a = rnd() * TAU;
    const rr = 61 + rnd() * 11;
    const x = Math.round(Math.cos(a) * rr);
    const z = Math.round(Math.sin(a) * rr);
    // keep the front view open
    if (z > 30 && Math.abs(x) < 50) continue;
    if (Math.abs(x) > 72 || Math.abs(z) > 72) continue;
    if (pondField(x, z) > -0.4) continue;
    if (pathDistance(x, z) < 3) continue;
    if (Math.hypot(x - TEA.x, z - TEA.z) < 14) continue;
    if (Math.hypot(x - PAGODA.x, z - PAGODA.z) < 26) continue;
    addForestTree(x, z, 16 + Math.floor(rnd() * 15), 100 + count, forestPalettes[count % forestPalettes.length]);
    count++;
  }

  // a few tall cedars behind the pagoda to frame the roof
  for (let i = 0; i < 7; i++) {
    const x = -34 + i * 11;
    const z = -55 - (i % 3) * 3;
    addForestTree(x, z, 28 + (i % 4) * 3, 300 + i, forestPalettes[i % 4]);
  }

  // shrubs tucked around tree roots
  addBush(20, 3, 2.0, [C.hydrangea[0], C.hydrangea[4]], 41);
  addBush(-40, 34, 2.4, [C.azalea[0], C.azalea[1]], 42);
  addBush(41, -2, 2.2, [C.azalea[2], C.azalea[3]], 43);
  addBush(-50, 1, 2.0, [C.hydrangea[1], C.hydrangea[2]], 44);
}
function buildWater() {
  const cx = -22, cz = 14;
  const geo = new THREE.PlaneGeometry(46, 36, 150, 118);
  waterUniforms = {
    uTime:    { value: 0 },
    uDeep:    { value: dayPalette.waterDeep.clone() },
    uShallow: { value: dayPalette.waterShallow.clone() },
    uSky:     { value: dayPalette.waterSky.clone() },
    uSunDir:  { value: skyUniforms.uSunDir.value.clone() },
    uSunColor:{ value: new THREE.Color(0xffd9a0) },
    uPond:    { value: POND_ELLIPSES.map(e => new THREE.Vector4(e.x, e.z, e.rx, e.rz)) },
    fogColor: { value: scene.fog.color },
    fogNear:  { value: scene.fog.near },
    fogFar:   { value: scene.fog.far }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      #include <fog_pars_vertex>
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorld = worldPosition.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vec4 mvPosition = viewMatrix * worldPosition;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      uniform float uTime;
      uniform vec3 uDeep, uShallow, uSky, uSunDir, uSunColor;
      uniform vec4 uPond[3];
      #include <fog_pars_fragment>

      float pondMask(vec2 p) {
        float m = -1.0;
        for (int i = 0; i < 3; i++) {
          vec4 e = uPond[i];
          vec2 d = (p - e.xy) / e.zw;
          m = max(m, 1.0 - dot(d, d));
        }
        return m;
      }

      void main() {
        float m = pondMask(vWorld.xz);
        if (m < 0.0) discard;

        vec2 p = vWorld.xz;
        float t = uTime;
        float w1 = sin(p.x * 0.62 + t * 0.85) * 0.5 + sin(p.y * 0.81 - t * 0.63) * 0.5;
        float w2 = sin((p.x + p.y) * 1.13 + t * 1.27) * 0.42 + sin((p.x - p.y) * 0.73 - t * 0.9) * 0.32;
        vec3 ripple = normalize(vec3(w1 * 0.075, 1.0, w2 * 0.075));

        vec3 V = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(V, ripple), 0.0), 2.6);

        float depth = smoothstep(0.0, 0.62, m);
        vec3 base = mix(uShallow, uDeep, depth);
        vec3 col = mix(base, uSky, fres * 0.72);

        // sun / moon glitter path
        vec3 R = reflect(-normalize(uSunDir), ripple);
        float spec = pow(max(dot(R, V), 0.0), 110.0);
        col += uSunColor * spec * 1.5;

        // soft caustic shimmer in the shallows
        float caust = sin(p.x * 1.4 + t * 0.8) * sin(p.y * 1.9 - t * 0.55)
                    + sin(p.x * 2.3 - t * 1.1) * 0.5;
        col += vec3(0.08, 0.12, 0.10) * max(caust, 0.0) * depth;

        // pale foam where the water meets the stones
        float foam = smoothstep(0.10, 0.0, m);
        float foamNoise = 0.55 + 0.45 * sin(p.x * 5.0 + p.y * 4.0 + t * 1.2);
        col = mix(col, vec3(0.80, 0.87, 0.83), foam * 0.45 * foamNoise);

        float alpha = mix(0.58, 0.93, depth) * smoothstep(0.0, 0.025, m);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`
  });
  waterMesh = new THREE.Mesh(geo, mat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(cx, WATER_Y, cz);
  waterMesh.renderOrder = 2;
  scene.add(waterMesh);

  // lily pads — flat discs that sit exactly on the surface
  const padGeo = new THREE.CircleGeometry(1.15, 9, 0.22, Math.PI * 2 - 0.44);
  const padMats = [
    new THREE.MeshStandardMaterial({ color: 0x4e8c54, roughness: 0.8, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x5c9c60, roughness: 0.8, side: THREE.DoubleSide }),
    new THREE.MeshStandardMaterial({ color: 0x3f7b47, roughness: 0.8, side: THREE.DoubleSide })
  ];
  const rnd = mulberry32(2024);
  for (let i = 0; i < 26; i++) {
    const x = -37 + rnd() * 27;
    const z = 4 + rnd() * 20;
    if (pondField(x, z) < 0.12) continue;
    const pad = new THREE.Mesh(padGeo, padMats[i % 3]);
    pad.rotation.x = -Math.PI / 2;
    pad.rotation.z = rnd() * TAU;
    pad.position.set(x, WATER_Y + 0.035, z);
    pad.scale.setScalar(0.55 + rnd() * 0.8);
    scene.add(pad);
  }
  // a few lotus blossoms
  const lotusSpots = [[-18, 10], [-29, 17], [-24, 21], [-33, 13]];
  for (const [x, z] of lotusSpots) {
    if (pondField(x, z) < 0.15) continue;
    // outer petals
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const px = Math.round(x + Math.cos(a) * 1.4);
      const pz = Math.round(z + Math.sin(a) * 1.4);
      world.set(px, 3, pz, C.lotus[(i + 1) & 3]);
      world.set(px, 4, pz, C.lotus[i & 1]);
    }
    world.set(Math.round(x), 4, Math.round(z), C.lotus[3]);
    world.set(Math.round(x), 5, Math.round(z), C.gold[1], KIND_METAL);
    // pad beneath
    world.set(Math.round(x), 2, Math.round(z), C.lily[1]);
  }
  // submerged plants and bright stones on the pond bed
  for (let i = 0; i < 80; i++) {
    const x = Math.round(-37 + rnd() * 30);
    const z = Math.round(3 + rnd() * 22);
    if (pondField(x, z) < 0.16) continue;
    const h = 1 + Math.floor(rnd() * 2);
    for (let j = 0; j < h; j++) {
      world.set(x, j, z, C.waterPlant[(i + j) & 2]);
    }
    if (rnd() < 0.3) world.set(x, 1, z, C.pebble[i & 3]);
  }
  // a few floating petals
  for (let i = 0; i < 30; i++) {
    const x = Math.round(-37 + rnd() * 28);
    const z = Math.round(4 + rnd() * 20);
    if (pondField(x, z) < 0.1) continue;
    world.set(x, 3, z, C.sakura[i & 5]);
  }
}
/* ---------- living things ---------- */
let fireflyMat = null, fireflyGeo = null;
let dragonflies = [], clouds = [];

function makeKoi(color, patchColor, scale, seed) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, flatShading: true });
  const patchMat = new THREE.MeshStandardMaterial({ color: patchColor, roughness: 0.55, metalness: 0.05, flatShading: true });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xf6e6d8, roughness: 0.7, transparent: true, opacity: 0.85, side: THREE.DoubleSide, flatShading: true });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x171717, roughness: 0.25 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 0.85), bodyMat);
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.62, 0.72), bodyMat);
  head.position.x = 1.22;
  group.add(head);
  const patch1 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.30, 0.88), patchMat);
  patch1.position.set(-0.3, 0.30, 0);
  group.add(patch1);
  const patch2 = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.25, 0.6), patchMat);
  patch2.position.set(0.8, 0.28, 0.1);
  group.add(patch2);
  // tail
  const tail = new THREE.Group();
  tail.position.x = -1.2;
  const tailMesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.65), finMat);
  tailMesh.position.x = -0.35;
  tail.add(tailMesh);
  group.add(tail);
  // side fins
  for (const sz of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.55), finMat);
    fin.position.set(0.55, -0.2, sz * 0.55);
    fin.rotation.z = sz * 0.25;
    group.add(fin);
  }
  // dorsal fin
  const dorsal = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.4, 0.06), finMat);
  dorsal.position.set(-0.2, 0.48, 0);
  group.add(dorsal);
  // eyes
  for (const sz of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.12), eyeMat);
    eye.position.set(1.4, 0.08, sz * 0.36);
    group.add(eye);
  }
  group.scale.setScalar(scale);
  group.userData = { tail, seed, bodyMat };
  return group;
}

function buildLife() {
  const koiDefs = [
    { cx: -24, cz: 14, rx: 8.2, rz: 6.0, y: 1.25, speed: 0.15, dir: 1,  phase: 0.2,  color: 0xf4efe4, patch: 0xe66a2c, scale: 0.95 },
    { cx: -24, cz: 14, rx: 6.4, rz: 4.8, y: 1.65, speed: 0.21, dir: -1, phase: 2.4,  color: 0xe8702c, patch: 0xffd9a2, scale: 0.85 },
    { cx: -24, cz: 14, rx: 9.0, rz: 6.4, y: 0.95, speed: 0.12, dir: 1,  phase: 4.1,  color: 0xf5f0e6, patch: 0x252525, scale: 1.05 },
    { cx: -29, cz: 7,  rx: 3.2, rz: 2.6, y: 1.2,  speed: 0.23, dir: -1, phase: 1.2,  color: 0xd9a43a, patch: 0xf7e3a0, scale: 0.8 },
    { cx: -13, cz: 19, rx: 3.6, rz: 2.8, y: 1.35, speed: 0.19, dir: 1,  phase: 3.0,  color: 0xf4efe4, patch: 0xd94a2a, scale: 0.9 },
    { cx: -24, cz: 14, rx: 7.4, rz: 5.2, y: 1.8,  speed: 0.17, dir: -1, phase: 5.2,  color: 0x2e2a27, patch: 0xd97a2a, scale: 0.88 },
    { cx: -24, cz: 14, rx: 5.2, rz: 4.2, y: 1.1,  speed: 0.26, dir: 1,  phase: 0.9,  color: 0xf0b64a, patch: 0xf9e7b8, scale: 0.75 },
    { cx: -33, cz: 12, rx: 2.4, rz: 2.0, y: 1.45, speed: 0.2,  dir: -1, phase: 2.0,  color: 0xf4efe4, patch: 0xe8702c, scale: 0.82 }
  ];
  koiDefs.forEach((d, i) => {
    const fish = makeKoi(d.color, d.patch, d.scale, i);
    scene.add(fish);
    koiFish.push({ ...d, mesh: fish, angle: d.phase });
  });

  // falling cherry petals
  const count = 520;
  const pGeo = new THREE.BoxGeometry(0.36, 0.06, 0.22);
  const pMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.75, metalness: 0.0,
    side: THREE.DoubleSide, flatShading: true
  });
  petals = new THREE.InstancedMesh(pGeo, pMat, count);
  petals.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  petals.castShadow = false;
  petals.frustumCulled = false;
  const canopyCenters = [
    [24, 27, 8], [-43, 24, 30], [38, 23, -6], [-47, 25, -6], [20, 20, 6]
  ];
  const rnd = mulberry32(9090);
  const pink = [0xffc4d8, 0xffb0c8, 0xffdbe6, 0xf7a6bf, 0xffe6ef];
  for (let i = 0; i < count; i++) {
    const c = canopyCenters[i % canopyCenters.length];
    const data = {
      x: c[0] + (rnd() - 0.5) * 14,
      y: c[1] + (rnd() - 0.5) * 10,
      z: c[2] + (rnd() - 0.5) * 14,
      speed: 0.7 + rnd() * 1.2,
      phase: rnd() * TAU,
      sway: 0.4 + rnd() * 0.9,
      rx: rnd() * TAU,
      ry: rnd() * TAU,
      rz: rnd() * TAU,
      spin: (rnd() - 0.5) * 3,
      scale: 0.7 + rnd() * 0.9,
      home: c
    };
    petalData.push(data);
    petals.setColorAt(i, new THREE.Color(pink[i % pink.length]));
  }
  petals.instanceColor.needsUpdate = true;
  scene.add(petals);

  // fireflies
  const fCount = 150;
  fireflyGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(fCount * 3);
  const phase = new Float32Array(fCount);
  const size = new Float32Array(fCount);
  const col = new Float32Array(fCount * 3);
  const frnd = mulberry32(31337);
  const spots = [
    [-25, 15, 6], [-10, 25, 5], [-38, 22, 5], [-45, 18, 5],
    [20, 10, 6], [38, -4, 6], [30, -28, 4], [-52, 10, 4], [10, 35, 5]
  ];
  for (let i = 0; i < fCount; i++) {
    const sp = spots[i % spots.length];
    pos[i * 3]     = sp[0] + (frnd() - 0.5) * sp[2] * 2.2;
    pos[i * 3 + 1] = GROUND_Y + 1.5 + frnd() * 7.5;
    pos[i * 3 + 2] = sp[1] + (frnd() - 0.5) * sp[2] * 2.2;
    phase[i] = frnd() * TAU;
    size[i] = 1.2 + frnd() * 2.4;
    const warm = frnd() < 0.7;
    col[i * 3]     = warm ? 1.0 : 0.62;
    col[i * 3 + 1] = warm ? 0.72 + frnd() * 0.2 : 1.0;
    col[i * 3 + 2] = warm ? 0.32 : 0.55;
  }
  fireflyGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  fireflyGeo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  fireflyGeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  fireflyGeo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  fireflyMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: `
      attribute float aPhase;
      attribute float aSize;
      attribute vec3 aColor;
      varying vec3 vColor;
      varying float vPhase;
      uniform float uTime;
      void main() {
        vec3 p = position + vec3(
          sin(uTime * 0.55 + aPhase) * 1.1,
          cos(uTime * 0.47 + aPhase * 1.7) * 0.6,
          cos(uTime * 0.39 + aPhase * 1.3) * 1.1
        );
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = aSize * (220.0 / max(1.0, -mv.z));
        vColor = aColor;
        vPhase = aPhase;
      }`,
    fragmentShader: `
      varying vec3 vColor;
      varying float vPhase;
      uniform float uTime;
      uniform float uOpacity;
      void main() {
        vec2 d = gl_PointCoord - 0.5;
        float r = length(d);
        float core = smoothstep(0.5, 0.0, r);
        float tw = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * 2.1 + vPhase * 3.0));
        gl_FragColor = vec4(vColor * 1.8, core * tw * uOpacity);
      }`
  });
  fireflies = new THREE.Points(fireflyGeo, fireflyMat);
  fireflies.frustumCulled = false;
  scene.add(fireflies);

  // dragonflies
  const dColors = [0x4aa6a0, 0x5d8fc9, 0x7ab06a, 0x4a8f86];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.0, 0.12, 0.16),
      new THREE.MeshStandardMaterial({ color: dColors[i % 4], roughness: 0.35, metalness: 0.35, flatShading: true })
    );
    g.add(body);
    const wingMat = new THREE.MeshBasicMaterial({
      color: 0xcfe6ec, transparent: true, opacity: 0.32,
      side: THREE.DoubleSide, depthWrite: false
    });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.36), wingMat);
      wing.position.set(sx * 0.35, 0.06, sz * 0.35);
      wing.rotation.x = -Math.PI / 2;
      wing.rotation.z = sz * 0.25;
      g.add(wing);
      g.userData['wing' + sx + sz] = wing;
    }
    const rndD = mulberry32(700 + i);
    g.userData = {
      ...g.userData,
      cx: -24 + (rndD() - 0.5) * 16,
      cz: 14 + (rndD() - 0.5) * 10,
      rx: 2 + rndD() * 5,
      rz: 1.5 + rndD() * 4,
      y: WATER_Y + 0.9 + rndD() * 2.0,
      speed: 0.3 + rndD() * 0.5,
      phase: rndD() * TAU,
      dir: rndD() < 0.5 ? 1 : -1
    };
    g.scale.setScalar(0.75);
    scene.add(g);
    dragonflies.push(g);
  }
}

function buildSkyLife() {
  // voxel clouds drifting above the garden
  const cloudRnd = mulberry32(8181);
  const cloudMat = new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: true, fog: true
  });
  for (let c = 0; c < 7; c++) {
    const cw = new VoxelWorld();
    const blobs = 4 + Math.floor(cloudRnd() * 4);
    const width = 7 + cloudRnd() * 6;
    for (let b = 0; b < blobs; b++) {
      const bx = Math.round((cloudRnd() - 0.5) * width * 1.6);
      const by = Math.round((cloudRnd() - 0.5) * 2.4);
      const bz = Math.round((cloudRnd() - 0.5) * 5);
      const rx = 2.2 + cloudRnd() * 3.4;
      const ry = 1.2 + cloudRnd() * 1.4;
      const rz = 1.8 + cloudRnd() * 2.0;
      cw.ellipsoid(bx, by, bz, rx, ry, rz, (x, y, z) => {
        const r = hash3(x, y, z);
        if (r < 0.18) return C.cloud[1];
        if (r < 0.36) return C.cloud[2];
        return C.cloud[0];
      }, { jitter: 0.18 });
    }
    const mesh = new THREE.Mesh(meshVoxels(cw, KIND_MATTE), cloudMat);
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const angle = Math.PI + 0.16 + (c / 6) * (Math.PI - 0.32) + cloudRnd() * 0.12;
    const radius = 140 + cloudRnd() * 42;
    mesh.position.set(Math.cos(angle) * radius, 52 + cloudRnd() * 12, Math.sin(angle) * radius);
    mesh.scale.setScalar(0.9 + cloudRnd() * 0.35);
    mesh.rotation.y = cloudRnd() * TAU;
    scene.add(mesh);
    clouds.push({ mesh, angle, radius, baseY: mesh.position.y, speed: 0.004 + cloudRnd() * 0.004, bob: cloudRnd() * TAU });
  }

  // cranes circling the pagoda
  const birdRnd = mulberry32(5150);
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.7, flatShading: true });
    const black = new THREE.MeshStandardMaterial({ color: 0x24272b, roughness: 0.7, flatShading: true });
    const red = new THREE.MeshStandardMaterial({ color: 0xc8392e, roughness: 0.6, flatShading: true });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.45, 0.55), white);
    g.add(body);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.22, 0.24), white);
    neck.position.set(1.15, 0.20, 0);
    g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.26, 0.24), white);
    head.position.set(1.55, 0.30, 0);
    g.add(head);
    const crown = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.18), red);
    crown.position.set(1.58, 0.44, 0);
    g.add(crown);
    const beak = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.09, 0.1), black);
    beak.position.set(1.82, 0.28, 0);
    g.add(beak);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), black);
    tail.position.set(-0.95, 0.05, 0);
    g.add(tail);
    const wings = [];
    for (const sz of [-1, 1]) {
      const pivot = new THREE.Group();
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.08, 2.0), white);
      wing.position.z = sz * 1.0;
      pivot.add(wing);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.55), black);
      tip.position.set(-0.05, 0.0, sz * 2.0);
      pivot.add(tip);
      g.add(pivot);
      wings.push({ pivot, side: sz });
    }
    const radius = 34 + birdRnd() * 20;
    g.userData = {
      radius, angle: birdRnd() * TAU, speed: 0.05 + birdRnd() * 0.035,
      y: 52 + birdRnd() * 12, wings, phase: birdRnd() * TAU,
      cx: 0, cz: -12
    };
    g.scale.setScalar(1.15);
    scene.add(g);
    birds.push(g);
  }
}

/* ---------- controls ---------- */
function updateCamera() {
  const sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
  const st = Math.sin(orbit.theta), ct = Math.cos(orbit.theta);
  const p = new THREE.Vector3(
    orbit.target.x + orbit.radius * sp * st,
    orbit.target.y + orbit.radius * cp,
    orbit.target.z + orbit.radius * sp * ct
  );
  camera.position.copy(p);
  camera.lookAt(orbit.target);
}

function manualViewChanged() {
  if (!paused || !booted) return;
  updateCameraNow();
  renderStillFrame();
}

let lastPointer = null;
let pinchDist = 0;
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  orbit.dragging = true;
  orbit.panning = (e.button === 2);
  orbit.idle = 0;
  lastPointer = { x: e.clientX, y: e.clientY, button: e.button };
});
canvas.addEventListener('pointermove', e => {
  if (!orbit.dragging || !lastPointer) return;
  const dx = e.clientX - lastPointer.x;
  const dy = e.clientY - lastPointer.y;
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  orbit.idle = 0;
  if (orbit.panning) {
    const scale = orbit.radius * 0.0012;
    const right = new THREE.Vector3().subVectors(camera.position, orbit.target).cross(camera.up).normalize();
    const forward = new THREE.Vector3().crossVectors(camera.up, right).normalize();
    orbit.tTarget.addScaledVector(right, -dx * scale);
    orbit.tTarget.addScaledVector(forward, dy * scale);
    orbit.tTarget.x = clamp(orbit.tTarget.x, -40, 40);
    orbit.tTarget.z = clamp(orbit.tTarget.z, -45, 45);
    orbit.tTarget.y = clamp(orbit.tTarget.y, 8, 42);
  } else {
    orbit.tTheta -= dx * 0.0045;
    orbit.tPhi = clamp(orbit.tPhi + dy * 0.0032, 0.30, 1.36);
  }
  manualViewChanged();
});
canvas.addEventListener('pointerup', e => {
  orbit.dragging = false;
  orbit.panning = false;
  lastPointer = null;
  orbit.idle = 0;
});
canvas.addEventListener('pointercancel', () => {
  orbit.dragging = false; orbit.panning = false; lastPointer = null;
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  orbit.tRadius = clamp(orbit.tRadius * (1 + Math.sign(e.deltaY) * 0.08), 48, 175);
  orbit.idle = 0;
  manualViewChanged();
}, { passive: false });
canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('touchstart', e => {
  if (e.touches.length === 2) {
    pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                           e.touches[0].clientY - e.touches[1].clientY);
  }
}, { passive: true });
canvas.addEventListener('touchmove', e => {
  if (e.touches.length === 2) {
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
    if (pinchDist > 0) orbit.tRadius = clamp(orbit.tRadius * (pinchDist / d), 48, 175);
    pinchDist = d;
    orbit.idle = 0;
    manualViewChanged();
  }
}, { passive: true });
canvas.addEventListener('touchend', () => { pinchDist = 0; });

/* ---------- UI ---------- */
let nightTarget = 0, nightBlend = 0;
const btnNight = document.getElementById('btnNight');
const btnOrbit = document.getElementById('btnOrbit');
const btnPause = document.getElementById('btnPause');
const sceneStatus = document.getElementById('sceneStatus');

/* ---------- motion / pause ---------- */
const reduceMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let paused = reduceMotionQuery.matches;
let manualMotionChoice = false;
let rafId = 0;
let booted = false;
const clock = new THREE.Clock();
let elapsed = 0;

function updatePauseButton() {
  if (!btnPause) return;
  btnPause.textContent = paused ? 'Play scene' : 'Pause scene';
  btnPause.setAttribute('aria-pressed', paused ? 'true' : 'false');
  btnPause.setAttribute('aria-label', paused ? 'Play scene' : 'Pause scene');
}

function announceScene(message) {
  if (sceneStatus) sceneStatus.textContent = message;
}

function updateCameraNow() {
  orbit.theta = orbit.tTheta;
  orbit.phi = orbit.tPhi;
  orbit.radius = orbit.tRadius;
  orbit.target.copy(orbit.tTarget);
  updateCamera();
}

function renderStillFrame() {
  if (!booted || !renderer) return;
  updateCamera();
  renderer.render(scene, camera);
}

function stopLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }
  // Discard time spent stopped so resuming does not jump forward.
  clock.getDelta();
}

function startLoop() {
  if (rafId || paused || document.hidden) return;
  clock.getDelta();
  rafId = requestAnimationFrame(animate);
}

function setPaused(value, manual = true) {
  const next = !!value;
  if (manual) manualMotionChoice = true;
  if (next === paused) {
    updatePauseButton();
    return;
  }
  paused = next;
  updatePauseButton();
  if (paused) {
    stopLoop();
    if (booted) {
      applyTimeOfDay(nightBlend);
      updateLanternGlows();
      renderStillFrame();
    }
    announceScene('Scene paused');
  } else {
    startLoop();
    announceScene('Scene playing');
  }
}

function togglePause() {
  setPaused(!paused, true);
}

function onMotionPreferenceChange() {
  if (manualMotionChoice) return;
  setPaused(reduceMotionQuery.matches, false);
}

if (reduceMotionQuery.addEventListener) {
  reduceMotionQuery.addEventListener('change', onMotionPreferenceChange);
} else if (reduceMotionQuery.addListener) {
  reduceMotionQuery.addListener(onMotionPreferenceChange);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopLoop();
  } else if (paused) {
    if (booted) {
      applyTimeOfDay(nightBlend);
      updateLanternGlows();
      renderStillFrame();
    }
  } else {
    startLoop();
  }
});

btnNight.addEventListener('click', () => {
  nightTarget = nightTarget ? 0 : 1;
  btnNight.textContent = nightTarget ? 'Moonlit night' : 'Golden hour';
  btnNight.setAttribute('aria-pressed', nightTarget ? 'true' : 'false');
  if (paused && booted) {
    nightBlend = nightTarget;
    applyTimeOfDay(nightBlend);
    renderStillFrame();
  }
});
btnOrbit.addEventListener('click', () => {
  orbit.auto = !orbit.auto;
  btnOrbit.setAttribute('aria-pressed', orbit.auto ? 'true' : 'false');
  orbit.idle = 0;
});
if (btnPause) btnPause.addEventListener('click', togglePause);

/* ---------- main loop ---------- */
function animate() {
  rafId = 0;
  if (document.hidden || paused) return;
  rafId = requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  // orbit easing + cinematic drift
  if (orbit.auto && !orbit.dragging) {
    orbit.idle += dt;
    if (orbit.idle > 2.5) orbit.tTheta += dt * 0.028;
  }
  orbit.theta = lerp(orbit.theta, orbit.tTheta, 1 - Math.exp(-dt * 3.4));
  orbit.phi = lerp(orbit.phi, orbit.tPhi, 1 - Math.exp(-dt * 3.4));
  orbit.radius = lerp(orbit.radius, orbit.tRadius, 1 - Math.exp(-dt * 3.0));
  orbit.target.lerp(orbit.tTarget, 1 - Math.exp(-dt * 3.0));
  updateCamera();
  skyMesh.position.copy(camera.position);
  sunSprite.position.copy(skyUniforms.uSunDir.value).multiplyScalar(520);

  // day / night transition
  nightBlend = lerp(nightBlend, nightTarget, 1 - Math.exp(-dt * 1.5));
  applyTimeOfDay(nightBlend);

  // animated life
  if (waterUniforms) waterUniforms.uTime.value = elapsed;
  updatePetals(dt);
  updateKoi(dt);
  updateDragonflies(dt);
  updateFireflies(dt);
  updateClouds(dt);
  updateBirds(dt);
  updateLanternGlows();

  renderer.render(scene, camera);
}

const dayPalette = {
  top: new THREE.Color(0x4f7fb8),
  mid: new THREE.Color(0xf0b98f),
  horizon: new THREE.Color(0xffd2a0),
  sun: new THREE.Color(0xffd9a0),
  fog: new THREE.Color(0xe2c5ae),
  hemiSky: new THREE.Color(0xb8d2ee),
  hemiGround: new THREE.Color(0x5d6a45),
  light: new THREE.Color(0xffd7a8),
  waterDeep: new THREE.Color(0x2f6f78),
  waterShallow: new THREE.Color(0x79c4bd),
  waterSky: new THREE.Color(0xffd7a8)
};
const nightPalette = {
  top: new THREE.Color(0x0d1733),
  mid: new THREE.Color(0x283a63),
  horizon: new THREE.Color(0x6a5570),
  sun: new THREE.Color(0xbcd0ff),
  fog: new THREE.Color(0x1b2436),
  hemiSky: new THREE.Color(0x4f6b9e),
  hemiGround: new THREE.Color(0x1d2a22),
  light: new THREE.Color(0x9db8e8),
  waterDeep: new THREE.Color(0x101d2f),
  waterShallow: new THREE.Color(0x27476a),
  waterSky: new THREE.Color(0x9db8e8)
};

function applyTimeOfDay(t) {
  skyUniforms.uTop.value.copy(mixColor(dayPalette.top, nightPalette.top, t));
  skyUniforms.uMid.value.copy(mixColor(dayPalette.mid, nightPalette.mid, t));
  skyUniforms.uHorizon.value.copy(mixColor(dayPalette.horizon, nightPalette.horizon, t));
  skyUniforms.uSunColor.value.copy(mixColor(dayPalette.sun, nightPalette.sun, t));
  skyUniforms.uGlow.value = lerp(0.95, 0.55, t);
  skyUniforms.uNight.value = t;
  scene.fog.color.copy(mixColor(dayPalette.fog, nightPalette.fog, t));
  scene.fog.near = lerp(105, 80, t);
  scene.fog.far = lerp(290, 240, t);
  hemi.color.copy(mixColor(dayPalette.hemiSky, nightPalette.hemiSky, t));
  hemi.groundColor.copy(mixColor(dayPalette.hemiGround, nightPalette.hemiGround, t));
  hemi.intensity = lerp(1.18, 0.60, t);
  sunLight.color.copy(mixColor(dayPalette.light, nightPalette.light, t));
  sunLight.intensity = lerp(2.55, 0.98, t);
  fillLight.intensity = lerp(0.58, 0.38, t);
  renderer.toneMappingExposure = lerp(1.05, 1.24, t);
  sunSpriteMat.color.copy(mixColor(new THREE.Color(0xffe2b0), new THREE.Color(0xcfe0ff), t));
  sunSpriteMat.opacity = lerp(0.95, 0.72, t);
  moonSpriteMat.opacity = smoothstep(0.18, 0.9, t);
  moonHaloMat.opacity = smoothstep(0.18, 0.9, t) * 0.42;
  starMat.opacity = smoothstep(0.35, 0.95, t) * 0.95;
  if (waterUniforms) {
    waterUniforms.uDeep.value.copy(mixColor(dayPalette.waterDeep, nightPalette.waterDeep, t));
    waterUniforms.uShallow.value.copy(mixColor(dayPalette.waterShallow, nightPalette.waterShallow, t));
    waterUniforms.uSky.value.copy(mixColor(dayPalette.waterSky, nightPalette.waterSky, t));
  }
  ambient.color.copy(mixColor(new THREE.Color(0xffe2c8), new THREE.Color(0x93a8d8), t));
  ambient.intensity = lerp(0.18, 0.16, t);
  for (const p of pointLights) p.intensity = p.userData.base * lerp(1.0, 1.9, t);
  for (const s of glowSprites) {
    if (s.userData.baseOpacity !== undefined)
      s.material.opacity = s.userData.baseOpacity * lerp(1.0, 1.55, t);
  }
}

function updateLanternGlows() {
  const t = elapsed;
  for (const s of glowSprites) {
    const f = 0.86 + 0.14 * Math.sin(t * 2.3 + s.userData.seed * 4.1) + 0.06 * Math.sin(t * 7.7 + s.userData.seed);
    s.scale.setScalar(s.userData.baseScale * f);
  }
}

/* ---------- stub animations (filled in below) ---------- */
const petalDummy = new THREE.Object3D();

function updatePetals(dt) {
  if (!petals) return;
  const n = petalData.length;
  for (let i = 0; i < n; i++) {
    const d = petalData[i];
    d.y -= d.speed * dt;
    d.x += Math.sin(elapsed * 1.15 + d.phase) * d.sway * dt + 0.22 * dt;
    d.z += Math.cos(elapsed * 0.85 + d.phase) * d.sway * 0.7 * dt + 0.08 * dt;
    d.rx += d.spin * dt;
    d.ry += d.spin * 0.75 * dt;
    d.rz += d.spin * 0.5 * dt;
    if (d.y < GROUND_Y + 0.25 || Math.abs(d.x) > 72 || Math.abs(d.z) > 72) {
      const c = d.home;
      d.x = c[0] + (hash3(i, 1, 2) - 0.5) * 16;
      d.y = c[1] + 6 + hash3(i, 2, 3) * 9;
      d.z = c[2] + (hash3(i, 3, 4) - 0.5) * 16;
      d.phase = hash3(i, 4, 5) * TAU;
    }
    petalDummy.position.set(d.x, d.y, d.z);
    petalDummy.rotation.set(d.rx, d.ry, d.rz);
    petalDummy.scale.setScalar(d.scale);
    petalDummy.updateMatrix();
    petals.setMatrixAt(i, petalDummy.matrix);
  }
  petals.instanceMatrix.needsUpdate = true;
}

function updateKoi(dt) {
  for (const k of koiFish) {
    k.angle += dt * k.speed * k.dir;
    const x = k.cx + Math.cos(k.angle) * k.rx;
    const z = k.cz + Math.sin(k.angle) * k.rz;
    k.mesh.position.set(x, k.y + Math.sin(elapsed * 1.4 + k.phase) * 0.16, z);
    const dx = -Math.sin(k.angle) * k.rx * k.dir;
    const dz = Math.cos(k.angle) * k.rz * k.dir;
    k.mesh.rotation.y = Math.atan2(-dz, dx);
    k.mesh.rotation.z = Math.sin(elapsed * 1.7 + k.phase) * 0.06;
    if (k.mesh.userData.tail) {
      k.mesh.userData.tail.rotation.y = Math.sin(elapsed * 6.5 + k.phase) * 0.55;
    }
  }
}

function updateDragonflies(dt) {
  for (const d of dragonflies) {
    const u = d.userData;
    u.phase += dt * u.speed * u.dir;
    const x = u.cx + Math.cos(u.phase) * u.rx;
    const z = u.cz + Math.sin(u.phase) * u.rz;
    d.position.set(x, u.y + Math.sin(elapsed * 2.2 + u.phase) * 0.35, z);
    const dx = -Math.sin(u.phase) * u.rx * u.dir;
    const dz = Math.cos(u.phase) * u.rz * u.dir;
    d.rotation.y = Math.atan2(-dz, dx);
    const flap = Math.sin(elapsed * 32 + u.phase * 3) * 0.55;
    for (const child of d.children) {
      if (child.geometry && child.geometry.type === 'PlaneGeometry') {
        child.rotation.x = -Math.PI / 2 + flap;
      }
    }
  }
}

function updateFireflies(dt) {
  if (!fireflyMat) return;
  fireflyMat.uniforms.uTime.value = elapsed;
  fireflyMat.uniforms.uOpacity.value = smoothstep(0.25, 0.9, nightBlend) * 0.95;
}

function updateClouds(dt) {
  for (const c of clouds) {
    c.angle += c.speed * dt;
    c.mesh.position.x = Math.cos(c.angle) * c.radius;
    c.mesh.position.z = Math.sin(c.angle) * c.radius;
    c.mesh.position.y = c.baseY + Math.sin(elapsed * 0.12 + c.bob) * 1.6;
    c.mesh.rotation.y += dt * 0.006;
  }
}

function updateBirds(dt) {
  for (const b of birds) {
    const u = b.userData;
    u.angle += dt * u.speed;
    const x = u.cx + Math.cos(u.angle) * u.radius;
    const z = u.cz + Math.sin(u.angle) * u.radius;
    b.position.set(x, u.y + Math.sin(elapsed * 0.5 + u.phase) * 1.8, z);
    const dx = -Math.sin(u.angle) * u.radius;
    const dz = Math.cos(u.angle) * u.radius;
    b.rotation.y = Math.atan2(-dz, dx);
    b.rotation.z = Math.sin(elapsed * 0.4 + u.phase) * 0.10;
    const flap = Math.sin(elapsed * 3.6 + u.phase) * 0.55;
    for (const w of u.wings) {
      w.pivot.rotation.x = w.side * flap;
    }
  }
}

/* ---------- boot ---------- */
async function boot() {
  const status = document.getElementById('loadStatus');
  await nextFrame();
  status.textContent = 'Shaping the land…';
  buildTerrain();
  await nextFrame();
  status.textContent = 'Raising the pagoda…';
  buildPagoda();
  await nextFrame();
  status.textContent = 'Planting cherry trees…';
  buildTrees();
  await nextFrame();
  status.textContent = 'Filling the pond…';
  buildGarden();
  buildWater();
  await nextFrame();
  status.textContent = 'Inviting the koi…';
  buildLife();
  buildSkyLife();
  await nextFrame();
  status.textContent = 'Polishing the last petal…';

  // merge static voxels into three draw calls
  const matteMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.92, metalness: 0.0, flatShading: true,
    emissive: new THREE.Color(0x14120f), emissiveIntensity: 0.12
  });
  const metalMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.30, metalness: 0.22,
    emissive: new THREE.Color(0x3a2608), emissiveIntensity: 0.25, flatShading: true
  });
  const glowMat = new THREE.MeshBasicMaterial({
    vertexColors: true, toneMapped: false, fog: false
  });

  const matte = new THREE.Mesh(meshVoxels(world, KIND_MATTE), matteMat);
  matte.castShadow = true;
  matte.receiveShadow = true;
  scene.add(matte);

  const metal = new THREE.Mesh(meshVoxels(world, KIND_METAL), metalMat);
  metal.castShadow = true;
  metal.receiveShadow = true;
  scene.add(metal);

  const glow = new THREE.Mesh(meshVoxels(world, KIND_GLOW), glowMat);
  scene.add(glow);

  await nextFrame();

  booted = true;
  applyTimeOfDay(nightBlend);
  updatePauseButton();
  window.__pagoda = {
    camera, scene, renderer, orbit, togglePause,
    get paused() { return paused; },
    get elapsed() { return elapsed; },
    get rafId() { return rafId; }
  };

  if (paused) {
    updateLanternGlows();
    renderStillFrame();
  }
  document.getElementById('loading').classList.add('hide');
  if (!paused) startLoop();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  // Resizing clears the drawing buffer; keep a still frame while paused.
  if (paused && booted) renderStillFrame();
});

boot().catch(err => {
  console.error(err);
  const s = document.getElementById('loadStatus');
  if (s) s.textContent = 'The garden failed to grow: ' + err.message;
});
})();


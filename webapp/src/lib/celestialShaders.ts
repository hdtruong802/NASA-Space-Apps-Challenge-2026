import * as THREE from 'three';
import {
  BRIGHT_STARS,
  DEEP_SKY_OBJECTS,
  ICRS_TO_GALACTIC_MAT,
  raDecToUnitVec,
} from './celestialSky';

/**
 * Custom GLSL deep-space Milky Way dome shader operating continuously in 3D Galactic vector space
 * (zero spherical UV seam), depicting the Galactic bulge, spiral OB star clouds, Great Rift dark
 * dust lanes, Coalsack silhouette, and true deep lunar vacuum black sky.
 */
export function createMilkyWayDomeMesh(skyRadius = 1440.0): THREE.Mesh {
  const geo = new THREE.SphereGeometry(skyRadius, 64, 48);
  const eqToGal = new THREE.Matrix3().set(
    ICRS_TO_GALACTIC_MAT[0],
    ICRS_TO_GALACTIC_MAT[1],
    ICRS_TO_GALACTIC_MAT[2],
    ICRS_TO_GALACTIC_MAT[3],
    ICRS_TO_GALACTIC_MAT[4],
    ICRS_TO_GALACTIC_MAT[5],
    ICRS_TO_GALACTIC_MAT[6],
    ICRS_TO_GALACTIC_MAT[7],
    ICRS_TO_GALACTIC_MAT[8],
  );

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uEqToGal: { value: eqToGal },
    },
    vertexShader: /* glsl */ `
      varying vec3 vLocalDir;
      void main() {
        vLocalDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform mat3 uEqToGal;
      varying vec3 vLocalDir;

      float hash31(vec3 p) {
        p = fract(p * vec3(0.1031, 0.1030, 0.0973));
        p += dot(p, p.yxz + 33.33);
        return fract((p.x + p.y) * p.z);
      }

      float noise3(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash31(i + vec3(0.0, 0.0, 0.0));
        float n100 = hash31(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash31(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash31(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash31(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash31(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash31(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash31(i + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
      }

      float fbm(vec3 p) {
        float sum = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 5; i++) {
          sum += amp * noise3(p);
          p = p * 2.07 + vec3(13.1, 7.7, 19.3);
          amp *= 0.5;
        }
        return sum;
      }

      void main() {
        vec3 gal = normalize(uEqToGal * normalize(vLocalDir));
        float absB = abs(gal.z);

        // Galactic center (+X), anticenter (-X), Carina (-Y/+X edge around l=288 -> x=+0.3, y=-0.95)
        float centerAlign = max(0.0, gal.x);
        float bulgeWeight = pow(centerAlign, 3.0);

        // Domain-warped galactic coordinates for organic spiral clouds
        vec3 warp = vec3(
          fbm(gal * 3.4 + vec3(2.1, -1.4, 0.8)),
          fbm(gal * 3.4 + vec3(-4.2, 3.7, 1.2)),
          fbm(gal * 3.4 + vec3(0.5, 5.1, -2.9))
        ) - 0.5;
        vec3 warpedDir = gal + warp * 0.16;

        float bandNarrow = exp(-abs(warpedDir.z) * (11.5 - bulgeWeight * 4.5));
        float bandWide = exp(-gal.z * gal.z * 26.0);

        // Multi-scale stellar clouds along disk
        float clouds = fbm(warpedDir * 5.2);
        float fineDust = fbm(warpedDir * 15.5 + warp * 1.8);
        float shimmer = pow(clamp(fbm(gal * 38.0), 0.0, 1.0), 3.0);

        // Highlight real bright Milky Way regions: Galactic Core, Carina-Crux (x~0.3, y~-0.95), Cygnus (x~0.25, y~0.96)
        vec3 carinaDir = normalize(vec3(0.31, -0.95, 0.0));
        vec3 cygnusDir = normalize(vec3(0.24, 0.97, 0.02));
        float carinaCloud = pow(max(0.0, dot(gal, carinaDir)), 5.0);
        float cygnusCloud = pow(max(0.0, dot(gal, cygnusDir)), 6.0);

        // Dark dust lanes (Great Rift along inner Sagittarius-Aquila-Crux + Coalsack dark pocket)
        float dustPlane = exp(-abs(warpedDir.z - 0.015 * warp.x) * 28.0);
        float riftFilaments = smoothstep(0.38, 0.72, fbm(gal * 8.5 + warp * 2.2));
        vec3 coalsackDir = normalize(vec3(0.54, -0.84, -0.02));
        float coalsack = smoothstep(0.985, 0.996, dot(gal, coalsackDir)) * 0.78;
        float dustOcclusion = clamp(
          dustPlane * riftFilaments * (0.45 + 0.50 * max(0.0, gal.x + 0.35)) + coalsack,
          0.0,
          0.90
        );

        // Color palette: deep lunar vacuum -> silver-blue arms -> warm golden galactic center
        vec3 vacuum = vec3(0.0020, 0.0034, 0.0092);
        vec3 armColor = vec3(0.18, 0.27, 0.48);
        vec3 brightArmColor = vec3(0.38, 0.49, 0.75);
        vec3 bulgeColor = vec3(0.84, 0.66, 0.45);

        float stellarDensity =
          bandWide * (0.16 + 0.36 * clouds) +
          bandNarrow * (0.26 + 0.62 * fineDust) +
          (carinaCloud + 0.78 * cygnusCloud) * 0.28 * (0.5 + clouds) +
          bulgeWeight * exp(-absB * 5.0) * (0.60 + 0.48 * clouds);

        vec3 bandCol = mix(armColor, brightArmColor, clouds);
        bandCol = mix(bandCol, bulgeColor, clamp(bulgeWeight * 1.18, 0.0, 0.90));
        bandCol += vec3(0.60, 0.68, 0.86) * shimmer * bandWide * 0.42;

        // Carve realistic dust silhouettes (warm brownish edge + dark core)
        vec3 dustTint = mix(vec3(1.0), vec3(0.15, 0.11, 0.10), dustOcclusion);
        vec3 sky = vacuum + bandCol * stellarDensity * dustTint * 0.62;

        // Subtle extragalactic cosmic starlight floor so high-latitude zenith keeps rich contrast
        float highLatGlow = (1.0 - bandWide) * fbm(gal * 4.0) * 0.015;
        sky += vec3(0.09, 0.14, 0.26) * highLatGlow;

        gl_FragColor = vec4(sky, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  return mesh;
}

/**
 * GPU shader points material rendering Moffat/Airy stellar PSF cores with saturated blackbody
 * spectral color halos and optical 4-point diffraction spikes on bright 0th-1st magnitude stars.
 */
export function createAstronomicalStarField(
  positions: Float32Array,
  colors: Float32Array,
  sizes: Float32Array,
  spikeStrengths: Float32Array,
  pixelRatio: number,
): THREE.Points {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('aSpike', new THREE.BufferAttribute(spikeStrengths, 1));

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uPixelRatio: { value: pixelRatio },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aSpike;
      uniform float uPixelRatio;
      varying vec3 vColor;
      varying float vSpike;
      varying float vSize;
      void main() {
        vColor = aColor;
        vSpike = aSpike;
        vSize = aSize;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPos;
        gl_PointSize = clamp(aSize * uPixelRatio, 1.85, 36.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying float vSpike;
      varying float vSize;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float d2 = dot(uv, uv);
        if (d2 > 0.25) discard;

        // Tight pure-white overexposed PSF center + spectral B-V corona halo, wider core on sub-3px faint stars
        float sharpness = mix(17.0, 56.0, clamp((vSize - 2.0) / 7.5, 0.0, 1.0));
        float faintLift = mix(1.42, 1.0, clamp((vSize - 2.2) / 5.5, 0.0, 1.0));
        float core = exp(-d2 * sharpness) * faintLift;
        float halo = exp(-d2 * 11.5) * 0.46;

        // 4-point diffraction spikes for bright anchor stars (Sirius, Canopus, Alpha Cen, Rigel, Betelgeuse)
        float spikes = 0.0;
        if (vSpike > 0.01) {
          float sx = exp(-abs(uv.y) * 44.0) * exp(-abs(uv.x) * 6.5);
          float sy = exp(-abs(uv.x) * 44.0) * exp(-abs(uv.y) * 6.5);
          spikes = (sx + sy) * vSpike * 0.88;
        }

        float intensity = core + halo + spikes;
        vec3 col = mix(vColor, vec3(1.0, 0.99, 0.97), clamp(core * 1.15, 0.0, 0.92));
        gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 1.0));
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  });

  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/**
 * Create volumetric procedural deep-sky galaxies (LMC, SMC, M31) & nebulae/clusters
 * placed accurately at their J2000 ICRS coordinates.
 */
export function createDeepSkyGroup(skyRadius = 1365.0): THREE.Group {
  const group = new THREE.Group();
  const planeGeo = new THREE.PlaneGeometry(1, 1);

  for (const dso of DEEP_SKY_OBJECTS) {
    const [dx, dy, dz] = raDecToUnitVec(dso.raDeg, dso.decDeg);
    const dir = new THREE.Vector3(dx, dy, dz).normalize();

    const kindCode = dso.kind === 'galaxy' ? (dso.id === 'andromeda' ? 1.0 : 0.0) : dso.kind === 'nebula' ? 2.0 : 3.0;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uKind: { value: kindCode },
        uAxisRatio: { value: dso.axisRatio },
        uRoll: { value: dso.rollRad },
        uCoreCol: { value: new THREE.Color(...dso.coreRgb) },
        uOuterCol: { value: new THREE.Color(...dso.outerRgb) },
        uAccentCol: { value: new THREE.Color(...dso.accentRgb) },
        uIntensity: { value: dso.intensity },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv * 2.0 - 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uKind;
        uniform float uAxisRatio;
        uniform float uRoll;
        uniform vec3 uCoreCol;
        uniform vec3 uOuterCol;
        uniform vec3 uAccentCol;
        uniform float uIntensity;
        varying vec2 vUv;

        float hash21(vec2 p) {
          p = fract(p * vec2(123.34, 456.21));
          p += dot(p, p + 45.32);
          return fract(p.x * p.y);
        }

        float noise2(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash21(i);
          float b = hash21(i + vec2(1.0, 0.0));
          float c = hash21(i + vec2(0.0, 1.0));
          float d = hash21(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        float fbm2(vec2 p) {
          float s = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            s += a * noise2(p);
            p = p * 2.08 + vec2(3.7, 9.2);
            a *= 0.5;
          }
          return s;
        }

        void main() {
          float cs = cos(uRoll);
          float sn = sin(uRoll);
          vec2 rotUv = vec2(cs * vUv.x - sn * vUv.y, sn * vUv.x + cs * vUv.y);
          vec2 q = vec2(rotUv.x, rotUv.y / max(0.18, uAxisRatio));
          float r = length(q);
          if (r > 1.0) discard;

          float edgeFade = smoothstep(1.0, 0.12, r);
          float n1 = fbm2(q * 3.6 + vec2(1.3, 4.7));
          float n2 = fbm2(q * 8.4 - vec2(2.8, 0.9));

          vec3 col = vec3(0.0);
          float alpha = 0.0;

          if (uKind < 0.5) {
            // Barred Dwarf Irregular Galaxy (LMC / SMC)
            float bar = exp(-pow(q.x * 2.4, 2.0) - pow(q.y * 5.0, 2.0));
            float outer = exp(-r * r * 3.8) * (0.45 + 0.75 * n1);
            float knotDist = length(q - vec2(0.24, 0.08));
            float tarantula = exp(-knotDist * knotDist * 45.0) * 0.75;
            float sparkle = pow(noise2(q * 36.0), 7.0) * edgeFade * 0.65;
            col = uOuterCol * outer * 0.42 + uCoreCol * bar * 0.50 + uAccentCol * tarantula + uCoreCol * sparkle;
            alpha = (outer * 0.42 + bar * 0.48 + tarantula * 0.7 + sparkle) * edgeFade;
          } else if (uKind < 1.5) {
            // Grand Design Tilted Spiral Galaxy (Andromeda M31)
            float angle = atan(q.y, q.x);
            float spiral = 0.5 + 0.5 * cos(2.0 * angle - log(max(0.03, r)) * 5.4);
            float arms = smoothstep(0.25, 0.92, spiral + (n1 - 0.5) * 0.45);
            float dust = smoothstep(0.55, 0.85, 1.0 - spiral + (n2 - 0.5) * 0.35);
            float core = exp(-r * r * 18.0);
            float disk = exp(-r * r * 3.6) * (0.35 + 0.65 * arms) * (1.0 - 0.48 * dust * smoothstep(0.15, 0.75, r));
            col = uCoreCol * core * 0.95 + uOuterCol * disk * 0.62 + uAccentCol * disk * 0.25;
            alpha = (core * 0.85 + disk * 0.55) * edgeFade;
          } else if (uKind < 2.5) {
            // HII Emission & Reflection Nebula (Carina / Orion M42 / Lagoon)
            vec2 warped = q + vec2(n1 - 0.5, n2 - 0.5) * 0.34;
            float rw = length(warped);
            float cloud = exp(-rw * rw * 4.2) * (0.35 + 0.85 * fbm2(warped * 4.5));
            float coreShock = exp(-r * r * 14.0);
            float darkPocket = smoothstep(0.42, 0.68, fbm2(q * 6.5 + vec2(5.1, -2.3)));
            col = mix(uOuterCol, uCoreCol, smoothstep(0.2, 0.75, n1)) * cloud * (1.0 - 0.52 * darkPocket);
            col += uAccentCol * coreShock * 0.55;
            alpha = (cloud * 0.58 + coreShock * 0.45) * edgeFade;
          } else {
            // Rich Globular Star Cluster (Omega Centauri)
            float kingCore = 1.0 / pow(1.0 + r * r * 24.0, 1.65);
            float grains = pow(noise2(q * 48.0), 5.0) * exp(-r * r * 4.2);
            col = uCoreCol * kingCore * 0.85 + uOuterCol * grains * 0.9 + uAccentCol * exp(-r * r * 6.0) * 0.35;
            alpha = (kingCore * 0.8 + grains * 0.6) * edgeFade;
          }

          gl_FragColor = vec4(col * uIntensity * 1.24, clamp(alpha * uIntensity * 1.24, 0.0, 1.0));
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    const mesh = new THREE.Mesh(planeGeo, mat);
    mesh.position.copy(dir).multiplyScalar(skyRadius);
    mesh.lookAt(0, 0, 0);
    const size = 2.0 * skyRadius * Math.tan((dso.radiusDeg * Math.PI) / 180.0);
    mesh.scale.set(size, size, 1.0);
    mesh.renderOrder = -6;
    group.add(mesh);
  }

  return group;
}

/**
 * Create procedural equirectangular Earth texture (continents, shallow shelves, oceans,
 * polar ice caps, cyclone clouds) + city lights night mask for terminator rendering.
 */
function createProceduralEarthMaps(): {
  dayTex: THREE.CanvasTexture | null;
  nightTex: THREE.CanvasTexture | null;
} {
  if (typeof document === 'undefined') return { dayTex: null, nightTex: null };
  const w = 1024;
  const h = 512;
  const dayCanvas = document.createElement('canvas');
  dayCanvas.width = w;
  dayCanvas.height = h;
  const dayCtx = dayCanvas.getContext('2d');

  const nightCanvas = document.createElement('canvas');
  nightCanvas.width = w;
  nightCanvas.height = h;
  const nightCtx = nightCanvas.getContext('2d');

  if (!dayCtx || !nightCtx) return { dayTex: null, nightTex: null };

  // Deterministic 2D value noise for coastlines & swirling cloud bands
  const hash = (ix: number, iy: number): number => {
    const n = Math.sin(((ix % 512) * 127.1 + iy * 311.7)) * 43758.5453123;
    return n - Math.floor(n);
  };
  const vnoise = (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = x - ix;
    const fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  };
  const fbm = (x: number, y: number, oct = 4): number => {
    let val = 0;
    let amp = 0.5;
    let freq = 1;
    for (let o = 0; o < oct; o++) {
      val += amp * vnoise(x * freq, y * freq);
      freq *= 2.04;
      amp *= 0.5;
    }
    return val;
  };

  // Approximate continental centers [lonNorm (0..1), latNorm (0..1), rx, ry, aridFactor]
  const continentBlobs: Array<[number, number, number, number, number]> = [
    [0.24, 0.34, 0.1, 0.14, 0.25], // North America
    [0.31, 0.64, 0.075, 0.16, 0.18], // South America
    [0.54, 0.33, 0.085, 0.08, 0.22], // Europe
    [0.55, 0.55, 0.1, 0.18, 0.62], // Africa
    [0.72, 0.35, 0.18, 0.17, 0.38], // Eurasia / Asia
    [0.83, 0.68, 0.07, 0.08, 0.75], // Australia
  ];

  const dayImg = dayCtx.createImageData(w, h);
  const nightImg = nightCtx.createImageData(w, h);
  const dd = dayImg.data;
  const nd = nightImg.data;

  for (let py = 0; py < h; py++) {
    const v = py / h;
    const latDeg = 90.0 - v * 180.0;
    const absLat = Math.abs(latDeg);
    for (let px = 0; px < w; px++) {
      const u = px / w;
      const i = (py * w + px) * 4;

      const f1 = fbm(u * 10.0 + 3.2, v * 5.0 + 1.1, 5);
      const f2 = fbm(u * 24.0 - 1.7, v * 12.0 + 6.4, 3);

      let landScore = -0.34 + (f1 - 0.5) * 0.72 + (f2 - 0.5) * 0.22;
      let aridBias = 0.0;
      for (const [cx, cy, rx, ry, arid] of continentBlobs) {
        const dx = Math.min(Math.abs(u - cx), 1.0 - Math.abs(u - cx)) / rx;
        const dy = (v - cy) / ry;
        const d2 = dx * dx + dy * dy;
        const contribution = 0.62 * Math.exp(-d2 * 1.45);
        landScore += contribution;
        aridBias += contribution * arid;
      }

      // Polar ice sheets
      const iceThresh = 74.0 + (f1 - 0.5) * 14.0;
      const isIce = absLat > iceThresh;
      const isLand = !isIce && landScore > 0.02;

      let r = 8;
      let g = 42;
      let b = 96;

      if (isIce) {
        r = 232;
        g = 240;
        b = 248;
      } else if (isLand) {
        const elev = Math.min(1.0, Math.max(0.0, (landScore - 0.02) * 2.1));
        const desert = Math.max(0, Math.min(1, aridBias * 0.9 + (1.0 - Math.abs(absLat - 25) / 25) * 0.35 - f2 * 0.25));
        const greenR = 34 + elev * 48;
        const greenG = 94 + elev * 32;
        const greenB = 46 + elev * 20;
        const sandR = 178 + elev * 32;
        const sandG = 148 + elev * 24;
        const sandB = 104 + elev * 20;
        r = greenR + (sandR - greenR) * desert;
        g = greenG + (sandG - greenG) * desert;
        b = greenB + (sandB - greenB) * desert;
      } else {
        // Shallow coastal shelf turquoise brightening
        const shelf = Math.max(0, Math.min(1, (landScore + 0.14) / 0.16));
        r = 9 + shelf * 18;
        g = 46 + shelf * 56;
        b = 104 + shelf * 62;
      }

      // Swirled atmospheric cloud belts
      const cloudWarp = fbm(u * 7.0 + Math.sin(v * 14.0) * 0.6, v * 4.5, 4);
      const cloudNoise = fbm(u * 14.0 + cloudWarp * 1.4, v * 9.0 + cloudWarp * 0.9, 4);
      const cloud = Math.max(0, Math.min(1, (cloudNoise - 0.48) * 3.1));
      r = Math.round(r * (1.0 - cloud * 0.82) + 245 * cloud * 0.82);
      g = Math.round(g * (1.0 - cloud * 0.82) + 249 * cloud * 0.82);
      b = Math.round(b * (1.0 - cloud * 0.82) + 255 * cloud * 0.82);

      dd[i] = Math.min(255, Math.max(0, r));
      dd[i + 1] = Math.min(255, Math.max(0, g));
      dd[i + 2] = Math.min(255, Math.max(0, b));
      dd[i + 3] = 255;

      // Subtle night-side coastal & continental city clusters
      const cityHotspot = isLand && absLat < 58 && f2 > 0.62 ? Math.pow((f2 - 0.62) / 0.38, 2.2) : 0.0;
      const cityVal = Math.round(cityHotspot * 255 * (1.0 - cloud * 0.65));
      nd[i] = cityVal;
      nd[i + 1] = Math.round(cityVal * 0.72);
      nd[i + 2] = Math.round(cityVal * 0.35);
      nd[i + 3] = 255;
    }
  }

  dayCtx.putImageData(dayImg, 0, 0);
  nightCtx.putImageData(nightImg, 0, 0);

  const dayTex = new THREE.CanvasTexture(dayCanvas);
  dayTex.colorSpace = THREE.SRGBColorSpace;
  dayTex.wrapS = THREE.RepeatWrapping;

  const nightTex = new THREE.CanvasTexture(nightCanvas);
  nightTex.colorSpace = THREE.SRGBColorSpace;
  nightTex.wrapS = THREE.RepeatWrapping;

  return { dayTex, nightTex };
}

export interface RealisticEarthRig {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  disposeTextures: () => void;
}

/**
 * Create a physically-lit 3D Earth globe with sunlit crescent/gibbous phase terminator,
 * Rayleigh azure atmospheric rim glow, and subtle city lights on the night hemisphere.
 */
export function createRealisticEarthGlobe(): RealisticEarthRig {
  const { dayTex, nightTex } = createProceduralEarthMaps();
  const geo = new THREE.SphereGeometry(22, 48, 48);

  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uDayMap: { value: dayTex },
      uNightMap: { value: nightTex },
      uHasMaps: { value: dayTex && nightTex ? 1.0 : 0.0 },
      uSunDir: { value: new THREE.Vector3(1.0, 0.1, -0.4).normalize() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uDayMap;
      uniform sampler2D uNightMap;
      uniform float uHasMaps;
      uniform vec3 uSunDir;
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vViewDir;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(vViewDir);
        vec3 L = normalize(uSunDir);

        vec3 dayCol = uHasMaps > 0.5
          ? texture2D(uDayMap, vUv).rgb
          : vec3(0.16, 0.45, 0.82);
        vec3 nightCol = uHasMaps > 0.5
          ? texture2D(uNightMap, vUv).rgb
          : vec3(0.0);

        float ndotl = dot(N, L);
        float dayWeight = smoothstep(-0.10, 0.22, ndotl);
        float twilight = exp(-pow((ndotl + 0.02) * 8.5, 2.0)) * 0.28;
        float rim = pow(clamp(1.0 - max(0.0, dot(N, V)), 0.0, 1.0), 3.4);

        vec3 litDay = dayCol * (0.14 + 0.98 * max(0.0, ndotl));
        vec3 darkSide = dayCol * 0.045 + nightCol * (1.0 - dayWeight) * 0.85;
        vec3 atmosphere = vec3(0.32, 0.72, 1.0) * rim * (0.28 + 0.92 * smoothstep(-0.35, 0.55, ndotl));
        vec3 scatter = vec3(0.95, 0.46, 0.24) * twilight * clamp(rim * 1.4 + 0.3, 0.0, 1.0);

        vec3 col = mix(darkSide, litDay, dayWeight) + atmosphere + scatter;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
    fog: false,
  });

  const mesh = new THREE.Mesh(geo, mat);
  return {
    mesh,
    material: mat,
    disposeTextures: () => {
      dayTex?.dispose();
      nightTex?.dispose();
    },
  };
}

/**
 * Create soft starburst solar diffraction rays sprite layered over the 3D Sun disk.
 */
export function createSolarRaysTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return null;

  const cx = size / 2;
  const cy = size / 2;
  ctx.clearRect(0, 0, size, size);

  const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, size / 2);
  g.addColorStop(0.0, 'rgba(255, 253, 240, 1.0)');
  g.addColorStop(0.14, 'rgba(254, 240, 138, 0.72)');
  g.addColorStop(0.42, 'rgba(251, 191, 36, 0.16)');
  g.addColorStop(1.0, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);

  // 6 crisp subtle optical diffraction flare spikes
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * Math.PI) / 3);
    const rayGrad = ctx.createLinearGradient(-cx, 0, cx, 0);
    rayGrad.addColorStop(0.0, 'rgba(254, 243, 199, 0)');
    rayGrad.addColorStop(0.5, 'rgba(255, 251, 235, 0.45)');
    rayGrad.addColorStop(1.0, 'rgba(254, 243, 199, 0)');
    ctx.fillStyle = rayGrad;
    ctx.fillRect(-cx, -1.6, size, 3.2);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Return key real sky anchor points for the toggleable Sky Guide HUD overlay.
 */
export const SKY_GUIDE_ANCHORS: Array<{
  id: string;
  label: string;
  kind: 'galaxy' | 'nebula' | 'star';
  raDeg: number;
  decDeg: number;
}> = [
  ...DEEP_SKY_OBJECTS.map((d) => ({
    id: d.id,
    label: d.name,
    kind: (d.kind === 'galaxy' ? 'galaxy' : 'nebula') as 'galaxy' | 'nebula',
    raDeg: d.raDeg,
    decDeg: d.decDeg,
  })),
  ...BRIGHT_STARS.filter((s) => s.isAnchor).map((s) => ({
    id: s.id,
    label: s.name,
    kind: 'star' as const,
    raDeg: s.raDeg,
    decDeg: s.decDeg,
  })),
];

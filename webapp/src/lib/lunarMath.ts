import type {
  ClientDemBundle,
  ComputeOptions,
  Countdown,
  DecodedDemGrid,
  DecodedDemPatch,
  DemGridDescriptor,
  DemManifest,
  Drift240m,
  EclipseData,
  EclipseEvent,
  EphemerisData,
  InstantMetrics,
  OperationalWindow,
  OperationalWindowKind,
  PolarDemPatchRaw,
  SeasonalMarker,
  SiteData,
  SiteMetrics2m,
  SolarPowerInstant,
  TerrainSource,
  TerrainStats,
  WindowPoint,
  WindowSummary,
} from '../types/lunar';

export const R0_M = 1737400.0;
export const AU_KM = 149597870.7;
export const SUN_RADIUS_DEG = 0.266;
export const EARTH_RADIUS_KM = 6378.137;
export const DEFAULT_WINDOW_HOURS = 336;
export const LUNAR_DAY_HOURS = 709;

export const RISE_SET_DEFINITION_TEXT =
  'Sunrise/Sunset uses the solar upper-limb threshold (any part of the 0.266° radius disk above the local horizon, evaluated at 1-hour ephemeris steps). Earthrise/Earthset uses the Earth center relative to the local horizon plus the selected DTE elevation mask.';

export const POWER_ASSUMPTION_TEXT =
  'Relative array output (% of a sun-tracking perpendicular panel at 100% unoccluded disk): tracking vertical panel = visible solar disk fraction (with terrain & geometric eclipse obscuration); horizontal panel = visible solar disk fraction × max(0, sin(sun elevation)). Excludes dust, temperature, cell efficiency, and lander self-shadowing.';

export const ECLIPSE_ASSUMPTION_TEXT =
  'Geometric solar eclipse obscuration is evaluated at the site using JPL Horizons Sun/Earth topocentric directions and circular disk intersection (Earth angular radius = asin(6378.137 km / Earth–Moon distance), solar radius = 0.266°). Atmospheric refraction and penumbral shadow enlargement are omitted.';

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;
const MAST_STOPS = [0.5, 2, 10, 20, 50];
const MAST_KEYS = ['0.5', '2', '10', '20', '50'];

// Precomputed 480 log-spaced ray-marching distances from 120 m to 200 km matching pipeline parameters
const RAY_DIST_COUNT = 480;
const RAY_DIST_MIN_M = 120.0;
const RAY_DIST_MAX_M = 200000.0;
const RAY_STH = new Float64Array(RAY_DIST_COUNT);
const RAY_CTH = new Float64Array(RAY_DIST_COUNT);
const RAY_KM = new Float64Array(RAY_DIST_COUNT);
for (let i = 0; i < RAY_DIST_COUNT; i++) {
  const sM = RAY_DIST_MIN_M * Math.pow(RAY_DIST_MAX_M / RAY_DIST_MIN_M, i / (RAY_DIST_COUNT - 1));
  const th = sM / R0_M;
  RAY_STH[i] = Math.sin(th);
  RAY_CTH[i] = Math.cos(th);
  RAY_KM[i] = sM / 1000.0;
}

const AZ_SIN = new Float64Array(360);
const AZ_COS = new Float64Array(360);
for (let az = 0; az < 360; az++) {
  const rad = az * DEG2RAD;
  AZ_SIN[az] = Math.sin(rad);
  AZ_COS[az] = Math.cos(rad);
}

/**
 * Spherical horizon dip angle in degrees for an observer mast at height h_mast (m)
 * above a smooth sphere of lunar mean radius R0_M = 1,737,400 m.
 * At 2 m mast height: -0.0869 deg.
 */
export function sphericalHorizonDipDeg(mastHeightM: number): number {
  const h = Math.max(0.0, mastHeightM);
  if (h === 0.0) return 0.0;
  return -Math.acos(R0_M / (R0_M + h)) * RAD2DEG;
}

export function decodeDemPatch(raw: PolarDemPatchRaw): DecodedDemPatch {
  const elevBin = atob(raw.elev_i16_b64);
  const elevBytes = new Uint8Array(elevBin.length);
  for (let i = 0; i < elevBin.length; i++) {
    elevBytes[i] = elevBin.charCodeAt(i);
  }
  const elev = new Int16Array(elevBytes.buffer);

  const slopeBin = atob(raw.slope_u8_b64);
  const slopeU8 = new Uint8Array(slopeBin.length);
  for (let i = 0; i < slopeBin.length; i++) {
    slopeU8[i] = slopeBin.charCodeAt(i);
  }

  return {
    gridSize: raw.grid_size,
    mpp: raw.mpp,
    extentKm: raw.extent_km,
    elevMinM: raw.elev_min_m,
    elevMaxM: raw.elev_max_m,
    slopeScaleDeg: raw.slope_scale_deg,
    elev,
    slopeU8,
  };
}

/**
 * Decode a single little-endian int16 binary DEM grid according to I6 manifest metadata.
 */
export function decodeDemGrid(desc: DemGridDescriptor, buffer: ArrayBuffer): DecodedDemGrid {
  const expectedCount = desc.n_cols * desc.n_rows;
  const expectedBytes = expectedCount * 2;
  if (buffer.byteLength < expectedBytes) {
    throw new Error(
      `DEM buffer for ${desc.file} is truncated: expected ${expectedBytes} bytes, got ${buffer.byteLength}`,
    );
  }

  // Ensure little-endian safe Int16Array copy aligned cleanly
  const view = new DataView(buffer, 0, expectedBytes);
  const elev = new Int16Array(expectedCount);
  for (let i = 0; i < expectedCount; i++) {
    elev[i] = view.getInt16(i * 2, true);
  }

  return {
    nCols: desc.n_cols,
    nRows: desc.n_rows,
    mppM: desc.mpp_m,
    x0M: desc.x0_m,
    y0M: desc.y0_m,
    scaleM: desc.scale_m ?? 1.0,
    elev,
  };
}

function joinDataUrl(baseUrl: string, fileName: string): string {
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cleanFile = fileName.replace(/^\/+/, '');
  if (cleanFile.startsWith('data/')) return `${cleanBase}${cleanFile}`;
  return `${cleanBase}data/${cleanFile}`;
}

/**
 * Lazy-load dem_manifest.json along with dem_fine_240m.i16 and dem_coarse_1200m_max.i16.
 */
export async function loadClientDemBundle(baseUrl = './'): Promise<ClientDemBundle> {
  const manifestUrl = joinDataUrl(baseUrl, 'dem_manifest.json');
  const manifestRes = await fetch(manifestUrl);
  if (!manifestRes.ok) {
    throw new Error(`Failed to fetch DEM manifest (${manifestRes.status}): ${manifestUrl}`);
  }
  const manifest = (await manifestRes.json()) as DemManifest;
  const vQuery = manifest.data_version ? `?v=${encodeURIComponent(manifest.data_version)}` : '';

  const [fineRes, coarseRes] = await Promise.all([
    fetch(`${joinDataUrl(baseUrl, manifest.fine.file)}${vQuery}`),
    fetch(`${joinDataUrl(baseUrl, manifest.coarse.file)}${vQuery}`),
  ]);
  if (!fineRes.ok) {
    throw new Error(`Failed to fetch fine DEM grid (${fineRes.status}): ${manifest.fine.file}`);
  }
  if (!coarseRes.ok) {
    throw new Error(`Failed to fetch coarse DEM grid (${coarseRes.status}): ${manifest.coarse.file}`);
  }

  const [fineBuf, coarseBuf] = await Promise.all([fineRes.arrayBuffer(), coarseRes.arrayBuffer()]);

  return {
    manifest,
    fine: decodeDemGrid(manifest.fine, fineBuf),
    coarse: decodeDemGrid(manifest.coarse, coarseBuf),
  };
}

export function ll2xyKm(latDeg: number, lonDeg: number): [number, number] {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const rhoKm = (2.0 * (R0_M / 1000.0)) * Math.tan((0.5 * Math.PI - Math.abs(lat)) * 0.5);
  return [rhoKm * Math.sin(lon), rhoKm * Math.cos(lon)];
}

export function xyKm2ll(xKm: number, yKm: number): [number, number] {
  const rhoM = Math.hypot(xKm, yKm) * 1000.0;
  const lat = -90.0 + RAD2DEG * (2.0 * Math.atan((0.5 * rhoM) / R0_M));
  let lon = RAD2DEG * Math.atan2(xKm, yKm);
  lon = ((lon + 180.0) % 360.0 + 360.0) % 360.0 - 180.0;
  return [lat, lon];
}

/**
 * Exact ENU vector geometry ported from lunar_geom.py (verified <= 0.006 deg vs JPL Horizons).
 */
export function computeAzEl(
  siteLatDeg: number,
  siteLonDeg: number,
  siteElevM: number,
  subLonDeg: number,
  subLatDeg: number,
  targetDistKm: number,
): { azDeg: number; elDeg: number } {
  const clampedLat = Math.max(-89.99999, Math.min(89.99999, siteLatDeg));
  const phi = clampedLat * DEG2RAD;
  const lam = siteLonDeg * DEG2RAD;

  const sp = Math.sin(phi);
  const cp = Math.cos(phi);
  const sl = Math.sin(lam);
  const cl = Math.cos(lam);

  // Up, East, North unit vectors in MOON_ME
  const ux = cp * cl, uy = cp * sl, uz = sp;
  const ex = -sl, ey = cl, ez = 0.0;
  const nx = uy * ez - uz * ey;
  const ny = uz * ex - ux * ez;
  const nz = ux * ey - uy * ex;

  const rSiteKm = (R0_M + siteElevM) / 1000.0;
  const sx = ux * rSiteKm;
  const sy = uy * rSiteKm;
  const sz = uz * rSiteKm;

  const tLat = subLatDeg * DEG2RAD;
  const tLon = subLonDeg * DEG2RAD;
  const cTlat = Math.cos(tLat);
  const tx = cTlat * Math.cos(tLon) * targetDistKm;
  const ty = cTlat * Math.sin(tLon) * targetDistKm;
  const tz = Math.sin(tLat) * targetDistKm;

  const dx = tx - sx;
  const dy = ty - sy;
  const dz = tz - sz;
  const dNorm = Math.sqrt(dx * dx + dy * dy + dz * dz);

  const du = (dx * ux + dy * uy + dz * uz) / dNorm;
  const de = dx * ex + dy * ey + dz * ez;
  const dn = dx * nx + dy * ny + dz * nz;

  const elDeg = Math.asin(Math.max(-1.0, Math.min(1.0, du))) * RAD2DEG;
  let azDeg = Math.atan2(de, dn) * RAD2DEG;
  azDeg = ((azDeg % 360.0) + 360.0) % 360.0;

  return { azDeg, elDeg };
}

export function horizonAtAz(azDeg: number, hz360: number[]): number {
  const normAz = ((azDeg % 360.0) + 360.0) % 360.0;
  const i0 = Math.floor(normAz) % 360;
  const i1 = (i0 + 1) % 360;
  const f = normAz - Math.floor(normAz);
  return hz360[i0] * (1.0 - f) + hz360[i1] * f;
}

export function diskFractionAbove(elDeg: number, hzDeg: number, radiusDeg = SUN_RADIUS_DEG): number {
  const d = Math.max(-1.0, Math.min(1.0, (elDeg - hzDeg) / radiusDeg));
  if (d >= 1.0) return 1.0;
  if (d <= -1.0) return 0.0;
  return 1.0 - (Math.acos(d) - d * Math.sqrt(1.0 - d * d)) / Math.PI;
}

export function interpolateHorizon(site: SiteData, mastHeightM: number): number[] {
  if (site.terrain_source === 'NONE') {
    const dip = Number(sphericalHorizonDipDeg(Math.max(0.0, mastHeightM)).toFixed(4));
    return new Array<number>(360).fill(dip);
  }

  const clamped = Math.max(0.5, Math.min(50.0, mastHeightM));
  let loIdx = 0;
  for (let i = 0; i < MAST_STOPS.length - 1; i++) {
    if (clamped >= MAST_STOPS[i]) loIdx = i;
  }
  const hiIdx = Math.min(loIdx + 1, MAST_STOPS.length - 1);
  const fallback = site.horizons_by_mast['2'] ?? new Array<number>(360).fill(0.0);
  if (loIdx === hiIdx) {
    return site.horizons_by_mast[MAST_KEYS[loIdx]] ?? fallback;
  }
  const hLo = site.horizons_by_mast[MAST_KEYS[loIdx]] ?? fallback;
  const hHi = site.horizons_by_mast[MAST_KEYS[hiIdx]] ?? fallback;
  const t = (clamped - MAST_STOPS[loIdx]) / (MAST_STOPS[hiIdx] - MAST_STOPS[loIdx]);
  const out = new Array<number>(360);
  for (let a = 0; a < 360; a++) {
    out[a] = hLo[a] * (1.0 - t) + hHi[a] * t;
  }
  return out;
}

function samplePatchBilinear(arr: Int16Array, n: number, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= n - 1 || row >= n - 1) return NaN;
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const dc = col - c0;
  const dr = row - r0;
  return (
    arr[r0 * n + c0] * (1 - dc) * (1 - dr) +
    arr[r0 * n + c0 + 1] * dc * (1 - dr) +
    arr[(r0 + 1) * n + c0] * (1 - dc) * dr +
    arr[(r0 + 1) * n + c0 + 1] * dc * dr
  );
}

export function isInsideDemGrid(grid: DecodedDemGrid, xM: number, yM: number): boolean {
  const col = (xM - grid.x0M) / grid.mppM;
  const row = (grid.y0M - yM) / grid.mppM;
  return col >= 0.0 && row >= 0.0 && col < grid.nCols - 1 && row < grid.nRows - 1;
}

export function sampleDemGridBilinear(grid: DecodedDemGrid, xM: number, yM: number): number {
  const col = (xM - grid.x0M) / grid.mppM;
  const row = (grid.y0M - yM) / grid.mppM;
  if (col < 0.0 || row < 0.0 || col >= grid.nCols - 1 || row >= grid.nRows - 1) {
    return NaN;
  }
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const dc = col - c0;
  const dr = row - r0;
  const w = grid.nCols;
  const idx = r0 * w + c0;
  const raw =
    grid.elev[idx] * (1.0 - dc) * (1.0 - dr) +
    grid.elev[idx + 1] * dc * (1.0 - dr) +
    grid.elev[idx + w] * (1.0 - dc) * dr +
    grid.elev[idx + w + 1] * dc * dr;
  return raw * grid.scaleM;
}

/**
 * Compute central-difference terrain slope (degrees) at pixel (r, c) on a DecodedDemGrid,
 * matching numpy.gradient(dem, mpp).
 */
export function computeGridSlopeDegAt(grid: DecodedDemGrid, r: number, c: number): number {
  const ri = Math.max(0, Math.min(grid.nRows - 1, r));
  const ci = Math.max(0, Math.min(grid.nCols - 1, c));
  const w = grid.nCols;
  const scale = grid.scaleM;
  const mpp = grid.mppM;

  let gx: number;
  if (ci === 0) {
    gx = ((grid.elev[ri * w + 1] - grid.elev[ri * w]) * scale) / mpp;
  } else if (ci === w - 1) {
    gx = ((grid.elev[ri * w + ci] - grid.elev[ri * w + ci - 1]) * scale) / mpp;
  } else {
    gx = ((grid.elev[ri * w + ci + 1] - grid.elev[ri * w + ci - 1]) * scale) / (2.0 * mpp);
  }

  let gy: number;
  if (ri === 0) {
    gy = ((grid.elev[w + ci] - grid.elev[ci]) * scale) / mpp;
  } else if (ri === grid.nRows - 1) {
    gy = ((grid.elev[ri * w + ci] - grid.elev[(ri - 1) * w + ci]) * scale) / mpp;
  } else {
    gy = ((grid.elev[(ri + 1) * w + ci] - grid.elev[(ri - 1) * w + ci]) * scale) / (2.0 * mpp);
  }

  return Math.atan(Math.hypot(gx, gy)) * RAD2DEG;
}

function linearPercentile(sorted: Float32Array, pct: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const pos = (pct / 100.0) * (n - 1);
  const lo = Math.floor(pos);
  const hi = Math.min(n - 1, lo + 1);
  const frac = pos - lo;
  return sorted[lo] * (1.0 - frac) + sorted[hi] * frac;
}

/**
 * Compute 30 km x 30 km baseline topographic statistics around (centerXM, centerYM)
 * from the 240 m fine grid (half_box_px = 62 -> 125x125 box).
 */
export function computeGridTerrainStats30km(
  fine: DecodedDemGrid,
  centerXM: number,
  centerYM: number,
): TerrainStats | null {
  const colF = (centerXM - fine.x0M) / fine.mppM;
  const rowF = (fine.y0M - centerYM) / fine.mppM;
  if (colF < 0 || rowF < 0 || colF >= fine.nCols || rowF >= fine.nRows) {
    return null;
  }

  const ci = Math.max(0, Math.min(fine.nCols - 1, Math.round(colF)));
  const ri = Math.max(0, Math.min(fine.nRows - 1, Math.round(rowF)));
  const halfBoxPx = 62;
  const r0 = Math.max(0, ri - halfBoxPx);
  const r1 = Math.min(fine.nRows, ri + halfBoxPx + 1);
  const c0 = Math.max(0, ci - halfBoxPx);
  const c1 = Math.min(fine.nCols, ci + halfBoxPx + 1);
  const count = (r1 - r0) * (c1 - c0);
  if (count <= 0) return null;

  const elevArr = new Float32Array(count);
  const slopeArr = new Float32Array(count);
  let elevMin = Infinity;
  let elevMax = -Infinity;
  let slopeSum = 0.0;
  let safe5Count = 0;
  let rover15Count = 0;
  let k = 0;

  for (let r = r0; r < r1; r++) {
    const rowOff = r * fine.nCols;
    for (let c = c0; c < c1; c++) {
      const eM = fine.elev[rowOff + c] * fine.scaleM;
      const sDeg = computeGridSlopeDegAt(fine, r, c);
      elevArr[k] = eM;
      slopeArr[k] = sDeg;
      if (eM < elevMin) elevMin = eM;
      if (eM > elevMax) elevMax = eM;
      slopeSum += sDeg;
      if (sDeg <= 5.0) safe5Count += 1;
      if (sDeg <= 15.0) rover15Count += 1;
      k += 1;
    }
  }

  elevArr.sort();
  slopeArr.sort();

  const elevMedian = linearPercentile(elevArr, 50);
  const slopeMedian = linearPercentile(slopeArr, 50);
  const slopeP90 = linearPercentile(slopeArr, 90);

  return {
    elev_min_m: Number(elevMin.toFixed(1)),
    elev_median_m: Number(elevMedian.toFixed(1)),
    elev_max_m: Number(elevMax.toFixed(1)),
    elev_relief_m: Number((elevMax - elevMin).toFixed(1)),
    slope_mean_deg: Number((slopeSum / count).toFixed(2)),
    slope_median_deg: Number(slopeMedian.toFixed(2)),
    slope_p90_deg: Number(slopeP90.toFixed(2)),
    pct_safe_hls_le_5deg: Number(((safe5Count / count) * 100.0).toFixed(1)),
    pct_rover_le_15deg: Number(((rover15Count / count) * 100.0).toFixed(1)),
  };
}

function isClientDemBundle(src: DecodedDemPatch | ClientDemBundle): src is ClientDemBundle {
  return 'fine' in src && 'coarse' in src;
}

/**
 * Unified 360-deg horizon and blocking-distance ray-marching from either a ClientDemBundle
 * (480 log-spaced steps 120 m..200 km, fine 240 m inside ±150 km and coarse 1200 m outside
 * without breaking rays) or a fallback DecodedDemPatch.
 */
export function computePolarHorizonAndBlocking(
  demSource: DecodedDemPatch | ClientDemBundle,
  xKm: number,
  yKm: number,
  mastHeightM: number,
): { hz: number[]; bd: number[]; h0: number; source: TerrainSource } {
  const [rawLatDeg, lonDeg] = xyKm2ll(xKm, yKm);
  const phi1 = Math.max(-89.9999, Math.min(-75.0, rawLatDeg)) * DEG2RAD;
  const lam1 = lonDeg * DEG2RAD;
  const sphi1 = Math.sin(phi1);
  const cphi1 = Math.cos(phi1);
  const dipDeg = sphericalHorizonDipDeg(mastHeightM);

  if (isClientDemBundle(demSource)) {
    const xM = xKm * 1000.0;
    const yM = yKm * 1000.0;
    let h0 = sampleDemGridBilinear(demSource.fine, xM, yM);
    let source: TerrainSource = 'LOLA_240M';
    if (Number.isNaN(h0)) {
      h0 = sampleDemGridBilinear(demSource.coarse, xM, yM);
      source = Number.isNaN(h0) ? 'NONE' : 'LOLA_1200M_COARSE';
    }

    if (source === 'NONE') {
      const dip = Number(dipDeg.toFixed(3));
      return {
        hz: new Array<number>(360).fill(dip),
        bd: new Array<number>(360).fill(0.0),
        h0: 0.0,
        source: 'NONE',
      };
    }

    const ro = R0_M + h0 + mastHeightM;
    const hz = new Array<number>(360);
    const bd = new Array<number>(360);
    const fine = demSource.fine;
    const coarse = demSource.coarse;

    for (let az = 0; az < 360; az++) {
      const sa = AZ_SIN[az];
      const ca = AZ_COS[az];
      let bestEl = -Math.PI * 0.5;
      let bestDistKm = 200.0;
      let hadSample = false;

      for (let step = 0; step < RAY_DIST_COUNT; step++) {
        const sth = RAY_STH[step];
        const cth = RAY_CTH[step];
        const sphi2 = sphi1 * cth + cphi1 * sth * ca;
        const phi2 = Math.asin(Math.max(-1.0, Math.min(1.0, sphi2)));
        const lam2 = lam1 + Math.atan2(sa * sth * cphi1, cth - sphi1 * sphi2);
        const rhoM = 2.0 * R0_M * Math.tan((0.5 * Math.PI - Math.abs(phi2)) * 0.5);
        const pxM = rhoM * Math.sin(lam2);
        const pyM = rhoM * Math.cos(lam2);

        let ht = sampleDemGridBilinear(fine, pxM, pyM);
        if (Number.isNaN(ht)) {
          ht = sampleDemGridBilinear(coarse, pxM, pyM);
        }
        if (Number.isNaN(ht)) {
          continue; // Never break rays early when stepping outside DEM coverage
        }

        hadSample = true;
        const rt = R0_M + ht;
        const el = Math.atan2(rt * cth - ro, rt * sth);
        if (el > bestEl) {
          bestEl = el;
          bestDistKm = RAY_KM[step];
        }
      }

      hz[az] = hadSample ? Number((bestEl * RAD2DEG).toFixed(3)) : Number(dipDeg.toFixed(3));
      bd[az] = Number(bestDistKm.toFixed(2));
    }

    return { hz, bd, h0, source };
  }

  // Fallback legacy DecodedDemPatch mode (1.2 km/px coarse patch)
  const patch = demSource;
  const n = patch.gridSize;
  const mppKm = patch.mpp / 1000.0;
  const half = n * 0.5 - 0.5;
  const cObs = xKm / mppKm + half;
  const rObs = -yKm / mppKm + half;

  const rawElev = samplePatchBilinear(patch.elev, n, cObs, rObs);
  if (Number.isNaN(rawElev)) {
    const dip = Number(dipDeg.toFixed(3));
    return {
      hz: new Array<number>(360).fill(dip),
      bd: new Array<number>(360).fill(0.0),
      h0: 0.0,
      source: 'NONE',
    };
  }

  const h0 = rawElev;
  const ro = R0_M + h0 + mastHeightM;
  const hz = new Array<number>(360);
  const bd = new Array<number>(360);

  for (let az = 0; az < 360; az++) {
    const sa = AZ_SIN[az];
    const ca = AZ_COS[az];
    let bestEl = -Math.PI * 0.5;
    let bestDistKm = patch.extentKm;
    let hadSample = false;

    for (let step = 0; step < 160; step++) {
      const sM = 900.0 * Math.pow(200000.0 / 900.0, step / 159.0);
      const th = sM / R0_M;
      const sth = Math.sin(th);
      const cth = Math.cos(th);
      const sphi2 = sphi1 * cth + cphi1 * sth * ca;
      const phi2 = Math.asin(Math.max(-1.0, Math.min(1.0, sphi2)));
      const lam2 = lam1 + Math.atan2(sa * sth * cphi1, cth - sphi1 * sphi2);
      const rhoKm = (2.0 * (R0_M / 1000.0)) * Math.tan((0.5 * Math.PI - Math.abs(phi2)) * 0.5);
      const pxKm = rhoKm * Math.sin(lam2);
      const pyKm = rhoKm * Math.cos(lam2);
      const col = pxKm / mppKm + half;
      const row = -pyKm / mppKm + half;
      const ht = samplePatchBilinear(patch.elev, n, col, row);
      if (Number.isNaN(ht)) continue;
      hadSample = true;
      const rt = R0_M + ht;
      const el = Math.atan2(rt * cth - ro, rt * sth);
      if (el > bestEl) {
        bestEl = el;
        bestDistKm = sM / 1000.0;
      }
    }
    hz[az] = hadSample ? Number((bestEl * RAD2DEG).toFixed(3)) : Number(dipDeg.toFixed(3));
    bd[az] = Number(bestDistKm.toFixed(2));
  }

  return { hz, bd, h0, source: 'LOLA_1200M_COARSE' };
}

/**
 * Compute only the 360-deg horizon elevation array for a custom polar coordinate
 * without reconstructing a full SiteData or running 26-month metrics (I2 / DATA-1).
 */
export function computeCustomPolarHorizon(
  demSource: DecodedDemPatch | ClientDemBundle,
  xKm: number,
  yKm: number,
  mastHeightM: number,
): number[] {
  return computePolarHorizonAndBlocking(demSource, xKm, yKm, mastHeightM).hz;
}

/**
 * Site-level geometric solar eclipse evaluation (SCI-1) using topocentric Sun/Earth
 * angular separation and circular disk intersection (atmospheric refraction omitted).
 */
export function computeInstantEclipse(
  sunAzEl: { azDeg: number; elDeg: number },
  earthAzEl: { azDeg: number; elDeg: number },
  earthDistKm: number,
  activeEvent: EclipseEvent | null = null,
): EclipseData {
  const safeDistKm = Math.max(EARTH_RADIUS_KM, earthDistKm);
  const earthAngularRadiusDeg = Math.asin(Math.min(1.0, EARTH_RADIUS_KM / safeDistKm)) * RAD2DEG;
  const sunAngularRadiusDeg = SUN_RADIUS_DEG;

  const dEl = (sunAzEl.elDeg - earthAzEl.elDeg) * DEG2RAD;
  const dAz = (sunAzEl.azDeg - earthAzEl.azDeg) * DEG2RAD;
  const a =
    Math.sin(dEl * 0.5) ** 2 +
    Math.cos(sunAzEl.elDeg * DEG2RAD) * Math.cos(earthAzEl.elDeg * DEG2RAD) * Math.sin(dAz * 0.5) ** 2;
  const angularSepDeg = 2.0 * Math.asin(Math.min(1.0, Math.sqrt(Math.max(0.0, a)))) * RAD2DEG;

  let obscuredFrac = 0.0;
  let siteType: 'none' | 'partial' | 'total' = 'none';

  const r1 = sunAngularRadiusDeg;
  const r2 = earthAngularRadiusDeg;
  const d = angularSepDeg;

  if (d < r1 + r2) {
    if (d <= Math.abs(r2 - r1)) {
      obscuredFrac = r2 >= r1 ? 1.0 : Math.min(1.0, (r2 * r2) / (r1 * r1));
    } else {
      const arg1 = Math.max(-1.0, Math.min(1.0, (d * d + r1 * r1 - r2 * r2) / (2.0 * d * r1)));
      const arg2 = Math.max(-1.0, Math.min(1.0, (d * d + r2 * r2 - r1 * r1) / (2.0 * d * r2)));
      const underSqrt = Math.max(0.0, (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
      const overlap = r1 * r1 * Math.acos(arg1) + r2 * r2 * Math.acos(arg2) - 0.5 * Math.sqrt(underSqrt);
      obscuredFrac = Math.max(0.0, Math.min(1.0, overlap / (Math.PI * r1 * r1)));
    }

    if (obscuredFrac >= 0.9999) {
      obscuredFrac = 1.0;
      siteType = 'total';
    } else if (obscuredFrac > 0.0) {
      siteType = 'partial';
    }
  }

  return {
    event: activeEvent,
    obscuredFrac,
    angularSepDeg,
    earthAngularRadiusDeg,
    sunAngularRadiusDeg,
    siteType,
  };
}

/**
 * Compute full-ephemeris baseline metrics at 1-hour resolution, incorporating geometric
 * eclipses (unless options.applyEclipses === false) and earthMaskDeg.
 * Always leaves viability_score and archetype null so scoring.ts remains the single source.
 */
export function computeSite26MonthMetrics(
  eph: EphemerisData,
  siteLat: number,
  siteLon: number,
  siteElevM: number,
  hz360: number[],
  _terrainStats?: TerrainStats | null,
  options?: ComputeOptions,
): SiteMetrics2m {
  const dtHours = eph.dt_hours || 1;
  const earthMaskDeg = options?.earthMaskDeg ?? 0.0;
  const applyEclipses = options?.applyEclipses !== false;
  const n = eph.n;

  let total = 0;
  let sunAcc = 0.0;
  let sunTimeAcc = 0;
  let noTerrainSunTimeAcc = 0;
  let earthAcc = 0;
  let bothAcc = 0;

  let sunRun = 0;
  let maxSunRun = 0;
  let darkRun = 0;
  let maxDarkRun = 0;
  let earthGapRun = 0;
  let maxEarthGapRun = 0;

  for (let t = 0; t < n; t += 1) {
    const sun = computeAzEl(siteLat, siteLon, siteElevM, eph.subsolar_lon[t], eph.subsolar_lat[t], AU_KM);
    const earth = computeAzEl(
      siteLat,
      siteLon,
      siteElevM,
      eph.subearth_lon[t],
      eph.subearth_lat[t],
      eph.earth_dist_km[t],
    );
    const sunHz = horizonAtAz(sun.azDeg, hz360);
    const earthHz = horizonAtAz(earth.azDeg, hz360);
    let sunFrac = diskFractionAbove(sun.elDeg, sunHz);

    if (applyEclipses && sunFrac > 0.0 && Math.abs(sun.elDeg - earth.elDeg) < 1.5) {
      const ec = computeInstantEclipse(sun, earth, eph.earth_dist_km[t], null);
      if (ec.obscuredFrac > 0.0) {
        sunFrac *= 1.0 - ec.obscuredFrac;
      }
    }

    const sunVisNow = sunFrac > 0.0;
    const noTerrainSunVisNow = diskFractionAbove(sun.elDeg, 0.0) > 0.0;
    const earthVisNow = earth.elDeg > earthHz + earthMaskDeg;
    const bothNow = sunVisNow && earthVisNow;

    total += 1;
    sunAcc += sunFrac;
    if (sunVisNow) sunTimeAcc += 1;
    if (noTerrainSunVisNow) noTerrainSunTimeAcc += 1;
    if (earthVisNow) earthAcc += 1;
    if (bothNow) bothAcc += 1;

    if (sunVisNow) {
      sunRun += dtHours;
      if (sunRun > maxSunRun) maxSunRun = sunRun;
      darkRun = 0;
    } else {
      darkRun += dtHours;
      if (darkRun > maxDarkRun) maxDarkRun = darkRun;
      sunRun = 0;
    }

    if (!earthVisNow) {
      earthGapRun += dtHours;
      if (earthGapRun > maxEarthGapRun) maxEarthGapRun = earthGapRun;
    } else {
      earthGapRun = 0;
    }
  }

  const denom = Math.max(1, total);
  const sunTimePct = (sunTimeAcc / denom) * 100.0;
  const sunVisPct = (sunAcc / denom) * 100.0;
  const noTerrainPct = (noTerrainSunTimeAcc / denom) * 100.0;
  const earthPct = (earthAcc / denom) * 100.0;
  const bothPct = (bothAcc / denom) * 100.0;

  return {
    sun_no_terrain_pct: Number(noTerrainPct.toFixed(1)),
    sun_time_pct: Number(sunTimePct.toFixed(1)),
    sun_visible_pct: Number(sunVisPct.toFixed(1)),
    earth_visible_pct: Number(earthPct.toFixed(1)),
    both_visible_pct: Number(bothPct.toFixed(1)),
    longest_sun_days: Number((maxSunRun / 24.0).toFixed(2)),
    max_dark_days: Number((maxDarkRun / 24.0).toFixed(2)),
    earth_max_gap_days: Number((maxEarthGapRun / 24.0).toFixed(2)),
    viability_score: null,
    archetype: null,
  };
}

function emptyMetricsZeroed(): SiteMetrics2m {
  return {
    sun_no_terrain_pct: 0,
    sun_time_pct: 0,
    sun_visible_pct: 0,
    earth_visible_pct: 0,
    both_visible_pct: 0,
    longest_sun_days: 0,
    max_dark_days: 0,
    earth_max_gap_days: 0,
    viability_score: null,
    archetype: null,
  };
}

function buildSphericalProbeSite(
  rawLatDeg: number,
  lonDeg: number,
  mastHeightM: number,
  eph?: EphemerisData,
  options?: ComputeOptions,
): SiteData {
  const latDeg = Math.max(-90.0, Math.min(90.0, rawLatDeg));
  const safeLat = Math.max(-89.99999, Math.min(89.99999, latDeg));

  const horizons_by_mast: Record<string, number[]> = {};
  for (let i = 0; i < MAST_STOPS.length; i++) {
    const dip = Number(sphericalHorizonDipDeg(MAST_STOPS[i]).toFixed(4));
    horizons_by_mast[MAST_KEYS[i]] = new Array<number>(360).fill(dip);
  }
  const currentDip = Number(sphericalHorizonDipDeg(Math.max(0.0, mastHeightM)).toFixed(4));
  const hz2m = horizons_by_mast['2'];
  if (!MAST_STOPS.includes(mastHeightM)) {
    horizons_by_mast[String(mastHeightM)] = new Array<number>(360).fill(currentDip);
  }

  const metrics2m: SiteMetrics2m = eph
    ? computeSite26MonthMetrics(eph, safeLat, lonDeg, 0.0, hz2m, null, options)
    : emptyMetricsZeroed();

  return {
    id: 'custom_pin',
    name: `Custom Probe (${latDeg.toFixed(3)}°, ${lonDeg.toFixed(2)}°)`,
    short_name: 'Custom Probe',
    category: 'Custom Coordinate',
    program: 'Smooth Sphere (No Local DEM)',
    description:
      'Coordinate is outside LOLA South Pole DEM coverage (75°S–90°S). Uses smooth spherical limb geometry with mast-height horizon dip; terrain statistics are unavailable.',
    terrain_source: 'NONE',
    is_polar_dem: false,
    elev_source: 'APPROXIMATE',
    lat: Number(safeLat.toFixed(5)),
    lon: Number(lonDeg.toFixed(4)),
    polar_x_km: null,
    polar_y_km: null,
    elev_m: 0.0,
    local_slope_deg: null,
    terrain_stats: null,
    metrics_2m: metrics2m,
    drift_240m: null,
    horizons_by_mast,
    blocking_dist_km: null,
    isCustom: true,
  };
}

/**
 * Live client-side polar ray-marching for a custom coordinate (xKm, yKm).
 * Uses the unified 240 m + 1200 m ClientDemBundle when provided; falls back cleanly
 * to the 1.2 km DecodedDemPatch when clientDem is absent, or NONE if outside DEM.
 */
export function buildCustomPolarSite(
  patch: DecodedDemPatch | null,
  xKm: number,
  yKm: number,
  mastHeightM: number,
  eph?: EphemerisData,
  clientDem?: ClientDemBundle | null,
  options?: ComputeOptions,
): SiteData {
  const [rawLatDeg, lonDeg] = xyKm2ll(xKm, yKm);
  const safeLatDeg = Math.max(-89.99999, Math.min(89.99999, rawLatDeg));

  const demSource: DecodedDemPatch | ClientDemBundle | null = clientDem ?? patch;
  if (!demSource) {
    return buildSphericalProbeSite(rawLatDeg, lonDeg, mastHeightM, eph, options);
  }

  const base2m = computePolarHorizonAndBlocking(demSource, xKm, yKm, 2.0);
  if (base2m.source === 'NONE') {
    return buildSphericalProbeSite(rawLatDeg, lonDeg, mastHeightM, eph, options);
  }

  const currentM =
    mastHeightM === 2.0 ? base2m : computePolarHorizonAndBlocking(demSource, xKm, yKm, mastHeightM);

  const horizons_by_mast: Record<string, number[]> = {};
  for (const key of MAST_KEYS) {
    horizons_by_mast[key] = currentM.hz;
  }
  horizons_by_mast['2'] = base2m.hz;

  let localSlopeDeg: number | null = null;
  let terrainStats: TerrainStats | null = null;
  let drift240m: Drift240m | null = null;

  const h0 = base2m.h0;
  const terrainSource: TerrainSource = base2m.source;

  if (clientDem && terrainSource === 'LOLA_240M') {
    const xM = xKm * 1000.0;
    const yM = yKm * 1000.0;
    const fine = clientDem.fine;
    const colF = (xM - fine.x0M) / fine.mppM;
    const rowF = (fine.y0M - yM) / fine.mppM;
    const ci = Math.max(0, Math.min(fine.nCols - 1, Math.round(colF)));
    const ri = Math.max(0, Math.min(fine.nRows - 1, Math.round(rowF)));

    localSlopeDeg = Number(computeGridSlopeDegAt(fine, ri, ci).toFixed(2));
    terrainStats = computeGridTerrainStats30km(fine, xM, yM);
  }

  const metrics2m: SiteMetrics2m = eph
    ? computeSite26MonthMetrics(eph, safeLatDeg, lonDeg, h0, base2m.hz, terrainStats, options)
    : emptyMetricsZeroed();

  // Unified ±240 m drift sensitivity (DATA-5): 4 cardinal neighbors ±240 m + center pixel
  if (eph && clientDem && terrainSource === 'LOLA_240M') {
    const xM = xKm * 1000.0;
    const yM = yKm * 1000.0;
    const stepM = clientDem.fine.mppM;
    const sunVals: number[] = [metrics2m.sun_visible_pct];
    const offsets: Array<[number, number]> = [
      [stepM, 0],
      [-stepM, 0],
      [0, stepM],
      [0, -stepM],
    ];

    for (const [dxM, dyM] of offsets) {
      const nxM = xM + dxM;
      const nyM = yM + dyM;
      if (!isInsideDemGrid(clientDem.fine, nxM, nyM)) continue;
      const nxKm = nxM / 1000.0;
      const nyKm = nyM / 1000.0;
      const [nRawLat, nLon] = xyKm2ll(nxKm, nyKm);
      const nSafeLat = Math.max(-89.99999, Math.min(89.99999, nRawLat));
      const nProfile = computePolarHorizonAndBlocking(clientDem, nxKm, nyKm, 2.0);
      const nMetrics = computeSite26MonthMetrics(
        eph,
        nSafeLat,
        nLon,
        nProfile.h0,
        nProfile.hz,
        null,
        options,
      );
      sunVals.push(nMetrics.sun_visible_pct);
    }

    drift240m = {
      sun_min_pct: Number(Math.min(...sunVals).toFixed(1)),
      sun_max_pct: Number(Math.max(...sunVals).toFixed(1)),
    };
  }

  return {
    id: 'custom_pin',
    name: `Custom Pin (${rawLatDeg.toFixed(3)}°, ${lonDeg.toFixed(2)}°)`,
    short_name: 'Custom Pin',
    category: 'Custom Coordinate',
    program:
      terrainSource === 'LOLA_240M'
        ? 'Unified DEM Ray-March (240 m fine + 1.2 km coarse)'
        : 'Coarse DEM Ray-March (1.2 km/px)',
    description:
      terrainSource === 'LOLA_240M'
        ? `User-selected coordinate at (${rawLatDeg.toFixed(4)}°, ${lonDeg.toFixed(2)}°E). Horizon and metrics computed live on client from LOLA 240 m + 1.2 km DEM.`
        : `User-selected coordinate at (${rawLatDeg.toFixed(4)}°, ${lonDeg.toFixed(2)}°E) evaluated on coarse 1.2 km LOLA DEM.`,
    terrain_source: terrainSource,
    is_polar_dem: true,
    elev_source: 'DEM',
    lat: Number(safeLatDeg.toFixed(5)),
    lon: Number(lonDeg.toFixed(4)),
    polar_x_km: Number(xKm.toFixed(2)),
    polar_y_km: Number(yKm.toFixed(2)),
    elev_m: Number(h0.toFixed(1)),
    local_slope_deg: localSlopeDeg,
    terrain_stats: terrainStats,
    metrics_2m: metrics2m,
    drift_240m: drift240m,
    horizons_by_mast,
    blocking_dist_km: currentM.bd,
    isCustom: true,
  };
}

/**
 * Probe arbitrary lunar coordinates anywhere on the Moon (-90..90 lat, -180..180 lon).
 * Uses ClientDemBundle when available (covering 75°S–90°S), else DecodedDemPatch (±150 km),
 * else smooth spherical limb horizon with mast-height dip and null terrain stats.
 */
export function buildCustomLatLonSite(
  rawLatDeg: number,
  rawLonDeg: number,
  patch: DecodedDemPatch | null,
  mastHeightM: number,
  eph?: EphemerisData,
  clientDem?: ClientDemBundle | null,
  options?: ComputeOptions,
): SiteData {
  const latDeg = Math.max(-90.0, Math.min(90.0, rawLatDeg));
  const safeLat = Math.max(-89.99999, Math.min(89.99999, latDeg));
  const lonDeg = (((rawLonDeg + 180.0) % 360.0) + 360.0) % 360.0 - 180.0;

  if (latDeg < 0) {
    const [xKm, yKm] = ll2xyKm(safeLat, lonDeg);
    if (clientDem) {
      const xM = xKm * 1000.0;
      const yM = yKm * 1000.0;
      if (isInsideDemGrid(clientDem.fine, xM, yM) || isInsideDemGrid(clientDem.coarse, xM, yM)) {
        return buildCustomPolarSite(patch, xKm, yKm, mastHeightM, eph, clientDem, options);
      }
    } else if (patch !== null && Math.abs(xKm) <= patch.extentKm && Math.abs(yKm) <= patch.extentKm) {
      return buildCustomPolarSite(patch, xKm, yKm, mastHeightM, eph, null, options);
    }
  }

  return buildSphericalProbeSite(latDeg, lonDeg, mastHeightM, eph, options);
}

export function stepIdxToUtcIso(t0Utc: string, idx: number): string {
  const baseMs = Date.parse(t0Utc);
  const dt = new Date(baseMs + idx * 3600 * 1000);
  return dt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

function extractOperationalWindows(
  points: WindowPoint[],
  t0Utc: string,
  dtHours: number,
  kind: OperationalWindowKind,
  predicate: (p: WindowPoint) => boolean,
): OperationalWindow[] {
  const out: OperationalWindow[] = [];
  let startPos = -1;

  for (let i = 0; i < points.length; i++) {
    const active = predicate(points[i]);
    if (active && startPos === -1) {
      startPos = i;
    } else if (!active && startPos !== -1) {
      const endPos = i - 1;
      out.push({
        kind,
        startIdx: points[startPos].idx,
        endIdx: points[endPos].idx,
        startUtc: stepIdxToUtcIso(t0Utc, points[startPos].idx),
        endUtc: stepIdxToUtcIso(t0Utc, points[endPos].idx + 1),
        durationHours: (endPos - startPos + 1) * dtHours,
      });
      startPos = -1;
    }
  }

  if (startPos !== -1) {
    const endPos = points.length - 1;
    out.push({
      kind,
      startIdx: points[startPos].idx,
      endIdx: points[endPos].idx,
      startUtc: stepIdxToUtcIso(t0Utc, points[startPos].idx),
      endUtc: stepIdxToUtcIso(t0Utc, points[endPos].idx + 1),
      durationHours: (endPos - startPos + 1) * dtHours,
    });
  }

  return out;
}

export function computeInstantAndWindow(
  eph: EphemerisData,
  site: SiteData,
  hz360: number[],
  idx: number,
  windowHours = DEFAULT_WINDOW_HOURS,
  options?: ComputeOptions,
): { instant: InstantMetrics; summary: WindowSummary } {
  const dtHours = eph.dt_hours || 1;
  const requestedWindowHours = Math.max(1, Math.round(options?.windowHours ?? windowHours));
  const earthMaskDeg = options?.earthMaskDeg ?? 0.0;
  const applyEclipses = options?.applyEclipses !== false;

  const safeIdx = Math.max(0, Math.min(eph.n - 1, Math.round(idx)));
  const endIdx = Math.min(eph.n, safeIdx + requestedWindowHours);

  const findActiveEclipse = (t: number): EclipseEvent | null => {
    for (const ec of eph.eclipses) {
      if (t >= ec.idx && t < ec.idx + ec.hours) {
        return ec;
      }
    }
    return null;
  };

  const evalStep = (t: number) => {
    const sun = computeAzEl(site.lat, site.lon, site.elev_m, eph.subsolar_lon[t], eph.subsolar_lat[t], AU_KM);
    const earth = computeAzEl(
      site.lat,
      site.lon,
      site.elev_m,
      eph.subearth_lon[t],
      eph.subearth_lat[t],
      eph.earth_dist_km[t],
    );
    const sunHz = horizonAtAz(sun.azDeg, hz360);
    const earthHz = horizonAtAz(earth.azDeg, hz360);

    const activeEvent = findActiveEclipse(t);
    const eclipseData = computeInstantEclipse(sun, earth, eph.earth_dist_km[t], activeEvent);
    const eclipseObscuredFrac = applyEclipses ? eclipseData.obscuredFrac : 0.0;

    const terrainSunFrac = diskFractionAbove(sun.elDeg, sunHz);
    const sunFrac = terrainSunFrac * (1.0 - eclipseObscuredFrac);
    const earthVis = earth.elDeg > earthHz + earthMaskDeg;

    const sinSunEl = Math.max(0.0, Math.sin(sun.elDeg * DEG2RAD));
    const power: SolarPowerInstant = {
      trackingPct: sunFrac * 100.0,
      horizontalPct: sunFrac * sinSunEl * 100.0,
    };

    return {
      sun,
      earth,
      sunHz,
      earthHz,
      sunFrac,
      earthVis,
      activeEvent,
      eclipseData,
      eclipseObscuredFrac,
      power,
    };
  };

  const cur = evalStep(safeIdx);
  const curSunVis = cur.sunFrac > 0.0;

  // Search to end of ephemeris for exact three-case countdowns (I3 / TIME-1)
  let sunTransitionHours: number | null = null;
  let earthTransitionHours: number | null = null;
  const hoursRemaining = Math.max(0, (eph.n - 1 - safeIdx) * dtHours);

  for (let t = safeIdx + 1; t < eph.n; t++) {
    const ev = evalStep(t);
    const sVis = ev.sunFrac > 0.0;
    if (sunTransitionHours === null && sVis !== curSunVis) {
      sunTransitionHours = (t - safeIdx) * dtHours;
    }
    if (earthTransitionHours === null && ev.earthVis !== cur.earthVis) {
      earthTransitionHours = (t - safeIdx) * dtHours;
    }
    if (sunTransitionHours !== null && earthTransitionHours !== null) {
      break;
    }
  }

  const sunCountdown: Countdown =
    sunTransitionHours !== null
      ? { kind: 'event', hours: sunTransitionHours }
      : { kind: 'none_before_data_end', hoursSearched: hoursRemaining };

  const earthCountdown: Countdown =
    earthTransitionHours !== null
      ? { kind: 'event', hours: earthTransitionHours }
      : { kind: 'none_before_data_end', hoursSearched: hoursRemaining };

  // Legacy fields preserved for backwards compatibility until WP5 cleanup
  const hoursToSunset = curSunVis ? sunTransitionHours : null;
  const hoursToSunrise = !curSunVis ? sunTransitionHours : null;
  const hoursToEarthset = cur.earthVis ? earthTransitionHours : null;
  const hoursToEarthrise = !cur.earthVis ? earthTransitionHours : null;

  const points: WindowPoint[] = [];
  let sunAcc = 0.0;
  let sunTimeAcc = 0;
  let earthAcc = 0;
  let bothAcc = 0;
  let powerTrackAcc = 0.0;
  let powerHorizAcc = 0.0;
  let darkRun = 0;
  let maxDark = 0;

  for (let t = safeIdx; t < endIdx; t++) {
    const ev = evalStep(t);
    const sVis = ev.sunFrac > 0.0;
    const both = sVis && ev.earthVis;
    sunAcc += ev.sunFrac;
    if (sVis) sunTimeAcc += 1;
    if (ev.earthVis) earthAcc += 1;
    if (both) bothAcc += 1;
    powerTrackAcc += ev.power.trackingPct;
    powerHorizAcc += ev.power.horizontalPct;

    if (!sVis) {
      darkRun += dtHours;
      if (darkRun > maxDark) maxDark = darkRun;
    } else {
      darkRun = 0;
    }

    points.push({
      idx: t,
      offsetHours: (t - safeIdx) * dtHours,
      sunAz: ev.sun.azDeg,
      sunEl: ev.sun.elDeg,
      sunHz: ev.sunHz,
      sunFrac: ev.sunFrac,
      earthAz: ev.earth.azDeg,
      earthEl: ev.earth.elDeg,
      earthHz: ev.earthHz,
      earthVis: ev.earthVis,
      bothVis: both,
      eclipseObscuredFrac: ev.eclipseObscuredFrac,
      powerTrackingPct: ev.power.trackingPct,
      powerHorizontalPct: ev.power.horizontalPct,
    });
  }

  const count = Math.max(1, points.length);
  const windowHoursAvailable = points.length * dtHours;

  const sunWindows = extractOperationalWindows(points, eph.t0_utc, dtHours, 'sun', (p) => p.sunFrac > 0.0);
  const earthWindows = extractOperationalWindows(points, eph.t0_utc, dtHours, 'earth', (p) => p.earthVis);
  const bothWindows = extractOperationalWindows(points, eph.t0_utc, dtHours, 'both', (p) => p.bothVis);

  return {
    instant: {
      idx: safeIdx,
      utcIso: stepIdxToUtcIso(eph.t0_utc, safeIdx),
      sunAzDeg: cur.sun.azDeg,
      sunElDeg: cur.sun.elDeg,
      sunHorizonElDeg: cur.sunHz,
      sunDiskFrac: cur.sunFrac,
      sunVisible: curSunVis,
      earthAzDeg: cur.earth.azDeg,
      earthElDeg: cur.earth.elDeg,
      earthHorizonElDeg: cur.earthHz,
      earthVisible: cur.earthVis,
      earthDistKm: eph.earth_dist_km[safeIdx],
      hoursToSunset,
      hoursToSunrise,
      hoursToEarthset,
      hoursToEarthrise,
      sunCountdown,
      earthCountdown,
      activeEclipse: cur.activeEvent,
      eclipseObscuredFrac: cur.eclipseObscuredFrac,
      eclipseData: cur.eclipseData,
      power: cur.power,
    },
    summary: {
      sunPct: (sunAcc / count) * 100.0,
      sunTimePct: (sunTimeAcc / count) * 100.0,
      earthPct: (earthAcc / count) * 100.0,
      bothPct: (bothAcc / count) * 100.0,
      maxDarkHours: maxDark,
      windowHoursRequested: requestedWindowHours,
      windowHoursAvailable,
      powerTrackingMeanPct: powerTrackAcc / count,
      powerHorizontalMeanPct: powerHorizAcc / count,
      sunWindows,
      earthWindows,
      bothWindows,
      points,
    },
  };
}

export interface LaunchSensitivityBin {
  idx: number;
  utcShort: string;
  sunPct: number;
  earthPct: number;
  bothPct: number;
  maxDarkDays: number;
}

/**
 * Slides a mission window (default 14 days / 336 h) across the ephemeris
 * to quantify launch-delay sensitivity. Respects ComputeOptions (earthMaskDeg, applyEclipses, windowHours).
 */
export function computeLaunchSensitivitySeries(
  eph: EphemerisData,
  site: SiteData,
  hz360: number[],
  stepHours = 168,
  windowHours = DEFAULT_WINDOW_HOURS,
  options?: ComputeOptions,
): LaunchSensitivityBin[] {
  const winH = Math.max(1, Math.round(options?.windowHours ?? windowHours));
  const earthMaskDeg = options?.earthMaskDeg ?? 0.0;
  const applyEclipses = options?.applyEclipses !== false;

  const sampleStep = 1;
  const slots = Math.ceil(eph.n / sampleStep);
  const sunArr = new Float32Array(slots);
  const earthArr = new Uint8Array(slots);

  for (let s = 0, t = 0; t < eph.n; s += 1, t += sampleStep) {
    const sun = computeAzEl(site.lat, site.lon, site.elev_m, eph.subsolar_lon[t], eph.subsolar_lat[t], AU_KM);
    const earth = computeAzEl(
      site.lat,
      site.lon,
      site.elev_m,
      eph.subearth_lon[t],
      eph.subearth_lat[t],
      eph.earth_dist_km[t],
    );
    const sunHz = horizonAtAz(sun.azDeg, hz360);
    const earthHz = horizonAtAz(earth.azDeg, hz360);
    let sunFrac = diskFractionAbove(sun.elDeg, sunHz);
    if (applyEclipses && sunFrac > 0.0 && Math.abs(sun.elDeg - earth.elDeg) < 1.5) {
      const ec = computeInstantEclipse(sun, earth, eph.earth_dist_km[t], null);
      if (ec.obscuredFrac > 0.0) {
        sunFrac *= 1.0 - ec.obscuredFrac;
      }
    }
    sunArr[s] = sunFrac;
    earthArr[s] = earth.elDeg > earthHz + earthMaskDeg ? 1 : 0;
  }

  const baseMs = Date.parse(eph.t0_utc);
  const bins: LaunchSensitivityBin[] = [];
  for (let startIdx = 0; startIdx + winH <= eph.n; startIdx += stepHours) {
    const sStart = Math.floor(startIdx / sampleStep);
    const sEnd = Math.min(slots, Math.floor((startIdx + winH) / sampleStep));
    const count = Math.max(1, sEnd - sStart);
    let sunSum = 0;
    let earthSum = 0;
    let bothSum = 0;
    let darkRun = 0;
    let maxDark = 0;
    for (let k = sStart; k < sEnd; k++) {
      const sf = sunArr[k];
      const ev = earthArr[k] === 1;
      sunSum += sf;
      if (ev) earthSum += 1;
      if (sf > 0 && ev) bothSum += 1;
      if (sf <= 0) {
        darkRun += sampleStep;
        if (darkRun > maxDark) maxDark = darkRun;
      } else {
        darkRun = 0;
      }
    }
    const utcShort = new Date(baseMs + startIdx * 3600 * 1000).toISOString().slice(0, 10);
    bins.push({
      idx: startIdx,
      utcShort,
      sunPct: Number(((sunSum / count) * 100.0).toFixed(1)),
      earthPct: Number(((earthSum / count) * 100.0).toFixed(1)),
      bothPct: Number(((bothSum / count) * 100.0).toFixed(1)),
      maxDarkDays: Number((maxDark / 24.0).toFixed(1)),
    });
  }
  return bins;
}

/**
 * Compute true astronomical seasonal markers directly from ephemeris.subsolar_lat:
 * - Equinoxes at zero-crossings (midpoint of exact-zero plateaus)
 * - Southern Summer Solstices (min subsolar_lat) & Winter Solstices (max subsolar_lat)
 *   per equinox-bounded half-cycle, taking midpoint of flat plateaus and excluding endpoints.
 */
export function computeSeasonalMarkers(eph: EphemerisData): SeasonalMarker[] {
  const lat = eph.subsolar_lat;
  const n = Math.min(eph.n, lat.length);
  if (n < 3) return [];

  const markers: SeasonalMarker[] = [
    {
      idx: 0,
      utcIso: stepIdxToUtcIso(eph.t0_utc, 0),
      kind: 'data_start',
      label: 'Data Start',
      subsolarLatDeg: lat[0],
    },
  ];

  // 1. Detect zero-crossings (equinoxes)
  const equinoxIndices: number[] = [];
  let lastNonZeroIdx = -1;
  for (let i = 0; i < n; i++) {
    const v = lat[i];
    if (v === 0) continue;
    if (lastNonZeroIdx !== -1) {
      const prevV = lat[lastNonZeroIdx];
      if ((prevV < 0 && v > 0) || (prevV > 0 && v < 0)) {
        let eqIdx: number;
        if (i - lastNonZeroIdx > 1) {
          // Midpoint of exact zero plateau
          eqIdx = Math.floor((lastNonZeroIdx + 1 + i - 1) / 2);
        } else {
          eqIdx = Math.abs(prevV) <= Math.abs(v) ? lastNonZeroIdx : i;
        }
        // Exclude dataset boundary endpoints
        if (eqIdx > 0 && eqIdx < n - 1) {
          equinoxIndices.push(eqIdx);
        }
      }
    }
    lastNonZeroIdx = i;
  }

  const pickExtremumInSegment = (startIdx: number, endIdx: number) => {
    if (endIdx - startIdx < 4) return;
    let sum = 0;
    for (let i = startIdx; i <= endIdx; i++) sum += lat[i];
    const isSummerHalf = sum < 0;

    let bestVal = isSummerHalf ? Infinity : -Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
      if (isSummerHalf ? lat[i] < bestVal : lat[i] > bestVal) {
        bestVal = lat[i];
      }
    }

    // Find plateau run matching bestVal
    let firstRunStart = -1;
    let firstRunEnd = -1;
    let inRun = false;
    for (let i = startIdx; i <= endIdx; i++) {
      if (lat[i] === bestVal) {
        if (!inRun) {
          firstRunStart = i;
          firstRunEnd = i;
          inRun = true;
        } else {
          firstRunEnd = i;
        }
      } else if (inRun) {
        break;
      }
    }

    if (firstRunStart === -1) return;
    const midIdx = Math.floor((firstRunStart + firstRunEnd) / 2);

    // Exclude extrema clamped to dataset boundaries (e.g. 2026-11-14 at idx 0)
    if (midIdx <= 0 || midIdx >= n - 1) return;
    if (firstRunStart === 0 || firstRunEnd === n - 1) return;

    markers.push({
      idx: midIdx,
      utcIso: stepIdxToUtcIso(eph.t0_utc, midIdx),
      kind: isSummerHalf ? 'summer_solstice' : 'winter_solstice',
      label: isSummerHalf ? 'Southern Summer Solstice' : 'Southern Winter Solstice',
      subsolarLatDeg: lat[midIdx],
    });
  };

  if (equinoxIndices.length > 0) {
    // Leading partial segment before first equinox
    pickExtremumInSegment(0, equinoxIndices[0]);
    // Interior half-cycles between consecutive equinoxes
    for (let k = 0; k < equinoxIndices.length - 1; k++) {
      pickExtremumInSegment(equinoxIndices[k], equinoxIndices[k + 1]);
    }
    // Trailing partial segment after last equinox
    pickExtremumInSegment(equinoxIndices[equinoxIndices.length - 1], n - 1);

    for (const eqIdx of equinoxIndices) {
      markers.push({
        idx: eqIdx,
        utcIso: stepIdxToUtcIso(eph.t0_utc, eqIdx),
        kind: 'equinox',
        label: 'Lunar Equinox',
        subsolarLatDeg: lat[eqIdx],
      });
    }
  } else {
    // Fallback for short synthetic curves without zero crossings
    pickExtremumInSegment(0, n - 1);
  }

  markers.push({
    idx: n - 1,
    utcIso: stepIdxToUtcIso(eph.t0_utc, n - 1),
    kind: 'data_end',
    label: 'Data End',
    subsolarLatDeg: lat[n - 1],
  });

  markers.sort((a, b) => a.idx - b.idx);
  return markers;
}

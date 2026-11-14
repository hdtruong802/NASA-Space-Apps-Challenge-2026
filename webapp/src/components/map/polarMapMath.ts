import type {
  ArtemisRegion,
  DecodedDemPatch,
  PolarMapsData,
  SiteCandidate,
  SiteData,
} from '../../types/lunar';

export type MapMode = 'south_pole' | 'terrain_3d' | 'global';
export type PolarLayer = 'hillshade' | 'slope_safety' | 'solar_heatmap' | 'earth_heatmap';

export interface RasterBuffer {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
}

export interface DecodedPolarMaps {
  gridSize: number;
  mppM: number;
  x0M: number;
  y0M: number;
  mastM: number;
  method: string;
  periodStart: string;
  periodEnd: string;
  sunTimePct: Uint8Array;
  sunVisiblePct: Uint8Array | null;
  earthVisiblePct: Uint8Array;
  samplePixel: Uint8Array;
}

export interface PolarMapHoverReadout {
  xKm: number;
  yKm: number;
  latDeg: number;
  lonDeg: number;
  elevM: number;
  slopeDeg: number;
  valuePct: number | null;
  sunVisiblePct: number | null;
  isNoData: boolean;
}

export interface OffFrameEdgeIndicator {
  site: SiteData;
  xKm: number;
  yKm: number;
  edgeXKm: number;
  edgeYKm: number;
  angleRad: number;
  distanceBeyondEdgeKm: number;
  distanceFromCenterKm: number;
}

export interface GlobalMapRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ProbeValidationResult =
  | { valid: true; lat: number; lon: number }
  | { valid: false; error: string };

export interface GlobalLabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const LUNAR_RADIUS_KM = 1737.4;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

/** Cardinal edge labels for the South Pole stereographic frame (MAP-7: positive 90°W label). */
export const POLAR_CARDINAL_LABELS = {
  north0: '0° (Earthside)',
  east90: '90°E',
  south180: '180° (Farside)',
  west90: '90°W',
} as const;

export const SOLAR_METHODOLOGY_CAPTION =
  '1.2 km cell evaluated at highest 240 m pixel @ 2 m mast; nearby points vary significantly (mean ~33 pp spread in high-sun cells).';

export const EARTH_METHODOLOGY_CAPTION =
  '1.2 km cell evaluated at highest 240 m pixel @ 2 m mast; nearby points vary significantly.';

export const ILLUSTRATIVE_SHADING_CAPTION =
  'Illustrative aspect shading (awaiting computed map): elevation + slope aspect only, not computed visibility.';

export const BASELINE_SLOPE_CAPTION =
  '240 m DEM baseline slope (NOT lander-scale hazard/slope): Green <= 5° · Amber 5–15° · Red > 15°';

/** Convert South Pole (lat, lon) in degrees to polar stereographic (xKm, yKm). */
export function polarLl2XyKm(latDeg: number, lonDeg: number): [number, number] {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const rhoKm = 2.0 * LUNAR_RADIUS_KM * Math.tan((0.5 * Math.PI - Math.abs(lat)) * 0.5);
  return [rhoKm * Math.sin(lon), rhoKm * Math.cos(lon)];
}

/** Convert polar stereographic (xKm, yKm) to South Pole (latDeg, lonDeg). */
export function polarXyKm2Ll(xKm: number, yKm: number): [number, number] {
  const rhoKm = Math.hypot(xKm, yKm);
  const latDeg = -90.0 + RAD2DEG * (2.0 * Math.atan((0.5 * rhoKm) / LUNAR_RADIUS_KM));
  let lonDeg = RAD2DEG * Math.atan2(xKm, yKm);
  lonDeg = (((lonDeg + 180.0) % 360.0) + 360.0) % 360.0 - 180.0;
  return [latDeg, lonDeg];
}

/**
 * Compute incoming light unit vector [lx, ly] in canvas pixel coordinates for a given subsolar/subearth longitude.
 * Map frame has +x toward 90°E and +y toward 0° (Earthside, UP on canvas); canvas +y points DOWN, so ly = -cos(L).
 */
export function sunLightVectorCanvas(lonDeg: number): [number, number] {
  const rad = lonDeg * DEG2RAD;
  return [Math.sin(rad), -Math.cos(rad)];
}

/**
 * Unified hillshade multiplier used identically in both 2D raster and 3D terrain mesh shading (MAP-1).
 * Sun-facing slopes satisfy -(dzdx * lx + dzdy * ly) > 0 and are strictly brighter than flat terrain (0.72).
 * Completely independent of selectedSite and local instant azimuth.
 */
export function computeHillshade(dzdx: number, dzdy: number, lx: number, ly: number): number {
  const facing = -(dzdx * lx + dzdy * ly);
  return Math.max(0.22, Math.min(1.25, 0.72 + 0.65 * facing));
}

/**
 * Compute canvas-convention terrain partial derivatives (dzdx along +col/East, dzdy along +row/down)
 * for a 3D mesh quad (z00=top-left, z10=top-right, z11=bottom-right, z01=bottom-left).
 */
export function compute3dQuadGradient(
  z00: number,
  z10: number,
  z11: number,
  z01: number,
  quadSizeM: number,
): [number, number] {
  const dzdx = (z10 - z00 + (z11 - z01)) / (2 * quadSizeM);
  const dzdy = (z01 - z00 + (z11 - z10)) / (2 * quadSizeM);
  return [dzdx, dzdy];
}

/**
 * Compute unified hillshade multiplier for a 3D mesh quad using the exact same shading function as 2D (MAP-1).
 */
export function compute3dQuadHillshade(
  z00: number,
  z10: number,
  z11: number,
  z01: number,
  quadSizeM: number,
  subsolarLon: number,
): number {
  const [dzdx, dzdy] = compute3dQuadGradient(z00, z10, z11, z01, quadSizeM);
  const [lx, ly] = sunLightVectorCanvas(subsolarLon);
  return computeHillshade(dzdx, dzdy, lx, ly);
}

/** Decode base64 bytes safely in both browser and Node test environments. */
export function decodeBase64Bytes(b64: string): Uint8Array {
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

/** Decode base64 250x250 computed visibility maps from polar_maps.json. */
export function decodePolarMaps(raw: PolarMapsData): DecodedPolarMaps {
  return {
    gridSize: raw.grid_size,
    mppM: raw.mpp_m,
    x0M: raw.x0_m,
    y0M: raw.y0_m,
    mastM: raw.mast_m,
    method: raw.method,
    periodStart: raw.period_utc.start,
    periodEnd: raw.period_utc.end,
    sunTimePct: decodeBase64Bytes(raw.sun_time_pct_u8_b64),
    sunVisiblePct: raw.sun_visible_pct_u8_b64 ? decodeBase64Bytes(raw.sun_visible_pct_u8_b64) : null,
    earthVisiblePct: decodeBase64Bytes(raw.earth_visible_pct_u8_b64),
    samplePixel: decodeBase64Bytes(raw.sample_pixel_u8_b64),
  };
}

function interpolateStops(t: number, stops: ReadonlyArray<readonly [number, number, number, number]>): [number, number, number] {
  const clamped = Math.max(0, Math.min(1, t));
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, r0, g0, b0] = stops[i];
    const [t1, r1, g1, b1] = stops[i + 1];
    if (clamped <= t1) {
      const f = (clamped - t0) / Math.max(1e-6, t1 - t0);
      return [
        Math.round(r0 + (r1 - r0) * f),
        Math.round(g0 + (g1 - g0) * f),
        Math.round(b0 + (b1 - b0) * f),
      ];
    }
  }
  const last = stops[stops.length - 1];
  return [last[1], last[2], last[3]];
}

const SOLAR_PALETTE_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 15, 23, 42],
  [0.25, 88, 28, 135],
  [0.5, 217, 70, 39],
  [0.75, 245, 158, 11],
  [1.0, 254, 240, 138],
];

const EARTH_PALETTE_STOPS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 15, 23, 42],
  [0.25, 30, 58, 138],
  [0.5, 2, 132, 199],
  [0.75, 34, 211, 238],
  [1.0, 207, 250, 254],
];

export const NO_DATA_RGB: readonly [number, number, number] = [22, 27, 38];

/** Map normalized [0..1] solar percentage to RGB matching the 0–100% solar colorbar. */
export function valueToSolarRgb(norm01: number): [number, number, number] {
  return interpolateStops(norm01, SOLAR_PALETTE_STOPS);
}

/** Map normalized [0..1] Earth visibility percentage to RGB matching the 0–100% Earth colorbar. */
export function valueToEarthRgb(norm01: number): [number, number, number] {
  return interpolateStops(norm01, EARTH_PALETTE_STOPS);
}

export function getColorbarCssGradient(layer: 'solar_heatmap' | 'earth_heatmap'): string {
  const stops = layer === 'solar_heatmap' ? SOLAR_PALETTE_STOPS : EARTH_PALETTE_STOPS;
  const parts = stops.map(([t, r, g, b]) => `rgb(${r}, ${g}, ${b}) ${Math.round(t * 100)}%`);
  return `linear-gradient(90deg, ${parts.join(', ')})`;
}

/** Look up a single cell in decoded polar_maps at map coordinates (xKm, yKm). */
export function samplePolarMapCell(
  maps: DecodedPolarMaps,
  layer: 'solar_heatmap' | 'earth_heatmap',
  xKm: number,
  yKm: number,
): { valuePct: number | null; sunVisiblePct: number | null; isNoData: boolean; row: number; col: number } {
  const col = Math.round((xKm * 1000 - maps.x0M) / maps.mppM);
  const row = Math.round((maps.y0M - yKm * 1000) / maps.mppM);
  if (col < 0 || col >= maps.gridSize || row < 0 || row >= maps.gridSize) {
    return { valuePct: null, sunVisiblePct: null, isNoData: true, row, col };
  }
  const idx = row * maps.gridSize + col;
  const raw = layer === 'solar_heatmap' ? maps.sunTimePct[idx] : maps.earthVisiblePct[idx];
  const svRaw = maps.sunVisiblePct ? maps.sunVisiblePct[idx] : 255;
  const sunVisiblePct = svRaw !== 255 ? svRaw : null;
  if (raw === 255 || raw === undefined) {
    return { valuePct: null, sunVisiblePct, isNoData: true, row, col };
  }
  return { valuePct: raw, sunVisiblePct, isNoData: false, row, col };
}

/** Sample DEM patch elevation, slope, and optional computed polar map readout at (xKm, yKm). */
export function samplePolarHoverReadout(
  demPatch: DecodedDemPatch,
  xKm: number,
  yKm: number,
  layer: PolarLayer,
  polarMaps?: DecodedPolarMaps | null,
): PolarMapHoverReadout {
  const n = demPatch.gridSize;
  const ext = demPatch.extentKm;
  const col = Math.max(0, Math.min(n - 1, Math.floor(((xKm + ext) / (2 * ext)) * n)));
  const row = Math.max(0, Math.min(n - 1, Math.floor(((ext - yKm) / (2 * ext)) * n)));
  const idx = row * n + col;
  const [latDeg, lonDeg] = polarXyKm2Ll(xKm, yKm);
  const elevM = demPatch.elev[idx];
  const slopeDeg = demPatch.slopeU8[idx] * demPatch.slopeScaleDeg;

  if (polarMaps && (layer === 'solar_heatmap' || layer === 'earth_heatmap')) {
    const cell = samplePolarMapCell(polarMaps, layer, xKm, yKm);
    return {
      xKm,
      yKm,
      latDeg,
      lonDeg,
      elevM,
      slopeDeg,
      valuePct: cell.valuePct,
      sunVisiblePct: cell.sunVisiblePct,
      isNoData: cell.isNoData,
    };
  }

  return {
    xKm,
    yKm,
    latDeg,
    lonDeg,
    elevM,
    slopeDeg,
    valuePct: null,
    sunVisiblePct: null,
    isNoData: false,
  };
}

function isDecodedPolarMaps(v: PolarMapsData | DecodedPolarMaps): v is DecodedPolarMaps {
  return 'sunTimePct' in v && v.sunTimePct instanceof Uint8Array;
}

/**
 * Compute RGBA raster buffer for the 2D South Pole map purely from DEM, layer, subsolarLon, subearthLon, and optional polarMaps.
 * Pure Node-safe function with zero DOM dependencies and zero dependence on selectedSite or instant (MAP-1 / MAP-2).
 */
export function buildBackgroundRaster(
  demPatch: DecodedDemPatch,
  layer: PolarLayer,
  subsolarLon: number,
  subearthLon: number,
  polarMaps?: PolarMapsData | DecodedPolarMaps | null,
): RasterBuffer {
  const n = demPatch.gridSize;
  const rgba = new Uint8ClampedArray(n * n * 4);
  const elev = demPatch.elev;
  const slope = demPatch.slopeU8;
  const scale = demPatch.slopeScaleDeg;
  const eMin = demPatch.elevMinM;
  const eSpan = Math.max(1, demPatch.elevMaxM - eMin);

  const [lx, ly] = sunLightVectorCanvas(subsolarLon);
  const [ex, ey] = sunLightVectorCanvas(subearthLon);

  const decodedMaps = polarMaps
    ? isDecodedPolarMaps(polarMaps)
      ? polarMaps
      : decodePolarMaps(polarMaps)
    : null;

  const sameGridAsMaps =
    decodedMaps !== null &&
    decodedMaps.gridSize === n &&
    Math.abs(decodedMaps.mppM - demPatch.mpp) < 1;

  for (let r = 0; r < n; r++) {
    const rUp = Math.max(0, r - 1);
    const rDown = Math.min(n - 1, r + 1);
    const dyPx = rDown - rUp;
    const yKm = demPatch.extentKm - ((r + 0.5) / n) * (2 * demPatch.extentKm);

    for (let c = 0; c < n; c++) {
      const idx = r * n + c;
      const p = idx * 4;
      const eVal = elev[idx];
      const eNorm = Math.max(0, Math.min(1, (eVal - eMin) / eSpan));

      const cLeft = Math.max(0, c - 1);
      const cRight = Math.min(n - 1, c + 1);
      const dxPx = cRight - cLeft;

      const eL = elev[r * n + cLeft];
      const eR = elev[r * n + cRight];
      const eU = elev[rUp * n + c];
      const eD = elev[rDown * n + c];

      const dzdx = (eR - eL) / (Math.max(1, dxPx) * demPatch.mpp);
      const dzdy = (eD - eU) / (Math.max(1, dyPx) * demPatch.mpp);
      const shade = computeHillshade(dzdx, dzdy, lx, ly);

      if (layer === 'hillshade') {
        const baseR = 25 + eNorm * 165;
        const baseG = 32 + eNorm * 158;
        const baseB = 48 + eNorm * 135;
        rgba[p] = Math.min(255, Math.round(baseR * shade));
        rgba[p + 1] = Math.min(255, Math.round(baseG * shade));
        rgba[p + 2] = Math.min(255, Math.round(baseB * shade));
        rgba[p + 3] = 255;
      } else if (layer === 'solar_heatmap') {
        if (decodedMaps) {
          let rawVal: number;
          if (sameGridAsMaps) {
            rawVal = decodedMaps.sunTimePct[idx];
          } else {
            const xKm = ((c + 0.5) / n) * (2 * demPatch.extentKm) - demPatch.extentKm;
            const mCol = Math.round((xKm * 1000 - decodedMaps.x0M) / decodedMaps.mppM);
            const mRow = Math.round((decodedMaps.y0M - yKm * 1000) / decodedMaps.mppM);
            rawVal =
              mCol >= 0 && mCol < decodedMaps.gridSize && mRow >= 0 && mRow < decodedMaps.gridSize
                ? decodedMaps.sunTimePct[mRow * decodedMaps.gridSize + mCol]
                : 255;
          }
          if (rawVal === 255) {
            rgba[p] = NO_DATA_RGB[0];
            rgba[p + 1] = NO_DATA_RGB[1];
            rgba[p + 2] = NO_DATA_RGB[2];
          } else {
            const [cr, cg, cb] = valueToSolarRgb(rawVal / 100);
            rgba[p] = cr;
            rgba[p + 1] = cg;
            rgba[p + 2] = cb;
          }
          rgba[p + 3] = 255;
        } else {
          // Illustrative elevation + sun-facing aspect fallback (no northBonus, site-independent)
          const solarAspect = Math.max(-0.5, Math.min(0.5, -(dzdx * lx + dzdy * ly) * 0.9));
          const heat = Math.max(0, Math.min(1, eNorm * 0.8 + solarAspect * 0.4));
          const litFactor = Math.pow(heat, 1.3);
          rgba[p] = Math.min(255, Math.round(18 + litFactor * 235));
          rgba[p + 1] = Math.min(255, Math.round(22 + Math.pow(heat, 1.75) * 185));
          rgba[p + 2] = Math.min(255, Math.round(58 - litFactor * 36 + (1 - heat) * 40));
          rgba[p + 3] = 255;
        }
      } else if (layer === 'earth_heatmap') {
        if (decodedMaps) {
          let rawVal: number;
          if (sameGridAsMaps) {
            rawVal = decodedMaps.earthVisiblePct[idx];
          } else {
            const xKm = ((c + 0.5) / n) * (2 * demPatch.extentKm) - demPatch.extentKm;
            const mCol = Math.round((xKm * 1000 - decodedMaps.x0M) / decodedMaps.mppM);
            const mRow = Math.round((decodedMaps.y0M - yKm * 1000) / decodedMaps.mppM);
            rawVal =
              mCol >= 0 && mCol < decodedMaps.gridSize && mRow >= 0 && mRow < decodedMaps.gridSize
                ? decodedMaps.earthVisiblePct[mRow * decodedMaps.gridSize + mCol]
                : 255;
          }
          if (rawVal === 255) {
            rgba[p] = NO_DATA_RGB[0];
            rgba[p + 1] = NO_DATA_RGB[1];
            rgba[p + 2] = NO_DATA_RGB[2];
          } else {
            const [cr, cg, cb] = valueToEarthRgb(rawVal / 100);
            rgba[p] = cr;
            rgba[p + 1] = cg;
            rgba[p + 2] = cb;
          }
          rgba[p + 3] = 255;
        } else {
          // Illustrative elevation + Earth-facing aspect fallback (no northBonus, site-independent)
          const earthAspect = Math.max(-0.5, Math.min(0.5, -(dzdx * ex + dzdy * ey) * 1.0));
          const vis = Math.max(0, Math.min(1, eNorm * 0.72 + earthAspect * 0.45 + 0.08));
          rgba[p] = Math.min(255, Math.round(16 + vis * 36));
          rgba[p + 1] = Math.min(255, Math.round(28 + Math.pow(vis, 1.1) * 195));
          rgba[p + 2] = Math.min(255, Math.round(55 + Math.pow(vis, 0.9) * 195));
          rgba[p + 3] = 255;
        }
      } else {
        // 240 m baseline slope bands (<= 5 deg emerald, 5-15 amber, > 15 crimson)
        const slDeg = slope[idx] * scale;
        if (slDeg <= 5.0) {
          rgba[p] = Math.min(255, Math.round(22 * shade + 10));
          rgba[p + 1] = Math.min(255, Math.round(195 * shade));
          rgba[p + 2] = Math.min(255, Math.round(130 * shade));
        } else if (slDeg <= 15.0) {
          rgba[p] = Math.min(255, Math.round(215 * shade));
          rgba[p + 1] = Math.min(255, Math.round(145 * shade));
          rgba[p + 2] = Math.min(255, Math.round(45 * shade));
        } else {
          rgba[p] = Math.min(255, Math.round(155 * shade));
          rgba[p + 1] = Math.min(255, Math.round(45 * shade));
          rgba[p + 2] = Math.min(255, Math.round(58 * shade));
        }
        rgba[p + 3] = 255;
      }
    }
  }

  return { width: n, height: n, rgba };
}

/** Determine whether a site lies outside the ±extentKm polar map box and compute its directional edge indicator (MAP-3). */
export function computeOffFrameEdgeIndicator(site: SiteData, extentKm = 150): OffFrameEdgeIndicator | null {
  let xKm = site.polar_x_km;
  let yKm = site.polar_y_km;
  if (xKm === null || yKm === null) {
    if (site.lat < -15) {
      const [px, py] = polarLl2XyKm(site.lat, site.lon);
      xKm = px;
      yKm = py;
    } else {
      // Great-circle south-polar azimuthal projection for low-latitude / northern sites
      const arcKm = LUNAR_RADIUS_KM * ((90 + site.lat) * DEG2RAD);
      const lonRad = site.lon * DEG2RAD;
      xKm = arcKm * Math.sin(lonRad);
      yKm = arcKm * Math.cos(lonRad);
    }
  }

  if (Math.abs(xKm) <= extentKm && Math.abs(yKm) <= extentKm) {
    return null;
  }

  const maxCoord = Math.max(Math.abs(xKm), Math.abs(yKm), 1e-9);
  const t = extentKm / maxCoord;
  const edgeXKm = xKm * t;
  const edgeYKm = yKm * t;
  const distanceBeyondEdgeKm = Math.hypot(xKm - edgeXKm, yKm - edgeYKm);
  const distanceFromCenterKm = Math.hypot(xKm, yKm);
  // Canvas angle: +x right, +y_canvas down (= -y_map)
  const angleRad = Math.atan2(-yKm, xKm);

  return {
    site,
    xKm,
    yKm,
    edgeXKm,
    edgeYKm,
    angleRad,
    distanceBeyondEdgeKm,
    distanceFromCenterKm,
  };
}

/** Check if an Artemis III 2024 region has any polygon vertex or centroid inside the ±extentKm polar frame (WP3-B8). */
export function isRegionInPolarFrame(region: ArtemisRegion, extentKm = 150): boolean {
  if (region.rings_polar_km && region.rings_polar_km.length > 0) {
    for (const ring of region.rings_polar_km) {
      for (const [xKm, yKm] of ring) {
        if (Math.abs(xKm) <= extentKm && Math.abs(yKm) <= extentKm) {
          return true;
        }
      }
    }
    return false;
  }
  if (region.polygon_lonlat && region.polygon_lonlat.length > 0) {
    for (const ring of region.polygon_lonlat) {
      for (const [lon, lat] of ring) {
        const [xKm, yKm] = polarLl2XyKm(lat, lon);
        if (Math.abs(xKm) <= extentKm && Math.abs(yKm) <= extentKm) {
          return true;
        }
      }
    }
    return false;
  }
  if (typeof region.in_polar_frame === 'boolean') {
    return region.in_polar_frame;
  }
  return Math.abs(region.polar_x_km) <= extentKm && Math.abs(region.polar_y_km) <= extentKm;
}

/** Return the polar [xKm, yKm] rings for an Artemis region (or empty array if circle fallback should be used). */
export function getArtemisPolarRingsKm(region: ArtemisRegion): Array<Array<[number, number]>> {
  if (region.rings_polar_km && region.rings_polar_km.length > 0) {
    return region.rings_polar_km;
  }
  if (region.polygon_lonlat && region.polygon_lonlat.length > 0) {
    return region.polygon_lonlat.map((ring) => ring.map(([lon, lat]) => polarLl2XyKm(lat, lon)));
  }
  return [];
}

/**
 * Compute 3D exaggerated ray endpoint (dxKm, dyKm, dzM) from true azimuth and elevation angle (MAP-4).
 * Uses site.lon + bodyAzDeg for exact polar-map azimuth alignment and preserves apparent vertical slope under vertExag.
 */
export function compute3dRayEndpointDelta(
  siteLonDeg: number,
  bodyAzDeg: number,
  bodyElDeg: number,
  vertExag: number,
  visualLengthKm = 88,
): { dxKm: number; dyKm: number; dzM: number } {
  const mapAzRad = (siteLonDeg + bodyAzDeg) * DEG2RAD;
  const elRad = bodyElDeg * DEG2RAD;
  const horizCos = Math.cos(elRad);
  const vertSin = Math.sin(elRad);
  const exagScale = Math.max(1, vertExag);
  const denom = Math.max(1e-6, Math.hypot(horizCos, vertSin * exagScale));
  const stepKm = visualLengthKm / denom;
  return {
    dxKm: Math.sin(mapAzRad) * horizCos * stepKm,
    dyKm: Math.cos(mapAzRad) * horizCos * stepKm,
    dzM: vertSin * stepKm * 1000,
  };
}

/** Compute the Global equirectangular map rectangle inside a square canvas of cssSize × cssSize. */
export function getGlobalMapRect(cssSize: number): GlobalMapRect {
  const padX = cssSize >= 420 ? 42 : 34;
  const width = Math.max(180, cssSize - padX * 2);
  const height = width * 0.5;
  const top = Math.max(30, Math.round((cssSize - height) * 0.44));
  return { left: padX, top, width, height };
}

/** Project global (latDeg, lonDeg) into canvas CSS pixels inside rect. */
export function latLonToGlobalPx(latDeg: number, lonDeg: number, rect: GlobalMapRect): [number, number] {
  const x = rect.left + ((lonDeg + 180) / 360) * rect.width;
  const y = rect.top + ((90 - latDeg) / 180) * rect.height;
  return [x, y];
}

/** Convert a canvas click (px, py) inside the Global map rect to (latDeg, lonDeg), or null if outside map bounds. */
export function globalPxToLatLon(px: number, py: number, rect: GlobalMapRect): { lat: number; lon: number } | null {
  if (px < rect.left || px > rect.left + rect.width || py < rect.top || py > rect.top + rect.height) {
    return null;
  }
  const lon = -180 + ((px - rect.left) / rect.width) * 360;
  const lat = 90 - ((py - rect.top) / rect.height) * 180;
  return {
    lat: Math.max(-90, Math.min(90, Number(lat.toFixed(4)))),
    lon: Math.max(-180, Math.min(180, Number(lon.toFixed(4)))),
  };
}

/** Validate Probe latitude/longitude inputs strictly without silent clamping (UX-4). */
export function validateProbeInputs(latRaw: string, lonRaw: string): ProbeValidationResult {
  const latTrim = latRaw.trim();
  const lonTrim = lonRaw.trim();
  if (latTrim.length === 0 || lonTrim.length === 0) {
    return { valid: false, error: 'Enter both latitude (-90 to +90°) and longitude (-180 to +180°).' };
  }
  const lat = Number(latTrim);
  const lon = Number(lonTrim);
  if (!Number.isFinite(lat)) {
    return { valid: false, error: 'Latitude must be a valid finite number.' };
  }
  if (!Number.isFinite(lon)) {
    return { valid: false, error: 'Longitude must be a valid finite number.' };
  }
  if (lat < -90 || lat > 90) {
    return { valid: false, error: `Latitude ${lat}° is out of range (must be between -90° and +90°).` };
  }
  if (lon < -180 || lon > 180) {
    return { valid: false, error: `Longitude ${lon}° is out of range (must be between -180° and +180°).` };
  }
  return { valid: true, lat, lon };
}

/** Check whether two 2D label boxes overlap with optional padding (for smart anti-overlap labels on Global map). */
export function boxesOverlap(a: GlobalLabelBox, b: GlobalLabelBox, pad = 3): boolean {
  return !(
    a.x + a.w + pad < b.x ||
    b.x + b.w + pad < a.x ||
    a.y + a.h + pad < b.y ||
    b.y + b.h + pad < a.y
  );
}

/** Format a compact distance label for off-frame indicators and tooltips. */
export function formatOffFrameDistanceKm(distKm: number): string {
  return distKm >= 10 ? `+${Math.round(distKm)} km` : `+${distKm.toFixed(1)} km`;
}

/** Convenience helper to format South/North and West/East coordinates cleanly (no double negatives). */
export function formatLatLonShort(lat: number, lon: number): string {
  const latStr = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? 'S' : 'N'}`;
  const lonStr = `${Math.abs(lon).toFixed(2)}°${lon < 0 ? 'W' : 'E'}`;
  return `${latStr}, ${lonStr}`;
}

/** Candidate visual filter check: return true if candidate lies inside ±extentKm frame. */
export function isCandidateInPolarFrame(c: SiteCandidate, extentKm = 150): boolean {
  return Math.abs(c.xKm) <= extentKm && Math.abs(c.yKm) <= extentKm;
}

export type PillAlign = 'left' | 'center' | 'right';

export interface LabelAnchorCandidate {
  x: number;
  y: number;
  align: PillAlign;
}

export interface PickedLabelPlacement {
  x: number;
  y: number;
  align: PillAlign;
  box: GlobalLabelBox;
  overlapped: boolean;
}

/** Exact pill bounding box matching drawPillLabel geometry inside [4, maxCanvasSize - 4]. */
export function computePillBox(
  x: number,
  y: number,
  boxWidth: number,
  maxCanvasSize: number,
  align: PillAlign = 'left',
  boxHeight = 18,
  maxBottomY?: number,
): GlobalLabelBox {
  let boxX = x;
  if (align === 'center') boxX = x - boxWidth / 2;
  else if (align === 'right') boxX = x - boxWidth;

  boxX = Math.max(4, Math.min(maxCanvasSize - boxWidth - 4, boxX));
  const defaultBottomTopLimit = maxCanvasSize - boxHeight - 4;
  const maxBoxY = maxBottomY !== undefined
    ? Math.min(defaultBottomTopLimit, maxBottomY - boxHeight)
    : defaultBottomTopLimit;
  const boxY = Math.max(4, Math.min(maxBoxY, y - boxHeight + 4));
  return { x: boxX, y: boxY, w: boxWidth, h: boxHeight };
}

function computeOverlapArea(a: GlobalLabelBox, b: GlobalLabelBox, pad: number): number {
  const x1 = Math.max(a.x - pad, b.x);
  const y1 = Math.max(a.y - pad, b.y);
  const x2 = Math.min(a.x + a.w + pad, b.x + b.w);
  const y2 = Math.min(a.y + a.h + pad, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  return (x2 - x1) * (y2 - y1);
}

/**
 * Pick the first candidate label position whose pill bounding box does not overlap
 * any existing box in `placedBoxes`. When `allowFallback` is true and every candidate
 * collides, returns the candidate with minimum overlap area.
 */
export function pickNonOverlappingLabelPlacement(
  candidates: readonly LabelAnchorCandidate[],
  boxWidth: number,
  maxCanvasSize: number,
  placedBoxes: readonly GlobalLabelBox[],
  options?: {
    pad?: number;
    boxHeight?: number;
    maxBottomY?: number;
    allowFallback?: boolean;
  },
): PickedLabelPlacement | null {
  const pad = options?.pad ?? 3;
  const boxHeight = options?.boxHeight ?? 18;
  const maxBottomY = options?.maxBottomY;
  const allowFallback = options?.allowFallback ?? true;

  let bestFallback: PickedLabelPlacement | null = null;
  let bestOverlapArea = Infinity;

  for (const cand of candidates) {
    const box = computePillBox(cand.x, cand.y, boxWidth, maxCanvasSize, cand.align, boxHeight, maxBottomY);
    const hasCollision = placedBoxes.some((b) => boxesOverlap(box, b, pad));
    if (!hasCollision) {
      return { x: cand.x, y: cand.y, align: cand.align, box, overlapped: false };
    }
    if (allowFallback) {
      let area = 0;
      for (const b of placedBoxes) {
        area += computeOverlapArea(box, b, pad);
      }
      if (area < bestOverlapArea) {
        bestOverlapArea = area;
        bestFallback = { x: cand.x, y: cand.y, align: cand.align, box, overlapped: true };
      }
    }
  }

  return allowFallback ? bestFallback : null;
}

/** Generate non-overlapping placement candidates around an in-frame point marker (px, py). */
export function buildPolarPointLabelCandidates(px: number, py: number, gap = 9): LabelAnchorCandidate[] {
  return [
    { x: px + gap, y: py - 4, align: 'left' },
    { x: px + gap, y: py + 16, align: 'left' },
    { x: px - gap, y: py - 4, align: 'right' },
    { x: px - gap, y: py + 16, align: 'right' },
    { x: px + gap, y: py - 22, align: 'left' },
    { x: px - gap, y: py - 22, align: 'right' },
    { x: px, y: py + 22, align: 'center' },
    { x: px, y: py - 22, align: 'center' },
    { x: px + gap, y: py + 36, align: 'left' },
    { x: px - gap, y: py + 36, align: 'right' },
  ];
}

/**
 * Generate inward and lateral placement candidates for an out-of-frame polar edge indicator
 * so multiple edge labels near the top/side borders stagger cleanly away from cardinal labels
 * and in-frame site labels.
 */
export function buildPolarEdgeLabelCandidates(
  anchorX: number,
  anchorY: number,
  edgeXKm: number,
  edgeYKm: number,
  extentKm: number,
): LabelAnchorCandidate[] {
  const prefAlign: PillAlign =
    edgeXKm > extentKm * 0.4 ? 'right' : edgeXKm < -extentKm * 0.4 ? 'left' : 'center';
  const altAligns: PillAlign[] =
    prefAlign === 'center'
      ? ['center', 'left', 'right']
      : prefAlign === 'right'
        ? ['right', 'left', 'center']
        : ['left', 'right', 'center'];

  const inwardY = edgeYKm >= 0 ? 22 : -22;
  const inwardX = edgeXKm >= 0 ? -36 : 36;
  const out: LabelAnchorCandidate[] = [];

  for (let row = 0; row <= 4; row++) {
    const cy = anchorY + row * inwardY;
    for (const align of altAligns) {
      out.push({ x: anchorX, y: cy, align });
    }
    out.push({ x: anchorX + inwardX, y: cy, align: prefAlign });
    if (row > 0) {
      out.push({ x: anchorX - inwardX, y: cy, align: prefAlign });
    }
  }
  return out;
}

/**
 * Generate label anchor candidates on the Global equirectangular map.
 * Markers near the bottom border (sy > rect.top + rect.height - 26, e.g. South Pole sites)
 * place their pills upward above the marker dot so they never collide with bottom longitude ticks.
 */
export function buildGlobalSiteLabelCandidates(
  sx: number,
  sy: number,
  rect: GlobalMapRect,
): { candidates: LabelAnchorCandidate[]; maxBottomY: number } {
  const maxBottomY = rect.top + rect.height - 2;
  const nearBottom = sy > rect.top + rect.height - 26;
  if (nearBottom) {
    const upY = Math.min(sy - 8, rect.top + rect.height - 6);
    return {
      maxBottomY,
      candidates: [
        { x: sx + 8, y: upY, align: 'left' },
        { x: sx - 8, y: upY, align: 'right' },
        { x: sx, y: upY - 4, align: 'center' },
        { x: sx + 8, y: upY - 22, align: 'left' },
        { x: sx - 8, y: upY - 22, align: 'right' },
        { x: sx + 8, y: upY - 44, align: 'left' },
        { x: sx - 8, y: upY - 44, align: 'right' },
      ],
    };
  }

  return {
    maxBottomY,
    candidates: [
      { x: sx + 8, y: sy + 4, align: 'left' },
      { x: sx - 8, y: sy + 4, align: 'right' },
      { x: sx + 8, y: sy - 16, align: 'left' },
      { x: sx - 8, y: sy - 16, align: 'right' },
      { x: sx + 8, y: sy + 24, align: 'left' },
      { x: sx - 8, y: sy + 24, align: 'right' },
    ],
  };
}

import {
  computeCustomPolarHorizon,
  computeGridSlopeDegAt,
  computeGridTerrainStats30km,
  computeInstantAndWindow,
  DEFAULT_WINDOW_HOURS,
  isInsideDemGrid,
  ll2xyKm,
  sampleDemGridBilinear,
  xyKm2ll,
  buildCustomPolarSite,
} from './lunarMath';
import { classifyArchetype, computeViability } from './scoring';
import type {
  ArtemisRegion,
  CandidateCriterion,
  CandidateQuery,
  CandidateRankResult,
  CandidateRegion,
  ClientDemBundle,
  ComputeOptions,
  DecodedDemGrid,
  DecodedDemPatch,
  EphemerisData,
  PolarKmRing,
  RefinedCandidateCell,
  SiteCandidate,
  SiteCandidatesData,
  SiteData,
  SiteMetrics2m,
  TerrainStats,
} from '../types/lunar';

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;
const TAN_5DEG_SQ = Math.tan(5.0 * DEG2RAD) ** 2;
const U16_INVALID = 65535;
const U8_INVALID = 255;

export interface DecodedSiteCandidates {
  schema_version: string;
  data_version: string;
  generated_utc: string;
  search_params: SiteCandidatesData['search_params'];
  sunVisiblePctX100: Uint16Array;
  sunTimePctX100: Uint16Array;
  earthVisiblePctX100: Uint16Array;
  bothVisiblePctX100: Uint16Array;
  maxDarkHours: Uint16Array;
  slopeDegX100: Uint16Array;
  flat1kmPctX100: Uint16Array;
  flatBoxPctX100: Uint16Array;
  elevM: Int16Array;
  samplePixel: Uint8Array;
  refinedByCell: Map<string, RefinedCandidateCell>;
}

function decodeBase64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function decodeUint16LE(b64: string): Uint16Array {
  const bytes = decodeBase64Bytes(b64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Uint16Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = view.getUint16(i * 2, true);
  }
  return out;
}

function decodeInt16LE(b64: string): Int16Array {
  const bytes = decodeBase64Bytes(b64);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const n = Math.floor(bytes.byteLength / 2);
  const out = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = view.getInt16(i * 2, true);
  }
  return out;
}

function isDecodedCandidates(
  rawOrDecoded: SiteCandidatesData | DecodedSiteCandidates,
): rawOrDecoded is DecodedSiteCandidates {
  return 'sunVisiblePctX100' in rawOrDecoded;
}

/**
 * Decode base64-encoded 250x250 candidate layers and index refined 25-pixel cells.
 */
export function decodeSiteCandidates(raw: SiteCandidatesData): DecodedSiteCandidates {
  const refinedByCell = new Map<string, RefinedCandidateCell>();
  for (const cell of raw.refined ?? []) {
    refinedByCell.set(`${cell.cell_row}:${cell.cell_col}`, cell);
  }

  return {
    schema_version: raw.schema_version,
    data_version: raw.data_version,
    generated_utc: raw.generated_utc,
    search_params: raw.search_params,
    sunVisiblePctX100: decodeUint16LE(raw.layers.sun_visible_pct_x100_u16_b64),
    sunTimePctX100: decodeUint16LE(raw.layers.sun_time_pct_x100_u16_b64),
    earthVisiblePctX100: decodeUint16LE(raw.layers.earth_visible_pct_x100_u16_b64),
    bothVisiblePctX100: decodeUint16LE(raw.layers.both_visible_pct_x100_u16_b64),
    maxDarkHours: decodeUint16LE(raw.layers.max_dark_hours_u16_b64),
    slopeDegX100: decodeUint16LE(raw.layers.slope_deg_x100_u16_b64),
    flat1kmPctX100: decodeUint16LE(raw.layers.flat_1km_pct_x100_u16_b64),
    flatBoxPctX100: decodeUint16LE(raw.layers.flat_box_pct_x100_u16_b64),
    elevM: decodeInt16LE(raw.layers.elev_m_i16_b64),
    samplePixel: decodeBase64Bytes(raw.layers.sample_pixel_u8_b64),
    refinedByCell,
  };
}

function pointInPolarRings(xKm: number, yKm: number, rings: PolarKmRing[]): boolean {
  let inside = false;
  for (const ring of rings) {
    if (ring.length < 3) continue;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const intersects =
        yi > yKm !== yj > yKm &&
        xKm < ((xj - xi) * (yKm - yi)) / (yj - yi === 0 ? 1e-12 : yj - yi) + xi;
      if (intersects) inside = !inside;
    }
  }
  return inside;
}

interface CompiledArtemisRegion {
  code: string;
  rings: PolarKmRing[] | null;
  centerXKm: number;
  centerYKm: number;
  radiusKm: number;
}

function compileArtemisRegions(
  region: CandidateRegion,
  artemisRegions?: ArtemisRegion[],
): CompiledArtemisRegion[] {
  if (region.kind !== 'artemis' || !artemisRegions || artemisRegions.length === 0) return [];
  const wanted =
    region.codes && region.codes.length > 0
      ? new Set(region.codes.map((c) => c.toUpperCase()))
      : null;

  const compiled: CompiledArtemisRegion[] = [];
  for (const reg of artemisRegions) {
    if (wanted && !wanted.has(reg.code.toUpperCase())) continue;
    let rings: PolarKmRing[] | null = null;
    if (reg.rings_polar_km && reg.rings_polar_km.length > 0) {
      rings = reg.rings_polar_km;
    } else if (reg.polygon_lonlat && reg.polygon_lonlat.length > 0) {
      rings = reg.polygon_lonlat.map((ring) => ring.map(([lon, lat]) => ll2xyKm(lat, lon)));
    }
    compiled.push({
      code: reg.code,
      rings,
      centerXKm: reg.polar_x_km,
      centerYKm: reg.polar_y_km,
      radiusKm: Math.sqrt(Math.max(0.0, reg.area_km2) / Math.PI),
    });
  }
  return compiled;
}

function matchRegion(
  xKm: number,
  yKm: number,
  region: CandidateRegion,
  compiledArtemis: CompiledArtemisRegion[],
  extentKm?: number,
): { inside: boolean; artemisCode: string | null } {
  if (region.kind === 'map') {
    if (extentKm !== undefined && (Math.abs(xKm) > extentKm + 1e-6 || Math.abs(yKm) > extentKm + 1e-6)) {
      return { inside: false, artemisCode: null };
    }
    return { inside: true, artemisCode: null };
  }
  if (region.kind === 'around') {
    const inside = Math.hypot(xKm - region.xKm, yKm - region.yKm) <= region.radiusKm;
    return { inside, artemisCode: null };
  }
  for (const reg of compiledArtemis) {
    const inside = reg.rings
      ? pointInPolarRings(xKm, yKm, reg.rings)
      : Math.hypot(xKm - reg.centerXKm, yKm - reg.centerYKm) <= reg.radiusKm;
    if (inside) {
      return { inside: true, artemisCode: reg.code };
    }
  }
  return { inside: false, artemisCode: null };
}

function computeCandidateViability(
  sunVisiblePct: number,
  sunTimePct: number,
  earthVisiblePct: number,
  bothVisiblePct: number,
  maxDarkHours: number,
  flatBoxPct: number | null,
): number | null {
  if (flatBoxPct === null) return null;
  const metricsStub: SiteMetrics2m = {
    sun_no_terrain_pct: 0,
    sun_time_pct: sunTimePct,
    sun_visible_pct: sunVisiblePct,
    earth_visible_pct: earthVisiblePct,
    both_visible_pct: bothVisiblePct,
    longest_sun_days: 0,
    max_dark_days: maxDarkHours / 24.0,
    earth_max_gap_days: 0,
    viability_score: null,
    archetype: null,
  };
  const terrainStub: TerrainStats = {
    elev_min_m: 0,
    elev_median_m: 0,
    elev_max_m: 0,
    elev_relief_m: 0,
    slope_mean_deg: 0,
    slope_median_deg: 0,
    slope_p90_deg: 0,
    pct_safe_hls_le_5deg: flatBoxPct,
    pct_rover_le_15deg: 0,
  };
  return computeViability(metricsStub, terrainStub);
}

function passesConstraints(
  slopeDeg: number,
  flat1kmPct: number | null,
  query: CandidateQuery,
): boolean {
  if (query.maxSlopeDeg !== null && slopeDeg > query.maxSlopeDeg) {
    return false;
  }
  if (query.minFlat1kmPct !== null && (flat1kmPct === null || flat1kmPct < query.minFlat1kmPct)) {
    return false;
  }
  return true;
}

function compareByCriterion(
  a: SiteCandidate,
  b: SiteCandidate,
  criterion: CandidateCriterion,
): number {
  switch (criterion) {
    case 'sun': {
      const diff = b.sunVisiblePct - a.sunVisiblePct;
      if (diff !== 0) return diff;
      const tDiff = b.sunTimePct - a.sunTimePct;
      if (tDiff !== 0) return tDiff;
      break;
    }
    case 'earth': {
      const diff = b.earthVisiblePct - a.earthVisiblePct;
      if (diff !== 0) return diff;
      const jDiff = b.bothVisiblePct - a.bothVisiblePct;
      if (jDiff !== 0) return jDiff;
      break;
    }
    case 'joint': {
      const diff = b.bothVisiblePct - a.bothVisiblePct;
      if (diff !== 0) return diff;
      const sDiff = b.sunVisiblePct - a.sunVisiblePct;
      if (sDiff !== 0) return sDiff;
      break;
    }
    case 'shortest_night': {
      const diff = a.maxDarkHours - b.maxDarkHours;
      if (diff !== 0) return diff;
      const sDiff = b.sunVisiblePct - a.sunVisiblePct;
      if (sDiff !== 0) return sDiff;
      break;
    }
    case 'score':
    default: {
      const sa = a.viabilityScore ?? -Infinity;
      const sb = b.viabilityScore ?? -Infinity;
      const diff = sb - sa;
      if (diff !== 0) return diff;
      const sDiff = b.sunVisiblePct - a.sunVisiblePct;
      if (sDiff !== 0) return sDiff;
      break;
    }
  }
  const vDiff = (b.viabilityScore ?? -Infinity) - (a.viabilityScore ?? -Infinity);
  if (vDiff !== 0) return vDiff;
  const sDiff = b.sunVisiblePct - a.sunVisiblePct;
  if (sDiff !== 0) return sDiff;
  return a.id.localeCompare(b.id);
}

function greedyPickCandidates(
  sorted: SiteCandidate[],
  count: number,
  minSepKm: number,
  mode: 'A' | 'B',
): SiteCandidate[] {
  const limit = Math.max(0, Math.floor(count));
  if (limit === 0) return [];
  const picked: SiteCandidate[] = [];

  for (const cand of sorted) {
    if (minSepKm > 0) {
      let tooClose = false;
      for (const p of picked) {
        if (Math.hypot(cand.xKm - p.xKm, cand.yKm - p.yKm) < minSepKm) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;
    }
    picked.push({
      ...cand,
      mode,
      rank: picked.length + 1,
    });
    if (picked.length >= limit) break;
  }

  return picked;
}

/**
 * Rank precomputed WP7 Mode A candidates across the ±150 km South Pole grid,
 * applying region filtering (map / around / Artemis polygons), terrain constraints,
 * Q2 composite scoring via scoring.ts, and greedy min-separation de-clustering.
 */
export function rankCandidates(
  rawOrDecoded: SiteCandidatesData | DecodedSiteCandidates,
  query: CandidateQuery,
  artemisRegions?: ArtemisRegion[],
): CandidateRankResult {
  const data = isDecodedCandidates(rawOrDecoded)
    ? rawOrDecoded
    : decodeSiteCandidates(rawOrDecoded);

  const sp = data.search_params;
  const n = sp.grid_size;
  const compiledArtemis = compileArtemisRegions(query.region, artemisRegions);

  // Detect whether search_params.x0_m refers to cell (0,0) center (-149400) or fine pixel (0,0) center (-149880)
  const expectedCellCenterX0 = -sp.extent_km * 1000.0 + sp.cell_mpp_m * 0.5;
  const isCellCenterOrigin = Math.abs(sp.x0_m - expectedCellCenterX0) < sp.fine_mpp_m * 0.6;

  let outsideRegion = 0;
  let excludedByConstraints = 0;
  let totalEvaluated = 0;
  const eligible: SiteCandidate[] = [];

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const idx = r * n + c;
      const samplePx = data.samplePixel[idx];
      const sunRaw = data.sunVisiblePctX100[idx];
      if (samplePx === U8_INVALID || sunRaw === U16_INVALID) {
        continue;
      }
      totalEvaluated += 1;

      const refinedCell = data.refinedByCell.get(`${r}:${c}`);
      if (refinedCell && refinedCell.pixels.length > 0) {
        let anyInRegion = false;
        let bestInCell: SiteCandidate | null = null;

        for (const px of refinedCell.pixels) {
          const regMatch = matchRegion(px.x_km, px.y_km, query.region, compiledArtemis, sp.extent_km);
          if (!regMatch.inside) continue;
          anyInRegion = true;

          if (!passesConstraints(px.slope_deg, px.flat_1km_pct, query)) continue;

          const viabilityScore = computeCandidateViability(
            px.sun_visible_pct,
            px.sun_time_pct,
            px.earth_visible_pct,
            px.both_visible_pct,
            px.max_dark_hours,
            px.flat_box_pct,
          );

          const cand: SiteCandidate = {
            id: `cand_a_${r}_${c}_p${px.pixel_idx}`,
            rank: 0,
            mode: 'A',
            lat: px.lat,
            lon: px.lon,
            xKm: px.x_km,
            yKm: px.y_km,
            elevM: px.elev_m,
            slopeDeg: px.slope_deg,
            flat1kmPct: px.flat_1km_pct,
            flatBoxPct: px.flat_box_pct,
            sunVisiblePct: px.sun_visible_pct,
            sunTimePct: px.sun_time_pct,
            earthVisiblePct: px.earth_visible_pct,
            bothVisiblePct: px.both_visible_pct,
            maxDarkHours: px.max_dark_hours,
            viabilityScore,
            isRefined: true,
            cellRow: r,
            cellCol: c,
            samplePixel: px.pixel_idx,
            artemisCode: regMatch.artemisCode,
          };

          if (!bestInCell || compareByCriterion(cand, bestInCell, query.criterion) < 0) {
            bestInCell = cand;
          }
        }

        if (!anyInRegion) {
          outsideRegion += 1;
        } else if (!bestInCell) {
          excludedByConstraints += 1;
        } else {
          eligible.push(bestInCell);
        }
        continue;
      }

      // Cell-level Step-1 candidate (highest 240 m pixel in the 5x5 block)
      const dr = Math.floor(samplePx / 5);
      const dc = samplePx % 5;
      const xM = isCellCenterOrigin
        ? sp.x0_m + c * sp.cell_mpp_m + (dc - 2) * sp.fine_mpp_m
        : sp.x0_m + (c * 5 + dc) * sp.fine_mpp_m;
      const yM = isCellCenterOrigin
        ? sp.y0_m - r * sp.cell_mpp_m - (dr - 2) * sp.fine_mpp_m
        : sp.y0_m - (r * 5 + dr) * sp.fine_mpp_m;
      const xKm = Number((xM / 1000.0).toFixed(4));
      const yKm = Number((yM / 1000.0).toFixed(4));

      const regMatch = matchRegion(xKm, yKm, query.region, compiledArtemis, sp.extent_km);
      if (!regMatch.inside) {
        outsideRegion += 1;
        continue;
      }

      const slopeDeg = data.slopeDegX100[idx] / 100.0;
      const flat1kmRaw = data.flat1kmPctX100[idx];
      const flat1kmPct = flat1kmRaw === U16_INVALID ? null : flat1kmRaw / 100.0;

      if (!passesConstraints(slopeDeg, flat1kmPct, query)) {
        excludedByConstraints += 1;
        continue;
      }

      const [lat, lon] = xyKm2ll(xKm, yKm);
      const sunVisiblePct = sunRaw / 100.0;
      const sunTimePct = data.sunTimePctX100[idx] / 100.0;
      const earthVisiblePct = data.earthVisiblePctX100[idx] / 100.0;
      const bothVisiblePct = data.bothVisiblePctX100[idx] / 100.0;
      const maxDarkHours = data.maxDarkHours[idx];
      const flatBoxRaw = data.flatBoxPctX100[idx];
      const flatBoxPct = flatBoxRaw === U16_INVALID ? null : flatBoxRaw / 100.0;
      const elevM = data.elevM[idx];

      const viabilityScore = computeCandidateViability(
        sunVisiblePct,
        sunTimePct,
        earthVisiblePct,
        bothVisiblePct,
        maxDarkHours,
        flatBoxPct,
      );

      eligible.push({
        id: `cand_a_${r}_${c}_p${samplePx}`,
        rank: 0,
        mode: 'A',
        lat: Number(lat.toFixed(5)),
        lon: Number(lon.toFixed(4)),
        xKm,
        yKm,
        elevM,
        slopeDeg,
        flat1kmPct,
        flatBoxPct,
        sunVisiblePct,
        sunTimePct,
        earthVisiblePct,
        bothVisiblePct,
        maxDarkHours,
        viabilityScore,
        isRefined: false,
        cellRow: r,
        cellCol: c,
        samplePixel: samplePx,
        artemisCode: regMatch.artemisCode,
      });
    }
  }

  eligible.sort((a, b) => compareByCriterion(a, b, query.criterion));
  const picked = greedyPickCandidates(eligible, query.count, query.minSepKm, 'A');

  return {
    picked,
    excludedByConstraints,
    outsideRegion,
    totalEvaluated,
  };
}

/**
 * Convert a WP7 SiteCandidate into a full SiteData object using the unified pin engine,
 * strictly omitting mission_status and provenance (WP7 §6 rule 7).
 */
export function candidateToSiteData(
  candidate: SiteCandidate,
  patch: DecodedDemPatch | null,
  eph?: EphemerisData,
  mastHeightM = 2.0,
  clientDem?: ClientDemBundle | null,
  options?: ComputeOptions,
): SiteData {
  const basePin = buildCustomPolarSite(
    patch,
    candidate.xKm,
    candidate.yKm,
    mastHeightM,
    eph,
    clientDem,
    options,
  );

  const normalizedMetrics: SiteMetrics2m = eph
    ? {
        ...basePin.metrics_2m,
        viability_score: computeViability(basePin.metrics_2m, basePin.terrain_stats),
        archetype: classifyArchetype(basePin.metrics_2m, 'Computed Candidate'),
      }
    : {
        sun_no_terrain_pct: basePin.metrics_2m.sun_no_terrain_pct,
        sun_time_pct: candidate.sunTimePct,
        sun_visible_pct: candidate.sunVisiblePct,
        earth_visible_pct: candidate.earthVisiblePct,
        both_visible_pct: candidate.bothVisiblePct,
        longest_sun_days: basePin.metrics_2m.longest_sun_days,
        max_dark_days: Number((candidate.maxDarkHours / 24.0).toFixed(2)),
        earth_max_gap_days: basePin.metrics_2m.earth_max_gap_days,
        viability_score: candidate.viabilityScore,
        archetype: null,
      };

  const site: SiteData = {
    ...basePin,
    id: candidate.id,
    name: `Candidate #${candidate.rank} (${candidate.lat.toFixed(3)}°, ${candidate.lon.toFixed(2)}°)`,
    short_name: `Cand #${candidate.rank}`,
    category: 'Computed Candidate',
    program: `Mode ${candidate.mode} Terrain Scan (LOLA DEM + JPL Horizons)`,
    description: `Computed candidate #${candidate.rank} at (${candidate.lat.toFixed(4)}°, ${candidate.lon.toFixed(4)}°) from LOLA DEM and JPL Horizons ephemeris. Ranked solely by selected criterion; not a mission landing endorsement.`,
    metrics_2m: normalizedMetrics,
    isCustom: true,
    isCandidate: true,
  };

  delete site.mission_status;
  delete site.provenance;
  return site;
}

// ---------- Mode B Live Window Scan (WP7 Chặng 3) ----------

function slopeSqAtPixel(grid: DecodedDemGrid, r: number, c: number): number {
  const w = grid.nCols;
  const scale = grid.scaleM;
  const mpp = grid.mppM;
  const ri = Math.max(0, Math.min(grid.nRows - 1, r));
  const ci = Math.max(0, Math.min(w - 1, c));

  let gx: number;
  if (ci === 0) gx = ((grid.elev[ri * w + 1] - grid.elev[ri * w]) * scale) / mpp;
  else if (ci === w - 1) gx = ((grid.elev[ri * w + ci] - grid.elev[ri * w + ci - 1]) * scale) / mpp;
  else gx = ((grid.elev[ri * w + ci + 1] - grid.elev[ri * w + ci - 1]) * scale) / (2.0 * mpp);

  let gy: number;
  if (ri === 0) gy = ((grid.elev[w + ci] - grid.elev[ci]) * scale) / mpp;
  else if (ri === grid.nRows - 1) gy = ((grid.elev[ri * w + ci] - grid.elev[(ri - 1) * w + ci]) * scale) / mpp;
  else gy = ((grid.elev[(ri + 1) * w + ci] - grid.elev[(ri - 1) * w + ci]) * scale) / (2.0 * mpp);

  return gx * gx + gy * gy;
}

function fastFlatPctInRadius(grid: DecodedDemGrid, ri: number, ci: number, halfPx: number, circular: boolean): number {
  const r0 = Math.max(0, ri - halfPx);
  const r1 = Math.min(grid.nRows - 1, ri + halfPx);
  const c0 = Math.max(0, ci - halfPx);
  const c1 = Math.min(grid.nCols - 1, ci + halfPx);
  const radSq = halfPx * halfPx + 1.36; // ~ (1000/240)^2 = 17.36 when halfPx = 4

  let total = 0;
  let flat = 0;
  for (let r = r0; r <= r1; r++) {
    const dr = r - ri;
    for (let c = c0; c <= c1; c++) {
      if (circular && dr * dr + (c - ci) * (c - ci) > radSq) continue;
      total += 1;
      if (slopeSqAtPixel(grid, r, c) <= TAN_5DEG_SQ) flat += 1;
    }
  }
  return total === 0 ? 0 : Number(((flat / total) * 100.0).toFixed(1));
}

function makeAbortError(): Error {
  const err = new Error('Live candidate scan aborted');
  err.name = 'AbortError';
  return err;
}

export interface ScanAroundCoreParams {
  centerXKm: number;
  centerYKm: number;
  radiusKm: number;
  query: CandidateQuery;
  eph: EphemerisData;
  tIdx: number;
  windowHours: number;
  mastHeightM: number;
  clientDem: ClientDemBundle;
  options?: ComputeOptions;
  artemisRegions?: ArtemisRegion[];
  onProgress?: (progress01: number, phase: string) => void;
  shouldAbort?: () => boolean;
}

/**
 * Pure two-step Mode B live scanner using the unified pin horizon & window evaluation engine.
 * Executed inside scanAroundWorker.ts in the browser (or directly in Node tests).
 */
export function scanAroundCore(params: ScanAroundCoreParams): CandidateRankResult {
  const {
    centerXKm,
    centerYKm,
    radiusKm,
    query,
    eph,
    tIdx,
    windowHours,
    mastHeightM,
    clientDem,
    options,
    artemisRegions,
    onProgress,
    shouldAbort,
  } = params;

  if (shouldAbort?.()) throw makeAbortError();

  const fine = clientDem.fine;
  const cellMppM = 1200.0;
  const blockSize = 5;
  const nCellsR = Math.floor(fine.nRows / blockSize);
  const nCellsC = Math.floor(fine.nCols / blockSize);

  const radiusM = Math.max(0.5, radiusKm) * 1000.0;
  const centerXM = centerXKm * 1000.0;
  const centerYM = centerYKm * 1000.0;
  const compiledArtemis = compileArtemisRegions(query.region, artemisRegions);

  const minColPx = Math.max(0, Math.floor((centerXM - radiusM - fine.x0M) / fine.mppM));
  const maxColPx = Math.min(fine.nCols - 1, Math.ceil((centerXM + radiusM - fine.x0M) / fine.mppM));
  const minRowPx = Math.max(0, Math.floor((fine.y0M - (centerYM + radiusM)) / fine.mppM));
  const maxRowPx = Math.min(fine.nRows - 1, Math.ceil((fine.y0M - (centerYM - radiusM)) / fine.mppM));

  const cellR0 = Math.max(0, Math.floor(minRowPx / blockSize));
  const cellR1 = Math.min(nCellsR - 1, Math.floor(maxRowPx / blockSize));
  const cellC0 = Math.max(0, Math.floor(minColPx / blockSize));
  const cellC1 = Math.min(nCellsC - 1, Math.floor(maxColPx / blockSize));

  const evalPixel = (
    rFine: number,
    cFine: number,
    cellRow: number,
    cellCol: number,
    pixelIdx: number,
    isRefined: boolean,
    artemisCode: string | null,
  ): SiteCandidate => {
    const xM = fine.x0M + cFine * fine.mppM;
    const yM = fine.y0M - rFine * fine.mppM;
    const xKm = xM / 1000.0;
    const yKm = yM / 1000.0;
    const [rawLat, lon] = xyKm2ll(xKm, yKm);
    const safeLat = Math.max(-89.99999, Math.min(89.99999, rawLat));

    const elevM = sampleDemGridBilinear(fine, xM, yM);
    const slopeDeg = Number((Math.atan(Math.sqrt(slopeSqAtPixel(fine, rFine, cFine))) * RAD2DEG).toFixed(2));
    const flat1kmPct = fastFlatPctInRadius(fine, rFine, cFine, 4, true);
    const flatBoxPct = fastFlatPctInRadius(fine, rFine, cFine, 62, false);

    const hz = computeCustomPolarHorizon(clientDem, xKm, yKm, mastHeightM);
    const siteStub: SiteData = {
      id: `cand_b_${cellRow}_${cellCol}_p${pixelIdx}`,
      name: '',
      short_name: '',
      category: 'Computed Candidate',
      program: 'Mode B Live Scan',
      description: '',
      terrain_source: 'LOLA_240M',
      is_polar_dem: true,
      elev_source: 'DEM',
      lat: Number(safeLat.toFixed(5)),
      lon: Number(lon.toFixed(4)),
      polar_x_km: Number(xKm.toFixed(2)),
      polar_y_km: Number(yKm.toFixed(2)),
      elev_m: Number(elevM.toFixed(1)),
      local_slope_deg: slopeDeg,
      terrain_stats: null,
      metrics_2m: {
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
      },
      drift_240m: null,
      horizons_by_mast: { '2': hz },
      blocking_dist_km: null,
      isCustom: true,
      isCandidate: true,
    };

    const { summary } = computeInstantAndWindow(eph, siteStub, hz, tIdx, windowHours, options);
    const sunVisiblePct = Number(summary.sunPct.toFixed(1));
    const sunTimePct = Number(summary.sunTimePct.toFixed(1));
    const earthVisiblePct = Number(summary.earthPct.toFixed(1));
    const bothVisiblePct = Number(summary.bothPct.toFixed(1));
    const maxDarkHours = summary.maxDarkHours;
    const viabilityScore = computeCandidateViability(
      sunVisiblePct,
      sunTimePct,
      earthVisiblePct,
      bothVisiblePct,
      maxDarkHours,
      flatBoxPct,
    );

    return {
      id: `cand_b_${cellRow}_${cellCol}_p${pixelIdx}`,
      rank: 0,
      mode: 'B',
      lat: siteStub.lat,
      lon: siteStub.lon,
      xKm: Number(xKm.toFixed(4)),
      yKm: Number(yKm.toFixed(4)),
      elevM: Number(elevM.toFixed(1)),
      slopeDeg,
      flat1kmPct,
      flatBoxPct,
      sunVisiblePct,
      sunTimePct,
      earthVisiblePct,
      bothVisiblePct,
      maxDarkHours,
      viabilityScore,
      isRefined,
      cellRow,
      cellCol,
      samplePixel: pixelIdx,
      artemisCode,
    };
  };

  interface CellSeed {
    cellRow: number;
    cellCol: number;
    rFine: number;
    cFine: number;
    pixelIdx: number;
    artemisCode: string | null;
  }

  const step1Seeds: CellSeed[] = [];
  let totalEvaluated = 0;
  let outsideRegion = 0;
  let excludedByConstraints = 0;

  // Pre-collect cells inside search disk & filter constraints before ray-marching
  for (let cr = cellR0; cr <= cellR1; cr++) {
    for (let cc = cellC0; cc <= cellC1; cc++) {
      if (shouldAbort?.()) throw makeAbortError();

      const cellCenterXM = fine.x0M + (cc * blockSize + 2) * fine.mppM;
      const cellCenterYM = fine.y0M - (cr * blockSize + 2) * fine.mppM;
      if (Math.hypot(cellCenterXM - centerXM, cellCenterYM - centerYM) > radiusM + cellMppM * 0.75) {
        continue;
      }

      let bestR = -1;
      let bestC = -1;
      let bestPx = -1;
      let bestElev = -Infinity;
      let bestCode: string | null = null;
      let anyInRadiusAndRegion = false;

      for (let dr = 0; dr < blockSize; dr++) {
        for (let dc = 0; dc < blockSize; dc++) {
          const rF = cr * blockSize + dr;
          const cF = cc * blockSize + dc;
          const xM = fine.x0M + cF * fine.mppM;
          const yM = fine.y0M - rF * fine.mppM;
          const xKm = xM / 1000.0;
          const yKm = yM / 1000.0;

          if (Math.hypot(xM - centerXM, yM - centerYM) > radiusM) continue;
          if (!isInsideDemGrid(fine, xM, yM)) continue;

          if (query.region.kind === 'artemis') {
            const reg = matchRegion(xKm, yKm, query.region, compiledArtemis);
            if (!reg.inside) continue;
            bestCode = reg.artemisCode;
          } else if (query.region.kind === 'around') {
            if (Math.hypot(xKm - query.region.xKm, yKm - query.region.yKm) > query.region.radiusKm) {
              continue;
            }
          }

          anyInRadiusAndRegion = true;

          const sDeg = Math.atan(Math.sqrt(slopeSqAtPixel(fine, rF, cF))) * RAD2DEG;
          const f1 = fastFlatPctInRadius(fine, rF, cF, 4, true);
          if (!passesConstraints(sDeg, f1, query)) continue;

          const eM = fine.elev[rF * fine.nCols + cF] * fine.scaleM;
          if (eM > bestElev) {
            bestElev = eM;
            bestR = rF;
            bestC = cF;
            bestPx = dr * blockSize + dc;
          }
        }
      }

      if (!anyInRadiusAndRegion) {
        if (Math.hypot(cellCenterXM - centerXM, cellCenterYM - centerYM) <= radiusM) {
          totalEvaluated += 1;
          outsideRegion += 1;
        }
        continue;
      }

      totalEvaluated += 1;
      if (bestR === -1) {
        excludedByConstraints += 1;
        continue;
      }

      step1Seeds.push({
        cellRow: cr,
        cellCol: cc,
        rFine: bestR,
        cFine: bestC,
        pixelIdx: bestPx,
        artemisCode: bestCode,
      });
    }
  }

  const refineTopCount = Math.min(step1Seeds.length, Math.max(query.count, 5));
  const totalWork = step1Seeds.length + refineTopCount * 24;
  let completedWork = 0;

  // Step 1: evaluate representative pixel of each surviving cell
  const cellResults = new Map<string, SiteCandidate>();
  for (const seed of step1Seeds) {
    if (shouldAbort?.()) throw makeAbortError();
    const cand = evalPixel(
      seed.rFine,
      seed.cFine,
      seed.cellRow,
      seed.cellCol,
      seed.pixelIdx,
      false,
      seed.artemisCode,
    );
    cellResults.set(`${seed.cellRow}:${seed.cellCol}`, cand);
    completedWork += 1;
    if (completedWork % 4 === 0 || completedWork === step1Seeds.length) {
      onProgress?.(totalWork > 0 ? Math.min(0.95, completedWork / totalWork) : 1, 'step1');
    }
  }

  // Step 2: refine all remaining valid pixels in the top cells
  const sortedStep1 = Array.from(cellResults.values()).sort((a, b) =>
    compareByCriterion(a, b, query.criterion),
  );
  const cellsToRefine = sortedStep1.slice(0, refineTopCount);

  for (const topCell of cellsToRefine) {
    const cr = topCell.cellRow!;
    const cc = topCell.cellCol!;
    let bestInCell: SiteCandidate = { ...topCell, isRefined: true };

    for (let dr = 0; dr < blockSize; dr++) {
      for (let dc = 0; dc < blockSize; dc++) {
        if (shouldAbort?.()) throw makeAbortError();
        const pxIdx = dr * blockSize + dc;
        if (pxIdx === topCell.samplePixel) continue;

        const rF = cr * blockSize + dr;
        const cF = cc * blockSize + dc;
        const xM = fine.x0M + cF * fine.mppM;
        const yM = fine.y0M - rF * fine.mppM;
        const xKm = xM / 1000.0;
        const yKm = yM / 1000.0;

        if (Math.hypot(xM - centerXM, yM - centerYM) > radiusM) continue;
        if (!isInsideDemGrid(fine, xM, yM)) continue;

        let artCode: string | null = topCell.artemisCode ?? null;
        if (query.region.kind === 'artemis') {
          const reg = matchRegion(xKm, yKm, query.region, compiledArtemis);
          if (!reg.inside) continue;
          artCode = reg.artemisCode;
        } else if (query.region.kind === 'around') {
          if (Math.hypot(xKm - query.region.xKm, yKm - query.region.yKm) > query.region.radiusKm) {
            continue;
          }
        }

        const sDeg = Math.atan(Math.sqrt(slopeSqAtPixel(fine, rF, cF))) * RAD2DEG;
        const f1 = fastFlatPctInRadius(fine, rF, cF, 4, true);
        if (!passesConstraints(sDeg, f1, query)) continue;

        const refinedCand = evalPixel(rF, cF, cr, cc, pxIdx, true, artCode);
        if (compareByCriterion(refinedCand, bestInCell, query.criterion) < 0) {
          bestInCell = refinedCand;
        }

        completedWork += 1;
        if (completedWork % 6 === 0) {
          onProgress?.(totalWork > 0 ? Math.min(0.99, completedWork / totalWork) : 1, 'step2');
        }
      }
    }

    cellResults.set(`${cr}:${cc}`, bestInCell);
  }

  const finalEligible = Array.from(cellResults.values()).sort((a, b) =>
    compareByCriterion(a, b, query.criterion),
  );
  const picked = greedyPickCandidates(finalEligible, query.count, query.minSepKm, 'B');
  onProgress?.(1.0, 'done');

  return {
    picked,
    excludedByConstraints,
    outsideRegion,
    totalEvaluated,
  };
}

// ---------- Memoization Cache & Web Worker Orchestration ----------

const MAX_CACHE_ENTRIES = 32;
const scanMemoCache = new Map<string, CandidateRankResult>();

export function clearScanAroundCache(): void {
  scanMemoCache.clear();
}

function buildScanCacheKey(
  centerXKm: number,
  centerYKm: number,
  radiusKm: number,
  query: CandidateQuery,
  eph: EphemerisData,
  tIdx: number,
  windowHours: number,
  mastHeightM: number,
  clientDem: ClientDemBundle,
  options?: ComputeOptions,
): string {
  return JSON.stringify([
    Number(centerXKm.toFixed(3)),
    Number(centerYKm.toFixed(3)),
    Number(radiusKm.toFixed(2)),
    query,
    eph.data_version ?? eph.t0_utc,
    tIdx,
    windowHours,
    Number(mastHeightM.toFixed(2)),
    clientDem.manifest.data_version,
    options?.earthMaskDeg ?? 0,
    options?.applyEclipses !== false,
    options?.windowHours ?? null,
  ]);
}

export interface ScanWorkerRequest {
  requestId: number;
  centerXKm: number;
  centerYKm: number;
  radiusKm: number;
  query: CandidateQuery;
  eph: EphemerisData;
  tIdx: number;
  windowHours: number;
  mastHeightM: number;
  clientDem: ClientDemBundle;
  options?: ComputeOptions;
  artemisRegions?: ArtemisRegion[];
}

export type ScanWorkerResponse =
  | { type: 'progress'; requestId: number; progress: number; phase: string }
  | { type: 'result'; requestId: number; result: CandidateRankResult }
  | { type: 'error'; requestId: number; message: string };

let sharedWorker: Worker | null = null;
let nextRequestId = 1;

function terminateSharedWorker(): void {
  if (sharedWorker) {
    sharedWorker.terminate();
    sharedWorker = null;
  }
}

/**
 * Live Mode B scan around (centerXKm, centerYKm) within radiusKm for the active
 * mission window (tIdx, windowHours, mastHeightM). Runs asynchronously in a Web Worker
 * when available, with memoization cache and AbortSignal cancellation.
 */
export async function scanAroundLive(
  centerXKm: number,
  centerYKm: number,
  radiusKm: number,
  query: CandidateQuery,
  eph: EphemerisData,
  tIdx: number,
  windowHours = DEFAULT_WINDOW_HOURS,
  mastHeightM = 2.0,
  clientDem: ClientDemBundle,
  options?: ComputeOptions,
  onProgress?: (progress01: number, phase?: string) => void,
  signal?: AbortSignal,
  artemisRegions?: ArtemisRegion[],
): Promise<CandidateRankResult> {
  if (signal?.aborted) {
    throw makeAbortError();
  }

  const cacheKey = buildScanCacheKey(
    centerXKm,
    centerYKm,
    radiusKm,
    query,
    eph,
    tIdx,
    windowHours,
    mastHeightM,
    clientDem,
    options,
  );

  const cached = scanMemoCache.get(cacheKey);
  if (cached) {
    onProgress?.(1.0, 'cached');
    return cached;
  }

  const saveCache = (res: CandidateRankResult): CandidateRankResult => {
    if (scanMemoCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = scanMemoCache.keys().next().value;
      if (oldestKey !== undefined) scanMemoCache.delete(oldestKey);
    }
    scanMemoCache.set(cacheKey, res);
    return res;
  };

  if (typeof Worker !== 'undefined') {
    try {
      return await new Promise<CandidateRankResult>((resolve, reject) => {
        const reqId = nextRequestId++;
        if (!sharedWorker) {
          sharedWorker = new Worker(new URL('./scanAroundWorker.ts', import.meta.url), {
            type: 'module',
          });
        }
        const worker = sharedWorker;

        const cleanup = () => {
          worker.removeEventListener('message', handleMessage);
          worker.removeEventListener('error', handleError);
          signal?.removeEventListener('abort', handleAbort);
        };

        const handleAbort = () => {
          cleanup();
          terminateSharedWorker();
          reject(makeAbortError());
        };

        const handleError = (ev: ErrorEvent) => {
          cleanup();
          terminateSharedWorker();
          reject(new Error(ev.message || 'Candidate scan worker error'));
        };

        const handleMessage = (ev: MessageEvent<ScanWorkerResponse>) => {
          const msg = ev.data;
          if (!msg || msg.requestId !== reqId) return;
          if (msg.type === 'progress') {
            onProgress?.(msg.progress, msg.phase);
            return;
          }
          if (msg.type === 'result') {
            cleanup();
            resolve(saveCache(msg.result));
            return;
          }
          if (msg.type === 'error') {
            cleanup();
            reject(new Error(msg.message));
          }
        };

        signal?.addEventListener('abort', handleAbort, { once: true });
        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);

        const payload: ScanWorkerRequest = {
          requestId: reqId,
          centerXKm,
          centerYKm,
          radiusKm,
          query,
          eph,
          tIdx,
          windowHours,
          mastHeightM,
          clientDem,
          options,
          artemisRegions,
        };
        worker.postMessage(payload);
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }
      // Fallback to direct async execution if Worker construction fails
    }
  }

  const res = scanAroundCore({
    centerXKm,
    centerYKm,
    radiusKm,
    query,
    eph,
    tIdx,
    windowHours,
    mastHeightM,
    clientDem,
    options,
    artemisRegions,
    onProgress: (p, phase) => onProgress?.(p, phase),
    shouldAbort: () => Boolean(signal?.aborted),
  });
  return saveCache(res);
}

// Re-export computeGridTerrainStats30km & computeGridSlopeDegAt check so unused-import lint stays clean if needed
export { computeGridSlopeDegAt, computeGridTerrainStats30km };

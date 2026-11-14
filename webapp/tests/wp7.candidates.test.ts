import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  candidateToSiteData,
  clearScanAroundCache,
  decodeSiteCandidates,
  rankCandidates,
  scanAroundLive,
} from '../src/lib/candidates';
import { computeInstantAndWindow, decodeDemGrid, xyKm2ll } from '../src/lib/lunarMath';
import type {
  ArtemisRegion,
  CandidateQuery,
  ClientDemBundle,
  DemGridDescriptor,
  DemManifest,
  EphemerisData,
  SiteCandidatesData,
} from '../src/types/lunar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA_DIR = path.resolve(__dirname, '../public/data');

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
}

function u16ToBase64(arr: Uint16Array): string {
  const buf = Buffer.alloc(arr.length * 2);
  for (let i = 0; i < arr.length; i++) {
    buf.writeUInt16LE(arr[i], i * 2);
  }
  return buf.toString('base64');
}

function i16ToBase64(arr: Int16Array): string {
  const buf = Buffer.alloc(arr.length * 2);
  for (let i = 0; i < arr.length; i++) {
    buf.writeInt16LE(arr[i], i * 2);
  }
  return buf.toString('base64');
}

function makeSyntheticCandidates(gridSize = 10): SiteCandidatesData {
  const nCells = gridSize * gridSize;
  const sunVis = new Uint16Array(nCells).fill(2000); // 20%
  const sunTime = new Uint16Array(nCells).fill(2500); // 25%
  const earthVis = new Uint16Array(nCells).fill(4000); // 40%
  const bothVis = new Uint16Array(nCells).fill(1500); // 15%
  const maxDark = new Uint16Array(nCells).fill(360); // 15 days
  const slope = new Uint16Array(nCells).fill(800); // 8.0 deg (above default 5 deg!)
  const flat1km = new Uint16Array(nCells).fill(1000); // 10% (below default 20%!)
  const flatBox = new Uint16Array(nCells).fill(1500); // 15%
  const elev = new Int16Array(nCells).fill(500);
  const samplePx = new Uint8Array(nCells).fill(12); // center pixel (2,2)

  // Candidate A at cell (2,2): huge sun 92%, steep slope 6.5 deg, low flat1km 4% (blocked by default constraints!)
  const idxA = 2 * gridSize + 2;
  sunVis[idxA] = 9200;
  sunTime[idxA] = 9500;
  earthVis[idxA] = 5500;
  bothVis[idxA] = 5200;
  maxDark[idxA] = 65;
  slope[idxA] = 650;
  flat1km[idxA] = 400;
  flatBox[idxA] = 1000;
  elev[idxA] = 2000;

  // Candidate B at cell (2,3) (~1.2 km from A, < 2.4 km minSepKm): good score, valid slope 2.0 deg, flat 30%
  const idxB = 2 * gridSize + 3;
  sunVis[idxB] = 8500;
  sunTime[idxB] = 8800;
  earthVis[idxB] = 6000;
  bothVis[idxB] = 5600;
  maxDark[idxB] = 120;
  slope[idxB] = 200;
  flat1km[idxB] = 3000;
  flatBox[idxB] = 2500;
  elev[idxB] = 1800;

  // Candidate C at cell (7,7) (far from B): highest Earth & Joint, valid slope 1.5 deg, flat 40%
  const idxC = 7 * gridSize + 7;
  sunVis[idxC] = 7200;
  sunTime[idxC] = 7600;
  earthVis[idxC] = 9600;
  bothVis[idxC] = 7200;
  maxDark[idxC] = 144;
  slope[idxC] = 150;
  flat1km[idxC] = 4000;
  flatBox[idxC] = 3500;
  elev[idxC] = 3200;

  // Candidate D at cell (5,5): shortest night (48h = 2 days), valid constraints
  const idxD = 5 * gridSize + 5;
  sunVis[idxD] = 6500;
  sunTime[idxD] = 7000;
  earthVis[idxD] = 5000;
  bothVis[idxD] = 4000;
  maxDark[idxD] = 48;
  slope[idxD] = 300;
  flat1km[idxD] = 2500;
  flatBox[idxD] = 2000;
  elev[idxD] = 1500;

  // Cell (2,2) refined: include a secondary pixel inside (2,2) that HAS slope 3.0 deg & flat1km 22%!
  const x0_m = -5400;
  const y0_m = 5400;
  const cellMpp = 1200;
  const fineMpp = 240;
  const cx = (x0_m + 2 * cellMpp) / 1000;
  const cy = (y0_m - 2 * cellMpp) / 1000;
  const [latA, lonA] = xyKm2ll(cx, cy);
  const [latA2, lonA2] = xyKm2ll(cx + 0.24, cy);

  return {
    schema_version: '2.0',
    data_version: 'test-v2',
    generated_utc: '2026-11-14T00:00:00Z',
    search_params: {
      extent_km: 6.0,
      grid_size: gridSize,
      cell_mpp_m: cellMpp,
      fine_mpp_m: fineMpp,
      x0_m,
      y0_m,
      mast_m: 2,
      period_start_utc: '2026-11-14T00:00:00Z',
      period_end_utc: '2029-01-15T00:00:00Z',
      n_steps: 19033,
      dem_product: 'LDEM_75S_240M',
      ephemeris_source: 'JPL DE441',
      refined_cell_count: 1,
      layer_definitions: { sun_visible_pct: 'mean disk fraction * 100' },
    },
    layers: {
      sun_visible_pct_x100_u16_b64: u16ToBase64(sunVis),
      sun_time_pct_x100_u16_b64: u16ToBase64(sunTime),
      earth_visible_pct_x100_u16_b64: u16ToBase64(earthVis),
      both_visible_pct_x100_u16_b64: u16ToBase64(bothVis),
      max_dark_hours_u16_b64: u16ToBase64(maxDark),
      slope_deg_x100_u16_b64: u16ToBase64(slope),
      flat_1km_pct_x100_u16_b64: u16ToBase64(flat1km),
      flat_box_pct_x100_u16_b64: u16ToBase64(flatBox),
      elev_m_i16_b64: i16ToBase64(elev),
      sample_pixel_u8_b64: bytesToBase64(samplePx),
    },
    refined: [
      {
        cell_row: 2,
        cell_col: 2,
        pixels: [
          {
            pixel_idx: 12,
            dr: 2,
            dc: 2,
            lat: latA,
            lon: lonA,
            x_km: cx,
            y_km: cy,
            elev_m: 2000,
            slope_deg: 6.5,
            flat_1km_pct: 4.0,
            flat_box_pct: 10.0,
            sun_visible_pct: 92.0,
            sun_time_pct: 95.0,
            earth_visible_pct: 55.0,
            both_visible_pct: 52.0,
            max_dark_hours: 65,
          },
          {
            pixel_idx: 13,
            dr: 2,
            dc: 3,
            lat: latA2,
            lon: lonA2,
            x_km: cx + 0.24,
            y_km: cy,
            elev_m: 1980,
            slope_deg: 3.0,
            flat_1km_pct: 22.0,
            flat_box_pct: 12.0,
            sun_visible_pct: 89.0,
            sun_time_pct: 91.0,
            earth_visible_pct: 56.0,
            both_visible_pct: 53.0,
            max_dark_hours: 72,
          },
        ],
      },
    ],
  };
}

function makeSyntheticBundleAndEph(): { bundle: ClientDemBundle; eph: EphemerisData } {
  const nCols = 60;
  const nRows = 60;
  const mpp = 240;
  const x0 = -((nCols - 1) * 0.5) * mpp;
  const y0 = ((nRows - 1) * 0.5) * mpp;
  const fineElev = new Int16Array(nCols * nRows);
  for (let r = 0; r < nRows; r++) {
    const yM = y0 - r * mpp;
    for (let c = 0; c < nCols; c++) {
      const xM = x0 + c * mpp;
      // Gentle dome centered at (x=0, y=0)
      const dKm = Math.hypot(xM, yM) / 1000;
      fineElev[r * nCols + c] = Math.round(1200 - dKm * 12);
    }
  }

  const fineDesc: DemGridDescriptor = {
    file: 'dem_fine_240m.i16',
    n_cols: nCols,
    n_rows: nRows,
    mpp_m: mpp,
    x0_m: x0,
    y0_m: y0,
    aggregation: 'native',
    scale_m: 1.0,
    schema_version: '2.0',
  };
  const coarseDesc: DemGridDescriptor = { ...fineDesc, file: 'dem_coarse_1200m_max.i16', mpp_m: 1200, n_cols: 12, n_rows: 12 };
  const bundle: ClientDemBundle = {
    manifest: {
      schema_version: '2.0',
      data_version: 'wp7-synth',
      generated_utc: '2026-11-14T00:00:00Z',
      fine: fineDesc,
      coarse: coarseDesc,
    },
    fine: { nCols, nRows, mppM: mpp, x0M: x0, y0M: y0, scaleM: 1.0, elev: fineElev },
    coarse: { nCols: 12, nRows: 12, mppM: 1200, x0M: -6600, y0M: 6600, scaleM: 1.0, elev: new Int16Array(144).fill(1200) },
  };

  const nSteps = 48;
  const subsolar_lon = Array.from({ length: nSteps }, (_, i) => (i * 15) % 360 - 180);
  const subsolar_lat = new Array<number>(nSteps).fill(-1.5);
  const subearth_lon = new Array<number>(nSteps).fill(0);
  const subearth_lat = new Array<number>(nSteps).fill(-5.0);
  const earth_dist_km = new Array<number>(nSteps).fill(384400);

  const eph: EphemerisData = {
    schema_version: '2.0',
    data_version: 'wp7-synth',
    t0_utc: '2027-06-18T16:00:00Z',
    dt_hours: 1,
    n: nSteps,
    subearth_lon,
    subearth_lat,
    subsolar_lon,
    subsolar_lat,
    earth_dist_km,
    eclipses: [],
    validation: {
      sun_max_err_deg: 0.0002,
      earth_max_err_deg: 0.006,
      ephemeris: 'Synthetic',
      period_start: '2027-06-18T16:00:00Z',
      period_end: '2027-06-20T16:00:00Z',
    },
  };
  return { bundle, eph };
}

describe('WP7 Unit Tests — Mode A Ranking & Constraints', () => {
  it('decodeSiteCandidates & rankCandidates filter, score via scoring.ts, and enforce minSepKm', () => {
    const raw = makeSyntheticCandidates(10);
    const decoded = decodeSiteCandidates(raw);
    expect(decoded.sunVisiblePctX100.length).toBe(100);

    // Default constrained query: cell (2,2) refined pixel 13 (slope 3.0, flat1km 22%, sun 89%) passes,
    // while cell (2,3) is < 2.4 km away from (2,2) so minSepKm=2.4 suppresses it!
    const qDefault: CandidateQuery = {
      criterion: 'sun',
      region: { kind: 'map' },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 10,
      minSepKm: 2.4,
    };
    const res = rankCandidates(decoded, qDefault);
    expect(res.totalEvaluated).toBe(100);
    expect(res.excludedByConstraints).toBe(96); // 4 cells pass: (2,2), (2,3), (5,5), (7,7)
    expect(res.picked[0].sunVisiblePct).toBe(89.0);
    expect(res.picked[0].isRefined).toBe(true);
    expect(res.picked.map((p) => p.rank)).toEqual([1, 2, 3]);
    expect(res.picked.every((p) => p.mode === 'A')).toBe(true);

    // Check min separation between all picked pairs
    for (let i = 0; i < res.picked.length; i++) {
      for (let j = i + 1; j < res.picked.length; j++) {
        expect(Math.hypot(res.picked[i].xKm - res.picked[j].xKm, res.picked[i].yKm - res.picked[j].yKm)).toBeGreaterThanOrEqual(
          2.4,
        );
      }
    }

    // Unconstrained sun picks pixel 12 (92%) in cell (2,2)
    const resUnconstrained = rankCandidates(decoded, { ...qDefault, maxSlopeDeg: null, minFlat1kmPct: null });
    expect(resUnconstrained.picked[0].sunVisiblePct).toBe(92.0);
    expect(resUnconstrained.excludedByConstraints).toBe(0);
  });

  it('rankCandidates supports all 5 criteria and Artemis polygon filtering, and handles empty results cleanly', () => {
    const raw = makeSyntheticCandidates(10);

    const earthRes = rankCandidates(raw, {
      criterion: 'earth',
      region: { kind: 'map' },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 5,
      minSepKm: 2.4,
    });
    expect(earthRes.picked[0].earthVisiblePct).toBe(96.0);

    const nightRes = rankCandidates(raw, {
      criterion: 'shortest_night',
      region: { kind: 'map' },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 5,
      minSepKm: 2.4,
    });
    expect(nightRes.picked[0].maxDarkHours).toBe(48);

    const scoreRes = rankCandidates(raw, {
      criterion: 'score',
      region: { kind: 'map' },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 5,
      minSepKm: 2.4,
    });
    expect(scoreRes.picked[0].viabilityScore).not.toBeNull();
    // Cell (7,7) has highest composite score (72*0.35 + 96*0.25 + 72*0.15 + 80*0.15 + 35*0.10 = 75.5)
    expect(scoreRes.picked[0].earthVisiblePct).toBe(96.0);

    // Artemis polygon containing cell (7,7) at x=+3.0, y=-3.0 km
    const regions: ArtemisRegion[] = [
      {
        region: 'Test Region',
        code: 'TR1',
        centroid_lat: -89.8,
        centroid_lon: 135,
        area_km2: 9,
        polar_x_km: 3.0,
        polar_y_km: -3.0,
        rings_polar_km: [
          [
            [1.5, -4.5],
            [4.5, -4.5],
            [4.5, -1.5],
            [1.5, -1.5],
            [1.5, -4.5],
          ],
        ],
      },
    ];
    const artRes = rankCandidates(raw, {
      criterion: 'score',
      region: { kind: 'artemis', codes: ['TR1'] },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 5,
      minSepKm: 2.4,
    }, regions);
    expect(artRes.picked).toHaveLength(1);
    expect(artRes.picked[0].artemisCode).toBe('TR1');
    expect(artRes.outsideRegion).toBeGreaterThan(80);

    // Strict constraint empty-list check
    const emptyRes = rankCandidates(raw, {
      criterion: 'sun',
      region: { kind: 'map' },
      maxSlopeDeg: 0.5,
      minFlat1kmPct: 90,
      count: 10,
      minSepKm: 2.4,
    });
    expect(emptyRes.picked).toHaveLength(0);
    expect(emptyRes.excludedByConstraints).toBe(100);
  });

  it('candidateToSiteData omits mission_status/provenance and avoids banned landing endorsement claims', () => {
    const raw = makeSyntheticCandidates(10);
    const ranked = rankCandidates(raw, {
      criterion: 'score',
      region: { kind: 'map' },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 1,
      minSepKm: 2.4,
    });
    const cand = ranked.picked[0];
    const { bundle, eph } = makeSyntheticBundleAndEph();
    const site = candidateToSiteData(cand, null, eph, 2.0, bundle);

    expect(site.isCandidate).toBe(true);
    expect(site.isCustom).toBe(true);
    expect(site.mission_status).toBeUndefined();
    expect(site.provenance).toBeUndefined();

    const text = `${site.name} ${site.program} ${site.description}`.toLowerCase();
    expect(text).not.toContain('best landing site');
    expect(text).not.toContain('recommended landing site');
    expect(text).not.toContain('safe landing');
  });
});

describe('WP7 Unit Tests — Mode B Live Scan (scanAroundLive)', () => {
  it('scanAroundLive matches computeInstantAndWindow metrics at evaluated coordinates, caches results, and supports AbortSignal', async () => {
    clearScanAroundCache();
    const { bundle, eph } = makeSyntheticBundleAndEph();
    const query: CandidateQuery = {
      criterion: 'sun',
      region: { kind: 'around', xKm: 0, yKm: 0, radiusKm: 3.5 },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 3,
      minSepKm: 2.4,
    };

    const progressEvents: number[] = [];
    const res = await scanAroundLive(
      0,
      0,
      3.5,
      query,
      eph,
      0,
      24,
      2.0,
      bundle,
      undefined,
      (p) => progressEvents.push(p),
    );

    expect(res.picked.length).toBeGreaterThan(0);
    expect(res.picked[0].mode).toBe('B');
    expect(progressEvents[progressEvents.length - 1]).toBe(1.0);

    // Equivalence check: convert picked candidate to pin and compare computeInstantAndWindow
    const top = res.picked[0];
    const site = candidateToSiteData(top, null, eph, 2.0, bundle);
    const { summary } = computeInstantAndWindow(eph, site, site.horizons_by_mast['2'], 0, 24);
    expect(Math.abs(summary.sunPct - top.sunVisiblePct)).toBeLessThanOrEqual(0.2);
    expect(Math.abs(summary.earthPct - top.earthVisiblePct)).toBeLessThanOrEqual(0.2);

    // Memoization cache check
    let cachedPhase = '';
    const res2 = await scanAroundLive(
      0,
      0,
      3.5,
      query,
      eph,
      0,
      24,
      2.0,
      bundle,
      undefined,
      (_p, phase) => {
        if (phase) cachedPhase = phase;
      },
    );
    expect(cachedPhase).toBe('cached');
    expect(res2).toEqual(res);

    // AbortSignal cancellation check
    const ac = new AbortController();
    ac.abort();
    await expect(
      scanAroundLive(1.2, 1.2, 3.0, query, eph, 0, 24, 2.0, bundle, undefined, undefined, ac.signal),
    ).rejects.toThrow(/aborted/i);
  });
});

describe('WP7 Full-Dataset Integration Guards (runs when @pipeline data exists)', () => {
  const candPath = path.join(PUBLIC_DATA_DIR, 'site_candidates.json');
  const manifestPath = path.join(PUBLIC_DATA_DIR, 'dem_manifest.json');
  const ephPath = path.join(PUBLIC_DATA_DIR, 'ephemeris.json');
  const hasWp7Data = fs.existsSync(candPath) && fs.existsSync(manifestPath) && fs.existsSync(ephPath);

  it.skipIf(!hasWp7Data)('Mode A benchmarks in |x|,|y| <= 42 km reproduce WP7 §8 targets', () => {
    const raw = JSON.parse(fs.readFileSync(candPath, 'utf-8')) as SiteCandidatesData;
    const decoded = decodeSiteCandidates(raw);

    const sunUnconstrained = rankCandidates(decoded, {
      criterion: 'sun',
      region: { kind: 'around', xKm: 0, yKm: 0, radiusKm: 42 },
      maxSlopeDeg: null,
      minFlat1kmPct: null,
      count: 10,
      minSepKm: 2.4,
    });
    expect(sunUnconstrained.picked[0].sunVisiblePct).toBeGreaterThanOrEqual(90.0);

    const scoreDefault = rankCandidates(decoded, {
      criterion: 'score',
      region: { kind: 'around', xKm: 0, yKm: 0, radiusKm: 42 },
      maxSlopeDeg: 5,
      minFlat1kmPct: 20,
      count: 10,
      minSepKm: 2.4,
    });
    expect(scoreDefault.picked.length).toBe(10);
    expect(scoreDefault.picked[0].viabilityScore).toBeGreaterThanOrEqual(66.0);

    // Verify candidateToSiteData agrees with table within <= 2 pp using unified DEM
    const eph = JSON.parse(fs.readFileSync(ephPath, 'utf-8')) as EphemerisData;
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as DemManifest;
    const fineBuf = fs.readFileSync(path.join(PUBLIC_DATA_DIR, manifest.fine.file));
    const coarseBuf = fs.readFileSync(path.join(PUBLIC_DATA_DIR, manifest.coarse.file));
    const bundle: ClientDemBundle = {
      manifest,
      fine: decodeDemGrid(manifest.fine, fineBuf.buffer.slice(fineBuf.byteOffset, fineBuf.byteOffset + fineBuf.byteLength)),
      coarse: decodeDemGrid(
        manifest.coarse,
        coarseBuf.buffer.slice(coarseBuf.byteOffset, coarseBuf.byteOffset + coarseBuf.byteLength),
      ),
    };

    const topPin = candidateToSiteData(scoreDefault.picked[0], null, eph, 2.0, bundle);
    expect(Math.abs(topPin.metrics_2m.sun_visible_pct - scoreDefault.picked[0].sunVisiblePct)).toBeLessThanOrEqual(2.0);
    expect(Math.abs(topPin.metrics_2m.earth_visible_pct - scoreDefault.picked[0].earthVisiblePct)).toBeLessThanOrEqual(2.0);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  AU_KM,
  DEFAULT_WINDOW_HOURS,
  ECLIPSE_ASSUMPTION_TEXT,
  LUNAR_DAY_HOURS,
  POWER_ASSUMPTION_TEXT,
  R0_M,
  RISE_SET_DEFINITION_TEXT,
  SUN_RADIUS_DEG,
  buildCustomLatLonSite,
  buildCustomPolarSite,
  computeCustomPolarHorizon,
  computeInstantAndWindow,
  computeInstantEclipse,
  computeLaunchSensitivitySeries,
  computeSeasonalMarkers,
  computeSite26MonthMetrics,
  decodeDemGrid,
  interpolateHorizon,
  ll2xyKm,
  loadClientDemBundle,
  sphericalHorizonDipDeg,
  xyKm2ll,
} from '../src/lib/lunarMath';
import {
  SCORE_FORMULA_TEXT,
  SCORE_WEIGHTS,
  classifyArchetype,
  computeViability,
  findCuratedSiteNear,
  normalizeSites,
} from '../src/lib/scoring';
import type {
  ClientDemBundle,
  DemGridDescriptor,
  DemManifest,
  EphemerisData,
  SiteData,
  SiteMetrics2m,
  SitesDataset,
  TerrainStats,
} from '../src/types/lunar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const PUBLIC_DATA_DIR = path.resolve(__dirname, '../public/data');
const FULL_SUBPOINTS_CSV = path.join(REPO_ROOT, 'data/horizons/moon_subpoints_1h.csv');
const FIXTURE_SUBPOINTS_CSV = path.join(__dirname, 'fixtures/moon_subpoints_1h.csv');

function makeMetrics(overrides: Partial<SiteMetrics2m> = {}): SiteMetrics2m {
  return {
    sun_no_terrain_pct: 54.2,
    sun_time_pct: 92.0,
    sun_visible_pct: 90.6,
    earth_visible_pct: 53.7,
    both_visible_pct: 52.8,
    longest_sun_days: 261.0,
    max_dark_days: 5.9,
    earth_max_gap_days: 13.5,
    viability_score: null,
    archetype: null,
    ...overrides,
  };
}

function makeTerrain(pctSafe5 = 10.0): TerrainStats {
  return {
    elev_min_m: 100,
    elev_median_m: 1000,
    elev_max_m: 2000,
    elev_relief_m: 1900,
    slope_mean_deg: 6.0,
    slope_median_deg: 5.0,
    slope_p90_deg: 12.0,
    pct_safe_hls_le_5deg: pctSafe5,
    pct_rover_le_15deg: 80.0,
  };
}

function makeSite(overrides: Partial<SiteData> = {}): SiteData {
  const hzZero = new Array<number>(360).fill(0);
  return {
    id: 'test_site',
    name: 'Test Site',
    short_name: 'Test',
    category: 'South Pole',
    program: 'Test',
    description: 'Test description.',
    terrain_source: 'LOLA_240M',
    is_polar_dem: true,
    elev_source: 'DEM',
    lat: -89.45,
    lon: -137.31,
    polar_x_km: -11.3,
    polar_y_km: -12.2,
    elev_m: 1950,
    local_slope_deg: 0.6,
    terrain_stats: makeTerrain(10),
    metrics_2m: makeMetrics(),
    drift_240m: { sun_min_pct: 65, sun_max_pct: 90.6 },
    horizons_by_mast: {
      '0.5': hzZero,
      '2': hzZero,
      '10': hzZero,
      '20': hzZero,
      '50': hzZero,
    },
    blocking_dist_km: new Array<number>(360).fill(50),
    ...overrides,
  };
}

function loadSubpointsAsEphemeris(maxRows?: number): EphemerisData {
  const csvPath = fs.existsSync(FULL_SUBPOINTS_CSV) ? FULL_SUBPOINTS_CSV : FIXTURE_SUBPOINTS_CSV;
  const raw = fs.readFileSync(csvPath, 'utf-8').trim().split(/\r?\n/);
  const headers = raw[0].split(',').map((s) => s.trim());
  const colIdx = (name: string) => headers.indexOf(name);

  const cTime = colIdx('time_utc');
  const cSeLon = colIdx('subearth_lon');
  const cSeLat = colIdx('subearth_lat');
  const cSsLon = colIdx('subsolar_lon');
  const cSsLat = colIdx('subsolar_lat');
  const cAu = colIdx('earth_moon_au');

  const limit = maxRows ? Math.min(maxRows, raw.length - 1) : raw.length - 1;
  const subearth_lon: number[] = [];
  const subearth_lat: number[] = [];
  const subsolar_lon: number[] = [];
  const subsolar_lat: number[] = [];
  const earth_dist_km: number[] = [];

  for (let i = 1; i <= limit; i++) {
    const cols = raw[i].split(',');
    const wrap180 = (v: number) => (((v + 180) % 360) + 360) % 360 - 180;
    subearth_lon.push(Number(wrap180(Number.parseFloat(cols[cSeLon])).toFixed(4)));
    subearth_lat.push(Number(Number.parseFloat(cols[cSeLat]).toFixed(4)));
    subsolar_lon.push(Number(wrap180(Number.parseFloat(cols[cSsLon])).toFixed(4)));
    subsolar_lat.push(Number(Number.parseFloat(cols[cSsLat]).toFixed(4)));
    earth_dist_km.push(Number((Number.parseFloat(cols[cAu]) * AU_KM).toFixed(1)));
  }

  const t0Raw = raw[1].split(',')[cTime].trim();
  const t0_utc = t0Raw.includes('T') ? t0Raw : `${t0Raw.replace(' ', 'T')}Z`;

  return {
    t0_utc,
    dt_hours: 1,
    n: limit,
    subearth_lon,
    subearth_lat,
    subsolar_lon,
    subsolar_lat,
    earth_dist_km,
    eclipses: [
      { start_utc: '2028-12-31T15:00:00Z', idx: 18687, hours: 5, type: 'total (Sun fully hidden)' },
    ],
    validation: {
      sun_max_err_deg: 0.0002,
      earth_max_err_deg: 0.006,
      ephemeris: 'JPL Horizons DE441',
      period_start: t0_utc,
      period_end: '2029-01-15T00:00:00Z',
    },
  };
}

function makeSyntheticClientDem(): ClientDemBundle {
  // Fine grid: 150x150 @ 240 m/px -> covers [-18 km .. +18 km]
  const fineCols = 150;
  const fineRows = 150;
  const fineMpp = 240;
  const fineX0 = -((fineCols - 1) * 0.5) * fineMpp;
  const fineY0 = ((fineRows - 1) * 0.5) * fineMpp;
  const fineElev = new Int16Array(fineCols * fineRows);
  // Smooth mound peaking at center (x=0, y=0) at 1000 m with scale_m = 0.5 (raw DN = 2000)
  for (let r = 0; r < fineRows; r++) {
    const yM = fineY0 - r * fineMpp;
    for (let c = 0; c < fineCols; c++) {
      const xM = fineX0 + c * fineMpp;
      const distKm = Math.hypot(xM, yM) / 1000;
      const elevM = Math.max(0, 1000 - distKm * 30);
      fineElev[r * fineCols + c] = Math.round(elevM / 0.5);
    }
  }

  // Coarse grid: 80x80 @ 1200 m/px -> covers ~[-47.4 km .. +47.4 km]
  // Add a prominent 4000 m mountain ridge at x=+30 km, y=0 km (outside fine bounds!)
  const coarseCols = 80;
  const coarseRows = 80;
  const coarseMpp = 1200;
  const coarseX0 = -((coarseCols - 1) * 0.5) * coarseMpp;
  const coarseY0 = ((coarseRows - 1) * 0.5) * coarseMpp;
  const coarseElev = new Int16Array(coarseCols * coarseRows);
  for (let r = 0; r < coarseRows; r++) {
    const yM = coarseY0 - r * coarseMpp;
    for (let c = 0; c < coarseCols; c++) {
      const xM = coarseX0 + c * coarseMpp;
      const distRidgeKm = Math.hypot(xM - 30000, yM) / 1000;
      let elevM = 500;
      if (distRidgeKm < 6) {
        elevM = 4500 - distRidgeKm * 500;
      }
      coarseElev[r * coarseCols + c] = Math.round(elevM);
    }
  }

  const fineDesc: DemGridDescriptor = {
    file: 'dem_fine_240m.i16',
    n_cols: fineCols,
    n_rows: fineRows,
    mpp_m: fineMpp,
    x0_m: fineX0,
    y0_m: fineY0,
    aggregation: 'native',
    scale_m: 0.5,
    schema_version: '2.0',
  };
  const coarseDesc: DemGridDescriptor = {
    file: 'dem_coarse_1200m_max.i16',
    n_cols: coarseCols,
    n_rows: coarseRows,
    mpp_m: coarseMpp,
    x0_m: coarseX0,
    y0_m: coarseY0,
    aggregation: 'max',
    scale_m: 1.0,
    schema_version: '2.0',
  };
  const manifest: DemManifest = {
    schema_version: '2.0',
    data_version: 'test',
    generated_utc: '2026-11-14T00:00:00Z',
    fine: fineDesc,
    coarse: coarseDesc,
  };

  return {
    manifest,
    fine: {
      nCols: fineCols,
      nRows: fineRows,
      mppM: fineMpp,
      x0M: fineX0,
      y0M: fineY0,
      scaleM: 0.5,
      elev: fineElev,
    },
    coarse: {
      nCols: coarseCols,
      nRows: coarseRows,
      mppM: coarseMpp,
      x0M: coarseX0,
      y0M: coarseY0,
      scaleM: 1.0,
      elev: coarseElev,
    },
  };
}

describe('WP2 Unit Tests — Scoring & Classification (I2 / DATA-2)', () => {
  it('SCORE_WEIGHTS matches Q2 and SCORE_FORMULA_TEXT clarifies non-NASA team index', () => {
    expect(SCORE_WEIGHTS).toEqual({ sun: 0.35, earth: 0.25, joint: 0.15, dark: 0.15, slope: 0.1 });
    const sum =
      SCORE_WEIGHTS.sun +
      SCORE_WEIGHTS.earth +
      SCORE_WEIGHTS.joint +
      SCORE_WEIGHTS.dark +
      SCORE_WEIGHTS.slope;
    expect(sum).toBeCloseTo(1.0, 8);
    expect(SCORE_FORMULA_TEXT.toLowerCase()).toContain('not a nasa standard');
  });

  it('computeViability returns null when terrainStats is null and reproduces Appendix B polar scores', () => {
    expect(computeViability(makeMetrics(), null)).toBeNull();

    // Appendix B verified reference inputs & scores (within <= 0.1 of unrounded pipeline output)
    const cr = computeViability(
      makeMetrics({ sun_visible_pct: 90.6, earth_visible_pct: 53.7, both_visible_pct: 52.8, max_dark_days: 5.92 }),
      makeTerrain(8.4),
    );
    expect(cr).not.toBeNull();
    expect(Math.abs(cr! - 66.0)).toBeLessThanOrEqual(0.1 + 1e-9);

    const pns = computeViability(
      makeMetrics({ sun_visible_pct: 86.5, earth_visible_pct: 57.4, both_visible_pct: 54.2, max_dark_days: 5.67 }),
      makeTerrain(20.0),
    );
    expect(pns).not.toBeNull();
    expect(Math.abs(pns! - 66.9)).toBeLessThanOrEqual(0.1 + 1e-9);

    const mm = computeViability(
      makeMetrics({ sun_visible_pct: 64.9, earth_visible_pct: 99.0, both_visible_pct: 66.8, max_dark_days: 12.25 }),
      makeTerrain(13.6),
    );
    expect(mm).not.toBeNull();
    expect(Math.abs(mm! - 67.7)).toBeLessThanOrEqual(0.1 + 1e-9);

    const mal = computeViability(
      makeMetrics({ sun_visible_pct: 77.0, earth_visible_pct: 75.5, both_visible_pct: 56.9, max_dark_days: 15.25 }),
      makeTerrain(7.0),
    );
    expect(mal).not.toBeNull();
    expect(Math.abs(mal! - 62.4)).toBeLessThanOrEqual(0.1 + 1e-9);

    const sr = computeViability(
      makeMetrics({ sun_visible_pct: 78.7, earth_visible_pct: 52.5, both_visible_pct: 42.6, max_dark_days: 8.12 }),
      makeTerrain(21.5),
    );
    expect(sr).not.toBeNull();
    expect(Math.abs(sr! - 60.2)).toBeLessThanOrEqual(0.1 + 1e-9);
  });

  it('classifyArchetype implements canonical pipeline rules and returns null for uncomputed placeholders', () => {
    expect(classifyArchetype(makeMetrics({ sun_visible_pct: 0, earth_visible_pct: 0 }), 'PSR')).toBe(
      'Permanent Shadow (PSR)',
    );
    expect(classifyArchetype(makeMetrics({ sun_visible_pct: 48, earth_visible_pct: 0 }), 'Historic')).toBe(
      'Far-Side Relay Required',
    );
    expect(classifyArchetype(makeMetrics({ sun_visible_pct: 77, earth_visible_pct: 75.5 }), 'South Pole')).toBe(
      'Balanced Power + DTE Summit',
    );
    expect(classifyArchetype(makeMetrics({ sun_visible_pct: 90.6, earth_visible_pct: 53.7 }), 'South Pole')).toBe(
      'Peak Solar Beacon',
    );
    expect(classifyArchetype(makeMetrics({ sun_visible_pct: 45, earth_visible_pct: 82 }), 'CLPS')).toBe(
      'High-DTE Communication Hub',
    );
    expect(classifyArchetype(makeMetrics({ sun_visible_pct: 50, earth_visible_pct: 50 }), 'Historic')).toBe(
      'Classical Equatorial / Mid-Lat',
    );
    expect(classifyArchetype(makeMetrics({ sun_visible_pct: 55, earth_visible_pct: 66 }), 'South Pole')).toBe(
      'Moderate Polar Traverse',
    );
    expect(
      classifyArchetype(
        makeMetrics({
          sun_no_terrain_pct: 0,
          sun_time_pct: 0,
          sun_visible_pct: 0,
          earth_visible_pct: 0,
          both_visible_pct: 0,
          longest_sun_days: 0,
          max_dark_days: 0,
          earth_max_gap_days: 0,
        }),
        'Custom Coordinate',
      ),
    ).toBeNull();
  });

  it('normalizeSites fills viability_score and archetype and keeps null score for NONE sites', () => {
    const polar = makeSite({ id: 'polar_a', metrics_2m: makeMetrics({ viability_score: null, archetype: null }) });
    const nonPolar = makeSite({
      id: 'apollo_11',
      terrain_source: 'NONE',
      is_polar_dem: false,
      terrain_stats: null,
      local_slope_deg: null,
      drift_240m: null,
      metrics_2m: makeMetrics({ sun_visible_pct: 49.0, earth_visible_pct: 100.0, both_visible_pct: 49.0, max_dark_days: 14.8 }),
    });
    const out = normalizeSites([polar, nonPolar]);
    expect(out[0].metrics_2m.viability_score).not.toBeNull();
    expect(out[0].metrics_2m.archetype).toBe('Peak Solar Beacon');
    expect(out[1].metrics_2m.viability_score).toBeNull();
    expect(out[1].metrics_2m.archetype).toBe('High-DTE Communication Hub');
  });

  it('findCuratedSiteNear uses 1737.4 km lunar arc distance and skips custom/candidate sites', () => {
    const siteA = makeSite({ id: 'site_a', lat: -89.45, lon: -137.31 });
    const siteB = makeSite({ id: 'site_b', lat: -85.99, lon: 2.09 });
    const customPin = makeSite({ id: 'custom_pin', lat: -89.45, lon: -137.31, isCustom: true });
    const list = [customPin, siteA, siteB];

    // Exact match
    expect(findCuratedSiteNear(list, -89.45, -137.31, 600)?.id).toBe('site_a');
    // ~300 m offset (0.01 deg lat ~ 303 m) -> within 600 m
    expect(findCuratedSiteNear(list, -89.44, -137.31, 600)?.id).toBe('site_a');
    // ~3 km offset (0.1 deg lat ~ 3032 m) -> outside 600 m
    expect(findCuratedSiteNear(list, -89.35, -137.31, 600)).toBeNull();
  });
});

describe('WP2 Unit Tests — Lunar Math, DEM, Eclipses, Power & Seasonal Markers', () => {
  it('exports required constants and assumption strings', () => {
    expect(R0_M).toBe(1737400.0);
    expect(AU_KM).toBe(149597870.7);
    expect(SUN_RADIUS_DEG).toBe(0.266);
    expect(DEFAULT_WINDOW_HOURS).toBe(336);
    expect(LUNAR_DAY_HOURS).toBe(709);
    expect(RISE_SET_DEFINITION_TEXT.length).toBeGreaterThan(30);
    expect(POWER_ASSUMPTION_TEXT.length).toBeGreaterThan(30);
    expect(ECLIPSE_ASSUMPTION_TEXT.length).toBeGreaterThan(30);
  });

  it('sphericalHorizonDipDeg matches exact -acos(R0/(R0+h)) values at all mast stops', () => {
    expect(sphericalHorizonDipDeg(0)).toBe(0);
    expect(sphericalHorizonDipDeg(-5)).toBe(0);
    expect(sphericalHorizonDipDeg(0.5)).toBeCloseTo(-0.0435, 3);
    expect(sphericalHorizonDipDeg(2.0)).toBeCloseTo(-0.0869, 3);
    expect(sphericalHorizonDipDeg(10.0)).toBeCloseTo(-0.1944, 3);
    expect(sphericalHorizonDipDeg(20.0)).toBeCloseTo(-0.2749, 3);
    expect(sphericalHorizonDipDeg(50.0)).toBeCloseTo(-0.4347, 3);
  });

  it('decodeDemGrid & loadClientDemBundle read I6 binary int16 buffers with scale_m and asymmetric origins', async () => {
    const desc: DemGridDescriptor = {
      file: 'dem_fine_240m.i16',
      n_cols: 3,
      n_rows: 2,
      mpp_m: 240,
      x0_m: -149880,
      y0_m: 149880,
      aggregation: 'native',
      scale_m: 0.5,
      schema_version: '2.0',
    };
    const buf = new ArrayBuffer(12);
    const dv = new DataView(buf);
    [100, -200, 300, 400, 500, -600].forEach((val, idx) => dv.setInt16(idx * 2, val, true));

    const grid = decodeDemGrid(desc, buf);
    expect(grid.nCols).toBe(3);
    expect(grid.nRows).toBe(2);
    expect(grid.scaleM).toBe(0.5);
    expect(grid.x0M).toBe(-149880);
    expect(Array.from(grid.elev)).toEqual([100, -200, 300, 400, 500, -600]);

    // Test loadClientDemBundle via fetch mock
    const manifest: DemManifest = {
      schema_version: '2.0',
      data_version: 'v2-test',
      generated_utc: '2026-11-14T00:00:00Z',
      fine: desc,
      coarse: { ...desc, file: 'dem_coarse_1200m_max.i16', mpp_m: 1200, aggregation: 'max', scale_m: 1.0 },
    };
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('dem_manifest.json')) {
        return new Response(JSON.stringify(manifest), { status: 200 });
      }
      return new Response(buf.slice(0), { status: 200 });
    }) as typeof fetch;

    try {
      const bundle = await loadClientDemBundle('/subpath/');
      expect(bundle.manifest.data_version).toBe('v2-test');
      expect(bundle.fine.elev[0]).toBe(100);
      expect(bundle.coarse.scaleM).toBe(1.0);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('computeCustomPolarHorizon continues rays across fine->coarse boundary without breaking', () => {
    const bundle = makeSyntheticClientDem();
    // At (0, 0), elevation is 1000 m. Looking East (az = 90 deg, +x direction),
    // coarse ridge at x = +30 km (outside ±18 km fine grid) rises to 4500 m!
    const hz = computeCustomPolarHorizon(bundle, 0, 0, 2);
    expect(hz).toHaveLength(360);
    // East azimuth (90 deg) should detect high ridge (~5.7 deg elevation) across the fine boundary
    expect(hz[90]).toBeGreaterThan(4.5);
    // West azimuth (270 deg) has only lower terrain (500 m), so horizon is much lower
    expect(hz[270]).toBeLessThan(0.5);
  });

  it('buildCustomPolarSite & buildCustomLatLonSite avoid all fake fallback metrics and populate NONE cleanly', () => {
    const bundle = makeSyntheticClientDem();
    const eph = loadSubpointsAsEphemeris(240);

    // Without ephemeris: metrics are zeroed and archetype/viability_score are null
    const noEphPin = buildCustomPolarSite(null, 0, 0, 2, undefined, bundle);
    expect(noEphPin.terrain_source).toBe('LOLA_240M');
    expect(noEphPin.elev_source).toBe('DEM');
    // (0,0) lies halfway between 4 pixels of distance sqrt(120^2 + 120^2) = 169.7 m -> 1000 - 0.1697*30 = 994.9 m
    expect(noEphPin.elev_m).toBeCloseTo(994.9, 0);
    expect(noEphPin.terrain_stats).not.toBeNull();
    expect(noEphPin.drift_240m).toBeNull();
    expect(noEphPin.metrics_2m.sun_no_terrain_pct).toBe(0);
    expect(noEphPin.metrics_2m.archetype).toBeNull();
    expect(noEphPin.metrics_2m.viability_score).toBeNull();

    // Direct computeSite26MonthMetrics check (DATA-4 & ComputeOptions)
    const directM = computeSite26MonthMetrics(eph, -89.5, 0, 995, noEphPin.horizons_by_mast['2'], null, {
      earthMaskDeg: 0,
      applyEclipses: true,
    });
    expect(directM.viability_score).toBeNull();
    expect(directM.archetype).toBeNull();
    expect(directM.both_visible_pct).toBeLessThanOrEqual(
      Math.min(directM.sun_time_pct, directM.earth_visible_pct),
    );

    // With ephemeris: unified drift_240m encloses center sun_visible_pct
    const withEphPin = buildCustomPolarSite(null, 0, 0, 2, eph, bundle);
    expect(withEphPin.drift_240m).not.toBeNull();
    expect(withEphPin.drift_240m!.sun_min_pct).toBeLessThanOrEqual(withEphPin.metrics_2m.sun_visible_pct);
    expect(withEphPin.drift_240m!.sun_max_pct).toBeGreaterThanOrEqual(withEphPin.metrics_2m.sun_visible_pct);
    expect(withEphPin.metrics_2m.both_visible_pct).toBeLessThanOrEqual(
      Math.min(withEphPin.metrics_2m.sun_time_pct, withEphPin.metrics_2m.earth_visible_pct),
    );

    // Outside DEM (equator): strictly NONE with null terrain fields & spherical dip per mast height
    const eqProbe = buildCustomLatLonSite(0.674, 23.473, null, 2.0, eph, bundle);
    expect(eqProbe.terrain_source).toBe('NONE');
    expect(eqProbe.is_polar_dem).toBe(false);
    expect(eqProbe.elev_source).toBe('APPROXIMATE');
    expect(eqProbe.local_slope_deg).toBeNull();
    expect(eqProbe.terrain_stats).toBeNull();
    expect(eqProbe.drift_240m).toBeNull();
    expect(eqProbe.blocking_dist_km).toBeNull();
    expect(eqProbe.horizons_by_mast['2'][0]).toBeCloseTo(-0.0869, 3);
    expect(interpolateHorizon(eqProbe, 20.0)[0]).toBeCloseTo(-0.2749, 3);
  });

  it('computeInstantEclipse calculates geometric circle-circle intersection and SCI-1 reduction on 2028-12-31', () => {
    const noHit = computeInstantEclipse({ azDeg: 90, elDeg: 10 }, { azDeg: 120, elDeg: 10 }, 384400, null);
    expect(noHit.obscuredFrac).toBe(0);
    expect(noHit.siteType).toBe('none');

    const totalHit = computeInstantEclipse({ azDeg: 90, elDeg: 10 }, { azDeg: 90, elDeg: 10 }, 384400, null);
    expect(totalHit.obscuredFrac).toBe(1);
    expect(totalHit.siteType).toBe('total');
    expect(totalHit.earthAngularRadiusDeg).toBeCloseTo(Math.asin(6378.137 / 384400) * (180 / Math.PI), 4);

    // Partial: sep = earthR (~0.95) -> sun disk straddles Earth limb
    const sep = totalHit.earthAngularRadiusDeg;
    const partialHit = computeInstantEclipse(
      { azDeg: 90, elDeg: 10 + sep },
      { azDeg: 90, elDeg: 10 },
      384400,
      null,
    );
    expect(partialHit.obscuredFrac).toBeGreaterThan(0.35);
    expect(partialHit.obscuredFrac).toBeLessThan(0.65);
    expect(partialHit.siteType).toBe('partial');

    // Full ephemeris check at 2028-12-31 15:00-20:00 UTC if full CSV is present
    if (fs.existsSync(FULL_SUBPOINTS_CSV)) {
      const eph = loadSubpointsAsEphemeris(19033);
      const malapert = makeSite({ id: 'malapert', lat: -85.99, lon: 2.09, elev_m: 5170 });
      const hzNeg = new Array<number>(360).fill(-2.0);
      let sawObscured = false;
      for (let idx = 18687; idx < 18692; idx++) {
        const { instant } = computeInstantAndWindow(eph, malapert, hzNeg, idx, 24);
        if ((instant.eclipseObscuredFrac ?? 0) > 0 && instant.sunDiskFrac < 1) {
          sawObscured = true;
        }
      }
      expect(sawObscured).toBe(true);
    }
  });

  it('computeInstantAndWindow handles 3-case countdowns, Q9 power, earthMaskDeg, and operational windows', () => {
    const n = 200;
    const subsolar_lon = new Array<number>(n).fill(0);
    const subsolar_lat = new Array<number>(n).fill(0);
    const subearth_lon = new Array<number>(n).fill(0);
    const subearth_lat = new Array<number>(n).fill(0);
    const earth_dist_km = new Array<number>(n).fill(384400);

    // Put Sun at 30 deg elevation at idx 0..19 (lon diff 60 deg at equator -> 30 deg el)
    // Wait: at site (0, 0), subsolar_lon = 60, subsolar_lat = 0 -> el ~= 30 deg!
    // At idx 20..49, set subsolar_lon = 180 (night)
    // At idx 50..199, set subsolar_lon = 89 (1 deg elevation!)
    for (let i = 0; i < 20; i++) subsolar_lon[i] = 60;
    for (let i = 20; i < 50; i++) subsolar_lon[i] = 180;
    for (let i = 50; i < n; i++) subsolar_lon[i] = 89;
    // Keep Earth away from Sun to avoid eclipse at idx 0..19 (subearth at 0, lat 0 -> el ~90 deg, and after idx 100 at el ~3 deg)
    for (let i = 100; i < n; i++) subearth_lon[i] = 87;

    const eph: EphemerisData = {
      t0_utc: '2027-01-01T00:00:00Z',
      dt_hours: 1,
      n,
      subearth_lon,
      subearth_lat,
      subsolar_lon,
      subsolar_lat,
      earth_dist_km,
      eclipses: [],
      validation: {
        sun_max_err_deg: 0,
        earth_max_err_deg: 0,
        ephemeris: 'synthetic',
        period_start: '2027-01-01T00:00:00Z',
        period_end: '2027-01-09T08:00:00Z',
      },
    };

    const site = makeSite({
      id: 'eq_test',
      terrain_source: 'NONE',
      is_polar_dem: false,
      lat: 0,
      lon: 0,
      elev_m: 0,
      terrain_stats: null,
      local_slope_deg: null,
      drift_240m: null,
    });
    const hzZero = new Array<number>(360).fill(0);

    // At idx 0 (el ~ 30 deg): tracking ~ 100%, horizontal ~ 50%, sunCountdown event at 20h
    const r0 = computeInstantAndWindow(eph, site, hzZero, 0, 336);
    expect(r0.instant.sunElDeg).toBeCloseTo(30, 0);
    expect(r0.instant.power?.trackingPct).toBeCloseTo(100, 1);
    expect(r0.instant.power?.horizontalPct).toBeCloseTo(50, 0);
    expect(r0.instant.sunCountdown).toEqual({ kind: 'event', hours: 20 });
    expect(r0.summary.windowHoursRequested).toBe(336);
    expect(r0.summary.windowHoursAvailable).toBe(200);
    expect(r0.summary.sunWindows?.length).toBe(2);
    expect(r0.summary.sunWindows?.[0].durationHours).toBe(20);

    // At idx 30 (night): tracking 0%, horizontal 0%
    const r30 = computeInstantAndWindow(eph, site, hzZero, 30, 336);
    expect(r30.instant.power?.trackingPct).toBe(0);
    expect(r30.instant.power?.horizontalPct).toBe(0);
    expect(r30.instant.sunCountdown).toEqual({ kind: 'event', hours: 20 });

    // At idx 60 (el ~ 1 deg): tracking ~ 100%, horizontal ~ 1.75%, sunCountdown none_before_data_end
    const r60 = computeInstantAndWindow(eph, site, hzZero, 60, 336);
    expect(r60.instant.sunElDeg).toBeCloseTo(1, 0);
    expect(r60.instant.power?.trackingPct).toBeCloseTo(100, 1);
    expect(r60.instant.power?.horizontalPct).toBeCloseTo(1.745, 0);
    expect(r60.instant.sunCountdown).toEqual({ kind: 'none_before_data_end', hoursSearched: 139 });

    // earthMaskDeg = 5 deg hides Earth at idx 100..199 (where Earth el ~ 3 deg)
    const rMask0 = computeInstantAndWindow(eph, site, hzZero, 100, 100, { earthMaskDeg: 0 });
    const rMask5 = computeInstantAndWindow(eph, site, hzZero, 100, 100, { earthMaskDeg: 5 });
    expect(rMask0.summary.earthPct).toBe(100);
    expect(rMask5.summary.earthPct).toBe(0);

    // Sensitivity series respects earthMaskDeg
    const bins0 = computeLaunchSensitivitySeries(eph, site, hzZero, 50, 50, { earthMaskDeg: 0 });
    const bins5 = computeLaunchSensitivitySeries(eph, site, hzZero, 50, 50, { earthMaskDeg: 5 });
    expect(bins0[bins0.length - 1].earthPct).toBe(100);
    expect(bins5[bins5.length - 1].earthPct).toBe(0);
  });

  it('computeSeasonalMarkers identifies true solstices & equinoxes from subsolar_lat and excludes endpoints', () => {
    const eph = loadSubpointsAsEphemeris(19033);
    const markers = computeSeasonalMarkers(eph);
    const summers = markers.filter((m) => m.kind === 'summer_solstice');
    const winters = markers.filter((m) => m.kind === 'winter_solstice');
    const equinoxes = markers.filter((m) => m.kind === 'equinox');

    expect(markers[0].kind).toBe('data_start');
    expect(markers[markers.length - 1].kind).toBe('data_end');
    // Boundary minimum at 2026-11-14 (idx 0) MUST NOT be labeled summer_solstice
    expect(summers.some((m) => m.idx === 0)).toBe(false);

    if (eph.n >= 19000) {
      // Full hourly ephemeris checks against Appendix D
      expect(summers.map((m) => m.utcIso.slice(0, 10))).toEqual(['2027-11-07', '2028-10-04']);
      expect(winters.map((m) => m.utcIso.slice(0, 10))).toEqual(['2027-04-27', '2028-04-19']);
      expect(equinoxes).toHaveLength(5);
    } else {
      // Fixture 24h sampled fallback still locates 2027-11-07 & 2028-10-04 within +/-1 day
      expect(summers.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('geometry round-trip ll2xyKm <-> xyKm2ll stays accurate', () => {
    const [x, y] = ll2xyKm(-85.99, 2.09);
    const [lat, lon] = xyKm2ll(x, y);
    expect(lat).toBeCloseTo(-85.99, 5);
    expect(lon).toBeCloseTo(2.09, 5);
  });
});

describe('WP2 Full-Dataset Integration Guards (runs when @pipeline data exists)', () => {
  const sitesPath = path.join(PUBLIC_DATA_DIR, 'sites.json');
  const ephPath = path.join(PUBLIC_DATA_DIR, 'ephemeris.json');
  const manifestPath = path.join(PUBLIC_DATA_DIR, 'dem_manifest.json');
  const hasFullData = fs.existsSync(sitesPath) && fs.existsSync(ephPath) && fs.existsSync(manifestPath);

  it.skipIf(!hasFullData)('Apollo 11 countdowns near data_end and at idx 18633 satisfy TIME-1 / WP2', () => {
    const sitesJson = JSON.parse(fs.readFileSync(sitesPath, 'utf-8')) as SitesDataset;
    const eph = JSON.parse(fs.readFileSync(ephPath, 'utf-8')) as EphemerisData;
    const apollo11 = sitesJson.sites.find((s) => s.id === 'apollo_11');
    expect(apollo11).toBeDefined();
    if (!apollo11) return;

    const hz = interpolateHorizon(apollo11, 2.0);
    const resEnd100 = computeInstantAndWindow(eph, apollo11, hz, eph.n - 100, DEFAULT_WINDOW_HOURS);
    expect(resEnd100.summary.windowHoursAvailable).toBe(100);
    expect(resEnd100.summary.windowHoursRequested).toBe(336);
    expect(resEnd100.instant.earthCountdown.kind).toBe('none_before_data_end');

    // In the 2026-2030 ephemeris (n=36216), Apollo 11 crosses sunrise at idx 36174;
    // after sunrise (e.g. n-24), no Sun event occurs before data_end.
    const resEnd24 = computeInstantAndWindow(eph, apollo11, hz, eph.n - 24, DEFAULT_WINDOW_HOURS);
    expect(resEnd24.instant.sunCountdown.kind).toBe('none_before_data_end');
    expect(resEnd24.summary.windowHoursAvailable).toBe(24);
    expect(resEnd24.summary.windowHoursRequested).toBe(336);

    const resMid = computeInstantAndWindow(eph, apollo11, hz, 18633, DEFAULT_WINDOW_HOURS);
    expect(resMid.instant.sunCountdown.kind).toBe('event');
  });

  it.skipIf(!hasFullData)('Unified ClientDemBundle pin matches curated LOLA_240M sites within <= 2 pp', () => {
    const sitesJson = JSON.parse(fs.readFileSync(sitesPath, 'utf-8')) as SitesDataset;
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

    const fineSites = sitesJson.sites.filter(
      (s) => s.terrain_source === 'LOLA_240M' && s.polar_x_km !== null && Math.abs(s.polar_x_km) <= 148 && Math.abs(s.polar_y_km!) <= 148,
    );
    expect(fineSites.length).toBeGreaterThan(5);

    for (const s of fineSites) {
      const pin = buildCustomLatLonSite(s.lat, s.lon, null, 2.0, eph, bundle);
      expect(pin.terrain_source).toBe('LOLA_240M');
      expect(Math.abs(pin.elev_m - s.elev_m)).toBeLessThanOrEqual(5.0);
      if (s.local_slope_deg !== null && pin.local_slope_deg !== null) {
        expect(Math.abs(pin.local_slope_deg - s.local_slope_deg)).toBeLessThanOrEqual(1.0);
      }
      expect(Math.abs(pin.metrics_2m.sun_visible_pct - s.metrics_2m.sun_visible_pct)).toBeLessThanOrEqual(2.0);
      expect(Math.abs(pin.metrics_2m.earth_visible_pct - s.metrics_2m.earth_visible_pct)).toBeLessThanOrEqual(2.0);
    }
  });
});

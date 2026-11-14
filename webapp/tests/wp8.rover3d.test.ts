import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Lunar3DViewport } from '../src/components/Lunar3DViewport';
import {
  AU_KM,
  computeAzEl,
  decodeDemPatch,
  sphericalHorizonDipDeg,
} from '../src/lib/lunarMath';
import {
  bodyAzElToThreeDir,
  computeRoverLiveTelemetry,
  createInitialRoverState,
  getCachedRoverHorizon360,
  polarToThreeCoords,
  ROVER_BASE_MAX_SPEED_MPS,
  ROVER_BOUND_KM,
  ROVER_TRAIL_MAX_POINTS,
  sampleTerrainHeightAndNormal,
  stepRoverPhysics,
  type RoverState,
} from '../src/lib/roverPhysics';
import {
  applyMat3,
  BRIGHT_STARS,
  buildAstronomicalStarBuffers,
  buildConstellationLinePositions,
  bvToRgb,
  computeIcrsToMoonMeMatrix,
  computeIcrsToThreeSkyMatrixRowMajor,
  computeSunIcrsRaDec,
  DEEP_SKY_OBJECTS,
  ephemerisStepUtcIso,
  galacticLonLatToIcrsRaDec,
  raDecToUnitVec,
  utcIsoToJulianDate,
} from '../src/lib/celestialSky';
import type {
  ClientDemBundle,
  DecodedDemPatch,
  EphemerisData,
  PolarDemPatchRaw,
  SiteData,
} from '../src/types/lunar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');

function makeSyntheticDemPatch(
  gridSize: number,
  mpp: number,
  elevFn: (xKm: number, yKm: number) => number,
): DecodedDemPatch {
  const elev = new Int16Array(gridSize * gridSize);
  const slopeU8 = new Uint8Array(gridSize * gridSize);
  const mppKm = mpp / 1000.0;
  const half = gridSize * 0.5 - 0.5;
  let elevMinM = Infinity;
  let elevMaxM = -Infinity;

  for (let r = 0; r < gridSize; r++) {
    const yKm = -(r - half) * mppKm;
    for (let c = 0; c < gridSize; c++) {
      const xKm = (c - half) * mppKm;
      const z = Math.round(elevFn(xKm, yKm));
      elev[r * gridSize + c] = z;
      if (z < elevMinM) elevMinM = z;
      if (z > elevMaxM) elevMaxM = z;
      slopeU8[r * gridSize + c] = 20;
    }
  }

  return {
    gridSize,
    mpp,
    extentKm: (gridSize * mpp) / 2000.0,
    elevMinM,
    elevMaxM: Math.max(elevMinM + 1, elevMaxM),
    slopeScaleDeg: 0.2,
    elev,
    slopeU8,
  };
}

function makeSyntheticClientDem(
  fineElevFn: (xKm: number, yKm: number) => number,
  coarseElevFn: (xKm: number, yKm: number) => number,
): ClientDemBundle {
  const fineN = 125;
  const fineMpp = 240.0;
  const fineX0 = -((fineN - 1) * fineMpp) * 0.5;
  const fineY0 = ((fineN - 1) * fineMpp) * 0.5;
  const fineElev = new Int16Array(fineN * fineN);
  for (let r = 0; r < fineN; r++) {
    const yKm = (fineY0 - r * fineMpp) / 1000.0;
    for (let c = 0; c < fineN; c++) {
      const xKm = (fineX0 + c * fineMpp) / 1000.0;
      fineElev[r * fineN + c] = Math.round(fineElevFn(xKm, yKm));
    }
  }

  const coarseN = 81;
  const coarseMpp = 1200.0;
  const coarseX0 = -((coarseN - 1) * coarseMpp) * 0.5;
  const coarseY0 = ((coarseN - 1) * coarseMpp) * 0.5;
  const coarseElev = new Int16Array(coarseN * coarseN);
  for (let r = 0; r < coarseN; r++) {
    const yKm = (coarseY0 - r * coarseMpp) / 1000.0;
    for (let c = 0; c < coarseN; c++) {
      const xKm = (coarseX0 + c * coarseMpp) / 1000.0;
      coarseElev[r * coarseN + c] = Math.round(coarseElevFn(xKm, yKm));
    }
  }

  return {
    manifest: {
      schema_version: '2.0.0',
      data_version: 'test',
      generated_utc: '2026-11-14T00:00:00Z',
      fine: {
        file: 'fine.i16',
        n_cols: fineN,
        n_rows: fineN,
        mpp_m: fineMpp,
        x0_m: fineX0,
        y0_m: fineY0,
        aggregation: 'native',
        scale_m: 1,
        schema_version: '2.0.0',
      },
      coarse: {
        file: 'coarse.i16',
        n_cols: coarseN,
        n_rows: coarseN,
        mpp_m: coarseMpp,
        x0_m: coarseX0,
        y0_m: coarseY0,
        aggregation: 'max',
        scale_m: 1,
        schema_version: '2.0.0',
      },
    },
    fine: {
      nCols: fineN,
      nRows: fineN,
      mppM: fineMpp,
      x0M: fineX0,
      y0M: fineY0,
      scaleM: 1,
      elev: fineElev,
    },
    coarse: {
      nCols: coarseN,
      nRows: coarseN,
      mppM: coarseMpp,
      x0M: coarseX0,
      y0M: coarseY0,
      scaleM: 1,
      elev: coarseElev,
    },
  };
}

function makeSyntheticEphemeris(overrides?: Partial<EphemerisData>): EphemerisData {
  return {
    schema_version: '2.0',
    data_version: 'test',
    generated_utc: '2026-11-14T00:00:00Z',
    t0_utc: '2026-11-14T00:00:00Z',
    dt_hours: 1,
    n: 4,
    subsolar_lon: [0, 0, 45, 90],
    subsolar_lat: [-1.5, -1.5, -1.5, -1.5],
    subearth_lon: [0, 0, 0, 0],
    subearth_lat: [-5.5, -1.5, -5.5, -5.5],
    earth_dist_km: [384400, 384400, 384400, 384400],
    eclipses: [{ start_utc: '2026-11-14T01:00:00Z', idx: 1, hours: 1, type: 'total (Sun fully hidden)' }],
    validation: {
      sun_max_err_deg: 0.0002,
      earth_max_err_deg: 0.006,
      ephemeris: 'DE441',
      period_start: '2026-11-14T00:00:00Z',
      period_end: '2026-11-14T03:00:00Z',
    },
    ...overrides,
  };
}

function makeSyntheticSite(): SiteData {
  return {
    id: 'connecting_ridge',
    name: 'Connecting Ridge',
    short_name: 'Connecting Ridge',
    category: 'Artemis III Ridge',
    program: 'Artemis III',
    description: 'High-illumination South Pole ridge.',
    terrain_source: 'LOLA_240M',
    is_polar_dem: true,
    elev_source: 'DEM',
    lat: -89.4455,
    lon: -137.3137,
    polar_x_km: -11.38,
    polar_y_km: -12.34,
    elev_m: 1320,
    local_slope_deg: 2.1,
    terrain_stats: null,
    metrics_2m: {
      sun_no_terrain_pct: 50,
      sun_time_pct: 90,
      sun_visible_pct: 87,
      earth_visible_pct: 55,
      both_visible_pct: 52,
      longest_sun_days: 150,
      max_dark_days: 6,
      earth_max_gap_days: 14,
      viability_score: 68,
      archetype: 'Peak of Eternal Light',
    },
    drift_240m: null,
    horizons_by_mast: { '2': new Array<number>(360).fill(0) },
    blocking_dist_km: null,
  };
}

describe('WP8 Rover Physics & GPU 3D Lunar Viewport', () => {
  it('samples terrain height, unit normal, slope, and aspect with fine-to-coarse fallback', () => {
    // Ramp rising toward +X (East): 200 m rise per 1000 m => atan(0.2) = 11.3099 deg
    const patch = makeSyntheticDemPatch(81, 1200, (xKm) => xKm * 200.0);
    const patchSample = sampleTerrainHeightAndNormal(10.0, 5.0, null, patch);

    expect(patchSample.source).toBe('LOLA_1200M_COARSE');
    expect(patchSample.elevM).toBeCloseTo(2000.0, 0);
    expect(patchSample.slopeDeg).toBeCloseTo(Math.atan(0.2) * (180 / Math.PI), 1);
    expect(Math.hypot(patchSample.nx, patchSample.ny, patchSample.nz)).toBeCloseTo(1.0, 6);
    expect(patchSample.nx).toBeLessThan(0);
    expect(Math.abs(patchSample.ny)).toBeLessThan(1e-4);
    expect(patchSample.nz).toBeGreaterThan(0.95);
    expect(patchSample.aspectDeg).toBeCloseTo(270.0, 0);

    // Fine 240 m ClientDem overrides patch when inside fine bounds (±14.88 km in this synthetic bundle)
    const clientDem = makeSyntheticClientDem(
      (_xKm, yKm) => 500 + yKm * 100.0,
      (xKm) => 100 + xKm * 50.0,
    );
    const fineSample = sampleTerrainHeightAndNormal(2.0, 3.0, clientDem, patch);
    expect(fineSample.source).toBe('LOLA_240M');
    expect(fineSample.elevM).toBeCloseTo(800.0, 0);
    expect(fineSample.slopeDeg).toBeCloseTo(Math.atan(0.1) * (180 / Math.PI), 1);
    expect(fineSample.aspectDeg).toBeCloseTo(180.0, 0); // rises toward +y => faces 180 deg

    // Outside fine bounds but inside coarse bounds falls back to LOLA_1200M_COARSE
    const coarseSample = sampleTerrainHeightAndNormal(25.0, 0.0, clientDem, patch);
    expect(coarseSample.source).toBe('LOLA_1200M_COARSE');
    expect(coarseSample.elevM).toBeCloseTo(1350.0, 0);

    // Outside all DEM coverage returns NONE
    const noneSample = sampleTerrainHeightAndNormal(300.0, 300.0, clientDem, patch);
    expect(noneSample.source).toBe('NONE');
    expect(noneSample.nz).toBe(1);
    expect(noneSample.slopeDeg).toBe(0);
  });

  it('aligns initial rover slope pitch/roll and clamps bounds inside ±148 km', () => {
    const patch = makeSyntheticDemPatch(250, 1200, (xKm) => xKm * 200.0);

    const outOfBounds = createInitialRoverState(220.0, -190.0, null, patch, 90.0, 10);
    expect(outOfBounds.xKm).toBe(ROVER_BOUND_KM);
    expect(outOfBounds.yKm).toBe(-ROVER_BOUND_KM);

    // Heading 90 deg (East, uphill along +X) => positive pitch, ~0 roll
    const eastUphill = createInitialRoverState(0, 0, null, patch, 90.0, 1);
    expect(eastUphill.pitchDeg).toBeCloseTo(11.31, 1);
    expect(Math.abs(eastUphill.rollDeg)).toBeLessThan(0.1);

    // Heading 0 deg (North/Earthside +Y) on East-rising ramp => terrain higher on right (+X), negative roll
    const crossSlope = createInitialRoverState(0, 0, null, patch, 0.0, 1);
    expect(Math.abs(crossSlope.pitchDeg)).toBeLessThan(0.1);
    expect(crossSlope.rollDeg).toBeCloseTo(-11.31, 1);
  });

  it('steps rover kinematics across 1x/10x/50x gears, trail capping, and waypoint autopilot', () => {
    const flatPatch = makeSyntheticDemPatch(250, 1200, () => 120.0);

    // Compare 1x vs 50x warp speed
    let rover1x = createInitialRoverState(0, 0, null, flatPatch, 0, 1);
    let rover50x = createInitialRoverState(0, 0, null, flatPatch, 0, 50);
    for (let i = 0; i < 40; i++) {
      rover1x = stepRoverPhysics(rover1x, { forward: 1, turn: 0 }, 0.1, null, flatPatch);
      rover50x = stepRoverPhysics(rover50x, { forward: 1, turn: 0 }, 0.1, null, flatPatch);
    }
    expect(rover1x.speedMps).toBeGreaterThan(4.0);
    expect(rover1x.speedMps).toBeLessThanOrEqual(4.55);
    expect(rover50x.speedMps).toBeGreaterThan(200.0);
    expect(rover50x.speedMps).toBeLessThanOrEqual(226.0);
    expect(rover50x.yKm).toBeGreaterThan(rover1x.yKm);
    expect(rover50x.wheelPhaseRad).toBeGreaterThan(rover1x.wheelPhaseRad);
    expect(rover50x.trail.length).toBeGreaterThan(2);

    // Verify trail cap at 160 points & spacing >= 0.05 km
    let longDrive = createInitialRoverState(0, -140, null, flatPatch, 0, 50);
    for (let i = 0; i < 300; i++) {
      longDrive = stepRoverPhysics(longDrive, { forward: 1, turn: 0 }, 0.5, null, flatPatch);
    }
    expect(longDrive.trail.length).toBeLessThanOrEqual(ROVER_TRAIL_MAX_POINTS);
    expect(longDrive.yKm).toBeLessThanOrEqual(ROVER_BOUND_KM);

    // Brake stops rover
    const braked = stepRoverPhysics(rover50x, { forward: 0, turn: 0, brake: true }, 1.0, null, flatPatch);
    expect(braked.speedMps).toBe(0);

    // Waypoint autopilot steers and clears waypoint within 0.08 km
    let autoRover = createInitialRoverState(0, 0, null, flatPatch, 180, 50);
    autoRover = { ...autoRover, waypoint: { xKm: 1.5, yKm: 1.5 } };
    for (let i = 0; i < 120 && autoRover.waypoint !== null; i++) {
      autoRover = stepRoverPhysics(autoRover, { forward: 0, turn: 0 }, 0.25, null, flatPatch);
    }
    expect(autoRover.waypoint).toBeNull();
    expect(Math.hypot(autoRover.xKm - 1.5, autoRover.yKm - 1.5)).toBeLessThanOrEqual(0.12);
  });

  it('computes rover live telemetry, PSR occlusion, DTE mask, and eclipse dimming accurately', () => {
    const eph = makeSyntheticEphemeris();

    // Flat highland patch -> high visibility and DTE active
    const flatPatch = makeSyntheticDemPatch(250, 1200, () => 1000.0);
    const rover = createInitialRoverState(-10, -10, null, flatPatch, 0, 1);

    const t0 = computeRoverLiveTelemetry(rover, eph, 0, 2.0, null, flatPatch);
    const expectedSun = computeAzEl(
      rover.lat,
      rover.lon,
      rover.elevM,
      eph.subsolar_lon[0],
      eph.subsolar_lat[0],
      AU_KM,
    );
    expect(t0.sunAzDeg).toBeCloseTo(expectedSun.azDeg, 4);
    expect(t0.sunElDeg).toBeCloseTo(expectedSun.elDeg, 4);
    expect(t0.horizon360).toHaveLength(360);
    expect(t0.sunVisible).toBe(true);
    expect(t0.earthVisible).toBe(true);
    expect(t0.dteLinkActive).toBe(true);
    expect(t0.solarPowerTrackingPct).toBeGreaterThan(95);
    expect(t0.solarPowerHorizontalPct).toBeLessThan(t0.solarPowerTrackingPct);

    // High Earth elevation mask blocks marginal DTE link
    const masked = computeRoverLiveTelemetry(rover, eph, 0, 2.0, null, flatPatch, {
      earthMaskDeg: 10.0,
    });
    expect(masked.dteLinkActive).toBe(false);
    expect(masked.dteLinkMarginDeg).toBeLessThan(0);

    // Index 1 aligns Sun & Earth -> geometric total eclipse
    const tEclipse = computeRoverLiveTelemetry(rover, eph, 1, 2.0, null, flatPatch);
    expect(tEclipse.eclipseObscuredFrac).toBeGreaterThan(0.95);
    expect(tEclipse.solarPowerTrackingPct).toBeLessThan(5);

    const tNoEclipse = computeRoverLiveTelemetry(rover, eph, 1, 2.0, null, flatPatch, {
      applyEclipses: false,
    });
    expect(tNoEclipse.eclipseObscuredFrac).toBe(0);
    expect(tNoEclipse.solarPowerTrackingPct).toBeGreaterThan(95);

    // Deep crater PSR walls block Sun completely
    const craterPatch = makeSyntheticDemPatch(101, 1200, (xKm, yKm) => {
      const r = Math.hypot(xKm, yKm);
      return r < 4.0 ? -3500.0 : 2500.0;
    });
    const psrRover = createInitialRoverState(0, 0, null, craterPatch, 0, 1);
    const tPsr = computeRoverLiveTelemetry(psrRover, eph, 0, 2.0, null, craterPatch);
    expect(tPsr.sunVisible).toBe(false);
    expect(tPsr.sunDiskFrac).toBe(0);
    expect(tPsr.solarPowerTrackingPct).toBe(0);
    expect(tPsr.sunClearanceDeg).toBeLessThan(0);

    // Outside DEM falls back to spherical dip
    const offDemState = { ...rover, xKm: 300, yKm: 300 };
    const tOff = computeRoverLiveTelemetry(offDemState, eph, 0, 2.0, null, craterPatch);
    expect(tOff.terrainSource).toBe('NONE');
    expect(tOff.horizon360[0]).toBeCloseTo(sphericalHorizonDipDeg(2.0), 3);

    // Spatial horizon cache reuses horizon within 0.08 km and invalidates beyond 0.08 km
    const c1 = getCachedRoverHorizon360(null, 0, 0, 2.0, null, flatPatch);
    const c2 = getCachedRoverHorizon360(c1.nextCache, 0.03, 0.02, 2.0, null, flatPatch);
    expect(c2.horizon360).toBe(c1.horizon360);
    const c3 = getCachedRoverHorizon360(c2.nextCache, 0.5, 0.0, 2.0, null, flatPatch);
    expect(c3.horizon360).not.toBe(c1.horizon360);
  });

  it('aligns Three.js polar coordinates and Sun/Earth directional vectors consistently', () => {
    const [tx, ty, tz] = polarToThreeCoords(10, 25, 2000, 5);
    expect(tx).toBe(10);
    expect(ty).toBeCloseTo(10, 5);
    expect(tz).toBe(-25);

    // At lon=0, az=0 (North / 0 deg Earthside) points toward -Z in Three.js
    const [dx0, dy0, dz0] = bodyAzElToThreeDir(0, 0, 10, 1);
    expect(Math.abs(dx0)).toBeLessThan(1e-6);
    expect(dy0).toBeGreaterThan(0);
    expect(dz0).toBeLessThan(-0.9);
    expect(Math.hypot(dx0, dy0, dz0)).toBeCloseTo(1.0, 6);

    // At lon=0, az=90 (East / 90 deg E) points toward +X in Three.js
    const [dx90, , dz90] = bodyAzElToThreeDir(0, 90, 5, 1);
    expect(dx90).toBeGreaterThan(0.95);
    expect(Math.abs(dz90)).toBeLessThan(1e-6);
  });

  it('renders Lunar3DViewport cleanly in headless SSR without WebGL and passes WP5 hygiene rules', () => {
    const eph = makeSyntheticEphemeris();
    const site = makeSyntheticSite();
    const patch = makeSyntheticDemPatch(50, 1200, (xKm) => xKm * 40.0);
    const rover = createInitialRoverState(-11.38, -12.34, null, patch, 45, 10);
    const telem = computeRoverLiveTelemetry(rover, eph, 0, 2.0, null, patch);

    const html = renderToStaticMarkup(
      React.createElement(Lunar3DViewport, {
        ephemeris: eph,
        timeIdx: 0,
        mastHeightM: 2.0,
        sites: [site],
        selectedSite: site,
        demPatch: patch,
        clientDem: null,
        polarMaps: null,
        activeLayer: 'regolith',
        roverState: rover,
        onRoverStateChange: () => {},
        roverTelemetry: telem,
        cameraMode: 'mast',
        onDeployRoverToSite: () => {},
      }),
    );

    expect(html).toContain('Live 3D');
    expect(html).toContain('Chase');
    expect(html).toContain('Mast POV');
    expect(html).toContain('Orbit');
    expect(html).toContain('Free Cam');
    expect(html).toContain('Regolith');
    expect(html).toContain('Composite');
    expect(html).toContain('1×');
    expect(html).toContain('10×');
    expect(html).toContain('50×');
    expect(html).toContain('Link: Clear');
    expect(html).toContain('Deploy Here');

    // Enforce WP5 copy hygiene, font >= 12px, locale-safe formatting, and form id/name rules
    const wp8Files = [
      path.resolve(__dirname, '../src/lib/roverPhysics.ts'),
      path.resolve(__dirname, '../src/lib/celestialSky.ts'),
      path.resolve(__dirname, '../src/lib/celestialShaders.ts'),
      path.resolve(__dirname, '../src/components/Lunar3DViewport.tsx'),
    ];
    const forbiddenRegexes = [
      /\b0\s*W\b/i,
      /100%\s+solar\s+power/i,
      /\breal[- ]time\b/i,
      /\bLINK\s+ACTIVE\b/i,
      />41d\b/i,
      /\b40[x×]\b/i,
      /-90°?W\b/i,
      /Polar Summer Peak/i,
      /\bHLS\s+safe\b/i,
      /\bbest\s+landing\s+site\b/i,
      /\brecommended\s+landing\s+site\b/i,
      /\bsafe\s+landing\s+site\b/i,
    ];
    const smallFontRegex = /text-\[(?:[1-9]|10|11)px\]|fontSize\s*[=:]\s*\{?(?:[1-9]|10|11)\b/;

    for (const filePath of wp8Files) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      expect(raw).not.toMatch(/\.toLocaleString\(\s*\)/);
      const strippedComments = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '');
      for (const rx of forbiddenRegexes) {
        expect(strippedComments, `Forbidden pattern ${rx} matched in ${filePath}`).not.toMatch(rx);
      }
      expect(strippedComments, `Sub-12px typography matched in ${filePath}`).not.toMatch(
        smallFontRegex,
      );
    }
  });

  it('integrates smoothly with real polar_dem_patch.json and ephemeris.json when present on disk', () => {
    const patchPath = path.join(PUBLIC_DATA_DIR, 'polar_dem_patch.json');
    const ephPath = path.join(PUBLIC_DATA_DIR, 'ephemeris.json');
    if (!fs.existsSync(patchPath) || !fs.existsSync(ephPath)) return;

    const rawPatch = JSON.parse(fs.readFileSync(patchPath, 'utf-8')) as PolarDemPatchRaw;
    const demPatch = decodeDemPatch(rawPatch);
    const eph = JSON.parse(fs.readFileSync(ephPath, 'utf-8')) as EphemerisData;

    // Connecting Ridge (-11.38, -12.34)
    const ridgeRover = createInitialRoverState(-11.38, -12.34, null, demPatch, 0, 10);
    expect(ridgeRover.terrainSource).toBe('LOLA_1200M_COARSE');
    expect(ridgeRover.elevM).toBeGreaterThan(800);

    const ridgeTelem = computeRoverLiveTelemetry(ridgeRover, eph, 5200, 2.0, null, demPatch);
    expect(ridgeTelem.horizon360).toHaveLength(360);
    expect(ridgeTelem.sunAzDeg).toBeGreaterThanOrEqual(0);
    expect(ridgeTelem.sunAzDeg).toBeLessThan(360);
  });

  it('supports Flight/Hopper mode altitude climb/descend, fast gears (250x, 1000x), and improves horizon clearance at altitude', () => {
    const flatPatch = makeSyntheticDemPatch(121, 2500, () => 0);
    const craterPatch = makeSyntheticDemPatch(121, 2500, (xKm: number, yKm: number) => {
      // Surrounded by 2,400 m crater walls around central valley
      const rKm = Math.hypot(xKm, yKm);
      return rKm > 4 ? 2400 : 0;
    });
    const eph = makeSyntheticEphemeris();

    // 1. Verify high-speed recon gears 250x and 1000x
    let rover250 = createInitialRoverState(0, 0, null, flatPatch, 0, 250);
    for (let i = 0; i < 6; i++) {
      rover250 = stepRoverPhysics(rover250, { forward: 1, turn: 0 }, 0.5, null, flatPatch);
    }
    expect(rover250.speedMps).toBeGreaterThan(1050);
    expect(rover250.speedMps).toBeLessThanOrEqual(ROVER_BASE_MAX_SPEED_MPS * 250 + 1);

    let rover1000 = createInitialRoverState(0, 0, null, flatPatch, 0, 1000);
    for (let i = 0; i < 6; i++) {
      rover1000 = stepRoverPhysics(rover1000, { forward: 1, turn: 0 }, 0.5, null, flatPatch);
    }
    expect(rover1000.speedMps).toBeGreaterThan(4200);
    expect(rover1000.speedMps).toBeLessThanOrEqual(ROVER_BASE_MAX_SPEED_MPS * 1000 + 1);

    // 2. Verify Flight/Hopper vertical climb & telemetry horizon clearance
    let grounded = createInitialRoverState(0, 0, null, craterPatch, 0, 250);
    const groundTelem = computeRoverLiveTelemetry(grounded, eph, 0, 2.0, null, craterPatch);

    let flying: RoverState = {
      ...grounded,
      flightMode: true,
      altitudeM: 600,
    };
    for (let i = 0; i < 8; i++) {
      flying = stepRoverPhysics(flying, { forward: 1, turn: 0.5, vertical: 1 }, 0.5, null, craterPatch);
    }
    expect(flying.flightMode).toBe(true);
    expect((flying.altitudeM ?? 0)).toBeGreaterThan(1500);
    expect(flying.elevM).toBeGreaterThan(1500);

    const airborneTelem = computeRoverLiveTelemetry(flying, eph, 0, 2.0, null, craterPatch);
    expect(airborneTelem.sunHorizonElDeg).toBeLessThan(groundTelem.sunHorizonElDeg);
    expect(airborneTelem.sunClearanceDeg).toBeGreaterThan(groundTelem.sunClearanceDeg);

    // Descend cleanly
    const highAlt = flying.altitudeM ?? 0;
    const descended = stepRoverPhysics(flying, { forward: 0, turn: 0, vertical: -1 }, 1.0, null, craterPatch);
    expect((descended.altitudeM ?? 0)).toBeLessThan(highAlt);
    expect((descended.altitudeM ?? 0)).toBeGreaterThanOrEqual(20);
  });
});

describe('Celestial Sky IAU / J2000 Astrometry & Buffers', () => {
  it('aligns IAU Moon ME rotation + solar ephemeris within < 1.0 deg of JPL Horizons subsolar points', () => {
    const ephemPath = path.resolve(__dirname, '../public/data/ephemeris.json');
    const ephem = JSON.parse(fs.readFileSync(ephemPath, 'utf8')) as {
      t0_utc: string;
      dt_hours: number;
      subsolar_lat: number[];
      subsolar_lon: number[];
    };

    const indices = [0, 720, 2400, 4968, 8760];
    const rad = Math.PI / 180;

    for (const idx of indices) {
      const iso = ephemerisStepUtcIso(ephem.t0_utc, ephem.dt_hours, idx);
      const jd = utcIsoToJulianDate(iso);
      const sunRaDec = computeSunIcrsRaDec(jd);
      const sunIcrs = raDecToUnitVec(sunRaDec.raDeg, sunRaDec.decDeg);
      const me = applyMat3(computeIcrsToMoonMeMatrix(jd), sunIcrs);

      const jplLat = ephem.subsolar_lat[idx] * rad;
      const jplLon = ephem.subsolar_lon[idx] * rad;
      const sunJplMe: [number, number, number] = [
        Math.cos(jplLat) * Math.cos(jplLon),
        Math.cos(jplLat) * Math.sin(jplLon),
        Math.sin(jplLat),
      ];

      const dot = Math.max(-1, Math.min(1, me[0] * sunJplMe[0] + me[1] * sunJplMe[1] + me[2] * sunJplMe[2]));
      const sepDeg = (Math.acos(dot) * 180) / Math.PI;
      expect(sepDeg).toBeLessThan(1.0);
    }
  });

  it('maps Galactic Center (l=0, b=0) to Sgr A* (~RA 266.4 deg, Dec -29.0 deg)', () => {
    const gc = galacticLonLatToIcrsRaDec(0, 0);
    expect(Math.abs(gc.raDeg - 266.4)).toBeLessThan(0.5);
    expect(Math.abs(gc.decDeg - (-29.0))).toBeLessThan(0.5);
  });

  it('computes Planck blackbody B-V thermal polarity correctly', () => {
    const coolRed = bvToRgb(1.85);
    const hotBlue = bvToRgb(-0.2);
    expect(coolRed[0]).toBeGreaterThan(coolRed[2]);
    expect(hotBlue[2]).toBeGreaterThanOrEqual(hotBlue[0]);
  });

  it('builds finite star & constellation buffers and proper SO(3) Three sky matrix', () => {
    expect(BRIGHT_STARS.length).toBeGreaterThan(80);
    expect(DEEP_SKY_OBJECTS.length).toBeGreaterThanOrEqual(7);

    const starBuffers = buildAstronomicalStarBuffers(1320);
    expect(starBuffers.count).toBeGreaterThan(5000);
    for (let i = 0; i < starBuffers.positions.length; i++) {
      expect(Number.isFinite(starBuffers.positions[i])).toBe(true);
    }
    for (let i = 0; i < starBuffers.colors.length; i++) {
      expect(Number.isFinite(starBuffers.colors[i])).toBe(true);
    }
    for (let i = 0; i < starBuffers.sizes.length; i++) {
      expect(Number.isFinite(starBuffers.sizes[i])).toBe(true);
    }

    const linePositions = buildConstellationLinePositions(1310);
    expect(linePositions.length).toBeGreaterThan(0);
    for (let i = 0; i < linePositions.length; i++) {
      expect(Number.isFinite(linePositions[i])).toBe(true);
    }

    const jd = utcIsoToJulianDate('2027-06-09T00:00:00Z');
    const m = computeIcrsToThreeSkyMatrixRowMajor(jd);
    expect(m.length).toBe(9);
    // Determinant of row-major 3x3 proper SO(3) matrix must be +1
    const det =
      m[0] * (m[4] * m[8] - m[5] * m[7]) -
      m[1] * (m[3] * m[8] - m[5] * m[6]) +
      m[2] * (m[3] * m[7] - m[4] * m[6]);
    expect(Math.abs(det - 1.0)).toBeLessThan(1e-6);
  });
});

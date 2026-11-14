import {
  AU_KM,
  computeAzEl,
  computeCustomPolarHorizon,
  computeInstantEclipse,
  diskFractionAbove,
  horizonAtAz,
  isInsideDemGrid,
  R0_M,
  sampleDemGridBilinear,
  sphericalHorizonDipDeg,
  xyKm2ll,
} from './lunarMath';
import type {
  ClientDemBundle,
  ComputeOptions,
  DecodedDemGrid,
  DecodedDemPatch,
  EclipseEvent,
  EphemerisData,
  TerrainSource,
} from '../types/lunar';

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

export const ROVER_BOUND_KM = 148.0;
export const ROVER_BASE_MAX_SPEED_MPS = 4.5;
export const ROVER_WHEEL_RADIUS_M = 0.35;
export const ROVER_WAYPOINT_ARRIVAL_KM = 0.08;
export const ROVER_TRAIL_MIN_STEP_KM = 0.05;
export const ROVER_TRAIL_MAX_POINTS = 160;

export type RoverGearMultiplier = 1 | 10 | 50 | 250 | 1000;
export type TerrainCameraMode = 'chase' | 'mast' | 'orbit' | 'free';

export interface SurfaceSample {
  elevM: number;
  slopeDeg: number;
  aspectDeg: number;
  nx: number;
  ny: number;
  nz: number;
  source: TerrainSource;
}

export interface RoverWaypoint {
  xKm: number;
  yKm: number;
  label?: string;
}

export interface RoverTrailPoint {
  xKm: number;
  yKm: number;
  elevM: number;
}

export interface RoverState {
  xKm: number;
  yKm: number;
  lat: number;
  lon: number;
  elevM: number;
  headingDeg: number;
  speedMps: number;
  gearMultiplier: RoverGearMultiplier;
  pitchDeg: number;
  rollDeg: number;
  slopeDeg: number;
  nx: number;
  ny: number;
  nz: number;
  terrainSource: TerrainSource;
  wheelPhaseRad: number;
  distanceTraveledKm: number;
  headlightsOn: boolean;
  flightMode?: boolean;
  altitudeM?: number;
  waypoint: RoverWaypoint | null;
  trail: RoverTrailPoint[];
}

export interface RoverControls {
  forward: number;
  turn: number;
  vertical?: number;
  brake?: boolean;
  boost?: boolean;
}

export interface RoverTelemetryOptions extends ComputeOptions {
  cachedHorizon360?: number[] | null;
}

export interface RoverHorizonCacheEntry {
  xKm: number;
  yKm: number;
  mastHeightM: number;
  hasFineDem: boolean;
  hasPatch: boolean;
  horizon360: number[];
}

/**
 * Return cached 360-deg horizon if rover moved < 0.08 km at the same mast height and DEM level,
 * otherwise compute fresh ray-marched horizon and return updated cache entry.
 */
export function getCachedRoverHorizon360(
  cache: RoverHorizonCacheEntry | null,
  xKm: number,
  yKm: number,
  mastHeightM: number,
  clientDem: ClientDemBundle | null,
  demPatch: DecodedDemPatch | null,
): { horizon360: number[]; nextCache: RoverHorizonCacheEntry } {
  const hasFineDem = clientDem !== null;
  const hasPatch = demPatch !== null;
  const mastTol = mastHeightM > 20 ? 12.0 : 1e-4;
  if (
    cache &&
    cache.horizon360.length === 360 &&
    cache.hasFineDem === hasFineDem &&
    cache.hasPatch === hasPatch &&
    Math.abs(cache.mastHeightM - mastHeightM) < mastTol &&
    Math.hypot(xKm - cache.xKm, yKm - cache.yKm) < 0.08
  ) {
    return { horizon360: cache.horizon360, nextCache: cache };
  }

  const sample = sampleTerrainHeightAndNormal(xKm, yKm, clientDem, demPatch);
  const demSource = clientDem ?? demPatch;
  const horizon360 =
    demSource && sample.source !== 'NONE'
      ? computeCustomPolarHorizon(demSource, xKm, yKm, mastHeightM)
      : new Array<number>(360).fill(Number(sphericalHorizonDipDeg(Math.max(0.0, mastHeightM)).toFixed(4)));

  const nextCache: RoverHorizonCacheEntry = {
    xKm,
    yKm,
    mastHeightM,
    hasFineDem,
    hasPatch,
    horizon360,
  };
  return { horizon360, nextCache };
}

export interface RoverLiveTelemetry {
  lat: number;
  lon: number;
  elevM: number;
  slopeDeg: number;
  aspectDeg: number;
  terrainSource: TerrainSource;
  sunAzDeg: number;
  sunElDeg: number;
  sunHorizonElDeg: number;
  sunClearanceDeg: number;
  sunDiskFrac: number;
  sunVisible: boolean;
  earthAzDeg: number;
  earthElDeg: number;
  earthHorizonElDeg: number;
  earthClearanceDeg: number;
  earthVisible: boolean;
  earthDistKm: number;
  solarPowerTrackingPct: number;
  solarPowerHorizontalPct: number;
  eclipseObscuredFrac: number;
  dteLinkMarginDeg: number;
  dteLinkActive: boolean;
  horizon360: number[];
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function normalizeAngle360(deg: number): number {
  return ((deg % 360.0) + 360.0) % 360.0;
}

function normalizeSignedDeltaDeg(targetDeg: number, currentDeg: number): number {
  return ((targetDeg - currentDeg + 540.0) % 360.0) - 180.0;
}

export function clampRoverCoordKm(xKm: number, yKm: number): [number, number] {
  return [clamp(xKm, -ROVER_BOUND_KM, ROVER_BOUND_KM), clamp(yKm, -ROVER_BOUND_KM, ROVER_BOUND_KM)];
}

function sampleDemGridWithHalfPxMargin(grid: DecodedDemGrid, xM: number, yM: number): number {
  if (isInsideDemGrid(grid, xM, yM)) {
    return sampleDemGridBilinear(grid, xM, yM);
  }
  const halfPxM = grid.mppM * 0.5;
  const minXM = grid.x0M - halfPxM;
  const maxXM = grid.x0M + (grid.nCols - 0.5) * grid.mppM;
  const maxYM = grid.y0M + halfPxM;
  const minYM = grid.y0M - (grid.nRows - 0.5) * grid.mppM;
  if (xM < minXM || xM > maxXM || yM < minYM || yM > maxYM) {
    return NaN;
  }
  const clampedX = clamp(xM, grid.x0M, grid.x0M + (grid.nCols - 1.0001) * grid.mppM);
  const clampedY = clamp(yM, grid.y0M - (grid.nRows - 1.0001) * grid.mppM, grid.y0M);
  return sampleDemGridBilinear(grid, clampedX, clampedY);
}

function sampleDemPatchBilinear(patch: DecodedDemPatch, xKm: number, yKm: number): number {
  if (Math.abs(xKm) > patch.extentKm || Math.abs(yKm) > patch.extentKm) {
    return NaN;
  }
  const n = patch.gridSize;
  const mppKm = patch.mpp / 1000.0;
  const half = n * 0.5 - 0.5;
  const col = clamp(xKm / mppKm + half, 0.0, n - 1.0001);
  const row = clamp(-yKm / mppKm + half, 0.0, n - 1.0001);
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const dc = col - c0;
  const dr = row - r0;
  const idx = r0 * n + c0;
  return (
    patch.elev[idx] * (1.0 - dc) * (1.0 - dr) +
    patch.elev[idx + 1] * dc * (1.0 - dr) +
    patch.elev[idx + n] * (1.0 - dc) * dr +
    patch.elev[idx + n + 1] * dc * dr
  );
}

function buildSurfaceSampleFromGrad(
  elevM: number,
  dzdx: number,
  dzdy: number,
  source: TerrainSource,
): SurfaceSample {
  const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1.0);
  const nx = -dzdx / len;
  const ny = -dzdy / len;
  const nz = 1.0 / len;
  const slopeDeg = Math.atan(Math.hypot(dzdx, dzdy)) * RAD2DEG;
  const horizMag = Math.hypot(nx, ny);
  const aspectDeg = horizMag > 1e-7 ? normalizeAngle360(Math.atan2(nx, ny) * RAD2DEG) : 0.0;

  return {
    elevM,
    slopeDeg,
    aspectDeg,
    nx,
    ny,
    nz,
    source,
  };
}

/**
 * Bilinearly sample terrain height, surface normal, slope, and downhill aspect
 * at polar coordinates (xKm, yKm) using 240 m/px LOLA fine DEM when loaded,
 * falling back to 1.2 km/px coarse DEM or demPatch immediately on load.
 */
export function sampleTerrainHeightAndNormal(
  xKm: number,
  yKm: number,
  clientDem: ClientDemBundle | null,
  demPatch: DecodedDemPatch | null,
): SurfaceSample {
  if (!Number.isFinite(xKm) || !Number.isFinite(yKm)) {
    return { elevM: 0, slopeDeg: 0, aspectDeg: 0, nx: 0, ny: 0, nz: 1, source: 'NONE' };
  }

  if (clientDem) {
    const xM = xKm * 1000.0;
    const yM = yKm * 1000.0;
    const gridCandidates: Array<{ grid: DecodedDemGrid; source: TerrainSource }> = [
      { grid: clientDem.fine, source: 'LOLA_240M' },
      { grid: clientDem.coarse, source: 'LOLA_1200M_COARSE' },
    ];

    for (const { grid, source } of gridCandidates) {
      const hC = sampleDemGridWithHalfPxMargin(grid, xM, yM);
      if (!Number.isNaN(hC)) {
        const hStepM = grid.mppM;
        const hR = sampleDemGridWithHalfPxMargin(grid, xM + hStepM, yM);
        const hL = sampleDemGridWithHalfPxMargin(grid, xM - hStepM, yM);
        const hU = sampleDemGridWithHalfPxMargin(grid, xM, yM + hStepM);
        const hD = sampleDemGridWithHalfPxMargin(grid, xM, yM - hStepM);

        let dzdx = 0.0;
        if (!Number.isNaN(hR) && !Number.isNaN(hL)) {
          dzdx = (hR - hL) / (2.0 * hStepM);
        } else if (!Number.isNaN(hR)) {
          dzdx = (hR - hC) / hStepM;
        } else if (!Number.isNaN(hL)) {
          dzdx = (hC - hL) / hStepM;
        }

        let dzdy = 0.0;
        if (!Number.isNaN(hU) && !Number.isNaN(hD)) {
          dzdy = (hU - hD) / (2.0 * hStepM);
        } else if (!Number.isNaN(hU)) {
          dzdy = (hU - hC) / hStepM;
        } else if (!Number.isNaN(hD)) {
          dzdy = (hC - hD) / hStepM;
        }

        return buildSurfaceSampleFromGrad(hC, dzdx, dzdy, source);
      }
    }
  }

  if (demPatch) {
    const hC = sampleDemPatchBilinear(demPatch, xKm, yKm);
    if (!Number.isNaN(hC)) {
      const hStepKm = demPatch.mpp / 1000.0;
      const hStepM = demPatch.mpp;
      const hR = sampleDemPatchBilinear(demPatch, xKm + hStepKm, yKm);
      const hL = sampleDemPatchBilinear(demPatch, xKm - hStepKm, yKm);
      const hU = sampleDemPatchBilinear(demPatch, xKm, yKm + hStepKm);
      const hD = sampleDemPatchBilinear(demPatch, xKm, yKm - hStepKm);

      let dzdx = 0.0;
      if (!Number.isNaN(hR) && !Number.isNaN(hL)) {
        dzdx = (hR - hL) / (2.0 * hStepM);
      } else if (!Number.isNaN(hR)) {
        dzdx = (hR - hC) / hStepM;
      } else if (!Number.isNaN(hL)) {
        dzdx = (hC - hL) / hStepM;
      }

      let dzdy = 0.0;
      if (!Number.isNaN(hU) && !Number.isNaN(hD)) {
        dzdy = (hU - hD) / (2.0 * hStepM);
      } else if (!Number.isNaN(hU)) {
        dzdy = (hU - hC) / hStepM;
      } else if (!Number.isNaN(hD)) {
        dzdy = (hC - hD) / hStepM;
      }

      return buildSurfaceSampleFromGrad(hC, dzdx, dzdy, 'LOLA_1200M_COARSE');
    }
  }

  return { elevM: 0, slopeDeg: 0, aspectDeg: 0, nx: 0, ny: 0, nz: 1, source: 'NONE' };
}

/**
 * Project rover forward/right vectors onto the local terrain unit normal
 * to derive body pitch (positive nose-up) and roll (positive right-side-down) in degrees.
 */
export function computeRoverPitchRoll(
  headingDeg: number,
  nx: number,
  ny: number,
  nz: number,
): { pitchDeg: number; rollDeg: number } {
  const rad = headingDeg * DEG2RAD;
  const fx = Math.sin(rad);
  const fy = Math.cos(rad);
  const rx = Math.cos(rad);
  const ry = -Math.sin(rad);

  const safeNz = Math.max(1e-6, nz);
  const pitchDeg = Math.atan2(-(fx * nx + fy * ny), safeNz) * RAD2DEG;
  const rollDeg = Math.atan2(rx * nx + ry * ny, safeNz) * RAD2DEG;
  return { pitchDeg, rollDeg };
}

/**
 * Initialize a lunar rover at polar coordinates (xKm, yKm), clamped to the ±148 km
 * explore frame and aligned to the local LOLA terrain slope.
 */
export function createInitialRoverState(
  xKm: number,
  yKm: number,
  clientDem: ClientDemBundle | null,
  demPatch: DecodedDemPatch | null,
  headingDeg = 0,
  gearMultiplier: RoverGearMultiplier = 10,
): RoverState {
  const [cx, cy] = clampRoverCoordKm(
    Number.isFinite(xKm) ? xKm : 0,
    Number.isFinite(yKm) ? yKm : 0,
  );
  const normHeading = normalizeAngle360(headingDeg);
  const sample = sampleTerrainHeightAndNormal(cx, cy, clientDem, demPatch);
  const [rawLat, lon] = xyKm2ll(cx, cy);
  const lat = clamp(rawLat, -89.99999, 89.99999);
  const { pitchDeg, rollDeg } = computeRoverPitchRoll(normHeading, sample.nx, sample.ny, sample.nz);

  return {
    xKm: cx,
    yKm: cy,
    lat,
    lon,
    elevM: sample.elevM,
    headingDeg: normHeading,
    speedMps: 0,
    gearMultiplier,
    pitchDeg,
    rollDeg,
    slopeDeg: sample.slopeDeg,
    nx: sample.nx,
    ny: sample.ny,
    nz: sample.nz,
    terrainSource: sample.source,
    wheelPhaseRad: 0,
    distanceTraveledKm: 0,
    headlightsOn: false,
    flightMode: false,
    altitudeM: 0,
    waypoint: null,
    trail: [{ xKm: cx, yKm: cy, elevM: sample.elevM }],
  };
}

/**
 * Advance rover kinematics and terrain alignment over dtSec seconds.
 * Supports manual drive inputs, braking, boost, and automatic waypoint autopilot
 * (clearing waypoint automatically when within 0.08 km).
 */
export function stepRoverPhysics(
  state: RoverState,
  controls: RoverControls,
  dtSec: number,
  clientDem: ClientDemBundle | null,
  demPatch: DecodedDemPatch | null,
): RoverState {
  const totalDt = Number.isFinite(dtSec) ? clamp(dtSec, 0, 12.0) : 0;
  if (totalDt <= 0) {
    return state;
  }

  const subSteps = Math.max(1, Math.min(240, Math.ceil(totalDt / 0.05)));
  const dt = totalDt / subSteps;

  let xKm = state.xKm;
  let yKm = state.yKm;
  let headingDeg = state.headingDeg;
  let speedMps = state.speedMps;
  let wheelPhaseRad = state.wheelPhaseRad;
  let distanceTraveledKm = state.distanceTraveledKm;
  let waypoint = state.waypoint;
  let slopeDeg = state.slopeDeg;
  let pitchDeg = state.pitchDeg;
  let rollDeg = state.rollDeg;
  let nx = state.nx;
  let ny = state.ny;
  let nz = state.nz;
  let elevM = state.elevM;
  let terrainSource = state.terrainSource;
  let trail = state.trail;

  const isFlight = Boolean(state.flightMode);
  let altitudeM = isFlight ? Math.max(20.0, state.altitudeM ?? 600.0) : 0.0;

  const manualForwardRaw = clamp(controls.forward, -1.0, 1.0);
  const manualTurnRaw = clamp(controls.turn, -1.0, 1.0);
  const manualVerticalRaw = clamp(controls.vertical ?? 0, -1.0, 1.0);
  const manualBrake = Boolean(controls.brake);
  const hasManualInput =
    Math.abs(manualForwardRaw) > 0.02 || Math.abs(manualTurnRaw) > 0.02 || manualBrake;

  if (hasManualInput && waypoint !== null) {
    waypoint = null;
  }

  const boostScale = controls.boost ? 1.5 : 1.0;
  const maxSpeedMps = ROVER_BASE_MAX_SPEED_MPS * state.gearMultiplier * boostScale;
  const maxReverseMps = maxSpeedMps * 0.6;
  const accelRateMps2 = maxSpeedMps * 2.4;
  const brakeDecelMps2 = maxSpeedMps * 5.0;
  const coastDecelMps2 = maxSpeedMps * 1.8;
  const turnRateDegPerSec =
    state.gearMultiplier >= 250
      ? 115.0
      : state.gearMultiplier === 50
        ? 95.0
        : state.gearMultiplier === 10
          ? 85.0
          : 75.0;
  const maxClimbMps = Math.max(220.0, maxSpeedMps * 0.45);

  for (let step = 0; step < subSteps; step++) {
    let forwardCmd = manualForwardRaw;
    let turnCmd = manualTurnRaw;
    let braking = manualBrake;
    let autopilotSpeedCapMps = maxSpeedMps;

    if (!hasManualInput && waypoint !== null) {
      const dxKm = waypoint.xKm - xKm;
      const dyKm = waypoint.yKm - yKm;
      const distKm = Math.hypot(dxKm, dyKm);

      if (distKm <= ROVER_WAYPOINT_ARRIVAL_KM) {
        waypoint = null;
        forwardCmd = 0;
        turnCmd = 0;
        braking = true;
      } else {
        const targetHeadingDeg = normalizeAngle360(Math.atan2(dxKm, dyKm) * RAD2DEG);
        const deltaDeg = normalizeSignedDeltaDeg(targetHeadingDeg, headingDeg);
        turnCmd = clamp(deltaDeg / 28.0, -1.0, 1.0);

        const distM = distKm * 1000.0;
        autopilotSpeedCapMps = Math.max(8.0, Math.min(maxSpeedMps, distM * 2.2));
        const alignFactor = Math.abs(deltaDeg) > 95 ? 0.12 : Math.max(0.25, Math.cos(deltaDeg * DEG2RAD));
        forwardCmd = alignFactor;
      }
    }

    headingDeg = normalizeAngle360(headingDeg + turnCmd * turnRateDegPerSec * dt);

    const uphillFactor =
      !isFlight && forwardCmd > 0 && pitchDeg > 0
        ? clamp(1.0 - 0.35 * (pitchDeg / 35.0), 0.55, 1.0)
        : 1.0;

    if (isFlight) {
      altitudeM = clamp(altitudeM + manualVerticalRaw * maxClimbMps * dt, 20.0, 18000.0);
    }

    if (braking) {
      if (Math.abs(speedMps) <= brakeDecelMps2 * dt) {
        speedMps = 0;
      } else {
        speedMps -= Math.sign(speedMps) * brakeDecelMps2 * dt;
      }
    } else if (Math.abs(forwardCmd) > 0.01) {
      const limit = forwardCmd >= 0 ? Math.min(maxSpeedMps, autopilotSpeedCapMps) * uphillFactor : maxReverseMps;
      const targetSpeed = forwardCmd * limit;
      const dv = targetSpeed - speedMps;
      const maxDv = accelRateMps2 * dt;
      speedMps += clamp(dv, -maxDv, maxDv);
    } else {
      if (Math.abs(speedMps) <= coastDecelMps2 * dt) {
        speedMps = 0;
      } else {
        speedMps -= Math.sign(speedMps) * coastDecelMps2 * dt;
      }
    }

    const headRad = headingDeg * DEG2RAD;
    const stepKm = (speedMps * dt) / 1000.0;
    const rawNextX = xKm + Math.sin(headRad) * stepKm;
    const rawNextY = yKm + Math.cos(headRad) * stepKm;
    const [nextX, nextY] = clampRoverCoordKm(rawNextX, rawNextY);

    const actualDistKm = Math.hypot(nextX - xKm, nextY - yKm);
    distanceTraveledKm += actualDistKm;
    wheelPhaseRad = (wheelPhaseRad + (speedMps * dt) / ROVER_WHEEL_RADIUS_M) % (Math.PI * 2000.0);

    xKm = nextX;
    yKm = nextY;

    if (waypoint !== null && Math.hypot(waypoint.xKm - xKm, waypoint.yKm - yKm) <= ROVER_WAYPOINT_ARRIVAL_KM) {
      waypoint = null;
      speedMps = 0;
    }

    const stepSample = sampleTerrainHeightAndNormal(xKm, yKm, clientDem, demPatch);
    slopeDeg = stepSample.slopeDeg;
    nx = stepSample.nx;
    ny = stepSample.ny;
    nz = stepSample.nz;
    terrainSource = stepSample.source;
    if (isFlight) {
      elevM = stepSample.elevM + altitudeM;
      pitchDeg = clamp(manualVerticalRaw * 16.0 - forwardCmd * 5.0, -24.0, 24.0);
      rollDeg = clamp(turnCmd * 18.0, -22.0, 22.0);
    } else {
      elevM = stepSample.elevM;
      const pr = computeRoverPitchRoll(headingDeg, nx, ny, nz);
      pitchDeg = pr.pitchDeg;
      rollDeg = pr.rollDeg;
    }
  }

  const lastTrail = trail[trail.length - 1];
  if (!lastTrail || Math.hypot(xKm - lastTrail.xKm, yKm - lastTrail.yKm) >= ROVER_TRAIL_MIN_STEP_KM) {
    const nextTrail = [...trail, { xKm, yKm, elevM }];
    trail = nextTrail.length > ROVER_TRAIL_MAX_POINTS ? nextTrail.slice(-ROVER_TRAIL_MAX_POINTS) : nextTrail;
  }

  const [rawLat, lon] = xyKm2ll(xKm, yKm);
  const lat = clamp(rawLat, -89.99999, 89.99999);

  return {
    ...state,
    xKm,
    yKm,
    lat,
    lon,
    elevM,
    headingDeg,
    speedMps,
    pitchDeg,
    rollDeg,
    slopeDeg,
    nx,
    ny,
    nz,
    terrainSource,
    wheelPhaseRad,
    distanceTraveledKm,
    flightMode: isFlight,
    altitudeM,
    waypoint,
    trail,
  };
}

function findActiveEclipseAt(eph: EphemerisData, idx: number): EclipseEvent | null {
  for (const ec of eph.eclipses) {
    if (idx >= ec.idx && idx < ec.idx + ec.hours) {
      return ec;
    }
  }
  return null;
}

/**
 * Compute live Sun/Earth azimuth-elevation, 360-deg horizon clearances,
 * relative solar power percentages, geometric eclipse obscuration, and DTE link boolean
 * at the rover's current surface coordinates and mast height.
 */
export function computeRoverLiveTelemetry(
  state: RoverState,
  ephemeris: EphemerisData,
  timeIdx: number,
  mastHeightM: number,
  clientDem: ClientDemBundle | null,
  demPatch: DecodedDemPatch | null,
  options?: RoverTelemetryOptions,
): RoverLiveTelemetry {
  const safeIdx = clamp(Math.round(timeIdx), 0, Math.max(0, ephemeris.n - 1));
  const earthMaskDeg = options?.earthMaskDeg ?? 0.0;
  const applyEclipses = options?.applyEclipses !== false;

  const sample = sampleTerrainHeightAndNormal(state.xKm, state.yKm, clientDem, demPatch);
  const [rawLat, lon] = xyKm2ll(state.xKm, state.yKm);
  const lat = clamp(rawLat, -89.99999, 89.99999);
  const aglM = state.flightMode ? Math.max(0.0, state.altitudeM ?? 0.0) : 0.0;
  const groundElevM = sample.source !== 'NONE' ? sample.elevM : state.elevM - aglM;
  const elevM = groundElevM + aglM;
  const effectiveMastHeightM = mastHeightM + aglM;

  const sun = computeAzEl(
    lat,
    lon,
    elevM,
    ephemeris.subsolar_lon[safeIdx],
    ephemeris.subsolar_lat[safeIdx],
    AU_KM,
  );
  const earthDistKm = ephemeris.earth_dist_km[safeIdx];
  const earth = computeAzEl(
    lat,
    lon,
    elevM,
    ephemeris.subearth_lon[safeIdx],
    ephemeris.subearth_lat[safeIdx],
    earthDistKm,
  );

  let horizon360: number[];
  if (options?.cachedHorizon360 && options.cachedHorizon360.length === 360) {
    horizon360 = options.cachedHorizon360;
  } else {
    const demSource = clientDem ?? demPatch;
    if (demSource && sample.source !== 'NONE') {
      horizon360 = computeCustomPolarHorizon(demSource, state.xKm, state.yKm, effectiveMastHeightM);
    } else {
      const dip = Number(sphericalHorizonDipDeg(Math.max(0.0, effectiveMastHeightM)).toFixed(4));
      horizon360 = new Array<number>(360).fill(dip);
    }
  }

  const sunHorizonElDeg = horizonAtAz(sun.azDeg, horizon360);
  const earthHorizonElDeg = horizonAtAz(earth.azDeg, horizon360);

  const activeEvent = findActiveEclipseAt(ephemeris, safeIdx);
  const eclipseData = computeInstantEclipse(sun, earth, earthDistKm, activeEvent);
  const eclipseObscuredFrac = applyEclipses ? eclipseData.obscuredFrac : 0.0;

  const terrainSunFrac = diskFractionAbove(sun.elDeg, sunHorizonElDeg);
  const sunDiskFrac = terrainSunFrac * (1.0 - eclipseObscuredFrac);
  const sunVisible = sunDiskFrac > 0.0;
  const earthVisible = earth.elDeg > earthHorizonElDeg;

  const sunClearanceDeg = sun.elDeg - sunHorizonElDeg;
  const earthClearanceDeg = earth.elDeg - earthHorizonElDeg;
  const dteLinkMarginDeg = earth.elDeg - (earthHorizonElDeg + earthMaskDeg);
  const dteLinkActive = dteLinkMarginDeg > 0.0;

  const solarPowerTrackingPct = sunDiskFrac * 100.0;
  const sinSunEl = Math.max(0.0, Math.sin(sun.elDeg * DEG2RAD));
  const solarPowerHorizontalPct = sunDiskFrac * sinSunEl * 100.0;

  return {
    lat,
    lon,
    elevM,
    slopeDeg: sample.slopeDeg,
    aspectDeg: sample.aspectDeg,
    terrainSource: sample.source,
    sunAzDeg: sun.azDeg,
    sunElDeg: sun.elDeg,
    sunHorizonElDeg,
    sunClearanceDeg,
    sunDiskFrac,
    sunVisible,
    earthAzDeg: earth.azDeg,
    earthElDeg: earth.elDeg,
    earthHorizonElDeg,
    earthClearanceDeg,
    earthVisible,
    earthDistKm,
    solarPowerTrackingPct,
    solarPowerHorizontalPct,
    eclipseObscuredFrac,
    dteLinkMarginDeg,
    dteLinkActive,
    horizon360,
  };
}

/**
 * Convert polar map (xKm, yKm, elevM) into Three.js world coordinates
 * (+X = 90°E, +Y = Up with verticalExaggeration, -Z = 0° Earthside).
 */
export function polarToThreeCoords(
  xKm: number,
  yKm: number,
  elevM: number,
  verticalExaggeration = 1.0,
): [number, number, number] {
  return [xKm, (elevM / 1000.0) * verticalExaggeration, -yKm];
}

/**
 * Convert a topocentric azimuth/elevation vector at siteLonDeg into a unit Three.js direction vector
 * with optional vertical exaggeration matching the 3D terrain mesh scale.
 */
export function bodyAzElToThreeDir(
  siteLonDeg: number,
  azDeg: number,
  elDeg: number,
  verticalExaggeration = 1.0,
): [number, number, number] {
  const mapAzRad = (siteLonDeg + azDeg) * DEG2RAD;
  const elRad = elDeg * DEG2RAD;
  const horiz = Math.cos(elRad);
  const vert = Math.sin(elRad) * Math.max(1.0, verticalExaggeration);
  const denom = Math.max(1e-6, Math.hypot(horiz, vert));
  return [
    (horiz * Math.sin(mapAzRad)) / denom,
    vert / denom,
    -(horiz * Math.cos(mapAzRad)) / denom,
  ];
}

/**
 * Compute lunar mean radius constant export for downstream consumers.
 */
export const LUNAR_RADIUS_KM = R0_M / 1000.0;

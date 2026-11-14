import type { SiteData, TerrainSource, WindowPoint } from '../../types/lunar';

export const DEFAULT_SUN_RADIUS_DEG = 0.266;
export const DEFAULT_EARTH_RADIUS_KM = 6378.137;

export interface SkyElevationBounds {
  minEl: number;
  maxEl: number;
  yTicks: number[];
  minorTicks: number[];
}

export interface SkyDiskRadiiPx {
  sunAngularRadiusDeg: number;
  earthAngularRadiusDeg: number;
  sunRadiusPx: number;
  earthRadiusPx: number;
  sunReticlePx: number;
  earthReticlePx: number;
}

export interface HorizonHoverInfo {
  az: number;
  horizonElDeg: number;
  distKm: number | null;
  text: string;
}

export function compassDirectionLabel(azDeg: number): string {
  const norm = ((azDeg % 360) + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(norm / 45) % 8];
}

export function computeSkyElevationBounds(
  horizon360: number[],
  points: WindowPoint[],
  polarZoom: boolean,
): SkyElevationBounds {
  if (polarZoom) {
    return {
      minEl: -5,
      maxEl: 5,
      yTicks: [-4, -2, 0, 2, 4],
      minorTicks: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
    };
  }

  let lo = -12;
  let hi = 24;
  for (const p of points) {
    if (p.sunEl < lo) lo = p.sunEl - 4;
    if (p.earthEl < lo) lo = p.earthEl - 4;
    if (p.sunEl > hi) hi = p.sunEl + 6;
    if (p.earthEl > hi) hi = p.earthEl + 6;
  }
  for (const h of horizon360) {
    if (h > hi) hi = h + 5;
    if (h < lo) lo = h - 4;
  }

  const minEl = Math.max(-75, Math.floor(lo / 5) * 5);
  const maxEl = Math.min(90, Math.ceil(hi / 5) * 5);
  const step = maxEl - minEl > 50 ? 15 : 5;
  const yTicks: number[] = [];
  for (let v = Math.ceil(minEl / step) * step; v <= maxEl; v += step) {
    yTicks.push(v);
  }
  return {
    minEl,
    maxEl,
    yTicks,
    minorTicks: yTicks,
  };
}

export function computeEarthAngularRadiusDeg(
  earthDistKm: number,
  eclipseEarthRadiusDeg?: number,
): number {
  if (
    eclipseEarthRadiusDeg !== undefined &&
    Number.isFinite(eclipseEarthRadiusDeg) &&
    eclipseEarthRadiusDeg > 0
  ) {
    return eclipseEarthRadiusDeg;
  }
  if (!Number.isFinite(earthDistKm) || earthDistKm <= DEFAULT_EARTH_RADIUS_KM) {
    return 0.95;
  }
  return (Math.asin(DEFAULT_EARTH_RADIUS_KM / earthDistKm) * 180) / Math.PI;
}

export function computeBodyPixelRadii(
  plotH: number,
  minEl: number,
  maxEl: number,
  earthDistKm: number,
  eclipseEarthRadiusDeg?: number,
  sunRadiusDeg = DEFAULT_SUN_RADIUS_DEG,
): SkyDiskRadiiPx {
  const pxPerDegY = plotH / Math.max(1, maxEl - minEl);
  const earthAngularRadiusDeg = computeEarthAngularRadiusDeg(earthDistKm, eclipseEarthRadiusDeg);
  const sunTruePx = sunRadiusDeg * pxPerDegY;
  const earthTruePx = earthAngularRadiusDeg * pxPerDegY;
  const sunRadiusPx = Math.max(1.2, sunTruePx);
  const earthRadiusPx = Math.max(2.0, earthTruePx);

  return {
    sunAngularRadiusDeg: sunRadiusDeg,
    earthAngularRadiusDeg,
    sunRadiusPx,
    earthRadiusPx,
    sunReticlePx: Math.max(sunRadiusPx + 5, 11),
    earthReticlePx: Math.max(earthRadiusPx + 4.5, 12),
  };
}

export function describeHorizonSubtitle(
  site: SiteData,
  mastHeightM: number,
  dipDeg: number,
  windowHoursAvailable: number,
): string {
  const days = windowHoursAvailable / 24;
  const windowDesc =
    windowHoursAvailable === 336
      ? '14-day (336h) tracks'
      : `${Number.isInteger(days) ? days : days.toFixed(1)}-day (${windowHoursAvailable}h) tracks`;

  if (site.terrain_source === 'NONE') {
    return `Spherical smooth horizon (dip ${dipDeg.toFixed(3)}° = -acos(R/(R+${mastHeightM.toFixed(1)}m))) · ${windowDesc}`;
  }
  if (site.terrain_source === 'LOLA_1200M_COARSE') {
    return `Coarse LOLA 1,200 m/px terrain horizon (client DEM) · ${windowDesc}`;
  }
  return `LOLA 240 m/px terrain horizon · ${windowDesc}`;
}

export function formatHorizonHoverInfo(
  az: number,
  horizon360: number[],
  blockingDistKm: number[] | null,
  terrainSource: TerrainSource,
): HorizonHoverInfo {
  const normAz = ((Math.round(az) % 360) + 360) % 360;
  const horizonElDeg = horizon360[normAz] ?? 0;
  const rawDist = blockingDistKm && blockingDistKm.length > normAz ? blockingDistKm[normAz] : null;
  const hasRidgeDist = terrainSource !== 'NONE' && rawDist !== null && Number.isFinite(rawDist);

  if (!hasRidgeDist) {
    return {
      az: normAz,
      horizonElDeg,
      distKm: null,
      text: `Az ${normAz}° (${compassDirectionLabel(normAz)}) · Spherical Horizon ${horizonElDeg.toFixed(2)}° (no local DEM)`,
    };
  }

  return {
    az: normAz,
    horizonElDeg,
    distKm: rawDist,
    text: `Az ${normAz}° (${compassDirectionLabel(normAz)}) · Horizon ${horizonElDeg.toFixed(2)}° · Ridge @ ${rawDist.toFixed(1)} km`,
  };
}

import type { SiteData, SiteMetrics2m, TerrainStats } from '../types/lunar';

const R0_M = 1737400.0;
const DEG2RAD = Math.PI / 180.0;

/**
 * Team-defined viability weights (Q2 / I2).
 * Single source of truth used across curated sites, custom pins, and WP7 candidates.
 */
export const SCORE_WEIGHTS: {
  sun: number;
  earth: number;
  joint: number;
  dark: number;
  slope: number;
} = {
  sun: 0.35,
  earth: 0.25,
  joint: 0.15,
  dark: 0.15,
  slope: 0.10,
};

/**
 * Human-readable English description of the scoring index for UI and Export Briefs.
 */
export const SCORE_FORMULA_TEXT =
  'Team-defined composite index (not a NASA standard): 0.35 × Mean Solar Disk % + 0.25 × Earth DTE % + 0.15 × Joint Sun+Earth % + 0.15 × Dark Resilience (100 × (1 − min(max_dark_days, 30) / 30)) + 0.10 × 240 m Baseline Slope ≤5° (%). Returns n/a when terrain data is unavailable.';

/**
 * Compute the 0–100 composite viability index using Q2 weights.
 * Returns null whenever terrainStats is null (e.g., outside LOLA DEM coverage).
 */
export function computeViability(m: SiteMetrics2m, t: TerrainStats | null): number | null {
  if (t === null || !m) return null;
  if (
    !Number.isFinite(m.sun_visible_pct) ||
    !Number.isFinite(m.earth_visible_pct) ||
    !Number.isFinite(m.both_visible_pct) ||
    !Number.isFinite(m.max_dark_days) ||
    !Number.isFinite(t.pct_safe_hls_le_5deg)
  ) {
    return null;
  }

  const clampedDarkDays = Math.min(Math.max(0.0, m.max_dark_days), 30.0);
  const darkScore = Math.max(0.0, 100.0 * (1.0 - clampedDarkDays / 30.0));
  const score =
    SCORE_WEIGHTS.sun * m.sun_visible_pct +
    SCORE_WEIGHTS.earth * m.earth_visible_pct +
    SCORE_WEIGHTS.joint * m.both_visible_pct +
    SCORE_WEIGHTS.dark * darkScore +
    SCORE_WEIGHTS.slope * t.pct_safe_hls_le_5deg;

  return Number(score.toFixed(1));
}

/**
 * Classify a site into an operational archetype using the canonical pipeline rules.
 * Returns null if illumination/visibility metrics are absent or uncomputed.
 */
export function classifyArchetype(m: SiteMetrics2m, category: string): string | null {
  if (
    !m ||
    !Number.isFinite(m.sun_visible_pct) ||
    !Number.isFinite(m.earth_visible_pct)
  ) {
    return null;
  }

  // Guard uncomputed placeholder metrics (e.g. pin created without ephemeris)
  if (
    m.sun_no_terrain_pct === 0 &&
    m.sun_time_pct === 0 &&
    m.sun_visible_pct === 0 &&
    m.earth_visible_pct === 0 &&
    m.longest_sun_days === 0 &&
    m.max_dark_days === 0 &&
    m.earth_max_gap_days === 0
  ) {
    return null;
  }

  const sunPct = m.sun_visible_pct;
  const earthPct = m.earth_visible_pct;

  if (sunPct < 2.0 && earthPct < 2.0) {
    return 'Permanent Shadow (PSR)';
  }
  if (earthPct < 5.0) {
    return 'Far-Side Relay Required';
  }
  if (sunPct >= 75.0 && earthPct >= 65.0) {
    return 'Balanced Power + DTE Summit';
  }
  if (sunPct >= 70.0) {
    return 'Peak Solar Beacon';
  }
  if (earthPct >= 80.0) {
    return 'High-DTE Communication Hub';
  }
  if (category.includes('Historic')) {
    return 'Classical Equatorial / Mid-Lat';
  }
  return 'Moderate Polar Traverse';
}

/**
 * Populate client-computed viability_score and archetype across all sites
 * using the single canonical scoring and classification functions.
 */
export function normalizeSites(list: SiteData[]): SiteData[] {
  return list.map((site) => ({
    ...site,
    metrics_2m: {
      ...site.metrics_2m,
      viability_score: computeViability(site.metrics_2m, site.terrain_stats),
      archetype: classifyArchetype(site.metrics_2m, site.category),
    },
  }));
}

/**
 * Find the closest curated site within maxMeters (default 600 m) using great-circle
 * arc distance on a sphere of lunar radius 1,737.4 km.
 */
export function findCuratedSiteNear(
  sites: SiteData[],
  latDeg: number,
  lonDeg: number,
  maxMeters = 600,
): SiteData | null {
  if (!Number.isFinite(latDeg) || !Number.isFinite(lonDeg) || !Number.isFinite(maxMeters) || maxMeters < 0) {
    return null;
  }

  const lat1 = latDeg * DEG2RAD;
  const lon1 = lonDeg * DEG2RAD;
  const cosLat1 = Math.cos(lat1);

  let bestSite: SiteData | null = null;
  let bestDistM = Infinity;

  for (const site of sites) {
    if (site.isCustom || site.isCandidate) continue;
    if (!Number.isFinite(site.lat) || !Number.isFinite(site.lon)) continue;

    const lat2 = site.lat * DEG2RAD;
    const lon2 = site.lon * DEG2RAD;
    const dLat = lat2 - lat1;
    const dLon = lon2 - lon1;

    const sinHalfLat = Math.sin(dLat * 0.5);
    const sinHalfLon = Math.sin(dLon * 0.5);
    const a = sinHalfLat * sinHalfLat + cosLat1 * Math.cos(lat2) * sinHalfLon * sinHalfLon;
    const distM = 2.0 * R0_M * Math.asin(Math.min(1.0, Math.sqrt(Math.max(0.0, a))));

    if (distM <= maxMeters && distM < bestDistM) {
      bestDistM = distM;
      bestSite = site;
    }
  }

  return bestSite;
}

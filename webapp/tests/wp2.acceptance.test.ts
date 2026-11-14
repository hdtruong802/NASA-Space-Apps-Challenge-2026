import { describe, it } from 'vitest';

describe('WP2 Acceptance — Unified Calculation Core', () => {
  // Reference sites strictly by id, never by array length
  it.todo('computeViability and classifyArchetype are the single scoring/classification implementation and return null viability_score for sites with null terrain_stats (e.g. apollo_11)');
  it.todo('computeViability reproduces baseline scores within 0.1 for polar sites (e.g. connecting_ridge, peak_near_shackleton, malapert_summit, shackleton_rim, leibnitz_beta)');
  it.todo('custom polar pin placed at the exact lat/lon of each polar curated site (e.g. connecting_ridge, shackleton_rim, malapert_summit, south_pole_90s) agrees within +/-2 pp sun/earth, +/-5 m elev, +/-1 deg slope');
  it.todo('during total lunar/solar eclipse 2028-12-31 15:00-20:00 UTC, a sunlit site (e.g. connecting_ridge or malapert_summit) has sunDiskFrac < 1 and eclipseObscuredFrac > 0');
  it.todo('end-of-range countdowns for apollo_11 at n-100 return kind === "none_before_data_end" with windowHoursAvailable === 100 < windowHoursRequested === 336');
  it.todo('custom probe outside LOLA DEM at 2 m mast produces spherical horizon dip -0.087 deg +/- 0.001 deg with null terrain fields');
  it.todo('Q9 relative power returns 100% tracking / 50% horizontal at 30 deg sun elevation, 100% / ~1.7% at 1 deg elevation, and 0% / 0% when occluded');
});

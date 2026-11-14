import { describe, it } from 'vitest';

describe('WP1 Acceptance — Data Pipeline & Data Contract v2', () => {
  // Reference sites strictly by id (Q7 expands site count over time)
  it.todo('sites with terrain_source === "NONE" (e.g. apollo_11, apollo_15, slim_jaxa, change_4, chandrayaan_3) have null terrain_stats, local_slope_deg, blocking_dist_km, drift_240m and elev_source === "APPROXIMATE"');
  it.todo('for every site by id, metrics_2m.both_visible_pct <= Math.min(metrics_2m.sun_time_pct, metrics_2m.earth_visible_pct)');
  it.todo('sites with terrain_source === "NONE" (e.g. apollo_11) have spherical horizon dip -acos(R0 / (R0 + h_mast)) across all mast heights (-0.0869 deg +/- 0.001 at 2 m)');
  it.todo('polar sites (e.g. connecting_ridge, malapert_summit, south_pole_90s) preserve baseline metrics and include nobile_rim_1 relocated to 2024 N1 centroid');
  it.todo('every site includes provenance with valid source_url (or null if unverified) and mission_status, and description contains no hardcoded quantitative numbers');
  it.todo('polar_maps.json, dem_manifest.json, and site_candidates.json include schema_version, data_version, generated_utc and consistent grid origin x0_m / y0_m');
});

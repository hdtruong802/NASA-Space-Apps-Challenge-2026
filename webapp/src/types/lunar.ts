export type {
  CandidateCriterion,
  CandidateQuery,
  CandidateRankResult,
  CandidateRegion,
  ClientDemBundle,
  ComputeOptions,
  Countdown,
  DecodedDemGrid,
  DecodedDemPatch,
  EclipseData,
  InstantMetrics,
  OperationalWindow,
  OperationalWindowKind,
  SeasonalMarker,
  SeasonalMarkerKind,
  SiteCandidate,
  SolarPowerInstant,
  WindowPoint,
  WindowSummary,
} from '../lib/runtimeTypes';

/** Origin and resolution of local terrain data used for horizon ray-marching (I1). */
export type TerrainSource = 'LOLA_240M' | 'LOLA_1200M_COARSE' | 'NONE';

/** Provenance of the site surface elevation value (I1 / DATA-3). */
export type ElevSource = 'DEM' | 'APPROXIMATE';

/** Operational status of a curated site or reference point (I1 / Q7). */
export type MissionStatus = 'landed' | 'attempted' | 'planned' | 'candidate_region' | 'reference';

/** Refinement mode used when snapping a curated polar site to the 240 m LOLA grid. */
export type RefineMode = 'exact' | 'high' | 'high_safe' | 'low';

/** Coordinate provenance & refinement metadata for curated sites (I1 / SITE-1). */
export interface SiteProvenance {
  coord_source: string;
  source_url: string | null;
  nominal_lat: number;
  nominal_lon: number;
  refine_mode: RefineMode;
  refine_offset_km: number;
  list_membership: string;
  coord_verified: boolean;
  notes?: string;
}

/** 30 km x 30 km LOLA 240 m baseline topographic statistics around a polar site. */
export interface TerrainStats {
  elev_min_m: number;
  elev_median_m: number;
  elev_max_m: number;
  elev_relief_m: number;
  slope_mean_deg: number;
  slope_median_deg: number;
  slope_p90_deg: number;
  pct_safe_hls_le_5deg: number;
  pct_rover_le_15deg: number;
}

/** 26-month baseline illumination & Earth visibility metrics at 2 m mast height (I1 / DATA-4). */
export interface SiteMetrics2m {
  sun_no_terrain_pct: number;
  sun_time_pct: number;
  sun_visible_pct: number;
  earth_visible_pct: number;
  both_visible_pct: number;
  longest_sun_days: number;
  max_dark_days: number;
  earth_max_gap_days: number;
  viability_score: number | null;
  archetype: string | null;
}

/** +/-240 m positional dispersion envelope of sun_visible_pct (DATA-5). */
export interface Drift240m {
  sun_min_pct: number;
  sun_max_pct: number;
}

/** Complete curated site or custom probe record (Data Contract v2 / I1). */
export interface SiteData {
  id: string;
  name: string;
  short_name: string;
  category: string;
  program: string;
  description: string;
  terrain_source: TerrainSource;
  is_polar_dem: boolean;
  elev_source: ElevSource;
  lat: number;
  lon: number;
  polar_x_km: number | null;
  polar_y_km: number | null;
  elev_m: number;
  local_slope_deg: number | null;
  terrain_stats: TerrainStats | null;
  metrics_2m: SiteMetrics2m;
  drift_240m: Drift240m | null;
  horizons_by_mast: Record<string, number[]>;
  blocking_dist_km: number[] | null;
  provenance?: SiteProvenance;
  mission_status?: MissionStatus;
  isCustom?: boolean;
  isCandidate?: boolean;
}

/** Top-level schema of webapp/public/data/sites.json. */
export interface SitesDataset {
  schema_version: string;
  data_version: string;
  generated_utc: string;
  mast_heights: number[];
  sites: SiteData[];
}

/** Moon-center solar eclipse event entry in ephemeris.json. */
export interface EclipseEvent {
  start_utc: string;
  idx: number;
  hours: number;
  type: string;
  max_obscured_frac?: number;
}

/** Live-computed topocentric validation summary against JPL Horizons checkpoints. */
export interface EphemerisValidation {
  sun_max_err_deg: number;
  earth_max_err_deg: number;
  ephemeris: string;
  period_start: string;
  period_end: string;
  sites_checked?: string[];
}

/** Top-level schema of webapp/public/data/ephemeris.json. */
export interface EphemerisData {
  schema_version?: string;
  data_version?: string;
  generated_utc?: string;
  t0_utc: string;
  dt_hours: number;
  n: number;
  subearth_lon: number[];
  subearth_lat: number[];
  subsolar_lon: number[];
  subsolar_lat: number[];
  earth_dist_km: number[];
  eclipses: EclipseEvent[];
  validation: EphemerisValidation;
}

/** Closed coordinate ring in [lon_deg, lat_deg]. */
export type LonLatRing = Array<[number, number]>;

/** Closed coordinate ring in polar stereographic [x_km, y_km]. */
export type PolarKmRing = Array<[number, number]>;

/** 2024 NASA Artemis III candidate landing region with optional official GeoJSON polygon rings. */
export interface ArtemisRegion {
  region: string;
  code: string;
  centroid_lat: number;
  centroid_lon: number;
  area_km2: number;
  polar_x_km: number;
  polar_y_km: number;
  in_polar_frame?: boolean;
  source_url?: string;
  rings_polar_km?: PolarKmRing[];
  polygon_lonlat?: LonLatRing[];
}

/** Top-level schema of webapp/public/data/artemis3_regions.json (v2 wrapper). */
export interface ArtemisRegionsDataset {
  schema_version: string;
  data_version: string;
  generated_utc: string;
  regions: ArtemisRegion[];
}

/** Top-level schema of webapp/public/data/polar_dem_patch.json. */
export interface PolarDemPatchRaw {
  schema_version?: string;
  data_version?: string;
  generated_utc?: string;
  grid_size: number;
  mpp: number;
  extent_km: number;
  elev_min_m: number;
  elev_max_m: number;
  slope_scale_deg: number;
  elev_i16_b64: string;
  slope_u8_b64: string;
}

/** Descriptor for one binary int16 DEM grid in dem_manifest.json (I6). */
export interface DemGridDescriptor {
  file: string;
  n_cols: number;
  n_rows: number;
  mpp_m: number;
  x0_m: number;
  y0_m: number;
  aggregation: 'native' | 'max' | string;
  scale_m?: number;
  byte_length?: number;
  schema_version: string;
}

/** Top-level schema of webapp/public/data/dem_manifest.json (I6). */
export interface DemManifest {
  schema_version: string;
  data_version: string;
  generated_utc: string;
  dtype?: 'int16';
  endianness?: 'little';
  unit?: 'm';
  radius_m?: number;
  fine: DemGridDescriptor;
  coarse: DemGridDescriptor;
}

/** Top-level schema of webapp/public/data/polar_maps.json (I7 / MAP-2). */
export interface PolarMapsData {
  schema_version: string;
  data_version: string;
  generated_utc: string;
  grid_size: number;
  mpp_m: number;
  x0_m: number;
  y0_m: number;
  mast_m: number;
  period_utc: {
    start: string;
    end: string;
    n_steps: number;
  };
  method: string;
  sun_time_pct_u8_b64: string;
  sun_visible_pct_u8_b64?: string;
  earth_visible_pct_u8_b64: string;
  sample_pixel_u8_b64: string;
}

/** Base64-encoded 250x250 cell layers in site_candidates.json (WP7 §4). */
export interface SiteCandidateLayersB64 {
  sun_visible_pct_x100_u16_b64: string;
  sun_time_pct_x100_u16_b64: string;
  earth_visible_pct_x100_u16_b64: string;
  both_visible_pct_x100_u16_b64: string;
  max_dark_hours_u16_b64: string;
  slope_deg_x100_u16_b64: string;
  flat_1km_pct_x100_u16_b64: string;
  flat_box_pct_x100_u16_b64: string;
  elev_m_i16_b64: string;
  sample_pixel_u8_b64: string;
}

/** Refined 240 m pixel evaluation inside a top candidate 1.2 km cell (WP7 §4). */
export interface RefinedCandidatePixel {
  pixel_idx: number;
  dr: number;
  dc: number;
  lat: number;
  lon: number;
  x_km: number;
  y_km: number;
  elev_m: number;
  slope_deg: number;
  flat_1km_pct: number;
  flat_box_pct: number;
  sun_visible_pct: number;
  sun_time_pct: number;
  earth_visible_pct: number;
  both_visible_pct: number;
  max_dark_hours: number;
}

/** All 25 subpixel results for one refined 1.2 km cell in site_candidates.json (WP7 §4). */
export interface RefinedCandidateCell {
  cell_row: number;
  cell_col: number;
  pixels: RefinedCandidatePixel[];
}

/** Search metadata recorded in site_candidates.json (WP7 §4). */
export interface CandidateSearchParams {
  extent_km: number;
  grid_size: number;
  cell_mpp_m: number;
  fine_mpp_m: number;
  x0_m: number;
  y0_m: number;
  mast_m: number;
  period_start_utc: string;
  period_end_utc: string;
  n_steps: number;
  dem_product: string;
  ephemeris_source: string;
  refined_cell_count: number;
  layer_definitions: Record<string, string>;
}

/** Top-level schema of webapp/public/data/site_candidates.json (WP7 §4). */
export interface SiteCandidatesData {
  schema_version: string;
  data_version: string;
  generated_utc: string;
  search_params: CandidateSearchParams;
  layers: SiteCandidateLayersB64;
  refined: RefinedCandidateCell[];
}

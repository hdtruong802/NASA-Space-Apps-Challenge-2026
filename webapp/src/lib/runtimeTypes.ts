import type { DemManifest, EclipseEvent } from '../types/lunar';

/** Three-case countdown result replacing ambiguous null / ">41d" strings (I3 / TIME-1). */
export type Countdown =
  | { kind: 'event'; hours: number }
  | { kind: 'none_before_data_end'; hoursSearched: number };

/** Relative solar array power output as % of a sun-tracking perpendicular panel at 100% disk (Q9 / SCI-3). */
export interface SolarPowerInstant {
  trackingPct: number;
  horizontalPct: number;
}

/** Optional calculation overrides for lunarMath window/instant/sensitivity engines (I5). */
export interface ComputeOptions {
  earthMaskDeg?: number;
  windowHours?: number;
  applyEclipses?: boolean;
}

/** Site-level geometric solar eclipse evaluation at a single ephemeris timestep (SCI-1). */
export interface EclipseData {
  event: EclipseEvent | null;
  obscuredFrac: number;
  angularSepDeg: number;
  earthAngularRadiusDeg: number;
  sunAngularRadiusDeg: number;
  siteType: 'none' | 'partial' | 'total';
}

/** Contiguous visibility or darkness interval extracted from a mission window (CMP-2). */
export type OperationalWindowKind = 'sun' | 'earth' | 'both' | 'dark';

export interface OperationalWindow {
  kind: OperationalWindowKind;
  startIdx: number;
  endIdx: number;
  startUtc: string;
  endUtc: string;
  durationHours: number;
}

/** Ephemeris-derived seasonal milestone on the Moon (SCI-5 / WP4). */
export type SeasonalMarkerKind =
  | 'summer_solstice'
  | 'winter_solstice'
  | 'equinox'
  | 'data_start'
  | 'data_end';

export interface SeasonalMarker {
  idx: number;
  utcIso: string;
  kind: SeasonalMarkerKind;
  label: string;
  subsolarLatDeg: number;
}

/** Decoded 250x250 coarse South Pole DEM & slope patch used for initial map shading. */
export interface DecodedDemPatch {
  gridSize: number;
  mpp: number;
  extentKm: number;
  elevMinM: number;
  elevMaxM: number;
  slopeScaleDeg: number;
  elev: Int16Array;
  slopeU8: Uint8Array;
}

/** Decoded single-resolution client DEM grid from binary .i16 file (I6). */
export interface DecodedDemGrid {
  nCols: number;
  nRows: number;
  mppM: number;
  x0M: number;
  y0M: number;
  scaleM: number;
  elev: Int16Array;
}

/** Lazy-loaded fine (240 m) + coarse (1200 m max) client DEM bundle for unified custom pin ray-marching (I6). */
export interface ClientDemBundle {
  manifest: DemManifest;
  fine: DecodedDemGrid;
  coarse: DecodedDemGrid;
}

/** Instantaneous solar/Earth/power/eclipse state at a single hourly ephemeris index. */
export interface InstantMetrics {
  idx: number;
  utcIso: string;
  sunAzDeg: number;
  sunElDeg: number;
  sunHorizonElDeg: number;
  sunDiskFrac: number;
  sunVisible: boolean;
  earthAzDeg: number;
  earthElDeg: number;
  earthHorizonElDeg: number;
  earthVisible: boolean;
  earthDistKm: number;
  /** @deprecated Replaced by sunCountdown; kept until WP5-B10 cleanup. */
  hoursToSunset: number | null;
  /** @deprecated Replaced by sunCountdown; kept until WP5-B10 cleanup. */
  hoursToSunrise: number | null;
  /** @deprecated Replaced by earthCountdown; kept until WP5-B10 cleanup. */
  hoursToEarthset: number | null;
  /** @deprecated Replaced by earthCountdown; kept until WP5-B10 cleanup. */
  hoursToEarthrise: number | null;
  sunCountdown: Countdown;
  earthCountdown: Countdown;
  activeEclipse: EclipseEvent | null;
  eclipseObscuredFrac?: number;
  eclipseData?: EclipseData;
  power?: SolarPowerInstant;
}

/** Single hourly point within a mission window trajectory. */
export interface WindowPoint {
  idx: number;
  offsetHours: number;
  sunAz: number;
  sunEl: number;
  sunHz: number;
  sunFrac: number;
  earthAz: number;
  earthEl: number;
  earthHz: number;
  earthVis: boolean;
  bothVis: boolean;
  eclipseObscuredFrac?: number;
  powerTrackingPct?: number;
  powerHorizontalPct?: number;
}

/** Aggregated metrics and hourly samples across a mission window (default 14 days / 336h). */
export interface WindowSummary {
  sunPct: number;
  sunTimePct: number;
  earthPct: number;
  bothPct: number;
  maxDarkHours: number;
  windowHoursRequested: number;
  windowHoursAvailable: number;
  powerTrackingMeanPct?: number;
  powerHorizontalMeanPct?: number;
  sunWindows?: OperationalWindow[];
  earthWindows?: OperationalWindow[];
  bothWindows?: OperationalWindow[];
  points: WindowPoint[];
}

/** WP7 candidate ranking criteria (R2). */
export type CandidateCriterion = 'score' | 'sun' | 'earth' | 'joint' | 'shortest_night';

/** WP7 spatial search domain (R4). */
export type CandidateRegion =
  | { kind: 'map' }
  | { kind: 'artemis'; codes?: string[] }
  | { kind: 'around'; xKm: number; yKm: number; radiusKm: number };

/** WP7 candidate filter & ranking query parameters (R2–R5). */
export interface CandidateQuery {
  criterion: CandidateCriterion;
  region: CandidateRegion;
  maxSlopeDeg: number | null;
  minFlat1kmPct: number | null;
  count: number;
  minSepKm: number;
}

/** Single ranked computed candidate returned by WP7 Mode A or Mode B. */
export interface SiteCandidate {
  id: string;
  rank: number;
  mode: 'A' | 'B';
  lat: number;
  lon: number;
  xKm: number;
  yKm: number;
  elevM: number;
  slopeDeg: number;
  flat1kmPct: number | null;
  flatBoxPct: number | null;
  sunVisiblePct: number;
  sunTimePct: number;
  earthVisiblePct: number;
  bothVisiblePct: number;
  maxDarkHours: number;
  viabilityScore: number | null;
  isRefined: boolean;
  cellRow?: number;
  cellCol?: number;
  samplePixel?: number;
  artemisCode?: string | null;
}

/** Result bundle returned by WP7 rankCandidates / scanAround. */
export interface CandidateRankResult {
  picked: SiteCandidate[];
  excludedByConstraints: number;
  outsideRegion: number;
  totalEvaluated: number;
}

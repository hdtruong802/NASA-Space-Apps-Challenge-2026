import type {
  Countdown,
  EphemerisData,
  InstantMetrics,
  MissionStatus,
  OperationalWindow,
  SiteData,
  SiteMetrics2m,
  WindowPoint,
  WindowSummary,
} from '../types/lunar';

export type WorkspaceTab = 'explore' | 'compare' | 'directory';

export function formatHoursHuman(hours: number): string {
  if (hours < 24) return `${hours}h`;
  return `${(hours / 24).toFixed(1)}d (${hours}h)`;
}

export interface FormattedCountdown {
  primary: string;
  detail: string;
  isPermanent: boolean;
}

/**
 * Formats three-case countdowns (TIME-1 / I3), replacing legacy ">41d" strings.
 */
export function formatCountdown(
  countdown: Countdown,
  isVisible: boolean,
  kind: 'sun' | 'earth',
  metrics: SiteMetrics2m,
): FormattedCountdown {
  if (countdown.kind === 'event') {
    const label =
      kind === 'sun'
        ? isVisible
          ? 'until sunset'
          : 'until sunrise'
        : isVisible
          ? 'until Earthset'
          : 'until Earthrise';
    return {
      primary: formatHoursHuman(countdown.hours),
      detail: label,
      isPermanent: false,
    };
  }

  if (kind === 'sun') {
    if (!isVisible && metrics.sun_time_pct === 0) {
      return {
        primary: 'Never sunlit',
        detail: 'Never sunlit in the ephemeris data',
        isPermanent: true,
      };
    }
    if (isVisible && metrics.sun_time_pct >= 99.99) {
      return {
        primary: 'Continuous sun',
        detail: 'Sun remains above horizon throughout the ephemeris data',
        isPermanent: true,
      };
    }
    const daysLeft = (countdown.hoursSearched / 24).toFixed(1);
    return {
      primary: isVisible ? 'Lit to data end' : 'Dark to data end',
      detail: isVisible
        ? `No sunset before the data ends (${daysLeft}d / ${countdown.hoursSearched}h left)`
        : `No sunrise before the data ends (${daysLeft}d / ${countdown.hoursSearched}h left)`,
      isPermanent: false,
    };
  }

  if (!isVisible && metrics.earth_visible_pct === 0) {
    return {
      primary: 'Never in view',
      detail: 'Earth never in view from here in the ephemeris data',
      isPermanent: true,
    };
  }
  if (isVisible && metrics.earth_visible_pct >= 99.99) {
    return {
      primary: 'Always in view',
      detail: 'Earth stays in view throughout the ephemeris data',
      isPermanent: true,
    };
  }
  const daysLeft = (countdown.hoursSearched / 24).toFixed(1);
  return {
    primary: isVisible ? 'In view to data end' : 'Hidden to data end',
    detail: isVisible
      ? `No Earthset before the data ends (${daysLeft}d / ${countdown.hoursSearched}h left)`
      : `No Earthrise before the data ends (${daysLeft}d / ${countdown.hoursSearched}h left)`,
    isPermanent: false,
  };
}

export function missionStatusMeta(
  status?: MissionStatus,
): { label: string; badgeClass: string } | null {
  switch (status) {
    case 'landed':
      return {
        label: 'Landed',
        badgeClass: 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40',
      };
    case 'attempted':
      return {
        label: 'Attempted',
        badgeClass: 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40',
      };
    case 'planned':
      return {
        label: 'Planned',
        badgeClass: 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40',
      };
    case 'candidate_region':
      return {
        label: 'Candidate Region',
        badgeClass: 'bg-violet-500/20 text-violet-200 ring-1 ring-violet-500/40',
      };
    case 'reference':
      return {
        label: 'Reference',
        badgeClass: 'bg-slate-700/70 text-slate-200 ring-1 ring-slate-600',
      };
    default:
      return null;
  }
}

export function formatSiteElevation(site: SiteData): string {
  const rounded = Math.round(site.elev_m).toLocaleString('en-US');
  return site.elev_source === 'APPROXIMATE' ? `≈ ${rounded} m` : `${rounded} m`;
}

export function formatTerrainSourceLabel(site: SiteData): string {
  if (site.terrain_source === 'LOLA_240M') return 'LOLA 240 m DEM';
  if (site.terrain_source === 'LOLA_1200M_COARSE') return 'LOLA 1.2 km Coarse DEM';
  return 'Smooth Sphere (No Local DEM)';
}

export function stepOffsetToUtcString(t0Utc: string, idx: number, dtHours = 1): string {
  const baseMs = Date.parse(t0Utc);
  const dt = new Date(baseMs + idx * dtHours * 3600 * 1000);
  return dt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

/**
 * Extracts contiguous operational windows from WindowSummary points (or reuses precomputed windows).
 */
export function getOperationalWindows(
  summary: WindowSummary,
  t0Utc: string,
  kind: 'sun' | 'earth' | 'both',
  dtHours = 1,
): OperationalWindow[] {
  if (kind === 'sun' && summary.sunWindows) return summary.sunWindows;
  if (kind === 'earth' && summary.earthWindows) return summary.earthWindows;
  if (kind === 'both' && summary.bothWindows) return summary.bothWindows;

  const pred = (p: WindowPoint) =>
    kind === 'sun' ? p.sunFrac > 0 : kind === 'earth' ? p.earthVis : p.bothVis;

  const out: OperationalWindow[] = [];
  let startPoint: WindowPoint | null = null;
  let prevPoint: WindowPoint | null = null;

  for (const pt of summary.points) {
    if (pred(pt)) {
      if (!startPoint) startPoint = pt;
      prevPoint = pt;
    } else if (startPoint && prevPoint) {
      const startIdx = startPoint.idx;
      const endIdx = prevPoint.idx;
      out.push({
        kind,
        startIdx,
        endIdx,
        startUtc: stepOffsetToUtcString(t0Utc, startIdx, dtHours),
        endUtc: stepOffsetToUtcString(t0Utc, endIdx + 1, dtHours),
        durationHours: (endIdx - startIdx + 1) * dtHours,
      });
      startPoint = null;
      prevPoint = null;
    }
  }
  if (startPoint && prevPoint) {
    const startIdx = startPoint.idx;
    const endIdx = prevPoint.idx;
    out.push({
      kind,
      startIdx,
      endIdx,
      startUtc: stepOffsetToUtcString(t0Utc, startIdx, dtHours),
      endUtc: stepOffsetToUtcString(t0Utc, endIdx + 1, dtHours),
      durationHours: (endIdx - startIdx + 1) * dtHours,
    });
  }
  return out;
}

export interface ParsedUrlState {
  siteId?: string;
  customCoords?: { lat: number; lon: number };
  timeIdx?: number;
  mastHeightM?: number;
  compareSiteId?: string | null;
  compareCoords?: { lat: number; lon: number };
  compareTimeIdx?: number;
  compareMastHeightM?: number;
  earthMaskDeg?: number;
  activeTab?: WorkspaceTab;
  warnings: string[];
}

function parseStrictFiniteFloat(raw: string): number | null {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw.trim())) return null;
  const val = Number(raw);
  return Number.isFinite(val) ? val : null;
}

function parseStrictInteger(raw: string): number | null {
  if (!/^[+-]?\d+$/.test(raw.trim())) return null;
  const val = Number(raw);
  return Number.isSafeInteger(val) ? val : null;
}

/**
 * Validates URL query parameters without silently coercing invalid entries (UX-4 / UX-5).
 */
export function parseAndValidateUrlParams(
  search: string,
  sites: SiteData[],
  ephemeris: EphemerisData,
): ParsedUrlState {
  const params = new URLSearchParams(search);
  const warnings: string[] = [];
  const res: ParsedUrlState = { warnings };

  const rawMast = params.get('mast');
  if (rawMast !== null) {
    const val = parseStrictFiniteFloat(rawMast);
    if (val === null || val < 0.5 || val > 50) {
      warnings.push(`Ignored invalid mast parameter "${rawMast}" (expected 0.5–50 m).`);
    } else {
      res.mastHeightM = val;
    }
  }

  const rawTime = params.get('t');
  if (rawTime !== null) {
    const val = parseStrictInteger(rawTime);
    if (val === null || val < 0 || val >= ephemeris.n) {
      warnings.push(`Ignored out-of-range time index "t=${rawTime}" (valid 0–${ephemeris.n - 1}).`);
    } else {
      res.timeIdx = val;
    }
  }

  const rawLat = params.get('lat');
  const rawLon = params.get('lon');
  const rawSite = params.get('site');
  if (rawLat !== null || rawLon !== null) {
    if (rawLat === null || rawLon === null) {
      warnings.push('Ignored incomplete custom coordinates (both "lat" and "lon" are required).');
    } else {
      const lat = parseStrictFiniteFloat(rawLat);
      const lon = parseStrictFiniteFloat(rawLon);
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        warnings.push(
          `Ignored invalid coordinates (lat="${rawLat}", lon="${rawLon}"; valid lat -90..90, lon -180..180).`,
        );
      } else {
        res.customCoords = { lat, lon };
      }
    }
  } else if (rawSite !== null) {
    if (sites.some((s) => s.id === rawSite)) {
      res.siteId = rawSite;
    } else {
      warnings.push(`Unknown site parameter "site=${rawSite}"; kept default site.`);
    }
  }

  const rawCmpLat = params.get('cmplat');
  const rawCmpLon = params.get('cmplon');
  const rawCmp = params.get('cmp');
  if (rawCmpLat !== null || rawCmpLon !== null) {
    if (rawCmpLat === null || rawCmpLon === null) {
      warnings.push('Ignored incomplete comparison coordinates (both "cmplat" and "cmplon" required).');
    } else {
      const lat = parseStrictFiniteFloat(rawCmpLat);
      const lon = parseStrictFiniteFloat(rawCmpLon);
      if (lat === null || lon === null || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        warnings.push(
          `Ignored invalid comparison coordinates (cmplat="${rawCmpLat}", cmplon="${rawCmpLon}").`,
        );
      } else {
        res.compareCoords = { lat, lon };
      }
    }
  } else if (rawCmp !== null) {
    if (rawCmp === 'none') {
      res.compareSiteId = null;
    } else if (sites.some((s) => s.id === rawCmp)) {
      res.compareSiteId = rawCmp;
    } else {
      warnings.push(`Unknown comparison site "cmp=${rawCmp}"; kept default comparison.`);
    }
  }

  const rawCmpTime = params.get('cmpt');
  if (rawCmpTime !== null) {
    const val = parseStrictInteger(rawCmpTime);
    if (val === null || val < 0 || val >= ephemeris.n) {
      warnings.push(`Ignored out-of-range comparison time "cmpt=${rawCmpTime}".`);
    } else {
      res.compareTimeIdx = val;
    }
  }

  const rawCmpMast = params.get('cmpmast');
  if (rawCmpMast !== null) {
    const val = parseStrictFiniteFloat(rawCmpMast);
    if (val === null || val < 0.5 || val > 50) {
      warnings.push(`Ignored invalid comparison mast "cmpmast=${rawCmpMast}" (expected 0.5–50 m).`);
    } else {
      res.compareMastHeightM = val;
    }
  }

  const rawMask = params.get('mask');
  if (rawMask !== null) {
    const val = parseStrictFiniteFloat(rawMask);
    if (val === null || val < 0 || val > 30) {
      warnings.push(`Ignored invalid DTE elevation mask "mask=${rawMask}" (expected 0–30°).`);
    } else {
      res.earthMaskDeg = val;
    }
  }

  const rawView = params.get('view');
  if (rawView !== null) {
    if (rawView === 'explore' || rawView === 'compare' || rawView === 'directory') {
      res.activeTab = rawView;
    } else {
      warnings.push(`Ignored unknown view tab "view=${rawView}".`);
    }
  }

  return res;
}

export interface BriefExportInput {
  site: SiteData;
  instant: InstantMetrics;
  summary: WindowSummary;
  ephemeris: EphemerisData;
  mastHeightM: number;
  earthMaskDeg: number;
  dataVersion: string;
  formulaText: string;
  powerAssumptionText: string;
  riseSetDefinitionText: string;
  eclipseAssumptionText: string;
}

/**
 * Generates an accurate Markdown operational brief respecting DATA-3 (n/a for NONE sites) and COPY-1.
 */
export function buildMarkdownBrief({
  site,
  instant,
  summary,
  ephemeris,
  mastHeightM,
  earthMaskDeg,
  dataVersion,
  formulaText,
  powerAssumptionText,
  riseSetDefinitionText,
  eclipseAssumptionText,
}: BriefExportInput): string {
  const hasTerrain = site.terrain_source !== 'NONE' && site.terrain_stats !== null;
  const sunCd = formatCountdown(instant.sunCountdown, instant.sunVisible, 'sun', site.metrics_2m);
  const earthCd = formatCountdown(instant.earthCountdown, instant.earthVisible, 'earth', site.metrics_2m);
  const trackingPct = instant.power?.trackingPct ?? instant.sunDiskFrac * 100;
  const horizPct =
    instant.power?.horizontalPct ??
    instant.sunDiskFrac * Math.max(0, Math.sin((instant.sunElDeg * Math.PI) / 180)) * 100;
  const obscuredPct = (instant.eclipseObscuredFrac ?? 0) * 100;
  const sunClearance = instant.sunElDeg - instant.sunHorizonElDeg;
  const earthClearance = instant.earthElDeg - instant.earthHorizonElDeg;

  const slopeLine =
    hasTerrain && site.local_slope_deg !== null && site.terrain_stats
      ? `${site.local_slope_deg.toFixed(2)}° at 240 m baseline — not lander-scale (${site.terrain_stats.pct_safe_hls_le_5deg}% of 30×30 km box <= 5°)`
      : 'n/a — no terrain data for this location';

  const driftLine =
    site.terrain_source === 'LOLA_240M' && site.drift_240m
      ? `${site.drift_240m.sun_min_pct}–${site.drift_240m.sun_max_pct}%`
      : 'n/a — no terrain data for this location';

  const scoreLine =
    site.metrics_2m.viability_score !== null
      ? `${site.metrics_2m.viability_score.toFixed(1)}/100 (Team-defined index)`
      : 'n/a — no terrain data for this location';

  const windowNote =
    summary.windowHoursAvailable < summary.windowHoursRequested
      ? `${summary.windowHoursAvailable}h available of ${summary.windowHoursRequested}h requested (truncated at end of ephemeris)`
      : `${summary.windowHoursAvailable}h`;

  const eclipseText = instant.activeEclipse
    ? `ECLIPSE IN PROGRESS (${instant.activeEclipse.type} for Moon center, ${obscuredPct.toFixed(0)}% solar disk obscured at site)`
    : instant.sunVisible
      ? `LIT (${(instant.sunDiskFrac * 100).toFixed(0)}% solar disk visible)`
      : 'IN SHADOW';

  const lines = [
    `# Lunar Landing Site Navigator — Mission Operations Brief`,
    ``,
    `- **Generated:** ${new Date().toISOString()}`,
    `- **Dataset Version:** ${dataVersion} (Ephemeris ${ephemeris.t0_utc.slice(0, 10)}, ${ephemeris.n.toLocaleString('en-US')} hourly steps)`,
    `- **Target Site:** ${site.name} (\`${site.id}\`)`,
    `- **Program / Category:** ${site.program} (${site.category})`,
    ...(site.mission_status ? [`- **Mission Status:** ${site.mission_status}`] : []),
    ...(site.provenance?.source_url
      ? [
          `- **Coordinate Provenance:** ${site.provenance.coord_source} (${site.provenance.source_url}; refinement offset ${site.provenance.refine_offset_km.toFixed(2)} km via ${site.provenance.refine_mode})`,
        ]
      : []),
    `- **Coordinates:** ${site.lat.toFixed(4)}° Lat, ${site.lon.toFixed(4)}° Lon · Elevation ${formatSiteElevation(site)}`,
    `- **Terrain Model:** ${formatTerrainSourceLabel(site)}`,
    `- **Timestamp:** ${instant.utcIso} (Step ${instant.idx} / ${ephemeris.n - 1})`,
    `- **Mast / Antenna Height:** ${mastHeightM.toFixed(1)} m`,
    `- **DTE Elevation Mask:** ${earthMaskDeg.toFixed(1)}° above local horizon`,
    ``,
    `## Instantaneous Geometry & Power`,
    `- **Solar State:** ${eclipseText}`,
    `- **Solar Elevation & Clearance:** Sun El ${instant.sunElDeg.toFixed(2)}° · Horizon ${instant.sunHorizonElDeg.toFixed(2)}° · Clearance ${sunClearance >= 0 ? '+' : ''}${sunClearance.toFixed(2)}°`,
    `- **Relative Array Output:** Vertical Sun-Tracking ${trackingPct.toFixed(1)}% · Horizontal Panel ${horizPct.toFixed(1)}%`,
    `- **Solar Countdown:** ${sunCd.primary} (${sunCd.detail})`,
    `- **Earth DTE Geometry:** ${instant.earthVisible ? 'Earth in view' : 'Earth below horizon'} (Earth El ${instant.earthElDeg.toFixed(2)}°, Horizon ${instant.earthHorizonElDeg.toFixed(2)}°, Clearance ${earthClearance >= 0 ? '+' : ''}${earthClearance.toFixed(2)}°, Mask ${earthMaskDeg.toFixed(1)}°, Dist ${Math.round(instant.earthDistKm).toLocaleString('en-US')} km)`,
    `- **Earth Countdown:** ${earthCd.primary} (${earthCd.detail})`,
    `- **240 m Baseline Slope:** ${slopeLine}`,
    ``,
    `## Mission Window (${windowNote})`,
    `- **Sun Time (% hours lit):** ${summary.sunTimePct.toFixed(1)}% · **Mean Solar Disk:** ${summary.sunPct.toFixed(1)}%`,
    `- **Mean Relative Output:** Tracking ${(summary.powerTrackingMeanPct ?? summary.sunPct).toFixed(1)}% · Horizontal ${(summary.powerHorizontalMeanPct ?? 0).toFixed(1)}%`,
    `- **Earth DTE Visibility:** ${summary.earthPct.toFixed(1)}%`,
    `- **Joint Sun + Earth Ops:** ${summary.bothPct.toFixed(1)}%`,
    `- **Longest Continuous Darkness:** ${(summary.maxDarkHours / 24).toFixed(1)} days (${summary.maxDarkHours}h)`,
    ``,
    `## Full-Ephemeris Baseline (@ 2m Mast, 0° Mask) & Definitions`,
    `- **Baseline Sun (% hours / % mean disk):** ${site.metrics_2m.sun_time_pct}% / ${site.metrics_2m.sun_visible_pct}% (Smooth Sphere: ${site.metrics_2m.sun_no_terrain_pct}%)`,
    `- **Baseline Earth DTE / Joint:** ${site.metrics_2m.earth_visible_pct}% / ${site.metrics_2m.both_visible_pct}%`,
    `- **±240 m Positional Drift (Sun Disk %):** ${driftLine}`,
    `- **Composite Viability Score:** ${scoreLine}`,
    `- **JPL Horizons Direction Check:** Sun max error <= ${ephemeris.validation.sun_max_err_deg}°, Earth max error <= ${ephemeris.validation.earth_max_err_deg}°`,
    `- **Definitions & Assumptions:**`,
    `  - ${riseSetDefinitionText}`,
    `  - ${powerAssumptionText}`,
    `  - ${eclipseAssumptionText}`,
    `  - ${formulaText}`,
  ];
  return lines.join('\n');
}

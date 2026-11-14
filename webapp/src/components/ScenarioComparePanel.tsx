import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  CalendarClock,
  Clock,
  Crosshair,
  GitCompare,
  Layers,
  Loader2,
  Radio,
  Sparkles,
  Sun,
} from 'lucide-react';
import { HorizonSkyView } from './HorizonSkyView';
import {
  formatUtcDatePart,
  getEphemerisBounds,
  getUtcHourPart,
  parseUtcTimestampInput,
} from './timeline/timelineHelpers';
import type {
  EphemerisData,
  InstantMetrics,
  SeasonalMarker,
  SiteData,
  WindowSummary,
} from '../types/lunar';
import {
  formatCountdown,
  formatSiteElevation,
  formatTerrainSourceLabel,
  getOperationalWindows,
  missionStatusMeta,
} from './appHelpers';

export type ComparisonPresetId =
  | 'two_sites'
  | 'slip_7d'
  | 'slip_14d'
  | 'seasonal'
  | 'mast_2_vs_20';

export interface ScenarioComparePanelProps {
  ephemeris: EphemerisData;
  sites: SiteData[];
  customSiteA: SiteData | null;
  customSiteB: SiteData | null;
  siteA: SiteData;
  horizonA: number[];
  timeIdxA: number;
  mastHeightA: number;
  instantA: InstantMetrics;
  summaryA: WindowSummary;
  siteB: SiteData;
  horizonB: number[];
  timeIdxB: number;
  mastHeightB: number;
  instantB: InstantMetrics;
  summaryB: WindowSummary;
  windowHours: number;
  earthMaskDeg: number;
  seasonalMarkers: SeasonalMarker[];
  customPinLoading?: boolean;
  onSelectSiteA: (id: string) => void;
  onSelectSiteB: (id: string) => void;
  onProbeCoordsA: (lat: number, lon: number) => void;
  onProbeCoordsB: (lat: number, lon: number) => void;
  onChangeTimeA: (idx: number) => void;
  onChangeTimeB: (idx: number) => void;
  onChangeMastA: (mastM: number) => void;
  onChangeMastB: (mastM: number) => void;
  onSwapScenarios: () => void;
  onApplyPreset: (preset: ComparisonPresetId) => void;
}

interface ScenarioConfigCardProps {
  label: string;
  accent: 'amber' | 'sky';
  site: SiteData;
  customSite: SiteData | null;
  sites: SiteData[];
  timeIdx: number;
  mastHeightM: number;
  ephemeris: EphemerisData;
  customPinLoading?: boolean;
  onSelectSite: (id: string) => void;
  onProbeCoords: (lat: number, lon: number) => void;
  onChangeTime: (idx: number) => void;
  onChangeMast: (mastM: number) => void;
}

const ScenarioConfigCard: React.FC<ScenarioConfigCardProps> = ({
  label,
  accent,
  site,
  customSite,
  sites,
  timeIdx,
  mastHeightM,
  ephemeris,
  customPinLoading,
  onSelectSite,
  onProbeCoords,
  onChangeTime,
  onChangeMast,
}) => {
  const [latText, setLatText] = useState(site.lat.toFixed(4));
  const [lonText, setLonText] = useState(site.lon.toFixed(4));
  const [coordError, setCoordError] = useState<string | null>(null);
  const [dateText, setDateText] = useState(() =>
    formatUtcDatePart(ephemeris.t0_utc, timeIdx, ephemeris.dt_hours),
  );
  const [hourVal, setHourVal] = useState(() =>
    getUtcHourPart(ephemeris.t0_utc, timeIdx, ephemeris.dt_hours),
  );
  const [timeMessage, setTimeMessage] = useState<string | null>(null);

  useEffect(() => {
    setLatText(site.lat.toFixed(4));
    setLonText(site.lon.toFixed(4));
    setCoordError(null);
  }, [site.id, site.lat, site.lon]);

  useEffect(() => {
    setDateText(formatUtcDatePart(ephemeris.t0_utc, timeIdx, ephemeris.dt_hours));
    setHourVal(getUtcHourPart(ephemeris.t0_utc, timeIdx, ephemeris.dt_hours));
    setTimeMessage(null);
  }, [ephemeris.t0_utc, ephemeris.dt_hours, timeIdx]);

  const maxIdx = Math.max(0, ephemeris.n - 1);
  const bounds = getEphemerisBounds(ephemeris.t0_utc, ephemeris.n, ephemeris.dt_hours);
  const statusBadge = missionStatusMeta(site.mission_status);

  const borderClass =
    accent === 'amber'
      ? 'border-amber-500/40 bg-amber-950/15'
      : 'border-sky-500/40 bg-sky-950/15';
  const badgeClass =
    accent === 'amber'
      ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/50'
      : 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/50';

  const applyUtc = (nextDate: string, nextHour: number) => {
    const parsed = parseUtcTimestampInput(
      `${nextDate}T${String(nextHour).padStart(2, '0')}:00Z`,
      nextHour,
      ephemeris.t0_utc,
      ephemeris.n,
      ephemeris.dt_hours,
    );
    if (!parsed.ok) {
      setTimeMessage(parsed.error);
      return;
    }
    setTimeMessage(parsed.warning);
    onChangeTime(parsed.idx);
  };

  const handleProbeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(latText.trim());
    const lon = Number(lonText.trim());
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setCoordError('Latitude must be between -90° and 90°.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setCoordError('Longitude must be between -180° and 180°.');
      return;
    }
    setCoordError(null);
    onProbeCoords(lat, lon);
  };

  const selectValue = site.isCustom ? 'custom_pin' : site.id;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${borderClass}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badgeClass}`}>
            {label}
          </span>
          {statusBadge && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.badgeClass}`}>
              {statusBadge.label}
            </span>
          )}
          <span className="text-xs text-slate-300">{formatTerrainSourceLabel(site)}</span>
        </div>
        <span className="font-mono text-xs text-slate-300">
          Elev {formatSiteElevation(site)}
        </span>
      </div>

      {/* Site Selector */}
      <div className="space-y-1.5">
        <label
          htmlFor={`cmp-site-${label}`}
          className="block text-xs font-semibold text-slate-200"
        >
          Site or Custom Pin
        </label>
        <select
          id={`cmp-site-${label}`}
          name={`cmp-site-${label}`}
          value={selectValue}
          onChange={(e) => onSelectSite(e.target.value)}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
        >
          {customSite && <option value="custom_pin">{customSite.name}</option>}
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              [{s.category}] {s.name} ({s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°)
            </option>
          ))}
        </select>
      </div>

      {/* Custom Coordinate Probe */}
      <form onSubmit={handleProbeSubmit} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[100px]">
          <label
            htmlFor={`cmp-lat-${label}`}
            className="block text-xs text-slate-400 mb-1"
          >
            Lat (°)
          </label>
          <input
            id={`cmp-lat-${label}`}
            name={`cmp-lat-${label}`}
            type="text"
            value={latText}
            onChange={(e) => setLatText(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
          />
        </div>
        <div className="flex-1 min-w-[100px]">
          <label
            htmlFor={`cmp-lon-${label}`}
            className="block text-xs text-slate-400 mb-1"
          >
            Lon (°E)
          </label>
          <input
            id={`cmp-lon-${label}`}
            name={`cmp-lon-${label}`}
            type="text"
            value={lonText}
            onChange={(e) => setLonText(e.target.value)}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={customPinLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-sky-400/60 hover:bg-slate-700 disabled:opacity-60"
        >
          {customPinLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
          )}
          Pin Coords
        </button>
      </form>
      {coordError && (
        <p role="alert" className="text-xs text-rose-300">
          {coordError}
        </p>
      )}

      {/* Explicit UTC Date & Hour + Time Slip */}
      <div className="space-y-2 border-t border-slate-800/80 pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[140px]">
            <label
              htmlFor={`cmp-date-${label}`}
              className="flex items-center gap-1 text-xs font-medium text-slate-300 mb-1"
            >
              <CalendarClock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              UTC Date ({bounds.startDate} .. {bounds.endDate})
            </label>
            <input
              id={`cmp-date-${label}`}
              name={`cmp-date-${label}`}
              type="date"
              value={dateText}
              min={bounds.startDate}
              max={bounds.endDate}
              onChange={(e) => {
                setDateText(e.target.value);
                applyUtc(e.target.value, hourVal);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
            />
          </div>
          <div className="w-28">
            <label
              htmlFor={`cmp-hour-${label}`}
              className="block text-xs font-medium text-slate-300 mb-1"
            >
              UTC Hour
            </label>
            <select
              id={`cmp-hour-${label}`}
              name={`cmp-hour-${label}`}
              value={hourVal}
              onChange={(e) => {
                const h = Number(e.target.value);
                setHourVal(h);
                applyUtc(dateText, h);
              }}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 UTC
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Symmetric Slip Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            [-336, '-14d'],
            [-168, '-7d'],
            [-24, '-1d'],
            [24, '+1d'],
            [168, '+7d'],
            [336, '+14d'],
          ].map(([delta, txt]) => (
            <button
              key={String(txt)}
              type="button"
              onClick={() =>
                onChangeTime(Math.max(0, Math.min(maxIdx, timeIdx + (delta as number))))
              }
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-xs text-slate-200 transition hover:border-amber-400/60 hover:text-amber-200"
            >
              {txt}
            </button>
          ))}
        </div>

        {timeMessage && (
          <p role="alert" className="text-xs text-amber-300">
            {timeMessage}
          </p>
        )}
      </div>

      {/* Mast Height Control */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 pt-3">
        <label htmlFor={`cmp-mast-${label}`} className="text-xs font-medium text-slate-300">
          Mast / Antenna Height:{' '}
          <span className="font-mono font-semibold text-amber-300">{mastHeightM.toFixed(1)} m</span>
        </label>
        <div className="flex items-center gap-1.5">
          {[2, 10, 20].map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => onChangeMast(preset)}
              className={`rounded-md px-2 py-1 font-mono text-xs transition ${
                Math.abs(mastHeightM - preset) < 0.05
                  ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50'
                  : 'bg-slate-800 text-slate-300 hover:text-white'
              }`}
            >
              {preset}m
            </button>
          ))}
        </div>
        <input
          id={`cmp-mast-${label}`}
          name={`cmp-mast-${label}`}
          type="range"
          min={0.5}
          max={50}
          step={0.5}
          value={mastHeightM}
          onChange={(e) => onChangeMast(Number(e.target.value))}
          className="w-full accent-amber-400"
        />
      </div>
    </div>
  );
};

function formatDelta(valA: number | null, valB: number | null, unit: string, decimals = 1): string {
  if (valA === null || valB === null) return 'n/a';
  const diff = valB - valA;
  const sign = diff > 0 ? '+' : '';
  return `${sign}${diff.toFixed(decimals)}${unit}`;
}

export const ScenarioComparePanel: React.FC<ScenarioComparePanelProps> = ({
  ephemeris,
  sites,
  customSiteA,
  customSiteB,
  siteA,
  horizonA,
  timeIdxA,
  mastHeightA,
  instantA,
  summaryA,
  siteB,
  horizonB,
  timeIdxB,
  mastHeightB,
  instantB,
  summaryB,
  windowHours,
  earthMaskDeg,
  customPinLoading = false,
  onSelectSiteA,
  onSelectSiteB,
  onProbeCoordsA,
  onProbeCoordsB,
  onChangeTimeA,
  onChangeTimeB,
  onChangeMastA,
  onChangeMastB,
  onSwapScenarios,
  onApplyPreset,
}) => {
  const [windowTab, setWindowTab] = useState<'both' | 'sun' | 'earth'>('both');
  const [showSphericalRef, setShowSphericalRef] = useState<boolean>(true);

  const sunCdA = formatCountdown(instantA.sunCountdown, instantA.sunVisible, 'sun', siteA.metrics_2m);
  const sunCdB = formatCountdown(instantB.sunCountdown, instantB.sunVisible, 'sun', siteB.metrics_2m);
  const earthCdA = formatCountdown(
    instantA.earthCountdown,
    instantA.earthVisible,
    'earth',
    siteA.metrics_2m,
  );
  const earthCdB = formatCountdown(
    instantB.earthCountdown,
    instantB.earthVisible,
    'earth',
    siteB.metrics_2m,
  );

  const windowsA = getOperationalWindows(summaryA, ephemeris.t0_utc, windowTab, ephemeris.dt_hours);
  const windowsB = getOperationalWindows(summaryB, ephemeris.t0_utc, windowTab, ephemeris.dt_hours);

  const hasTerrainA = siteA.terrain_source !== 'NONE' && siteA.terrain_stats !== null;
  const hasTerrainB = siteB.terrain_source !== 'NONE' && siteB.terrain_stats !== null;

  const trackPowA = instantA.power?.trackingPct ?? instantA.sunDiskFrac * 100;
  const trackPowB = instantB.power?.trackingPct ?? instantB.sunDiskFrac * 100;
  const horizPowA =
    instantA.power?.horizontalPct ??
    instantA.sunDiskFrac * Math.max(0, Math.sin((instantA.sunElDeg * Math.PI) / 180)) * 100;
  const horizPowB =
    instantB.power?.horizontalPct ??
    instantB.sunDiskFrac * Math.max(0, Math.sin((instantB.sunElDeg * Math.PI) / 180)) * 100;

  const deltaRows: Array<{
    metric: string;
    aVal: string;
    bVal: string;
    delta: string;
    note?: string;
  }> = [
    {
      metric: 'Instant Solar Elevation & Clearance',
      aVal: `${instantA.sunElDeg.toFixed(2)}° (${(instantA.sunElDeg - instantA.sunHorizonElDeg) >= 0 ? '+' : ''}${(instantA.sunElDeg - instantA.sunHorizonElDeg).toFixed(2)}°)`,
      bVal: `${instantB.sunElDeg.toFixed(2)}° (${(instantB.sunElDeg - instantB.sunHorizonElDeg) >= 0 ? '+' : ''}${(instantB.sunElDeg - instantB.sunHorizonElDeg).toFixed(2)}°)`,
      delta: formatDelta(instantA.sunElDeg, instantB.sunElDeg, '°', 2),
    },
    {
      metric: 'Instant Tracking / Horizontal Output',
      aVal: `${trackPowA.toFixed(0)}% / ${horizPowA.toFixed(1)}%`,
      bVal: `${trackPowB.toFixed(0)}% / ${horizPowB.toFixed(1)}%`,
      delta: `${formatDelta(trackPowA, trackPowB, ' pp', 1)} / ${formatDelta(horizPowA, horizPowB, ' pp', 1)}`,
    },
    {
      metric: 'Instant Solar Countdown',
      aVal: `${sunCdA.primary} (${sunCdA.detail})`,
      bVal: `${sunCdB.primary} (${sunCdB.detail})`,
      delta: '—',
    },
    {
      metric: `Instant Earth DTE (${earthMaskDeg.toFixed(0)}° Mask)`,
      aVal: `${instantA.earthVisible ? 'Earth in view' : 'Earth below horizon'} (${instantA.earthElDeg.toFixed(2)}°)`,
      bVal: `${instantB.earthVisible ? 'Earth in view' : 'Earth below horizon'} (${instantB.earthElDeg.toFixed(2)}°)`,
      delta: formatDelta(instantA.earthElDeg, instantB.earthElDeg, '°', 2),
    },
    {
      metric: 'Instant Earth Countdown',
      aVal: `${earthCdA.primary} (${earthCdA.detail})`,
      bVal: `${earthCdB.primary} (${earthCdB.detail})`,
      delta: '—',
    },
    {
      metric: `Window Sun Time (% hours lit)`,
      aVal: `${summaryA.sunTimePct.toFixed(1)}% (${summaryA.windowHoursAvailable}h)`,
      bVal: `${summaryB.sunTimePct.toFixed(1)}% (${summaryB.windowHoursAvailable}h)`,
      delta: formatDelta(summaryA.sunTimePct, summaryB.sunTimePct, ' pp'),
    },
    {
      metric: 'Window Mean Solar Disk %',
      aVal: `${summaryA.sunPct.toFixed(1)}%`,
      bVal: `${summaryB.sunPct.toFixed(1)}%`,
      delta: formatDelta(summaryA.sunPct, summaryB.sunPct, ' pp'),
    },
    {
      metric: 'Window Mean Tracking / Horiz Power',
      aVal: `${(summaryA.powerTrackingMeanPct ?? summaryA.sunPct).toFixed(1)}% / ${(summaryA.powerHorizontalMeanPct ?? 0).toFixed(1)}%`,
      bVal: `${(summaryB.powerTrackingMeanPct ?? summaryB.sunPct).toFixed(1)}% / ${(summaryB.powerHorizontalMeanPct ?? 0).toFixed(1)}%`,
      delta: formatDelta(
        summaryA.powerTrackingMeanPct ?? summaryA.sunPct,
        summaryB.powerTrackingMeanPct ?? summaryB.sunPct,
        ' pp',
      ),
    },
    {
      metric: `Window Earth DTE % (${earthMaskDeg.toFixed(0)}° Mask)`,
      aVal: `${summaryA.earthPct.toFixed(1)}%`,
      bVal: `${summaryB.earthPct.toFixed(1)}%`,
      delta: formatDelta(summaryA.earthPct, summaryB.earthPct, ' pp'),
    },
    {
      metric: 'Window Joint Sun + Earth %',
      aVal: `${summaryA.bothPct.toFixed(1)}%`,
      bVal: `${summaryB.bothPct.toFixed(1)}%`,
      delta: formatDelta(summaryA.bothPct, summaryB.bothPct, ' pp'),
    },
    {
      metric: 'Window Longest Dark Period',
      aVal: `${(summaryA.maxDarkHours / 24).toFixed(1)}d (${summaryA.maxDarkHours}h)`,
      bVal: `${(summaryB.maxDarkHours / 24).toFixed(1)}d (${summaryB.maxDarkHours}h)`,
      delta: formatDelta(summaryA.maxDarkHours, summaryB.maxDarkHours, 'h', 0),
    },
    {
      metric: '240 m Baseline Slope (not lander-scale)',
      aVal:
        hasTerrainA && siteA.local_slope_deg !== null
          ? `${siteA.local_slope_deg.toFixed(1)}° (${siteA.terrain_stats!.pct_safe_hls_le_5deg}% <=5°)`
          : 'n/a — no terrain data',
      bVal:
        hasTerrainB && siteB.local_slope_deg !== null
          ? `${siteB.local_slope_deg.toFixed(1)}° (${siteB.terrain_stats!.pct_safe_hls_le_5deg}% <=5°)`
          : 'n/a — no terrain data',
      delta: formatDelta(
        hasTerrainA ? siteA.local_slope_deg : null,
        hasTerrainB ? siteB.local_slope_deg : null,
        '°',
      ),
    },
    {
      metric: 'Baseline Viability Score (2m, Team Index)',
      aVal:
        siteA.metrics_2m.viability_score !== null
          ? `${siteA.metrics_2m.viability_score.toFixed(1)}/100`
          : 'n/a — no terrain data',
      bVal:
        siteB.metrics_2m.viability_score !== null
          ? `${siteB.metrics_2m.viability_score.toFixed(1)}/100`
          : 'n/a — no terrain data',
      delta: formatDelta(siteA.metrics_2m.viability_score, siteB.metrics_2m.viability_score, ' pts'),
    },
  ];

  return (
    <div role="region" aria-label="Scenario A vs Scenario B Comparison" className="space-y-4">
      {/* Header & Quick Demo Presets */}
      <section className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
              <GitCompare className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <span>Side-by-Side Scenario Comparison (Scenario A vs Scenario B)</span>
            </h2>
            <p className="mt-0.5 text-xs text-slate-300">
              Each scenario evaluates an independent (site or custom pin, UTC timestamp, mast height)
              through the same ephemeris and terrain horizon engine with its own local azimuth frame.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSphericalRef((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                showSphericalRef
                  ? 'border-sky-500/50 bg-sky-500/15 text-sky-200'
                  : 'border-slate-700 bg-slate-800 text-slate-300'
              }`}
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              Spherical Ref {showSphericalRef ? 'On' : 'Off'}
            </button>
            <button
              type="button"
              onClick={onSwapScenarios}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-100 transition hover:border-amber-400/50 hover:text-amber-200"
            >
              <ArrowLeftRight className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              Swap A &harr; B
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-300">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" /> Quick Presets:
          </span>
          {(
            [
              ['two_sites', 'Compare Two Sites (Same Date)'],
              ['slip_7d', 'Launch Slip (+7d)'],
              ['slip_14d', 'Launch Slip (+14d)'],
              ['seasonal', 'Seasonal Shift (Winter vs Summer)'],
              ['mast_2_vs_20', 'Mast Height (2 m vs 20 m)'],
            ] as Array<[ComparisonPresetId, string]>
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => onApplyPreset(id)}
              className="rounded-lg border border-slate-700 bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-400/60 hover:bg-sky-950/40 hover:text-sky-200"
            >
              {text}
            </button>
          ))}
        </div>

        {/* Scenario Config Cards */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ScenarioConfigCard
            label="Scenario A"
            accent="amber"
            site={siteA}
            customSite={customSiteA}
            sites={sites}
            timeIdx={timeIdxA}
            mastHeightM={mastHeightA}
            ephemeris={ephemeris}
            customPinLoading={customPinLoading}
            onSelectSite={onSelectSiteA}
            onProbeCoords={onProbeCoordsA}
            onChangeTime={onChangeTimeA}
            onChangeMast={onChangeMastA}
          />
          <ScenarioConfigCard
            label="Scenario B"
            accent="sky"
            site={siteB}
            customSite={customSiteB}
            sites={sites}
            timeIdx={timeIdxB}
            mastHeightM={mastHeightB}
            ephemeris={ephemeris}
            customPinLoading={customPinLoading}
            onSelectSite={onSelectSiteB}
            onProbeCoords={onProbeCoordsB}
            onChangeTime={onChangeTimeB}
            onChangeMast={onChangeMastB}
          />
        </div>
      </section>

      {/* Dual Independent HorizonSkyView Panoramas (CMP-1 / I4) */}
      <section className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
        <HorizonSkyView
          site={siteA}
          horizon360={horizonA}
          instant={instantA}
          summary={summaryA}
          mastHeightM={mastHeightA}
          label={`Scenario A — ${siteA.short_name}`}
          windowHours={windowHours}
          showSphericalRef={showSphericalRef}
        />
        <HorizonSkyView
          site={siteB}
          horizon360={horizonB}
          instant={instantB}
          summary={summaryB}
          mastHeightM={mastHeightB}
          label={`Scenario B — ${siteB.short_name}`}
          windowHours={windowHours}
          showSphericalRef={showSphericalRef}
        />
      </section>

      {/* Side-by-Side Metric Delta Table */}
      <section className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 shadow-lg space-y-3">
        <h3 className="text-sm font-semibold text-slate-100">
          Scenario Delta Matrix (Scenario B &minus; Scenario A)
        </h3>
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="bg-slate-950/90 text-xs font-semibold uppercase tracking-wide text-slate-300">
              <tr>
                <th className="px-3 py-2.5">Metric</th>
                <th className="px-3 py-2.5 text-amber-300">
                  Scenario A ({siteA.short_name} · {instantA.utcIso.slice(0, 16)})
                </th>
                <th className="px-3 py-2.5 text-sky-300">
                  Scenario B ({siteB.short_name} · {instantB.utcIso.slice(0, 16)})
                </th>
                <th className="px-3 py-2.5 text-right text-emerald-300">Delta (B &minus; A)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-900/45">
              {deltaRows.map((row) => (
                <tr key={row.metric} className="hover:bg-slate-800/45">
                  <td className="px-3 py-2.5 font-medium text-slate-200">{row.metric}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-200">{row.aVal}</td>
                  <td className="px-3 py-2.5 font-mono text-slate-200">{row.bVal}</td>
                  <td className="px-3 py-2.5 text-right font-mono font-semibold text-emerald-300">
                    {row.delta}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* UTC Operational Windows List (CMP-2) */}
      <section className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 shadow-lg space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Clock className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>UTC Operational Windows (Contiguous Intervals in Active Window)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Hourly resolution contiguous intervals extracted from the {windowHours}h mission window.
            </p>
          </div>
          <div
            role="group"
            aria-label="Operational window type"
            className="inline-flex rounded-xl border border-slate-700 bg-slate-950/80 p-1 text-xs"
          >
            {(
              [
                ['both', 'Joint Sun + Earth', <Sparkles key="b" className="h-3.5 w-3.5" />],
                ['sun', 'Sun Lit', <Sun key="s" className="h-3.5 w-3.5" />],
                ['earth', 'Earth DTE', <Radio key="e" className="h-3.5 w-3.5" />],
              ] as const
            ).map(([k, title, icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setWindowTab(k)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
                  windowTab === k
                    ? 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/50'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {icon}
                <span>{title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[
            { label: `Scenario A — ${siteA.short_name}`, accent: 'text-amber-300', items: windowsA, onJump: onChangeTimeA },
            { label: `Scenario B — ${siteB.short_name}`, accent: 'text-sky-300', items: windowsB, onJump: onChangeTimeB },
          ].map((col) => (
            <div key={col.label} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className={col.accent}>{col.label}</span>
                <span className="font-mono text-slate-400">{col.items.length} window(s)</span>
              </div>
              {col.items.length === 0 ? (
                <p className="py-3 text-xs text-slate-400">
                  No contiguous {windowTab === 'both' ? 'Joint Sun + Earth' : windowTab === 'sun' ? 'Sunlit' : 'Earth DTE'}{' '}
                  windows during this mission interval.
                </p>
              ) : (
                <ul className="max-h-60 space-y-1.5 overflow-y-auto pr-1">
                  {col.items.map((win) => (
                    <li
                      key={`${win.kind}-${win.startIdx}-${win.endIdx}`}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800/80 bg-slate-900/75 px-3 py-2 text-xs"
                    >
                      <div className="font-mono text-slate-200">
                        <div>{win.startUtc}</div>
                        <div className="text-slate-400">&rarr; {win.endUtc}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 font-mono font-semibold text-emerald-200">
                          {win.durationHours}h ({(win.durationHours / 24).toFixed(1)}d)
                        </span>
                        <button
                          type="button"
                          onClick={() => col.onJump(win.startIdx)}
                          className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs font-medium text-slate-200 hover:border-amber-400/50 hover:text-amber-200"
                        >
                          Jump
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

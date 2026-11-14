import React, { useEffect, useId, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  FastForward,
  Flame,
  Pause,
  Play,
  RadioTower,
  Sliders,
} from 'lucide-react';
import {
  DEFAULT_WINDOW_HOURS,
  LUNAR_DAY_HOURS,
  computeLaunchSensitivitySeries,
  computeSeasonalMarkers,
} from '../lib/lunarMath';
import type {
  ComputeOptions,
  EphemerisData,
  InstantMetrics,
  SeasonalMarker,
  SiteData,
  WindowSummary,
} from '../types/lunar';
import {
  buildTimelineAxisTicks,
  buildWindowAxisTicks,
  formatUtcDatePart,
  formatUtcIsoCompact,
  formatWindowDurationHeader,
  getEphemerisBounds,
  getUtcHourPart,
  parseUtcTimestampInput,
  seasonalMarkerDisplayName,
} from './timeline/timelineHelpers';

export interface MissionTimelineProps {
  ephemeris: EphemerisData;
  site: SiteData;
  horizon360: number[];
  timeIdx: number;
  setTimeIdx: React.Dispatch<React.SetStateAction<number>>;
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  playSpeedHours: number;
  setPlaySpeedHours: (h: number) => void;
  mastHeightM: number;
  setMastHeightM: (m: number) => void;
  isPolarDem: boolean;
  instant: InstantMetrics;
  summary: WindowSummary;
  /** Fixed mission window duration in hours (Q8 default: 336 = 14 days). */
  windowHours?: number;
  /** Optional calculation overrides (earthMaskDeg, windowHours, applyEclipses) per I5. */
  computeOptions?: ComputeOptions;
  /** Optional precomputed seasonal milestones (computed via computeSeasonalMarkers if omitted). */
  seasonalMarkers?: SeasonalMarker[];
}

type SensitivityMetric = 'both' | 'sun' | 'earth';

const TIME_SLIP_CONTROLS: Array<{ hours: number; label: string; ariaLabel: string }> = [
  { hours: -LUNAR_DAY_HOURS, label: '-1 Lunar (-709h)', ariaLabel: 'Step back 1 lunar day (-709 hours)' },
  { hours: -336, label: '-14d', ariaLabel: 'Step back 14 days' },
  { hours: -168, label: '-7d', ariaLabel: 'Step back 7 days' },
  { hours: -72, label: '-3d', ariaLabel: 'Step back 3 days' },
  { hours: -24, label: '-1d', ariaLabel: 'Step back 1 day' },
  { hours: 24, label: '+1d', ariaLabel: 'Step forward 1 day' },
  { hours: 72, label: '+3d', ariaLabel: 'Step forward 3 days' },
  { hours: 168, label: '+7d', ariaLabel: 'Step forward 7 days' },
  { hours: 336, label: '+14d', ariaLabel: 'Step forward 14 days' },
  { hours: LUNAR_DAY_HOURS, label: '+1 Lunar (+709h)', ariaLabel: 'Step forward 1 lunar day (+709 hours)' },
];

export const MissionTimeline: React.FC<MissionTimelineProps> = ({
  ephemeris,
  site,
  horizon360,
  timeIdx,
  setTimeIdx,
  isPlaying,
  setIsPlaying,
  playSpeedHours,
  setPlaySpeedHours,
  mastHeightM,
  setMastHeightM,
  isPolarDem,
  instant,
  summary,
  windowHours = DEFAULT_WINDOW_HOURS,
  computeOptions,
  seasonalMarkers,
}) => {
  const rawUid = useId();
  const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, '') || 'tl';
  const partialHatchId = `partialHatch-${uid}`;
  const shadowHatchId = `shadowHatch-${uid}`;
  const eclipseHatchId = `eclipseHatch-${uid}`;

  const effectiveWindowHours = computeOptions?.windowHours ?? windowHours ?? DEFAULT_WINDOW_HOURS;
  const dtHours = ephemeris.dt_hours || 1;
  const bounds = useMemo(
    () => getEphemerisBounds(ephemeris.t0_utc, ephemeris.n, dtHours),
    [ephemeris.t0_utc, ephemeris.n, dtHours],
  );
  const maxIdx = bounds.maxIdx;

  const currentDateStr = useMemo(
    () => formatUtcDatePart(ephemeris.t0_utc, timeIdx, dtHours),
    [ephemeris.t0_utc, timeIdx, dtHours],
  );
  const currentUtcHour = useMemo(
    () => getUtcHourPart(ephemeris.t0_utc, timeIdx, dtHours),
    [ephemeris.t0_utc, timeIdx, dtHours],
  );

  const [utcDraft, setUtcDraft] = useState<string>(currentDateStr);
  const [dateFeedback, setDateFeedback] = useState<{ kind: 'error' | 'warning'; text: string } | null>(
    null,
  );
  const [sensMetric, setSensMetric] = useState<SensitivityMetric>('both');
  const [sensCursorIdx, setSensCursorIdx] = useState<number | null>(null);
  const [windowCursorOffset, setWindowCursorOffset] = useState<number>(0);

  useEffect(() => {
    setUtcDraft(currentDateStr);
  }, [currentDateStr]);

  useEffect(() => {
    if (summary.points.length > 0 && windowCursorOffset >= summary.points.length) {
      setWindowCursorOffset(0);
    }
  }, [summary.points.length, windowCursorOffset]);

  const sensitivityBins = useMemo(() => {
    if (!ephemeris || !site || horizon360.length === 0) return [];
    return computeLaunchSensitivitySeries(
      ephemeris,
      site,
      horizon360,
      168,
      effectiveWindowHours,
      computeOptions,
    );
  }, [ephemeris, site, horizon360, effectiveWindowHours, computeOptions]);

  const resolvedSeasonalMarkers = useMemo(() => {
    if (seasonalMarkers && seasonalMarkers.length > 0) return seasonalMarkers;
    return computeSeasonalMarkers(ephemeris);
  }, [seasonalMarkers, ephemeris]);

  const axisTicks = useMemo(
    () => buildTimelineAxisTicks(ephemeris.t0_utc, ephemeris.n, dtHours, 5),
    [ephemeris.t0_utc, ephemeris.n, dtHours],
  );

  const activeBinPos = useMemo(() => {
    if (sensitivityBins.length === 0) return 0;
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < sensitivityBins.length; i++) {
      const d = Math.abs(sensitivityBins[i].idx - timeIdx);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, [sensitivityBins, timeIdx]);

  const effectiveSensBinPos =
    sensCursorIdx !== null && sensCursorIdx >= 0 && sensCursorIdx < sensitivityBins.length
      ? sensCursorIdx
      : activeBinPos;
  const inspectedBin = sensitivityBins[effectiveSensBinPos] ?? null;

  const shiftHours = (dh: number) => {
    setDateFeedback(null);
    setTimeIdx(Math.max(0, Math.min(maxIdx, timeIdx + dh)));
  };

  const commitUtcInput = (rawText: string, hourOverride?: number) => {
    const res = parseUtcTimestampInput(
      rawText,
      hourOverride ?? currentUtcHour,
      ephemeris.t0_utc,
      ephemeris.n,
      dtHours,
    );
    if (!res.ok) {
      setDateFeedback({ kind: 'error', text: res.error });
      return;
    }
    setTimeIdx(res.idx);
    setUtcDraft(formatUtcDatePart(ephemeris.t0_utc, res.idx, dtHours));
    if (res.clamped && res.warning) {
      setDateFeedback({ kind: 'warning', text: res.warning });
    } else {
      setDateFeedback(null);
    }
  };

  const handleHourChange = (newHour: number) => {
    const safeHour = Math.max(0, Math.min(23, newHour));
    commitUtcInput(currentDateStr, safeHour);
  };

  const handleSensitivityKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (sensitivityBins.length === 0) return;
    const last = sensitivityBins.length - 1;
    let nextPos: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      nextPos = Math.min(last, effectiveSensBinPos + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      nextPos = Math.max(0, effectiveSensBinPos - 1);
    } else if (e.key === 'PageUp') {
      nextPos = Math.min(last, effectiveSensBinPos + 4);
    } else if (e.key === 'PageDown') {
      nextPos = Math.max(0, effectiveSensBinPos - 4);
    } else if (e.key === 'Home') {
      nextPos = 0;
    } else if (e.key === 'End') {
      nextPos = last;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const target = sensitivityBins[effectiveSensBinPos];
      if (target) {
        setDateFeedback(null);
        setTimeIdx(target.idx);
      }
      return;
    }
    if (nextPos !== null) {
      e.preventDefault();
      setSensCursorIdx(nextPos);
    }
  };

  const handleWindowStripKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const pts = summary.points;
    if (pts.length === 0) return;
    const last = pts.length - 1;
    const step = e.shiftKey ? 12 : 1;
    let nextOffset: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      nextOffset = Math.min(last, windowCursorOffset + step);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      nextOffset = Math.max(0, windowCursorOffset - step);
    } else if (e.key === 'PageUp') {
      nextOffset = Math.min(last, windowCursorOffset + 24);
    } else if (e.key === 'PageDown') {
      nextOffset = Math.max(0, windowCursorOffset - 24);
    } else if (e.key === 'Home') {
      nextOffset = 0;
    } else if (e.key === 'End') {
      nextOffset = last;
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      const targetPt = pts[windowCursorOffset];
      if (targetPt) {
        setDateFeedback(null);
        setTimeIdx(targetPt.idx);
      }
      return;
    }
    if (nextOffset !== null) {
      e.preventDefault();
      setWindowCursorOffset(nextOffset);
    }
  };

  const handleSvgPointerSelect = (
    e: React.PointerEvent<SVGSVGElement>,
    count: number,
    onSelectPos: (pos: number) => void,
  ) => {
    if (count <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const frac = Math.max(0, Math.min(0.999999, (e.clientX - rect.left) / rect.width));
    onSelectPos(Math.floor(frac * count));
  };

  const requestedWindowHours = summary.windowHoursRequested ?? effectiveWindowHours;
  const availableWindowHours = summary.windowHoursAvailable ?? summary.points.length;
  const windowHeader = formatWindowDurationHeader(requestedWindowHours, availableWindowHours);
  const windowAxisTicks = useMemo(
    () => buildWindowAxisTicks(availableWindowHours),
    [availableWindowHours],
  );

  const inspectedWindowPt =
    summary.points[Math.min(windowCursorOffset, Math.max(0, summary.points.length - 1))] ?? null;
  const inspectedWindowUtc = inspectedWindowPt
    ? formatUtcIsoCompact(ephemeris.t0_utc, inspectedWindowPt.idx, dtHours)
    : instant.utcIso;

  const significantSeasonalMilestones = useMemo(
    () =>
      resolvedSeasonalMarkers.filter(
        (m) =>
          m.kind === 'summer_solstice' ||
          m.kind === 'winter_solstice' ||
          m.kind === 'equinox',
      ),
    [resolvedSeasonalMarkers],
  );

  const reqWindowDays = requestedWindowHours / 24;
  const reqWindowDaysText = Number.isInteger(reqWindowDays)
    ? `${reqWindowDays}-Day`
    : `${requestedWindowHours}h`;
  const ephemerisMonths = Math.max(1, Math.round(ephemeris.n / 730));

  return (
    <section
      aria-label="Mission time and mast controls"
      className="nasa-panel min-w-0 space-y-3 rounded-2xl p-4 shadow-2xl"
    >
      {/* Top Row: Playback, Symmetric Time-Slip, Mast / Antenna Height */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            aria-label={isPlaying ? 'Pause simulation' : 'Start simulation'}
            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            {isPlaying ? 'Pause' : 'Simulate'}
          </button>

          <select
            id="play-speed-select"
            name="play-speed-select"
            aria-label="Simulation speed in hours per tick"
            value={playSpeedHours}
            onChange={(e) => setPlaySpeedHours(Number.parseInt(e.target.value, 10))}
            className="min-h-8 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 font-mono text-xs text-amber-300 focus:border-amber-400 focus:outline-none"
          >
            <option value={1}>1h/tick</option>
            <option value={6}>6h/tick</option>
            <option value={24}>24h/tick</option>
          </select>

          <div className="flex flex-wrap items-center gap-1 text-xs">
            <span className="mr-1 flex items-center gap-1 text-xs text-slate-300">
              <FastForward className="h-3.5 w-3.5 text-amber-400" /> Time Slip:
            </span>
            {TIME_SLIP_CONTROLS.map((ctrl) => (
              <button
                key={ctrl.label}
                type="button"
                aria-label={ctrl.ariaLabel}
                onClick={() => shiftHours(ctrl.hours)}
                className="min-h-7 rounded border border-slate-700 bg-slate-800/80 px-2 py-1 font-mono text-xs text-slate-200 transition hover:border-amber-500/50 hover:text-amber-300"
              >
                {ctrl.label}
              </button>
            ))}
          </div>
        </div>

        {/* Mast / Antenna Height Control (SCI-4: unlocked for ALL sites) */}
        <div className="nasa-panel-subtle flex flex-wrap items-center gap-2.5 rounded-xl px-3 py-1.5">
          <RadioTower className="h-4 w-4 text-sky-400" />
          <label htmlFor="mast-height-slider" className="text-xs text-slate-300">
            Mast Height:{' '}
            <span className="font-mono font-semibold text-sky-300">{mastHeightM.toFixed(1)} m</span>
          </label>
          <input
            id="mast-height-slider"
            name="mast-height-slider"
            aria-label="Mast and antenna height in meters"
            type="range"
            min={0.5}
            max={50}
            step={0.5}
            value={mastHeightM}
            onChange={(e) => setMastHeightM(parseFloat(e.target.value))}
            className="min-h-7 w-28 cursor-pointer accent-sky-400 sm:w-32"
            title={
              isPolarDem
                ? 'Adjust solar panel and antenna height above regolith (0.5 m to 50 m)'
                : 'Adjust mast height (0.5 m to 50 m) — changes spherical horizon dip -acos(R/(R+h))'
            }
          />
          <div className="flex items-center gap-1">
            {[2, 10, 20].map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={`Set mast height to ${preset} meters`}
                onClick={() => setMastHeightM(preset)}
                className={`min-h-7 rounded px-2 py-1 font-mono text-xs transition ${
                  Math.abs(mastHeightM - preset) < 0.3
                    ? 'bg-sky-500/25 text-sky-200 ring-1 ring-sky-500/50'
                    : 'bg-slate-800 text-slate-300 hover:text-slate-100'
                }`}
              >
                {preset}m
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Explicit UTC Date + UTC Hour Controls & 26-Month Scrubber (TIME-3) */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2 font-mono text-slate-100">
            <CalendarClock className="h-4 w-4 text-amber-400" />
            <span className="font-semibold text-amber-200">{instant.utcIso}</span>
            <label htmlFor="utc-date-input" className="text-xs text-slate-400">
              UTC Date:
            </label>
            <input
              id="utc-date-input"
              name="utc-date-input"
              type="text"
              inputMode="numeric"
              value={utcDraft}
              onChange={(e) => setUtcDraft(e.target.value)}
              onBlur={() => {
                if (utcDraft !== currentDateStr) {
                  commitUtcInput(utcDraft);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitUtcInput(utcDraft);
                }
              }}
              aria-label="UTC date (YYYY-MM-DD or ISO UTC timestamp)"
              placeholder="YYYY-MM-DD"
              className="min-h-7 w-32 rounded border border-slate-700 bg-slate-950 px-2 py-1 text-xs text-amber-200 focus:border-amber-400 focus:outline-none"
            />
            <select
              id="utc-hour-select"
              name="utc-hour-select"
              aria-label="UTC hour (00 to 23)"
              value={currentUtcHour}
              onChange={(e) => handleHourChange(Number.parseInt(e.target.value, 10))}
              className="min-h-7 rounded border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-amber-200 focus:border-amber-400 focus:outline-none"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, '0')}:00 UTC
                </option>
              ))}
            </select>
          </div>

          <span className="font-mono text-xs text-slate-300">
            {bounds.startDate} &rarr; {bounds.endDate} UTC (Step {timeIdx.toLocaleString('en-US')} /{' '}
            {maxIdx.toLocaleString('en-US')} h)
          </span>
        </div>

        {dateFeedback && (
          <div
            role={dateFeedback.kind === 'error' ? 'alert' : 'status'}
            className={`rounded border px-2.5 py-1.5 text-xs ${
              dateFeedback.kind === 'error'
                ? 'border-rose-500/50 bg-rose-950/40 text-rose-200'
                : 'border-amber-500/40 bg-amber-950/35 text-amber-200'
            }`}
          >
            {dateFeedback.text}
          </div>
        )}

        <input
          id="time-step-slider"
          name="time-step-slider"
          aria-label="Mission UTC hour scrubber"
          type="range"
          min={0}
          max={maxIdx}
          step={1}
          value={timeIdx}
          onChange={(e) => {
            setDateFeedback(null);
            setTimeIdx(parseInt(e.target.value, 10));
          }}
          className="min-h-7 w-full cursor-pointer py-1 accent-amber-400"
        />
      </div>

      {/* Multi-Month Launch Date Sensitivity Strip (SCI-5, UX-2) */}
      {sensitivityBins.length > 0 && (
        <div className="space-y-2 rounded-xl border border-sky-500/20 bg-[#030612]/90 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-1.5 font-medium text-slate-100">
              <Flame className="h-3.5 w-3.5 text-amber-400" />
              {ephemerisMonths}-Month Launch Sensitivity ({reqWindowDaysText} Window by Launch Week)
            </span>
            <select
              id="sensitivity-metric-select"
              name="sensitivity-metric-select"
              aria-label="Launch sensitivity metric"
              value={sensMetric}
              onChange={(e) => setSensMetric(e.target.value as SensitivityMetric)}
              className="min-h-7 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-emerald-300 focus:border-amber-400 focus:outline-none"
            >
              <option value="both">Joint Sun + Earth (%)</option>
              <option value="sun">Solar Disk Mean (%)</option>
              <option value="earth">Earth DTE (%)</option>
            </select>
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Launch sensitivity week scrubber"
            aria-valuemin={0}
            aria-valuemax={Math.max(0, sensitivityBins.length - 1)}
            aria-valuenow={effectiveSensBinPos}
            aria-valuetext={
              inspectedBin
                ? `Launch ${inspectedBin.utcShort}: Sun ${inspectedBin.sunPct}%, Earth ${inspectedBin.earthPct}%, Joint ${inspectedBin.bothPct}%, Max Night ${inspectedBin.maxDarkDays} days. Press Enter to jump.`
                : 'No sensitivity bins'
            }
            onKeyDown={handleSensitivityKeyDown}
            className="rounded border border-slate-800/90 bg-slate-950 p-1 focus:border-amber-400 focus:outline-none"
          >
            <svg
              viewBox="0 0 1000 54"
              preserveAspectRatio="none"
              className="h-11 w-full cursor-pointer select-none"
              onPointerDown={(e) =>
                handleSvgPointerSelect(e, sensitivityBins.length, (pos) => {
                  const target = sensitivityBins[pos];
                  if (target) {
                    setSensCursorIdx(pos);
                    setDateFeedback(null);
                    setTimeIdx(target.idx);
                  }
                })
              }
              onPointerMove={(e) => {
                if (e.buttons !== 1) return;
                handleSvgPointerSelect(e, sensitivityBins.length, (pos) => {
                  const target = sensitivityBins[pos];
                  if (target) {
                    setSensCursorIdx(pos);
                    setDateFeedback(null);
                    setTimeIdx(target.idx);
                  }
                });
              }}
            >
              {/* 70% reference guide */}
              <line
                x1={0}
                x2={1000}
                y1={54 - 0.7 * 40}
                y2={54 - 0.7 * 40}
                stroke="rgba(148, 163, 184, 0.2)"
                strokeDasharray="4 4"
                strokeWidth="1"
              />

              {/* Weekly Bars */}
              {sensitivityBins.map((b, i) => {
                const barW = 1000 / sensitivityBins.length;
                const x = i * barW;
                const val =
                  sensMetric === 'sun' ? b.sunPct : sensMetric === 'earth' ? b.earthPct : b.bothPct;
                const h = Math.max(4, (val / 100) * 40);
                const y = 54 - h;
                const isActive = i === activeBinPos;
                const isCursor = i === effectiveSensBinPos;

                const fill = isActive
                  ? '#f43f5e'
                  : sensMetric === 'sun'
                    ? val >= 75
                      ? '#fbbf24'
                      : val >= 40
                        ? '#d97706'
                        : '#334155'
                    : sensMetric === 'earth'
                      ? val >= 75
                        ? '#38bdf8'
                        : val >= 40
                          ? '#0284c7'
                          : '#334155'
                      : val >= 70
                        ? '#10b981'
                        : val >= 35
                          ? '#0d9488'
                          : '#334155';

                return (
                  <g key={b.idx}>
                    <rect
                      x={x + 0.5}
                      y={y}
                      width={Math.max(1.5, barW - 1.2)}
                      height={h}
                      rx="1"
                      fill={fill}
                      stroke={isCursor ? '#f8fafc' : undefined}
                      strokeWidth={isCursor ? 1.5 : 0}
                    />
                  </g>
                );
              })}

              {/* True Seasonal Markers along top track (SCI-5) */}
              {significantSeasonalMilestones.map((m) => {
                const x = maxIdx > 0 ? (m.idx / maxIdx) * 1000 : 0;
                const color =
                  m.kind === 'summer_solstice'
                    ? '#fbbf24'
                    : m.kind === 'winter_solstice'
                      ? '#60a5fa'
                      : '#34d399';
                const path =
                  m.kind === 'summer_solstice'
                    ? `M${x},2 L${x - 5},11 L${x + 5},11 Z`
                    : m.kind === 'winter_solstice'
                      ? `M${x},11 L${x - 5},2 L${x + 5},2 Z`
                      : `M${x},1 L${x + 4.5},6.5 L${x},12 L${x - 4.5},6.5 Z`;
                return (
                  <g
                    key={`${m.kind}-${m.idx}`}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setDateFeedback(null);
                      setTimeIdx(m.idx);
                    }}
                  >
                    <title>{`${seasonalMarkerDisplayName(m)}: ${m.utcIso} (Subsolar Lat ${m.subsolarLatDeg.toFixed(2)}°)`}</title>
                    <line
                      x1={x}
                      x2={x}
                      y1={11}
                      y2={54}
                      stroke={color}
                      strokeOpacity="0.4"
                      strokeDasharray="2 2"
                    />
                    <path d={path} fill={color} />
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Data-Driven X-Axis Date Ticks (SCI-5) */}
          <div className="flex justify-between font-mono text-xs text-slate-400">
            {axisTicks.map((t) => (
              <span key={t.idx}>{t.monthLabel}</span>
            ))}
          </div>

          {/* Inspected Launch Week Summary + Computed Seasonal Milestones */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
            {inspectedBin && (
              <span className="font-mono text-slate-200">
                Week {inspectedBin.utcShort}: Sun {inspectedBin.sunPct}% · Earth{' '}
                {inspectedBin.earthPct}% · Joint {inspectedBin.bothPct}% · Max Dark{' '}
                {inspectedBin.maxDarkDays}d
              </span>
            )}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-amber-300">
                ▲ Southern Summer Peak:{' '}
                {significantSeasonalMilestones
                  .filter((m) => m.kind === 'summer_solstice')
                  .map((m) => formatUtcDatePart(ephemeris.t0_utc, m.idx, dtHours))
                  .join(', ') || 'None in span'}
              </span>
              <span className="text-sky-300">
                ▼ Winter Peak:{' '}
                {significantSeasonalMilestones
                  .filter((m) => m.kind === 'winter_solstice')
                  .map((m) => formatUtcDatePart(ephemeris.t0_utc, m.idx, dtHours))
                  .join(', ') || 'None in span'}
              </span>
              <span className="text-emerald-300">
                ◆ Equinoxes:{' '}
                {significantSeasonalMilestones.filter((m) => m.kind === 'equinox').length}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 14-Day Mission Window Strips (UX-2, TIME-1, Q9) */}
      <div className="space-y-2 rounded-xl border border-sky-500/20 bg-[#030612]/90 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5 font-medium text-slate-100">
            <Sliders className="h-3.5 w-3.5 text-amber-400" />
            <span>{windowHeader.title}</span>
            {windowHeader.isTruncated && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-200 ring-1 ring-amber-500/40">
                <AlertTriangle className="h-3.5 w-3.5" /> {windowHeader.truncationNote}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs">
            <span className="text-amber-300">Sun: {summary.sunPct.toFixed(1)}%</span>
            <span className="text-sky-300">Earth DTE: {summary.earthPct.toFixed(1)}%</span>
            <span className="text-emerald-300">Joint: {summary.bothPct.toFixed(1)}%</span>
            <span className="text-rose-300">Max Dark: {(summary.maxDarkHours / 24).toFixed(1)}d</span>
          </div>
        </div>

        {/* Non-Color Accessible Pattern & Symbol Legend */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-300">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-xs bg-amber-400" aria-hidden="true" />
            ■ Full Tracking Output (&gt;75%)
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-xs border border-amber-400 bg-amber-700/70"
              aria-hidden="true"
            />
            ▨ Partial / Grazing (1–75%)
          </span>
          <span className="inline-flex items-center gap-1">
            <span
              className="inline-block h-3 w-3 rounded-xs border border-slate-600 bg-slate-800"
              aria-hidden="true"
            />
            □ Shadow (0%)
          </span>
          <span className="inline-flex items-center gap-1 text-sky-300">● Earth in View</span>
          <span className="inline-flex items-center gap-1 text-emerald-300">◆ Joint Sun + Earth</span>
        </div>

        {/* 3 Single-SVG Accessible Strip Scrubbers (total 3 Tab stops) */}
        <div className="space-y-2">
          {[
            {
              key: 'solar',
              label: 'Solar Disk / Tracking Panel Relative Output (%)',
              shortLabel: 'Tracking %',
              colorClass: 'text-amber-300',
              describePoint: (pt: WindowSummary['points'][number]) => {
                const pct = pt.powerTrackingPct ?? pt.sunFrac * 100;
                const ecNote =
                  pt.eclipseObscuredFrac && pt.eclipseObscuredFrac > 0
                    ? ` (Eclipse ${(pt.eclipseObscuredFrac * 100).toFixed(0)}% obscured)`
                    : '';
                return `Solar Tracking Panel ${pct.toFixed(0)}%${ecNote}`;
              },
              renderSvgBar: (pt: WindowSummary['points'][number], x: number, barW: number) => {
                const pct = pt.powerTrackingPct ?? pt.sunFrac * 100;
                const isEclipsed = (pt.eclipseObscuredFrac ?? 0) > 0;
                const fill = isEclipsed
                  ? `url(#${eclipseHatchId})`
                  : pct > 75
                    ? '#fbbf24'
                    : pct > 0.5
                      ? `url(#${partialHatchId})`
                      : `url(#${shadowHatchId})`;
                const h = pct > 75 ? 28 : pct > 0.5 ? 18 : 28;
                const y = 28 - h;
                return (
                  <rect
                    key={pt.idx}
                    x={x}
                    y={y}
                    width={Math.max(1, barW)}
                    height={h}
                    fill={fill}
                  />
                );
              },
            },
            {
              key: 'earth',
              label: 'Earth DTE Visibility',
              shortLabel: 'Earth DTE',
              colorClass: 'text-sky-300',
              describePoint: (pt: WindowSummary['points'][number]) =>
                `Earth ${pt.earthVis ? 'In View' : 'Below Horizon'}`,
              renderSvgBar: (pt: WindowSummary['points'][number], x: number, barW: number) => (
                <rect
                  key={pt.idx}
                  x={x}
                  y={pt.earthVis ? 0 : 12}
                  width={Math.max(1, barW)}
                  height={pt.earthVis ? 28 : 16}
                  fill={pt.earthVis ? '#38bdf8' : `url(#${shadowHatchId}-earth)`}
                />
              ),
            },
            {
              key: 'joint',
              label: 'Joint Sun + Earth Ops',
              shortLabel: 'Joint Ops',
              colorClass: 'text-emerald-300',
              describePoint: (pt: WindowSummary['points'][number]) =>
                `Joint Ops ${pt.bothVis ? 'Active' : 'Inactive'}`,
              renderSvgBar: (pt: WindowSummary['points'][number], x: number, barW: number) => (
                <rect
                  key={pt.idx}
                  x={x}
                  y={pt.bothVis ? 0 : 12}
                  width={Math.max(1, barW)}
                  height={pt.bothVis ? 28 : 16}
                  fill={pt.bothVis ? '#10b981' : `url(#${shadowHatchId}-joint)`}
                />
              ),
            },
          ].map((band) => {
            const pts = summary.points;
            const nPts = pts.length;
            const safeOffset = Math.min(windowCursorOffset, Math.max(0, nPts - 1));
            const curPt = pts[safeOffset];
            const curUtc = curPt
              ? formatUtcIsoCompact(ephemeris.t0_utc, curPt.idx, dtHours)
              : instant.utcIso;
            const cursorX = nPts > 0 ? ((safeOffset + 0.5) / nPts) * 1000 : 0;
            const bandShadowId = band.key === 'solar' ? shadowHatchId : `${shadowHatchId}-${band.key}`;

            return (
              <div key={band.key} className="space-y-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className={`font-mono text-xs font-semibold ${band.colorClass}`}>
                    {band.label}
                  </span>
                </div>
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label={`${band.label} scrubber`}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(0, nPts - 1)}
                  aria-valuenow={safeOffset}
                  aria-valuetext={
                    curPt
                      ? `+${curPt.offsetHours}h (${curUtc}): ${band.describePoint(curPt)}. Press Enter to jump.`
                      : 'No points'
                  }
                  onKeyDown={handleWindowStripKeyDown}
                  className="relative h-7 w-full overflow-hidden rounded border border-slate-800 bg-slate-900 focus:border-amber-400 focus:outline-none"
                >
                  <svg
                    viewBox="0 0 1000 28"
                    preserveAspectRatio="none"
                    className="h-full w-full cursor-pointer select-none"
                    onPointerDown={(e) =>
                      handleSvgPointerSelect(e, nPts, (pos) => {
                        const targetPt = pts[pos];
                        if (targetPt) {
                          setWindowCursorOffset(pos);
                          setDateFeedback(null);
                          setTimeIdx(targetPt.idx);
                        }
                      })
                    }
                    onPointerMove={(e) => {
                      if (e.buttons !== 1) return;
                      handleSvgPointerSelect(e, nPts, (pos) => {
                        const targetPt = pts[pos];
                        if (targetPt) {
                          setWindowCursorOffset(pos);
                          setDateFeedback(null);
                          setTimeIdx(targetPt.idx);
                        }
                      });
                    }}
                  >
                    <defs>
                      {band.key === 'solar' && (
                        <>
                          <pattern
                            id={partialHatchId}
                            width="6"
                            height="6"
                            patternUnits="userSpaceOnUse"
                            patternTransform="rotate(45)"
                          >
                            <rect width="6" height="6" fill="#b45309" />
                            <line x1="0" y1="0" x2="0" y2="6" stroke="#fbbf24" strokeWidth="2.5" />
                          </pattern>
                          <pattern
                            id={eclipseHatchId}
                            width="6"
                            height="6"
                            patternUnits="userSpaceOnUse"
                            patternTransform="rotate(-45)"
                          >
                            <rect width="6" height="6" fill="#991b1b" />
                            <line x1="0" y1="0" x2="0" y2="6" stroke="#f87171" strokeWidth="2.5" />
                          </pattern>
                        </>
                      )}
                      <pattern
                        id={bandShadowId}
                        width="8"
                        height="8"
                        patternUnits="userSpaceOnUse"
                        patternTransform="rotate(45)"
                      >
                        <rect width="8" height="8" fill="#0f172a" />
                        <line x1="0" y1="0" x2="0" y2="8" stroke="#334155" strokeWidth="1.5" />
                      </pattern>
                    </defs>

                    {pts.map((pt, i) => {
                      const barW = 1000 / Math.max(1, nPts);
                      return band.renderSvgBar(pt, i * barW, barW);
                    })}

                    {/* Scrubber cursor needle */}
                    {nPts > 0 && (
                      <line
                        x1={cursorX}
                        x2={cursorX}
                        y1={0}
                        y2={28}
                        stroke="#f8fafc"
                        strokeWidth="2"
                      />
                    )}
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        {/* Inspected Offset Readout + Dynamic Axis Ticks */}
        {inspectedWindowPt && (
          <div className="font-mono text-xs text-slate-300">
            Cursor +{inspectedWindowPt.offsetHours}h ({inspectedWindowUtc}): Tracking Panel{' '}
            {(
              inspectedWindowPt.powerTrackingPct ?? inspectedWindowPt.sunFrac * 100
            ).toFixed(0)}
            % · Earth {inspectedWindowPt.earthVis ? 'In View' : 'Blocked'} · Joint{' '}
            {inspectedWindowPt.bothVis ? 'Active' : 'Inactive'} (Arrow keys inspect, Enter or
            click jumps)
          </div>
        )}

        <div className="flex justify-between font-mono text-xs text-slate-400">
          {windowAxisTicks.map((t) => (
            <span key={t.offsetHours}>{t.label}</span>
          ))}
        </div>
      </div>
    </section>
  );
};

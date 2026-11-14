import React, { useEffect, useId, useMemo, useState } from 'react';
import { Eye, Mountain, Radar, ZoomIn } from 'lucide-react';
import {
  SUN_RADIUS_DEG,
  horizonAtAz,
  sphericalHorizonDipDeg,
} from '../lib/lunarMath';
import type { InstantMetrics, SiteData, WindowSummary } from '../types/lunar';
import {
  computeBodyPixelRadii,
  computeSkyElevationBounds,
  describeHorizonSubtitle,
  formatHorizonHoverInfo,
} from './timeline/skyHelpers';

export interface HorizonSkyViewProps {
  site: SiteData;
  horizon360: number[];
  instant: InstantMetrics;
  summary: WindowSummary;
  mastHeightM: number;
  /** Optional header badge label (e.g. "Scenario A", "Scenario B", or site name) for side-by-side layouts (I4). */
  label?: string;
  /** Requested mission window duration in hours (default 336). */
  windowHours?: number;
  /** Optional controlled/initial toggle for the spherical reference line (UX-6). */
  showSphericalRef?: boolean;
  /** Optional callback when spherical reference line visibility is toggled. */
  onToggleSphericalRef?: (next: boolean) => void;
  /** @deprecated I4: Cross-site horizon overlay removed (azimuth frames differ by site). Never rendered. */
  compareSite?: SiteData | null;
  /** @deprecated I4: Cross-site horizon overlay removed (azimuth frames differ by site). Never rendered. */
  compareHorizon360?: number[] | null;
}

type ViewMode = 'panorama' | 'dome';

export const HorizonSkyView: React.FC<HorizonSkyViewProps> = ({
  site,
  horizon360,
  instant,
  summary,
  mastHeightM,
  label,
  windowHours = 336,
  showSphericalRef,
  onToggleSphericalRef,
}) => {
  const rawUid = useId();
  const uid = rawUid.replace(/[^a-zA-Z0-9_-]/g, '') || 'sky';
  const skyGradId = `skyGrad-${uid}`;
  const regolithGradId = `regolithGrad-${uid}`;
  const plotClipId = `plotClip-${uid}`;
  const domeClipId = `domeClip-${uid}`;

  const [viewMode, setViewMode] = useState<ViewMode>('panorama');
  const [polarZoom, setPolarZoom] = useState<boolean>(false);
  const [internalSphericalRef, setInternalSphericalRef] = useState<boolean>(
    showSphericalRef ?? true,
  );
  const [hoverAz, setHoverAz] = useState<number | null>(null);

  useEffect(() => {
    if (showSphericalRef !== undefined) {
      setInternalSphericalRef(showSphericalRef);
    }
  }, [showSphericalRef]);

  const isControlledSpherical =
    showSphericalRef !== undefined && onToggleSphericalRef !== undefined;
  const sphericalRefVisible = isControlledSpherical ? showSphericalRef : internalSphericalRef;

  const handleToggleSpherical = () => {
    const next = !sphericalRefVisible;
    if (!isControlledSpherical) {
      setInternalSphericalRef(next);
    }
    onToggleSphericalRef?.(next);
  };

  const sphericalDipDeg = useMemo(() => sphericalHorizonDipDeg(mastHeightM), [mastHeightM]);

  const { minEl, maxEl, yTicks, minorTicks } = useMemo(
    () => computeSkyElevationBounds(horizon360, summary.points, polarZoom),
    [horizon360, summary.points, polarZoom],
  );

  const W = 840;
  const H = 310;
  const padL = 52;
  const padR = 20;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const azToX = (az: number) => padL + (az / 360) * plotW;
  const elToY = (el: number) => padT + ((maxEl - el) / Math.max(1, maxEl - minEl)) * plotH;

  const terrainPath = useMemo(() => {
    const pts: string[] = [];
    for (let az = 0; az < 360; az++) {
      const h = horizon360[az] ?? 0;
      pts.push(`${az === 0 ? 'M' : 'L'}${azToX(az).toFixed(1)},${elToY(h).toFixed(1)}`);
    }
    pts.push(`L${azToX(360).toFixed(1)},${elToY(horizon360[0] ?? 0).toFixed(1)}`);
    pts.push(`L${azToX(360).toFixed(1)},${(padT + plotH).toFixed(1)}`);
    pts.push(`L${azToX(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`);
    return pts.join(' ');
  }, [horizon360, maxEl, minEl]);

  const terrainStroke = useMemo(() => {
    const pts: string[] = [];
    for (let az = 0; az < 360; az++) {
      const h = horizon360[az] ?? 0;
      pts.push(`${az === 0 ? 'M' : 'L'}${azToX(az).toFixed(1)},${elToY(h).toFixed(1)}`);
    }
    pts.push(`L${azToX(360).toFixed(1)},${elToY(horizon360[0] ?? 0).toFixed(1)}`);
    return pts.join(' ');
  }, [horizon360, maxEl, minEl]);

  const buildWrappedPath = (coords: Array<{ az: number; el: number }>) => {
    const segments: string[] = [];
    let current = '';
    for (let i = 0; i < coords.length; i++) {
      const c = coords[i];
      const x = azToX(c.az).toFixed(1);
      const y = elToY(c.el).toFixed(1);
      if (i === 0 || Math.abs(c.az - coords[i - 1].az) > 120) {
        if (current) segments.push(current);
        current = `M${x},${y}`;
      } else {
        current += ` L${x},${y}`;
      }
    }
    if (current) segments.push(current);
    return segments;
  };

  const sunSegments = useMemo(
    () => buildWrappedPath(summary.points.map((p) => ({ az: p.sunAz, el: p.sunEl }))),
    [summary.points, maxEl, minEl],
  );
  const earthSegments = useMemo(
    () => buildWrappedPath(summary.points.map((p) => ({ az: p.earthAz, el: p.earthEl }))),
    [summary.points, maxEl, minEl],
  );

  const radii = useMemo(
    () =>
      computeBodyPixelRadii(
        plotH,
        minEl,
        maxEl,
        instant.earthDistKm,
        instant.eclipseData?.earthAngularRadiusDeg,
        SUN_RADIUS_DEG,
      ),
    [plotH, minEl, maxEl, instant.earthDistKm, instant.eclipseData?.earthAngularRadiusDeg],
  );

  // Polar Sky Dome geometry (Zenith 90° at center -> -15° at rim)
  const domeR = 122;
  const domeCx = 160;
  const domeCy = 160;
  const elToDomeR = (el: number) => ((90 - Math.max(-15, Math.min(90, el))) / 105) * domeR;
  const azElToDomeXY = (az: number, el: number): [number, number] => {
    const r = elToDomeR(el);
    const rad = (az * Math.PI) / 180;
    return [domeCx + r * Math.sin(rad), domeCy - r * Math.cos(rad)];
  };

  const domeMaskPath = useMemo(() => {
    const outerR = domeR;
    const outer = `M ${domeCx} ${domeCy - outerR} A ${outerR} ${outerR} 0 1 1 ${domeCx - 0.01} ${domeCy - outerR} Z`;
    const innerPts: string[] = [];
    for (let az = 0; az < 360; az += 2) {
      const [x, y] = azElToDomeXY(az, horizon360[az] ?? 0);
      innerPts.push(`${az === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`);
    }
    innerPts.push('Z');
    return `${outer} ${innerPts.join(' ')}`;
  }, [horizon360]);

  const hoverInfo = useMemo(() => {
    if (hoverAz === null) return null;
    const hz = horizonAtAz(hoverAz, horizon360);
    const baseInfo = formatHorizonHoverInfo(
      hoverAz,
      horizon360,
      site.blocking_dist_km,
      site.terrain_source,
    );
    return {
      ...baseInfo,
      horizonElDeg: hz,
      text:
        baseInfo.distKm !== null
          ? `Az ${baseInfo.az}° · Horizon ${hz.toFixed(2)}° · Ridge @ ${baseInfo.distKm.toFixed(1)} km`
          : `Az ${baseInfo.az}° · Spherical Horizon ${hz.toFixed(2)}° (no local DEM)`,
    };
  }, [hoverAz, horizon360, site.blocking_dist_km, site.terrain_source]);

  const availableHours = summary.windowHoursAvailable ?? summary.points.length ?? windowHours;
  const subtitleText = describeHorizonSubtitle(site, mastHeightM, sphericalDipDeg, availableHours);

  const sunX = azToX(instant.sunAzDeg);
  const sunY = elToY(instant.sunElDeg);
  const earthX = azToX(instant.earthAzDeg);
  const earthY = elToY(instant.earthElDeg);

  const sunLabelLeft = instant.sunAzDeg > 280;
  const earthLabelLeft = instant.earthAzDeg > 280;
  const clampLabelY = (rawY: number) => Math.max(padT + 16, Math.min(padT + plotH - 8, rawY));

  const dipY = elToY(sphericalDipDeg);
  const dipVisibleInRange = sphericalDipDeg >= minEl && sphericalDipDeg <= maxEl;

  return (
    <section
      aria-label={`Sky view for ${site.short_name}${label ? ` (${label})` : ''}`}
      className="nasa-panel min-w-0 rounded-2xl p-4 shadow-2xl"
    >
      <div className="mb-2.5 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Mountain className="h-4 w-4 shrink-0 text-amber-400" />
            {label && (
              <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-xs font-semibold text-amber-200 ring-1 ring-amber-500/40">
                {label}
              </span>
            )}
            <h2 className="text-sm font-semibold text-slate-100">
              {viewMode === 'panorama'
                ? `360° Horizon Panorama — ${site.short_name}`
                : `Polar Sky Dome — ${site.short_name}`}
            </h2>
            <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-xs text-amber-300">
              Mast {mastHeightM.toFixed(1)} m
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">{subtitleText}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode('panorama')}
            aria-pressed={viewMode === 'panorama'}
            className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === 'panorama'
                ? 'bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/40'
                : 'bg-slate-800 text-slate-300 hover:text-slate-100'
            }`}
          >
            <Eye className="h-3.5 w-3.5" /> 360° Panorama
          </button>
          <button
            type="button"
            onClick={() => setViewMode('dome')}
            aria-pressed={viewMode === 'dome'}
            className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
              viewMode === 'dome'
                ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                : 'bg-slate-800 text-slate-300 hover:text-slate-100'
            }`}
          >
            <Radar className="h-3.5 w-3.5" /> Sky Dome
          </button>
          {viewMode === 'panorama' && (
            <>
              <button
                type="button"
                onClick={() => setPolarZoom((z) => !z)}
                aria-pressed={polarZoom}
                className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  polarZoom
                    ? 'bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/40'
                    : 'bg-slate-800 text-slate-300 hover:text-slate-100'
                }`}
                title="Zoom elevation axis to ±5° around the lunar horizon"
              >
                <ZoomIn className="h-3.5 w-3.5" /> ±5° Horizon Zoom
              </button>
              <button
                type="button"
                onClick={handleToggleSpherical}
                aria-pressed={sphericalRefVisible}
                className={`inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition ${
                  sphericalRefVisible
                    ? 'bg-slate-700 text-slate-100 ring-1 ring-slate-500'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle smooth-sphere horizon dip reference line"
              >
                Spherical Ref
              </button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'panorama' ? (
        <div className="relative rounded-xl border border-sky-500/25 bg-[#030610] p-1.5 shadow-inner">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`360 degree lunar horizon panorama for ${site.name}. Sun at azimuth ${instant.sunAzDeg.toFixed(1)} degrees, elevation ${instant.sunElDeg.toFixed(2)} degrees; Earth at azimuth ${instant.earthAzDeg.toFixed(1)} degrees, elevation ${instant.earthElDeg.toFixed(2)} degrees.`}
            className="h-auto w-full select-none touch-pan-y"
            onPointerDown={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width <= 0) return;
              const relX = ((e.clientX - rect.left) / rect.width) * W;
              if (relX >= padL && relX <= W - padR) {
                setHoverAz(Math.max(0, Math.min(359, Math.round(((relX - padL) / plotW) * 360))));
              }
            }}
            onPointerMove={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              if (rect.width <= 0) return;
              const relX = ((e.clientX - rect.left) / rect.width) * W;
              if (relX >= padL && relX <= W - padR) {
                setHoverAz(Math.max(0, Math.min(359, Math.round(((relX - padL) / plotW) * 360))));
              } else {
                setHoverAz(null);
              }
            }}
            onPointerLeave={() => setHoverAz(null)}
          >
            <defs>
              <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#030714" />
                <stop offset="65%" stopColor="#09132a" />
                <stop offset="100%" stopColor="#122142" />
              </linearGradient>
              <linearGradient id={regolithGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#475569" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#080e1f" stopOpacity="0.98" />
              </linearGradient>
              <clipPath id={plotClipId}>
                <rect x={padL} y={padT} width={plotW} height={plotH} rx="4" />
              </clipPath>
            </defs>

            {/* Sky Backdrop */}
            <rect
              x={padL}
              y={padT}
              width={plotW}
              height={plotH}
              fill={`url(#${skyGradId})`}
              rx="4"
            />

            {/* Minor Elevation Grid (1° lines in ±5° zoom mode) */}
            {polarZoom &&
              minorTicks.map((v) => {
                const y = elToY(v);
                return (
                  <line
                    key={`minor-${v}`}
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    stroke="rgba(148, 163, 184, 0.1)"
                    strokeWidth="1"
                  />
                );
              })}

            {/* Y Axis Elevation Grid & Labels (>= 12px) */}
            {yTicks.map((v) => {
              const y = elToY(v);
              const isZero = v === 0;
              return (
                <g key={v}>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={y}
                    y2={y}
                    stroke={isZero ? 'rgba(248, 250, 252, 0.3)' : 'rgba(148, 163, 184, 0.16)'}
                    strokeDasharray={isZero ? '4 4' : '2 3'}
                    strokeWidth={isZero ? 1.2 : 1}
                  />
                  <text
                    x={padL - 8}
                    y={y + 4}
                    textAnchor="end"
                    fill={isZero ? '#e2e8f0' : '#94a3b8'}
                    fontSize="12"
                    fontFamily="monospace"
                  >
                    {v}°
                  </text>
                </g>
              );
            })}

            {/* X Cardinal Azimuth Ticks (>= 12px) */}
            {[
              [0, '0° N'],
              [90, '90° E'],
              [180, '180° S'],
              [270, '270° W'],
              [360, '360° N'],
            ].map(([az, tickLabel]) => {
              const x = azToX(az as number);
              return (
                <g key={String(tickLabel)}>
                  <line
                    x1={x}
                    x2={x}
                    y1={padT}
                    y2={padT + plotH}
                    stroke="rgba(148, 163, 184, 0.15)"
                    strokeWidth="1"
                  />
                  <text
                    x={x}
                    y={H - 10}
                    textAnchor={az === 0 ? 'start' : az === 360 ? 'end' : 'middle'}
                    fill="#94a3b8"
                    fontSize="12"
                    fontFamily="monospace"
                  >
                    {tickLabel}
                  </text>
                </g>
              );
            })}

            {/* Clipped Sky Contents (Tracks, Terrain, Spherical Dip, True-Scale Disks) */}
            <g clipPath={`url(#${plotClipId})`}>
              {/* Orbital Tracks over mission window */}
              {earthSegments.map((d, i) => (
                <path
                  key={`et-${i}`}
                  d={d}
                  fill="none"
                  stroke="#38bdf8"
                  strokeOpacity="0.55"
                  strokeWidth="2"
                />
              ))}
              {sunSegments.map((d, i) => (
                <path
                  key={`st-${i}`}
                  d={d}
                  fill="none"
                  stroke="#fbbf24"
                  strokeOpacity="0.7"
                  strokeWidth="2.2"
                />
              ))}

              {/* Terrain / Spherical Horizon Silhouette */}
              <path d={terrainPath} fill={`url(#${regolithGradId})`} />
              <path d={terrainStroke} fill="none" stroke="#94a3b8" strokeWidth="1.6" />

              {/* Spherical Reference Line (UX-6: Dip = -acos(R/(R+h))) */}
              {sphericalRefVisible && dipVisibleInRange && (
                <g>
                  <line
                    x1={padL}
                    x2={W - padR}
                    y1={dipY}
                    y2={dipY}
                    stroke="#38bdf8"
                    strokeOpacity="0.75"
                    strokeDasharray="6 4"
                    strokeWidth="1.4"
                  />
                  <text
                    x={W - padR - 6}
                    y={Math.max(padT + 14, dipY - 5)}
                    textAnchor="end"
                    fill="#bae6fd"
                    fontSize="12"
                    fontFamily="monospace"
                  >
                    Sphere Ref ({sphericalDipDeg.toFixed(3)}°)
                  </text>
                </g>
              )}

              {/* True-Scale Earth Disk (~0.95° angular radius) + Targeting Reticle Ring */}
              <g>
                <circle
                  cx={earthX}
                  cy={earthY}
                  r={radii.earthRadiusPx}
                  fill={instant.earthVisible ? '#0284c7' : 'rgba(56, 189, 248, 0.22)'}
                  stroke={instant.earthVisible ? '#bae6fd' : '#64748b'}
                  strokeWidth={1.5}
                />
                <circle
                  cx={earthX}
                  cy={earthY}
                  r={radii.earthReticlePx}
                  fill="none"
                  stroke={instant.earthVisible ? '#7dd3fc' : '#64748b'}
                  strokeWidth={1.2}
                  strokeDasharray="3 2"
                />
              </g>

              {/* True-Scale Sun Disk (0.266° angular radius / 0.53° diameter) + Targeting Reticle Ring */}
              <g>
                {instant.sunVisible && !instant.activeEclipse && (
                  <circle
                    cx={sunX}
                    cy={sunY}
                    r={radii.sunRadiusPx * 1.9}
                    fill="rgba(251, 191, 36, 0.24)"
                  />
                )}
                <circle
                  cx={sunX}
                  cy={sunY}
                  r={radii.sunRadiusPx}
                  fill={
                    instant.activeEclipse
                      ? '#ef4444'
                      : instant.sunVisible
                        ? '#fbbf24'
                        : 'rgba(251, 191, 36, 0.25)'
                  }
                  stroke={instant.sunVisible ? '#fef08a' : '#f59e0b'}
                  strokeWidth={1.2}
                />
                <circle
                  cx={sunX}
                  cy={sunY}
                  r={radii.sunReticlePx}
                  fill="none"
                  stroke={
                    instant.activeEclipse
                      ? '#f87171'
                      : instant.sunVisible
                        ? '#fde047'
                        : '#f59e0b'
                  }
                  strokeWidth={1.25}
                  strokeDasharray="3 2"
                />
              </g>

              {/* Interactive Hover Crosshair */}
              {hoverInfo && (
                <g>
                  <line
                    x1={azToX(hoverInfo.az)}
                    x2={azToX(hoverInfo.az)}
                    y1={padT}
                    y2={padT + plotH}
                    stroke="rgba(248, 250, 252, 0.5)"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={azToX(hoverInfo.az)}
                    cy={elToY(hoverInfo.horizonElDeg)}
                    r={4}
                    fill="#f8fafc"
                  />
                </g>
              )}
            </g>

            {/* Unclipped Body Annotations with Clamped Coordinates (>= 12px) */}
            <text
              x={earthLabelLeft ? earthX - radii.earthReticlePx - 5 : earthX + radii.earthReticlePx + 5}
              y={clampLabelY(earthY + 4)}
              textAnchor={earthLabelLeft ? 'end' : 'start'}
              fill="#7dd3fc"
              fontSize="12"
              fontWeight="bold"
            >
              Earth ({instant.earthElDeg.toFixed(1)}°)
            </text>
            <text
              x={sunLabelLeft ? sunX - radii.sunReticlePx - 5 : sunX + radii.sunReticlePx + 5}
              y={clampLabelY(sunY - 6)}
              textAnchor={sunLabelLeft ? 'end' : 'start'}
              fill={instant.activeEclipse ? '#fca5a5' : instant.sunVisible ? '#fde047' : '#f59e0b'}
              fontSize="12"
              fontWeight="bold"
            >
              {instant.activeEclipse
                ? 'Sun (ECLIPSE)'
                : `Sun (${(instant.sunDiskFrac * 100).toFixed(0)}%)`}
            </text>
          </svg>

          {hoverInfo && (
            <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-slate-700 bg-slate-950/95 px-2.5 py-1 font-mono text-xs text-slate-100 shadow">
              {hoverInfo.text}
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 items-center gap-4 rounded-xl border border-sky-500/25 bg-[#030610] p-3.5 sm:grid-cols-[320px_1fr]">
          <svg
            viewBox="0 0 320 320"
            role="img"
            aria-label={`Polar sky dome zenith projection for ${site.name}`}
            className="mx-auto h-72 w-72 select-none"
          >
            <defs>
              <clipPath id={domeClipId}>
                <circle cx={domeCx} cy={domeCy} r={domeR} />
              </clipPath>
            </defs>
            <circle
              cx={domeCx}
              cy={domeCy}
              r={domeR}
              fill="#0b1326"
              stroke="#334155"
              strokeWidth="1.5"
            />
            {[60, 30, 0].map((el) => {
              const r = elToDomeR(el);
              return (
                <g key={el}>
                  <circle
                    cx={domeCx}
                    cy={domeCy}
                    r={r}
                    fill="none"
                    stroke={el === 0 ? 'rgba(248,250,252,0.35)' : 'rgba(148,163,184,0.22)'}
                    strokeDasharray={el === 0 ? '4 3' : '2 3'}
                  />
                  <text
                    x={domeCx + 4}
                    y={domeCy - r + 13}
                    fill="#94a3b8"
                    fontSize="12"
                    fontFamily="monospace"
                  >
                    {el}°
                  </text>
                </g>
              );
            })}

            <g clipPath={`url(#${domeClipId})`}>
              <path d={domeMaskPath} fill="rgba(51, 65, 85, 0.72)" fillRule="evenodd" />
              <polyline
                fill="none"
                stroke="#38bdf8"
                strokeOpacity="0.6"
                strokeWidth="1.8"
                points={summary.points
                  .map((p) => azElToDomeXY(p.earthAz, p.earthEl).map((v) => v.toFixed(1)).join(','))
                  .join(' ')}
              />
              <polyline
                fill="none"
                stroke="#fbbf24"
                strokeOpacity="0.7"
                strokeWidth="2"
                points={summary.points
                  .map((p) => azElToDomeXY(p.sunAz, p.sunEl).map((v) => v.toFixed(1)).join(','))
                  .join(' ')}
              />

              {(() => {
                const [sx, sy] = azElToDomeXY(instant.sunAzDeg, instant.sunElDeg);
                const [ex, ey] = azElToDomeXY(instant.earthAzDeg, instant.earthElDeg);
                return (
                  <>
                    <circle
                      cx={ex}
                      cy={ey}
                      r={4.5}
                      fill={instant.earthVisible ? '#0284c7' : 'rgba(56, 189, 248, 0.25)'}
                      stroke={instant.earthVisible ? '#bae6fd' : '#64748b'}
                      strokeWidth="1.5"
                    />
                    <circle
                      cx={ex}
                      cy={ey}
                      r={9}
                      fill="none"
                      stroke={instant.earthVisible ? '#7dd3fc' : '#64748b'}
                      strokeDasharray="3 2"
                      strokeWidth="1.2"
                    />
                    <circle
                      cx={sx}
                      cy={sy}
                      r={3.5}
                      fill={
                        instant.activeEclipse
                          ? '#ef4444'
                          : instant.sunVisible
                            ? '#fbbf24'
                            : 'rgba(251, 191, 36, 0.25)'
                      }
                      stroke={instant.sunVisible ? '#fef08a' : '#f59e0b'}
                      strokeWidth="1.4"
                    />
                    <circle
                      cx={sx}
                      cy={sy}
                      r={9}
                      fill="none"
                      stroke={instant.sunVisible ? '#fde047' : '#f59e0b'}
                      strokeDasharray="3 2"
                      strokeWidth="1.2"
                    />
                  </>
                );
              })()}
            </g>

            <text x={domeCx} y={18} textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="bold">
              N (0°)
            </text>
            <text x={domeCx} y={310} textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="bold">
              S (180°)
            </text>
            <text x={302} y={domeCy + 4} textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="bold">
              E
            </text>
            <text x={18} y={domeCy + 4} textAnchor="middle" fill="#cbd5e1" fontSize="12" fontWeight="bold">
              W
            </text>
          </svg>

          <div className="space-y-2.5 text-xs text-slate-300">
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5">
              <div className="font-semibold text-amber-300">How to read the Polar Sky Dome</div>
              <p className="mt-1 leading-relaxed text-slate-300">
                Center = directly overhead (Zenith 90°). The shaded outer collar shows{' '}
                {site.terrain_source === 'NONE'
                  ? 'the spherical smooth horizon boundary below 0°.'
                  : 'lunar ridges and crater rims blocking low-angle sunlight and Earth line of sight.'}
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 font-mono text-xs sm:grid-cols-2">
              <div className="rounded bg-slate-900/80 p-2">
                <div className="text-slate-400">Sun Position</div>
                <div className="text-amber-300">
                  Az {instant.sunAzDeg.toFixed(1)}° / El {instant.sunElDeg.toFixed(2)}°
                </div>
                <div className="text-slate-400">
                  {site.terrain_source === 'NONE' ? 'Spherical' : 'Terrain'}{' '}
                  {instant.sunHorizonElDeg.toFixed(2)}°
                </div>
              </div>
              <div className="rounded bg-slate-900/80 p-2">
                <div className="text-slate-400">Earth Position</div>
                <div className="text-sky-300">
                  Az {instant.earthAzDeg.toFixed(1)}° / El {instant.earthElDeg.toFixed(2)}°
                </div>
                <div className="text-slate-400">
                  Dist {Math.round(instant.earthDistKm).toLocaleString('en-US')} km
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Angular Scale & Terrain vs Smooth Sphere Reference Footer (MAP-7, UX-6) */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
        <span>
          True disk scale: Sun 0.53° dia · Earth {(radii.earthAngularRadiusDeg * 2).toFixed(2)}° dia
          (dashed reticles aid targeting)
        </span>
        {site.terrain_source !== 'NONE' ? (
          <span className="font-mono text-slate-300">
            Terrain vs Smooth Sphere (2 m):{' '}
            {(site.metrics_2m.sun_time_pct ?? site.metrics_2m.sun_visible_pct).toFixed(1)}% lit hrs
            vs {site.metrics_2m.sun_no_terrain_pct.toFixed(1)}% sphere
          </span>
        ) : (
          <span className="font-mono text-slate-300">
            Smooth sphere dip: {sphericalDipDeg.toFixed(3)}° @ {mastHeightM.toFixed(1)} m mast
          </span>
        )}
      </div>
    </section>
  );
};

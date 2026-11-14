import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Columns2,
  Compass,
  Crosshair,
  Database,
  Download,
  ExternalLink,
  GitCompare,
  Globe2,
  Info,
  Layers,
  Loader2,
  Map as MapIcon,
  MapPin,
  Mountain,
  Orbit,
  Radio,
  Rocket,
  Share2,
  Sparkles,
  Sun,
  Table2,
  X,
} from 'lucide-react';
import { AboutModal } from './components/AboutModal';
import { CandidateFinderPanel } from './components/CandidateFinderPanel';
import { GlossaryTerm } from './components/GlossaryTerm';
import { HorizonSkyView } from './components/HorizonSkyView';
import { LearnModal } from './components/LearnModal';
import { Lunar3DViewport, type SurfaceOverlayLayer } from './components/Lunar3DViewport';
import { MissionTimeline } from './components/MissionTimeline';
import { PolarMapCanvas } from './components/PolarMapCanvas';
import {
  type ComparisonPresetId,
  ScenarioComparePanel,
} from './components/ScenarioComparePanel';
import { SiteComparisonTable } from './components/SiteComparisonTable';
import {
  buildMarkdownBrief,
  formatCountdown,
  formatSiteElevation,
  formatTerrainSourceLabel,
  missionStatusMeta,
  parseAndValidateUrlParams,
} from './components/appHelpers';
import { candidateToSiteData } from './lib/candidates';
import {
  buildCustomLatLonSite,
  buildCustomPolarSite,
  computeCustomPolarHorizon,
  computeInstantAndWindow,
  computeSeasonalMarkers,
  decodeDemPatch,
  DEFAULT_WINDOW_HOURS,
  ECLIPSE_ASSUMPTION_TEXT,
  interpolateHorizon,
  loadClientDemBundle,
  POWER_ASSUMPTION_TEXT,
  RISE_SET_DEFINITION_TEXT,
  sphericalHorizonDipDeg,
  xyKm2ll,
} from './lib/lunarMath';
import {
  computeRoverLiveTelemetry,
  computeRoverPitchRoll,
  createInitialRoverState,
  getCachedRoverHorizon360,
  sampleTerrainHeightAndNormal,
  type RoverHorizonCacheEntry,
  type RoverLiveTelemetry,
  type RoverState,
  type TerrainCameraMode,
} from './lib/roverPhysics';
import { findCuratedSiteNear, normalizeSites, SCORE_FORMULA_TEXT } from './lib/scoring';
import type {
  ArtemisRegion,
  ArtemisRegionsDataset,
  ClientDemBundle,
  ComputeOptions,
  DecodedDemPatch,
  EphemerisData,
  PolarDemPatchRaw,
  PolarMapsData,
  SiteCandidate,
  SiteCandidatesData,
  SiteData,
  SitesDataset,
} from './types/lunar';

type CosmicWorkspaceView = 'surface3d' | 'split' | 'map2d' | 'compare' | 'directory';
type MissionDockTab = 'timeline' | 'sky' | 'traverse';

// Default initial timestamp index (2027-06-25 16:00 UTC: Connecting Ridge illuminated + Earth DTE clear)
const DEFAULT_TIME_IDX = 5368;
const DEFAULT_SITE_ID = 'connecting_ridge';
const DEFAULT_COMPARE_SITE_ID = 'malapert_summit';
const DEFAULT_MAST_HEIGHT_M = 2.0;
const WINDOW_DURATION_OPTIONS = [
  { hours: 72, label: '72h (3d)' },
  { hours: 168, label: '168h (7d)' },
  { hours: 336, label: '336h (14d)' },
  { hours: 720, label: '720h (30d)' },
];
const VERTICAL_EXAGGERATION_OPTIONS = [1, 3, 6, 10, 15] as const;

function getAppBaseUrl(): string {
  const meta = import.meta as unknown as { env?: { BASE_URL?: string } };
  return meta.env?.BASE_URL || './';
}

function buildDataUrl(fileName: string, version?: string): string {
  const base = getAppBaseUrl();
  const cleanBase = base.endsWith('/') ? base : `${base}/`;
  const cleanFile = fileName.replace(/^\/+/, '');
  const path = cleanFile.startsWith('data/')
    ? `${cleanBase}${cleanFile}`
    : `${cleanBase}data/${cleanFile}`;
  return version ? `${path}?v=${encodeURIComponent(version)}` : path;
}

function getEffectiveHorizon360(
  site: SiteData,
  mastHeightM: number,
  demPatch: DecodedDemPatch | null,
  clientDem: ClientDemBundle | null,
): number[] {
  if (
    site.isCustom &&
    site.is_polar_dem &&
    site.polar_x_km !== null &&
    site.polar_y_km !== null &&
    (clientDem || demPatch) &&
    Math.abs(mastHeightM - 2.0) > 1e-6
  ) {
    return computeCustomPolarHorizon(
      clientDem ?? demPatch!,
      site.polar_x_km,
      site.polar_y_km,
      mastHeightM,
    );
  }
  if (site.terrain_source === 'NONE' && site.isCustom && Math.abs(mastHeightM - 2.0) > 1e-6) {
    const dip = Number(sphericalHorizonDipDeg(mastHeightM).toFixed(4));
    return new Array<number>(360).fill(dip);
  }
  return interpolateHorizon(site, mastHeightM);
}

interface CircularRingGaugeProps {
  valuePct: number | null;
  centerPrimary: string;
  centerSecondary?: string;
  strokeColor: string;
  trackColor?: string;
  glowClass?: string;
}

const CircularRingGauge: React.FC<CircularRingGaugeProps> = ({
  valuePct,
  centerPrimary,
  centerSecondary,
  strokeColor,
  trackColor = 'rgba(148, 163, 184, 0.18)',
}) => {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const clamped =
    valuePct !== null && Number.isFinite(valuePct) ? Math.max(0, Math.min(100, valuePct)) : 0;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
      <svg viewBox="0 0 84 84" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle
          cx="42"
          cy="42"
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth="6.5"
        />
        {valuePct !== null && (
          <circle
            cx="42"
            cy="42"
            r={radius}
            fill="none"
            stroke={strokeColor}
            strokeWidth="6.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            className="transition-all duration-500 ease-out"
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-base font-bold leading-none text-slate-50">
          {centerPrimary}
        </span>
        {centerSecondary && (
          <span className="mt-1 font-mono text-xs leading-none text-slate-400">
            {centerSecondary}
          </span>
        )}
      </div>
    </div>
  );
};

interface RoverTraverseProfileProps {
  roverState: RoverState;
  roverTelemetry: RoverLiveTelemetry;
  selectedSite: SiteData;
  onDeployToSelected: () => void;
}

const RoverTraverseProfile: React.FC<RoverTraverseProfileProps> = ({
  roverState,
  roverTelemetry,
  selectedSite,
  onDeployToSelected,
}) => {
  const { samples, totalDistKm, minElev, maxElev, elevDeltaM } = useMemo(() => {
    const rawTrail =
      roverState.trail.length > 0
        ? roverState.trail
        : [{ xKm: roverState.xKm, yKm: roverState.yKm, elevM: roverState.elevM }];

    let cumDist = 0;
    const pts = rawTrail.map((pt, idx) => {
      if (idx > 0) {
        const prev = rawTrail[idx - 1];
        cumDist += Math.hypot(pt.xKm - prev.xKm, pt.yKm - prev.yKm);
      }
      return {
        distKm: cumDist,
        elevM: pt.elevM,
        xKm: pt.xKm,
        yKm: pt.yKm,
      };
    });

    let lo = Infinity;
    let hi = -Infinity;
    for (const p of pts) {
      if (p.elevM < lo) lo = p.elevM;
      if (p.elevM > hi) hi = p.elevM;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = roverState.elevM - 100;
      hi = roverState.elevM + 100;
    }
    if (hi - lo < 40) {
      const mid = (lo + hi) * 0.5;
      lo = mid - 20;
      hi = mid + 20;
    }

    const delta = pts.length >= 2 ? pts[pts.length - 1].elevM - pts[0].elevM : 0;
    return {
      samples: pts,
      totalDistKm: cumDist,
      minElev: lo,
      maxElev: hi,
      elevDeltaM: delta,
    };
  }, [roverState.elevM, roverState.trail, roverState.xKm, roverState.yKm]);

  const W = 860;
  const H = 220;
  const padL = 62;
  const padR = 24;
  const padT = 22;
  const padB = 34;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const xSpan = Math.max(0.25, totalDistKm);
  const ySpan = Math.max(1, maxElev - minElev);

  const toX = (dKm: number) => padL + (dKm / xSpan) * plotW;
  const toY = (eM: number) => padT + ((maxElev - eM) / ySpan) * plotH;

  const linePath = samples
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${toX(p.distKm).toFixed(1)},${toY(p.elevM).toFixed(1)}`)
    .join(' ');
  const areaPath =
    samples.length > 0
      ? `${linePath} L${toX(samples[samples.length - 1].distKm).toFixed(1)},${(padT + plotH).toFixed(1)} L${toX(samples[0].distKm).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
      : '';
  const lastSample = samples[samples.length - 1];

  return (
    <section
      aria-label="Rover traverse elevation profile"
      className="nasa-panel rounded-2xl p-4 shadow-2xl"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Activity className="h-4 w-4 text-cyan-300" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-slate-100">
            Rover Traverse Elevation Profile (LOLA DEM)
          </h2>
          <span className="rounded-full border border-cyan-500/35 bg-cyan-500/10 px-2.5 py-0.5 font-mono text-xs text-cyan-200">
            {roverState.distanceTraveledKm.toFixed(2)} km Odometer
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-mono text-slate-300">
            Current Elev:{' '}
            <strong className="text-slate-50">
              {Math.round(roverTelemetry.elevM).toLocaleString('en-US')} m
            </strong>
          </span>
          <span className="font-mono text-slate-300">
            Net Delta:{' '}
            <strong className={elevDeltaM >= 0 ? 'text-emerald-300' : 'text-amber-300'}>
              {elevDeltaM >= 0 ? '+' : ''}
              {Math.round(elevDeltaM).toLocaleString('en-US')} m
            </strong>
          </span>
          <button
            type="button"
            onClick={onDeployToSelected}
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-500/25"
          >
            <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Reset Traverse at {selectedSite.short_name}</span>
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-sky-500/20 bg-[#030714] p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          role="img"
          aria-label={`Rover traverse elevation profile covering ${roverState.distanceTraveledKm.toFixed(2)} kilometers, current elevation ${Math.round(roverTelemetry.elevM)} meters`}
          className="h-auto w-full select-none"
        >
          <defs>
            <linearGradient id="traverseElevGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.04" />
            </linearGradient>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const elev = minElev + f * ySpan;
            const y = toY(elev);
            return (
              <g key={f}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="rgba(148, 163, 184, 0.16)"
                  strokeDasharray="3 4"
                />
                <text
                  x={padL - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="12"
                  fontFamily="monospace"
                >
                  {Math.round(elev).toLocaleString('en-US')}m
                </text>
              </g>
            );
          })}

          {[0, 0.25, 0.5, 0.75, 1].map((f) => {
            const dist = f * xSpan;
            const x = toX(dist);
            return (
              <g key={`x-${f}`}>
                <line
                  x1={x}
                  x2={x}
                  y1={padT}
                  y2={padT + plotH}
                  stroke="rgba(148, 163, 184, 0.12)"
                />
                <text
                  x={x}
                  y={H - 10}
                  textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
                  fill="#94a3b8"
                  fontSize="12"
                  fontFamily="monospace"
                >
                  {dist.toFixed(1)} km
                </text>
              </g>
            );
          })}

          {samples.length >= 2 && (
            <>
              <path d={areaPath} fill="url(#traverseElevGrad)" />
              <path
                d={linePath}
                fill="none"
                stroke="#38bdf8"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            </>
          )}

          {lastSample && (
            <g>
              <circle
                cx={toX(lastSample.distKm)}
                cy={toY(lastSample.elevM)}
                r="7"
                fill="rgba(56, 189, 248, 0.28)"
              />
              <circle
                cx={toX(lastSample.distKm)}
                cy={toY(lastSample.elevM)}
                r="4"
                fill="#fbbf24"
                stroke="#f8fafc"
                strokeWidth="1.5"
              />
            </g>
          )}
        </svg>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
        <span>
          {samples.length < 2
            ? 'Drive the rover with WASD / Arrow keys or click terrain in the 3D viewport to trace a lunar traverse profile.'
            : `Showing ${samples.length} sampled DEM path points across ${totalDistKm.toFixed(2)} km trail segment.`}
        </span>
        <span className="font-mono text-slate-200">
          Pitch {roverState.pitchDeg >= 0 ? '+' : ''}
          {roverState.pitchDeg.toFixed(1)}° · Roll {roverState.rollDeg >= 0 ? '+' : ''}
          {roverState.rollDeg.toFixed(1)}° · Slope {roverTelemetry.slopeDeg.toFixed(1)}°
        </span>
      </div>
    </section>
  );
};

export function App(): React.ReactElement {
  // Core loaded datasets
  const [sites, setSites] = useState<SiteData[]>([]);
  const [ephemeris, setEphemeris] = useState<EphemerisData | null>(null);
  const [artemisRegions, setArtemisRegions] = useState<ArtemisRegion[]>([]);
  const [demPatch, setDemPatch] = useState<DecodedDemPatch | null>(null);
  const [polarMaps, setPolarMaps] = useState<PolarMapsData | null>(null);
  const [dataVersion, setDataVersion] = useState<string>('v2');
  const [dataGeneratedUtc, setDataGeneratedUtc] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Lazy-loaded heavy datasets (I2 / DATA-1 / WP7)
  const [clientDem, setClientDem] = useState<ClientDemBundle | null>(null);
  const clientDemRef = useRef<ClientDemBundle | null>(null);
  const [customPinLoading, setCustomPinLoading] = useState<boolean>(false);
  const [demLoadError, setDemLoadError] = useState<string | null>(null);
  const demPromiseRef = useRef<Promise<ClientDemBundle | null> | null>(null);

  const [candidatesData, setCandidatesData] = useState<SiteCandidatesData | null>(null);
  const [candidatesLoading, setCandidatesLoading] = useState<boolean>(false);
  const [candidatesError, setCandidatesError] = useState<string | null>(null);
  const candidatesPromiseRef = useRef<Promise<SiteCandidatesData | null> | null>(null);

  // Primary Scenario A state
  const [selectedSiteId, setSelectedSiteId] = useState<string>(DEFAULT_SITE_ID);
  const [customSiteA, setCustomSiteA] = useState<SiteData | null>(null);
  const [timeIdx, setTimeIdx] = useState<number>(DEFAULT_TIME_IDX);
  const [mastHeightM, setMastHeightM] = useState<number>(DEFAULT_MAST_HEIGHT_M);

  // Scenario B comparison state
  const [compareSiteId, setCompareSiteId] = useState<string | null>(DEFAULT_COMPARE_SITE_ID);
  const [customSiteB, setCustomSiteB] = useState<SiteData | null>(null);
  const [compareTimeIdx, setCompareTimeIdx] = useState<number>(DEFAULT_TIME_IDX);
  const [compareMastHeightM, setCompareMastHeightM] = useState<number>(DEFAULT_MAST_HEIGHT_M);
  const [compareIndependentControls, setCompareIndependentControls] = useState<boolean>(false);

  // 3D Simulator & Rover state
  const [roverState, setRoverState] = useState<RoverState | null>(null);
  const [cameraMode, setCameraMode] = useState<TerrainCameraMode>('chase');
  const [surfaceLayer, setSurfaceLayer] = useState<SurfaceOverlayLayer>('regolith');
  const [verticalExaggeration, setVerticalExaggeration] = useState<number>(6);
  const roverHorizonCacheRef = useRef<RoverHorizonCacheEntry | null>(null);

  // Shared cosmic workspace & UI controls
  const [activeView, setActiveView] = useState<CosmicWorkspaceView>('surface3d');
  const [missionDockTab, setMissionDockTab] = useState<MissionDockTab>('timeline');
  const [scienceNotesOpen, setScienceNotesOpen] = useState<boolean>(false);
  const [earthMaskDeg, setEarthMaskDeg] = useState<number>(0);
  const [windowHours, setWindowHours] = useState<number>(DEFAULT_WINDOW_HOURS);
  const [showSphericalRef, setShowSphericalRef] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playSpeedHours, setPlaySpeedHours] = useState<number>(6);
  const [learnOpen, setLearnOpen] = useState<boolean>(false);
  const [aboutOpen, setAboutOpen] = useState<boolean>(false);

  // WP7 candidates list in memory
  const [candidates, setCandidates] = useState<SiteCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(null);

  // Banners, quick coordinate inputs, and URL hydration status
  const [urlWarnings, setUrlWarnings] = useState<string[]>([]);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [probeLatInput, setProbeLatInput] = useState<string>('-89.45');
  const [probeLonInput, setProbeLonInput] = useState<string>('-137.4');
  const [probeInputError, setProbeInputError] = useState<string | null>(null);
  const [copiedShareUrl, setCopiedShareUrl] = useState<boolean>(false);
  const urlHydratedRef = useRef<boolean>(false);
  const blockInitialUrlSyncRef = useRef<boolean>(false);

  const computeOptions = useMemo<ComputeOptions>(
    () => ({
      earthMaskDeg,
      windowHours,
      applyEclipses: true,
    }),
    [earthMaskDeg, windowHours],
  );

  // Lazy DEM loader (stable identity so startup effect never re-runs when clientDem resolves)
  const ensureClientDem = useCallback(async (): Promise<ClientDemBundle | null> => {
    if (clientDemRef.current) return clientDemRef.current;
    if (demPromiseRef.current) return demPromiseRef.current;

    setCustomPinLoading(true);
    setDemLoadError(null);
    const pending = loadClientDemBundle(getAppBaseUrl())
      .then((bundle) => {
        clientDemRef.current = bundle;
        setClientDem(bundle);
        return bundle;
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setDemLoadError(
          `High-resolution 240 m DEM bundle failed to load (${msg}). Falling back to coarse 1.2 km preview grid.`,
        );
        return null;
      })
      .finally(() => {
        setCustomPinLoading(false);
        demPromiseRef.current = null;
      });

    demPromiseRef.current = pending;
    return pending;
  }, []);

  // Lazy precomputed candidate grid loader
  const ensureCandidatesData = useCallback(async (): Promise<SiteCandidatesData | null> => {
    if (candidatesData) return candidatesData;
    if (candidatesPromiseRef.current) return candidatesPromiseRef.current;

    setCandidatesLoading(true);
    setCandidatesError(null);
    const url = buildDataUrl('site_candidates.json', dataVersion);
    const pending = fetch(url)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} loading site_candidates.json`);
        }
        return (await res.json()) as SiteCandidatesData;
      })
      .then((payload) => {
        setCandidatesData(payload);
        return payload;
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : String(err);
        setCandidatesError(`Could not load precomputed candidate layer: ${msg}`);
        return null;
      })
      .finally(() => {
        setCandidatesLoading(false);
        candidatesPromiseRef.current = null;
      });

    candidatesPromiseRef.current = pending;
    return pending;
  }, [candidatesData, dataVersion]);

  // Core startup data loading
  useEffect(() => {
    let cancelled = false;

    async function loadCoreDatasets() {
      try {
        setLoading(true);
        setLoadError(null);

        const [sitesRes, ephRes, regRes, demRes] = await Promise.all([
          fetch(buildDataUrl('sites.json')),
          fetch(buildDataUrl('ephemeris.json')),
          fetch(buildDataUrl('artemis3_regions.json')),
          fetch(buildDataUrl('polar_dem_patch.json')),
        ]);

        if (!sitesRes.ok) throw new Error(`Failed to fetch sites.json (${sitesRes.status})`);
        if (!ephRes.ok) throw new Error(`Failed to fetch ephemeris.json (${ephRes.status})`);
        if (!regRes.ok) throw new Error(`Failed to fetch artemis3_regions.json (${regRes.status})`);
        if (!demRes.ok) throw new Error(`Failed to fetch polar_dem_patch.json (${demRes.status})`);

        const [rawSitesPayload, rawEph, rawRegionsPayload, rawDemPatch] = await Promise.all([
          sitesRes.json() as Promise<SitesDataset | SiteData[]>,
          ephRes.json() as Promise<EphemerisData>,
          regRes.json() as Promise<ArtemisRegionsDataset | ArtemisRegion[]>,
          demRes.json() as Promise<PolarDemPatchRaw>,
        ]);

        if (cancelled) return;

        const rawSitesList = Array.isArray(rawSitesPayload)
          ? rawSitesPayload
          : rawSitesPayload.sites;
        const normalized = normalizeSites(rawSitesList);
        const resolvedVersion = !Array.isArray(rawSitesPayload)
          ? rawSitesPayload.data_version
          : rawEph.data_version ?? 'v2';
        const resolvedGenerated = !Array.isArray(rawSitesPayload)
          ? rawSitesPayload.generated_utc
          : rawEph.generated_utc ?? '';

        const resolvedRegions = Array.isArray(rawRegionsPayload)
          ? rawRegionsPayload
          : rawRegionsPayload.regions;
        const decodedPatch = decodeDemPatch(rawDemPatch);

        setSites(normalized);
        setEphemeris(rawEph);
        setArtemisRegions(resolvedRegions);
        setDemPatch(decodedPatch);
        setDataVersion(resolvedVersion || 'v2');
        setDataGeneratedUtc(resolvedGenerated || '');

        // Validate and apply URL query parameters (UX-4 / UX-5)
        const parsed = parseAndValidateUrlParams(window.location.search, normalized, rawEph);
        if (parsed.warnings.length > 0) {
          setUrlWarnings(parsed.warnings);
          blockInitialUrlSyncRef.current = true;
        }

        const initialMast = parsed.mastHeightM ?? DEFAULT_MAST_HEIGHT_M;
        const initialTime =
          parsed.timeIdx ?? Math.min(DEFAULT_TIME_IDX, Math.max(0, rawEph.n - 1));
        const initialMask = parsed.earthMaskDeg ?? 0;

        setMastHeightM(initialMast);
        setTimeIdx(initialTime);
        setEarthMaskDeg(initialMask);
        setCompareTimeIdx(parsed.compareTimeIdx ?? initialTime);
        setCompareMastHeightM(parsed.compareMastHeightM ?? initialMast);
        if (parsed.compareTimeIdx !== undefined || parsed.compareMastHeightM !== undefined) {
          setCompareIndependentControls(true);
        }

        if (parsed.activeTab === 'compare') {
          setActiveView('compare');
        } else if (parsed.activeTab === 'directory') {
          setActiveView('directory');
        } else {
          setActiveView('surface3d');
        }

        let initialSiteObj: SiteData | null = null;
        if (parsed.customCoords) {
          const { lat, lon } = parsed.customCoords;
          const nearby = findCuratedSiteNear(normalized, lat, lon, 600);
          if (nearby) {
            setSelectedSiteId(nearby.id);
            initialSiteObj = nearby;
          } else {
            const preview = buildCustomLatLonSite(
              lat,
              lon,
              decodedPatch,
              initialMast,
              rawEph,
              null,
              { earthMaskDeg: initialMask, applyEclipses: true },
            );
            const normPreview = normalizeSites([preview])[0];
            setCustomSiteA(normPreview);
            initialSiteObj = normPreview;
          }
        } else if (parsed.siteId) {
          setSelectedSiteId(parsed.siteId);
          initialSiteObj = normalized.find((s) => s.id === parsed.siteId) ?? normalized[0] ?? null;
        } else if (normalized.some((s) => s.id === DEFAULT_SITE_ID)) {
          setSelectedSiteId(DEFAULT_SITE_ID);
          initialSiteObj = normalized.find((s) => s.id === DEFAULT_SITE_ID) ?? normalized[0] ?? null;
        } else if (normalized.length > 0) {
          setSelectedSiteId(normalized[0].id);
          initialSiteObj = normalized[0];
        }

        // Initialize rover cleanly on selected polar site (or South Pole origin if global/non-polar)
        const startX =
          initialSiteObj && initialSiteObj.is_polar_dem && initialSiteObj.polar_x_km !== null
            ? initialSiteObj.polar_x_km
            : 0;
        const startY =
          initialSiteObj && initialSiteObj.is_polar_dem && initialSiteObj.polar_y_km !== null
            ? initialSiteObj.polar_y_km
            : 0;
        setRoverState(createInitialRoverState(startX, startY, clientDemRef.current, decodedPatch, 0, 250));

        if (parsed.compareCoords) {
          const cmpPreview = buildCustomLatLonSite(
            parsed.compareCoords.lat,
            parsed.compareCoords.lon,
            decodedPatch,
            parsed.compareMastHeightM ?? initialMast,
            rawEph,
            null,
            { earthMaskDeg: initialMask, applyEclipses: true },
          );
          setCustomSiteB(normalizeSites([cmpPreview])[0]);
        } else if (parsed.compareSiteId !== undefined) {
          setCompareSiteId(parsed.compareSiteId);
        } else if (normalized.some((s) => s.id === DEFAULT_COMPARE_SITE_ID)) {
          setCompareSiteId(DEFAULT_COMPARE_SITE_ID);
        } else if (normalized.length > 1) {
          setCompareSiteId(normalized[1].id);
        } else {
          setCompareSiteId(null);
        }

        urlHydratedRef.current = true;
        setLoading(false);

        // Load precomputed polar_maps.json non-blocking with version query parameter (OPS-5)
        fetch(buildDataUrl('polar_maps.json', resolvedVersion || 'v2'))
          .then((res) => (res.ok ? (res.json() as Promise<PolarMapsData>) : null))
          .then((mapsPayload) => {
            if (!cancelled && mapsPayload) {
              setPolarMaps(mapsPayload);
            }
          })
          .catch(() => {
            // Optional heatmap layer: keep DEM relief shading cleanly if absent
          });

        // If hydrated URL points directly to a South Pole custom pin, lazily upgrade it to 240 m DEM
        if (parsed.customCoords && parsed.customCoords.lat <= -65) {
          ensureClientDem().then((bundle) => {
            if (cancelled || !bundle) return;
            const upgraded = buildCustomLatLonSite(
              parsed.customCoords!.lat,
              parsed.customCoords!.lon,
              decodedPatch,
              initialMast,
              rawEph,
              bundle,
              { earthMaskDeg: initialMask, applyEclipses: true },
            );
            setCustomSiteA(normalizeSites([upgraded])[0]);
          });
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    }

    loadCoreDatasets();
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-snap active rover elevation & slope when lazy 240 m LOLA DEM finishes loading
  useEffect(() => {
    if (!clientDem) return;
    setRoverState((prev) => {
      if (!prev) return prev;
      const surf = sampleTerrainHeightAndNormal(prev.xKm, prev.yKm, clientDem, demPatch);
      const pr = computeRoverPitchRoll(prev.headingDeg, surf.nx, surf.ny, surf.nz);
      return {
        ...prev,
        elevM: surf.elevM + (prev.flightMode ? Math.max(0, prev.altitudeM ?? 0) : 0),
        slopeDeg: surf.slopeDeg,
        pitchDeg: pr.pitchDeg,
        rollDeg: pr.rollDeg,
        nx: surf.nx,
        ny: surf.ny,
        nz: surf.nz,
        terrainSource: surf.source,
      };
    });
  }, [clientDem, demPatch]);

  // Synchronize URL query parameters cleanly after initial hydration
  useEffect(() => {
    if (!urlHydratedRef.current || !ephemeris || sites.length === 0) return;
    if (blockInitialUrlSyncRef.current) {
      blockInitialUrlSyncRef.current = false;
      return;
    }

    const params = new URLSearchParams();
    if (activeView === 'compare' || activeView === 'directory') {
      params.set('view', activeView);
    }
    if (customSiteA) {
      params.set('lat', customSiteA.lat.toFixed(4));
      params.set('lon', customSiteA.lon.toFixed(3));
    } else {
      params.set('site', selectedSiteId);
    }

    if (customSiteB) {
      params.set('cmplat', customSiteB.lat.toFixed(4));
      params.set('cmplon', customSiteB.lon.toFixed(3));
    } else if (compareSiteId) {
      params.set('cmp', compareSiteId);
    } else {
      params.set('cmp', 'none');
    }

    params.set('t', String(timeIdx));
    params.set('mast', String(mastHeightM));
    if (compareIndependentControls) {
      params.set('cmpt', String(compareTimeIdx));
      params.set('cmpmast', String(compareMastHeightM));
    }
    if (earthMaskDeg > 0) {
      params.set('mask', String(earthMaskDeg));
    }

    const nextUrl = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState(null, '', nextUrl);
  }, [
    activeView,
    compareIndependentControls,
    compareMastHeightM,
    compareSiteId,
    compareTimeIdx,
    customSiteA,
    customSiteB,
    earthMaskDeg,
    ephemeris,
    mastHeightM,
    selectedSiteId,
    sites.length,
    timeIdx,
  ]);

  // Keep compare time/mast coupled unless Scenario B was explicitly customized
  useEffect(() => {
    if (!compareIndependentControls) {
      setCompareTimeIdx(timeIdx);
      setCompareMastHeightM(mastHeightM);
    }
  }, [compareIndependentControls, mastHeightM, timeIdx]);

  // Auto-load precomputed candidate index when opening Candidate Directory view
  useEffect(() => {
    if (activeView === 'directory' && !candidatesData && !candidatesLoading && !candidatesError) {
      void ensureCandidatesData();
    }
  }, [activeView, candidatesData, candidatesError, candidatesLoading, ensureCandidatesData]);

  // Playback interval for MissionTimeline
  useEffect(() => {
    if (!isPlaying || !ephemeris) return;
    const timer = window.setInterval(() => {
      setTimeIdx((prev) => {
        const next = prev + playSpeedHours;
        return next >= ephemeris.n ? 0 : next;
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, [ephemeris, isPlaying, playSpeedHours]);

  // Resolve Scenario A site
  const selectedSite = useMemo<SiteData | null>(() => {
    if (customSiteA) return customSiteA;
    return sites.find((s) => s.id === selectedSiteId) ?? sites[0] ?? null;
  }, [customSiteA, selectedSiteId, sites]);

  // Resolve Scenario B site
  const compareSite = useMemo<SiteData | null>(() => {
    if (customSiteB) return customSiteB;
    if (compareSiteId === null) return null;
    return sites.find((s) => s.id === compareSiteId) ?? null;
  }, [compareSiteId, customSiteB, sites]);

  const compareScenarioBSite = useMemo<SiteData | null>(() => {
    if (compareSite) return compareSite;
    if (sites.length === 0) return null;
    return sites.find((s) => s.id !== selectedSite?.id) ?? sites[0];
  }, [compareSite, selectedSite?.id, sites]);

  // Seasonal markers derived from ephemeris (SCI-5)
  const seasonalMarkers = useMemo(
    () => (ephemeris ? computeSeasonalMarkers(ephemeris) : []),
    [ephemeris],
  );

  // Horizon profiles & Scenario A calculations
  const horizonA = useMemo(
    () =>
      selectedSite ? getEffectiveHorizon360(selectedSite, mastHeightM, demPatch, clientDem) : [],
    [clientDem, demPatch, mastHeightM, selectedSite],
  );

  const evalA = useMemo(() => {
    if (!ephemeris || !selectedSite || horizonA.length === 0) return null;
    return computeInstantAndWindow(
      ephemeris,
      selectedSite,
      horizonA,
      timeIdx,
      windowHours,
      computeOptions,
    );
  }, [computeOptions, ephemeris, horizonA, selectedSite, timeIdx, windowHours]);

  // Horizon & evaluation for Scenario B
  const effectiveCompareTimeIdx = compareIndependentControls ? compareTimeIdx : timeIdx;
  const effectiveCompareMastM = compareIndependentControls ? compareMastHeightM : mastHeightM;

  const horizonB = useMemo(
    () =>
      compareScenarioBSite
        ? getEffectiveHorizon360(compareScenarioBSite, effectiveCompareMastM, demPatch, clientDem)
        : [],
    [clientDem, compareScenarioBSite, demPatch, effectiveCompareMastM],
  );

  const evalB = useMemo(() => {
    if (!ephemeris || !compareScenarioBSite || horizonB.length === 0) return null;
    return computeInstantAndWindow(
      ephemeris,
      compareScenarioBSite,
      horizonB,
      effectiveCompareTimeIdx,
      windowHours,
      computeOptions,
    );
  }, [
    compareScenarioBSite,
    computeOptions,
    effectiveCompareTimeIdx,
    ephemeris,
    horizonB,
    windowHours,
  ]);

  // Resolved active RoverState & spatially-cached RoverLiveTelemetry
  const effectiveRoverState = useMemo<RoverState | null>(() => {
    if (roverState) return roverState;
    if (!selectedSite) return null;
    const xKm = selectedSite.is_polar_dem ? (selectedSite.polar_x_km ?? 0) : 0;
    const yKm = selectedSite.is_polar_dem ? (selectedSite.polar_y_km ?? 0) : 0;
    return createInitialRoverState(xKm, yKm, clientDem, demPatch, 0, 250);
  }, [clientDem, demPatch, roverState, selectedSite]);

  const roverTelemetry = useMemo<RoverLiveTelemetry | null>(() => {
    if (!ephemeris || !effectiveRoverState) return null;
    const effectiveMastH =
      mastHeightM +
      (effectiveRoverState.flightMode ? Math.max(0, effectiveRoverState.altitudeM ?? 0) : 0);
    const { horizon360, nextCache } = getCachedRoverHorizon360(
      roverHorizonCacheRef.current,
      effectiveRoverState.xKm,
      effectiveRoverState.yKm,
      effectiveMastH,
      clientDem,
      demPatch,
    );
    roverHorizonCacheRef.current = nextCache;
    return computeRoverLiveTelemetry(
      effectiveRoverState,
      ephemeris,
      timeIdx,
      mastHeightM,
      clientDem,
      demPatch,
      {
        ...computeOptions,
        cachedHorizon360: horizon360,
      },
    );
  }, [clientDem, computeOptions, demPatch, effectiveRoverState, ephemeris, mastHeightM, timeIdx]);

  // Handlers for selecting curated sites, deploying rover & spawning custom pins
  const handleSelectCuratedSite = useCallback((id: string) => {
    setSelectedSiteId(id);
    setCustomSiteA(null);
    setSelectedCandidateId(null);
    setStatusNotice(null);
  }, []);

  const handleDeployRoverToSite = useCallback(
    (site: SiteData) => {
      const hasPolarCoords =
        site.is_polar_dem && site.polar_x_km !== null && site.polar_y_km !== null;
      const targetX = hasPolarCoords ? (site.polar_x_km ?? 0) : 0;
      const targetY = hasPolarCoords ? (site.polar_y_km ?? 0) : 0;
      const gear = effectiveRoverState?.gearMultiplier ?? 250;

      setRoverState(
        createInitialRoverState(targetX, targetY, clientDemRef.current, demPatch, 0, gear),
      );
      if (!site.isCustom && sites.some((s) => s.id === site.id)) {
        setSelectedSiteId(site.id);
        setCustomSiteA(null);
        setSelectedCandidateId(null);
      }

      if (!hasPolarCoords) {
        setStatusNotice(
          `${site.short_name} lies outside the 75°S–90°S LOLA DEM; deployed rover at South Pole origin (0, 0 km).`,
        );
      } else if (Math.abs(targetX) > 148 || Math.abs(targetY) > 148) {
        setStatusNotice(
          `${site.short_name} sits beyond the ±148 km rover boundary; deployed rover on bearing toward site at frame edge.`,
        );
      } else {
        setStatusNotice(
          `Rover deployed to ${site.short_name} (${targetX.toFixed(1)}, ${targetY.toFixed(1)} km).`,
        );
      }

      if (!clientDemRef.current) {
        void ensureClientDem();
      }
    },
    [demPatch, effectiveRoverState?.gearMultiplier, ensureClientDem, sites],
  );

  const handleToggleCompareSite = useCallback((id: string) => {
    setCustomSiteB(null);
    setCompareSiteId((prev) => (prev === id ? null : id));
  }, []);

  const handleCustomPolarClick = useCallback(
    async (xKm: number, yKm: number) => {
      if (!ephemeris) return;
      const [lat, lon] = xyKm2ll(xKm, yKm);
      const nearby = findCuratedSiteNear(sites, lat, lon, 600);
      if (nearby) {
        setSelectedSiteId(nearby.id);
        setCustomSiteA(null);
        setSelectedCandidateId(null);
        setStatusNotice(`Matched curated site within 600 m: ${nearby.short_name}.`);
        return;
      }

      setSelectedCandidateId(null);
      setStatusNotice(null);

      // Immediate coarse preview if fine bundle is not yet loaded
      if (!clientDem) {
        const preview = buildCustomPolarSite(
          demPatch,
          xKm,
          yKm,
          mastHeightM,
          ephemeris,
          null,
          computeOptions,
        );
        setCustomSiteA(normalizeSites([preview])[0]);
      }

      const bundle = await ensureClientDem();
      if (!bundle) return;
      const refined = buildCustomPolarSite(
        demPatch,
        xKm,
        yKm,
        mastHeightM,
        ephemeris,
        bundle,
        computeOptions,
      );
      setCustomSiteA(normalizeSites([refined])[0]);
    },
    [clientDem, computeOptions, demPatch, ensureClientDem, ephemeris, mastHeightM, sites],
  );

  const handleProbeLatLon = useCallback(
    async (latDeg: number, lonDeg: number, target: 'A' | 'B' = 'A') => {
      if (!ephemeris) return;
      const clampedLat = Math.max(-90, Math.min(90, latDeg));
      const normLon = (((lonDeg + 180) % 360) + 360) % 360 - 180;
      const nearby = findCuratedSiteNear(sites, clampedLat, normLon, 600);
      if (nearby) {
        if (target === 'A') {
          setSelectedSiteId(nearby.id);
          setCustomSiteA(null);
          setSelectedCandidateId(null);
        } else {
          setCompareSiteId(nearby.id);
          setCustomSiteB(null);
        }
        setStatusNotice(`Matched curated site within 600 m: ${nearby.short_name}.`);
        return;
      }

      const targetMast = target === 'A' ? mastHeightM : effectiveCompareMastM;
      if (target === 'A') {
        setSelectedCandidateId(null);
        setStatusNotice(null);
      }

      if (!clientDem && clampedLat <= -65) {
        const preview = buildCustomLatLonSite(
          clampedLat,
          normLon,
          demPatch,
          targetMast,
          ephemeris,
          null,
          computeOptions,
        );
        const normalizedPreview = normalizeSites([preview])[0];
        if (target === 'A') setCustomSiteA(normalizedPreview);
        else setCustomSiteB(normalizedPreview);

        const bundle = await ensureClientDem();
        if (!bundle) return;
        const upgraded = buildCustomLatLonSite(
          clampedLat,
          normLon,
          demPatch,
          targetMast,
          ephemeris,
          bundle,
          computeOptions,
        );
        const normalizedUpgraded = normalizeSites([upgraded])[0];
        if (target === 'A') setCustomSiteA(normalizedUpgraded);
        else setCustomSiteB(normalizedUpgraded);
        return;
      }

      const probe = buildCustomLatLonSite(
        clampedLat,
        normLon,
        demPatch,
        targetMast,
        ephemeris,
        clientDem,
        computeOptions,
      );
      const normalized = normalizeSites([probe])[0];
      if (target === 'A') setCustomSiteA(normalized);
      else setCustomSiteB(normalized);
    },
    [
      clientDem,
      computeOptions,
      demPatch,
      effectiveCompareMastM,
      ensureClientDem,
      ephemeris,
      mastHeightM,
      sites,
    ],
  );

  // Refresh custom pin baseline metrics when earthMaskDeg or clientDem updates
  useEffect(() => {
    if (!ephemeris || !customSiteA) return;
    if (
      customSiteA.is_polar_dem &&
      customSiteA.polar_x_km !== null &&
      customSiteA.polar_y_km !== null
    ) {
      const rebuilt = buildCustomPolarSite(
        demPatch,
        customSiteA.polar_x_km,
        customSiteA.polar_y_km,
        mastHeightM,
        ephemeris,
        clientDem,
        computeOptions,
      );
      setCustomSiteA((prev) =>
        prev
          ? normalizeSites([
              {
                ...rebuilt,
                id: prev.id,
                name: prev.name,
                short_name: prev.short_name,
                category: prev.category,
                program: prev.program,
                description: prev.description,
                mission_status: prev.mission_status,
                isCandidate: prev.isCandidate,
              },
            ])[0]
          : null,
      );
    } else if (!customSiteA.is_polar_dem) {
      const rebuilt = buildCustomLatLonSite(
        customSiteA.lat,
        customSiteA.lon,
        demPatch,
        mastHeightM,
        ephemeris,
        clientDem,
        computeOptions,
      );
      setCustomSiteA(normalizeSites([rebuilt])[0]);
    }
    // Intentionally triggered only when earthMaskDeg / clientDem updates to keep slider responsive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earthMaskDeg, clientDem]);

  // Select candidate -> Open in 3D Explorer & deploy rover there
  const handleSelectCandidate = useCallback(
    async (candidate: SiteCandidate) => {
      if (!ephemeris) return;
      setSelectedCandidateId(candidate.id);
      setStatusNotice(
        `Inspecting Computed Candidate #${candidate.rank} (${candidate.lat.toFixed(4)}°, ${candidate.lon.toFixed(3)}°).`,
      );

      const preview = candidateToSiteData(
        candidate,
        demPatch,
        ephemeris,
        mastHeightM,
        clientDem,
        computeOptions,
      );
      setCustomSiteA(preview);
      setRoverState((prev) =>
        createInitialRoverState(
          candidate.xKm,
          candidate.yKm,
          clientDemRef.current,
          demPatch,
          0,
          prev?.gearMultiplier ?? 250,
        ),
      );
      setActiveView('surface3d');

      if (!clientDem) {
        const bundle = await ensureClientDem();
        if (!bundle) return;
        const upgraded = candidateToSiteData(
          candidate,
          demPatch,
          ephemeris,
          mastHeightM,
          bundle,
          computeOptions,
        );
        setCustomSiteA(upgraded);
      }
    },
    [clientDem, computeOptions, demPatch, ensureClientDem, ephemeris, mastHeightM],
  );

  // Set candidate as Scenario B and switch to Compare View
  const handleCompareCandidate = useCallback(
    async (candidate: SiteCandidate) => {
      if (!ephemeris) return;
      const preview = candidateToSiteData(
        candidate,
        demPatch,
        ephemeris,
        effectiveCompareMastM,
        clientDem,
        computeOptions,
      );
      setCustomSiteB(preview);
      setActiveView('compare');

      if (!clientDem) {
        const bundle = await ensureClientDem();
        if (!bundle) return;
        const upgraded = candidateToSiteData(
          candidate,
          demPatch,
          ephemeris,
          effectiveCompareMastM,
          bundle,
          computeOptions,
        );
        setCustomSiteB(upgraded);
      }
    },
    [clientDem, computeOptions, demPatch, effectiveCompareMastM, ensureClientDem, ephemeris],
  );

  // Scenario A <-> B swap & preset application (CMP-1 / CMP-2)
  const handleSwapScenarios = useCallback(() => {
    if (!selectedSite || !compareScenarioBSite) return;
    const prevCustomA = customSiteA;
    const prevCustomB = customSiteB;
    const prevSiteIdA = selectedSiteId;
    const prevSiteIdB = compareScenarioBSite.id;

    setCustomSiteA(prevCustomB);
    if (!prevCustomB) setSelectedSiteId(prevSiteIdB);

    setCustomSiteB(prevCustomA);
    if (!prevCustomA) setCompareSiteId(prevSiteIdA);

    setCompareIndependentControls(true);
    setTimeIdx(effectiveCompareTimeIdx);
    setCompareTimeIdx(timeIdx);
    setMastHeightM(effectiveCompareMastM);
    setCompareMastHeightM(mastHeightM);
  }, [
    compareScenarioBSite,
    customSiteA,
    customSiteB,
    effectiveCompareMastM,
    effectiveCompareTimeIdx,
    mastHeightM,
    selectedSite,
    selectedSiteId,
    timeIdx,
  ]);

  const handleApplyComparisonPreset = useCallback(
    (preset: ComparisonPresetId) => {
      if (!ephemeris || !selectedSite) return;
      const maxIdx = Math.max(0, ephemeris.n - 1);

      if (preset === 'two_sites') {
        const altSite = sites.find((s) => s.id !== selectedSite.id) ?? selectedSite;
        setCustomSiteB(null);
        setCompareSiteId(altSite.id);
        setCompareIndependentControls(false);
        setCompareTimeIdx(timeIdx);
        setCompareMastHeightM(mastHeightM);
        return;
      }

      setCompareIndependentControls(true);
      if (customSiteA) {
        setCustomSiteB(customSiteA);
      } else {
        setCustomSiteB(null);
        setCompareSiteId(selectedSite.id);
      }

      if (preset === 'slip_7d') {
        setCompareTimeIdx(Math.min(maxIdx, timeIdx + 7 * 24));
        setCompareMastHeightM(mastHeightM);
      } else if (preset === 'slip_14d') {
        setCompareTimeIdx(Math.min(maxIdx, timeIdx + 14 * 24));
        setCompareMastHeightM(mastHeightM);
      } else if (preset === 'seasonal') {
        const winter = seasonalMarkers.find((m) => m.kind === 'winter_solstice');
        const summer = seasonalMarkers.find((m) => m.kind === 'summer_solstice');
        if (winter && summer) {
          setTimeIdx(winter.idx);
          setCompareTimeIdx(summer.idx);
        } else {
          setCompareTimeIdx(Math.min(maxIdx, (timeIdx + Math.round(173.5 * 24)) % ephemeris.n));
        }
        setCompareMastHeightM(mastHeightM);
      } else if (preset === 'mast_2_vs_20') {
        setMastHeightM(2.0);
        setCompareTimeIdx(timeIdx);
        setCompareMastHeightM(20.0);
      }
    },
    [customSiteA, ephemeris, mastHeightM, seasonalMarkers, selectedSite, sites, timeIdx],
  );

  // Coordinate probe form submission
  const handleProbeFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const lat = Number(probeLatInput);
    const lon = Number(probeLonInput);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setProbeInputError('Latitude must be between -90° and +90°.');
      return;
    }
    if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
      setProbeInputError('Longitude must be between -180° and +180°.');
      return;
    }
    setProbeInputError(null);
    void handleProbeLatLon(lat, lon, 'A');
  };

  // Copy Share Link handler
  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedShareUrl(true);
      window.setTimeout(() => setCopiedShareUrl(false), 2000);
    } catch {
      setStatusNotice('Copy the URL directly from your browser address bar to share this scenario.');
    }
  };

  // Export brief download handler
  const handleExportBrief = () => {
    if (!selectedSite || !evalA || !ephemeris) return;
    const md = buildMarkdownBrief({
      site: selectedSite,
      instant: evalA.instant,
      summary: evalA.summary,
      ephemeris,
      mastHeightM,
      earthMaskDeg,
      dataVersion,
      formulaText: SCORE_FORMULA_TEXT,
      powerAssumptionText: POWER_ASSUMPTION_TEXT,
      riseSetDefinitionText: RISE_SET_DEFINITION_TEXT,
      eclipseAssumptionText: ECLIPSE_ASSUMPTION_TEXT,
    });
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lunar-brief-${selectedSite.id}-${evalA.instant.utcIso.slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="cosmic-bg flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-slate-200">
        <div className="cosmic-starfield" aria-hidden="true" />
        <div className="relative flex h-16 w-16 items-center justify-center">
          <div className="orbital-ring-spin absolute inset-0 rounded-full border border-sky-400/45 border-t-amber-300" />
          <Loader2 className="h-7 w-7 animate-spin text-amber-300" aria-hidden="true" />
        </div>
        <div className="relative z-10 text-center">
          <h1 className="text-lg font-bold tracking-tight text-slate-50">
            Lunar Landing Site Navigator
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Initializing JPL DE441 ephemeris, LRO LOLA South Pole terrain &amp; 3D rover engine…
          </p>
        </div>
      </div>
    );
  }

  if (loadError || !ephemeris || !selectedSite || !evalA || !effectiveRoverState || !roverTelemetry) {
    return (
      <div className="cosmic-bg flex min-h-screen items-center justify-center px-4">
        <div className="cosmic-starfield" aria-hidden="true" />
        <div className="nasa-panel relative z-10 max-w-lg rounded-2xl border-rose-500/40 p-6 text-slate-100">
          <div className="flex items-center gap-2 text-base font-bold text-rose-300">
            <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            <span>Failed to load Lunar Mission Datasets</span>
          </div>
          <p className="mt-2 text-sm text-slate-300">
            {loadError ?? 'Required ephemeris or site data could not be initialized.'}
          </p>
          <p className="mt-3 text-xs text-slate-400">
            Ensure static data files are built in <code className="text-amber-300">webapp/public/data/</code> and reload the page.
          </p>
        </div>
      </div>
    );
  }

  const { instant, summary } = evalA;
  const sunCd = formatCountdown(
    instant.sunCountdown,
    instant.sunVisible,
    'sun',
    selectedSite.metrics_2m,
  );
  const earthCd = formatCountdown(
    instant.earthCountdown,
    instant.earthVisible,
    'earth',
    selectedSite.metrics_2m,
  );
  const sunClearance = instant.sunElDeg - instant.sunHorizonElDeg;
  const earthClearance = instant.earthElDeg - (instant.earthHorizonElDeg + earthMaskDeg);
  const trackingPct = instant.power?.trackingPct ?? instant.sunDiskFrac * 100;
  const horizontalPct =
    instant.power?.horizontalPct ??
    instant.sunDiskFrac * Math.max(0, Math.sin((instant.sunElDeg * Math.PI) / 180)) * 100;
  const sunTerrainDelta =
    selectedSite.metrics_2m.sun_visible_pct - selectedSite.metrics_2m.sun_no_terrain_pct;
  const hasTerrain =
    selectedSite.terrain_source !== 'NONE' && selectedSite.local_slope_deg !== null;
  const statusMeta = missionStatusMeta(selectedSite.mission_status);
  const viabilityScore =
    selectedSite.metrics_2m.viability_score !== null &&
    selectedSite.terrain_source === 'LOLA_240M'
      ? selectedSite.metrics_2m.viability_score
      : null;

  const isSpatialWorkspace =
    activeView === 'surface3d' || activeView === 'split' || activeView === 'map2d';

  return (
    <div className="cosmic-bg min-h-screen text-slate-100">
      {/* Subtle Pure-CSS Deep Space Starfield Backdrop */}
      <div className="cosmic-starfield" aria-hidden="true" />
      <div className="cosmic-starfield-near" aria-hidden="true" />

      {/* Sleek Sticky NASA Eyes Mission Control Top Bar */}
      <header className="lg:sticky lg:top-0 z-50 border-b border-sky-400/20 bg-[#040815]/90 backdrop-blur-xl shadow-[0_8px_32px_rgba(2,6,23,0.65)]">
        <div className="mx-auto max-w-[1600px] px-3 py-2 sm:px-6">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            {/* Mission Emblem + Title + Quick Target Selector */}
            <div className="flex flex-wrap items-center gap-3 min-w-0">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  aria-hidden="true"
                  className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-sky-400/35 bg-slate-950/90 shadow-[0_0_20px_-4px_rgba(56,189,248,0.5)]"
                >
                  <span className="orbital-ring-spin absolute inset-0 rounded-full border border-transparent border-t-amber-300/80 border-r-sky-400/50" />
                  <span className="orbital-ring-reverse absolute inset-1.5 rounded-full border border-dashed border-sky-400/40" />
                  <Compass className="h-4 w-4 text-amber-300" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="truncate text-base font-bold tracking-tight text-slate-50 sm:text-lg">
                      Lunar Landing Site Navigator
                    </h1>
                    <span className="hidden rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 font-mono text-xs font-medium text-amber-200 sm:inline-flex">
                      South Pole 3D
                    </span>
                  </div>
                  <p className="truncate text-xs text-slate-400">
                    JPL DE441 · LRO LOLA DEM · {instant.utcIso}
                  </p>
                </div>
              </div>

              {/* Quick Target Selector right in Header */}
              <div className="flex items-center gap-1.5 sm:ml-2">
                <label htmlFor="site-selector-a" className="sr-only">
                  Target Location (Scenario A)
                </label>
                <select
                  id="site-selector-a"
                  name="site-selector-a"
                  aria-label="Target Location (Scenario A)"
                  value={customSiteA ? '__custom__' : selectedSite.id}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val !== '__custom__') handleSelectCuratedSite(val);
                  }}
                  className="max-w-[200px] rounded-xl border border-sky-400/30 bg-[#050b1c]/90 px-3 py-1.5 text-xs font-medium text-slate-100 shadow-inner focus:border-amber-400 focus:outline-none sm:max-w-[235px]"
                >
                  {customSiteA && (
                    <option value="__custom__">
                      {customSiteA.isCandidate ? 'Candidate' : 'Custom'}: {customSiteA.short_name}
                    </option>
                  )}
                  <optgroup label="South Pole Curated Sites">
                    {sites
                      .filter((s) => s.is_polar_dem)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°)
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="Global Reference & Historic Missions">
                    {sites
                      .filter((s) => !s.is_polar_dem)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} ({s.lat.toFixed(2)}°, {s.lon.toFixed(2)}°)
                        </option>
                      ))}
                  </optgroup>
                </select>

                <button
                  type="button"
                  onClick={() => handleDeployRoverToSite(selectedSite)}
                  title="Deploy rover onto selected site in the 3D terrain simulator"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
                >
                  <Rocket className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                  <span className="hidden sm:inline">Deploy Rover</span>
                </button>
              </div>
            </div>

            {/* Verified Ephemeris Badge & Utility Modals */}
            <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap xl:gap-2">
              <div
                className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-emerald-500/35 bg-emerald-950/35 px-2.5 py-1.5 text-xs text-emerald-200"
                title="Topocentric ENU solar and Earth vectors verified against JPL Horizons DE441 checkpoints"
              >
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden="true" />
                <span>
                  JPL Horizons (~{ephemeris.validation.earth_max_err_deg.toFixed(3)}°)
                </span>
              </div>

              <span className="hidden whitespace-nowrap rounded-xl border border-slate-700/70 bg-slate-900/80 px-2.5 py-1.5 font-mono text-xs text-slate-300 2xl:inline-flex">
                {sites.length} Sites · {ephemeris.n.toLocaleString('en-US')}h
              </span>

              <button
                type="button"
                onClick={() => {
                  void handleCopyShareLink();
                }}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-sky-400/50 hover:text-sky-200"
              >
                <Share2 className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{copiedShareUrl ? 'Copied URL' : 'Share'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportBrief}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-amber-400/50 hover:text-amber-200"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Export Brief</span>
              </button>

              <button
                type="button"
                onClick={() => setLearnOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-sky-500/40 bg-sky-500/15 px-2.5 py-1.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/25"
              >
                <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Physics &amp; Guide</span>
              </button>

              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-slate-700/80 bg-slate-900/80 px-2.5 py-1.5 text-xs font-medium text-slate-200 transition hover:border-slate-500"
              >
                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                <span>About &amp; Data</span>
              </button>
            </div>
          </div>

          {/* 5 Workspace View Tabs */}
          <nav
            role="tablist"
            aria-label="Mission workspace views"
            className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-slate-800/70 pt-2"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'surface3d'}
              onClick={() => setActiveView('surface3d')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeView === 'surface3d'
                  ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/60 shadow-[0_0_20px_-6px_rgba(251,191,36,0.5)]'
                  : 'bg-slate-900/65 text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Orbit className="h-4 w-4" aria-hidden="true" />
              <span>3D Rover &amp; Surface</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'split'}
              onClick={() => setActiveView('split')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeView === 'split'
                  ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/60 shadow-[0_0_20px_-6px_rgba(56,189,248,0.5)]'
                  : 'bg-slate-900/65 text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Columns2 className="h-4 w-4" aria-hidden="true" />
              <span>Command Split</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'map2d'}
              onClick={() => setActiveView('map2d')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeView === 'map2d'
                  ? 'bg-emerald-500/20 text-emerald-100 ring-1 ring-emerald-400/60'
                  : 'bg-slate-900/65 text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <MapIcon className="h-4 w-4" aria-hidden="true" />
              <span>2D Map &amp; Sky</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'compare'}
              onClick={() => setActiveView('compare')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeView === 'compare'
                  ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/60'
                  : 'bg-slate-900/65 text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <GitCompare className="h-4 w-4" aria-hidden="true" />
              <span>Compare A vs B</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={activeView === 'directory'}
              onClick={() => setActiveView('directory')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                activeView === 'directory'
                  ? 'bg-violet-500/20 text-violet-100 ring-1 ring-violet-400/60'
                  : 'bg-slate-900/65 text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              <Table2 className="h-4 w-4" aria-hidden="true" />
              <span>Candidate Directory</span>
              <span className="rounded-full bg-slate-800 px-2 py-0.5 font-mono text-xs text-slate-200">
                {sites.length + candidates.length}
              </span>
            </button>
          </nav>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="relative z-10 mx-auto max-w-[1600px] space-y-4 px-3 py-4 sm:px-6">
        {/* Alert / Notice Banners */}
        {urlWarnings.length > 0 && (
          <div
            role="status"
            className="nasa-panel flex items-start justify-between gap-3 rounded-xl border-amber-500/45 bg-amber-950/35 px-4 py-3 text-xs text-amber-100"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-semibold text-amber-200">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Invalid URL query parameters were ignored</span>
              </div>
              <ul className="list-disc space-y-0.5 pl-5 text-amber-100/90">
                {urlWarnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </div>
            <button
              type="button"
              aria-label="Dismiss URL warnings"
              onClick={() => setUrlWarnings([])}
              className="rounded-lg border border-amber-400/40 bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-100 hover:bg-amber-500/25"
            >
              Dismiss
            </button>
          </div>
        )}

        {demLoadError && (
          <div
            role="status"
            className="nasa-panel flex items-center justify-between gap-3 rounded-xl border-amber-500/40 bg-amber-950/30 px-4 py-2.5 text-xs text-amber-200"
          >
            <span>{demLoadError}</span>
            <button
              type="button"
              onClick={() => setDemLoadError(null)}
              className="rounded p-1 hover:bg-amber-500/20"
              aria-label="Dismiss DEM warning"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {selectedSite.terrain_source === 'LOLA_1200M_COARSE' && (
          <div className="nasa-panel flex items-center gap-2 rounded-xl border-amber-500/35 bg-amber-950/25 px-4 py-2.5 text-xs text-amber-200">
            <Layers className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
            <span>
              <strong>Coarse preview (1.2 km terrain).</strong> Can differ from curated 240 m sites
              by more than 20 percentage points; local 240 m slope and composite index are omitted.
            </span>
          </div>
        )}

        {summary.windowHoursAvailable < summary.windowHoursRequested && (
          <div
            role="status"
            className="nasa-panel flex items-center gap-2 rounded-xl border-sky-500/35 bg-sky-950/25 px-4 py-2 text-xs text-sky-200"
          >
            <Info className="h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
            <span>
              <strong>Window truncated at end of ephemeris:</strong>{' '}
              {summary.windowHoursAvailable}h available of {summary.windowHoursRequested}h requested.
            </span>
          </div>
        )}

        {statusNotice && (
          <div className="nasa-panel flex items-center justify-between gap-2 rounded-xl border-cyan-500/35 bg-cyan-950/25 px-4 py-2 text-xs text-cyan-100">
            <span>{statusNotice}</span>
            <button
              type="button"
              onClick={() => setStatusNotice(null)}
              className="rounded p-1 hover:bg-cyan-500/20"
              aria-label="Close notice"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        )}

        {instant.activeEclipse && (
          <div className="nasa-panel flex flex-wrap items-center justify-between gap-2 rounded-xl border-rose-500/50 bg-rose-950/40 px-4 py-3 text-xs text-rose-100">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-300" aria-hidden="true" />
              <div>
                <span className="font-semibold text-rose-200">
                  Solar Eclipse Active ({instant.activeEclipse.type} for Moon center,{' '}
                  {instant.activeEclipse.hours}h event):
                </span>{' '}
                {(instant.eclipseObscuredFrac ?? 0) === 0 ? (
                  <span>0% of solar disk obscured by Earth at this instant.</span>
                ) : instant.eclipseData?.siteType === 'total' ? (
                  <span>
                    Total solar eclipse at site — 100% of solar disk obscured by Earth (~0%
                    relative array output during totality).
                  </span>
                ) : (
                  <span>
                    Partial solar eclipse at site —{' '}
                    {Math.round((instant.eclipseObscuredFrac ?? 0) * 100)}% of solar disk obscured
                    by Earth ({(instant.sunDiskFrac * 100).toFixed(1)}% remaining unobscured).
                  </span>
                )}
              </div>
            </div>
            <span className="font-mono text-xs text-rose-200">
              Sep {instant.eclipseData?.angularSepDeg.toFixed(2) ?? '—'}° · Earth R{' '}
              {instant.eclipseData?.earthAngularRadiusDeg.toFixed(2) ?? '—'}°
            </span>
          </div>
        )}

        {/* ========================= SPATIAL WORKSPACES (3D / SPLIT / 2D) ========================= */}
        {isSpatialWorkspace && (
          <div className="cosmic-fade-in space-y-4">
            {/* Slim NASA Eyes Command & Telemetry Control Strip */}
            <section
              aria-label="Simulation HUD controls and coordinate probe"
              className="nasa-panel flex flex-wrap items-center justify-between gap-2.5 rounded-2xl px-3.5 py-2.5"
            >
              {/* Left: Active 3D Relief & DEM Controls (or 2D Map label) */}
              {activeView !== 'map2d' ? (
                <div className="flex flex-wrap items-center gap-2">
                  {/* Vertical Relief Exaggeration Selector */}
                  <div
                    role="group"
                    aria-label="Vertical terrain relief exaggeration"
                    className="flex items-center gap-1 rounded-xl border border-slate-700/70 bg-slate-950/75 p-1 font-mono text-xs"
                  >
                    <span className="px-1.5 text-slate-400">Relief</span>
                    {VERTICAL_EXAGGERATION_OPTIONS.map((ex) => (
                      <button
                        key={ex}
                        type="button"
                        onClick={() => setVerticalExaggeration(ex)}
                        aria-pressed={verticalExaggeration === ex}
                        title={
                          ex === 1
                            ? '1× Real: True 1:1 physical lunar terrain & horizon elevation scale'
                            : `${ex}× vertical terrain relief exaggeration`
                        }
                        className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                          verticalExaggeration === ex
                            ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50'
                            : 'text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        {ex === 1 ? '1× Real' : `${ex}×`}
                      </button>
                    ))}
                  </div>

                  {/* 240 m HD DEM Upgrade Pill */}
                  <button
                    type="button"
                    onClick={() => {
                      void ensureClientDem();
                    }}
                    disabled={customPinLoading || clientDem !== null}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                      clientDem
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                    }`}
                  >
                    {customPinLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {clientDem
                        ? '240 m LOLA HD'
                        : customPinLoading
                          ? 'Loading 240 m…'
                          : 'Load 240 m HD'}
                    </span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
                    <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Cartographic 2D Map &amp; 360° Sky Analysis</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      void ensureClientDem();
                    }}
                    disabled={customPinLoading || clientDem !== null}
                    className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                      clientDem
                        ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200'
                        : 'border-sky-500/40 bg-sky-500/15 text-sky-200 hover:bg-sky-500/25'
                    }`}
                  >
                    {customPinLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    <span>
                      {clientDem
                        ? '240 m LOLA HD'
                        : customPinLoading
                          ? 'Loading 240 m…'
                          : 'Load 240 m HD'}
                    </span>
                  </button>
                </div>
              )}

              {/* Right: Quick Probe, Compare B, Window Length */}
              <div className="flex flex-wrap items-center gap-2">
                <form
                  noValidate
                  onSubmit={handleProbeFormSubmit}
                  className="flex items-center gap-1.5"
                >
                  <label htmlFor="probe-lat-input" className="sr-only">
                    Probe Latitude degrees
                  </label>
                  <input
                    id="probe-lat-input"
                    name="probe-lat-input"
                    type="number"
                    step="0.001"
                    min={-90}
                    max={90}
                    value={probeLatInput}
                    onChange={(e) => setProbeLatInput(e.target.value)}
                    aria-label="Probe Latitude degrees"
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                    placeholder="Lat"
                  />
                  <label htmlFor="probe-lon-input" className="sr-only">
                    Probe Longitude degrees
                  </label>
                  <input
                    id="probe-lon-input"
                    name="probe-lon-input"
                    type="number"
                    step="0.001"
                    min={-180}
                    max={180}
                    value={probeLonInput}
                    onChange={(e) => setProbeLonInput(e.target.value)}
                    aria-label="Probe Longitude degrees"
                    className="w-24 rounded-lg border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                    placeholder="Lon"
                  />
                  <button
                    type="submit"
                    disabled={customPinLoading}
                    className="inline-flex items-center gap-1 rounded-lg border border-violet-500/45 bg-violet-500/20 px-2.5 py-1 text-xs font-semibold text-violet-200 transition hover:bg-violet-500/30 disabled:opacity-60"
                  >
                    <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Probe</span>
                  </button>
                </form>

                <div className="flex items-center gap-1.5">
                  <label htmlFor="compare-selector-quick" className="sr-only">
                    Overlay Compare Target B
                  </label>
                  <select
                    id="compare-selector-quick"
                    name="compare-selector-quick"
                    aria-label="Overlay Compare Target B"
                    value={customSiteB ? '__custom_b__' : compareSiteId ?? 'none'}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomSiteB(null);
                      setCompareSiteId(val === 'none' ? null : val);
                    }}
                    className="max-w-[155px] rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-100 focus:border-sky-400 focus:outline-none"
                  >
                    {customSiteB && (
                      <option value="__custom_b__">Cmp B: {customSiteB.short_name}</option>
                    )}
                    <option value="none">Overlay B: None</option>
                    {sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        Cmp: {s.short_name}
                      </option>
                    ))}
                  </select>

                  <label htmlFor="window-duration-select" className="sr-only">
                    Mission Window Duration
                  </label>
                  <select
                    id="window-duration-select"
                    name="window-duration-select"
                    aria-label="Mission Window Duration"
                    value={windowHours}
                    onChange={(e) => setWindowHours(Number(e.target.value))}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
                  >
                    {WINDOW_DURATION_OPTIONS.map((opt) => (
                      <option key={opt.hours} value={opt.hours}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {probeInputError && (
                <p role="alert" className="w-full text-xs text-rose-300">
                  {probeInputError}
                </p>
              )}
            </section>

            {/* HERO STAGE: View 1 (Full-Bleed 3D), View 2 (Command Split), or View 3 (2D Map & Sky) */}
            {activeView === 'surface3d' && (
              <section aria-label="Interactive 3D lunar south pole rover simulator" className="space-y-3">
                <Lunar3DViewport
                  ephemeris={ephemeris}
                  timeIdx={timeIdx}
                  mastHeightM={mastHeightM}
                  sites={sites}
                  selectedSite={selectedSite}
                  compareSite={compareSite}
                  artemisRegions={artemisRegions}
                  demPatch={demPatch}
                  clientDem={clientDem}
                  polarMaps={polarMaps}
                  activeLayer={surfaceLayer}
                  onChangeLayer={setSurfaceLayer}
                  roverState={effectiveRoverState}
                  onRoverStateChange={setRoverState}
                  roverTelemetry={roverTelemetry}
                  cameraMode={cameraMode}
                  onCameraModeChange={setCameraMode}
                  verticalExaggeration={verticalExaggeration}
                  onSelectSite={handleSelectCuratedSite}
                  onDeployRoverToSite={handleDeployRoverToSite}
                  computeOptions={computeOptions}
                  className="h-[540px] w-full border border-sky-400/25 shadow-[0_24px_80px_-24px_rgba(14,165,233,0.35)] lg:h-[630px]"
                />

                {/* Compact Live Rover Telemetry Strip */}
                <div className="nasa-panel-subtle flex flex-wrap items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-200">
                      <Rocket className="h-3.5 w-3.5 text-cyan-300" aria-hidden="true" />
                      <span>Rover Surface Telemetry</span>
                    </span>
                    <span className="font-mono text-slate-200">
                      {roverTelemetry.lat.toFixed(3)}°, {roverTelemetry.lon.toFixed(3)}°
                    </span>
                    <span className="font-mono text-slate-300">
                      Elev {Math.round(roverTelemetry.elevM).toLocaleString('en-US')} m
                    </span>
                    {effectiveRoverState.flightMode && (
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono font-semibold text-sky-200">
                        ALT +{Math.round(effectiveRoverState.altitudeM ?? 0).toLocaleString('en-US')} m
                      </span>
                    )}
                    <span className="font-mono text-slate-300">
                      HDG {Math.round(effectiveRoverState.headingDeg).toString().padStart(3, '0')}°
                    </span>
                    <span className="font-mono text-slate-300">
                      Pitch {effectiveRoverState.pitchDeg >= 0 ? '+' : ''}
                      {effectiveRoverState.pitchDeg.toFixed(1)}° · Roll{' '}
                      {effectiveRoverState.rollDeg >= 0 ? '+' : ''}
                      {effectiveRoverState.rollDeg.toFixed(1)}°
                    </span>
                    <span className="font-mono text-cyan-200">
                      {effectiveRoverState.distanceTraveledKm.toFixed(2)} km driven
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-amber-200">
                      Rover Solar: {roverTelemetry.solarPowerTrackingPct.toFixed(0)}%
                    </span>
                    <span className="text-slate-600">|</span>
                    <span
                      className={`font-mono font-semibold ${
                        roverTelemetry.dteLinkActive ? 'text-cyan-200' : 'text-rose-300'
                      }`}
                    >
                      DTE: {roverTelemetry.dteLinkActive ? 'Link: Clear' : 'Link: Blocked'} (
                      {roverTelemetry.dteLinkMarginDeg >= 0 ? '+' : ''}
                      {roverTelemetry.dteLinkMarginDeg.toFixed(1)}°)
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeployRoverToSite(selectedSite)}
                      className="ml-1 inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/45 bg-cyan-500/15 px-2.5 py-1 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Deploy Rover to Selected Site</span>
                    </button>
                  </div>
                </div>
              </section>
            )}

            {activeView === 'split' && (
              <section
                aria-label="Command Split: synchronized 3D rover viewport, 2D polar map, and 360 degree sky panorama"
                className="space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
                  <div className="xl:col-span-7">
                    <Lunar3DViewport
                      ephemeris={ephemeris}
                      timeIdx={timeIdx}
                      mastHeightM={mastHeightM}
                      sites={sites}
                      selectedSite={selectedSite}
                      compareSite={compareSite}
                      artemisRegions={artemisRegions}
                      demPatch={demPatch}
                      clientDem={clientDem}
                      polarMaps={polarMaps}
                      activeLayer={surfaceLayer}
                      onChangeLayer={setSurfaceLayer}
                      roverState={effectiveRoverState}
                      onRoverStateChange={setRoverState}
                      roverTelemetry={roverTelemetry}
                      cameraMode={cameraMode}
                      onCameraModeChange={setCameraMode}
                      verticalExaggeration={verticalExaggeration}
                      onSelectSite={handleSelectCuratedSite}
                      onDeployRoverToSite={handleDeployRoverToSite}
                      computeOptions={computeOptions}
                      className="h-[520px] w-full border border-sky-400/25 shadow-2xl xl:h-[600px]"
                    />
                  </div>
                  <div className="xl:col-span-5">
                    <PolarMapCanvas
                      demPatch={demPatch}
                      sites={sites}
                      artemisRegions={artemisRegions}
                      selectedSite={selectedSite}
                      compareSite={compareSite}
                      instant={instant}
                      subsolarLat={ephemeris.subsolar_lat[timeIdx]}
                      subsolarLon={ephemeris.subsolar_lon[timeIdx]}
                      subearthLat={ephemeris.subearth_lat[timeIdx]}
                      subearthLon={ephemeris.subearth_lon[timeIdx]}
                      onSelectSite={handleSelectCuratedSite}
                      onCustomPolarClick={(xKm, yKm) => {
                        void handleCustomPolarClick(xKm, yKm);
                      }}
                      onProbeLatLon={(lat, lon) => {
                        void handleProbeLatLon(lat, lon, 'A');
                      }}
                      polarMaps={polarMaps}
                      candidates={candidates}
                      selectedCandidateId={selectedCandidateId}
                      onSelectCandidate={(cand) => {
                        void handleSelectCandidate(cand);
                      }}
                      customPinLoading={customPinLoading}
                    />
                  </div>
                </div>

                <HorizonSkyView
                  site={selectedSite}
                  horizon360={horizonA}
                  instant={instant}
                  summary={summary}
                  mastHeightM={mastHeightM}
                  label={customSiteA ? 'Target Pin' : selectedSite.short_name}
                  windowHours={windowHours}
                  showSphericalRef={showSphericalRef}
                  onToggleSphericalRef={setShowSphericalRef}
                />
              </section>
            )}

            {activeView === 'map2d' && (
              <section
                aria-label="2D polar terrain map and 360 degree local sky panorama"
                className="grid grid-cols-1 gap-4 xl:grid-cols-12"
              >
                <div className="xl:col-span-6">
                  <PolarMapCanvas
                    demPatch={demPatch}
                    sites={sites}
                    artemisRegions={artemisRegions}
                    selectedSite={selectedSite}
                    compareSite={compareSite}
                    instant={instant}
                    subsolarLat={ephemeris.subsolar_lat[timeIdx]}
                    subsolarLon={ephemeris.subsolar_lon[timeIdx]}
                    subearthLat={ephemeris.subearth_lat[timeIdx]}
                    subearthLon={ephemeris.subearth_lon[timeIdx]}
                    onSelectSite={handleSelectCuratedSite}
                    onCustomPolarClick={(xKm, yKm) => {
                      void handleCustomPolarClick(xKm, yKm);
                    }}
                    onProbeLatLon={(lat, lon) => {
                      void handleProbeLatLon(lat, lon, 'A');
                    }}
                    polarMaps={polarMaps}
                    candidates={candidates}
                    selectedCandidateId={selectedCandidateId}
                    onSelectCandidate={(cand) => {
                      void handleSelectCandidate(cand);
                    }}
                    customPinLoading={customPinLoading}
                  />
                </div>
                <div className="xl:col-span-6">
                  <HorizonSkyView
                    site={selectedSite}
                    horizon360={horizonA}
                    instant={instant}
                    summary={summary}
                    mastHeightM={mastHeightM}
                    label={customSiteA ? 'Target Pin' : selectedSite.short_name}
                    windowHours={windowHours}
                    showSphericalRef={showSphericalRef}
                    onToggleSphericalRef={setShowSphericalRef}
                  />
                </div>
              </section>
            )}

            {/* 4 Sleek High-Contrast Visual Telemetry Gauges */}
            <section
              aria-label="Site and rover visual telemetry gauges"
              className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              {/* Gauge 1: Solar Array % */}
              <article className="nasa-panel nasa-glow-amber flex items-center justify-between gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                    <Sun className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>Solar Array</span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-lg font-bold text-slate-50">
                      {instant.sunElDeg >= 0 ? '+' : ''}
                      {instant.sunElDeg.toFixed(2)}° El
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        sunClearance >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      ({sunClearance >= 0 ? '+' : ''}
                      {sunClearance.toFixed(2)}° clr)
                    </span>
                  </div>
                  <div className="space-y-0.5 text-xs text-slate-300">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Horizontal Panel</span>
                      <span className="font-mono font-semibold text-amber-200">
                        {horizontalPct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Next Transition</span>
                      <span className="font-mono font-semibold text-slate-100">
                        {sunCd.primary}
                      </span>
                    </div>
                  </div>
                </div>
                <CircularRingGauge
                  valuePct={trackingPct}
                  centerPrimary={`${trackingPct.toFixed(0)}%`}
                  centerSecondary={instant.sunVisible ? 'Lit' : 'Shadow'}
                  strokeColor="#fbbf24"
                />
              </article>

              {/* Gauge 2: Earth DTE Link & Window */}
              <article className="nasa-panel nasa-glow-sky flex items-center justify-between gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-sky-300">
                      <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Earth DTE</span>
                    </span>
                    <span className="font-mono text-xs text-slate-300">
                      {summary.windowHoursAvailable}h DTE Window
                    </span>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-lg font-bold text-slate-50">
                      {instant.earthElDeg >= 0 ? '+' : ''}
                      {instant.earthElDeg.toFixed(2)}° El
                    </span>
                    <span
                      className={`font-mono text-xs font-semibold ${
                        earthClearance >= 0 ? 'text-cyan-300' : 'text-rose-300'
                      }`}
                    >
                      ({earthClearance >= 0 ? '+' : ''}
                      {earthClearance.toFixed(2)}°)
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-400">Mask</span>
                    <div className="flex gap-1" role="group" aria-label="DTE elevation mask selector">
                      {[0, 2, 5].map((mask) => (
                        <button
                          key={mask}
                          type="button"
                          onClick={() => setEarthMaskDeg(mask)}
                          aria-pressed={earthMaskDeg === mask}
                          className={`rounded-md px-2 py-0.5 font-mono text-xs font-semibold transition ${
                            earthMaskDeg === mask
                              ? 'bg-sky-500/30 text-sky-100 ring-1 ring-sky-400/60'
                              : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          {mask}°
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between gap-2 text-xs text-slate-300">
                    <span className="text-slate-400">Joint / Next</span>
                    <span className="font-mono text-slate-100">
                      {summary.bothPct.toFixed(0)}% · {earthCd.primary}
                    </span>
                  </div>
                </div>
                <CircularRingGauge
                  valuePct={summary.earthPct}
                  centerPrimary={`${summary.earthPct.toFixed(0)}%`}
                  centerSecondary={instant.earthVisible ? 'In View' : 'Hidden'}
                  strokeColor="#38bdf8"
                />
              </article>

              {/* Gauge 3: 240 m Slope / Inclinometer & Rover Tilt */}
              <article className="nasa-panel flex items-center justify-between gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                    <Mountain className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>240 m Slope &amp; Tilt</span>
                  </div>
                  <div className="font-mono text-lg font-bold text-slate-50">
                    {hasTerrain ? `${selectedSite.local_slope_deg!.toFixed(2)}°` : 'n/a'}
                    <span className="ml-1.5 text-xs font-normal text-slate-400">
                      baseline
                    </span>
                  </div>
                  <div className="space-y-0.5 text-xs text-slate-300">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Rover Pitch / Roll</span>
                      <span className="font-mono text-cyan-200">
                        {effectiveRoverState.pitchDeg >= 0 ? '+' : ''}
                        {effectiveRoverState.pitchDeg.toFixed(1)}° /{' '}
                        {effectiveRoverState.rollDeg >= 0 ? '+' : ''}
                        {effectiveRoverState.rollDeg.toFixed(1)}°
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">30 km &le; 5° / Max Dark</span>
                      <span className="font-mono text-slate-100">
                        {selectedSite.terrain_stats
                          ? `${selectedSite.terrain_stats.pct_safe_hls_le_5deg}%`
                          : 'n/a'}{' '}
                        · {(summary.maxDarkHours / 24).toFixed(1)}d
                      </span>
                    </div>
                  </div>
                </div>
                <CircularRingGauge
                  valuePct={
                    hasTerrain
                      ? Math.max(0, Math.min(100, (selectedSite.local_slope_deg! / 20) * 100))
                      : null
                  }
                  centerPrimary={
                    hasTerrain ? `${selectedSite.local_slope_deg!.toFixed(1)}°` : 'n/a'
                  }
                  centerSecondary={`Rover ${roverTelemetry.slopeDeg.toFixed(1)}°`}
                  strokeColor={
                    hasTerrain && selectedSite.local_slope_deg! <= 5
                      ? '#10b981'
                      : hasTerrain && selectedSite.local_slope_deg! <= 15
                        ? '#f59e0b'
                        : '#f43f5e'
                  }
                />
              </article>

              {/* Gauge 4: Composite Viability Index & Site Target */}
              <article className="nasa-panel nasa-glow-emerald flex items-center justify-between gap-3 rounded-2xl p-4">
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center justify-between gap-1">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                      <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                      <span>Viability Index</span>
                    </span>
                    {statusMeta && (
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusMeta.badgeClass}`}
                      >
                        {statusMeta.label}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-sm font-bold text-slate-50" title={selectedSite.name}>
                    {selectedSite.name}
                  </div>
                  <div className="space-y-0.5 text-xs text-slate-300">
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Elev / Source</span>
                      <span className="font-mono text-slate-100">
                        {formatSiteElevation(selectedSite)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-400">Mast / Coords</span>
                      <span className="font-mono text-slate-200">
                        {mastHeightM.toFixed(1)} m · {selectedSite.lat.toFixed(2)}°
                      </span>
                    </div>
                  </div>
                </div>
                <CircularRingGauge
                  valuePct={viabilityScore}
                  centerPrimary={viabilityScore !== null ? viabilityScore.toFixed(1) : 'n/a'}
                  centerSecondary={viabilityScore !== null ? '/ 100' : 'No DEM'}
                  strokeColor="#10b981"
                />
              </article>
            </section>

            {/* Collapsible Science & Methodology Notes Accordion */}
            <section className="nasa-panel rounded-2xl">
              <button
                type="button"
                aria-expanded={scienceNotesOpen}
                onClick={() => setScienceNotesOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-xs font-semibold text-slate-200 transition hover:text-amber-200"
              >
                <span className="inline-flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
                  <span>
                    Science &amp; Methodology Notes — {selectedSite.short_name} (
                    {formatTerrainSourceLabel(selectedSite)})
                  </span>
                  {selectedSite.metrics_2m.archetype && (
                    <span className="hidden rounded-full border border-amber-400/30 bg-amber-500/15 px-2.5 py-0.5 text-xs font-medium text-amber-200 sm:inline-flex">
                      {selectedSite.metrics_2m.archetype}
                    </span>
                  )}
                </span>
                <span className="inline-flex items-center gap-1 text-slate-400">
                  <span>{scienceNotesOpen ? 'Hide' : 'Expand'}</span>
                  {scienceNotesOpen ? (
                    <ChevronUp className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4" aria-hidden="true" />
                  )}
                </span>
              </button>

              {scienceNotesOpen && (
                <div className="space-y-3 border-t border-slate-800/80 px-4 py-3.5 text-xs text-slate-300">
                  <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="nasa-panel-subtle rounded-xl p-3 space-y-1.5">
                      <div className="font-semibold text-amber-200">
                        Site Profile &amp; Provenance
                      </div>
                      <p className="leading-relaxed text-slate-300">{selectedSite.description}</p>
                      <div className="font-mono text-slate-400">
                        {selectedSite.lat.toFixed(4)}°, {selectedSite.lon.toFixed(3)}° ·{' '}
                        {selectedSite.program}
                      </div>
                      {selectedSite.provenance && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-slate-400">
                          <span>
                            {selectedSite.provenance.coord_source} (offset{' '}
                            {selectedSite.provenance.refine_offset_km.toFixed(2)} km)
                          </span>
                          {selectedSite.provenance.source_url && (
                            <a
                              href={selectedSite.provenance.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sky-300 underline hover:text-sky-200"
                            >
                              <span>Catalog</span>
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="nasa-panel-subtle rounded-xl p-3 space-y-1.5">
                      <div className="font-semibold text-sky-200">
                        Baseline &amp; Terrain Uncertainty
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Terrain vs Smooth Sphere (2 m):</span>
                        <span className="font-mono text-slate-100">
                          {selectedSite.metrics_2m.sun_visible_pct}% vs{' '}
                          {selectedSite.metrics_2m.sun_no_terrain_pct}% ({sunTerrainDelta >= 0 ? '+' : ''}
                          {sunTerrainDelta.toFixed(1)} pts)
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">±240 m Drift (Sun Disk %):</span>
                        <span className="font-mono text-slate-100">
                          {selectedSite.terrain_source === 'LOLA_240M' && selectedSite.drift_240m
                            ? `${selectedSite.drift_240m.sun_min_pct}–${selectedSite.drift_240m.sun_max_pct}%`
                            : 'n/a'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">30×30 km Relief (min–max):</span>
                        <span className="font-mono text-slate-100">
                          {selectedSite.terrain_stats
                            ? `${Math.round(selectedSite.terrain_stats.elev_relief_m).toLocaleString('en-US')} m`
                            : 'n/a'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Slant Range to Earth:</span>
                        <span className="font-mono text-slate-100">
                          {Math.round(instant.earthDistKm).toLocaleString('en-US')} km
                        </span>
                      </div>
                    </div>

                    <div className="nasa-panel-subtle rounded-xl p-3 space-y-1.5">
                      <div className="font-semibold text-emerald-200">
                        Physical Model Caveats
                      </div>
                      <p className="leading-relaxed text-slate-400">{POWER_ASSUMPTION_TEXT}</p>
                      <p className="leading-relaxed text-slate-400">{RISE_SET_DEFINITION_TEXT}</p>
                      <p className="leading-relaxed text-slate-400">{SCORE_FORMULA_TEXT}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-slate-800/80 pt-2.5">
                    <span className="font-semibold text-slate-200">Interactive Glossary:</span>
                    <GlossaryTerm termKey="dte" label="DTE Geometry" />
                    <GlossaryTerm termKey="lola_dem" label="LOLA 240 m DEM" />
                    <GlossaryTerm termKey="psr" label="Permanently Shadowed Region (PSR)" />
                    <GlossaryTerm termKey="az_el" label="Azimuth & Elevation (Az/El)" />
                    <GlossaryTerm termKey="libration" label="Optical Libration" />
                    <GlossaryTerm termKey="baseline_240m" label="240 m Baseline Slope" />
                    <GlossaryTerm termKey="array_power" label="Array Output" />
                    <GlossaryTerm termKey="viability" label="Team Viability Index" />
                  </div>
                </div>
              )}
            </section>

            {/* Integrated Bottom Mission Dock */}
            <section aria-label="Mission timeline, sky panorama, and rover traverse dock" className="space-y-3">
              <div
                role="tablist"
                aria-label="Bottom mission dock views"
                className="nasa-panel inline-flex flex-wrap items-center gap-1.5 rounded-2xl p-1.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={missionDockTab === 'timeline'}
                  onClick={() => setMissionDockTab('timeline')}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    missionDockTab === 'timeline'
                      ? 'bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/50'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  14-Day Timeline &amp; Sensitivity
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={missionDockTab === 'sky'}
                  onClick={() => setMissionDockTab('sky')}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    missionDockTab === 'sky'
                      ? 'bg-sky-500/20 text-sky-100 ring-1 ring-sky-400/50'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  360° Horizon Sky &amp; Panorama
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={missionDockTab === 'traverse'}
                  onClick={() => setMissionDockTab('traverse')}
                  className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                    missionDockTab === 'traverse'
                      ? 'bg-cyan-500/20 text-cyan-100 ring-1 ring-cyan-400/50'
                      : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                  }`}
                >
                  Rover Traverse Elevation Profile
                </button>
              </div>

              {missionDockTab === 'timeline' && (
                <MissionTimeline
                  ephemeris={ephemeris}
                  site={selectedSite}
                  horizon360={horizonA}
                  timeIdx={timeIdx}
                  setTimeIdx={setTimeIdx}
                  isPlaying={isPlaying}
                  setIsPlaying={setIsPlaying}
                  playSpeedHours={playSpeedHours}
                  setPlaySpeedHours={setPlaySpeedHours}
                  mastHeightM={mastHeightM}
                  setMastHeightM={setMastHeightM}
                  isPolarDem={selectedSite.is_polar_dem}
                  instant={instant}
                  summary={summary}
                  windowHours={windowHours}
                  computeOptions={computeOptions}
                  seasonalMarkers={seasonalMarkers}
                />
              )}

              {missionDockTab === 'sky' && (
                <HorizonSkyView
                  site={selectedSite}
                  horizon360={horizonA}
                  instant={instant}
                  summary={summary}
                  mastHeightM={mastHeightM}
                  label={customSiteA ? 'Target Pin' : selectedSite.short_name}
                  windowHours={windowHours}
                  showSphericalRef={showSphericalRef}
                  onToggleSphericalRef={setShowSphericalRef}
                />
              )}

              {missionDockTab === 'traverse' && (
                <RoverTraverseProfile
                  roverState={effectiveRoverState}
                  roverTelemetry={roverTelemetry}
                  selectedSite={selectedSite}
                  onDeployToSelected={() => handleDeployRoverToSite(selectedSite)}
                />
              )}
            </section>
          </div>
        )}

        {/* ======================= COMPARE SCENARIOS (A vs B) ======================= */}
        {activeView === 'compare' && compareScenarioBSite && evalB && (
          <div className="cosmic-fade-in">
            <ScenarioComparePanel
              ephemeris={ephemeris}
              sites={sites}
              customSiteA={customSiteA}
              customSiteB={customSiteB}
              siteA={selectedSite}
              horizonA={horizonA}
              timeIdxA={timeIdx}
              mastHeightA={mastHeightM}
              instantA={evalA.instant}
              summaryA={evalA.summary}
              siteB={compareScenarioBSite}
              horizonB={horizonB}
              timeIdxB={effectiveCompareTimeIdx}
              mastHeightB={effectiveCompareMastM}
              instantB={evalB.instant}
              summaryB={evalB.summary}
              windowHours={windowHours}
              earthMaskDeg={earthMaskDeg}
              seasonalMarkers={seasonalMarkers}
              customPinLoading={customPinLoading}
              onSelectSiteA={(id) => {
                handleSelectCuratedSite(id);
              }}
              onSelectSiteB={(id) => {
                setCustomSiteB(null);
                setCompareSiteId(id);
              }}
              onProbeCoordsA={(lat, lon) => {
                void handleProbeLatLon(lat, lon, 'A');
              }}
              onProbeCoordsB={(lat, lon) => {
                void handleProbeLatLon(lat, lon, 'B');
              }}
              onChangeTimeA={(idx) => setTimeIdx(idx)}
              onChangeTimeB={(idx) => {
                setCompareIndependentControls(true);
                setCompareTimeIdx(idx);
              }}
              onChangeMastA={(mastM) => setMastHeightM(mastM)}
              onChangeMastB={(mastM) => {
                setCompareIndependentControls(true);
                setCompareMastHeightM(mastM);
              }}
              onSwapScenarios={handleSwapScenarios}
              onApplyPreset={handleApplyComparisonPreset}
            />
          </div>
        )}

        {/* =================== CANDIDATE DIRECTORY & SITE TABLE =================== */}
        {activeView === 'directory' && (
          <div className="cosmic-fade-in space-y-5">
            <CandidateFinderPanel
              ephemeris={ephemeris}
              artemisRegions={artemisRegions}
              selectedSite={selectedSite}
              clientDem={clientDem}
              ensureClientDem={ensureClientDem}
              candidatesData={candidatesData}
              candidatesLoading={candidatesLoading}
              candidatesError={candidatesError}
              onEnsureCandidatesData={ensureCandidatesData}
              timeIdx={timeIdx}
              mastHeightM={mastHeightM}
              windowHours={windowHours}
              computeOptions={computeOptions}
              candidates={candidates}
              selectedCandidateId={selectedCandidateId}
              onCandidatesChange={(next) => {
                setCandidates(next);
              }}
              onSelectCandidate={(c) => {
                void handleSelectCandidate(c);
              }}
              onCompareCandidate={(c) => {
                void handleCompareCandidate(c);
              }}
            />

            <SiteComparisonTable
              sites={sites}
              selectedSite={selectedSite}
              compareSite={compareSite}
              onSelectSite={(id) => {
                handleSelectCuratedSite(id);
                const found = sites.find((s) => s.id === id);
                if (found) handleDeployRoverToSite(found);
                setActiveView('surface3d');
              }}
              onToggleCompare={handleToggleCompareSite}
              ephemeris={ephemeris}
              timeIdx={timeIdx}
              mastHeightM={mastHeightM}
              windowHours={windowHours}
              computeOptions={computeOptions}
              candidates={candidates}
              selectedCandidateId={selectedCandidateId}
              onSelectCandidate={(c) => {
                void handleSelectCandidate(c);
              }}
              onCompareCandidate={(c) => {
                void handleCompareCandidate(c);
              }}
              onOpenCompareView={() => setActiveView('compare')}
            />
          </div>
        )}
      </main>

      {/* Footer with Provenance & Limitations Summary */}
      <footer className="relative z-10 mt-8 border-t border-sky-400/15 bg-[#03060f]/90 py-5 text-xs text-slate-400 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span>
              Lunar Landing Site Navigator · Dataset{' '}
              <span className="font-mono text-slate-300">{dataVersion}</span>
              {dataGeneratedUtc ? ` (${dataGeneratedUtc.slice(0, 10)})` : ''}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <span>
              Precomputed ephemeris + LRO LOLA DEM (not lander-scale hazard certification)
            </span>
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="text-sky-300 underline decoration-sky-500/40 hover:text-sky-200"
            >
              Methodology, Mazarico 2011 Check &amp; Licenses
            </button>
          </div>
        </div>
      </footer>

      {/* Accessible Modals */}
      <LearnModal
        open={learnOpen}
        onClose={() => setLearnOpen(false)}
        ephemeris={ephemeris}
        onJumpToTimestamp={(idx) => {
          setTimeIdx(idx);
          setActiveView('surface3d');
        }}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <AboutModal
        open={aboutOpen}
        onClose={() => setAboutOpen(false)}
        ephemeris={ephemeris}
        sitesCount={sites.length}
        sites={sites}
        dataVersion={dataVersion}
        dataGeneratedUtc={dataGeneratedUtc}
      />
    </div>
  );
}

export default App;

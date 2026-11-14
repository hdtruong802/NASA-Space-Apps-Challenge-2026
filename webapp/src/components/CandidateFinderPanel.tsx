import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Compass,
  Cpu,
  Filter,
  GitCompare,
  Loader2,
  MapPin,
  Search,
  SlidersHorizontal,
  StopCircle,
} from 'lucide-react';
import { decodeSiteCandidates, rankCandidates, scanAroundLive } from '../lib/candidates';
import type {
  ArtemisRegion,
  CandidateCriterion,
  CandidateQuery,
  CandidateRankResult,
  CandidateRegion,
  ClientDemBundle,
  ComputeOptions,
  EphemerisData,
  SiteCandidate,
  SiteCandidatesData,
  SiteData,
} from '../types/lunar';
import { GlossaryTerm } from './GlossaryTerm';

export interface CandidateFinderPanelProps {
  ephemeris: EphemerisData;
  artemisRegions: ArtemisRegion[];
  selectedSite: SiteData;
  clientDem: ClientDemBundle | null;
  ensureClientDem: () => Promise<ClientDemBundle | null>;
  candidatesData: SiteCandidatesData | null;
  candidatesLoading: boolean;
  candidatesError: string | null;
  onEnsureCandidatesData: () => Promise<SiteCandidatesData | null>;
  timeIdx: number;
  mastHeightM: number;
  windowHours: number;
  computeOptions?: ComputeOptions;
  candidates: SiteCandidate[];
  selectedCandidateId: string | null;
  onCandidatesChange: (
    next: SiteCandidate[],
    result: CandidateRankResult,
    mode: 'A' | 'B',
    query: CandidateQuery,
  ) => void;
  onSelectCandidate: (candidate: SiteCandidate) => void;
  onCompareCandidate: (candidate: SiteCandidate) => void;
}

const CRITERION_LABELS: Record<CandidateCriterion, string> = {
  score: 'Composite Viability Index',
  sun: 'Mean Solar Disk Visibility',
  earth: 'Earth DTE Visibility',
  joint: 'Joint Sun + Earth Visibility',
  shortest_night: 'Shortest Maximum Darkness',
};

export const CandidateFinderPanel: React.FC<CandidateFinderPanelProps> = ({
  ephemeris,
  artemisRegions,
  selectedSite,
  clientDem,
  ensureClientDem,
  candidatesData,
  candidatesLoading,
  candidatesError,
  onEnsureCandidatesData,
  timeIdx,
  mastHeightM,
  windowHours,
  computeOptions,
  candidates,
  selectedCandidateId,
  onCandidatesChange,
  onSelectCandidate,
  onCompareCandidate,
}) => {
  const [scanMode, setScanMode] = useState<'A' | 'B'>('A');
  const [criterion, setCriterion] = useState<CandidateCriterion>('score');
  const [regionKind, setRegionKind] = useState<'map' | 'artemis' | 'around'>('map');
  const [selectedArtemisCode, setSelectedArtemisCode] = useState<string>('ALL');
  const [aroundRadiusKm, setAroundRadiusKm] = useState<number>(15);

  const [useSlopeLimit, setUseSlopeLimit] = useState<boolean>(true);
  const [maxSlopeDeg, setMaxSlopeDeg] = useState<number>(5);
  const [useFlatLimit, setUseFlatLimit] = useState<boolean>(true);
  const [minFlat1kmPct, setMinFlat1kmPct] = useState<number>(20);
  const [count, setCount] = useState<number>(10);
  const [minSepKm, setMinSepKm] = useState<number>(2.4);

  const [lastResult, setLastResult] = useState<CandidateRankResult | null>(null);
  const [modeBScanning, setModeBScanning] = useState<boolean>(false);
  const [modeBProgress, setModeBProgress] = useState<number>(0);
  const [modeBError, setModeBError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Trigger lazy load of Mode A site_candidates.json once panel mounts
  useEffect(() => {
    if (!candidatesData && !candidatesLoading && !candidatesError) {
      void onEnsureCandidatesData();
    }
  }, [candidatesData, candidatesLoading, candidatesError, onEnsureCandidatesData]);

  const decodedCandidates = useMemo(() => {
    if (!candidatesData) return null;
    return decodeSiteCandidates(candidatesData);
  }, [candidatesData]);

  const siteHasPolarCoords =
    selectedSite.terrain_source !== 'NONE' &&
    selectedSite.polar_x_km !== null &&
    selectedSite.polar_y_km !== null &&
    Math.abs(selectedSite.polar_x_km) <= 150 &&
    Math.abs(selectedSite.polar_y_km) <= 150;

  const centerXKm = siteHasPolarCoords ? selectedSite.polar_x_km! : 0;
  const centerYKm = siteHasPolarCoords ? selectedSite.polar_y_km! : 0;

  const activeRegion: CandidateRegion = useMemo(() => {
    if (regionKind === 'artemis') {
      return selectedArtemisCode === 'ALL'
        ? { kind: 'artemis' }
        : { kind: 'artemis', codes: [selectedArtemisCode] };
    }
    if (regionKind === 'around') {
      return {
        kind: 'around',
        xKm: centerXKm,
        yKm: centerYKm,
        radiusKm: aroundRadiusKm,
      };
    }
    return { kind: 'map' };
  }, [regionKind, selectedArtemisCode, centerXKm, centerYKm, aroundRadiusKm]);

  const query: CandidateQuery = useMemo(
    () => ({
      criterion,
      region: activeRegion,
      maxSlopeDeg: useSlopeLimit ? maxSlopeDeg : null,
      minFlat1kmPct: useFlatLimit ? minFlat1kmPct : null,
      count,
      minSepKm,
    }),
    [criterion, activeRegion, useSlopeLimit, maxSlopeDeg, useFlatLimit, minFlat1kmPct, count, minSepKm],
  );

  // Instant Mode A ranking whenever decodedCandidates or query changes
  useEffect(() => {
    if (scanMode !== 'A' || !decodedCandidates) return;
    const res = rankCandidates(decodedCandidates, query, artemisRegions);
    setLastResult(res);
    onCandidatesChange(res.picked, res, 'A', query);
  }, [scanMode, decodedCandidates, query, artemisRegions]);

  const handleRunModeB = async () => {
    setModeBError(null);
    if (!siteHasPolarCoords) {
      setModeBError(
        'Selected site is outside the ±150 km South Pole 240 m DEM frame. Select a polar site inside ±150 km to run a live terrain scan.',
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setModeBScanning(true);
    setModeBProgress(0);
    try {
      const bundle = clientDem ?? (await ensureClientDem());
      if (!bundle) {
        throw new Error('Client DEM bundle could not be loaded.');
      }
      if (controller.signal.aborted) return;

      const res = await scanAroundLive(
        centerXKm,
        centerYKm,
        aroundRadiusKm,
        {
          ...query,
          region: {
            kind: 'around',
            xKm: centerXKm,
            yKm: centerYKm,
            radiusKm: aroundRadiusKm,
          },
        },
        ephemeris,
        timeIdx,
        windowHours,
        mastHeightM,
        bundle,
        computeOptions,
        (pct) => setModeBProgress(pct),
        controller.signal,
      );

      if (!controller.signal.aborted) {
        setLastResult(res);
        onCandidatesChange(res.picked, res, 'B', query);
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError' && !controller.signal.aborted) {
        setModeBError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (!controller.signal.aborted) {
        setModeBScanning(false);
      }
    }
  };

  const handleCancelModeB = () => {
    abortRef.current?.abort();
    setModeBScanning(false);
  };

  const outOfFrameRegions = artemisRegions.filter((r) => r.in_polar_frame === false);
  const activeBlockers: string[] = [];
  if (useSlopeLimit) activeBlockers.push(`Point slope <= ${maxSlopeDeg}°`);
  if (useFlatLimit) activeBlockers.push(`1 km area <=5° >= ${minFlat1kmPct}%`);

  const searchParams = candidatesData?.search_params;

  return (
    <section
      aria-label="WP7 Computed Candidate Discovery"
      className="rounded-2xl border border-violet-500/30 bg-slate-900/85 p-4 shadow-lg space-y-4"
    >
      {/* Header & Mode Switch */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-100">
            <Cpu className="h-4 w-4 text-violet-400" aria-hidden="true" />
            <span>Top candidates by {CRITERION_LABELS[criterion]}</span>
          </h2>
          <p className="text-xs text-slate-300">
            Two-step terrain search (1.2 km cell highest-elevation peak + 25-pixel 240 m refinement).{' '}
            <span className="font-semibold text-amber-200">
              Analytical ranking only — not a landing recommendation or lander-scale hazard clearance.
            </span>
          </p>
        </div>

        <div
          role="group"
          aria-label="Candidate finder mode"
          className="inline-flex rounded-xl border border-slate-700 bg-slate-950/85 p-1 text-xs"
        >
          <button
            type="button"
            onClick={() => setScanMode('A')}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              scanMode === 'A'
                ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/50'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Mode A: Precomputed Map (Full Epoch @ 2 m)
          </button>
          <button
            type="button"
            onClick={() => {
              setScanMode('B');
              setRegionKind('around');
            }}
            className={`rounded-lg px-3 py-1.5 font-medium transition ${
              scanMode === 'B'
                ? 'bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/50'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            Mode B: Live Window Scan (Active UTC)
          </button>
        </div>
      </div>

      {/* Query Controls Grid */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 md:grid-cols-2 xl:grid-cols-4 text-xs">
        {/* Criterion */}
        <div className="space-y-1.5">
          <label htmlFor="cand-criterion" className="flex items-center gap-1.5 font-semibold text-slate-200">
            <SlidersHorizontal className="h-3.5 w-3.5 text-violet-400" aria-hidden="true" />
            Ranking Criterion
          </label>
          <select
            id="cand-criterion"
            name="cand-criterion"
            value={criterion}
            onChange={(e) => setCriterion(e.target.value as CandidateCriterion)}
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 focus:border-violet-400 focus:outline-none"
          >
            <option value="score">Composite Viability Index</option>
            <option value="sun">Mean Solar Disk %</option>
            <option value="earth">Earth DTE %</option>
            <option value="joint">Joint Sun + Earth %</option>
            <option value="shortest_night">Shortest Max Night</option>
          </select>
        </div>

        {/* Search Region */}
        <div className="space-y-1.5">
          <label htmlFor="cand-region" className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Compass className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
            Search Domain
          </label>
          {scanMode === 'A' ? (
            <select
              id="cand-region"
              name="cand-region"
              value={regionKind}
              onChange={(e) => setRegionKind(e.target.value as 'map' | 'artemis' | 'around')}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-2 text-xs text-slate-100 focus:border-violet-400 focus:outline-none"
            >
              <option value="map">±150 km South Pole Map</option>
              <option value="artemis">Artemis III 2024 Regions (In-Frame)</option>
              <option value="around">Around Selected Site</option>
            </select>
          ) : (
            <div className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-2 text-xs text-sky-200">
              Around {selectedSite.short_name} ({aroundRadiusKm} km radius)
            </div>
          )}

          {scanMode === 'A' && regionKind === 'artemis' && (
            <select
              id="cand-artemis-code"
              name="cand-artemis-code"
              aria-label="Filter Artemis III region"
              value={selectedArtemisCode}
              onChange={(e) => setSelectedArtemisCode(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-200 focus:border-violet-400 focus:outline-none"
            >
              <option value="ALL">All In-Frame Artemis III 2024 Polygons</option>
              {artemisRegions.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.code} — {r.region}
                  {r.in_polar_frame === false ? ' (outside ±150 km)' : ''}
                </option>
              ))}
            </select>
          )}

          {(regionKind === 'around' || scanMode === 'B') && (
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-xs text-slate-300">
                <label htmlFor="cand-around-radius">Radius</label>
                <span className="font-mono text-sky-300">{aroundRadiusKm} km</span>
              </div>
              <input
                id="cand-around-radius"
                name="cand-around-radius"
                type="range"
                aria-label="Search radius in km"
                min={5}
                max={40}
                step={1}
                value={aroundRadiusKm}
                onChange={(e) => setAroundRadiusKm(Number(e.target.value))}
                className="w-full accent-violet-400"
              />
            </div>
          )}
        </div>

        {/* Terrain Constraints (R3) */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 font-semibold text-slate-200">
            <Filter className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            <span>Surface Constraints (240 m)</span>
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-slate-200">
            <label htmlFor="cand-use-slope-limit" className="inline-flex items-center gap-1.5">
              <input
                id="cand-use-slope-limit"
                name="cand-use-slope-limit"
                type="checkbox"
                checked={useSlopeLimit}
                onChange={(e) => setUseSlopeLimit(e.target.checked)}
                className="h-4 w-4 accent-emerald-400"
              />
              Max Slope &le;
            </label>
            <input
              id="cand-max-slope"
              name="cand-max-slope"
              type="number"
              aria-label="Maximum point slope degrees"
              min={1}
              max={30}
              step={0.5}
              disabled={!useSlopeLimit}
              value={maxSlopeDeg}
              onChange={(e) => setMaxSlopeDeg(Math.max(0.5, Number(e.target.value) || 5))}
              className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100 disabled:opacity-50"
            />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-slate-200">
            <label htmlFor="cand-use-flat-limit" className="inline-flex items-center gap-1.5">
              <input
                id="cand-use-flat-limit"
                name="cand-use-flat-limit"
                type="checkbox"
                checked={useFlatLimit}
                onChange={(e) => setUseFlatLimit(e.target.checked)}
                className="h-4 w-4 accent-emerald-400"
              />
              1 km &le;5° Area &ge;
            </label>
            <input
              id="cand-min-flat-1km"
              name="cand-min-flat-1km"
              type="number"
              aria-label="Minimum flat area percentage in 1 km"
              min={0}
              max={100}
              step={5}
              disabled={!useFlatLimit}
              value={minFlat1kmPct}
              onChange={(e) => setMinFlat1kmPct(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className="w-16 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100 disabled:opacity-50"
            />
          </div>
        </div>

        {/* Count & Separation (R5) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <label htmlFor="cand-count" className="font-semibold text-slate-200">
              Max Results
            </label>
            <select
              id="cand-count"
              name="cand-count"
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 font-mono text-xs text-slate-100"
            >
              {[5, 10, 15, 25].map((n) => (
                <option key={n} value={n}>
                  {n} sites
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-300">
              <label htmlFor="cand-min-sep">Min Separation</label>
              <span className="font-mono text-violet-300">{minSepKm.toFixed(1)} km</span>
            </div>
            <input
              id="cand-min-sep"
              name="cand-min-sep"
              type="range"
              aria-label="Minimum separation km"
              min={1.2}
              max={10}
              step={0.4}
              value={minSepKm}
              onChange={(e) => setMinSepKm(Number(e.target.value))}
              className="w-full accent-violet-400"
            />
          </div>

          {scanMode === 'B' && (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={handleRunModeB}
                disabled={modeBScanning}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-sky-400 disabled:opacity-60"
              >
                {modeBScanning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {modeBScanning ? `Scanning ${Math.round(modeBProgress)}%` : 'Run Window Scan'}
              </button>
              {modeBScanning && (
                <button
                  type="button"
                  onClick={handleCancelModeB}
                  className="inline-flex items-center gap-1 rounded-lg border border-rose-500/50 bg-rose-950/50 px-2.5 py-1.5 text-xs font-medium text-rose-200 hover:bg-rose-900/60"
                >
                  <StopCircle className="h-3.5 w-3.5" aria-hidden="true" />
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Mode B Progress Bar or Errors */}
      {scanMode === 'B' && modeBScanning && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-sky-200">
            <span>Scanning terrain cells in Web Worker (active {Math.round(windowHours / 24)}d window @ {mastHeightM.toFixed(1)} m mast)...</span>
            <span className="font-mono">{Math.round(modeBProgress)}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full bg-sky-400 transition-all duration-150"
              style={{ width: `${Math.min(100, Math.max(2, modeBProgress))}%` }}
            />
          </div>
        </div>
      )}

      {modeBError && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-950/30 px-3.5 py-2.5 text-xs text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{modeBError}</span>
        </div>
      )}

      {candidatesLoading && scanMode === 'A' && (
        <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-3 text-xs text-slate-300">
          <Loader2 className="h-4 w-4 animate-spin text-violet-400" aria-hidden="true" />
          <span>Loading precomputed South Pole candidate layers (site_candidates.json)...</span>
        </div>
      )}

      {candidatesError && scanMode === 'A' && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{candidatesError}</span>
        </div>
      )}

      {/* Search Scope & Boundary Disclosures (WP7 §1 & §6) */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/50 px-3.5 py-2 text-xs text-slate-300">
        <div className="space-y-0.5">
          <div>
            <strong>Active Scope:</strong>{' '}
            {scanMode === 'A'
              ? `LOLA ${searchParams?.fine_mpp_m ?? 240} m / ${searchParams?.cell_mpp_m ?? 1200} m DEM · ${searchParams?.mast_m ?? 2} m mast · ${searchParams?.period_start_utc.slice(0, 10) ?? ephemeris.t0_utc.slice(0, 10)} to ${searchParams?.period_end_utc.slice(0, 10) ?? 'end'}`
              : `Live unified 240 m / 1.2 km DEM engine · ${mastHeightM.toFixed(1)} m mast · ${windowHours}h from ${ephemeris.t0_utc.slice(0, 10)} + ${timeIdx}h`}
            {' · '}
            <GlossaryTerm termKey="baseline_240m" label="240 m Baseline Caveat" />
          </div>
          {regionKind === 'artemis' && outOfFrameRegions.length > 0 && (
            <div className="text-amber-300/90">
              Note: Artemis III 2024 regions outside the ±150 km DEM frame (
              {outOfFrameRegions.map((r) => r.code).join(', ')}) are excluded or clipped at the ±150 km
              boundary.
            </div>
          )}
        </div>
        {lastResult && (
          <div className="font-mono text-xs text-slate-400">
            Evaluated {lastResult.totalEvaluated.toLocaleString('en-US')} · Excluded{' '}
            {lastResult.excludedByConstraints.toLocaleString('en-US')}
          </div>
        )}
      </div>

      {/* Empty State Clarity (WP7 §5 #9 & §6 #5) */}
      {lastResult && candidates.length === 0 && !candidatesLoading && !modeBScanning && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-950/20 p-4 text-xs space-y-2">
          <div className="font-semibold text-amber-200">
            No candidates match the active constraints (valid empty result)
          </div>
          <p className="text-slate-300">
            Evaluated {lastResult.totalEvaluated.toLocaleString('en-US')} cells in region:{' '}
            <strong>{lastResult.excludedByConstraints.toLocaleString('en-US')}</strong> excluded by active
            surface constraints ({activeBlockers.length > 0 ? activeBlockers.join(' and ') : 'none'}).
          </p>
          {(useSlopeLimit || useFlatLimit) && (
            <button
              type="button"
              onClick={() => {
                setUseSlopeLimit(false);
                setUseFlatLimit(false);
              }}
              className="rounded-lg border border-amber-400/50 bg-amber-500/20 px-3 py-1.5 font-medium text-amber-200 hover:bg-amber-500/30"
            >
              Disable Slope &amp; Flatness Filters
            </button>
          )}
        </div>
      )}

      {/* Ranked Candidate Cards */}
      {candidates.length > 0 && (
        <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {candidates.map((c) => {
            const isActive = c.id === selectedCandidateId;
            return (
              <div
                key={c.id}
                className={`rounded-xl border p-3 text-xs transition ${
                  isActive
                    ? 'border-violet-400/70 bg-violet-950/30'
                    : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-violet-500/25 px-2 py-0.5 font-mono font-bold text-violet-200">
                      #{c.rank}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-violet-200">
                      Computed · Mode {c.mode}
                    </span>
                    {c.artemisCode && (
                      <span className="rounded bg-sky-500/20 px-1.5 py-0.5 font-mono text-xs text-sky-200">
                        {c.artemisCode}
                      </span>
                    )}
                  </div>
                  <span className="font-mono font-bold text-amber-300">
                    {c.viabilityScore !== null ? `Idx ${c.viabilityScore.toFixed(1)}` : 'Idx n/a'}
                  </span>
                </div>

                <div className="mt-1.5 font-mono text-slate-200">
                  {c.lat.toFixed(4)}°, {c.lon.toFixed(3)}° · Elev {Math.round(c.elevM)} m ·{' '}
                  {c.isRefined ? '240 m refined' : '1.2 km cell peak'}
                </div>

                <div className="mt-2 grid grid-cols-4 gap-2 rounded-lg bg-slate-900/80 px-2.5 py-1.5 font-mono text-xs">
                  <div>
                    <div className="text-slate-400">Sun</div>
                    <div className="text-amber-300">{c.sunVisiblePct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Earth</div>
                    <div className="text-sky-300">{c.earthVisiblePct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Joint</div>
                    <div className="text-emerald-300">{c.bothVisiblePct.toFixed(1)}%</div>
                  </div>
                  <div>
                    <div className="text-slate-400">Slope</div>
                    <div className="text-slate-200">{c.slopeDeg.toFixed(1)}°</div>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs text-slate-400">
                    Max dark {(c.maxDarkHours / 24).toFixed(1)}d · 1 km &le;5°:{' '}
                    {c.flat1kmPct !== null ? `${c.flat1kmPct.toFixed(0)}%` : 'n/a'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onSelectCandidate(c)}
                      className="inline-flex items-center gap-1 rounded-lg bg-violet-500/20 px-2.5 py-1 text-xs font-medium text-violet-200 ring-1 ring-violet-400/40 hover:bg-violet-500/30"
                    >
                      <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                      Open as Pin
                    </button>
                    <button
                      type="button"
                      onClick={() => onCompareCandidate(c)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-200 hover:border-sky-400/50 hover:text-sky-200"
                    >
                      <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                      Set B
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

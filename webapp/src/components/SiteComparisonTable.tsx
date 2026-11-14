import React, { useEffect, useMemo, useState } from 'react';
import { ArrowUpDown, Cpu, GitCompare, Info, Layers, ShieldAlert, Table2 } from 'lucide-react';
import { computeInstantAndWindow, DEFAULT_WINDOW_HOURS, interpolateHorizon } from '../lib/lunarMath';
import { computeViability, SCORE_FORMULA_TEXT } from '../lib/scoring';
import type {
  ComputeOptions,
  EphemerisData,
  MissionStatus,
  SiteCandidate,
  SiteData,
  SiteMetrics2m,
} from '../types/lunar';
import { GlossaryTerm } from './GlossaryTerm';
import { formatSiteElevation, missionStatusMeta } from './appHelpers';

export interface SiteComparisonTableProps {
  sites: SiteData[];
  selectedSite: SiteData;
  compareSite: SiteData | null;
  onSelectSite: (id: string) => void;
  onToggleCompare: (id: string) => void;
  ephemeris?: EphemerisData | null;
  timeIdx?: number;
  mastHeightM?: number;
  windowHours?: number;
  computeOptions?: ComputeOptions;
  candidates?: SiteCandidate[];
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidate: SiteCandidate) => void;
  onCompareCandidate?: (candidate: SiteCandidate) => void;
  onOpenCompareView?: () => void;
}

type SortKey = 'viability' | 'sun' | 'earth' | 'both' | 'dark' | 'slope';
type TableMetricMode = 'baseline' | 'window';
type StatusFilter = 'ALL' | MissionStatus | 'computed';

interface UnifiedRow {
  rowKey: string;
  kind: 'curated' | 'computed';
  site?: SiteData;
  candidate?: SiteCandidate;
  name: string;
  subName: string;
  category: string;
  missionStatus?: MissionStatus;
  archetype: string | null;
  lat: number;
  lon: number;
  elevLabel: string;
  hasTerrain: boolean;
  viabilityScore: number | null;
  sunPct: number;
  sunTimePct: number;
  earthPct: number;
  bothPct: number;
  maxDarkDays: number;
  areaLe5Pct: number | null;
  localSlopeDeg: number | null;
  driftLabel: string;
  metricBadge: string;
}

function compareNullable(a: number | null, b: number | null, descending: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return descending ? b - a : a - b;
}

export const SiteComparisonTable: React.FC<SiteComparisonTableProps> = ({
  sites,
  selectedSite,
  compareSite,
  onSelectSite,
  onToggleCompare,
  ephemeris = null,
  timeIdx = 0,
  mastHeightM = 2.0,
  windowHours = DEFAULT_WINDOW_HOURS,
  computeOptions,
  candidates = [],
  selectedCandidateId = null,
  onSelectCandidate,
  onCompareCandidate,
  onOpenCompareView,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('viability');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [metricMode, setMetricMode] = useState<TableMetricMode>('baseline');

  // Auto-align mode when user runs Mode B live window scan vs Mode A baseline scan
  const hasModeBCandidates = candidates.some((c) => c.mode === 'B');
  useEffect(() => {
    if (candidates.length === 0) return;
    setMetricMode(hasModeBCandidates && ephemeris ? 'window' : 'baseline');
  }, [hasModeBCandidates, candidates.length, ephemeris]);

  const effectiveMode: TableMetricMode =
    metricMode === 'window' && ephemeris ? 'window' : 'baseline';

  const earthMaskDeg = computeOptions?.earthMaskDeg ?? 0;

  const categories = useMemo(() => {
    const base = ['ALL', ...Array.from(new Set(sites.map((s) => s.category)))];
    if (candidates.length > 0) base.push('Computed');
    return base;
  }, [sites, candidates.length]);

  const windowSummariesBySiteId = useMemo(() => {
    if (effectiveMode !== 'window' || !ephemeris) return new Map<string, SiteMetrics2m>();
    const map = new Map<string, SiteMetrics2m>();
    for (const s of sites) {
      const hz = interpolateHorizon(s, mastHeightM);
      const { summary } = computeInstantAndWindow(
        ephemeris,
        s,
        hz,
        timeIdx,
        windowHours,
        computeOptions,
      );
      const pseudoMetrics: SiteMetrics2m = {
        sun_no_terrain_pct: s.metrics_2m.sun_no_terrain_pct,
        sun_time_pct: Number(summary.sunTimePct.toFixed(1)),
        sun_visible_pct: Number(summary.sunPct.toFixed(1)),
        earth_visible_pct: Number(summary.earthPct.toFixed(1)),
        both_visible_pct: Number(summary.bothPct.toFixed(1)),
        longest_sun_days: s.metrics_2m.longest_sun_days,
        max_dark_days: Number((summary.maxDarkHours / 24).toFixed(1)),
        earth_max_gap_days: s.metrics_2m.earth_max_gap_days,
        viability_score: null,
        archetype: s.metrics_2m.archetype,
      };
      pseudoMetrics.viability_score = computeViability(pseudoMetrics, s.terrain_stats);
      map.set(s.id, pseudoMetrics);
    }
    return map;
  }, [effectiveMode, ephemeris, sites, mastHeightM, timeIdx, windowHours, computeOptions]);

  const allRows = useMemo<UnifiedRow[]>(() => {
    const curatedRows: UnifiedRow[] = sites.map((s) => {
      const m =
        effectiveMode === 'window'
          ? (windowSummariesBySiteId.get(s.id) ?? s.metrics_2m)
          : s.metrics_2m;
      const hasTerrain = s.terrain_source !== 'NONE' && s.terrain_stats !== null;
      return {
        rowKey: `site:${s.id}`,
        kind: 'curated',
        site: s,
        name: s.short_name,
        subName: s.program,
        category: s.category,
        missionStatus: s.mission_status,
        archetype: m.archetype,
        lat: s.lat,
        lon: s.lon,
        elevLabel: formatSiteElevation(s),
        hasTerrain,
        viabilityScore: hasTerrain ? m.viability_score : null,
        sunPct: m.sun_visible_pct,
        sunTimePct: m.sun_time_pct,
        earthPct: m.earth_visible_pct,
        bothPct: m.both_visible_pct,
        maxDarkDays: m.max_dark_days,
        areaLe5Pct: hasTerrain && s.terrain_stats ? s.terrain_stats.pct_safe_hls_le_5deg : null,
        localSlopeDeg: hasTerrain ? s.local_slope_deg : null,
        driftLabel:
          s.terrain_source === 'LOLA_240M' && s.drift_240m
            ? `${s.drift_240m.sun_min_pct}–${s.drift_240m.sun_max_pct}%`
            : 'n/a',
        metricBadge: effectiveMode === 'window' ? 'Active Window' : 'Full Epoch @ 2 m',
      };
    });

    const candidateRows: UnifiedRow[] = candidates.map((c) => {
      const flatArea = c.flatBoxPct ?? c.flat1kmPct ?? null;
      const score =
        c.viabilityScore ??
        (c.flatBoxPct !== null
          ? computeViability(
              {
                sun_no_terrain_pct: 50,
                sun_time_pct: c.sunTimePct,
                sun_visible_pct: c.sunVisiblePct,
                earth_visible_pct: c.earthVisiblePct,
                both_visible_pct: c.bothVisiblePct,
                longest_sun_days: 0,
                max_dark_days: Number((c.maxDarkHours / 24).toFixed(1)),
                earth_max_gap_days: 0,
                viability_score: null,
                archetype: null,
              },
              {
                elev_min_m: c.elevM,
                elev_median_m: c.elevM,
                elev_max_m: c.elevM,
                elev_relief_m: 0,
                slope_mean_deg: c.slopeDeg,
                slope_median_deg: c.slopeDeg,
                slope_p90_deg: c.slopeDeg,
                pct_safe_hls_le_5deg: c.flatBoxPct,
                pct_rover_le_15deg: 100,
              },
            )
          : null);
      return {
        rowKey: `cand:${c.id}`,
        kind: 'computed',
        candidate: c,
        name: `#${c.rank} (${c.lat.toFixed(3)}°, ${c.lon.toFixed(2)}°)`,
        subName: c.artemisCode
          ? `Mode ${c.mode} · Region ${c.artemisCode}`
          : `Mode ${c.mode} · LOLA/Horizons`,
        category: 'Computed',
        archetype: c.isRefined ? '240 m Refined Cell' : '1.2 km Cell Peak',
        lat: c.lat,
        lon: c.lon,
        elevLabel: `${Math.round(c.elevM).toLocaleString('en-US')} m`,
        hasTerrain: true,
        viabilityScore: score,
        sunPct: c.sunVisiblePct,
        sunTimePct: c.sunTimePct,
        earthPct: c.earthVisiblePct,
        bothPct: c.bothVisiblePct,
        maxDarkDays: Number((c.maxDarkHours / 24).toFixed(1)),
        areaLe5Pct: flatArea,
        localSlopeDeg: c.slopeDeg,
        driftLabel: 'n/a',
        metricBadge: c.mode === 'B' ? 'Window Scan' : 'Full Epoch @ 2 m',
      };
    });

    return [...curatedRows, ...candidateRows];
  }, [sites, candidates, effectiveMode, windowSummariesBySiteId]);

  const filteredAndSorted = useMemo(() => {
    const filtered = allRows.filter((row) => {
      if (categoryFilter !== 'ALL' && row.category !== categoryFilter) return false;
      if (statusFilter === 'computed') return row.kind === 'computed';
      if (statusFilter !== 'ALL') return row.missionStatus === statusFilter;
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'sun':
          return b.sunPct - a.sunPct;
        case 'earth':
          return b.earthPct - a.earthPct;
        case 'both':
          return b.bothPct - a.bothPct;
        case 'dark':
          return a.maxDarkDays - b.maxDarkDays;
        case 'slope':
          return compareNullable(a.areaLe5Pct, b.areaLe5Pct, true);
        default:
          return compareNullable(a.viabilityScore, b.viabilityScore, true);
      }
    });
  }, [allRows, categoryFilter, statusFilter, sortKey]);

  return (
    <section
      aria-label="Multi-Site and Candidate Directory"
      className="rounded-2xl border border-slate-800/90 bg-slate-900/80 p-4 shadow-lg space-y-4"
    >
      {/* Header & Mode Toggle (CMP-3) */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-slate-100">
            <Table2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
            <span>
              Site &amp; Candidate Directory (
              {effectiveMode === 'window'
                ? `${Math.round(windowHours / 24)}d Active Window @ ${mastHeightM.toFixed(1)} m Mast, ${earthMaskDeg.toFixed(0)}° Mask`
                : 'Full-Ephemeris Baseline @ 2 m Mast, 0° Mask'}
              )
            </span>
          </h2>
          <p className="text-xs text-slate-300">
            Click a curated site or <span className="font-semibold text-violet-300">Computed</span>{' '}
            candidate row to load it in the Explorer, or assign it to{' '}
            <span className="font-semibold text-sky-300">Scenario B</span> for side-by-side comparison.
          </p>
        </div>

        {ephemeris && (
          <div
            role="group"
            aria-label="Table calculation mode"
            className="inline-flex rounded-xl border border-slate-700 bg-slate-950/80 p-1 text-xs"
          >
            <button
              type="button"
              onClick={() => setMetricMode('baseline')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                effectiveMode === 'baseline'
                  ? 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-400/50'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Full Ephemeris Baseline (2 m)
            </button>
            <button
              type="button"
              onClick={() => setMetricMode('window')}
              className={`rounded-lg px-3 py-1.5 font-medium transition ${
                effectiveMode === 'window'
                  ? 'bg-sky-500/20 text-sky-200 ring-1 ring-sky-400/50'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              Active Window &amp; Mast ({mastHeightM.toFixed(1)} m)
            </button>
          </div>
        )}
      </div>

      {/* Filters: Category + Mission Status */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-slate-800/80 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-slate-400">
            <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Group:
          </span>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                categoryFilter === cat
                  ? cat === 'Computed'
                    ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/50'
                    : 'bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/40'
                  : 'bg-slate-800/90 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {cat === 'ALL'
                ? `All (${allRows.length})`
                : cat === 'Computed'
                  ? `Computed (${candidates.length})`
                  : cat}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="status-filter" className="text-xs font-medium text-slate-400">
            Mission Status:
          </label>
          <select
            id="status-filter"
            name="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-200 focus:border-amber-400 focus:outline-none"
          >
            <option value="ALL">All Statuses</option>
            <option value="landed">Landed</option>
            <option value="attempted">Attempted</option>
            <option value="planned">Planned</option>
            <option value="candidate_region">Candidate Region</option>
            <option value="reference">Reference</option>
            {candidates.length > 0 && <option value="computed">Computed Candidates</option>}
          </select>
        </div>
      </div>

      {/* Active Comparison Quick Banner */}
      {compareSite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/35 bg-sky-950/25 px-3.5 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-semibold text-amber-300">
              Scenario A: <span className="text-slate-100">{selectedSite.short_name}</span>
            </span>
            <span className="text-slate-500">vs</span>
            <span className="font-semibold text-sky-300">
              Scenario B: <span className="text-slate-100">{compareSite.short_name}</span>
            </span>
          </div>
          {onOpenCompareView && (
            <button
              type="button"
              onClick={onOpenCompareView}
              className="rounded-lg bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-sky-200 ring-1 ring-sky-400/40 transition hover:bg-sky-500/30"
            >
              Open Side-by-Side Comparison &rarr;
            </button>
          )}
        </div>
      )}

      {/* Formula & Baseline Caveat Note (DATA-2, SCI-6) */}
      <div className="flex flex-wrap items-start gap-2 rounded-xl border border-slate-800 bg-slate-950/60 px-3 py-2 text-xs text-slate-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
        <div className="space-y-0.5">
          <div>
            <strong>Index Formula:</strong> {SCORE_FORMULA_TEXT}{' '}
            <GlossaryTerm termKey="viability" label="Details" />
          </div>
          <div className="text-slate-400">
            <strong>240 m Slope Caveat:</strong> Column &ldquo;≤5° Area (240 m)&rdquo; reports percentage of
            a 30&times;30 km box (or 1 km search area for unrefined candidates) at 240 m LOLA baseline —{' '}
            <strong>not lander-scale touchdown clearance</strong>. Sites outside 75°S show{' '}
            <code className="text-slate-200">n/a</code>.
          </div>
        </div>
      </div>

      {/* Sortable Responsive Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-800">
        <table className="w-full min-w-[820px] text-left text-xs">
          <thead className="bg-slate-950/90 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <tr>
              <th className="px-3 py-2.5">Site / Coordinate</th>
              <th className="px-2.5 py-2.5">Status / Archetype</th>
              <th className="px-2.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setSortKey('viability')}
                  className={`inline-flex items-center gap-1 hover:text-amber-300 ${
                    sortKey === 'viability' ? 'text-amber-300' : ''
                  }`}
                >
                  {effectiveMode === 'window' ? 'Win Index' : 'Score'}
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </th>
              <th className="px-2.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setSortKey('sun')}
                  className={`inline-flex items-center gap-1 hover:text-amber-300 ${
                    sortKey === 'sun' ? 'text-amber-300' : ''
                  }`}
                >
                  {effectiveMode === 'window' ? 'Win Sun %' : 'Sun Disk %'}
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </th>
              <th className="px-2.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setSortKey('earth')}
                  className={`inline-flex items-center gap-1 hover:text-sky-300 ${
                    sortKey === 'earth' ? 'text-sky-300' : ''
                  }`}
                >
                  {effectiveMode === 'window' ? 'Win Earth %' : 'Earth DTE %'}
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </th>
              <th className="px-2.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setSortKey('both')}
                  className={`inline-flex items-center gap-1 hover:text-emerald-300 ${
                    sortKey === 'both' ? 'text-emerald-300' : ''
                  }`}
                >
                  Joint %
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </th>
              <th className="px-2.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setSortKey('dark')}
                  className={`inline-flex items-center gap-1 hover:text-rose-300 ${
                    sortKey === 'dark' ? 'text-rose-300' : ''
                  }`}
                >
                  Max Night
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </th>
              <th className="px-2.5 py-2.5">
                <button
                  type="button"
                  onClick={() => setSortKey('slope')}
                  className={`inline-flex items-center gap-1 hover:text-emerald-300 ${
                    sortKey === 'slope' ? 'text-emerald-300' : ''
                  }`}
                >
                  &le;5° Area (240 m)
                  <ArrowUpDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </th>
              <th className="px-2.5 py-2.5">±240m Drift</th>
              <th className="px-2.5 py-2.5 text-right">Scenario B</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/75 bg-slate-900/45">
            {filteredAndSorted.map((row) => {
              const isSel =
                row.kind === 'curated'
                  ? row.site?.id === selectedSite.id
                  : row.candidate?.id === selectedCandidateId;
              const isCmp = row.kind === 'curated' && compareSite?.id === row.site?.id;
              const statusBadge =
                row.kind === 'curated' ? missionStatusMeta(row.missionStatus) : null;

              return (
                <tr
                  key={row.rowKey}
                  onClick={() => {
                    if (row.kind === 'curated' && row.site) {
                      onSelectSite(row.site.id);
                    } else if (row.kind === 'computed' && row.candidate && onSelectCandidate) {
                      onSelectCandidate(row.candidate);
                    }
                  }}
                  className={`cursor-pointer transition hover:bg-slate-800/70 ${
                    isSel
                      ? 'bg-amber-500/12'
                      : isCmp
                        ? 'bg-sky-500/12'
                        : row.kind === 'computed'
                          ? 'bg-violet-950/15'
                          : ''
                  }`}
                >
                  <td className="px-3 py-2.5 font-medium text-slate-100">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {isSel && <span className="h-2 w-2 rounded-full bg-amber-400" />}
                      {isCmp && <span className="h-2 w-2 rounded-full bg-sky-400" />}
                      {row.kind === 'computed' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2 py-0.5 text-xs font-semibold text-violet-200 ring-1 ring-violet-400/40">
                          <Cpu className="h-3 w-3" aria-hidden="true" /> Computed
                        </span>
                      )}
                      <span>{row.name}</span>
                    </div>
                    <div className="mt-0.5 font-mono text-xs text-slate-400">
                      {row.lat.toFixed(2)}°, {row.lon.toFixed(2)}° · {row.elevLabel}
                    </div>
                  </td>

                  <td className="px-2.5 py-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {statusBadge ? (
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadge.badgeClass}`}
                        >
                          {statusBadge.label}
                        </span>
                      ) : (
                        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-200">
                          {row.metricBadge}
                        </span>
                      )}
                      {!row.hasTerrain && (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs text-slate-300">
                          <ShieldAlert className="h-3 w-3 text-slate-400" aria-hidden="true" />
                          No DEM
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {row.archetype ?? 'n/a — no terrain data'}
                    </div>
                  </td>

                  <td className="px-2.5 py-2.5 font-mono font-bold text-amber-300">
                    {row.viabilityScore !== null ? row.viabilityScore.toFixed(1) : 'n/a'}
                  </td>

                  <td className="px-2.5 py-2.5 font-mono text-amber-200">
                    <div>{row.sunPct.toFixed(1)}%</div>
                    <div className="text-xs text-slate-400">Time {row.sunTimePct.toFixed(1)}%</div>
                  </td>

                  <td className="px-2.5 py-2.5 font-mono text-sky-300">
                    {row.earthPct.toFixed(1)}%
                  </td>

                  <td className="px-2.5 py-2.5 font-mono text-emerald-300">
                    {row.bothPct.toFixed(1)}%
                  </td>

                  <td className="px-2.5 py-2.5 font-mono text-rose-300">
                    {row.maxDarkDays.toFixed(1)} d
                  </td>

                  <td className="px-2.5 py-2.5 font-mono text-emerald-200">
                    {row.areaLe5Pct !== null ? (
                      <div>
                        <div>{row.areaLe5Pct.toFixed(0)}%</div>
                        {row.localSlopeDeg !== null && (
                          <div className="text-xs text-slate-400">
                            {row.localSlopeDeg.toFixed(1)}° pt
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400" title="n/a — no terrain data for this location">
                        n/a
                      </span>
                    )}
                  </td>

                  <td className="px-2.5 py-2.5 font-mono text-xs text-slate-300">
                    {row.driftLabel}
                  </td>

                  <td className="px-2.5 py-2.5 text-right">
                    {row.kind === 'curated' && row.site ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCompare(row.site!.id);
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition ${
                          isCmp
                            ? 'bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/50'
                            : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                        }`}
                      >
                        <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                        {isCmp ? 'In B' : 'Compare'}
                      </button>
                    ) : row.candidate && onCompareCandidate ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCompareCandidate(row.candidate!);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500/20 px-2.5 py-1.5 text-xs font-medium text-violet-200 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30"
                      >
                        <GitCompare className="h-3.5 w-3.5" aria-hidden="true" />
                        Set B
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
};

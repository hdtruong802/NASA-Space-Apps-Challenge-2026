import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Code2,
  Database,
  ExternalLink,
  FileText,
  Scale,
} from 'lucide-react';
import {
  ECLIPSE_ASSUMPTION_TEXT,
  POWER_ASSUMPTION_TEXT,
  RISE_SET_DEFINITION_TEXT,
} from '../lib/lunarMath';
import { SCORE_FORMULA_TEXT } from '../lib/scoring';
import type { EphemerisData, SiteData } from '../types/lunar';
import { AccessibleDialog } from './AccessibleDialog';
import { GlossaryTerm } from './GlossaryTerm';

export interface AboutModalProps {
  open: boolean;
  onClose: () => void;
  ephemeris: EphemerisData;
  sitesCount: number;
  sites?: SiteData[];
  dataVersion: string;
  dataGeneratedUtc?: string;
}

interface LiteratureBenchmarkRow {
  siteId: string;
  label: string;
  solverNotes: string;
  mazarico2011: string;
  glaeser2018: string;
  pds240m: string;
}

const LITERATURE_BENCHMARKS: LiteratureBenchmarkRow[] = [
  {
    siteId: 'connecting_ridge',
    label: 'Connecting Ridge (C1)',
    solverNotes: '-89.450°, -137.310°',
    mazarico2011: '89.0% mean (92.7% vis), 141.12 h max shadow (0 m)',
    glaeser2018: '88.0% (92.1% vis), 112 h max shadow (2 m / 20 m)',
    pds240m: '93.48% (±1 km max 93.48%)',
  },
  {
    siteId: 'shackleton_rim',
    label: 'Shackleton Rim (S)',
    solverNotes: '-89.796°, 54.462° vs S (-89.78°, -155.73°)',
    mazarico2011: '86.7% mean (90.5% vis, 0 m)',
    glaeser2018: '85.5% S0 / 82.1% S1, 66–65 h max shadow (2 m / 20 m)',
    pds240m: '81.76% (60 m ±1 km max 78.08%)',
  },
  {
    siteId: 'peak_near_shackleton',
    label: 'Peak Near Shackleton',
    solverNotes: '-88.800°, 123.500°',
    mazarico2011: '—',
    glaeser2018: '—',
    pds240m: '56.98% (±1 km max 88.19%)',
  },
  {
    siteId: 'malapert_summit',
    label: 'Malapert Massif Summit',
    solverNotes: '-85.990°, 2.090°',
    mazarico2011: '—',
    glaeser2018: '—',
    pds240m: '72.98% (±1 km max 82.01%)',
  },
  {
    siteId: 'shackleton_psr',
    label: 'Shackleton PSR Floor',
    solverNotes: '-89.630°, 118.470°',
    mazarico2011: '—',
    glaeser2018: '—',
    pds240m: '0.00% across 240 m & 60 m PDS (±1 km: 0.00%)',
  },
];

export const AboutModal: React.FC<AboutModalProps> = ({
  open,
  onClose,
  ephemeris,
  sitesCount,
  sites = [],
  dataVersion,
  dataGeneratedUtc,
}) => {
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const startDate = ephemeris.t0_utc.slice(0, 10);
  const endDate = new Date(
    Date.parse(ephemeris.t0_utc) + Math.max(0, ephemeris.n - 1) * ephemeris.dt_hours * 3600 * 1000,
  )
    .toISOString()
    .slice(0, 10);

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      eyebrow={
        <>
          <FileText className="h-4 w-4" aria-hidden="true" />
          <span>About, Methodology &amp; Validation</span>
        </>
      }
      title="Data Provenance, Scientific Definitions &amp; Limitations"
      maxWidthClass="max-w-4xl"
    >
      {/* Top Dataset & Direction Check Summary */}
      <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 p-4 text-xs text-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Sun &amp; Earth Direction Checked vs JPL Horizons DE441 (~
              {ephemeris.validation.earth_max_err_deg.toFixed(3)}° max Earth error)
            </span>
          </div>
          <span className="rounded-md bg-slate-900/90 px-2.5 py-1 font-mono text-xs text-slate-300">
            Dataset {dataVersion}
            {dataGeneratedUtc ? ` · Built ${dataGeneratedUtc.slice(0, 10)}` : ''}
          </span>
        </div>
        <p className="mt-2 leading-relaxed">
          Evaluates <span className="font-mono text-slate-100">{sitesCount}</span> curated sites plus
          arbitrary client-probed coordinates over{' '}
          <span className="font-mono text-slate-100">{ephemeris.n.toLocaleString('en-US')}</span>{' '}
          hourly{' '}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-amber-300">MOON_ME</code> steps (
          <span className="font-mono">{startDate}</span> to{' '}
          <span className="font-mono">{endDate}</span> UTC). Maximum topocentric direction
          difference across {ephemeris.validation.sites_checked?.length ?? 6} JPL Horizons
          verification sites:{' '}
          <span className="font-mono text-emerald-300">
            {ephemeris.validation.sun_max_err_deg.toFixed(5)}°
          </span>{' '}
          (Sun) and{' '}
          <span className="font-mono text-emerald-300">
            {ephemeris.validation.earth_max_err_deg.toFixed(5)}°
          </span>{' '}
          (Earth).
        </p>
      </div>

      {/* 1. Data Sources Used vs Reference Targets */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <Database className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>1. Primary Data Products Ingested vs. Reference Targets</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-semibold">Dataset</th>
                <th className="py-2 pr-3 font-semibold">Coverage &amp; Role</th>
                <th className="py-2 font-semibold">Authoritative Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70 text-slate-300">
              <tr>
                <td className="py-2.5 pr-3 font-semibold text-slate-100">
                  JPL Horizons System (DE441 / MOON_ME)
                </td>
                <td className="py-2.5 pr-3">
                  Hourly sub-solar/sub-Earth points, Earth–Moon slant distance, and topocentric
                  validation checkpoints ({startDate} to {endDate} UTC).
                </td>
                <td className="py-2.5">
                  <a
                    href="https://ssd.jpl.nasa.gov/api/horizons.api"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-300 underline hover:text-sky-200"
                  >
                    <span>ssd.jpl.nasa.gov/api/horizons.api</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-semibold text-slate-100">
                  NASA LRO LOLA GDR (LDEM_75S_240M)
                </td>
                <td className="py-2.5 pr-3">
                  240 m/px polar stereographic lunar South Pole elevation model (75°S–90°S,{' '}
                  <span className="font-mono">R0 = 1,737.4 km</span>) used for horizon ray-marching,
                  slopes, and 1.2 km outer coarse grid.
                </td>
                <td className="py-2.5">
                  <a
                    href="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sky-300 underline hover:text-sky-200"
                  >
                    <span>PDS Geosciences LOLA GDR</span>
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                </td>
              </tr>
              <tr>
                <td className="py-2.5 pr-3 font-semibold text-slate-100">
                  Artemis III 2024 Candidate Regions
                </td>
                <td className="py-2.5 pr-3">
                  9 official 2024 region polygons (<code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">A3_9regions</code>) and centroids plotted on the South Pole map.
                </td>
                <td className="space-y-1 py-2.5">
                  <div>
                    <a
                      href="https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-300 underline hover:text-sky-200"
                    >
                      <span>NASA Artemis III 2024 Update</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                  <div>
                    <a
                      href="https://files.actgate.com/lunar/A3_9regions-lonlat-simplified.geojson"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sky-300 underline hover:text-sky-200"
                    >
                      <span>LROC QuickMap A3_9regions GeoJSON</span>
                      <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="rounded-lg border border-slate-800 bg-slate-900/70 p-2.5 text-slate-300">
          <strong>Distinction — Datasets vs. Reference Targets:</strong> Historical and
          international sites (Apollo, CLPS, Chandrayaan-3, SLIM, Chang&apos;e-4, planned concepts)
          are plotted strictly as coordinate reference targets computed over NASA Horizons and LOLA
          geometry. Per-site coordinate provenance URLs are shown on each site&apos;s Target Card.
        </p>
      </section>

      {/* 2. Metric Definitions & Physical Equations */}
      <section className="space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
        <div className="flex items-center gap-2 text-sm font-semibold text-sky-300">
          <Scale className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>2. Operational Definitions &amp; Physical Assumptions</span>
        </div>

        <ul className="space-y-2 leading-relaxed">
          <li>
            <strong>Rise, Set &amp; DTE Mask:</strong> {RISE_SET_DEFINITION_TEXT}
          </li>
          <li>
            <strong>
              <GlossaryTerm termKey="array_power" label="Relative Array Output" /> (Model):
            </strong>{' '}
            {POWER_ASSUMPTION_TEXT}
          </li>
          <li>
            <strong>Geometric Solar Eclipses:</strong> {ECLIPSE_ASSUMPTION_TEXT}
          </li>
          <li>
            <strong>
              <GlossaryTerm termKey="viability" label="Composite Viability Index" />:
            </strong>{' '}
            {SCORE_FORMULA_TEXT}
          </li>
          <li>
            <strong>
              <GlossaryTerm termKey="smooth_sphere" label="Smooth Sphere Reference" />:
            </strong>{' '}
            Featureless spherical horizon dip is computed as{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-sky-200">
              -acos(R0 / (R0 + h_mast))
            </code>{' '}
            (approximately <span className="font-mono">-0.0869°</span> at a 2 m mast).
          </li>
        </ul>
      </section>

      {/* 3. Mazarico et al. (2011), Gläser et al. (2018) & NASA PDS Illumination Cross-Check */}
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
        <div className="text-sm font-semibold text-emerald-300">
          3. Literature &amp; NASA PDS Illumination Cross-Check
        </div>
        <p className="leading-relaxed">
          Topocentric Sun/Earth azimuth and elevation calculations match JPL Horizons within{' '}
          <span className="font-mono text-emerald-300">
            {ephemeris.validation.sun_max_err_deg.toFixed(5)}°
          </span>{' '}
          (Sun) and{' '}
          <span className="font-mono text-emerald-300">
            {ephemeris.validation.earth_max_err_deg.toFixed(5)}°
          </span>{' '}
          (Earth). Full solar illumination percentages depend on terrain sampling resolution (240 m
          vs. 20 m LOLA), receiver height (2 m mast vs. 0 m surface), solar-disc fraction vs.
          any-disc visibility, and the {startDate.slice(0, 4)}–{endDate.slice(0, 4)} epoch vs. full
          18.6-year lunar nodal precession.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2 pr-3 font-semibold">Benchmark Site</th>
                <th className="py-2 pr-3 font-semibold">
                  This App ({startDate.slice(0, 4)}–{endDate.slice(0, 4)}, 240 m @ 2 m)
                </th>
                <th className="py-2 pr-3 font-semibold">Mazarico et al. (2011) (240 m @ 0 m)</th>
                <th className="py-2 pr-3 font-semibold">Gläser et al. (2018) (20 m @ 2 m)</th>
                <th className="py-2 font-semibold">NASA PDS 240 m (18.6 yr, 0 m)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {LITERATURE_BENCHMARKS.map((row) => {
                const liveSite = sitesById.get(row.siteId);
                return (
                  <tr key={row.siteId}>
                    <td className="py-2 pr-3 align-top">
                      <div className="font-semibold text-slate-100">{row.label}</div>
                      <div className="font-mono text-xs text-slate-400">{row.solverNotes}</div>
                    </td>
                    <td className="py-2 pr-3 align-top font-mono text-emerald-300">
                      {liveSite ? (
                        <div>
                          {liveSite.metrics_2m.sun_time_pct.toFixed(1)}% (
                          {liveSite.metrics_2m.sun_visible_pct.toFixed(1)}% vis) · max dark{' '}
                          {Math.round(liveSite.metrics_2m.max_dark_days * 24)} h
                        </div>
                      ) : (
                        <span className="text-slate-400">Loaded in workspace</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 align-top text-slate-300">{row.mazarico2011}</td>
                    <td className="py-2 pr-3 align-top text-slate-300">{row.glaeser2018}</td>
                    <td className="py-2 align-top text-slate-300">{row.pds240m}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ul className="space-y-1.5 rounded-lg border border-slate-800 bg-slate-900/70 p-3 text-slate-300">
          <li>
            <strong>Mazarico et al. (2011):</strong> <em>Icarus</em> 211:1066–1081 (
            <a
              href="https://doi.org/10.1016/j.icarus.2010.10.030"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 underline hover:text-sky-200"
            >
              doi:10.1016/j.icarus.2010.10.030
            </a>
            ) — foundational 240 m/px LOLA 18.6-year polar illumination analysis.
          </li>
          <li>
            <strong>De Rosa et al. (2012):</strong> <em>Planet. Space Sci.</em> 74:224–246 (
            <a
              href="https://doi.org/10.1016/j.pss.2012.08.002"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 underline hover:text-sky-200"
            >
              doi:10.1016/j.pss.2012.08.002
            </a>
            ) · <strong>Gläser et al. (2014):</strong> <em>Icarus</em> 243:78–90 ·{' '}
            <strong>Gläser et al. (2018):</strong> <em>Planet. Space Sci.</em> 162:170–178 (
            <a
              href="https://doi.org/10.1016/j.pss.2017.07.006"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 underline hover:text-sky-200"
            >
              doi:10.1016/j.pss.2017.07.006
            </a>
            ).
          </li>
          <li>
            <strong>Barker et al. (2021, 2023):</strong>{' '}
            <a
              href="https://doi.org/10.1016/j.pss.2020.105119"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 underline hover:text-sky-200"
            >
              doi:10.1016/j.pss.2020.105119
            </a>{' '}
            &amp;{' '}
            <a
              href="https://doi.org/10.3847/PSJ/acf3e1"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 underline hover:text-sky-200"
            >
              doi:10.3847/PSJ/acf3e1
            </a>{' '}
            (5 m LOLA illumination &amp; terrain error modeling).
          </li>
          <li>
            <strong>NASA PDS LOLA Illumination Products:</strong>{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
              AVGVISIB_65S_240M_201608.IMG
            </code>{' '}
            &amp;{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">
              AVGVISIB_85S_060M_201608.IMG
            </code>{' '}
            (
            <a
              href="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 underline hover:text-sky-200"
            >
              PDS LOLA illumination maps
            </a>
            ).
          </li>
        </ul>
      </section>

      {/* 4. Known Limitations */}
      <section className="space-y-2 rounded-xl border border-amber-500/35 bg-amber-950/15 p-4 text-xs text-slate-200">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>4. Known Limitations &amp; Operational Scope</span>
        </div>
        <ul className="list-disc space-y-1.5 pl-5 text-slate-300">
          <li>
            <strong>240 m/px terrain baseline:</strong>{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">LDEM_75S_240M</code>{' '}
            does not resolve meter-scale boulders, small craters, or footpad slopes; it does not
            certify touchdown clearance.
          </li>
          <li>
            <strong>75°S DEM coverage boundary:</strong> Coordinates north of 75°S lack polar LOLA
            horizon tiles here (`terrain_source = &quot;NONE&quot;`) and report{' '}
            <span className="font-mono">n/a</span> for slope, low-slope box stats, ±240 m drift, and
            Composite Viability Index.
          </li>
          <li>
            <strong>Hourly ephemeris quantization:</strong> Step resolution is{' '}
            <span className="font-mono">{ephemeris.dt_hours} h</span>; horizon crossings are
            quantized to hourly grid boundaries.
          </li>
          <li>
            <strong>Geometric DTE &amp; Eclipses only:</strong> DTE excludes Deep Space Network
            antenna scheduling, RF link margin, and multipath; eclipses omit terrestrial atmospheric
            refraction.
          </li>
        </ul>
      </section>

      {/* 5. Open-Source Libraries & AI/SI Disclosure Placeholder */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Code2 className="h-4 w-4 text-slate-300" aria-hidden="true" />
            <span>5. Open-Source Libraries</span>
          </div>
          <ul className="mt-2 space-y-1 text-slate-300">
            <li>
              <span className="font-mono text-slate-100">react / react-dom</span> (^18.3.1, MIT)
            </li>
            <li>
              <span className="font-mono text-slate-100">lucide-react</span> (^0.468.0, ISC)
            </li>
            <li>
              <span className="font-mono text-slate-100">tailwindcss / @tailwindcss/vite</span>{' '}
              (^4.0.0, MIT)
            </li>
            <li>
              <span className="font-mono text-slate-100">vite / @vitejs/plugin-react</span> (MIT)
            </li>
            <li>
              <span className="font-mono text-slate-100">typescript</span> (~5.6.2, Apache-2.0) ·{' '}
              <span className="font-mono text-slate-100">vitest</span> (^3.2.7, MIT)
            </li>
            <li>
              Python offline pipeline:{' '}
              <span className="font-mono text-slate-100">numpy, pandas, scipy</span>{' '}
              (BSD-3-Clause), <span className="font-mono text-slate-100">requests</span>{' '}
              (Apache-2.0)
            </li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-xs text-slate-300">
          <div className="text-sm font-semibold text-amber-300">
            6. License &amp; Use of AI / Super Intelligence (SI)
          </div>
          <ul className="mt-2 space-y-1.5 leading-relaxed text-slate-300">
            <li>
              <strong>Open-Source License:</strong> Apache License 2.0 (
              <span className="font-mono text-slate-100">Apache-2.0</span>, Copyright 2026 Team
              VeriFour).
            </li>
            <li>
              <strong>AI Coding &amp; Verification Assistance:</strong> Built with{' '}
              <strong>Antigravity</strong> multi-agent swarm (Gemini &amp; Claude models, with Chrome
              DevTools QA) and pre-event prototype benchmarking using Antigravity IDE / Gemini and
              Claude Code for code, tests, and documentation.
            </li>
            <li>
              <strong>Data &amp; Imagery Integrity:</strong> Zero AI-generated images, videos, or
              synthetic terrain textures are used; all elevation, horizon, and ephemeris values
              derive strictly from NASA LRO LOLA and JPL Horizons datasets with human review by Team
              VeriFour.
            </li>
          </ul>
        </section>
      </div>
    </AccessibleDialog>
  );
};

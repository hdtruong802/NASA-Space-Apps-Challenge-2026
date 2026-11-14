import React from 'react';
import { AlertTriangle, BookOpen, CheckCircle2, Compass, Info, Sparkles } from 'lucide-react';
import type { EphemerisData } from '../types/lunar';
import { AccessibleDialog } from './AccessibleDialog';
import { GlossaryTerm } from './GlossaryTerm';

interface LearnModalProps {
  open: boolean;
  onClose: () => void;
  ephemeris: EphemerisData;
  onJumpToTimestamp: (idx: number) => void;
  onOpenAbout?: () => void;
}

export const LearnModal: React.FC<LearnModalProps> = ({
  open,
  onClose,
  ephemeris,
  onJumpToTimestamp,
  onOpenAbout,
}) => {
  const sitesCheckedCount = ephemeris.validation.sites_checked?.length ?? 6;
  const solarRatio = Math.max(
    1,
    Math.round(0.53 / Math.max(0.001, ephemeris.validation.earth_max_err_deg)),
  );
  const partialCount = ephemeris.eclipses.filter((ec) =>
    ec.type.toLowerCase().includes('partial'),
  ).length;
  const totalCount = ephemeris.eclipses.filter((ec) =>
    ec.type.toLowerCase().includes('total'),
  ).length;
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
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          <span>Lunar Physics &amp; Eclipse Guide</span>
        </>
      }
      title="How Lunar Geometry &amp; Terrain Shape Power and Comms"
      maxWidthClass="max-w-3xl"
    >
      {/* Ephemeris Direction Check Banner (scoped accurately per SCI-7) */}
      <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-300">
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Sun &amp; Earth Direction Checked vs JPL Horizons DE441 (~
            {ephemeris.validation.earth_max_err_deg.toFixed(3)}° max Earth error)
          </span>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-200">
          All solar and Earth positions are derived client-side from a precomputed{' '}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-amber-300">MOON_ME</code> sub-point
          ephemeris table (<span className="font-mono">{ephemeris.n.toLocaleString('en-US')}</span> hourly steps,{' '}
          <span className="font-mono">{startDate}</span> to <span className="font-mono">{endDate}</span>{' '}
          UTC) projected into local <GlossaryTerm termKey="az_el" label="Az/El" /> coordinates. Across{' '}
          {sitesCheckedCount} verification sites, directional error stays within{' '}
          <span className="font-mono text-emerald-300">
            {ephemeris.validation.sun_max_err_deg.toFixed(5)}°
          </span>{' '}
          (Sun) and{' '}
          <span className="font-mono text-emerald-300">
            {ephemeris.validation.earth_max_err_deg.toFixed(5)}°
          </span>{' '}
          (Earth) — about {solarRatio}&times; finer than the 0.53° solar disk diameter. Surface illumination
          percentages depend additionally on local <GlossaryTerm termKey="lola_dem" label="LOLA DEM" />{' '}
          terrain horizons.
        </p>
      </div>

      {/* Key Physical Concepts for Educators & Mission Planners */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-300">
            <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>1. Why Polar Ridges Stay Lit While Craters Stay Dark</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            Unlike Earth&apos;s 23.4° axial tilt, the Moon tilts only <strong>1.54°</strong> toward the
            ecliptic (completing one seasonal cycle every ~347 days). At the South Pole, the Sun skims
            near the horizon all year. A smooth sphere would receive roughly ~50% sunlight everywhere, but
            real <GlossaryTerm termKey="lola_dem" label="LOLA DEM" /> topography changes everything: high
            crater rims cast long shadows yet stay illuminated ~78–91% of the time, while deep interiors form{' '}
            <GlossaryTerm termKey="psr" label="PSRs" /> at 0% direct sunlight.
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 space-y-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-sky-300">
            <Compass className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>2. Why Earth Rises &amp; Sets (Libration)</span>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            Although the Moon is tidally locked, orbital eccentricity and inclination produce{' '}
            <GlossaryTerm termKey="libration" label="optical libration" /> of roughly ±8.0° in longitude
            and ±6.9° in latitude over a ~27.3-day cycle. At South Pole ridges, Earth slowly rises above
            and sinks behind mountain horizons for 10–14 days per month. Lunar far-side sites (such as
            Chang&apos;e-4) never have <GlossaryTerm termKey="dte" label="DTE" /> geometry and require relay
            spacecraft.
          </p>
        </section>
      </div>

      {/* Solar Eclipses from the Moon (Accurate Partial vs Total Copy per SCI-1) */}
      <section className="space-y-2.5">
        <div className="flex items-center gap-2 text-sm font-semibold text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            3. Solar Eclipses from the Moon ({ephemeris.eclipses.length} Events in {startDate.slice(0, 4)}–
            {endDate.slice(0, 4)})
          </span>
        </div>
        <p className="text-xs leading-relaxed text-slate-300">
          When Earth passes between the Sun and the Moon (a lunar eclipse seen from Earth), Earth&apos;s
          disk (~1.8°–2.0° angular diameter) partially or totally occults the 0.53° Sun. In this ephemeris,{' '}
          <strong>
            {partialCount} of {ephemeris.eclipses.length} events are partial
          </strong>{' '}
          and <strong>{totalCount} {totalCount === 1 ? 'is' : 'are'} total</strong> as evaluated for the Moon&apos;s center; actual
          obscuration at your selected landing site is computed geometrically at each hourly step (omitting
          Earth&apos;s atmosphere). Click an event below to inspect it on the horizon view:
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ephemeris.eclipses.map((ec) => (
            <button
              key={ec.start_utc}
              type="button"
              onClick={() => {
                onJumpToTimestamp(ec.idx);
                onClose();
              }}
              className="flex min-h-[44px] items-center justify-between rounded-xl border border-slate-800 bg-slate-950/85 px-3.5 py-2.5 text-left text-xs transition hover:border-rose-400/60 hover:bg-rose-950/25"
            >
              <div>
                <div className="font-mono font-semibold text-slate-100">{ec.start_utc} UTC</div>
                <div className="text-xs text-rose-300 capitalize">
                  Moon-center: {ec.type}
                  {typeof ec.max_obscured_frac === 'number'
                    ? ` (max ${
                        ec.max_obscured_frac * 100 < 1
                          ? (ec.max_obscured_frac * 100).toFixed(1)
                          : (ec.max_obscured_frac * 100).toFixed(0)
                      }% obscured)`
                    : ''}
                </div>
              </div>
              <span className="rounded-md bg-rose-500/20 px-2.5 py-1 font-mono text-xs font-medium text-rose-200">
                {ec.hours}h &rarr;
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Clear Data Used vs Referenced Mission Context Separation */}
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 text-xs leading-relaxed text-slate-300 space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-slate-100 flex items-center gap-1.5">
            <Info className="h-4 w-4 text-sky-400" aria-hidden="true" />
            Datasets Used vs. Mission Reference Context
          </span>
          {onOpenAbout && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenAbout();
              }}
              className="rounded-md border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-300 transition hover:bg-sky-500/25"
            >
              Open Full About &amp; Validation &rarr;
            </button>
          )}
        </div>
        <p>
          <strong>Datasets ingested:</strong> NASA JPL Horizons System (<code className="text-amber-300">DE441</code>{' '}
          / <code className="text-amber-300">MOON_ME</code>), NASA LRO LOLA{' '}
          <code className="text-amber-300">LDEM_75S_240M</code> (PDS Geosciences), and Artemis III 2024
          Candidate Region GeoJSON polygons (LROC QuickMap / ASU).
        </p>
        <p className="text-slate-400">
          <strong>Reference targets plotted:</strong> Published landing coordinates from NASA Apollo, CLPS,
          commercial, and international missions (ISRO, JAXA, CNSA) are evaluated solely over the NASA
          Horizons/LOLA model above; no external agency telemetry datasets are ingested. Consulted resources:
          NASA Moon Trek and Canadian Space Agency (CSA) Moon Exploration.
        </p>
      </section>
    </AccessibleDialog>
  );
};

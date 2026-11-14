import React from 'react';
import {
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Compass,
  GitCompare,
  Layers3,
  MapPinned,
  MousePointer2,
  Radio,
  Rocket,
  Table2,
} from 'lucide-react';
import { AccessibleDialog } from './AccessibleDialog';

export type GettingStartedView = 'surface3d' | 'split' | 'map2d' | 'compare' | 'directory';

interface GettingStartedModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: GettingStartedView) => void;
}

const viewCards = [
  {
    id: 'surface3d' as const,
    icon: Rocket,
    name: '3D Rover & Surface',
    description: 'Inspect terrain, lighting and the rover. Drag to orbit; use the on-screen controls or WASD / arrow keys to drive.',
    color: 'amber',
  },
  {
    id: 'split' as const,
    icon: Layers3,
    name: 'Command Split',
    description: 'Keep the 3D terrain, 2D map and horizon view together while investigating one site.',
    color: 'cyan',
  },
  {
    id: 'map2d' as const,
    icon: MapPinned,
    name: '2D Map & Sky',
    description: 'Read the South Pole map and inspect the local sky and direction of Sun and Earth.',
    color: 'emerald',
  },
  {
    id: 'compare' as const,
    icon: GitCompare,
    name: 'Compare A vs B',
    description: 'Compare two landing sites using the same time, mast height and visibility measures.',
    color: 'sky',
  },
  {
    id: 'directory' as const,
    icon: Table2,
    name: 'Candidate Directory',
    description: 'Browse curated locations, inspect their metrics, or explore ranked candidate areas.',
    color: 'violet',
  },
];

const colorClasses: Record<string, string> = {
  amber: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  cyan: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-200',
  emerald: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  sky: 'border-sky-400/25 bg-sky-500/10 text-sky-200',
  violet: 'border-violet-400/25 bg-violet-500/10 text-violet-200',
};

export const GettingStartedModal: React.FC<GettingStartedModalProps> = ({
  open,
  onClose,
  onNavigate,
}) => (
  <AccessibleDialog
    open={open}
    onClose={onClose}
    eyebrow={<><Compass className="h-4 w-4" aria-hidden="true" /><span>New here? Start with this field guide</span></>}
    title="Plan a lunar landing site in a few steps"
    maxWidthClass="max-w-5xl"
  >
    <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-[radial-gradient(ellipse_at_85%_0%,rgba(56,189,248,0.16),transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(3,7,18,0.95))] p-5 sm:p-7">
      <div className="relative max-w-3xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> Browser-based mission planning · no account needed
        </div>
        <p className="text-sm leading-relaxed text-slate-300 sm:text-base">
          Explore how sunlight, Earth line of sight and lunar terrain change across landing locations. Start with a known site, move through time, then compare what you find.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-3">
            <span className="text-xs uppercase tracking-wider text-slate-500">1 · Choose</span>
            <p className="mt-1 text-sm text-slate-200">Pick a location from the selector in the top bar.</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-3">
            <span className="text-xs uppercase tracking-wider text-slate-500">2 · Inspect</span>
            <p className="mt-1 text-sm text-slate-200">Check the live conditions and use the timeline to move through time.</p>
          </div>
          <div className="rounded-xl border border-slate-700/70 bg-slate-950/55 p-3">
            <span className="text-xs uppercase tracking-wider text-slate-500">3 · Compare</span>
            <p className="mt-1 text-sm text-slate-200">Open Compare A vs B or export a mission brief to share.</p>
          </div>
        </div>
      </div>
    </div>

    <section className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <MousePointer2 className="h-4 w-4 text-amber-300" aria-hidden="true" /> Choose a workspace
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {viewCards.map(({ id, icon: Icon, name, description, color }) => (
          <button
            key={id}
            type="button"
            onClick={() => onNavigate(id)}
            className="group min-h-[118px] rounded-xl border border-slate-800 bg-slate-950/65 p-3.5 text-left transition hover:border-slate-600 hover:bg-slate-900/90"
          >
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${colorClasses[color]}`}>
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="mt-2 block text-sm font-semibold text-slate-100">{name}</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate-400">{description}</span>
          </button>
        ))}
      </div>
    </section>

    <div className="grid gap-3 md:grid-cols-2">
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-amber-200"><Clock3 className="h-4 w-4" aria-hidden="true" /> How to read the instruments</div>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
          <li><strong className="text-amber-200">Sun visibility</strong> is the share of time the solar disk is above the local terrain horizon. The timeline shows when sunlight is available at the selected date.</li>
          <li><strong className="text-sky-200">Earth visibility (DTE)</strong> indicates direct line of sight to Earth above terrain. It helps assess communications geometry.</li>
          <li><strong className="text-emerald-200">Terrain and slope</strong> come from LOLA elevation data where available. The mast-height control changes the observer height used for horizon checks.</li>
          <li>Use the bottom dock tabs for the <strong>14-day timeline</strong>, <strong>360° horizon</strong> and <strong>rover traverse profile</strong>.</li>
        </ul>
      </section>
      <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-cyan-200"><Radio className="h-4 w-4" aria-hidden="true" /> What the numbers mean</div>
        <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
          <li>Read the selected site and UTC timestamp first; the gauges and sky view describe that location and moment.</li>
          <li>Sun and Earth percentages summarize the full ephemeris period; the timeline and horizon view show conditions around the selected time.</li>
          <li><strong className="text-slate-100">n/a</strong> means terrain data is unavailable for that location. The viability score is a team-defined comparison index, not a NASA standard.</li>
          <li>All results are exploratory decision support. The 240 m terrain data cannot certify meter-scale landing hazards.</li>
        </ul>
      </section>
    </div>

    <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/55 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-sky-300" aria-hidden="true" />
        <p className="text-xs leading-relaxed text-slate-400">Want the science behind the geometry, eclipse model, data sources and known limitations? Open <strong className="text-slate-200">Physics &amp; Guide</strong> or <strong className="text-slate-200">About &amp; Data</strong> in the top bar.</p>
      </div>
      <button
        type="button"
        onClick={() => onNavigate('surface3d')}
        className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/25"
      >
        Start exploring <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  </AccessibleDialog>
);

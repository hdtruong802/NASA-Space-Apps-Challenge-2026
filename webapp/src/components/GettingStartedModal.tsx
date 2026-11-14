import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Compass,
  Eclipse,
  Gauge,
  GitCompare,
  Layers3,
  MapPinned,
  Mountain,
  MousePointer2,
  Play,
  Radio,
  Rocket,
  Sparkles,
  Sun,
  Table2,
} from 'lucide-react';
import { AccessibleDialog } from './AccessibleDialog';

export type GettingStartedView = 'surface3d' | 'split' | 'map2d' | 'compare' | 'directory';

export type OnboardingPresetId =
  | 'ridge_rover'
  | 'malapert_dte'
  | 'total_eclipse'
  | 'ridge_vs_psr'
  | 'candidate_scan';

interface GettingStartedModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: GettingStartedView) => void;
  currentView?: GettingStartedView;
  onRunPreset?: (preset: OnboardingPresetId) => void;
  onStartInteractiveTour?: () => void;
  onOpenLearn?: () => void;
  onOpenAbout?: () => void;
}

const presetScenarios: Array<{
  id: OnboardingPresetId;
  badge: string;
  title: string;
  description: string;
  cta: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  {
    id: 'ridge_rover',
    badge: '3D Rover · Solar Ridge',
    title: 'Drive the 3D Rover on Connecting Ridge',
    description:
      'Deploys the 6-wheel rover on a 94.3% sunlit ridge with the Composite slope and illumination surface layer active.',
    cta: 'Launch 3D Drive',
    icon: Rocket,
    accent: 'border-amber-400/35 bg-amber-500/10 hover:border-amber-300/60 hover:bg-amber-500/15 text-amber-200',
  },
  {
    id: 'malapert_dte',
    badge: 'Command Split · 10 m Mast',
    title: 'Inspect Mast Height & Earth Link at Malapert',
    description:
      'Opens 3D + 2D + Sky Split View at Malapert Massif (10 m mast) so you can see how elevation clears ridge blockage.',
    cta: 'Open Split Study',
    icon: Radio,
    accent: 'border-cyan-400/35 bg-cyan-500/10 hover:border-cyan-300/60 hover:bg-cyan-500/15 text-cyan-200',
  },
  {
    id: 'total_eclipse',
    badge: '2028-12-31 · Solar Eclipse',
    title: 'Witness a Total Lunar Solar Eclipse',
    description:
      'Jumps directly to the Dec 31, 2028 total eclipse interval to watch the 3D Sun dim crimson and timeline power drop.',
    cta: 'Jump to Eclipse',
    icon: Eclipse,
    accent: 'border-rose-400/35 bg-rose-500/10 hover:border-rose-300/60 hover:bg-rose-500/15 text-rose-200',
  },
  {
    id: 'ridge_vs_psr',
    badge: 'Compare A vs B',
    title: 'Compare Sunlit Summit vs. Shackleton PSR Floor',
    description:
      'Places Connecting Ridge side by side against Shackleton Crater Floor (0% Sun) across synchronized windows.',
    cta: 'Compare Extremes',
    icon: GitCompare,
    accent: 'border-sky-400/35 bg-sky-500/10 hover:border-sky-300/60 hover:bg-sky-500/15 text-sky-200',
  },
];

const viewCards: Array<{
  id: GettingStartedView;
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  description: string;
  color: 'amber' | 'cyan' | 'emerald' | 'sky' | 'violet';
}> = [
  {
    id: 'surface3d',
    icon: Rocket,
    name: '3D Rover & Surface',
    description:
      'Inspect LOLA 3D terrain, JPL lighting and the rover. Drag to orbit; use on-screen controls or WASD / arrows to drive.',
    color: 'amber',
  },
  {
    id: 'split',
    icon: Layers3,
    name: 'Command Split',
    description:
      'Keep the 3D terrain, 2D polar map and 360° horizon sky synchronized together while investigating one site.',
    color: 'cyan',
  },
  {
    id: 'map2d',
    icon: MapPinned,
    name: '2D Map & Sky',
    description:
      'Read the ±150 km South Pole stereographic map, click anywhere to probe, and inspect Sun/Earth sky paths.',
    color: 'emerald',
  },
  {
    id: 'compare',
    icon: GitCompare,
    name: 'Compare A vs B',
    description:
      'Compare two lunar sites under shared or independent UTC windows, mast heights and visibility metrics.',
    color: 'sky',
  },
  {
    id: 'directory',
    icon: Table2,
    name: 'Candidate Directory',
    description:
      'Filter 62,500 polar cells and 140 refined 240 m blocks (Mode A) or run live neighborhood scans (Mode B).',
    color: 'violet',
  },
];

const colorClasses: Record<'amber' | 'cyan' | 'emerald' | 'sky' | 'violet', string> = {
  amber: 'border-amber-400/25 bg-amber-500/10 text-amber-200',
  cyan: 'border-cyan-400/25 bg-cyan-500/10 text-cyan-200',
  emerald: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-200',
  sky: 'border-sky-400/25 bg-sky-500/10 text-sky-200',
  violet: 'border-violet-400/25 bg-violet-500/10 text-violet-200',
};

type InstrumentKey = 'solar' | 'dte' | 'slope' | 'viability' | 'timeline' | 'horizon' | 'traverse';

const instrumentGuides: Array<{
  key: InstrumentKey;
  label: string;
  group: string;
  icon: React.ComponentType<{ className?: string }>;
  headline: string;
  bullets: string[];
  targetView: GettingStartedView;
}> = [
  {
    key: 'solar',
    label: 'Solar Array Gauge',
    group: 'HUD Telemetry',
    icon: Sun,
    headline: 'Sunlit vs. Horizontal Panel Power',
    bullets: [
      'Lit % is the instantaneous fraction of the 0.53° solar disk clearing local terrain for a vertical sun-tracking array at the selected UTC timestamp.',
      'Horizontal Panel % scales that output by sin(elevation) under Lambert’s law—showing why polar landers need upright tracking arrays.',
    ],
    targetView: 'surface3d',
  },
  {
    key: 'dte',
    label: 'Earth DTE Gauge',
    group: 'HUD Telemetry',
    icon: Radio,
    headline: 'Direct-to-Earth Visibility & Masking',
    bullets: [
      'Earth DTE % summarizes direct line of sight to Earth over the active window (e.g. 336h / 14 days) rather than the multi-year baseline.',
      'Use Mask 0° / 2° / 5° to test how terrain clearance margin affects Earth communication windows during ±6.7° lunar libration.',
    ],
    targetView: 'split',
  },
  {
    key: 'slope',
    label: '240 m Slope & Tilt',
    group: 'HUD Telemetry',
    icon: Mountain,
    headline: 'Regional DEM Slope vs. Rover Tilt',
    bullets: [
      '240 m slope comes from NASA LRO LOLA LDEM_75S_240M where polar coverage exists (75°S–90°S); n/a indicates terrain data is unavailable outside that zone.',
      'Rover Pitch / Roll tracks the live 3D vehicle inclination on the terrain normal. 240 m data is exploratory and cannot certify meter-scale boulders.',
    ],
    targetView: 'surface3d',
  },
  {
    key: 'viability',
    label: 'Viability Index',
    group: 'HUD Telemetry',
    icon: Gauge,
    headline: 'Team-Defined 4.1-Year MCDA Comparison Index',
    bullets: [
      'Combines full 2026–2030 (36,216h) averages: 35% Mean Solar Disk + 25% Earth DTE + 15% Joint Sun∩Earth + 15% Dark Resilience + 10% Slope ≤5°.',
      'Designed as an exploratory comparison score—not a NASA standard or flight-certification metric.',
    ],
    targetView: 'compare',
  },
  {
    key: 'timeline',
    label: '14-Day Timeline Dock',
    group: 'Bottom Dock',
    icon: Clock3,
    headline: 'Scrub Time, Eclipses & Mast Sensitivity',
    bullets: [
      'Drag the 2026–2030 scrubber or click a 14-day timeline hour to inspect continuous daylight/darkness streaks and operational windows.',
      'Changing mast height (0.5 m to 50 m) updates the observer elevation for horizon clearance and dark-gap duration.',
    ],
    targetView: 'surface3d',
  },
  {
    key: 'horizon',
    label: '360° Horizon Sky',
    group: 'Bottom Dock',
    icon: Compass,
    headline: 'Topographic Mask, Ghost Mast & Polar Sky Dome',
    bullets: [
      'Shows the 360° ray-marched elevation ridge line around the site alongside Sun and Earth arcs for the selected timestamp.',
      'Compare dashed ghost horizons when switching mast heights to see how raising antennas clears crater rims.',
    ],
    targetView: 'map2d',
  },
  {
    key: 'traverse',
    label: 'Rover Traverse Profile',
    group: 'Bottom Dock',
    icon: Rocket,
    headline: 'Elevation, Slope & DTE Along Driven Path',
    bullets: [
      'Plots elevation and slope history along your driven or waypoint-autopilot rover route inside the ±150 km South Pole frame.',
      'Switch between 1× Real terrain proportions and 3×–15× geological relief in the command strip above.',
    ],
    targetView: 'surface3d',
  },
];

const steps = [
  { id: 0, badge: '1 · Choose & Quick-Start', summary: 'Launch a preset or pick a site' },
  { id: 1, badge: '2 · 5 Workspaces', summary: 'Switch 3D, Split, 2D & Finder' },
  { id: 2, badge: '3 · Read KPIs & Instruments', summary: 'Understand every gauge & limit' },
] as const;

export const GettingStartedModal: React.FC<GettingStartedModalProps> = ({
  open,
  onClose,
  onNavigate,
  currentView = 'surface3d',
  onRunPreset,
  onStartInteractiveTour,
  onOpenLearn,
  onOpenAbout,
}) => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentKey>('solar');

  useEffect(() => {
    if (open) {
      setActiveStep(0);
    }
  }, [open]);

  const activeGuide =
    instrumentGuides.find((item) => item.key === selectedInstrument) ?? instrumentGuides[0];

  const handlePresetClick = (preset: OnboardingPresetId) => {
    if (onRunPreset) {
      onRunPreset(preset);
      return;
    }
    const fallbackView: GettingStartedView =
      preset === 'malapert_dte'
        ? 'split'
        : preset === 'ridge_vs_psr'
          ? 'compare'
          : preset === 'candidate_scan'
            ? 'directory'
            : 'surface3d';
    onNavigate(fallbackView);
  };

  return (
    <AccessibleDialog
      open={open}
      onClose={onClose}
      eyebrow={
        <>
          <Compass className="h-4 w-4" aria-hidden="true" />
          <span>Interactive Mission Onboarding · Field Guide</span>
        </>
      }
      title="Plan a lunar landing site in a few steps"
      maxWidthClass="max-w-5xl"
    >
      {/* Hero Banner & Clickable 3-Step Navigator */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-[radial-gradient(ellipse_at_85%_0%,rgba(56,189,248,0.16),transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(3,7,18,0.95))] p-4 sm:p-6">
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Browser-based mission planning ·
            no account needed
          </div>
          <p className="max-w-3xl text-sm leading-relaxed text-slate-300">
            Explore how sunlight, Earth line of sight and lunar terrain change across landing
            locations. Click any step below, or launch a 1-click preset mission right onto the
            canvas.
          </p>

          <div
            role="tablist"
            aria-label="Onboarding guide steps"
            className="mt-4 grid gap-2.5 sm:grid-cols-3"
          >
            {steps.map((step) => {
              const selected = activeStep === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveStep(step.id)}
                  className={`rounded-xl border p-3 text-left transition ${
                    selected
                      ? 'border-amber-400/65 bg-amber-500/15 ring-1 ring-amber-400/40'
                      : 'border-slate-700/70 bg-slate-950/60 hover:border-slate-500 hover:bg-slate-900/80'
                  }`}
                >
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      selected ? 'text-amber-300' : 'text-slate-400'
                    }`}
                  >
                    {step.badge}
                  </span>
                  <p className="mt-1 text-sm font-medium text-slate-100">{step.summary}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Step 1 Panel: 1-Click Quick-Start Presets */}
      {activeStep === 0 && (
        <section className="space-y-3" aria-label="Quick-start mission presets">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span>Launch an interactive demo scenario (1 click)</span>
            </div>
            <span className="text-xs text-slate-400">
              Sets site, view, timestamp &amp; layers automatically
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2">
            {presetScenarios.map((preset) => {
              const Icon = preset.icon;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetClick(preset.id)}
                  className={`group flex flex-col justify-between rounded-xl border p-4 text-left transition ${preset.accent}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-90">
                        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{preset.badge}</span>
                      </span>
                      <ArrowRight
                        className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-100">{preset.title}</div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {preset.description}
                    </p>
                  </div>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold">
                    <span>{preset.cta}</span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/65 px-4 py-3 text-xs text-slate-300">
            <strong className="text-amber-200">Quick 3D &amp; Map controls:</strong> Drag to orbit ·
            Scroll to zoom · <span className="font-mono text-slate-100">WASD</span> / Arrow keys or
            click terrain to steer the 3D rover · Click anywhere on the 2D South Pole map to probe a
            custom pin.
          </div>
        </section>
      )}

      {/* Step 2 Panel: Interactive Workspace Cards */}
      {activeStep === 1 && (
        <section className="space-y-3" aria-label="Choose a workspace">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <MousePointer2 className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span>Choose a workspace to jump right in</span>
            </div>
            <span className="text-xs text-slate-400">
              All 5 tabs stay synced to your active target
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {viewCards.map(({ id, icon: Icon, name, description, color }) => {
              const isCurrent = id === currentView;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onNavigate(id)}
                  className={`group flex min-h-[132px] flex-col justify-between rounded-xl border p-3.5 text-left transition ${
                    isCurrent
                      ? 'border-amber-400/50 bg-slate-900/95 ring-1 ring-amber-400/30'
                      : 'border-slate-800 bg-slate-950/65 hover:border-slate-600 hover:bg-slate-900/90'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border ${colorClasses[color]}`}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      {isCurrent && (
                        <span className="rounded-full border border-amber-400/40 bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-200">
                          Active
                        </span>
                      )}
                    </div>
                    <span className="mt-2 block text-sm font-semibold text-slate-100">{name}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-400">
                      {description}
                    </span>
                  </div>
                  <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-sky-300">
                    <span>Open view</span>
                    <ArrowRight
                      className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                      aria-hidden="true"
                    />
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => handlePresetClick('candidate_scan')}
              className="group flex min-h-[132px] flex-col justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-left transition hover:border-emerald-400/60 hover:bg-emerald-950/35"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-500/15 text-emerald-200">
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-200">
                    Mode A + B
                  </span>
                </div>
                <span className="mt-2 block text-sm font-semibold text-slate-100">
                  Candidate Finder Scanner
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-300">
                  Rank Artemis III regions by slope, darkness duration, DTE, or Viability Index.
                </span>
              </div>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300">
                <span>Launch scanner</span>
                <ArrowRight
                  className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
            </button>
          </div>
        </section>
      )}

      {/* Step 3 Panel: Interactive Instrument & Number Guide */}
      {activeStep === 2 && (
        <section className="space-y-3" aria-label="Interactive instrument guide">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Clock3 className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span>Select any gauge or dock panel to see what its numbers mean</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {instrumentGuides.map((item) => {
              const Icon = item.icon;
              const selected = item.key === activeGuide.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setSelectedInstrument(item.key)}
                  className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition ${
                    selected
                      ? 'border-cyan-400/65 bg-cyan-500/20 text-cyan-100'
                      : 'border-slate-700/80 bg-slate-950/65 text-slate-300 hover:border-slate-500 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="rounded-xl border border-slate-700/80 bg-slate-950/75 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-cyan-300">
                  {activeGuide.group}
                </span>
                <h3 className="text-base font-semibold text-slate-100">{activeGuide.headline}</h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigate(activeGuide.targetView)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-400/40 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
              >
                <span>Inspect in app</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
              {activeGuide.bullets.map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-3">
              <BookOpen className="h-4 w-4 text-sky-300" aria-hidden="true" />
              <span className="text-xs text-slate-400">
                Want exact azimuth equations, eclipse geometry or literature benchmarks?
              </span>
              {onOpenLearn && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenLearn();
                  }}
                  className="rounded-lg border border-sky-500/40 bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
                >
                  Open Physics &amp; Guide
                </button>
              )}
              {onOpenAbout && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenAbout();
                  }}
                  className="rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-semibold text-slate-200 transition hover:border-slate-500"
                >
                  Open About &amp; Data
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Interactive Footer: Stepper Controls + Guided Tour + Enter App */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={activeStep === 0}
            onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Previous</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (activeStep < steps.length - 1) {
                setActiveStep((s) => s + 1);
              } else {
                onNavigate('surface3d');
              }
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-slate-100 transition hover:border-sky-400/50 hover:text-sky-200"
          >
            <span>{activeStep < steps.length - 1 ? 'Next Step' : 'Finish Guide'}</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onStartInteractiveTour && (
            <button
              type="button"
              onClick={onStartInteractiveTour}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Start Interactive Tour (4 Steps)</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onNavigate('surface3d')}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-400/45 bg-amber-500/20 px-4 py-2 text-sm font-semibold text-amber-100 transition hover:bg-amber-500/30"
          >
            <span>Start exploring</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
    </AccessibleDialog>
  );
};

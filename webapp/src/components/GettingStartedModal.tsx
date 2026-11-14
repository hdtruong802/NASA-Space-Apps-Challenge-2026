import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clock3,
  Compass,
  Eclipse,
  Gauge,
  GitCompare,
  HelpCircle,
  Layers,
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

export type OnboardingSectionId =
  | 'header'
  | 'workspaces'
  | 'hud_probe'
  | 'viewport_rover'
  | 'kpi_gauges'
  | 'science_notes'
  | 'mission_dock';

export interface OnboardingSectionItem {
  label: string;
  tag?: string;
  explanation: string;
}

export interface OnboardingSectionSpec {
  id: OnboardingSectionId;
  stepNumber: number;
  shortLabel: string;
  badge: string;
  title: string;
  subtitle: string;
  overview: string;
  items: OnboardingSectionItem[];
}

export const ONBOARDING_SECTIONS: OnboardingSectionSpec[] = [
  {
    id: 'header',
    stepNumber: 1,
    shortLabel: 'Header & Target',
    badge: 'Section 1 · Mission Command Bar',
    title: 'Target Selector, Validation & Export Header',
    subtitle: 'Top command bar — choose a landing site and verify JPL ephemeris lock',
    overview:
      'Every workspace and telemetry ring stays synchronized to Scenario A selected here. Use this top bar to switch sites, teleport the 3D rover, inspect ephemeris accuracy, or share your exact session URL.',
    items: [
      {
        label: 'Target Location (Scenario A)',
        tag: '31 Sites',
        explanation:
          'Switches between 17 South Pole targets (Artemis III, PGDA ridges, Shackleton PSR) and 14 global historic landers (Apollo, CLPS, Chandrayaan-3, SLIM).',
      },
      {
        label: 'Deploy Rover',
        tag: '3D Action',
        explanation:
          'Places the 6-wheel lunar rover directly onto the active target within the ±150 km South Pole LOLA DEM and snaps the chase camera to it.',
      },
      {
        label: 'JPL Horizons (~0.006°)',
        tag: 'DE441 Check',
        explanation:
          'Displays the verified topocentric Sun and Earth Az/El residual error against NASA JPL Horizons DE441 checkpoints across 2026–2030.',
      },
      {
        label: 'Share & Export Brief',
        tag: 'Reproducible',
        explanation:
          'Copies a permalink encoding site, timestamp, comparison target, and mast height—or downloads a Markdown engineering site brief.',
      },
    ],
  },
  {
    id: 'workspaces',
    stepNumber: 2,
    shortLabel: '5 Workspaces',
    badge: 'Section 2 · Synchronized Views',
    title: '5 Mission Workspaces Built on One Simulation State',
    subtitle: 'Switch between 3D Rover, Split View, 2D Map, A/B Compare & Candidate Directory',
    overview:
      'All five workspace tabs read from the same target coordinate, UTC hour, mast elevation, and DTE mask—so changing a timestamp or mast height updates every visualization simultaneously.',
    items: [
      {
        label: '3D Rover & Surface',
        tag: 'Default View',
        explanation:
          'Interactive WebGL lunar South Pole terrain built from NASA LRO LOLA elevation data with moving Sun shadows, Earth disk sky beacon, and drivable rover.',
      },
      {
        label: 'Command Split',
        tag: 'Multi-Panel',
        explanation:
          'Places the 3D terrain canvas next to the ±150 km stereographic 2D polar map and 360° horizon sky panorama on one screen.',
      },
      {
        label: '2D Map & Sky',
        tag: 'Cartographic',
        explanation:
          'Dedicated 2D polar heightmap for clicking custom coordinates, paired with the polar sky dome and horizon mask chart.',
      },
      {
        label: 'Compare A vs B & Directory',
        tag: 'Analysis & Scan',
        explanation:
          'Evaluate two targets side by side across independent UTC timestamps/masts, or rank 62,500 polar cells and live 240 m neighborhoods by Viability Index.',
      },
    ],
  },
  {
    id: 'hud_probe',
    stepNumber: 3,
    shortLabel: 'Scale & Probe',
    badge: 'Section 3 · Simulation Controls',
    title: 'Vertical Relief Scale, 240 m HD DEM & Coordinate Probe',
    subtitle: 'Tune visual elevation relief, stream 240 m DEM blocks, and probe any Lat/Lon',
    overview:
      'Use this HUD strip to separate geometric relief exaggeration from true 1:1 horizon physics, upgrade terrain resolution to 240 m LOLA HD, probe arbitrary coordinates, and adjust the analysis window.',
    items: [
      {
        label: 'Relief: 1× Real vs. 3×–15×',
        tag: 'Visual Scale',
        explanation:
          '1× Real renders true physical lunar height-to-width scale; 3×–15× exaggerates craters visually for orientation while solar/Earth blockage math always uses 1× terrain.',
      },
      {
        label: 'Load 240 m HD',
        tag: 'LDEM_75S_240M',
        explanation:
          'Streams the quantized 240 m South Pole elevation bundle (~5.5 MB) to unlock client-side ray-marched horizon computation at any custom polar pin.',
      },
      {
        label: 'Lat / Lon Coordinate Probe',
        tag: 'Custom Pin',
        explanation:
          'Type any Moon latitude/longitude inside 75°S–90°S and click Probe to trace its 360° terrain horizon silhouette and compute visibility metrics.',
      },
      {
        label: 'Overlay B & Window Selector',
        tag: '24h – 36,216h',
        explanation:
          'Compare another site as Target B on charts, and switch KPI window averaging between 24h, 7d, 14d (336h), 30d, 1yr, or full 4.1yr (36,216h).',
      },
    ],
  },
  {
    id: 'viewport_rover',
    stepNumber: 4,
    shortLabel: '3D & Rover',
    badge: 'Section 4 · Interactive 3D & Surface',
    title: '3D Lunar South Pole Simulator & Rover Telemetry Strip',
    subtitle: 'Orbit terrain, switch diagnostic overlays, and drive the 6-wheel rover',
    overview:
      'Click and drag to orbit the camera, scroll to zoom, click any terrain point for autopilot navigation, or steer directly with WASD / Arrow keys while monitoring live rover tilt and Earth line-of-sight.',
    items: [
      {
        label: 'Surface Layers (Regolith / Sun / Earth / Slope / Composite)',
        tag: '3D Shader',
        explanation:
          'Re-colors the 240 m mesh in 3D: view natural sunlit regolith, continuous Sun illumination map, Earth DTE map, LOLA slope severity, or combined composite viability.',
      },
      {
        label: 'Camera Modes (Chase / Mast POV / Orbit / Free Cam)',
        tag: 'Perspective',
        explanation:
          'Chase follows the rover; Mast POV puts you at antenna height looking across the crater rim; Orbit pivots around Site A; Free Cam explores the region freely.',
      },
      {
        label: 'Rover Autopilot & D-Pad / WASD Controls',
        tag: '1× – 1000× Gear',
        explanation:
          'Steer manually or click Fly/Drive mode; bottom telemetry shows Rover Lat/Lon, Elevation, Heading, Pitch/Roll, driven km, and live array output.',
      },
      {
        label: 'Live Link Indicator (Clear / Blocked)',
        tag: 'Margin (°)',
        explanation:
          'Reports whether Earth clears the 360° horizon from the rover’s exact moving position and mast elevation, with clearance margin in degrees.',
      },
    ],
  },
  {
    id: 'kpi_gauges',
    stepNumber: 5,
    shortLabel: '4 KPI Gauges',
    badge: 'Section 5 · Telemetry KPIs',
    title: 'Understanding Every KPI Ring, Percentage & Score',
    subtitle: 'Distinguish instantaneous solar disk lighting, active-window DTE, 240 m slope, and MCDA rank',
    overview:
      'These four cards summarize physical quantities on different time scales: the first card shows instantaneous sunlight at the chosen UTC hour, while Earth DTE averages over the selected mission window.',
    items: [
      {
        label: '1. Solar Array (Lit % vs. Horizontal Panel %)',
        tag: 'Instant UTC',
        explanation:
          'Ring Lit % is the fraction of the 0.53° solar disk above terrain for a vertical sun-tracking array right now. Horizontal Panel % applies sin(El) Lambert scaling, explaining why low polar sun favors upright arrays.',
      },
      {
        label: '2. Earth DTE (In View % & Mask 0°/2°/5°)',
        tag: 'Active Window',
        explanation:
          'In View % measures Earth visibility across the active window (e.g., 336h = 14d). Mask 0°/2°/5° tests antenna terrain clearance margin during ±6.7° optical libration; Joint tracks simultaneous Sun + Earth ops.',
      },
      {
        label: '3. 240 m Slope & Tilt',
        tag: 'Terrain & Rover',
        explanation:
          'Displays the LRO LOLA 240 m baseline slope (n/a outside 75°S–90°S), live Rover Pitch/Roll, % of surrounding 30×30 km area ≤ 5°, and longest continuous darkness streak (Max Dark in days).',
      },
      {
        label: '4. Viability Index (MCDA Score / 100)',
        tag: 'Team Weighted',
        explanation:
          'Exploratory 4.1-year (36,216h) comparison index: 35% Mean Solar Disk + 25% Earth DTE + 15% Joint Sun∩Earth + 15% Dark Resilience + 10% Slope ≤ 5°. Not a flight-certification metric.',
      },
    ],
  },
  {
    id: 'science_notes',
    stepNumber: 6,
    shortLabel: 'Science & Glossary',
    badge: 'Section 6 · Provenance & Caveats',
    title: 'Site Provenance, Uncertainty Bounds & Interactive Glossary',
    subtitle: 'Inspect LOLA source offset, ±240 m drift sensitivity, and physics caveats',
    overview:
      'Expand Science & Methodology Notes anytime to inspect where the coordinates came from, how sensitive sunlight is to a ±240 m landing dispersion, and tap glossary pills for quick definitions.',
    items: [
      {
        label: 'Site Profile & Coordinate Provenance',
        tag: 'PGDA / NASA',
        explanation:
          'Links the exact published source coordinates and shows any sub-kilometer peak refinement offset used on the 240 m DEM grid.',
      },
      {
        label: 'Terrain vs. Smooth Sphere Baseline',
        tag: '2 m Mast Check',
        explanation:
          'Compares full topographic horizon obstruction against an idealized smooth spherical Moon to isolate true crater-rim shadowing effects.',
      },
      {
        label: '±240 m Drift & 30×30 km Relief',
        tag: 'Dispersion',
        explanation:
          'Shows the min–max Sun Disk % across neighboring 240 m pixels so mission planners see how sensitive power is to small landing-ellipse shifts.',
      },
      {
        label: 'Interactive Glossary Pills',
        tag: 'Definitions',
        explanation:
          'Click DTE Geometry, LOLA 240 m DEM, PSR, Az/El, Optical Libration, or Team Viability Index for concise inline reference popovers.',
      },
    ],
  },
  {
    id: 'mission_dock',
    stepNumber: 7,
    shortLabel: 'Timeline & Sky',
    badge: 'Section 7 · Bottom Mission Dock',
    title: '14-Day Timeline, Mast Sensitivity, 360° Sky & Traverse Profile',
    subtitle: 'Scrub 2026–2030, test 0.5–50 m mast heights, jump to eclipses, and inspect 360° ridges',
    overview:
      'The bottom mission dock turns static percentages into interactive time-series and sky-dome evidence—letting you scrub hourly windows across 4.1 years and watch Earth or Sun clear local ridges.',
    items: [
      {
        label: '2026–2030 Scrubber & 14-Day Hourly Strips',
        tag: '36,216 Hours',
        explanation:
          'Click or arrow-scrub any hour across Solar Disk output, Earth DTE visibility, and Joint Sun + Earth strips to spot multi-day dark gaps or continuous daylight windows.',
      },
      {
        label: 'Mast Height Slider (0.5 m – 50 m) & Eclipses',
        tag: 'Sensitivity',
        explanation:
          'Raise the lander/rover mast in real physics calculations to quantify extra sunlit and DTE hours, or jump straight to cataloged 2026–2030 solar eclipses.',
      },
      {
        label: '360° Horizon Sky & Panorama Tab',
        tag: 'Ghost Horizon',
        explanation:
          'Plots the 360° terrain ridge profile around your site with live Sun/Earth paths and compares dashed ghost horizons between 2 m and higher masts.',
      },
      {
        label: 'Rover Traverse Elevation Profile Tab',
        tag: 'Route Log',
        explanation:
          'Graphs terrain elevation, slope %, and Earth DTE continuity along your driven rover traverse distance.',
      },
    ],
  },
];

interface GettingStartedModalProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (view: GettingStartedView) => void;
  currentView?: GettingStartedView;
  onRunPreset?: (preset: OnboardingPresetId) => void;
  onStartInteractiveTour?: () => void;
  onStartSectionTour?: (sectionId?: OnboardingSectionId) => void;
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
  { id: 0, badge: '1 · Choose & Quick-Start', summary: 'Presets & 7-Section Screen Map' },
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
  onStartSectionTour,
  onOpenLearn,
  onOpenAbout,
}) => {
  const [activeStep, setActiveStep] = useState<number>(0);
  const [selectedInstrument, setSelectedInstrument] = useState<InstrumentKey>('solar');
  const [selectedSectionId, setSelectedSectionId] = useState<OnboardingSectionId>('header');

  useEffect(() => {
    if (open) {
      setActiveStep(0);
    }
  }, [open]);

  const activeGuide =
    instrumentGuides.find((item) => item.key === selectedInstrument) ?? instrumentGuides[0];
  const activeSection =
    ONBOARDING_SECTIONS.find((sec) => sec.id === selectedSectionId) ?? ONBOARDING_SECTIONS[0];

  const handleLaunchTour = (sectionId: OnboardingSectionId = 'header') => {
    if (onStartSectionTour) {
      onStartSectionTour(sectionId);
      return;
    }
    if (onStartInteractiveTour) {
      onStartInteractiveTour();
    }
  };

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
          <span>Interactive Mission Onboarding · Section-by-Section Guide</span>
        </>
      }
      title="Plan a lunar landing site in a few steps"
      maxWidthClass="max-w-5xl"
    >
      {/* Hero Banner & Clickable 3-Step Navigator */}
      <div className="relative overflow-hidden rounded-2xl border border-sky-400/20 bg-[radial-gradient(ellipse_at_85%_0%,rgba(56,189,248,0.16),transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(3,7,18,0.95))] p-4 sm:p-5">
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Browser-based mission planning ·
              no account needed
            </div>
            {(onStartSectionTour || onStartInteractiveTour) && (
              <button
                type="button"
                onClick={() => handleLaunchTour('header')}
                className="inline-flex items-center gap-1.5 rounded-full border border-cyan-400/50 bg-cyan-500/20 px-3.5 py-1 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/30"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Start Live 7-Section Screen Walkthrough</span>
              </button>
            )}
          </div>
          <p className="mt-2.5 max-w-3xl text-sm leading-relaxed text-slate-300">
            Explore how sunlight, Earth line of sight, and lunar terrain change across the South
            Pole. Inspect each of the 7 UI sections with explanations below, or highlight them
            step-by-step directly on the live simulator screen.
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

      {/* Step 1 Panel: Quick-Start Presets + Compact Controls */}
      {activeStep === 0 && (
        <section className="space-y-2.5" aria-label="Quick-start mission presets">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Sparkles className="h-4 w-4 text-amber-300" aria-hidden="true" />
              <span>Launch an interactive demo scenario (1 click)</span>
            </div>
            <span className="text-xs text-slate-400">
              Sets site, view, timestamp &amp; layers automatically
            </span>
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            {presetScenarios.map((preset) => {
              const Icon = preset.icon;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handlePresetClick(preset.id)}
                  className={`group flex flex-col justify-between rounded-xl border p-3.5 text-left transition ${preset.accent}`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide opacity-90">
                        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{preset.badge}</span>
                      </span>
                      <ArrowRight
                        className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="mt-2 text-xs font-bold leading-snug text-slate-100">
                      {preset.title}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-slate-300">
                      {preset.description}
                    </p>
                  </div>
                  <div className="mt-2.5 inline-flex items-center gap-1 text-xs font-semibold">
                    <span>{preset.cta}</span>
                  </div>
                </button>
              );
            })}
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
                  className={`group flex min-h-[126px] flex-col justify-between rounded-xl border p-3.5 text-left transition ${
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
              className="group flex min-h-[126px] flex-col justify-between rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-left transition hover:border-emerald-400/60 hover:bg-emerald-950/35"
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

      {/* Always-Accessible 7-Section Screen Walkthrough Explorer with Explanations */}
      <section
        aria-label="7-section interactive screen guide"
        className="rounded-2xl border border-cyan-400/25 bg-slate-950/80 p-4 space-y-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-cyan-300" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-bold text-slate-100">
                Section-by-Section Screen Map (7 Sections with Explanations)
              </h3>
              <p className="text-xs text-slate-400">
                Select any section of the interface below to see what every control means—or highlight it live on screen.
              </p>
            </div>
          </div>
          {(onStartSectionTour || onStartInteractiveTour) && (
            <button
              type="button"
              onClick={() => handleLaunchTour(activeSection.id)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/45 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-500/25"
            >
              <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Highlight &amp; Explain Section {activeSection.stepNumber} on Screen</span>
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* 7 Clickable Section Pills */}
        <div
          role="tablist"
          aria-label="Screen sections 1 to 7"
          className="flex flex-wrap gap-1.5"
        >
          {ONBOARDING_SECTIONS.map((sec) => {
            const isSelected = sec.id === activeSection.id;
            return (
              <button
                key={sec.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedSectionId(sec.id)}
                className={`inline-flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-semibold transition ${
                  isSelected
                    ? 'border-amber-400/65 bg-amber-500/20 text-amber-100 ring-1 ring-amber-400/40'
                    : 'border-slate-800 bg-slate-900/75 text-slate-300 hover:border-slate-600 hover:text-white'
                }`}
              >
                <span className="rounded bg-slate-950/70 px-1.5 py-0.5 font-mono text-xs text-cyan-300">
                  {sec.stepNumber}
                </span>
                <span>{sec.shortLabel}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Section Explanation Breakdown */}
        <div className="rounded-xl border border-slate-800/90 bg-slate-900/65 p-3.5 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-300">
                <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{activeSection.badge}</span>
              </div>
              <h4 className="mt-0.5 text-sm font-bold text-slate-100">{activeSection.title}</h4>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">{activeSection.overview}</p>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {activeSection.items.map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-slate-800 bg-slate-950/75 p-2.5 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-200">{item.label}</span>
                  {item.tag && (
                    <span className="shrink-0 rounded-full border border-sky-400/25 bg-sky-500/10 px-2 py-0.5 font-mono text-xs text-sky-200">
                      {item.tag}
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-slate-300">{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Footer: Stepper Controls + Guided Tour + Enter App */}
      <div className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
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
          {(onStartSectionTour || onStartInteractiveTour) && (
            <button
              type="button"
              onClick={() => handleLaunchTour('header')}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-cyan-400/45 bg-cyan-500/15 px-4 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
            >
              <Play className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Start Interactive Tour (7 Sections)</span>
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

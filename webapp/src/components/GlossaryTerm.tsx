import React, { useEffect, useId, useRef, useState } from 'react';
import { HelpCircle, X } from 'lucide-react';

export interface GlossaryEntry {
  key: string;
  term: string;
  shortLabel: string;
  summary: string;
  detail: string;
}

export const GLOSSARY_ENTRIES: Record<string, GlossaryEntry> = {
  dte: {
    key: 'dte',
    term: 'Direct-to-Earth (DTE) Geometry',
    shortLabel: 'DTE',
    summary:
      'Geometric line-of-sight between a lunar surface antenna and Earth above the local horizon plus an elevation mask.',
    detail:
      'In this tool, Earth is treated as in view when Earth center elevation exceeds the terrain horizon plus the active elevation mask (0° default, adjustable to 2° or 5°). Real radio link closure also depends on ground station availability, RF power budget, and terrain multipathing.',
  },
  lola_dem: {
    key: 'lola_dem',
    term: 'LRO LOLA DEM (LDEM_75S_240M)',
    shortLabel: 'LOLA DEM',
    summary:
      'Digital Elevation Model of the lunar South Pole (75°S–90°S) derived from NASA Lunar Reconnaissance Orbiter Laser Altimeter data at 240 m/pixel.',
    detail:
      'Elevations are referenced to a 1,737.4 km mean lunar radius sphere. Inside ±150 km of the South Pole, horizons are ray-marched directly over 240 m cells; outside ±150 km up to 75°S, coarse 1.2 km block-max cells fill the outer horizon.',
  },
  psr: {
    key: 'psr',
    term: 'Permanently Shadowed Region (PSR)',
    shortLabel: 'PSR',
    summary:
      'A crater interior or topographic depression that receives little or zero direct sunlight over the lunar seasonal cycle.',
    detail:
      'Because the Moon’s axial tilt relative to the ecliptic is only ~1.54°, solar elevation near the poles never exceeds a few degrees. Deep craters stay permanently dark and cryogenic, making them scientifically important potential reservoirs for water ice.',
  },
  az_el: {
    key: 'az_el',
    term: 'Azimuth & Elevation (Az/El)',
    shortLabel: 'Az/El',
    summary:
      'Local horizontal sky coordinates measured in the East-North-Up (ENU) frame at the landing site.',
    detail:
      'Azimuth (0°–360°) is measured clockwise from local North (0° = North, 90° = East, 180° = South, 270° = West). Elevation (−90° to +90°) is angle above the local horizontal plane; right at −90° South, local North is aligned along 0° longitude toward Earth.',
  },
  libration: {
    key: 'libration',
    term: 'Lunar Optical Libration',
    shortLabel: 'Libration',
    summary:
      'Apparent ±8.0° longitude and ±6.9° latitude wobble of Earth as seen from the lunar surface over a ~27.3-day orbital cycle.',
    detail:
      'Elliptical orbital speed variations and axial tilt cause the sub-Earth point on the Moon to wander across the central nearside. Near the South Pole, this causes Earth to slowly rise above and dip behind crater rims on ~2-week cycles.',
  },
  viability: {
    key: 'viability',
    term: 'Team-Defined Viability Index (0–100)',
    shortLabel: 'Viability',
    summary:
      'A weighted composite comparison index defined by this team for ranking polar terrain sites — not an official NASA landing standard.',
    detail:
      'Formula: 0.35 × Sun Disk % + 0.25 × Earth DTE % + 0.15 × Joint % + 0.15 × Dark Score + 0.10 × Terrain ≤5° (30 km box), where Dark Score = max(0, 100 × (1 − min(max_dark_days, 30) / 30)). Sites lacking local DEM data receive n/a.',
  },
  baseline_240m: {
    key: 'baseline_240m',
    term: '240 m Baseline Slope (Not Lander-Scale)',
    shortLabel: '240 m Baseline',
    summary:
      'Terrain slope computed across 240 m grid postings of LOLA LDEM_75S_240M.',
    detail:
      'A 240 m grid cell averages away boulders, meter-scale craters, and steep local ridges. A low 240 m baseline slope does NOT certify lander-scale touchdown clearance; final hazard assessment requires meter-scale LROC NAC imagery or higher-resolution DEMs.',
  },
  smooth_sphere: {
    key: 'smooth_sphere',
    term: 'Smooth Sphere Horizon Dip',
    shortLabel: 'Smooth Sphere',
    summary:
      'Idealized horizon angle on a featureless 1,737.4 km sphere, ignoring mountains and craters.',
    detail:
      'For a mast height h above a smooth sphere of radius R0, the geometric horizon dips by −acos(R0 / (R0 + h)) (about −0.087° at 2 m mast). Comparing terrain vs. smooth sphere shows how polar ridges dramatically extend or block sunlight.',
  },
  array_power: {
    key: 'array_power',
    term: 'Relative Array Output (%)',
    shortLabel: 'Array Power',
    summary:
      'Normalized solar irradiance output relative to a sun-tracking perpendicular panel at 100% unobstructed solar disk.',
    detail:
      'Vertical Sun-Tracking = effective visible solar disk fraction × 100 (after terrain occlusion and Earth eclipse). Horizontal Panel = effective disk fraction × max(0, sin(Sun El)) × 100. Excludes dust, temperature, solar cell efficiency, and lander self-shadowing.',
  },
};

interface GlossaryTermProps {
  termKey?: keyof typeof GLOSSARY_ENTRIES | string;
  label?: string;
  title?: string;
  summary?: string;
  detail?: string;
  className?: string;
}

export const GlossaryTerm: React.FC<GlossaryTermProps> = ({
  termKey,
  label,
  title,
  summary,
  detail,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverId = useId();

  const entry = termKey ? GLOSSARY_ENTRIES[termKey] : undefined;
  const displayLabel = label ?? entry?.shortLabel ?? title ?? String(termKey ?? 'Term');
  const displayTitle = title ?? entry?.term ?? displayLabel;
  const displaySummary = summary ?? entry?.summary ?? '';
  const displayDetail = detail ?? entry?.detail ?? '';

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={`relative inline-flex items-center ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
        aria-expanded={open}
        aria-controls={popoverId}
        aria-label={`Explain ${displayTitle}`}
        className="inline-flex min-h-[24px] items-center gap-1 rounded px-1 py-0.5 text-xs font-medium text-sky-300 underline decoration-sky-400/50 decoration-dotted underline-offset-4 transition hover:bg-sky-500/15 hover:text-sky-200"
      >
        <span>{displayLabel}</span>
        <HelpCircle className="h-3.5 w-3.5 shrink-0 text-sky-400" aria-hidden="true" />
      </button>

      {open && (
        <div
          id={popoverId}
          role="dialog"
          aria-modal="false"
          aria-label={displayTitle}
          onClick={(e) => e.stopPropagation()}
          className="fixed inset-x-4 bottom-4 z-50 rounded-xl border border-sky-400/40 bg-slate-950/95 p-3.5 text-left text-xs text-slate-200 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-auto sm:left-0 sm:top-full sm:mt-2 sm:w-80 sm:max-w-[calc(100vw-2rem)]"
        >
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2">
            <div className="font-semibold text-sky-300">{displayTitle}</div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus();
              }}
              aria-label={`Close ${displayTitle} glossary`}
              className="inline-flex min-h-[24px] min-w-[24px] items-center justify-center rounded-md bg-slate-800/90 p-1 text-slate-300 hover:bg-slate-700 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {displaySummary && (
            <p className="mt-2 font-medium leading-relaxed text-slate-100">{displaySummary}</p>
          )}
          {displayDetail && (
            <p className="mt-1.5 leading-relaxed text-slate-300">{displayDetail}</p>
          )}
        </div>
      )}
    </span>
  );
};

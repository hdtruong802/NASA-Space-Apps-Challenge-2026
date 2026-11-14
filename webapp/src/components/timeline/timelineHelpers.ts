import type { EphemerisData, SeasonalMarker } from '../../types/lunar';

export interface EphemerisBounds {
  startMs: number;
  endMs: number;
  maxIdx: number;
  startDate: string;
  endDate: string;
  startIsoCompact: string;
  endIsoCompact: string;
  rangeLabel: string;
}

export interface TimelineAxisTick {
  idx: number;
  pct: number;
  dateShort: string;
  monthLabel: string;
}

export interface WindowAxisTick {
  offsetHours: number;
  pct: number;
  label: string;
}

export type UtcParseResult =
  | {
      ok: true;
      clamped: boolean;
      idx: number;
      warning: string | null;
    }
  | {
      ok: false;
      error: string;
    };

export function formatUtcIsoCompact(t0Utc: string, idx: number, dtHours = 1): string {
  const baseMs = Date.parse(t0Utc);
  const dt = new Date(baseMs + idx * dtHours * 3600_000);
  return `${dt.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function formatUtcDatePart(t0Utc: string, idx: number, dtHours = 1): string {
  const baseMs = Date.parse(t0Utc);
  const dt = new Date(baseMs + idx * dtHours * 3600_000);
  return dt.toISOString().slice(0, 10);
}

export function getUtcHourPart(t0Utc: string, idx: number, dtHours = 1): number {
  const baseMs = Date.parse(t0Utc);
  const dt = new Date(baseMs + idx * dtHours * 3600_000);
  return dt.getUTCHours();
}

export function getEphemerisBounds(t0Utc: string, n: number, dtHours = 1): EphemerisBounds {
  const startMs = Date.parse(t0Utc);
  const maxIdx = Math.max(0, n - 1);
  const endMs = startMs + maxIdx * dtHours * 3600_000;
  const startDt = new Date(startMs);
  const endDt = new Date(endMs);
  const startDate = startDt.toISOString().slice(0, 10);
  const endDate = endDt.toISOString().slice(0, 10);
  return {
    startMs,
    endMs,
    maxIdx,
    startDate,
    endDate,
    startIsoCompact: `${startDt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    endIsoCompact: `${endDt.toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    rangeLabel: `${startDate} to ${endDate} UTC`,
  };
}

function isValidUtcCalendarDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const check = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  return (
    check.getUTCFullYear() === year &&
    check.getUTCMonth() === month - 1 &&
    check.getUTCDate() === day
  );
}

/**
 * Strictly parses explicit UTC date or ISO UTC timestamp inputs (supporting seconds and fractional seconds),
 * returning an inline validation error on malformed dates and a dynamic bounds warning when clamped.
 */
export function parseUtcTimestampInput(
  rawInput: string,
  fallbackHour: number,
  t0Utc: string,
  n: number,
  dtHours = 1,
): UtcParseResult {
  const trimmed = rawInput.trim();
  if (!trimmed) {
    return {
      ok: false,
      error: 'Enter a UTC date (YYYY-MM-DD) or ISO UTC timestamp (YYYY-MM-DDTHH:00Z).',
    };
  }

  let year: number;
  let month: number;
  let day: number;
  let hour: number;
  let minute = 0;
  let second = 0;

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const isoMatch =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:\s*(?:Z|UTC))?$/i.exec(
      trimmed,
    );

  if (dateOnlyMatch) {
    year = Number.parseInt(dateOnlyMatch[1], 10);
    month = Number.parseInt(dateOnlyMatch[2], 10);
    day = Number.parseInt(dateOnlyMatch[3], 10);
    hour = Math.max(0, Math.min(23, Math.round(fallbackHour)));
  } else if (isoMatch) {
    year = Number.parseInt(isoMatch[1], 10);
    month = Number.parseInt(isoMatch[2], 10);
    day = Number.parseInt(isoMatch[3], 10);
    hour = Number.parseInt(isoMatch[4], 10);
    minute = Number.parseInt(isoMatch[5], 10);
    second = isoMatch[6] ? Number.parseInt(isoMatch[6], 10) : 0;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) {
      return {
        ok: false,
        error: `Invalid UTC time "${trimmed}". Hours must be 00–23 and minutes/seconds 00–59.`,
      };
    }
  } else {
    return {
      ok: false,
      error: `Invalid UTC timestamp "${trimmed}". Expected YYYY-MM-DD or YYYY-MM-DDTHH:00Z.`,
    };
  }

  if (!isValidUtcCalendarDate(year, month, day)) {
    return {
      ok: false,
      error: `Calendar date "${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}" does not exist.`,
    };
  }

  const bounds = getEphemerisBounds(t0Utc, n, dtHours);
  const parsedMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const stepMs = dtHours * 3600_000;
  const rawIdx = Math.round((parsedMs - bounds.startMs) / stepMs);

  if (rawIdx < 0 || rawIdx > bounds.maxIdx) {
    const clampedIdx = Math.max(0, Math.min(bounds.maxIdx, rawIdx));
    return {
      ok: true,
      clamped: true,
      idx: clampedIdx,
      warning: `Timestamp outside ephemeris range (${bounds.rangeLabel}) — clamped to valid bounds.`,
    };
  }

  return {
    ok: true,
    clamped: false,
    idx: rawIdx,
    warning: null,
  };
}

/**
 * Pure detector for lunar seasonal milestones from ephemeris.subsolar_lat.
 * Groups half-cycles between equinox zero-crossings so small ~0.04° monthly libration wiggles
 * near solstices do not create spurious solstice peaks, and computes plateau midpoints.
 * Excludes clipped boundary extrema at the start/end of the dataset.
 */
export function detectSeasonalMarkers(ephemeris: EphemerisData): SeasonalMarker[] {
  const lats = ephemeris.subsolar_lat;
  const n = Math.min(ephemeris.n, lats.length);
  const dtHours = ephemeris.dt_hours || 1;
  if (n === 0) return [];

  const markers: SeasonalMarker[] = [
    {
      idx: 0,
      utcIso: formatUtcIsoCompact(ephemeris.t0_utc, 0, dtHours),
      kind: 'data_start',
      label: 'Start of data',
      subsolarLatDeg: lats[0],
    },
  ];

  // 1. Detect equinox zero-crossings separated by >= 200 hours (~half-year is ~4,160h)
  const equinoxIndices: number[] = [];
  for (let i = 1; i < n; i++) {
    const prev = lats[i - 1];
    const cur = lats[i];
    const crossedUp = prev < 0 && cur >= 0;
    const crossedDown = prev > 0 && cur <= 0;
    if (!crossedUp && !crossedDown) continue;
    const bestIdx = Math.abs(prev) < Math.abs(cur) ? i - 1 : i;
    const lastEq = equinoxIndices[equinoxIndices.length - 1];
    if (lastEq !== undefined && bestIdx - lastEq < 200) continue;
    equinoxIndices.push(bestIdx);
    markers.push({
      idx: bestIdx,
      utcIso: formatUtcIsoCompact(ephemeris.t0_utc, bestIdx, dtHours),
      kind: 'equinox',
      label: 'Equinox',
      subsolarLatDeg: lats[bestIdx],
    });
  }

  // 2. Find one global extremum per half-cycle segment bounded by equinoxes
  const boundaries = [0, ...equinoxIndices, n - 1];
  for (let s = 0; s < boundaries.length - 1; s++) {
    const segStart = boundaries[s];
    const segEnd = boundaries[s + 1];
    if (segEnd - segStart < 48) continue;

    let minVal = Infinity;
    let maxVal = -Infinity;
    let sum = 0;
    let cnt = 0;
    for (let i = segStart; i <= segEnd; i++) {
      const v = lats[i];
      if (v < minVal) minVal = v;
      if (v > maxVal) maxVal = v;
      sum += v;
      cnt += 1;
    }
    const meanVal = sum / Math.max(1, cnt);
    const isSummerHalf = meanVal < 0;
    const targetVal = isSummerHalf ? minVal : maxVal;

    // Require meaningful seasonal amplitude (> 0.3 deg)
    if (Math.abs(targetVal) < 0.3) continue;

    // Locate contiguous plateau at targetVal (midpoint of plateau for quantized 4-decimal data)
    let firstOcc = -1;
    for (let i = segStart; i <= segEnd; i++) {
      if (lats[i] === targetVal) {
        firstOcc = i;
        break;
      }
    }
    if (firstOcc < 0) continue;
    let runEnd = firstOcc;
    while (runEnd + 1 <= segEnd && lats[runEnd + 1] === targetVal) {
      runEnd += 1;
    }

    const isLeadingEdge = s === 0;
    const isTrailingEdge = s === boundaries.length - 2;
    if (isLeadingEdge && (firstOcc <= 24 || Math.abs(targetVal - lats[0]) <= 0.05)) {
      continue;
    }
    if (isTrailingEdge && (runEnd >= n - 25 || Math.abs(targetVal - lats[n - 1]) <= 0.05)) {
      continue;
    }

    const midIdx = Math.floor((firstOcc + runEnd) / 2);
    markers.push({
      idx: midIdx,
      utcIso: formatUtcIsoCompact(ephemeris.t0_utc, midIdx, dtHours),
      kind: isSummerHalf ? 'summer_solstice' : 'winter_solstice',
      label: isSummerHalf ? 'Southern Summer Peak' : 'Winter Peak',
      subsolarLatDeg: lats[midIdx],
    });
  }

  if (n > 1) {
    markers.push({
      idx: n - 1,
      utcIso: formatUtcIsoCompact(ephemeris.t0_utc, n - 1, dtHours),
      kind: 'data_end',
      label: 'End of data',
      subsolarLatDeg: lats[n - 1],
    });
  }

  markers.sort((a, b) => a.idx - b.idx);
  return markers;
}

export function seasonalMarkerDisplayName(marker: SeasonalMarker): string {
  switch (marker.kind) {
    case 'summer_solstice':
      return 'Southern Summer Peak';
    case 'winter_solstice':
      return 'Winter Peak';
    case 'equinox':
      return 'Equinox';
    case 'data_start':
      return 'Start of data';
    case 'data_end':
      return 'End of data';
  }
}

export function buildTimelineAxisTicks(
  t0Utc: string,
  n: number,
  dtHours = 1,
  tickCount = 5,
): TimelineAxisTick[] {
  const maxIdx = Math.max(0, n - 1);
  const count = Math.max(2, tickCount);
  const ticks: TimelineAxisTick[] = [];
  for (let i = 0; i < count; i++) {
    const frac = i / (count - 1);
    const idx = Math.round(frac * maxIdx);
    const dateShort = formatUtcDatePart(t0Utc, idx, dtHours);
    ticks.push({
      idx,
      pct: frac * 100,
      dateShort,
      monthLabel: dateShort.slice(0, 7),
    });
  }
  return ticks;
}

export function buildWindowAxisTicks(availableHours: number): WindowAxisTick[] {
  const safeHours = Math.max(1, availableHours);
  const fracs = [0, 0.25, 0.5, 0.75, 1];
  return fracs.map((f, idx) => {
    const offsetHours = Math.round(f * safeHours);
    if (idx === 0) {
      return {
        offsetHours: 0,
        pct: 0,
        label: safeHours >= 72 ? 'Landing (+0d)' : 'Landing (+0h)',
      };
    }
    if (safeHours < 72) {
      return {
        offsetHours,
        pct: f * 100,
        label: `+${offsetHours}h`,
      };
    }
    const days = offsetHours / 24;
    const daysText = Number.isInteger(days) ? String(days) : days.toFixed(1);
    const suffix = idx === fracs.length - 1 && safeHours !== 336 ? ` (${safeHours}h)` : '';
    return {
      offsetHours,
      pct: f * 100,
      label: `+${daysText}d${suffix}`,
    };
  });
}

export function formatWindowDurationHeader(
  requestedHours: number,
  availableHours: number,
): { title: string; isTruncated: boolean; truncationNote: string | null } {
  const isTruncated = availableHours < requestedHours;
  const reqDays = requestedHours / 24;
  const reqDaysLabel = Number.isInteger(reqDays) ? `${reqDays}-Day` : `${requestedHours}h`;
  if (!isTruncated) {
    return {
      title: `Next ${reqDaysLabel} Mission Window (${availableHours}h from Selected UTC)`,
      isTruncated: false,
      truncationNote: null,
    };
  }
  return {
    title: `Mission Window: ${availableHours}h Available of ${requestedHours}h Requested`,
    isTruncated: true,
    truncationNote: `Truncated near end of ephemeris (${availableHours} of ${requestedHours} hours available)`,
  };
}

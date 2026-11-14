import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { HorizonSkyView } from '../src/components/HorizonSkyView';
import { MissionTimeline } from '../src/components/MissionTimeline';
import {
  computeBodyPixelRadii,
  describeHorizonSubtitle,
  formatHorizonHoverInfo,
} from '../src/components/timeline/skyHelpers';
import {
  buildTimelineAxisTicks,
  buildWindowAxisTicks,
  detectSeasonalMarkers,
  formatWindowDurationHeader,
  getEphemerisBounds,
  parseUtcTimestampInput,
} from '../src/components/timeline/timelineHelpers';
import { computeSeasonalMarkers, sphericalHorizonDipDeg } from '../src/lib/lunarMath';
import type { EphemerisData, InstantMetrics, SiteData, WindowSummary } from '../src/types/lunar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBPOINTS_FIXTURE = path.resolve(__dirname, 'fixtures', 'moon_subpoints_1h.csv');
const PUBLIC_EPH_PATH = path.resolve(__dirname, '..', 'public', 'data', 'ephemeris.json');

function loadSubpointsFixtureAsEphemeris(): EphemerisData {
  const raw = fs.readFileSync(SUBPOINTS_FIXTURE, 'utf-8').trim().split(/\r?\n/);
  const headers = raw[0].split(',').map((h) => h.trim());
  const idxCol = headers.indexOf('idx');
  const sLatCol = headers.indexOf('subsolar_lat');
  const sLonCol = headers.indexOf('subsolar_lon');
  const eLatCol = headers.indexOf('subearth_lat');
  const eLonCol = headers.indexOf('subearth_lon');
  const distCol = headers.indexOf('earth_moon_au');

  const subsolar_lat: number[] = [];
  const subsolar_lon: number[] = [];
  const subearth_lat: number[] = [];
  const subearth_lon: number[] = [];
  const earth_dist_km: number[] = [];

  for (let i = 1; i < raw.length; i++) {
    const cols = raw[i].split(',');
    subsolar_lat.push(Number.parseFloat(cols[sLatCol]));
    subsolar_lon.push(Number.parseFloat(cols[sLonCol]));
    subearth_lat.push(Number.parseFloat(cols[eLatCol]));
    subearth_lon.push(Number.parseFloat(cols[eLonCol]));
    earth_dist_km.push(Number.parseFloat(cols[distCol]) * 149597870.7);
  }
  const firstIdx = Number.parseInt(raw[1].split(',')[idxCol], 10);
  const secondIdx = Number.parseInt(raw[2].split(',')[idxCol], 10);
  const dt_hours = secondIdx - firstIdx;

  return {
    t0_utc: '2026-11-14T00:00:00Z',
    dt_hours,
    n: subsolar_lat.length,
    subearth_lon,
    subearth_lat,
    subsolar_lon,
    subsolar_lat,
    earth_dist_km,
    eclipses: [],
    validation: {
      sun_max_err_deg: 0.00025,
      earth_max_err_deg: 0.00606,
      ephemeris: 'DE441',
      period_start: '2026-11-14T00:00:00Z',
      period_end: '2029-01-15T00:00:00Z',
    },
  };
}

function makeHourlySyntheticEphemerisFromFixture(fixture: EphemerisData): EphemerisData {
  // Expand 24h fixture linearly to hourly steps (19,033 steps) if full ephemeris.json is absent
  if (fs.existsSync(PUBLIC_EPH_PATH)) {
    return JSON.parse(fs.readFileSync(PUBLIC_EPH_PATH, 'utf-8')) as EphemerisData;
  }
  const dt = fixture.dt_hours;
  const totalN = (fixture.n - 1) * dt + 1;
  const expand = (arr: number[]) => {
    const out = new Array<number>(totalN);
    for (let i = 0; i < fixture.n - 1; i++) {
      const a = arr[i];
      const b = arr[i + 1];
      for (let k = 0; k < dt; k++) {
        out[i * dt + k] = Number((a + ((b - a) * k) / dt).toFixed(4));
      }
    }
    out[totalN - 1] = arr[arr.length - 1];
    return out;
  };
  return {
    ...fixture,
    dt_hours: 1,
    n: totalN,
    subsolar_lat: expand(fixture.subsolar_lat),
    subsolar_lon: expand(fixture.subsolar_lon),
    subearth_lat: expand(fixture.subearth_lat),
    subearth_lon: expand(fixture.subearth_lon),
    earth_dist_km: expand(fixture.earth_dist_km),
  };
}

function makeTestSite(overrides: Partial<SiteData> = {}): SiteData {
  const flatHz = new Array<number>(360).fill(0.8);
  return {
    id: 'connecting_ridge',
    name: 'Connecting Ridge (PGDA Site01)',
    short_name: 'Connecting Ridge',
    category: 'South Pole Ridge',
    program: 'Artemis III / PGDA Site01',
    description: 'High-illumination South Pole ridge connecting Shackleton and de Gerlache.',
    terrain_source: 'LOLA_240M',
    is_polar_dem: true,
    elev_source: 'DEM',
    lat: -89.45,
    lon: -137.3,
    polar_x_km: -11.3,
    polar_y_km: -12.3,
    elev_m: 1950,
    local_slope_deg: 0.6,
    terrain_stats: {
      elev_min_m: 1200,
      elev_median_m: 1700,
      elev_max_m: 2050,
      elev_relief_m: 850,
      slope_mean_deg: 4.1,
      slope_median_deg: 3.4,
      slope_p90_deg: 9.8,
      pct_safe_hls_le_5deg: 8.0,
      pct_rover_le_15deg: 72.0,
    },
    metrics_2m: {
      sun_no_terrain_pct: 94.5,
      sun_time_pct: 91.2,
      sun_visible_pct: 90.6,
      earth_visible_pct: 53.7,
      both_visible_pct: 48.2,
      longest_sun_days: 180.0,
      max_dark_days: 3.1,
      earth_max_gap_days: 7.4,
      viability_score: 66.0,
      archetype: 'High-Sun Ridge (Relay Helpful)',
    },
    drift_240m: { sun_min_pct: 65.4, sun_max_pct: 90.6 },
    horizons_by_mast: {
      '0.5': flatHz,
      '2': flatHz,
      '10': flatHz,
      '20': flatHz,
      '50': flatHz,
    },
    blocking_dist_km: new Array<number>(360).fill(18.5),
    ...overrides,
  };
}

function makeTestInstant(overrides: Partial<InstantMetrics> = {}): InstantMetrics {
  return {
    idx: 5200,
    utcIso: '2027-06-18 16:00 UTC',
    sunAzDeg: 144.7,
    sunElDeg: 1.45,
    sunHorizonElDeg: 0.8,
    sunDiskFrac: 1.0,
    sunVisible: true,
    earthAzDeg: 312.4,
    earthElDeg: 2.1,
    earthHorizonElDeg: 0.6,
    earthVisible: true,
    earthDistKm: 384400,
    hoursToSunset: 48,
    hoursToSunrise: null,
    hoursToEarthset: 72,
    hoursToEarthrise: null,
    sunCountdown: { kind: 'event', hours: 48 },
    earthCountdown: { kind: 'event', hours: 72 },
    activeEclipse: null,
    eclipseObscuredFrac: 0,
    power: { trackingPct: 100, horizontalPct: 2.53 },
    ...overrides,
  };
}

function makeTestSummary(startIdx = 5200, hoursAvailable = 336, hoursRequested = 336): WindowSummary {
  const points = Array.from({ length: hoursAvailable }, (_, k) => ({
    idx: startIdx + k,
    offsetHours: k,
    sunAz: (144 + k * 0.5) % 360,
    sunEl: 1.2 + Math.sin(k / 20) * 0.8,
    sunHz: 0.8,
    sunFrac: k % 40 < 30 ? 1.0 : 0.4,
    earthAz: (310 + Math.sin(k / 30) * 6) % 360,
    earthEl: 1.5 + Math.cos(k / 24) * 3.0,
    earthHz: 0.6,
    earthVis: k % 24 < 16,
    bothVis: k % 40 < 30 && k % 24 < 16,
    powerTrackingPct: k % 40 < 30 ? 100 : 40,
    powerHorizontalPct: 2.0,
  }));
  return {
    sunPct: 82.0,
    sunTimePct: 90.0,
    earthPct: 66.7,
    bothPct: 58.0,
    maxDarkHours: 10,
    windowHoursRequested: hoursRequested,
    windowHoursAvailable: hoursAvailable,
    powerTrackingMeanPct: 82.0,
    powerHorizontalMeanPct: 2.0,
    points,
  };
}

describe('WP4 — Sky Panorama, Polar Dome & Mission Timeline', () => {
  it('detects Southern Summer Peaks within ±1 day of 2027-11-07 and 2028-10-04 and Winter Peaks around 2027-04-27 and 2028-04-19', () => {
    const fixtureEph = loadSubpointsFixtureAsEphemeris();
    const hourlyEph = makeHourlySyntheticEphemerisFromFixture(fixtureEph);

    const checkDates = (markers: ReturnType<typeof detectSeasonalMarkers>, eph: EphemerisData) => {
      const baseMs = Date.parse(eph.t0_utc);
      const summers = markers.filter((m) => m.kind === 'summer_solstice');
      const winters = markers.filter((m) => m.kind === 'winter_solstice');
      const equinoxes = markers.filter((m) => m.kind === 'equinox');

      expect(summers.length).toBeGreaterThanOrEqual(2);
      expect(winters.length).toBeGreaterThanOrEqual(2);
      expect(equinoxes.length).toBeGreaterThanOrEqual(4);

      // Should NOT misclassify start-of-data (2026-11-14) as a summer peak
      expect(markers[0].kind).toBe('data_start');
      for (const s of summers) {
        expect(s.idx).toBeGreaterThan(24);
      }

      const summerDays = summers.map((m) => baseMs + m.idx * eph.dt_hours * 3600_000);
      const winterDays = winters.map((m) => baseMs + m.idx * eph.dt_hours * 3600_000);

      const oneDayMs = 24 * 3600_000;
      const nearDate = (timestamps: number[], targetIso: string) =>
        timestamps.some((ts) => Math.abs(ts - Date.parse(targetIso)) <= oneDayMs + 12 * 3600_000);

      expect(nearDate(summerDays, '2027-11-07T04:00:00Z')).toBe(true);
      expect(nearDate(summerDays, '2028-10-04T10:00:00Z')).toBe(true);
      expect(nearDate(winterDays, '2027-04-27T11:00:00Z')).toBe(true);
      expect(nearDate(winterDays, '2028-04-19T11:00:00Z')).toBe(true);
    };

    checkDates(detectSeasonalMarkers(hourlyEph), hourlyEph);
    checkDates(computeSeasonalMarkers(hourlyEph), hourlyEph);
  });

  it('parses UTC dates & ISO timestamps strictly with validation errors and dynamic range clamping', () => {
    const t0 = '2026-11-14T00:00:00Z';
    const n = 19033;

    const okIsoSec = parseUtcTimestampInput('2027-11-07T04:00:00Z', 0, t0, n, 1);
    expect(okIsoSec.ok).toBe(true);
    if (okIsoSec.ok) {
      expect(okIsoSec.clamped).toBe(false);
      expect(okIsoSec.idx).toBe(8596);
    }

    const okDateOnly = parseUtcTimestampInput('2027-11-07', 16, t0, n, 1);
    expect(okDateOnly.ok).toBe(true);
    if (okDateOnly.ok) {
      expect(okDateOnly.idx).toBe(8608);
    }

    const badLeap = parseUtcTimestampInput('2027-02-29', 0, t0, n, 1);
    expect(badLeap.ok).toBe(false);

    const malformed = parseUtcTimestampInput('not-a-date', 0, t0, n, 1);
    expect(malformed.ok).toBe(false);

    const outOfRange = parseUtcTimestampInput('2035-05-01T12:00Z', 0, t0, n, 1);
    expect(outOfRange.ok).toBe(true);
    if (outOfRange.ok) {
      expect(outOfRange.clamped).toBe(true);
      expect(outOfRange.idx).toBe(n - 1);
      expect(outOfRange.warning).toContain('2026-11-14 to 2029-01-15 UTC');
    }
  });

  it('renders two HorizonSkyView instances side-by-side with unique SVG gradient/clipPath IDs and no cross-site overlay', () => {
    const siteA = makeTestSite();
    const siteB = makeTestSite({
      id: 'malapert_summit',
      name: 'Malapert Massif (PGDA Site23)',
      short_name: 'Malapert',
      horizons_by_mast: {
        '0.5': new Array<number>(360).fill(1.5),
        '2': new Array<number>(360).fill(1.5),
        '10': new Array<number>(360).fill(1.5),
        '20': new Array<number>(360).fill(1.5),
        '50': new Array<number>(360).fill(1.5),
      },
    });

    const html = renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(HorizonSkyView, {
          site: siteA,
          horizon360: siteA.horizons_by_mast['2'],
          instant: makeTestInstant({ sunAzDeg: 144.7, earthAzDeg: 312.4 }),
          summary: makeTestSummary(),
          mastHeightM: 2,
          label: 'Scenario A',
          compareSite: siteB,
          compareHorizon360: siteB.horizons_by_mast['2'],
        }),
        React.createElement(HorizonSkyView, {
          site: siteB,
          horizon360: siteB.horizons_by_mast['2'],
          instant: makeTestInstant({ sunAzDeg: 5.3, earthAzDeg: 12.1 }),
          summary: makeTestSummary(),
          mastHeightM: 2,
          label: 'Scenario B',
        }),
      ),
    );

    const idMatches = [...html.matchAll(/<(?:linearGradient|clipPath)\s+id="([^"]+)"/g)].map(
      (m) => m[1],
    );
    expect(idMatches.length).toBeGreaterThanOrEqual(6);
    expect(new Set(idMatches).size).toBe(idMatches.length);

    expect(html).toContain('Scenario A');
    expect(html).toContain('Scenario B');
    expect(html).not.toContain('Dashed teal');
    expect(html).not.toContain('stroke-dasharray="4 3" stroke="#2dd4bf"');
  });

  it('displays smooth spherical horizon subtitle and omits Ridge @ tooltip for apollo_11 (terrain_source === "NONE")', () => {
    const dip2m = sphericalHorizonDipDeg(2);
    const apolloSite = makeTestSite({
      id: 'apollo_11',
      name: 'Apollo 11 (Mare Tranquillitatis)',
      short_name: 'Apollo 11',
      terrain_source: 'NONE',
      is_polar_dem: false,
      elev_source: 'APPROXIMATE',
      local_slope_deg: null,
      terrain_stats: null,
      drift_240m: null,
      blocking_dist_km: null,
      horizons_by_mast: {
        '0.5': new Array<number>(360).fill(sphericalHorizonDipDeg(0.5)),
        '2': new Array<number>(360).fill(dip2m),
        '10': new Array<number>(360).fill(sphericalHorizonDipDeg(10)),
        '20': new Array<number>(360).fill(sphericalHorizonDipDeg(20)),
        '50': new Array<number>(360).fill(sphericalHorizonDipDeg(50)),
      },
    });

    const subtitle = describeHorizonSubtitle(apolloSite, 2, dip2m, 336);
    expect(subtitle).toContain('Spherical smooth horizon');
    expect(subtitle).toContain('-acos(R/(R+2.0m))');
    expect(subtitle).not.toContain('LOLA');

    const hover = formatHorizonHoverInfo(
      90,
      apolloSite.horizons_by_mast['2'],
      apolloSite.blocking_dist_km,
      apolloSite.terrain_source,
    );
    expect(hover.distKm).toBeNull();
    expect(hover.text).not.toContain('Ridge @');
    expect(hover.text).toContain('Spherical Horizon');

    const html = renderToStaticMarkup(
      React.createElement(HorizonSkyView, {
        site: apolloSite,
        horizon360: apolloSite.horizons_by_mast['2'],
        instant: makeTestInstant({
          sunHorizonElDeg: dip2m,
          earthHorizonElDeg: dip2m,
          earthElDeg: 65.2,
        }),
        summary: makeTestSummary(),
        mastHeightM: 2,
      }),
    );

    expect(html).toContain('Spherical smooth horizon');
    expect(html).toContain('±5° Horizon Zoom');
    expect(html).toContain('Spherical Ref');
    expect(html).not.toMatch(/text-\[(9|10|11)px\]/);
    expect(html).not.toMatch(/font-size="(9|10|10\.5|11)"/);
  });

  it('uses true angular scale for Sun (0.266° radius) and Earth disks in sky helpers', () => {
    const zoomed = computeBodyPixelRadii(254, -5, 5, 384400, undefined, 0.266);
    const full = computeBodyPixelRadii(254, -12, 24, 384400, undefined, 0.266);

    expect(zoomed.sunAngularRadiusDeg).toBeCloseTo(0.266, 3);
    expect(zoomed.earthAngularRadiusDeg).toBeCloseTo(0.9507, 2);
    expect(zoomed.sunRadiusPx).toBeCloseTo(0.266 * 25.4, 1);
    expect(zoomed.sunRadiusPx).toBeGreaterThan(full.sunRadiusPx);
    expect(zoomed.sunReticlePx).toBeGreaterThan(zoomed.sunRadiusPx);
  });

  it('renders MissionTimeline with data-driven seasonal markers, unlocked mast, Q9 label, explicit UTC controls, and < 25 Tab stops', () => {
    const fixtureEph = loadSubpointsFixtureAsEphemeris();
    const hourlyEph = makeHourlySyntheticEphemerisFromFixture(fixtureEph);
    const nonPolarSite = makeTestSite({
      id: 'apollo_11',
      short_name: 'Apollo 11',
      terrain_source: 'NONE',
      is_polar_dem: false,
      local_slope_deg: null,
      terrain_stats: null,
      drift_240m: null,
      blocking_dist_km: null,
    });

    const html = renderToStaticMarkup(
      React.createElement(MissionTimeline, {
        ephemeris: hourlyEph,
        site: nonPolarSite,
        horizon360: nonPolarSite.horizons_by_mast['2'],
        timeIdx: 5200,
        setTimeIdx: vi.fn(),
        isPlaying: false,
        setIsPlaying: vi.fn(),
        playSpeedHours: 6,
        setPlaySpeedHours: vi.fn(),
        mastHeightM: 2,
        setMastHeightM: vi.fn(),
        isPolarDem: false,
        instant: makeTestInstant(),
        summary: makeTestSummary(5200, 336, 336),
      }),
    );

    // SCI-5: No hardcoded wrong seasonal label
    expect(html).not.toContain('2027-07 (Polar Summer Peak)');
    expect(html).toContain('Southern Summer Peak');
    expect(html).toContain('2027-11-07');
    expect(html).toContain('2028-10-04');
    expect(html).toContain('Winter Peak');
    expect(html).toContain('2027-04-27');
    expect(html).toContain('2028-04-19');

    // TIME-3: Dynamic date range, explicit UTC Date + Hour controls, symmetric slips + Lunar Day
    const expectedBounds = getEphemerisBounds(hourlyEph.t0_utc, hourlyEph.n, hourlyEph.dt_hours);
    expect(html).toContain(expectedBounds.startDate);
    expect(html).toContain(expectedBounds.endDate);
    expect(html).not.toContain('type="datetime-local"');
    expect(html).toContain('00:00 UTC');
    expect(html).toContain('23:00 UTC');
    expect(html).toContain('-1 Lunar (-709h)');
    expect(html).toContain('+1 Lunar (+709h)');
    expect(html).toContain('-14d');
    expect(html).toContain('+14d');

    // SCI-4: Mast controls MUST NOT be disabled on non-polar site
    expect(html).not.toMatch(/id="mast-height-slider"[^>]*disabled/);
    expect(html).not.toMatch(/aria-label="Set mast height to 2 meters"[^>]*disabled/);

    // Q9: Accurate solar tracking panel label
    expect(html).toContain('Solar Disk / Tracking Panel Relative Output (%)');

    // UX-2: Accessible strips with role="slider" and < 25 interactive tab stops
    const sliderMatches = html.match(/role="slider"/g) ?? [];
    expect(sliderMatches.length).toBe(4);

    const interactiveMatches =
      html.match(/<(?:button|select|input)\b|role="slider"/g) ?? [];
    expect(interactiveMatches.length).toBeLessThan(25);

    // Every button must have visible text or aria-label
    const buttonTags = [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)];
    for (const [, attrs, inner] of buttonTags) {
      const hasAria = /aria-label="[^"]+"/.test(attrs);
      const hasText = inner.replace(/<[^>]+>/g, '').trim().length > 0;
      expect(hasAria || hasText).toBe(true);
    }

    // All text >= 12px
    expect(html).not.toMatch(/text-\[(9|10|11)px\]/);
  });

  it('displays actual windowHoursAvailable and truncation notice at ephemeris index n - 100', () => {
    const fixtureEph = loadSubpointsFixtureAsEphemeris();
    const hourlyEph = makeHourlySyntheticEphemerisFromFixture(fixtureEph);
    const site = makeTestSite();
    const startIdx = hourlyEph.n - 100;

    const headerInfo = formatWindowDurationHeader(336, 100);
    expect(headerInfo.isTruncated).toBe(true);
    expect(headerInfo.title).toContain('100h Available of 336h Requested');

    const axisTicks = buildWindowAxisTicks(100);
    expect(axisTicks[axisTicks.length - 1].label).toContain('100h');
    expect(axisTicks[axisTicks.length - 1].label).not.toContain('+14d');

    const dynAxis = buildTimelineAxisTicks('2026-11-14T00:00:00Z', 30000, 1, 5);
    expect(dynAxis[0].monthLabel).toBe('2026-11');
    expect(dynAxis[dynAxis.length - 1].monthLabel).toBe('2030-04');

    const html = renderToStaticMarkup(
      React.createElement(MissionTimeline, {
        ephemeris: hourlyEph,
        site,
        horizon360: site.horizons_by_mast['2'],
        timeIdx: startIdx,
        setTimeIdx: vi.fn(),
        isPlaying: false,
        setIsPlaying: vi.fn(),
        playSpeedHours: 6,
        setPlaySpeedHours: vi.fn(),
        mastHeightM: 2,
        setMastHeightM: vi.fn(),
        isPolarDem: true,
        instant: makeTestInstant({ idx: startIdx }),
        summary: makeTestSummary(startIdx, 100, 336),
      }),
    );

    expect(html).toContain('100h Available of 336h Requested');
    expect(html).toContain('Truncated near end of ephemeris (100 of 336 hours available)');
    expect(html).toContain('+4.2d (100h)');
    expect(html).not.toContain('Next 14-Day Mission Window (336h');
  });

  it('passes computeOptions to launch sensitivity and renders active eclipse state on HorizonSkyView', () => {
    const fixtureEph = loadSubpointsFixtureAsEphemeris();
    const hourlyEph = makeHourlySyntheticEphemerisFromFixture(fixtureEph);
    const site = makeTestSite();

    const htmlSky = renderToStaticMarkup(
      React.createElement(HorizonSkyView, {
        site,
        horizon360: site.horizons_by_mast['2'],
        instant: makeTestInstant({
          activeEclipse: {
            start_utc: '2028-12-31 15:00 UTC',
            idx: 18687,
            hours: 5,
            type: 'total',
          },
          eclipseObscuredFrac: 0.92,
          sunDiskFrac: 0.08,
        }),
        summary: makeTestSummary(18687, 336, 336),
        mastHeightM: 10,
        label: 'Eclipse Check',
      }),
    );

    expect(htmlSky).toContain('Eclipse Check');
    expect(htmlSky).toContain('Sun (ECLIPSE)');
    expect(htmlSky).toContain('Sphere Ref (-0.194°)');
    expect(htmlSky).toContain('Mast 10.0 m');

    const htmlTimeline = renderToStaticMarkup(
      React.createElement(MissionTimeline, {
        ephemeris: hourlyEph,
        site,
        horizon360: site.horizons_by_mast['2'],
        timeIdx: 5200,
        setTimeIdx: vi.fn(),
        isPlaying: false,
        setIsPlaying: vi.fn(),
        playSpeedHours: 6,
        setPlaySpeedHours: vi.fn(),
        mastHeightM: 10,
        setMastHeightM: vi.fn(),
        isPolarDem: true,
        instant: makeTestInstant(),
        summary: makeTestSummary(5200, 336, 336),
        computeOptions: { earthMaskDeg: 5 },
      }),
    );

    expect(htmlTimeline).toContain('Mast Height: <span class="font-mono font-semibold text-sky-300">10.0 m</span>');
  });
});

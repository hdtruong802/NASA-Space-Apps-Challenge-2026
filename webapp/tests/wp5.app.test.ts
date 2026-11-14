import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutModal } from '../src/components/AboutModal';
import { CandidateFinderPanel } from '../src/components/CandidateFinderPanel';
import { GettingStartedModal, ONBOARDING_SECTIONS } from '../src/components/GettingStartedModal';
import { GlossaryTerm } from '../src/components/GlossaryTerm';
import { LearnModal } from '../src/components/LearnModal';
import { NasaRagChatbot } from '../src/components/NasaRagChatbot';
import { ScenarioComparePanel } from '../src/components/ScenarioComparePanel';
import { SiteComparisonTable } from '../src/components/SiteComparisonTable';
import {
  buildMarkdownBrief,
  formatCountdown,
  getOperationalWindows,
  parseAndValidateUrlParams,
} from '../src/components/appHelpers';
import {
  computeAzEl,
  computeInstantAndWindow,
  computeSeasonalMarkers,
  ECLIPSE_ASSUMPTION_TEXT,
  POWER_ASSUMPTION_TEXT,
  RISE_SET_DEFINITION_TEXT,
  sphericalHorizonDipDeg,
} from '../src/lib/lunarMath';
import { askNasaRagAssistant, type RagLiveContext } from '../src/lib/nasaRag';
import { normalizeSites, SCORE_FORMULA_TEXT } from '../src/lib/scoring';
import { candidateToSiteData, rankCandidates } from '../src/lib/candidates';
import type {
  ArtemisRegion,
  EphemerisData,
  SiteCandidate,
  SiteCandidatesData,
  SiteData,
} from '../src/types/lunar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBPOINTS_FIXTURE = path.resolve(__dirname, 'fixtures', 'moon_subpoints_1h.csv');
const PUBLIC_DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');

const WP5_SOURCE_FILES = [
  'src/App.tsx',
  'src/main.tsx',
  'src/index.css',
  'src/components/AccessibleDialog.tsx',
  'src/components/GettingStartedModal.tsx',
  'src/components/GlossaryTerm.tsx',
  'src/components/LearnModal.tsx',
  'src/components/AboutModal.tsx',
  'src/components/NasaRagChatbot.tsx',
  'src/components/ScenarioComparePanel.tsx',
  'src/components/CandidateFinderPanel.tsx',
  'src/components/SiteComparisonTable.tsx',
  'src/components/appHelpers.ts',
  'src/lib/nasaRag.ts',
].map((rel) => path.resolve(__dirname, '..', rel));

function loadFixtureEphemeris(): EphemerisData {
  const pubEph = path.join(PUBLIC_DATA_DIR, 'ephemeris.json');
  if (fs.existsSync(pubEph)) {
    return JSON.parse(fs.readFileSync(pubEph, 'utf-8')) as EphemerisData;
  }

  const lines = fs.readFileSync(SUBPOINTS_FIXTURE, 'utf-8').trim().split(/\r?\n/);
  const headers = lines[0].split(',').map((h) => h.trim());
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

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    subsolar_lat.push(Number.parseFloat(cols[sLatCol]));
    subsolar_lon.push(Number.parseFloat(cols[sLonCol]));
    subearth_lat.push(Number.parseFloat(cols[eLatCol]));
    subearth_lon.push(Number.parseFloat(cols[eLonCol]));
    earth_dist_km.push(Number.parseFloat(cols[distCol]) * 149597870.7);
  }

  const dt = Number.parseInt(lines[2].split(',')[idxCol], 10) - Number.parseInt(lines[1].split(',')[idxCol], 10);
  const totalN = (subsolar_lat.length - 1) * dt + 1;
  const expand = (arr: number[]) => {
    const out = new Array<number>(totalN);
    for (let i = 0; i < arr.length - 1; i++) {
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
    schema_version: '2.0',
    data_version: 'fixture-2026',
    generated_utc: '2026-11-14T00:00:00Z',
    t0_utc: '2026-11-14T00:00:00Z',
    dt_hours: 1,
    n: totalN,
    subsolar_lat: expand(subsolar_lat),
    subsolar_lon: expand(subsolar_lon),
    subearth_lat: expand(subearth_lat),
    subearth_lon: expand(subearth_lon),
    earth_dist_km: expand(earth_dist_km),
    eclipses: [
      { start_utc: '2027-02-20T21:00:00Z', idx: 2373, hours: 3, type: 'partial' },
      { start_utc: '2028-12-31T15:00:00Z', idx: 18687, hours: 5, type: 'total' },
    ],
    validation: {
      sun_max_err_deg: 0.00025,
      earth_max_err_deg: 0.00606,
      ephemeris: 'DE441',
      period_start: '2026-11-14T00:00:00Z',
      period_end: '2029-01-15T00:00:00Z',
      sites_checked: [
        'connecting_ridge',
        'malapert_summit',
        'shackleton_rim',
        'mons_mouton',
        'apollo_11',
        'south_pole',
      ],
    },
  };
}

function makeSyntheticSites(): SiteData[] {
  const flatZeroHz = new Array<number>(360).fill(0);
  const rimHz2m = new Array<number>(360).fill(-0.2);
  const rimHz20m = new Array<number>(360).fill(-0.5);
  const psrHz = new Array<number>(360).fill(18.0);
  const sphereDip = new Array<number>(360).fill(Number(sphericalHorizonDipDeg(2.0).toFixed(4)));

  const raw: SiteData[] = [
    {
      id: 'connecting_ridge',
      name: 'Connecting Ridge',
      short_name: 'Connecting Ridge',
      category: 'Artemis III Ridge',
      program: 'Artemis III',
      description: 'High-illumination South Pole ridge between Shackleton and de Gerlache.',
      terrain_source: 'LOLA_240M',
      is_polar_dem: true,
      elev_source: 'DEM',
      lat: -89.4455,
      lon: -137.3137,
      polar_x_km: -11.38,
      polar_y_km: -12.34,
      elev_m: 1320,
      local_slope_deg: 1.8,
      terrain_stats: {
        elev_min_m: -2400,
        elev_median_m: 180,
        elev_max_m: 1520,
        elev_relief_m: 3920,
        slope_mean_deg: 7.4,
        slope_median_deg: 6.1,
        slope_p90_deg: 15.8,
        pct_safe_hls_le_5deg: 41.2,
        pct_rover_le_15deg: 87.5,
      },
      metrics_2m: {
        sun_no_terrain_pct: 50.8,
        sun_time_pct: 84.5,
        sun_visible_pct: 81.2,
        earth_visible_pct: 54.0,
        both_visible_pct: 46.2,
        longest_sun_days: 154,
        max_dark_days: 6.2,
        earth_max_gap_days: 14.1,
        viability_score: null,
        archetype: null,
      },
      drift_240m: { sun_min_pct: 74.1, sun_max_pct: 85.4 },
      horizons_by_mast: {
        '0.5': rimHz2m,
        '2': rimHz2m,
        '10': rimHz20m,
        '20': rimHz20m,
        '50': rimHz20m,
      },
      blocking_dist_km: new Array<number>(360).fill(18.5),
      mission_status: 'candidate_region',
      provenance: {
        coord_source: 'NASA Artemis III Candidate Region peak (LOLA 240 m)',
        source_url: 'https://www.nasa.gov/artemis-iii/',
        nominal_lat: -89.45,
        nominal_lon: -137.3,
        refine_mode: 'high',
        refine_offset_km: 0.14,
        list_membership: 'Artemis III',
        coord_verified: true,
      },
    },
    {
      id: 'malapert_summit',
      name: 'Malapert Massif Summit',
      short_name: 'Malapert',
      category: 'Artemis III Massif',
      program: 'Artemis III',
      description: 'Prominent South Pole massif with extended DTE view toward Earth.',
      terrain_source: 'LOLA_240M',
      is_polar_dem: true,
      elev_source: 'DEM',
      lat: -85.97,
      lon: -2.45,
      polar_x_km: -5.2,
      polar_y_km: 122.1,
      elev_m: 4860,
      local_slope_deg: 2.3,
      terrain_stats: {
        elev_min_m: -1900,
        elev_median_m: 1200,
        elev_max_m: 4910,
        elev_relief_m: 6810,
        slope_mean_deg: 8.9,
        slope_median_deg: 7.4,
        slope_p90_deg: 19.2,
        pct_safe_hls_le_5deg: 33.4,
        pct_rover_le_15deg: 81.2,
      },
      metrics_2m: {
        sun_no_terrain_pct: 50.6,
        sun_time_pct: 77.1,
        sun_visible_pct: 73.4,
        earth_visible_pct: 76.2,
        both_visible_pct: 59.1,
        longest_sun_days: 92,
        max_dark_days: 7.5,
        earth_max_gap_days: 8.4,
        viability_score: null,
        archetype: null,
      },
      drift_240m: { sun_min_pct: 66.2, sun_max_pct: 77.9 },
      horizons_by_mast: {
        '0.5': flatZeroHz,
        '2': flatZeroHz,
        '10': rimHz20m,
        '20': rimHz20m,
        '50': rimHz20m,
      },
      blocking_dist_km: new Array<number>(360).fill(42.0),
      mission_status: 'candidate_region',
    },
    {
      id: 'shackleton_psr',
      name: 'Shackleton Crater Floor (PSR)',
      short_name: 'Shackleton PSR',
      category: 'PSR Reference',
      program: 'Scientific Reference',
      description: 'Cryogenic crater floor permanently shaded by surrounding steep walls.',
      terrain_source: 'LOLA_240M',
      is_polar_dem: true,
      elev_source: 'DEM',
      lat: -89.66,
      lon: 129.0,
      polar_x_km: 8.0,
      polar_y_km: -6.5,
      elev_m: -3800,
      local_slope_deg: 2.1,
      terrain_stats: {
        elev_min_m: -4100,
        elev_median_m: -2100,
        elev_max_m: 1200,
        elev_relief_m: 5300,
        slope_mean_deg: 16.5,
        slope_median_deg: 14.0,
        slope_p90_deg: 29.0,
        pct_safe_hls_le_5deg: 14.0,
        pct_rover_le_15deg: 48.0,
      },
      metrics_2m: {
        sun_no_terrain_pct: 50.8,
        sun_time_pct: 0,
        sun_visible_pct: 0,
        earth_visible_pct: 0,
        both_visible_pct: 0,
        longest_sun_days: 0,
        max_dark_days: 793,
        earth_max_gap_days: 793,
        viability_score: null,
        archetype: null,
      },
      drift_240m: { sun_min_pct: 0, sun_max_pct: 0 },
      horizons_by_mast: { '2': psrHz },
      blocking_dist_km: new Array<number>(360).fill(4.2),
      mission_status: 'reference',
    },
    {
      id: 'apollo_11',
      name: 'Apollo 11 (Tranquility Base)',
      short_name: 'Apollo 11',
      category: 'Historic Equatorial',
      program: 'Apollo Program',
      description: 'Equatorial mare reference coordinate outside LOLA South Pole DEM coverage.',
      terrain_source: 'NONE',
      is_polar_dem: false,
      elev_source: 'APPROXIMATE',
      lat: 0.6741,
      lon: 23.473,
      polar_x_km: null,
      polar_y_km: null,
      elev_m: -1900,
      local_slope_deg: null,
      terrain_stats: null,
      metrics_2m: {
        sun_no_terrain_pct: 50.1,
        sun_time_pct: 50.1,
        sun_visible_pct: 49.9,
        earth_visible_pct: 100.0,
        both_visible_pct: 49.9,
        longest_sun_days: 14.8,
        max_dark_days: 14.8,
        earth_max_gap_days: 0,
        viability_score: 7.2, // Stale fabricated figure that normalizeSites MUST strip to null!
        archetype: 'Stale Should Clear',
      },
      drift_240m: null,
      horizons_by_mast: { '2': sphereDip },
      blocking_dist_km: null,
      mission_status: 'landed',
      provenance: {
        coord_source: 'NASA LROC Apollo 11 Lunar Surface Journal',
        source_url: 'https://www.nasa.gov/mission/apollo-11/',
        nominal_lat: 0.67408,
        nominal_lon: 23.47297,
        refine_mode: 'exact',
        refine_offset_km: 0.0,
        list_membership: 'Historic Reference',
        coord_verified: true,
      },
    },
  ];

  return normalizeSites(raw);
}

describe('WP5 App Shell, Scenarios, Candidates & Copy Hygiene', () => {
  it('contains zero forbidden overclaim strings and zero < 12px classes across WP5 files', () => {
    const forbiddenRegexes = [
      /\b0\s*W\b/i,
      /100%\s+solar\s+power/i,
      /\breal[- ]time\b/i,
      /\bLINK\s+ACTIVE\b/i,
      />41d\b/i,
      /\b40[x×]\b/i,
      /-90°?W\b/i,
      /Polar Summer Peak/i,
      /\bHLS\s+safe\b/i,
      /\bbest\s+landing\s+site\b/i,
      /\brecommended\s+landing\s+site\b/i,
      /\bsafe\s+landing\s+site\b/i,
    ];
    const smallFontRegex = /text-\[(?:[1-9]|10|11)px\]|fontSize\s*[=:]\s*\{?(?:[1-9]|10|11)\b/;

    for (const filePath of WP5_SOURCE_FILES) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const strippedComments = raw
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|\s)\/\/.*$/gm, '');

      for (const rx of forbiddenRegexes) {
        expect(strippedComments, `Forbidden pattern ${rx} matched in ${filePath}`).not.toMatch(rx);
      }
      expect(strippedComments, `Sub-12px typography matched in ${filePath}`).not.toMatch(
        smallFontRegex,
      );
    }
  });

  it('formats three-case solar & Earth countdowns accurately without legacy >41d', () => {
    const sites = makeSyntheticSites();
    const psr = sites.find((s) => s.id === 'shackleton_psr')!;
    const apollo = sites.find((s) => s.id === 'apollo_11')!;

    const eventRes = formatCountdown(
      { kind: 'event', hours: 36 },
      true,
      'sun',
      sites[0].metrics_2m,
    );
    expect(eventRes.primary).toBe('1.5d (36h)');
    expect(eventRes.detail).toBe('until sunset');
    expect(eventRes.isPermanent).toBe(false);

    const endRes = formatCountdown(
      { kind: 'none_before_data_end', hoursSearched: 48 },
      true,
      'sun',
      apollo.metrics_2m,
    );
    expect(endRes.primary).toBe('Lit to data end');
    expect(endRes.detail).toContain('No sunset before the data ends');
    expect(endRes.detail).toContain('48h left');
    expect(endRes.primary).not.toContain('>41d');

    const psrRes = formatCountdown(
      { kind: 'none_before_data_end', hoursSearched: 1200 },
      false,
      'sun',
      psr.metrics_2m,
    );
    expect(psrRes.primary).toBe('Never sunlit');
    expect(psrRes.isPermanent).toBe(true);

    const apolloEarth = formatCountdown(
      { kind: 'none_before_data_end', hoursSearched: 1200 },
      true,
      'earth',
      apollo.metrics_2m,
    );
    expect(apolloEarth.primary).toBe('Always in view');
    expect(apolloEarth.isPermanent).toBe(true);
  });

  it('strips stale scores on NONE sites and renders n/a + approximate elevation in table and Export Brief', () => {
    const eph = loadFixtureEphemeris();
    const sites = makeSyntheticSites();
    const connecting = sites.find((s) => s.id === 'connecting_ridge')!;
    const apollo = sites.find((s) => s.id === 'apollo_11')!;

    expect(apollo.metrics_2m.viability_score).toBeNull();
    expect(apollo.metrics_2m.archetype).toBe('High-DTE Communication Hub');

    const tableHtml = renderToStaticMarkup(
      React.createElement(SiteComparisonTable, {
        sites,
        selectedSite: apollo,
        compareSite: connecting,
        onSelectSite: () => {},
        onToggleCompare: () => {},
        ephemeris: eph,
        timeIdx: 10,
        mastHeightM: 2,
        windowHours: 336,
      }),
    );

    expect(tableHtml).toContain('Apollo 11');
    expect(tableHtml).toContain('≈ -1,900 m');
    expect(tableHtml).toContain('n/a');
    expect(tableHtml).toContain('Landed');
    expect(tableHtml).not.toContain('7.2');

    // Near end of ephemeris -> truncated window note + n/a terrain lines in Export Brief
    const nearEndIdx = Math.max(0, eph.n - 100);
    const { instant, summary } = computeInstantAndWindow(
      eph,
      apollo,
      apollo.horizons_by_mast['2'],
      nearEndIdx,
      336,
    );
    const brief = buildMarkdownBrief({
      site: apollo,
      instant,
      summary,
      ephemeris: eph,
      mastHeightM: 2,
      earthMaskDeg: 0,
      dataVersion: 'test-v2',
      formulaText: SCORE_FORMULA_TEXT,
      powerAssumptionText: POWER_ASSUMPTION_TEXT,
      riseSetDefinitionText: RISE_SET_DEFINITION_TEXT,
      eclipseAssumptionText: ECLIPSE_ASSUMPTION_TEXT,
    });

    expect(brief).toContain('n/a — no terrain data for this location');
    expect(brief).toContain('≈ -1,900 m');
    expect(brief).toContain('100h available of 336h requested');
    expect(brief).toContain(POWER_ASSUMPTION_TEXT);
    expect(brief).toContain(RISE_SET_DEFINITION_TEXT);
  });

  it('renders ScenarioComparePanel with independent HorizonSkyView calculations & operational windows', () => {
    const eph = loadFixtureEphemeris();
    const sites = makeSyntheticSites();
    const siteA = sites[0]; // connecting_ridge
    const siteB = sites[1]; // malapert_summit
    const tIdxA = Math.min(5200, eph.n - 1);
    const tIdxB = Math.min(5200, eph.n - 1);

    const evalA = computeInstantAndWindow(eph, siteA, siteA.horizons_by_mast['2'], tIdxA, 336);
    const evalB = computeInstantAndWindow(eph, siteB, siteB.horizons_by_mast['2'], tIdxB, 336);

    // Check independent geometry matches computeAzEl
    const azElA = computeAzEl(
      siteA.lat,
      siteA.lon,
      siteA.elev_m,
      eph.subsolar_lon[tIdxA],
      eph.subsolar_lat[tIdxA],
      149597870.7,
    );
    const azElB = computeAzEl(
      siteB.lat,
      siteB.lon,
      siteB.elev_m,
      eph.subsolar_lon[tIdxB],
      eph.subsolar_lat[tIdxB],
      149597870.7,
    );
    expect(evalA.instant.sunAzDeg).toBeCloseTo(azElA.azDeg, 5);
    expect(evalB.instant.sunAzDeg).toBeCloseTo(azElB.azDeg, 5);
    expect(Math.abs(azElA.azDeg - azElB.azDeg)).toBeGreaterThan(10);

    const html = renderToStaticMarkup(
      React.createElement(ScenarioComparePanel, {
        ephemeris: eph,
        sites,
        customSiteA: null,
        customSiteB: null,
        siteA,
        horizonA: siteA.horizons_by_mast['2'],
        timeIdxA: tIdxA,
        mastHeightA: 2,
        instantA: evalA.instant,
        summaryA: evalA.summary,
        siteB,
        horizonB: siteB.horizons_by_mast['2'],
        timeIdxB: tIdxB,
        mastHeightB: 2,
        instantB: evalB.instant,
        summaryB: evalB.summary,
        windowHours: 336,
        earthMaskDeg: 0,
        seasonalMarkers: computeSeasonalMarkers(eph),
        onSelectSiteA: () => {},
        onSelectSiteB: () => {},
        onProbeCoordsA: () => {},
        onProbeCoordsB: () => {},
        onChangeTimeA: () => {},
        onChangeTimeB: () => {},
        onChangeMastA: () => {},
        onChangeMastB: () => {},
        onSwapScenarios: () => {},
        onApplyPreset: () => {},
      }),
    );

    expect(html).toContain('aria-label="Scenario A vs Scenario B Comparison"');
    expect(html).toContain('Scenario A');
    expect(html).toContain('Scenario B');
    expect(html).toContain('Compare Two Sites');
    expect(html).toContain('Launch Slip (+7d)');
    expect(html).toContain('Seasonal Shift');
    expect(html).toContain('Mast Height (2 m vs 20 m)');
    expect(html).toContain('UTC Operational Windows');

    const sunWins = getOperationalWindows(evalA.summary, eph.t0_utc, 'sun', eph.dt_hours);
    expect(sunWins.length).toBeGreaterThan(0);
    expect(sunWins[0].startUtc).toContain('UTC');
  });

  it('validates URL query parameters strictly without silently coercing invalid entries', () => {
    const eph = loadFixtureEphemeris();
    const sites = makeSyntheticSites();

    const invalid = parseAndValidateUrlParams(
      '?site=unknown_place&lat=999&lon=abc&t=-5&mast=99&cmp=zzz&cmpt=notanint&cmpmast=0.1&mask=45&view=bogus',
      sites,
      eph,
    );
    expect(invalid.customCoords).toBeUndefined();
    expect(invalid.timeIdx).toBeUndefined();
    expect(invalid.mastHeightM).toBeUndefined();
    expect(invalid.compareSiteId).toBeUndefined();
    expect(invalid.earthMaskDeg).toBeUndefined();
    expect(invalid.activeTab).toBeUndefined();
    expect(invalid.warnings.length).toBeGreaterThanOrEqual(7);

    const valid = parseAndValidateUrlParams(
      '?site=connecting_ridge&cmp=malapert_summit&t=120&mast=10&cmpt=288&cmpmast=20&mask=2&view=compare',
      sites,
      eph,
    );
    expect(valid.warnings).toEqual([]);
    expect(valid.siteId).toBe('connecting_ridge');
    expect(valid.compareSiteId).toBe('malapert_summit');
    expect(valid.timeIdx).toBe(120);
    expect(valid.mastHeightM).toBe(10);
    expect(valid.compareTimeIdx).toBe(288);
    expect(valid.compareMastHeightM).toBe(20);
    expect(valid.earthMaskDeg).toBe(2);
    expect(valid.activeTab).toBe('compare');
  });

  it('renders accessible LearnModal, AboutModal, GlossaryTerm & CandidateFinderPanel with required disclosures', () => {
    const eph = loadFixtureEphemeris();
    const sites = makeSyntheticSites();
    const sampleCandidate: SiteCandidate = {
      id: 'cand_a_100_120_p4',
      rank: 1,
      mode: 'A',
      lat: -89.42,
      lon: -135.1,
      xKm: -12.0,
      yKm: -12.0,
      elevM: 1280,
      slopeDeg: 2.4,
      flat1kmPct: 38.0,
      flatBoxPct: 41.0,
      sunVisiblePct: 83.2,
      sunTimePct: 86.0,
      earthVisiblePct: 58.1,
      bothVisiblePct: 49.4,
      maxDarkHours: 132,
      viabilityScore: 68.4,
      isRefined: true,
      artemisCode: 'A3-CR',
    };
    const regions: ArtemisRegion[] = [
      {
        region: 'Connecting Ridge',
        code: 'A3-CR',
        centroid_lat: -89.45,
        centroid_lon: -137.3,
        area_km2: 145,
        polar_x_km: -11.4,
        polar_y_km: -12.3,
        in_polar_frame: true,
      },
    ];

    const learnHtml = renderToStaticMarkup(
      React.createElement(LearnModal, {
        open: true,
        onClose: () => {},
        ephemeris: eph,
        onJumpToTimestamp: () => {},
      }),
    );
    const expectedSolarRatio = Math.max(
      1,
      Math.round(0.53 / Math.max(0.001, eph.validation.earth_max_err_deg)),
    );
    expect(learnHtml).toContain('role="dialog"');
    expect(learnHtml).toContain('aria-modal="true"');
    expect(learnHtml).toContain(`${expectedSolarRatio}×`);
    expect(learnHtml).toContain('Moon-center:');
    // Regression guard: total eclipse description contains "(Sun fully hidden)" and <1% uses 1 decimal place
    const learnTotalEph: EphemerisData = {
      ...eph,
      eclipses: [
        { start_utc: '2027-08-17 07:00', idx: 0, hours: 1, type: 'partial', max_obscured_frac: 0.004 },
        { start_utc: '2028-12-31 15:00', idx: 1, hours: 4, type: 'total (Sun fully hidden)', max_obscured_frac: 1.0 },
      ],
    };
    const learnEclipseHtml = renderToStaticMarkup(
      React.createElement(LearnModal, {
        open: true,
        onClose: () => {},
        ephemeris: learnTotalEph,
        onJumpToTimestamp: () => {},
      }),
    );
    expect(learnEclipseHtml).toContain('1 of 2 events are partial');
    expect(learnEclipseHtml).toContain('1 is total');
    expect(learnEclipseHtml).toContain('max 0.4% obscured');

    const aboutHtml = renderToStaticMarkup(
      React.createElement(AboutModal, {
        open: true,
        onClose: () => {},
        ephemeris: eph,
        sitesCount: sites.length,
        sites,
        dataVersion: 'v2-test',
        dataGeneratedUtc: '2026-11-14T00:00:00Z',
      }),
    );
    expect(aboutHtml).toContain('role="dialog"');
    expect(aboutHtml).toContain('aria-modal="true"');
    expect(aboutHtml).toContain('Apache-2.0');
    expect(aboutHtml).toContain('Team VeriFour');
    expect(aboutHtml).toContain('Antigravity');
    expect(aboutHtml).toContain('ssd.jpl.nasa.gov/api/horizons.api');
    expect(aboutHtml).toContain('LDEM_75S_240M');
    expect(aboutHtml).toContain('doi:10.1016/j.icarus.2010.10.030');
    expect(aboutHtml).toContain('doi:10.1016/j.pss.2017.07.006');
    expect(aboutHtml).toContain('AVGVISIB_65S_240M_201608.IMG');
    expect(aboutHtml).toContain('Connecting Ridge (C1)');
    expect(aboutHtml).toContain('93.48%');

    const gettingStartedHtml = renderToStaticMarkup(
      React.createElement(GettingStartedModal, {
        open: true,
        onClose: () => {},
        onNavigate: () => {},
        currentView: 'surface3d',
        ephemeris: eph,
        onJumpToTimestamp: () => {},
        onRunPreset: () => {},
        onStartInteractiveTour: () => {},
        onStartSectionTour: () => {},
        onOpenAbout: () => {},
      }),
    );
    expect(gettingStartedHtml).toContain('role="dialog"');
    expect(gettingStartedHtml).toContain('aria-modal="true"');
    expect(gettingStartedHtml).toContain('1 · Choose &amp; Quick-Start');
    expect(gettingStartedHtml).toContain('2 · 5 Workspaces');
    expect(gettingStartedHtml).toContain('3 · Read KPIs &amp; Instruments');
    expect(gettingStartedHtml).toContain('4 · Physics &amp; Eclipses');
    expect(gettingStartedHtml).toContain('Drive the 3D Rover on Connecting Ridge');
    expect(gettingStartedHtml).toContain('Section-by-Section Screen Map (7 Sections with Explanations)');
    expect(gettingStartedHtml).toContain('Start Interactive Tour (7 Sections)');
    expect(ONBOARDING_SECTIONS).toHaveLength(7);
    for (const sec of ONBOARDING_SECTIONS) {
      expect(sec.overview.length).toBeGreaterThan(30);
      expect(sec.items.length).toBeGreaterThanOrEqual(4);
    }

    const gettingStartedPhysicsHtml = renderToStaticMarkup(
      React.createElement(GettingStartedModal, {
        open: true,
        onClose: () => {},
        onNavigate: () => {},
        currentView: 'surface3d',
        ephemeris: eph,
        onJumpToTimestamp: () => {},
        initialTab: 3,
        onOpenAbout: () => {},
      }),
    );
    expect(gettingStartedPhysicsHtml).toContain(
      'Sun &amp; Earth Direction Checked vs JPL Horizons DE441',
    );
    expect(gettingStartedPhysicsHtml).toContain('0.53° solar disk diameter');
    expect(gettingStartedPhysicsHtml).toContain('Why Earth Rises &amp; Sets (Libration)');
    expect(gettingStartedPhysicsHtml).toContain('Solar Eclipses from the Moon');

    // Keyboard & touch accessible GlossaryTerm button semantics
    const glossaryHtml = renderToStaticMarkup(
      React.createElement(GlossaryTerm, { termKey: 'dte', label: 'DTE Geometry' }),
    );
    expect(glossaryHtml).toContain('<button');
    expect(glossaryHtml).toContain('aria-expanded="false"');

    const candHtml = renderToStaticMarkup(
      React.createElement(CandidateFinderPanel, {
        ephemeris: eph,
        artemisRegions: regions,
        selectedSite: sites[0],
        clientDem: null,
        ensureClientDem: async () => null,
        candidatesData: null,
        candidatesLoading: false,
        candidatesError: null,
        onEnsureCandidatesData: async () => null,
        timeIdx: 0,
        mastHeightM: 2,
        windowHours: 336,
        candidates: [sampleCandidate],
        selectedCandidateId: sampleCandidate.id,
        onCandidatesChange: () => {},
        onSelectCandidate: () => {},
        onCompareCandidate: () => {},
      }),
    );
    expect(candHtml).toContain('Top candidates by Composite Viability Index');
    expect(candHtml).toContain('not a landing recommendation');
    expect(candHtml).toContain('Computed · Mode A');

    // Verify Escape + focus-trap contract in AccessibleDialog and GlossaryTerm
    const dialogSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/components/AccessibleDialog.tsx'),
      'utf-8',
    );
    expect(dialogSrc).toContain("e.key === 'Escape'");
    expect(dialogSrc).toContain("e.key === 'Tab'");
    expect(dialogSrc).toContain('previousFocusRef');

    const glossarySrc = fs.readFileSync(
      path.resolve(__dirname, '../src/components/GlossaryTerm.tsx'),
      'utf-8',
    );
    expect(glossarySrc).toContain("e.key === 'Escape'");
    expect(glossarySrc).toContain('pointerdown');

    // Regression guards for Chrome DevTools audit (#30)
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
    expect(appSrc).toContain('clientDemRef');
    expect(appSrc).not.toContain('}, [ensureClientDem]);');
    expect(appSrc).toContain('{summary.windowHoursAvailable}h DTE Window');
    expect(appSrc).toContain('lg:sticky lg:top-0');

    for (const file of WP5_SOURCE_FILES) {
      const content = fs.readFileSync(file, 'utf-8');
      expect(content).not.toMatch(/\.toLocaleString\(\s*\)/);
    }

    expect(candHtml).toContain('id="cand-criterion"');
    expect(candHtml).toContain('name="cand-criterion"');
    expect(candHtml).toContain('name="cand-max-slope"');
  });

  it('normalizes and renders real sites.json dataset cleanly if generated on disk', () => {
    const pubSites = path.join(PUBLIC_DATA_DIR, 'sites.json');
    if (!fs.existsSync(pubSites)) return;

    const payload = JSON.parse(fs.readFileSync(pubSites, 'utf-8')) as {
      data_version: string;
      sites: SiteData[];
    };
    const normalized = normalizeSites(payload.sites);
    expect(normalized.length).toBeGreaterThanOrEqual(20);

    const apollo = normalized.find((s) => s.id === 'apollo_11');
    const ridge = normalized.find((s) => s.id === 'connecting_ridge');
    expect(apollo).toBeDefined();
    expect(ridge).toBeDefined();
    expect(apollo!.terrain_source).toBe('NONE');
    expect(apollo!.metrics_2m.viability_score).toBeNull();
    expect(ridge!.metrics_2m.viability_score).not.toBeNull();

    const tableHtml = renderToStaticMarkup(
      React.createElement(SiteComparisonTable, {
        sites: normalized,
        selectedSite: ridge!,
        compareSite: normalized.find((s) => s.id === 'malapert_summit') ?? null,
        onSelectSite: () => {},
        onToggleCompare: () => {},
      }),
    );
    expect(tableHtml).toContain('Apollo 11');
    expect(tableHtml).toContain('Connecting Ridge');
    expect(tableHtml).toContain('n/a');

    // Verify AboutModal renders live solver metrics alongside Mazarico/Gläser/PDS benchmarks
    const liveEph = loadFixtureEphemeris();
    const aboutRealHtml = renderToStaticMarkup(
      React.createElement(AboutModal, {
        open: true,
        onClose: () => {},
        ephemeris: liveEph,
        sitesCount: normalized.length,
        sites: normalized,
        dataVersion: payload.data_version,
      }),
    );
    expect(aboutRealHtml).toContain(`${ridge!.metrics_2m.sun_time_pct.toFixed(1)}%`);
    expect(aboutRealHtml).toContain('doi:10.1016/j.icarus.2010.10.030');
    expect(aboutRealHtml).not.toMatch(/\b0 W\b|100% solar power/);

    // Verify real site_candidates.json integrates cleanly with Mode A CandidateFinderPanel & SiteComparisonTable
    const pubCandidates = path.join(PUBLIC_DATA_DIR, 'site_candidates.json');
    const pubRegions = path.join(PUBLIC_DATA_DIR, 'artemis3_regions.json');
    if (fs.existsSync(pubCandidates) && fs.existsSync(pubRegions)) {
      const candidatesPayload = JSON.parse(
        fs.readFileSync(pubCandidates, 'utf-8'),
      ) as SiteCandidatesData;
      const regionsPayload = JSON.parse(fs.readFileSync(pubRegions, 'utf-8')) as {
        regions: ArtemisRegion[];
      };
      const rankResult = rankCandidates(
        candidatesPayload,
        {
          criterion: 'score',
          region: { kind: 'map' },
          maxSlopeDeg: 5,
          minFlat1kmPct: 20,
          count: 10,
          minSepKm: 2.4,
        },
        regionsPayload.regions,
      );
      expect(rankResult.picked.length).toBeGreaterThan(0);

      const syntheticCandidateSite = candidateToSiteData(rankResult.picked[0], null);
      expect(syntheticCandidateSite.mission_status).toBeUndefined();
      expect(syntheticCandidateSite.provenance).toBeUndefined();

      const candPanelHtml = renderToStaticMarkup(
        React.createElement(CandidateFinderPanel, {
          ephemeris: liveEph,
          artemisRegions: regionsPayload.regions,
          selectedSite: ridge!,
          clientDem: null,
          ensureClientDem: async () => null,
          candidatesData: candidatesPayload,
          candidatesLoading: false,
          candidatesError: null,
          onEnsureCandidatesData: async () => candidatesPayload,
          timeIdx: 0,
          mastHeightM: 2,
          windowHours: 336,
          candidates: rankResult.picked,
          selectedCandidateId: rankResult.picked[0].id,
          onCandidatesChange: () => {},
          onSelectCandidate: () => {},
          onCompareCandidate: () => {},
        }),
      );
      expect(candPanelHtml).toContain('Computed · Mode A');
      expect(candPanelHtml).toContain('not a landing recommendation');

      const mixedTableHtml = renderToStaticMarkup(
        React.createElement(SiteComparisonTable, {
          sites: normalized,
          selectedSite: ridge!,
          compareSite: null,
          candidates: rankResult.picked,
          onSelectSite: () => {},
          onToggleCompare: () => {},
          onSelectCandidate: () => {},
        }),
      );
      expect(mixedTableHtml).toContain('Computed');
      expect(mixedTableHtml).toContain(`#${rankResult.picked[0].rank} (`);
    }
  });

  it('returns deterministic VeriFour fallback notice + NASA citations when no API key is configured and renders NasaRagChatbot SSR', async () => {
    const eph = loadFixtureEphemeris();
    const sites = makeSyntheticSites();
    const ridge = sites[0];
    const malapert = sites[1];
    const { instant, summary } = computeInstantAndWindow(
      eph,
      ridge,
      ridge.horizons_by_mast['2'],
      0,
      336,
    );

    const liveContext: RagLiveContext = {
      selectedSite: ridge,
      compareSite: malapert,
      ephemeris: eph,
      sites,
      utcIso: instant.utcIso,
      mastHeightM: 2,
      earthMaskDeg: 0,
      windowHours: 336,
      trackingPct: instant.power?.trackingPct ?? instant.sunDiskFrac * 100,
      horizontalPct: instant.power?.horizontalPct ?? 0,
      sunElevDeg: instant.sunElDeg,
      earthElevDeg: instant.earthElDeg,
      dteClear: instant.earthVisible,
      windowSunPct: summary.sunPct,
      windowEarthPct: summary.earthPct,
      windowJointPct: summary.bothPct,
      maxDarkHours: summary.maxDarkHours,
      viabilityScore: ridge.metrics_2m.viability_score,
      activeView: 'surface3d',
      hasClientDem: false,
    };

    const viReply = await askNasaRagAssistant({
      query: 'Công thức Viability Index là gì?',
      liveContext,
    });
    expect(viReply.usedFallback).toBe(true);
    expect(viReply.answer).toContain('liên hệ team VeriFour để có thêm token');
    expect(viReply.answer).toContain('0.35');
    expect(
      viReply.citations.some(
        (cit) => cit.includes('NASA') || cit.includes('LOLA') || cit.includes('Horizons'),
      ),
    ).toBe(true);
    expect(viReply.actions.length).toBeGreaterThan(0);

    const enReply = await askNasaRagAssistant({
      query: 'Explain NASA LRO LOLA 240m provenance and Mazarico 2011 benchmark',
      liveContext,
    });
    expect(enReply.usedFallback).toBe(true);
    expect(enReply.answer).toContain('contact team VeriFour for more tokens');
    expect(enReply.citations.some((cit) => cit.includes('Mazarico') || cit.includes('NASA'))).toBe(
      true,
    );

    const closedHtml = renderToStaticMarkup(
      React.createElement(NasaRagChatbot, {
        liveContext,
        open: false,
        onOpenChange: () => {},
        onTriggerAction: () => {},
      }),
    );
    expect(closedHtml).toContain('NASA RAG AI');
    expect(closedHtml).toContain('aria-expanded="false"');

    const openHtml = renderToStaticMarkup(
      React.createElement(NasaRagChatbot, {
        liveContext,
        open: true,
        onOpenChange: () => {},
        onTriggerAction: () => {},
      }),
    );
    expect(openHtml).toContain('role="dialog"');
    expect(openHtml).toContain('VeriFour NASA RAG Assistant');
    expect(openHtml).toContain('Connecting Ridge');
    expect(openHtml).toContain('Quick NASA Prompts (1-Click)');
    expect(openHtml).toContain('JPL DE441');

    // Regression checks for Explain Section sticky-header fix & RAG wiring in App.tsx
    const appSrc = fs.readFileSync(path.resolve(__dirname, '../src/App.tsx'), 'utf-8');
    expect(appSrc).toContain('data-tour-card={sectionId}');
    expect(appSrc).toContain('tourPulse');
    expect(appSrc).toContain('max-h-[68vh] overflow-y-auto');
    expect(appSrc).toContain('Explain Header');
    expect(appSrc).toContain('Hide Explain');
    expect(appSrc).toContain('NASA AI Chat');
    expect(appSrc).toContain('<NasaRagChatbot');
    for (const actionId of [
      'deploy_rover',
      'jump_eclipse',
      'open_tour',
      'open_compare',
      'open_directory',
      'load_hd_dem',
      'open_physics_tab',
    ]) {
      expect(appSrc).toContain(`case '${actionId}'`);
    }
  });
});

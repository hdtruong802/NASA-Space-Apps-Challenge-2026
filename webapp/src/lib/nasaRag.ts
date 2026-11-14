import type { EphemerisData, SiteData } from '../types/lunar';
import { computeViability } from './scoring';

declare global {
  interface ImportMetaEnv {
    readonly VITE_OPENAI_API_KEY?: string;
    readonly VITE_OPENAI_MODEL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export type RagActionId =
  | 'deploy_rover'
  | 'jump_eclipse'
  | 'open_tour'
  | 'open_compare'
  | 'open_directory'
  | 'load_hd_dem'
  | 'open_physics_tab';

export interface RagActionSuggestion {
  id: RagActionId;
  label: string;
}

export interface RagChunk {
  id: string;
  topic: string;
  title: string;
  source: string;
  citations: string[];
  keywords: string[];
  content: string;
  actions?: RagActionSuggestion[];
}

export interface RagLiveContext {
  selectedSite: SiteData;
  compareSite: SiteData | null;
  ephemeris: EphemerisData;
  sites: SiteData[];
  utcIso: string;
  mastHeightM: number;
  earthMaskDeg: number;
  windowHours: number;
  trackingPct: number;
  horizontalPct: number;
  sunElevDeg: number;
  earthElevDeg: number;
  dteClear: boolean;
  windowSunPct: number;
  windowEarthPct: number;
  windowJointPct: number;
  maxDarkHours: number;
  viabilityScore: number | null;
  activeView: string;
  hasClientDem: boolean;
}

export interface RagResponse {
  answer: string;
  citations: string[];
  actions: RagActionSuggestion[];
  usedFallback: boolean;
  fallbackReason?: string;
}

export interface RagChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface AskNasaRagOptions {
  query: string;
  liveContext: RagLiveContext;
  history?: RagChatTurn[];
  apiKeyOverride?: string;
}

export const VERIFOUR_OPENAI_KEY_STORAGE = 'verifour-openai-key';

export const VERIFOUR_FALLBACK_NOTICE_VI =
  '⚠️ Hiện tại API key OpenAI đã hết token (hoặc chưa cấu hình trong file .env) — bạn vui lòng liên hệ team VeriFour để có thêm token nhé! =))';

export const VERIFOUR_FALLBACK_NOTICE_EN =
  '⚠️ OpenAI API key is out of tokens (or not configured in .env) — please contact team VeriFour for more tokens! =))';

const CATALOG_ACTIONS: Record<RagActionId, RagActionSuggestion> = {
  deploy_rover: { id: 'deploy_rover', label: 'Deploy 3D Rover Here' },
  jump_eclipse: { id: 'jump_eclipse', label: 'Jump to Dec 31 2028 Eclipse' },
  open_tour: { id: 'open_tour', label: 'Start 7-Section UI Tour' },
  open_compare: { id: 'open_compare', label: 'Open Compare A vs B' },
  open_directory: { id: 'open_directory', label: 'Open Candidate Directory' },
  load_hd_dem: { id: 'load_hd_dem', label: 'Load 240 m HD DEM' },
  open_physics_tab: { id: 'open_physics_tab', label: 'Open Lunar Physics Guide' },
};

export const NASA_RAG_CORPUS: RagChunk[] = [
  {
    id: 'data-provenance',
    topic: 'Official NASA/CSA Datasets & Literature Benchmarks',
    title: 'Primary NASA Datasets vs. Mazarico (2011), Gläser (2018) & Barker (2023)',
    source: 'NASA JPL Horizons DE441 · NASA PDS LRO LOLA LDEM_75S_240M · LROC QuickMap',
    citations: [
      'NASA JPL Horizons DE441 (MOON_ME, 36,216 hourly steps)',
      'NASA PDS LRO LOLA LDEM_75S_240M (240 m/px)',
      'Artemis III 2024 A3_9regions GeoJSON (LROC QuickMap / ASU)',
      'Mazarico et al. (2011) doi:10.1016/j.icarus.2010.10.030',
      'Barker et al. (2023) doi:10.3847/PSJ/acf3e1',
    ],
    keywords: [
      'nasa',
      'csa',
      'dataset',
      'provenance',
      'jpl',
      'horizons',
      'de441',
      'moon_me',
      'lola',
      'ldem',
      '240m',
      'pds',
      'avgvisib',
      'artemis',
      'geojson',
      'quickmap',
      'moon trek',
      'mazarico',
      '2011',
      'glaeser',
      'glaser',
      '2018',
      'barker',
      '2021',
      '2023',
      '93.48',
      '94.3',
      'literature',
      'doi',
      'du lieu',
      'nguon',
      'bai bao',
      'khoa hoc',
      'doi chieu',
      'khac biet',
    ],
    content:
      'Primary ingested datasets for EDA & simulation are: (1) NASA JPL Horizons System (DE441 / MOON_ME body-fixed frame) across 36,216 hourly steps from 2026-11-14 to 2030-12-31 UTC, verified against Horizons topocentric checkpoints within <= 0.0002 deg (Sun) and <= 0.0061 deg (Earth); (2) NASA LRO LOLA Gridded Data Record LDEM_75S_240M (PDS Geosciences Node, 240 m/px polar stereographic grid 75S-90S, R0 = 1,737.4 km) plus a 1,200 m/px block-max outer grid for 360-deg horizon ray-marching across 480 log-spaced steps (120 m to 200 km); (3) Artemis III 2024 9 Candidate Regions GeoJSON (A3_9regions via LROC QuickMap / ASU). Consulted references: NASA Moon Trek, NSSDCA Lunar Sites Catalog, and Canadian Space Agency (CSA) Moon Exploration. Historical and international landers (Apollo, CLPS, Chandrayaan-3, SLIM, Chang e-4) are coordinate reference targets evaluated strictly over NASA Horizons and LOLA geometry. External literature benchmarks are explicitly separated from app outputs: Mazarico et al. (2011, Icarus 211:1066-1081, doi:10.1016/j.icarus.2010.10.030) reported 89.0% mean / 92.7% visibility at Connecting Ridge C1 at 0 m surface height over 18.6 yr; NASA PDS AVGVISIB_65S_240M reports 93.48% within +-1 km at 0 m; Gläser et al. (2018, Planet. Space Sci. 162:170-178, doi:10.1016/j.pss.2017.07.006) evaluated 20 m/px LOLA; Barker et al. (2021, doi:10.1016/j.pss.2020.105119; 2023, PSJ doi:10.3847/PSJ/acf3e1) modeled 5 m LOLA illumination and terrain error. Our Connecting Ridge baseline shows 94.3% sun-time (90.1% mean solar disk) because: (a) our baseline evaluates a 2 m mast (+1-2% on sharp ridges vs 0 m surface), (b) coordinates snap to the locally refined highest 240 m pixel (137 m offset, matching PDS 93.48%), and (c) 2026-2030 (4.1 yr) samples a distinct slice of the 18.6-year lunar nodal precession cycle.',
    actions: [CATALOG_ACTIONS.open_physics_tab, CATALOG_ACTIONS.open_tour],
  },
  {
    id: 'viability-formula',
    topic: 'Composite Viability Index & Physical Definitions',
    title: 'Composite Viability Index Formula (scoring.ts) & 240 m Scope Limitations',
    source: 'VeriFour scoring.ts (Q2/I2) · lunarMath.ts · AboutModal.tsx',
    citations: [
      'VeriFour scoring.ts (0.35 Sun + 0.25 DTE + 0.15 Joint + 0.15 Dark + 0.10 Slope<=5 deg)',
      'NASA LRO LOLA LDEM_75S_240M (30x30 km baseline)',
      'Barker et al. (2023) & Gläser et al. (2018) 5 deg slope context',
    ],
    keywords: [
      'viability',
      'score',
      'formula',
      'mcda',
      'weight',
      '0.35',
      '0.25',
      '0.15',
      '0.10',
      'dark',
      'slope',
      '5 deg',
      'n/a',
      'solar',
      'array',
      'horizontal',
      'lambert',
      'sin',
      'limitation',
      'boulder',
      'cong thuc',
      'diem',
      'tinh diem',
      'gioi han',
      'do doc',
      'chi so',
    ],
    content:
      'In webapp/src/lib/scoring.ts, the team-defined Composite Viability Index (0-100, exploratory screening metric and not an official NASA landing standard) is a convex MCDA formula: 0.35 * Mean Solar Disk (%) + 0.25 * Earth DTE (%) + 0.15 * Joint Sun+Earth (%) + 0.15 * Dark Resilience + 0.10 * 240 m Baseline Slope <= 5 deg (%). Dark Resilience equals max(0, 100 * (1 - min(max_dark_days, 30) / 30)), normalizing maximum continuous darkness against a 30-day synodic cycle (saturating at 0 for >= 30 d PSRs). Terrain <= 5 deg measures the percentage of 240 m pixels inside a 30 x 30 km box with baseline slope <= 5 deg. Whenever terrain_stats is null (north of 75S, terrain_source = NONE), Viability Score returns null / n/a. Solar Array modeling distinguishes Vertical Sun-Tracking (effective solar disk fraction * 100) from Horizontal Panel output (effective disk fraction * max(0, sin(Sun El)) * 100), illustrating Lambert cosine attenuation near the pole. Crucial limitation: 240 m/px LOLA captures regional horizon blockage and macro slopes, NOT meter-scale boulders, small impact craters, or regolith bearing strength, so high Viability Scores do not certify touchdown clearance (which requires 5 m/px PGDA and 1 m/px LROC NAC imagery).',
    actions: [CATALOG_ACTIONS.open_directory, CATALOG_ACTIONS.open_compare],
  },
  {
    id: 'rover-controls',
    topic: '3D Rover Controls, Flight Mode & Camera Views',
    title: 'Driving, VTOL Flight Mode, Cameras & Surface Layers in 3D Viewport',
    source: 'Lunar3DViewport.tsx · roverPhysics.ts',
    citations: [
      'Lunar3DViewport.tsx (Three.js 240 m LOLA South Pole Mesh)',
      'roverPhysics.ts (Surface slope & 360-deg cached horizon telemetry)',
    ],
    keywords: [
      'rover',
      '3d',
      'drive',
      'controls',
      'wasd',
      'arrow',
      'flight',
      'fly',
      'vtol',
      'hopper',
      'space',
      'shift',
      'brake',
      'headlight',
      'led',
      'camera',
      'chase',
      'mast',
      'orbit',
      'free cam',
      'layer',
      'regolith',
      'slope',
      'composite',
      'gear',
      'autopilot',
      'waypoint',
      'dieu khien',
      'lai xe',
      'bay',
      'goc nhin',
    ],
    content:
      'In the 3D Rover & Surface workspace (Lunar3DViewport.tsx), drive the 6-wheel rover using W/A/S/D or Arrow Keys, or press the on-screen Virtual Drive Pad. Hold Space to brake on the surface, hold Shift to boost, press L for PSR LED headlights, and Double-Click any terrain point to set an Autopilot waypoint (or click Deploy Rover / Deploy Here to teleport onto Scenario A). Press F (or click Fly/Land) to toggle VTOL Hopper Flight Mode, then press E / PageUp / Space to ascend and Q / C / PageDown to descend (or use Climb / Drop buttons). Switch speed gears across 1x, 10x, 50x, 250x, and 1000x. Switch 4 Camera Modes: Chase (follows behind rover), Mast POV (antenna-height horizon view), Orbit (rotates around Scenario A), and Free Cam (free exploration), plus Invert Y, Sky Guide (J2000 star/constellation overlays), and Fly to Site. Toggle 5 3D Surface Shader Layers: Regolith, Sun, Earth, Slope, and Composite.',
    actions: [CATALOG_ACTIONS.deploy_rover, CATALOG_ACTIONS.load_hd_dem],
  },
  {
    id: 'ui-workspaces',
    topic: '5 Synchronized Workspaces & 7 Interactive UI Sections',
    title: 'Workspaces, Relief Scale, 240 m HD DEM, Coordinate Probe & Timeline Dock',
    source: 'App.tsx · GettingStartedModal.tsx (ONBOARDING_SECTIONS)',
    citations: [
      'GettingStartedModal.tsx (7-Section Guided Tour)',
      'App.tsx (5 Synchronized Mission Workspaces)',
    ],
    keywords: [
      'workspace',
      'ui',
      'tutorial',
      'guide',
      'tour',
      'section',
      'split',
      'map2d',
      'compare',
      'directory',
      'relief',
      'exaggeration',
      '1x',
      '15x',
      'hd',
      'dem',
      'probe',
      'lat',
      'lon',
      'mast',
      'mask',
      'window',
      'timeline',
      'sky',
      'traverse',
      'export',
      'share',
      'huong dan',
      'giao dien',
      'su dung',
      'tinh nang',
      'ban do',
      'so sanh',
      'cham diem',
    ],
    content:
      'The application synchronizes one simulation state (target coordinate, UTC step, mast height, Earth elevation mask, and window duration) across 5 Workspaces: (1) 3D Rover & Surface (default WebGL terrain & rover), (2) Command Split (3D viewport + 2D stereographic +-150 km polar map + 360-deg horizon sky side by side), (3) 2D Map & Sky (click anywhere inside 75S-90S to probe custom coordinates + sky dome), (4) Compare A vs B (side-by-side target comparison with synchronized or independent UTC/mast controls), and (5) Candidate Directory (Mode A ranks 62,500 precomputed 1.2 km cells and 140 refined 5x5 240 m blocks; Mode B runs live Web Worker 240 m neighborhood scans). The UI is organized into 7 Explain Sections: (1) Header & Target (31 sites, Deploy Rover, JPL check, Share permalink, Export Markdown Brief), (2) 5 Workspaces, (3) Scale & Probe (Relief 1x Real true 1:1 physical geometry vs 3x-15x visual exaggeration while ray-marching always uses 1x; Load 240 m HD streams the ~4.3 MB Int16 DEM bundle for client ray-marching; Lat/Lon Coordinate Probe; Overlay B; Window 24h-36,216h), (4) 3D & Rover, (5) 4 KPI Gauges (instant Solar Array Lit% vs Horizontal%, active-window Earth DTE% & Mask 0/2/5 deg, 240 m Slope & Rover Tilt + Max Dark, Viability Index), (6) Science & Glossary, and (7) Timeline & Sky Dock (36,216-hour 2026-2030 scrubber, 0.5-50 m Mast slider, Eclipse jumps, Ghost Horizon comparison, and Traverse Elevation Profile).',
    actions: [CATALOG_ACTIONS.open_tour, CATALOG_ACTIONS.load_hd_dem, CATALOG_ACTIONS.open_compare],
  },
  {
    id: 'physics-eclipses',
    topic: 'Lunar Geometry, Optical Libration & 2026-2030 Solar Eclipses',
    title: '1.54 deg Axial Tilt, Optical Libration (~27.3 d) & 9 Cataloged Solar Eclipses',
    source: 'ephemeris.json · LearnModal.tsx · lunarMath.ts',
    citations: [
      'NASA JPL Horizons DE441 ephemeris.json (9 lunar-surface solar eclipses)',
      'LearnModal.tsx (Axial tilt 1.54 deg & libration cycle)',
      'lunarMath.ts (Two-circle geometric eclipse intersection)',
    ],
    keywords: [
      'eclipse',
      '2028',
      '2028-12-31',
      '2029',
      '2030',
      '2027',
      'total',
      'partial',
      'tilt',
      '1.54',
      '347',
      'libration',
      '27.3',
      'psr',
      'shadow',
      'dte',
      'earthrise',
      'earthset',
      'nhat thuc',
      'nguyet thuc',
      'toan phan',
      'ban phan',
      'nghieng truc',
      'binh dong',
      'vat ly',
      'toan',
    ],
    content:
      'Lunar South Pole geometry is governed by two orbital facts: (1) The Moon axial tilt relative to the ecliptic is only 1.54 deg (completing one seasonal cycle in ~347 days), so the Sun skims near the horizon year-round: elevated crater rims stay illuminated ~75-94% of the time while deep crater interiors stay at 0% direct sunlight as cryogenic Permanently Shadowed Regions (PSRs). (2) Although tidally locked, orbital eccentricity and inclination cause optical libration of roughly +-8.0 deg in longitude and +-6.9 deg in latitude over a ~27.3-day cycle, making Earth slowly rise and set behind polar mountains for ~10-14 days per month (far-side sites like Chang e-4 and Blue Ghost M2 have 0% DTE and require relay spacecraft). Across 2026-11-14 to 2030-12-31 UTC, ephemeris.json catalogs 9 Moon-center solar eclipses (when Earth ~1.8-2.0 deg disk occults the 0.53 deg Sun; modeled geometrically without Earth atmospheric refraction): 6 partial (2027-02-20T22:00Z 3h 34.4%, 2027-08-17T07:00Z 1h 0.4%, 2028-01-12T03:00Z 3h 50.0%, 2028-07-06T17:00Z 4h 87.6%, 2030-06-15T17:00Z 4h 93.5%, 2030-12-09T22:00Z 2h 26.9%) and 3 total at Moon center (2028-12-31T15:00:00Z 5h, 2029-06-26T02:00:00Z 4h, 2029-12-20T21:00:00Z 5h).',
    actions: [CATALOG_ACTIONS.jump_eclipse, CATALOG_ACTIONS.open_physics_tab],
  },
  {
    id: 'sites-catalog',
    topic: 'Curated Lunar Sites & South Pole Comparison',
    title: '31 Curated Lunar Targets (17 South Pole DEM + 14 Global Reference Targets)',
    source: 'sites.json · scoring.ts · App.tsx',
    citations: [
      'webapp/public/data/sites.json (31 curated coordinate targets)',
      'NASA Artemis III Candidate Regions & PGDA / NSSDCA Catalog',
    ],
    keywords: [
      'site',
      'sites',
      'catalog',
      'connecting ridge',
      'shackleton',
      'malapert',
      'mons mouton',
      'peak near shackleton',
      'nobile',
      'de gerlache',
      'haworth',
      'cabeus',
      'apollo',
      'chandrayaan',
      'slim',
      'change',
      'blue ghost',
      'im-1',
      'im-2',
      'psr',
      'top',
      'highest',
      'rank',
      'diem',
      'vi tri',
      'cao nhat',
      'sang nhat',
      'danh sach',
      'hien tai',
    ],
    content:
      'The curated catalog spans 31 targets: 17 South Pole sites inside LRO LOLA LDEM_75S_240M (including Connecting Ridge, Peak Near Shackleton, Malapert Massif, Mons Mouton, Mons Mouton Plateau, Shackleton Rim, Shackleton PSR, de Gerlache Rim 1 & 2, Nobile Rim 1 & 2, Haworth Rim, Cabeus B Peak, Slater Plain, IM-1 Odysseus, IM-2 Athena, and South Pole 90S) plus 14 global historic/CLPS/international reference targets outside 75S (Apollo 11/12/14/15/16/17, Chandrayaan-3, SLIM, Chang e-4, Blue Ghost M1/M2, etc.), which report n/a for 240 m terrain slope and Viability Index.',
    actions: [CATALOG_ACTIONS.open_directory, CATALOG_ACTIONS.open_compare, CATALOG_ACTIONS.deploy_rover],
  },
];

function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function tokenizeQuery(input: string): string[] {
  return normalizeSearchText(input)
    .split(/[^a-z0-9._-]+/)
    .filter((token) => token.length >= 2);
}

export function isVietnameseQuery(query: string): boolean {
  if (/[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i.test(query)) {
    return true;
  }
  const normalized = ` ${normalizeSearchText(query).replace(/[^a-z0-9]+/g, ' ')} `;
  const viSignals = [
    ' la gi ',
    ' nhu the nao ',
    ' huong dan ',
    ' cong thuc ',
    ' du lieu ',
    ' nhat thuc ',
    ' mat trang ',
    ' trai dat ',
    ' cuc nam ',
    ' dieu khien ',
    ' khac gi ',
    ' tai sao ',
    ' vi sao ',
    ' cao nhat ',
    ' so sanh ',
    ' diem nao ',
    ' tinh diem ',
    ' cho toi ',
    ' giai thich ',
    ' giup ',
    ' cach ',
    ' trong app ',
    ' xem ',
    ' chon ',
  ];
  return viSignals.some((sig) => normalized.includes(sig));
}

function getEffectiveSiteScore(site: SiteData): number | null {
  if (site.terrain_source !== 'LOLA_240M') return null;
  if (site.metrics_2m.viability_score !== null && Number.isFinite(site.metrics_2m.viability_score)) {
    return site.metrics_2m.viability_score;
  }
  return computeViability(site.metrics_2m, site.terrain_stats);
}

function buildLiveSitesCatalogChunk(liveContext: RagLiveContext): RagChunk {
  const polarScored = liveContext.sites
    .map((site) => ({ site, score: getEffectiveSiteScore(site) }))
    .filter((item): item is { site: SiteData; score: number } => item.score !== null)
    .sort((a, b) => b.score - a.score);

  const topSummary = polarScored
    .slice(0, 5)
    .map(
      ({ site: s, score }, idx) =>
        `${idx + 1}. ${s.short_name}: Score ${score.toFixed(1)}/100, Sun Disk ${s.metrics_2m.sun_visible_pct.toFixed(1)}% (${s.metrics_2m.sun_time_pct.toFixed(1)}% lit time), DTE ${s.metrics_2m.earth_visible_pct.toFixed(1)}%, Slope ${s.local_slope_deg !== null ? `${s.local_slope_deg.toFixed(2)} deg` : 'n/a'}, MaxDark ${s.metrics_2m.max_dark_days.toFixed(1)}d`,
    )
    .join(' | ');

  const sel = liveContext.selectedSite;
  const cmp = liveContext.compareSite;
  const effectiveLiveScore =
    liveContext.viabilityScore !== null ? liveContext.viabilityScore : getEffectiveSiteScore(sel);
  const scoreStr = effectiveLiveScore !== null ? `${effectiveLiveScore.toFixed(1)}/100` : 'n/a';
  const cmpScore = cmp ? getEffectiveSiteScore(cmp) : null;
  const compareLine = cmp
    ? ` Compare Site B (${cmp.short_name}): 4.1yr Sun Disk ${cmp.metrics_2m.sun_visible_pct.toFixed(1)}%, DTE ${cmp.metrics_2m.earth_visible_pct.toFixed(1)}%, Score ${cmpScore !== null ? `${cmpScore.toFixed(1)}/100` : 'n/a'}.`
    : '';

  const baseChunk = NASA_RAG_CORPUS.find((c) => c.id === 'sites-catalog')!;
  return {
    ...baseChunk,
    content: `${baseChunk.content} Live Active State: Scenario A is ${sel.name} (${sel.lat.toFixed(4)} deg, ${sel.lon.toFixed(3)} deg, terrain=${sel.terrain_source}) at ${liveContext.utcIso} in workspace "${liveContext.activeView}" (mast ${liveContext.mastHeightM.toFixed(1)} m, Earth mask ${liveContext.earthMaskDeg} deg, window ${liveContext.windowHours.toLocaleString('en-US')}h, 240 m HD DEM ${liveContext.hasClientDem ? 'loaded' : 'not yet loaded'}). Instant Sun El ${liveContext.sunElevDeg.toFixed(2)} deg (Tracking ${liveContext.trackingPct.toFixed(0)}%, Horizontal ${liveContext.horizontalPct.toFixed(1)}%), Earth El ${liveContext.earthElevDeg.toFixed(2)} deg (${liveContext.dteClear ? 'DTE Clear' : 'DTE Blocked'}), active-window Sun ${liveContext.windowSunPct.toFixed(1)}%, Earth DTE ${liveContext.windowEarthPct.toFixed(1)}%, Joint ${liveContext.windowJointPct.toFixed(1)}%, Max Dark ${(liveContext.maxDarkHours / 24).toFixed(1)}d (${Math.round(liveContext.maxDarkHours)}h), Viability ${scoreStr}.${compareLine}${topSummary ? ` Top 5 polar sites by 240 m Viability Index: ${topSummary}.` : ''}`,
  };
}

export function retrieveNasaRagChunks(
  query: string,
  liveContext: RagLiveContext,
  topK = 4,
): RagChunk[] {
  const limit = Math.max(1, Math.min(NASA_RAG_CORPUS.length, topK));
  const normQuery = normalizeSearchText(query);
  const tokens = tokenizeQuery(query);

  const enrichedCorpus = NASA_RAG_CORPUS.map((chunk) =>
    chunk.id === 'sites-catalog' ? buildLiveSitesCatalogChunk(liveContext) : chunk,
  );

  const scored = enrichedCorpus.map((chunk) => {
    const normTitle = normalizeSearchText(chunk.title);
    const normTopic = normalizeSearchText(chunk.topic);
    const normContent = normalizeSearchText(chunk.content);
    let score = 0;

    for (const kw of chunk.keywords) {
      const nkw = normalizeSearchText(kw);
      if (normQuery.includes(nkw)) {
        score += nkw.includes(' ') ? 8 : 5;
      }
    }

    for (const token of tokens) {
      if (normTitle.includes(token)) score += 3;
      if (normTopic.includes(token)) score += 2.5;
      if (normContent.includes(token)) score += 1;
    }

    // Small contextual tie-breaker toward active workspace or selected site
    if (
      normQuery.includes(normalizeSearchText(liveContext.selectedSite.short_name)) &&
      chunk.id === 'sites-catalog'
    ) {
      score += 6;
    }

    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  const hasAnySignal = scored.some((item) => item.score > 0);
  if (!hasAnySignal) {
    const defaultOrder = ['sites-catalog', 'ui-workspaces', 'data-provenance', 'viability-formula'];
    return defaultOrder
      .map((id) => enrichedCorpus.find((c) => c.id === id))
      .filter((c): c is RagChunk => Boolean(c))
      .slice(0, limit);
  }

  return scored.slice(0, limit).map((item) => item.chunk);
}

function collectCitationsAndActions(
  chunks: RagChunk[],
  query: string,
): { citations: string[]; actions: RagActionSuggestion[] } {
  const citationSet = new Set<string>();
  const actionMap = new Map<RagActionId, RagActionSuggestion>();
  const norm = normalizeSearchText(query);

  // Always include primary NASA JPL + LOLA grounding when citing app facts
  for (const chunk of chunks) {
    for (const cit of chunk.citations) {
      citationSet.add(cit);
    }
    for (const act of chunk.actions ?? []) {
      if (!actionMap.has(act.id)) {
        actionMap.set(act.id, act);
      }
    }
  }

  // Targeted action refinements from query cues
  if (norm.includes('eclipse') || norm.includes('nhat thuc') || norm.includes('2028')) {
    actionMap.set('jump_eclipse', CATALOG_ACTIONS.jump_eclipse);
  }
  if (norm.includes('rover') || norm.includes('wasd') || norm.includes('3d') || norm.includes('flight') || norm.includes('lai')) {
    actionMap.set('deploy_rover', CATALOG_ACTIONS.deploy_rover);
  }
  if (norm.includes('compare') || norm.includes('so sanh')) {
    actionMap.set('open_compare', CATALOG_ACTIONS.open_compare);
  }
  if (norm.includes('directory') || norm.includes('candidate') || norm.includes('rank') || norm.includes('cao nhat') || norm.includes('top')) {
    actionMap.set('open_directory', CATALOG_ACTIONS.open_directory);
  }
  if (norm.includes('hd') || norm.includes('240 m') || norm.includes('240m') || norm.includes('dem')) {
    actionMap.set('load_hd_dem', CATALOG_ACTIONS.load_hd_dem);
  }

  return {
    citations: Array.from(citationSet).slice(0, 6),
    actions: Array.from(actionMap.values()).slice(0, 4),
  };
}

function formatUtcCompact(utcIso: string): string {
  return utcIso.length >= 16 ? `${utcIso.slice(0, 16).replace('T', ' ')} UTC` : utcIso;
}

function buildDeterministicFallbackAnswer(
  query: string,
  liveContext: RagLiveContext,
  retrieved: RagChunk[],
  isVi: boolean,
): string {
  const notice = isVi ? VERIFOUR_FALLBACK_NOTICE_VI : VERIFOUR_FALLBACK_NOTICE_EN;
  const sel = liveContext.selectedSite;
  const cmp = liveContext.compareSite;
  const utcLabel = formatUtcCompact(liveContext.utcIso);
  const scoreStr =
    liveContext.viabilityScore !== null ? `${liveContext.viabilityScore.toFixed(1)} / 100` : 'n/a';

  const polarTop = liveContext.sites
    .map((site) => ({ site, score: getEffectiveSiteScore(site) }))
    .filter((item): item is { site: SiteData; score: number } => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  const topChunkIds = new Set(retrieved.slice(0, 3).map((c) => c.id));
  const sections: string[] = [];

  if (isVi) {
    sections.push(
      `**Trạng thái mô phỏng trực tiếp (${sel.short_name} · ${utcLabel}):** Mặt Trời **${liveContext.trackingPct.toFixed(0)}%** (góc ngẩng ${liveContext.sunElevDeg.toFixed(2)}°, tấm ngang ${liveContext.horizontalPct.toFixed(1)}%) · Earth DTE cửa sổ ${liveContext.windowHours.toLocaleString('en-US')}h **${liveContext.windowEarthPct.toFixed(0)}%** (${liveContext.dteClear ? 'Clear' : 'Blocked'}, Mask ${liveContext.earthMaskDeg}°) · Viability **${scoreStr}** · Mast ${liveContext.mastHeightM.toFixed(1)} m.`,
    );

    if (topChunkIds.has('data-provenance')) {
      sections.push(
        `**Nguồn dữ liệu NASA & đối chiếu công bố khoa học:**\n` +
          `- **Dữ liệu gốc nạp vào mô phỏng:** NASA JPL Horizons (**DE441 / MOON_ME**, ${liveContext.ephemeris.n.toLocaleString('en-US')} bước giờ 2026–2030, sai số hướng <= ${liveContext.ephemeris.validation.sun_max_err_deg.toFixed(4)}° Sun / <= ${liveContext.ephemeris.validation.earth_max_err_deg.toFixed(4)}° Earth), NASA LRO LOLA **LDEM_75S_240M** (240 m/px vùng 75°S–90°S), và ranh giới **Artemis III 2024** (` +
          '`A3_9regions`' +
          ` GeoJSON). Tài liệu tham khảo đối chiếu: NASA Moon Trek & CSA Moon Exploration.\n` +
          `- **Phân biệt tài liệu tham khảo:** Các mốc Apollo, CLPS, Chandrayaan-3, SLIM, Chang'e-4 chỉ nạp tọa độ đích và tính đồng nhất trên lưới NASA LOLA/Horizons. Với **Connecting Ridge (C1)**, app cho **94.3%** giờ có nắng (**90.1%** trung bình đĩa Mặt Trời) vì 3 lý do vật lý: (1) tính ở cột mast **2 m** thay vì mặt đất **0 m** như Mazarico et al. (2011: 89.0% mean / 92.7% vis), (2) lấy pixel đỉnh **240 m** (khớp sát NASA PDS **93.48%**), và (3) giai đoạn **2026–2030** (4.1 năm) trong chu kỳ tiến động nút **18.6 năm** (cùng đối chiếu Gläser et al. 2018 & Barker et al. 2021/2023).`,
      );
    }

    if (topChunkIds.has('viability-formula')) {
      sections.push(
        `**Công thức Composite Viability Index (scoring.ts) & phạm vi 240 m:**\n` +
          `- **Công thức chuẩn trong app:** ` +
          '`0.35 × Sun Disk % + 0.25 × Earth DTE % + 0.15 × Joint (Sun∩Earth) % + 0.15 × Dark Resilience + 0.10 × Slope ≤5° (30×30 km)`' +
          `, trong đó ` +
          '`Dark Resilience = max(0, 100 × (1 − min(max_dark_days, 30) / 30))`' +
          `. Các điểm ngoài vùng DEM 75°S–90°S trả về **n/a**.\n` +
          `- **Giới hạn khoa học:** Đây là chỉ số sàng lọc đa mục tiêu do nhóm định nghĩa, KHÔNG thay thế chứng nhận hạ cánh vì DEM **240 m/px** không nhìn thấy đá tảng hoặc hố va chạm cỡ mét (cần PGDA 5 m/px & LROC NAC 1 m/px).`,
      );
    }

    if (topChunkIds.has('rover-controls')) {
      sections.push(
        `**Điều khiển Rover 3D, Flight Mode & Camera:**\n` +
          `- **Lái xe:** Phím **W/A/S/D** hoặc **Mũi tên**, **Space** để phanh (khi chạy trên mặt đất), **Shift** tăng tốc, **L** bật/tắt đèn pha LED PSR, **Double-Click** mặt đất đặt điểm Autopilot, hoặc bấm **Deploy Rover** để đưa xe về vị trí đang chọn.\n` +
          `- **Flight Mode (VTOL Hopper):** Bấm **F** (hoặc nút **Fly/Land**) để bật bay; dùng **E / PageUp / Space** để bay lên và **Q / C / PageDown** để hạ độ cao. Chỉnh cấp tốc độ **1× – 1000×**.\n` +
          `- **4 Camera & 5 Lớp bản đồ 3D:** Chọn **Chase**, **Mast POV**, **Orbit**, **Free Cam**; đổi lớp phủ **Regolith / Sun / Earth / Slope / Composite**.`,
      );
    }

    if (topChunkIds.has('physics-eclipses')) {
      const totalCount = liveContext.ephemeris.eclipses.filter((e) =>
        e.type.toLowerCase().includes('total'),
      ).length;
      const partialCount = liveContext.ephemeris.eclipses.filter((e) =>
        e.type.toLowerCase().includes('partial'),
      ).length;
      sections.push(
        `**Vật lý Cực Nam, Bình động (Libration) & ${liveContext.ephemeris.eclipses.length} lần Nhật thực (2026–2030):**\n` +
          `- Mặt Trăng chỉ nghiêng trục **1.54°** (chu kỳ ~347 ngày), nên rìa núi cao nhận nắng ~75–94% còn đáy hố PSR nhận 0% nắng trực tiếp. Bình động quang học (**±8.0° kinh độ, ±6.9° vĩ độ**, chu kỳ ~27.3 ngày) khiến Trái Đất mọc/lặn sau rìa núi 10–14 ngày/tháng.\n` +
          `- Trong dữ liệu 2026–2030 có **${partialCount} nhật thực bán phần** và **${totalCount} nhật thực toàn phần tại tâm Mặt Trăng**: **2028-12-31T15:00:00Z** (5h), **2029-06-26T02:00:00Z** (4h) và **2029-12-20T21:00:00Z** (5h).`,
      );
    }

    if (topChunkIds.has('ui-workspaces')) {
      sections.push(
        `**Hướng dẫn 5 Workspace & 7 Khu vực giao diện:**\n` +
          `- **5 Workspace đồng bộ:** *3D Rover & Surface*, *Command Split* (3D + Bản đồ 2D + Bầu trời 360°), *2D Map & Sky* (bấm lên bản đồ ±150 km để chấm điểm tùy ý), *Compare A vs B*, và *Candidate Directory* (quét 62,500 ô Mode A hoặc quét Worker 240 m Mode B).\n` +
          `- **Công cụ chính:** Relief **1× Real** (tỷ lệ thực 1:1) vs **3×–15×** (phóng đại quan sát), nút **Load 240 m HD**, thanh trượt **Mast Height (0.5–50 m)**, bộ lọc **Earth Mask (0°/2°/5°)**, Timeline **36,216 giờ**, và nút **Explain** ở từng mục.`,
      );
    }

    if (topChunkIds.has('sites-catalog') || polarTop.length > 0) {
      const rankList = polarTop
        .map(
          ({ site: s, score }, i) =>
            `${i + 1}. **${s.short_name}**: Score **${score.toFixed(1)}** (Sun Disk ${s.metrics_2m.sun_visible_pct.toFixed(1)}%, DTE ${s.metrics_2m.earth_visible_pct.toFixed(1)}%, MaxDark ${s.metrics_2m.max_dark_days.toFixed(1)}d)`,
        )
        .join('\n');
      const selScore = getEffectiveSiteScore(sel);
      const cmpScore = cmp ? getEffectiveSiteScore(cmp) : null;
      const cmpNote = cmp
        ? `\n- **So sánh nhanh Scenario A (${sel.short_name}) vs B (${cmp.short_name}):** Sun Disk ${sel.metrics_2m.sun_visible_pct.toFixed(1)}% vs ${cmp.metrics_2m.sun_visible_pct.toFixed(1)}% · DTE ${sel.metrics_2m.earth_visible_pct.toFixed(1)}% vs ${cmp.metrics_2m.earth_visible_pct.toFixed(1)}% · Viability ${selScore !== null ? selScore.toFixed(1) : 'n/a'} vs ${cmpScore !== null ? cmpScore.toFixed(1) : 'n/a'}.`
        : '';
      sections.push(
        `**Top vị trí cực Nam theo chỉ số Viability 240 m (tham khảo sàng lọc):**\n${rankList}${cmpNote}`,
      );
    }
  } else {
    sections.push(
      `**Live Simulation Context (${sel.short_name} · ${utcLabel}):** Solar tracking **${liveContext.trackingPct.toFixed(0)}%** (Sun El ${liveContext.sunElevDeg.toFixed(2)}°, Horizontal panel ${liveContext.horizontalPct.toFixed(1)}%) · Active-window Earth DTE (${liveContext.windowHours.toLocaleString('en-US')}h) **${liveContext.windowEarthPct.toFixed(0)}%** (${liveContext.dteClear ? 'Clear' : 'Blocked'}, Mask ${liveContext.earthMaskDeg}°) · Viability **${scoreStr}** · Mast ${liveContext.mastHeightM.toFixed(1)} m.`,
    );

    for (const chunk of retrieved.slice(0, 3)) {
      sections.push(`**${chunk.title}:** ${chunk.content}`);
    }

    if (cmp && normalizeSearchText(query).includes('compare')) {
      const selScore = getEffectiveSiteScore(sel);
      const cmpScore = getEffectiveSiteScore(cmp);
      sections.push(
        `**Scenario A vs B Snapshot:** ${sel.short_name} (Sun Disk ${sel.metrics_2m.sun_visible_pct.toFixed(1)}%, DTE ${sel.metrics_2m.earth_visible_pct.toFixed(1)}%, Score ${selScore !== null ? selScore.toFixed(1) : 'n/a'}) vs. ${cmp.short_name} (Sun Disk ${cmp.metrics_2m.sun_visible_pct.toFixed(1)}%, DTE ${cmp.metrics_2m.earth_visible_pct.toFixed(1)}%, Score ${cmpScore !== null ? cmpScore.toFixed(1) : 'n/a'}).`,
      );
    }
  }

  return `${notice}\n\n${sections.join('\n\n')}`;
}

function buildSystemPrompt(
  liveContext: RagLiveContext,
  retrieved: RagChunk[],
  isVi: boolean,
): string {
  const sel = liveContext.selectedSite;
  const cmp = liveContext.compareSite;
  const chunkBlock = retrieved
    .map((c, idx) => `[Chunk ${idx + 1}: ${c.id} | ${c.source}]\n${c.content}`)
    .join('\n\n');

  const topSitesBlock = liveContext.sites
    .map((site) => ({ site, score: getEffectiveSiteScore(site) }))
    .filter((item): item is { site: SiteData; score: number } => item.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map(
      ({ site: s, score }) =>
        `${s.short_name}: score=${score.toFixed(1)}, sunDisk=${s.metrics_2m.sun_visible_pct}%, sunTime=${s.metrics_2m.sun_time_pct}%, dte=${s.metrics_2m.earth_visible_pct}%, slope=${s.local_slope_deg}deg, maxDark=${s.metrics_2m.max_dark_days}d`,
    )
    .join('; ');
  const cmpScore = cmp ? getEffectiveSiteScore(cmp) : null;

  return [
    'You are the VeriFour NASA RAG Assistant inside the Lunar Landing Site Navigator (NASA Space Apps Challenge 2026).',
    isVi
      ? 'Respond clearly in Vietnamese (keeping standard NASA/technical terms like JPL DE441, LOLA LDEM_75S_240M, DTE, PSR, Viability Index accurate).'
      : 'Respond clearly and concisely in English.',
    'Rules:',
    '1. Ground every number, dataset, equation, and UI instruction strictly in the Retrieved Knowledge Chunks and Live Telemetry below. Do not invent citations or telemetry.',
    '2. Distinguish ingested NASA datasets (JPL Horizons DE441/MOON_ME, LRO LOLA LDEM_75S_240M, Artemis III 2024 A3_9regions GeoJSON) from consulted resources (NASA Moon Trek, CSA) and peer-reviewed literature (Mazarico et al. 2011, Gläser et al. 2018, Barker et al. 2021/2023, NASA PDS AVGVISIB).',
    '3. Never overclaim: state clearly that 240 m/px LOLA screens macro horizon/slopes and does NOT certify meter-scale touchdown safety; never call any site a guaranteed or certified landing target.',
    '',
    'Live Telemetry:',
    `- Selected Site A: ${sel.name} (${sel.lat.toFixed(4)} deg, ${sel.lon.toFixed(3)} deg, terrain=${sel.terrain_source})`,
    `- Compare Site B: ${cmp ? `${cmp.name} (Score ${cmpScore !== null ? cmpScore.toFixed(1) : 'n/a'})` : 'None'}`,
    `- UTC: ${liveContext.utcIso} | Workspace: ${liveContext.activeView} | 240m HD DEM loaded: ${liveContext.hasClientDem}`,
    `- Mast: ${liveContext.mastHeightM.toFixed(1)} m | Earth Mask: ${liveContext.earthMaskDeg} deg | Window: ${liveContext.windowHours}h`,
    `- Instant: Sun El ${liveContext.sunElevDeg.toFixed(2)} deg, Tracking ${liveContext.trackingPct.toFixed(1)}%, Horizontal ${liveContext.horizontalPct.toFixed(1)}%, Earth El ${liveContext.earthElevDeg.toFixed(2)} deg (${liveContext.dteClear ? 'DTE Clear' : 'DTE Blocked'})`,
    `- Active Window: Sun ${liveContext.windowSunPct.toFixed(1)}%, Earth DTE ${liveContext.windowEarthPct.toFixed(1)}%, Joint ${liveContext.windowJointPct.toFixed(1)}%, Max Dark ${(liveContext.maxDarkHours / 24).toFixed(1)}d, Viability ${liveContext.viabilityScore !== null ? liveContext.viabilityScore.toFixed(1) : 'n/a'}`,
    `- Top Polar Sites: ${topSitesBlock || 'n/a'}`,
    '',
    'Retrieved Knowledge Chunks:',
    chunkBlock,
  ].join('\n');
}

function resolveClientApiKey(apiKeyOverride?: string): string {
  const override = apiKeyOverride?.trim() ?? '';
  if (override) return override;

  if (typeof window !== 'undefined') {
    try {
      const stored = window.localStorage.getItem(VERIFOUR_OPENAI_KEY_STORAGE)?.trim() ?? '';
      if (stored) return stored;
    } catch {
      // Ignore disabled storage errors
    }
  }

  const definedEnvKey =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_OPENAI_API_KEY
      : undefined;
  return typeof definedEnvKey === 'string' ? definedEnvKey.trim() : '';
}

function resolveModelName(): string {
  const definedModel =
    typeof import.meta !== 'undefined' && import.meta.env
      ? import.meta.env.VITE_OPENAI_MODEL
      : undefined;
  return typeof definedModel === 'string' && definedModel.trim().length > 0
    ? definedModel.trim()
    : 'gpt-4o-mini';
}

export async function askNasaRagAssistant({
  query,
  liveContext,
  history = [],
  apiKeyOverride,
}: AskNasaRagOptions): Promise<RagResponse> {
  const cleanQuery = query.trim();
  const isVi = isVietnameseQuery(cleanQuery);
  const retrieved = retrieveNasaRagChunks(cleanQuery, liveContext, 4);
  const { citations, actions } = collectCitationsAndActions(retrieved, cleanQuery);

  const fallbackWith = (reason: string): RagResponse => ({
    answer: buildDeterministicFallbackAnswer(cleanQuery, liveContext, retrieved, isVi),
    citations,
    actions,
    usedFallback: true,
    fallbackReason: reason,
  });

  if (!cleanQuery) {
    return fallbackWith('Empty query');
  }

  const apiKey = resolveClientApiKey(apiKeyOverride);
  const model = resolveModelName();
  const systemPrompt = buildSystemPrompt(liveContext, retrieved, isVi);
  const trimmedHistory = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
    .slice(-6)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: 'system' as const, content: systemPrompt },
    ...trimmedHistory,
    { role: 'user' as const, content: cleanQuery },
  ];

  // Direct OpenAI API path when a key is present
  if (apiKey) {
    if (typeof fetch !== 'function') {
      return fallbackWith('Fetch API unavailable in this environment');
    }
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId =
      controller && typeof setTimeout === 'function'
        ? setTimeout(() => controller.abort(), 25000)
        : null;
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 750,
          messages,
        }),
        signal: controller?.signal,
      });

      if (!response.ok) {
        return fallbackWith(`OpenAI API error (HTTP ${response.status})`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = payload.choices?.[0]?.message?.content?.trim();
      if (!content) {
        return fallbackWith('OpenAI API returned an empty completion');
      }

      return {
        answer: content,
        citations,
        actions,
        usedFallback: false,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return fallbackWith(`OpenAI request failed (${msg})`);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }

  // Non-browser / SSR / Vitest environments without a key immediately use deterministic RAG fallback
  if (typeof window === 'undefined' || typeof fetch !== 'function') {
    return fallbackWith('No OpenAI API key configured in .env or browser storage');
  }

  // Optional same-origin proxy path in browser deployments if configured
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timeoutId =
    controller && typeof setTimeout === 'function'
      ? setTimeout(() => controller.abort(), 25000)
      : null;

  try {
    const proxyRes = await fetch('/api/openai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: 750, messages }),
      signal: controller?.signal,
    });

    const contentType = proxyRes.headers.get('content-type') ?? '';
    if (!proxyRes.ok || !contentType.toLowerCase().includes('application/json')) {
      return fallbackWith(`No active OpenAI key or proxy (HTTP ${proxyRes.status})`);
    }

    const payload = (await proxyRes.json()) as {
      answer?: string;
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = (payload.answer ?? payload.choices?.[0]?.message?.content ?? '').trim();
    if (!content) {
      return fallbackWith('Proxy returned empty completion');
    }

    return {
      answer: content,
      citations,
      actions,
      usedFallback: false,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return fallbackWith(`No OpenAI key configured (${msg})`);
  } finally {
    if (timeoutId !== null) clearTimeout(timeoutId);
  }
}

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  boxesOverlap,
  buildBackgroundRaster,
  buildGlobalSiteLabelCandidates,
  buildPolarEdgeLabelCandidates,
  buildPolarPointLabelCandidates,
  compute3dQuadHillshade,
  compute3dRayEndpointDelta,
  computeHillshade,
  computeOffFrameEdgeIndicator,
  computePillBox,
  decodePolarMaps,
  getArtemisPolarRingsKm,
  getGlobalMapRect,
  globalPxToLatLon,
  isRegionInPolarFrame,
  latLonToGlobalPx,
  pickNonOverlappingLabelPlacement,
  POLAR_CARDINAL_LABELS,
  polarLl2XyKm,
  samplePolarHoverReadout,
  sunLightVectorCanvas,
  validateProbeInputs,
  valueToEarthRgb,
  valueToSolarRgb,
  NO_DATA_RGB,
  type GlobalLabelBox,
} from '../src/components/map/polarMapMath';
import type {
  ArtemisRegion,
  DecodedDemPatch,
  PolarMapsData,
  SiteData,
} from '../src/types/lunar';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(__dirname, '../src');
const DATA_DIR = path.resolve(__dirname, '../public/data');

function makeSyntheticDemPatch(
  gridSize: number,
  mpp: number,
  elevFn: (r: number, c: number) => number,
): DecodedDemPatch {
  const elev = new Int16Array(gridSize * gridSize);
  const slopeU8 = new Uint8Array(gridSize * gridSize);
  let elevMinM = Infinity;
  let elevMaxM = -Infinity;

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      const z = Math.round(elevFn(r, c));
      elev[r * gridSize + c] = z;
      if (z < elevMinM) elevMinM = z;
      if (z > elevMaxM) elevMaxM = z;
      slopeU8[r * gridSize + c] = 20; // 4.0 deg at 0.2 scale
    }
  }

  return {
    gridSize,
    mpp,
    extentKm: (gridSize * mpp) / 2000,
    elevMinM,
    elevMaxM: Math.max(elevMinM + 1, elevMaxM),
    slopeScaleDeg: 0.2,
    elev,
    slopeU8,
  };
}

function makeDummySite(overrides: Partial<SiteData>): SiteData {
  return {
    id: 'test_site',
    name: 'Test Site',
    short_name: 'Test',
    category: 'South Pole',
    program: 'Test',
    description: 'Synthetic test site.',
    terrain_source: 'LOLA_240M',
    is_polar_dem: true,
    elev_source: 'DEM',
    lat: -89.0,
    lon: 0.0,
    polar_x_km: 0.0,
    polar_y_km: 30.0,
    elev_m: 1200,
    local_slope_deg: 2.0,
    terrain_stats: null,
    metrics_2m: {
      sun_no_terrain_pct: 50,
      sun_time_pct: 70,
      sun_visible_pct: 68,
      earth_visible_pct: 60,
      both_visible_pct: 50,
      longest_sun_days: 14,
      max_dark_days: 6,
      earth_max_gap_days: 7,
      viability_score: null,
      archetype: null,
    },
    drift_240m: null,
    horizons_by_mast: { '2': new Array(360).fill(0) },
    blocking_dist_km: null,
    ...overrides,
  };
}

function pixelLuminance(rgba: Uint8ClampedArray, gridSize: number, r: number, c: number): number {
  const p = (r * gridSize + c) * 4;
  return rgba[p] + rgba[p + 1] + rgba[p + 2];
}

function bytesToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

describe('WP3 Map Math — Unified 2D & 3D Hillshade (MAP-1)', () => {
  it('computes exact canvas-frame incoming sun vectors for cardinal longitudes', () => {
    const [lx0, ly0] = sunLightVectorCanvas(0);
    expect(lx0).toBeCloseTo(0, 6);
    expect(ly0).toBeCloseTo(-1, 6); // 0° Earthside is UP on canvas (-y)

    const [lx90, ly90] = sunLightVectorCanvas(90);
    expect(lx90).toBeCloseTo(1, 6); // 90°E is RIGHT on canvas (+x)
    expect(ly90).toBeCloseTo(0, 6);

    const [lx180, ly180] = sunLightVectorCanvas(180);
    expect(lx180).toBeCloseTo(0, 6);
    expect(ly180).toBeCloseTo(1, 6); // 180° Farside is DOWN on canvas (+y)

    const [lxW, lyW] = sunLightVectorCanvas(-90);
    expect(lxW).toBeCloseTo(-1, 6); // 90°W is LEFT on canvas (-x)
    expect(lyW).toBeCloseTo(0, 6);
  });

  it('makes sun-facing slopes brighter than flat terrain in both 2D raster and 3D quads across orthogonal sun directions', () => {
    // 15x15 synthetic DEM with flat plateau (0..4) and sloped flanks, OR separate tilted planes
    const flatDem = makeSyntheticDemPatch(11, 1000, () => 1000);
    const eastFacingDem = makeSyntheticDemPatch(11, 1000, (_r, c) => 1000 - c * 200); // slopes down toward +x (faces East 90°E)
    const westFacingDem = makeSyntheticDemPatch(11, 1000, (_r, c) => 1000 + c * 200); // slopes up toward +x (faces West 90°W)
    const earthsideFacingDem = makeSyntheticDemPatch(11, 1000, (r, _c) => 1000 + r * 200); // slopes down toward r=0 (faces 0° Earthside)
    const farsideFacingDem = makeSyntheticDemPatch(11, 1000, (r, _c) => 1000 - r * 200); // slopes down toward r=max (faces 180° Farside)

    // Direction 1: Sun at 90°E
    const flat2dE = buildBackgroundRaster(flatDem, 'hillshade', 90, 0);
    const east2dE = buildBackgroundRaster(eastFacingDem, 'hillshade', 90, 0);
    const west2dE = buildBackgroundRaster(westFacingDem, 'hillshade', 90, 0);
    // Note: compare at equal elevation cell (center r=5, c=5 where we pick matching center elevation)
    const flatDemAtZero = makeSyntheticDemPatch(11, 1000, () => 0);
    const eastDemCenterZero = makeSyntheticDemPatch(11, 1000, (_r, c) => (5 - c) * 200);
    const westDemCenterZero = makeSyntheticDemPatch(11, 1000, (_r, c) => (c - 5) * 200);

    // Verify 2D raster shading multiplier via hillshade on equal-min/max normalization
    const flatR = buildBackgroundRaster(flatDemAtZero, 'hillshade', 90, 0);
    const eastR = buildBackgroundRaster(eastDemCenterZero, 'hillshade', 90, 0);
    const westR = buildBackgroundRaster(westDemCenterZero, 'hillshade', 90, 0);
    // Notice min/max differ for flat vs tilted, so verify pure computeHillshade AND 3D quad hillshade + raster gradient directly:
    const [lxE, lyE] = sunLightVectorCanvas(90);
    expect(computeHillshade(-0.2, 0, lxE, lyE)).toBeGreaterThan(computeHillshade(0, 0, lxE, lyE));
    expect(computeHillshade(+0.2, 0, lxE, lyE)).toBeLessThan(computeHillshade(0, 0, lxE, lyE));

    // Also test within ONE single ridge DEM patch (has flat center, east-facing right flank, west-facing left flank at SAME elevation!)
    // Ridge along col=5: c<5 slopes up toward ridge (faces West), c>5 slopes down away from ridge (faces East)
    const nsRidgeDem = makeSyntheticDemPatch(15, 1000, (_r, c) => 2000 - Math.abs(c - 7) * 200);
    const ridgeSunEast = buildBackgroundRaster(nsRidgeDem, 'hillshade', 90, 0);
    // At c=9 (East flank, dist=2 -> elev 1600m) vs c=5 (West flank, dist=2 -> elev 1600m): SAME elevation!
    const lumEastFlank_SunEast = pixelLuminance(ridgeSunEast.rgba, 15, 7, 9);
    const lumWestFlank_SunEast = pixelLuminance(ridgeSunEast.rgba, 15, 7, 5);
    const lumFlatPeak_SunEast = pixelLuminance(
      buildBackgroundRaster(makeSyntheticDemPatch(15, 1000, () => 1600), 'hillshade', 90, 0).rgba,
      15,
      7,
      7,
    );
    expect(lumEastFlank_SunEast).toBeGreaterThan(lumWestFlank_SunEast);
    expect(lumEastFlank_SunEast).toBeGreaterThan(lumFlatPeak_SunEast);

    // 3D quad hillshade for East vs West vs Flat at Sun=90°E
    const quadFlatE = compute3dQuadHillshade(1000, 1000, 1000, 1000, 4000, 90);
    const quadEastE = compute3dQuadHillshade(1800, 1000, 1000, 1800, 4000, 90); // slopes down to +x
    const quadWestE = compute3dQuadHillshade(1000, 1800, 1800, 1000, 4000, 90); // slopes up to +x
    expect(quadEastE).toBeGreaterThan(quadFlatE);
    expect(quadWestE).toBeLessThan(quadFlatE);

    // Orthogonal Direction 2: Sun at 0° (Earthside / UP on canvas)
    // E-W ridge along row=7: r<7 slopes down toward r=0 (faces 0° Earthside), r>7 slopes down toward r=14 (faces 180° Farside)
    const ewRidgeDem = makeSyntheticDemPatch(15, 1000, (r, _c) => 2000 - Math.abs(r - 7) * 200);
    const ridgeSunNorth = buildBackgroundRaster(ewRidgeDem, 'hillshade', 0, 0);
    // Compare r=5 (Earthside flank, dist=2 -> 1600m) vs r=9 (Farside flank, dist=2 -> 1600m)
    const lumNorthFlank_SunNorth = pixelLuminance(ridgeSunNorth.rgba, 15, 5, 7);
    const lumSouthFlank_SunNorth = pixelLuminance(ridgeSunNorth.rgba, 15, 9, 7);
    expect(lumNorthFlank_SunNorth).toBeGreaterThan(lumSouthFlank_SunNorth);
    expect(lumNorthFlank_SunNorth).toBeGreaterThan(lumFlatPeak_SunEast);

    // 3D quad hillshade for Earthside vs Farside vs Flat at Sun=0°
    const quadFlatN = compute3dQuadHillshade(1000, 1000, 1000, 1000, 4000, 0);
    const quadEarthsideN = compute3dQuadHillshade(1000, 1000, 1800, 1800, 4000, 0); // r=0 lower than r=step -> faces 0° Earthside
    const quadFarsideN = compute3dQuadHillshade(1800, 1800, 1000, 1000, 4000, 0); // r=step lower than r=0 -> faces 180° Farside
    expect(quadEarthsideN).toBeGreaterThan(quadFlatN);
    expect(quadFarsideN).toBeLessThan(quadFlatN);

    // Keep unused references cleanly asserted
    expect(flat2dE.width).toBe(11);
    expect(east2dE.width).toBe(11);
    expect(west2dE.width).toBe(11);
    expect(flatR.width).toBe(11);
    expect(eastR.width).toBe(11);
    expect(westR.width).toBe(11);
    expect(eastFacingDem.gridSize).toBe(11);
    expect(westFacingDem.gridSize).toBe(11);
    expect(earthsideFacingDem.gridSize).toBe(11);
    expect(farsideFacingDem.gridSize).toBe(11);
  });

  it('produces identical background rasters independent of selectedSite (no site parameter)', () => {
    const dem = makeSyntheticDemPatch(15, 1200, (r, c) => 1500 + Math.sin(r * 0.4) * 300 + Math.cos(c * 0.3) * 250);
    // Function signature takes only (demPatch, layer, subsolarLon, subearthLon, polarMaps?)
    expect(buildBackgroundRaster.length).toBeLessThanOrEqual(5);

    const runA = buildBackgroundRaster(dem, 'hillshade', 7.4, -4.2);
    const runB = buildBackgroundRaster(dem, 'hillshade', 7.4, -4.2);
    expect(Buffer.from(runA.rgba).equals(Buffer.from(runB.rgba))).toBe(true);

    // Illustrative earth_heatmap has NO hardcoded northBonus asymmetry on a flat DEM
    const flatDem = makeSyntheticDemPatch(15, 1200, () => 500);
    const earthFallback = buildBackgroundRaster(flatDem, 'earth_heatmap', 0, 90, null);
    const northRowLum = pixelLuminance(earthFallback.rgba, 15, 2, 7);
    const southRowLum = pixelLuminance(earthFallback.rgba, 15, 12, 7);
    expect(northRowLum).toBe(southRowLum);
  });
});

describe('WP3 Computed Polar Maps & Hover Sampling (MAP-2)', () => {
  it('renders 0-100% computed sun/earth overlays and 255 no-data cells accurately', () => {
    const dem = makeSyntheticDemPatch(4, 1200, () => 1000);
    const sunArr = new Uint8Array(16).fill(50);
    sunArr[0] = 0;
    sunArr[1] = 100;
    sunArr[2] = 255; // no data

    const earthArr = new Uint8Array(16).fill(75);
    earthArr[0] = 0;
    earthArr[3] = 255;

    const rawMaps: PolarMapsData = {
      schema_version: '2.0',
      data_version: 'test',
      generated_utc: '2026-11-14T00:00:00Z',
      grid_size: 4,
      mpp_m: 1200,
      x0_m: -1800,
      y0_m: 1800,
      mast_m: 2,
      period_utc: { start: '2026-11-14T00:00:00Z', end: '2029-01-15T00:00:00Z', n_steps: 19033 },
      method: 'highest_240m_pixel',
      sun_time_pct_u8_b64: bytesToBase64(sunArr),
      earth_visible_pct_u8_b64: bytesToBase64(earthArr),
      sample_pixel_u8_b64: bytesToBase64(new Uint8Array(16).fill(12)),
    };

    const sunRaster = buildBackgroundRaster(dem, 'solar_heatmap', 0, 0, rawMaps);
    expect(Array.from(sunRaster.rgba.slice(0, 3))).toEqual(valueToSolarRgb(0));
    expect(Array.from(sunRaster.rgba.slice(4, 7))).toEqual(valueToSolarRgb(1));
    expect(Array.from(sunRaster.rgba.slice(8, 11))).toEqual(Array.from(NO_DATA_RGB));

    const earthRaster = buildBackgroundRaster(dem, 'earth_heatmap', 0, 0, rawMaps);
    expect(Array.from(earthRaster.rgba.slice(0, 3))).toEqual(valueToEarthRgb(0));
    expect(Array.from(earthRaster.rgba.slice(12, 15))).toEqual(Array.from(NO_DATA_RGB));

    const decoded = decodePolarMaps(rawMaps);
    const hitValid = samplePolarHoverReadout(dem, -1.8, 1.8, 'solar_heatmap', decoded);
    expect(hitValid.valuePct).toBe(0);
    expect(hitValid.isNoData).toBe(false);

    const hitNoData = samplePolarHoverReadout(dem, 0.6, 1.8, 'solar_heatmap', decoded);
    expect(hitNoData.valuePct).toBeNull();
    expect(hitNoData.isNoData).toBe(true);
  });
});

describe('WP3 Out-of-Frame Indicators, Artemis Polygons, 3D Rays & Global Probe (MAP-3..MAP-6, UX-4)', () => {
  it('computes directional edge indicators for out-of-frame polar sites and null for in-frame sites', () => {
    const im1 = makeDummySite({
      id: 'im_1_odysseus',
      short_name: 'IM-1',
      lat: -80.13,
      lon: 1.44,
      polar_x_km: 7.6,
      polar_y_km: 299.9,
    });
    const indIm1 = computeOffFrameEdgeIndicator(im1, 150);
    expect(indIm1).not.toBeNull();
    expect(indIm1!.edgeYKm).toBeCloseTo(150, 3);
    expect(indIm1!.edgeXKm).toBeCloseTo(7.6 * (150 / 299.9), 2);
    expect(indIm1!.distanceBeyondEdgeKm).toBeGreaterThan(149);

    const cabeusB = makeDummySite({
      id: 'cabeus_b_peak',
      short_name: 'Cabeus B',
      lat: -83.55,
      lon: -68.42,
      polar_x_km: -180.6,
      polar_y_km: 70.7,
    });
    const indCb = computeOffFrameEdgeIndicator(cabeusB, 150);
    expect(indCb).not.toBeNull();
    expect(indCb!.edgeXKm).toBeCloseTo(-150, 3);
    expect(indCb!.distanceBeyondEdgeKm).toBeCloseTo(32.9, 1);

    const monsMoutonPlateau = makeDummySite({
      id: 'mons_mouton_plateau',
      short_name: 'Mons Mouton Plateau',
      lat: -84.29,
      lon: 27.425,
      polar_x_km: 80.1,
      polar_y_km: 154.3,
    });
    expect(computeOffFrameEdgeIndicator(monsMoutonPlateau, 150)).not.toBeNull();

    const nobileRim2 = makeDummySite({
      id: 'nobile_rim_2',
      short_name: 'Nobile Rim 2',
      lat: -83.976,
      lon: 57.961,
      polar_x_km: 155.4,
      polar_y_km: 97.3,
    });
    expect(computeOffFrameEdgeIndicator(nobileRim2, 150)).not.toBeNull();

    const connectingRidge = makeDummySite({
      id: 'connecting_ridge',
      short_name: 'Connecting Ridge',
      lat: -89.45,
      lon: -137.31,
      polar_x_km: -11.3,
      polar_y_km: -12.3,
    });
    expect(computeOffFrameEdgeIndicator(connectingRidge, 150)).toBeNull();
  });

  it('detects Artemis III polygon visibility and converts lon/lat polygons cleanly', () => {
    const inFramePoly: ArtemisRegion = {
      region: 'Malapert Massif',
      code: 'MA',
      centroid_lat: -85.925,
      centroid_lon: -1.205,
      area_km2: 441,
      polar_x_km: -2.6,
      polar_y_km: 123.6,
      rings_polar_km: [
        [
          [-12, 115],
          [8, 115],
          [8, 132],
          [-12, 132],
          [-12, 115],
        ],
      ],
    };
    expect(isRegionInPolarFrame(inFramePoly, 150)).toBe(true);
    expect(getArtemisPolarRingsKm(inFramePoly)).toEqual(inFramePoly.rings_polar_km);

    const outFramePoly: ArtemisRegion = {
      region: 'Peak Near Cabeus B',
      code: 'CB',
      centroid_lat: -83.552,
      centroid_lon: -68.416,
      area_km2: 399.8,
      polar_x_km: -182.2,
      polar_y_km: 72.1,
      rings_polar_km: [
        [
          [-192, 62],
          [-172, 62],
          [-172, 82],
          [-192, 82],
          [-192, 62],
        ],
      ],
    };
    expect(isRegionInPolarFrame(outFramePoly, 150)).toBe(false);

    const lonLatPoly: ArtemisRegion = {
      region: 'Test LonLat',
      code: 'TL',
      centroid_lat: -88,
      centroid_lon: 0,
      area_km2: 200,
      polar_x_km: 0,
      polar_y_km: 60.7,
      polygon_lonlat: [
        [
          [0, -88],
          [90, -88],
          [180, -88],
          [0, -88],
        ],
      ],
    };
    expect(isRegionInPolarFrame(lonLatPoly, 150)).toBe(true);
    const converted = getArtemisPolarRingsKm(lonLatPoly);
    expect(converted.length).toBe(1);
    const [expectedX, expectedY] = polarLl2XyKm(-88, 90);
    expect(converted[0][1][0]).toBeCloseTo(expectedX, 5);
    expect(converted[0][1][1]).toBeCloseTo(expectedY, 5);
  });

  it('scales 3D Sun/Earth rays accurately with true elevation angle and vertExag', () => {
    const elDeg = 3.5;
    const vertExag = 10;
    const delta = compute3dRayEndpointDelta(-137.3, 144.7, elDeg, vertExag, 90);
    const horizKm = Math.hypot(delta.dxKm, delta.dyKm);
    const exagSlope = ((delta.dzM / 1000) * vertExag) / horizKm;
    expect(exagSlope).toBeCloseTo(vertExag * Math.tan((elDeg * Math.PI) / 180), 4);
    expect(delta.dzM).toBeGreaterThan(0);

    const negDelta = compute3dRayEndpointDelta(0, 10, -2.5, vertExag, 90);
    expect(negDelta.dzM).toBeLessThan(0);
  });

  it('maps global equirectangular canvas clicks back to lat/lon and rejects margin clicks', () => {
    const rect = getGlobalMapRect(600);
    const [px, py] = latLonToGlobalPx(-45.4446, 177.5991, rect);
    const rt = globalPxToLatLon(px, py, rect);
    expect(rt).not.toBeNull();
    expect(rt!.lat).toBeCloseTo(-45.4446, 2);
    expect(rt!.lon).toBeCloseTo(177.5991, 2);

    expect(globalPxToLatLon(2, 2, rect)).toBeNull();
  });

  it('validates Probe Lat/Lon inputs strictly without silent clamping (UX-4)', () => {
    expect(validateProbeInputs('95', '0').valid).toBe(false);
    expect(validateProbeInputs('-90.5', '0').valid).toBe(false);
    expect(validateProbeInputs('0', '181').valid).toBe(false);
    expect(validateProbeInputs('0', '-180.1').valid).toBe(false);
    expect(validateProbeInputs('abc', '10').valid).toBe(false);
    expect(validateProbeInputs('', '10').valid).toBe(false);
    expect(validateProbeInputs('NaN', '10').valid).toBe(false);

    const ok = validateProbeInputs('-89.45', '-137.31');
    expect(ok).toEqual({ valid: true, lat: -89.45, lon: -137.31 });
  });

  it('prevents overlaps between 0° cardinal, top-border in-frame sites, and off-frame edge labels', () => {
    const size = 600;
    const ext = 150;
    const placed: GlobalLabelBox[] = [
      computePillBox(size / 2 - 8, 18, 118, size, 'right'),
      computePillBox(size - 6, size / 2 - 10, 44, size, 'right'),
      computePillBox(size / 2 + 6, size - 8, 122, size, 'left'),
      computePillBox(6, size / 2 - 10, 44, size, 'left'),
    ];

    // Malapert Massif inside top-center near polar_y_km = 122
    const malSx = size / 2 + (5 / (2 * ext)) * size;
    const malSy = size / 2 - (122 / (2 * ext)) * size;
    const malPicked = pickNonOverlappingLabelPlacement(
      buildPolarPointLabelCandidates(malSx, malSy, 9),
      115,
      size,
      placed,
      { pad: 3, allowFallback: true },
    );
    expect(malPicked).not.toBeNull();
    expect(malPicked!.overlapped).toBe(false);
    placed.push(malPicked!.box);

    // Off-frame top-border edge labels: Mons Mouton Plateau (+2.6 km) & Nobile Rim 2 (+2.7 km)
    const edgeAnchors = [
      { edgeXKm: 55, edgeYKm: 150, w: 190 },
      { edgeXKm: 105, edgeYKm: 150, w: 155 },
    ];
    for (const item of edgeAnchors) {
      const tipX = size / 2 + (item.edgeXKm / (2 * ext)) * size;
      const tipY = Math.max(8, size / 2 - (item.edgeYKm / (2 * ext)) * size);
      const tailY = tipY + 20;
      const picked = pickNonOverlappingLabelPlacement(
        buildPolarEdgeLabelCandidates(tipX, tailY + 10, item.edgeXKm, item.edgeYKm, ext),
        item.w,
        size,
        placed,
        { pad: 3, allowFallback: true },
      );
      expect(picked).not.toBeNull();
      expect(picked!.overlapped).toBe(false);
      placed.push(picked!.box);
    }

    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(boxesOverlap(placed[i], placed[j], 2)).toBe(false);
      }
    }
  });

  it('offsets Global South Pole site labels upward above bottom longitude ticks without overlapping', () => {
    const size = 600;
    const rect = getGlobalMapRect(size);
    const placed: GlobalLabelBox[] = [];

    const southSites = [
      { lat: -89.45, lon: -137.31, w: 120 }, // Connecting Ridge
      { lat: -85.95, lon: 2.7, w: 115 }, // Malapert Massif
    ];

    for (const s of southSites) {
      const [sx, sy] = latLonToGlobalPx(s.lat, s.lon, rect);
      const { candidates, maxBottomY } = buildGlobalSiteLabelCandidates(sx, sy, rect);
      const picked = pickNonOverlappingLabelPlacement(candidates, s.w, size, placed, {
        pad: 3,
        maxBottomY,
        allowFallback: true,
      });
      expect(picked).not.toBeNull();
      expect(picked!.overlapped).toBe(false);
      // Must remain strictly above bottom border and lon ticks at rect.top + rect.height + 6
      expect(picked!.box.y + picked!.box.h).toBeLessThanOrEqual(rect.top + rect.height - 2);
      placed.push(picked!.box);
    }

    expect(boxesOverlap(placed[0], placed[1], 2)).toBe(false);
  });
});

describe('WP3 Copy Hygiene & Accessibility Static Audit (MAP-7, SCI-6, UX-2)', () => {
  it('contains zero bad cardinal typos, banned overclaims, or sub-12px fonts in map files', () => {
    expect(POLAR_CARDINAL_LABELS.west90).toBe('90°W');
    const files = [
      path.join(SRC_DIR, 'components/PolarMapCanvas.tsx'),
      path.join(SRC_DIR, 'components/map/polarMapMath.ts'),
      path.join(SRC_DIR, 'components/map/polarMapRender.ts'),
    ];
    const bannedPatterns = [
      ['-', '90°W'].join(''),
      ['0', ' W'].join(''),
      ['100%', ' solar power'].join(''),
      ['Real', '-Time'].join(''),
      ['LINK', ' ACTIVE'].join(''),
      ['>', '41d'].join(''),
      ['Polar Summer', ' Peak'].join(''),
      ['HLS', ' safe'].join(''),
      ['best landing', ' site'].join(''),
      ['recommended landing', ' site'].join(''),
      'text-[9px]',
      'text-[10px]',
      'text-[11px]',
      "'9px ",
      "'10px ",
      "'11px ",
      'bold 9px',
      'bold 10px',
      'bold 11px',
    ];

    for (const file of files) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const banned of bannedPatterns) {
        expect(text, `Found banned string "${banned}" in ${path.basename(file)}`).not.toContain(banned);
      }
    }

    const canvasSrc = fs.readFileSync(path.join(SRC_DIR, 'components/PolarMapCanvas.tsx'), 'utf-8');
    expect(canvasSrc).toContain('role="img"');
    expect(canvasSrc).toContain('aria-label={canvasAriaLabel}');
    expect(canvasSrc).toContain('noValidate');
  });

  it('matches generated polar_maps.json against curated site metrics when data assets are present', () => {
    const mapsPath = path.join(DATA_DIR, 'polar_maps.json');
    const sitesPath = path.join(DATA_DIR, 'sites.json');
    if (!fs.existsSync(mapsPath) || !fs.existsSync(sitesPath)) {
      return;
    }

    const mapsRaw = JSON.parse(fs.readFileSync(mapsPath, 'utf-8')) as PolarMapsData;
    const sitesRaw = JSON.parse(fs.readFileSync(sitesPath, 'utf-8')) as { sites: SiteData[] };
    const decoded = decodePolarMaps(mapsRaw);

    const demStub = makeSyntheticDemPatch(decoded.gridSize, decoded.mppM, () => 0);
    for (const id of ['connecting_ridge', 'shackleton_rim', 'peak_near_shackleton']) {
      const site = sitesRaw.sites.find((s) => s.id === id);
      if (!site || site.polar_x_km === null || site.polar_y_km === null) continue;
      const readout = samplePolarHoverReadout(demStub, site.polar_x_km, site.polar_y_km, 'solar_heatmap', decoded);
      expect(readout.valuePct).not.toBeNull();
      expect(Math.abs((readout.valuePct ?? 0) - site.metrics_2m.sun_time_pct)).toBeLessThanOrEqual(35);
    }
  });
});

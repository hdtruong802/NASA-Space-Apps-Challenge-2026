import type {
  ArtemisRegion,
  DecodedDemPatch,
  InstantMetrics,
  SiteCandidate,
  SiteData,
} from '../../types/lunar';
import {
  buildGlobalSiteLabelCandidates,
  buildPolarEdgeLabelCandidates,
  buildPolarPointLabelCandidates,
  compute3dQuadGradient,
  compute3dRayEndpointDelta,
  computeHillshade,
  computeOffFrameEdgeIndicator,
  computePillBox,
  formatOffFrameDistanceKm,
  getArtemisPolarRingsKm,
  getGlobalMapRect,
  isCandidateInPolarFrame,
  isRegionInPolarFrame,
  latLonToGlobalPx,
  NO_DATA_RGB,
  pickNonOverlappingLabelPlacement,
  POLAR_CARDINAL_LABELS,
  samplePolarMapCell,
  sunLightVectorCanvas,
  valueToEarthRgb,
  valueToSolarRgb,
  type DecodedPolarMaps,
  type GlobalLabelBox,
  type OffFrameEdgeIndicator,
  type PillAlign,
  type PolarLayer,
} from './polarMapMath';

export interface PolarCanvasHitTargets {
  edgeTargets: Array<{ siteId: string; px: number; py: number }>;
}

const FONT_MONO_12 = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const FONT_MONO_BOLD_12 = 'bold 12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
const FONT_SANS_12 = '12px Inter, ui-sans-serif, system-ui, sans-serif';
const FONT_SANS_BOLD_12 = 'bold 12px Inter, ui-sans-serif, system-ui, sans-serif';

function measurePillWidth(ctx: CanvasRenderingContext2D, text: string, font: string): number {
  ctx.font = font;
  return Math.ceil(ctx.measureText(text).width + 10);
}

function drawPillLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: {
    font?: string;
    fg?: string;
    bg?: string;
    border?: string;
    maxCanvasSize: number;
    align?: PillAlign;
    maxBottomY?: number;
  },
): GlobalLabelBox {
  const font = options.font ?? FONT_SANS_12;
  const padX = 5;
  const h = 18;
  const w = measurePillWidth(ctx, text, font);
  const { x: boxX, y: boxY } = computePillBox(
    x,
    y,
    w,
    options.maxCanvasSize,
    options.align ?? 'left',
    h,
    options.maxBottomY,
  );

  ctx.save();
  ctx.fillStyle = options.bg ?? 'rgba(2, 6, 23, 0.84)';
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, w, h, 4);
  ctx.fill();
  if (options.border) {
    ctx.strokeStyle = options.border;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.fillStyle = options.fg ?? '#e2e8f0';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, boxX + padX, boxY + h / 2 + 0.5);
  ctx.restore();

  return { x: boxX, y: boxY, w, h };
}

function drawDiamond(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  fill: string,
  stroke: string,
  lineWidth = 1.5,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx + radius, cy);
  ctx.lineTo(cx, cy + radius);
  ctx.lineTo(cx - radius, cy);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  angleRad: number,
  sizePx: number,
  color: string,
): void {
  ctx.save();
  ctx.translate(tipX, tipY);
  ctx.rotate(angleRad);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-sizePx * 1.35, -sizePx * 0.72);
  ctx.lineTo(-sizePx * 1.0, 0);
  ctx.lineTo(-sizePx * 1.35, sizePx * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export interface Draw2dPolarParams {
  ctx: CanvasRenderingContext2D;
  size: number;
  demPatch: DecodedDemPatch | null;
  bgCanvas: HTMLCanvasElement | null;
  sites: SiteData[];
  artemisRegions: ArtemisRegion[];
  showA3Regions: boolean;
  selectedSite: SiteData;
  compareSite: SiteData | null;
  hoveredSiteId: string | null;
  candidates: SiteCandidate[];
  selectedCandidateId: string | null;
  hoveredCandidateId: string | null;
  subsolarLon: number;
  subearthLon: number;
}

export function draw2dPolarMap(params: Draw2dPolarParams): PolarCanvasHitTargets {
  const {
    ctx,
    size,
    demPatch,
    bgCanvas,
    sites,
    artemisRegions,
    showA3Regions,
    selectedSite,
    compareSite,
    hoveredSiteId,
    candidates,
    selectedCandidateId,
    hoveredCandidateId,
    subsolarLon,
    subearthLon,
  } = params;

  const ext = demPatch?.extentKm ?? 150;
  const edgeTargets: PolarCanvasHitTargets['edgeTargets'] = [];

  if (bgCanvas && demPatch) {
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(bgCanvas, 0, 0, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);
  }

  const kmToPx = (xKm: number, yKm: number): [number, number] => [
    ((xKm + ext) / (2 * ext)) * size,
    ((ext - yKm) / (2 * ext)) * size,
  ];

  // Polar latitude graticule circles (88 deg S = 60.7 km, 86 deg S = 121.3 km) & crosshair axes
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const [rKm, label] of [
    [60.7, '88°S'],
    [121.3, '86°S'],
  ] as const) {
    const rPx = (rKm / (2 * ext)) * size;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, rPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = FONT_MONO_12;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.85)';
    ctx.fillText(label, size / 2 + 5, size / 2 - rPx + 14);
  }
  ctx.beginPath();
  ctx.moveTo(size / 2, 0);
  ctx.lineTo(size / 2, size);
  ctx.moveTo(0, size / 2);
  ctx.lineTo(size, size / 2);
  ctx.stroke();
  ctx.restore();

  // Track placed labels (cardinals, candidates, sites, pins, off-frame edges) to avoid overlaps
  const placedLabels: GlobalLabelBox[] = [];

  // Cardinal Longitude Labels (>= 12px, unsigned 90°W)
  placedLabels.push(
    drawPillLabel(ctx, POLAR_CARDINAL_LABELS.north0, size / 2 - 8, 18, {
      font: FONT_MONO_BOLD_12,
      fg: '#e2e8f0',
      bg: 'rgba(2, 6, 23, 0.78)',
      maxCanvasSize: size,
      align: 'right',
    }),
    drawPillLabel(ctx, POLAR_CARDINAL_LABELS.east90, size - 6, size / 2 - 10, {
      font: FONT_MONO_BOLD_12,
      fg: '#e2e8f0',
      bg: 'rgba(2, 6, 23, 0.78)',
      maxCanvasSize: size,
      align: 'right',
    }),
    drawPillLabel(ctx, POLAR_CARDINAL_LABELS.south180, size / 2 + 6, size - 8, {
      font: FONT_MONO_BOLD_12,
      fg: '#e2e8f0',
      bg: 'rgba(2, 6, 23, 0.78)',
      maxCanvasSize: size,
    }),
    drawPillLabel(ctx, POLAR_CARDINAL_LABELS.west90, 6, size / 2 - 10, {
      font: FONT_MONO_BOLD_12,
      fg: '#e2e8f0',
      bg: 'rgba(2, 6, 23, 0.78)',
      maxCanvasSize: size,
    }),
  );

  // Artemis III 2024 Candidate Regions (GeoJSON rings_polar_km or area-equivalent circle fallback)
  if (showA3Regions) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, size, size);
    ctx.clip();

    for (const reg of artemisRegions) {
      if (!isRegionInPolarFrame(reg, ext)) continue;
      const rings = getArtemisPolarRingsKm(reg);
      ctx.save();
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.8)';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1.4;

      if (rings.length > 0) {
        for (const ring of rings) {
          if (ring.length < 3) continue;
          ctx.beginPath();
          for (let i = 0; i < ring.length; i++) {
            const [px, py] = kmToPx(ring[i][0], ring[i][1]);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        const [cx, cy] = kmToPx(reg.polar_x_km, reg.polar_y_km);
        drawPillLabel(ctx, reg.code, cx + 6, cy + 2, {
          font: FONT_MONO_BOLD_12,
          fg: '#7dd3fc',
          bg: 'rgba(2, 6, 23, 0.75)',
          maxCanvasSize: size,
        });
      } else {
        const [rx, ry] = kmToPx(reg.polar_x_km, reg.polar_y_km);
        const radiusPx = Math.max(8, (Math.sqrt(reg.area_km2 / Math.PI) / (2 * ext)) * size);
        ctx.beginPath();
        ctx.arc(rx, ry, radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        drawPillLabel(ctx, reg.code, rx + radiusPx + 3, ry + 4, {
          font: FONT_MONO_BOLD_12,
          fg: '#7dd3fc',
          bg: 'rgba(2, 6, 23, 0.75)',
          maxCanvasSize: size,
        });
      }
      ctx.restore();
    }
    ctx.restore();
  }

  // Render WP7 Computed Candidates (violet #a78bfa diamonds with rank badge)
  for (const c of candidates) {
    if (!isCandidateInPolarFrame(c, ext)) continue;
    const [cx, cy] = kmToPx(c.xKm, c.yKm);
    const isSelCand = c.id === selectedCandidateId;
    const isHovCand = c.id === hoveredCandidateId;

    if (isSelCand || isHovCand) {
      ctx.save();
      ctx.strokeStyle = isSelCand ? '#ddd6fe' : '#a78bfa';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, isSelCand ? 12 : 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawDiamond(ctx, cx, cy, isSelCand ? 7 : 5.5, '#a78bfa', '#f5f3ff', isSelCand ? 2 : 1.3);

    if (isSelCand || isHovCand || c.rank <= 5) {
      const rankLabel = `#${c.rank}`;
      const pillW = measurePillWidth(ctx, rankLabel, FONT_MONO_BOLD_12);
      const picked = pickNonOverlappingLabelPlacement(
        buildPolarPointLabelCandidates(cx, cy, 8),
        pillW,
        size,
        placedLabels,
        { pad: 3, allowFallback: isSelCand || isHovCand },
      );
      if (picked) {
        const box = drawPillLabel(ctx, rankLabel, picked.x, picked.y, {
          font: FONT_MONO_BOLD_12,
          fg: '#ede9fe',
          bg: 'rgba(76, 29, 149, 0.88)',
          border: isSelCand ? '#c4b5fd' : 'rgba(167, 139, 250, 0.5)',
          maxCanvasSize: size,
          align: picked.align,
        });
        placedLabels.push(box);
      }
    }
  }

  // Render In-Frame Polar Sites (non-selected first, then compare/selected/hovered)
  const polarSites = sites.filter(
    (s) =>
      s.is_polar_dem &&
      s.polar_x_km !== null &&
      s.polar_y_km !== null &&
      Math.abs(s.polar_x_km) <= ext - 1 &&
      Math.abs(s.polar_y_km) <= ext - 1,
  );
  const orderedPolarSites = [...polarSites].sort((a, b) => {
    const rank = (s: SiteData) =>
      s.id === selectedSite.id ? 3 : s.id === compareSite?.id ? 2 : s.id === hoveredSiteId ? 1 : 0;
    return rank(a) - rank(b);
  });

  const inFrameLabelQueue: Array<{
    site: SiteData;
    sx: number;
    sy: number;
    isSel: boolean;
    isCmp: boolean;
    isHov: boolean;
    priority: number;
  }> = [];

  for (const s of orderedPolarSites) {
    const [sx, sy] = kmToPx(s.polar_x_km!, s.polar_y_km!);
    const isSel = s.id === selectedSite.id;
    const isCmp = compareSite?.id === s.id;
    const isHov = s.id === hoveredSiteId;

    ctx.save();
    if (isSel) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(sx, sy, 10.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isCmp) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(sx, sy, 9.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isHov) {
      ctx.strokeStyle = '#e2e8f0';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(sx, sy, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle =
      s.id === 'shackleton_psr'
        ? '#a855f7'
        : isSel
          ? '#fbbf24'
          : isCmp
            ? '#38bdf8'
            : s.metrics_2m.sun_visible_pct >= 75
              ? '#facc15'
              : '#94a3b8';
    ctx.beginPath();
    ctx.arc(sx, sy, isSel || isCmp ? 5.2 : 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    const highScore = s.metrics_2m.viability_score !== null && s.metrics_2m.viability_score >= 60;
    if (isSel || isCmp || isHov || highScore) {
      const priority = isSel ? 4 : isCmp ? 3 : isHov ? 2 : 1;
      inFrameLabelQueue.push({ site: s, sx, sy, isSel, isCmp, isHov, priority });
    }
  }

  inFrameLabelQueue.sort((a, b) => b.priority - a.priority);
  for (const item of inFrameLabelQueue) {
    const font = item.isSel ? FONT_SANS_BOLD_12 : FONT_SANS_12;
    const pillW = measurePillWidth(ctx, item.site.short_name, font);
    const isMustShow = item.priority >= 2;
    const picked = pickNonOverlappingLabelPlacement(
      buildPolarPointLabelCandidates(item.sx, item.sy, 9),
      pillW,
      size,
      placedLabels,
      { pad: 3, allowFallback: isMustShow },
    );
    if (picked) {
      const box = drawPillLabel(ctx, item.site.short_name, picked.x, picked.y, {
        font,
        fg: item.isSel ? '#fef08a' : item.isCmp ? '#bae6fd' : '#f1f5f9',
        bg: item.isSel ? 'rgba(30, 27, 12, 0.9)' : 'rgba(2, 6, 23, 0.8)',
        border: item.isSel ? 'rgba(251, 191, 36, 0.65)' : item.isCmp ? 'rgba(56, 189, 248, 0.65)' : undefined,
        maxCanvasSize: size,
        align: picked.align,
      });
      placedLabels.push(box);
    }
  }

  // Custom Pin if active and inside frame
  if (
    selectedSite.isCustom &&
    selectedSite.polar_x_km !== null &&
    selectedSite.polar_y_km !== null &&
    Math.abs(selectedSite.polar_x_km) <= ext &&
    Math.abs(selectedSite.polar_y_km) <= ext
  ) {
    const [cx, cy] = kmToPx(selectedSite.polar_x_km, selectedSite.polar_y_km);
    ctx.save();
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(cx, cy, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    const customLabel = selectedSite.short_name || 'Custom Pin';
    const pillW = measurePillWidth(ctx, customLabel, FONT_SANS_BOLD_12);
    const picked = pickNonOverlappingLabelPlacement(
      buildPolarPointLabelCandidates(cx, cy, 11),
      pillW,
      size,
      placedLabels,
      { pad: 3, allowFallback: true },
    );
    if (picked) {
      placedLabels.push(
        drawPillLabel(ctx, customLabel, picked.x, picked.y, {
          font: FONT_SANS_BOLD_12,
          fg: '#fecdd3',
          bg: 'rgba(76, 5, 25, 0.9)',
          border: 'rgba(251, 113, 133, 0.65)',
          maxCanvasSize: size,
          align: picked.align,
        }),
      );
    }
  }

  // Off-Frame Directional Edge Indicators (MAP-3: selected, compare, and any off-frame polar sites)
  const offFrameIndicators: Array<{ ind: OffFrameEdgeIndicator; priority: number }> = [];
  const seenIds = new Set<string>();

  const maybeAddOffFrame = (site: SiteData | null, priority: number) => {
    if (!site || seenIds.has(site.id)) return;
    const ind = computeOffFrameEdgeIndicator(site, ext);
    if (ind) {
      seenIds.add(site.id);
      offFrameIndicators.push({ ind, priority });
    }
  };

  maybeAddOffFrame(selectedSite, 3);
  maybeAddOffFrame(compareSite, 2);
  for (const s of sites) {
    if (s.is_polar_dem) maybeAddOffFrame(s, s.id === hoveredSiteId ? 2 : 1);
  }
  offFrameIndicators.sort((a, b) => b.priority - a.priority);

  for (const { ind, priority } of offFrameIndicators) {
    const [rawEx, rawEy] = kmToPx(ind.edgeXKm, ind.edgeYKm);
    const tipX = Math.max(8, Math.min(size - 8, rawEx));
    const tipY = Math.max(8, Math.min(size - 8, rawEy));
    const tailX = tipX - Math.cos(ind.angleRad) * 20;
    const tailY = tipY - Math.sin(ind.angleRad) * 20;

    const isSel = priority === 3;
    const isCmp = priority === 2 && compareSite?.id === ind.site.id;
    const isHov = ind.site.id === hoveredSiteId;
    const color = isSel ? '#fbbf24' : isCmp ? '#38bdf8' : '#f472b6';

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = isSel || isCmp ? 2.6 : 2.0;
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();
    drawArrowHead(ctx, tipX, tipY, ind.angleRad, isSel || isCmp ? 8 : 6.5, color);
    ctx.restore();

    edgeTargets.push({ siteId: ind.site.id, px: (tipX + tailX) / 2, py: (tipY + tailY) / 2 });

    // Place pill label cleanly inward/sideways away from cardinals, site labels, and sibling arrows
    const labelText = `${ind.site.short_name} (${formatOffFrameDistanceKm(ind.distanceBeyondEdgeKm)})`;
    const anchorX = tailX - Math.cos(ind.angleRad) * 10;
    const anchorY = tailY - Math.sin(ind.angleRad) * 10;
    const font = isSel || isCmp ? FONT_SANS_BOLD_12 : FONT_SANS_12;
    const pillW = measurePillWidth(ctx, labelText, font);
    const edgeCandidates = buildPolarEdgeLabelCandidates(anchorX, anchorY, ind.edgeXKm, ind.edgeYKm, ext);
    const picked = pickNonOverlappingLabelPlacement(edgeCandidates, pillW, size, placedLabels, {
      pad: 3,
      allowFallback: true,
    });

    if (picked) {
      const box = drawPillLabel(ctx, labelText, picked.x, picked.y, {
        font,
        fg: isSel ? '#fef08a' : isCmp ? '#bae6fd' : '#fbcfe8',
        bg: 'rgba(2, 6, 23, 0.92)',
        border: isHov || isSel || isCmp ? color : 'rgba(244, 114, 182, 0.55)',
        maxCanvasSize: size,
        align: picked.align,
      });
      placedLabels.push(box);

      const nearestX = Math.max(box.x, Math.min(box.x + box.w, tailX));
      const nearestY = Math.max(box.y, Math.min(box.y + box.h, tailY));
      if (Math.hypot(nearestX - tailX, nearestY - tailY) > 16) {
        ctx.save();
        ctx.strokeStyle = isSel || isCmp || isHov ? color : 'rgba(244, 114, 182, 0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(nearestX, nearestY);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Real-time Solar & Earth incoming direction compass ring (bottom-left)
  const vecX = 52;
  const vecY = size - 56;
  ctx.save();
  ctx.fillStyle = 'rgba(2, 6, 23, 0.84)';
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.8)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(vecX, vecY, 32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  const [sunUx, sunUy] = sunLightVectorCanvas(subsolarLon);
  const sunDx = sunUx * 24;
  const sunDy = sunUy * 24;
  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(vecX, vecY);
  ctx.lineTo(vecX + sunDx, vecY + sunDy);
  ctx.stroke();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(vecX + sunDx, vecY + sunDy, 3.8, 0, Math.PI * 2);
  ctx.fill();

  const [earthUx, earthUy] = sunLightVectorCanvas(subearthLon);
  const eDx = earthUx * 20;
  const eDy = earthUy * 20;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(vecX, vecY);
  ctx.lineTo(vecX + eDx, vecY + eDy);
  ctx.stroke();
  ctx.fillStyle = '#38bdf8';
  ctx.beginPath();
  ctx.arc(vecX + eDx, vecY + eDy, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.font = FONT_MONO_12;
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText('SUN / EARTH', vecX - 38, vecY + 46);
  ctx.restore();

  return { edgeTargets };
}

export interface Draw3dMeshParams {
  ctx: CanvasRenderingContext2D;
  size: number;
  demPatch: DecodedDemPatch | null;
  polarMaps: DecodedPolarMaps | null;
  polarLayer: PolarLayer;
  sites: SiteData[];
  selectedSite: SiteData;
  compareSite: SiteData | null;
  candidates: SiteCandidate[];
  selectedCandidateId: string | null;
  instant: InstantMetrics;
  subsolarLon: number;
  subearthLon: number;
  rotAzDeg: number;
  rotPitchDeg: number;
  vertExag: number;
}

export function draw3dTerrainMesh(params: Draw3dMeshParams): void {
  const {
    ctx,
    size,
    demPatch,
    polarMaps,
    polarLayer,
    sites,
    selectedSite,
    compareSite,
    candidates,
    selectedCandidateId,
    instant,
    subsolarLon,
    subearthLon,
    rotAzDeg,
    rotPitchDeg,
    vertExag,
  } = params;

  ctx.fillStyle = '#050814';
  ctx.fillRect(0, 0, size, size);
  if (!demPatch) return;

  const n = demPatch.gridSize;
  const elev = demPatch.elev;
  const eMin = demPatch.elevMinM;
  const eSpan = Math.max(1, demPatch.elevMaxM - eMin);
  const ext = demPatch.extentKm;
  const step = 4; // ~62x62 terrain mesh

  const yaw = (rotAzDeg * Math.PI) / 180;
  const pitch = (rotPitchDeg * Math.PI) / 180;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);

  const scaleBase = size / 440;

  const project = (xKm: number, yKm: number, zM: number): { sx: number; sy: number; depth: number } => {
    const zKm = (zM / 1000.0) * vertExag;
    const xr = xKm * cy - yKm * sy;
    const yr = xKm * sy + yKm * cy;
    const yTilt = -yr * sp - zKm * cp;
    const depth = yr * cp - zKm * sp;
    const persp = 1.12 * (420 / (420 + depth * 0.45)) * scaleBase;
    return {
      sx: size * 0.5 + xr * persp * 0.96,
      sy: size * 0.54 + yTilt * persp * 0.96,
      depth,
    };
  };

  // Unified hillshade light vector from subsolarLon (identical convention to 2D)
  const [lx, ly] = sunLightVectorCanvas(subsolarLon);
  const [ex, ey] = sunLightVectorCanvas(subearthLon);
  const sameGridAsMaps =
    polarMaps !== null && polarMaps.gridSize === n && Math.abs(polarMaps.mppM - demPatch.mpp) < 1;

  interface Quad {
    pts: [number, number][];
    depth: number;
    fill: string;
  }

  const quads: Quad[] = [];
  for (let r = 0; r < n - step; r += step) {
    for (let c = 0; c < n - step; c += step) {
      const x0 = ((c / (n - 1)) * 2 - 1) * ext;
      const x1 = (((c + step) / (n - 1)) * 2 - 1) * ext;
      const y0 = (1 - (r / (n - 1)) * 2) * ext;
      const y1 = (1 - ((r + step) / (n - 1)) * 2) * ext;

      const z00 = elev[r * n + c];
      const z10 = elev[r * n + (c + step)];
      const z11 = elev[(r + step) * n + (c + step)];
      const z01 = elev[(r + step) * n + c];

      const p00 = project(x0, y0, z00);
      const p10 = project(x1, y0, z10);
      const p11 = project(x1, y1, z11);
      const p01 = project(x0, y1, z01);

      const avgElev = (z00 + z10 + z11 + z01) * 0.25;
      const eNorm = Math.max(0, Math.min(1, (avgElev - eMin) / eSpan));

      // Canvas-convention partial derivatives (c -> +x, r -> +y_canvas)
      const [dzdx, dzdy] = compute3dQuadGradient(z00, z10, z11, z01, step * demPatch.mpp);
      const shade = computeHillshade(dzdx, dzdy, lx, ly);

      let cr: number;
      let cg: number;
      let cb: number;
      if (polarLayer === 'solar_heatmap') {
        if (polarMaps) {
          const mr = Math.min(n - 1, r + Math.floor(step / 2));
          const mc = Math.min(n - 1, c + Math.floor(step / 2));
          const midXKm = (x0 + x1) * 0.5;
          const midYKm = (y0 + y1) * 0.5;
          const rawVal = sameGridAsMaps
            ? polarMaps.sunTimePct[mr * n + mc]
            : (samplePolarMapCell(polarMaps, 'solar_heatmap', midXKm, midYKm).valuePct ?? 255);
          if (rawVal === 255) {
            [cr, cg, cb] = NO_DATA_RGB;
          } else {
            const [vr, vg, vb] = valueToSolarRgb(rawVal / 100);
            const reliefMod = 0.85 + 0.25 * (shade - 0.72);
            cr = Math.min(255, vr * reliefMod);
            cg = Math.min(255, vg * reliefMod);
            cb = Math.min(255, vb * reliefMod);
          }
        } else {
          const solarAspect = Math.max(-0.5, Math.min(0.5, -(dzdx * lx + dzdy * ly) * 0.9));
          const heat = Math.max(0, Math.min(1, eNorm * 0.8 + solarAspect * 0.4));
          const lit = Math.pow(heat, 1.3);
          cr = Math.min(255, 18 + lit * 235);
          cg = Math.min(255, 22 + Math.pow(heat, 1.75) * 185);
          cb = Math.min(255, 58 - lit * 36 + (1 - heat) * 40);
        }
      } else if (polarLayer === 'earth_heatmap') {
        if (polarMaps) {
          const mr = Math.min(n - 1, r + Math.floor(step / 2));
          const mc = Math.min(n - 1, c + Math.floor(step / 2));
          const midXKm = (x0 + x1) * 0.5;
          const midYKm = (y0 + y1) * 0.5;
          const rawVal = sameGridAsMaps
            ? polarMaps.earthVisiblePct[mr * n + mc]
            : (samplePolarMapCell(polarMaps, 'earth_heatmap', midXKm, midYKm).valuePct ?? 255);
          if (rawVal === 255) {
            [cr, cg, cb] = NO_DATA_RGB;
          } else {
            const [vr, vg, vb] = valueToEarthRgb(rawVal / 100);
            const reliefMod = 0.85 + 0.25 * (shade - 0.72);
            cr = Math.min(255, vr * reliefMod);
            cg = Math.min(255, vg * reliefMod);
            cb = Math.min(255, vb * reliefMod);
          }
        } else {
          const earthAspect = Math.max(-0.5, Math.min(0.5, -(dzdx * ex + dzdy * ey) * 1.0));
          const vis = Math.max(0, Math.min(1, eNorm * 0.72 + earthAspect * 0.45 + 0.08));
          cr = Math.min(255, 16 + vis * 36);
          cg = Math.min(255, 28 + Math.pow(vis, 1.1) * 195);
          cb = Math.min(255, 55 + Math.pow(vis, 0.9) * 195);
        }
      } else if (polarLayer === 'slope_safety') {
        const slDeg = demPatch.slopeU8[r * n + c] * demPatch.slopeScaleDeg;
        if (slDeg <= 5.0) {
          cr = Math.min(255, 22 * shade + 10);
          cg = Math.min(255, 195 * shade);
          cb = Math.min(255, 130 * shade);
        } else if (slDeg <= 15.0) {
          cr = Math.min(255, 215 * shade);
          cg = Math.min(255, 145 * shade);
          cb = Math.min(255, 45 * shade);
        } else {
          cr = Math.min(255, 155 * shade);
          cg = Math.min(255, 45 * shade);
          cb = Math.min(255, 58 * shade);
        }
      } else {
        cr = Math.min(255, (30 + eNorm * 165) * shade);
        cg = Math.min(255, (37 + eNorm * 155) * shade);
        cb = Math.min(255, (56 + eNorm * 130) * shade);
      }

      quads.push({
        pts: [
          [p00.sx, p00.sy],
          [p10.sx, p10.sy],
          [p11.sx, p11.sy],
          [p01.sx, p01.sy],
        ],
        depth: (p00.depth + p10.depth + p11.depth + p01.depth) * 0.25,
        fill: `rgb(${Math.round(cr)},${Math.round(cg)},${Math.round(cb)})`,
      });
    }
  }

  quads.sort((a, b) => b.depth - a.depth);
  for (const q of quads) {
    ctx.fillStyle = q.fill;
    ctx.beginPath();
    ctx.moveTo(q.pts[0][0], q.pts[0][1]);
    ctx.lineTo(q.pts[1][0], q.pts[1][1]);
    ctx.lineTo(q.pts[2][0], q.pts[2][1]);
    ctx.lineTo(q.pts[3][0], q.pts[3][1]);
    ctx.closePath();
    ctx.fill();
  }

  // Determine 3D ray origin: selectedSite if inside ±150 km frame, otherwise edge clamp
  const selOff = computeOffFrameEdgeIndicator(selectedSite, ext);
  const baseX = selOff ? selOff.edgeXKm : (selectedSite.polar_x_km ?? 0);
  const baseY = selOff ? selOff.edgeYKm : (selectedSite.polar_y_km ?? 0);
  const baseZ = selectedSite.is_polar_dem && !selOff ? selectedSite.elev_m : 0;
  const originZ = baseZ + 400;
  const origin3 = project(baseX, baseY, originZ);

  // True-elevation Sun ray scaled consistently with vertExag (MAP-4)
  const sunDelta = compute3dRayEndpointDelta(selectedSite.lon, instant.sunAzDeg, instant.sunElDeg, vertExag, 86);
  const sunEnd = project(baseX + sunDelta.dxKm, baseY + sunDelta.dyKm, originZ + sunDelta.dzM);
  ctx.save();
  if (!instant.sunVisible) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.48)';
  } else {
    ctx.strokeStyle = '#fbbf24';
  }
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(origin3.sx, origin3.sy);
  ctx.lineTo(sunEnd.sx, sunEnd.sy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(sunEnd.sx, sunEnd.sy, 5, 0, Math.PI * 2);
  if (instant.sunVisible) {
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 191, 36, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  drawPillLabel(
    ctx,
    `SUN ${instant.sunVisible ? '' : 'OCCLUDED '}${instant.sunElDeg.toFixed(1)}°`,
    sunEnd.sx + 7,
    sunEnd.sy + 4,
    {
      font: FONT_MONO_BOLD_12,
      fg: instant.sunVisible ? '#fef08a' : '#fcd34d',
      bg: 'rgba(2, 6, 23, 0.85)',
      maxCanvasSize: size,
    },
  );
  ctx.restore();

  // True-elevation Earth DTE ray scaled consistently with vertExag (MAP-4)
  const earthDelta = compute3dRayEndpointDelta(
    selectedSite.lon,
    instant.earthAzDeg,
    instant.earthElDeg,
    vertExag,
    86,
  );
  const earthEnd = project(baseX + earthDelta.dxKm, baseY + earthDelta.dyKm, originZ + earthDelta.dzM);
  ctx.save();
  if (!instant.earthVisible) {
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.48)';
  } else {
    ctx.strokeStyle = '#38bdf8';
  }
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(origin3.sx, origin3.sy);
  ctx.lineTo(earthEnd.sx, earthEnd.sy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.arc(earthEnd.sx, earthEnd.sy, 4.5, 0, Math.PI * 2);
  if (instant.earthVisible) {
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  drawPillLabel(
    ctx,
    `EARTH ${instant.earthVisible ? '' : 'OCCLUDED '}${instant.earthElDeg.toFixed(1)}°`,
    earthEnd.sx + 7,
    earthEnd.sy + 4,
    {
      font: FONT_MONO_BOLD_12,
      fg: instant.earthVisible ? '#bae6fd' : '#7dd3fc',
      bg: 'rgba(2, 6, 23, 0.85)',
      maxCanvasSize: size,
    },
  );
  ctx.restore();

  // WP7 Candidate beacons in 3D
  for (const c of candidates) {
    if (!isCandidateInPolarFrame(c, ext)) continue;
    const isSelCand = c.id === selectedCandidateId;
    const b0 = project(c.xKm, c.yKm, c.elevM);
    const b1 = project(c.xKm, c.yKm, c.elevM + 2600);
    ctx.save();
    ctx.strokeStyle = '#a78bfa';
    ctx.lineWidth = isSelCand ? 2.2 : 1.4;
    ctx.beginPath();
    ctx.moveTo(b0.sx, b0.sy);
    ctx.lineTo(b1.sx, b1.sy);
    ctx.stroke();
    drawDiamond(ctx, b1.sx, b1.sy, isSelCand ? 6 : 4.5, '#a78bfa', '#f5f3ff', 1.4);
    if (isSelCand || c.rank <= 3) {
      drawPillLabel(ctx, `#${c.rank}`, b1.sx + 6, b1.sy, {
        font: FONT_MONO_BOLD_12,
        fg: '#ede9fe',
        bg: 'rgba(76, 29, 149, 0.85)',
        maxCanvasSize: size,
      });
    }
    ctx.restore();
  }

  // Site beacons for in-frame compareSite & selectedSite
  const drawBeacon = (s: SiteData, color: string, fg: string) => {
    if (!s.is_polar_dem || s.polar_x_km === null || s.polar_y_km === null) return;
    if (Math.abs(s.polar_x_km) > ext || Math.abs(s.polar_y_km) > ext) return;
    const b0 = project(s.polar_x_km, s.polar_y_km, s.elev_m);
    const b1 = project(s.polar_x_km, s.polar_y_km, s.elev_m + 3200);
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(b0.sx, b0.sy);
    ctx.lineTo(b1.sx, b1.sy);
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(b1.sx, b1.sy, 4.8, 0, Math.PI * 2);
    ctx.fill();
    drawPillLabel(ctx, s.short_name, b1.sx + 7, b1.sy, {
      font: FONT_SANS_BOLD_12,
      fg,
      bg: 'rgba(2, 6, 23, 0.88)',
      border: color,
      maxCanvasSize: size,
    });
    ctx.restore();
  };

  if (compareSite) drawBeacon(compareSite, '#38bdf8', '#bae6fd');
  drawBeacon(selectedSite, '#fbbf24', '#fef08a');

  // Off-frame directional indicators in 3D Mesh (MAP-3)
  const offSeen = new Set<string>();
  const draw3dOffFrame = (site: SiteData | null, color: string, fg: string) => {
    if (!site || offSeen.has(site.id)) return;
    const ind = computeOffFrameEdgeIndicator(site, ext);
    if (!ind) return;
    offSeen.add(site.id);
    const mag = Math.max(1e-6, Math.hypot(ind.xKm, ind.yKm));
    const ux = ind.xKm / mag;
    const uy = ind.yKm / mag;
    const pInner = project(ind.edgeXKm, ind.edgeYKm, 600);
    const pOuter = project(ind.edgeXKm + ux * 26, ind.edgeYKm + uy * 26, 1200);
    const angle2d = Math.atan2(pOuter.sy - pInner.sy, pOuter.sx - pInner.sx);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(pInner.sx, pInner.sy);
    ctx.lineTo(pOuter.sx, pOuter.sy);
    ctx.stroke();
    drawArrowHead(ctx, pOuter.sx, pOuter.sy, angle2d, 7.5, color);
    drawPillLabel(
      ctx,
      `${site.short_name} (${formatOffFrameDistanceKm(ind.distanceBeyondEdgeKm)})`,
      pOuter.sx + 6,
      pOuter.sy - 4,
      {
        font: FONT_SANS_BOLD_12,
        fg,
        bg: 'rgba(2, 6, 23, 0.92)',
        border: color,
        maxCanvasSize: size,
      },
    );
    ctx.restore();
  };

  draw3dOffFrame(selectedSite, '#fbbf24', '#fef08a');
  draw3dOffFrame(compareSite, '#38bdf8', '#bae6fd');
  for (const s of sites) {
    if (s.is_polar_dem) draw3dOffFrame(s, '#f472b6', '#fbcfe8');
  }

  // 3D Cardinal Edge Labels (unsigned 90°W)
  for (const [cxKm, cyKm, label] of [
    [0, ext + 8, '0° Earthside'],
    [ext + 8, 0, '90°E'],
    [0, -(ext + 8), '180° Farside'],
    [-(ext + 8), 0, '90°W'],
  ] as const) {
    const cp3 = project(cxKm, cyKm, 0);
    drawPillLabel(ctx, label, cp3.sx, Math.max(38, cp3.sy), {
      font: FONT_MONO_BOLD_12,
      fg: '#e2e8f0',
      bg: 'rgba(2, 6, 23, 0.72)',
      maxCanvasSize: size,
      align: 'center',
    });
  }

  // 3D HUD note with vertical exaggeration & scaled rays disclosure
  drawPillLabel(
    ctx,
    `3D LOLA Mesh (${vertExag}× vert. exag. · rays scaled ${vertExag}×) · Az ${Math.round(rotAzDeg)}° · Pitch ${Math.round(rotPitchDeg)}°`,
    8,
    20,
    {
      font: FONT_MONO_12,
      fg: '#e2e8f0',
      bg: 'rgba(2, 6, 23, 0.8)',
      maxCanvasSize: size,
    },
  );
}

export interface DrawGlobalMapParams {
  ctx: CanvasRenderingContext2D;
  size: number;
  sites: SiteData[];
  selectedSite: SiteData;
  compareSite: SiteData | null;
  hoveredSiteId: string | null;
  candidates: SiteCandidate[];
  selectedCandidateId: string | null;
  hoveredCandidateId: string | null;
  subsolarLat: number;
  subsolarLon: number;
  subearthLat: number;
  subearthLon: number;
}

export function drawGlobalLunarMap(params: DrawGlobalMapParams): void {
  const {
    ctx,
    size,
    sites,
    selectedSite,
    compareSite,
    hoveredSiteId,
    candidates,
    selectedCandidateId,
    hoveredCandidateId,
    subsolarLat,
    subsolarLon,
    subearthLat,
    subearthLon,
  } = params;

  ctx.fillStyle = '#070c18';
  ctx.fillRect(0, 0, size, size);

  const rect = getGlobalMapRect(size);
  const step = 3;
  const deg2rad = Math.PI / 180;
  const sslLatR = subsolarLat * deg2rad;
  const sslLonR = subsolarLon * deg2rad;

  // Day/Night Illumination field with smooth terminator twilight band
  for (let py = 0; py < rect.height; py += step) {
    const lat = 90 - (py / rect.height) * 180;
    const latR = lat * deg2rad;
    const sinLat = Math.sin(latR);
    const cosLat = Math.cos(latR);
    for (let px = 0; px < rect.width; px += step) {
      const lon = -180 + (px / rect.width) * 360;
      const lonR = lon * deg2rad;
      const cosInc =
        sinLat * Math.sin(sslLatR) + cosLat * Math.cos(sslLatR) * Math.cos(lonR - sslLonR);

      // Subtle mare-like low-frequency albedo variation for visual clarity (purely decorative background)
      const albedo = 0.92 + 0.08 * Math.sin(lonR * 2.1 + 0.6) * Math.cos(latR * 2.5);
      if (cosInc > 0) {
        const lum = (46 + Math.pow(cosInc, 0.85) * 118) * albedo;
        ctx.fillStyle = `rgb(${Math.round(lum)}, ${Math.round(lum + 4)}, ${Math.round(lum + 12)})`;
      } else {
        const night = 18 + Math.max(0, (cosInc + 0.08) * 140);
        ctx.fillStyle = `rgb(${Math.round(night)}, ${Math.round(night + 4)}, ${Math.round(night + 12)})`;
      }
      ctx.fillRect(rect.left + px, rect.top + py, step, step);
    }
  }

  // Highlight South Pole DEM band (-75 to -90 deg)
  const spTopY = rect.top + ((90 - -75) / 180) * rect.height;
  const spBottomY = rect.top + rect.height;
  ctx.fillStyle = 'rgba(251, 191, 36, 0.14)';
  ctx.fillRect(rect.left, spTopY, rect.width, spBottomY - spTopY);

  // Graticule gridlines
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);

  const latTicks = size < 380 ? [-60, 0, 60] : [-60, -30, 0, 30, 60];
  for (const lat of latTicks) {
    const y = rect.top + ((90 - lat) / 180) * rect.height;
    ctx.beginPath();
    ctx.moveTo(rect.left, y);
    ctx.lineTo(rect.left + rect.width, y);
    ctx.stroke();

    ctx.font = FONT_MONO_12;
    ctx.fillStyle = '#94a3b8';
    ctx.textBaseline = 'middle';
    const lbl = lat === 0 ? '0°' : `${Math.abs(lat)}°${lat > 0 ? 'N' : 'S'}`;
    ctx.fillText(lbl, 4, y);
  }

  // -75°S DEM threshold line
  ctx.save();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.45)';
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(rect.left, spTopY);
  ctx.lineTo(rect.left + rect.width, spTopY);
  ctx.stroke();
  ctx.restore();

  const lonTicks = size < 380 ? [-90, 0, 90] : [-120, -60, 0, 60, 120];
  for (const lon of lonTicks) {
    const x = rect.left + ((lon + 180) / 360) * rect.width;
    ctx.beginPath();
    ctx.moveTo(x, rect.top);
    ctx.lineTo(x, rect.top + rect.height);
    ctx.stroke();

    ctx.font = FONT_MONO_12;
    ctx.fillStyle = '#94a3b8';
    ctx.textBaseline = 'top';
    const lbl = lon === 0 ? '0°' : `${Math.abs(lon)}°${lon > 0 ? 'E' : 'W'}`;
    const tw = ctx.measureText(lbl).width;
    ctx.fillText(lbl, x - tw / 2, rect.top + rect.height + 6);
  }

  // Near Side vs Far Side boundary lines at +/-90°
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.setLineDash([3, 4]);
  for (const boundaryLon of [-90, 90]) {
    const bx = rect.left + ((boundaryLon + 180) / 360) * rect.width;
    ctx.beginPath();
    ctx.moveTo(bx, rect.top);
    ctx.lineTo(bx, rect.top + rect.height);
    ctx.stroke();
  }
  ctx.restore();

  // Explicit crisp Day/Night Terminator curve (where solar incidence == 0)
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.left, rect.top, rect.width, rect.height);
  ctx.clip();
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.9)';
  ctx.lineWidth = 1.6;
  const tanSsl = Math.tan(sslLatR);
  if (Math.abs(subsolarLat) > 0.08) {
    ctx.beginPath();
    for (let lon = -180; lon <= 180; lon += 2) {
      const latRad = Math.atan(-Math.cos(lon * deg2rad - sslLonR) / tanSsl);
      const latDeg = (latRad * 180) / Math.PI;
      const [tx, ty] = latLonToGlobalPx(latDeg, lon, rect);
      if (lon === -180) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty);
    }
    ctx.stroke();
  } else {
    for (const offset of [-90, 90]) {
      const termLon = ((((subsolarLon + offset + 180) % 360) + 360) % 360) - 180;
      const [tx] = latLonToGlobalPx(0, termLon, rect);
      ctx.beginPath();
      ctx.moveTo(tx, rect.top);
      ctx.lineTo(tx, rect.top + rect.height);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Near Side / Far Side labels
  drawPillLabel(ctx, 'Near Side (Earth Facing)', rect.left + rect.width / 2, rect.top - 10, {
    font: FONT_MONO_12,
    fg: '#bae6fd',
    bg: 'rgba(2, 6, 23, 0.78)',
    maxCanvasSize: size,
    align: 'center',
  });
  drawPillLabel(ctx, 'Far Side', rect.left + 8, rect.top - 10, {
    font: FONT_MONO_12,
    fg: '#94a3b8',
    bg: 'rgba(2, 6, 23, 0.78)',
    maxCanvasSize: size,
  });
  drawPillLabel(ctx, 'Far Side', rect.left + rect.width - 8, rect.top - 10, {
    font: FONT_MONO_12,
    fg: '#94a3b8',
    bg: 'rgba(2, 6, 23, 0.78)',
    maxCanvasSize: size,
    align: 'right',
  });

  // Sub-Solar & Sub-Earth markers
  const [ssx, ssy] = latLonToGlobalPx(subsolarLat, subsolarLon, rect);
  ctx.save();
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(ssx, ssy, 5.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#020617';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  const [sex, sey] = latLonToGlobalPx(subearthLat, subearthLon, rect);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(sex, sey, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Draw WP7 candidates as violet diamonds
  for (const c of candidates) {
    const [cx, cy] = latLonToGlobalPx(c.lat, c.lon, rect);
    const isSel = c.id === selectedCandidateId;
    const isHov = c.id === hoveredCandidateId;
    drawDiamond(ctx, cx, cy, isSel || isHov ? 6 : 4.2, '#a78bfa', '#f5f3ff', 1.3);
  }

  // Draw site markers (curated + custom pin)
  const placedBoxes: GlobalLabelBox[] = [];
  const labelCandidates: Array<{ site: SiteData; sx: number; sy: number; priority: number }> = [];

  for (const s of sites) {
    const [sx, sy] = latLonToGlobalPx(s.lat, s.lon, rect);
    const isSel = s.id === selectedSite.id;
    const isCmp = compareSite?.id === s.id;
    const isHov = s.id === hoveredSiteId;

    ctx.save();
    if (isSel) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 8.5, 0, Math.PI * 2);
      ctx.stroke();
    } else if (isCmp) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx, sy, 8, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = s.isCustom ? '#fb7185' : isSel ? '#fbbf24' : isCmp ? '#38bdf8' : s.is_polar_dem ? '#facc15' : '#38bdf8';
    ctx.beginPath();
    ctx.arc(sx, sy, isSel || isCmp || isHov ? 5.2 : 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#020617';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    const priority = isSel ? 4 : isCmp ? 3 : isHov ? 2 : !s.is_polar_dem ? 1 : 0;
    if (priority > 0) {
      labelCandidates.push({ site: s, sx, sy, priority });
    }
  }

  if (selectedSite.isCustom && !sites.some((s) => s.id === selectedSite.id)) {
    const [cx, cy] = latLonToGlobalPx(selectedSite.lat, selectedSite.lon, rect);
    ctx.save();
    ctx.strokeStyle = '#fb7185';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fb7185';
    ctx.beginPath();
    ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    labelCandidates.push({ site: selectedSite, sx: cx, sy: cy, priority: 5 });
  }

  // Anti-overlap smart label placement: always show selected/compare/hovered, show non-polar if clear.
  // Sites near the bottom border (South Pole -85S..-90S) place pills upward above the dot to clear bottom lon ticks.
  labelCandidates.sort((a, b) => b.priority - a.priority);
  for (const item of labelCandidates) {
    const label = item.site.short_name;
    const font = item.priority >= 3 ? FONT_SANS_BOLD_12 : FONT_SANS_12;
    const pillW = measurePillWidth(ctx, label, font);
    const { candidates: anchorCands, maxBottomY } = buildGlobalSiteLabelCandidates(item.sx, item.sy, rect);
    const isMustShow = item.priority >= 2;
    const picked = pickNonOverlappingLabelPlacement(anchorCands, pillW, size, placedBoxes, {
      pad: 3,
      maxBottomY,
      allowFallback: isMustShow,
    });
    if (picked) {
      const box = drawPillLabel(ctx, label, picked.x, picked.y, {
        font,
        fg: item.site.id === selectedSite.id ? '#fef08a' : item.site.id === compareSite?.id ? '#bae6fd' : '#f1f5f9',
        bg: 'rgba(2, 6, 23, 0.85)',
        border:
          item.site.id === selectedSite.id
            ? 'rgba(251, 191, 36, 0.65)'
            : item.site.id === compareSite?.id
              ? 'rgba(56, 189, 248, 0.65)'
              : undefined,
        maxCanvasSize: size,
        align: picked.align,
        maxBottomY,
      });
      placedBoxes.push(box);
    }
  }

  // If a candidate is hovered or selected, label it cleanly (also staying clear of bottom axis ticks)
  const activeCand = candidates.find((c) => c.id === hoveredCandidateId || c.id === selectedCandidateId);
  if (activeCand) {
    const [cx, cy] = latLonToGlobalPx(activeCand.lat, activeCand.lon, rect);
    const candLabel = `Candidate #${activeCand.rank}`;
    const pillW = measurePillWidth(ctx, candLabel, FONT_MONO_BOLD_12);
    const { candidates: anchorCands, maxBottomY } = buildGlobalSiteLabelCandidates(cx, cy, rect);
    const picked = pickNonOverlappingLabelPlacement(anchorCands, pillW, size, placedBoxes, {
      pad: 3,
      maxBottomY,
      allowFallback: true,
    });
    if (picked) {
      placedBoxes.push(
        drawPillLabel(ctx, candLabel, picked.x, picked.y, {
          font: FONT_MONO_BOLD_12,
          fg: '#ede9fe',
          bg: 'rgba(76, 29, 149, 0.9)',
          border: '#c4b5fd',
          maxCanvasSize: size,
          align: picked.align,
          maxBottomY,
        }),
      );
    }
  }

  // Bottom Global Map Key inside canvas bottom margin
  const keyY = Math.min(size - 16, rect.top + rect.height + 34);
  drawPillLabel(ctx, '75°S–90°S Polar DEM Zone', rect.left, keyY, {
    font: FONT_MONO_12,
    fg: '#fcd34d',
    bg: 'rgba(251, 191, 36, 0.14)',
    border: 'rgba(251, 191, 36, 0.4)',
    maxCanvasSize: size,
  });
}

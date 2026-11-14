import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Box,
  Compass,
  Crosshair,
  ExternalLink,
  Globe2,
  Layers,
  Loader2,
  MousePointerClick,
} from 'lucide-react';
import type {
  ArtemisRegion,
  DecodedDemPatch,
  InstantMetrics,
  PolarMapsData,
  SiteCandidate,
  SiteData,
} from '../types/lunar';
import {
  BASELINE_SLOPE_CAPTION,
  buildBackgroundRaster,
  computeOffFrameEdgeIndicator,
  decodePolarMaps,
  EARTH_METHODOLOGY_CAPTION,
  formatLatLonShort,
  formatOffFrameDistanceKm,
  getColorbarCssGradient,
  getGlobalMapRect,
  globalPxToLatLon,
  ILLUSTRATIVE_SHADING_CAPTION,
  isCandidateInPolarFrame,
  isRegionInPolarFrame,
  latLonToGlobalPx,
  samplePolarHoverReadout,
  SOLAR_METHODOLOGY_CAPTION,
  validateProbeInputs,
  type MapMode,
  type PolarLayer,
  type PolarMapHoverReadout,
} from './map/polarMapMath';
import {
  draw2dPolarMap,
  draw3dTerrainMesh,
  drawGlobalLunarMap,
  type PolarCanvasHitTargets,
} from './map/polarMapRender';

export interface PolarMapCanvasProps {
  demPatch: DecodedDemPatch | null;
  sites: SiteData[];
  artemisRegions: ArtemisRegion[];
  selectedSite: SiteData;
  compareSite: SiteData | null;
  instant: InstantMetrics;
  subsolarLat: number;
  subsolarLon: number;
  subearthLat: number;
  subearthLon: number;
  onSelectSite: (siteId: string) => void;
  onCustomPolarClick: (xKm: number, yKm: number) => void;
  onProbeLatLon: (latDeg: number, lonDeg: number) => void;
  polarMaps?: PolarMapsData | null;
  candidates?: SiteCandidate[];
  selectedCandidateId?: string | null;
  onSelectCandidate?: (candidate: SiteCandidate) => void;
  onSelectOffMapGlobal?: () => void;
  customPinLoading?: boolean;
}

export const PolarMapCanvas: React.FC<PolarMapCanvasProps> = ({
  demPatch,
  sites,
  artemisRegions,
  selectedSite,
  compareSite,
  instant,
  subsolarLat,
  subsolarLon,
  subearthLat,
  subearthLon,
  onSelectSite,
  onCustomPolarClick,
  onProbeLatLon,
  polarMaps = null,
  candidates = [],
  selectedCandidateId = null,
  onSelectCandidate,
  onSelectOffMapGlobal,
  customPinLoading = false,
}) => {
  const [mapMode, setMapMode] = useState<MapMode>(selectedSite.is_polar_dem ? 'south_pole' : 'global');
  const [polarLayer, setPolarLayer] = useState<PolarLayer>('hillshade');
  const [showA3Regions, setShowA3Regions] = useState<boolean>(true);
  const [rotAzDeg, setRotAzDeg] = useState<number>(30);
  const [rotPitchDeg, setRotPitchDeg] = useState<number>(36);
  const [vertExag, setVertExag] = useState<number>(10);
  const [latInput, setLatInput] = useState<string>(selectedSite.lat.toFixed(4));
  const [lonInput, setLonInput] = useState<string>(selectedSite.lon.toFixed(4));
  const [probeError, setProbeError] = useState<string | null>(null);
  const [cssSize, setCssSize] = useState<number>(440);
  const [hoverReadout, setHoverReadout] = useState<PolarMapHoverReadout | null>(null);
  const [globalHoverCoords, setGlobalHoverCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [hoveredCandidateId, setHoveredCandidateId] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const hitTargetsRef = useRef<PolarCanvasHitTargets>({ edgeTargets: [] });

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    baseAz: number;
    basePitch: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    baseAz: 30,
    basePitch: 36,
  });

  // Keep Probe inputs synced with selectedSite
  useEffect(() => {
    setLatInput(selectedSite.lat.toFixed(4));
    setLonInput(selectedSite.lon.toFixed(4));
    setProbeError(null);
  }, [selectedSite.id, selectedSite.lat, selectedSite.lon]);

  // Sync map mode when switching between non-DEM global site and polar DEM site
  useEffect(() => {
    if (!selectedSite.is_polar_dem && mapMode !== 'global') {
      setMapMode('global');
    } else if (selectedSite.is_polar_dem && mapMode === 'global') {
      setMapMode('south_pole');
    }
  }, [selectedSite.id, selectedSite.lat, selectedSite.lon, selectedSite.is_polar_dem]);

  // Dynamic HiDPI container width tracking (MAP-6)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setCssSize(Math.max(260, Math.floor(rect.width)));
      }
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Decode polar_maps.json once when loaded
  const decodedPolarMaps = useMemo(() => {
    return polarMaps ? decodePolarMaps(polarMaps) : null;
  }, [polarMaps]);

  const extentKm = demPatch?.extentKm ?? 150;

  // Off-frame indicators for selected & compare sites (MAP-3)
  const offFrameSelected = useMemo(
    () => computeOffFrameEdgeIndicator(selectedSite, extentKm),
    [selectedSite, extentKm],
  );
  const offFrameCompare = useMemo(
    () => (compareSite ? computeOffFrameEdgeIndicator(compareSite, extentKm) : null),
    [compareSite, extentKm],
  );

  // Out-of-frame Artemis III 2024 regions for legend disclosure (MAP-3 / WP3-B8)
  const outOfFrameArtemis = useMemo(
    () => artemisRegions.filter((r) => !isRegionInPolarFrame(r, extentKm)),
    [artemisRegions, extentKm],
  );

  // Precompute 2D DEM/computed raster purely from demPatch, polarLayer, subsolarLon, subearthLon, polarMaps (MAP-1 / MAP-2)
  const subsolarQuantized = Math.round(subsolarLon / 5) * 5;
  const subearthQuantized = Math.round(subearthLon / 5) * 5;
  useEffect(() => {
    if (!demPatch || typeof document === 'undefined') return;
    const raster = buildBackgroundRaster(
      demPatch,
      polarLayer,
      subsolarQuantized,
      subearthQuantized,
      decodedPolarMaps,
    );
    const off = document.createElement('canvas');
    off.width = raster.width;
    off.height = raster.height;
    const octx = off.getContext('2d');
    if (octx) {
      const imgData = octx.createImageData(raster.width, raster.height);
      imgData.data.set(raster.rgba);
      octx.putImageData(imgData, 0, 0);
      bgCanvasRef.current = off;
    }
  }, [demPatch, polarLayer, subsolarQuantized, subearthQuantized, decodedPolarMaps]);

  // Render active canvas mode at full devicePixelRatio crispness
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 3) : 1;
    const targetW = Math.round(cssSize * dpr);
    const targetH = Math.round(cssSize * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssSize, cssSize);

    if (mapMode === 'south_pole') {
      hitTargetsRef.current = draw2dPolarMap({
        ctx,
        size: cssSize,
        demPatch,
        bgCanvas: bgCanvasRef.current,
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
      });
    } else if (mapMode === 'terrain_3d') {
      hitTargetsRef.current = { edgeTargets: [] };
      draw3dTerrainMesh({
        ctx,
        size: cssSize,
        demPatch,
        polarMaps: decodedPolarMaps,
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
      });
    } else {
      hitTargetsRef.current = { edgeTargets: [] };
      drawGlobalLunarMap({
        ctx,
        size: cssSize,
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
      });
    }
    ctx.restore();
  }, [
    cssSize,
    mapMode,
    demPatch,
    decodedPolarMaps,
    polarLayer,
    showA3Regions,
    sites,
    artemisRegions,
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
    instant,
    rotAzDeg,
    rotPitchDeg,
    vertExag,
  ]);

  const getLocalCssCoords = (e: React.PointerEvent<HTMLCanvasElement> | React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const px = ((e.clientX - rect.left) / rect.width) * cssSize;
    const py = ((e.clientY - rect.top) / rect.height) * cssSize;
    return { px, py };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mapMode !== 'terrain_3d') return;
    if (typeof e.currentTarget.setPointerCapture === 'function') {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Synthetic events in tests may not provide an active pointerId
      }
    }
    dragRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      baseAz: rotAzDeg,
      basePitch: rotPitchDeg,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mapMode === 'terrain_3d') {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      if (Math.hypot(dx, dy) > 3) dragRef.current.moved = true;
      setRotAzDeg((dragRef.current.baseAz + dx * 0.5 + 360) % 360);
      setRotPitchDeg(Math.max(12, Math.min(80, dragRef.current.basePitch - dy * 0.4)));
      return;
    }

    const pt = getLocalCssCoords(e);
    if (!pt) return;
    const { px, py } = pt;

    if (mapMode === 'south_pole') {
      const xKm = (px / cssSize) * (2 * extentKm) - extentKm;
      const yKm = extentKm - (py / cssSize) * (2 * extentKm);

      if (demPatch) {
        setHoverReadout(samplePolarHoverReadout(demPatch, xKm, yKm, polarLayer, decodedPolarMaps));
      }

      // Check hover over site or candidate
      let hitSite: string | null = null;
      let bestSiteD = 12;
      for (const s of sites) {
        if (!s.is_polar_dem || s.polar_x_km === null || s.polar_y_km === null) continue;
        if (Math.abs(s.polar_x_km) > extentKm || Math.abs(s.polar_y_km) > extentKm) continue;
        const sx = ((s.polar_x_km + extentKm) / (2 * extentKm)) * cssSize;
        const sy = ((extentKm - s.polar_y_km) / (2 * extentKm)) * cssSize;
        const d = Math.hypot(px - sx, py - sy);
        if (d < bestSiteD) {
          bestSiteD = d;
          hitSite = s.id;
        }
      }
      if (!hitSite) {
        for (const t of hitTargetsRef.current.edgeTargets) {
          if (Math.hypot(px - t.px, py - t.py) < 18) {
            hitSite = t.siteId;
            break;
          }
        }
      }
      setHoveredSiteId(hitSite);

      let hitCand: string | null = null;
      if (!hitSite) {
        let bestCandD = 12;
        for (const c of candidates) {
          if (!isCandidateInPolarFrame(c, extentKm)) continue;
          const cx = ((c.xKm + extentKm) / (2 * extentKm)) * cssSize;
          const cy = ((extentKm - c.yKm) / (2 * extentKm)) * cssSize;
          const d = Math.hypot(px - cx, py - cy);
          if (d < bestCandD) {
            bestCandD = d;
            hitCand = c.id;
          }
        }
      }
      setHoveredCandidateId(hitCand);
    } else if (mapMode === 'global') {
      const rect = getGlobalMapRect(cssSize);
      setGlobalHoverCoords(globalPxToLatLon(px, py, rect));

      let hitSite: string | null = null;
      let bestSiteD = 14;
      for (const s of sites) {
        const [sx, sy] = latLonToGlobalPx(s.lat, s.lon, rect);
        const d = Math.hypot(px - sx, py - sy);
        if (d < bestSiteD) {
          bestSiteD = d;
          hitSite = s.id;
        }
      }
      setHoveredSiteId(hitSite);

      let hitCand: string | null = null;
      if (!hitSite) {
        let bestCandD = 14;
        for (const c of candidates) {
          const [cx, cy] = latLonToGlobalPx(c.lat, c.lon, rect);
          const d = Math.hypot(px - cx, py - cy);
          if (d < bestCandD) {
            bestCandD = d;
            hitCand = c.id;
          }
        }
      }
      setHoveredCandidateId(hitCand);
    }
  };

  const handlePointerEndOrLeave = () => {
    dragRef.current.active = false;
    setHoverReadout(null);
    setGlobalHoverCoords(null);
    setHoveredSiteId(null);
    setHoveredCandidateId(null);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mapMode === 'terrain_3d') return;
    const pt = getLocalCssCoords(e);
    if (!pt) return;
    const { px, py } = pt;

    if (mapMode === 'south_pole') {
      const xKm = (px / cssSize) * (2 * extentKm) - extentKm;
      const yKm = extentKm - (py / cssSize) * (2 * extentKm);

      let nearestSite: SiteData | null = null;
      let nearestSiteDist = 12;
      for (const s of sites) {
        if (!s.is_polar_dem || s.polar_x_km === null || s.polar_y_km === null) continue;
        if (Math.abs(s.polar_x_km) > extentKm || Math.abs(s.polar_y_km) > extentKm) continue;
        const sx = ((s.polar_x_km + extentKm) / (2 * extentKm)) * cssSize;
        const sy = ((extentKm - s.polar_y_km) / (2 * extentKm)) * cssSize;
        const d = Math.hypot(px - sx, py - sy);
        if (d < nearestSiteDist) {
          nearestSiteDist = d;
          nearestSite = s;
        }
      }

      let nearestCandidate: SiteCandidate | null = null;
      let nearestCandDist = 12;
      for (const c of candidates) {
        if (!isCandidateInPolarFrame(c, extentKm)) continue;
        const cx = ((c.xKm + extentKm) / (2 * extentKm)) * cssSize;
        const cy = ((extentKm - c.yKm) / (2 * extentKm)) * cssSize;
        const d = Math.hypot(px - cx, py - cy);
        if (d < nearestCandDist) {
          nearestCandDist = d;
          nearestCandidate = c;
        }
      }

      if (nearestSite && (!nearestCandidate || nearestSiteDist <= nearestCandDist)) {
        onSelectSite(nearestSite.id);
        return;
      }
      if (nearestCandidate) {
        if (onSelectCandidate) {
          onSelectCandidate(nearestCandidate);
        } else {
          onProbeLatLon(nearestCandidate.lat, nearestCandidate.lon);
        }
        return;
      }

      for (const t of hitTargetsRef.current.edgeTargets) {
        if (Math.hypot(px - t.px, py - t.py) < 18) {
          onSelectSite(t.siteId);
          return;
        }
      }

      onCustomPolarClick(xKm, yKm);
    } else {
      const rect = getGlobalMapRect(cssSize);
      let nearestSite: SiteData | null = null;
      let nearestSiteDist = 14;
      for (const s of sites) {
        const [sx, sy] = latLonToGlobalPx(s.lat, s.lon, rect);
        const d = Math.hypot(px - sx, py - sy);
        if (d < nearestSiteDist) {
          nearestSiteDist = d;
          nearestSite = s;
        }
      }

      let nearestCandidate: SiteCandidate | null = null;
      let nearestCandDist = 14;
      for (const c of candidates) {
        const [cx, cy] = latLonToGlobalPx(c.lat, c.lon, rect);
        const d = Math.hypot(px - cx, py - cy);
        if (d < nearestCandDist) {
          nearestCandDist = d;
          nearestCandidate = c;
        }
      }

      if (nearestSite && (!nearestCandidate || nearestSiteDist <= nearestCandDist)) {
        onSelectSite(nearestSite.id);
        return;
      }
      if (nearestCandidate) {
        if (onSelectCandidate) {
          onSelectCandidate(nearestCandidate);
        } else {
          onProbeLatLon(nearestCandidate.lat, nearestCandidate.lon);
        }
        return;
      }

      const coords = globalPxToLatLon(px, py, rect);
      if (coords) {
        setProbeError(null);
        onProbeLatLon(coords.lat, coords.lon);
      }
    }
  };

  const handleCanvasKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (mapMode !== 'terrain_3d') return;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setRotAzDeg((az) => (az - 10 + 360) % 360);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      setRotAzDeg((az) => (az + 10) % 360);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setRotPitchDeg((p) => Math.max(12, p - 6));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setRotPitchDeg((p) => Math.min(80, p + 6));
    } else if (e.key === 'Home' || e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      setRotAzDeg(30);
      setRotPitchDeg(36);
      setVertExag(10);
    }
  };

  const handleProbeSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const res = validateProbeInputs(latInput, lonInput);
    if (!res.valid) {
      setProbeError(res.error);
      return;
    }
    setProbeError(null);
    onProbeLatLon(res.lat, res.lon);
  };

  const layerLabel = (layer: PolarLayer): string => {
    if (layer === 'hillshade') return 'DEM';
    if (layer === 'solar_heatmap') return decodedPolarMaps ? 'Sun Map (%)' : 'Sun-facing (illustrative)';
    if (layer === 'earth_heatmap') return decodedPolarMaps ? 'Earth Map (%)' : 'Earth-facing (illustrative)';
    return 'Slope <= 5° (240 m baseline)';
  };

  const canvasAriaLabel = useMemo(() => {
    const modeLabel =
      mapMode === 'south_pole'
        ? '2D South Pole stereographic map'
        : mapMode === 'terrain_3d'
          ? '3D South Pole terrain mesh'
          : 'Global lunar day/night terminator map';
    const layerText = mapMode === 'global' ? 'solar terminator and landing sites' : layerLabel(polarLayer);
    const siteCoord = formatLatLonShort(selectedSite.lat, selectedSite.lon);
    const cmpText = compareSite ? ` Comparing with ${compareSite.short_name}.` : '';
    const interaction =
      mapMode === 'terrain_3d'
        ? 'Drag or use arrow keys to rotate 3D mesh, press Home or R to reset.'
        : 'Click a site marker or terrain coordinate to inspect.';
    return `${modeLabel} showing ${layerText}. Selected site: ${selectedSite.name} at ${siteCoord}.${cmpText} ${interaction}`;
  }, [mapMode, polarLayer, decodedPolarMaps, selectedSite, compareSite]);

  return (
    <div className="nasa-panel rounded-2xl p-4 shadow-2xl">
      {/* Header & Map Mode Selector */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Compass className="h-4 w-4 shrink-0 text-amber-400" />
          <h2 className="text-sm font-semibold tracking-wide text-slate-100">
            {mapMode === 'south_pole'
              ? `South Pole LOLA Topography (±${extentKm} km)`
              : mapMode === 'terrain_3d'
                ? `3D South Pole LOLA Terrain Mesh (±${extentKm} km)`
                : 'Global Lunar Terminator & Sites'}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-700/60 bg-slate-950/75 p-1">
          <button
            type="button"
            onClick={() => setMapMode('south_pole')}
            className={`flex min-h-[28px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              mapMode === 'south_pole'
                ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
            }`}
          >
            <Compass className="h-3.5 w-3.5" /> 2D Pole
          </button>
          <button
            type="button"
            onClick={() => setMapMode('terrain_3d')}
            className={`flex min-h-[28px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              mapMode === 'terrain_3d'
                ? 'bg-emerald-500/25 text-emerald-200 ring-1 ring-emerald-400/50 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
            }`}
          >
            <Box className="h-3.5 w-3.5" /> 3D Mesh
          </button>
          <button
            type="button"
            onClick={() => setMapMode('global')}
            className={`flex min-h-[28px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              mapMode === 'global'
                ? 'bg-sky-500/25 text-sky-200 ring-1 ring-sky-400/50 shadow-sm'
                : 'text-slate-300 hover:bg-slate-800/70 hover:text-slate-100'
            }`}
          >
            <Globe2 className="h-3.5 w-3.5" /> Global
          </button>
        </div>
      </div>

      {/* Polar Layer Controls */}
      {(mapMode === 'south_pole' || mapMode === 'terrain_3d') && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            {(
              [
                ['hillshade', 'bg-slate-700 text-slate-100'],
                ['solar_heatmap', 'bg-amber-500/25 text-amber-300 ring-1 ring-amber-500/40'],
                ['earth_heatmap', 'bg-sky-500/25 text-sky-300 ring-1 ring-sky-500/40'],
                ['slope_safety', 'bg-emerald-500/25 text-emerald-300 ring-1 ring-emerald-500/40'],
              ] as const
            ).map(([key, activeCls]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPolarLayer(key)}
                className={`min-h-[26px] rounded px-2 py-0.5 text-xs transition ${
                  polarLayer === key ? activeCls : 'bg-slate-800/80 text-slate-300 hover:text-slate-100'
                }`}
              >
                {layerLabel(key)}
              </button>
            ))}
          </div>

          {mapMode === 'south_pole' ? (
            <label className="flex min-h-[26px] cursor-pointer items-center gap-1.5 text-xs text-slate-300">
              <input
                id="toggle-a3-regions"
                name="toggle-a3-regions"
                type="checkbox"
                checked={showA3Regions}
                onChange={(e) => setShowA3Regions(e.target.checked)}
                className="h-3.5 w-3.5 accent-sky-400"
              />
              Artemis III
            </label>
          ) : (
            <div className="flex items-center gap-1 font-mono text-xs">
              {[5, 10, 15].map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setVertExag(ex)}
                  className={`min-h-[26px] rounded px-2 py-0.5 text-xs ${
                    vertExag === ex ? 'bg-emerald-500/25 text-emerald-300' : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {ex}×
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setRotAzDeg(30);
                  setRotPitchDeg(36);
                  setVertExag(10);
                }}
                className="min-h-[26px] rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-200 hover:border-amber-400/50 hover:text-amber-300"
                title="Reset 3D camera orientation (Home or R)"
              >
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      {/* Off-Frame Site Directional Banner + Clickable View on Global Badge (MAP-3) */}
      {(mapMode === 'south_pole' || mapMode === 'terrain_3d') && (offFrameSelected || offFrameCompare) && (
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-950/35 px-2.5 py-2 text-xs text-amber-100">
          <div className="space-y-0.5">
            {offFrameSelected && (
              <div>
                <span className="font-semibold text-amber-300">{offFrameSelected.site.short_name}</span> is{' '}
                <span className="font-mono">{formatOffFrameDistanceKm(offFrameSelected.distanceBeyondEdgeKm)}</span>{' '}
                beyond the ±{extentKm} km frame ({formatLatLonShort(offFrameSelected.site.lat, offFrameSelected.site.lon)}) — follow the amber edge arrow.
              </div>
            )}
            {offFrameCompare && (
              <div>
                Compare site <span className="font-semibold text-sky-300">{offFrameCompare.site.short_name}</span> is{' '}
                <span className="font-mono">{formatOffFrameDistanceKm(offFrameCompare.distanceBeyondEdgeKm)}</span>{' '}
                beyond frame edge ({formatLatLonShort(offFrameCompare.site.lat, offFrameCompare.site.lon)}).
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setMapMode('global');
              onSelectOffMapGlobal?.();
            }}
            className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-md border border-sky-400/50 bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-sky-200 hover:bg-sky-500/30 transition"
          >
            <ExternalLink className="h-3.5 w-3.5" /> View on Global
          </button>
        </div>
      )}

      {/* HiDPI Interactive Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-sky-500/25 bg-[#03060f] shadow-[inset_0_0_30px_rgba(2,6,23,0.9)]"
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={canvasAriaLabel}
          tabIndex={0}
          onClick={handleCanvasClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEndOrLeave}
          onPointerCancel={handlePointerEndOrLeave}
          onPointerLeave={handlePointerEndOrLeave}
          onKeyDown={handleCanvasKeyDown}
          className={`aspect-square w-full block focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            mapMode === 'terrain_3d' ? 'cursor-grab active:cursor-grabbing touch-none' : 'cursor-crosshair'
          }`}
          title={
            mapMode === 'south_pole'
              ? 'Click a site, candidate diamond, edge arrow, or blank terrain to ray-march live!'
              : mapMode === 'terrain_3d'
                ? 'Drag, touch, or use Arrow keys to rotate the 3D South Pole mesh (Home/R to reset)'
                : 'Click a marker to select, or click anywhere on the lunar globe to probe coordinates!'
          }
        />

        {customPinLoading && (
          <div className="pointer-events-none absolute right-2.5 top-2.5 flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-slate-950/90 px-2.5 py-1 text-xs text-amber-200 shadow">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />
            Loading 240 m DEM...
          </div>
        )}
      </div>

      {/* Interaction Hint & Live Hover Telemetry */}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-300">
        <span className="flex items-center gap-1.5 text-amber-300/95">
          <MousePointerClick className="h-3.5 w-3.5 shrink-0" />
          {mapMode === 'south_pole'
            ? 'Click terrain to ray-march 360° horizon · Violet diamonds = WP7 candidates'
            : mapMode === 'terrain_3d'
              ? 'Drag, touch, or press Arrow keys to orbit 3D view (Home/R resets)'
              : 'Click anywhere on globe to probe · Amber dot = Sub-Solar, Cyan ring = Sub-Earth'}
        </span>
        {mapMode === 'south_pole' && hoverReadout && (
          <span className="font-mono text-xs text-slate-200">
            {formatLatLonShort(hoverReadout.latDeg, hoverReadout.lonDeg)} · {Math.round(hoverReadout.elevM)} m ·{' '}
            {hoverReadout.slopeDeg.toFixed(1)}°
            {hoverReadout.valuePct !== null && (
              <span className="ml-1.5 font-semibold text-amber-300">
                · {polarLayer === 'solar_heatmap' ? 'Sun' : 'Earth'}: {hoverReadout.valuePct}%
                {hoverReadout.sunVisiblePct !== null && polarLayer === 'solar_heatmap'
                  ? ` (disk ${hoverReadout.sunVisiblePct}%)`
                  : ''}
              </span>
            )}
            {hoverReadout.isNoData &&
              (polarLayer === 'solar_heatmap' || polarLayer === 'earth_heatmap') &&
              decodedPolarMaps && <span className="ml-1.5 text-slate-400">· No data (255)</span>}
          </span>
        )}
        {mapMode === 'global' && globalHoverCoords && (
          <span className="font-mono text-xs text-slate-200">
            Cursor: {formatLatLonShort(globalHoverCoords.lat, globalHoverCoords.lon)}
          </span>
        )}
      </div>

      {/* Layer Legend / Colorbar / Methodology Caption (MAP-2 & SCI-6) */}
      {(mapMode === 'south_pole' || mapMode === 'terrain_3d') &&
        (polarLayer === 'solar_heatmap' || polarLayer === 'earth_heatmap') && (
          <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/80 p-2.5 text-xs space-y-1.5">
            {decodedPolarMaps ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-slate-200">
                    {polarLayer === 'solar_heatmap'
                      ? 'Computed Sun Time (% of hours with any solar disk visible)'
                      : 'Computed Earth DTE Visibility (% of hours Earth center visible)'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-slate-300">
                    <span className="inline-block h-3 w-3 rounded border border-slate-600 bg-[#161b26]" />
                    No data (255)
                  </span>
                </div>
                <div className="space-y-1">
                  <div
                    className="h-3 w-full rounded border border-slate-700"
                    style={{ background: getColorbarCssGradient(polarLayer) }}
                  />
                  <div className="flex justify-between font-mono text-xs text-slate-300">
                    <span>0%</span>
                    <span>25%</span>
                    <span>50%</span>
                    <span>75%</span>
                    <span>100%</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  {polarLayer === 'solar_heatmap' ? SOLAR_METHODOLOGY_CAPTION : EARTH_METHODOLOGY_CAPTION}
                </p>
              </>
            ) : (
              <p className="text-xs text-amber-200/95">{ILLUSTRATIVE_SHADING_CAPTION}</p>
            )}
          </div>
        )}

      {(mapMode === 'south_pole' || mapMode === 'terrain_3d') && polarLayer === 'slope_safety' && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-2 text-xs text-emerald-200">
          {BASELINE_SLOPE_CAPTION}
        </div>
      )}

      {/* Out-of-Frame Artemis III 2024 Regions Legend (MAP-3 / WP3-B8) */}
      {mapMode === 'south_pole' && showA3Regions && outOfFrameArtemis.length > 0 && (
        <div className="mt-2 rounded-lg border border-slate-800 bg-slate-950/75 px-2.5 py-2 text-xs text-sky-200/90">
          <span className="font-semibold text-sky-300">Out-of-frame Artemis III 2024 regions:</span>{' '}
          {outOfFrameArtemis.map((r) => `${r.code} (${r.region})`).join(', ')}
        </div>
      )}

      {/* Coordinate Probe & Inline Validation (UX-4) */}
      <div className="nasa-panel-subtle mt-3 rounded-xl p-2.5 space-y-2">
        <form noValidate onSubmit={handleProbeSubmit} className="flex flex-wrap items-center gap-2 text-xs">
          <span className="flex items-center gap-1 text-xs font-medium text-slate-200">
            <Crosshair className="h-3.5 w-3.5 text-amber-400" /> Probe:
          </span>
          <label htmlFor="probe-lat" className="sr-only">
            Latitude degrees (-90 to +90)
          </label>
          <input
            id="probe-lat"
            name="probe-lat"
            type="text"
            inputMode="decimal"
            value={latInput}
            onChange={(e) => {
              setLatInput(e.target.value);
              if (probeError) setProbeError(null);
            }}
            aria-label="Latitude degrees"
            aria-invalid={probeError !== null}
            className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
            placeholder="Lat (-90..90)"
          />
          <label htmlFor="probe-lon" className="sr-only">
            Longitude degrees (-180 to +180)
          </label>
          <input
            id="probe-lon"
            name="probe-lon"
            type="text"
            inputMode="decimal"
            value={lonInput}
            onChange={(e) => {
              setLonInput(e.target.value);
              if (probeError) setProbeError(null);
            }}
            aria-label="Longitude degrees"
            aria-invalid={probeError !== null}
            className="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-xs text-slate-100 focus:border-amber-400 focus:outline-none"
            placeholder="Lon (-180..180)"
          />
          <button
            type="submit"
            className="min-h-[28px] rounded bg-amber-500/20 px-3 py-1 text-xs font-semibold text-amber-300 ring-1 ring-amber-500/40 hover:bg-amber-500/30 transition"
          >
            Go
          </button>
        </form>

        {probeError && (
          <div
            role="alert"
            className="flex items-center gap-1.5 rounded border border-rose-500/50 bg-rose-950/40 px-2.5 py-1.5 text-xs text-rose-200"
          >
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-400" />
            <span>{probeError}</span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-400">Quick tests:</span>
          {(
            [
              ['90°S Pole', -90, 0],
              ['Ridge #1', -89.45, -137.31],
              ['Outside DEM (-70°S)', -70, 15],
            ] as const
          ).map(([label, tLat, tLon]) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                setProbeError(null);
                onProbeLatLon(tLat, tLon);
              }}
              className="min-h-[26px] rounded border border-slate-700 bg-slate-900 px-2 py-0.5 font-mono text-xs text-slate-200 hover:border-amber-400/50 hover:text-amber-300 transition"
            >
              {label}
            </button>
          ))}
        </div>

        {!selectedSite.is_polar_dem && (
          <div className="rounded border border-amber-500/40 bg-amber-950/30 px-2.5 py-1.5 text-xs text-amber-200">
            No terrain data (Outside LOLA Polar DEM) — Using spherical horizon dip (-acos(R / (R + mast)))
          </div>
        )}
      </div>
    </div>
  );
};

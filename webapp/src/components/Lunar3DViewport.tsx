import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Camera,
  ChevronDown,
  ChevronUp,
  Compass,
  Crosshair,
  Eye,
  Flashlight,
  Layers,
  MapPin,
  Navigation,
  Octagon,
  Orbit,
  Radio,
  Rocket,
  Sparkles,
  Sun,
  X,
} from 'lucide-react';
import {
  buildAstronomicalStarBuffers,
  buildConstellationLinePositions,
  computeIcrsToThreeSkyMatrixRowMajor,
  ephemerisStepUtcIso,
  raDecToUnitVec,
  utcIsoToJulianDate,
} from '../lib/celestialSky';
import {
  SKY_GUIDE_ANCHORS,
  createAstronomicalStarField,
  createDeepSkyGroup,
  createMilkyWayDomeMesh,
  createRealisticEarthGlobe,
  createSolarRaysTexture,
} from '../lib/celestialShaders';
import {
  getArtemisPolarRingsKm,
  isRegionInPolarFrame,
  decodePolarMaps,
  samplePolarMapCell,
  valueToEarthRgb,
  valueToSolarRgb,
  type DecodedPolarMaps,
} from './map/polarMapMath';
import {
  bodyAzElToThreeDir,
  clampRoverCoordKm,
  polarToThreeCoords,
  sampleTerrainHeightAndNormal,
  stepRoverPhysics,
  type RoverControls,
  type RoverGearMultiplier,
  type RoverLiveTelemetry,
  type RoverState,
  type TerrainCameraMode,
} from '../lib/roverPhysics';
import type {
  ArtemisRegion,
  ClientDemBundle,
  ComputeOptions,
  DecodedDemPatch,
  EphemerisData,
  PolarMapsData,
  SiteData,
} from '../types/lunar';

export type SurfaceOverlayLayer = 'regolith' | 'sun' | 'earth' | 'slope' | 'composite';

export interface Lunar3DViewportProps {
  ephemeris: EphemerisData;
  timeIdx: number;
  mastHeightM: number;
  sites: SiteData[];
  selectedSite: SiteData;
  compareSite?: SiteData | null;
  artemisRegions?: ArtemisRegion[];
  demPatch: DecodedDemPatch | null;
  clientDem: ClientDemBundle | null;
  polarMaps?: PolarMapsData | null;
  activeLayer: SurfaceOverlayLayer;
  onChangeLayer?: (layer: SurfaceOverlayLayer) => void;
  roverState: RoverState;
  onRoverStateChange: (nextState: RoverState) => void;
  roverTelemetry: RoverLiveTelemetry;
  cameraMode: TerrainCameraMode;
  onCameraModeChange?: (mode: TerrainCameraMode) => void;
  verticalExaggeration?: number;
  onSelectSite?: (siteId: string) => void;
  onDeployRoverToSite?: (site: SiteData) => void;
  computeOptions?: ComputeOptions;
  className?: string;
}

const TERRAIN_SEG_N = 360;
const TERRAIN_EXTENT_KM = 150.0;
const DEG2RAD = Math.PI / 180.0;

const LAYER_OPTIONS: Array<{ id: SurfaceOverlayLayer; label: string }> = [
  { id: 'regolith', label: 'Regolith' },
  { id: 'sun', label: 'Sun' },
  { id: 'earth', label: 'Earth' },
  { id: 'slope', label: 'Slope' },
  { id: 'composite', label: 'Composite' },
];

const CAMERA_OPTIONS: Array<{ id: TerrainCameraMode; label: string }> = [
  { id: 'chase', label: 'Chase' },
  { id: 'mast', label: 'Mast POV' },
  { id: 'orbit', label: 'Orbit' },
  { id: 'free', label: 'Free Cam' },
];

const GEAR_OPTIONS: RoverGearMultiplier[] = [1, 10, 50, 250, 1000];

function seededRandom(seedObj: { s: number }): number {
  seedObj.s = (seedObj.s * 1664525 + 1013904223) >>> 0;
  return seedObj.s / 4294967296;
}

function createGlowTexture(innerHex: string, midHex: string): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const g = ctx.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0.0, innerHex);
  g.addColorStop(0.28, midHex);
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createRegolithDetailTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const rng = { s: 91827364 };
  for (let i = 0; i < size * size; i++) {
    const n1 = seededRandom(rng);
    const n2 = seededRandom(rng);
    const val = Math.round(112 + (n1 - 0.5) * 34 + (n2 - 0.5) * 18);
    const idx = i * 4;
    data[idx] = val;
    data[idx + 1] = val;
    data[idx + 2] = Math.min(255, val + 4);
    data[idx + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(56, 56);
  tex.needsUpdate = true;
  return tex;
}

interface RoverRigRefs {
  root: THREE.Group;
  bodyTilt: THREE.Group;
  wheels: THREE.Mesh[];
  frontSteerPivots: THREE.Group[];
  rearSteerPivots: THREE.Group[];
  solarYaw: THREE.Group;
  solarPitch: THREE.Group;
  dishYaw: THREE.Group;
  dishPitch: THREE.Group;
  dteBeam: THREE.Mesh;
  mastPole: THREE.Mesh;
  mastHead: THREE.Group;
  beaconMesh: THREE.Mesh;
  headlightLeft: THREE.SpotLight;
  headlightRight: THREE.SpotLight;
  headlightCones: THREE.Mesh[];
  locatorRing: THREE.Mesh;
  thrusterPlumes: THREE.Mesh[];
  thrusterLight: THREE.PointLight;
}

function buildRoverRig(scene: THREE.Scene): RoverRigRefs {
  const root = new THREE.Group();
  const bodyTilt = new THREE.Group();
  root.add(bodyTilt);

  const goldMliMat = new THREE.MeshStandardMaterial({
    color: '#eab308',
    metalness: 0.72,
    roughness: 0.32,
  });
  const chassisDarkMat = new THREE.MeshStandardMaterial({
    color: '#1e293b',
    metalness: 0.55,
    roughness: 0.45,
  });
  const titaniumMat = new THREE.MeshStandardMaterial({
    color: '#94a3b8',
    metalness: 0.75,
    roughness: 0.3,
  });
  const tireMat = new THREE.MeshStandardMaterial({
    color: '#334155',
    metalness: 0.28,
    roughness: 0.85,
  });

  // Main insulated rover chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.34, 1.42), goldMliMat);
  chassis.position.set(0, 0.48, 0);
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyTilt.add(chassis);

  // Top avionics deck
  const deck = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.08, 1.48), chassisDarkMat);
  deck.position.set(0, 0.67, 0);
  deck.castShadow = true;
  bodyTilt.add(deck);

  // Rear MMRTG / thermal radiator fins
  const rtg = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.46, 12), titaniumMat);
  rtg.rotation.z = Math.PI * 0.5;
  rtg.position.set(0, 0.52, 0.78);
  rtg.castShadow = true;
  bodyTilt.add(rtg);

  // 6 Rocker-bogie wheels & suspension struts
  const wheels: THREE.Mesh[] = [];
  const frontSteerPivots: THREE.Group[] = [];
  const rearSteerPivots: THREE.Group[] = [];
  const wheelZPositions = [-0.68, 0.0, 0.68];
  const wheelSides = [-0.6, 0.6];

  for (const sideX of wheelSides) {
    const rockerBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.38), titaniumMat);
    rockerBar.position.set(sideX * 0.84, 0.36, 0);
    bodyTilt.add(rockerBar);

    for (let wi = 0; wi < wheelZPositions.length; wi++) {
      const zPos = wheelZPositions[wi];
      const steerPivot = new THREE.Group();
      steerPivot.position.set(sideX, 0.24, zPos);
      bodyTilt.add(steerPivot);

      if (wi === 0) frontSteerPivots.push(steerPivot);
      if (wi === 2) rearSteerPivots.push(steerPivot);

      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 0.06), titaniumMat);
      strut.position.set(sideX > 0 ? -0.1 : 0.1, 0.1, 0);
      steerPivot.add(strut);

      const tireGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.2, 16);
      tireGeo.rotateZ(Math.PI * 0.5);
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      steerPivot.add(tire);

      // Metallic hub + tread cleat bar so rotation is visibly crisp
      const hub = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.36, 0.05),
        titaniumMat,
      );
      tire.add(hub);

      wheels.push(tire);
    }
  }

  // Sun-tracking solar array wing
  const solarYaw = new THREE.Group();
  solarYaw.position.set(-0.22, 0.72, 0.3);
  bodyTilt.add(solarYaw);

  const solarPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.26, 8), titaniumMat);
  solarPost.position.set(0, 0.13, 0);
  solarYaw.add(solarPost);

  const solarPitch = new THREE.Group();
  solarPitch.position.set(0, 0.26, 0);
  solarYaw.add(solarPitch);

  const solarPanelMat = new THREE.MeshStandardMaterial({
    color: '#1d4ed8',
    emissive: '#0f172a',
    metalness: 0.45,
    roughness: 0.25,
  });
  const solarWing = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.03, 0.58), solarPanelMat);
  solarWing.castShadow = true;
  solarPitch.add(solarWing);

  const solarFrame = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 0.02, 0.62),
    titaniumMat,
  );
  solarFrame.position.y = -0.015;
  solarPitch.add(solarFrame);

  // Earth-aimed high-gain parabolic dish + glowing cyan DTE beam
  const dishYaw = new THREE.Group();
  dishYaw.position.set(-0.24, 0.72, -0.18);
  bodyTilt.add(dishYaw);

  const dishPost = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.24, 8), titaniumMat);
  dishPost.position.set(0, 0.12, 0);
  dishYaw.add(dishPost);

  const dishPitch = new THREE.Group();
  dishPitch.position.set(0, 0.24, 0);
  dishYaw.add(dishPitch);

  const dishProfile = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.14, 0.03),
    new THREE.Vector2(0.28, 0.1),
    new THREE.Vector2(0.36, 0.18),
  ];
  const dishGeo = new THREE.LatheGeometry(dishProfile, 18);
  dishGeo.rotateX(Math.PI * 0.5);
  const dishMat = new THREE.MeshStandardMaterial({
    color: '#e2e8f0',
    metalness: 0.35,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });
  const dishMesh = new THREE.Mesh(dishGeo, dishMat);
  dishPitch.add(dishMesh);

  const feedHorn = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.24, 8), goldMliMat);
  feedHorn.rotation.x = Math.PI * 0.5;
  feedHorn.position.set(0, 0, 0.14);
  dishPitch.add(feedHorn);

  const beamGeo = new THREE.CylinderGeometry(0.03, 0.42, 14.0, 12, 1, true);
  beamGeo.rotateX(Math.PI * 0.5);
  beamGeo.translate(0, 0, 7.2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const dteBeam = new THREE.Mesh(beamGeo, beamMat);
  dishPitch.add(dteBeam);

  // Extendable Mast + Stereo NavCam + Status Beacon
  const mastPole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 1.0, 10), titaniumMat);
  mastPole.position.set(0.2, 1.15, -0.45);
  mastPole.castShadow = true;
  bodyTilt.add(mastPole);

  const mastHead = new THREE.Group();
  mastHead.position.set(0.2, 1.65, -0.45);
  bodyTilt.add(mastHead);

  const camBar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.12, 0.16), titaniumMat);
  mastHead.add(camBar);

  const lensMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
  const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.04, 10), lensMat);
  lensL.rotation.x = Math.PI * 0.5;
  lensL.position.set(-0.1, 0, -0.09);
  const lensR = lensL.clone();
  lensR.position.set(0.1, 0, -0.09);
  mastHead.add(lensL, lensR);

  const beaconMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 10, 10),
    new THREE.MeshBasicMaterial({ color: '#fbbf24' }),
  );
  beaconMesh.position.set(0, 0.11, 0);
  mastHead.add(beaconMesh);

  // PSR Headlights (SpotLights + additive volumetric cones)
  const headlightLeft = new THREE.SpotLight('#fef3c7', 0, 18, Math.PI / 5, 0.5, 1.4);
  headlightLeft.position.set(-0.28, 0.56, -0.72);
  const targetLeft = new THREE.Object3D();
  targetLeft.position.set(-0.32, -0.25, -4.5);
  bodyTilt.add(headlightLeft, targetLeft);
  headlightLeft.target = targetLeft;

  const headlightRight = new THREE.SpotLight('#fef3c7', 0, 18, Math.PI / 5, 0.5, 1.4);
  headlightRight.position.set(0.28, 0.56, -0.72);
  const targetRight = new THREE.Object3D();
  targetRight.position.set(0.32, -0.25, -4.5);
  bodyTilt.add(headlightRight, targetRight);
  headlightRight.target = targetRight;

  const coneGeo = new THREE.ConeGeometry(0.68, 3.6, 16, 1, true);
  coneGeo.rotateX(Math.PI * 0.5);
  coneGeo.translate(0, 0, -1.8);
  const coneMat = new THREE.MeshBasicMaterial({
    color: '#fef08a',
    transparent: true,
    opacity: 0.14,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const coneL = new THREE.Mesh(coneGeo, coneMat);
  coneL.position.set(-0.28, 0.54, -0.74);
  coneL.rotation.x = -0.14;
  const coneR = new THREE.Mesh(coneGeo, coneMat);
  coneR.position.set(0.28, 0.54, -0.74);
  coneR.rotation.x = -0.14;
  bodyTilt.add(coneL, coneR);

  // Ground locator ring for orbital visibility
  const locatorRing = new THREE.Mesh(
    new THREE.RingGeometry(1.1, 1.32, 32),
    new THREE.MeshBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  locatorRing.rotation.x = -Math.PI * 0.5;
  locatorRing.position.y = 0.04;
  bodyTilt.add(locatorRing);

  // Local showcase fill light so gold MLI chassis, wheels, and instruments stay crisp even at grazing polar Sun angles
  const roverKeyFill = new THREE.PointLight('#fef3c7', 3.4, 24, 1.1);
  roverKeyFill.position.set(1.1, 3.0, -1.5);
  bodyTilt.add(roverKeyFill);

  // VTOL Hopper / Flight Thrusters under the 4 chassis corners
  const plumeGeo = new THREE.ConeGeometry(0.16, 1.1, 12, 1, true);
  plumeGeo.rotateX(Math.PI);
  plumeGeo.translate(0, -0.55, 0);
  const plumeMat = new THREE.MeshBasicMaterial({
    color: '#38bdf8',
    transparent: true,
    opacity: 0.72,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: '#64748b',
    metalness: 0.8,
    roughness: 0.25,
  });
  const thrusterPlumes: THREE.Mesh[] = [];
  const thrusterCoords: Array<[number, number]> = [
    [-0.38, -0.52],
    [0.38, -0.52],
    [-0.38, 0.52],
    [0.38, 0.52],
  ];
  for (const [tx, tz] of thrusterCoords) {
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.14, 10), nozzleMat);
    nozzle.position.set(tx, 0.28, tz);
    bodyTilt.add(nozzle);

    const plume = new THREE.Mesh(plumeGeo, plumeMat);
    plume.position.set(tx, 0.22, tz);
    plume.visible = false;
    bodyTilt.add(plume);
    thrusterPlumes.push(plume);
  }
  const thrusterLight = new THREE.PointLight('#38bdf8', 0, 16, 1.4);
  thrusterLight.position.set(0, -0.1, 0);
  bodyTilt.add(thrusterLight);

  scene.add(root);

  return {
    root,
    bodyTilt,
    wheels,
    frontSteerPivots,
    rearSteerPivots,
    solarYaw,
    solarPitch,
    dishYaw,
    dishPitch,
    dteBeam,
    mastPole,
    mastHead,
    beaconMesh,
    headlightLeft,
    headlightRight,
    headlightCones: [coneL, coneR],
    locatorRing,
    thrusterPlumes,
    thrusterLight,
  };
}

function sampleElevationOnGrid(
  xKm: number,
  yKm: number,
  clientDem: ClientDemBundle | null,
  demPatch: DecodedDemPatch | null,
): number {
  return sampleTerrainHeightAndNormal(xKm, yKm, clientDem, demPatch).elevM;
}

/**
 * Exact world-space Y (already vertically exaggerated) of the rendered 250x250 terrain mesh at
 * polar (xKm, yKm), interpolated on the very same triangle the GPU draws (a-d-b / b-d-e split).
 * Keeps rover, camera, trail & markers flush with the visible surface instead of the finer DEM.
 */
function sampleRenderedTerrainY(posArr: ArrayLike<number>, xKm: number, yKm: number): number {
  const n = TERRAIN_SEG_N;
  const span = TERRAIN_EXTENT_KM * 2.0;
  const fc = Math.max(0, Math.min(n - 1, ((xKm + TERRAIN_EXTENT_KM) / span) * (n - 1)));
  const fr = Math.max(0, Math.min(n - 1, ((TERRAIN_EXTENT_KM - yKm) / span) * (n - 1)));
  const c0 = Math.min(n - 2, Math.floor(fc));
  const r0 = Math.min(n - 2, Math.floor(fr));
  const u = fc - c0;
  const v = fr - r0;
  const ia = r0 * n + c0;
  const ha = posArr[ia * 3 + 1];
  const hb = posArr[(ia + 1) * 3 + 1];
  const hd = posArr[(ia + n) * 3 + 1];
  const he = posArr[(ia + n + 1) * 3 + 1];
  if (u + v <= 1.0) {
    return ha + u * (hb - ha) + v * (hd - ha);
  }
  return he + (1.0 - u) * (hd - he) + (1.0 - v) * (hb - he);
}

/**
 * Sample maximum rendered terrain mesh height around a world XZ point so camera near-plane
 * and object undersides never intersect adjacent sloped triangles.
 */
function sampleRenderedFloorY(
  posArr: ArrayLike<number>,
  worldX: number,
  worldZ: number,
  probeRadiusKm = 0.28,
): number {
  const cx = worldX;
  const cy = -worldZ;
  let maxY = sampleRenderedTerrainY(posArr, cx, cy);
  if (probeRadiusKm > 0) {
    maxY = Math.max(
      maxY,
      sampleRenderedTerrainY(posArr, cx + probeRadiusKm, cy),
      sampleRenderedTerrainY(posArr, cx - probeRadiusKm, cy),
      sampleRenderedTerrainY(posArr, cx, cy + probeRadiusKm),
      sampleRenderedTerrainY(posArr, cx, cy - probeRadiusKm),
    );
  }
  return maxY;
}

export const Lunar3DViewport: React.FC<Lunar3DViewportProps> = ({
  ephemeris,
  timeIdx,
  mastHeightM,
  sites,
  selectedSite,
  compareSite = null,
  artemisRegions = [],
  demPatch,
  clientDem,
  polarMaps = null,
  activeLayer,
  onChangeLayer,
  roverState,
  onRoverStateChange,
  roverTelemetry,
  cameraMode,
  onCameraModeChange,
  verticalExaggeration = 5,
  onSelectSite,
  onDeployRoverToSite,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [webglReady, setWebglReady] = useState<boolean>(true);
  const [invertY, setInvertY] = useState<boolean>(false);
  const [showSkyGuide, setShowSkyGuide] = useState<boolean>(false);
  const [hoveredSiteId, setHoveredSiteId] = useState<string | null>(null);
  const [siteLabelsScreen, setSiteLabelsScreen] = useState<
    Array<{ id: string; name: string; x: number; y: number; kind: 'selected' | 'compare' | 'hover' }>
  >([]);
  const [skyLabelsScreen, setSkyLabelsScreen] = useState<
    Array<{ id: string; label: string; kind: 'galaxy' | 'nebula' | 'star' | 'body'; x: number; y: number }>
  >([]);

  // Mutable simulation refs for zero-lag 60fps animation loop
  const invertYRef = useRef<boolean>(invertY);
  invertYRef.current = invertY;
  const showSkyGuideRef = useRef<boolean>(showSkyGuide);
  showSkyGuideRef.current = showSkyGuide;
  const ephemerisRef = useRef<EphemerisData>(ephemeris);
  ephemerisRef.current = ephemeris;
  const timeIdxRef = useRef<number>(timeIdx);
  timeIdxRef.current = timeIdx;
  const pointerDownRef = useRef<boolean>(false);
  const roverStateRef = useRef<RoverState>(roverState);
  const lastEmittedRoverRef = useRef<RoverState>(roverState);
  const roverTelemetryRef = useRef<RoverLiveTelemetry>(roverTelemetry);
  const cameraModeRef = useRef<TerrainCameraMode>(cameraMode);
  const vertExagRef = useRef<number>(Math.max(1, verticalExaggeration));
  const mastHeightRef = useRef<number>(mastHeightM);
  const clientDemRef = useRef<ClientDemBundle | null>(clientDem);
  const demPatchRef = useRef<DecodedDemPatch | null>(demPatch);
  const sitesRef = useRef<SiteData[]>(sites);
  const selectedSiteRef = useRef<SiteData>(selectedSite);
  const compareSiteRef = useRef<SiteData | null>(compareSite);
  const hoveredSiteIdRef = useRef<string | null>(null);

  const onRoverStateChangeRef = useRef(onRoverStateChange);
  const onSelectSiteRef = useRef(onSelectSite);

  onRoverStateChangeRef.current = onRoverStateChange;
  onSelectSiteRef.current = onSelectSite;
  roverTelemetryRef.current = roverTelemetry;
  cameraModeRef.current = cameraMode;
  vertExagRef.current = Math.max(1, verticalExaggeration);
  mastHeightRef.current = mastHeightM;
  clientDemRef.current = clientDem;
  demPatchRef.current = demPatch;
  sitesRef.current = sites;
  selectedSiteRef.current = selectedSite;
  compareSiteRef.current = compareSite;

  // Sync external rover state updates without overriding internal motion frame unless externally changed
  useEffect(() => {
    if (roverState !== lastEmittedRoverRef.current) {
      roverStateRef.current = roverState;
      lastEmittedRoverRef.current = roverState;
    }
  }, [roverState]);

  // Combined keyboard + virtual HUD drive controls
  const keyControlsRef = useRef<RoverControls>({
    forward: 0,
    turn: 0,
    vertical: 0,
    brake: false,
    boost: false,
  });
  const virtualControlsRef = useRef<RoverControls>({
    forward: 0,
    turn: 0,
    vertical: 0,
    brake: false,
    boost: false,
  });

  // Camera orbit / pan / zoom state
  const camCtrlRef = useRef({
    yawRad: 0.55,
    pitchRad: 0.58,
    orbitDistanceKm: 42.0,
    chaseDistanceKm: 3.4,
    chaseYawOffsetRad: 0.0,
    chaseLookElRad: -0.22,
    mastYawOffsetRad: 0.0,
    mastPitchOffsetRad: -0.04,
    mastFovDeg: 58.0,
    targetX: 0.0,
    targetY: 0.0,
    targetZ: 0.0,
    flyToActive: false,
    flyToTargetX: 0.0,
    flyToTargetY: 0.0,
    flyToTargetZ: 0.0,
    flyToDistanceKm: 24.0,
  });

  // Three.js scene object refs for reactive data updates without rebuilding renderer
  const sceneObjectsRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    terrainMesh: THREE.Mesh;
    terrainGeo: THREE.BufferGeometry;
    sunLight: THREE.DirectionalLight;
    earthLight: THREE.DirectionalLight;
    rimFillLight: THREE.DirectionalLight;
    skyGroup: THREE.Group;
    celestialGroup: THREE.Group;
    constellationLines: THREE.LineSegments;
    sunMesh: THREE.Mesh;
    sunCorona: THREE.Sprite;
    sunRays: THREE.Sprite;
    earthMesh: THREE.Mesh;
    earthMat: THREE.ShaderMaterial;
    earthGlow: THREE.Sprite;
    roverRig: RoverRigRefs;
    trailLine: THREE.Line;
    waypointGroup: THREE.Group;
    artemisGroup: THREE.Group;
    beaconsGroup: THREE.Group;
    beaconHitMeshes: THREE.Object3D[];
  } | null>(null);

  const decodedPolarMaps = useMemo<DecodedPolarMaps | null>(
    () => (polarMaps ? decodePolarMaps(polarMaps) : null),
    [polarMaps],
  );

  // Trigger smooth flyTo when selectedSite changes in orbit mode
  useEffect(() => {
    if (!selectedSite.is_polar_dem || selectedSite.polar_x_km === null || selectedSite.polar_y_km === null) {
      return;
    }
    const obj = sceneObjectsRef.current;
    const posArr = obj ? (obj.terrainGeo.getAttribute('position').array as Float32Array) : null;
    const [tx, fallbackTy, tz] = polarToThreeCoords(
      selectedSite.polar_x_km,
      selectedSite.polar_y_km,
      selectedSite.elev_m,
      vertExagRef.current,
    );
    const ty = posArr
      ? sampleRenderedTerrainY(posArr, selectedSite.polar_x_km, selectedSite.polar_y_km)
      : fallbackTy;
    const cam = camCtrlRef.current;
    cam.flyToTargetX = tx;
    cam.flyToTargetY = ty;
    cam.flyToTargetZ = tz;
    cam.flyToDistanceKm = Math.min(34, Math.max(12, cam.orbitDistanceKm));
    cam.flyToActive = true;
  }, [selectedSite.id, selectedSite.polar_x_km, selectedSite.polar_y_km]);

  const handleFlyToSelectedSite = useCallback(() => {
    const s = selectedSiteRef.current;
    const xKm = s.polar_x_km ?? roverStateRef.current.xKm;
    const yKm = s.polar_y_km ?? roverStateRef.current.yKm;
    const obj = sceneObjectsRef.current;
    const posArr = obj ? (obj.terrainGeo.getAttribute('position').array as Float32Array) : null;
    const elev = sampleElevationOnGrid(xKm, yKm, clientDemRef.current, demPatchRef.current);
    const [tx, fallbackTy, tz] = polarToThreeCoords(xKm, yKm, elev, vertExagRef.current);
    const ty = posArr ? sampleRenderedTerrainY(posArr, xKm, yKm) : fallbackTy;
    const cam = camCtrlRef.current;
    cam.flyToTargetX = tx;
    cam.flyToTargetY = ty;
    cam.flyToTargetZ = tz;
    cam.flyToDistanceKm = 18.0;
    cam.flyToActive = true;
    if (cameraModeRef.current === 'chase' || cameraModeRef.current === 'mast') {
      onCameraModeChange?.('orbit');
    }
  }, [onCameraModeChange]);

  const handleCycleGear = useCallback(
    (gear: RoverGearMultiplier) => {
      const next: RoverState = { ...roverStateRef.current, gearMultiplier: gear };
      roverStateRef.current = next;
      lastEmittedRoverRef.current = next;
      onRoverStateChangeRef.current(next);
    },
    [],
  );

  const handleToggleHeadlights = useCallback(() => {
    const next: RoverState = {
      ...roverStateRef.current,
      headlightsOn: !roverStateRef.current.headlightsOn,
    };
    roverStateRef.current = next;
    lastEmittedRoverRef.current = next;
    onRoverStateChangeRef.current(next);
  }, []);

  const handleToggleFlight = useCallback(() => {
    const prev = roverStateRef.current;
    const nextFlight = !prev.flightMode;
    const sample = sampleTerrainHeightAndNormal(
      prev.xKm,
      prev.yKm,
      clientDemRef.current,
      demPatchRef.current,
    );
    const nextAlt = nextFlight ? Math.max(600, prev.altitudeM ?? 600) : 0;
    const next: RoverState = {
      ...prev,
      flightMode: nextFlight,
      altitudeM: nextAlt,
      elevM: sample.elevM + nextAlt,
    };
    roverStateRef.current = next;
    lastEmittedRoverRef.current = next;
    onRoverStateChangeRef.current(next);
  }, []);

  const handleClearWaypoint = useCallback(() => {
    const next: RoverState = { ...roverStateRef.current, waypoint: null };
    roverStateRef.current = next;
    lastEmittedRoverRef.current = next;
    onRoverStateChangeRef.current(next);
  }, []);

  // Keyboard listener for WASD / Arrow driving + E/Q/F flight + L headlights + Space brake/climb
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pressed = new Set<string>();

    const syncKeys = () => {
      const fwd =
        (pressed.has('KeyW') || pressed.has('ArrowUp') ? 1 : 0) -
        (pressed.has('KeyS') || pressed.has('ArrowDown') ? 1 : 0);
      const turn =
        (pressed.has('KeyD') || pressed.has('ArrowRight') ? 1 : 0) -
        (pressed.has('KeyA') || pressed.has('ArrowLeft') ? 1 : 0);
      const flying = Boolean(roverStateRef.current.flightMode);
      const vertical =
        (pressed.has('KeyE') || pressed.has('PageUp') || (flying && pressed.has('Space')) ? 1 : 0) -
        (pressed.has('KeyQ') || pressed.has('KeyC') || pressed.has('PageDown') ? 1 : 0);
      const brake = !flying && pressed.has('Space');
      const boost = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
      keyControlsRef.current = { forward: fwd, turn, vertical, brake, boost };
    };

    const isFormFocused = (target: EventTarget | null): boolean => {
      const el = (target as HTMLElement | null) ?? (document.activeElement as HTMLElement | null);
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || el.isContentEditable;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isFormFocused(e.target)) return;
      if (e.code === 'KeyL' && !e.repeat) {
        handleToggleHeadlights();
        return;
      }
      if (e.code === 'KeyF' && !e.repeat) {
        handleToggleFlight();
        syncKeys();
        return;
      }
      if (
        e.code === 'KeyW' ||
        e.code === 'KeyA' ||
        e.code === 'KeyS' ||
        e.code === 'KeyD' ||
        e.code === 'KeyE' ||
        e.code === 'KeyQ' ||
        e.code === 'KeyC' ||
        e.code === 'PageUp' ||
        e.code === 'PageDown' ||
        e.code === 'ArrowUp' ||
        e.code === 'ArrowDown' ||
        e.code === 'ArrowLeft' ||
        e.code === 'ArrowRight' ||
        e.code === 'Space' ||
        e.code === 'ShiftLeft' ||
        e.code === 'ShiftRight'
      ) {
        if (
          e.code.startsWith('Arrow') ||
          e.code === 'PageUp' ||
          e.code === 'PageDown' ||
          e.code === 'Space'
        ) {
          e.preventDefault();
        }
        pressed.add(e.code);
        syncKeys();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (pressed.delete(e.code)) {
        syncKeys();
      }
    };

    const onBlur = () => {
      pressed.clear();
      syncKeys();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [handleToggleFlight, handleToggleHeadlights]);

  // Initialize Three.js WebGL scene once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || typeof window === 'undefined') {
      setWebglReady(false);
      return;
    }

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglReady(false);
      return;
    }

    setWebglReady(true);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#010207');
    scene.fog = new THREE.FogExp2('#020612', 0.00024);

    const width = Math.max(320, container.clientWidth || 800);
    const height = Math.max(240, container.clientHeight || 520);
    renderer.setSize(width, height, false);

    const camera = new THREE.PerspectiveCamera(52, width / height, 0.05, 3600);

    // Ambient Earthshine + directional JPL Sun & Earth lights + cool terrain rim fill
    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x273549, 1.15);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight('#fff5dc', 2.4);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 650;
    sunLight.shadow.camera.left = -165;
    sunLight.shadow.camera.right = 165;
    sunLight.shadow.camera.top = 165;
    sunLight.shadow.camera.bottom = -165;
    sunLight.shadow.bias = -0.0004;
    sunLight.shadow.normalBias = 0.07;
    scene.add(sunLight);
    scene.add(sunLight.target);

    const earthLight = new THREE.DirectionalLight('#38bdf8', 0.25);
    scene.add(earthLight);

    const rimFillLight = new THREE.DirectionalLight('#bae6fd', 0.62);
    scene.add(rimFillLight);
    scene.add(rimFillLight.target);

    // 250x250 continuous South Pole LOLA terrain mesh (±150 km)
    const vertCount = TERRAIN_SEG_N * TERRAIN_SEG_N;
    const posArr = new Float32Array(vertCount * 3);
    const colArr = new Float32Array(vertCount * 3);
    const uvArr = new Float32Array(vertCount * 2);

    for (let r = 0; r < TERRAIN_SEG_N; r++) {
      const vFrac = r / (TERRAIN_SEG_N - 1);
      const yKm = TERRAIN_EXTENT_KM - vFrac * (TERRAIN_EXTENT_KM * 2.0);
      for (let c = 0; c < TERRAIN_SEG_N; c++) {
        const uFrac = c / (TERRAIN_SEG_N - 1);
        const xKm = -TERRAIN_EXTENT_KM + uFrac * (TERRAIN_EXTENT_KM * 2.0);
        const vi = r * TERRAIN_SEG_N + c;
        posArr[vi * 3] = xKm;
        posArr[vi * 3 + 1] = 0;
        posArr[vi * 3 + 2] = -yKm;
        colArr[vi * 3] = 0.45;
        colArr[vi * 3 + 1] = 0.48;
        colArr[vi * 3 + 2] = 0.54;
        uvArr[vi * 2] = uFrac;
        uvArr[vi * 2 + 1] = 1.0 - vFrac;
      }
    }

    const quadCount = (TERRAIN_SEG_N - 1) * (TERRAIN_SEG_N - 1);
    const indices = new Uint32Array(quadCount * 6);
    let ptr = 0;
    for (let r = 0; r < TERRAIN_SEG_N - 1; r++) {
      for (let c = 0; c < TERRAIN_SEG_N - 1; c++) {
        const a = r * TERRAIN_SEG_N + c;
        const b = a + 1;
        const d = (r + 1) * TERRAIN_SEG_N + c;
        const e = d + 1;
        // Counter-clockwise upward (+Y) winding
        indices[ptr++] = a;
        indices[ptr++] = d;
        indices[ptr++] = b;
        indices[ptr++] = b;
        indices[ptr++] = d;
        indices[ptr++] = e;
      }
    }

    const terrainGeo = new THREE.BufferGeometry();
    terrainGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));
    terrainGeo.setAttribute('uv', new THREE.BufferAttribute(uvArr, 2));
    terrainGeo.setIndex(new THREE.BufferAttribute(indices, 1));
    terrainGeo.computeVertexNormals();

    const regolithTex = createRegolithDetailTexture();
    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.92,
      metalness: 0.04,
      bumpMap: regolithTex,
      bumpScale: 0.045,
      shadowSide: THREE.DoubleSide,
    });

    const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    terrainMesh.receiveShadow = true;
    terrainMesh.castShadow = true;
    scene.add(terrainMesh);

    // Deep-space astronomical sky dome: J2000 Milky Way band, dust lanes, deep-sky galaxies/nebulae,
    // Hipparcos bright star catalog with B-V Planck color, plus Earth & Sun at JPL Horizons coordinates
    const skyGroup = new THREE.Group();
    scene.add(skyGroup);

    const celestialGroup = new THREE.Group();
    skyGroup.add(celestialGroup);

    const milkyWayDome = createMilkyWayDomeMesh(1440.0);
    celestialGroup.add(milkyWayDome);

    const starBufs = buildAstronomicalStarBuffers(1320.0);
    const starField = createAstronomicalStarField(
      starBufs.positions,
      starBufs.colors,
      starBufs.sizes,
      starBufs.spikeStrengths,
      dpr,
    );
    celestialGroup.add(starField);

    const deepSkyGroup = createDeepSkyGroup(1365.0);
    celestialGroup.add(deepSkyGroup);

    const constGeo = new THREE.BufferGeometry();
    constGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(buildConstellationLinePositions(1310.0), 3),
    );
    const constellationLines = new THREE.LineSegments(
      constGeo,
      new THREE.LineBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0.28,
        depthWrite: false,
        fog: false,
      }),
    );
    constellationLines.frustumCulled = false;
    constellationLines.visible = showSkyGuideRef.current;
    celestialGroup.add(constellationLines);

    // 3D Sun + Corona + Diffraction Rays
    const sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(13.5, 24, 24),
      new THREE.MeshBasicMaterial({ color: '#fffbeb', fog: false }),
    );
    skyGroup.add(sunMesh);

    const sunCoronaTex = createGlowTexture('rgba(255,252,230,0.98)', 'rgba(251,191,36,0.45)');
    const sunCorona = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunCoronaTex ?? undefined,
        color: '#fde68a',
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    sunCorona.scale.set(118, 118, 1);
    skyGroup.add(sunCorona);

    const sunRaysTex = createSolarRaysTexture();
    const sunRays = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: sunRaysTex ?? undefined,
        color: '#fef3c7',
        transparent: true,
        opacity: 0.72,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    sunRays.scale.set(165, 165, 1);
    skyGroup.add(sunRays);

    // Physically lit 3D Earth globe (sunlit crescent/gibbous terminator, atmosphere limb & night lights)
    const earthRig = createRealisticEarthGlobe();
    const earthMesh = earthRig.mesh;
    const earthMat = earthRig.material;
    skyGroup.add(earthMesh);

    const earthGlowTex = createGlowTexture('rgba(186,230,253,0.75)', 'rgba(56,189,248,0.28)');
    const earthGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: earthGlowTex ?? undefined,
        color: '#38bdf8',
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    );
    earthGlow.scale.set(66, 66, 1);
    skyGroup.add(earthGlow);

    // Articulated rover
    const roverRig = buildRoverRig(scene);

    // Traverse breadcrumb line
    const trailGeo = new THREE.BufferGeometry();
    const trailMat = new THREE.LineBasicMaterial({
      color: '#22d3ee',
      transparent: true,
      opacity: 0.88,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    trailLine.frustumCulled = false;
    scene.add(trailLine);

    // Waypoint beacon group
    const waypointGroup = new THREE.Group();
    const wpRing = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.72, 24),
      new THREE.MeshBasicMaterial({
        color: '#22d3ee',
        transparent: true,
        opacity: 0.85,
        side: THREE.DoubleSide,
      }),
    );
    wpRing.rotation.x = -Math.PI * 0.5;
    wpRing.position.y = 0.08;
    const wpNeedle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8),
      new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.7 }),
    );
    wpNeedle.position.y = 2.1;
    const wpDiamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.45, 0),
      new THREE.MeshBasicMaterial({ color: '#fbbf24' }),
    );
    wpDiamond.position.y = 4.5;
    waypointGroup.add(wpRing, wpNeedle, wpDiamond);
    waypointGroup.visible = false;
    scene.add(waypointGroup);

    // Draped Artemis III boundaries & Site Beacons groups
    const artemisGroup = new THREE.Group();
    scene.add(artemisGroup);

    const beaconsGroup = new THREE.Group();
    scene.add(beaconsGroup);

    sceneObjectsRef.current = {
      scene,
      camera,
      terrainMesh,
      terrainGeo,
      sunLight,
      earthLight,
      rimFillLight,
      skyGroup,
      celestialGroup,
      constellationLines,
      sunMesh,
      sunCorona,
      sunRays,
      earthMesh,
      earthMat,
      earthGlow,
      roverRig,
      trailLine,
      waypointGroup,
      artemisGroup,
      beaconsGroup,
      beaconHitMeshes: [],
    };

    // ResizeObserver for crisp HiDPI resizing
    const handleResize = () => {
      if (!container) return;
      const w = Math.max(300, container.clientWidth);
      const h = Math.max(220, container.clientHeight);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(handleResize) : null;
    ro?.observe(container);

    // Mouse / Pointer orbit + zoom + raycast click-to-waypoint / site selection
    const pointerState = {
      down: false,
      button: 0,
      movedPx: 0,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
    };
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();

    const onPointerDown = (e: PointerEvent) => {
      pointerState.down = true;
      pointerDownRef.current = true;
      pointerState.button = e.button;
      pointerState.movedPx = 0;
      pointerState.startX = e.clientX;
      pointerState.startY = e.clientY;
      pointerState.lastX = e.clientX;
      pointerState.lastY = e.clientY;
      canvas.focus({ preventScroll: true });
      try {
        canvas.setPointerCapture?.(e.pointerId);
      } catch {
        // Ignore inactive synthetic or cancelled pointer IDs
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      }

      if (!pointerState.down) {
        // Hover detection for site beacons
        const obj = sceneObjectsRef.current;
        if (obj && obj.beaconHitMeshes.length > 0) {
          raycaster.setFromCamera(pointerNdc, obj.camera);
          const hits = raycaster.intersectObjects(obj.beaconHitMeshes, false);
          const hitId = (hits[0]?.object?.userData?.siteId as string | undefined) ?? null;
          if (hitId !== hoveredSiteIdRef.current) {
            hoveredSiteIdRef.current = hitId;
            setHoveredSiteId(hitId);
          }
          canvas.style.cursor = hitId ? 'pointer' : 'grab';
        }
        return;
      }

      const dx = e.clientX - pointerState.lastX;
      const dy = e.clientY - pointerState.lastY;
      pointerState.movedPx += Math.hypot(dx, dy);
      pointerState.lastX = e.clientX;
      pointerState.lastY = e.clientY;

      const cam = camCtrlRef.current;
      const mode = cameraModeRef.current;
      const ySign = invertYRef.current ? -1 : 1;
      cam.flyToActive = false;

      // Unified game-style look: drag right → view turns right, drag up → view tilts up (Invert Y flips vertical)
      if (mode === 'mast') {
        const nextYaw = cam.mastYawOffsetRad + dx * 0.005;
        cam.mastYawOffsetRad =
          (((nextYaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        cam.mastPitchOffsetRad = Math.max(-0.75, Math.min(1.45, cam.mastPitchOffsetRad - dy * 0.004 * ySign));
      } else if (mode === 'chase') {
        const nextYaw = cam.chaseYawOffsetRad + dx * 0.006;
        cam.chaseYawOffsetRad =
          (((nextYaw + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        cam.chaseLookElRad = Math.max(-1.15, Math.min(1.05, cam.chaseLookElRad - dy * 0.005 * ySign));
      } else if ((e.buttons & 2) !== 0 || e.shiftKey) {
        // Grab-pan in orbit / free mode: ground under the cursor follows the pointer
        const panScale = cam.orbitDistanceKm * 0.0022;
        const sinY = Math.sin(cam.yawRad);
        const cosY = Math.cos(cam.yawRad);
        cam.targetX = Math.max(-148, Math.min(148, cam.targetX - (cosY * dx + sinY * dy) * panScale));
        cam.targetZ = Math.max(-148, Math.min(148, cam.targetZ + (sinY * dx - cosY * dy) * panScale));
      } else {
        cam.yawRad -= dx * 0.006;
        cam.pitchRad = Math.max(0.06, Math.min(1.48, cam.pitchRad + dy * 0.005 * ySign));
      }
      canvas.style.cursor = 'grabbing';
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!pointerState.down) return;
      pointerState.down = false;
      pointerDownRef.current = false;
      try {
        if (canvas.hasPointerCapture?.(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore inactive synthetic or cancelled pointer IDs
      }
      canvas.style.cursor = 'grab';

      if (pointerState.movedPx < 6 && pointerState.button === 0) {
        const obj = sceneObjectsRef.current;
        if (!obj) return;
        const rect = canvas.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) return;
        pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointerNdc, obj.camera);

        if (obj.beaconHitMeshes.length > 0) {
          const bHits = raycaster.intersectObjects(obj.beaconHitMeshes, false);
          const siteId = bHits[0]?.object?.userData?.siteId as string | undefined;
          if (siteId) {
            onSelectSiteRef.current?.(siteId);
            return;
          }
        }

        // Only set terrain autopilot waypoint on explicit modifier click (double-click handled separately)
        // so single clicks to focus or start camera drags never hijack rover steering.
        if (e.altKey || e.ctrlKey || e.metaKey) {
          const tHits = raycaster.intersectObject(obj.terrainMesh, false);
          if (tHits.length > 0) {
            const hitPt = tHits[0].point;
            const [wxKm, wyKm] = clampRoverCoordKm(hitPt.x, -hitPt.z);
            const nextState: RoverState = {
              ...roverStateRef.current,
              waypoint: { xKm: wxKm, yKm: wyKm },
            };
            roverStateRef.current = nextState;
            lastEmittedRoverRef.current = nextState;
            onRoverStateChangeRef.current(nextState);
          }
        }
      }
    };

    const onDblClick = (e: MouseEvent) => {
      const obj = sceneObjectsRef.current;
      if (!obj) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      pointerNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      pointerNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointerNdc, obj.camera);
      const tHits = raycaster.intersectObject(obj.terrainMesh, false);
      if (tHits.length > 0) {
        const hitPt = tHits[0].point;
        const [wxKm, wyKm] = clampRoverCoordKm(hitPt.x, -hitPt.z);
        const nextState: RoverState = {
          ...roverStateRef.current,
          waypoint: { xKm: wxKm, yKm: wyKm },
        };
        roverStateRef.current = nextState;
        lastEmittedRoverRef.current = nextState;
        onRoverStateChangeRef.current(nextState);
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const cam = camCtrlRef.current;
      const mode = cameraModeRef.current;
      const factor = Math.exp(e.deltaY * 0.0011);
      if (mode === 'mast') {
        cam.mastFovDeg = Math.max(28, Math.min(80, cam.mastFovDeg * factor));
      } else if (mode === 'chase') {
        cam.chaseDistanceKm = Math.max(1.1, Math.min(28.0, cam.chaseDistanceKm * factor));
      } else {
        cam.flyToActive = false;
        cam.orbitDistanceKm = Math.max(2.5, Math.min(290.0, cam.orbitDistanceKm * factor));
      }
    };

    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };

    const onPointerCancel = (e: PointerEvent) => {
      pointerState.down = false;
      pointerDownRef.current = false;
      try {
        if (canvas.hasPointerCapture?.(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId);
        }
      } catch {
        // Ignore
      }
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('dblclick', onDblClick);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContextMenu);

    // Reusable math temporaries
    const tmpUp = new THREE.Vector3();
    const tmpFwd = new THREE.Vector3();
    const tmpRight = new THREE.Vector3();
    const tmpMat = new THREE.Matrix4();
    const tmpVec = new THREE.Vector3();
    const tmpProj = new THREE.Vector3();
    const tmpCamPos = new THREE.Vector3();
    const tmpLookTarget = new THREE.Vector3();

    let rafId = 0;
    let lastTimeMs = performance.now();
    let lastStateEmitMs = 0;
    let lastLabelEmitMs = 0;
    let lastSkyTimeIdx = -1;
    let lastSkyGuideActive = false;
    const skyRotMat4 = new THREE.Matrix4();
    const skyAnchorVec = new THREE.Vector3();

    const animate = (nowMs: number) => {
      rafId = window.requestAnimationFrame(animate);
      const dtSec = Math.min(0.1, Math.max(0.001, (nowMs - lastTimeMs) / 1000.0));
      lastTimeMs = nowMs;

      const obj = sceneObjectsRef.current;
      if (!obj) return;

      const exag = vertExagRef.current;
      const terrainPosArr = (obj.terrainGeo.getAttribute('position') as THREE.BufferAttribute)
        .array as Float32Array;
      const kCtrl = keyControlsRef.current;
      const vCtrl = virtualControlsRef.current;
      const combinedCtrl: RoverControls = {
        forward: Math.max(-1, Math.min(1, kCtrl.forward + vCtrl.forward)),
        turn: Math.max(-1, Math.min(1, kCtrl.turn + vCtrl.turn)),
        vertical: Math.max(-1, Math.min(1, (kCtrl.vertical ?? 0) + (vCtrl.vertical ?? 0))),
        brake: Boolean(kCtrl.brake || vCtrl.brake),
        boost: Boolean(kCtrl.boost || vCtrl.boost),
      };

      const cam = camCtrlRef.current;
      const mode = cameraModeRef.current;
      const hasManualMove =
        Math.abs(combinedCtrl.forward) > 0.01 ||
        Math.abs(combinedCtrl.turn) > 0.01 ||
        Math.abs(combinedCtrl.vertical ?? 0) > 0.01;

      if (mode === 'free' && hasManualMove) {
        cam.flyToActive = false;
        const boostK = combinedCtrl.boost ? 2.2 : 1.0;
        const freeSpeedKps = Math.max(14.0, cam.orbitDistanceKm * 0.9) * boostK;
        const sinY = Math.sin(cam.yawRad);
        const cosY = Math.cos(cam.yawRad);
        const fwdStep = combinedCtrl.forward * freeSpeedKps * dtSec;
        const strafeStep = combinedCtrl.turn * freeSpeedKps * dtSec;
        const rawTx = cam.targetX - sinY * fwdStep + cosY * strafeStep;
        const rawTz = cam.targetZ - cosY * fwdStep - sinY * strafeStep;
        const [clampedTx, clampedNegTz] = clampRoverCoordKm(rawTx, -rawTz);
        cam.targetX = clampedTx;
        cam.targetZ = -clampedNegTz;
        cam.targetY = sampleRenderedTerrainY(terrainPosArr, cam.targetX, -cam.targetZ);
        if (Math.abs(combinedCtrl.vertical ?? 0) > 0.01) {
          cam.orbitDistanceKm = Math.max(
            2.5,
            Math.min(
              290.0,
              cam.orbitDistanceKm - (combinedCtrl.vertical ?? 0) * freeSpeedKps * 0.7 * dtSec,
            ),
          );
        }
      }

      // Chase: pressing W/S after looking around steers the rover toward the camera view while the
      // camera's world azimuth stays fixed (no double-rotation swing).
      let chaseAlignWorldAz: number | null = null;
      if (
        mode === 'chase' &&
        Math.abs(combinedCtrl.forward) > 0.05 &&
        Math.abs(combinedCtrl.turn) < 0.05 &&
        !pointerDownRef.current
      ) {
        const yawOff =
          (((cam.chaseYawOffsetRad + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) -
          Math.PI;
        if (Math.abs(yawOff) > 0.015) {
          combinedCtrl.turn = Math.max(-1, Math.min(1, yawOff * 2.0));
          chaseAlignWorldAz = roverStateRef.current.headingDeg * DEG2RAD + yawOff;
        } else {
          cam.chaseYawOffsetRad = 0;
        }
      }

      const roverInputCtrl: RoverControls =
        mode === 'free'
          ? { forward: 0, turn: 0, vertical: 0, brake: false, boost: false }
          : combinedCtrl;

      let curRover = roverStateRef.current;
      const shouldStep =
        Math.abs(roverInputCtrl.forward) > 0.01 ||
        Math.abs(roverInputCtrl.turn) > 0.01 ||
        Math.abs(roverInputCtrl.vertical ?? 0) > 0.01 ||
        Boolean(roverInputCtrl.brake) ||
        Math.abs(curRover.speedMps) > 0.01 ||
        curRover.waypoint !== null;

      if (shouldStep) {
        const prevWp = curRover.waypoint;
        curRover = stepRoverPhysics(
          curRover,
          roverInputCtrl,
          dtSec,
          clientDemRef.current,
          demPatchRef.current,
        );
        roverStateRef.current = curRover;

        if (chaseAlignWorldAz !== null) {
          const rem = chaseAlignWorldAz - curRover.headingDeg * DEG2RAD;
          cam.chaseYawOffsetRad =
            (((rem + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        }

        const stoppedNow = Math.abs(curRover.speedMps) <= 0.01 && prevWp !== null && curRover.waypoint === null;
        if (stoppedNow || nowMs - lastStateEmitMs >= 65) {
          lastStateEmitMs = nowMs;
          lastEmittedRoverRef.current = curRover;
          onRoverStateChangeRef.current(curRover);
        }
      }

      // Position & align 3D rover group cleanly onto the rendered 3D terrain triangles (never sink inside coarse chords)
      const [rx, ryDem, rz] = polarToThreeCoords(curRover.xKm, curRover.yKm, curRover.elevM, exag);
      const groundMeshY = sampleRenderedTerrainY(terrainPosArr, curRover.xKm, curRover.yKm);
      const roughRoverDist = Math.hypot(
        obj.camera.position.x - rx,
        obj.camera.position.y - Math.max(ryDem, groundMeshY),
        obj.camera.position.z - rz,
      );
      const roverScale =
        mode === 'mast'
          ? 0.14
          : Math.max(0.32, Math.min(2.1, 0.26 + roughRoverDist * 0.022));
      obj.roverRig.root.scale.setScalar(roverScale);

      const headRad = curRover.headingDeg * DEG2RAD;
      let ry: number;
      if (curRover.flightMode) {
        const minFlightY = groundMeshY + (Math.max(20.0, curRover.altitudeM ?? 600.0) / 1000.0) * exag;
        ry = Math.max(ryDem, minFlightY);
        obj.roverRig.root.quaternion.setFromEuler(
          new THREE.Euler(
            curRover.pitchDeg * DEG2RAD,
            -headRad,
            -curRover.rollDeg * DEG2RAD,
            'YXZ',
          ),
        );
        tmpUp.set(0, 1, 0);
      } else {
        // Sample the 4 wheel footprint corners on the actual GPU triangle mesh so all 6 wheels rest flush above regolith
        const sinH = Math.sin(headRad);
        const cosH = Math.cos(headRad);
        const hw = 0.62 * roverScale;
        const hl = 0.72 * roverScale;
        const yFL = sampleRenderedTerrainY(
          terrainPosArr,
          curRover.xKm + sinH * hl - cosH * hw,
          curRover.yKm + cosH * hl + sinH * hw,
        );
        const yFR = sampleRenderedTerrainY(
          terrainPosArr,
          curRover.xKm + sinH * hl + cosH * hw,
          curRover.yKm + cosH * hl - sinH * hw,
        );
        const yRL = sampleRenderedTerrainY(
          terrainPosArr,
          curRover.xKm - sinH * hl - cosH * hw,
          curRover.yKm - cosH * hl + sinH * hw,
        );
        const yRR = sampleRenderedTerrainY(
          terrainPosArr,
          curRover.xKm - sinH * hl + cosH * hw,
          curRover.yKm - cosH * hl - sinH * hw,
        );
        const yF = 0.5 * (yFL + yFR);
        const yR = 0.5 * (yRL + yRR);
        const yL = 0.5 * (yFL + yRL);
        const yRightSide = 0.5 * (yFR + yRR);
        const avgWheelY = 0.25 * (yFL + yFR + yRL + yRR);
        const maxWheelBias = Math.max(
          0,
          groundMeshY - avgWheelY,
          0.5 * (yF + yR) - avgWheelY,
          0.5 * (yFL + yRR) - avgWheelY,
          0.5 * (yFR + yRL) - avgWheelY,
        );
        ry = avgWheelY + maxWheelBias + 0.04 * roverScale;

        tmpFwd.set(sinH * 2 * hl, yF - yR, -cosH * 2 * hl);
        tmpRight.set(cosH * 2 * hw, yRightSide - yL, sinH * 2 * hw);
        tmpUp.crossVectors(tmpRight, tmpFwd);
        if (tmpUp.lengthSq() > 1e-8 && tmpUp.y > 0) {
          tmpUp.normalize();
        } else {
          tmpUp.set(curRover.nx * exag, curRover.nz, -curRover.ny * exag).normalize();
        }
        tmpFwd.set(sinH, 0, -cosH);
        tmpFwd.addScaledVector(tmpUp, -tmpFwd.dot(tmpUp)).normalize();
        tmpRight.crossVectors(tmpFwd, tmpUp).normalize();
        tmpMat.makeBasis(tmpRight, tmpUp, tmpVec.copy(tmpFwd).negate());
        obj.roverRig.root.quaternion.setFromRotationMatrix(tmpMat);
      }

      obj.roverRig.root.position.set(rx, ry, rz);

      if (mode === 'orbit' && hasManualMove) {
        cam.flyToActive = false;
        const followDamp = 1.0 - Math.exp(-8.0 * dtSec);
        cam.targetX += (rx - cam.targetX) * followDamp;
        cam.targetY += (ry - cam.targetY) * followDamp;
        cam.targetZ += (rz - cam.targetZ) * followDamp;
      }

      // VTOL thruster flames & light when airborne
      const thrusterActive = Boolean(curRover.flightMode);
      const flamePulse = 0.85 + 0.25 * Math.sin(nowMs * 0.032) + 0.2 * Math.max(0, combinedCtrl.vertical ?? 0);
      for (const plume of obj.roverRig.thrusterPlumes) {
        plume.visible = thrusterActive;
        if (thrusterActive) {
          plume.scale.set(1.0, flamePulse, 1.0);
        }
      }
      obj.roverRig.thrusterLight.intensity = thrusterActive ? 5.5 + Math.sin(nowMs * 0.025) * 2.0 : 0.0;

      const roverDistToCam = obj.camera.position.distanceTo(obj.roverRig.root.position);

      // Wheel rotation & front/rear steering angle
      for (const w of obj.roverRig.wheels) {
        w.rotation.x = -curRover.wheelPhaseRad;
      }
      const steerAngle = -combinedCtrl.turn * 0.35;
      for (const p of obj.roverRig.frontSteerPivots) p.rotation.y = steerAngle;
      for (const p of obj.roverRig.rearSteerPivots) p.rotation.y = -steerAngle * 0.55;

      // Telescoping mast height & visibility in Mast POV
      const curMastH = mastHeightRef.current;
      const mastVisualLen = 0.55 + Math.log10(1.0 + Math.max(0.5, curMastH)) * 0.85;
      obj.roverRig.mastPole.scale.y = mastVisualLen;
      obj.roverRig.mastPole.position.y = 0.68 + mastVisualLen * 0.5;
      obj.roverRig.mastPole.visible = mode !== 'mast';
      obj.roverRig.mastHead.position.y = 0.68 + mastVisualLen;
      obj.roverRig.mastHead.visible = mode !== 'mast';

      // Beacon & headlights
      const telem = roverTelemetryRef.current;
      const beaconMat = obj.roverRig.beaconMesh.material as THREE.MeshBasicMaterial;
      beaconMat.color.set(telem.sunVisible ? '#fbbf24' : telem.dteLinkActive ? '#22d3ee' : '#64748b');

      const lightsActive = curRover.headlightsOn || !telem.sunVisible;
      const lightPower = curRover.headlightsOn ? 8.5 : !telem.sunVisible ? 3.2 : 0.0;
      obj.roverRig.headlightLeft.intensity = lightPower;
      obj.roverRig.headlightRight.intensity = lightPower;
      for (const cone of obj.roverRig.headlightCones) {
        cone.visible = lightsActive;
      }

      // Solar wing & Earth DTE dish articulation (in local rover space)
      const [sx, sy, sz] = bodyAzElToThreeDir(curRover.lon, telem.sunAzDeg, telem.sunElDeg, exag);
      const [ex, ey, ez] = bodyAzElToThreeDir(curRover.lon, telem.earthAzDeg, telem.earthElDeg, exag);

      const invQuat = obj.roverRig.root.quaternion.clone().invert();
      const localSun = new THREE.Vector3(sx, sy, sz).applyQuaternion(invQuat).normalize();
      obj.roverRig.solarYaw.rotation.y = Math.atan2(localSun.x, localSun.z);
      obj.roverRig.solarPitch.rotation.x = telem.sunVisible
        ? -Math.asin(Math.max(-0.9, Math.min(0.9, localSun.y))) + Math.PI * 0.28
        : 0;

      const localEarth = new THREE.Vector3(ex, ey, ez).applyQuaternion(invQuat).normalize();
      obj.roverRig.dishYaw.rotation.y = Math.atan2(localEarth.x, localEarth.z);
      obj.roverRig.dishPitch.rotation.x = -Math.asin(Math.max(-0.95, Math.min(0.95, localEarth.y)));
      obj.roverRig.dteBeam.visible = telem.dteLinkActive && mode !== 'mast';

      // Locator ring pulse
      const pulse = 1.0 + Math.sin(nowMs * 0.005) * 0.14;
      obj.roverRig.locatorRing.scale.set(pulse, pulse, 1);
      obj.roverRig.locatorRing.visible = mode !== 'mast';

      // Waypoint animation
      if (curRover.waypoint) {
        const wy = sampleRenderedTerrainY(
          terrainPosArr,
          curRover.waypoint.xKm,
          curRover.waypoint.yKm,
        );
        obj.waypointGroup.visible = true;
        obj.waypointGroup.position.set(curRover.waypoint.xKm, wy + 0.08, -curRover.waypoint.yKm);
        const wpScale = Math.max(0.6, Math.min(3.5, roverDistToCam * 0.025));
        obj.waypointGroup.scale.setScalar(wpScale);
        obj.waypointGroup.children[2].rotation.y += dtSec * 2.2;
      } else {
        obj.waypointGroup.visible = false;
      }

      // Camera kinematics by mode (with direct 1:1 pointer drag & post-lerp rendered mesh collision safety)
      const damp = 1.0 - Math.exp(-9.0 * dtSec);
      const camDamp = pointerDownRef.current ? 1.0 : damp;
      if (mode === 'mast') {
        const mastLocalH = (0.72 + mastVisualLen) * roverScale;
        tmpCamPos.set(rx, ry, rz).addScaledVector(tmpUp, mastLocalH);
        const minMastY = sampleRenderedFloorY(terrainPosArr, tmpCamPos.x, tmpCamPos.z, 0.12) + 0.25;
        if (tmpCamPos.y < minMastY) tmpCamPos.y = minMastY;
        obj.camera.position.copy(tmpCamPos);

        const lookYaw = headRad + cam.mastYawOffsetRad;
        const cosP = Math.cos(cam.mastPitchOffsetRad);
        const sinP = Math.sin(cam.mastPitchOffsetRad);
        tmpLookTarget.set(
          tmpCamPos.x + Math.sin(lookYaw) * cosP * 20.0,
          tmpCamPos.y + sinP * 20.0,
          tmpCamPos.z - Math.cos(lookYaw) * cosP * 20.0,
        );
        obj.camera.lookAt(tmpLookTarget);
        if (Math.abs(obj.camera.fov - cam.mastFovDeg) > 0.2) {
          obj.camera.fov = cam.mastFovDeg;
          obj.camera.updateProjectionMatrix();
        }
      } else {
        if (Math.abs(obj.camera.fov - 52) > 0.2) {
          obj.camera.fov = 52;
          obj.camera.updateProjectionMatrix();
        }

        if (mode === 'chase') {
          const chaseAz = headRad + cam.chaseYawOffsetRad;
          const dist = cam.chaseDistanceKm;
          const el = cam.chaseLookElRad; // negative = high looking down at rover, positive = upward into peaks & stars
          const pivotX = rx;
          const pivotY = ry + 0.62 * roverScale;
          const pivotZ = rz;
          const camEl = Math.min(0.0, el);
          const hDist = Math.max(0.85, dist * Math.cos(camEl) * (el > 0 ? Math.max(0.55, Math.cos(el * 0.6)) : 1.0));
          const vDist = -dist * Math.sin(camEl);
          const sinAz = Math.sin(chaseAz);
          const cosAz = Math.cos(chaseAz);

          // Spring-arm terrain occlusion check so crater rims/ridges never hide the rover
          let safeFrac = 1.0;
          let requiredArmY = pivotY + vDist;
          if (el <= 0.12) {
            const maxLiftY = pivotY + vDist + dist * 0.62;
            for (const s of [0.3, 0.45, 0.6, 0.75, 0.9, 1.0]) {
              const sx = pivotX - sinAz * hDist * s;
              const sz = pivotZ + cosAz * hDist * s;
              const terrainAtS = sampleRenderedTerrainY(terrainPosArr, sx, -sz) + (0.2 + 0.3 * s);
              const rayY = pivotY + (requiredArmY - pivotY) * s;
              if (terrainAtS > rayY) {
                const liftEndY = pivotY + (terrainAtS - pivotY) / s;
                if (liftEndY <= maxLiftY) {
                  requiredArmY = Math.max(requiredArmY, liftEndY);
                } else {
                  requiredArmY = Math.max(requiredArmY, maxLiftY);
                  const newRayY = pivotY + (requiredArmY - pivotY) * s;
                  if (terrainAtS > newRayY) {
                    safeFrac = Math.min(safeFrac, Math.max(0.32, s - 0.12));
                  }
                }
              }
            }
          }

          const desiredCamY = pivotY + (requiredArmY - pivotY) * safeFrac;
          tmpCamPos.set(
            pivotX - sinAz * hDist * safeFrac,
            desiredCamY,
            pivotZ + cosAz * hDist * safeFrac,
          );
          const minCamY = sampleRenderedFloorY(terrainPosArr, tmpCamPos.x, tmpCamPos.z, 0.28) + 0.65;
          if (tmpCamPos.y < minCamY) tmpCamPos.y = minCamY;

          obj.camera.position.lerp(tmpCamPos, camDamp);
          const actualFloorY = sampleRenderedFloorY(
            terrainPosArr,
            obj.camera.position.x,
            obj.camera.position.z,
            0.25,
          ) + 0.65;
          if (obj.camera.position.y < actualFloorY) {
            obj.camera.position.y = actualFloorY;
          }

          const liftedY = Math.max(0, obj.camera.position.y - desiredCamY);
          const actualHDist = Math.hypot(obj.camera.position.x - pivotX, obj.camera.position.z - pivotZ);
          const upLookOffsetY = el > 0 ? actualHDist * Math.tan(Math.min(1.1, el)) + liftedY : 0;
          tmpLookTarget.set(pivotX, pivotY + upLookOffsetY, pivotZ);
          obj.camera.lookAt(tmpLookTarget);
        } else {
          // Orbit or Free mode
          if (cam.flyToActive) {
            cam.targetX += (cam.flyToTargetX - cam.targetX) * damp;
            cam.targetY += (cam.flyToTargetY - cam.targetY) * damp;
            cam.targetZ += (cam.flyToTargetZ - cam.targetZ) * damp;
            cam.orbitDistanceKm += (cam.flyToDistanceKm - cam.orbitDistanceKm) * damp;
            if (
              Math.hypot(cam.flyToTargetX - cam.targetX, cam.flyToTargetZ - cam.targetZ) < 0.08 &&
              Math.abs(cam.flyToDistanceKm - cam.orbitDistanceKm) < 0.15
            ) {
              cam.flyToActive = false;
            }
          } else if (mode === 'free' && cam.targetX === 0 && cam.targetZ === 0 && cam.orbitDistanceKm < 5) {
            cam.orbitDistanceKm = 95;
          }

          const d = cam.orbitDistanceKm;
          const cosP = Math.cos(cam.pitchRad);
          const sinP = Math.sin(cam.pitchRad);
          tmpCamPos.set(
            cam.targetX + d * cosP * Math.sin(cam.yawRad),
            cam.targetY + d * sinP,
            cam.targetZ + d * cosP * Math.cos(cam.yawRad),
          );
          const minCamY = sampleRenderedFloorY(terrainPosArr, tmpCamPos.x, tmpCamPos.z, 0.28) + 0.65;
          if (tmpCamPos.y < minCamY) tmpCamPos.y = minCamY;

          obj.camera.position.lerp(tmpCamPos, camDamp);
          const actualFloorY = sampleRenderedFloorY(
            terrainPosArr,
            obj.camera.position.x,
            obj.camera.position.z,
            0.25,
          ) + 0.65;
          if (obj.camera.position.y < actualFloorY) {
            obj.camera.position.y = actualFloorY;
          }
          tmpLookTarget.set(cam.targetX, cam.targetY, cam.targetZ);
          obj.camera.lookAt(tmpLookTarget);
        }
      }

      // Sky dome centered on camera for zero parallax
      obj.skyGroup.position.copy(obj.camera.position);

      // Rotate celestial sky sphere (Milky Way, DSO galaxies/nebulae, bright stars) to exact IAU MOON_ME frame
      const curEph = ephemerisRef.current;
      const curTIdx = Math.max(0, Math.min(curEph.n - 1, Math.round(timeIdxRef.current)));
      if (curTIdx !== lastSkyTimeIdx) {
        lastSkyTimeIdx = curTIdx;
        const stepUtc = ephemerisStepUtcIso(curEph.t0_utc, curEph.dt_hours, curTIdx);
        const jd = utcIsoToJulianDate(stepUtc);
        const m = computeIcrsToThreeSkyMatrixRowMajor(jd);
        skyRotMat4.set(m[0], m[1], m[2], 0, m[3], m[4], m[5], 0, m[6], m[7], m[8], 0, 0, 0, 0, 1);
        obj.celestialGroup.quaternion.setFromRotationMatrix(skyRotMat4);
      }
      obj.constellationLines.visible = showSkyGuideRef.current;

      // Keep visible 3D Sun/Earth globes at exact physical JPL Horizons Az/El
      obj.sunMesh.position.set(sx * 950, sy * 950, sz * 950);
      obj.sunCorona.position.copy(obj.sunMesh.position);
      obj.sunRays.position.copy(obj.sunMesh.position);
      obj.earthMesh.position.set(ex * 880, ey * 880, ez * 880);
      obj.earthMesh.rotation.y = ((curTIdx * curEph.dt_hours) / 24.0) * Math.PI * 2.0 + 0.4;
      obj.earthMat.uniforms.uSunDir.value.set(sx, sy, sz).normalize();
      obj.earthGlow.position.copy(obj.earthMesh.position);

      const eclipseFrac = telem.eclipseObscuredFrac;
      const sunVisFactor =
        telem.sunElDeg > -3.0 ? Math.max(0.45, 1.0 - eclipseFrac * 0.85) : 0.25;
      obj.sunLight.intensity = 2.4 * sunVisFactor;
      if (eclipseFrac > 0.05) {
        obj.sunLight.color.set('#fff5dc').lerp(new THREE.Color('#ea580c'), Math.min(1, eclipseFrac));
        (obj.sunCorona.material as THREE.SpriteMaterial).color
          .set('#fde68a')
          .lerp(new THREE.Color('#ef4444'), Math.min(1, eclipseFrac));
        (obj.sunRays.material as THREE.SpriteMaterial).color
          .set('#fef3c7')
          .lerp(new THREE.Color('#dc2626'), Math.min(1, eclipseFrac));
        (obj.sunRays.material as THREE.SpriteMaterial).opacity = Math.max(0.18, 0.72 * (1 - eclipseFrac * 0.75));
        (obj.sunMesh.material as THREE.MeshBasicMaterial).color
          .set('#fffbeb')
          .lerp(new THREE.Color('#b91c1c'), Math.min(1, eclipseFrac * 0.9));
      } else {
        obj.sunLight.color.set('#fff5dc');
        (obj.sunCorona.material as THREE.SpriteMaterial).color.set('#fde68a');
        (obj.sunRays.material as THREE.SpriteMaterial).color.set('#fef3c7');
        (obj.sunRays.material as THREE.SpriteMaterial).opacity = 0.72;
        (obj.sunMesh.material as THREE.MeshBasicMaterial).color.set('#fffbeb');
      }

      // Clamp key directional elevation floor so polar terrain shadows & relief stay legible under grazing Sun
      const keyElDeg = telem.sunVisible ? Math.max(telem.sunElDeg, 4.0) : Math.max(telem.sunElDeg, 1.5);
      const [kx, ky, kz] = bodyAzElToThreeDir(curRover.lon, telem.sunAzDeg, keyElDeg, exag);

      const shadowHalfExtent = mode === 'chase' || mode === 'mast' ? 38 : Math.max(48, Math.min(170, cam.orbitDistanceKm * 1.4));
      if (Math.abs(obj.sunLight.shadow.camera.right - shadowHalfExtent) > 4) {
        obj.sunLight.shadow.camera.left = -shadowHalfExtent;
        obj.sunLight.shadow.camera.right = shadowHalfExtent;
        obj.sunLight.shadow.camera.top = shadowHalfExtent;
        obj.sunLight.shadow.camera.bottom = -shadowHalfExtent;
        obj.sunLight.shadow.camera.updateProjectionMatrix();
      }
      const shadowCenterX = mode === 'chase' || mode === 'mast' ? rx : cam.targetX;
      const shadowCenterY = mode === 'chase' || mode === 'mast' ? ry : cam.targetY;
      const shadowCenterZ = mode === 'chase' || mode === 'mast' ? rz : cam.targetZ;
      obj.sunLight.target.position.set(shadowCenterX, shadowCenterY, shadowCenterZ);
      obj.sunLight.position.set(
        shadowCenterX + kx * 260,
        shadowCenterY + ky * 260,
        shadowCenterZ + kz * 260,
      );
      obj.rimFillLight.target.position.set(shadowCenterX, shadowCenterY, shadowCenterZ);
      obj.rimFillLight.position.set(
        shadowCenterX - kx * 220,
        shadowCenterY + 110,
        shadowCenterZ - kz * 220,
      );
      obj.earthLight.position.set(ex * 240, Math.max(8, ey * 240), ez * 240);
      obj.earthLight.intensity = telem.earthVisible ? 0.34 : 0.09;

      // Fade/hide site beacon pillars & crystals when rover is close (< 2.5 km) so they never occlude the rover
      for (const child of obj.beaconsGroup.children) {
        const ud = child.userData as {
          xKm?: number;
          yKm?: number;
          stem?: THREE.Mesh;
          crystal?: THREE.Mesh;
        };
        if (typeof ud.xKm !== 'number' || typeof ud.yKm !== 'number') continue;
        const distKm = Math.hypot(curRover.xKm - ud.xKm, curRover.yKm - ud.yKm);
        const fadeFactor = distKm < 2.5 ? Math.max(0, (distKm - 1.2) / 1.3) : 1;
        if (ud.stem) {
          ud.stem.visible = fadeFactor > 0.04;
          const stemMat = ud.stem.material as THREE.MeshBasicMaterial;
          const baseOp =
            typeof ud.stem.userData.baseOpacity === 'number' ? ud.stem.userData.baseOpacity : 0.65;
          stemMat.opacity = baseOp * fadeFactor;
        }
        if (ud.crystal) {
          ud.crystal.visible = fadeFactor > 0.04;
          const crystalMat = ud.crystal.material as THREE.MeshBasicMaterial;
          crystalMat.transparent = true;
          crystalMat.opacity = fadeFactor;
        }
      }

      // Project key site beacons to screen coordinates for crisp floating HUD badges (~15Hz)
      if (nowMs - lastLabelEmitMs >= 70) {
        lastLabelEmitMs = nowMs;
        const cw = canvas.clientWidth;
        const ch = canvas.clientHeight;
        if (cw > 0 && ch > 0) {
          const nextLabels: Array<{
            id: string;
            name: string;
            x: number;
            y: number;
            kind: 'selected' | 'compare' | 'hover';
          }> = [];
          const candidatesToShow: Array<{ site: SiteData; kind: 'selected' | 'compare' | 'hover' }> = [];
          candidatesToShow.push({ site: selectedSiteRef.current, kind: 'selected' });
          if (compareSiteRef.current && compareSiteRef.current.id !== selectedSiteRef.current.id) {
            candidatesToShow.push({ site: compareSiteRef.current, kind: 'compare' });
          }
          if (
            hoveredSiteIdRef.current &&
            hoveredSiteIdRef.current !== selectedSiteRef.current.id &&
            hoveredSiteIdRef.current !== compareSiteRef.current?.id
          ) {
            const hs = sitesRef.current.find((s) => s.id === hoveredSiteIdRef.current);
            if (hs) candidatesToShow.push({ site: hs, kind: 'hover' });
          }

          for (const item of candidatesToShow) {
            const s = item.site;
            if (!s.is_polar_dem || s.polar_x_km === null || s.polar_y_km === null) continue;
            if (Math.abs(s.polar_x_km) > TERRAIN_EXTENT_KM || Math.abs(s.polar_y_km) > TERRAIN_EXTENT_KM) continue;
            const by = sampleRenderedTerrainY(terrainPosArr, s.polar_x_km, s.polar_y_km);
            tmpProj.set(s.polar_x_km, by + 3.2, -s.polar_y_km).project(obj.camera);
            if (tmpProj.z > -1 && tmpProj.z < 1) {
              const sxPx = (tmpProj.x * 0.5 + 0.5) * cw;
              const syPx = (-tmpProj.y * 0.5 + 0.5) * ch;
              if (sxPx >= 16 && sxPx <= cw - 16 && syPx >= 16 && syPx <= ch - 16) {
                nextLabels.push({ id: s.id, name: s.short_name, x: sxPx, y: syPx, kind: item.kind });
              }
            }
          }
          setSiteLabelsScreen(nextLabels);

          const guideOn = showSkyGuideRef.current;
          if (guideOn) {
            lastSkyGuideActive = true;
            const nextSkyLabels: Array<{
              id: string;
              label: string;
              kind: 'galaxy' | 'nebula' | 'star' | 'body';
              x: number;
              y: number;
            }> = [];
            const tryAddSkyLabel = (
              id: string,
              label: string,
              kind: 'galaxy' | 'nebula' | 'star' | 'body',
              wx: number,
              wy: number,
              wz: number,
            ) => {
              tmpProj.set(wx, wy, wz).project(obj.camera);
              if (tmpProj.z <= -1 || tmpProj.z >= 1) return;
              const px = (tmpProj.x * 0.5 + 0.5) * cw;
              const py = (-tmpProj.y * 0.5 + 0.5) * ch;
              if (px < 48 || px > cw - 48 || py < 56 || py > ch - 78) return;
              if (
                nextSkyLabels.some(
                  (existing) => Math.abs(existing.x - px) < 76 && Math.abs(existing.y - py) < 22,
                )
              ) {
                return;
              }
              nextSkyLabels.push({ id, label, kind, x: px, y: py });
            };

            tryAddSkyLabel(
              'earth_body',
              'Earth',
              'body',
              obj.camera.position.x + ex * 880,
              obj.camera.position.y + ey * 880,
              obj.camera.position.z + ez * 880,
            );
            tryAddSkyLabel(
              'sun_body',
              'Sun',
              'body',
              obj.camera.position.x + sx * 950,
              obj.camera.position.y + sy * 950,
              obj.camera.position.z + sz * 950,
            );

            for (const anchor of SKY_GUIDE_ANCHORS) {
              const [ax, ay, az] = raDecToUnitVec(anchor.raDeg, anchor.decDeg);
              skyAnchorVec
                .set(ax * 1320, ay * 1320, az * 1320)
                .applyQuaternion(obj.celestialGroup.quaternion);
              if (skyAnchorVec.y < -160) continue;
              tryAddSkyLabel(
                anchor.id,
                anchor.label,
                anchor.kind,
                obj.camera.position.x + skyAnchorVec.x,
                obj.camera.position.y + skyAnchorVec.y,
                obj.camera.position.z + skyAnchorVec.z,
              );
            }
            setSkyLabelsScreen(nextSkyLabels);
          } else if (lastSkyGuideActive) {
            lastSkyGuideActive = false;
            setSkyLabelsScreen([]);
          }
        }
      }

      renderer.render(scene, camera);
    };

    rafId = window.requestAnimationFrame(animate);

    return () => {
      window.cancelAnimationFrame(rafId);
      ro?.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('dblclick', onDblClick);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);

      scene.traverse((child) => {
        if (
          child instanceof THREE.Mesh ||
          child instanceof THREE.Line ||
          child instanceof THREE.Points
        ) {
          child.geometry?.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach((m) => m.dispose());
          } else {
            child.material?.dispose();
          }
        } else if (child instanceof THREE.Sprite) {
          child.material?.dispose();
        }
      });
      regolithTex.dispose();
      sunCoronaTex?.dispose();
      sunRaysTex?.dispose();
      earthRig.disposeTextures();
      earthGlowTex?.dispose();
      renderer.dispose();
      sceneObjectsRef.current = null;
    };
  }, []);

  // Update 250x250 terrain heights & colors whenever DEM, activeLayer, polarMaps, or verticalExaggeration changes
  useEffect(() => {
    const obj = sceneObjectsRef.current;
    if (!obj) return;
    const geo = obj.terrainGeo;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const colAttr = geo.getAttribute('color') as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    const exag = Math.max(1, verticalExaggeration);
    const eMin = demPatch?.elevMinM ?? -5500;
    const eMax = demPatch?.elevMaxM ?? 7000;
    const eSpan = Math.max(1, eMax - eMin);
    const tmpCol = new THREE.Color();

    for (let r = 0; r < TERRAIN_SEG_N; r++) {
      const vFrac = r / (TERRAIN_SEG_N - 1);
      const yKm = TERRAIN_EXTENT_KM - vFrac * (TERRAIN_EXTENT_KM * 2.0);
      for (let c = 0; c < TERRAIN_SEG_N; c++) {
        const uFrac = c / (TERRAIN_SEG_N - 1);
        const xKm = -TERRAIN_EXTENT_KM + uFrac * (TERRAIN_EXTENT_KM * 2.0);
        const vi = r * TERRAIN_SEG_N + c;

        const surf = sampleTerrainHeightAndNormal(xKm, yKm, clientDem, demPatch);
        posArr[vi * 3 + 1] = (surf.elevM / 1000.0) * exag;

        const eNorm = Math.max(0, Math.min(1, (surf.elevM - eMin) / eSpan));

        if (activeLayer === 'regolith') {
          // Lunar hypsometry: deep slate-blue basins (#3b475c) -> highlands (#e2e8f0) -> peaks (#f8fafc) + slope relief
          let r: number;
          let g: number;
          let b: number;
          if (eNorm < 0.42) {
            const t = eNorm / 0.42;
            r = 0.231 + t * (0.58 - 0.231);
            g = 0.278 + t * (0.639 - 0.278);
            b = 0.361 + t * (0.722 - 0.361);
          } else if (eNorm < 0.78) {
            const t = (eNorm - 0.42) / 0.36;
            r = 0.58 + t * (0.886 - 0.58);
            g = 0.639 + t * (0.91 - 0.639);
            b = 0.722 + t * (0.941 - 0.722);
          } else {
            const t = (eNorm - 0.78) / 0.22;
            r = 0.886 + t * (0.973 - 0.886);
            g = 0.91 + t * (0.98 - 0.91);
            b = 0.941 + t * (0.988 - 0.941);
          }
          const slopeShade = 1.0 - Math.min(1, surf.slopeDeg / 36) * 0.16;
          tmpCol.setRGB(r * slopeShade, g * slopeShade, b * slopeShade, THREE.SRGBColorSpace);
        } else if (activeLayer === 'slope') {
          if (surf.slopeDeg <= 5.0) {
            tmpCol.setRGB(0.08 + eNorm * 0.08, 0.72 + eNorm * 0.16, 0.48 + eNorm * 0.1, THREE.SRGBColorSpace);
          } else if (surf.slopeDeg <= 15.0) {
            tmpCol.setRGB(0.84 + eNorm * 0.1, 0.54 + eNorm * 0.12, 0.16, THREE.SRGBColorSpace);
          } else {
            tmpCol.setRGB(0.76 + eNorm * 0.14, 0.2, 0.26, THREE.SRGBColorSpace);
          }
        } else if (activeLayer === 'sun') {
          const cell = decodedPolarMaps
            ? samplePolarMapCell(decodedPolarMaps, 'solar_heatmap', xKm, yKm)
            : null;
          if (cell && !cell.isNoData && cell.valuePct !== null) {
            const [sr, sg, sb] = valueToSolarRgb(cell.valuePct / 100.0);
            tmpCol.setRGB(sr / 255, sg / 255, sb / 255, THREE.SRGBColorSpace);
          } else {
            const [sr, sg, sb] = valueToSolarRgb(eNorm * 0.85);
            tmpCol.setRGB(sr / 255, sg / 255, sb / 255, THREE.SRGBColorSpace);
          }
        } else if (activeLayer === 'earth') {
          const cell = decodedPolarMaps
            ? samplePolarMapCell(decodedPolarMaps, 'earth_heatmap', xKm, yKm)
            : null;
          if (cell && !cell.isNoData && cell.valuePct !== null) {
            const [er, eg, eb] = valueToEarthRgb(cell.valuePct / 100.0);
            tmpCol.setRGB(er / 255, eg / 255, eb / 255, THREE.SRGBColorSpace);
          } else {
            const [er, eg, eb] = valueToEarthRgb(Math.max(0, Math.min(1, eNorm * 0.75 + (yKm > 0 ? 0.15 : 0))));
            tmpCol.setRGB(er / 255, eg / 255, eb / 255, THREE.SRGBColorSpace);
          }
        } else {
          // Composite: joint solar+Earth visibility ridges + cryogenic PSR blue + >15 deg crimson steepness
          const sunCell = decodedPolarMaps
            ? samplePolarMapCell(decodedPolarMaps, 'solar_heatmap', xKm, yKm)
            : null;
          const earthCell = decodedPolarMaps
            ? samplePolarMapCell(decodedPolarMaps, 'earth_heatmap', xKm, yKm)
            : null;
          const sunVal = sunCell && !sunCell.isNoData && sunCell.valuePct !== null ? sunCell.valuePct / 100 : eNorm;
          const earthVal =
            earthCell && !earthCell.isNoData && earthCell.valuePct !== null ? earthCell.valuePct / 100 : eNorm * 0.7;
          const jointVal = Math.min(sunVal, earthVal);

          if (surf.slopeDeg > 15.0) {
            tmpCol.setRGB(0.68, 0.18 + eNorm * 0.1, 0.24, THREE.SRGBColorSpace);
          } else if (sunVal < 0.05) {
            tmpCol.setRGB(0.08, 0.14, 0.34, THREE.SRGBColorSpace);
          } else if (jointVal >= 0.42) {
            tmpCol.setRGB(0.95, 0.78, 0.28, THREE.SRGBColorSpace);
          } else {
            const base = 0.22 + eNorm * 0.38;
            tmpCol.setRGB(base * 0.85, base * 0.96, Math.min(1, base * 1.15), THREE.SRGBColorSpace);
          }
        }

        colArr[vi * 3] = tmpCol.r;
        colArr[vi * 3 + 1] = tmpCol.g;
        colArr[vi * 3 + 2] = tmpCol.b;
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
  }, [demPatch, clientDem, decodedPolarMaps, activeLayer, verticalExaggeration]);

  // Update 3D traverse breadcrumb ribbon flushed above rendered mesh
  useEffect(() => {
    const obj = sceneObjectsRef.current;
    if (!obj) return;
    const pts = roverState.trail;
    const exag = Math.max(1, verticalExaggeration);
    const terrainPosArr = obj.terrainGeo.getAttribute('position').array as Float32Array;
    const arr = new Float32Array(pts.length * 3);
    for (let i = 0; i < pts.length; i++) {
      const [tx, ty, tz] = polarToThreeCoords(pts[i].xKm, pts[i].yKm, pts[i].elevM, exag);
      const meshY = sampleRenderedTerrainY(terrainPosArr, pts[i].xKm, pts[i].yKm);
      arr[i * 3] = tx;
      arr[i * 3 + 1] = Math.max(ty, meshY) + 0.14;
      arr[i * 3 + 2] = tz;
    }
    obj.trailLine.geometry.dispose();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    obj.trailLine.geometry = g;
  }, [roverState.trail, verticalExaggeration, clientDem, demPatch]);

  // Update draped Artemis III (2024) boundary loops
  useEffect(() => {
    const obj = sceneObjectsRef.current;
    if (!obj) return;
    while (obj.artemisGroup.children.length > 0) {
      const ch = obj.artemisGroup.children.pop()!;
      if (ch instanceof THREE.Line) {
        ch.geometry.dispose();
        (ch.material as THREE.Material).dispose();
      }
    }
    const terrainPosArr = obj.terrainGeo.getAttribute('position').array as Float32Array;

    for (const reg of artemisRegions) {
      if (!isRegionInPolarFrame(reg, TERRAIN_EXTENT_KM)) continue;
      const rings = getArtemisPolarRingsKm(reg);
      for (const ring of rings) {
        if (ring.length < 3) continue;
        const pts: number[] = [];
        for (let i = 0; i < ring.length; i++) {
          const [xKm, yKm] = ring[i];
          const [nxKm, nyKm] = ring[(i + 1) % ring.length];
          const segDist = Math.hypot(nxKm - xKm, nyKm - yKm);
          const sub = Math.max(1, Math.min(12, Math.ceil(segDist / 1.5)));
          for (let s = 0; s < sub; s++) {
            const t = s / sub;
            const px = xKm + (nxKm - xKm) * t;
            const py = yKm + (nyKm - yKm) * t;
            const ty = sampleRenderedTerrainY(terrainPosArr, px, py);
            pts.push(px, ty + 0.18, -py);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
        const mat = new THREE.LineBasicMaterial({
          color: '#38bdf8',
          transparent: true,
          opacity: 0.72,
        });
        obj.artemisGroup.add(new THREE.LineLoop(geo, mat));
      }
    }
  }, [artemisRegions, clientDem, demPatch, verticalExaggeration]);

  // Update clickable 3D site beacons
  useEffect(() => {
    const obj = sceneObjectsRef.current;
    if (!obj) return;
    while (obj.beaconsGroup.children.length > 0) {
      const ch = obj.beaconsGroup.children.pop()!;
      ch.traverse((sub) => {
        if (sub instanceof THREE.Mesh) {
          sub.geometry.dispose();
          (sub.material as THREE.Material).dispose();
        }
      });
    }
    obj.beaconHitMeshes = [];

    const terrainPosArr = obj.terrainGeo.getAttribute('position').array as Float32Array;
    const allBeaconSites = sites.some((s) => s.id === selectedSite.id) ? sites : [...sites, selectedSite];
    for (const site of allBeaconSites) {
      if (!site.is_polar_dem || site.polar_x_km === null || site.polar_y_km === null) continue;
      if (Math.abs(site.polar_x_km) > TERRAIN_EXTENT_KM || Math.abs(site.polar_y_km) > TERRAIN_EXTENT_KM) continue;

      const isSelected = site.id === selectedSite.id;
      const isCompare = compareSite?.id === site.id;
      const isHovered = site.id === hoveredSiteId;
      const color = isSelected ? '#fbbf24' : isCompare ? '#38bdf8' : isHovered ? '#e2e8f0' : '#94a3b8';

      const by = sampleRenderedTerrainY(terrainPosArr, site.polar_x_km, site.polar_y_km);

      const g = new THREE.Group();
      g.position.set(site.polar_x_km, by, -site.polar_y_km);

      const stemH = isSelected ? 3.2 : isCompare ? 2.6 : 1.9;
      const stemBaseOp = isSelected ? 0.9 : 0.65;
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.08, stemH, 8),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: stemBaseOp }),
      );
      stem.position.y = stemH * 0.5;
      stem.userData = { baseOpacity: stemBaseOp };

      const crystal = new THREE.Mesh(
        new THREE.OctahedronGeometry(isSelected ? 0.55 : 0.38, 0),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 }),
      );
      crystal.position.y = stemH + 0.35;
      crystal.userData = { siteId: site.id };

      const hitSphere = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      );
      hitSphere.position.y = stemH * 0.7;
      hitSphere.userData = { siteId: site.id };

      const ringInner = isSelected ? 1.45 : isCompare ? 1.1 : 0.85;
      const ringOuter = isSelected ? 1.85 : isCompare ? 1.45 : 1.15;
      const baseRing = new THREE.Mesh(
        new THREE.RingGeometry(ringInner, ringOuter, 32),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      baseRing.rotation.x = -Math.PI * 0.5;
      baseRing.position.y = 0.08;

      g.userData = { xKm: site.polar_x_km, yKm: site.polar_y_km, stem, crystal };
      g.add(stem, crystal, hitSphere, baseRing);
      obj.beaconsGroup.add(g);
      obj.beaconHitMeshes.push(hitSphere, crystal);
    }
  }, [sites, selectedSite.id, compareSite?.id, hoveredSiteId, clientDem, demPatch, verticalExaggeration]);

  const setVirtualDrive = (patch: Partial<RoverControls>) => {
    virtualControlsRef.current = { ...virtualControlsRef.current, ...patch };
  };

  const resetVirtualDrive = () => {
    virtualControlsRef.current = { forward: 0, turn: 0, vertical: 0, brake: false, boost: false };
  };

  const formatSpeed = (mps: number) => {
    const absMps = Math.abs(mps);
    if (absMps >= 1000) return `${(absMps / 1000).toFixed(2)} km/s`;
    return absMps >= 100 ? `${Math.round(absMps)} m/s` : `${absMps.toFixed(1)} m/s`;
  };

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      aria-label="Interactive 3D Lunar South Pole Terrain and Rover Simulator"
      className={`relative overflow-hidden rounded-2xl border border-slate-700/70 bg-slate-950 shadow-2xl outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${className}`}
    >
      <canvas
        ref={canvasRef}
        tabIndex={0}
        aria-label="Interactive 3D Lunar South Pole Canvas"
        className="block h-full w-full min-h-[420px] select-none touch-none outline-none"
      />

      {!webglReady && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 p-6 text-center text-slate-200">
          <Compass className="mb-3 h-10 w-10 text-cyan-400" />
          <p className="text-base font-semibold text-white">
            3D WebGL viewport fallback active
          </p>
          <p className="mt-1 max-w-md text-xs text-slate-300">
            Hardware WebGL context is unavailable in this environment. Rover telemetry and terrain physics continue operating at{' '}
            {Math.abs(roverTelemetry.lat).toFixed(2)}°S,{' '}
            {Math.abs(roverTelemetry.lon).toFixed(2)}°{roverTelemetry.lon < 0 ? 'W' : 'E'} (
            {Math.round(roverTelemetry.elevM).toLocaleString('en-US')} m).
          </p>
        </div>
      )}

      {/* Floating deep-sky astronomical labels (when Sky Guide is enabled) */}
      {webglReady &&
        showSkyGuide &&
        skyLabelsScreen.map((lbl) => (
          <div
            key={`sky-${lbl.id}`}
            style={{ left: `${lbl.x}px`, top: `${lbl.y}px` }}
            className={`pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border px-2 py-0.5 text-xs font-medium backdrop-blur-sm ${
              lbl.kind === 'galaxy'
                ? 'border-fuchsia-400/50 bg-slate-950/75 text-fuchsia-200'
                : lbl.kind === 'nebula'
                  ? 'border-rose-400/50 bg-slate-950/75 text-rose-200'
                  : lbl.kind === 'body'
                    ? 'border-amber-400/60 bg-slate-950/80 text-amber-200'
                    : 'border-cyan-400/45 bg-slate-950/70 text-cyan-200'
            }`}
          >
            {lbl.label}
          </div>
        ))}

      {/* Floating 3D site labels */}
      {webglReady &&
        siteLabelsScreen.map((lbl) => (
          <button
            key={lbl.id}
            type="button"
            onClick={() => onSelectSite?.(lbl.id)}
            style={{ left: `${lbl.x}px`, top: `${lbl.y}px` }}
            className={`absolute -translate-x-1/2 -translate-y-full rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-lg backdrop-blur-md transition ${
              lbl.kind === 'selected'
                ? 'border-amber-400/80 bg-slate-950/90 text-amber-200'
                : lbl.kind === 'compare'
                  ? 'border-sky-400/80 bg-slate-950/90 text-sky-200'
                  : 'border-slate-500/80 bg-slate-950/85 text-slate-100'
            }`}
          >
            {lbl.name}
          </button>
        ))}

      {/* 1st-Person Mast POV Reticle HUD */}
      {cameraMode === 'mast' && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          <div className="relative h-56 w-80 rounded-2xl border border-cyan-400/35 bg-cyan-950/10 backdrop-blur-[1px]">
            <div className="absolute left-3 top-2 flex items-center gap-2 text-xs font-mono text-cyan-200">
              <span>HDG {Math.round(roverState.headingDeg).toString().padStart(3, '0')}°</span>
              <span>·</span>
              <span>MAST {mastHeightM.toFixed(1)} m</span>
            </div>
            <div className="absolute right-3 top-2 text-xs font-mono text-amber-200">
              PITCH {roverState.pitchDeg >= 0 ? '+' : ''}
              {roverState.pitchDeg.toFixed(1)}°
            </div>
            <Crosshair className="absolute left-1/2 top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 text-cyan-300/75" />
            <div className="absolute bottom-2 left-3 text-xs font-mono text-amber-300">
              SUN {roverTelemetry.sunElDeg.toFixed(1)}°
            </div>
            <div className="absolute bottom-2 right-3 text-xs font-mono text-sky-300">
              EARTH {roverTelemetry.earthElDeg.toFixed(1)}°
            </div>
          </div>
        </div>
      )}

      {/* Top-Left Live Rover Telemetry Pill */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-2">
        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs text-slate-100 shadow-lg backdrop-blur-md">
          <span className="inline-block h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
          <span className="font-semibold text-cyan-200">
            Live 3D · {roverTelemetry.terrainSource === 'LOLA_240M' ? 'LOLA 240 m' : '1.2 km DEM'}
          </span>
          <span className="text-slate-400">|</span>
          <span className="font-mono text-slate-200">
            {Math.abs(roverTelemetry.lat).toFixed(2)}°S, {Math.abs(roverTelemetry.lon).toFixed(2)}°
            {roverTelemetry.lon < 0 ? 'W' : 'E'}
          </span>
          <span className="text-slate-400">·</span>
          <span className="font-mono text-slate-200">
            {Math.round(roverTelemetry.elevM).toLocaleString('en-US')} m
          </span>
          {roverState.flightMode && (
            <>
              <span className="text-slate-400">·</span>
              <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 font-mono font-semibold text-cyan-200">
                ALT +{Math.round(roverState.altitudeM ?? 0).toLocaleString('en-US')} m
              </span>
            </>
          )}
          <span className="text-slate-400">·</span>
          <span
            className={`font-mono font-semibold ${
              roverTelemetry.slopeDeg <= 5
                ? 'text-emerald-300'
                : roverTelemetry.slopeDeg <= 15
                  ? 'text-amber-300'
                  : 'text-rose-300'
            }`}
          >
            Slope {roverTelemetry.slopeDeg.toFixed(1)}°
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-950/80 px-3 py-1.5 text-xs shadow-lg backdrop-blur-md">
          <Sun className={`h-3.5 w-3.5 ${roverTelemetry.sunVisible ? 'text-amber-300' : 'text-slate-500'}`} />
          <span className="font-mono text-slate-200">
            {roverTelemetry.solarPowerTrackingPct.toFixed(0)}% Array
          </span>
          <span className="text-slate-500">|</span>
          <Radio className={`h-3.5 w-3.5 ${roverTelemetry.dteLinkActive ? 'text-cyan-300' : 'text-rose-400'}`} />
          <span className={`font-semibold ${roverTelemetry.dteLinkActive ? 'text-cyan-200' : 'text-rose-300'}`}>
            {roverTelemetry.dteLinkActive ? 'Link: Clear' : 'Link: Blocked'}
          </span>
        </div>
      </div>

      {/* Top-Right Camera Mode & Site Action Bar */}
      <div className="absolute right-3 top-3 flex flex-wrap items-center justify-end gap-1.5">
        <div
          role="group"
          aria-label="3D Camera Mode"
          className="flex items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/80 p-1 shadow-lg backdrop-blur-md"
        >
          {CAMERA_OPTIONS.map((opt) => {
            const active = cameraMode === opt.id;
            const Icon =
              opt.id === 'chase'
                ? Navigation
                : opt.id === 'mast'
                  ? Eye
                  : opt.id === 'orbit'
                    ? Orbit
                    : Camera;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onCameraModeChange?.(opt.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  active
                    ? 'bg-cyan-500/25 text-cyan-100 ring-1 ring-cyan-400/70'
                    : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-pressed={invertY}
          onClick={() => setInvertY((v) => !v)}
          title="Flip vertical mouse drag direction"
          className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md transition ${
            invertY
              ? 'border-cyan-400/70 bg-cyan-950/80 text-cyan-100'
              : 'border-slate-700/80 bg-slate-950/80 text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          <span>Invert Y</span>
        </button>

        <button
          type="button"
          aria-pressed={showSkyGuide}
          onClick={() => setShowSkyGuide((v) => !v)}
          title="Show constellation lines and real galaxy/star annotations"
          className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md transition ${
            showSkyGuide
              ? 'border-fuchsia-400/70 bg-fuchsia-950/80 text-fuchsia-100'
              : 'border-slate-700/80 bg-slate-950/80 text-slate-300 hover:bg-slate-900 hover:text-white'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Sky Guide</span>
        </button>

        <button
          type="button"
          onClick={handleFlyToSelectedSite}
          title="Fly camera to selected target site"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-950/80 px-2.5 py-1.5 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-md transition hover:border-amber-400/70 hover:bg-slate-900"
        >
          <MapPin className="h-3.5 w-3.5" />
          <span>Fly to Site</span>
        </button>

        {onDeployRoverToSite && (
          <button
            type="button"
            onClick={() => onDeployRoverToSite(selectedSite)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-500/50 bg-cyan-950/75 px-2.5 py-1.5 text-xs font-semibold text-cyan-100 shadow-lg backdrop-blur-md transition hover:bg-cyan-900/90"
          >
            <Crosshair className="h-3.5 w-3.5" />
            <span>Deploy Here</span>
          </button>
        )}
      </div>

      {/* Bottom-Left Surface Overlay Layer Selector */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1.5">
        <div
          role="group"
          aria-label="3D Surface Overlay Layer"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-700/80 bg-slate-950/80 p-1 shadow-lg backdrop-blur-md"
        >
          <span className="inline-flex items-center gap-1 px-2 text-xs font-medium text-slate-300">
            <Layers className="h-3.5 w-3.5 text-cyan-400" />
            <span>Layer</span>
          </span>
          {LAYER_OPTIONS.map((layer) => (
            <button
              key={layer.id}
              type="button"
              onClick={() => onChangeLayer?.(layer.id)}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                activeLayer === layer.id
                  ? 'bg-amber-500/25 text-amber-100 ring-1 ring-amber-400/70'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/75 px-3 py-1 text-xs text-slate-300 backdrop-blur-md">
          WASD move · F fly · E/Q altitude · Shift boost · Drag look · Dbl-Click waypoint
        </div>
      </div>

      {/* Bottom-Right Rover Controls: Gear Toggle + Virtual Drive Pad */}
      <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
        {roverState.waypoint && (
          <button
            type="button"
            onClick={handleClearWaypoint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-amber-400/60 bg-slate-950/85 px-2.5 py-1 text-xs font-medium text-amber-200 shadow-lg backdrop-blur-md hover:bg-slate-900"
          >
            <Navigation className="h-3.5 w-3.5 animate-pulse" />
            <span>
              Autopilot ({Math.hypot(roverState.waypoint.xKm - roverState.xKm, roverState.waypoint.yKm - roverState.yKm).toFixed(2)} km)
            </span>
            <X className="h-3.5 w-3.5 text-slate-400" />
          </button>
        )}

        <div className="flex items-end gap-2">
          {/* Speed Gear + Headlights + Speedometer */}
          <div className="flex flex-col items-end gap-1.5 rounded-xl border border-slate-700/80 bg-slate-950/80 p-2 text-xs shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-slate-200">{formatSpeed(roverState.speedMps)}</span>
              <span className="text-slate-500">·</span>
              <span className="font-mono text-cyan-200">
                {roverState.distanceTraveledKm.toFixed(2)} km
              </span>
            </div>
            <div className="flex items-center gap-1">
              {GEAR_OPTIONS.map((gear) => (
                <button
                  key={gear}
                  type="button"
                  onClick={() => handleCycleGear(gear)}
                  className={`rounded-lg px-2 py-1 text-xs font-semibold transition ${
                    roverState.gearMultiplier === gear
                      ? 'bg-cyan-500/30 text-cyan-100 ring-1 ring-cyan-400/70'
                      : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  {gear}×
                </button>
              ))}
              <button
                type="button"
                aria-label="Toggle hopper flight mode"
                aria-pressed={Boolean(roverState.flightMode)}
                onClick={handleToggleFlight}
                className={`ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
                  roverState.flightMode
                    ? 'bg-sky-500/35 text-sky-100 ring-1 ring-sky-400/80'
                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Rocket className="h-3.5 w-3.5" />
                <span>{roverState.flightMode ? 'Land' : 'Fly'}</span>
              </button>
              <button
                type="button"
                aria-label="Toggle rover PSR headlights"
                onClick={handleToggleHeadlights}
                className={`ml-1 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium transition ${
                  roverState.headlightsOn
                    ? 'bg-amber-500/30 text-amber-100 ring-1 ring-amber-400/70'
                    : 'bg-slate-900/90 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Flashlight className="h-3.5 w-3.5" />
                <span>LED</span>
              </button>
            </div>
          </div>

          {roverState.flightMode && (
            <div
              aria-label="Hopper Altitude Controls"
              className="flex flex-col gap-1 rounded-xl border border-sky-500/50 bg-slate-950/85 p-1.5 shadow-lg backdrop-blur-md"
            >
              <button
                type="button"
                aria-label="Ascend altitude"
                onPointerDown={() => setVirtualDrive({ vertical: 1 })}
                onPointerUp={resetVirtualDrive}
                onPointerLeave={resetVirtualDrive}
                className="flex h-8 items-center justify-center gap-1 rounded-lg bg-sky-900/80 px-2 text-xs font-semibold text-sky-100 hover:bg-sky-700 active:bg-sky-600"
              >
                <ChevronUp className="h-4 w-4" />
                <span>Climb</span>
              </button>
              <button
                type="button"
                aria-label="Descend altitude"
                onPointerDown={() => setVirtualDrive({ vertical: -1 })}
                onPointerUp={resetVirtualDrive}
                onPointerLeave={resetVirtualDrive}
                className="flex h-8 items-center justify-center gap-1 rounded-lg bg-slate-800/90 px-2 text-xs font-semibold text-slate-100 hover:bg-sky-800 active:bg-sky-700"
              >
                <ChevronDown className="h-4 w-4" />
                <span>Drop</span>
              </button>
            </div>
          )}

          {/* Virtual Driving Pad */}
          <div
            aria-label="Virtual Rover Controls"
            className="grid grid-cols-3 gap-1 rounded-xl border border-slate-700/80 bg-slate-950/80 p-1.5 shadow-lg backdrop-blur-md"
          >
            <div />
            <button
              type="button"
              aria-label="Drive forward"
              onPointerDown={() => setVirtualDrive({ forward: 1 })}
              onPointerUp={resetVirtualDrive}
              onPointerLeave={resetVirtualDrive}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-slate-100 hover:bg-cyan-600/70 active:bg-cyan-500"
            >
              <ArrowUp className="h-4 w-4" />
            </button>
            <div />

            <button
              type="button"
              aria-label="Turn left"
              onPointerDown={() => setVirtualDrive({ turn: -1 })}
              onPointerUp={resetVirtualDrive}
              onPointerLeave={resetVirtualDrive}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-slate-100 hover:bg-cyan-600/70 active:bg-cyan-500"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="Brake rover"
              onPointerDown={() => setVirtualDrive({ brake: true })}
              onPointerUp={resetVirtualDrive}
              onPointerLeave={resetVirtualDrive}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-950/80 text-rose-200 hover:bg-rose-800/80 active:bg-rose-700"
            >
              <Octagon className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Turn right"
              onPointerDown={() => setVirtualDrive({ turn: 1 })}
              onPointerUp={resetVirtualDrive}
              onPointerLeave={resetVirtualDrive}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-slate-100 hover:bg-cyan-600/70 active:bg-cyan-500"
            >
              <ArrowRight className="h-4 w-4" />
            </button>

            <div />
            <button
              type="button"
              aria-label="Drive reverse"
              onPointerDown={() => setVirtualDrive({ forward: -1 })}
              onPointerUp={resetVirtualDrive}
              onPointerLeave={resetVirtualDrive}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800/90 text-slate-100 hover:bg-cyan-600/70 active:bg-cyan-500"
            >
              <ArrowDown className="h-4 w-4" />
            </button>
            <div />
          </div>
        </div>
      </div>
    </div>
  );
};

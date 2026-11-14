/**
 * Astronomical J2000 ICRS star catalog, deep-sky galaxies/nebulae, Galactic coordinate transforms,
 * and IAU lunar orientation math (ICRS J2000 -> MOON_ME -> Three.js sky coordinates).
 */

const DEG2RAD = Math.PI / 180.0;
const RAD2DEG = 180.0 / Math.PI;

export interface CatalogStar {
  id: string;
  name: string;
  raDeg: number;
  decDeg: number;
  vmag: number;
  bv: number;
  isAnchor?: boolean;
}

export interface DeepSkyObject {
  id: string;
  name: string;
  kind: 'galaxy' | 'nebula' | 'cluster';
  raDeg: number;
  decDeg: number;
  /** Angular display radius in scene sky degrees. */
  radiusDeg: number;
  /** Major/minor axial ratio (1.0 = circular, < 1.0 = tilted spiral/irregular). */
  axisRatio: number;
  /** Position angle on sky plane (radians). */
  rollRad: number;
  coreRgb: [number, number, number];
  outerRgb: [number, number, number];
  accentRgb: [number, number, number];
  intensity: number;
}

export interface ConstellationSegment {
  constellation: string;
  fromId: string;
  toId: string;
}

/**
 * Curated Hipparcos / Yale Bright Star J2000 catalog covering bright Southern Polar,
 * Circumpolar, Ecliptic, and Northern anchor stars visible across lunar exploration.
 */
export const BRIGHT_STARS: CatalogStar[] = [
  // Brightest 21+ sky anchors & navigational beacons
  { id: 'sirius', name: 'Sirius (α CMa)', raDeg: 101.287, decDeg: -16.716, vmag: -1.46, bv: 0.0, isAnchor: true },
  { id: 'canopus', name: 'Canopus (α Car)', raDeg: 95.988, decDeg: -52.696, vmag: -0.74, bv: 0.15, isAnchor: true },
  { id: 'rigil_kentaurus', name: 'Alpha Centauri', raDeg: 219.902, decDeg: -60.834, vmag: -0.27, bv: 0.71, isAnchor: true },
  { id: 'arcturus', name: 'Arcturus (α Boo)', raDeg: 213.915, decDeg: 19.182, vmag: -0.05, bv: 1.23 },
  { id: 'vega', name: 'Vega (α Lyr)', raDeg: 279.235, decDeg: 38.784, vmag: 0.03, bv: 0.0 },
  { id: 'capella', name: 'Capella (α Aur)', raDeg: 79.172, decDeg: 45.998, vmag: 0.08, bv: 0.8 },
  { id: 'rigel', name: 'Rigel (β Ori)', raDeg: 78.634, decDeg: -8.202, vmag: 0.13, bv: -0.03, isAnchor: true },
  { id: 'procyon', name: 'Procyon (α CMi)', raDeg: 114.825, decDeg: 5.225, vmag: 0.34, bv: 0.42 },
  { id: 'achernar', name: 'Achernar (α Eri)', raDeg: 24.429, decDeg: -57.237, vmag: 0.46, bv: -0.16, isAnchor: true },
  { id: 'betelgeuse', name: 'Betelgeuse (α Ori)', raDeg: 88.793, decDeg: 7.407, vmag: 0.5, bv: 1.85, isAnchor: true },
  { id: 'hadar', name: 'Hadar (β Cen)', raDeg: 210.956, decDeg: -60.373, vmag: 0.61, bv: -0.23 },
  { id: 'altair', name: 'Altair (α Aql)', raDeg: 297.696, decDeg: 8.868, vmag: 0.76, bv: 0.22 },
  { id: 'acrux', name: 'Acrux (α Cru)', raDeg: 186.65, decDeg: -63.099, vmag: 0.77, bv: -0.24, isAnchor: true },
  { id: 'aldebaran', name: 'Aldebaran (α Tau)', raDeg: 68.98, decDeg: 16.509, vmag: 0.86, bv: 1.54 },
  { id: 'antares', name: 'Antares (α Sco)', raDeg: 247.352, decDeg: -26.432, vmag: 0.96, bv: 1.83, isAnchor: true },
  { id: 'spica', name: 'Spica (α Vir)', raDeg: 201.298, decDeg: -11.161, vmag: 0.97, bv: -0.23 },
  { id: 'pollux', name: 'Pollux (β Gem)', raDeg: 116.329, decDeg: 28.026, vmag: 1.14, bv: 1.0 },
  { id: 'fomalhaut', name: 'Fomalhaut (α PsA)', raDeg: 344.413, decDeg: -29.622, vmag: 1.16, bv: 0.09 },
  { id: 'mimosa', name: 'Mimosa (β Cru)', raDeg: 191.93, decDeg: -59.689, vmag: 1.25, bv: -0.23 },
  { id: 'deneb', name: 'Deneb (α Cyg)', raDeg: 310.358, decDeg: 45.28, vmag: 1.25, bv: 0.09 },
  { id: 'regulus', name: 'Regulus (α Leo)', raDeg: 152.093, decDeg: 11.967, vmag: 1.35, bv: -0.11 },

  // Crux & Musca
  { id: 'gacrux', name: 'Gacrux (γ Cru)', raDeg: 187.791, decDeg: -57.113, vmag: 1.64, bv: 1.59 },
  { id: 'imai', name: 'Imai (δ Cru)', raDeg: 183.786, decDeg: -58.749, vmag: 2.79, bv: -0.23 },
  { id: 'ginan', name: 'Ginan (ε Cru)', raDeg: 185.34, decDeg: -60.401, vmag: 3.59, bv: 1.4 },
  { id: 'alpha_mus', name: 'α Muscae', raDeg: 189.296, decDeg: -69.136, vmag: 2.69, bv: -0.2 },

  // Carina, Vela & Puppis (False Cross & Southern Milky Way)
  { id: 'miaplacidus', name: 'Miaplacidus (β Car)', raDeg: 138.3, decDeg: -69.717, vmag: 1.68, bv: 0.0 },
  { id: 'avior', name: 'Avior (ε Car)', raDeg: 125.628, decDeg: -59.509, vmag: 1.86, bv: 1.28 },
  { id: 'aspidiske', name: 'Aspidiske (ι Car)', raDeg: 139.273, decDeg: -59.275, vmag: 2.25, bv: 0.18 },
  { id: 'theta_car', name: 'θ Carinae', raDeg: 160.739, decDeg: -64.394, vmag: 2.76, bv: -0.22 },
  { id: 'upsilon_car', name: 'υ Carinae', raDeg: 146.776, decDeg: -65.072, vmag: 2.97, bv: 0.28 },
  { id: 'omega_car', name: 'ω Carinae', raDeg: 153.434, decDeg: -70.038, vmag: 3.32, bv: -0.07 },
  { id: 'regor', name: 'Suhail al Muhlif (γ Vel)', raDeg: 122.383, decDeg: -47.337, vmag: 1.75, bv: -0.22 },
  { id: 'alsephina', name: 'Alsephina (δ Vel)', raDeg: 131.176, decDeg: -54.709, vmag: 1.96, bv: 0.04 },
  { id: 'suhail', name: 'Suhail (λ Vel)', raDeg: 136.999, decDeg: -43.433, vmag: 2.21, bv: 1.66 },
  { id: 'markeb', name: 'Markeb (κ Vel)', raDeg: 140.528, decDeg: -55.011, vmag: 2.47, bv: -0.18 },
  { id: 'naos', name: 'Naos (ζ Pup)', raDeg: 120.896, decDeg: -40.003, vmag: 2.21, bv: -0.27 },
  { id: 'tureis', name: 'Tureis (ρ Pup)', raDeg: 121.886, decDeg: -24.304, vmag: 2.83, bv: 0.43 },

  // Centaurus, Lupus & Triangulum Australe
  { id: 'menkent', name: 'Menkent (θ Cen)', raDeg: 211.671, decDeg: -36.37, vmag: 2.06, bv: 1.01 },
  { id: 'muhlifain', name: 'Muhlifain (γ Cen)', raDeg: 190.379, decDeg: -48.96, vmag: 2.2, bv: 0.01 },
  { id: 'eps_cen', name: 'ε Centauri', raDeg: 204.972, decDeg: -53.466, vmag: 2.3, bv: -0.22 },
  { id: 'eta_cen', name: 'η Centauri', raDeg: 218.877, decDeg: -42.158, vmag: 2.31, bv: -0.19 },
  { id: 'zeta_cen', name: 'ζ Centauri', raDeg: 208.885, decDeg: -47.288, vmag: 2.55, bv: -0.22 },
  { id: 'delta_cen', name: 'δ Centauri', raDeg: 182.09, decDeg: -50.722, vmag: 2.6, bv: -0.12 },
  { id: 'atria', name: 'Atria (α TrA)', raDeg: 252.166, decDeg: -69.028, vmag: 1.92, bv: 1.44 },
  { id: 'beta_tra', name: 'β Trianguli Australis', raDeg: 238.786, decDeg: -63.43, vmag: 2.85, bv: 0.29 },
  { id: 'gamma_tra', name: 'γ Trianguli Australis', raDeg: 229.727, decDeg: -68.68, vmag: 2.89, bv: 0.0 },

  // Deep South Polar Circle: Dorado, Hydrus, Tucana, Pavo, Grus, Phoenix, Volans, Reticulum
  { id: 'peacock', name: 'Peacock (α Pav)', raDeg: 306.412, decDeg: -56.735, vmag: 1.94, bv: -0.2 },
  { id: 'alnair', name: 'Alnair (α Gru)', raDeg: 332.058, decDeg: -46.961, vmag: 1.74, bv: -0.13 },
  { id: 'tiaki', name: 'Tiaki (β Gru)', raDeg: 340.667, decDeg: -46.885, vmag: 2.1, bv: 1.61 },
  { id: 'alpha_tuc', name: 'α Tucanae', raDeg: 334.625, decDeg: -60.26, vmag: 2.86, bv: 1.39 },
  { id: 'beta_hyi', name: 'β Hydri', raDeg: 6.438, decDeg: -77.254, vmag: 2.82, bv: 0.62 },
  { id: 'alpha_hyi', name: 'α Hydri', raDeg: 29.692, decDeg: -61.57, vmag: 2.86, bv: 0.28 },
  { id: 'gamma_hyi', name: 'γ Hydri', raDeg: 56.81, decDeg: -74.239, vmag: 3.24, bv: 1.62 },
  { id: 'alpha_dor', name: 'α Doradus', raDeg: 68.499, decDeg: -55.045, vmag: 3.27, bv: -0.1 },
  { id: 'beta_dor', name: 'β Doradus', raDeg: 83.406, decDeg: -62.49, vmag: 3.76, bv: 0.8 },
  { id: 'alpha_ret', name: 'α Reticuli', raDeg: 63.606, decDeg: -62.474, vmag: 3.33, bv: 0.91 },
  { id: 'ankaa', name: 'Ankaa (α Phe)', raDeg: 6.571, decDeg: -42.306, vmag: 2.39, bv: 1.09 },
  { id: 'diphda', name: 'Diphda (β Cet)', raDeg: 10.897, decDeg: -17.987, vmag: 2.04, bv: 1.02 },
  { id: 'theta_eri', name: 'Acamar (θ Eri)', raDeg: 44.565, decDeg: -40.305, vmag: 2.91, bv: 0.14 },
  { id: 'gamma_eri', name: 'Zaurak (γ Eri)', raDeg: 59.507, decDeg: -13.509, vmag: 2.95, bv: 1.59 },
  { id: 'polaris_aus', name: 'σ Octantis', raDeg: 317.195, decDeg: -88.957, vmag: 5.47, bv: 0.32 },

  // Orion & Canis Major & Canis Minor
  { id: 'bellatrix', name: 'Bellatrix (γ Ori)', raDeg: 81.283, decDeg: 6.35, vmag: 1.64, bv: -0.22 },
  { id: 'alnilam', name: 'Alnilam (ε Ori)', raDeg: 84.053, decDeg: -1.202, vmag: 1.69, bv: -0.18 },
  { id: 'alnitak', name: 'Alnitak (ζ Ori)', raDeg: 85.19, decDeg: -1.943, vmag: 1.77, bv: -0.21 },
  { id: 'mintaka', name: 'Mintaka (δ Ori)', raDeg: 83.002, decDeg: -0.299, vmag: 2.23, bv: -0.22 },
  { id: 'saiph', name: 'Saiph (κ Ori)', raDeg: 86.939, decDeg: -9.67, vmag: 2.06, bv: -0.17 },
  { id: 'meissa', name: 'Meissa (λ Ori)', raDeg: 83.784, decDeg: 9.934, vmag: 3.39, bv: -0.18 },
  { id: 'adhara', name: 'Adhara (ε CMa)', raDeg: 104.656, decDeg: -28.972, vmag: 1.5, bv: -0.21 },
  { id: 'wezen', name: 'Wezen (δ CMa)', raDeg: 107.098, decDeg: -26.393, vmag: 1.84, bv: 0.68 },
  { id: 'mirzam', name: 'Mirzam (β CMa)', raDeg: 95.675, decDeg: -17.956, vmag: 1.98, bv: -0.23 },
  { id: 'aludra', name: 'Aludra (η CMa)', raDeg: 111.024, decDeg: -29.303, vmag: 2.45, bv: -0.08 },
  { id: 'alphard', name: 'Alphard (α Hya)', raDeg: 141.897, decDeg: -8.659, vmag: 1.98, bv: 1.44 },

  // Scorpius & Sagittarius (Galactic Center Region)
  { id: 'shaula', name: 'Shaula (λ Sco)', raDeg: 263.402, decDeg: -37.104, vmag: 1.62, bv: -0.22 },
  { id: 'sargas', name: 'Sargas (θ Sco)', raDeg: 264.33, decDeg: -42.998, vmag: 1.87, bv: 0.4 },
  { id: 'dschubba', name: 'Dschubba (δ Sco)', raDeg: 240.083, decDeg: -22.622, vmag: 2.32, bv: -0.12 },
  { id: 'graffias', name: 'Acrab (β Sco)', raDeg: 241.359, decDeg: -19.805, vmag: 2.62, bv: -0.07 },
  { id: 'eps_sco', name: 'Larawag (ε Sco)', raDeg: 252.541, decDeg: -34.293, vmag: 2.29, bv: 1.15 },
  { id: 'lesath', name: 'Lesath (υ Sco)', raDeg: 262.691, decDeg: -37.296, vmag: 2.69, bv: -0.22 },
  { id: 'kaus_aus', name: 'Kaus Australis (ε Sgr)', raDeg: 276.043, decDeg: -34.385, vmag: 1.85, bv: -0.03 },
  { id: 'nunki', name: 'Nunki (σ Sgr)', raDeg: 283.816, decDeg: -26.297, vmag: 2.02, bv: -0.22 },
  { id: 'ascella', name: 'Ascella (ζ Sgr)', raDeg: 285.653, decDeg: -29.88, vmag: 2.59, bv: 0.08 },
  { id: 'kaus_med', name: 'Kaus Media (δ Sgr)', raDeg: 275.249, decDeg: -29.828, vmag: 2.7, bv: 1.38 },
  { id: 'kaus_bor', name: 'Kaus Borealis (λ Sgr)', raDeg: 276.993, decDeg: -25.422, vmag: 2.81, bv: 1.04 },
  { id: 'alnasl', name: 'Alnasl (γ Sgr)', raDeg: 271.452, decDeg: -30.424, vmag: 2.99, bv: 0.99 },
  { id: 'phi_sgr', name: 'φ Sagittarii', raDeg: 281.414, decDeg: -26.991, vmag: 3.17, bv: -0.11 },

  // Zodiac & Northern Bright Anchors (visible in full spherical view / orbit / northern dips)
  { id: 'elnath', name: 'Elnath (β Tau)', raDeg: 81.573, decDeg: 28.608, vmag: 1.65, bv: -0.13 },
  { id: 'alcyone', name: 'Alcyone (M45 Pleiades)', raDeg: 56.871, decDeg: 24.105, vmag: 2.87, bv: -0.09 },
  { id: 'castor', name: 'Castor (α Gem)', raDeg: 113.649, decDeg: 31.888, vmag: 1.58, bv: 0.03 },
  { id: 'menkalinan', name: 'Menkalinan (β Aur)', raDeg: 89.882, decDeg: 44.947, vmag: 1.9, bv: 0.03 },
  { id: 'mirfak', name: 'Mirfak (α Per)', raDeg: 51.081, decDeg: 49.861, vmag: 1.79, bv: 0.48 },
  { id: 'algol', name: 'Algol (β Per)', raDeg: 47.042, decDeg: 40.956, vmag: 2.12, bv: -0.05 },
  { id: 'hamal', name: 'Hamal (α Ari)', raDeg: 31.793, decDeg: 23.462, vmag: 2.0, bv: 1.15 },
  { id: 'alpheratz', name: 'Alpheratz (α And)', raDeg: 2.097, decDeg: 29.091, vmag: 2.06, bv: -0.11 },
  { id: 'mirach', name: 'Mirach (β And)', raDeg: 17.433, decDeg: 35.621, vmag: 2.06, bv: 1.58 },
  { id: 'almach', name: 'Almach (γ And)', raDeg: 30.975, decDeg: 42.33, vmag: 2.1, bv: 1.2 },
  { id: 'schedar', name: 'Schedar (α Cas)', raDeg: 10.127, decDeg: 56.537, vmag: 2.23, bv: 1.17 },
  { id: 'caph', name: 'Caph (β Cas)', raDeg: 2.295, decDeg: 59.15, vmag: 2.27, bv: 0.34 },
  { id: 'navi', name: 'γ Cassiopeiae', raDeg: 14.177, decDeg: 60.717, vmag: 2.47, bv: -0.15 },
  { id: 'ruchbah', name: 'Ruchbah (δ Cas)', raDeg: 21.454, decDeg: 60.235, vmag: 2.68, bv: 0.13 },
  { id: 'segin', name: 'Segin (ε Cas)', raDeg: 28.599, decDeg: 63.67, vmag: 3.38, bv: -0.15 },
  { id: 'polaris', name: 'Polaris (α UMi)', raDeg: 37.955, decDeg: 89.264, vmag: 1.98, bv: 0.6 },
  { id: 'dubhe', name: 'Dubhe (α UMa)', raDeg: 165.932, decDeg: 61.751, vmag: 1.79, bv: 1.07 },
  { id: 'merak', name: 'Merak (β UMa)', raDeg: 165.46, decDeg: 56.382, vmag: 2.37, bv: -0.02 },
  { id: 'phecda', name: 'Phecda (γ UMa)', raDeg: 178.458, decDeg: 53.695, vmag: 2.44, bv: 0.0 },
  { id: 'megrez', name: 'Megrez (δ UMa)', raDeg: 183.857, decDeg: 57.033, vmag: 3.31, bv: 0.08 },
  { id: 'alioth', name: 'Alioth (ε UMa)', raDeg: 193.507, decDeg: 55.96, vmag: 1.77, bv: -0.02 },
  { id: 'mizar', name: 'Mizar (ζ UMa)', raDeg: 200.981, decDeg: 54.925, vmag: 2.27, bv: 0.02 },
  { id: 'alkaid', name: 'Alkaid (η UMa)', raDeg: 206.885, decDeg: 49.313, vmag: 1.86, bv: -0.19 },
  { id: 'sadr', name: 'Sadr (γ Cyg)', raDeg: 305.557, decDeg: 40.257, vmag: 2.2, bv: 0.68 },
  { id: 'gienah_cyg', name: 'Gienah (ε Cyg)', raDeg: 311.553, decDeg: 33.97, vmag: 2.46, bv: 1.03 },
  { id: 'delta_cyg', name: 'δ Cygni', raDeg: 296.244, decDeg: 45.131, vmag: 2.87, bv: -0.03 },
  { id: 'albireo', name: 'Albireo (β Cyg)', raDeg: 292.68, decDeg: 27.96, vmag: 3.08, bv: 1.13 },
  { id: 'markab', name: 'Markab (α Peg)', raDeg: 346.19, decDeg: 15.205, vmag: 2.49, bv: -0.04 },
  { id: 'scheat', name: 'Scheat (β Peg)', raDeg: 345.944, decDeg: 28.083, vmag: 2.42, bv: 1.67 },
  { id: 'algenib', name: 'Algenib (γ Peg)', raDeg: 3.309, decDeg: 15.184, vmag: 2.83, bv: -0.23 },
  { id: 'enif', name: 'Enif (ε Peg)', raDeg: 326.047, decDeg: 9.875, vmag: 2.39, bv: 1.52 },
  { id: 'algieba', name: 'Algieba (γ Leo)', raDeg: 154.993, decDeg: 19.841, vmag: 2.08, bv: 1.15 },
  { id: 'denebola', name: 'Denebola (β Leo)', raDeg: 177.265, decDeg: 14.572, vmag: 2.14, bv: 0.09 },
  { id: 'rasalhague', name: 'Rasalhague (α Oph)', raDeg: 263.734, decDeg: 12.56, vmag: 2.08, bv: 0.15 },
  { id: 'alphecca', name: 'Alphecca (α CrB)', raDeg: 233.672, decDeg: 26.715, vmag: 2.23, bv: -0.02 },
  { id: 'izhar', name: 'Izar (ε Boo)', raDeg: 221.247, decDeg: 27.074, vmag: 2.37, bv: 0.97 },
];

export const DEEP_SKY_OBJECTS: DeepSkyObject[] = [
  {
    id: 'lmc',
    name: 'Large Magellanic Cloud (LMC)',
    kind: 'galaxy',
    raDeg: 80.894,
    decDeg: -69.756,
    radiusDeg: 8.6,
    axisRatio: 0.62,
    rollRad: 0.42,
    coreRgb: [0.95, 0.97, 1.0],
    outerRgb: [0.46, 0.64, 0.96],
    accentRgb: [0.96, 0.36, 0.62], // Tarantula Nebula H-alpha star-forming knot
    intensity: 1.05,
  },
  {
    id: 'smc',
    name: 'Small Magellanic Cloud (SMC)',
    kind: 'galaxy',
    raDeg: 13.158,
    decDeg: -72.8,
    radiusDeg: 5.2,
    axisRatio: 0.56,
    rollRad: -0.58,
    coreRgb: [0.92, 0.95, 1.0],
    outerRgb: [0.44, 0.6, 0.9],
    accentRgb: [1.0, 0.85, 0.64], // Adjacent 47 Tucanae golden halo
    intensity: 0.88,
  },
  {
    id: 'andromeda',
    name: 'Andromeda Galaxy (M31)',
    kind: 'galaxy',
    raDeg: 10.685,
    decDeg: 41.269,
    radiusDeg: 7.4,
    axisRatio: 0.34,
    rollRad: 0.61,
    coreRgb: [1.0, 0.9, 0.72],
    outerRgb: [0.54, 0.72, 1.0],
    accentRgb: [0.98, 0.78, 0.54],
    intensity: 1.12,
  },
  {
    id: 'carina_nebula',
    name: 'Carina Nebula (NGC 3372)',
    kind: 'nebula',
    raDeg: 161.265,
    decDeg: -59.868,
    radiusDeg: 5.2,
    axisRatio: 0.78,
    rollRad: 0.25,
    coreRgb: [1.0, 0.46, 0.58],
    outerRgb: [0.24, 0.68, 0.88],
    accentRgb: [0.98, 0.74, 0.34],
    intensity: 0.95,
  },
  {
    id: 'omega_cen',
    name: 'Omega Centauri (NGC 5139)',
    kind: 'cluster',
    raDeg: 201.697,
    decDeg: -47.48,
    radiusDeg: 2.8,
    axisRatio: 0.94,
    rollRad: 0.0,
    coreRgb: [1.0, 0.95, 0.84],
    outerRgb: [0.78, 0.86, 1.0],
    accentRgb: [1.0, 0.86, 0.62],
    intensity: 0.9,
  },
  {
    id: 'orion_nebula',
    name: 'Orion Nebula (M42)',
    kind: 'nebula',
    raDeg: 83.822,
    decDeg: -5.391,
    radiusDeg: 3.4,
    axisRatio: 0.82,
    rollRad: -0.3,
    coreRgb: [0.68, 0.9, 1.0],
    outerRgb: [0.88, 0.36, 0.62],
    accentRgb: [0.56, 0.48, 0.96],
    intensity: 0.92,
  },
  {
    id: 'lagoon_nebula',
    name: 'Lagoon Nebula & Core (M8)',
    kind: 'nebula',
    raDeg: 270.921,
    decDeg: -24.38,
    radiusDeg: 4.2,
    axisRatio: 0.74,
    rollRad: 0.45,
    coreRgb: [1.0, 0.54, 0.66],
    outerRgb: [0.94, 0.72, 0.44],
    accentRgb: [0.42, 0.72, 0.96],
    intensity: 0.84,
  },
];

export const CONSTELLATION_SEGMENTS: ConstellationSegment[] = [
  // Crux (Southern Cross)
  { constellation: 'Crux', fromId: 'acrux', toId: 'gacrux' },
  { constellation: 'Crux', fromId: 'mimosa', toId: 'imai' },
  // Centaurus
  { constellation: 'Centaurus', fromId: 'rigil_kentaurus', toId: 'hadar' },
  { constellation: 'Centaurus', fromId: 'hadar', toId: 'eps_cen' },
  { constellation: 'Centaurus', fromId: 'eps_cen', toId: 'zeta_cen' },
  { constellation: 'Centaurus', fromId: 'zeta_cen', toId: 'eta_cen' },
  { constellation: 'Centaurus', fromId: 'zeta_cen', toId: 'menkent' },
  { constellation: 'Centaurus', fromId: 'eps_cen', toId: 'muhlifain' },
  { constellation: 'Centaurus', fromId: 'muhlifain', toId: 'delta_cen' },
  // Carina & Vela
  { constellation: 'Carina', fromId: 'canopus', toId: 'avior' },
  { constellation: 'Carina', fromId: 'avior', toId: 'aspidiske' },
  { constellation: 'Carina', fromId: 'aspidiske', toId: 'upsilon_car' },
  { constellation: 'Carina', fromId: 'upsilon_car', toId: 'theta_car' },
  { constellation: 'Carina', fromId: 'theta_car', toId: 'omega_car' },
  { constellation: 'Carina', fromId: 'omega_car', toId: 'miaplacidus' },
  { constellation: 'Vela', fromId: 'regor', toId: 'alsephina' },
  { constellation: 'Vela', fromId: 'alsephina', toId: 'markeb' },
  { constellation: 'Vela', fromId: 'markeb', toId: 'suhail' },
  { constellation: 'Vela', fromId: 'suhail', toId: 'regor' },
  // Southern Polar Circle (Triangulum Australe & Hydrus)
  { constellation: 'TrA', fromId: 'atria', toId: 'beta_tra' },
  { constellation: 'TrA', fromId: 'beta_tra', toId: 'gamma_tra' },
  { constellation: 'TrA', fromId: 'gamma_tra', toId: 'atria' },
  { constellation: 'Hydrus', fromId: 'alpha_hyi', toId: 'beta_hyi' },
  { constellation: 'Hydrus', fromId: 'beta_hyi', toId: 'gamma_hyi' },
  { constellation: 'Hydrus', fromId: 'gamma_hyi', toId: 'alpha_hyi' },
  // Orion
  { constellation: 'Orion', fromId: 'betelgeuse', toId: 'bellatrix' },
  { constellation: 'Orion', fromId: 'bellatrix', toId: 'mintaka' },
  { constellation: 'Orion', fromId: 'mintaka', toId: 'rigel' },
  { constellation: 'Orion', fromId: 'rigel', toId: 'saiph' },
  { constellation: 'Orion', fromId: 'saiph', toId: 'alnitak' },
  { constellation: 'Orion', fromId: 'alnitak', toId: 'betelgeuse' },
  { constellation: 'Orion', fromId: 'mintaka', toId: 'alnilam' },
  { constellation: 'Orion', fromId: 'alnilam', toId: 'alnitak' },
  // Canis Major
  { constellation: 'CMa', fromId: 'sirius', toId: 'mirzam' },
  { constellation: 'CMa', fromId: 'sirius', toId: 'wezen' },
  { constellation: 'CMa', fromId: 'wezen', toId: 'adhara' },
  { constellation: 'CMa', fromId: 'wezen', toId: 'aludra' },
  // Scorpius
  { constellation: 'Scorpius', fromId: 'graffias', toId: 'dschubba' },
  { constellation: 'Scorpius', fromId: 'dschubba', toId: 'antares' },
  { constellation: 'Scorpius', fromId: 'antares', toId: 'eps_sco' },
  { constellation: 'Scorpius', fromId: 'eps_sco', toId: 'sargas' },
  { constellation: 'Scorpius', fromId: 'sargas', toId: 'shaula' },
  { constellation: 'Scorpius', fromId: 'shaula', toId: 'lesath' },
  // Sagittarius Teapot
  { constellation: 'Sagittarius', fromId: 'kaus_med', toId: 'kaus_aus' },
  { constellation: 'Sagittarius', fromId: 'kaus_aus', toId: 'ascella' },
  { constellation: 'Sagittarius', fromId: 'ascella', toId: 'phi_sgr' },
  { constellation: 'Sagittarius', fromId: 'phi_sgr', toId: 'kaus_med' },
  { constellation: 'Sagittarius', fromId: 'kaus_med', toId: 'alnasl' },
  { constellation: 'Sagittarius', fromId: 'alnasl', toId: 'kaus_aus' },
  { constellation: 'Sagittarius', fromId: 'kaus_med', toId: 'kaus_bor' },
  { constellation: 'Sagittarius', fromId: 'kaus_bor', toId: 'phi_sgr' },
  { constellation: 'Sagittarius', fromId: 'phi_sgr', toId: 'nunki' },
  { constellation: 'Sagittarius', fromId: 'nunki', toId: 'ascella' },
  // Cassiopeia & Big Dipper
  { constellation: 'Cassiopeia', fromId: 'caph', toId: 'schedar' },
  { constellation: 'Cassiopeia', fromId: 'schedar', toId: 'navi' },
  { constellation: 'Cassiopeia', fromId: 'navi', toId: 'ruchbah' },
  { constellation: 'Cassiopeia', fromId: 'ruchbah', toId: 'segin' },
  { constellation: 'UMa', fromId: 'dubhe', toId: 'merak' },
  { constellation: 'UMa', fromId: 'merak', toId: 'phecda' },
  { constellation: 'UMa', fromId: 'phecda', toId: 'megrez' },
  { constellation: 'UMa', fromId: 'megrez', toId: 'dubhe' },
  { constellation: 'UMa', fromId: 'megrez', toId: 'alioth' },
  { constellation: 'UMa', fromId: 'alioth', toId: 'mizar' },
  { constellation: 'UMa', fromId: 'mizar', toId: 'alkaid' },
];

/**
 * Convert astronomical B-V color index (-0.33 .. +2.0) to calibrated Planck blackbody RGB in [0, 1].
 * Derived from Ballesteros / Harfst blackbody temperature fit (O/B blue -> A white -> G solar -> M amber-red).
 */
export function bvToRgb(bv: number): [number, number, number] {
  const clamped = Math.max(-0.4, Math.min(2.0, bv));
  const tempK = 4600.0 * (1.0 / (0.92 * clamped + 1.7) + 1.0 / (0.92 * clamped + 0.62));
  const t = tempK / 100.0;

  let r: number;
  let g: number;
  let b: number;

  if (t <= 66.0) {
    r = 255.0;
    g = 99.4708025861 * Math.log(Math.max(1.0, t)) - 161.1195681661;
    b = t <= 19.0 ? 0.0 : 138.5177312231 * Math.log(t - 10.0) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60.0, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60.0, -0.0755148492);
    b = 255.0;
  }

  return [
    Math.max(0.18, Math.min(1.0, r / 255.0)),
    Math.max(0.18, Math.min(1.0, g / 255.0)),
    Math.max(0.18, Math.min(1.0, b / 255.0)),
  ];
}

/**
 * Convert spherical coordinates (RA deg, Dec deg) into ICRS J2000 unit Cartesian vector.
 */
export function raDecToUnitVec(raDeg: number, decDeg: number): [number, number, number] {
  const ra = raDeg * DEG2RAD;
  const dec = decDeg * DEG2RAD;
  const cDec = Math.cos(dec);
  return [cDec * Math.cos(ra), cDec * Math.sin(ra), Math.sin(dec)];
}

/**
 * Compute exact IAU 1958 Equatorial J2000 -> Galactic 3x3 row-major matrix:
 * NGP (RA = 192.85948 deg, Dec = +27.12825 deg), NCP longitude l_NCP = 122.93192 deg.
 */
export function computeIcrsToGalacticMatrix(): Float64Array {
  // Standard IAU B1950->J2000 precessed rotation matrix (Murray 1989 / Hipparcos)
  return new Float64Array([
    -0.0548755604, -0.8734370902, -0.4838350155,
    0.4941094279, -0.44482963, 0.7469822445,
    -0.867666149, -0.1980763734, 0.4559837762,
  ]);
}

export const ICRS_TO_GALACTIC_MAT = computeIcrsToGalacticMatrix();

/**
 * Convert Galactic coordinates (lDeg, bDeg) into ICRS J2000 (raDeg, decDeg).
 */
export function galacticLonLatToIcrsRaDec(lDeg: number, bDeg: number): { raDeg: number; decDeg: number } {
  const [gx, gy, gz] = raDecToUnitVec(lDeg, bDeg);
  const m = ICRS_TO_GALACTIC_MAT;
  // Transpose of orthogonal ICRS->Galactic matrix maps Galactic -> ICRS
  const ex = m[0] * gx + m[3] * gy + m[6] * gz;
  const ey = m[1] * gx + m[4] * gy + m[7] * gz;
  const ez = m[2] * gx + m[5] * gy + m[8] * gz;
  const decDeg = Math.asin(Math.max(-1, Math.min(1, ez))) * RAD2DEG;
  const raDeg = ((Math.atan2(ey, ex) * RAD2DEG) + 360) % 360;
  return { raDeg, decDeg };
}

/**
 * Parse UTC ISO string to Julian Date (JD).
 */
export function utcIsoToJulianDate(utcIso: string): number {
  const ms = Date.parse(utcIso);
  if (!Number.isFinite(ms)) return 2451545.0;
  return ms / 86400000.0 + 2440587.5;
}

/**
 * Compute hourly simulation UTC ISO timestamp at ephemeris step timeIdx.
 */
export function ephemerisStepUtcIso(t0Utc: string, dtHours: number, timeIdx: number): string {
  const baseMs = Date.parse(t0Utc);
  if (!Number.isFinite(baseMs)) return t0Utc;
  return new Date(baseMs + timeIdx * dtHours * 3600000.0).toISOString();
}

/**
 * Compute low-precision geocentric solar ICRS (raDeg, decDeg) at JD (Meeus <= 0.01 deg)
 * used in verification tests to cross-check ICRS->MOON_ME sky alignment against JPL ephemeris.
 */
export function computeSunIcrsRaDec(jd: number): { raDeg: number; decDeg: number } {
  const n = jd - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360.0;
  const g = ((357.528 + 0.9856003 * n) % 360.0) * DEG2RAD;
  const lambdaRad = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2.0 * g)) * DEG2RAD;
  const epsRad = (23.439 - 0.0000004 * n) * DEG2RAD;

  const sx = Math.cos(lambdaRad);
  const sy = Math.cos(epsRad) * Math.sin(lambdaRad);
  const sz = Math.sin(epsRad) * Math.sin(lambdaRad);

  const decDeg = Math.asin(Math.max(-1, Math.min(1, sz))) * RAD2DEG;
  const raDeg = ((Math.atan2(sy, sx) * RAD2DEG) + 360) % 360;
  return { raDeg, decDeg };
}

/**
 * Compute the 3x3 rotation matrix transforming ICRS J2000 unit vectors into Lunar body-fixed
 * MOON_ME coordinates using the IAU WGCCRE (Archinal et al. 2018) lunar pole + libration angles.
 */
export function computeIcrsToMoonMeMatrix(jd: number): Float64Array {
  const d = jd - 2451545.0;
  const T = d / 36525.0;

  const E1 = (125.045 - 0.0529921 * d) * DEG2RAD;
  const E2 = (250.089 - 0.1059842 * d) * DEG2RAD;
  const E3 = (260.008 + 13.0120009 * d) * DEG2RAD;
  const E4 = (176.625 + 13.3407154 * d) * DEG2RAD;
  const E5 = (357.529 + 0.9856003 * d) * DEG2RAD;
  const E6 = (311.589 + 26.4057084 * d) * DEG2RAD;
  const E7 = (134.963 + 13.064993 * d) * DEG2RAD;
  const E8 = (276.617 + 0.3287146 * d) * DEG2RAD;
  const E9 = (34.226 + 1.7484877 * d) * DEG2RAD;
  const E10 = (15.134 - 0.1589763 * d) * DEG2RAD;
  const E11 = (119.743 + 0.0036096 * d) * DEG2RAD;
  const E12 = (239.961 + 0.1643573 * d) * DEG2RAD;
  const E13 = (25.053 + 12.9590088 * d) * DEG2RAD;

  const alphaDeg =
    269.9949 +
    0.0031 * T -
    3.8787 * Math.sin(E1) -
    0.1204 * Math.sin(E2) +
    0.07 * Math.sin(E3) -
    0.0172 * Math.sin(E4) +
    0.0072 * Math.sin(E6) -
    0.0052 * Math.sin(E10) +
    0.0043 * Math.sin(E13);

  const deltaDeg =
    66.5392 +
    0.013 * T +
    1.5419 * Math.cos(E1) +
    0.0239 * Math.cos(E2) -
    0.0278 * Math.cos(E3) +
    0.0068 * Math.cos(E4) -
    0.0029 * Math.cos(E6) +
    0.0009 * Math.cos(E7) +
    0.0008 * Math.cos(E10) -
    0.0009 * Math.cos(E13);

  const Wdeg =
    38.3213 +
    13.17635815 * d -
    1.4e-12 * d * d +
    3.561 * Math.sin(E1) +
    0.1208 * Math.sin(E2) -
    0.0642 * Math.sin(E3) +
    0.0158 * Math.sin(E4) +
    0.0252 * Math.sin(E5) -
    0.0066 * Math.sin(E6) -
    0.0047 * Math.sin(E7) -
    0.0046 * Math.sin(E8) +
    0.0028 * Math.sin(E9) +
    0.0052 * Math.sin(E10) +
    0.004 * Math.sin(E11) +
    0.0019 * Math.sin(E12) -
    0.0044 * Math.sin(E13);

  // Build R = Rz(W) * Rx(90 - delta0) * Rz(90 + alpha0)
  const phi = (90.0 + alphaDeg) * DEG2RAD;
  const inc = (90.0 - deltaDeg) * DEG2RAD;
  const w = Wdeg * DEG2RAD;

  const cp = Math.cos(phi);
  const sp = Math.sin(phi);
  const ci = Math.cos(inc);
  const si = Math.sin(inc);
  const cw = Math.cos(w);
  const sw = Math.sin(w);

  // Basis rows directly from active-to-frame Euler product Rz(w)*Rx(inc)*Rz(phi)
  const m00 = cw * cp - sw * ci * sp;
  const m01 = cw * sp + sw * ci * cp;
  const m02 = sw * si;

  const m10 = -sw * cp - cw * ci * sp;
  const m11 = -sw * sp + cw * ci * cp;
  const m12 = cw * si;

  const m20 = si * sp;
  const m21 = -si * cp;
  const m22 = ci;

  return new Float64Array([m00, m01, m02, m10, m11, m12, m20, m21, m22]);
}

/**
 * Transform an ICRS unit vector [x, y, z] via a 3x3 row-major matrix into MOON_ME [mx, my, mz].
 */
export function applyMat3(m: Float64Array, v: [number, number, number]): [number, number, number] {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * Convert an ICRS J2000 (RA deg, Dec deg) direction directly into Three.js polar sky vector
 * matching polarToThreeCoords (+X = 90°E / ME +Y, +Y = South Polar Zenith / ME -Z, -Z = 0°E / ME +X).
 */
export function icrsToThreeSkyDir(
  matIcrsToMoonMe: Float64Array,
  raDeg: number,
  decDeg: number,
): [number, number, number] {
  const [mx, my, mz] = applyMat3(matIcrsToMoonMe, raDecToUnitVec(raDeg, decDeg));
  return [my, -mz, -mx];
}

/**
 * Compute column-major elements suitable for THREE.Matrix4.set(...) rotating J2000 ICRS XYZ
 * directly into the scene's Three.js South Polar sky frame: vThree = (my, -mz, -mx).
 */
export function computeIcrsToThreeSkyMatrixRowMajor(jd: number): Float64Array {
  const m = computeIcrsToMoonMeMatrix(jd);
  // Row 0 = my = row 1 of MOON_ME
  // Row 1 = -mz = -row 2 of MOON_ME
  // Row 2 = -mx = -row 0 of MOON_ME
  return new Float64Array([
    m[3], m[4], m[5],
    -m[6], -m[7], -m[8],
    -m[0], -m[1], -m[2],
  ]);
}

export interface BackgroundStarBuffers {
  positions: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  spikeStrengths: Float32Array;
  count: number;
}

function lcg(seedObj: { s: number }): number {
  seedObj.s = (seedObj.s * 1664525 + 1013904223) >>> 0;
  return seedObj.s / 4294967296;
}

function gaussianRand(seedObj: { s: number }): number {
  const u1 = Math.max(1e-6, lcg(seedObj));
  const u2 = lcg(seedObj);
  return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(Math.PI * 2.0 * u2);
}

/**
 * Build combined real Hipparcos bright star catalog + 7,200 Milky-Way-concentrated
 * spectral field stars in J2000 ICRS unit sphere coordinates (radius = skyRadius).
 */
export function buildAstronomicalStarBuffers(skyRadius = 1320.0): BackgroundStarBuffers {
  const MW_COUNT = 7200;
  const totalCount = BRIGHT_STARS.length + MW_COUNT;
  const positions = new Float32Array(totalCount * 3);
  const colors = new Float32Array(totalCount * 3);
  const sizes = new Float32Array(totalCount);
  const spikeStrengths = new Float32Array(totalCount);

  // 1. Place real catalog stars with physical Vmag sizing & B-V blackbody color
  for (let i = 0; i < BRIGHT_STARS.length; i++) {
    const star = BRIGHT_STARS[i];
    const [vx, vy, vz] = raDecToUnitVec(star.raDeg, star.decDeg);
    positions[i * 3] = vx * skyRadius;
    positions[i * 3 + 1] = vy * skyRadius;
    positions[i * 3 + 2] = vz * skyRadius;

    const [r, g, b] = bvToRgb(star.bv);
    const brightness = Math.max(0.55, Math.min(1.5, Math.pow(10, -0.14 * (star.vmag - 1.5))));
    colors[i * 3] = r * brightness;
    colors[i * 3 + 1] = g * brightness;
    colors[i * 3 + 2] = b * brightness;

    // Appreciably larger optical PSF for -1.4..+3.5 mag navigational stars
    const magSize = Math.max(2.8, Math.min(16.5, 11.2 - star.vmag * 2.45));
    sizes[i] = magSize;
    spikeStrengths[i] = star.vmag <= 1.3 ? Math.min(1.0, (1.45 - star.vmag) * 0.48) : 0.0;
  }

  // 2. Populate Milky-Way-structured background field stars using Galactic (l, b) -> ICRS
  const rng = { s: 20261114 };
  for (let k = 0; k < MW_COUNT; k++) {
    const idx = BRIGHT_STARS.length + k;
    const roll = lcg(rng);
    let raDeg: number;
    let decDeg: number;
    let bv: number;
    let vmag: number;

    if (roll < 0.52) {
      // Dense Milky Way band + Galactic Bulge toward Sagittarius/Scorpius & Carina/Cygnus clouds
      let lDeg: number;
      const bandRoll = lcg(rng);
      if (bandRoll < 0.34) {
        // Galactic center bulge around l = 0 deg
        lDeg = ((gaussianRand(rng) * 28.0) + 360.0) % 360.0;
      } else if (bandRoll < 0.56) {
        // Carina-Crux-Centaurus bright southern arm (l ~ 285..320 deg)
        lDeg = 282.0 + lcg(rng) * 44.0;
      } else {
        lDeg = lcg(rng) * 360.0;
      }
      const bDeg = Math.max(-88.0, Math.min(88.0, gaussianRand(rng) * (bandRoll < 0.34 ? 7.5 : 5.2)));
      const eq = galacticLonLatToIcrsRaDec(lDeg, bDeg);
      raDeg = eq.raDeg;
      decDeg = eq.decDeg;
      bv = bandRoll < 0.34 ? 0.45 + gaussianRand(rng) * 0.45 : -0.05 + lcg(rng) * 1.15;
      vmag = 3.8 + Math.pow(lcg(rng), 0.72) * 3.4;
    } else if (roll < 0.56) {
      // Subtle dense star knots inside LMC / SMC / Omega Centauri / Pleiades
      const pick = lcg(rng);
      const anchor =
        pick < 0.48
          ? { ra: 80.9, dec: -69.8, spread: 3.4 }
          : pick < 0.78
            ? { ra: 13.2, dec: -72.8, spread: 2.1 }
            : { ra: 56.87, dec: 24.1, spread: 1.4 };
      raDeg = anchor.ra + gaussianRand(rng) * anchor.spread * 1.6;
      decDeg = Math.max(-89.5, Math.min(89.5, anchor.dec + gaussianRand(rng) * anchor.spread));
      bv = -0.15 + lcg(rng) * 0.65;
      vmag = 4.0 + lcg(rng) * 2.8;
    } else {
      // Isotropic all-sky faint field
      const u = lcg(rng) * 2.0 - 1.0;
      decDeg = Math.asin(u) * RAD2DEG;
      raDeg = lcg(rng) * 360.0;
      bv = -0.15 + lcg(rng) * 1.45;
      vmag = 3.2 + Math.pow(lcg(rng), 0.65) * 3.8;
    }

    const [vx, vy, vz] = raDecToUnitVec(raDeg, decDeg);
    positions[idx * 3] = vx * skyRadius;
    positions[idx * 3 + 1] = vy * skyRadius;
    positions[idx * 3 + 2] = vz * skyRadius;

    const [r, g, b] = bvToRgb(bv);
    const dim = Math.max(0.24, Math.min(0.95, 1.05 - (vmag - 3.2) * 0.19));
    colors[idx * 3] = r * dim;
    colors[idx * 3 + 1] = g * dim;
    colors[idx * 3 + 2] = b * dim;

    sizes[idx] = Math.max(1.35, Math.min(3.4, 3.8 - vmag * 0.35));
    spikeStrengths[idx] = 0.0;
  }

  return {
    positions,
    colors,
    sizes,
    spikeStrengths,
    count: totalCount,
  };
}

/**
 * Build J2000 ICRS line segments for real constellations.
 */
export function buildConstellationLinePositions(skyRadius = 1310.0): Float32Array {
  const starMap = new Map<string, CatalogStar>();
  for (const s of BRIGHT_STARS) {
    starMap.set(s.id, s);
  }
  const coords: number[] = [];
  for (const seg of CONSTELLATION_SEGMENTS) {
    const a = starMap.get(seg.fromId);
    const b = starMap.get(seg.toId);
    if (!a || !b) continue;
    const [ax, ay, az] = raDecToUnitVec(a.raDeg, a.decDeg);
    const [bx, by, bz] = raDecToUnitVec(b.raDeg, b.decDeg);
    coords.push(
      ax * skyRadius,
      ay * skyRadius,
      az * skyRadius,
      bx * skyRadius,
      by * skyRadius,
      bz * skyRadius,
    );
  }
  return new Float32Array(coords);
}

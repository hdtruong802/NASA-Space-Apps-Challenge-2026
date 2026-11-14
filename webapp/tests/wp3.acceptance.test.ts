import { describe, it } from 'vitest';

describe('WP3 Acceptance — Polar & Global Map Visualization', () => {
  it.todo('hillshade light vector depends solely on subsolarLon (never selectedSite or instant.sunAzDeg) and remains identical when switching between connecting_ridge and malapert_summit');
  it.todo('synthetic DEM test confirms slopes facing the Sun are brighter than flat terrain in both 2D and 3D shading functions across orthogonal light directions');
  it.todo('out-of-frame polar sites (e.g. im1_odysseus, cabeus_b_peak, mons_mouton_plateau, nobile_rim_2) render directional edge indicators with distance and label');
  it.todo('computed polar_maps.json layers render 0-100% colorbar legend with units and match site metrics at curated site cells (e.g. connecting_ridge, shackleton_rim)');
  it.todo('Artemis III 2024 candidate regions render GeoJSON polygon rings when rings_polar_km is provided');
});

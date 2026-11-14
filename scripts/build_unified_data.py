"""Build unified JSON and binary DEM data bundle for Lunar Landing Site Navigator.

Outputs written to <output-dir> (default: <repo>/webapp/public/data):
  1. ephemeris.json            - JPL DE441 / MOON_ME hourly subpoints + live validation & eclipses
  2. sites.json                - Data Contract v2 curated landing sites with 5-mast horizons & provenance
  3. artemis3_regions.json     - 9 Artemis III 2024 candidate landing regions + GeoJSON polygon rings
  4. polar_dem_patch.json      - 250x250 (±150 km) South Pole DEM & slope patch (5x5 block center)
  5. dem_manifest.json         - Metadata and georeferencing for client binary DEM grids (I6)
  6. dem_fine_240m.i16         - 1250x1250 int16 LE (±150 km, 240 m/px, meters)
  7. dem_coarse_1200m_max.i16  - 762x762 int16 LE (75S..90S, 1200 m/px 5x5 block-max, meters)
  8. polar_maps.json           - True 250x250 Sun/Earth visibility layers at highest pixel per cell (I7)
  9. site_candidates.json      - WP7 Mode A precomputed 250x250 candidate layers & refined 25-px blocks

Usage:
  python scripts/build_unified_data.py [--input-dir data] [--output-dir webapp/public/data]
      [--workers 8] [--skip-maps] [--step1-cache path/to/cache.npz]
"""
from __future__ import annotations

import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import argparse
import base64
import json
import math
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from fetch_horizons import VALIDATION_SITES, slugify
from grid_candidates import build_polar_maps_and_candidates
from lunar_geometry import (
    ARTEMIS_GEOJSON_URL,
    AU_KM,
    COARSE_N,
    DEM_MPP,
    DEM_N,
    EXTENT_KM,
    FINE_C0,
    FINE_N,
    FINE_R0,
    GRID_N,
    MAST_HEIGHTS,
    R0,
    az_el_series,
    body_vectors,
    compute_horizon_profile,
    compute_slope,
    cr2ll,
    detect_moon_center_eclipses,
    disk_fraction_above,
    evaluate_site_visibility,
    horizon_at_az,
    ll2cr,
    ll2xy,
    load_artemis_regions,
    load_dem,
    spherical_horizon_dip_deg,
    wrap_lon_180,
)

SCHEMA_VERSION = "2.0.0"
DATA_VERSION = "2026-11-14"


def compute_live_validation(
    horizons_dir: Path,
    sub: pd.DataFrame,
    sun_km: np.ndarray,
    earth_km: np.ndarray,
    period_start_utc: str,
    period_end_utc: str,
) -> dict[str, Any]:
    """Compare vector Az/El from moon_subpoints_1h.csv against JPL Horizons topocentric tables."""
    sub_times = pd.to_datetime(sub["time_utc"], utc=True)
    sun_errs: list[float] = []
    earth_errs: list[float] = []
    sites_checked: list[str] = []

    for site in VALIDATION_SITES:
        name = str(site["name"])
        lat = float(site["lat"])
        lon = float(site["lon"])
        slug = slugify(name)
        sun_csv = horizons_dir / f"topo_{slug}_sun.csv"
        earth_csv = horizons_dir / f"topo_{slug}_earth.csv"
        if not sun_csv.exists() or not earth_csv.exists():
            continue

        sites_checked.append(name)
        for vec_km, csv_path, bucket in (
            (sun_km, sun_csv, sun_errs),
            (earth_km, earth_csv, earth_errs),
        ):
            tdf = pd.read_csv(csv_path, parse_dates=["time_utc"])
            t_times = pd.to_datetime(tdf["time_utc"], utc=True)
            if len(tdf) != len(sub) or not (t_times.to_numpy() == sub_times.to_numpy()).all():
                raise ValueError(f"Timestamp mismatch between moon_subpoints_1h.csv and {csv_path.name}")
            az, el = az_el_series(vec_km, lat, lon, h_m=0.0)
            daz = ((az - tdf["az_deg"].to_numpy() + 180.0) % 360.0) - 180.0
            del_ = el - tdf["el_deg"].to_numpy()
            ang_err = np.hypot(daz * np.cos(np.radians(el)), del_)
            bucket.append(float(np.max(ang_err)))

    if not sun_errs or not earth_errs:
        raise FileNotFoundError(
            f"Topocentric validation CSVs (topo_*_{{sun,earth}}.csv) not found in {horizons_dir}. "
            "Run scripts/fetch_horizons.py first."
        )

    return {
        "sun_max_err_deg": round(max(sun_errs), 6),
        "earth_max_err_deg": round(max(earth_errs), 6),
        "ephemeris": "JPL Horizons DE441 / MOON_ME",
        "period_start": period_start_utc,
        "period_end": period_end_utc,
        "sites_checked": sites_checked,
    }


def build_ephemeris(
    horizons_dir: Path,
    generated_utc: str,
) -> tuple[dict[str, Any], pd.DataFrame, np.ndarray, np.ndarray, str, str]:
    """Load moon_subpoints_1h.csv and build EphemerisData JSON with live eclipses and validation."""
    sub_path = horizons_dir / "moon_subpoints_1h.csv"
    sub = pd.read_csv(sub_path, parse_dates=["time_utc"])
    times = pd.to_datetime(sub["time_utc"], utc=True)
    period_start_utc = times.iloc[0].strftime("%Y-%m-%dT%H:%M:%SZ")
    period_end_utc = times.iloc[-1].strftime("%Y-%m-%dT%H:%M:%SZ")

    sun_km, earth_km = body_vectors(sub)
    eclipses = detect_moon_center_eclipses(times, sun_km, earth_km)
    validation = compute_live_validation(
        horizons_dir=horizons_dir,
        sub=sub,
        sun_km=sun_km,
        earth_km=earth_km,
        period_start_utc=period_start_utc,
        period_end_utc=period_end_utc,
    )

    eph_json: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "data_version": DATA_VERSION,
        "generated_utc": generated_utc,
        "t0_utc": period_start_utc,
        "dt_hours": 1,
        "n": int(len(sub)),
        "subearth_lon": np.round(wrap_lon_180(sub["subearth_lon"].to_numpy()), 4).tolist(),
        "subearth_lat": np.round(sub["subearth_lat"].to_numpy(), 4).tolist(),
        "subsolar_lon": np.round(wrap_lon_180(sub["subsolar_lon"].to_numpy()), 4).tolist(),
        "subsolar_lat": np.round(sub["subsolar_lat"].to_numpy(), 4).tolist(),
        "earth_dist_km": np.round(sub["earth_moon_au"].to_numpy() * AU_KM, 1).tolist(),
        "eclipses": eclipses,
        "validation": validation,
    }
    return eph_json, sub, sun_km, earth_km, period_start_utc, period_end_utc


def export_dem_binaries_and_patch(
    dem: np.ndarray,
    slope_full: np.ndarray,
    output_dir: Path,
    generated_utc: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Export I6 fine/coarse int16 binary DEMs, dem_manifest.json, and fixed polar_dem_patch.json."""
    # Fine grid: central ±150 km crop (1250x1250 at 240 m/px)
    fine_crop = dem[FINE_R0 : FINE_R0 + FINE_N, FINE_C0 : FINE_C0 + FINE_N]
    fine_i16 = np.round(fine_crop).astype("<i2")
    fine_path = output_dir / "dem_fine_240m.i16"
    fine_i16.tofile(fine_path)

    # Coarse grid: 762x762 blocks of 5x5 max across 0..3810
    span = COARSE_N * 5
    coarse_max = dem[:span, :span].reshape(COARSE_N, 5, COARSE_N, 5).max(axis=(1, 3))
    coarse_i16 = np.round(coarse_max).astype("<i2")
    coarse_path = output_dir / "dem_coarse_1200m_max.i16"
    coarse_i16.tofile(coarse_path)

    # Exact center of pixel (0, 0) in each grid
    fine_x0_m = round((FINE_C0 - 0.5 * DEM_N + 0.5) * DEM_MPP, 1)  # -149880.0
    fine_y0_m = round(-(FINE_R0 - 0.5 * DEM_N + 0.5) * DEM_MPP, 1)  # +149880.0
    coarse_x0_m = round((2.0 - 0.5 * DEM_N + 0.5) * DEM_MPP, 1)  # -456840.0
    coarse_y0_m = round(-(2.0 - 0.5 * DEM_N + 0.5) * DEM_MPP, 1)  # +456840.0

    manifest_json: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "data_version": DATA_VERSION,
        "generated_utc": generated_utc,
        "dtype": "int16",
        "endianness": "little",
        "unit": "m",
        "radius_m": R0,
        "fine": {
            "file": "dem_fine_240m.i16",
            "n_cols": FINE_N,
            "n_rows": FINE_N,
            "mpp_m": DEM_MPP,
            "x0_m": fine_x0_m,
            "y0_m": fine_y0_m,
            "aggregation": "native",
            "scale_m": 1.0,
            "byte_length": int(fine_path.stat().st_size),
            "schema_version": SCHEMA_VERSION,
        },
        "coarse": {
            "file": "dem_coarse_1200m_max.i16",
            "n_cols": COARSE_N,
            "n_rows": COARSE_N,
            "mpp_m": DEM_MPP * 5.0,
            "x0_m": coarse_x0_m,
            "y0_m": coarse_y0_m,
            "aggregation": "max",
            "scale_m": 1.0,
            "byte_length": int(coarse_path.stat().st_size),
            "schema_version": SCHEMA_VERSION,
        },
    }

    # Fixed 5x5 center offset for 250x250 background visualization patch (WP1-A8)
    patch_elev = dem[FINE_R0 + 2 : FINE_R0 + FINE_N : 5, FINE_C0 + 2 : FINE_C0 + FINE_N : 5].copy()
    patch_slope = slope_full[FINE_R0 + 2 : FINE_R0 + FINE_N : 5, FINE_C0 + 2 : FINE_C0 + FINE_N : 5].copy()
    elev_i16 = np.round(patch_elev).astype("<i2")
    slope_u8 = np.clip(np.round(patch_slope * 5.0), 0, 255).astype(np.uint8)

    dem_patch_json: dict[str, Any] = {
        "schema_version": SCHEMA_VERSION,
        "data_version": DATA_VERSION,
        "generated_utc": generated_utc,
        "grid_size": int(patch_elev.shape[0]),
        "mpp": float(DEM_MPP * 5.0),
        "extent_km": EXTENT_KM,
        "elev_min_m": round(float(np.min(patch_elev)), 1),
        "elev_max_m": round(float(np.max(patch_elev)), 1),
        "slope_scale_deg": 0.2,
        "elev_i16_b64": base64.b64encode(elev_i16.tobytes()).decode("ascii"),
        "slope_u8_b64": base64.b64encode(slope_u8.tobytes()).decode("ascii"),
    }
    return manifest_json, dem_patch_json


def curate_site_specs() -> list[dict[str, Any]]:
    """Return curated site definitions adhering to Data Contract v2, WP1-A6/A7, and Q7."""
    a3_2024_press_url = "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/"
    return [
        # --- South Pole / Artemis III 2024 & PGDA Peaks/Rims (13 polar sites) ---
        dict(
            id="connecting_ridge",
            name="Connecting Ridge Peak (PGDA Site 01)",
            short_name="Connecting Ridge",
            category="South Pole Sites",
            program="NASA GSFC PGDA Site 01 (2022–2023)",
            lat=-89.45,
            lon=-137.31,
            refine="high",
            refine_radius_px=6,
            default_elev_m=1950.0,
            description="Elevated ridge saddle linking Shackleton and de Gerlache craters near the lunar south pole, studied for persistent polar solar illumination.",
            coord_source="Mazarico et al. (2011) C1 & NASA 2022 candidate list / PGDA Site 01",
            source_url="https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/",
            list_membership="Artemis III 2022 (13 regions; omitted in 2024 9-region update) / PGDA LOLA 5mpp Site 01",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="shackleton_rim",
            name="Shackleton Crater Rim (PGDA Site 04)",
            short_name="Shackleton Rim",
            category="South Pole Sites",
            program="NASA GSFC PGDA Site 04",
            lat=-89.796,
            lon=54.462,
            refine="high",
            refine_radius_px=8,
            default_elev_m=1424.0,
            description="Elevated rim crest bordering Shackleton crater, evaluated in polar surveys adjacent to permanently shadowed interior slopes.",
            coord_source="NASA GSFC PGDA Shackleton Rim (Site 04) peak illumination survey",
            source_url="https://pgda.gsfc.nasa.gov/products/78",
            list_membership="NASA PGDA LOLA 5mpp Site 04 / Peak Illumination Reference (not in Artemis III 2022 or 2024)",
            mission_status="reference",
            coord_verified=True,
        ),
        dict(
            id="peak_near_shackleton",
            name="Peak Near Shackleton (PGDA Site 07)",
            short_name="Peak Near Shackleton",
            category="South Pole Sites",
            program="NASA GSFC PGDA Site 07",
            lat=-88.80,
            lon=123.5,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=1640.0,
            description="Ridge prominence near Shackleton crater analyzed in NASA polar elevation and illumination studies.",
            coord_source="NASA 2022 13-region candidate release & PGDA Site 07",
            source_url="https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/",
            list_membership="Artemis III 2022 (13 regions; omitted from revised Artemis III 2024 9-region list)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="de_gerlache_rim_1",
            name="de Gerlache Rim 1 (PGDA Site 11)",
            short_name="de Gerlache Rim 1",
            category="South Pole Sites",
            program="NASA GSFC PGDA Site 11",
            lat=-88.45,
            lon=-69.0,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=1800.0,
            description="Elevated highland rim sector along the western wall of de Gerlache crater in southern polar terrain.",
            coord_source="NASA 2022 13-region candidate release / PGDA Site 11 (adjacent to G2)",
            source_url="https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/",
            list_membership="Artemis III 2022 (13 regions; omitted as standalone region in Artemis III 2024 list)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="de_gerlache_rim_2",
            name="de Gerlache Rim 2 (Artemis III 2024 G2)",
            short_name="de Gerlache Rim 2",
            category="South Pole Sites",
            program="Artemis III 2024 Region G2",
            lat=-88.142,
            lon=-63.662,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=1500.0,
            description="Official NASA candidate landing region bordering de Gerlache crater on the southern polar highlands.",
            coord_source="NASA Artemis III 2024 Candidate Regions GeoJSON / CSV (G2)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2022 & 2024 (G2)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="malapert_summit",
            name="Malapert Massif (Artemis III 2024 MA / Site 23)",
            short_name="Malapert Massif",
            category="South Pole Sites",
            program="Artemis III 2024 Region MA / PGDA Site 23",
            lat=-85.99,
            lon=2.09,
            refine="high",
            refine_radius_px=8,
            default_elev_m=5170.0,
            description="Elevated summit massif on the Earth-facing prime meridian studied for combined solar illumination and direct Earth line-of-sight.",
            coord_source="USGS/LOLA Malapert Massif summit inside NASA 2024 MA (PGDA Site 23)",
            source_url="https://pgda.gsfc.nasa.gov/data/LOLA_5mpp/README",
            list_membership="Artemis III 2022 & 2024 (MA; summit peak inside MA boundary)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="nobile_rim_1",
            name="Nobile Rim 1 (Artemis III 2024 N1)",
            short_name="Nobile Rim 1",
            category="South Pole Sites",
            program="Artemis III 2024 Region N1",
            lat=-85.423,
            lon=36.190,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=2200.0,
            description="Official NASA candidate landing region centered along the western rim margin of Nobile crater.",
            coord_source="NASA Artemis III 2024 Candidate Regions CSV / GeoJSON N1 centroid (reset from erroneous baseline offset)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2022 & 2024 (N1)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="leibnitz_beta",
            name="Mons Mouton / Leibnitz Beta (Artemis III 2024 MM / Site 20)",
            short_name="Mons Mouton",
            category="South Pole Sites",
            program="Artemis III 2024 Region MM / PGDA Site 20",
            lat=-85.40,
            lon=32.0,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=4800.0,
            description="Elevated highland massif plateau between Nobile and Shoemaker craters retained across NASA southern polar region selections.",
            coord_source="NASA 2022/2024 inside MM polygon (PGDA Site 20v2 summit)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2022 (Leibnitz Beta Plateau) & 2024 (Mons Mouton / MM)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="haworth_rim",
            name="Haworth Crater Region (Artemis III 2024 HW)",
            short_name="Haworth Rim",
            category="South Pole Sites",
            program="Artemis III 2024 Region HW",
            lat=-86.635,
            lon=-23.672,
            refine="high_safe",
            refine_radius_px=20,
            default_elev_m=1500.0,
            description="Official NASA candidate landing region spanning highland terrain flanking Haworth crater.",
            coord_source="NASA Artemis III 2024 Candidate Regions CSV / GeoJSON (HW)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2022 & 2024 (HW)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="cabeus_b_peak",
            name="Peak Near Cabeus B (Artemis III 2024 CB)",
            short_name="Cabeus B Peak",
            category="South Pole Sites",
            program="Artemis III 2024 Region CB",
            lat=-83.552,
            lon=-68.416,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=1200.0,
            description="Official NASA candidate landing region near Cabeus B crater outside the central polar map frame while remaining inside polar elevation coverage.",
            coord_source="NASA Artemis III 2024 Candidate Regions CSV / GeoJSON (CB)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2024 (9 candidate regions, CB)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="slater_plain",
            name="Slater Plain (Artemis III 2024 SP)",
            short_name="Slater Plain",
            category="South Pole Sites",
            program="Artemis III 2024 Region SP",
            lat=-87.256,
            lon=125.218,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=1200.0,
            description="Official NASA candidate landing region located on highland plains adjacent to Slater crater.",
            coord_source="NASA Artemis III 2024 Candidate Regions CSV / GeoJSON (SP)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2024 (9 candidate regions, SP)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="mons_mouton_plateau",
            name="Mons Mouton Plateau (Artemis III 2024 MP)",
            short_name="Mons Mouton Plateau",
            category="South Pole Sites",
            program="Artemis III 2024 Region MP",
            lat=-84.290,
            lon=27.425,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=4500.0,
            description="Broad elevated plateau north of the Mons Mouton summit added in the updated NASA candidate landing region catalog.",
            coord_source="NASA Artemis III 2024 Candidate Regions CSV / GeoJSON (MP)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2024 (9 candidate regions, MP)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        dict(
            id="nobile_rim_2",
            name="Nobile Rim 2 (Artemis III 2024 N2)",
            short_name="Nobile Rim 2",
            category="South Pole Sites",
            program="Artemis III 2024 Region N2",
            lat=-83.976,
            lon=57.961,
            refine="high_safe",
            refine_radius_px=15,
            default_elev_m=2000.0,
            description="Official NASA candidate landing region northeast of Nobile crater near the eastern margin of the polar map frame.",
            coord_source="NASA Artemis III 2024 Candidate Regions CSV / GeoJSON (N2)",
            source_url=a3_2024_press_url,
            list_membership="Artemis III 2022 & 2024 (9 candidate regions, N2)",
            mission_status="candidate_region",
            coord_verified=True,
        ),
        # --- CLPS Commercial Landers ---
        dict(
            id="im1_odysseus",
            name="IM-1 Odysseus (CLPS Malapert-A)",
            short_name="IM-1 Odysseus",
            category="CLPS Commercial",
            program="NASA CLPS / Intuitive Machines",
            lat=-80.13,
            lon=1.44,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=2588.0,
            description="Touchdown location of the Intuitive Machines Odysseus robotic lander near Malapert A crater in the southern highlands.",
            coord_source="NASA LRO NAC pinpoint coordinates for IM-1 Odysseus",
            source_url="https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/",
            list_membership="NASA CLPS TO2-IM (landed commercial mission)",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="im2_athena",
            name="IM-2 Athena (CLPS Mons Mouton)",
            short_name="IM-2 Athena",
            category="CLPS Commercial",
            program="NASA CLPS / Intuitive Machines",
            lat=-84.7906,
            lon=29.1957,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=5320.0,
            description="Intuitive Machines second CLPS landing location inside a Mons Mouton highland crater targeted for subsurface volatile prospecting.",
            coord_source="LROC NAC feature 1408 exact Mons Mouton landing localization",
            source_url="https://lroc.im-ldi.com/images/1408",
            list_membership="NASA CLPS PRIME-1 / IM-2 (inside Artemis III 2024 MP)",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="blue_ghost_m1",
            name="Blue Ghost M1 (CLPS Mare Crisium)",
            short_name="Blue Ghost M1",
            category="CLPS Commercial",
            program="NASA CLPS / Firefly Aerospace",
            lat=18.5623,
            lon=61.8103,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-3400.0,
            description="Firefly Aerospace commercial CLPS robotic lander touchdown site near Mons Latreille in Mare Crisium outside polar elevation coverage.",
            coord_source="LROC NAC feature 1407 Mare Crisium landing localization",
            source_url="https://lroc.im-ldi.com/images/1407",
            list_membership="NASA CLPS TO19D Firefly Blue Ghost M1",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="im3_reiner_gamma",
            name="IM-3 / Lunar Vertex (Reiner Gamma)",
            short_name="IM-3 Reiner Gamma",
            category="CLPS Commercial",
            program="NASA CLPS / Intuitive Machines",
            lat=7.5850,
            lon=-58.7250,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-1900.0,
            description="Planned Intuitive Machines CLPS delivery and Lunar Vertex rover target over the magnetic swirl at Reiner Gamma.",
            coord_source="LPSC 2025 #1233 published Lunar Vertex landing coordinate",
            source_url="https://www.hou.usra.edu/meetings/lpsc2025/pdf/1233.pdf",
            list_membership="NASA CLPS CP-11 Intuitive Machines IM-3",
            mission_status="planned",
            coord_verified=True,
        ),
        dict(
            id="bg_m2_lusee_night",
            name="Blue Ghost M2 / LuSEE-Night (Farside)",
            short_name="Blue Ghost M2 (Farside)",
            category="CLPS Commercial",
            program="NASA CLPS / Firefly Aerospace",
            lat=-23.8140,
            lon=-177.7420,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=1200.0,
            description="Planned lunar farside CLPS radio astronomy experiment site shielded from terrestrial radio interference with permanent Earth blockage.",
            coord_source="arXiv:2508.16773v3 published LuSEE-Night farside target coordinate",
            source_url="https://arxiv.org/html/2508.16773v3",
            list_membership="NASA CLPS CS-3 Firefly Blue Ghost M2",
            mission_status="planned",
            coord_verified=True,
        ),
        dict(
            id="bg_m3_gruithuisen",
            name="Blue Ghost M3 / Lunar-VISE (Gruithuisen)",
            short_name="Blue Ghost M3",
            category="CLPS Commercial",
            program="NASA CLPS / Firefly Aerospace",
            lat=36.45715,
            lon=-40.79602,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-1200.0,
            description="Planned northern silicic volcanic dome target at Mons Gruithuisen Gamma for Lunar-VISE surface compositional measurements.",
            coord_source="Williams et al. (2026) PSJ 7:161 Mons Gruithuisen Gamma ellipse center",
            source_url="https://science.nasa.gov/lunar-science/clps-deliveries/cp-21-science/",
            list_membership="NASA CLPS CP-21 Firefly Blue Ghost M3",
            mission_status="planned",
            coord_verified=True,
        ),
        # --- Polar Reference & PSR Contrast (2 sites) ---
        dict(
            id="shackleton_psr",
            name="Shackleton Crater Floor (PSR)",
            short_name="Shackleton PSR",
            category="Polar Reference / PSR",
            program="PSR Contrast Baseline",
            lat=-89.63,
            lon=118.47,
            refine="low",
            refine_radius_px=10,
            default_elev_m=-2855.0,
            description="Deep interior floor of Shackleton crater used as a permanently shadowed reference point deprived of direct sunlight and direct Earth view.",
            coord_source="LOLA DEM minimum elevation basin inside Shackleton crater (USGS Feature 5450)",
            source_url="https://planetarynames.wr.usgs.gov/Feature/5450",
            list_membership="Polar Reference / PSR contrast",
            mission_status="reference",
            coord_verified=True,
        ),
        dict(
            id="south_pole_90s",
            name="Geographic South Pole (Datum)",
            short_name="South Pole 90S",
            category="Polar Reference / PSR",
            program="Reference Datum",
            lat=-90.0,
            lon=0.0,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=1295.0,
            description="Lunar rotational south pole datum positioned along a depressed sector of the Shackleton crater rim.",
            coord_source="NASA PDS LOLA polar stereographic 90S DE421 datum",
            source_url="https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/avgvisib_85s_060m_201608.lbl",
            list_membership="Rotational Reference Datum",
            mission_status="reference",
            coord_verified=True,
        ),
        # --- Historic & International Missions (outside polar DEM, terrain_source="NONE") ---
        dict(
            id="apollo_11",
            name="Apollo 11 (Tranquility Base)",
            short_name="Apollo 11",
            category="Historic & International",
            program="NASA Apollo Program",
            lat=0.67408,
            lon=23.47297,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-1900.0,
            description="Historic crewed equatorial mare landing site in Mare Tranquillitatis outside polar DEM coverage, modeled with smooth spherical horizon dip.",
            coord_source="NASA History SP-4029 / Davies & Colvin (2000) Apollo 11 LRRR geodetic coordinate",
            source_url="https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_11a_Summary.htm",
            list_membership="Historic Crewed Reference",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="apollo_15",
            name="Apollo 15 (Hadley Rille)",
            short_name="Apollo 15",
            category="Historic & International",
            program="NASA Apollo Program",
            lat=26.13222,
            lon=3.63386,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-1850.0,
            description="Historic crewed mid-latitude landing site near Hadley Rille in Mare Imbrium outside polar DEM coverage, modeled with smooth spherical horizon dip.",
            coord_source="NASA History SP-4029 / Davies & Colvin (2000) Apollo 15 LRRR geodetic coordinate",
            source_url="https://www.nasa.gov/wp-content/uploads/static/history/SP-4029/Apollo_15a_Summary.htm",
            list_membership="Historic Crewed Reference",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="apollo_17",
            name="Apollo 17 (Taurus-Littrow)",
            short_name="Apollo 17",
            category="Historic & International",
            program="NASA Apollo Program",
            lat=20.1911,
            lon=30.7723,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-2500.0,
            description="Final crewed Apollo lunar highland valley landing site in Taurus-Littrow outside polar DEM coverage, modeled with smooth spherical horizon dip.",
            coord_source="Wagner et al. (2017) NSSDCA / LROC DE421 Taurus-Littrow localization",
            source_url="https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html",
            list_membership="Historic Crewed Reference",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="slim_jaxa",
            name="SLIM Moon Sniper (JAXA)",
            short_name="SLIM (JAXA)",
            category="Historic & International",
            program="JAXA Lunar Exploration",
            lat=-13.3160,
            lon=25.2510,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-600.0,
            description="Precision robotic landing site of the JAXA Smart Lander near Shioli crater outside polar DEM coverage, modeled with smooth spherical horizon dip.",
            coord_source="NASA LRO NAC pinpoint coordinates near Shioli crater",
            source_url="https://www.nasa.gov/missions/lro/nasas-lro-spots-japans-moon-lander/",
            list_membership="International Robotic Reference",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="change_4",
            name="Chang'e-4 (CNSA Far Side)",
            short_name="Chang'e-4 (Far Side)",
            category="Historic & International",
            program="CNSA Lunar Exploration",
            lat=-45.4446,
            lon=177.5991,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-5900.0,
            description="Lunar far-side robotic landing site inside Von Karman crater requiring relay communications due to permanent Earth blockage.",
            coord_source="China NSSDC / Liu et al. (2019) Von Karman crater localization",
            source_url="https://www.nssdc.ac.cn/nssdc_en/html/task/change4.html",
            list_membership="International Robotic Reference",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="change_6",
            name="Chang'e-6 (Apollo Basin)",
            short_name="Chang'e-6 (Far Side)",
            category="Historic & International",
            program="CNSA Lunar Exploration",
            lat=-41.6385,
            lon=-153.9852,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-5200.0,
            description="Lunar far-side robotic sample-return touchdown site in the southern Apollo basin requiring relay communications due to permanent Earth blockage.",
            coord_source="LROC NAC feature 1374 far-side Apollo basin localization",
            source_url="https://lroc.im-ldi.com/images/1374",
            list_membership="International Robotic Reference (Farside Sample Return)",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="chandrayaan_3",
            name="Chandrayaan-3 Shiv Shakti (ISRO)",
            short_name="Chandrayaan-3 (ISRO)",
            category="Historic & International",
            program="ISRO Chandrayaan Program",
            lat=-69.3733,
            lon=32.3191,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=1400.0,
            description="Southern high-latitude robotic landing site of ISRO north of polar terrain coverage, modeled with smooth spherical horizon dip.",
            coord_source="IAU/USGS Statio Shiv Shakti (Feature 16272) Vikram localization",
            source_url="https://planetarynames.wr.usgs.gov/Feature/16272",
            list_membership="International Robotic Reference",
            mission_status="landed",
            coord_verified=True,
        ),
        dict(
            id="hakuto_m1",
            name="ispace HAKUTO-R M1 (Atlas Crater)",
            short_name="HAKUTO-R M1",
            category="Historic & International",
            program="ispace Commercial Exploration",
            lat=47.5810,
            lon=44.0940,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-1600.0,
            description="Northern mid-latitude commercial lunar lander attempt near Atlas crater outside polar DEM coverage, modeled with smooth spherical horizon dip.",
            coord_source="LROC NAC feature 1302 Atlas crater impact site localization",
            source_url="https://lroc.im-ldi.com/images/1302",
            list_membership="Commercial Lunar Lander (ispace HAKUTO-R Mission 1)",
            mission_status="attempted",
            coord_verified=True,
        ),
        dict(
            id="hakuto_m2_resilience",
            name="ispace Resilience (HAKUTO-R M2)",
            short_name="Resilience M2",
            category="Historic & International",
            program="ispace Commercial Exploration",
            lat=60.4445,
            lon=-4.5880,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-2200.0,
            description="Northern high-latitude commercial lunar lander attempt in Mare Frigoris outside polar DEM coverage, modeled with smooth spherical horizon dip.",
            coord_source="LROC NAC feature 1456 Mare Frigoris landing attempt localization",
            source_url="https://lroc.im-ldi.com/images/1456",
            list_membership="Commercial Lunar Lander (ispace HAKUTO-R Mission 2)",
            mission_status="attempted",
            coord_verified=True,
        ),
        dict(
            id="luna_25",
            name="Luna 25 (Pontecoulant G)",
            short_name="Luna 25",
            category="Historic & International",
            program="Roscosmos Lunar Exploration",
            lat=-57.8650,
            lon=61.3600,
            refine="exact",
            refine_radius_px=0,
            default_elev_m=-800.0,
            description="Southern highland robotic mission impact location inside Pontecoulant G crater north of polar terrain coverage.",
            coord_source="NASA LRO NAC crater detection inside Pontecoulant G",
            source_url="https://www.nasa.gov/humans-in-space/nasas-lro-observes-crater-likely-from-luna-25-impact/",
            list_membership="International Robotic Attempt",
            mission_status="attempted",
            coord_verified=True,
        ),
    ]


def build_sites_dataset(
    specs: list[dict[str, Any]],
    dem: np.ndarray,
    slope_full: np.ndarray,
    sun_km: np.ndarray,
    earth_km: np.ndarray,
    generated_utc: str,
) -> dict[str, Any]:
    """Evaluate all curated landing sites and serialize Data Contract v2 SitesDataset."""
    sites_out: list[dict[str, Any]] = []
    half_box_px = 62  # 125x125 pixel (30 km x 30 km) baseline box

    for s in specs:
        is_polar = float(s["lat"]) <= -75.0
        horizons_by_mast: dict[str, list[float]] = {}
        blocking_dist_km: list[float] | None = None
        refine_offset_km = 0.0

        if is_polar:
            terrain_source = "LOLA_240M"
            elev_source = "DEM"
            c_nom, r_nom = ll2cr(s["lat"], s["lon"])
            ci, ri = int(round(float(c_nom))), int(round(float(r_nom)))

            rad = int(s["refine_radius_px"])
            if s["refine"] != "exact" and rad > 0:
                pr0, pr1 = max(0, ri - rad), min(DEM_N, ri + rad + 1)
                pc0, pc1 = max(0, ci - rad), min(DEM_N, ci + rad + 1)
                pe = dem[pr0:pr1, pc0:pc1]
                ps = slope_full[pr0:pr1, pc0:pc1]
                if s["refine"] == "high_safe":
                    safe_mask = ps <= 8.0
                    masked = np.where(safe_mask, pe, -1e9)
                    idx = int(np.argmax(masked)) if np.any(safe_mask) else int(np.argmax(pe))
                elif s["refine"] == "high":
                    idx = int(np.argmax(pe))
                else:  # low
                    idx = int(np.argmin(pe))
                dr_off, dc_off = np.unravel_index(idx, pe.shape)
                ri_obs, ci_obs = int(pr0 + dr_off), int(pc0 + dc_off)
            else:
                ri_obs, ci_obs = ri, ci

            lat_obs, lon_obs = cr2ll(ci_obs, ri_obs)
            h_obs = float(dem[ri_obs, ci_obs])
            slope_obs: float | None = round(float(slope_full[ri_obs, ci_obs]), 2)

            nom_x, nom_y = ll2xy(s["lat"], s["lon"])
            obs_x, obs_y = ll2xy(lat_obs, lon_obs)
            refine_offset_km = round(float(math.hypot(float(obs_x) - float(nom_x), float(obs_y) - float(nom_y)) / 1000.0), 3)
            polar_x_km: float | None = round(float(obs_x) / 1000.0, 3)
            polar_y_km: float | None = round(float(obs_y) / 1000.0, 3)

            # 30 km x 30 km LOLA 240 m baseline topographic statistics
            b0_r, b1_r = max(0, ri_obs - half_box_px), min(DEM_N, ri_obs + half_box_px + 1)
            b0_c, b1_c = max(0, ci_obs - half_box_px), min(DEM_N, ci_obs + half_box_px + 1)
            sub_e = dem[b0_r:b1_r, b0_c:b1_c]
            sub_s = slope_full[b0_r:b1_r, b0_c:b1_c]

            terrain_stats: dict[str, float] | None = {
                "elev_min_m": round(float(np.min(sub_e)), 1),
                "elev_median_m": round(float(np.median(sub_e)), 1),
                "elev_max_m": round(float(np.max(sub_e)), 1),
                "elev_relief_m": round(float(np.max(sub_e) - np.min(sub_e)), 1),
                "slope_mean_deg": round(float(np.mean(sub_s)), 2),
                "slope_median_deg": round(float(np.median(sub_s)), 2),
                "slope_p90_deg": round(float(np.percentile(sub_s, 90)), 2),
                "pct_safe_hls_le_5deg": round(float(np.mean(sub_s <= 5.0) * 100.0), 1),
                "pct_rover_le_15deg": round(float(np.mean(sub_s <= 15.0) * 100.0), 1),
            }

            for mh in MAST_HEIGHTS:
                hz, bd = compute_horizon_profile(dem, lat_obs, lon_obs, h_obs, mh)
                key = str(int(mh)) if mh == int(mh) else str(mh)
                horizons_by_mast[key] = np.round(hz, 3).tolist()
                if mh == 2.0:
                    blocking_dist_km = np.round(bd, 2).tolist()
            hz_2m = np.array(horizons_by_mast["2"], dtype=np.float64)

            vis_metrics = evaluate_site_visibility(
                hz_2m=hz_2m,
                sun_km=sun_km,
                earth_km=earth_km,
                lat_deg=lat_obs,
                lon_deg=lon_obs,
                observer_height_m=h_obs + 2.0,
            )

            # +-240 m positional drift includes BOTH center pixel (0, 0) and 4 cardinal neighbors (DATA-5)
            drift_suns = [float(vis_metrics["sun_visible_pct"])]
            for d_r, d_c in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
                nr = min(max(0, ri_obs + d_r), DEM_N - 1)
                nc = min(max(0, ci_obs + d_c), DEM_N - 1)
                n_lat, n_lon = cr2ll(nc, nr)
                n_h = float(dem[nr, nc])
                n_hz, _ = compute_horizon_profile(dem, n_lat, n_lon, n_h, 2.0)
                n_s_az, n_s_el = az_el_series(sun_km, n_lat, n_lon, n_h + 2.0)
                n_hz_at = horizon_at_az(n_s_az, n_hz)
                n_fs = disk_fraction_above(n_s_el, n_hz_at)
                drift_suns.append(float(np.mean(n_fs) * 100.0))
            drift_240m: dict[str, float] | None = {
                "sun_min_pct": round(min(drift_suns), 1),
                "sun_max_pct": round(max(drift_suns), 1),
            }

        else:
            # Outside LOLA South Pole DEM coverage: zero fake terrain metrics, smooth-sphere dip (DATA-3 / SCI-4)
            terrain_source = "NONE"
            elev_source = "APPROXIMATE"
            lat_obs = float(s["lat"])
            lon_obs = float(s["lon"])
            h_obs = float(s["default_elev_m"])
            polar_x_km = None
            polar_y_km = None
            slope_obs = None
            terrain_stats = None
            blocking_dist_km = None
            drift_240m = None

            for mh in MAST_HEIGHTS:
                key = str(int(mh)) if mh == int(mh) else str(mh)
                dip_deg = round(spherical_horizon_dip_deg(mh), 4)
                horizons_by_mast[key] = [dip_deg] * 360

            hz_2m = np.full(360, spherical_horizon_dip_deg(2.0), dtype=np.float64)
            vis_metrics = evaluate_site_visibility(
                hz_2m=hz_2m,
                sun_km=sun_km,
                earth_km=earth_km,
                lat_deg=lat_obs,
                lon_deg=lon_obs,
                observer_height_m=h_obs + 2.0,
            )

        sites_out.append({
            "id": s["id"],
            "name": s["name"],
            "short_name": s["short_name"],
            "category": s["category"],
            "program": s["program"],
            "description": s["description"],
            "terrain_source": terrain_source,
            "is_polar_dem": is_polar,
            "elev_source": elev_source,
            "lat": round(float(lat_obs), 4),
            "lon": round(float(lon_obs), 4),
            "polar_x_km": polar_x_km,
            "polar_y_km": polar_y_km,
            "elev_m": round(float(h_obs), 1),
            "local_slope_deg": slope_obs,
            "terrain_stats": terrain_stats,
            "metrics_2m": {
                "sun_no_terrain_pct": round(float(vis_metrics["sun_no_terrain_pct"]), 1),
                "sun_time_pct": round(float(vis_metrics["sun_time_pct"]), 1),
                "sun_visible_pct": round(float(vis_metrics["sun_visible_pct"]), 1),
                "earth_visible_pct": round(float(vis_metrics["earth_visible_pct"]), 1),
                "both_visible_pct": round(float(vis_metrics["both_visible_pct"]), 1),
                "longest_sun_days": float(vis_metrics["longest_sun_days"]),
                "max_dark_days": float(vis_metrics["max_dark_days"]),
                "earth_max_gap_days": float(vis_metrics["earth_max_gap_days"]),
                "viability_score": None,
                "archetype": None,
            },
            "drift_240m": drift_240m,
            "horizons_by_mast": horizons_by_mast,
            "blocking_dist_km": blocking_dist_km,
            "provenance": {
                "coord_source": s["coord_source"],
                "source_url": s["source_url"],
                "nominal_lat": float(s["lat"]),
                "nominal_lon": float(s["lon"]),
                "refine_mode": s["refine"],
                "refine_offset_km": refine_offset_km,
                "list_membership": s["list_membership"],
                "coord_verified": bool(s["coord_verified"]),
            },
            "mission_status": s["mission_status"],
        })

        print(
            f"      - {s['short_name']:22s} | {terrain_source:9s} | lat={lat_obs:7.3f} | "
            f"SunDisk={vis_metrics['sun_visible_pct']:5.1f}% SunTime={vis_metrics['sun_time_pct']:5.1f}% "
            f"Earth={vis_metrics['earth_visible_pct']:5.1f}% Both={vis_metrics['both_visible_pct']:5.1f}%"
        )

    return {
        "schema_version": SCHEMA_VERSION,
        "data_version": DATA_VERSION,
        "generated_utc": generated_utc,
        "mast_heights": MAST_HEIGHTS,
        "sites": sites_out,
    }


def main() -> None:
    repo_root = Path(__file__).resolve().parent.parent
    parser = argparse.ArgumentParser(description="Build unified Lunar Landing Site Navigator JSON & DEM bundle.")
    parser.add_argument("--input-dir", type=Path, default=repo_root / "data", help="Input data root directory.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=repo_root / "webapp" / "public" / "data",
        help="Output public data directory.",
    )
    parser.add_argument("--workers", type=int, default=8, help="Worker process count for 250x250 map generation.")
    parser.add_argument("--skip-maps", action="store_true", help="Skip recomputing polar_maps.json and site_candidates.json.")
    parser.add_argument("--step1-cache", type=Path, default=None, help="Optional Step-1 .npz cache for fast Step-2 rebuilds.")
    args = parser.parse_args()

    t_all = time.time()
    input_dir: Path = args.input_dir
    output_dir: Path = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)
    generated_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    def _write_json(filename: str, payload: Any) -> Path:
        dest = output_dir / filename
        dest.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
        print(f"      Wrote {dest} ({dest.stat().st_size:,} B)")
        return dest

    print("[1/5] Loading JPL Horizons ephemeris & computing live validation + eclipses...")
    eph_json, _, sun_km, earth_km, period_start_utc, period_end_utc = build_ephemeris(
        horizons_dir=input_dir / "horizons",
        generated_utc=generated_utc,
    )
    _write_json("ephemeris.json", eph_json)
    print(
        f"      n={eph_json['n']:,} steps | {len(eph_json['eclipses'])} eclipses | "
        f"validation max err: Sun={eph_json['validation']['sun_max_err_deg']:.6f} deg, "
        f"Earth={eph_json['validation']['earth_max_err_deg']:.6f} deg"
    )

    print("[2/5] Loading LOLA 240m/px DEM, exporting binary I6 grids & fixed 5x5 center patch...")
    dem_path = input_dir / "lola" / "ldem_75s_240m.img"
    dem = load_dem(dem_path)
    slope_full = compute_slope(dem)
    manifest_json, patch_json = export_dem_binaries_and_patch(dem, slope_full, output_dir, generated_utc)
    _write_json("dem_manifest.json", manifest_json)
    _write_json("polar_dem_patch.json", patch_json)

    print("[3/5] Building Artemis III 2024 regions + GeoJSON polygons...")
    regions_list = load_artemis_regions(
        csv_path=input_dir / "artemis3_regions_2024.csv",
        geojson_path=input_dir / "artemis3_regions_2024.geojson",
        source_url=ARTEMIS_GEOJSON_URL,
    )
    artemis_dataset = {
        "schema_version": SCHEMA_VERSION,
        "data_version": DATA_VERSION,
        "generated_utc": generated_utc,
        "regions": regions_list,
    }
    _write_json("artemis3_regions.json", artemis_dataset)

    print("[4/5] Evaluating curated landing sites (Contract v2)...")
    specs = curate_site_specs()
    sites_dataset = build_sites_dataset(
        specs=specs,
        dem=dem,
        slope_full=slope_full,
        sun_km=sun_km,
        earth_km=earth_km,
        generated_utc=generated_utc,
    )
    _write_json("sites.json", sites_dataset)

    if args.skip_maps:
        print("[5/5] Skipping polar_maps.json and site_candidates.json (--skip-maps).")
    else:
        print("[5/5] Computing TRUE polar_maps.json (I7) & site_candidates.json (WP7 Mode A)...")
        polar_maps_json, candidates_json, _ = build_polar_maps_and_candidates(
            dem=dem,
            slope_full=slope_full,
            dem_path=dem_path,
            sun_km=sun_km,
            earth_km=earth_km,
            period_start_utc=period_start_utc,
            period_end_utc=period_end_utc,
            schema_version=SCHEMA_VERSION,
            data_version=DATA_VERSION,
            generated_utc=generated_utc,
            artemis_regions=regions_list,
            workers=args.workers,
            step1_cache_npz=args.step1_cache,
        )
        _write_json("polar_maps.json", polar_maps_json)
        _write_json("site_candidates.json", candidates_json)

    print(f"Done in {time.time() - t_all:.2f}s.")


if __name__ == "__main__":
    main()

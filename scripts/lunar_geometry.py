"""Core lunar geometry, LOLA DEM ray-marching, and ephemeris visibility physics.

Shared by scripts/build_unified_data.py, scripts/grid_candidates.py, and verification scripts.
All coordinate conventions follow NASA LRO LOLA LDEM_75S_240M (South Polar Stereographic,
MOON_ME body-fixed longitude/latitude, reference radius R0 = 1737.4 km).
"""
from __future__ import annotations

import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import json
import math
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable, Sequence

import numpy as np
import pandas as pd

R0 = 1737400.0  # Moon reference radius (m)
AU_KM = 149597870.700
R_EARTH_KM = 6371.0
R_SUN_KM = 695700.0
SUN_RADIUS_DEG = 0.266

DEM_N = 3812
DEM_MPP = 240.0
DEM_SCALE = 0.5
FINE_R0 = 1281  # (3812 // 2) - 625
FINE_C0 = 1281
FINE_N = 1250
COARSE_N = 762  # 3812 // 5 (blocks covering pixels 0..3810)
GRID_N = 250
CELL_MPP = 1200.0
EXTENT_KM = 150.0
MAST_HEIGHTS = [0.5, 2.0, 10.0, 20.0, 50.0]

HORIZON_N_STEPS = 480
HORIZON_MAX_DIST_M = 200000.0

# Precomputed great-circle ray-march constants (360 azimuths x 480 log-spaced radii)
_DISTS = np.geomspace(120.0, HORIZON_MAX_DIST_M, HORIZON_N_STEPS)
_TH = _DISTS / R0
_STH = np.sin(_TH)[None, :]
_CTH = np.cos(_TH)[None, :]
_AZ_RADS = np.radians(np.arange(360, dtype=np.float64))[:, None]
_SA = np.sin(_AZ_RADS)
_CA = np.cos(_AZ_RADS)
_AZ_IDX = np.arange(360, dtype=np.intp)


def wrap_lon_180(lon_deg: float | np.ndarray) -> float | np.ndarray:
    """Wrap longitude into [-180, 180)."""
    return ((np.asarray(lon_deg) + 180.0) % 360.0) - 180.0


def ll2xy(lat_deg: float | np.ndarray, lon_deg: float | np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """South polar stereographic projection (m) with 0 deg lon pointing +Y, +90E pointing +X."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    rho = 2.0 * R0 * np.tan((0.5 * np.pi - np.abs(lat)) * 0.5)
    return rho * np.sin(lon), rho * np.cos(lon)


def xy2ll(x: float | np.ndarray, y: float | np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Inverse south polar stereographic projection from meters to (lat_deg, lon_deg)."""
    rho = np.hypot(x, y)
    lat = -90.0 + np.degrees(2.0 * np.arctan(0.5 * rho / R0))
    lon = wrap_lon_180(np.degrees(np.arctan2(x, y)))
    return lat, lon


def ll2cr(lat_deg: float | np.ndarray, lon_deg: float | np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Convert (lat, lon) in degrees to fractional 0-based (col, row) on the 3812x3812 DEM."""
    x, y = ll2xy(lat_deg, lon_deg)
    col = x / DEM_MPP + 0.5 * DEM_N - 0.5
    row = -y / DEM_MPP + 0.5 * DEM_N - 0.5
    return col, row


def cr2ll(col: float, row: float) -> tuple[float, float]:
    """Convert 0-based (col, row) pixel coordinates to (lat_deg, lon_deg)."""
    x = (col - 0.5 * DEM_N + 0.5) * DEM_MPP
    y = -(row - 0.5 * DEM_N + 0.5) * DEM_MPP
    lat, lon = xy2ll(x, y)
    return float(lat), float(lon)


def cr2xy_km(col: float, row: float) -> tuple[float, float]:
    """Convert 0-based (col, row) pixel coordinates to polar stereographic (x_km, y_km)."""
    x = (col - 0.5 * DEM_N + 0.5) * DEM_MPP / 1000.0
    y = -(row - 0.5 * DEM_N + 0.5) * DEM_MPP / 1000.0
    return float(x), float(y)


def load_dem(img_path: Path | str) -> np.ndarray:
    """Load LDEM_75S_240M binary int16 file into float32 meters relative to R0."""
    dn = np.fromfile(str(img_path), dtype="<i2")
    if dn.size != DEM_N * DEM_N:
        raise ValueError(f"Expected {DEM_N * DEM_N} int16 values in {img_path}, got {dn.size}")
    return dn.reshape(DEM_N, DEM_N).astype(np.float32) * np.float32(DEM_SCALE)


def compute_slope(dem: np.ndarray) -> np.ndarray:
    """Compute central-difference topographic slope magnitude in degrees."""
    gy, gx = np.gradient(dem.astype(np.float64), DEM_MPP)
    return np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)


def compute_flat_pct_grid(slope_full: np.ndarray, half_radius_px: int, threshold_deg: float = 5.0) -> np.ndarray:
    """Exact percentage of pixels with slope <= threshold_deg in every (2k+1)x(2k+1) box via prefix sums.

    Returns float32 array with shape (DEM_N, DEM_N) where interior pixels use the exact
    (2*half_radius_px + 1)^2 window and border pixels match clipped slice boundaries.
    """
    mask = (slope_full <= threshold_deg).astype(np.int32)
    h, w = mask.shape
    ps = np.zeros((h + 1, w + 1), dtype=np.int32)
    ps[1:, 1:] = np.cumsum(np.cumsum(mask, axis=0), axis=1)

    r_idx = np.arange(h)
    c_idx = np.arange(w)
    r0 = np.maximum(0, r_idx - half_radius_px)[:, None]
    r1 = np.minimum(h, r_idx + half_radius_px + 1)[:, None]
    c0 = np.maximum(0, c_idx - half_radius_px)[None, :]
    c1 = np.minimum(w, c_idx + half_radius_px + 1)[None, :]

    counts = ps[r1, c1] - ps[r0, c1] - ps[r1, c0] + ps[r0, c0]
    areas = (r1 - r0) * (c1 - c0)
    return (counts.astype(np.float64) * 100.0 / areas).astype(np.float32)


def spherical_horizon_dip_deg(mast_m: float, radius_m: float = R0) -> float:
    """Geometric horizon dip angle (deg) for an observer mast above a smooth sphere."""
    return -math.degrees(math.acos(radius_m / (radius_m + mast_m)))


def bilinear_sample(dem: np.ndarray, col: np.ndarray, row: np.ndarray) -> np.ndarray:
    """Bilinearly sample 2D DEM at fractional (col, row) coordinates, returning NaN out of bounds."""
    n = dem.shape[0]
    valid = (col >= 0.0) & (row >= 0.0) & (col < n - 1.0) & (row < n - 1.0)
    out = np.full(col.shape, np.nan, dtype=np.float64)
    cv = col[valid]
    rv = row[valid]
    c0 = np.floor(cv).astype(np.intp)
    r0 = np.floor(rv).astype(np.intp)
    dc = cv - c0
    dr = rv - r0
    out[valid] = (
        dem[r0, c0] * (1.0 - dc) * (1.0 - dr)
        + dem[r0, c0 + 1] * dc * (1.0 - dr)
        + dem[r0 + 1, c0] * (1.0 - dc) * dr
        + dem[r0 + 1, c0 + 1] * dc * dr
    )
    return out


def compute_horizon_profile(
    dem: np.ndarray,
    lat0_deg: float,
    lon0_deg: float,
    h0_m: float,
    mast_m: float,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute 360-deg spherical great-circle horizon profile and blocking distances (km).

    Uses the exact stereographic projection identity on the southern hemisphere (phi2 < 0)
    and maximizes monotonic tan(el) across the 480 log-spaced radii before applying arctan
    to the 360 maxima. Matches the direct arcsin/arctan2/tan formulation to ~1e-6 deg.
    """
    phi1 = math.radians(max(min(lat0_deg, -75.0), -89.9999))
    lam1 = math.radians(lon0_deg)
    sphi1 = math.sin(phi1)
    cphi1 = math.cos(phi1)
    slam1 = math.sin(lam1)
    clam1 = math.cos(lam1)
    ro = R0 + h0_m + mast_m

    sphi2 = sphi1 * _CTH + cphi1 * _STH * _CA
    u = cphi1 * _CTH - sphi1 * _STH * _CA
    v = _STH * _SA
    scale = (2.0 * R0) / (1.0 - sphi2)

    cols = scale * (slam1 * u + clam1 * v) / DEM_MPP + 0.5 * DEM_N - 0.5
    rows = -scale * (clam1 * u - slam1 * v) / DEM_MPP + 0.5 * DEM_N - 0.5

    ht = bilinear_sample(dem, cols, rows)
    rt = R0 + ht
    tan_el = (rt * _CTH - ro) / (rt * _STH)
    tan_el_safe = np.where(np.isnan(tan_el), -np.inf, tan_el)
    best_idx = np.argmax(tan_el_safe, axis=1)
    best_el = np.degrees(np.arctan(tan_el_safe[_AZ_IDX, best_idx]))
    best_dist_km = _DISTS[best_idx] / 1000.0
    return best_el, best_dist_km


def unit_from_latlon(lat_deg: np.ndarray, lon_deg: np.ndarray) -> np.ndarray:
    """Convert MOON_ME lat/lon arrays (deg) to 3D unit vectors."""
    lat = np.radians(lat_deg)
    lon = np.radians(lon_deg)
    return np.stack([np.cos(lat) * np.cos(lon), np.cos(lat) * np.sin(lon), np.sin(lat)], axis=-1)


def body_vectors(sub: pd.DataFrame) -> tuple[np.ndarray, np.ndarray]:
    """Compute Moon-centered 3D vectors (km) to the Sun and Earth for every ephemeris row."""
    sun_km = unit_from_latlon(sub["subsolar_lat"].to_numpy(), sub["subsolar_lon"].to_numpy()) * AU_KM
    earth_km = (
        unit_from_latlon(sub["subearth_lat"].to_numpy(), sub["subearth_lon"].to_numpy())
        * (sub["earth_moon_au"].to_numpy() * AU_KM)[:, None]
    )
    return sun_km, earth_km


def enu_basis(lat_deg: float, lon_deg: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Topocentric (East, North, Up) unit basis vectors in MOON_ME Cartesian frame."""
    lat = math.radians(min(max(lat_deg, -89.99999), 89.99999))
    lon = math.radians(lon_deg)
    up = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
    east = np.array([-math.sin(lon), math.cos(lon), 0.0])
    north = np.cross(up, east)
    return east, north, up


def az_el_series(
    vec_km: np.ndarray,
    lat_deg: float,
    lon_deg: float,
    h_m: float = 0.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Topocentric (azimuth_deg, elevation_deg) time series for a body trajectory."""
    e, n, u = enu_basis(lat_deg, lon_deg)
    site = u * ((R0 + h_m) / 1000.0)
    d = vec_km - site
    d = d / np.linalg.norm(d, axis=1)[:, None]
    el = np.degrees(np.arcsin(np.clip(d @ u, -1.0, 1.0)))
    az = np.degrees(np.arctan2(d @ e, d @ n)) % 360.0
    return az, el


def horizon_at_az(az_deg: np.ndarray, hz360: np.ndarray) -> np.ndarray:
    """Interpolate 360-element 1-deg horizon array at continuous azimuths."""
    hz_ext = np.concatenate([hz360, hz360[:1]])
    pos = az_deg % 360.0
    i0 = np.floor(pos).astype(np.intp) % 360
    f = pos - np.floor(pos)
    return hz_ext[i0] * (1.0 - f) + hz_ext[i0 + 1] * f


def disk_fraction_above(
    el: np.ndarray,
    hz: np.ndarray,
    radius_deg: float = SUN_RADIUS_DEG,
) -> np.ndarray:
    """Fraction of circular solar disk above the local horizon elevation."""
    d = np.clip((el - hz) / radius_deg, -1.0, 1.0)
    return 1.0 - (np.arccos(d) - d * np.sqrt(1.0 - d * d)) / np.pi


def max_run_hours(cond: np.ndarray) -> int:
    """Maximum contiguous True run length in hourly boolean series."""
    m = np.concatenate([[False], cond.astype(bool), [False]])
    diff = np.diff(m.astype(np.int8))
    starts = np.flatnonzero(diff == 1)
    stops = np.flatnonzero(diff == -1)
    if len(starts) == 0:
        return 0
    return int(np.max(stops - starts))


def evaluate_site_visibility(
    hz_2m: np.ndarray,
    sun_km: np.ndarray,
    earth_km: np.ndarray,
    lat_deg: float,
    lon_deg: float,
    observer_height_m: float,
) -> dict[str, float | int]:
    """Evaluate baseline visibility metrics for one observer location at 2 m mast."""
    sun_az, sun_el = az_el_series(sun_km, lat_deg, lon_deg, observer_height_m)
    earth_az, earth_el = az_el_series(earth_km, lat_deg, lon_deg, observer_height_m)

    hz_sun = horizon_at_az(sun_az, hz_2m)
    hz_earth = horizon_at_az(earth_az, hz_2m)
    fs = disk_fraction_above(sun_el, hz_sun)
    sun_up = fs > 0.0
    earth_vis = earth_el > hz_earth
    both_vis = sun_up & earth_vis

    sphere_dip = spherical_horizon_dip_deg(2.0)
    fs_sphere = disk_fraction_above(sun_el, np.full_like(sun_el, sphere_dip))
    sun_no_terrain_pct = float(np.mean(fs_sphere > 0.0) * 100.0)

    sun_time_pct = float(np.mean(sun_up) * 100.0)
    sun_visible_pct = float(np.mean(fs) * 100.0)
    earth_visible_pct = float(np.mean(earth_vis) * 100.0)
    both_visible_pct = float(np.mean(both_vis) * 100.0)
    longest_sun_days = round(max_run_hours(sun_up) / 24.0, 2)
    max_dark_h = max_run_hours(~sun_up)
    max_dark_days = round(max_dark_h / 24.0, 2)
    earth_max_gap_days = round(max_run_hours(~earth_vis) / 24.0, 2)

    return {
        "sun_no_terrain_pct": sun_no_terrain_pct,
        "sun_time_pct": sun_time_pct,
        "sun_visible_pct": sun_visible_pct,
        "earth_visible_pct": earth_visible_pct,
        "both_visible_pct": both_visible_pct,
        "longest_sun_days": longest_sun_days,
        "max_dark_hours": max_dark_h,
        "max_dark_days": max_dark_days,
        "earth_max_gap_days": earth_max_gap_days,
    }


def _circle_overlap_fraction(sep_deg: float, r_target_deg: float, r_occluder_deg: float) -> float:
    """Fraction of target circle (Sun) overlapped by occluder circle (Earth)."""
    if sep_deg >= r_target_deg + r_occluder_deg:
        return 0.0
    if sep_deg <= abs(r_occluder_deg - r_target_deg):
        return min(1.0, (r_occluder_deg / r_target_deg) ** 2)
    d = sep_deg
    r1 = r_target_deg
    r2 = r_occluder_deg
    c1 = np.clip((d * d + r1 * r1 - r2 * r2) / (2.0 * d * r1), -1.0, 1.0)
    c2 = np.clip((d * d + r2 * r2 - r1 * r1) / (2.0 * d * r2), -1.0, 1.0)
    a1 = r1 * r1 * math.acos(float(c1))
    a2 = r2 * r2 * math.acos(float(c2))
    radicand = max(0.0, (-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2))
    a3 = 0.5 * math.sqrt(radicand)
    return float(min(1.0, (a1 + a2 - a3) / (math.pi * r1 * r1)))


def detect_moon_center_eclipses(
    timestamps_utc: Sequence[pd.Timestamp] | pd.Series,
    sun_km: np.ndarray,
    earth_km: np.ndarray,
) -> list[dict[str, object]]:
    """Detect Earth-occluding-Sun (lunar eclipse) events across the Moon-centered ephemeris."""
    us = sun_km / np.linalg.norm(sun_km, axis=1)[:, None]
    ue = earth_km / np.linalg.norm(earth_km, axis=1)[:, None]
    sep_deg = np.degrees(np.arccos(np.clip((us * ue).sum(axis=1), -1.0, 1.0)))
    r_e = np.degrees(np.arcsin(R_EARTH_KM / np.linalg.norm(earth_km, axis=1)))
    r_s = math.degrees(math.asin(R_SUN_KM / AU_KM))

    in_eclipse = sep_deg < (r_e + r_s)
    m = np.concatenate([[False], in_eclipse, [False]])
    diff = np.diff(m.astype(np.int8))
    starts = np.flatnonzero(diff == 1)
    stops = np.flatnonzero(diff == -1)

    events: list[dict[str, object]] = []
    ts_list = pd.to_datetime(timestamps_utc, utc=True)
    for a, b in zip(starts, stops):
        k = int(a + np.argmin(sep_deg[a:b]))
        kind = "total (Sun fully hidden)" if sep_deg[k] < (r_e[k] - r_s) else "partial"
        obs_frac = max(_circle_overlap_fraction(float(sep_deg[i]), r_s, float(r_e[i])) for i in range(a, b))
        dt = ts_list.iloc[int(a)] if hasattr(ts_list, "iloc") else ts_list[int(a)]
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        events.append({
            "start_utc": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "idx": int(a),
            "hours": int(b - a),
            "type": kind,
            "max_obscured_frac": round(obs_frac, 4),
        })
    return events


def point_in_ring(x: float, y: float, ring: Sequence[Sequence[float]]) -> bool:
    """Even-odd ray casting point-in-polygon check."""
    inside = False
    n = len(ring)
    if n < 3:
        return False
    j = n - 1
    for i in range(n):
        xi, yi = float(ring[i][0]), float(ring[i][1])
        xj, yj = float(ring[j][0]), float(ring[j][1])
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / ((yj - yi) + 1e-30) + xi):
            inside = not inside
        j = i
    return inside


def points_in_rings_mask(
    xs: np.ndarray,
    ys: np.ndarray,
    rings: Iterable[Sequence[Sequence[float]]],
) -> np.ndarray:
    """Vectorized even-odd point-in-polygon over arbitrary 2D arrays xs, ys."""
    inside = np.zeros(xs.shape, dtype=bool)
    for ring in rings:
        n = len(ring)
        if n < 3:
            continue
        ring_in = np.zeros(xs.shape, dtype=bool)
        j = n - 1
        for i in range(n):
            xi, yi = float(ring[i][0]), float(ring[i][1])
            xj, yj = float(ring[j][0]), float(ring[j][1])
            cond = (yi > ys) != (yj > ys)
            denom = (yj - yi) if (yj != yi) else 1e-30
            x_int = (xj - xi) * (ys - yi) / denom + xi
            ring_in ^= cond & (xs < x_int)
            j = i
        inside ^= ring_in
    return inside


ARTEMIS_GEOJSON_URL = "https://files.actgate.com/lunar/A3_9regions-lonlat-simplified.geojson"


def load_artemis_regions(
    csv_path: Path,
    geojson_path: Path | None = None,
    source_url: str = ARTEMIS_GEOJSON_URL,
) -> list[dict[str, object]]:
    """Load the 9 Artemis III 2024 candidate regions enriched with official GeoJSON polygons."""
    a3_df = pd.read_csv(csv_path)
    features_by_code: dict[str, dict] = {}
    if geojson_path is not None:
        if not geojson_path.exists() and source_url:
            try:
                import requests

                resp = requests.get(source_url, timeout=30)
                resp.raise_for_status()
                geojson_path.parent.mkdir(parents=True, exist_ok=True)
                geojson_path.write_text(resp.text, encoding="utf-8")
            except Exception as exc:
                print(f"[warn] Could not download Artemis III GeoJSON from {source_url}: {exc}")
        if geojson_path.exists():
            gj = json.loads(geojson_path.read_text(encoding="utf-8"))
            for feat in gj.get("features", []):
                code = str(feat.get("properties", {}).get("RegionCode", "")).strip()
                if code:
                    features_by_code[code] = feat

    regions: list[dict[str, object]] = []
    for _, row in a3_df.iterrows():
        code = str(row["code"]).strip()
        px, py = ll2xy(float(row["centroid_lat"]), float(row["centroid_lon"]))
        px_km = round(float(px / 1000.0), 2)
        py_km = round(float(py / 1000.0), 2)

        poly_lonlat: list[list[list[float]]] = []
        rings_polar_km: list[list[list[float]]] = []
        feat = features_by_code.get(code)
        if feat is not None:
            geom = feat.get("geometry") or {}
            gtype = geom.get("type")
            coords = geom.get("coordinates") or []
            raw_rings = coords if gtype == "Polygon" else (
                [r for poly in coords for r in poly] if gtype == "MultiPolygon" else []
            )
            for ring in raw_rings:
                lonlat_ring: list[list[float]] = []
                polar_ring: list[list[float]] = []
                for pt in ring:
                    lon = float(wrap_lon_180(float(pt[0])))
                    lat = float(pt[1])
                    rx, ry = ll2xy(lat, lon)
                    lonlat_ring.append([round(lon, 5), round(lat, 5)])
                    polar_ring.append([round(float(rx / 1000.0), 3), round(float(ry / 1000.0), 3)])
                if lonlat_ring:
                    poly_lonlat.append(lonlat_ring)
                    rings_polar_km.append(polar_ring)

        if rings_polar_km:
            all_verts_in = all(
                abs(vx) <= EXTENT_KM and abs(vy) <= EXTENT_KM
                for ring in rings_polar_km
                for vx, vy in ring
            )
            in_polar_frame = bool(abs(px_km) <= EXTENT_KM and abs(py_km) <= EXTENT_KM and all_verts_in)
        else:
            in_polar_frame = bool(abs(px_km) <= EXTENT_KM and abs(py_km) <= EXTENT_KM)

        entry: dict[str, object] = {
            "region": str(row["region"]),
            "code": code,
            "centroid_lat": round(float(row["centroid_lat"]), 4),
            "centroid_lon": round(float(row["centroid_lon"]), 4),
            "area_km2": round(float(row["area_km2"]), 1),
            "polar_x_km": px_km,
            "polar_y_km": py_km,
            "in_polar_frame": in_polar_frame,
            "source_url": source_url,
        }
        if rings_polar_km:
            entry["rings_polar_km"] = rings_polar_km
        if poly_lonlat:
            entry["polygon_lonlat"] = poly_lonlat
        regions.append(entry)
    return regions

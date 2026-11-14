"""Parallel 250x250 polar map and WP7 Mode A site-candidate evaluator.

Computes:
  1. Step-1 evaluation across all 62,500 cells (1.2 km/px, ±150 km) by selecting
     the highest 240 m pixel in each 5x5 fine DEM block and running 360-deg horizon
     ray-marching + hourly ephemeris visibility at 2 m mast height.
  2. Binary layer packing for polar_maps.json (I7) and site_candidates.json (WP7 §4).
  3. Step-2 refinement of all 25 fine pixels inside the union of top candidate cells
     across all criteria (score, sun, earth, joint, shortest_night), unconstrained
     and constrained, globally and within overlapping Artemis III 2024 regions.

Run directly with --test-wp7 to verify the 4,900-cell (|x|,|y| <= 42 km) WP7 §3 benchmark.
"""
from __future__ import annotations

import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import argparse
import base64
import multiprocessing as mp
import time
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from lunar_geometry import (
    CELL_MPP,
    DEM_N,
    DEM_SCALE,
    EXTENT_KM,
    FINE_C0,
    FINE_N,
    FINE_R0,
    GRID_N,
    SUN_RADIUS_DEG,
    body_vectors,
    compute_flat_pct_grid,
    compute_horizon_profile,
    compute_slope,
    cr2ll,
    cr2xy_km,
    enu_basis,
    load_dem,
    max_run_hours,
    points_in_rings_mask,
)

# Worker globals initialized once per forked/spawned process
_W_DEM: np.ndarray | None = None
_W_SUN_KM: np.ndarray | None = None
_W_EARTH_KM: np.ndarray | None = None
_W_SUN_NORM2: np.ndarray | None = None
_W_EARTH_NORM2: np.ndarray | None = None


def _init_worker(dem_path: str, sun_km: np.ndarray, earth_km: np.ndarray) -> None:
    """Initialize read-only DEM and ephemeris arrays in a worker process."""
    global _W_DEM, _W_SUN_KM, _W_EARTH_KM, _W_SUN_NORM2, _W_EARTH_NORM2
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    os.environ["MKL_NUM_THREADS"] = "1"
    os.environ["OMP_NUM_THREADS"] = "1"
    dn = np.fromfile(dem_path, dtype="<i2").reshape(DEM_N, DEM_N)
    _W_DEM = dn.astype(np.float32) * np.float32(DEM_SCALE)
    _W_SUN_KM = sun_km
    _W_EARTH_KM = earth_km
    _W_SUN_NORM2 = np.sum(sun_km * sun_km, axis=1)
    _W_EARTH_NORM2 = np.sum(earth_km * earth_km, axis=1)


def _eval_pixel_batch(coords: list[tuple[int, int]]) -> list[tuple[int, int, float, float, float, float, int]]:
    """Evaluate 360-deg horizon + ephemeris visibility for a batch of global DEM (row, col) pixels."""
    dem = _W_DEM
    sun_km = _W_SUN_KM
    earth_km = _W_EARTH_KM
    sn2 = _W_SUN_NORM2
    en2 = _W_EARTH_NORM2
    assert dem is not None and sun_km is not None and earth_km is not None
    assert sn2 is not None and en2 is not None

    n_pts = len(coords)
    if n_pts == 0:
        return []

    u_mat = np.empty((3, n_pts), dtype=np.float64)
    e_mat = np.empty((3, n_pts), dtype=np.float64)
    n_mat = np.empty((3, n_pts), dtype=np.float64)
    r_site = np.empty(n_pts, dtype=np.float64)
    hz_ext = np.empty((n_pts, 361), dtype=np.float64)

    for j, (ri, ci) in enumerate(coords):
        lat_obs, lon_obs = cr2ll(ci, ri)
        h_obs = float(dem[ri, ci])
        hz, _ = compute_horizon_profile(dem, lat_obs, lon_obs, h_obs, 2.0)
        hz_ext[j, :360] = hz
        hz_ext[j, 360] = hz[0]
        e, n, u = enu_basis(lat_obs, lon_obs)
        e_mat[:, j] = e
        n_mat[:, j] = n
        u_mat[:, j] = u
        r_site[j] = (1737400.0 + h_obs + 2.0) / 1000.0

    # Matrix multiply across all ephemeris steps and pixels in one BLAS call
    sun_dot_u = sun_km @ u_mat
    sun_dot_e = sun_km @ e_mat
    sun_dot_n = sun_km @ n_mat
    sdn = np.sqrt(sn2[:, None] + (r_site * r_site)[None, :] - 2.0 * r_site[None, :] * sun_dot_u)
    sel = np.degrees(np.arcsin(np.clip((sun_dot_u - r_site[None, :]) / sdn, -1.0, 1.0)))
    saz = np.degrees(np.arctan2(sun_dot_e, sun_dot_n)) % 360.0

    earth_dot_u = earth_km @ u_mat
    earth_dot_e = earth_km @ e_mat
    earth_dot_n = earth_km @ n_mat
    edn = np.sqrt(en2[:, None] + (r_site * r_site)[None, :] - 2.0 * r_site[None, :] * earth_dot_u)
    eel = np.degrees(np.arcsin(np.clip((earth_dot_u - r_site[None, :]) / edn, -1.0, 1.0)))
    eaz = np.degrees(np.arctan2(earth_dot_e, earth_dot_n)) % 360.0

    col_idx = np.arange(n_pts, dtype=np.intp)[None, :]
    si0 = np.floor(saz).astype(np.intp) % 360
    sf = saz - np.floor(saz)
    shz = hz_ext[col_idx, si0] * (1.0 - sf) + hz_ext[col_idx, si0 + 1] * sf

    ei0 = np.floor(eaz).astype(np.intp) % 360
    ef = eaz - np.floor(eaz)
    ehz = hz_ext[col_idx, ei0] * (1.0 - ef) + hz_ext[col_idx, ei0 + 1] * ef

    d_raw = (sel - shz) / SUN_RADIUS_DEG
    sun_up = d_raw > -1.0
    fs = np.zeros_like(d_raw)
    fs[d_raw >= 1.0] = 1.0
    mid = sun_up & (d_raw < 1.0)
    dm = d_raw[mid]
    fs[mid] = 1.0 - (np.arccos(dm) - dm * np.sqrt(1.0 - dm * dm)) / np.pi
    earth_up = eel > ehz
    both_up = sun_up & earth_up

    sun_vis_pct = np.mean(fs, axis=0) * 100.0
    sun_time_pct = np.mean(sun_up, axis=0) * 100.0
    earth_vis_pct = np.mean(earth_up, axis=0) * 100.0
    both_vis_pct = np.mean(both_up, axis=0) * 100.0

    results: list[tuple[int, int, float, float, float, float, int]] = []
    for j, (ri, ci) in enumerate(coords):
        max_dark_h = max_run_hours(~sun_up[:, j])
        results.append((
            ri,
            ci,
            float(sun_vis_pct[j]),
            float(sun_time_pct[j]),
            float(earth_vis_pct[j]),
            float(both_vis_pct[j]),
            max_dark_h,
        ))
    return results


def _q2_score_arrays(
    sun_vis_pct: np.ndarray,
    earth_vis_pct: np.ndarray,
    both_vis_pct: np.ndarray,
    max_dark_hours: np.ndarray,
    flat_box_pct: np.ndarray,
) -> np.ndarray:
    """Vectorized Q2 viability score matching client computeViability exactly."""
    max_dark_d = max_dark_hours.astype(np.float64) / 24.0
    dark_score = np.maximum(0.0, 100.0 * (1.0 - np.minimum(max_dark_d, 30.0) / 30.0))
    return (
        0.35 * sun_vis_pct
        + 0.25 * earth_vis_pct
        + 0.15 * both_vis_pct
        + 0.15 * dark_score
        + 0.10 * flat_box_pct
    )


def _greedy_top_cells(
    metric: np.ndarray,
    tiebreak: np.ndarray,
    valid_mask: np.ndarray,
    cell_x_km: np.ndarray,
    cell_y_km: np.ndarray,
    count: int,
    min_sep_km: float = 2.4,
    descending: bool = True,
) -> list[tuple[int, int]]:
    """Select top grid cells honoring minimum separation distance."""
    rows, cols = np.nonzero(valid_mask)
    if len(rows) == 0:
        return []
    m_vals = metric[rows, cols]
    t_vals = tiebreak[rows, cols]
    if descending:
        order = np.lexsort((-t_vals, -m_vals))
    else:
        order = np.lexsort((-t_vals, m_vals))

    picked: list[tuple[int, int]] = []
    picked_xy: list[tuple[float, float]] = []
    sep2 = min_sep_km * min_sep_km
    for idx in order:
        r = int(rows[idx])
        c = int(cols[idx])
        if min_sep_km > 0.0:
            x = float(cell_x_km[r, c])
            y = float(cell_y_km[r, c])
            if any((x - px) ** 2 + (y - py) ** 2 < sep2 for px, py in picked_xy):
                continue
            picked_xy.append((x, y))
        picked.append((r, c))
        if len(picked) >= count:
            break
    return picked


def select_cells_to_refine(
    layers: dict[str, np.ndarray],
    artemis_regions: list[dict[str, Any]] | None = None,
    map_top_k: int = 10,
    region_top_k: int = 5,
    subgrid_top_k: int = 8,
    max_refined_cells: int = 140,
) -> list[tuple[int, int]]:
    """Select union of top 1.2 km cells across criteria, filters, and Artemis regions for 25-pixel refinement."""
    sun_v = layers["sun_visible_pct"]
    earth_v = layers["earth_visible_pct"]
    both_v = layers["both_visible_pct"]
    dark_h = layers["max_dark_hours"]
    slope = layers["slope_deg"]
    flat_1km = layers["flat_1km_pct"]
    flat_box = layers["flat_box_pct"]

    score = _q2_score_arrays(sun_v, earth_v, both_v, dark_h, flat_box)
    all_mask = np.ones((GRID_N, GRID_N), dtype=bool)
    constrained_mask = (slope <= 5.0) & (flat_1km >= 20.0)

    # Cell center coordinates (matching x0_m=-149400, y0_m=+149400 -> +-149.4 km)
    c_coords = -149.4 + np.arange(GRID_N, dtype=np.float64) * 1.2
    r_coords = 149.4 - np.arange(GRID_N, dtype=np.float64) * 1.2
    cx_km, cy_km = np.meshgrid(c_coords, r_coords)

    criteria: list[tuple[str, np.ndarray, np.ndarray, bool]] = [
        ("score", score, sun_v, True),
        ("sun", sun_v, earth_v, True),
        ("earth", earth_v, sun_v, True),
        ("joint", both_v, sun_v, True),
        ("shortest_night", dark_h.astype(np.float64), sun_v, False),
    ]

    selected_order: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()

    def _add(cells: list[tuple[int, int]]) -> None:
        for rc in cells:
            if rc not in seen:
                seen.add(rc)
                selected_order.append(rc)

    # 1. Global map top cells (unconstrained & constrained; both raw and min-sep=2.4km)
    for _, m_arr, tb_arr, desc in criteria:
        for mask in (constrained_mask, all_mask):
            _add(_greedy_top_cells(m_arr, tb_arr, mask, cx_km, cy_km, map_top_k, 2.4, desc))
            _add(_greedy_top_cells(m_arr, tb_arr, mask, cx_km, cy_km, 5, 0.0, desc))

    # 2. Overlapping WP7 §3 central subgrid (|x|, |y| <= 42 km) top cells
    sub_mask = (np.abs(cx_km) <= 42.0) & (np.abs(cy_km) <= 42.0)
    for _, m_arr, tb_arr, desc in criteria:
        for mask in (constrained_mask & sub_mask, sub_mask):
            _add(_greedy_top_cells(m_arr, tb_arr, mask, cx_km, cy_km, subgrid_top_k, 2.4, desc))

    # 3. Inside each overlapping Artemis III polygon (in_polar_frame regions)
    if artemis_regions:
        for reg in artemis_regions:
            rings = reg.get("rings_polar_km") or []
            if not rings:
                continue
            rmask = points_in_rings_mask(cx_km, cy_km, rings)
            if not np.any(rmask):
                continue
            for _, m_arr, tb_arr, desc in criteria:
                _add(_greedy_top_cells(m_arr, tb_arr, rmask & constrained_mask, cx_km, cy_km, region_top_k, 2.4, desc))
                _add(_greedy_top_cells(m_arr, tb_arr, rmask, cx_km, cy_km, region_top_k, 2.4, desc))

    if len(selected_order) > max_refined_cells:
        selected_order = selected_order[:max_refined_cells]
    return selected_order


def build_polar_maps_and_candidates(
    dem: np.ndarray,
    slope_full: np.ndarray,
    dem_path: Path,
    sun_km: np.ndarray,
    earth_km: np.ndarray,
    period_start_utc: str,
    period_end_utc: str,
    schema_version: str,
    data_version: str,
    generated_utc: str,
    artemis_regions: list[dict[str, Any]] | None = None,
    workers: int = 8,
    batch_size: int = 16,
    cr_slice: tuple[int, int] | None = None,
    step1_cache_npz: Path | None = None,
) -> tuple[dict[str, Any], dict[str, Any], dict[str, np.ndarray]]:
    """Compute polar_maps.json and site_candidates.json over the 250x250 fine DEM grid."""
    t_start = time.time()
    print("[grid] Computing integral-image 1km & 30km flatness grids...")
    flat_1km_grid = compute_flat_pct_grid(slope_full, half_radius_px=4, threshold_deg=5.0)
    flat_box_grid = compute_flat_pct_grid(slope_full, half_radius_px=62, threshold_deg=5.0)

    fine_dem = dem[FINE_R0 : FINE_R0 + FINE_N, FINE_C0 : FINE_C0 + FINE_N]
    blocks = fine_dem.reshape(GRID_N, 5, GRID_N, 5).transpose(0, 2, 1, 3).reshape(GRID_N, GRID_N, 25)
    argmax_idx = np.argmax(blocks, axis=2).astype(np.uint8)

    r_lo, r_hi = cr_slice if cr_slice is not None else (0, GRID_N)
    c_lo, c_hi = cr_slice if cr_slice is not None else (0, GRID_N)

    # Record highest 240m pixel in each cell
    step1_coords: list[tuple[int, int]] = []
    step1_cells: list[tuple[int, int]] = []
    elev_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)
    slope_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)
    flat1km_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)
    flatbox_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)

    for cr in range(r_lo, r_hi):
        for cc in range(c_lo, c_hi):
            pix_idx = int(argmax_idx[cr, cc])
            dr, dc = divmod(pix_idx, 5)
            ri = FINE_R0 + cr * 5 + dr
            ci = FINE_C0 + cc * 5 + dc
            elev_grid[cr, cc] = float(dem[ri, ci])
            slope_grid[cr, cc] = float(slope_full[ri, ci])
            flat1km_grid[cr, cc] = float(flat_1km_grid[ri, ci])
            flatbox_grid[cr, cc] = float(flat_box_grid[ri, ci])
            step1_coords.append((ri, ci))
            step1_cells.append((cr, cc))

    coord_to_res: dict[tuple[int, int], tuple[float, float, float, float, int]] = {}
    if cr_slice is None and step1_cache_npz is not None and step1_cache_npz.exists():
        print(f"[grid] Loading cached Step 1 arrays from {step1_cache_npz}...")
        npz = np.load(step1_cache_npz)
        sun_vis_grid = npz["sun_visible_pct"].astype(np.float64)
        sun_time_grid = npz["sun_time_pct"].astype(np.float64)
        earth_vis_grid = npz["earth_visible_pct"].astype(np.float64)
        both_vis_grid = npz["both_visible_pct"].astype(np.float64)
        max_dark_grid = npz["max_dark_hours"].astype(np.int32)
        for (ri, ci), (cr, cc) in zip(step1_coords, step1_cells):
            coord_to_res[(ri, ci)] = (
                float(sun_vis_grid[cr, cc]),
                float(sun_time_grid[cr, cc]),
                float(earth_vis_grid[cr, cc]),
                float(both_vis_grid[cr, cc]),
                int(max_dark_grid[cr, cc]),
            )
        n_procs = workers
    else:
        sun_vis_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)
        sun_time_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)
        earth_vis_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)
        both_vis_grid = np.zeros((GRID_N, GRID_N), dtype=np.float64)
        max_dark_grid = np.zeros((GRID_N, GRID_N), dtype=np.int32)

        batches = [step1_coords[i : i + batch_size] for i in range(0, len(step1_coords), batch_size)]
        print(
            f"[grid] Step 1: evaluating {len(step1_coords):,} cells across {workers} processes "
            f"(batch={batch_size})...",
            flush=True,
        )
        t_s1 = time.time()
        n_procs = max(1, min(workers, len(batches)))
        with mp.Pool(processes=n_procs, initializer=_init_worker, initargs=(str(dem_path), sun_km, earth_km)) as pool:
            batch_results = pool.map(_eval_pixel_batch, batches)

        for res_list in batch_results:
            for ri, ci, sv, st, ev, bv, mdh in res_list:
                coord_to_res[(ri, ci)] = (sv, st, ev, bv, mdh)

        for (ri, ci), (cr, cc) in zip(step1_coords, step1_cells):
            sv, st, ev, bv, mdh = coord_to_res[(ri, ci)]
            sun_vis_grid[cr, cc] = sv
            sun_time_grid[cr, cc] = st
            earth_vis_grid[cr, cc] = ev
            both_vis_grid[cr, cc] = bv
            max_dark_grid[cr, cc] = mdh

        s1_elapsed = time.time() - t_s1
        print(
            f"[grid] Step 1 finished in {s1_elapsed:.2f}s ({s1_elapsed / max(1, len(step1_coords)) * 1000:.2f} ms/cell).",
            flush=True,
        )
        if cr_slice is None and step1_cache_npz is not None:
            step1_cache_npz.parent.mkdir(parents=True, exist_ok=True)
            np.savez(
                step1_cache_npz,
                sun_visible_pct=sun_vis_grid,
                sun_time_pct=sun_time_grid,
                earth_visible_pct=earth_vis_grid,
                both_visible_pct=both_vis_grid,
                max_dark_hours=max_dark_grid,
            )

    raw_layers = {
        "sun_visible_pct": sun_vis_grid,
        "sun_time_pct": sun_time_grid,
        "earth_visible_pct": earth_vis_grid,
        "both_visible_pct": both_vis_grid,
        "max_dark_hours": max_dark_grid,
        "slope_deg": slope_grid,
        "flat_1km_pct": flat1km_grid,
        "flat_box_pct": flatbox_grid,
        "elev_m": elev_grid,
        "sample_pixel": argmax_idx,
    }

    # If full grid, proceed with Step 2 25-pixel refinement of top cells
    refined_entries: list[dict[str, Any]] = []
    if cr_slice is None:
        cells_to_refine = select_cells_to_refine(raw_layers, artemis_regions=artemis_regions)
        ref_coords: list[tuple[int, int]] = []
        for cr, cc in cells_to_refine:
            for pix_idx in range(25):
                dr, dc = divmod(pix_idx, 5)
                ref_coords.append((FINE_R0 + cr * 5 + dr, FINE_C0 + cc * 5 + dc))
        # Evaluate only coordinates not already evaluated in Step 1 (up to 24 per cell)
        missing_coords = list({rc for rc in ref_coords if rc not in coord_to_res})
        print(
            f"[grid] Step 2: refining {len(cells_to_refine)} top cells "
            f"({len(missing_coords):,} new 240m pixels across {n_procs} processes)..."
        )
        t_s2 = time.time()
        ref_batches = [missing_coords[i : i + batch_size] for i in range(0, len(missing_coords), batch_size)]
        if ref_batches:
            with mp.Pool(
                processes=max(1, min(n_procs, len(ref_batches))),
                initializer=_init_worker,
                initargs=(str(dem_path), sun_km, earth_km),
            ) as pool:
                for res_list in pool.map(_eval_pixel_batch, ref_batches):
                    for ri, ci, sv, st, ev, bv, mdh in res_list:
                        coord_to_res[(ri, ci)] = (sv, st, ev, bv, mdh)

        for cr, cc in cells_to_refine:
            pixels_out: list[dict[str, Any]] = []
            for pix_idx in range(25):
                dr, dc = divmod(pix_idx, 5)
                ri = FINE_R0 + cr * 5 + dr
                ci = FINE_C0 + cc * 5 + dc
                sv, st, ev, bv, mdh = coord_to_res[(ri, ci)]
                lat, lon = cr2ll(ci, ri)
                x_km, y_km = cr2xy_km(ci, ri)
                pixels_out.append({
                    "pixel_idx": pix_idx,
                    "dr": dr,
                    "dc": dc,
                    "lat": round(lat, 5),
                    "lon": round(lon, 5),
                    "x_km": round(x_km, 4),
                    "y_km": round(y_km, 4),
                    "elev_m": round(float(dem[ri, ci]), 1),
                    "slope_deg": round(float(slope_full[ri, ci]), 2),
                    "flat_1km_pct": round(float(flat_1km_grid[ri, ci]), 1),
                    "flat_box_pct": round(float(flat_box_grid[ri, ci]), 1),
                    "sun_visible_pct": round(sv, 2),
                    "sun_time_pct": round(st, 2),
                    "earth_visible_pct": round(ev, 2),
                    "both_visible_pct": round(bv, 2),
                    "max_dark_hours": int(mdh),
                })
            refined_entries.append({
                "cell_row": int(cr),
                "cell_col": int(cc),
                "pixels": pixels_out,
            })
        print(f"[grid] Step 2 finished in {time.time() - t_s2:.2f}s ({len(refined_entries)} cells refined).")

    # Encode PolarMapsData (I7)
    polar_maps_json: dict[str, Any] = {
        "schema_version": schema_version,
        "data_version": data_version,
        "generated_utc": generated_utc,
        "grid_size": GRID_N,
        "mpp_m": CELL_MPP,
        "x0_m": -149400.0,
        "y0_m": 149400.0,
        "mast_m": 2.0,
        "period_utc": {
            "start": period_start_utc,
            "end": period_end_utc,
            "n_steps": int(len(sun_km)),
        },
        "method": "highest_240m_pixel_per_1.2km_cell_360az_great_circle",
        "sun_time_pct_u8_b64": base64.b64encode(
            np.clip(np.round(sun_time_grid), 0, 100).astype(np.uint8).tobytes()
        ).decode("ascii"),
        "sun_visible_pct_u8_b64": base64.b64encode(
            np.clip(np.round(sun_vis_grid), 0, 100).astype(np.uint8).tobytes()
        ).decode("ascii"),
        "earth_visible_pct_u8_b64": base64.b64encode(
            np.clip(np.round(earth_vis_grid), 0, 100).astype(np.uint8).tobytes()
        ).decode("ascii"),
        "sample_pixel_u8_b64": base64.b64encode(argmax_idx.astype(np.uint8).tobytes()).decode("ascii"),
    }

    # Encode SiteCandidatesData (WP7 §4)
    def _b64_u16_x100(arr: np.ndarray, max_val: int = 10000) -> str:
        encoded = np.clip(np.round(arr * 100.0), 0, max_val).astype("<u2")
        return base64.b64encode(encoded.tobytes()).decode("ascii")

    candidates_json: dict[str, Any] = {
        "schema_version": schema_version,
        "data_version": data_version,
        "generated_utc": generated_utc,
        "search_params": {
            "extent_km": EXTENT_KM,
            "grid_size": GRID_N,
            "cell_mpp_m": CELL_MPP,
            "fine_mpp_m": 240.0,
            "x0_m": -149400.0,
            "y0_m": 149400.0,
            "mast_m": 2.0,
            "period_start_utc": period_start_utc,
            "period_end_utc": period_end_utc,
            "n_steps": int(len(sun_km)),
            "dem_product": "LOLA_LDEM_75S_240M",
            "ephemeris_source": "JPL Horizons DE441 / MOON_ME",
            "refined_cell_count": len(refined_entries),
            "layer_definitions": {
                "sun_visible_pct_x100_u16_b64": "Mean solar disk fraction visible * 100, stored as uint16 LE * 100",
                "sun_time_pct_x100_u16_b64": "% of hours with solar disk fraction > 0, stored as uint16 LE * 100",
                "earth_visible_pct_x100_u16_b64": "% of hours with Earth center above 2m horizon, stored as uint16 LE * 100",
                "both_visible_pct_x100_u16_b64": "% of hours with Sun disk > 0 and Earth visible, stored as uint16 LE * 100",
                "max_dark_hours_u16_b64": "Longest contiguous interval (hours) with solar disk fraction == 0",
                "slope_deg_x100_u16_b64": "Local DEM slope at sampled 240m pixel (deg), stored as uint16 LE * 100",
                "flat_1km_pct_x100_u16_b64": "% of pixels in 9x9 box (~2.16x2.16 km, r~1.08 km) with slope <= 5 deg, stored as uint16 LE * 100",
                "flat_box_pct_x100_u16_b64": "% of pixels in 125x125 box (30x30 km, same as terrain_stats.pct_safe_hls_le_5deg) with slope <= 5 deg, stored as uint16 LE * 100",
                "elev_m_i16_b64": "Surface elevation (m above R0=1737.4 km) at sampled 240m pixel as int16 LE",
                "sample_pixel_u8_b64": "Index dr*5+dc (0..24) of highest 240m pixel in each 5x5 cell",
            },
        },
        "layers": {
            "sun_visible_pct_x100_u16_b64": _b64_u16_x100(sun_vis_grid, 10000),
            "sun_time_pct_x100_u16_b64": _b64_u16_x100(sun_time_grid, 10000),
            "earth_visible_pct_x100_u16_b64": _b64_u16_x100(earth_vis_grid, 10000),
            "both_visible_pct_x100_u16_b64": _b64_u16_x100(both_vis_grid, 10000),
            "max_dark_hours_u16_b64": base64.b64encode(
                np.clip(max_dark_grid, 0, 65535).astype("<u2").tobytes()
            ).decode("ascii"),
            "slope_deg_x100_u16_b64": _b64_u16_x100(slope_grid, 9000),
            "flat_1km_pct_x100_u16_b64": _b64_u16_x100(flat1km_grid, 10000),
            "flat_box_pct_x100_u16_b64": _b64_u16_x100(flatbox_grid, 10000),
            "elev_m_i16_b64": base64.b64encode(np.round(elev_grid).astype("<i2").tobytes()).decode("ascii"),
            "sample_pixel_u8_b64": base64.b64encode(argmax_idx.astype(np.uint8).tobytes()).decode("ascii"),
        },
        "refined": refined_entries,
    }
    print(f"[grid] Total grid build elapsed: {time.time() - t_start:.2f}s.")
    return polar_maps_json, candidates_json, raw_layers


def _run_wp7_benchmark(workers: int) -> None:
    """Verify 4,900-cell (|x|,|y| <= 42 km) WP7 §3 benchmark & speed estimate."""
    repo_root = Path(__file__).resolve().parent.parent
    dem_path = repo_root / "data" / "lola" / "ldem_75s_240m.img"
    sub_path = repo_root / "data" / "horizons" / "moon_subpoints_1h.csv"

    dem = load_dem(dem_path)
    slope_full = compute_slope(dem)
    sub = pd.read_csv(sub_path)
    sun_km, earth_km = body_vectors(sub)

    t0 = time.time()
    _, _, raw_layers = build_polar_maps_and_candidates(
        dem=dem,
        slope_full=slope_full,
        dem_path=dem_path,
        sun_km=sun_km,
        earth_km=earth_km,
        period_start_utc="2026-11-14T00:00:00Z",
        period_end_utc="2030-12-31T23:00:00Z",
        schema_version="2.0.0",
        data_version="2026-11-14",
        generated_utc="2026-11-14T00:00:00Z",
        workers=workers,
        cr_slice=(90, 160),
    )
    elapsed = time.time() - t0
    print(f"\n4,900 cells (36,216 steps) total={elapsed:.2f}s -> 62,500 est={elapsed * 62500 / 4900:.1f}s")

    c_coords = -149.4 + np.arange(GRID_N, dtype=np.float64) * 1.2
    r_coords = 149.4 - np.arange(GRID_N, dtype=np.float64) * 1.2
    cx_km, cy_km = np.meshgrid(c_coords, r_coords)
    sub_mask = (np.abs(cx_km) <= 42.0) & (np.abs(cy_km) <= 42.0)

    sun_v = raw_layers["sun_visible_pct"]
    sun_t = raw_layers["sun_time_pct"]
    earth_v = raw_layers["earth_visible_pct"]
    both_v = raw_layers["both_visible_pct"]
    dark_h = raw_layers["max_dark_hours"]
    slope = raw_layers["slope_deg"]
    flat1 = raw_layers["flat_1km_pct"]
    flatb = raw_layers["flat_box_pct"]
    argmax_idx = raw_layers["sample_pixel"]
    score = _q2_score_arrays(sun_v, earth_v, both_v, dark_h, flatb)

    print("\nWP7 §3 Unconstrained top 9 by sun_visible_pct (min_sep=2.4km, sample pixel lat/lon):")
    top_sun = _greedy_top_cells(sun_v, earth_v, sub_mask, cx_km, cy_km, 9, 2.4, True)
    for rank, (cr, cc) in enumerate(top_sun, 1):
        dr, dc = divmod(int(argmax_idx[cr, cc]), 5)
        lat, lon = cr2ll(FINE_C0 + cc * 5 + dc, FINE_R0 + cr * 5 + dr)
        print(
            f"  #{rank} lat={lat:8.4f} lon={lon:8.3f} | "
            f"sun={sun_v[cr, cc]:5.1f}% time={sun_t[cr, cc]:5.1f}% earth={earth_v[cr, cc]:5.1f}% "
            f"dark={dark_h[cr, cc]/24:4.1f}d slope={slope[cr, cc]:4.1f}deg flat1km={flat1[cr, cc]:4.0f}%"
        )

    print("\nWP7 §3 Default constrained (slope<=5 & flat1km>=20) top 5 by score:")
    cmask = sub_mask & (slope <= 5.0) & (flat1 >= 20.0)
    top_score = _greedy_top_cells(score, sun_v, cmask, cx_km, cy_km, 5, 2.4, True)
    for rank, (cr, cc) in enumerate(top_score, 1):
        dr, dc = divmod(int(argmax_idx[cr, cc]), 5)
        lat, lon = cr2ll(FINE_C0 + cc * 5 + dc, FINE_R0 + cr * 5 + dr)
        print(
            f"  #{rank} score={score[cr, cc]:5.1f} lat={lat:8.4f} lon={lon:8.3f} | "
            f"sun={sun_v[cr, cc]:5.1f}% earth={earth_v[cr, cc]:5.1f}% dark={dark_h[cr, cc]/24:4.1f}d"
        )


if __name__ == "__main__":
    import json
    from datetime import datetime, timezone
    from lunar_geometry import ARTEMIS_GEOJSON_URL, load_artemis_regions

    parser = argparse.ArgumentParser(description="WP7 Mode A parallel grid evaluation & benchmark.")
    parser.add_argument("--test-wp7", action="store_true", help="Run 4,900-cell WP7 §3 benchmark.")
    parser.add_argument("--build-full", action="store_true", help="Build polar_maps.json and site_candidates.json.")
    parser.add_argument("--workers", type=int, default=8, help="Number of worker processes.")
    parser.add_argument("--input-dir", type=Path, default=Path(__file__).resolve().parent.parent / "data")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "webapp" / "public" / "data",
    )
    parser.add_argument("--cache-npz", type=Path, default=None, help="Optional Step-1 .npz cache path.")
    args = parser.parse_args()
    if args.test_wp7:
        _run_wp7_benchmark(args.workers)
    elif args.build_full:
        dem_path = args.input_dir / "lola" / "ldem_75s_240m.img"
        sub_path = args.input_dir / "horizons" / "moon_subpoints_1h.csv"
        a3_csv = args.input_dir / "artemis3_regions_2024.csv"
        a3_gj = args.input_dir / "artemis3_regions_2024.geojson"
        dem = load_dem(dem_path)
        slope_full = compute_slope(dem)
        sub = pd.read_csv(sub_path, parse_dates=["time_utc"])
        sun_km, earth_km = body_vectors(sub)
        regions = load_artemis_regions(a3_csv, a3_gj, ARTEMIS_GEOJSON_URL) if a3_csv.exists() else None
        t0_str = pd.to_datetime(sub["time_utc"].iloc[0], utc=True).strftime("%Y-%m-%dT%H:%M:%SZ")
        end_str = pd.to_datetime(sub["time_utc"].iloc[-1], utc=True).strftime("%Y-%m-%dT%H:%M:%SZ")
        gen_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        pm_json, cand_json, _ = build_polar_maps_and_candidates(
            dem=dem,
            slope_full=slope_full,
            dem_path=dem_path,
            sun_km=sun_km,
            earth_km=earth_km,
            period_start_utc=t0_str,
            period_end_utc=end_str,
            schema_version="2.0.0",
            data_version="2026-11-14",
            generated_utc=gen_utc,
            artemis_regions=regions,
            workers=args.workers,
            step1_cache_npz=args.cache_npz,
        )
        args.output_dir.mkdir(parents=True, exist_ok=True)
        pm_path = args.output_dir / "polar_maps.json"
        cand_path = args.output_dir / "site_candidates.json"
        pm_path.write_text(json.dumps(pm_json, separators=(",", ":")), encoding="utf-8")
        cand_path.write_text(json.dumps(cand_json, separators=(",", ":")), encoding="utf-8")
        print(f"Wrote {pm_path} ({pm_path.stat().st_size:,} B)", flush=True)
        print(f"Wrote {cand_path} ({cand_path.stat().st_size:,} B)", flush=True)

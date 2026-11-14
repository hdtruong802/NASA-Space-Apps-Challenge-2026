"""Pipeline & Data Contract v2 invariant tests (pytest and unittest compatible)."""
from __future__ import annotations

import base64
import json
import math
import re
import sys
import unittest
from pathlib import Path

import numpy as np

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"
PUBLIC_DATA_DIR = REPO_ROOT / "webapp" / "public" / "data"
LOLA_IMG = DATA_DIR / "lola" / "ldem_75s_240m.img"

sys.path.insert(0, str(REPO_ROOT / "scripts"))
from lunar_geometry import DEM_N, DEM_SCALE, FINE_C0, FINE_R0, R0, spherical_horizon_dip_deg  # noqa: E402


def _load_json(name: str) -> dict:
    path = PUBLIC_DATA_DIR / name
    assert path.exists(), f"Missing generated data file: {path}"
    return json.loads(path.read_text(encoding="utf-8"))


class TestVersionMetadata(unittest.TestCase):
    """Every generated JSON file carries schema_version, data_version, and generated_utc."""

    REQUIRED_ALWAYS = [
        "ephemeris.json",
        "sites.json",
        "artemis3_regions.json",
        "polar_dem_patch.json",
        "dem_manifest.json",
    ]
    OPTIONAL_HEAVY = [
        "polar_maps.json",
        "site_candidates.json",
    ]

    def test_required_metadata_fields(self) -> None:
        for fname in self.REQUIRED_ALWAYS + self.OPTIONAL_HEAVY:
            path = PUBLIC_DATA_DIR / fname
            if fname in self.OPTIONAL_HEAVY and not path.exists():
                continue
            payload = _load_json(fname)
            self.assertIsInstance(payload, dict, f"{fname} must be a JSON object wrapper")
            for key in ("schema_version", "data_version", "generated_utc"):
                val = payload.get(key)
                self.assertIsInstance(val, str, f"{fname} missing string {key}")
                self.assertTrue(len(val.strip()) > 0, f"{fname} has empty {key}")
            self.assertRegex(
                payload["generated_utc"],
                r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$",
                f"{fname} generated_utc must be UTC ISO-8601",
            )


class TestEphemerisInvariants(unittest.TestCase):
    """WP1-B4 & B7 ephemeris length, validation tolerances, and live eclipse detection."""

    def test_ephemeris_structure_and_validation(self) -> None:
        eph = _load_json("ephemeris.json")
        n = int(eph["n"])
        self.assertGreaterEqual(n, 19033)
        self.assertEqual(eph["dt_hours"], 1)
        self.assertEqual(eph["t0_utc"], "2026-11-14T00:00:00Z")
        for key in ("subearth_lon", "subearth_lat", "subsolar_lon", "subsolar_lat", "earth_dist_km"):
            self.assertEqual(len(eph[key]), n, f"{key} length mismatch")

        val = eph["validation"]
        self.assertLessEqual(float(val["sun_max_err_deg"]), 0.001)
        self.assertLessEqual(float(val["earth_max_err_deg"]), 0.01)
        self.assertGreaterEqual(len(val.get("sites_checked", [])), 6)

        eclipses = eph["eclipses"]
        self.assertGreaterEqual(len(eclipses), 5)
        for ec in eclipses:
            self.assertGreaterEqual(int(ec["idx"]), 0)
            self.assertLess(int(ec["idx"]), n)
            self.assertGreaterEqual(int(ec["hours"]), 1)
            self.assertIn(ec["type"], {"partial", "total (Sun fully hidden)"})
            self.assertGreater(float(ec["max_obscured_frac"]), 0.0)
            self.assertLessEqual(float(ec["max_obscured_frac"]), 1.0)


class TestSitesContractV2(unittest.TestCase):
    """Data Contract v2, zero fake numbers, spherical dip, drift_240m, provenance & Q7 checks."""

    def setUp(self) -> None:
        self.dataset = _load_json("sites.json")
        self.sites = self.dataset["sites"]
        self.by_id = {s["id"]: s for s in self.sites}

    def test_mast_heights_and_required_ids(self) -> None:
        self.assertEqual(self.dataset["mast_heights"], [0.5, 2.0, 10.0, 20.0, 50.0])
        required_ids = {
            "connecting_ridge",
            "shackleton_rim",
            "peak_near_shackleton",
            "de_gerlache_rim_1",
            "de_gerlache_rim_2",
            "malapert_summit",
            "nobile_rim_1",
            "leibnitz_beta",
            "haworth_rim",
            "cabeus_b_peak",
            "slater_plain",
            "mons_mouton_plateau",
            "nobile_rim_2",
            "im1_odysseus",
            "im2_athena",
            "blue_ghost_m1",
            "im3_reiner_gamma",
            "bg_m2_lusee_night",
            "bg_m3_gruithuisen",
            "shackleton_psr",
            "south_pole_90s",
            "apollo_11",
            "apollo_15",
            "apollo_17",
            "slim_jaxa",
            "change_4",
            "change_6",
            "chandrayaan_3",
            "hakuto_m1",
            "hakuto_m2_resilience",
            "luna_25",
        }
        missing = required_ids - set(self.by_id)
        self.assertEqual(missing, set(), f"Missing curated site IDs: {missing}")

    def test_none_sites_have_null_terrain_and_spherical_dip(self) -> None:
        none_ids = [
            "apollo_11",
            "apollo_15",
            "apollo_17",
            "slim_jaxa",
            "change_4",
            "change_6",
            "chandrayaan_3",
            "blue_ghost_m1",
            "im3_reiner_gamma",
            "bg_m2_lusee_night",
            "bg_m3_gruithuisen",
            "hakuto_m1",
            "hakuto_m2_resilience",
            "luna_25",
        ]
        for sid in none_ids:
            s = self.by_id[sid]
            self.assertEqual(s["terrain_source"], "NONE")
            self.assertFalse(s["is_polar_dem"])
            self.assertEqual(s["elev_source"], "APPROXIMATE")
            for null_field in (
                "polar_x_km",
                "polar_y_km",
                "local_slope_deg",
                "terrain_stats",
                "drift_240m",
                "blocking_dist_km",
            ):
                self.assertIsNone(s[null_field], f"{sid}.{null_field} must be null for NONE site")

            # Spherical horizon dip check across all mast heights (WP1-B3)
            for mh in self.dataset["mast_heights"]:
                key = str(int(mh)) if mh == int(mh) else str(mh)
                expected_dip = -math.degrees(math.acos(R0 / (R0 + mh)))
                profile = s["horizons_by_mast"][key]
                self.assertEqual(len(profile), 360)
                self.assertAlmostEqual(profile[0], expected_dip, delta=0.001)
                self.assertAlmostEqual(min(profile), max(profile), delta=1e-6)

            self.assertEqual(
                s["metrics_2m"]["sun_no_terrain_pct"],
                s["metrics_2m"]["sun_time_pct"],
                f"{sid}: NONE sun_no_terrain_pct should equal sun_time_pct",
            )

    def test_joint_bound_null_scores_drift_and_descriptions(self) -> None:
        valid_statuses = {"landed", "attempted", "planned", "candidate_region", "reference"}
        for s in self.sites:
            m = s["metrics_2m"]
            self.assertLessEqual(
                m["both_visible_pct"],
                min(m["sun_time_pct"], m["earth_visible_pct"]) + 1e-6,
                f"{s['id']}: both_visible_pct exceeds min(sun_time_pct, earth_visible_pct)",
            )
            self.assertLessEqual(
                m["sun_visible_pct"],
                m["sun_time_pct"] + 0.1,
                f"{s['id']}: mean sun disk exceeds sun_time_pct",
            )
            self.assertIsNone(m["viability_score"], f"{s['id']}: pipeline must leave viability_score null (WP1-B6)")
            self.assertIsNone(m["archetype"], f"{s['id']}: pipeline must leave archetype null (WP1-B6)")

            # WP1-A6: zero digits in site description
            self.assertIsNone(
                re.search(r"\d", s["description"]),
                f"{s['id']}: description must not contain digits: {s['description']}",
            )

            # Provenance & mission_status
            prov = s.get("provenance")
            self.assertIsInstance(prov, dict, f"{s['id']}: missing provenance")
            self.assertIsInstance(prov.get("coord_source"), str)
            self.assertIn(prov.get("refine_mode"), {"exact", "high", "high_safe", "low"})
            self.assertGreaterEqual(float(prov.get("refine_offset_km", -1)), 0.0)
            self.assertIsInstance(prov.get("list_membership"), str)
            self.assertIs(prov.get("coord_verified"), True, f"{s['id']}: coord_verified must be True")
            self.assertRegex(str(prov.get("source_url", "")), r"^https://", f"{s['id']}: missing HTTPS source_url")
            self.assertIn(s.get("mission_status"), valid_statuses)

            if s["terrain_source"] == "LOLA_240M":
                self.assertEqual(s["elev_source"], "DEM")
                self.assertIsNotNone(s["drift_240m"])
                self.assertLessEqual(s["drift_240m"]["sun_min_pct"], m["sun_visible_pct"])
                self.assertLessEqual(m["sun_visible_pct"], s["drift_240m"]["sun_max_pct"])

    def test_nobile_relocation_and_program_labels(self) -> None:
        # SITE-1: PGDA sites not in 2024 9-region list must not claim "Artemis III" in program
        for sid in ("connecting_ridge", "shackleton_rim", "peak_near_shackleton", "de_gerlache_rim_1"):
            self.assertNotIn("Artemis III", self.by_id[sid]["program"])
            self.assertNotIn("Artemis III", self.by_id[sid]["category"])

        # Nobile Rim 1 relocated to 2024 N1 centroid (-85.423, 36.190) before refinement
        n1 = self.by_id["nobile_rim_1"]
        self.assertAlmostEqual(n1["provenance"]["nominal_lat"], -85.423, places=3)
        self.assertAlmostEqual(n1["provenance"]["nominal_lon"], 36.190, places=3)
        self.assertLess(abs(n1["lon"] - 36.190), 3.0)


class TestArtemisRegionsAndDem(unittest.TestCase):
    """Artemis III 2024 polygons, binary DEM I6 verification, and 5x5 center patch."""

    def test_artemis3_regions_polygons(self) -> None:
        ds = _load_json("artemis3_regions.json")
        regions = ds["regions"]
        self.assertEqual(len(regions), 9)
        by_code = {r["code"]: r for r in regions}
        self.assertEqual(set(by_code), {"CB", "HW", "MA", "MP", "MM", "N1", "N2", "G2", "SP"})
        for code in ("CB", "MP", "N2"):
            self.assertFalse(by_code[code]["in_polar_frame"], f"{code} should mark in_polar_frame=False")
        for code in ("HW", "MA", "MM", "N1", "G2", "SP"):
            self.assertTrue(by_code[code]["in_polar_frame"], f"{code} should mark in_polar_frame=True")
        for r in regions:
            self.assertGreater(len(r.get("rings_polar_km", [])), 0)
            self.assertGreater(len(r.get("polygon_lonlat", [])), 0)
            self.assertGreaterEqual(len(r["rings_polar_km"][0]), 4)

    def test_dem_manifest_and_binaries(self) -> None:
        manifest = _load_json("dem_manifest.json")
        fine = manifest["fine"]
        coarse = manifest["coarse"]

        self.assertEqual(fine["n_cols"], 1250)
        self.assertEqual(fine["n_rows"], 1250)
        self.assertEqual(fine["mpp_m"], 240.0)
        self.assertEqual(fine["x0_m"], -149880.0)
        self.assertEqual(fine["y0_m"], 149880.0)
        self.assertEqual(fine["byte_length"], 1250 * 1250 * 2)

        self.assertEqual(coarse["n_cols"], 762)
        self.assertEqual(coarse["n_rows"], 762)
        self.assertEqual(coarse["mpp_m"], 1200.0)
        self.assertEqual(coarse["x0_m"], -456840.0)
        self.assertEqual(coarse["y0_m"], 456840.0)
        self.assertEqual(coarse["aggregation"], "max")
        self.assertEqual(coarse["byte_length"], 762 * 762 * 2)

        fine_path = PUBLIC_DATA_DIR / fine["file"]
        coarse_path = PUBLIC_DATA_DIR / coarse["file"]
        self.assertEqual(fine_path.stat().st_size, fine["byte_length"])
        self.assertEqual(coarse_path.stat().st_size, coarse["byte_length"])

    @unittest.skipUnless(LOLA_IMG.exists(), "Raw LOLA .img file not present (gitignored in CI)")
    def test_binary_dem_and_center_patch_match_raw_lola(self) -> None:
        raw_dem = np.fromfile(LOLA_IMG, dtype="<i2").reshape(DEM_N, DEM_N).astype(np.float32) * np.float32(DEM_SCALE)
        manifest = _load_json("dem_manifest.json")
        fine_i16 = np.fromfile(PUBLIC_DATA_DIR / manifest["fine"]["file"], dtype="<i2").reshape(1250, 1250)
        coarse_i16 = np.fromfile(PUBLIC_DATA_DIR / manifest["coarse"]["file"], dtype="<i2").reshape(762, 762)

        check_pts = [(0, 0), (123, 456), (625, 625), (1000, 200), (1249, 1249)]
        for fr, fc in check_pts:
            expected_m = float(raw_dem[FINE_R0 + fr, FINE_C0 + fc])
            self.assertLessEqual(abs(int(fine_i16[fr, fc]) - expected_m), 0.51)

        coarse_pts = [(0, 0), (100, 200), (381, 381), (500, 600), (761, 761)]
        for cr, cc in coarse_pts:
            block_max = float(np.max(raw_dem[cr * 5 : (cr + 1) * 5, cc * 5 : (cc + 1) * 5]))
            self.assertLessEqual(abs(int(coarse_i16[cr, cc]) - block_max), 0.51)

        # Verify WP1-A8 center offset fix ([r0+2:r1:5, c0+2:c1:5])
        patch = _load_json("polar_dem_patch.json")
        patch_elev = np.frombuffer(base64.b64decode(patch["elev_i16_b64"]), dtype="<i2").reshape(250, 250)
        for pr, pc in [(0, 0), (10, 20), (125, 125), (200, 50), (249, 249)]:
            expected_center = float(raw_dem[FINE_R0 + 2 + pr * 5, FINE_C0 + 2 + pc * 5])
            self.assertLessEqual(abs(int(patch_elev[pr, pc]) - expected_center), 0.51)


class TestPolarMapsAndCandidates(unittest.TestCase):
    """I7 polar_maps.json and WP7 Mode A site_candidates.json invariants."""

    @unittest.skipUnless(
        (PUBLIC_DATA_DIR / "polar_maps.json").exists() and (PUBLIC_DATA_DIR / "site_candidates.json").exists(),
        "polar_maps.json / site_candidates.json not yet generated",
    )
    def test_polar_maps_and_candidates_consistency(self) -> None:
        pm = _load_json("polar_maps.json")
        sc = _load_json("site_candidates.json")

        self.assertEqual(pm["grid_size"], 250)
        self.assertEqual(pm["mpp_m"], 1200.0)
        self.assertEqual(pm["x0_m"], -149400.0)
        self.assertEqual(pm["y0_m"], 149400.0)
        self.assertEqual(pm["mast_m"], 2.0)

        sp = sc["search_params"]
        self.assertEqual(sp["grid_size"], 250)
        self.assertEqual(sp["x0_m"], -149400.0)
        self.assertEqual(sp["y0_m"], 149400.0)
        self.assertGreaterEqual(int(sp["refined_cell_count"]), 20)
        self.assertEqual(len(sc["refined"]), int(sp["refined_cell_count"]))

        pm_sun_t = np.frombuffer(base64.b64decode(pm["sun_time_pct_u8_b64"]), dtype=np.uint8).reshape(250, 250)
        pm_earth = np.frombuffer(base64.b64decode(pm["earth_visible_pct_u8_b64"]), dtype=np.uint8).reshape(250, 250)
        pm_pix = np.frombuffer(base64.b64decode(pm["sample_pixel_u8_b64"]), dtype=np.uint8).reshape(250, 250)

        sc_sun_t = (
            np.frombuffer(base64.b64decode(sc["layers"]["sun_time_pct_x100_u16_b64"]), dtype="<u2").reshape(250, 250)
            / 100.0
        )
        sc_sun_v = (
            np.frombuffer(base64.b64decode(sc["layers"]["sun_visible_pct_x100_u16_b64"]), dtype="<u2").reshape(250, 250)
            / 100.0
        )
        sc_earth = (
            np.frombuffer(base64.b64decode(sc["layers"]["earth_visible_pct_x100_u16_b64"]), dtype="<u2").reshape(250, 250)
            / 100.0
        )
        sc_pix = np.frombuffer(base64.b64decode(sc["layers"]["sample_pixel_u8_b64"]), dtype=np.uint8).reshape(250, 250)

        self.assertTrue(np.array_equal(pm_pix, sc_pix))
        self.assertTrue(np.all(pm_pix <= 24))
        self.assertLessEqual(float(np.max(np.abs(pm_sun_t.astype(np.float64) - sc_sun_t))), 0.6)
        self.assertLessEqual(float(np.max(np.abs(pm_earth.astype(np.float64) - sc_earth))), 0.6)

        # WP7 §3 / §8 benchmark inside |x|,|y| <= 42 km (cells 90..159)
        sub_sun = sc_sun_v[90:160, 90:160]
        self.assertGreaterEqual(float(np.max(sub_sun)), 90.0)
        self.assertGreaterEqual(len(sc["refined"][0]["pixels"]), 25)


if __name__ == "__main__":
    unittest.main()

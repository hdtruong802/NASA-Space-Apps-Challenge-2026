"""Download Sun/Earth geometry for the Moon from the JPL Horizons API.

Two kinds of tables are saved to <out_dir>:
  1. moon_subpoints_1h.csv  -- sub-Earth and sub-solar points on the Moon (MOON_ME frame)
     + Earth-Moon distance (DE441). From these, Sun/Earth azimuth/elevation can be
     computed for any lunar coordinate with vector geometry.
  2. topo_<site>_<body>.csv -- direct topocentric azimuth/elevation from Horizons for the
     6 validation sites (CENTER='coord@301') so the pipeline can recompute validation live.

Usage:
  python scripts/fetch_horizons.py [--out-dir data/horizons]
      [--start "2026-11-14 00:00"] [--stop "2030-12-31 23:00"] [--step "1 h"]
"""
from __future__ import annotations

import argparse
import re
import sys
import time
from pathlib import Path

import pandas as pd
import requests

API_URL = "https://ssd.jpl.nasa.gov/api/horizons.api"
DEFAULT_START = "2026-11-14 00:00"
DEFAULT_STOP = "2030-12-31 23:00"
DEFAULT_STEP = "1 h"
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "horizons"

# Exact validation coordinates matching historical Horizons topocentric queries
VALIDATION_SITES: list[dict[str, float | str]] = [
    {"name": "Apollo 11", "lat": 0.67408, "lon": 23.47297},
    {"name": "Chang'e-4 (far side)", "lat": -45.4446, "lon": 177.5991},
    {"name": "Chandrayaan-3 (ISRO)", "lat": -69.3733, "lon": 32.3191},
    {"name": "IM-1 Odysseus (CLPS)", "lat": -80.13, "lon": 1.44},
    {"name": "IM-2 Athena (CLPS)", "lat": -84.7906, "lon": 29.1957},
    {"name": "Connecting ridge (approx)", "lat": -89.45, "lon": -137.3},
]


def query_horizons(
    params: dict[str, str],
    start: str,
    stop: str,
    step: str,
    retries: int = 4,
) -> str:
    """Query the JPL Horizons REST API and return raw text containing $$SOE..$$EOE."""
    query = {
        "format": "text",
        "OBJ_DATA": "'NO'",
        "MAKE_EPHEM": "'YES'",
        "EPHEM_TYPE": "'OBSERVER'",
        "CSV_FORMAT": "'YES'",
        "ANG_FORMAT": "'DEG'",
        "EXTRA_PREC": "'YES'",
        "START_TIME": f"'{start}'",
        "STOP_TIME": f"'{stop}'",
        "STEP_SIZE": f"'{step}'",
    }
    query.update(params)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.get(API_URL, params=query, timeout=300)
            resp.raise_for_status()
            if "$$SOE" not in resp.text or "$$EOE" not in resp.text:
                raise RuntimeError(resp.text[:1500])
            return resp.text
        except Exception as exc:
            last_err = exc
            print(f"  [retry {attempt + 1}/{retries}] {exc}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"Horizons query failed after {retries} retries: {last_err}")


def parse_horizons_csv(txt: str) -> pd.DataFrame:
    """Parse JPL Horizons CSV text response between $$SOE and $$EOE."""
    lines = txt.splitlines()
    i0, i1 = lines.index("$$SOE"), lines.index("$$EOE")
    header = [c.strip() for c in lines[i0 - 2].split(",")]
    names: list[str] = []
    blank = 0
    for col in header:
        if col == "":
            blank += 1
            names.append(f"flag{blank}")
        else:
            names.append(col)
    rows = [ln.split(",") for ln in lines[i0 + 1 : i1]]
    df = pd.DataFrame([[v.strip() for v in r[: len(names)]] for r in rows], columns=names)
    df = df.loc[:, [c for c in df.columns if not c.startswith("flag") or df[c].ne("").any()]]
    tcol = names[0]
    df.insert(0, "time_utc", pd.to_datetime(df.pop(tcol), format="%Y-%b-%d %H:%M"))
    for col in df.columns[1:]:
        if not col.startswith("flag"):
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")


def fetch_all(
    out_dir: Path,
    start: str = DEFAULT_START,
    stop: str = DEFAULT_STOP,
    step: str = DEFAULT_STEP,
    skip_topo: bool = False,
) -> None:
    """Download moon_subpoints_1h.csv and optionally the 12 topocentric validation CSVs."""
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"[1/2] Fetching Moon sub-points ({start} -> {stop}, step={step})...")
    txt = query_horizons(
        {"COMMAND": "'301'", "CENTER": "'500@399'", "QUANTITIES": "'14,15,20'"},
        start=start,
        stop=stop,
        step=step,
    )
    sub_df = parse_horizons_csv(txt).rename(
        columns={
            "ObsSub-LON": "subearth_lon",
            "ObsSub-LAT": "subearth_lat",
            "SunSub-LON": "subsolar_lon",
            "SunSub-LAT": "subsolar_lat",
            "delta": "earth_moon_au",
            "deldot": "earth_moon_kms",
        }
    )
    sub_path = out_dir / "moon_subpoints_1h.csv"
    sub_df.to_csv(sub_path, index=False)
    print(f"      saved {sub_path} ({len(sub_df):,} rows)")

    if skip_topo:
        return

    print(f"[2/2] Fetching topocentric Sun/Earth tables for {len(VALIDATION_SITES)} validation sites...")
    for site in VALIDATION_SITES:
        name = str(site["name"])
        lat = float(site["lat"])
        lon = float(site["lon"])
        for body, cmd in (("sun", "10"), ("earth", "399")):
            dest = out_dir / f"topo_{slugify(name)}_{body}.csv"
            print(f"      - {name} / {body} -> {dest.name}")
            topo_txt = query_horizons(
                {
                    "COMMAND": f"'{cmd}'",
                    "CENTER": "'coord@301'",
                    "COORD_TYPE": "'GEODETIC'",
                    "SITE_COORD": f"'{lon:.5f},{lat:.5f},0'",
                    "QUANTITIES": "'4,20'",
                },
                start=start,
                stop=stop,
                step=step,
            )
            topo_df = parse_horizons_csv(topo_txt).rename(
                columns={
                    "Azimuth_(a-app)": "az_deg",
                    "Elevation_(a-app)": "el_deg",
                    "delta": "range_au",
                    "deldot": "range_rate_kms",
                }
            )
            topo_df.to_csv(dest, index=False)
            print(f"        {len(topo_df):,} rows, el in [{topo_df['el_deg'].min():.2f}, {topo_df['el_deg'].max():.2f}] deg")
            time.sleep(0.5)


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch JPL Horizons Moon ephemeris and validation tables.")
    parser.add_argument(
        "positional_out",
        nargs="?",
        default=None,
        help="Optional positional output directory (default: <repo>/data/horizons).",
    )
    parser.add_argument("--out-dir", type=Path, default=None, help="Output directory for CSV files.")
    parser.add_argument("--start", default=DEFAULT_START, help=f"Start UTC (default: {DEFAULT_START}).")
    parser.add_argument("--stop", default=DEFAULT_STOP, help=f"Stop UTC (default: {DEFAULT_STOP}).")
    parser.add_argument("--step", default=DEFAULT_STEP, help=f"Step size (default: {DEFAULT_STEP}).")
    parser.add_argument("--skip-topo", action="store_true", help="Only fetch moon_subpoints_1h.csv.")
    args = parser.parse_args()
    out_dir = args.out_dir or (Path(args.positional_out) if args.positional_out else DEFAULT_OUT_DIR)
    fetch_all(out_dir, start=args.start, stop=args.stop, step=args.step, skip_topo=args.skip_topo)


if __name__ == "__main__":
    main()

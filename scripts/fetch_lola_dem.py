"""Download the LRO LOLA South Pole DEM (LDEM_75S_240M, ~29 MB) from NASA PDS Geosciences Node.

Usage:
  python scripts/fetch_lola_dem.py [--out-dir data/lola] [--force]
"""
from __future__ import annotations

import argparse
from pathlib import Path

import requests

BASE_URL = "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/"
DEM_FILES = {
    "ldem_75s_240m.lbl": None,
    "ldem_75s_240m.img": 3812 * 3812 * 2,  # 29,062,688 bytes (3812x3812 int16)
}
DEFAULT_OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "lola"


def download_lola_dem(out_dir: Path, force: bool = False) -> None:
    """Download LOLA LDEM_75S_240M label and image files into out_dir."""
    out_dir.mkdir(parents=True, exist_ok=True)
    for filename, expected_bytes in DEM_FILES.items():
        dest = out_dir / filename
        if not force and dest.exists() and dest.stat().st_size > 0:
            if expected_bytes is None or dest.stat().st_size == expected_bytes:
                print(f"[skip] {dest} already present ({dest.stat().st_size:,} bytes)")
                continue
        print(f"[download] {BASE_URL}{filename} -> {dest}")
        with requests.get(BASE_URL + filename, stream=True, timeout=600) as resp:
            resp.raise_for_status()
            tmp = dest.with_suffix(dest.suffix + ".part")
            with open(tmp, "wb") as fh:
                for chunk in resp.iter_content(chunk_size=1 << 20):
                    if chunk:
                        fh.write(chunk)
            tmp.replace(dest)
        size = dest.stat().st_size
        if expected_bytes is not None and size != expected_bytes:
            raise RuntimeError(f"Unexpected size for {dest}: got {size} bytes, expected {expected_bytes}")
        print(f"           saved {size:,} bytes ({size / 1e6:.2f} MB)")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch LRO LOLA LDEM_75S_240M from PDS Geosciences Node.")
    parser.add_argument(
        "positional_out",
        nargs="?",
        default=None,
        help="Optional positional output directory (overrides default data/lola).",
    )
    parser.add_argument(
        "--out-dir",
        type=Path,
        default=None,
        help="Output directory for ldem_75s_240m.img/.lbl (default: <repo>/data/lola).",
    )
    parser.add_argument("--force", action="store_true", help="Re-download even if files already exist.")
    args = parser.parse_args()
    out_dir = args.out_dir or (Path(args.positional_out) if args.positional_out else DEFAULT_OUT_DIR)
    download_lola_dem(out_dir, force=args.force)


if __name__ == "__main__":
    main()

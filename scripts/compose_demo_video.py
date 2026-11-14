#!/usr/bin/env python3
"""
Compose the 5-minute bilingual (EN/VI) live-demo video and optional <=30s pitch cut
for Lunar Landing Site Navigator (Team VeriFour — NASA Space Apps Challenge 2026).

Uses system Python (`cv2`, `PIL`, `numpy`, `scipy`, `av`), Windows System.Speech TTS
(`Microsoft Zira Desktop`), synthesized copyright-free D-Dorian cosmic ambient score
with sidechain voice ducking, streaming frame-by-frame H.264/AAC faststart muxing.

Examples:
    python scripts/compose_demo_video.py --dry-test
    python scripts/compose_demo_video.py --make-30s
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import gc
import json
import math
from pathlib import Path
import re
import subprocess
import tempfile
from typing import Iterable
import wave

import av
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import signal
from scipy.io import wavfile

# ---------------------------------------------------------------------------
# Project Paths & Media Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent

DEFAULT_SEGMENTS_DIR = Path(
    r"C:\Users\ADMIN\.gemini\antigravity\brain\cc11deb9-a5cc-4d9a-8848-fb5e0f9a69a2\scratch\video_segments"
)
DEFAULT_SRT_PATH = PROJECT_ROOT / "submission" / "DEMO_VIDEO_5MIN_BILINGUAL.srt"
DEFAULT_OUT_5MIN = PROJECT_ROOT / "submission" / "Lunar_Landing_Site_Navigator_5Min_Demo.mp4"
DEFAULT_OUT_30S = PROJECT_ROOT / "submission" / "Lunar_Landing_Site_Navigator_30s_Pitch.mp4"
DEFAULT_FFMPEG_EXE = Path(
    r"C:\Users\ADMIN\AppData\Local\CapCut\Apps\9.4.0.4015\ffmpeg.exe"
)
DEFAULT_DRY_OUT_DIR = PROJECT_ROOT / "submission" / "_dry_test_preview"

FONT_EN_PATH = Path("C:/Windows/Fonts/segoeuib.ttf")
FONT_VI_PATH = Path("C:/Windows/Fonts/segoeui.ttf")
FONT_MONO_PATH = Path("C:/Windows/Fonts/consola.ttf")

WIDTH = 1280
HEIGHT = 720
TOP_BAR_HEIGHT = 34
FPS = 24
SAMPLE_RATE = 44100
CROSS_DISSOLVE_SEC = 0.40
BG_RGB = (3, 6, 15)  # Cosmic deep space #03060f

MAX_EN_CPS = 15.0
MAX_WRAP_LINES = 2
SUBTITLE_MAX_TEXT_WIDTH = 1140
TEAM_MEMBERS_LINE = (
    "Linh Nguyen · Duc-Truong Hoang · Nguyễn Tiến · Le Thien Khang · Tran Nguyen My Anh"
)


@dataclass(frozen=True)
class ChapterSpec:
    index: int
    filename: str
    start_sec: float
    end_sec: float
    badge: str
    src_in_frac: float = 0.0
    src_out_frac: float = 1.0

    @property
    def duration_sec(self) -> float:
        return self.end_sec - self.start_sec


CHAPTERS: list[ChapterSpec] = [
    ChapterSpec(1, "seg01.mp4", 0.0, 26.0, "Ch 1/10 · Cosmic 3D Overview & Explain Tour"),
    ChapterSpec(2, "seg02.mp4", 26.0, 50.0, "Ch 2/10 · Getting Started & Lunar Physics"),
    ChapterSpec(3, "seg03.mp4", 50.0, 88.0, "Ch 3/10 · 3D Rover, VTOL Hopper & Shaders"),
    ChapterSpec(4, "seg04.mp4", 88.0, 114.0, "Ch 4/10 · 4 Live KPIs & Science Notes", 0.56, 1.0),
    ChapterSpec(5, "seg05.mp4", 114.0, 146.0, "Ch 5/10 · 36,216h Timeline & 9 Eclipses"),
    ChapterSpec(6, "seg06.mp4", 146.0, 174.0, "Ch 6/10 · 360° Horizon & Traverse Profile"),
    ChapterSpec(7, "seg07.mp4", 174.0, 206.0, "Ch 7/10 · Command Split & 15 ms Probe"),
    ChapterSpec(8, "seg08.mp4", 206.0, 230.0, "Ch 8/10 · Compare A vs B Trade-Offs", 0.812, 1.0),
    ChapterSpec(9, "seg09.mp4", 230.0, 262.0, "Ch 9/10 · Candidate Directory 31 & Export", 0.31, 1.0),
    ChapterSpec(10, "seg10.mp4", 262.0, 300.0, "Ch 10/10 · NASA RAG Chat & JPL Validation"),
]


@dataclass(frozen=True)
class SrtCue:
    index: int
    start_sec: float
    end_sec: float
    en: str
    vi: str

    @property
    def duration_sec(self) -> float:
        return max(0.0, self.end_sec - self.start_sec)


@dataclass(frozen=True)
class ClipSlice30s:
    filename: str
    start_sec: float
    end_sec: float
    badge: str
    src_in_frac: float = 0.05
    src_out_frac: float = 0.90


# 5 official NASA Space Apps 30-second pitch milestones (total 28.0s <= 30.0s)
PITCH_30S_CLIPS: list[ClipSlice30s] = [
    ClipSlice30s("seg01.mp4", 0.0, 6.0, "Team VeriFour · South Pole 3D Challenge", 0.02, 0.21),
    ClipSlice30s("seg03.mp4", 6.0, 11.0, "Live 3D Sun, Earth DTE & Rover", 0.04, 0.48),
    ClipSlice30s("seg03.mp4", 11.0, 14.0, "Drive Rover & VTOL Hopper", 0.50, 0.95),
    ClipSlice30s("seg07.mp4", 14.0, 17.0, "Probe 360° Horizons (15 ms)", 0.68, 0.98),
    ClipSlice30s("seg09.mp4", 17.0, 20.0, "Rank 62,500 Polar Candidates", 0.34, 0.96),
    ClipSlice30s("seg10.mp4", 20.0, 28.0, "Open-Source Apache-2.0 · Team VeriFour", 0.35, 0.98),
]


def build_30s_cues(presenter: str | None = None) -> list[SrtCue]:
    """Build the 5 NASA 30s milestone cues totaling strictly 28.0 seconds."""
    intro_en = (
        f"Hi, I'm {presenter} from Team VeriFour."
        if presenter
        else "Team VeriFour presents Lunar Landing Site Navigator."
    )
    intro_vi = (
        f"Xin chào, tôi là {presenter} từ Team VeriFour."
        if presenter
        else "Team VeriFour giới thiệu Lunar Landing Site Navigator."
    )
    return [
        SrtCue(1, 0.0, 2.5, intro_en, intro_vi),
        SrtCue(
            2,
            2.5,
            6.0,
            "Extreme polar shadows inspired our lunar landing challenge.",
            "Bóng tối cực đoan ở cực Mặt Trăng truyền cảm hứng cho nhóm.",
        ),
        SrtCue(
            3,
            6.0,
            11.0,
            "Lunar Landing Site Navigator: live 3D sunlight, Earth-link, and rover planning.",
            "Lập kế hoạch ánh sáng Mặt Trời, liên lạc Trái Đất và rover 3D trực tiếp.",
        ),
        SrtCue(
            4,
            11.0,
            20.0,
            "Using open NASA LOLA, JPL Horizons, and CSA partner resources, you drive a 3D rover, probe horizons, and rank sites.",
            "Dùng dữ liệu NASA LOLA, JPL Horizons và đối tác CSA để lái rover 3D, quét chân trời và xếp hạng điểm.",
        ),
        SrtCue(
            5,
            20.0,
            28.0,
            "Browser-ready and open-source under Apache-2.0, it helps missions and classrooms worldwide plan humanity's return to the Moon.",
            "Chạy trên trình duyệt, mã nguồn mở Apache-2.0, hỗ trợ sứ mệnh và lớp học toàn cầu trở lại Mặt Trăng.",
        ),
    ]


# ---------------------------------------------------------------------------
# SRT Parsing & Validation
# ---------------------------------------------------------------------------

_SRT_TIME_RE = re.compile(r"^(\d{2}):(\d{2}):(\d{2})[,.](\d{3})$")


def _parse_srt_ts(ts_str: str) -> float:
    m = _SRT_TIME_RE.match(ts_str.strip())
    if not m:
        raise ValueError(f"Invalid SRT timestamp: {ts_str!r}")
    hh, mm, ss, ms = (int(x) for x in m.groups())
    return hh * 3600.0 + mm * 60.0 + ss + ms / 1000.0


def parse_srt(srt_path: Path) -> list[SrtCue]:
    """Parse UTF-8 bilingual SRT where line 1 is English and line 2 is Vietnamese."""
    raw = srt_path.read_text(encoding="utf-8-sig").strip()
    blocks = re.split(r"\r?\n\s*\r?\n", raw)
    cues: list[SrtCue] = []
    for block in blocks:
        lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
        if len(lines) < 4:
            raise ValueError(f"SRT block missing EN/VI lines: {lines!r}")
        idx = int(lines[0])
        if "-->" not in lines[1]:
            raise ValueError(f"SRT cue #{idx} invalid arrow line: {lines[1]!r}")
        left, right = lines[1].split("-->", 1)
        start_sec = _parse_srt_ts(left)
        end_sec = _parse_srt_ts(right)
        en = lines[2]
        vi = " ".join(lines[3:])
        cues.append(SrtCue(idx, start_sec, end_sec, en, vi))
    return cues


def wrap_text_pixels(text: str, font: ImageFont.FreeTypeFont, max_width: int) -> list[str]:
    """Greedy pixel-accurate word wrapping using Pillow font metrics."""
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if font.getlength(candidate) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def validate_srt_and_fonts(cues: list[SrtCue], expected_total_sec: float) -> dict:
    """Validate cue continuity, reading rate (<=15 cps), font metrics, and Vietnamese glyphs."""
    for p in (FONT_EN_PATH, FONT_VI_PATH):
        if not p.exists():
            raise FileNotFoundError(f"Required UTF-8 font missing: {p}")

    font_en = ImageFont.truetype(str(FONT_EN_PATH), 22)
    font_vi = ImageFont.truetype(str(FONT_VI_PATH), 20)
    font_badge = ImageFont.truetype(str(FONT_EN_PATH), 16)

    max_en_cps = 0.0
    max_vi_cps = 0.0
    max_en_lines = 0
    max_vi_lines = 0
    prev_end = 0.0

    for cue in cues:
        if cue.start_sec < prev_end - 1e-6:
            raise ValueError(
                f"SRT cue #{cue.index} overlaps previous cue ({cue.start_sec} < {prev_end})"
            )
        if cue.duration_sec <= 0.1:
            raise ValueError(f"SRT cue #{cue.index} has non-positive duration {cue.duration_sec}")
        prev_end = cue.end_sec

        en_cps = len(cue.en) / cue.duration_sec
        vi_cps = len(cue.vi) / cue.duration_sec
        max_en_cps = max(max_en_cps, en_cps)
        max_vi_cps = max(max_vi_cps, vi_cps)

        if en_cps > MAX_EN_CPS + 0.05:
            raise ValueError(
                f"SRT cue #{cue.index} exceeds {MAX_EN_CPS} chars/s ({en_cps:.2f}): {cue.en!r}"
            )

        en_lines = wrap_text_pixels(cue.en, font_en, SUBTITLE_MAX_TEXT_WIDTH)
        vi_lines = wrap_text_pixels(cue.vi, font_vi, SUBTITLE_MAX_TEXT_WIDTH)
        max_en_lines = max(max_en_lines, len(en_lines))
        max_vi_lines = max(max_vi_lines, len(vi_lines))
        if len(en_lines) > MAX_WRAP_LINES:
            raise ValueError(f"EN cue #{cue.index} wraps to {len(en_lines)} lines: {en_lines}")
        if len(vi_lines) > MAX_WRAP_LINES:
            raise ValueError(f"VI cue #{cue.index} wraps to {len(vi_lines)} lines: {vi_lines}")

    if abs(prev_end - expected_total_sec) > 0.2:
        raise ValueError(
            f"SRT total duration {prev_end:.2f}s mismatches expected {expected_total_sec:.2f}s"
        )

    vi_probe = "áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ"
    for ch in vi_probe:
        if font_vi.getlength(ch) <= 0:
            raise RuntimeError(f"Font {FONT_VI_PATH} failed glyph render for {ch!r}")

    return {
        "cue_count": len(cues),
        "total_sec": prev_end,
        "max_en_cps": round(max_en_cps, 2),
        "max_vi_cps": round(max_vi_cps, 2),
        "max_en_lines": max_en_lines,
        "max_vi_lines": max_vi_lines,
        "badge_font_px": font_badge.size,
    }


# ---------------------------------------------------------------------------
# Pillow Vector-Cached Overlay Compositor (1280x720)
# ---------------------------------------------------------------------------


class OverlayCompositor:
    """Fast, flicker-free RGBA subtitle, badge, and intro/outro overlay compositor."""

    def __init__(
        self,
        width: int = WIDTH,
        height: int = HEIGHT,
        badge_xy: tuple[int, int] = (10, 3),
        team_credit: str = "Team VeriFour · NASA Space Apps Challenge 2026 (Hanoi)",
    ) -> None:
        self.width = width
        self.height = height
        self.badge_xy = badge_xy
        self.team_credit = team_credit

        self.font_en = ImageFont.truetype(str(FONT_EN_PATH), 22)
        self.font_vi = ImageFont.truetype(str(FONT_VI_PATH), 20)
        self.font_badge = ImageFont.truetype(str(FONT_EN_PATH), 16)
        self.font_top_tag = ImageFont.truetype(str(FONT_VI_PATH), 14)
        self.font_title = ImageFont.truetype(str(FONT_EN_PATH), 26)
        self.font_sub = ImageFont.truetype(str(FONT_VI_PATH), 17)

        # Precompute bottom dark gradient strip (y = 562..720, smooth ramp to rgba(5, 8, 18, 0.80))
        self.sub_y0 = max(0, height - 158)
        strip_h = height - self.sub_y0
        ramp = np.linspace(0.0, 1.0, strip_h, dtype=np.float32)
        alpha_1d = np.where(
            ramp < 0.28,
            0.80 * (3 * (ramp / 0.28) ** 2 - 2 * (ramp / 0.28) ** 3),
            0.80 + 0.06 * ((ramp - 0.28) / 0.72),
        )
        self._grad_alpha = alpha_1d[:, None, None]
        self._grad_color = np.array([5.0, 8.0, 18.0], dtype=np.float32)[None, None, :]

        self._sub_cache: dict[tuple[str, str], tuple[np.ndarray, np.ndarray]] = {}
        self._badge_cache: dict[str, tuple[int, int, np.ndarray, np.ndarray]] = {}
        self._card_cache: dict[str, tuple[int, int, np.ndarray, np.ndarray]] = {}

        # Right-side subtle top strip tag (fits neatly inside TOP_BAR_HEIGHT without touching app)
        tag_txt = "Team VeriFour · LRO LOLA 240 m + JPL DE441 · Apache-2.0"
        tw = int(math.ceil(self.font_top_tag.getlength(tag_txt))) + 8
        tag_img = Image.new("RGBA", (tw, 24), (0, 0, 0, 0))
        tdraw = ImageDraw.Draw(tag_img)
        tdraw.text((4, 3), tag_txt, font=self.font_top_tag, fill=(148, 163, 184, 215))
        tarr = np.asarray(tag_img, dtype=np.float32)
        self._top_right_tag = (tw, 24, tarr[:, :, :3], tarr[:, :, 3:4] / 255.0)

    def _get_subtitle_layers(
        self, en: str, vi: str
    ) -> tuple[np.ndarray, np.ndarray]:
        """Return (rgb_float32, alpha_float32_HxWx1) for the bottom subtitle region."""
        key = (en, vi)
        if key in self._sub_cache:
            return self._sub_cache[key]

        strip_h = self.height - self.sub_y0
        img = Image.new("RGBA", (self.width, strip_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)

        en_lines = wrap_text_pixels(en, self.font_en, SUBTITLE_MAX_TEXT_WIDTH)[:MAX_WRAP_LINES]
        vi_lines = wrap_text_pixels(vi, self.font_vi, SUBTITLE_MAX_TEXT_WIDTH)[:MAX_WRAP_LINES]

        en_lh = 28
        vi_lh = 25
        gap = 6 if (en_lines and vi_lines) else 0
        total_h = len(en_lines) * en_lh + gap + len(vi_lines) * vi_lh

        usable_top = 26
        usable_bot = strip_h - 10
        y_cursor = usable_top + max(0, (usable_bot - usable_top - total_h) // 2)

        for line in en_lines:
            w = self.font_en.getlength(line)
            x = (self.width - w) / 2.0
            draw.text((x + 1, y_cursor + 2), line, font=self.font_en, fill=(0, 0, 0, 225))
            draw.text((x, y_cursor), line, font=self.font_en, fill=(248, 250, 252, 255))
            y_cursor += en_lh

        y_cursor += gap
        for line in vi_lines:
            w = self.font_vi.getlength(line)
            x = (self.width - w) / 2.0
            draw.text((x + 1, y_cursor + 2), line, font=self.font_vi, fill=(0, 0, 0, 220))
            draw.text((x, y_cursor), line, font=self.font_vi, fill=(253, 230, 138, 255))
            y_cursor += vi_lh

        arr = np.asarray(img, dtype=np.float32)
        rgb = arr[:, :, :3]
        alpha = arr[:, :, 3:4] / 255.0
        self._sub_cache[key] = (rgb, alpha)
        return rgb, alpha

    def _get_badge_layer(
        self, text: str
    ) -> tuple[int, int, np.ndarray, np.ndarray]:
        if text in self._badge_cache:
            return self._badge_cache[text]

        tw = int(math.ceil(self.font_badge.getlength(text)))
        pad_x = 14
        pill_w = min(self.width - 32, tw + pad_x * 2 + 12)
        pill_h = 28
        img = Image.new("RGBA", (pill_w, pill_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle(
            [0, 0, pill_w - 1, pill_h - 1],
            radius=9,
            fill=(7, 13, 30, 210),
            outline=(56, 189, 248, 130),
            width=1,
        )
        draw.ellipse([10, 10, 18, 18], fill=(34, 211, 238, 245))
        draw.text((24, 4), text, font=self.font_badge, fill=(224, 242, 254, 252))

        arr = np.asarray(img, dtype=np.float32)
        res = (pill_w, pill_h, arr[:, :, :3], arr[:, :, 3:4] / 255.0)
        self._badge_cache[text] = res
        return res

    def _get_title_card_layer(
        self, title: str, subtitle: str
    ) -> tuple[int, int, np.ndarray, np.ndarray]:
        key = f"{title}||{subtitle}"
        if key in self._card_cache:
            return self._card_cache[key]

        sub_lines = [ln.strip() for ln in subtitle.split("\n") if ln.strip()]
        w_title = int(math.ceil(self.font_title.getlength(title)))
        w_subs = [int(math.ceil(self.font_sub.getlength(ln))) for ln in sub_lines]
        box_w = min(self.width - 80, max([w_title] + w_subs) + 56)
        box_h = 54 + len(sub_lines) * 26
        img = Image.new("RGBA", (box_w, box_h), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        draw.rounded_rectangle(
            [0, 0, box_w - 1, box_h - 1],
            radius=14,
            fill=(5, 10, 24, 218),
            outline=(251, 191, 36, 175),
            width=2,
        )
        x1 = (box_w - w_title) / 2.0
        draw.text((x1, 12), title, font=self.font_title, fill=(248, 250, 252, 255))
        for idx, (ln, lw) in enumerate(zip(sub_lines, w_subs)):
            x_ln = (box_w - lw) / 2.0
            fill = (125, 211, 252, 255) if idx == 0 else (253, 230, 138, 248)
            draw.text((x_ln, 46 + idx * 25), ln, font=self.font_sub, fill=fill)

        arr = np.asarray(img, dtype=np.float32)
        res = (box_w, box_h, arr[:, :, :3], arr[:, :, 3:4] / 255.0)
        self._card_cache[key] = res
        return res

    def render_frame(
        self,
        frame_rgb: np.ndarray,
        badge_text: str | None = None,
        cue: SrtCue | None = None,
        title_overlay: tuple[str, str, float] | None = None,
    ) -> np.ndarray:
        """Composite gradient backdrop, bilingual subtitles, top-left badge, and optional title card."""
        out = frame_rgb.astype(np.float32, copy=True)

        # 1. Bottom gradient backdrop
        y0 = self.sub_y0
        g_alpha = self._grad_alpha if cue is not None else self._grad_alpha * 0.45
        out[y0:, :, :] = out[y0:, :, :] * (1.0 - g_alpha) + self._grad_color * g_alpha

        # 2. Bilingual subtitles (English Line 1, Vietnamese Line 2)
        if cue is not None:
            sub_rgb, sub_a = self._get_subtitle_layers(cue.en, cue.vi)
            out[y0:, :, :] = out[y0:, :, :] * (1.0 - sub_a) + sub_rgb * sub_a

        # 3. Unobtrusive top-left chapter badge (+ subtle top-right provenance tag)
        if badge_text:
            bw, bh, brgb, ba = self._get_badge_layer(badge_text)
            bx, by = self.badge_xy
            if bx + bw <= self.width and by + bh <= self.height:
                roi = out[by : by + bh, bx : bx + bw, :]
                out[by : by + bh, bx : bx + bw, :] = roi * (1.0 - ba) + brgb * ba

        tw, th, trgb, ta = self._top_right_tag
        tx = self.width - tw - 10
        ty = 4
        if tx > 360 and ty + th <= TOP_BAR_HEIGHT:
            roi = out[ty : ty + th, tx : tx + tw, :]
            out[ty : ty + th, tx : tx + tw, :] = roi * (1.0 - ta) + trgb * ta

        # 4. Optional translucent title/outro card over live 3D scene (never blank slide)
        if title_overlay is not None:
            title_txt, sub_txt, opacity = title_overlay
            if opacity > 0.01:
                cw, ch, crgb, ca = self._get_title_card_layer(title_txt, sub_txt)
                cx = (self.width - cw) // 2
                cy = self.sub_y0 - ch - 28
                ca_scaled = ca * float(min(1.0, max(0.0, opacity)))
                roi = out[cy : cy + ch, cx : cx + cw, :]
                out[cy : cy + ch, cx : cx + cw, :] = (
                    roi * (1.0 - ca_scaled) + crgb * ca_scaled
                )

        return np.clip(out, 0, 255).astype(np.uint8)


# ---------------------------------------------------------------------------
# Video Frame Fitting & Temporal Pacing Helpers
# ---------------------------------------------------------------------------


def fit_frame_to_canvas(
    bgr_frame: np.ndarray,
    width: int = WIDTH,
    height: int = HEIGHT,
    top_bar_h: int = TOP_BAR_HEIGHT,
) -> np.ndarray:
    """
    Resize BGR -> RGB with INTER_LANCZOS4 keeping exact aspect ratio on cosmic BG.
    Reserves a clean `top_bar_h` cosmic strip at y=0..top_bar_h so the top-left
    chapter badge never overlaps any Chrome UI header button or 3D viewport pill.
    """
    h_in, w_in = bgr_frame.shape[:2]
    rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
    avail_h = max(1, height - top_bar_h)

    scale = min(width / w_in, avail_h / h_in)
    new_w = max(1, int(round(w_in * scale)))
    new_h = max(1, int(round(h_in * scale)))
    resized = cv2.resize(rgb, (new_w, new_h), interpolation=cv2.INTER_LANCZOS4)

    canvas = np.empty((height, width, 3), dtype=np.uint8)
    canvas[:, :] = BG_RGB
    if top_bar_h >= 2:
        canvas[top_bar_h - 1, :] = (22, 36, 64)
    x0 = (width - new_w) // 2
    y0 = top_bar_h + max(0, (avail_h - new_h) // 2)
    canvas[y0 : y0 + new_h, x0 : x0 + new_w] = resized
    return canvas


def load_segment_frames_fitted(
    mp4_path: Path,
    target_num_frames: int,
    width: int = WIDTH,
    height: int = HEIGHT,
    src_in_frac: float = 0.0,
    src_out_frac: float = 1.0,
) -> list[np.ndarray]:
    """
    Decode real captured frames from mp4_path and resample smoothly to target_num_frames.

    - Only resizes the source frames actually sampled when down-sampling from long clips,
      keeping peak memory low and throughput high.
    - If source span is shorter than target (< 55%), smoothly ping-pongs with cosine ease.
    """
    if not mp4_path.exists():
        raise FileNotFoundError(f"Segment MP4 missing: {mp4_path}")

    cap = cv2.VideoCapture(str(mp4_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video segment: {mp4_path}")

    raw_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    src_fps = float(cap.get(cv2.CAP_PROP_FPS) or FPS)
    if src_fps <= 1.0 or src_fps > 120.0:
        src_fps = float(FPS)

    # First pass count / read fitted frames for the selected slice
    sliced_frames: list[np.ndarray] = []
    raw_idx = 0
    lo_guess = max(0, int(raw_total * src_in_frac)) if raw_total > 0 else 0
    hi_guess = max(lo_guess + 1, int(raw_total * src_out_frac)) if raw_total > 0 else 10**9

    while True:
        ok, bgr = cap.read()
        if not ok or bgr is None:
            break
        if raw_total <= 0 or (lo_guess <= raw_idx <= hi_guess):
            sliced_frames.append(fit_frame_to_canvas(bgr, width, height))
        raw_idx += 1
        if raw_total > 0 and raw_idx > hi_guess:
            break
    cap.release()

    if not sliced_frames:
        raise RuntimeError(f"No frames decoded from {mp4_path}")

    n_in = len(sliced_frames)
    if n_in == 1:
        return [sliced_frames[0]] * target_num_frames

    src_dur = n_in / src_fps
    tgt_dur = target_num_frames / float(FPS)
    use_ping_pong = src_dur < tgt_dur * 0.55

    out: list[np.ndarray] = []
    for k in range(target_num_frames):
        u = k / max(1, target_num_frames - 1)
        if use_ping_pong:
            cycles = max(1.0, round(tgt_dur / max(src_dur, 1.0)))
            phase = (u * cycles) % 2.0
            tri = phase if phase <= 1.0 else (2.0 - phase)
            tri_eased = 0.5 - 0.5 * math.cos(math.pi * tri)
            idx = int(round(tri_eased * (n_in - 1)))
        else:
            idx = int(round(u * (n_in - 1)))
        idx = max(0, min(n_in - 1, idx))
        out.append(sliced_frames[idx])
    return out


def peek_leading_frames(
    mp4_path: Path,
    count: int,
    width: int = WIDTH,
    height: int = HEIGHT,
    src_in_frac: float = 0.0,
) -> list[np.ndarray]:
    """Quickly decode only the first `count` fitted frames from src_in_frac for cross-dissolve."""
    cap = cv2.VideoCapture(str(mp4_path))
    if not cap.isOpened():
        raise RuntimeError(f"Failed to open video segment: {mp4_path}")
    raw_total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if raw_total > 0 and src_in_frac > 0.0:
        start_idx = max(0, min(raw_total - 1, int(raw_total * src_in_frac)))
        cap.set(cv2.CAP_PROP_POS_FRAMES, start_idx)
    frames: list[np.ndarray] = []
    while len(frames) < count:
        ok, bgr = cap.read()
        if not ok or bgr is None:
            break
        frames.append(fit_frame_to_canvas(bgr, width, height))
    cap.release()
    if not frames:
        raise RuntimeError(f"No frames decoded from {mp4_path}")
    while len(frames) < count:
        frames.append(frames[-1])
    return frames


# ---------------------------------------------------------------------------
# Voiceover Synthesis (Windows System.Speech -> Microsoft Zira Desktop)
# ---------------------------------------------------------------------------


def wsola_time_scale(audio: np.ndarray, rate: float) -> np.ndarray:
    """
    Pitch-preserving WSOLA time-scale modification for mono float32 audio.
    rate > 1.0 speeds up (shortens duration) without chipmunk pitch shift.
    """
    if abs(rate - 1.0) < 0.015 or len(audio) < 4096:
        return audio
    win_len = 1024
    syn_hop = 256
    ana_hop = int(round(syn_hop * rate))
    search_rad = 128

    window = np.hanning(win_len).astype(np.float32)
    out_len = int(math.ceil(len(audio) / rate)) + win_len
    out = np.zeros(out_len, dtype=np.float32)
    norm = np.zeros(out_len, dtype=np.float32)

    out[:win_len] += audio[:win_len] * window
    norm[:win_len] += window

    ana_pos = ana_hop
    syn_pos = syn_hop
    while ana_pos + win_len + search_rad < len(audio) and syn_pos + win_len < out_len:
        ref = out[syn_pos : syn_pos + syn_hop]
        best_offset = 0
        best_corr = -1e18
        lo = max(0, ana_pos - search_rad)
        hi = min(len(audio) - win_len, ana_pos + search_rad)
        for cand in range(lo, hi + 1, 8):
            seg = audio[cand : cand + syn_hop]
            corr = float(np.dot(ref, seg))
            if corr > best_corr:
                best_corr = corr
                best_offset = cand
        grain = audio[best_offset : best_offset + win_len] * window
        out[syn_pos : syn_pos + win_len] += grain
        norm[syn_pos : syn_pos + win_len] += window
        ana_pos = best_offset + ana_hop
        syn_pos += syn_hop

    valid = norm > 1e-4
    out[valid] /= norm[valid]
    return out[: int(round(len(audio) / rate))]


def _trim_silence(wav_mono: np.ndarray, sr: int = SAMPLE_RATE) -> np.ndarray:
    if len(wav_mono) == 0:
        return wav_mono
    abs_sig = np.abs(wav_mono)
    mask = abs_sig > 0.008
    if not np.any(mask):
        return wav_mono
    idx = np.flatnonzero(mask)
    pad = int(0.025 * sr)
    lo = max(0, int(idx[0]) - pad)
    hi = min(len(wav_mono), int(idx[-1]) + pad)
    trimmed = wav_mono[lo:hi].copy()
    fade = min(int(0.015 * sr), len(trimmed) // 4)
    if fade > 0:
        ramp = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, fade, dtype=np.float32))
        trimmed[:fade] *= ramp
        trimmed[-fade:] *= ramp[::-1]
    return trimmed


def _run_ps_tts_batch(items: list[dict], voice_name: str = "Microsoft Zira Desktop") -> None:
    """Invoke Windows PowerShell System.Speech once for a batch of cue specs."""
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        spec_path = tmp / "tts_batch.json"
        ps_path = tmp / "run_tts.ps1"
        spec_path.write_text(json.dumps(items, ensure_ascii=False), encoding="utf-8")
        ps_script = f"""
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$spec = Get-Content -LiteralPath '{spec_path}' -Raw -Encoding UTF8 | ConvertFrom-Json
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {{
    $synth.SelectVoice('{voice_name}')
}} catch {{
    Write-Warning "Preferred voice '{voice_name}' unavailable; using default English voice."
}}
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo({SAMPLE_RATE}, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
foreach ($item in $spec) {{
    $synth.Rate = [int]$item.rate
    $synth.SetOutputToWaveFile([string]$item.wav, $fmt)
    $synth.Speak([string]$item.text)
    $synth.SetOutputToNull()
}}
$synth.Dispose()
"""
        ps_path.write_text(ps_script, encoding="utf-8-sig")
        res = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(ps_path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if res.returncode != 0:
            raise RuntimeError(f"PowerShell TTS failed ({res.returncode}): {res.stderr}")


def _read_mono_wav_float32(path: Path) -> np.ndarray:
    sr, data = wavfile.read(str(path))
    if data.ndim > 1:
        data = data[:, 0]
    if data.dtype == np.int16:
        arr = data.astype(np.float32) / 32768.0
    else:
        arr = data.astype(np.float32)
    if sr != SAMPLE_RATE and len(arr) > 0:
        num = int(round(len(arr) * SAMPLE_RATE / float(sr)))
        arr = signal.resample(arr, num).astype(np.float32)
    return arr


def synthesize_voiceover_track(
    cues: list[SrtCue],
    total_sec: float,
    voice_name: str = "Microsoft Zira Desktop",
) -> tuple[np.ndarray, dict]:
    """
    Synthesize timed English narration for every cue onto a stereo 44.1 kHz timeline.
    Automatically adjusts TTS Rate (+1/+2/+3) and pitch-preserving WSOLA if any cue
    exceeds its slot, ensuring zero cue overlap.
    """
    total_samples = int(round(total_sec * SAMPLE_RATE))
    voice_mono = np.zeros(total_samples, dtype=np.float32)

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        pass1_items = [
            {
                "id": cue.index,
                "text": cue.en,
                "rate": 0,
                "wav": str(tmp / f"cue_{cue.index:03d}.wav"),
            }
            for cue in cues
        ]
        _run_ps_tts_batch(pass1_items, voice_name=voice_name)

        overflow_items: list[dict] = []
        cue_audio: dict[int, np.ndarray] = {}
        for cue in cues:
            wav_p = tmp / f"cue_{cue.index:03d}.wav"
            arr = _trim_silence(_read_mono_wav_float32(wav_p))
            max_dur = max(0.5, cue.duration_sec - 0.14)
            dur = len(arr) / float(SAMPLE_RATE)
            if dur > max_dur:
                ratio = dur / max_dur
                target_rate = 1 if ratio < 1.15 else (2 if ratio < 1.30 else 3)
                overflow_items.append(
                    {
                        "id": cue.index,
                        "text": cue.en,
                        "rate": target_rate,
                        "wav": str(wav_p),
                    }
                )
            else:
                cue_audio[cue.index] = arr

        if overflow_items:
            _run_ps_tts_batch(overflow_items, voice_name=voice_name)
            for item in overflow_items:
                arr = _trim_silence(_read_mono_wav_float32(Path(item["wav"])))
                cue_audio[item["id"]] = arr

        stretched_count = 0
        max_fill_ratio = 0.0

        for cue in cues:
            arr = cue_audio[cue.index]
            max_dur = max(0.4, cue.duration_sec - 0.10)
            max_len = int(round(max_dur * SAMPLE_RATE))
            if len(arr) > max_len:
                stretch_rate = len(arr) / float(max_len)
                arr = wsola_time_scale(arr, stretch_rate)
                stretched_count += 1
                if len(arr) > max_len:
                    arr = arr[:max_len]

            rms = float(np.sqrt(np.mean(arr * arr))) if len(arr) > 0 else 0.0
            if rms > 1e-4:
                arr = arr * (0.18 / rms)
            peak = float(np.max(np.abs(arr))) if len(arr) > 0 else 0.0
            if peak > 0.85:
                arr = arr * (0.85 / peak)

            start_idx = int(round((cue.start_sec + 0.05) * SAMPLE_RATE))
            end_idx = min(total_samples, start_idx + len(arr))
            copy_n = max(0, end_idx - start_idx)
            if copy_n > 0:
                voice_mono[start_idx:end_idx] += arr[:copy_n]
            max_fill_ratio = max(max_fill_ratio, copy_n / max(1.0, cue.duration_sec * SAMPLE_RATE))

    voice_stereo = np.stack([voice_mono, voice_mono], axis=1)
    stats = {
        "cues": len(cues),
        "rate_adjusted": len(overflow_items),
        "wsola_nudged": stretched_count,
        "max_slot_fill": round(max_fill_ratio, 3),
    }
    return voice_stereo, stats


# ---------------------------------------------------------------------------
# Original Copyright-Free Cosmic Ambient Soundtrack & Sidechain Ducking
# ---------------------------------------------------------------------------


def synthesize_cosmic_soundtrack(total_sec: float, sr: int = SAMPLE_RATE) -> np.ndarray:
    """
    Synthesize an original copyright-free stereo cosmic ambient score in D Dorian / Am9:
      - Lush detuned warm stereo pads across Dm9 -> Bbmaj7 -> Fmaj7 -> Cmaj9
      - Deep orbital sub-bass root swells
      - Crystalline D-Dorian fifths/ninths bell arpeggio with stereo ping-pong delay
      - Gentle low-frequency filtered solar-wind air texture
    """
    n_samples = int(round(total_sec * sr))
    t = np.arange(n_samples, dtype=np.float32) / float(sr)

    chords = [
        (73.42, [146.83, 220.00, 261.63, 329.63, 392.00]),  # Dm9
        (58.27, [116.54, 174.61, 220.00, 261.63, 293.66]),  # Bbmaj7
        (87.31, [174.61, 220.00, 261.63, 329.63, 392.00]),  # Fmaj7/9
        (65.41, [130.81, 196.00, 246.94, 293.66, 329.63]),  # Cmaj9/sus2
    ]
    chord_dur = 6.0
    fade_dur = 2.2

    pad_l = np.zeros(n_samples, dtype=np.float32)
    pad_r = np.zeros(n_samples, dtype=np.float32)
    sub = np.zeros(n_samples, dtype=np.float32)

    two_pi = np.float32(2.0 * math.pi)
    num_blocks = int(math.ceil(total_sec / chord_dur)) + 1

    for b in range(num_blocks):
        c_idx = b % len(chords)
        bass_hz, freqs = chords[c_idx]
        c_start = b * chord_dur - fade_dur * 0.5
        c_end = (b + 1) * chord_dur + fade_dur * 0.5
        i0 = max(0, int(round(c_start * sr)))
        i1 = min(n_samples, int(round(c_end * sr)))
        if i1 <= i0:
            continue

        tb = t[i0:i1]
        local_t = tb - c_start
        env = np.ones(len(tb), dtype=np.float32)
        f_samp = min(len(tb) // 2, int(round(fade_dur * sr)))
        if f_samp > 0:
            ramp = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, f_samp, dtype=np.float32))
            env[:f_samp] *= ramp
            env[-f_samp:] *= ramp[::-1]

        voice_l = np.zeros(len(tb), dtype=np.float32)
        voice_r = np.zeros(len(tb), dtype=np.float32)
        for j, f0 in enumerate(freqs):
            detune = 1.0 + 0.0022 * ((j % 3) - 1)
            pan = 0.35 + 0.30 * ((j % 4) / 3.0)
            p_l = two_pi * np.float32(f0 * detune) * tb
            p_r = two_pi * np.float32(f0 / detune) * tb
            sig_l = np.sin(p_l) + 0.25 * np.sin(2.0 * p_l) + 0.08 * np.sin(3.0 * p_l)
            sig_r = np.sin(p_r) + 0.25 * np.sin(2.0 * p_r) + 0.08 * np.sin(3.0 * p_r)
            voice_l += sig_l * np.float32(1.0 - pan * 0.45)
            voice_r += sig_r * np.float32(0.55 + pan * 0.45)

        pad_l[i0:i1] += (voice_l / len(freqs)) * env * 0.42
        pad_r[i0:i1] += (voice_r / len(freqs)) * env * 0.42

        sub_sig = np.sin(two_pi * np.float32(bass_hz) * tb) * (
            0.75 + 0.25 * np.sin(two_pi * np.float32(0.18) * local_t)
        )
        sub[i0:i1] += sub_sig * env * 0.28

    sos_pad = signal.butter(3, 760.0 / (0.5 * sr), btype="low", output="sos")
    pad_l = signal.sosfilt(sos_pad, pad_l).astype(np.float32)
    pad_r = signal.sosfilt(sos_pad, pad_r).astype(np.float32)

    arp_notes = [587.33, 880.00, 659.25, 1046.50, 783.99, 1174.66, 698.46, 880.00]
    arp_step_sec = 1.50
    arp_l = np.zeros(n_samples, dtype=np.float32)
    arp_r = np.zeros(n_samples, dtype=np.float32)
    note_dur = 2.6
    note_len = int(round(note_dur * sr))
    tn = np.arange(note_len, dtype=np.float32) / float(sr)
    bell_env = (1.0 - np.exp(-tn / 0.018)) * np.exp(-tn / 0.72)

    n_notes = int(math.floor(max(0.0, total_sec - 1.5) / arp_step_sec))
    for step in range(n_notes):
        t0 = 1.0 + step * arp_step_sec
        i0 = int(round(t0 * sr))
        i1 = min(n_samples, i0 + note_len)
        take = i1 - i0
        if take <= 0:
            continue
        f_note = arp_notes[step % len(arp_notes)]
        tone = (
            0.78 * np.sin(two_pi * np.float32(f_note) * tn[:take])
            + 0.22 * np.sin(two_pi * np.float32(f_note * 2.0) * tn[:take]) * np.exp(-tn[:take] / 0.25)
        ) * bell_env[:take]
        pan = 0.25 if (step % 2 == 0) else 0.75
        arp_l[i0:i1] += tone * np.float32((1.0 - pan) * 0.16)
        arp_r[i0:i1] += tone * np.float32(pan * 0.16)

    d1 = int(round(0.375 * sr))
    d2 = int(round(0.5625 * sr))
    arp_wet_l = arp_l.copy()
    arp_wet_r = arp_r.copy()
    if d1 < n_samples:
        arp_wet_r[d1:] += arp_l[:-d1] * 0.42
    if d2 < n_samples:
        arp_wet_l[d2:] += arp_r[:-d2] * 0.34

    rng = np.random.default_rng(20261114)
    noise = rng.standard_normal(n_samples).astype(np.float32)
    sos_air = signal.butter(2, [190.0 / (0.5 * sr), 680.0 / (0.5 * sr)], btype="band", output="sos")
    air = signal.sosfilt(sos_air, noise).astype(np.float32)
    air_mod = 0.028 * (0.65 + 0.35 * np.sin(two_pi * np.float32(0.05) * t))
    air_sig = air * air_mod

    mix_l = pad_l + sub + arp_wet_l + air_sig
    mix_r = pad_r + sub + arp_wet_r + air_sig
    music = np.stack([mix_l, mix_r], axis=1)

    peak = float(np.max(np.abs(music)))
    if peak > 1e-6:
        music = music * (0.84 / peak)

    fin = min(n_samples // 4, int(round(1.2 * sr)))
    fout = min(n_samples // 4, int(round(2.5 * sr)))
    if fin > 0:
        r_in = np.linspace(0.0, 1.0, fin, dtype=np.float32)[:, None]
        music[:fin] *= r_in
    if fout > 0:
        r_out = np.linspace(1.0, 0.0, fout, dtype=np.float32)[:, None]
        music[-fout:] *= r_out
    return music


def mix_voice_and_music(
    voice_stereo: np.ndarray,
    music_stereo: np.ndarray,
    sr: int = SAMPLE_RATE,
) -> np.ndarray:
    """
    Sidechain-duck cosmic ambient score (-16 dB under voice, -6 dB in pauses)
    and mix cleanly with voiceover without clipping.
    """
    n = min(len(voice_stereo), len(music_stereo))
    voice = voice_stereo[:n]
    music = music_stereo[:n]

    block = int(round(0.020 * sr))
    n_blocks = int(math.ceil(n / float(block)))
    padded_len = n_blocks * block
    v_mono = np.mean(np.abs(voice), axis=1)
    v_pad = np.pad(v_mono, (0, padded_len - n))
    v_block = v_pad.reshape(n_blocks, block).max(axis=1)
    active = (v_block > 0.004).astype(np.float32)

    env_b = np.zeros(n_blocks, dtype=np.float32)
    cur = 0.0
    for i in range(n_blocks):
        tgt = float(active[i])
        coeff = 0.14 if tgt > cur else 0.025
        cur = cur + coeff * (tgt - cur)
        env_b[i] = cur

    env_full = np.repeat(env_b, block)[:n]
    gain_speech = 10.0 ** (-16.0 / 20.0)
    gain_pause = 10.0 ** (-6.0 / 20.0)
    duck_gain = (gain_pause * (1.0 - env_full) + gain_speech * env_full)[:, None]

    mixed = voice + music * duck_gain
    peak = float(np.max(np.abs(mixed)))
    if peak > 0.94:
        mixed = np.tanh(mixed / peak * 1.15) * 0.93
    return mixed.astype(np.float32)


def write_stereo_wav(path: Path, stereo_float: np.ndarray, sr: int = SAMPLE_RATE) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    pcm = np.clip(stereo_float * 32767.0, -32767.0, 32767.0).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())


# ---------------------------------------------------------------------------
# Streaming MP4 Encoder (Low RAM, PyAV libx264 + AAC faststart, ffmpeg verify)
# ---------------------------------------------------------------------------


def ffmpeg_supports_libx264(ffmpeg_exe: Path) -> bool:
    if not ffmpeg_exe.exists():
        return False
    res = subprocess.run(
        [str(ffmpeg_exe), "-encoders"],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=False,
    )
    return "libx264" in (res.stdout + res.stderr)


def encode_mp4_stream(
    frames_iter: Iterable[np.ndarray],
    audio_wav: Path,
    audio_stereo: np.ndarray,
    output_mp4: Path,
    ffmpeg_exe: Path = DEFAULT_FFMPEG_EXE,
) -> tuple[str, int]:
    """
    Stream RGB frames one-by-one into libx264 CRF 20 (yuv420p, preset=medium, AAC 192k,
    movflags=+faststart) to keep RAM bounded (<2.5 GB) even across 7,200+ frames.
    """
    output_mp4.parent.mkdir(parents=True, exist_ok=True)
    frame_count = 0

    if ffmpeg_supports_libx264(ffmpeg_exe):
        cmd = [
            str(ffmpeg_exe),
            "-y",
            "-f",
            "rawvideo",
            "-vcodec",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-s",
            f"{WIDTH}x{HEIGHT}",
            "-r",
            str(FPS),
            "-i",
            "-",
            "-i",
            str(audio_wav),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-crf",
            "20",
            "-preset",
            "medium",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-movflags",
            "+faststart",
            "-shortest",
            str(output_mp4),
        ]
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
        assert proc.stdin is not None
        for rgb in frames_iter:
            proc.stdin.write(rgb.tobytes())
            frame_count += 1
        proc.stdin.close()
        _, err = proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"ffmpeg libx264 failed: {err.decode('utf-8', 'replace')}")
        return f"ffmpeg ({ffmpeg_exe.name}) libx264 crf=20 + aac 192k", frame_count

    container = av.open(str(output_mp4), mode="w", options={"movflags": "+faststart"})
    vstream = container.add_stream("libx264", rate=FPS)
    vstream.width = WIDTH
    vstream.height = HEIGHT
    vstream.pix_fmt = "yuv420p"
    vstream.options = {"crf": "20", "preset": "medium"}

    astream = container.add_stream("aac", rate=SAMPLE_RATE)
    astream.layout = "stereo"
    astream.bit_rate = 192_000

    for idx, rgb in enumerate(frames_iter):
        vf = av.VideoFrame.from_ndarray(rgb, format="rgb24")
        vf.pts = idx
        for pkt in vstream.encode(vf):
            container.mux(pkt)
        frame_count += 1
    for pkt in vstream.encode():
        container.mux(pkt)

    pcm_s16 = np.clip(audio_stereo * 32767.0, -32767.0, 32767.0).astype(np.int16)
    chunk = 1024
    pts_a = 0
    for pos in range(0, len(pcm_s16), chunk):
        sl = pcm_s16[pos : pos + chunk]
        if len(sl) < chunk:
            sl = np.pad(sl, ((0, chunk - len(sl)), (0, 0)))
        interleaved = np.ascontiguousarray(sl.reshape(1, -1))
        af = av.AudioFrame.from_ndarray(interleaved, format="s16", layout="stereo")
        af.sample_rate = SAMPLE_RATE
        af.pts = pts_a
        pts_a += len(sl)
        for pkt in astream.encode(af):
            container.mux(pkt)
    for pkt in astream.encode():
        container.mux(pkt)
    container.close()

    if ffmpeg_exe.exists():
        chk = subprocess.run(
            [str(ffmpeg_exe), "-v", "error", "-i", str(output_mp4), "-f", "null", "-"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=False,
        )
        if chk.returncode != 0:
            raise RuntimeError(f"ffmpeg validation failed on {output_mp4}: {chk.stderr}")

    return (
        "PyAV libx264 crf=20 preset=medium yuv420p + aac 192k + faststart (verified via ffmpeg)",
        frame_count,
    )


# ---------------------------------------------------------------------------
# Timeline Assembly (Streaming 5-Minute & 30-Second Builds)
# ---------------------------------------------------------------------------


def _cue_at_time(cues: list[SrtCue], t_sec: float) -> SrtCue | None:
    for cue in cues:
        if cue.start_sec <= t_sec < cue.end_sec:
            return cue
    return None


def _iter_5min_frames(
    segments_dir: Path,
    cues: list[SrtCue],
    compositor: OverlayCompositor,
) -> Iterable[np.ndarray]:
    """
    Yield exact 7,200 composited RGB frames (300.0s @ 24 fps) one chapter at a time,
    keeping only 1 chapter + 5 boundary post-roll frames in RAM.
    """
    dissolve_half = int(round((CROSS_DISSOLVE_SEC * 0.5) * FPS))  # 5 frames
    prev_postroll: list[np.ndarray] = []
    global_f = 0

    for idx, ch in enumerate(CHAPTERS):
        has_prev = idx > 0
        has_next = idx < len(CHAPTERS) - 1
        ch_core_n = int(round(ch.duration_sec * FPS))
        lead_n = dissolve_half if has_prev else 0
        tail_n = dissolve_half if has_next else 0

        frames = load_segment_frames_fitted(
            segments_dir / ch.filename,
            target_num_frames=lead_n + ch_core_n + tail_n,
            src_in_frac=ch.src_in_frac,
            src_out_frac=ch.src_out_frac,
        )
        next_preroll = (
            peek_leading_frames(
                segments_dir / CHAPTERS[idx + 1].filename,
                dissolve_half,
                src_in_frac=CHAPTERS[idx + 1].src_in_frac,
            )
            if has_next
            else []
        )

        for local_f in range(ch_core_n):
            t_sec = global_f / float(FPS)
            base_rgb = frames[lead_n + local_f]

            if has_prev and local_f < dissolve_half and len(prev_postroll) == dissolve_half:
                u = (local_f + dissolve_half + 0.5) / float(dissolve_half * 2)
                alpha = u * u * (3.0 - 2.0 * u)
                prev_rgb = prev_postroll[local_f]
                base_rgb = np.clip(
                    prev_rgb.astype(np.float32) * (1.0 - alpha) + base_rgb.astype(np.float32) * alpha,
                    0,
                    255,
                ).astype(np.uint8)
            elif has_next and local_f >= ch_core_n - dissolve_half and len(next_preroll) == dissolve_half:
                rem = local_f - (ch_core_n - dissolve_half)
                u = (rem + 0.5) / float(dissolve_half * 2)
                alpha = u * u * (3.0 - 2.0 * u)
                next_rgb = next_preroll[rem]
                base_rgb = np.clip(
                    base_rgb.astype(np.float32) * (1.0 - alpha) + next_rgb.astype(np.float32) * alpha,
                    0,
                    255,
                ).astype(np.uint8)

            title_overlay = None
            if t_sec < 1.8:
                op = 1.0 if t_sec < 1.4 else (1.8 - t_sec) / 0.4
                title_overlay = ("LUNAR LANDING SITE NAVIGATOR", compositor.team_credit, op)
            elif t_sec >= 297.2:
                op = 1.0 if t_sec >= 297.8 else (t_sec - 297.2) / 0.6
                title_overlay = (
                    "LUNAR LANDING SITE NAVIGATOR · APACHE-2.0",
                    f"{compositor.team_credit}\n{TEAM_MEMBERS_LINE}",
                    op,
                )

            cue = _cue_at_time(cues, t_sec)
            yield compositor.render_frame(
                base_rgb,
                badge_text=ch.badge,
                cue=cue,
                title_overlay=title_overlay,
            )
            global_f += 1

        prev_postroll = frames[-tail_n:] if has_next else []
        del frames
        gc.collect()


def build_5min_video(
    segments_dir: Path,
    srt_path: Path,
    output_mp4: Path,
    ffmpeg_exe: Path = DEFAULT_FFMPEG_EXE,
    team_credit: str = "Team VeriFour · NASA Space Apps Challenge 2026 (Hanoi)",
    badge_xy: tuple[int, int] = (10, 3),
    skip_tts: bool = False,
) -> dict:
    """Compose the full 300s bilingual 5-minute demo video from seg01..seg10.mp4."""
    cues = parse_srt(srt_path)
    srt_stats = validate_srt_and_fonts(cues, expected_total_sec=300.0)
    missing = [ch.filename for ch in CHAPTERS if not (segments_dir / ch.filename).exists()]
    if missing:
        raise FileNotFoundError(
            f"Missing captured segment files in {segments_dir}: {', '.join(missing)}"
        )

    if skip_tts:
        voice_stereo = np.zeros((int(round(300.0 * SAMPLE_RATE)), 2), dtype=np.float32)
        tts_stats: dict = {"skipped": True}
    else:
        voice_stereo, tts_stats = synthesize_voiceover_track(cues, total_sec=300.0)
    music_stereo = synthesize_cosmic_soundtrack(total_sec=300.0)
    mixed_stereo = mix_voice_and_music(voice_stereo, music_stereo)

    compositor = OverlayCompositor(width=WIDTH, height=HEIGHT, badge_xy=badge_xy, team_credit=team_credit)
    with tempfile.TemporaryDirectory(prefix="lunar_mix_5m_") as tmp_dir:
        wav_path = Path(tmp_dir) / (output_mp4.stem + ".mix.wav")
        write_stereo_wav(wav_path, mixed_stereo)
        encoder_info, frame_count = encode_mp4_stream(
            _iter_5min_frames(segments_dir, cues, compositor),
            wav_path,
            mixed_stereo,
            output_mp4,
            ffmpeg_exe=ffmpeg_exe,
        )

    return {
        "output": str(output_mp4),
        "duration_sec": 300.0,
        "frames": frame_count,
        "srt": srt_stats,
        "tts": tts_stats,
        "encoder": encoder_info,
    }


def build_30s_pitch_video(
    segments_dir: Path,
    output_mp4: Path,
    ffmpeg_exe: Path = DEFAULT_FFMPEG_EXE,
    presenter: str | None = None,
    team_credit: str = "Team VeriFour · NASA Space Apps Challenge 2026",
    badge_xy: tuple[int, int] = (10, 3),
    skip_tts: bool = False,
) -> dict:
    """Compose the strictly <=30s (28.0s) NASA portal pitch highlight cut."""
    total_sec = 28.0
    cues = build_30s_cues(presenter=presenter)
    missing = [sl.filename for sl in PITCH_30S_CLIPS if not (segments_dir / sl.filename).exists()]
    if missing:
        raise FileNotFoundError(
            f"Missing captured segment files in {segments_dir}: {', '.join(set(missing))}"
        )

    compositor = OverlayCompositor(width=WIDTH, height=HEIGHT, badge_xy=badge_xy, team_credit=team_credit)

    def _iter_30s() -> Iterable[np.ndarray]:
        prev_last: np.ndarray | None = None
        diss_n = 6
        f_idx = 0
        for sl_idx, sl in enumerate(PITCH_30S_CLIPS):
            n_f = int(round((sl.end_sec - sl.start_sec) * FPS))
            frames = load_segment_frames_fitted(
                segments_dir / sl.filename,
                target_num_frames=n_f,
                src_in_frac=sl.src_in_frac,
                src_out_frac=sl.src_out_frac,
            )
            for local_f, base_rgb in enumerate(frames):
                t_sec = f_idx / float(FPS)
                if sl_idx > 0 and prev_last is not None and local_f < diss_n:
                    u = (local_f + 0.5) / float(diss_n)
                    alpha = u * u * (3.0 - 2.0 * u)
                    base_rgb = np.clip(
                        prev_last.astype(np.float32) * (1.0 - alpha)
                        + base_rgb.astype(np.float32) * alpha,
                        0,
                        255,
                    ).astype(np.uint8)

                title_overlay = None
                if t_sec < 1.5:
                    op = 1.0 if t_sec < 1.1 else (1.5 - t_sec) / 0.4
                    title_overlay = ("LUNAR LANDING SITE NAVIGATOR", team_credit, op)
                elif t_sec >= 25.6:
                    op = 1.0 if t_sec >= 26.2 else (t_sec - 25.6) / 0.6
                    title_overlay = (
                        "TEAM VERIFOUR · APACHE-2.0",
                        f"lunar.agentlens.dpdns.org\n{TEAM_MEMBERS_LINE}",
                        op,
                    )

                cue = _cue_at_time(cues, t_sec)
                yield compositor.render_frame(
                    base_rgb, badge_text=sl.badge, cue=cue, title_overlay=title_overlay
                )
                f_idx += 1
            prev_last = frames[-1]
            del frames

    if skip_tts:
        voice_stereo = np.zeros((int(round(total_sec * SAMPLE_RATE)), 2), dtype=np.float32)
        tts_stats: dict = {"skipped": True}
    else:
        voice_stereo, tts_stats = synthesize_voiceover_track(cues, total_sec=total_sec)
    music_stereo = synthesize_cosmic_soundtrack(total_sec=total_sec)
    mixed_stereo = mix_voice_and_music(voice_stereo, music_stereo)

    with tempfile.TemporaryDirectory(prefix="lunar_mix_30s_") as tmp_dir:
        wav_path = Path(tmp_dir) / (output_mp4.stem + ".mix.wav")
        write_stereo_wav(wav_path, mixed_stereo)
        encoder_info, frame_count = encode_mp4_stream(
            _iter_30s(), wav_path, mixed_stereo, output_mp4, ffmpeg_exe=ffmpeg_exe
        )

    return {
        "output": str(output_mp4),
        "duration_sec": total_sec,
        "frames": frame_count,
        "tts": tts_stats,
        "encoder": encoder_info,
    }


# ---------------------------------------------------------------------------
# Dry-Test Validation (Runs Without seg01..seg10.mp4)
# ---------------------------------------------------------------------------


def _make_synthetic_cosmic_frame(t_sec: float) -> np.ndarray:
    """Create a realistic synthetic dark-cosmic test frame for --dry-test only."""
    img = np.zeros((HEIGHT, WIDTH, 3), dtype=np.uint8)
    y_norm = np.linspace(0.0, 1.0, HEIGHT, dtype=np.float32)[:, None, None]
    bg_top = np.array([6.0, 11.0, 26.0], dtype=np.float32)
    bg_bot = np.array([28.0, 36.0, 52.0], dtype=np.float32)
    grad = bg_top * (1.0 - y_norm) + bg_bot * y_norm
    img[:, :, :] = np.clip(grad, 0, 255).astype(np.uint8)

    # Top bar line at y = TOP_BAR_HEIGHT - 1
    img[TOP_BAR_HEIGHT - 1, :] = (22, 36, 64)
    cv2.rectangle(img, (10, TOP_BAR_HEIGHT + 6), (1270, TOP_BAR_HEIGHT + 92), (10, 18, 36), -1)
    cv2.line(img, (0, TOP_BAR_HEIGHT + 92), (WIDTH, TOP_BAR_HEIGHT + 92), (38, 72, 118), 1)
    cv2.circle(img, (int(960 + 40 * math.sin(t_sec)), 260), 28, (255, 224, 150), -1)
    cv2.circle(img, (1080, 210), 16, (90, 165, 245), -1)
    pts = np.array(
        [[x, int(430 - 65 * math.sin(x / 180.0 + t_sec * 0.25) - 18 * math.cos(x / 55.0))]
         for x in range(0, WIDTH + 20, 20)],
        dtype=np.int32,
    )
    pts = np.vstack([pts, [[WIDTH, HEIGHT], [0, HEIGHT]]])
    cv2.fillPoly(img, [pts], (42, 52, 70))
    return img


def run_dry_test(
    srt_path: Path,
    preview_dir: Path,
    ffmpeg_exe: Path = DEFAULT_FFMPEG_EXE,
    badge_xy: tuple[int, int] = (10, 3),
) -> dict:
    """
    Validate SRT integrity, Windows UTF-8 fonts & Vietnamese diacritics, Pillow rendering
    on a 1280x720 sample frame (and real seg01/seg03 if present), TTS synthesis, music, and MP4 muxing.
    """
    preview_dir.mkdir(parents=True, exist_ok=True)
    cues = parse_srt(srt_path)
    srt_stats = validate_srt_and_fonts(cues, expected_total_sec=300.0)

    compositor = OverlayCompositor(width=WIDTH, height=HEIGHT, badge_xy=badge_xy)
    sample_cue = cues[1]
    sample_cue_2 = cues[69]
    frame1 = compositor.render_frame(
        _make_synthetic_cosmic_frame(0.5),
        badge_text=CHAPTERS[0].badge,
        cue=sample_cue,
        title_overlay=("LUNAR LANDING SITE NAVIGATOR", compositor.team_credit, 1.0),
    )
    frame2 = compositor.render_frame(
        _make_synthetic_cosmic_frame(2.0),
        badge_text=CHAPTERS[9].badge,
        cue=sample_cue_2,
        title_overlay=None,
    )
    png1 = preview_dir / "dry_test_opener_1280x720.png"
    png2 = preview_dir / "dry_test_vi_diacritics_1280x720.png"
    Image.fromarray(frame1).save(png1)
    Image.fromarray(frame2).save(png2)

    test_cue = SrtCue(1, 0.2, 4.6, cues[0].en, cues[0].vi)
    voice_stereo, tts_stats = synthesize_voiceover_track([test_cue], total_sec=5.0)
    music_stereo = synthesize_cosmic_soundtrack(total_sec=5.0)
    mixed = mix_voice_and_music(voice_stereo, music_stereo)

    test_wav = preview_dir / "dry_test_mix.wav"
    test_mp4 = preview_dir / "dry_test_clip.mp4"
    write_stereo_wav(test_wav, mixed)

    test_frames = (
        compositor.render_frame(
            _make_synthetic_cosmic_frame(i / float(FPS)),
            badge_text=CHAPTERS[0].badge,
            cue=test_cue if 0.2 <= (i / float(FPS)) < 4.6 else None,
            title_overlay=("LUNAR LANDING SITE NAVIGATOR", compositor.team_credit, 1.0)
            if (i / float(FPS)) < 1.5
            else None,
        )
        for i in range(5 * FPS)
    )
    encoder_info, f_cnt = encode_mp4_stream(test_frames, test_wav, mixed, test_mp4, ffmpeg_exe=ffmpeg_exe)

    return {
        "status": "DRY_TEST_OK",
        "srt_validation": srt_stats,
        "preview_pngs": [str(png1), str(png2)],
        "test_wav": str(test_wav),
        "test_mp4": str(test_mp4),
        "test_frames": f_cnt,
        "tts": tts_stats,
        "encoder": encoder_info,
    }


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Compose bilingual 5-minute (and optional 30s) Lunar Landing Site Navigator demo video."
    )
    parser.add_argument("--segments-dir", type=Path, default=DEFAULT_SEGMENTS_DIR)
    parser.add_argument("--srt", type=Path, default=DEFAULT_SRT_PATH)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT_5MIN)
    parser.add_argument("--out-30s", type=Path, default=DEFAULT_OUT_30S)
    parser.add_argument("--ffmpeg", type=Path, default=DEFAULT_FFMPEG_EXE)
    parser.add_argument(
        "--dry-test",
        action="store_true",
        help="Validate fonts, SRT, TTS, music & MP4 muxing without seg01..10",
    )
    parser.add_argument("--preview-dir", type=Path, default=DEFAULT_DRY_OUT_DIR)
    parser.add_argument("--make-30s", action="store_true", help="Also generate <=30s NASA pitch MP4")
    parser.add_argument("--only-30s", action="store_true", help="Only generate <=30s NASA pitch MP4")
    parser.add_argument("--presenter", type=str, default=None, help="Optional speaker name for 30s intro")
    parser.add_argument(
        "--team-credit",
        type=str,
        default="Team VeriFour · NASA Space Apps Challenge 2026 (Hanoi)",
        help="Credit line for 1.5s opener/outro badge",
    )
    parser.add_argument("--badge-xy", type=str, default="10,3", help="Top-left badge x,y pixels")
    parser.add_argument("--skip-tts", action="store_true", help="Mute TTS (music only)")

    args = parser.parse_args()
    bx, by = (int(v.strip()) for v in args.badge_xy.split(",", 1))
    badge_xy = (bx, by)

    if args.dry_test:
        report = run_dry_test(
            srt_path=args.srt,
            preview_dir=args.preview_dir,
            ffmpeg_exe=args.ffmpeg,
            badge_xy=badge_xy,
        )
        print(json.dumps(report, indent=2, ensure_ascii=False))
        return 0

    results: dict[str, dict] = {}
    if not args.only_30s:
        results["demo_5min"] = build_5min_video(
            segments_dir=args.segments_dir,
            srt_path=args.srt,
            output_mp4=args.out,
            ffmpeg_exe=args.ffmpeg,
            team_credit=args.team_credit,
            badge_xy=badge_xy,
            skip_tts=args.skip_tts,
        )
    if args.make_30s or args.only_30s:
        results["pitch_30s"] = build_30s_pitch_video(
            segments_dir=args.segments_dir,
            output_mp4=args.out_30s,
            ffmpeg_exe=args.ffmpeg,
            presenter=args.presenter,
            team_credit=args.team_credit,
            badge_xy=badge_xy,
            skip_tts=args.skip_tts,
        )

    print(json.dumps(results, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

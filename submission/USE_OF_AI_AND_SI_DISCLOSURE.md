# Use of Artificial Intelligence (AI) & Super Intelligence (SI) Disclosure

- **Team Name:** VeriFour (`https://www.spaceappschallenge.org/2026/find-a-team/verifour/?tab=project`)
- **Local Event:** NASA Space Apps Challenge 2026 — Hanoi, Vietnam (`https://www.spaceappschallenge.org/2026/local-events/hanoi/`)
- **Challenge:** Lunar Landing Site Navigator (`https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/`)
- **Project Name:** Lunar Landing Site Navigator
- **Open-Source License:** Apache License 2.0 (`LICENSE`)
- **Document Purpose:** Exhaustive, transparent disclosure of all AI / Super Intelligence (SI) tools, models, sessions, and human verification steps used during pre-event preparation (`2026-11-13`) and the official hackathon build (`2026-11-14`), prepared for Google Drive attachment and judge inspection in compliance with NASA Space Apps Challenge 2026 rules (`https://sepa.org.vn/huong-dan-nop-bai-nasa-space-apps-ha-noi-2026.htm`).

---

## 1. Executive Summary & NASA SI Policy Compliance Attestation

1. **Where AI / SI Was Used:** AI coding and research assistants (**Google Antigravity IDE multi-agent swarm**, **Google Gemini**, and **Anthropic Claude Code**) were used under direct human supervision by **Team VeriFour** to accelerate literature synthesis, numerical validation scripting, TypeScript/React/Three.js/Python code generation, automated unit/integration test authoring, live browser DOM/layout inspection via Chrome DevTools MCP, and English technical documentation.
2. **Zero AI-Generated Visual Media or Synthetic Scientific Data:**
   - **0 AI-generated images, videos, voiceovers, imported 3D meshes, or synthetic terrain textures** are used anywhere in the web application, data pipeline, or 7-slide presentation deck (all 3D rover primitives, micro-regolith bump noise, and Sun/Earth shaders are generated deterministically via Three.js geometry and HTML5 Canvas gradients).
   - All elevation grids, slope maps, 360° horizon profiles, solar illumination fractions, Earth direct-to-Earth (DTE) visibility series, and eclipse obscuration curves are computed deterministically from official **NASA LRO LOLA (`LDEM_75S_240M`)** and **NASA JPL Horizons (`DE441` / `MOON_ME`)** datasets using explicit spherical trigonometry and ray-marching algorithms.
3. **Clean Official Hackathon Build Rule (After `09:00 GMT+7`, Saturday, November 14, 2026):**
   - Exploratory Data Analysis (EDA), physics benchmarking, and specification drafting conducted on November 13, 2026 were kept strictly in a separate read-only reference workspace (`NasaHackathon`).
   - The official submission repository (`NASA-Space-Apps-Challenge-2026`) was initialized empty and built from scratch starting after the official Hanoi event opening (`09:00 GMT+7` on `2026-11-14`).
4. **In-Code & Metadata Attribution:**
   - `webapp/package.json`: `"license": "Apache-2.0"` and `"aiDisclosure"` metadata field.
   - `webapp/index.html`: `<meta name="license" content="Apache-2.0" />` and `<meta name="ai-disclosure" content="..." />`.
   - `webapp/src/components/AboutModal.tsx`: Section 6 (*License & AI / SI Disclosure*) visible directly inside the application UI.
   - `README.md`: Dedicated *Use of AI tools* and *License* sections linking to this disclosure.

---

## 2. Chronological Log of AI / SI Sessions & Contributions

### Phase A — Pre-Event Exploratory Data Analysis, Physics Benchmarking & Work-Package Specification (`2026-11-13` to `2026-11-14 00:31 GMT+7`, Reference Workspace `NasaHackathon`)

All pre-event sessions are preserved with sanitized full transcripts in `NasaHackathon/chat_logs/`:

| Session ID / Log File | Tool & Model Family | Time Window (GMT+7) | Volume | Specific Tasks & Technical Outputs |
| --- | --- | --- | --- | --- |
| `273875b0` (`01_antigravity_gemini_log.md`) | **Google Antigravity IDE (Gemini)** | `2026-11-13 13:08` – `2026-11-14 00:31` | 44 user prompts, 50 assistant responses | Analyzed the *Lunar Landing Site Navigator* challenge statement; reviewed lunar axial tilt (`1.54°`), topographical shadowing, and 18.6-year nodal precession physics; created exploratory notebooks/scripts (`GeminiEDA/`); audited NASA Space Apps Hanoi submission rules (`sepa.org.vn`) and Team `VeriFour` registration status; analyzed multi-objective optimization (MOO) trade-offs and mathematical bounds (`both_visible_pct <= min(sun_time_pct, earth_visible_pct)`). |
| `d9a0bb2c` (`02_claude_lunar_landing_site_navigator_hackathon.md`) | **Anthropic Claude Code (Claude)** | `2026-11-13 13:15` – `2026-11-13 15:34` | 9 user prompts, 48 response blocks | Verified topocentric Sun and Earth azimuth/elevation derived from JPL Horizons `MOON_ME` sub-solar and sub-Earth points against direct JPL Horizons topocentric queries (`<= 0.006°` error); prototyped the 240 m/px LRO LOLA 360° horizon ray-marching benchmark (`ClaudeEDA/`); evaluated official challenge resource links; drafted the initial 2-day engineering plan (`PLAN_HACKATHON_2_NGAY.md`). |
| `6a760884` (`03_claude_dang_trang_ke_hoach_eda.md`, branched from `d9a0bb2c`) | **Anthropic Claude Code (Claude)** | `2026-11-13 14:04` – `2026-11-13 14:13` | 1 user prompt, 7 response blocks | Formatted an internal Vietnamese task-breakdown web reference artifact (`claude.ai/artifact/RhjRUm9sQ8c6rfisC1jqz2`) for team alignment. |
| `3dc49d78` + notes `4e2c8157`, `ee98787c` (`04_claude_mvp_san_pham_phan_bien.md` & `05_claude_project_memory.md`) | **Anthropic Claude Code (Claude)** | `2026-11-13 16:06` – `2026-11-13 23:47` | 10 user prompts, 30 response blocks | Conducted a critical scientific and UX review of early prototype limitations; authored the 44-item engineering fixlist (`FIXLIST_VA_KE_HOACH_CAI_TIEN.md`) and modular work-package specifications (`giao-viec/README.md`, `WP0` through `WP7`); documented human-approved design decisions `Q2–Q11` and candidate search rules `R1–R7`; benchmarked 240 m/px pixel-sampling strategies across South Pole craters and ridges. |

---

### Phase B — Official Hackathon Build, Verification & Submission Packaging (`2026-11-14` from `09:00 GMT+7` onward, Official Repository `NASA-Space-Apps-Challenge-2026`)

During the official hackathon window on Saturday, November 14, 2026, **Team VeriFour** used **Google Antigravity IDE's native multi-agent swarm** to build, test, and verify the clean repository `NASA-Space-Apps-Challenge-2026` from scratch against the `WP0–WP7` specifications:

- **AI Models Used in the Official Build Swarm:**
  - **Google Gemini 4 Hydrogen (`gemini-4-hydrogen-xhigh`)** — primary reasoning, architecture orchestration, and core math/pipeline code generation.
  - **Google Gemini 4 Argon (`gemini-4-argon-high` / `gemini-4-argon-medium`)** — high-throughput verification, stall monitoring, repository scaffolding, and initial submission packaging.
  - **Google Gemini Flash Worker (`gemini-flash-worker-agy`)** — rapid implementation of the GPU-accelerated Three.js 3D lunar rover simulator (`Lunar3DViewport.tsx`, `roverPhysics.ts`, `wp8.rover3d.test.ts`), NASA Eyes / Moon Trek cosmic UI overhaul (`App.tsx`, `index.css`), and updated documentation/pitch materials.
  - **Anthropic Claude Opus 5.5 (`claude-opus-5.5-high`)** — brief intermediate model rotation during quota balancing.
  - **Chrome DevTools MCP** — connected to the local Chrome browser (`http://127.0.0.1:5175`) for automated DOM accessibility auditing, `1440x900` desktop and `375x812` mobile layout inspection, and interactive Mode A/Mode B verification.

| Swarm Agent Role | Owned Files in `NASA-Space-Apps-Challenge-2026` | AI-Assisted Engineering Deliverable |
| --- | --- | --- |
| `coordinator` | Swarm board & Chrome DevTools MCP verification | Orchestrated dependency handoffs (`WP0 -> WP1/WP2 -> WP3/WP4/WP5/WP7 -> WP6 -> WP8 3D/Cosmic`), ran live Chrome visual/interactive QA, identified and verified UI/state edge-case fixes. |
| `foundation` | `.gitignore`, `.gitattributes`, `LICENSE`, `README.md`, `.github/workflows/ci.yml`, `requirements-*.txt`, `webapp/package.json`, `tsconfig*.json`, `vite.config.ts`, `index.html`, `src/types/lunar.ts`, `src/lib/runtimeTypes.ts`, `tests/azel.horizons.test.ts`, `tests/fixtures/*`, `submission/*` | Scaffolded the clean repository and CI pipeline, authored Data Contract v2 (`runtimeTypes.ts`, `lunar.ts`), built sampled JPL Horizons verification fixtures (794 rows × 6 sites), and authored the Apache-2.0 license and initial `submission/` package. |
| `researcher` | Provenance & benchmark dataset verification (reported on swarm board for `pipeline` & `ui-app`) | Audited all 31 lunar site coordinates, mission statuses, and primary source URLs (NASA Artemis III 2024 9 candidate regions, GSFC PGDA 5 mpp products, LROC NAC lander coordinates, USGS Gazetteer); compiled published illumination benchmarks from Mazarico et al. (2011), De Rosa et al. (2012), Gläser et al. (2014, 2018), Barker et al. (2021, 2023), and NASA PDS LOLA `AVGVISIB` rasters. |
| `pipeline` | `scripts/lunar_geometry.py`, `scripts/fetch_lola_dem.py`, `scripts/fetch_horizons.py`, `scripts/build_unified_data.py`, `scripts/grid_candidates.py`, `tests/test_pipeline_invariants.py`, `webapp/public/data/*` | Implemented the deterministic Python offline pipeline generating all 9 `schema_version: 2.0.0` runtime files (`36,216` hourly ephemeris steps, `9` eclipses, `31` sites across `5` mast heights, `9` Artemis III 2024 polygons, `1250×1250` fine 240 m & `762×762` coarse 1,200 m binary DEMs, `250×250` polar maps, and `site_candidates.json` with `140` refined 5×5 blocks) plus 10 Python invariant tests. |
| `core-math` | `webapp/src/lib/lunarMath.ts`, `webapp/src/lib/scoring.ts`, `webapp/src/lib/candidates.ts`, `webapp/src/lib/scanAroundWorker.ts`, `webapp/tests/wp2.core.test.ts`, `webapp/tests/wp7.candidates.test.ts` | Implemented client-side ENU solar/Earth Az/El math, two-circle geometric eclipse obscuration, relative solar array power modeling, contiguous operational window extraction, unified fine+coarse 360° horizon ray-marching for custom pins, Q2 composite viability scoring, WP7 Mode A/B candidate ranking + Web Worker, and 21 unit/integration tests. |
| `ui-map` | `webapp/src/components/PolarMapCanvas.tsx`, `webapp/src/components/map/polarMapMath.ts`, `webapp/src/components/map/polarMapRender.ts`, `webapp/tests/wp3.map.test.ts` | Built the interactive 2D South Pole stereographic canvas (`±150 km`), collision-aware cardinal/site/candidate pill labeling, 9 Artemis III 2024 region boundary overlays, Global Moon view, and 13 map unit tests. |
| `ui-sky-timeline` | `webapp/src/components/HorizonSkyView.tsx`, `webapp/src/components/MissionTimeline.tsx`, `webapp/src/components/timeline/*`, `webapp/tests/wp4.sky.test.ts` | Built the 360° Horizon Panorama and Polar Sky Dome (with solar/Earth paths, mast comparison ghost horizon, and eclipse indicator) and the 2026–2030 Mission Timeline (with solstice/equinox markers, window scrubber, and operational intervals) plus 8 unit tests. |
| `ui-app` | `webapp/src/App.tsx`, `webapp/src/components/appHelpers.ts`, `CandidateFinderPanel.tsx`, `SiteComparisonTable.tsx`, `ScenarioComparePanel.tsx`, `AboutModal.tsx`, `LearnModal.tsx`, `AccessibleDialog.tsx`, `GlossaryTerm.tsx`, `webapp/tests/wp5.app.test.ts` | Built the initial responsive application workspace, URL deep-linking, Mode A/Mode B Candidate Finder UI, multi-site comparison table, scenario comparison & JSON/CSV export brief, accessible modals with literature cross-check tables, and 7 app integration tests. |
| `3d-sim` | `webapp/src/lib/roverPhysics.ts`, `webapp/src/components/Lunar3DViewport.tsx`, `webapp/tests/wp8.rover3d.test.ts` | Built the pure terrain-normal rover physics engine (`sampleTerrainHeightAndNormal`, `stepRoverPhysics`, `computeRoverLiveTelemetry`, `getCachedRoverHorizon360`), GPU-accelerated Three.js 3D South Pole viewport (`250×250` LOLA mesh, 5 surface overlay layers, directional JPL Sun shadows, 4,000 stars, 3D Sun corona + Earth globe + DTE beam, articulated 6-wheel rover with `1×/10×/50×` gears, `WASD`/virtual/waypoint autopilot, 4 camera modes), and 7 WP8 unit/integration tests. |
| `ui-cosmic` | `webapp/src/index.css`, `webapp/src/App.tsx`, styling updates to `PolarMapCanvas.tsx`, `HorizonSkyView.tsx`, `MissionTimeline.tsx` | Transformed the UI into a NASA Eyes / Moon Trek cosmic experience: animated starfield/glassmorphism theme (`.cosmic-bg`, `.nasa-panel`), 5 workspace tabs (`3D Rover & Surface`, `Command Split`, `2D Map & Sky`, `Compare A vs B`, `Candidate Directory`), `4` SVG `CircularRingGauge` readouts, collapsible `Science & Methodology Notes`, and 3-tab Bottom Mission Dock including `RoverTraverseProfile`. |
| `docs-pitch` | `README.md`, `submission/NASA_SUBMISSION_FORM.md`, `submission/PITCH_DECK_7_SLIDES.html`, `submission/USE_OF_AI_AND_SI_DISCLOSURE.md` | Updated README, NASA portal submission package, 7-slide 16:9 HTML/PDF pitch deck, and this AI/SI disclosure to document the Three.js 3D rover simulator, cosmic UI overhaul, and final verified test counts (`10` Python + `62` active Vitest tests). |
| `verifier` & `monitor` | Verification test runs & copy hygiene audits | Executed independent verification passes (`unittest`, `pytest`, `tsc`, `vitest`, `vite build`, `vite preview` HTTP checks, and zero-overclaim copy audits). |

---

## 3. Human Ownership, Scientific Direction & Verification (`Team VeriFour`)

Every physical assumption, mathematical formula, dataset selection, and user-facing claim was directed and verified by **Team VeriFour**:

1. **Physical & Architectural Decisions (`Q2–Q11`, `R1–R7`):**
   - Defined the **Composite Viability Score** (`0.35 × Mean Solar Disk % + 0.25 × Earth DTE % + 0.15 × Joint Sun+Earth % + 0.15 × Dark Resilience + 0.10 × 240 m Baseline Slope ≤5° %`) and explicitly labeled it as a **team-defined exploratory heuristic (not a NASA engineering standard)**.
   - Mandated strict separation between `sun_time_pct` (any solar disk visible, `disk_frac > 0`) and `sun_visible_pct` (time-averaged visible solar disk fraction), ensuring `both_visible_pct <= min(sun_time_pct, earth_visible_pct)` holds across all 31 sites and all 62,500 polar grid cells.
   - Required unified multi-resolution ray-marching (`240 m` fine DEM inside `±150 km` + `1,200 m` 5×5 block-max coarse DEM out to `75°S`) so custom pins placed in the browser match offline pipeline site metrics within `<= 2 percentage points`.
2. **Independent Numerical & Literature Cross-Checks:**
   - **JPL Horizons DE441 / `MOON_ME` Validation:** Verified across 6 lunar validation sites over `36,216` hourly steps (`2026-11-14T00:00:00Z` to `2030-12-31T23:00:00Z`), achieving `sun_max_err_deg = 0.000198°` (`<= 0.0002°`) and `earth_max_err_deg = 0.006016°` (`<= 0.0061°`).
   - **Peer-Reviewed Lunar Illumination Cross-Check:** Compared solver outputs at Connecting Ridge (`C1`), Shackleton Rim (`S`), Peak Near Shackleton, Malapert Massif, and Shackleton PSR Floor against Mazarico et al. (2011, *Icarus* 211:1066–1081), De Rosa et al. (2012, *Planet. Space Sci.* 74:224–246), Gläser et al. (2014, *Icarus* 243:78–90; 2018, *Planet. Space Sci.* 162:170–178), Barker et al. (2021, 2023), and NASA PDS LOLA `AVGVISIB_65S_240M_201608.IMG` / `AVGVISIB_85S_060M_201608.IMG`, documenting how DEM resolution (240 m vs. 20 m), mast height (2 m vs. 0 m), and epoch window (`2026–2030` vs. 18.6-year cycle) account for expected differences.
3. **Scientific Honesty & Copy Guardrails:**
   - Audited all code and documentation to eliminate unverified claims (e.g., never claiming a site is "certified safe for landing" from 240 m/px topography, expressing solar array output strictly as relative `%` of a perpendicular sun-tracking panel rather than uncalibrated wattages, and returning `null` / `n/a` for terrain metrics north of `75°S`).

---

## 4. Copy-Paste Guidance for the Official NASA Space Apps Submission Form

On `https://www.spaceappschallenge.org/2026/find-a-team/verifour/?tab=project` under **Use of Super Intelligence (SI)**:

- **Question:** *Does your project utilize Super Intelligence (SI) / Artificial Intelligence (AI)?*
  - **Select:** `Yes`
- ** Copy-Paste Disclosure Summary (if a text box is shown or for inclusion in Project Details / Other Data):**

```text
Use of Super Intelligence (SI) & AI Disclosure:
Team VeriFour used AI coding and research assistants under strict human scientific review:
1. Pre-event preparation (Nov 13, 2026, separate reference workspace): Google Antigravity IDE (Gemini, session 273875b0) and Anthropic Claude Code (sessions d9a0bb2c, 6a760884, 3dc49d78) were used to analyze lunar illumination physics, benchmark JPL Horizons MOON_ME sub-point equations (<=0.006 deg error), prototype LRO LOLA 240 m/px horizon ray-marching, and draft modular work-package specifications (WP0-WP7).
2. Official Hackathon build (Nov 14, 2026 after 09:00 GMT+7, clean repository NASA-Space-Apps-Challenge-2026): Google Antigravity IDE's multi-agent swarm (powered by Gemini 4 Hydrogen, Gemini 4 Argon, Gemini Flash Worker, and Claude Opus 5.5, with Chrome DevTools MCP for live browser QA) assisted in implementing the Python data pipeline, React 18 / TypeScript / Tailwind v4 cosmic web application, Three.js GPU 3D lunar terrain and rover simulator (Lunar3DViewport.tsx, roverPhysics.ts), Web Worker candidate scanner, 10 Python invariant tests, 62 active Vitest unit/integration tests (+ 34 todo scaffolds), and English documentation.
3. Zero Synthetic Media or Fabricated Data: 0 AI-generated images, videos, imported 3D meshes, or synthetic terrain textures were used. All elevation grids, horizon profiles, illumination series, and eclipse calculations derive strictly from official NASA LRO LOLA (LDEM_75S_240M) and NASA JPL Horizons (DE441 / MOON_ME) data, verified by Team VeriFour against peer-reviewed literature (Mazarico et al. 2011; Glaser et al. 2014, 2018; Barker et al. 2021, 2023).
Full chronological AI/SI log & metadata disclosure: [INSERT_PUBLIC_GOOGLE_DRIVE_LINK_TO_THIS_DOC]
```

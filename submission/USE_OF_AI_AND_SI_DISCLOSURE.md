# Use of Artificial Intelligence (AI) & Super Intelligence (SI) Disclosure

- **Team Name:** Team VeriFour (`https://www.spaceappschallenge.org/2026/find-a-team/verifour/?tab=project`)
- **Official Team Members (5):** `Linh Nguyen` · `Duc-Truong Hoang` · `Nguyễn Tiến` · `Le Thien Khang` · `Tran Nguyen My Anh`
- **Local Event:** NASA Space Apps Challenge 2026 — Hanoi, Vietnam (`https://www.spaceappschallenge.org/2026/local-events/hanoi/`)
- **Challenge:** Lunar Landing Site Navigator (`https://www.spaceappschallenge.org/2026/challenges/lunar-landing-site-navigator/`)
- **Project Name:** Lunar Landing Site Navigator
- **Open-Source License:** Apache License 2.0 (`LICENSE`)
- **Document Purpose:** Transparent disclosure of all AI / Super Intelligence (SI) tools, model families, assisted engineering modules, and human scientific verification steps used during pre-event preparation (`2026-11-13`) and the official hackathon build (`2026-11-14`–`2026-11-15`), prepared in compliance with NASA Space Apps Challenge 2026 rules (`https://sepa.org.vn/huong-dan-nop-bai-nasa-space-apps-ha-noi-2026.htm#moc-thoi-gian`).

---

## 1. Executive Summary & NASA SI Policy Compliance Attestation

1. **Where AI / SI Was Used:** AI coding and research assistants (**Google Antigravity IDE** using **Google Gemini** and **Anthropic Claude** models, alongside **Anthropic Claude Code**) were used under direct human supervision by **Team VeriFour** to accelerate literature synthesis, numerical validation scripting, TypeScript/React/Three.js/Python code implementation, automated unit and integration test authoring, live browser DOM/layout inspection via Chrome DevTools MCP, and English technical documentation.
2. **Zero AI-Generated Visual Media or Synthetic Scientific Data:**
   - **0 AI-generated images, videos, voiceovers, imported 3D meshes, or synthetic terrain textures** are used anywhere in the web application, data pipeline, or 7-slide presentation deck (all 3D rover primitives, micro-regolith bump noise, astrometric J2000 starfield geometry, and Sun/Earth shaders are generated deterministically via Three.js geometry, GLSL/Canvas gradients, and real data captures).
   - All elevation grids, slope maps, 360° horizon profiles, solar illumination fractions, Earth direct-to-Earth (DTE) visibility series, and eclipse obscuration curves are computed deterministically from official **NASA LRO LOLA (`LDEM_75S_240M`)** and **NASA JPL Horizons (`DE441` / `MOON_ME`)** datasets using explicit spherical trigonometry and ray-marching algorithms.
3. **Clean Official Hackathon Build Rule (After `09:00 GMT+7`, Saturday, November 14, 2026):**
   - Exploratory Data Analysis (EDA), physics benchmarking, and specification drafting conducted on November 13, 2026 were kept in a separate pre-event reference workspace.
   - The official submission repository (`NASA-Space-Apps-Challenge-2026`) was initialized clean and built starting after the official Hanoi event opening (`09:00 GMT+7` on `2026-11-14`).
4. **In-Code & Metadata Attribution:**
   - `webapp/package.json`: `"license": "Apache-2.0"` and `"aiDisclosure"` metadata field.
   - `webapp/index.html`: `<meta name="license" content="Apache-2.0" />` and `<meta name="ai-disclosure" content="..." />`.
   - `webapp/src/components/AboutModal.tsx`: Section 6 (*License & AI / SI Disclosure*) visible directly inside the application UI.
   - `README.md`: Dedicated *Use of AI tools & Super Intelligence (SI) disclosure* and *License* sections linking to this document.

---

## 2. Summary of AI / SI Tools & Assisted Work Areas

### Phase A — Pre-Event Exploratory Research & Physics Benchmarking (`2026-11-13`)

| AI Tool & Model Family | Work Area | Assisted Tasks & Technical Outputs |
| --- | --- | --- |
| **Google Antigravity IDE (Google Gemini)** | Challenge Physics, Rules & Multi-Objective Framing | Reviewed lunar `1.54°` axial tilt, polar terrain shadowing, and `18.6-year` nodal precession physics; audited NASA Space Apps Hanoi submission requirements; analyzed multi-objective illumination vs. DTE bounds (`both_visible_pct <= min(sun_time_pct, earth_visible_pct)`). |
| **Anthropic Claude Code (Anthropic Claude)** | Ephemeris Verification & Engineering Architecture | Verified topocentric Sun and Earth Az/El equations derived from JPL Horizons `MOON_ME` sub-solar and sub-Earth points against direct JPL Horizons queries (`<= 0.006°`); prototyped `240 m/px` LRO LOLA 360° horizon ray-marching; structured modular implementation and test specifications (`WP0–WP7`). |

---

### Phase B — Official Hackathon Build, Verification & Submission Packaging (`2026-11-14` from `09:00 GMT+7` through `2026-11-15`)

During the official hackathon window (`2026-11-14`–`2026-11-15`), **Team VeriFour (`Linh Nguyen`, `Duc-Truong Hoang`, `Nguyễn Tiến`, `Le Thien Khang`, `Tran Nguyen My Anh`)** used **Google Antigravity IDE** (multi-agent coding workflow powered by **Google Gemini** and **Anthropic Claude** models, paired with **Chrome DevTools MCP** connected to a local preview browser for live visual, accessibility, and responsive QA) to implement and verify `NASA-Space-Apps-Challenge-2026`:

| Engineering Work Area | Owned Files in `NASA-Space-Apps-Challenge-2026` | AI-Assisted Engineering Deliverable |
| --- | --- | --- |
| **Repo Scaffolding & Data Contract** | `.gitignore`, `LICENSE`, `README.md`, `.github/workflows/ci.yml`, `requirements-*.txt`, `webapp/package.json`, `src/types/lunar.ts`, `src/lib/runtimeTypes.ts`, `tests/azel.horizons.test.ts` | Scaffolded the clean repository and CI workflow, authored Data Contract v2, built sampled JPL Horizons verification fixtures (794 rows × 6 sites), and packaged Apache-2.0 metadata. |
| **Literature & Site Provenance** | `webapp/public/data/sites.json`, `webapp/src/components/AboutModal.tsx` | Compiled and verified site coordinates and source URLs (Artemis III 2024 9 candidate regions, GSFC PGDA, LROC NAC, USGS Gazetteer) and peer-reviewed illumination benchmarks (Mazarico et al. 2011; De Rosa et al. 2012; Gläser et al. 2014, 2018; Barker et al. 2021, 2023; NASA PDS `AVGVISIB`). |
| **Offline LOLA & Horizons Pipeline** | `scripts/lunar_geometry.py`, `scripts/fetch_lola_dem.py`, `scripts/fetch_horizons.py`, `scripts/build_unified_data.py`, `scripts/grid_candidates.py`, `tests/test_pipeline_invariants.py`, `webapp/public/data/*` | Implemented the deterministic Python pipeline generating all `9` runtime files (`36,216` hourly steps, `9` eclipses, `31` sites × `5` mast heights, `9` Artemis III 2024 polygons, `1250×1250` fine 240 m & `762×762` coarse 1,200 m binary DEMs, `250×250` polar maps, and `site_candidates.json` with `140` refined 5×5 blocks) + `10` Python invariant tests. |
| **Client Math, Scoring & Worker Search** | `webapp/src/lib/lunarMath.ts`, `webapp/src/lib/scoring.ts`, `webapp/src/lib/candidates.ts`, `webapp/src/lib/scanAroundWorker.ts`, `webapp/tests/wp2.core.test.ts`, `webapp/tests/wp7.candidates.test.ts` | Implemented ENU solar/Earth Az/El math, two-circle geometric eclipse obscuration, solar array power modeling, operational window extraction, unified fine+coarse 360° horizon ray-marching for custom pins, MCDA Composite Viability scoring, Mode A/B Candidate Finder + Web Worker, and `21` unit/integration tests. |
| **2D Stereographic Polar Map** | `webapp/src/components/PolarMapCanvas.tsx`, `webapp/src/components/map/polarMapMath.ts`, `webapp/src/components/map/polarMapRender.ts`, `webapp/tests/wp3.map.test.ts` | Built the `±150 km` interactive 2D South Pole map canvas, collision-aware labels, 9 Artemis III polygon overlays, Global Moon view, and `13` map unit tests. |
| **360° Sky & 2026–2030 Timeline** | `webapp/src/components/HorizonSkyView.tsx`, `webapp/src/components/MissionTimeline.tsx`, `webapp/src/components/timeline/*`, `webapp/tests/wp4.sky.test.ts` | Built the 360° Horizon Panorama and Polar Sky Dome (with mast ghost horizon & eclipse indicator) and the 2026–2030 Mission Timeline + `8` unit tests. |
| **Workspace Shell, Onboarding & Accessibility** | `webapp/src/App.tsx`, `webapp/src/components/appHelpers.ts`, `CandidateFinderPanel.tsx`, `SiteComparisonTable.tsx`, `ScenarioComparePanel.tsx`, `GettingStartedModal.tsx`, `AboutModal.tsx`, `LearnModal.tsx`, `AccessibleDialog.tsx`, `GlossaryTerm.tsx`, `webapp/tests/wp5.app.test.ts` | Built the responsive workspace, URL deep-linking, Candidate Finder UI, multi-site comparison, JSON/CSV mission brief export, **4-tab `Getting Started & Physics` guide** (with merged Tab 4 `Physics & Eclipses`), persistent **sticky 7-section `Explain Section` / `Explain Header` UI tour**, accessible dialogs, and `8` integration tests. |
| **VeriFour NASA RAG Assistant & Secret Isolation** | `webapp/src/lib/nasaRag.ts`, `webapp/src/components/NasaRagChatbot.tsx`, `webapp/vite.config.ts`, `.env.example`, `webapp/tests/wp5.app.test.ts` | Built the grounded bilingual (`VI`/`EN`) NASA RAG Assistant (`NASA AI Chat`, 6-chunk methodology/UI corpus, live telemetry injection, 7 deep-link action buttons), Vite server-side `/api/openai/chat` proxy + `.env` / `.env.example` secret isolation (preventing client-bundle secret leaks), deterministic offline RAG fallback, and integration tests. |
| **Three.js 3D Rover, VTOL Hopper & Astrometric Sky** | `webapp/src/lib/roverPhysics.ts`, `webapp/src/lib/celestialSky.ts`, `webapp/src/components/Lunar3DViewport.tsx`, `webapp/tests/wp8.rover3d.test.ts` | Built terrain-normal rover physics, **VTOL Hopper Flight Mode** (`F` key / `Fly`/`Land` toggle, `E`/`Q` climb & descend, 4-corner thrusters, `ALT` HUD readout), GPU-accelerated Three.js South Pole viewport (`250×250` LOLA mesh, `1× Real` to `15×` relief, `5` surface overlays, dynamic JPL Sun shadows), astrometric `J2000 ICRS` deep-space sky (`116` bright stars + `7,200` Milky Way stars + `7` nebulae/galaxies), 3D Sun corona + Earth globe + DTE beam, articulated 6-wheel rover (`1×–1000×` gears, `WASD`/virtual/waypoint autopilot, 4 camera modes), and `12` WP8 unit/integration tests. |
| **Cosmic UI Theme & QA** | `webapp/src/index.css`, `webapp/src/App.tsx`, `PolarMapCanvas.tsx`, `HorizonSkyView.tsx`, `MissionTimeline.tsx` | Designed the NASA Eyes / Moon Trek cosmic UI, `5` workspace views, `4` SVG `CircularRingGauge` readouts, collapsible `Science & Methodology Notes`, and `RoverTraverseProfile`, verified interactively via Chrome DevTools MCP (`1440×900` desktop & `375×812` mobile). |
| **Submission & Pitch Package** | `README.md`, `submission/NASA_SUBMISSION_FORM.md`, `submission/PITCH_AND_VIDEO_SCRIPT.md`, `submission/VIDEO_30S_DEMO_SCRIPT.md`, `submission/PITCH_DECK_7_SLIDES.html`, `submission/PITCH_DECK_7_SLIDES.pdf`, `submission/USE_OF_AI_AND_SI_DISCLOSURE.md` | Authored repository docs, `pageId: 1` portal form text, visual-first 7-slide HTML/PDF deck built exclusively from live-app NASA LOLA/Horizons captures, 30s & 5–7 min video pitch scripts, bilingual Q&A covering Viability MCDA sensitivity (`ρ >= 0.97`) and KPI cards, 5-member `Team VeriFour` attribution, and this disclosure. |

---

## 3. Human Ownership, Scientific Direction & Verification (`Team VeriFour`)

Every physical assumption, mathematical formula, dataset selection, and user-facing claim was directed and verified by **Team VeriFour**:

1. **Physical & Architectural Decisions:**
   - Defined the dimensionless convex **MCDA Composite Viability Score** (`0.35 × Mean Solar Disk % + 0.25 × Earth DTE % + 0.15 × Joint Sun+Earth % + 0.15 × Dark Resilience + 0.10 × 240 m Baseline Slope ≤5° %`), validated rank stability under `±5 percentage point` weight perturbations (`Spearman ρ = 0.9853` power-heavy, `ρ = 0.9706` comms-heavy across all `17` South Pole DEM sites), and labeled it transparently as an **exploratory decision-support heuristic (not flight certification)**.
   - Mandated strict separation between `sun_time_pct` (any solar disk visible, `disk_frac > 0`) and `sun_visible_pct` (time-averaged visible solar disk fraction), ensuring `both_visible_pct <= min(sun_time_pct, earth_visible_pct)` across all `31` sites and all `62,500` polar grid cells.
   - Required unified multi-resolution ray-marching (`240 m` fine DEM inside `±150 km` + `1,200 m` 5×5 block-max coarse DEM out to `75°S`) so custom pins placed in the browser match offline pipeline site metrics within `<= 2 percentage points`.
2. **Independent Numerical & Literature Cross-Checks:**
   - **JPL Horizons DE441 / `MOON_ME` Validation:** Verified across `6` lunar validation sites over `36,216` hourly steps (`2026-11-14T00:00:00Z` to `2030-12-31T23:00:00Z`), achieving `sun_max_err_deg = 0.000198°` (`<= 0.0002°`) and `earth_max_err_deg = 0.006016°` (`<= 0.0061°`).
   - **Peer-Reviewed Lunar Illumination Cross-Check:** Compared solver outputs at Connecting Ridge (`C1`), Shackleton Rim (`S`), Peak Near Shackleton, Malapert Massif, and Shackleton PSR Floor against Mazarico et al. (2011, *Icarus* 211:1066–1081), De Rosa et al. (2012, *Planet. Space Sci.* 74:224–246), Gläser et al. (2014, *Icarus* 243:78–90; 2018, *Planet. Space Sci.* 162:170–178), Barker et al. (2021, 2023), and NASA PDS LOLA `AVGVISIB` rasters, documenting how DEM resolution, mast height, and epoch window (`2026–2030` vs. 18.6-year cycle) account for expected differences.
3. **Automated CI & Scientific Guardrails:**
   - Verified with `10/10` Python pipeline invariant tests (`pytest` & `unittest`) and `68` active Vitest unit/integration tests (`+ 34` todo scaffolds), enforcing non-overclaim guardrails (no footpad-scale safety claims from 240 m data; `null` / `n/a` reported for local DEM terrain stats north of `75°S`).

---

## 4. Copy-Paste Guidance for the Official NASA Space Apps Submission Form

On `https://www.spaceappschallenge.org/2026/find-a-team/verifour/?tab=project` under **Use of Super Intelligence (SI)**:

- **Question:** *Does your project utilize Super Intelligence (SI) / Artificial Intelligence (AI)?*
  - **Select:** `Yes`
- **Copy-Paste Disclosure Summary:**

```text
Use of Super Intelligence (SI) & AI Disclosure:
Team VeriFour used AI coding and research assistants under strict human scientific supervision:
1. Pre-event exploratory research (Nov 13, 2026): Google Antigravity IDE (Gemini) and Anthropic Claude Code (Claude) were used to review lunar polar illumination physics, verify JPL Horizons MOON_ME sub-point equations (<=0.006 deg error), prototype LRO LOLA 240 m/px horizon ray-marching, and structure modular specifications.
2. Official Hackathon build (Nov 14–15, 2026 after 09:00 GMT+7): Google Antigravity IDE (multi-agent workflow using Google Gemini and Anthropic Claude models, with Chrome DevTools MCP for live UI/accessibility QA) assisted in implementing the Python data pipeline, React 18 / TypeScript / Tailwind v4 cosmic web app, Three.js GPU 3D lunar terrain, J2000 sky, and rover + VTOL hopper simulator (Lunar3DViewport.tsx, roverPhysics.ts), 4-tab GettingStartedModal.tsx & sticky 7-section Explain Section tour (App.tsx), grounded bilingual VeriFour NASA RAG Assistant (nasaRag.ts, NasaRagChatbot.tsx) with secret-isolated /api/openai/chat proxy (vite.config.ts, .env.example) and automatic offline fallback, Web Worker candidate scanner, 10 Python invariant tests, 68 active Vitest unit/integration tests, and submission documentation for Team VeriFour (Linh Nguyen, Duc-Truong Hoang, Nguyễn Tiến, Le Thien Khang, Tran Nguyen My Anh).
3. Zero Synthetic Media or Fabricated Data: 0 AI-generated images, videos, imported 3D meshes, or synthetic terrain textures were used. All elevation grids, horizon profiles, illumination series, and eclipse calculations derive strictly from official NASA LRO LOLA (LDEM_75S_240M) and NASA JPL Horizons (DE441 / MOON_ME) data, verified by Team VeriFour against peer-reviewed literature (Mazarico et al. 2011; Glaser et al. 2014, 2018; Barker et al. 2021, 2023).
Full AI/SI disclosure document: [INSERT_PUBLIC_GOOGLE_DRIVE_LINK_TO_THIS_DOC]
```

# NASA Space Apps Challenge 2026 — Official Submission Form Package

- **Team:** VeriFour
- **Submission Portal:** `https://www.spaceappschallenge.org/2026/find-a-team/verifour/?tab=project`
- **Hanoi Local Event Guide:** `https://sepa.org.vn/huong-dan-nop-bai-nasa-space-apps-ha-noi-2026.htm`
- **Deadlines:**
  - **Hanoi Local Judging Snapshot Deadline:** **11:00 AM GMT+7, Sunday, November 15, 2026** *(Mandatory for Hanoi teams — submit and verify all public links before 10:30 AM GMT+7!)*
  - **Global Portal Hard Cutoff:** **11:59 PM (23:59) Local Time, Sunday, November 15, 2026**

---

## 1. Project Name

*(Max ~60 characters; clear, memorable, matches challenge and app header)*

```text
Lunar Landing Site Navigator
```

*(Optional subtitle if needed: `Lunar Landing Site Navigator: South Pole Illumination & DTE Mission Planner`)*

---

## 2. High-Level Project Summary

*(Required constraints: **50 to 195 words**, **<= 1,500 characters**, plain English, zero markdown formatting required by portal text area. Below is **161 words / 1,106 characters**.)*

```text
Lunar Landing Site Navigator is an interactive, browser-based mission planning platform and GPU-accelerated 3D rover simulator that helps engineers, planners, and students evaluate where and when lunar surface sites receive sunlight and direct-to-Earth (DTE) line-of-sight from 2026 to 2030. Coupling NASA LRO LOLA South Pole laser altimetry (LDEM_75S_240M at 240 m/px) with 36,216 hourly NASA JPL Horizons (DE441 / MOON_ME) ephemeris steps, the application presents a cosmic mission-control workspace built around a Three.js 3D lunar terrain and 6-wheel rover simulator (WASD, virtual controls, and click-on-terrain autopilot waypoints with live pitch/roll slope alignment, 1x-1000x gears, 4 camera modes, and dynamic solar shadows and Earth DTE beam). Users can inspect 31 curated sites, overlay 9 Artemis III 2024 candidate polygons, compute 360-degree browser ray-marched horizons for mast heights from 0.5 m to 50 m, track 9 lunar solar eclipses, and rank polar candidates via a precomputed 250x250 grid and Web Worker scanner—verified within 0.0002 deg (Sun) and 0.0061 deg (Earth) of JPL Horizons.
```

---

## 3. Link to Project Demonstration (7-Slide Deck OR <= 30s Video)

- **Portal Rule:** Provide a direct URL to **either** a maximum **7-slide presentation** (PDF/Google Slides/Drive) **or** a maximum **30-second video** (YouTube Unlisted/Public or Google Drive).
- **Mandatory Access Check:** Permission **MUST** be set to **"Anyone with the link can view"** (test in an Incognito/Private browser window before saving!).
- **Prepared Local Artifacts in `submission/`:**
  - 7-Slide Self-Contained Deck (exportable to PDF via Chrome `Print -> Save as PDF`): `submission/PITCH_DECK_7_SLIDES.html`
  - 30-Second Video Capture Script & 5–7 Minute Pitch Script: `submission/PITCH_AND_VIDEO_SCRIPT.md`

```text
[TODO_TEAM_INSERT_PUBLIC_GOOGLE_DRIVE_OR_YOUTUBE_DEMO_URL]
```

---

## 4. Link to Final Project (Live Web App & Public GitHub Repository)

- **Portal Rule:** Publicly accessible URL to the working prototype and/or public source code repository (licensed under **Apache-2.0**, `LICENSE` included in root).
- **Mandatory Access Check:** Ensure the GitHub repository (`NASA-Space-Apps-Challenge-2026`) is set to **Public** and the deployed web application URL opens without login.

```text
Primary Live Web App URL: [TODO_TEAM_INSERT_LIVE_WEBAPP_URL]
Public GitHub Repository URL: [TODO_TEAM_INSERT_PUBLIC_GITHUB_REPO_URL]
```

---

## 5. Project Details (Detailed Description)

*(Copy-paste directly into the **Project Details** section on `verifour/?tab=project`.)*

```markdown
### What It Does
**Lunar Landing Site Navigator** transforms raw NASA planetary geodesy and ephemeris datasets into a cosmic NASA Eyes / Moon Trek-inspired mission control workspace and interactive 3D lunar rover simulator for South Pole mission planning (2026–2030):

1. **GPU-Accelerated Three.js 3D Lunar South Pole Terrain & Interactive Rover Simulator (`Lunar3DViewport.tsx`, `roverPhysics.ts`):**
   - Renders a `250×250` LRO LOLA South Pole terrain mesh (`±150 km`, selectable `1× Real` true 1:1 to `15×` relief) with micro-regolith bump detail and `5` surface overlay layers (`Regolith`, `Sun`, `Earth`, `Slope`, `Composite`), an astrometric J2000 ICRS deep-space sky (`116` named bright stars + `7,200` Galactic Milky Way stars, GLSL Milky Way dome, and `7` deep-sky nebulae/galaxies + optional Sky Guide), a glowing 3D Sun corona casting dynamic JPL Horizons shadows (dimmed/reddened during lunar eclipses), a sunlit crescent 3D Earth globe with high-gain DTE beam, draped **9 official Artemis III 2024 candidate region boundaries**, and clickable 3D site beacons (`flyTo`).
   - Lets users deploy and drive an articulated 6-wheel rocker-bogie rover (`WASD` / Arrow keys / virtual HUD drive pad / click-on-terrain autopilot waypoints) over bilinearly sampled `240 m/px` LRO LOLA DEM (`dem_fine_240m.i16`, with seamless `1,200 m/px` coarse fallback), featuring live terrain-normal pitch/roll slope alignment, selectable speed gears (`1×` at 4.5 m/s up to `1000×` explorer warp), PSR LED headlights, 160-point 3D traverse breadcrumb trails, and 4 camera modes (`Rover Chase`, `1st-Person Mast POV` with reticle HUD, `Orbital Free Cam` / `Tactical`, plus synchronized **`Command Split`** workspace mode).

2. **Cosmic Mission Control Workspace, 2D Polar Map & Custom Probe (`App.tsx`, `PolarMapCanvas.tsx`):**
   - Organizes workflows into 5 views (`3D Rover & Surface` default hero stage, `Command Split`, `2D Map & Sky`, `Compare A vs B`, `Candidate Directory`), `4` animated SVG `CircularRingGauge` telemetry rings (Solar Array %, Earth DTE & window hours, 240 m Slope/Inclinometer + Rover Tilt, Composite Viability Index), a collapsible **`Science & Methodology Notes`** accordion, and a 3-tab Bottom Mission Dock (`14-Day Timeline & Sensitivity`, `360° Horizon Sky & Panorama`, `Rover Traverse Elevation Profile`).
   - Retains the `±150 km` 2D South Pole stereographic map (`250×250` illumination and Earth DTE layers + 9 Artemis III polygons), Global Moon view, and click-anywhere **Custom Probe Pin** ray-marched directly in the browser.

3. **360° Horizon Panorama, Polar Sky Dome & 36,216-Step Hourly Mission Timeline (2026–2030):**
   - Displays the local 360° topographic horizon profile alongside solar and Earth trajectories for selectable mast heights (`0.5 m`, `2.0 m`, `10.0 m`, `20.0 m`, `50.0 m` for curated sites; continuous `0 m–50 m` for custom pins), evaluating how raising a mast clears crater rims and shortens maximum darkness intervals.
   - Covers `2026-11-14T00:00:00Z` through `2030-12-31T23:00:00Z` at 1-hour cadence (`9` Moon-center solar eclipses: 3 total, 6 partial), extracting contiguous operational windows and relative solar array output (`%` of a perpendicular sun-tracking panel at full disk vs. horizontal deck panel).

4. **31 Curated Sites, Multi-Site Comparison & Candidate Finder (Mode A + Mode B):**
   - Compares **31 curated lunar targets**: 13 South Pole candidate sites, 10 Historic & International sites (Apollo, Luna, Chang'e-4/6, Chandrayaan-3, SLIM), 6 CLPS Commercial sites (IM-1 Odysseus, IM-2 Athena, Blue Ghost), and 2 Polar Reference / PSR targets.
   - **Candidate Finder Panel:** Mode A filters and ranks across a precomputed `250×250` South Pole grid (`1,200 m/px`) plus **140 refined 5×5 (`240 m/px`) summit blocks** (`2.0 m` mast) with minimum spatial separation constraints; Mode B runs a live multi-resolution Web Worker (`scanAroundWorker`) around any selected coordinate.

### How It Works & Scientific Validation
- **Spherical Horizon Ray-Marching:** For each target, 360 azimuth rays (`1°` spacing) march along exact lunar great circles (`R0 = 1,737.4 km`) across 480 log-spaced steps from `120 m` to `200 km`, sampling the `240 m/px` fine LOLA DEM inside `±150 km` and the `1,200 m/px` 5×5 block-max LOLA DEM out to `75°S`.
- **Finite Solar Disk & Joint Visibility:** Distinguishes `sun_time_pct` (any portion of the `0.266°` solar disk above the horizon) from `sun_visible_pct` (mean visible solar disk fraction), and strictly enforces `both_visible_pct <= min(sun_time_pct, earth_visible_pct)`.
- **JPL Horizons DE441 / `MOON_ME` Validation:** Checked across 6 lunar sites over `36,216` hours, achieving a maximum angular error of **0.000198° (Sun)** and **0.006016° (Earth)**.
- **Literature Cross-Check:** Benchmarked in-app (`About & Data` modal) against Mazarico et al. (2011), De Rosa et al. (2012), Gläser et al. (2014, 2018), Barker et al. (2021, 2023), and NASA PDS LOLA `AVGVISIB` maps.

### What Benefits It Has & Known Limitations
- Runs 100% client-side in standard web browsers with zero server infrastructure or live API latency, making authentic NASA LOLA and JPL Horizons mission analysis and 3D lunar rover traversal accessible to researchers, students, and hackathon judges worldwide.
- **Explicit Limitations:** `LDEM_75S_240M` (`240 m/px`) and the `250×250` 3D mesh provide exploratory decision-support simulation fidelity and do not resolve meter-scale boulders, lander footpad slopes, or regolith terramechanics; the Composite Viability Score is a transparent team-defined heuristic rather than engineering flight certification; sites north of `75°S` report `n/a` for local DEM terrain statistics and use smooth-sphere horizon dip geometry.

### Tools, Coding Languages & Stack
- **Frontend (`webapp/`):** React 18.3, TypeScript 5.6, Three.js 0.187 (WebGL 3D), Vite 6, Tailwind CSS v4, HTML5 Canvas 2D & SVG, Web Workers, Lucide Icons, Vitest (`67` active unit/integration tests + `34` todo scaffolds).
- **Offline Data Pipeline (`scripts/`):** Python 3.13+, NumPy, Pandas, SciPy, Requests, Unittest/Pytest (`10` pipeline invariant tests).
- **License:** Apache License 2.0.
```

---

## 6. Use of Super Intelligence (SI) / AI

- **Select:** `Yes`
- **Google Drive Disclosure Document Link (Upload `submission/USE_OF_AI_AND_SI_DISCLOSURE.md` to Google Drive with "Anyone with the link can view"):**
  `[TODO_TEAM_INSERT_PUBLIC_GOOGLE_DRIVE_AI_DISCLOSURE_LINK]`
- **Short Summary Text:**
  > Built with AI coding and research assistance (Google Antigravity IDE multi-agent swarm powered by Gemini 4 Hydrogen, Gemini 4 Argon, Gemini Flash Worker, and Claude Opus 5.5, plus pre-event exploratory benchmarking with Gemini and Claude Code) for software implementation, automated tests, and English documentation under Team VeriFour's scientific direction. Zero (0) AI-generated images, videos, imported 3D meshes, or synthetic terrain textures were used; all topography and ephemeris data derive strictly from NASA LRO LOLA (`LDEM_75S_240M`) and NASA JPL Horizons (`DE441` / `MOON_ME`).

---

## 7. NASA Data (Link Text + Verified `https://` URLs)

*(Add each row below in the **NASA Data** section of `verifour/?tab=project`. Every URL has been verified to use `https://`.)*

| Link Text (Portal Field 1) | URL (Portal Field 2 — must start with `https://`) | How It Is Used in Our Project |
| --- | --- | --- |
| `NASA JPL Horizons Ephemeris System API (DE441 / MOON_ME)` | `https://ssd.jpl.nasa.gov/api/horizons.api` | Primary ephemeris source: 36,216 hourly sub-solar and sub-Earth points, Earth-Moon distance (`2026-11-14` to `2030-12-31`), and topocentric validation checkpoints across 6 lunar sites (`ephemeris.json`, `scripts/fetch_horizons.py`). |
| `NASA JPL Horizons API Documentation` | `https://ssd-api.jpl.nasa.gov/doc/horizons.html` | Reference specification for `MOON_ME` body-fixed frame queries and topocentric observer quantities. |
| `NASA PDS LRO LOLA South Pole Gridded DEM (LDEM_75S_240M)` | `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/` | Primary terrain dataset (`ldem_75s_240m.img` / `.lbl`, 240 m/px polar stereographic grid 75°S–90°S) used for 360° horizon ray-marching, slope maps, and binary client DEMs (`dem_fine_240m.i16`, `dem_coarse_1200m_max.i16`). |
| `NASA PDS LRO LOLA South Pole Illumination Maps (AVGVISIB)` | `https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/img/avgvisib_85s_060m_201608.lbl` | Official NASA PDS 18.6-year average solar visibility product (`AVGVISIB_65S_240M` & `AVGVISIB_85S_060M`) used to cross-check our South Pole illumination solver in `AboutModal.tsx`. |
| `NASA Artemis III 2024 Candidate Landing Regions Update` | `https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/` | Authoritative reference for the 9 updated Artemis III candidate landing regions (`Mons Mouton Plateau`, `Mons Mouton`, `Nobile Rim 1`, `Nobile Rim 2`, `Malapert Massif`, `Haworth`, `Peak Near Cabeus B`, `de Gerlache Rim 2`, `Slater Plain`) in `sites.json` and `artemis3_regions.json`. |
| `NASA Artemis III 2022 Initial 13 Candidate Regions Release` | `https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/` | Provenance reference for retained 2022 South Pole candidate sites (`Connecting Ridge`, `Peak Near Shackleton`, `de Gerlache Rim 1`, `Leibnitz Beta Plateau`). |
| `NASA GSFC PGDA LOLA 5 mpp Artemis III Site Products` | `https://pgda.gsfc.nasa.gov/products/78` | High-resolution Goddard Planetary Geodesy Data Archive reference coordinates for South Pole summit targets (`Connecting Ridge Site 01`, `Shackleton Rim Site 04`). |
| `NASA LROC QuickMap Lunar Geospatial Portal` | `https://quickmap.lroc.asu.edu/` | Source portal for the simplified Artemis III 2024 9-region boundary polygons (`A3_9regions-lonlat-simplified.geojson`) and LROC NAC landing site coordinates. |
| `NASA Solar System Treks — Moon Trek Portal` | `https://trek.nasa.gov/moon/` | Official challenge resource used for South Pole nomenclature and cartographic context verification. |
| `NASA NSSDCA Lunar Exploration Sites Catalog` | `https://nssdc.gsfc.nasa.gov/planetary/lunar/lunar_sites.html` | Authoritative coordinate reference for historical Apollo (`Apollo 11, 15, 17`) and international lunar landing sites (`sites.json`). |
| `NASA LRO Images Intuitive Machines IM-1 Odysseus Lander` | `https://www.nasa.gov/missions/lro/nasas-lro-images-intuitive-machines-odysseus-lander/` | Authoritative NASA LRO NAC coordinate source (`-80.13°S, 1.44°E`) for the CLPS IM-1 Odysseus landing site in `sites.json`. |
| `NASA CLPS CP-21 Lunar South Pole Delivery Science` | `https://science.nasa.gov/lunar-science/clps-deliveries/cp-21-science/` | NASA CLPS mission context and coordinate reference for South Pole commercial lander deliveries. |

---

## 8. Space Agency Partner & Other Data (Link Text + Verified `https://` URLs)

*(Add each row below in the **Space Agency Partner & Other Data** section of `verifour/?tab=project`.)*

| Link Text (Portal Field 1) | URL (Portal Field 2 — must start with `https://`) | How It Is Used in Our Project |
| --- | --- | --- |
| `Canadian Space Agency (CSA) — Moon Exploration` | `https://www.asc-csa.gc.ca/eng/astronomy/moon-exploration/` | Space Agency Partner challenge resource referenced for lunar polar exploration and rover/infrastructure operational context. |
| `USGS Gazetteer of Planetary Nomenclature — Shackleton` | `https://planetarynames.wr.usgs.gov/Feature/5450` | IAU/USGS authoritative coordinate and diameter reference for Shackleton Crater and South Pole nomenclature (`Feature/5450` & `Feature/16272`). |
| `LROC QuickMap Artemis III 9 Regions GeoJSON` | `https://files.actgate.com/lunar/A3_9regions-lonlat-simplified.geojson` | Simplified polygon boundary coordinates for the 9 Artemis III 2024 candidate regions ingested into `webapp/public/data/artemis3_regions.json`. |
| `Mazarico et al. (2011) Lunar Polar Illumination (Icarus)` | `https://doi.org/10.1016/j.icarus.2010.10.030` | Primary peer-reviewed benchmark for 240 m/px LRO LOLA South Pole illumination and horizon methodology (`Connecting Ridge C1`, `Shackleton Rim S`). |
| `De Rosa et al. (2012) Lunar South Pole Illumination (PSS)` | `https://doi.org/10.1016/j.pss.2012.08.002` | Peer-reviewed multi-resolution illumination cross-check reference in `AboutModal.tsx`. |
| `Glaser et al. (2014) High-Resolution LOLA DTMs (Icarus)` | `https://doi.org/10.1016/j.icarus.2014.08.013` | Peer-reviewed benchmark for LOLA polar Digital Terrain Model illumination analysis. |
| `Glaser et al. (2018) Illumination at the Lunar South Pole (PSS)` | `https://doi.org/10.1016/j.pss.2017.07.006` | Peer-reviewed 20 m/px @ 2 m mast illumination benchmark cross-checked in `AboutModal.tsx`. |
| `Barker et al. (2021) Improved LOLA South Pole DEMs (PSS)` | `https://doi.org/10.1016/j.pss.2020.105119` | Peer-reviewed reference on LOLA DEM errors and polar terrain slope modeling. |
| `Barker et al. (2023) Solar Illumination at Artemis Sites (PSJ)` | `https://doi.org/10.3847/PSJ/acf3e1` | Peer-reviewed reference on 5 m/px LOLA solar illumination across Artemis III candidate regions. |
| `Team VeriFour Use of AI & Super Intelligence (SI) Disclosure` | `[TODO_TEAM_INSERT_PUBLIC_GOOGLE_DRIVE_AI_DISCLOSURE_LINK]` | Exhaustive chronological log of AI/SI tools (Antigravity Swarm, Gemini, Claude Code) and human scientific verification (`submission/USE_OF_AI_AND_SI_DISCLOSURE.md`). |

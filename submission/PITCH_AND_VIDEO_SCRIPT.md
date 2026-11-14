# 30-Second Video Script, 5–7 Minute Live Pitch & Submission Checklist

- **Team:** VeriFour (`https://www.spaceappschallenge.org/2026/find-a-team/verifour/?tab=project`)
- **Challenge:** Lunar Landing Site Navigator (`NASA Space Apps Challenge 2026 — Hanoi`)
- **Key Deadlines & Event Logistics (Hanoi Local Event — `sepa.org.vn`):**
  - **Hanoi Local Submission Snapshot Deadline:** **11:00 AM GMT+7, Sunday, November 15, 2026** *(Submit & test all links in Incognito before 10:30 AM GMT+7!)*
  - **Global Space Apps Portal Cutoff:** **11:59 PM (23:59) Local Time, Sunday, November 15, 2026**
  - **Hanoi Judging & Live Pitch Reference:** Check `sepa.org.vn/huong-dan-nop-bai-nasa-space-apps-ha-noi-2026.htm` and `eventstem.com/spaceapps.html#agenda` for the Hanoi judging schedule (online support / briefing Zoom ID: `940 8456 9142`; in-person venue: Trường THCS Trưng Vương, Hoàn Kiếm, Hà Nội).

---

## 1. 30-Second Silent / Captioned Screen-Capture Demo Script (`<= 30s` Strict Rule)

> **Rule Reminder:** If submitting a video instead of the 7-slide PDF deck (`submission/PITCH_DECK_7_SLIDES.html`), the video **MUST be `<= 30 seconds`** (28–29 seconds recommended), **in English**, with **zero NASA logos/insignias**, and hosted on YouTube (Public/Unlisted) or Google Drive with **"Anyone with the link can view"**.

| Timecode | On-Screen Action (`http://localhost:5173` or Live URL at `1920×1080`) | On-Screen English Caption / Optional Narration |
| --- | --- | --- |
| **0:00 – 0:06** (`6s`) | Start on **Connecting Ridge Peak** in the **2D South Pole Map**. Toggle map layer from `Elevation` -> `Sun % (2m)` -> `Earth DTE %`, with the **9 Artemis III 2024 region polygons** visible, then toggle briefly to the **3D Terrain Mesh** and rotate slightly. | *"Lunar Landing Site Navigator couples NASA LRO LOLA 240 m topography with 36,216 hourly JPL Horizons steps (2026–2030) across the lunar South Pole."* |
| **0:06 – 0:13** (`7s`) | Focus on the **360° Horizon Panorama & Sky Dome**. Switch mast height from `0.5 m` -> `2 m` -> `10 m` -> `50 m` so the ghost horizon and solar/Earth trajectories visibly update, then click an **Eclipse shortcut** on the **Mission Timeline**. | *"Evaluate 360° terrain horizon masking, mast height trade-offs from 0.5 m to 50 m, and 9 geometric lunar solar eclipses in the browser."* |
| **0:13 – 0:21** (`8s`) | Open the **Candidate Finder Panel** (`Mode A`). Select `Artemis III Regions` or `Full Polar Map`, set `Max Slope <= 5°`, and click a top-ranked candidate (`#1`) so the map and 360° horizon jump to it; then click any crater rim on the map to drop a **Custom Probe Pin** (live ray-marched). | *"Discover top candidate sites across 62,500 polar cells and 140 refined 240 m blocks, or click anywhere on the Moon to ray-march a custom surface probe."* |
| **0:21 – 0:29** (`8s`) | Scroll briefly to the **31-Site Comparison Table & Scenario Compare** (`Export CSV/JSON`), then open the **About & Data** modal showing the **JPL Horizons `0.000198°` validation** and **Mazarico et al. (2011) benchmark table**. Stop recording at `0:29`. | *"Compare 31 curated sites and scenarios, verified within 0.0002° of JPL Horizons and benchmarked against peer-reviewed lunar literature."* |

---

## 2. 5–7 Minute Live Judging Pitch Script (Hanoi Local Judging)

### Minute 0:00 – 0:50 | Hook & The South Pole Geometry Problem (Slide 1 & Slide 2)
- "Good morning/afternoon judges. We are **Team VeriFour**, presenting **Lunar Landing Site Navigator**."
- "At the lunar South Pole, the Moon's **1.54-degree axial tilt** keeps the Sun skimming along the horizon. A ridge 50 kilometers away can plunge a lander into darkness for two weeks, while a peak 500 meters away enjoys over 90% sunlight. At the same time, Earth libration swings between **±6.7 degrees**, meaning high solar power does not guarantee direct-to-Earth communication."
- "Static average maps cannot tell a mission planner what happens during a specific 14-day window in 2028, or how much a 10-meter mast reduces night duration. We built **Lunar Landing Site Navigator** to solve that interactively in the browser."

### Minute 0:50 – 2:10 | NASA Datasets & Deterministic Physics Engine (Slide 3)
- "Our architecture runs **100% client-side** on deterministic geometry derived from two core NASA datasets:"
  1. **NASA JPL Horizons (`DE441 / MOON_ME`):** `36,216` hourly sub-solar and sub-Earth points from November 2026 through December 2030, plus `9` Moon-center solar eclipses.
  2. **NASA PDS LRO LOLA (`LDEM_75S_240M`):** 240-meter-per-pixel South Pole laser altimetry (`1250×1250` fine grid inside `±150 km`, paired with a `762×762` 1,200 m/px `5×5` block-max coarse grid out to `75°S` for far-horizon ray-marching up to `200 km`).
- "We carefully distinguish **Sun-time percentage** (`disk_frac > 0`) from **mean visible solar disk percentage** (`0.266°` solar radius), compute two-circle geometric obscuration during eclipses, and enforce the physical bound `both_visible_pct <= min(sun_time_pct, earth_visible_pct)`."

### Minute 2:10 – 3:50 | Live Product Walkthrough & Candidate Finder (Slide 4)
- **View 1 — 2D/3D South Pole Map & Custom Probe:** "On the left, users explore the ±150 km South Pole map with the **9 official Artemis III 2024 candidate region boundaries**, precomputed `250×250` illumination and Earth DTE layers, a 3D terrain mesh, and a Global Moon view. Clicking anywhere on the map lazily loads the binary LOLA DEMs and ray-marches a 360° horizon profile directly in the browser."
- **View 2 — 360° Horizon Panorama & 2026–2030 Timeline:** "On the right, the 360° panorama and polar sky dome plot solar and Earth trajectories against the local terrain mask across mast heights from `0.5 m` to `50 m`, synchronized with a 36,216-hour mission timeline and operational window extractor."
- **View 3 — Candidate Finder (Mode A + Mode B) & Scenario Compare:** "To move from inspection to discovery, our **Candidate Finder** ranks 62,500 polar cells and **140 refined 5×5 (240 m) summit blocks** by Composite Score, Solar Disk %, Earth DTE %, Joint %, or Shortest Night under slope and spatial-separation constraints—plus a **Mode B Web Worker** (`scanAroundWorker`) that scans custom coordinate neighborhoods live."

### Minute 3:50 – 4:50 | Scientific Validation & Literature Cross-Check (Slide 5)
- "We treated scientific validation as a first-class requirement:"
  - Against direct **JPL Horizons topocentric queries** across 6 lunar sites over all 36,216 hours, our maximum angular error is **0.000198° for the Sun** and **0.006016° for Earth**.
  - Inside the app's **About & Data** modal, we cross-check our live solver against **Mazarico et al. (2011)**, **Gläser et al. (2018)**, and **NASA PDS LOLA `AVGVISIB`** rasters—showing `94.3%` sun-time (`90.1%` mean disk) at Connecting Ridge (`2 m` mast) versus `93.48%` in PDS 240 m (`0 m`), and `0.0%` at Shackleton PSR Floor.
  - All invariants are guarded by **10 Python tests** and **67 Vitest unit and integration tests** (`+ 34 todo`) in CI, plus `ρ ≥ 0.97` Viability rank-stability checks.

### Minute 4:50 – 5:30 | Impact, Honest Limitations & Roadmap (Slide 6 & Slide 7)
- "We explicitly document engineering boundaries: `240 m/px` LOLA data does not resolve meter-scale boulders or footpad slopes, so our Composite Viability Index is presented transparently as an exploratory heuristic rather than flight certification, and sites north of `75°S` report `n/a` for DEM terrain stats."
- "Everything is open-source under **Apache-2.0**, with full **Use of AI / Super Intelligence disclosure** confirming zero AI-generated imagery or synthetic terrain data. Thank you—we welcome your questions!"

---

## 3. Mapping to the 5 Official NASA Judging Criteria

| Judging Criterion | How Lunar Landing Site Navigator Excels |
| --- | --- |
| **1. Impact** | Turns gigabytes of planetary geodesy and ephemeris data into a zero-backend browser tool that quantifies illumination, DTE communications, eclipse obscuration, and mast trade-offs for any 2026–2030 mission window, with exportable CSV/JSON mission briefs. |
| **2. Creativity** | Combines dual-resolution binary DEM ray-marching (`240 m` fine + `1,200 m` block-max coarse) in the browser with a two-mode Candidate Finder (`250×250` precomputed grid + `140` refined 5×5 blocks in Mode A, plus a live Web Worker scanner in Mode B) and side-by-side Scenario Compare. |
| **3. Validity** | Verified to `0.000198°` (Sun) and `0.006016°` (Earth) against JPL Horizons DE441 (`MOON_ME`), benchmarked in-app against Mazarico et al. (2011), Gläser et al. (2018), and NASA PDS `AVGVISIB` maps, and backed by 10 Python invariant tests + 67 Vitest tests (plus `ρ ≥ 0.97` Viability sensitivity check) with explicit non-overclaim guardrails. |
| **4. Relevance** | Directly addresses every dimension of the *Lunar Landing Site Navigator* challenge using NASA JPL Horizons, NASA PDS LRO LOLA (`LDEM_75S_240M`), NASA Artemis III 2024 9 candidate regions, GSFC PGDA, LROC QuickMap, Moon Trek, and CSA resources. |
| **5. Presentation** | Crisp dark-astronomy UI (`>= 12px` typography, collision-aware map labels, accessible modals, interactive glossary), self-contained 7-slide HTML/PDF deck, 30s video script, and exhaustive AI/SI disclosure. |

---

## 4. Bilingual Q&A Preparation Notes (English & Vietnamese for Hanoi Judges)

1. **Q: Why does your solver show `94.3%` sun-time (`90.1%` mean disk) at Connecting Ridge (`2 m` mast, 2026–2030) while Mazarico et al. (2011) reports `89.0%` mean (`92.7%` visibility)?**
   - **EN:** Three physical factors explain the difference, all documented in our *About & Data* modal: (1) Mazarico (2011) evaluated `0 m` surface height whereas our baseline uses a `2 m` lander mast (`+1–2%` illumination on sharp ridges); (2) our coordinates use the locally refined highest 240 m pixel (`offset 137 m`), matching NASA PDS `AVGVISIB_65S_240M` (`93.48%` within ±1 km); and (3) `2026–2030` (`4.1 yr`) is a specific slice of the `18.6-year` lunar nodal precession cycle.
   - **VI:** Có 3 lý do vật lý được trình bày rõ trong bảng đối chiếu *About & Data*: (1) Mazarico (2011) tính tại mặt đất `0 m`, còn baseline của app tính tại cột mast `2 m` (cao hơn mặt đất giúp vượt bóng các mô địa hình lân cận); (2) điểm Connecting Ridge được lấy tại pixel 240 m cao nhất trong ô (khớp sát với bản đồ NASA PDS 240 m là `93.48%`); và (3) giai đoạn `2026–2030` là lát cắt 4.1 năm của chu kỳ tiến động 18.6 năm.

2. **Q: How can a static web app ray-march a 360° horizon for any custom click on the South Pole without a backend server?**
   - **EN:** We ship two compact little-endian `Int16` binary DEM grids (`dem_fine_240m.i16` at `3.12 MB` covering `±150 km` at `240 m/px`, and `dem_coarse_1200m_max.i16` at `1.16 MB` covering `75°S–90°S` at `1,200 m/px` using `5×5` block-max aggregation). When a user drops a pin or runs Mode B scan, the browser lazily fetches those `4.28 MB` of typed arrays and marches 360 great-circle rays across 480 log-spaced steps in ~15 milliseconds (or off-thread in `scanAroundWorker.ts`). Cross-checks in `wp2.core.test.ts` prove custom pins match offline curated site metrics within `<= 2 percentage points`.
   - **VI:** Ứng dụng đóng gói 2 file nhị phân `Int16` gọn nhẹ (`dem_fine_240m.i16` 3.12 MB độ phân giải `240 m/px` trong vùng `±150 km`, và `dem_coarse_1200m_max.i16` 1.16 MB gộp `5×5` block-max tới `75°S`). Khi người dùng chấm điểm bất kỳ hoặc quét Mode B, trình duyệt tải lazy 2 mảng `Int16Array` này và phóng 360 tia cung tròn lớn qua 480 bước logarit chỉ trong ~15 ms (hoặc chạy trên Web Worker), sai lệch `<= 2 điểm %` so với pipeline Python.

3. **Q: Does a high Viability Score (e.g., `66.9` at Peak Near Shackleton or `61.8` at Malapert Summit) mean a site is certified safe for an Artemis HLS touchdown?**
   - **EN:** No—and we explicitly warn against that overclaim in the UI and documentation. `LDEM_75S_240M` has a `240 m/px` grid spacing, which captures regional slopes and horizon blockage but cannot resolve meter-scale boulders, small impact craters, or regolith bearing strength. Our Composite Viability Score is a transparent multi-objective screening index to shortlist promising `240 m` cells before targeted `5 m/px` (PGDA) and `1 m/px` (LROC NAC) hazard mapping.
   - **VI:** Không—và nhóm nhấn mạnh giới hạn này ngay trên giao diện. DEM `240 m/px` giải quyết bài toán che khuất đường chân trời và độ dốc vùng lớn, nhưng không nhìn thấy tảng đá hay hố va chạm cỡ mét. Điểm Viability là chỉ số sàng lọc đa mục tiêu minh bạch để chọn ra các vị trí ứng viên trước khi khảo sát địa hình độ phân giải `5 m/px` và `1 m/px`.

4. **Q: What is the scientific and mathematical justification for your Composite Viability Index (`0.35 Sun + 0.25 DTE + 0.15 Joint + 0.15 Dark + 0.10 Slope≤5°`)?**
   - **EN:** Our formula (`scoring.ts`) is a dimensionless **convex Multi-Criteria Decision Analysis (MCDA)** score (`Σw = 1.00`, every input strictly bounded in `[0, 100]`, zero unit-mixing distortion) anchored to Artemis South Pole engineering physics:
     - **50% Power & Cryogenic Night Survival (`0.35 Mean Solar Disk + 0.15 Dark Resilience`):** Solar arrays and battery survival against `~40–100 K` lunar darkness dominate South Pole mission mass budgets (Mazarico et al., 2011; Gläser et al., 2018). Crucially, we weight *mean visible solar disk fraction* (`sun_visible_pct`) rather than binary sunrise (`sun_time_pct`) so grazing rim slivers (`<0.266°` radius) are not over-credited for PV output, and we normalize longest continuous darkness against **30 days (`~1 synodic month`)**: `darkScore = 100 × (1 − min(max_dark_days, 30)/30)`. This separates brief outages (`Peak Near Shackleton: 5.67 d → 81.1`) from multi-week blackouts (`Nobile Rim 1: 18.58 d → 38.1`) and saturates cleanly at `0` for `≥30 d` PSR floors (`Shackleton PSR: 1,509 d → 0.0`).
     - **40% Comms & Concurrent Operations (`0.25 Earth DTE + 0.15 Joint Sun∩Earth`):** Because Earth oscillates via `±6.7° / ±8°` orbital libration independently of solar phase (`Connecting Ridge` gets `90.1%` Sun but `54.9%` DTE; `Mons Mouton Plateau` gets `100%` DTE vs `44.8%` Sun), DTE availability requires its own `0.25` axis, while `both_visible_pct` (`0.15`) rewards simultaneous sunlit + real-time teleoperation windows.
     - **10% Scale-Bounded Terrain Screening (`0.10 × 240 m Slope ≤5°`):** Aligns with the Artemis HLS `≤5°` regional landing threshold (Barker et al., 2023; Gläser et al., 2018), intentionally bounded at `10%` so coarse `240 m` smoothing never overrides horizon/power constraints (while still favoring flat plateaus like `Mons Mouton Plateau 33%` over spires like `Cabeus B 2.7%`, and returning `n/a` outside the DEM).
     - **Empirical Rank Validation (`17` South Pole DEM sites in `sites.json`):** Cleanly separates illuminated summits (`Peak Near Shackleton 66.9`, `Connecting Ridge 66.2`, `Leibnitz Beta 65.5`, `Malapert 61.8`) from shadowed benches (`de Gerlache Rim 2: 35.4`, `South Pole 90°S: 24.0`, `Shackleton PSR: 1.0`). Under `±5 percentage point` weight perturbations (`0.40/0.20` power-heavy or `0.30/0.30` comms-heavy), Spearman rank correlation remains **`ρ = 0.9853` and `0.9706`** (`0.9485` even vs equal `0.20` weights)—proving the ranking reflects genuine site physics rather than fragile weight tuning.
   - **VI:** Công thức `Viability Index` là tổ hợp lồi chuẩn hóa không thứ nguyên (`Σw = 1.00`, mọi thành phần nằm trong `[0, 100]`):
     - **50% Năng lượng & Sống sót đêm lạnh (`0.35 Sun Disk + 0.15 Dark Resilience`):** Tại cực Nam Mặt Trăng, nguồn điện Mặt Trời và sưởi chống đêm lạnh `40–100 K` là giới hạn khối lượng sống còn (Mazarico 2011; Gläser 2018). App dùng *phần trăm đĩa Mặt Trời trung bình* (`sun_visible_pct`) thay vì chỉ tính lúc hé sáng để tránh đánh giá ảo các khe tia sát chân trời, kết hợp chuẩn hóa chuỗi tối dài nhất theo chu kỳ **1 tháng giao hội (`30 ngày` = 708.7 h)**: giúp phân tách dãy núi ngắn ngày (`5.67 ngày → 81.1`) khỏi thềm tối dài (`18.58 ngày → 38.1`) và bão hòa về `0` ở vùng tối vĩnh viễn (`PSR 1,509 ngày → 0.0`).
     - **40% Liên lạc Trái Đất & Vận hành đồng thời (`0.25 Earth DTE + 0.15 Joint`):** Chu kỳ bình động Trái Đất (`±6.7° / ±8°`) độc lập với pha Mặt Trời (`Connecting Ridge`: 90.1% nắng nhưng chỉ 54.9% DTE; `Mons Mouton Plateau`: 100% DTE nhưng 44.8% nắng), nên cần `0.25` cho DTE và `0.15` cho cửa sổ *vừa có nắng vừa liên lạc trực tiếp* để làm khoa học mà không xả ắc-quy.
     - **10% Độ dốc an toàn chuẩn HLS (`0.10 × Slope ≤5°` trên lưới 240 m):** Theo ngưỡng hạ cánh mềm HLS `≤5°` (Barker 2023), chỉ giữ trọng số 10% đúng tỷ lệ của lưới thô `240 m/px` (và trả về `n/a` ngoài vùng DEM) để ưu ái các bình nguyên phẳng (`Mons Mouton 33%`) mà không tạo ảo giác chứng nhận bay cỡ mét.
     - **Kiểm chứng thực nghiệm & độ bền hạng:** Phân tách rạch ròi nhóm đỉnh sáng (`60.1–66.9`) vs cực Nam (`24.0`) vs hố tối vĩnh viễn (`Shackleton PSR 1.0`). Khi dao động trọng số `±5 điểm %`, hệ số tương quan hạng Spearman đạt **`ρ = 0.9853`** và **`0.9706`** (`0.9485` ngay cả khi so với chia đều 20%) — chứng tỏ thứ hạng phản ánh bản chất địa hình–thiên văn chứ không phụ thuộc gán số cảm tính.

5. **Q: On the Dashboard HUD (e.g., Malapert Massif), why can `SOLAR ARRAY` show `100% Lit` while `Horizontal Panel` shows only `1.4%`, and `EARTH DTE` shows `54%` with `Mask 0°/2°/5°`?**
   - **EN:** Each KPI ring distinguishes its exact timescale and physics:
     - **`100% Lit` (`+0.80° El, +2.46° clr`)** is **instantaneous** (`trackingPct` at timestamp `t`), meaning 100% of the `0.53°` Sun disk clears the `240 m` terrain ridge right now by `+2.46°` (with `80.9d` continuous sunlight until the next transition).
     - **`Horizontal Panel 1.4%`** multiplies that disk fraction by **`sin(elDeg)` (`sin(0.80°) = 0.01396 ≈ 1.4%`)**—Lambert's cosine incidence law for a flat horizontal deck panel near the pole, proving visually why polar landers/rovers require vertical or sun-tracking solar arrays!
     - **`EARTH DTE 54%` (`336h DTE Window`) + `Mask 0° / 2° / 5°`:** `54%` (`summary.earthPct`) and `Joint 54%` (`summary.bothPct`) measure DTE and Sun∩Earth availability over the **active selected telemetry window (`336h` = 14 days)** shown at the top of the card (`+3.88° El / +4.75°` above horizon now, `In View`), whereas **Card 4 (`Viability Index 61.8`)** always uses Malapert's **full 4.1-year (`36,216h`)** baseline (`75.9% DTE`, `55.5% Joint`). Toggling `Mask 0° / 2° / 5°` adds an artificial horizon-clearance safety margin above terrain to model S/Ka-band multipath/diffraction clearance.
   - **VI:** Mỗi thẻ KPI phân biệt rõ thang thời gian và bản chất vật lý:
     - **`100% Lit`** là **giá trị tức thời tại thời điểm `t`** của *tấm pin dựng đứng xoay theo Mặt Trời* (100% đĩa Mặt Trời vượt rìa núi `+2.46°`, còn `80.9 ngày` nữa mới tới hoàng hôn); còn **`Horizontal Panel 1.4%`** nhân thêm **`sin(0.80°) ≈ 1.4%`** theo định luật cosin Lambert cho tấm pin đặt ngang — lý giải trực quan tại sao tàu cực Nam bắt buộc dùng cột pin dựng đứng/xoay trục.
     - **`EARTH DTE 54%` (`336h DTE Window`) & `Joint 54%`:** Đây là tỷ lệ % trong **cửa sổ thời gian 14 ngày (`336h`) đang xem** (đổi sang cửa sổ dài hơn sẽ tiệm cận giá trị trung bình 4.1 năm là `75.9% DTE` / `55.5% Joint` dùng để tính **`Viability Index 61.8`** ở thẻ bên cạnh). Nút **`Mask 0° / 2° / 5°`** giả lập biên an toàn góc ngẩng (link margin) tránh nhiễu đa đường khi Trái Đất sát rìa núi.

6. **Q: Why do `240 m Slope 1.84°`, `Rover 5.9°`, `30 km ≤5° 7%`, and `Max Dark 0.0d` show different numbers in the same slope card?**
   - **EN:** Because they measure different spatial and temporal scopes: **`1.84° baseline`** is the local slope at the selected pin (`240 m` LOLA raster), **`Rover 5.9°`** (`Pitch +5.6° / Roll +2.0°`) is the real-time 3D tilt of the roving vehicle (`≈ √(5.6² + 2.0²)`) at its current traverse waypoint, **`30 km ≤5° 7%`** is the macro fraction of flat `≤5°` terrain across the surrounding **`30 × 30 km` (`125 × 125 px`) landing zone** (Malapert Summit is a steep peak, so only 7% of the surrounding massif is `≤5°`), and **`Max Dark 0.0d`** is the longest dark streak inside the currently active `336h` window (whereas multi-year 2026–2030 `max_dark_days` is `15.25 d`).
   - **VI:** Mỗi số ứng với đúng phạm vi không gian–thời gian của nó: **`1.84°`** là độ dốc tại tâm mốc lưới `240 m`, **`Rover 5.9°`** là độ nghiêng tức thời thực tế của xe rover đang đậu trên sườn núi (`√(Pitch² + Roll²)`), **`30 km ≤5° 7%`** là tỷ lệ ô phẳng `≤5°` trong vùng **`30×30 km`** xung quanh, còn **`Max Dark 0.0d`** là chuỗi tối dài nhất *trong cửa sổ `336h` đang xem* (còn xét cả chu kỳ 4.1 năm của `Viability` thì Malapert có `max_dark_days = 15.25 ngày`).

7. **Q: Why does the 3D viewport offer both `1× Real` and `3×–15×` vertical relief?**
   - **EN:** Lunar elevation already spans `~14 km` across our South Pole DEM (`~-5.8 km` floor to `+8.2 km` peaks), so **`1× Real`** renders true 1:1 physical proportions (`1 m` vertical = `1 m` horizontal, accurate apparent horizon perspective from Mast POV), while **`3×–15×`** provides geological relief exaggeration standard in planetary GIS/Moon Trek tools to spot subtle terraces and crater rims from orbital overview—and hovering/selecting `1× Real` explicitly shows the distinction.
   - **VI:** Vì biên độ cao vùng cực Nam Mặt Trăng đã chênh lệch tới ~14 km giữa đáy hố và đỉnh núi, chế độ **`1× Real`** hiển thị đúng tỷ lệ vật lý **1:1 ngoài đời thật** (quan trọng khi nhìn góc nhìn camera trên cột mast của rover), trong khi **`3×–15×`** là hệ số phóng đại địa hình tiêu chuẩn trong bản đồ hành tinh để dễ phân biệt thềm dốc từ trên quỹ đạo.

---

## 5. Final Pre-Submission Checklist (Complete Before `10:30 AM GMT+7, Sun 15/11/2026`)

- [ ] **1. Push Clean Repo to Public GitHub (`NASA-Space-Apps-Challenge-2026`):** Verify `LICENSE` (Apache-2.0), `README.md`, `submission/*`, `scripts/*`, `tests/*`, and `webapp/*` are pushed and the repository visibility is **Public**.
- [ ] **2. Deploy Static Web App (`webapp/dist`):** Deploy to Cloudflare Pages / Vercel / Netlify / GitHub Pages and insert the live URL into `README.md` and `submission/NASA_SUBMISSION_FORM.md`.
- [ ] **3. Export 7-Slide Deck to PDF (`submission/PITCH_DECK_7_SLIDES.html`):** Open `submission/PITCH_DECK_7_SLIDES.html` in Chrome -> `Ctrl+P` -> Destination: `Save as PDF` -> Layout: `Landscape`, Margins: `None`, Background graphics: `Checked` -> Verify exactly **7 pages**.
- [ ] **4. Upload Deck (or <=30s Video) + `USE_OF_AI_AND_SI_DISCLOSURE.md` to Google Drive:** Set sharing on both files/folders to **"Anyone with the link can view"**.
- [ ] **5. Incognito Link Test:** Open a fresh Incognito window and verify: (a) Live Web App URL, (b) Public GitHub Repo URL, (c) 7-Slide PDF / 30s Video URL, and (d) AI/SI Disclosure Drive URL all load without sign-in prompts.
- [ ] **6. Submit on `spaceappschallenge.org/2026/find-a-team/verifour/?tab=project`:** Paste all fields from `submission/NASA_SUBMISSION_FORM.md`, save before **11:00 AM GMT+7 Sunday 15/11**, and capture a confirmation screenshot.

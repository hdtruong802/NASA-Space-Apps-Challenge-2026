# Lunar Landing Site Navigator — 5-Minute Live Demo Script & Production Blueprint

- **Project:** Lunar Landing Site Navigator (NASA Space Apps Challenge 2026 — Hanoi, Vietnam)
- **Team:** **Team VeriFour** — `Linh Nguyen · Duc-Truong Hoang · Nguyễn Tiến · Le Thien Khang · Tran Nguyen My Anh` *(Hanoi 2026 · Portal: `https://www.spaceappschallenge.org/2026/find-a-team/verifour/?tab=project`)*
- **Live Web App:** `https://lunar.agentlens.dpdns.org/`
- **Target Runtime:** **300.0 seconds (5:00)** across **10 real-capture chapters** (`1280×720`, `24 fps`, H.264 / AAC)
- **Companion Deliverables:**
  - Bilingual subtitle track: [`submission/DEMO_VIDEO_5MIN_BILINGUAL.srt`](DEMO_VIDEO_5MIN_BILINGUAL.srt)
  - Automated video/audio composer: [`scripts/compose_demo_video.py`](../scripts/compose_demo_video.py)
  - Final 5-minute demo output: `submission/Lunar_Landing_Site_Navigator_5Min_Demo.mp4`
  - Optional <=30s global pitch output (`--make-30s`): `submission/Lunar_Landing_Site_Navigator_30s_Pitch.mp4`

> **Team Credits & Scientific Integrity Note:**
> Built by **Team VeriFour** (`Linh Nguyen · Duc-Truong Hoang · Nguyễn Tiến · Le Thien Khang · Tran Nguyen My Anh`), collaborating across planetary physics, LRO LOLA / JPL Horizons data engineering, 3D WebGL simulation, cosmic UX, and submission validation. Every claim in this script strictly matches verified code, data, and automated tests: `LDEM_75S_240M` (`240 m/px`) supports exploratory South Pole mission screening rather than meter-scale boulder/footpad flight certification; directional ephemeris validation achieves max error `0.000198°` (Sun) and `0.006016°` (Earth) vs. JPL Horizons `DE441 / MOON_ME`; zero AI-generated terrain, imagery, or video is used.

---

## 1. Mapping to the 5 Official NASA Judging Criteria

| Judging Criterion | Covered Chapters | Concrete Evidence Shown Live in App |
| --- | --- | --- |
| **1. Impact** | Ch 1, Ch 2, Ch 4, Ch 9, Ch 10 | Turns raw NASA LRO LOLA & JPL Horizons geodesy into a zero-backend browser planner (`31` sites, `36,216` hours, shareable URL permalinks, Markdown `Export Brief`, interactive 4-tab `Getting Started` + `Explain` cards for engineers & classrooms). |
| **2. Creativity** | Ch 3, Ch 6, Ch 7, Ch 9 | GPU Three.js South Pole terrain (`360×360` mesh, `J2000` starfield, `5` surface overlays) + 6-wheel rover (`WASD`/Autopilot + `Fly/Land` VTOL Hopper mode, `1×–1000×` gears, `4` cameras) + `Command Split` + `15 ms` client ray-marched Custom Probe + Mode A/B Candidate Finder + `VeriFour NASA RAG Assistant`. |
| **3. Validity** | Ch 2, Ch 4, Ch 5, Ch 10 | Verified `<= 0.000198°` (Sun) and `<= 0.006016°` (Earth) vs. JPL Horizons DE441; distinguishes `sun_time_pct` vs. `sun_visible_pct` & Lambert `sin(El)` horizontal panel scaling; cross-checked in `About & Data` against Mazarico et al. (2011), De Rosa et al. (2012), Gläser et al. (2014, 2018), Barker et al. (2021, 2023), and PDS `AVGVISIB`. |
| **4. Relevance** | Ch 1, Ch 3, Ch 5, Ch 7, Ch 8 | Directly solves the *Lunar Landing Site Navigator* South Pole illumination & DTE communication problem using NASA JPL Horizons, NASA PDS LRO LOLA (`LDEM_75S_240M`), `9` official Artemis III 2024 region boundaries, GSFC PGDA, LROC QuickMap, Moon Trek, and CSA partner resources. |
| **5. Presentation** | All 10 Chapters | Cohesive NASA Eyes-inspired cosmic dark glass UI, sticky `Explain Header` / `Explain Section` 7-step spotlight tour, crisp English narration (`Microsoft Zira Desktop`), synced bilingual EN/VI subtitles, original copyright-free cosmic ambient score, and smooth `0.4s` chapter dissolves. |

---

## 2. Chapter-by-Chapter Screen Capture & Bilingual Narration Script (`300.0s`)

### Chapter 1 (`seg01.mp4` · `00:00.0 – 00:26.0` · `26.0s`)
**Title Badge:** `Ch 1/10 · Cosmic 3D Overview & Sticky Explain Tour`  
**Live Screen Action:** Open `3D Rover & Surface` on `Connecting Ridge` (`2027-06-25 16:00 UTC`), show cosmic J2000 sky, switch target selector across `31` sites (`Malapert Massif`, `Shackleton PSR`, back to `Connecting Ridge`), click `Deploy Rover`, then toggle sticky `Explain Header` and `Explain Section` spotlight guides.

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `00:00.0 – 00:04.2` | Team VeriFour presents Lunar Landing Site Navigator. | Nhóm VeriFour giới thiệu Lunar Landing Site Navigator. |
| `00:04.2 – 00:08.6` | At the lunar South Pole, razor-thin sunlight meets deep shadow. | Tại cực Nam Mặt Trăng, nắng sát chân trời kề bên bóng tối sâu. |
| `00:08.6 – 00:12.8` | One ridge can stay lit for weeks while craters stay frozen. | Một sống núi sáng nhiều tuần, còn đáy hố đóng băng vĩnh viễn. |
| `00:12.8 – 00:17.2` | Built in React and Three.js, it runs live in your browser. | Xây bằng React và Three.js, ứng dụng chạy trực tiếp trên web. |
| `00:17.2 – 00:21.6` | Switch across 31 curated sites and teleport the 3D rover. | Chuyển đổi giữa 31 địa điểm chọn lọc và thả rover 3D ngay. |
| `00:21.6 – 00:26.0` | Sticky Explain Header and Section cards guide every control. | Thẻ Explain Header và Explain Section giải thích từng nút. |

---

### Chapter 2 (`seg02.mp4` · `00:26.0 – 00:50.0` · `24.0s`)
**Title Badge:** `Ch 2/10 · Getting Started & Lunar Physics Guide`  
**Live Screen Action:** Click `Getting Started` in header; step through Tab 1 (`1 · Choose & Quick-Start` presets + 7-section map), Tab 2 (`2 · 5 Workspaces`), Tab 3 (`3 · Read KPIs & Instruments`), and spend extra time on Tab 4 (`4 · Physics & Eclipses`: `1.54°` axial tilt, `±6.7° / ±6.9°` libration, JPL check, `9` eclipses).

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `00:26.0 – 00:30.2` | Open Getting Started for a four-tab mission onboarding guide. | Mở Getting Started để xem hướng dẫn nhiệm vụ gồm bốn thẻ. |
| `00:30.2 – 00:34.2` | Launch one-click presets or jump into any workspace tab. | Chạy kịch bản mẫu một chạm hoặc mở nhanh từng không gian. |
| `00:34.2 – 00:38.2` | Inspect every gauge definition and physical limit up front. | Xem ý nghĩa từng đồng hồ đo và giới hạn vật lý ngay từ đầu. |
| `00:38.2 – 00:42.2` | Tab four explains the Moon's 1.54-degree axial tilt. | Thẻ bốn giải thích độ nghiêng trục 1,54 độ của Mặt Trăng. |
| `00:42.2 – 00:46.2` | It shows why ±6.7-degree Earth libration shifts radio links. | Giải thích bình động ±6,7 độ làm Trái Đất mọc lặn ra sao. |
| `00:46.2 – 00:50.0` | JPL checks and all nine eclipses stay one click away. | Kiểm chứng JPL và chín kỳ nhật thực chỉ cách một lần nhấp. |

---

### Chapter 3 (`seg03.mp4` · `00:50.0 – 01:28.0` · `38.0s`)
**Title Badge:** `Ch 3/10 · 3D Rover, VTOL Hopper, Cameras & Shaders`  
**Live Screen Action:** Drive 6-wheel rover with `WASD`/D-pad + double-click terrain autopilot waypoint; press `F` (`Fly/Land`) to enter VTOL Hopper Flight Mode and climb/hover over crater rim, then land; cycle gears `1×` to `1000×`; switch cameras `Chase -> Mast POV -> Orbit -> Free Cam`; toggle `1× Real` vs `6×` Relief; cycle surface layers `Regolith -> Sun -> Earth -> Slope -> Composite`, framing J2000 starfield, Sun corona, and Earth DTE beam.

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `00:50.0 – 00:54.2` | Deploy the six-wheel rover on real 240-meter LOLA terrain. | Triển khai rover sáu bánh trên địa hình LOLA 240 mét thực. |
| `00:54.2 – 00:58.4` | Drive with WASD, virtual keys, or click-to-drive autopilot. | Lái bằng WASD, phím ảo, hoặc nhấp địa hình để xe tự hành. |
| `00:58.4 – 01:02.6` | Press F for Fly/Land VTOL Hopper mode to soar over craters. | Nhấn F bật chế độ bay Fly/Land VTOL vượt qua miệng hố sâu. |
| `01:02.6 – 01:06.8` | Shift gears from 1x real drive speed up to 1000x survey warp. | Đổi năm cấp tốc độ từ 1× thực tế đến 1000× khảo sát nhanh. |
| `01:06.8 – 01:11.0` | Switch four cameras: Chase, Mast POV, Orbit, and Free Cam. | Chuyển bốn góc máy: Chase, Mast POV, Orbit và Free Cam. |
| `01:11.0 – 01:15.4` | Compare true 1x Real scale against 6x geological relief. | Đối chiếu tỷ lệ thật 1× Real với địa hình phóng đại 6×. |
| `01:15.4 – 01:19.6` | Overlay five live 3D shaders: Regolith, Sun, Earth, Slope. | Phủ năm lớp 3D trực tiếp: Regolith, Sun, Earth và Slope. |
| `01:19.6 – 01:23.8` | Composite blends power, communications, and slope together. | Lớp Composite kết hợp năng lượng, liên lạc và độ dốc. |
| `01:23.8 – 01:28.0` | Notice the J2000 starfield, glowing Sun, and Earth DTE beam. | Quan sát bầu trời sao J2000, Mặt Trời và tia DTE Trái Đất. |

---

### Chapter 4 (`seg04.mp4` · `01:28.0 – 01:54.0` · `26.0s`)
**Title Badge:** `Ch 4/10 · 4 Live Telemetry KPIs & Science Notes`  
**Live Screen Action:** Focus on the 4 `CircularRingGauge` KPI cards (`Solar Array`, `Earth DTE` toggling `Mask 0° / 2° / 5°`, `240 m Slope & Tilt`, `Viability Index`), then expand `Science & Methodology Notes` to show coordinate provenance, terrain vs. smooth sphere baseline, `±240 m` drift sensitivity, and glossary pills.

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `01:28.0 – 01:32.2` | Four circular telemetry rings track live site physics. | Bốn vòng đo trực tiếp theo dõi vật lý tại vị trí hiện tại. |
| `01:32.2 – 01:36.6` | Solar Array contrasts vertical tracking against flat panels. | Vòng Solar Array so sánh pin xoay đứng với pin đặt nằm ngang. |
| `01:36.6 – 01:41.0` | Earth DTE tracks active-window links with 0, 2, or 5° masks. | Earth DTE đo liên lạc cửa sổ kèm mặt nạ góc ngẩng 0, 2, 5°. |
| `01:41.0 – 01:45.4` | 240 m Slope pairs regional terrain with live rover tilt. | Thẻ 240 m Slope ghép độ dốc vùng với góc nghiêng xe thực. |
| `01:45.4 – 01:49.8` | Viability Index scores 4.1-year power, comms, and darkness. | Viability Index chấm điểm 4,1 năm về điện, liên lạc, đêm dài. |
| `01:49.8 – 01:54.0` | Science & Methodology Notes reveal provenance and ±240m drift. | Mục Science & Methodology Notes mở nguồn tọa độ và sai số ±240 m. |

---

### Chapter 5 (`seg05.mp4` · `01:54.0 – 02:26.0` · `32.0s`)
**Title Badge:** `Ch 5/10 · 2026–2030 Timeline, Sensitivity & Eclipses`  
**Live Screen Action:** Scrub the `36,216`-step 2026–2030 Mission Timeline (`14-Day Timeline & Sensitivity`), inspect the 14-day Sun/Earth/Joint strips, click across `50-Month Launch Sensitivity` bars, and click the `2028-12-31` total eclipse shortcut to watch the 3D Sun dim/redden and array output drop.

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `01:54.0 – 01:58.2` | Below, the Mission Timeline spans 36,216 hourly steps. | Bên dưới, thanh thời gian phủ 36.216 bước giờ 2026–2030. |
| `01:58.2 – 02:02.4` | Scrub any UTC hour from November 2026 through 2030. | Kéo đến bất kỳ giờ UTC nào từ tháng 11/2026 hết năm 2030. |
| `02:02.4 – 02:06.6` | Inspect 14-day hourly strips for Sun, Earth, and Joint ops. | Xem dải giờ 14 ngày của Nắng, Trái Đất và cửa sổ đồng thời. |
| `02:06.6 – 02:11.0` | The 50-Month Launch Sensitivity strip reveals weekly shifts. | Biểu đồ 50-Month Launch Sensitivity chỉ ra biến động theo tuần. |
| `02:11.0 – 02:15.4` | Test how launching a week later changes joint mission uptime. | Thử lùi ngày phóng một tuần để thấy tỷ lệ vận hành thay đổi. |
| `02:15.4 – 02:19.8` | Jump straight to any of nine cataloged lunar solar eclipses. | Nhảy thẳng tới một trong chín kỳ nhật thực từ Mặt Trăng. |
| `02:19.8 – 02:22.9` | Watch the Dec 31, 2028 total eclipse unfold. | Quan sát nhật thực toàn phần ngày 31/12/2028. |
| `02:22.9 – 02:26.0` | The 3D Sun dims red as array output drops. | Mặt Trời 3D chuyển đỏ sẫm và công suất pin tụt giảm. |

---

### Chapter 6 (`seg06.mp4` · `02:26.0 – 02:54.0` · `28.0s`)
**Title Badge:** `Ch 6/10 · 360° Horizon Sky & Traverse Profile`  
**Live Screen Action:** Switch Bottom Dock to `360° Horizon Sky & Panorama`; adjust mast height from `0.5 m` -> `2 m` -> `10 m` -> `50 m` showing dashed ghost horizon clearance and Polar Sky Dome arcs; switch to `Rover Traverse Elevation Profile` tab showing driven route elevation, slope, and Earth link continuity.

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `02:26.0 – 02:30.0` | Open 360° Horizon Sky & Panorama to see local ridges. | Mở tab 360° Horizon Sky & Panorama xem đường chân trời. |
| `02:30.0 – 02:34.0` | Solar and Earth paths trace cleanly above the terrain mask. | Đường đi Mặt Trời và Trái Đất hiện rõ trên nền dãy núi. |
| `02:34.0 – 02:38.2` | Slide mast height from 0.5 meters up to 50 meters tall. | Kéo độ cao cột mast từ 0,5 mét lên tối đa 50 mét. |
| `02:38.2 – 02:42.4` | Dashed ghost horizons show how taller masts clear crater rims. | Đường đứt nét chỉ rõ cột cao giúp vượt bóng rìa hố. |
| `02:42.4 – 02:46.2` | Beside it, the Polar Sky Dome tracks real-time azimuth. | Bên cạnh, vòm trời cực theo dõi góc phương vị tức thời. |
| `02:46.2 – 02:50.0` | Switch to the Rover Traverse Elevation Profile tab. | Chuyển sang tab Rover Traverse Elevation Profile. |
| `02:50.0 – 02:54.0` | Review elevation, slope, and Earth link continuity by km. | Xem biểu đồ cao độ, độ dốc và liên lạc theo từng km đã chạy. |

---

### Chapter 7 (`seg07.mp4` · `02:54.0 – 03:26.0` · `32.0s`)
**Title Badge:** `Ch 7/10 · Command Split & 2D Map Custom Probe`  
**Live Screen Action:** Open `Command Split` workspace showing 3D + 2D Polar Map + 360° Sky synced while scrubbing time; switch to `2D Map & Sky`; toggle `±150 km` South Pole heatmaps (`Sun %`, `Earth DTE %`), `9` Artemis III 2024 region overlays, `Global Moon` view, and click on a polar rim to drop a `Custom Probe Pin` (browser ray-marching 360 rays in ~15 ms).

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `02:54.0 – 02:58.2` | Command Split pairs 3D terrain, 2D map, and 360° sky together. | Command Split ghép đồng bộ 3D, bản đồ 2D và bầu trời 360°. |
| `02:58.2 – 03:02.4` | Move the clock or rover once, and every panel updates in sync. | Chỉnh giờ hay lái rover một lần, cả ba khung đều cập nhật. |
| `03:02.4 – 03:06.8` | Switch to 2D Map & Sky for the ±150 km South Pole cartography. | Chuyển sang 2D Map & Sky xem bản đồ cực Nam phạm vi ±150 km. |
| `03:06.8 – 03:11.0` | Nine official Artemis III 2024 region polygons drape the map. | Chín vùng ứng viên Artemis III 2024 phủ trực tiếp trên bản đồ. |
| `03:11.0 – 03:15.2` | Toggle Solar, Earth DTE, or Global Moon view for full context. | Bật lớp Nắng, Earth DTE hoặc Global Moon xem toàn cầu. |
| `03:15.2 – 03:19.4` | Click anywhere inside 75°S to drop a Custom Probe Pin. | Nhấp điểm bất kỳ từ 75°N để đặt Custom Probe Pin tự do. |
| `03:19.4 – 03:22.7` | The browser streams compact binary LOLA grids. | Trình duyệt tải gọn lưới nhị phân LOLA trực tiếp. |
| `03:22.7 – 03:26.0` | It ray-marches 360 great-circle rays in 15 ms. | Phóng 360 tia cung tròn lớn trong khoảng 15 ms. |

---

### Chapter 8 (`seg08.mp4` · `03:26.0 – 03:50.0` · `24.0s`)
**Title Badge:** `Ch 8/10 · Compare A vs B Trade-Off Analysis`  
**Live Screen Action:** Open `Compare A vs B`, compare `Connecting Ridge` against `Shackleton PSR Floor` and then `Malapert Massif` / `Mons Mouton Plateau`, toggle synced vs. independent UTC timestamp & mast height for Scenario B, and inspect side-by-side horizon & window deltas.

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `03:26.0 – 03:30.0` | Open Compare A vs B to weigh two lunar targets head-to-head. | Mở Compare A vs B để đặt hai bãi đáp lên bàn cân trực diện. |
| `03:30.0 – 03:34.0` | Contrast sunlit ridges against Shackleton PSR or Malapert. | So sánh sườn núi sáng với đáy hố tối Shackleton hoặc Malapert. |
| `03:34.0 – 03:38.0` | Sync timelines or give Site B its own clock and mast height. | Đồng bộ thời gian hoặc gán giờ UTC và cột mast riêng cho B. |
| `03:38.0 – 03:42.0` | Spot why high sunlight does not guarantee high Earth DTE. | Thấy ngay vì sao nhiều nắng chưa chắc liên lạc DTE cao. |
| `03:42.0 – 03:46.0` | Compare max night, joint windows, and 240 m slopes. | So chuỗi đêm dài nhất, cửa sổ đồng thời và độ dốc 240 m. |
| `03:46.0 – 03:50.0` | Pick the balance of power, radio link, and terrain safety. | Chọn phương án cân bằng giữa điện, sóng radio và địa hình. |

---

### Chapter 9 (`seg09.mp4` · `03:50.0 – 04:22.0` · `32.0s`)
**Title Badge:** `Ch 9/10 · Candidate Directory 31 & Share/Export`  
**Live Screen Action:** Open `Candidate Directory`, inspect `31` curated sites + `Mode A` (`250×250` grid + `140` refined `5×5` 240 m blocks), switch ranking criteria & slope/spacing filters, run `Mode B` live Web Worker neighborhood scan, click `Share` (copy permalink) and `Export Brief` (download Markdown report).

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `03:50.0 – 03:54.4` | Candidate Directory unifies 31 curated lunar targets. | Candidate Directory tổng hợp 31 mục tiêu Mặt Trăng chọn lọc. |
| `03:54.4 – 03:59.0` | Mode A filters 62,500 cells across the 250×250 grid. | Chế độ Mode A lọc 62.500 ô trên lưới cực 250×250 tính sẵn. |
| `03:59.0 – 04:03.6` | It refines 140 top 5×5 summit blocks at 240 m/px. | Kèm 140 khối đỉnh 5×5 tinh chỉnh ở độ phân giải 240 m/px. |
| `04:03.6 – 04:08.2` | Rank picks by Viability, Sun Disk, DTE, or Shortest Night. | Xếp hạng theo Viability, Nắng, Earth DTE hoặc Đêm ngắn nhất. |
| `04:08.2 – 04:12.8` | Mode B runs a live Web Worker scanner around any site. | Mode B chạy bộ quét Web Worker trực tiếp quanh tọa độ chọn. |
| `04:12.8 – 04:17.4` | Click Share to copy a deep link encoding your exact state. | Nhấn Share để sao chép liên kết giữ nguyên toàn bộ cấu hình. |
| `04:17.4 – 04:22.0` | Click Export Brief to download a full Markdown mission report. | Nhấn Export Brief tải ngay báo cáo kỹ thuật dạng Markdown. |

---

### Chapter 10 (`seg10.mp4` · `04:22.0 – 05:00.0` · `38.0s`)
**Title Badge:** `Ch 10/10 · NASA RAG Chat, Validation & Vision`  
**Live Screen Action:** Open `NASA AI Chat` (`VeriFour NASA RAG Assistant`), click starter question (`NASA Data vs Mazarico 2011 / Barker 2023`) showing cited NASA sources + offline VeriFour fallback banner, then open `About & Data` showing JPL Horizons (`0.000198°` Sun / `0.006016°` Earth), Mazarico (2011) cross-check table, `240 m` scope boundaries, and `Apache-2.0` Team VeriFour attribution, finishing on cosmic 3D Moon/Earth view.

| Timecode | English Voiceover & Subtitle (Line 1) | Vietnamese Subtitle (Line 2) |
| --- | --- | --- |
| `04:22.0 – 04:26.4` | Open NASA AI Chat to launch VeriFour NASA RAG Assistant. | Mở NASA AI Chat dùng trợ lý VeriFour NASA RAG Assistant. |
| `04:26.4 – 04:30.8` | Ask questions grounded in live telemetry and cited NASA papers. | Hỏi đáp dựa trên thông số thực và trích dẫn bài báo NASA. |
| `04:30.8 – 04:35.0` | Built-in VeriFour fallback still works with zero API keys. | Chế độ dự phòng của VeriFour vẫn trả lời khi chưa có API key. |
| `04:35.0 – 04:39.4` | Open About & Data to inspect full scientific validation. | Mở About & Data để kiểm tra toàn bộ đối chứng khoa học. |
| `04:39.4 – 04:43.8` | Sun and Earth align within 0.000198° and 0.006016° of JPL. | Sai lệch góc Mặt Trời 0,000198° và Trái Đất 0,006016° so JPL. |
| `04:43.8 – 04:48.2` | Outputs cross-check Mazarico 2011 and Barker 2023 studies. | Kết quả đối chiếu cùng nghiên cứu Mazarico 2011 và Barker 2023. |
| `04:48.2 – 04:52.4` | 240 m LOLA supports screening, not meter-scale clearance. | Dữ liệu LOLA 240 m phục vụ sàng lọc, không thay kiểm tra đá tảng. |
| `04:52.4 – 04:56.2` | Apache-2.0 open source with zero AI-generated terrain. | Mã nguồn mở Apache-2.0, hoàn toàn không dùng địa hình AI tạo. |
| `04:56.2 – 05:00.0` | Team VeriFour: empowering humanity's return to the Moon. | Thực hiện bởi Team VeriFour — vì hành trình trở lại Mặt Trăng. |

---

## 3. Optional 30-Second Global Portal Cut (`--make-30s`, `28.0s` Total)

Matches the 5 official NASA Space Apps 30-second video milestones (`<= 30.0s`, zero NASA logos):
- `[00:00.0 – 00:02.5]` (`seg01`): *"Team VeriFour presents Lunar Landing Site Navigator."* *(or `--presenter "Your Name"`)*
- `[00:02.5 – 00:06.0]` (`seg01`): *"Extreme polar shadows inspired our lunar landing challenge."*
- `[00:06.0 – 00:11.0]` (`seg03`): *"Lunar Landing Site Navigator: live 3D sunlight, Earth-link, and rover planning."*
- `[00:11.0 – 00:20.0]` (`seg03` + `seg07` + `seg09`): *"Using open NASA LOLA, JPL Horizons, and CSA partner resources, you drive a 3D rover, probe horizons, and rank sites."*
- `[00:20.0 – 00:28.0]` (`seg10`): *"Browser-ready and open-source under Apache-2.0, it helps missions and classrooms worldwide plan humanity's return to the Moon."*

# Kịch Bản Thuyết Minh & Demo Dễ Hiểu — Team VeriFour

Tài liệu này viết theo ngôn ngữ **trực quan, dễ hiểu cho khán giả phổ thông lẫn Ban Giám Khảo**, khớp trực tiếp với video [VeriFour_Lunar_Pitch_30s_VI.mp4](VeriFour_Lunar_Pitch_30s_VI.mp4) (đã bỏ tên cá nhân và chữ mốc thời gian) và giao diện thật tại `https://lunar.agentlens.dpdns.org/`.

---

## Phần 1: Lời Thuyết Minh Ngắn 30 Giây (Đọc Khớp Theo Video)

*(Video hiện dài `28.50s`, có sẵn nhạc nền và thẻ chữ tiếng Việt. Nếu cần đọc voiceover hoặc thuyết minh live đè lên video, chỉ cần đọc đúng 7 câu ngắn dưới đây theo từng cảnh đổi màn hình — tổng ~75–85 từ, đọc bình tĩnh tự nhiên sẽ vừa khít ~26–28 giây.)*

1. **Cảnh 1 — Mở đầu (3D Rover trên đỉnh núi Cực Nam):**
   > *"Xin chào! Chúng tôi là Nhóm VeriFour, mang đến **Lunar Landing Site Navigator** — công cụ lập kế hoạch điểm đáp, năng lượng và liên lạc Mặt Trăng."*

2. **Cảnh 2 — Đặt vấn đề (Địa hình sáng tối đối lập ở Cực Nam):**
   > *"Ở Cực Nam Mặt Trăng, độ nghiêng trục chỉ 1,54 độ khiến bóng núi kéo dài nhiều tuần — có chỗ có nắng nhưng chưa chắc nhìn thấy Trái Đất để truyền tín hiệu."*

3. **Cảnh 3 — Giới thiệu giải pháp (`Command Split` & `Compare A vs B`):**
   > *"Công cụ của chúng tôi cho phép chọn ngay bãi đáp, đổi ngày giờ từ năm 2026 đến 2030, và so sánh trực tiếp cửa sổ có nắng lẫn liên lạc Trái Đất (DTE)."*

4. **Cảnh 4 — Cơ sở khoa học (`2D Map & Sky`):**
   > *"Trên nền bản đồ địa hình NASA LOLA 240 m và quỹ đạo JPL Horizons sai số dưới 0,0002 độ, app quét chân trời 360 độ và thử nâng cột pin từ 2 m lên 10 m để giảm bóng tối."*

5. **Cảnh 5 — Sàng lọc & Đối tác (`Candidate Directory`):**
   > *"Hệ thống tự chấm điểm 62.500 tọa độ, 9 vùng Artemis III và 31 bãi đáp theo độ khả thi — kết hợp tài nguyên đối tác từ Cơ quan Vũ trụ Canada (CSA)."*

6. **Cảnh 6 — Kiểm chứng thực địa (`3D Rover & Surface`):**
   > *"Người dùng còn có thể tự lái xe Rover 3D bám sát độ dốc thật để kiểm tra pin Mặt Trời và tia liên lạc Trái Đất tại từng vị trí."*

7. **Cảnh 7 — Tương lai (Kết thúc trên khung cảnh toàn cảnh):**
   > *"Chạy ngay trên trình duyệt và hoàn toàn mã nguồn mở, sẵn sàng hỗ trợ các sứ mệnh Artemis cũng như lớp học toàn cầu cho hành trình trở lại Mặt Trăng — và xa hơn nữa."*

---

## Phần 2: Kịch Bản Thuyết Minh Kèm Thao Tác Demo Trực Tiếp (3–5 Phút)

Dùng khi trình bày trực tiếp trước Ban Giám Khảo trên `https://lunar.agentlens.dpdns.org/` (chú ý bấm đúng nút/tab trong lúc nói để khán giả **nhìn thấy ngay câu nói biến thành số liệu**).

### Bước 1: Mở đầu & Bối cảnh bài toán (~40 giây)
- **Thao tác trên app:** Mở tab **3D Rover & Surface**, chọn chế độ hiển thị `Live 3D · LOLA 240 m`. Giữ góc nhìn thấy xe Rover 6 bánh trên đỉnh núi, Mặt Trời ở thấp gần đường chân trời và tia liên lạc hướng lên bầu trời.
- **Lời nói dễ hiểu:**
  > *"Xin chào Ban Giám Khảo, chúng tôi là nhóm **VeriFour**. Đề bài đặt ra là tạo một công cụ trực quan giúp so sánh các điểm đáp và thời điểm hạ cánh trên Mặt Trăng, hiển thị vị trí Mặt Trời và Trái Đất để đánh giá nguồn điện và liên lạc trực tiếp (DTE).*
  >
  > *Tại sao việc này lại khó? Vì ở Cực Nam Mặt Trăng, Mặt Trời luôn đi là là sát đường chân trời (trục nghiêng chỉ `1,54°`). Chỉ cần một sườn núi cách đó vài chục km chắn ngang là tàu có thể rơi vào bóng tối lạnh hàng tuần liền. Ngược lại, có những đỉnh núi ngập nắng tới 90% thời gian nhưng Trái Đất lại bị khuất sau núi, dẫn tới **có điện mà mất liên lạc**. Các bản đồ tĩnh trước đây không cho người lập kế hoạch biết **ngày nào, giờ nào** thì cả hai yếu tố này cùng thuận lợi."*

### Bước 2: Demo So sánh Bãi đáp & Thời gian (`Compare A vs B` & `Command Split`) (~50 giây)
- **Thao tác trên app:**
  1. Bấm sang tab **Command Split** (hoặc **Compare A vs B**) để đặt 2 địa điểm/cửa sổ cạnh nhau (ví dụ: `Connecting Ridge` vs `Mons Mouton Plateau` hoặc `Malapert Massif`).
  2. Kéo thanh thời gian trong giai đoạn `2026–2030` (`36.216` bước giờ).
- **Lời nói dễ hiểu:**
  > *"Giải pháp của chúng tôi — **Lunar Landing Site Navigator** — biến hàng gigabyte dữ liệu thiên văn thành một bảng điều khiển trực quan ngay trên trình duyệt.*
  >
  > *Ở tab **Compare A vs B**, chúng tôi đặt hai bãi đáp cạnh nhau để so sánh ngay: ví dụ **Connecting Ridge** có thời gian nắng rất cao nhưng liên lạc Trái Đất (DTE) chỉ khoảng hơn một nửa thời gian (`~54,9%`); trong khi **Mons Mouton Plateau** mặt bằng phẳng hơn và nhìn thấy Trái Đất gần như liên tục nhưng ít nắng hơn (`~44,8%`).*
  >
  > *Khi tôi kéo thanh thời gian trên chu kỳ 2026–2030 (gồm `36.216` giờ và `9` kỳ nguyệt thực/nhật thực trên Mặt Trăng), toàn bộ chỉ số phần trăm **Pin Mặt Trời**, **Sóng DTE** và **Cửa sổ trùng nhau (Joint Sun + Earth)** cập nhật tức thì."*

### Bước 3: Demo Quét Chân Trời 360° & Nâng Cột Pin (`2D Map & Sky`) (~50 giây)
- **Thao tác trên app:**
  1. Bấm sang tab **2D Map & Sky**.
  2. Click chọn một điểm trên bản đồ Cực Nam (hiển thị 9 vùng ứng viên **Artemis III 2024**) để thấy đường chân trời 360° dựng tức thời.
  3. Chuyển chiều cao cột mast từ `2 m` lên `10 m` (hoặc `50 m`) để thấy đường bóng địa hình hạ xuống và tỷ lệ nắng tăng lên.
- **Lời nói dễ hiểu:**
  > *"Để biết **tại sao** một điểm lại bị mất nắng hay mất sóng, mời thầy/cô và anh/chị xem tab **2D Map & Sky**.*
  >
  > *Khi tôi bấm vào bất kỳ tọa độ nào trên bản đồ Cực Nam, trình duyệt sẽ tự đọc dữ liệu độ cao thật **LRO LOLA 240 m/px** và phóng **360 tia cung tròn lớn** ra xung quanh tới bán kính `200 km` để vẽ đúng dãy núi chắn xung quanh. Đường màu cam là quỹ đạo Mặt Trời, còn vùng dao động là quỹ đạo Trái Đất — chỗ nào đường đi chìm xuống dưới đường núi đen là lúc đó bị khuất.*
  >
  > *Đặc biệt, kỹ sư sứ mệnh có thể thử thay đổi chiều cao cột pin Mặt Trời ngay tại đây: khi nâng cột từ **`2 m`** lên **`10 m`**, bạn thấy ngay đường chân trời hạ xuống giúp giảm đáng kể số ngày tối liên tục."*

### Bước 4: Demo Sàng Lọc Ứng Viên & Lái Rover 3D (`Candidate Directory` -> `3D Rover & Surface`) (~50 giây)
- **Thao tác trên app:**
  1. Bấm sang tab **Candidate Directory**, lọc theo vùng Artemis III hoặc toàn bản đồ cực, giới hạn độ dốc `≤ 5°` (ngưỡng hạ cánh mềm HLS), bấm chọn ứng viên hạng cao (`#1`).
  2. Quay lại tab **3D Rover & Surface**, bấm phím `WASD` (hoặc phím mũi tên điều khiển trên màn hình) cho xe Rover chạy bám theo sườn núi, chỉ vào thanh `Rover Surface Telemetry` ở đáy màn hình thấy `Pitch`, `Roll`, `Rover Solar` và `DTE: Link` thay đổi theo từng mét di chuyển.
- **Lời nói dễ hiểu:**
  > *"Nếu chưa biết chọn đâu trong hàng vạn tọa độ, tab **Candidate Directory** giúp sàng lọc **62.500 ô lưới cực Nam**, **140 cụm đỉnh tinh chỉnh 240 m** và **31 địa điểm tiêu biểu** theo một chỉ số tổng hợp minh bạch gồm: Năng lượng Mặt Trời (`35%`), Liên lạc Trái Đất (`25%`), Thời gian có cả hai (`15%`), Độ bền qua đêm tối (`15%`) và Độ dốc an toàn `≤ 5°` (`10%`).*
  >
  > *Cuối cùng, để kiểm chứng như ngoài thực địa, ở chế độ **3D Rover**, bạn có thể tự lái xe tự hành 6 bánh leo lên sườn dốc thật. Ngay ở thanh đo bên dưới, góc nghiêng thân xe (`Pitch/Roll`), sản lượng pin và tín hiệu Trái Đất cập nhật trực tiếp theo đúng địa hình 240 m."*

### Bước 5: Tác động, Minh bạch khoa học & Tầm nhìn (~30 giây)
- **Thao tác trên app:** Mở nhanh mục **About & Data** cho thấy bảng đối chiếu `Mazarico (2011)`, `Gläser (2018)`, `NASA PDS` và kiểm chứng sai số `JPL Horizons`.
- **Lời nói dễ hiểu:**
  > *"Mọi tính toán trong app đều dùng **100% dữ liệu mở chính thức của NASA** (`LRO LOLA` và `JPL Horizons DE441`, kiểm chứng sai số Mặt Trời `≤ 0,0002°`), kết hợp ngữ cảnh vận hành rover vùng cực từ **Cơ quan Vũ trụ Canada (CSA)** và đối chiếu chặt chẽ với các công bố khoa học như **Mazarico (2011)**, **Gläser (2018)** và **Barker (2023)**.*
  >
  > *Chúng tôi cũng ghi rõ giới hạn kỹ thuật: lưới `240 m/px` dùng để sàng lọc vùng lớn, không thay thế bản đồ phát hiện đá cuội cỡ mét khi hạ cánh thật. Toàn bộ dự án chạy không cần máy chủ và mở mã nguồn theo giấy phép **Apache-2.0**, giúp cả kỹ sư sứ mệnh lẫn học sinh, sinh viên toàn cầu đều có thể tự tay lập kế hoạch thám hiểm Mặt Trăng. Xin cảm ơn!"*

---

## Phần 3: Tóm Tắt Nguồn Tham Khảo Để Trả Lời Giám Khảo (Rõ Nguồn Gốc)

Khi BGK hỏi *"Số liệu và tiêu chí này lấy từ đâu, có cơ sở khoa học không?"*, trả lời rõ 3 lớp tách biệt:

1. **Dữ liệu NASA mở đầu vào (Ingested Data — có sẵn trong `data/` & `webapp/`):**
   - **NASA JPL Horizons (`DE441 / MOON_ME`):** `36.216` bước giờ từ `14/11/2026` đến `31/12/2030`, đối chiếu kiểm tra sai số tối đa `<= 0.000198°` (Mặt Trời) và `<= 0.006016°` (Trái Đất).
   - **NASA PDS LRO LOLA (`LDEM_75S_240M`):** Địa hình cực Nam `240 m/px` (`75°S–90°S`) kèm lưới gộp `1.200 m/px` tính che khuất chân trời tới `200 km`.
   - **NASA Artemis III 2024 Candidate Regions (`artemis3_regions_2024`):** Ranh giới 9 vùng hạ cánh ứng viên chính thức.
   - **Cơ quan Vũ trụ Canada (`CSA Moon Exploration`):** Tài nguyên đối tác không gian chính thức về vận hành rover/năng lượng vùng cực Mặt Trăng.

2. **Các bài báo khoa học dùng để kiểm chứng kết quả (đã đối chiếu sẵn trong `About & Data` & `README.md`):**
   - **Mazarico et al. (2011)** — *Illumination conditions of the lunar polar regions using LOLA topography* (`Icarus` 211:1066–1081, `doi:10.1016/j.icarus.2010.10.030`): Chuẩn tham chiếu độ sáng cực Nam (`Connecting Ridge C1: 89,0% mean / 92,7% visibility` ở độ cao mặt đất `0 m`).
   - **De Rosa et al. (2012)** (`Planet. Space Sci.` 74:224–246, `doi:10.1016/j.pss.2012.08.002`) & **Gläser et al. (2014, 2018)** (`Icarus` 243:78–90; `Planet. Space Sci.` 162:170–178, `doi:10.1016/j.pss.2017.07.006`): Cơ sở về ảnh hưởng của chiều cao cột mast (`2 m`) và độ phân giải DEM đến thời gian chiếu sáng.
   - **Barker et al. (2021, 2023)** (`doi:10.1016/j.pss.2020.105119`; `PSJ`, `doi:10.3847/PSJ/acf3e1`): Ngưỡng độ dốc vùng đáp và đánh giá chiếu sáng các vùng Artemis III.
   - **Công thức xếp hạng `Viability Index` (`webapp/src/lib/scoring.ts`):** Do nhóm VeriFour tự thiết kế (`0.35 Sun + 0.25 DTE + 0.15 Joint + 0.15 Dark + 0.10 Slope≤5°`) như một chỉ số sàng lọc đa tiêu chí (MCDA) có kiểm chứng ổn định thứ hạng (`Spearman ρ ≥ 0.97` khi dao động trọng số `±5%`), **không phải** tiêu chuẩn chứng nhận bay chính thức của NASA.

3. **Tài liệu bối cảnh bổ sung thêm trên phụ đề video (nếu giải thích thêm):**
   - **`NASA/SP-20205009602`** (*Artemis III Science Definition Team Report*): Bối cảnh thách thức khoa học & môi trường cực Nam của chương trình Artemis III.
   - **`Peña-Asensio et al. (2024)`**: Tham khảo cách tiếp cận kết hợp đa tiêu chí chiếu sáng, liên lạc và địa hình khi sàng lọc điểm hạ cánh cực Nam Mặt Trăng (lưu ý: công thức trọng số cụ thể `0.35/0.25/0.15/0.15/0.10` trong app là do nhóm tự xây dựng và kiểm thử).

---

## Các File Kịch Bản Khác Đã Có Sẵn Trong Repo
- [VIDEO_30S_DEMO_SCRIPT.md](VIDEO_30S_DEMO_SCRIPT.md) — Kịch bản đọc tiếng Anh 30 giây kèm bảng đối chiếu "Check Var".
- [PITCH_AND_VIDEO_SCRIPT.md](PITCH_AND_VIDEO_SCRIPT.md) — Tài liệu kỹ thuật đầy đủ + Q&A song ngữ cho vòng chấm Hà Nội.

# Cẩm Nang Thuyết Trình, Demo Live & Giải Nghĩa Dễ Hiểu — Team VeriFour

Tài liệu này gom **trọn bộ từ A–Z bằng tiếng Việt dễ đọc** để bạn ôn nhanh và mang theo khi thuyết trình (khớp 100% với **7 Slide PDF** [`PITCH_DECK_7_SLIDES.pdf`](PITCH_DECK_7_SLIDES.pdf) và **ứng dụng live** tại `https://lunar.agentlens.dpdns.org/`).

---

## Phần 1: Sườn Nói Theo Từng Slide (Nhìn Slide Nào Nói Ý Đó)

### Slide 1 — Trang Bìa (`0:00 – 0:30`)
- **Mục tiêu:** Chào Ban Giám Khảo, giới thiệu đội **VeriFour** và 1 câu tóm tắt đắt giá về sản phẩm **Lunar Landing Site Navigator**.
- **Lời nói gợi ý:**
  > *"Xin chào Ban Giám Khảo, chúng tôi là nhóm **VeriFour** mang đến **Lunar Landing Site Navigator** — công cụ lập kế hoạch điểm đáp Mặt Trăng và mô phỏng **xe tự hành 3D / bay VTOL Hopper** ngay trên trình duyệt, kết hợp dữ liệu địa hình thật **NASA LOLA 240 m** với lịch thiên văn **JPL Horizons 36.216 giờ (2026–2030)** với sai số Mặt Trời dưới **`0,0002°`**."*

### Slide 2 — Tại Sao Hạ Cánh Ở Cực Nam Mặt Trăng Lại Khó? (`0:30 – 1:10`)
- **Chỉ vào 3 thẻ bên trái & bản đồ nhiệt bên phải:**
  1. **Trục Mặt Trăng chỉ nghiêng `1,54°`:** Nắng đi là là sát đường chân trời $\rightarrow$ đỉnh núi sáng tới **`90%` thời gian trong năm**, nhưng đáy hố ngay bên cạnh tối vĩnh viễn và lạnh tới **`40 K` (`-233°C`)**.
  2. **Có nắng chưa chắc đã gọi được về Trái Đất (`DTE`):** Trái Đất dao động lắc lư độc lập (`±6,7°`). Ví dụ: đỉnh *Connecting Ridge* có **`90%` nắng** nhưng chỉ **`55%` thấy Trái Đất**; còn *Mons Mouton* thấy Trái Đất **`100%`** nhưng chỉ có **`45%` nắng**.
  3. **Dữ liệu trước đây rời rạc:** Bản đồ độ cao, lịch quỹ đạo và ranh giới 9 vùng Artemis III nằm tách rời ở nhiều công cụ nặng $\rightarrow$ nhóm gom lại thành một công cụ quét chân trời `360°` tức thời ngay trên web.

### Slide 3 — Kiến Trúc & Công Thức Chấm Điểm Khoa Học (`1:10 – 2:00`)
- **Chỉ vào sơ đồ 4 bước & thanh công thức màu vàng–xanh:**
  - Nhóm nén dữ liệu bản đồ NASA LOLA thành 2 mảng nhị phân chỉ **`4,28 MB`**, giúp trình duyệt phóng **360 tia chân trời (480 bước xa tới `200 km`) chỉ trong `15 mili-giây`**.
  - **Công thức `Viability Index` (thang 100 điểm, tổng trọng số = `1,00`):**
    - **`50%` Năng lượng & Sống sót đêm lạnh:** `0,35` Đĩa Mặt Trời trung bình + `0,15` Độ bền qua đêm tối dài nhất (chuẩn hóa theo chu kỳ **30 ngày** mặt trăng để tàu không bị đóng băng chết ắc-quy).
    - **`40%` Liên lạc Trái Đất:** `0,25` Thời gian thấy Trái Đất (DTE) + `0,15` **Thời gian vàng (`Joint`)** vừa có nắng vừa thấy Trái Đất.
    - **`10%` Độ dốc an toàn `≤ 5°`:** Theo ngưỡng hạ cánh của tàu đổ bộ Artemis HLS (chỉ đặt `10%` để phù hợp với quy mô lưới vùng `240 m`).
  - **Chứng minh độ tin cậy:** Khi thử đổi trọng số lên xuống `±5%`, hệ số tương quan thứ hạng vẫn đạt **`Spearman ρ = 0,9706 – 0,9853` (`≥ 0,971`)** — chứng tỏ bảng xếp hạng phản ánh đúng bản chất địa hình–thiên văn chứ không phải gán số cảm tính.

### Slide 4 & Slide 5 — Chuyển Sang Demo Thao Tác Thật Trên Web (`2:00 – 3:45`)
*(Mở tab `https://lunar.agentlens.dpdns.org/` bấm trực tiếp 4 thao tác sau)*:
1. **Tab `3D Rover & Surface`:**
   - Lái xe Rover 6 bánh (`WASD` hoặc click đúp lên mặt đất) $\rightarrow$ chỉ vào góc nghiêng thật (`Pitch / Roll`) và tia sóng xanh hướng về Trái Đất (**DTE Beam**).
   - Bấm phím **`F` (hoặc nút `Fly`)** bật chế độ bay **VTOL Hopper** (`E` bay lên, `Q` hạ xuống) để bay qua vách hố; đổi thử lớp phủ **`Layer: Composite / Sun / Slope`** và độ cao **`Relief 1x Real`** vs **`6x`**.
2. **Tab `2D Map & Sky` + Khung đáy `360° Horizon Panorama`:**
   - Click vào một tọa độ bất kỳ trên bản đồ Cực Nam $\rightarrow$ đường núi chắn `360°` dựng ra ngay lập tức.
   - Đổi chiều cao cột pin **`Mast 2 m → 10 m → 50 m`** để thấy rìa núi hạ xuống, tăng tỷ lệ nắng.
   - Kéo thanh **`Timeline`** 50 tháng hoặc bấm nhảy tới **1 trong `9` kỳ Nhật thực (`Eclipses`)**.
3. **Tab `Compare A vs B` & `Candidate Directory`:**
   - Đặt *Connecting Ridge* (lợi nắng) cạnh *Malapert Massif / Mons Mouton* (lợi sóng Trái Đất) để so sánh trực tiếp.
   - Mở `Candidate Directory`, bật lọc độ dốc `≤ 5°` để xem bảng xếp hạng từ `62.500` ô lưới cực Nam và `140` cụm đỉnh tinh chỉnh `240 m`.
4. **Nút `Explain Section` & `NASA AI Chat`:**
   - Bật nhanh `Explain Section` (tour hướng dẫn 7 phần ghim gọn trên đầu trang) và `NASA AI Chat` (trợ lý AI song ngữ tra cứu dữ liệu NASA có trích dẫn nguồn).

### Slide 6 — Kiểm Chứng Khoa Học & Giới Hạn Trung Thực (`3:45 – 4:25`)
- **3 điểm nhấn đắt giá:**
  - Sai số góc tối đa so với máy chủ **NASA JPL Horizons**: **`0,000198°` (Mặt Trời)** và **`0,006016°` (Trái Đất)**.
  - Bảng đối chiếu trực tiếp với bài báo **Mazarico et al. (2011)** và bản đồ **NASA PDS `AVGVISIB`**.
  - **Minh bạch giới hạn kỹ thuật:** Nhóm nói rõ dữ liệu `240 m/px` dùng để **sàng lọc vùng lớn và tính bóng núi chắn chân trời**, không thay thế bản đồ `1–5 m/px` dò đá tảng cỡ mét khi hạ cánh thật; các điểm nằm ngoài bản đồ cực Nam (`>75°S`) trả về `n/a` rõ ràng.

### Slide 7 — Tác Động, Nguồn Dữ Liệu & Kết Luận (`4:25 – 5:00`)
- Chạy **100% trên trình duyệt** không cần máy chủ, xuất báo cáo `CSV / JSON`, mã nguồn mở **Apache-2.0**, `78` bài kiểm thử tự động (`10 Python + 68 Vitest`), **0% ảnh/địa hình AI giả lập** — dùng 100% dữ liệu NASA thật (`LRO LOLA`, `JPL Horizons DE441`, `Artemis III`) và đối tác `CSA`.

---

## Phần 2: Kịch Bản Thao Tác 30 Giây & Demo Live 5 Phút

### A. Lời Đọc Nhanh 30 Giây (Dùng cho video pitch ngắn)
*(Độ dài chuẩn ~26–28 giây, đọc bình tĩnh tự nhiên theo 7 câu)*:
1. *"Xin chào! Chúng tôi là Nhóm VeriFour, mang đến **Lunar Landing Site Navigator** — công cụ lập kế hoạch điểm đáp, năng lượng và liên lạc Mặt Trăng."*
2. *"Ở Cực Nam Mặt Trăng, độ nghiêng trục chỉ 1,54 độ khiến bóng núi kéo dài nhiều tuần — có chỗ có nắng nhưng chưa chắc nhìn thấy Trái Đất để truyền tín hiệu."*
3. *"Công cụ của chúng tôi cho phép chọn ngay bãi đáp, đổi ngày giờ từ năm 2026 đến 2030, và so sánh trực tiếp cửa sổ có nắng lẫn liên lạc Trái Đất (DTE)."*
4. *"Trên nền bản đồ địa hình NASA LOLA 240 m và quỹ đạo JPL Horizons sai số dưới 0,0002 độ, app quét chân trời 360 độ và thử nâng cột pin từ 2 m lên 10 m để giảm bóng tối."*
5. *"Hệ thống tự chấm điểm 62.500 tọa độ, 9 vùng Artemis III và 31 bãi đáp theo độ khả thi — kết hợp tài nguyên đối tác từ Cơ quan Vũ trụ Canada (CSA)."*
6. *"Người dùng còn có thể tự lái xe Rover 3D bám sát độ dốc thật để kiểm tra pin Mặt Trời và tia liên lạc Trái Đất tại từng vị trí."*
7. *"Chạy ngay trên trình duyệt và hoàn toàn mã nguồn mở, sẵn sàng hỗ trợ các sứ mệnh Artemis cũng như lớp học toàn cầu cho hành trình trở lại Mặt Trăng — và xa hơn nữa."*

### B. Kịch Bản Đọc Chậm Kèm Bấm Nút Demo Live (3–5 Phút)
1. **Bước 1 — Mở đầu trên `3D Rover & Surface` (~40s):** Chọn `Connecting Ridge`, chỉ vào Mặt Trời đi sát rìa núi và tia liên lạc Trái Đất hướng lên trời; giải thích nghịch lý *"có điện mà mất liên lạc"* ở Cực Nam.
2. **Bước 2 — So sánh trên `Compare A vs B` & `Command Split` (~50s):** Đặt *Connecting Ridge* cạnh *Mons Mouton Plateau* (hoặc *Malapert Massif*); kéo thanh thời gian `36.216` giờ (`2026–2030`) cho thấy Pin Mặt Trời, Sóng DTE và Cửa sổ trùng nhau (`Joint`) thay đổi tức thì.
3. **Bước 3 — Quét chân trời trên `2D Map & Sky` (~50s):** Click vào 1 điểm bất kỳ trên bản đồ Cực Nam để thấy rìa núi `360°` dựng ra ngay; đổi cột **`Mast 2 m → 10 m`** để thấy bóng tối rút ngắn lại.
4. **Bước 4 — Sàng lọc & Lái xe (`Candidate Directory` $\rightarrow$ `3D Rover`) (~50s):** Lọc bãi đáp dốc `≤ 5°`, chọn điểm hạng #1 rồi quay lại `3D Rover` bấm `WASD` + `F` (bay VTOL Hopper), chỉ xuống thanh thông số đáy màn hình thấy `Pitch / Roll`, `Rover Solar` và `DTE: Link` thay đổi từng mét.
5. **Bước 5 — Mở `About & Data` & Kết bài (~30s):** Mở bảng đối chiếu `Mazarico (2011)`, `Gläser (2018)`, `NASA PDS` và sai số `JPL Horizons`; nhấn mạnh giới hạn `240 m/px` và tính mã nguồn mở `Apache-2.0`.

---

## Phần 3: Bảng Giải Nghĩa Bình Dân Toàn Bộ Từ Viết Tắt & Thuật Ngữ

> 💡 **Mẹo:** Bạn **không cần đọc tên tiếng Anh**! Khi thuyết trình, cứ chỉ vào màn hình và nói theo cột **"Khi thuyết trình chỉ cần nói là..."**.

### 1. Từ viết tắt về Dữ liệu NASA & Đối tác
| Từ trên app / slide | Hiểu nôm na đời thường là gì? | Khi thuyết trình chỉ cần nói là... |
| :--- | :--- | :--- |
| **`LRO`** *(Lunar Reconnaissance Orbiter)* | Vệ tinh của NASA đang bay quanh Mặt Trăng để chụp ảnh và đo địa hình từ năm 2009. | *"Tàu vệ tinh đo đạc Mặt Trăng của NASA"* |
| **`LOLA`** *(Laser Altimeter)* | Cây thước bắn tia laser gắn trên tàu LRO để đo độ cao từng quả núi, hố sâu. | *"Dữ liệu đo độ cao bằng laser của NASA"* |
| **`DEM`** & **`240 m/px`** | **Bản đồ độ cao số**. `240 m/px` nghĩa là mỗi ô vuông `240 m × 240 m` ngoài đời có 1 giá trị độ cao. | *"Bản đồ địa hình độ phân giải 240 mét một ô"* |
| **`JPL Horizons`** & **`DE441`** | "Cuốn lịch vạn niên" siêu chính xác của NASA cho biết từng giờ Mặt Trời và Trái Đất nằm ở đâu trên bầu trời Mặt Trăng. | *"Hệ thống lịch thiên văn JPL Horizons của NASA"* |
| **`MOON_ME`** | Hệ tọa độ gắn cố định vào mặt đất Mặt Trăng (giống kinh độ/vĩ độ trên Trái Đất). | *"Hệ tọa độ chuẩn trên Mặt Trăng"* |
| **`NASA PDS`** & **`AVGVISIB`** | Kho lưu trữ dữ liệu gốc của NASA (`PDS`) và bản đồ tỷ lệ nắng trung bình 18,6 năm (`AVGVISIB`) dùng để kiểm chứng chéo. | *"Bản đồ nắng chuẩn trong kho dữ liệu NASA"* |
| **`Artemis III`** & **`HLS`** | Chuyến bay sắp đưa con người trở lại Cực Nam Mặt Trăng (**9 vùng ứng viên**) cùng tàu đổ bộ **HLS** (yêu cầu đất dốc `≤ 5°`). | *"Sứ mệnh Artemis III và tàu đổ bộ của NASA"* |
| **`CLPS`** | Chương trình các tàu đổ bộ tư nhân do NASA thuê chở thiết bị lên Mặt Trăng (như tàu *IM-1 Odysseus*). | *"Các tàu đổ bộ thương mại của NASA"* |
| **`CSA`** | Cơ quan Vũ trụ Canada — đối tác của NASA trong đề bài, chuyên về xe tự hành và năng lượng vùng cực. | *"Đối tác Cơ quan Vũ trụ Canada (CSA)"* |

### 2. Từ về Ánh nắng, Sóng liên lạc & Địa hình
| Từ trên app / slide | Hiểu nôm na đời thường là gì? | Khi thuyết trình chỉ cần nói là... |
| :--- | :--- | :--- |
| **`DTE`** *(Direct-to-Earth)* | **Liên lạc trực tiếp về Trái Đất**: ăng-ten phải nhìn thẳng thấy Trái Đất mà không bị núi chắn ngang mới truyền sóng được. | *"Đường truyền liên lạc trực tiếp về Trái Đất"* |
| **`PSR`** | **Hố tối vĩnh viễn**: đáy hố sâu ở Cực Nam hàng tỷ năm không thấy nắng, lạnh tới `-233°C`, nơi có băng nước. | *"Vùng đáy hố tối vĩnh viễn"* |
| **`Earth Libration`** | Hiện tượng Trái Đất lắc lư lên xuống `±6,7°` trên bầu trời Cực Nam (lúc nhô lên thì có sóng, lúc tụt sau núi thì mất sóng). | *"Sự dao động lên xuống của Trái Đất trên bầu trời"* |
| **`360° Ray-Marching`** | Bắn **360 tia nhìn** xoay tròn xung quanh bãi đáp xa tới `200 km` để dò xem hướng nào bị núi cao che khuất. | *"Quét địa hình 360 độ tìm núi chắn nắng và chắn sóng"* |
| **`Mast`** (`0,5 m → 50 m`) | Cây cột gắn pin Mặt Trời và ăng-ten trên tàu; nâng cột cao giúp "kiễng chân" nhìn vượt qua rìa núi. | *"Chiều cao cột pin Mặt Trời và ăng-ten"* |
| **`Mask 0° / 2° / 5°`** | Góc trừ hao an toàn: bắt Trái Đất phải nhô cao hơn đỉnh núi ít nhất `2°` hay `5°` mới tính là sóng tốt (tránh nhiễu). | *"Ngưỡng góc an toàn chống nhiễu sóng gần rìa núi"* |
| **`Regolith`** | Lớp đất đá, bụi xám phủ trên bề mặt Mặt Trăng. | *"Lớp đất đá bề mặt Mặt Trăng"* |
| **`Relief 1x Real / 6x / 15x`** | Phóng đại độ cao núi 3D (`1x Real` = tỷ lệ thật 1:1 ngoài đời; `6x–15x` = kéo cao để mắt dễ nhìn địa hình). | *"Tỷ lệ độ cao thật 1:1 hoặc phóng đại địa hình để dễ quan sát"* |
| **`Pitch` & `Roll`** | Độ chúi mũi (`Pitch`) và độ nghiêng ngang (`Roll`) của xe Rover khi leo dốc. | *"Góc nghiêng dọc và nghiêng ngang của xe khi leo dốc"* |
| **`Eclipses`** | 9 lần Trái Đất đi ngang che khuất Mặt Trời trong giai đoạn 2026–2030 (Nhật thực nhìn từ Mặt Trăng). | *"9 lần Mặt Trời bị Trái Đất che khuất"* |

### 3. Từ về Công thức, Tính năng App & Phần mềm
| Từ trên app / slide | Hiểu nôm na đời thường là gì? | Khi thuyết trình chỉ cần nói là... |
| :--- | :--- | :--- |
| **`Viability Index`** (`0–100`) | **Điểm khả thi tổng hợp** gộp 5 yếu tố: Nắng (`35%`) + Sóng DTE (`25%`) + Có cả hai (`15%`) + Chịu đêm dài (`15%`) + Đất phẳng `≤5°` (`10%`). | *"Điểm đánh giá độ khả thi của bãi đáp trên thang 100"* |
| **`Joint %`** *(Sun ∩ Earth)* | Tỷ lệ thời gian **vừa có nắng vừa liên lạc được Trái Đất cùng lúc**. | *"Thời gian vàng vừa có nắng vừa gọi được về Trái Đất"* |
| **`Max Dark`** | Số ngày đêm tối liên tục dài nhất $\rightarrow$ quyết định độ lớn của ắc-quy để tàu không chết cóng. | *"Số ngày tối liên tục dài nhất mà tàu phải chịu đựng"* |
| **`Spearman ρ ≥ 0,971`** | Chỉ số toán học kiểm chứng độ bền thứ hạng (tối đa `1,0`): đổi nhẹ trọng số thì top đầu vẫn giữ nguyên vị trí. | *"Kiểm chứng toán học cho thấy thứ hạng bãi đáp cực kỳ ổn định"* |
| **`VTOL Hopper`** (`F` / `Fly`) | Chế độ bật động cơ phản lực bay thẳng đứng để vượt hố sâu hoặc vách dốc. | *"Chế độ bay nhảy vượt địa hình hiểm trở"* |
| **`Mast POV`** | Góc nhìn thứ nhất từ camera gắn trên đầu cột xe Rover. | *"Góc nhìn trực tiếp từ camera gắn trên xe Rover"* |
| **`Probe`** | Chấm thử bất kỳ tọa độ nào trên bản đồ 2D để tính ngay chân trời và thông số. | *"Tính năng chấm điểm bất kỳ để đo đạc tức thời"* |
| **`Client-side` / `4,28 MB Int16`** | Nén dữ liệu bản đồ gốc hàng trăm MB xuống hơn `4 MB` để chạy hoàn toàn trên trình duyệt người dùng, không cần máy chủ. | *"Nén nhẹ còn hơn 4 MB để chạy tức thời ngay trên trình duyệt"* |
| **`Mode B Web Worker`** | Luồng tính toán chạy ngầm để quét hàng trăm điểm quanh vị trí chọn mà không làm giật màn hình 3D. | *"Bộ quét tọa độ chạy ngầm không gây giật lag"* |
| **`RAG`** *(NASA AI Chat)* | Chatbot chỉ trả lời dựa trên kho tài liệu NASA thật và số liệu đang đo trên màn hình, không tự bịa số liệu. | *"Trợ lý AI tra cứu trực tiếp dữ liệu NASA, không bịa thông tin"* |

---

## Phần 4: 5 Câu Hỏi "Tủ" Của Ban Giám Khảo & Nguồn Tham Khảo

### 5 Câu hỏi dễ gặp nhất & Cách trả lời gọn
1. **"Tại sao công thức Viability lại có cả `% Nắng trung bình` (`35%`) lẫn `Đêm dài nhất` (`15%`)?"**
   - *Trả lời:* `% Nắng trung bình` cho biết tổng điện năng tàu thu được để làm việc, còn `Đêm dài nhất` quyết định **tàu có sống sót qua mùa đông cực Nam `40–100 K` (`-233°C`) mà không bị đóng băng ắc-quy hay không**. Hai nơi cùng % nắng trung bình nhưng một nơi tối 5 ngày, nơi kia tối liền 18 ngày thì kích thước ắc-quy phải mang lớn gấp 3–4 lần.
2. **"Tại sao trọng số `Độ dốc ≤ 5°` chỉ để `10%` mà không cao hơn?"**
   - *Trả lời:* Vì lưới địa hình toàn vùng có độ phân giải `240 m/px`. Nếu đặt trọng số độ dốc quá cao trên lưới 240 m sẽ gây ảo tưởng an toàn ở cấp độ mét. Mức `10%` vừa đủ ưu tiên vùng bằng phẳng (như *Mons Mouton*) mà không làm lu mờ bài toán che khuất chân trời.
3. **"Tại sao thẻ Solar Array ghi `100% Lit` mà dòng `Horizontal Panel` chỉ có `1,4%`?"**
   - *Trả lời:* Vì ở Cực Nam Mặt Trời đi là là sát đất (`~0,8°`). Tấm pin **dựng đứng xoay theo Mặt Trời** hứng 100% nắng, còn tấm pin **đặt nằm ngang** bị nhân thêm $\sin(0,8^\circ) \approx 1,4\%$ — chứng minh trực quan vì sao tàu Cực Nam phải dựng đứng tấm pin.
4. **"Số liệu của nhóm lấy ở đâu? Có lấy dữ liệu ngoài cuộc thi không?"**
   - *Trả lời:* Toàn bộ dữ liệu địa hình và quỹ đạo chạy trong app là **100% tài nguyên mở chính thức của NASA và đối tác CSA trong đề bài** (`LRO LOLA 240 m`, `JPL Horizons DE441`, `Artemis III`, `Moon Trek`, `CSA`). Nhóm chỉ trích dẫn thêm các bài báo khoa học bên ngoài (*Mazarico 2011*, *De Rosa 2012*, *Gläser 2014/2018*, *Barker 2021/2023*) làm **cơ sở phương pháp và đối chiếu kiểm chứng độ chính xác**.
5. **"Làm sao web không cần server mà bấm tới đâu cũng tính được chân trời `360°` ngay lập tức?"**
   - *Trả lời:* Nhóm tiền xử lý bản đồ LOLA thành 2 mảng nhị phân `Int16` (`4,28 MB`: lưới tinh `240 m` + lưới thô `1.200 m`). Khi người dùng click, trình duyệt đọc trực tiếp từ RAM và phóng 360 tia qua 480 bước chỉ trong **15 mili-giây**.

### Tóm Tắt Nguồn Tham Khảo 3 Lớp
1. **Dữ liệu mở NASA & Đối tác CSA (đầu vào trực tiếp của app):** `NASA JPL Horizons (DE441 / MOON_ME)`, `NASA PDS LRO LOLA (LDEM_75S_240M & AVGVISIB)`, `NASA Artemis III 9 Regions`, `NASA Moon Trek / PGDA / LROC QuickMap / NSSDCA`, `CSA Moon Exploration`.
2. **Bài báo khoa học đối chiếu trong `About & Data`:** *Mazarico et al. (2011)* (`doi:10.1016/j.icarus.2010.10.030`), *De Rosa et al. (2012)*, *Gläser et al. (2014, 2018)*, *Barker et al. (2021, 2023)*. Công thức `Viability Index` là chỉ số sàng lọc đa tiêu chí do Team VeriFour tự thiết kế và kiểm chứng (`Spearman ρ ≥ 0,971`), không phải tiêu chuẩn chứng nhận bay chính thức của NASA.
3. **Các file liên quan khác trong repo:** [VIDEO_30S_DEMO_SCRIPT.md](VIDEO_30S_DEMO_SCRIPT.md) · [DEMO_VIDEO_5MIN_SCRIPT.md](DEMO_VIDEO_5MIN_SCRIPT.md) · [PITCH_AND_VIDEO_SCRIPT.md](PITCH_AND_VIDEO_SCRIPT.md) · [NASA_SUBMISSION_FORM.md](NASA_SUBMISSION_FORM.md) · [USE_OF_AI_AND_SI_DISCLOSURE.md](USE_OF_AI_AND_SI_DISCLOSURE.md).

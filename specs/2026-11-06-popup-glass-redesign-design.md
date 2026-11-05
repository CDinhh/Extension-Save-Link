# Thiết kế lại popup Save Link: kính trong suốt, icon mảnh, kéo thả chạy được

Ngày: 2026-11-06. Branch: `store-prep` (đang có thay đổi chưa commit cho bản lên Chrome Web Store).

## Mục đích và lý do

Popup hiện tại (bản đã làm lại theo trang web) vẫn "chưa hiện đại", icon Font Awesome dày và xấu, và **kéo thả không chạy**: người dùng nắm đúng tay nắm trong popup thật trên Brave (Windows) mà không kéo được. Chủ dự án muốn popup có **nét riêng** của Save Link, không giống app nào cụ thể, với hiệu ứng kính (glassmorphism) hiện đại.

Thành công là: mở popup thấy ngay chất kính sạch sẽ, nhận ra được là Save Link; kéo thả nhóm và link chạy được bằng chuột thật trên Brave; người dùng tự chỉnh được độ trong suốt, giao diện sáng/tối và ngôn ngữ.

## Mục tiêu

1. Giao diện hướng **E (nền chấm, kính trong suốt)**, đã chốt qua mẫu trực quan.
2. Icon nét mảnh **Phosphor Light** thay toàn bộ Font Awesome trong popup.
3. Kéo thả chạy ổn định trong popup thật, nắm được cả dòng.
4. Bảng **cài đặt**: độ trong suốt, độ mờ kính, sáng/tối, ngôn ngữ Việt/Anh.
5. Giữ nguyên mọi chức năng và dữ liệu hiện có.

## Không làm (non-goals)

- Không đổi trang web `docs/` trong đợt này (trừ khi cần sửa chữ trong chính sách, xem mục Tài liệu liên quan).
- Không đổi định dạng dữ liệu, cách sync Google Sheet, OAuth, quyền trong manifest.
- Không dịch tên và mô tả trong manifest (Web Store vẫn tiếng Anh). Không dùng `_locales`.
- Popup không thể trong suốt ra tới trang web phía sau (Chrome luôn vẽ popup trên nền đặc). Không cố làm điều này.

## Phản mục tiêu (làm thì coi như hỏng dù vẫn chạy)

- **Mảng màu loang, gradient mesh, quả cầu màu mờ** phía sau: chủ dự án thấy "nhìn khá AI". Màu chỉ được đến từ màu của từng nhóm.
- Chữ khó đọc vì kính quá trong.
- Tải font, icon hay bất cứ thứ gì từ mạng khi chạy (vi phạm chính sách "không remote code" và chính sách quyền riêng tư).
- Mất dữ liệu người dùng, hoặc kéo thả làm sai thứ tự link.
- Popup giật, lag khi danh sách dài.

## Giao diện (đã chốt)

Tham chiếu mẫu: hướng E bản trong suốt, đã xem ở visual companion.

**Nền:** màu trung tính phẳng, phủ lưới chấm nhỏ (chấm ~1.3px, lưới 16px).
- Sáng: nền `#eef0f7`, chấm `rgb(21 23 43 / 22%)`.
- Tối: nền `#0a0b13`, chấm `rgb(255 255 255 / 16%)`.
- **Mặc định là sáng.**

**Kính:**
- Thẻ nhóm và từng dòng link là kính nhuốm nhẹ màu của nhóm.
- Mặc định **độ trong suốt 32** (tức độ phủ nền 0.68) và **độ mờ 2px** (`backdrop-filter`). Đây là số chủ dự án tự chỉnh trên mẫu.
- Viền là đường mảnh sáng (`inset 0 0 0 1px`), có một vệt sáng ở mép trên. Không dùng bóng đen đậm.
- Công thức màu thẻ như mẫu:
  - Sáng: nền thẻ = `color-mix(màu nhóm 10%, trắng)` với độ phủ theo cài đặt.
  - Tối: nền thẻ = `color-mix(màu nhóm 16%, #1a1c2b)`.
  - Dòng link: trắng (sáng) hoặc trắng 9% (tối), cũng nhân theo độ phủ.

**Thanh trên và thanh dưới:**
- Ghim cố định và nằm đè lên danh sách, để link cuộn **chạy mờ phía sau** thanh.
- Kính mờ hơn thẻ: khoảng 14px, nền 45%.
- Menu tài khoản, bảng cài đặt và hộp thoại dùng cùng kiểu kính.

**Dấu ấn riêng:**
- Mỗi nhóm có một **vòng tròn rỗng** màu của nhóm, gợi mắt xích trong logo.
- Khi nhóm mở, các link nối nhau bằng một **đường dọc màu nhóm** có **nút tròn** ở mỗi dòng, như một sợi xích.

**Thanh trên:** logo + "Save Link"; bên phải là nút sync (chỉ khi đã đăng nhập), avatar hoặc nút đăng nhập, và nút cài đặt (bánh răng). Dưới đó:
- Ô tìm kiếm bo tròn hẳn (pill).
- Nút "Nhóm mới" là pill màu đậm, dấu + nằm trong vòng tròn riêng, xoay 90° khi rê chuột.

**Thanh dưới:** "Save Link by cdinh" (liên kết repo), Xuất, Nhập.

**Chữ:** font **Be Vietnam Pro** (giống trang web), đóng gói kèm extension, chỉ các subset latin và vietnamese, các độ đậm 400, 500, 600, 700.

**Icon:** **Phosphor Light**, đóng gói kèm dưới dạng SVG nội tuyến hoặc sprite. Chỉ lấy các icon dùng tới. Giấy phép MIT, phải ghi kèm.

**Chuyển động:**
- Đường cong dạng lò xo, ví dụ `cubic-bezier(.32, .72, 0, 1)`, không dùng `linear` hay `ease-in-out` mặc định.
- Rê chuột thì dòng nhích sang phải 3px. Mở/đóng nhóm thì trượt mượt, mũi tên xoay.
- Tick thì có hiệu ứng bật. Hộp thoại phóng nhẹ khi mở.
- Chỉ animate `transform` và `opacity`, trừ hiệu ứng mở nhóm hiện có.
- Tôn trọng `prefers-reduced-motion`.

**Kích thước popup:** 420x580 (cái này builder chỉnh được nếu cần).

## Cài đặt (đã chốt)

Bấm bánh răng mở một bảng kính nhỏ (popover) gồm:

- **Giao diện:** Sáng / Tối.
- **Ngôn ngữ:** Tiếng Việt / English.
- **Độ trong suốt:** thanh kéo 0–100, mặc định 32.
- **Độ mờ kính:** thanh kéo 0–24px, mặc định 2px.
- Nút **Mặc định** để trả về các giá trị trên.

Thay đổi áp **ngay lập tức** khi kéo (xem trước trực tiếp).

**Lưu ở đâu:** `chrome.storage.local`, khóa `uiSettings` = `{ theme, lang, transparency, blur }`.
- Chỉ lưu trên từng trình duyệt, **không** sync qua Google Sheet và không ghi vào sheet.
- Popup chép thêm một bản vào `localStorage`, để lần mở sau tô màu đúng ngay từ đầu, không bị nháy sáng rồi mới tối.
- Service worker đọc `uiSettings.lang` để đổi chữ của menu chuột phải và thông báo, và dựng lại menu khi `lang` đổi.

**Ngôn ngữ mặc định:** theo trình duyệt (`navigator.language` bắt đầu bằng `vi` thì tiếng Việt, còn lại tiếng Anh) cho tới khi người dùng chọn.

**Phạm vi dịch:** mọi chữ trong popup (nút, placeholder, thông báo, hộp thoại, màn hình trống, tooltip, aria-label), menu chuột phải, và thông báo "Đã lưu". Dùng một bảng từ điển riêng (ví dụ `i18n.js`), không dùng `chrome.i18n` vì nó không đổi ngôn ngữ lúc đang chạy.

## Kéo thả (đã chốt)

- **Nguyên nhân nghi ngờ:** thư viện Sortable đang dùng kéo thả gốc (HTML5 drag). Kiểu kéo này đi qua vòng lặp kéo của hệ điều hành và hay hỏng trong popup extension.
  - Thử bằng chuột giả lập qua CDP thì cả hai chế độ đều chạy, nên **chưa tái hiện được lỗi**.
  - Cách sửa vẫn được chọn vì nó loại bỏ hẳn sự phụ thuộc đó.
- **Cách làm:** bật `forceFallback: true` (kéo bằng sự kiện con trỏ), có `fallbackTolerance` vài pixel.
- **Nắm cả dòng / cả thanh tên nhóm** để kéo.
  - Bấm nhẹ không di chuyển vẫn là mở link hoặc mở/đóng nhóm.
  - Không kéo từ nút bút, copy, xóa, ô tick, ô chọn màu, ô đang sửa (dùng `filter` của Sortable).
- **Kéo link sang nhóm đang đóng:** giữ trên tên nhóm khoảng 0.5 giây thì nhóm tự mở để thả vào.
- **Hình ảnh khi kéo:**
  - Thẻ đang kéo nổi lên, hơi nghiêng 1–2°, có bóng mềm.
  - Chỗ trống hiện vị trí thả.
  - Các dòng khác trượt nhường chỗ (animation của Sortable khoảng 200ms).
- **Khi đang tìm kiếm:** tắt kéo thả như hiện tại.
- Logic lưu thứ tự hiện có (`onEnd`) giữ nguyên ý nghĩa: đổi thứ tự trong nhóm, chuyển link sang nhóm khác, đổi thứ tự nhóm.
- **Kiểm chứng bằng chuột thật trên Brave của chủ dự án:** chủ dự án đã cho phép dùng `agent-desktop` ở chế độ điều khiển chuột thật (`--headed`). Đây là cách duy nhất bắt được lỗi này.

## Ràng buộc

- Manifest V3, chạy được trên Chrome, Edge, Brave, Cốc Cốc. `minimum_chrome_version` hiện là 114.
- Không thêm quyền mới. Không tải tài nguyên từ mạng khi chạy.
- Không đổi khóa lưu trữ dữ liệu (`savedLinksData`, `categoriesOrder`, `dataLastModified`, `syncState`, `googleUser`).
- Giữ nguyên các chức năng hiện có, gồm:
  - Thêm/sửa/xóa, Undo khi xóa link, hộp thoại thay `alert`/`confirm`/`prompt`.
  - Tìm kiếm tự mở nhóm, Esc để xóa ô tìm.
  - Nút + tự điền trang hiện tại, menu tài khoản, mở Google Sheet.
  - Nhập/xuất JSON, giữ vị trí cuộn khi vẽ lại, chống chèn HTML (escape).
- File zip đóng gói bằng `scripts/package-store.py` phải cập nhật danh sách file nếu thêm file mới (font, icon, `i18n.js`). Bỏ Font Awesome khỏi gói nếu popup không còn dùng.
- Hiệu năng: `backdrop-filter` trên nhiều thẻ trong vùng cuộn có thể tốn GPU.
  - Kiểm tra với khoảng 100 link.
  - Khi độ mờ bằng 0 thì bỏ hẳn `backdrop-filter`.

## Tài liệu liên quan cần cập nhật

- `store/listing.md`: thêm cài đặt (giao diện, ngôn ngữ, độ trong suốt) vào phần tính năng.
- Chụp lại ảnh store (`store/screenshot-*.jpg`, `store/promo-small.jpg`) từ giao diện mới.
- Chính sách quyền riêng tư (`docs/privacy.html`, `docs/vi/privacy.html`): thêm một dòng rằng extension lưu cài đặt giao diện trong trình duyệt.

## Để builder tự quyết

- Cấu trúc file CSS/JS, cách tách module.
- Cách đóng gói icon (sprite hay SVG nội tuyến), cách lấy file font. Việc tải file từ npm hoặc Google Fonts cần hỏi chủ dự án trước khi tải (kèm tên file, nguồn, dung lượng).
- Câu chữ tiếng Việt và tiếng Anh cụ thể, miễn ngắn gọn, tự nhiên.
- Có đưa script kiểm thử CDP (đã dùng trong phiên này) vào repo hay không.

## Quyết định là của tui (chủ dự án chưa duyệt riêng từng cái)

- Bánh răng thay cho nút mặt trăng; chọn sáng/tối nằm trong bảng cài đặt.
- Cài đặt chỉ lưu theo từng trình duyệt.
- Ngôn ngữ mặc định theo trình duyệt; menu chuột phải và thông báo cũng dịch.
- Font Be Vietnam Pro.
- Thanh kéo chỉ điều khiển thẻ nhóm và dòng link; thanh trên/dưới, menu và hộp thoại giữ độ mờ cố định.
- Popup 420x580.
- Nắm cả dòng để kéo, tự mở nhóm khi giữ link phía trên, thẻ nghiêng nhẹ khi kéo.
- Tài liệu đặt ở `specs/` thay vì `docs/superpowers/specs/`, vì `docs/` đang là nguồn của GitHub Pages (để trong đó sẽ bị đăng công khai lên web). Tài liệu chưa commit.

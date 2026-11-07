<div align="center">

<img src="icons/icon128.png" width="88" alt="Save Link">

# Save Link

**Lưu link theo nhóm, tìm lại khi cần.**
Tiện ích trình duyệt miễn phí, mã nguồn mở, đồng bộ qua Google Sheet trong Drive của chính bạn.

[Chrome Web Store](https://chromewebstore.google.com/detail/aadamanlgmnfnihadggllbllfiggllob) ·
[Trang chủ](https://cdinhh.github.io/Extension-Save-Link/) ·
[Chính sách quyền riêng tư](https://cdinhh.github.io/Extension-Save-Link/vi/privacy.html) ·
[Báo lỗi](https://github.com/CDinhh/Extension-Save-Link/issues)

<img src="store/screenshot-1.jpg" width="720" alt="Popup của Save Link">

</div>

## Tính năng

- **Nhóm link theo màu**: mỗi nhóm một màu, kéo thả để sắp xếp nhóm và link, kể cả chuyển link sang nhóm khác.
- **Lưu nhanh**: chuột phải trên trang bất kỳ, hoặc bấm **+** trong popup để thêm trang đang mở.
- **Tìm kiếm tức thì** theo tiêu đề hoặc địa chỉ, tự mở nhóm chứa kết quả.
- **Đánh dấu đã xong**, sửa tại chỗ, sao chép link, xóa có nút hoàn tác.
- **Đồng bộ (tùy chọn)** giữa các trình duyệt qua một Google Sheet trong Drive của bạn.
- **Giao diện kính** sáng hoặc tối, tự chỉnh độ trong suốt và độ mờ.
- **Tiếng Việt và tiếng Anh**, đổi ngay trong popup.
- **Xuất/nhập** toàn bộ dữ liệu dạng JSON.

## Cài đặt

**Chrome Web Store:** [cài đặt Save Link](https://chromewebstore.google.com/detail/aadamanlgmnfnihadggllbllfiggllob) (Chrome, Edge, Brave, Cốc Cốc).

**Từ mã nguồn** (Chrome, Edge, Brave, Cốc Cốc, phiên bản 114 trở lên):

1. Tải mã nguồn: **Code → Download ZIP**, rồi giải nén.
2. Mở `chrome://extensions` (Brave: `brave://extensions`, Edge: `edge://extensions`) và bật **Developer mode**.
3. Bấm **Load unpacked** và chọn thư mục vừa giải nén.

## Sử dụng

| Việc cần làm | Cách làm |
|---|---|
| Tạo nhóm | Bấm **Nhóm mới** cạnh ô tìm kiếm |
| Thêm link | Bấm **+** trên nhóm, form tự điền trang đang mở |
| Lưu trang đang xem | Chuột phải → **Lưu trang vào...** → chọn nhóm |
| Mở link | Bấm vào link. Ctrl + bấm để mở mà vẫn giữ popup |
| Sửa, sao chép, xóa | Rê chuột vào link để hiện các nút |
| Đổi màu nhóm | Bấm vòng tròn màu cạnh tên nhóm |
| Sắp xếp | Kéo tên nhóm hoặc kéo cả dòng link. Thả lên tên một nhóm khác để chuyển link sang đó |
| Đổi giao diện, ngôn ngữ, độ trong suốt | Bấm bánh răng trên thanh trên |

## Đồng bộ và quyền riêng tư

Đồng bộ là tùy chọn. Khi bạn đăng nhập Google, tiện ích tạo một sheet tên **"Link Inventory Extension [Dont delete]"** trong Drive của bạn và giữ nó khớp với dữ liệu trong trình duyệt.

- **Không có server riêng:** tác giả không nhận và không xem được link của bạn. Không có analytics hay quảng cáo.
- **Chỉ truy cập một file:** quyền `drive.file` chỉ cho phép đụng tới sheet do tiện ích tạo ra.
- **Gộp, không ghi đè:** lần đầu đăng nhập, dữ liệu trên máy và trên sheet được gộp lại. Nếu cả hai nơi cùng sửa, bản mới nhất được giữ.
- **Sửa thẳng trên sheet cũng được:** mỗi dòng là một link với các cột `Category | Category description | Category color | URL | Description | Done | Added`.
- **Xóa sheet thì đồng bộ tạm dừng:** dữ liệu trên máy vẫn còn. Bấm đồng bộ để tạo sheet mới, hoặc đăng xuất.

Chi tiết trong [chính sách quyền riêng tư](https://cdinhh.github.io/Extension-Save-Link/vi/privacy.html).

## Phát triển

```text
manifest.json         Manifest V3
popup.html/css/js     Popup
i18n.js               Chữ tiếng Việt và tiếng Anh (popup và menu chuột phải)
settings.js           Cài đặt hiển thị, lưu trong chrome.storage.local
settings-boot.js      Áp giao diện trước lần vẽ đầu, tránh nháy sáng
background.js         Service worker: menu chuột phải, đăng nhập, đồng bộ
google-auth.js        Đăng nhập Google qua launchWebAuthFlow
sheets-sync.js        Đọc/ghi Google Sheet qua REST
category-colors.js    Chọn màu chưa dùng cho nhóm mới
Sortable.min.js       Kéo thả
icons/                Icon extension và sprite Phosphor Light (MIT)
fonts/                Be Vietnam Pro (SIL OFL)
tests/                Kiểm thử popup trên Edge qua CDP
scripts/              Đóng gói zip cho Chrome Web Store
store/                Nội dung và hình ảnh cho Chrome Web Store
docs/                 Trang chủ và chính sách (GitHub Pages)
```

**Kiểm thử:** `node tests/popup.e2e.mjs` chạy toàn bộ, hoặc `node tests/popup.e2e.mjs drag settings` chạy từng mục. Cần Node 24 và Microsoft Edge. Đường dẫn trình duyệt khác thì đặt `BROWSER_PATH`.

**Đóng gói cho store:** `python scripts/package-store.py` tạo `dist/save-link-extension-<version>.zip`, chỉ chứa file cần thiết và bỏ `key` khỏi manifest.

**Google Cloud** (project chứa OAuth client):

1. Bật **Google Sheets API** và **Google Drive API**.
2. **Data access**: thêm scope `.../auth/drive.file`.
3. **Clients**: OAuth client loại Web application, có redirect URI `https://<extension-id>.chromiumapp.org/oauth-redirect.html` cho từng extension ID (bản cài từ mã nguồn và bản trên store).
4. **Branding**: Home page và Privacy policy trỏ tới GitHub Pages, thêm `cdinhh.github.io` vào Authorized domains.
5. **Audience**: Publish app để chuyển sang In production.

## Giấy phép

MIT. Icon [Phosphor](https://phosphoricons.com) (MIT), font [Be Vietnam Pro](https://github.com/bettergui/BeVietnamPro) (SIL OFL 1.1), kéo thả bằng [SortableJS](https://github.com/SortableJS/Sortable) (MIT).

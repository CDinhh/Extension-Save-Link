# Save Link - Browser Extension 🔗

Extension trình duyệt để lưu và quản lý links với tên và mô tả.

## ✨ Tính năng

- 📁 **Tạo Categories** - Phân loại links theo nhóm
- 🔗 **Lưu Links** - Thêm link với tên, URL và mô tả chi tiết
- ✏️ **Chỉnh sửa** - Cập nhật thông tin links đã lưu
- 🗑️ **Xóa** - Xóa links hoặc categories không cần thiết
- 🔍 **Tìm kiếm** - Tìm links nhanh chóng
- 🌐 **Mở nhanh** - Click vào tên link để mở trong tab mới
- 💾 **Tự động lưu** - Dữ liệu được lưu tự động trong trình duyệt

## 📦 Cài đặt

### Chrome / Edge / Brave

1. Mở trình duyệt và vào `chrome://extensions/` (hoặc `edge://extensions/`)
2. Bật **Developer mode** (góc trên bên phải)
3. Click **Load unpacked**
4. Chọn thư mục `Extension-Save-Link`
5. Extension sẽ xuất hiện trên thanh công cụ!

### Firefox

1. Vào `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Chọn file `manifest.json` trong thư mục `Extension-Save-Link`

## 🚀 Cách sử dụng

1. **Thêm Category mới**:
   - Click icon 📁 ở góc trên
   - Nhập tên category (VD: Work, Personal, Learning)

2. **Lưu Link**:
   - Nhập Category (hoặc chọn từ danh sách)
   - Nhập tên link
   - Nhập URL
   - Nhập mô tả (tùy chọn)
   - Click **💾 Lưu Link**

3. **Xem và quản lý**:
   - Click vào category để xem/ẩn links
   - Click vào tên link để mở trang web
   - Click ✏️ để chỉnh sửa
   - Click 🗑️ để xóa

4. **Tìm kiếm**:
   - Gõ từ khóa vào ô tìm kiếm
   - Kết quả lọc theo tên, URL, hoặc mô tả

## 📁 Cấu trúc dự án

```
Extension-Save-Link/
├── manifest.json      # Cấu hình extension
├── popup.html         # Giao diện popup
├── popup.css          # Styling
├── popup.js           # Logic chính
├── icons/             # Icons cho extension
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # Documentation
```

## 🎨 Screenshots

Extension có giao diện đẹp mắt với:
- Gradient màu tím sang trọng
- Hiệu ứng hover mượt mà
- Responsive và dễ sử dụng
- Dark mode friendly

## 💡 Tips

- Sử dụng categories để tổ chức links theo chủ đề
- Viết mô tả chi tiết để dễ nhớ mục đích của link
- Dùng tính năng tìm kiếm khi có nhiều links
- Click vào header category để collapse/expand

## 🔧 Development

Extension này sử dụng:
- **Manifest V3** - Phiên bản mới nhất
- **Chrome Storage API** - Lưu trữ dữ liệu local
- **Vanilla JavaScript** - Không cần framework
- **Modern CSS** - Flexbox, transitions, gradients

## 📝 License

MIT License - Sử dụng tự do!

---

Made with ❤️ for better link management

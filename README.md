# Save Link - Browser Extension 🔗

Extension trình duyệt để lưu và quản lý links với categories, màu sắc tùy chỉnh và nhiều tính năng tiện lợi.

## ✨ Tính năng

- 📁 **Quản lý Categories** - Phân loại links theo nhóm với màu sắc tùy chỉnh
- 🎨 **Color Picker** - Chọn màu riêng cho mỗi category
- 🔗 **Lưu Links** - Thêm link với URL và mô tả chi tiết
- ✏️ **Inline Editing** - Chỉnh sửa trực tiếp trên giao diện
- ✅ **Checkbox Done** - Đánh dấu links đã xem/hoàn thành
- 🔍 **Tìm kiếm** - Tìm links nhanh chóng theo URL hoặc mô tả
- 🖱️ **Context Menu** - Chuột phải để lưu trang hiện tại vào category
- ☁️ **Cloud Sync** - Đồng bộ data giữa nhiều máy/trình duyệt qua Google Cloud ⭐ **MỚI!**
- 🔐 **Google Sign-In** - Đăng nhập Google để sync data tự động
- 📤 **Export/Import** - Backup và restore dữ liệu dạng JSON
- 🌐 **Mở nhanh** - Click vào URL để mở trong tab mới
- 📋 **Copy URL** - Copy đường dẫn nhanh chóng
- 💾 **Auto Save** - Dữ liệu được lưu tự động trong trình duyệt
- 🎯 **Collapsed/Expanded** - Tự động ghi nhớ trạng thái mở/đóng categories

## 🔄 Cloud Sync - Đồng bộ giữa nhiều thiết bị

Extension hỗ trợ **đồng bộ data qua Google Cloud Firestore**!

### Tại sao cần Cloud Sync?

- ✅ Sync giữa **mọi trình duyệt**: Chrome, Edge, Brave, Cốc Cốc...
- ✅ Sync giữa **nhiều máy tính**: laptop, PC, máy công ty...
- ✅ **Tự động backup** data lên cloud, không lo mất dữ liệu
- ✅ **Real-time sync** - cập nhật ngay lập tức

### Cách sử dụng Cloud Sync

1. Nhấn nút **"Sign In"** trên header extension
2. Đăng nhập bằng tài khoản Google
3. Data sẽ tự động sync lên cloud!
4. Cài extension trên máy khác, đăng nhập cùng tài khoản → data tự động đồng bộ

### Cài đặt Firebase (cho Developer)

**Nếu bạn là end-user và cài extension từ Chrome Web Store:**
- Không cần setup gì! Developer đã setup Firebase sẵn
- Chỉ cần Sign In với Google và dùng ngay

**Nếu bạn là developer và muốn tự host:**
- Cần setup Firebase project riêng
- Xem hướng dẫn chi tiết tại: **[FIREBASE_SETUP.md](./FIREBASE_SETUP.md)**
- Quá trình setup mất khoảng 10-15 phút
- Hoàn toàn miễn phí với Firebase Free Tier

**Nếu bạn muốn deploy extension lên Store:**
- Xem hướng dẫn deploy tại: **[DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md)**
- Tất cả users sẽ dùng chung Firebase của bạn
- Chi phí rất thấp, ngay cả với hàng nghìn users!

## 📦 Cài đặt

### Tải từ Release (Khuyến nghị)

1. Vào [Releases page](https://github.com/CDinhh/Extension-Save-Link/releases)
2. Tải file ZIP từ release mới nhất
3. Giải nén file ZIP vào thư mục bất kỳ

### Cài đặt Extension

#### Chrome / Brave / Edge

1. Mở trình duyệt và vào:
   - Chrome: `chrome://extensions/`
   - Brave: `brave://extensions/`
   - Edge: `edge://extensions/`
2. Bật **Developer mode** ở góc trên bên phải
3. Click **Load unpacked** (hoặc **Tải tiện ích đã giải nén**)
4. Chọn thư mục đã giải nén `Extension-Save-Link`
5. Extension sẽ xuất hiện trên thanh công cụ!

#### Firefox

1. Vào `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Chọn file `manifest.json` trong thư mục đã giải nén

## 🚀 Cách sử dụng

### 1. Thêm Category mới
- Click nút **+ Add Category** bên cạnh search box
- Nhập tên category và mô tả (tùy chọn)
- Category mới sẽ xuất hiện với màu mặc định

### 2. Tùy chỉnh màu Category
- Click vào color picker (hình tròn) bên trái tên category
- Chọn màu yêu thích
- Tất cả elements trong category sẽ đổi màu theo

### 3. Thêm Link
- Click nút **➕** trong category muốn thêm
- Category tự động mở ra
- Nhập URL và mô tả
- Click **Save**

### 4. Lưu trang hiện tại (Context Menu)
- Chuột phải vào bất kỳ trang web nào
- Chọn **Save page to...** → chọn category
- Hoặc chọn **+ New category** để tạo category mới

### 5. Quản lý Links
- **✅ Checkbox**: Đánh dấu link đã xem/hoàn thành
- **Click URL**: Chỉnh sửa trực tiếp URL
- **Click Description**: Chỉnh sửa mô tả
- **Open button**: Mở link trong tab mới
- **Copy button** 📋: Copy URL vào clipboard
- **Delete button** ❌: Xóa link

### 6. Chỉnh sửa Category
- Click vào tên category để đổi tên
- Click vào mô tả để chỉnh sửa
- Tất cả thay đổi tự động lưu

### 7. Export/Import dữ liệu
- **Export**: Click nút **📤 Export** ở footer → tải file JSON
- **Import**: Click nút **📥 Import** → chọn file JSON đã backup

### 8. Tìm kiếm
- Gõ từ khóa vào ô search
- Kết quả lọc theo URL hoặc mô tả

## 📁 Cấu trúc dự án

```
Extension-Save-Link/
├── manifest.json      # Cấu hình extension (Manifest V3)
├── popup.html         # Giao diện popup
├── popup.css          # Styling với CSS variables
├── popup.js           # Logic chính
├── background.js      # Service worker cho context menu
├── icons/             # Icons cho extension
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md          # Documentation
```

## 🎨 Giao diện

Extension có thiết kế hiện đại với:
- ✨ White-Blue theme sạch sẽ, tối giản
- 🎨 Color customization cho mỗi category
- 🔄 Smooth transitions và hover effects
- 📱 Fixed height layout với scrollable content
- 🎯 Inline editing cho trải nghiệm mượt mà
- 🌈 CSS variables để thay đổi màu động

## 💡 Tips

- Sử dụng categories để tổ chức links theo chủ đề (Work, Learning, Tools...)
- Chọn màu khác nhau cho mỗi category để dễ phân biệt
- Viết mô tả chi tiết để dễ tìm kiếm sau này
- Dùng context menu để lưu trang nhanh khi đang browse
- Export dữ liệu định kỳ để backup
- Click vào category header để collapse/expand và giữ giao diện gọn gàng

## 🔧 Technical Stack

Extension này sử dụng:
- **Manifest V3** - Phiên bản extension mới nhất
- **Chrome Storage API** - Lưu trữ dữ liệu local
- **Chrome Identity API** - Google OAuth authentication
- **Firebase Firestore** - Cloud database để sync data
- **Firestore REST API** - Direct API calls không cần SDK
- **Context Menus API** - Menu chuột phải
- **Notifications API** - Thông báo khi lưu link
- **Clipboard API** - Copy URL
- **Vanilla JavaScript** - Không cần framework, lightweight
- **Modern CSS** - Flexbox, CSS Variables, color-mix()
- **Font Awesome 6** - Icons đẹp và phong phú

## 🌐 Tương thích

- ✅ Chrome 88+
- ✅ Brave
- ✅ Microsoft Edge 88+
- ✅ Firefox 90+ (với một số điều chỉnh nhỏ)

## � Documentation

### For Users
- **[Quick Start](./QUICK_START_VI.md)** - Hướng dẫn nhanh sử dụng Cloud Sync
- **[Privacy Policy](./PRIVACY_POLICY.md)** - Chính sách bảo mật và quyền riêng tư

### For Developers  
- **[Firebase Setup Guide](./FIREBASE_SETUP.md)** - Hướng dẫn chi tiết setup Firebase & OAuth
- **[Deploy Checklist](./DEPLOY_CHECKLIST.md)** - Checklist deploy lên Chrome Web Store
- **Technical Stack**: Chrome Extension Manifest V3, Firebase Firestore, Google OAuth 2.0

### Important Notes
- Extension hoạt động **offline** với local storage
- Cloud Sync là **optional** - không bắt buộc phải đăng nhập
- Nếu deploy lên Store, tất cả users dùng chung Firebase của developer (an toàn, isolated data)
- Chi phí Firebase rất thấp, ngay cả với hàng nghìn users

## �📝 License

MIT License - Sử dụng tự do!

---

Made with ❤️ for better link management

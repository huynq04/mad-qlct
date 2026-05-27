# 2 chức năng: Quản lý Ví + AI Quét Hóa Đơn

Mục tiêu: tài liệu này chỉ giữ lại **2 chức năng bạn làm**:

1) **Quản lý ví** (tạo/cập nhật/xóa ví, hiển thị danh sách ví)
2) **AI scan hóa đơn** (chụp/tải ảnh → AI trích xuất → tự điền form giao dịch)

---

## Danh sách chức năng được phân công

### A) Quản lý ví (Wallet)

- Hiển thị danh sách ví realtime theo `uid`, tính tổng số dư (tab Ví).
- Tạo ví mới: nhập tên + chọn biểu tượng (upload ảnh icon lên Cloudinary nếu có).
- Cập nhật ví: sửa tên/icon ví.
- Xóa ví: xóa ví và xóa toàn bộ giao dịch liên quan theo `walletId`.

### B) AI Scan hóa đơn (Invoice Scan)

- Mở modal quét hóa đơn từ màn tạo giao dịch.
- Chụp ảnh hoặc tải ảnh hóa đơn (expo-image-picker).
- Gọi AI để trích xuất `totalAmount`, `date`, `description`, `category`.
- Hiển thị kết quả và cho phép người dùng chỉnh sửa trước khi xác nhận.
- Truyền kết quả scan về `transactionModal` và tự điền form giao dịch (amount/category/date/description).

---

## 1) Quản lý ví (Wallet)

### Luồng đơn giản

```
app/(tabs)/wallet.tsx
  └─ lấy danh sách ví realtime: useFetchData("wallets", where(uid==user.uid))
      └─ hooks/useFetchData.ts (onSnapshot Firestore)
  └─ render từng ví: components/WalletListItem.tsx
  └─ bấm (+) → mở modal: "/(modals)/walletModal"
      └─ app/(modals)/walletModal.tsx
          └─ lưu/xóa ví: services/walletService.ts
              ├─ (nếu có icon) upload: services/imageServices.ts (Cloudinary)
              └─ setDoc/deleteDoc: Firestore (config/firebase.ts)
```

### Các file chính và chức năng

- `app/(tabs)/wallet.tsx` (hiển thị danh sách ví)
  - UI tab Ví, hiển thị tổng số dư và danh sách ví.
  - Mở `walletModal` khi người dùng muốn tạo ví mới.

- `app/(modals)/walletModal.tsx` (tạo/cập nhật/xóa ví)
  - Form nhập `name` và chọn `image` (icon).
  - `onSubmit()` gọi `createOrUpdateWallet()` để lưu.
  - Có nút xóa (trash) để gọi `deleteWallet()`.

- `services/walletService.ts` (lưu/xóa ví lên Firebase)
  - `createOrUpdateWallet()`: upload icon (nếu có) rồi `setDoc` vào collection `wallets`.
  - `deleteWallet()`: xóa ví và xóa các transactions liên quan theo `walletId`.

- `services/imageServices.ts` (upload ảnh lên Cloudinary)
  - `uploadFileToCloudinary(file, folderName)` dùng cho icon ví và ảnh hóa đơn của giao dịch.

- `hooks/useFetchData.ts` (realtime fetch Firestore)
  - Dùng `onSnapshot()` để tự cập nhật danh sách ví khi database thay đổi.

- `components/WalletListItem.tsx` (UI item ví)
  - Hiển thị icon, tên ví, số dư.
  - Bấm vào item sẽ mở `walletModal` để sửa ví.

- `app/_layout.tsx` (đăng ký route modal)
  - Đăng ký `"(modals)/walletModal"` để Expo Router mở dưới dạng modal.

---

## 2) AI Scan hóa đơn (Invoice Scan)

### Luồng đơn giản

```
app/(modals)/transactionModal.tsx
  └─ bấm Scan → mở "/(modals)/scanInvoiceModal"
      └─ app/(modals)/scanInvoiceModal.tsx
          ├─ chụp/tải ảnh: expo-image-picker
          ├─ gọi AI: services/aiService.ts:scanInvoiceWithAI(imageUri)
          ├─ xem + sửa kết quả (optional)
          └─ Confirm → utils/scanInvoiceResultStore.ts:setPendingScanResult(result)
              └─ router.back()

app/(modals)/transactionModal.tsx
  └─ focus lại → consumePendingScanResult()
      └─ tự điền amount/category/date/description vào form
```

> Lưu ý: app đang dùng `utils/scanInvoiceResultStore.ts` để truyền kết quả scan về `transactionModal` (không truyền qua params).

### Các file chính và chức năng

- `app/(modals)/scanInvoiceModal.tsx` (màn hình quét hóa đơn)
  - Chụp hoặc tải ảnh hóa đơn.
  - Gọi `scanInvoiceWithAI()` để lấy `ScanResult`.
  - Cho phép chỉnh sửa `totalAmount/date/category/description` trước khi xác nhận.

- `services/aiService.ts` (gọi AI + parse JSON)
  - `scanInvoiceWithAI(imageUri)`:
    - Nếu có `OPENAI_API_KEY` → gọi OpenAI (Responses API).
    - Nếu không có OpenAI key → fallback Gemini (nếu có `GEMINI_API_KEY`).
  - Parse output về `ScanResult` và trả `ResponseType` để UI show lỗi/thành công.

- `utils/scanInvoiceResultStore.ts` (store tạm kết quả scan)
  - `setPendingScanResult(result)` lưu tạm kết quả.
  - `consumePendingScanResult()` lấy ra 1 lần rồi reset về `null`.

- `app/(modals)/transactionModal.tsx` (nhận kết quả và tự điền form)
  - `useFocusEffect()` gọi `consumePendingScanResult()` khi quay lại từ modal scan.
  - Map category tiếng Việt sang value của app và parse ngày `"DD/MM/YYYY"` sang `Date`.

- `components/ScanResultItem.tsx` (UI hiển thị kết quả scan)
  - Render từng dòng kết quả (label/value + icon) trong `scanInvoiceModal`.

- `constants/index.ts` (API key cấu hình)
  - Chứa `OPENAI_API_KEY` và `GEMINI_API_KEY` để `aiService` sử dụng.

- `app/_layout.tsx` (đăng ký route modal)
  - Đăng ký `"(modals)/scanInvoiceModal"` để mở modal.

---

## Tóm tắt: các file bạn nên kiểm tra (ngắn gọn)

- `app/`: `app/(tabs)/wallet.tsx`, `app/(modals)/walletModal.tsx`, `app/(modals)/scanInvoiceModal.tsx`, `app/(modals)/transactionModal.tsx`, `app/_layout.tsx`
- `components/`: `components/ImageUpload.tsx`, `components/WalletListItem.tsx`, `components/ScanResultItem.tsx`
- `services/`: `services/walletService.ts`, `services/aiService.ts`, `services/imageServices.ts`
- `hooks/`: `hooks/useFetchData.ts`
- `utils/`: `utils/scanInvoiceResultStore.ts`

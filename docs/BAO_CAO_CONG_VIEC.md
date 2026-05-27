## Danh sách chức năng được phân công

### 1) Quản lý ví (Wallet)

- Hiển thị danh sách ví realtime theo `uid` (Firestore), sắp xếp theo thời gian tạo.
- Tính tổng số dư từ các ví và hiển thị trên tab Ví.
- Tạo ví mới: nhập tên + (tuỳ chọn) chọn biểu tượng.
- Cập nhật ví: sửa tên/icon.
- Xóa ví: xóa ví và xóa toàn bộ giao dịch liên quan theo `walletId`.

### 2) AI Scan hóa đơn (Invoice Scan)

- Mở modal quét hóa đơn từ màn tạo giao dịch.
- Chụp ảnh hoặc tải ảnh hóa đơn (expo-image-picker).
- Gọi AI (ưu tiên OpenAI, fallback Gemini) để trích xuất:
  - `totalAmount`
  - `date` (định dạng `DD/MM/YYYY`)
  - `description`
  - `category` (nhóm tiếng Việt)
- Hiển thị kết quả và cho phép người dùng chỉnh sửa trước khi xác nhận.
- Truyền kết quả scan về `transactionModal` và tự điền form giao dịch.

## Kiến trúc chi tiết hệ thống

### A) Kiến trúc chức năng Quản lý ví (Wallet)

**Thành phần chính:**

- UI Tab Ví: `app/(tabs)/wallet.tsx` (đọc realtime danh sách ví, tính tổng số dư, mở modal tạo ví).
- UI Modal ví: `app/(modals)/walletModal.tsx` (form nhập tên/icon, gọi service lưu/xóa).
- Hook realtime Firestore: `hooks/useFetchData.ts` (tạo `query` + `onSnapshot`).
- Service ví: `services/walletService.ts` (tạo/cập nhật ví bằng `setDoc`, xóa ví bằng `deleteDoc`, xóa giao dịch liên quan bằng `writeBatch`).
- Upload icon (nếu có): `services/imageServices.ts` (upload Cloudinary).
- Router modal: `app/_layout.tsx` (khai báo `"(modals)/walletModal"`).
- Hạ tầng dữ liệu: Firestore qua `config/firebase.ts` (khởi tạo `firestore`).

**Kết nối giữa các thành phần (luồng dữ liệu):**

```text
app/(tabs)/wallet.tsx
  ├─ useFetchData("wallets", where(uid==user.uid), orderBy(created desc))
  │    └─ hooks/useFetchData.ts → Firestore onSnapshot(query(...)) → wallets[]
  ├─ render wallets[] → components/WalletListItem.tsx
  └─ (+) router.push("/(modals)/walletModal") → mở modal

app/(modals)/walletModal.tsx
  ├─ nhận oldWallet (useLocalSearchParams) để biết create/update
  ├─ onSubmit() → services/walletService.ts:createOrUpdateWallet()
  │    ├─ (nếu có image) → services/imageServices.ts:uploadFileToCloudinary(...,"wallets")
  │    └─ Firestore setDoc(walletRef, walletToSave, { merge: true })
  └─ onDelete() → services/walletService.ts:deleteWallet(walletId)
       ├─ Firestore deleteDoc(walletRef)
       └─ deleteTransactionsByWalletId(walletId) → query(transactions where walletId==...) → batch.delete(...)
```

### B) Kiến trúc chức năng AI Scan hóa đơn (Invoice Scan)

**Thành phần chính:**

- UI Modal tạo giao dịch: `app/(modals)/transactionModal.tsx` (mở scan modal, nhận kết quả scan và auto-fill).
- UI Modal quét hóa đơn: `app/(modals)/scanInvoiceModal.tsx` (chụp/tải ảnh, gọi AI, hiển thị và cho sửa kết quả).
- Service AI: `services/aiService.ts` (đọc ảnh base64, gọi OpenAI/Gemini, parse JSON về `ScanResult`).
- Store tạm kết quả scan: `utils/scanInvoiceResultStore.ts` (in-memory 1 lần: `setPendingScanResult`/`consumePendingScanResult`).
- Router modal: `app/_layout.tsx` (khai báo `"(modals)/scanInvoiceModal"`).
- Cấu hình key: `constants/index.ts` (`OPENAI_API_KEY`, `GEMINI_API_KEY`).

**Kết nối giữa các thành phần (luồng dữ liệu end-to-end):**

```text
app/(modals)/transactionModal.tsx
  ├─ router.push("/(modals)/scanInvoiceModal") → mở modal quét hóa đơn
  └─ useFocusEffect() → consumePendingScanResult()
       └─ nếu có ScanResult → map category + parse date → setTransaction(...) auto-fill

app/(modals)/scanInvoiceModal.tsx
  ├─ expo-image-picker:
  │    ├─ launchCameraAsync() hoặc launchImageLibraryAsync() → imageUri
  ├─ handleScan() → services/aiService.ts:scanInvoiceWithAI(imageUri)
  │    ├─ Nếu có OPENAI_API_KEY → gọi OpenAI Responses API (model "gpt-4.1-mini")
  │    └─ Nếu không có OPENAI_API_KEY → gọi Gemini (model "gemini-2.5-flash")
  │         └─ parse output text → safeParseJSON/repairIncompleteJson → ScanResult
  └─ handleConfirm() → utils/scanInvoiceResultStore.ts:setPendingScanResult(result)
       └─ router.back() → quay lại transactionModal
```

## Code đáp ứng chức năng

### 1) Quản lý ví (Wallet)

**UI/Screen/Modal (lớp/Component):**

- `app/(tabs)/wallet.tsx`:
  - Tải danh sách ví realtime theo user hiện tại bằng `useFetchData<WalletType>("wallets", [...])`.
  - Tính tổng số dư bằng `wallets.reduce(...)` để hiển thị `Tổng số dư`.
  - Điều hướng mở modal tạo ví bằng `router.push("/(modals)/walletModal")`.
- `app/(modals)/walletModal.tsx`:
  - Nhận tham số ví cũ qua `useLocalSearchParams()` để phân biệt create/update.
  - Submit form gọi `createOrUpdateWallet(data)` để lưu vào Firestore.
  - Xóa ví gọi `deleteWallet(oldWallet.id)` và hiển thị confirm alert.
- `app/_layout.tsx`:
  - Khai báo route modal `"(modals)/walletModal"` để Expo Router mở dạng modal.

**Hook/Service/Function (hàm chính):**

- `hooks/useFetchData.ts`:
  - `useFetchData<T>(collectionName, constraints)` tạo `query(collectionRef, ...constraints)` và đăng ký `onSnapshot(...)`.
  - Output: `{ data, loading, error }` để UI render realtime.
- `services/walletService.ts`:
  - `createOrUpdateWallet(walletData)`:
    - Input: `Partial<WalletType>` (tên, icon, uid, id nếu update).
    - Nếu có `image` thì gọi `uploadFileToCloudinary(image, "wallets")` để lấy `secure_url`.
    - Nếu tạo mới (không có `id`) thì khởi tạo `amount/totalIncome/totalExpenses/created`.
    - Lưu Firestore bằng `setDoc(walletRef, walletToSave, { merge: true })`.
    - Output: `ResponseType` (success + data ví đã lưu).
  - `deleteWallet(walletId)`:
    - Xóa ví bằng `deleteDoc(doc(firestore,"wallets",walletId))`.
    - Gọi `deleteTransactionsByWalletId(walletId)` để xóa tất cả transaction liên quan.
  - `deleteTransactionsByWalletId(walletId)`:
    - Query `transactions` theo `where("walletId","==",walletId)` và xóa theo lô bằng `writeBatch`.
- `services/imageServices.ts`:
  - `uploadFileToCloudinary(file, folderName)`:
    - Input: file uri hoặc string URL sẵn có.
    - Upload Cloudinary bằng `multipart/form-data`, output `secure_url`.

**Bảng/Collection CSDL (Firestore):**

- `wallets`:
  - Lưu thông tin ví theo user: `uid`, `name`, `image`, `amount`, `totalIncome`, `totalExpenses`, `created`, ...
  - Được đọc realtime ở `app/(tabs)/wallet.tsx` thông qua `useFetchData`.
- `transactions`:
  - Có field `walletId` liên kết về ví.
  - Bị xóa theo `walletId` khi xóa ví (`deleteTransactionsByWalletId`).

**API gọi ngoài:**

- Cloudinary Upload API:
  - Endpoint: `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload` trong `services/imageServices.ts`.
  - Dùng để upload icon ví (folder `"wallets"`).

### 2) AI Scan hóa đơn (Invoice Scan)

**UI/Screen/Modal (lớp/Component):**

- `app/(modals)/transactionModal.tsx`:
  - Mở modal scan bằng `router.push("/(modals)/scanInvoiceModal")`.
  - Nhận kết quả scan bằng `useFocusEffect(... consumePendingScanResult())`.
  - Chuẩn hóa dữ liệu:
    - `mapAICategory(aiCategory)` map category tiếng Việt → code category của app.
    - `parseScannedDate("DD/MM/YYYY")` parse string → `Date`.
  - Auto-fill vào state `transaction` qua `setTransaction(prev => ({...}))`.
- `app/(modals)/scanInvoiceModal.tsx`:
  - Lấy ảnh hóa đơn:
    - `ImagePicker.launchCameraAsync(...)` hoặc `ImagePicker.launchImageLibraryAsync(...)` → `imageUri`.
  - Scan:
    - `handleScan()` gọi `scanInvoiceWithAI(imageUri)` và nhận `ScanResult`.
  - Confirm:
    - `handleConfirm()` gọi `setPendingScanResult(result)` rồi `router.back()`.
- `app/_layout.tsx`:
  - Khai báo route modal `"(modals)/scanInvoiceModal"`.

**Hook/Service/Function (hàm chính):**

- `utils/scanInvoiceResultStore.ts`:
  - `setPendingScanResult(result)` lưu tạm kết quả scan (in-memory).
  - `consumePendingScanResult()` lấy ra 1 lần và reset về `null`.
  - Mục đích: truyền dữ liệu giữa 2 modal mà không dùng router params.
- `services/aiService.ts`:
  - `scanInvoiceWithAI(imageUri)`:
    - Nếu có `OPENAI_API_KEY` → gọi `scanInvoiceWithOpenAI(imageUri)`.
    - Nếu không có OpenAI key:
      - Nếu thiếu `GEMINI_API_KEY` → trả lỗi cấu hình.
      - Nếu có Gemini key → gọi Gemini Vision API.
    - Output: `ResponseType` với `data` là `ScanResult`.
  - `scanInvoiceWithOpenAI(imageUri)`:
    - Đọc ảnh base64 bằng `readAsStringAsync(imageUri,{encoding:"base64"})`.
    - Gọi OpenAI Responses API với prompt `SCAN_PROMPT` + `input_image`.
    - Parse output text → `safeParseJSON(...)` → chuẩn hóa về `ScanResult`.
  - `safeParseJSON(text)` + `repairIncompleteJson(text)`:
    - Tăng độ chịu lỗi khi AI trả về JSON có code fence/trailing comma/thiếu dấu đóng.
  - `getOpenAIOutputTextFromResponse(data)` và `getGeminiTextFromResponse(data)`:
    - Chuẩn hóa cách lấy text output từ response của từng provider.

**Bảng/Collection CSDL (Firestore):**

- `transactions`:
  - Feature AI scan không ghi trực tiếp DB; nó chỉ auto-fill form trong `transactionModal`.
  - Việc ghi transaction xuống DB diễn ra khi user submit trong `transactionModal` (service transaction hiện có).

**API gọi ngoài:**

- OpenAI Responses API:
  - Endpoint: `https://api.openai.com/v1/responses` trong `services/aiService.ts`.
  - Model: `"gpt-4.1-mini"` (scan invoice).
  - Input: text prompt `SCAN_PROMPT` + ảnh dạng `data:<mime>;base64,...`.
- Gemini GenerateContent API:
  - Endpoint dạng `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=...`.
  - Input: `contents[].parts[]` gồm `text` + `inline_data` (base64 + mime type).

**Cấu hình/biến môi trường (liên quan trực tiếp):**

- `constants/index.ts`:
  - `OPENAI_API_KEY`, `GEMINI_API_KEY` cho `services/aiService.ts`.
  - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET` cho `services/imageServices.ts`.

## Hướng dẫn cài đặt, triển khai và lưu ý

### 1) Yêu cầu môi trường

- Node.js + npm (dùng để cài dependency và chạy Expo).
- Expo CLI (repo đã có script `expo start`, `expo run:android`, `expo run:ios` trong `package.json`).
- Android:
  - Android Studio + Android SDK (nếu chạy emulator hoặc build Android local).
  - File cấu hình Firebase Android: `google-services.json` (được trỏ trong `app.json`).
- iOS:
  - macOS + Xcode (nếu chạy simulator hoặc build iOS local).

### 2) Cài đặt và chạy dự án (dev)

1) Cài dependency:
   - `npm install`
2) Chạy dev server:
   - `npm run start`

Tùy môi trường:
- Android dev build: `npm run android`
- iOS dev build: `npm run ios`
- Web (nếu cần): `npm run web`

### 3) Cấu hình bắt buộc theo tính năng

**Firebase (Auth/Firestore):**

- Cấu hình Firebase client nằm trong `config/firebase.ts` (initialize app/auth/firestore).
- Android dùng `google-services.json` theo `app.json`:
  - `expo.android.googleServicesFile` = `./google-services.json`
- Firestore cần có rules/permissions phù hợp để đọc/ghi các collection:
  - `wallets` (đọc theo `uid`)
  - `transactions` (đọc/ghi theo `uid`, và xoá theo `walletId` khi xoá ví)

**Cloudinary (upload icon ví):**

- `services/imageServices.ts` upload ảnh lên Cloudinary bằng:
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_UPLOAD_PRESET`
- Nếu preset/folder không đúng hoặc bị chặn unsigned upload, việc lưu/cập nhật ví có icon sẽ lỗi.

**AI Scan Invoice (OpenAI/Gemini):**

- `services/aiService.ts` ưu tiên OpenAI nếu có `OPENAI_API_KEY`, nếu không thì fallback Gemini với `GEMINI_API_KEY`.
- Cần đảm bảo máy chạy app có internet ổn định; ảnh quá lớn/không hợp lệ có thể làm provider trả lỗi.
- Lưu ý giới hạn:
  - OpenAI/Gemini có thể rate-limit/quota (`429`), hoặc key sai (`401/403`).

### 4) Lưu ý khi triển khai (release/production)

- Không hardcode key trong source:
  - `constants/index.ts` đã được tối ưu để đọc key từ biến môi trường `EXPO_PUBLIC_*` (không commit key thật lên GitHub).
  - Khi triển khai production nên dùng `.env`/EAS Secrets hoặc backend proxy để tránh lộ key và kiểm soát chi phí.
- Tách trách nhiệm gọi AI:
  - Nếu cần kiểm soát chi phí/giới hạn truy cập, nên gọi AI qua backend (proxy) thay vì gọi thẳng từ app.
- Quyền truy cập thiết bị:
  - Tính năng scan cần quyền camera và truy cập thư viện ảnh; cần kiểm tra cấu hình permission khi build store.

## File cá nhân thực hiện (mô tả ngắn)

### 1) Quản lý ví (Wallet)

- `app/(tabs)/wallet.tsx`: màn tab Ví, đọc realtime danh sách ví theo `uid`, tính tổng số dư, điều hướng mở modal ví.
- `app/(modals)/walletModal.tsx`: modal tạo/cập nhật/xóa ví, gọi `walletService` để lưu/xóa.
- `hooks/useFetchData.ts`: hook subscribe Firestore `onSnapshot` để dữ liệu ví cập nhật realtime.
- `services/walletService.ts`: hàm `createOrUpdateWallet`, `deleteWallet`, `deleteTransactionsByWalletId` (lưu/xóa ví + xóa transactions theo `walletId`).
- `services/imageServices.ts`: hàm `uploadFileToCloudinary` (upload icon ví lên Cloudinary).
- `app/_layout.tsx`: khai báo route `"(modals)/walletModal"`.

### 2) AI Scan hóa đơn (Invoice Scan)

- `app/(modals)/scanInvoiceModal.tsx`: modal chụp/tải ảnh hóa đơn, gọi AI scan, hiển thị và cho sửa kết quả, confirm trả dữ liệu về transaction modal.
- `services/aiService.ts`: hàm `scanInvoiceWithAI` (OpenAI ưu tiên, fallback Gemini), parse output về `ScanResult`.
- `utils/scanInvoiceResultStore.ts`: store tạm in-memory để truyền kết quả scan giữa 2 modal.
- `app/(modals)/transactionModal.tsx`: mở scan modal và consume kết quả scan để auto-fill form giao dịch.
- `app/_layout.tsx`: khai báo route `"(modals)/scanInvoiceModal"`.

## Upload code và link GitHub

- Link repo (điền sau khi push): `https://github.com/<org-or-user>/<repo>`
- Gợi ý lệnh push (tham khảo):
  - `git remote -v`
  - `git status`
  - `git add .`
  - `git commit -m "Docs + comments for Wallet & AI Scan features"`
  - `git push -u origin <branch>`

# Tính năng AI Scan Invoice

Tài liệu này mô tả **đúng theo code hiện tại** của repo: luồng UI, các file tham gia, cách truyền dữ liệu giữa các màn, và cách service gọi AI (ưu tiên OpenAI, fallback Gemini).

## Phạm vi phân công

- Bạn phụ trách feature **AI Scan Invoice**: màn quét hóa đơn, gọi AI (OpenAI/Gemini), parse kết quả và tự điền form tạo giao dịch.

## Tổng quan

AI Scan Invoice cho phép người dùng:

1) Chụp ảnh hoặc tải ảnh hóa đơn
2) Gọi AI để trích xuất `totalAmount`, `date`, `description`, `category`
3) Xem và **chỉnh sửa kết quả** ngay trong màn scan
4) Xác nhận để **tự điền form tạo giao dịch** trong `transactionModal`

## Kiến trúc (luồng end-to-end)

```
app/(modals)/transactionModal.tsx
  └─ router.push("/(modals)/scanInvoiceModal")

app/(modals)/scanInvoiceModal.tsx
  ├─ chụp/upload ảnh (expo-image-picker)
  ├─ scanInvoiceWithAI(imageUri) (services/aiService.ts)
  │    ├─ nếu có OPENAI_API_KEY → OpenAI Responses API (gpt-4.1-mini)
  │    └─ nếu không có OPENAI_API_KEY → Gemini (gemini-2.5-flash)
  ├─ parse JSON → ScanResult
  ├─ (optional) user chỉnh sửa result
  └─ Confirm → setPendingScanResult(result) (utils/scanInvoiceResultStore.ts)
      └─ router.back()

app/(modals)/transactionModal.tsx
  └─ useFocusEffect() → consumePendingScanResult()
      └─ mapAICategory() + parseScannedDate()
          └─ setTransaction(...) auto-fill form
```

## Các file liên quan (bám sát code)

### 1) `app/(modals)/scanInvoiceModal.tsx`
**Vai trò:** UI quét hóa đơn (capture/upload), gọi AI, hiển thị kết quả, cho chỉnh sửa và xác nhận.

**State chính:**
- `mode`: `"capture" | "upload"`
- `imageUri`: `string | null`
- `scanning`: `boolean` + `scanningRef` để chặn bấm scan nhiều lần
- `result`: `ScanResult | null`
- `editing`: `boolean` (toggle chế độ chỉnh sửa)
- `showDatePicker`: `boolean` (chỉnh ngày bằng `@react-native-community/datetimepicker`)

**Các hàm chính:**
- `handleCapture()`: xin quyền camera → `ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: false })`
- `handleUpload()`: `ImagePicker.launchImageLibraryAsync({ quality: 1, allowsEditing: false, mediaTypes: ["images"] })`
- `handleScan()`: gọi `scanInvoiceWithAI(imageUri)` → `setResult(res.data)` hoặc `Alert` nếu lỗi
- `handleConfirm()`: `setPendingScanResult(result)` rồi `router.back()`

**Lưu ý quan trọng:** hiện tại màn scan **không resize ảnh theo max width/height** và để `quality: 1` đúng như code.

### 2) `services/aiService.ts`
**Vai trò:** gọi AI và parse output thành `ScanResult`.

**Cấu hình chính:**
- OpenAI:
  - endpoint: `https://api.openai.com/v1/responses`
  - model: `gpt-4.1-mini`
- Gemini:
  - endpoint: `.../models/gemini-2.5-flash:generateContent?key=...`

**Hàm entrypoint:**
- `scanInvoiceWithAI(imageUri)`:
  - Nếu có `OPENAI_API_KEY` → gọi `scanInvoiceWithOpenAI(imageUri)`
  - Nếu không có OpenAI key:
    - thiếu `GEMINI_API_KEY` → trả lỗi cấu hình
    - có Gemini key → gọi Gemini Vision API

**Schema kết quả AI (bắt buộc theo prompt):**
AI được yêu cầu trả về **duy nhất 1 JSON object** theo schema:

```json
{
  "totalAmount": 0,
  "date": "DD/MM/YYYY",
  "description": "tối đa 5 món/sản phẩm...",
  "category": "Ăn uống|Di chuyển|Mua sắm|Y tế|Giải trí|Giáo dục|Hóa đơn|Khác"
}
```

**Parse JSON “chịu lỗi”:**
- `safeParseJSON()` + `repairIncompleteJson()` để xử lý các trường hợp AI trả về có ```json fences, trailing commas, hoặc JSON thiếu dấu đóng.

**Xử lý lỗi theo code:**
- OpenAI: `401` (key không hợp lệ), `429` (rate-limit), còn lại trả message từ server nếu có.
- Gemini: `400` (ảnh không hợp lệ/quá lớn), `403` (key không hợp lệ), `429` (quota/rate-limit).

### 3) `utils/scanInvoiceResultStore.ts`
**Vai trò:** “kênh truyền 1 lần” kết quả scan về `transactionModal` bằng biến in-memory.

- `setPendingScanResult(result)`: lưu lại `ScanResult`
- `consumePendingScanResult()`: lấy ra rồi reset về `null`

**Vì sao cần file này?**
- Implementation hiện tại **không** truyền kết quả qua router params; thay vào đó `scanInvoiceModal` set store rồi `transactionModal` consume khi focus lại.

### 4) `app/(modals)/transactionModal.tsx`
**Vai trò:** nhận kết quả scan và tự điền form giao dịch.

**Điểm nối chính:**
- Mở scan modal: `router.push("/(modals)/scanInvoiceModal")`
- Nhận kết quả: `useFocusEffect(() => consumePendingScanResult())`
- Normalize dữ liệu:
  - `parseScannedDate("DD/MM/YYYY")` → `Date`
  - `mapAICategory("Ăn uống")` → category code theo app

**Mapping category AI → app category value (đúng theo code):**
| AI trả về | Value lưu trong transaction |
|---|---|
| `Ăn uống` | `dining` |
| `Di chuyển` | `transportation` |
| `Mua sắm` | `groceries` |
| `Y tế` | `health` |
| `Giải trí` | `entertainment` |
| `Giáo dục` | `personal` |
| `Hóa đơn` | `utilities` |
| `Khác` | `others` |

### 5) `components/ScanResultItem.tsx`
**Vai trò:** UI item hiển thị 1 dòng kết quả (label/value + icon), dùng `useTheme()` để support dark/light.

### 6) `types.ts`
**Vai trò:** định nghĩa `ScanResult` dùng chung giữa UI và service.

```ts
export type ScanResult = {
  totalAmount: number;
  date: string;
  description: string;
  category: string;
};
```

### 7) `constants/index.ts`
**Vai trò:** chứa các API key/cấu hình mà AI scan phụ thuộc.

Trong code hiện tại:
- `services/aiService.ts` đọc `OPENAI_API_KEY` và `GEMINI_API_KEY`
- `services/imageServices.ts` đọc `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_UPLOAD_PRESET`

Khuyến nghị: không commit key thật; đưa sang `.env`/secrets và/hoặc proxy qua backend.

### 8) `app/_layout.tsx`
**Vai trò:** đăng ký route modal, bao gồm:

```ts
<Stack.Screen name="(modals)/scanInvoiceModal" options={{ presentation: "modal" }} />
```

## Dependencies (theo `package.json`)

- `expo-image-picker`: chụp/tải ảnh hóa đơn
- `expo-file-system` (đang dùng `expo-file-system/legacy`): đọc ảnh → base64
- `axios`: gọi OpenAI/Gemini APIs
- `@react-native-community/datetimepicker`: chỉnh ngày ở màn scan

## Luồng sử dụng (UI)

1) Mở `transactionModal` (tạo giao dịch mới)
2) Bấm icon Scan để mở `scanInvoiceModal`
3) Chọn **CHỤP ẢNH** hoặc **TẢI ẢNH LÊN**
4) Bấm **QUÉT HÓA ĐƠN** để gọi AI
5) (Tuỳ chọn) bấm **Sửa** để chỉnh lại tổng tiền/ngày/danh mục/mô tả
6) Bấm **Xác nhận** → quay lại `transactionModal` và form được tự điền
7) Chọn ví/danh mục (nếu cần) → lưu giao dịch

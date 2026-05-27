import { ScanResult } from "@/types";

/**
 * Store tạm in-memory để truyền kết quả AI Scan giữa các modal.
 *
 * Bối cảnh:
 * - `app/(modals)/scanInvoiceModal.tsx` quét xong sẽ gọi `setPendingScanResult(result)`
 * - Quay lại `app/(modals)/transactionModal.tsx`, màn này sẽ gọi `consumePendingScanResult()` khi focus để auto-fill form
 *
 * Lý do dùng store:
 * - Luồng hiện tại không truyền kết quả qua router params.
 *
 * Lưu ý quan trọng:
 * - `consumePendingScanResult()` chỉ lấy được 1 lần và sẽ reset về `null` sau khi đọc.
 */
let pendingScanResult: ScanResult | null = null;

/**
 * Lưu kết quả scan (chỉ lưu tạm trong RAM).
 * Được gọi từ `app/(modals)/scanInvoiceModal.tsx` khi user bấm "Xác nhận".
 */
export const setPendingScanResult = (result: ScanResult) => {
  pendingScanResult = result;
};

/**
 * Lấy kết quả scan ra 1 lần rồi xóa khỏi store.
 * Được gọi từ `app/(modals)/transactionModal.tsx` khi màn focus lại.
 */
export const consumePendingScanResult = (): ScanResult | null => {
  const result = pendingScanResult;
  pendingScanResult = null;
  return result;
};

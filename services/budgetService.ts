import { firestore } from "@/config/firebase";
import { BudgetType, ExpenseLimitPeriod, ResponseType } from "@/types";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  where,
} from "firebase/firestore";

const validTypes: ExpenseLimitPeriod[] = ["day", "week", "month"];

/**
 * (ĐẶT GIỚI HẠN VÍ) Lấy danh sách ngân sách/giới hạn chi tiêu theo `walletId`.
 *
 * Bối cảnh tính năng:
 * - Mỗi ví có thể đặt giới hạn chi tiêu theo 3 chu kỳ: ngày/tuần/tháng.
 * - Dữ liệu lưu ở collection `budget`, mỗi document thường tương ứng 1 (walletId + type).
 *
 * Cách hàm hoạt động:
 * 1) Query Firestore: lấy toàn bộ document trong `budget` có `walletId` đúng với ví đang chọn.
 * 2) Chuẩn hóa & lọc dữ liệu:
 *    - Chỉ nhận `type` hợp lệ (day/week/month).
 *    - Chỉ nhận `amount` là số dương.
 * 3) Gom theo `type` (dùng object `byType`) để tránh trùng và để UI hiển thị gọn.
 *
 * Output:
 * - `ResponseType` với `data` là mảng `BudgetType[]` (mỗi phần tử có id, walletId, type, amount).
 */
export const getBudgetByWalletId = async (
  walletId: string,
): Promise<ResponseType> => {
  try {
    const budgetQuery = query(
      collection(firestore, "budget"),
      where("walletId", "==", walletId),
    );

    const snapshot = await getDocs(budgetQuery);
    const byType: Partial<Record<ExpenseLimitPeriod, BudgetType>> = {};

    snapshot.docs.forEach((item) => {
      const budget = { id: item.id, ...item.data() } as BudgetType;
      if (!budget?.type || !validTypes.includes(budget.type)) return;

      const amount = Number(budget.amount);
      if (!amount || amount <= 0) return;

      byType[budget.type] = {
        id: budget.id,
        walletId: budget.walletId,
        type: budget.type,
        amount,
      };
    });

    const budgets = (Object.keys(byType) as ExpenseLimitPeriod[]).map(
      (type) => {
        return byType[type] as BudgetType;
      },
    );

    return { success: true, data: budgets };
  } catch (err: any) {
    console.log("error fetching budget by wallet: ", err);
    return { success: false, msg: err.message };
  }
};

/**
 * (ĐẶT GIỚI HẠN VÍ) Tạo mới hoặc cập nhật giới hạn chi tiêu cho 1 ví theo chu kỳ.
 *
 * Ý nghĩa:
 * - Người dùng có thể đặt giới hạn theo ngày/tuần/tháng.
 * - Với mỗi (walletId + type) chỉ nên có 1 document. Vì vậy hàm sẽ:
 *   - Nếu đã tồn tại: cập nhật document đó.
 *   - Nếu chưa có: tạo document mới.
 *
 * Các bước xử lý:
 * 1) Validate input (walletId, type thuộc validTypes, amount > 0).
 * 2) Query xem đã có budget cho (walletId + type) chưa.
 * 3) Xác định `budgetRef`:
 *    - Có rồi: trỏ vào doc cũ.
 *    - Chưa có: tạo doc mới (auto id).
 * 4) Ghi dữ liệu bằng `setDoc(..., { merge: true })` để an toàn khi update.
 */
export const createOrUpdateBudget = async (
  payload: Pick<BudgetType, "walletId" | "type" | "amount">,
): Promise<ResponseType> => {
  try {
    const { walletId, type, amount } = payload;

    if (!walletId || !validTypes.includes(type) || !amount || amount <= 0) {
      return { success: false, msg: "Invalid budget data" };
    }

    const existingQuery = query(
      collection(firestore, "budget"),
      where("walletId", "==", walletId),
      where("type", "==", type),
    );
    const existingSnapshot = await getDocs(existingQuery);

    const budgetRef = !existingSnapshot.empty
      ? doc(firestore, "budget", existingSnapshot.docs[0].id)
      : doc(collection(firestore, "budget"));

    await setDoc(
      budgetRef,
      {
        walletId,
        type,
        amount,
      },
      { merge: true },
    );

    return {
      success: true,
      data: {
        id: budgetRef.id,
        walletId,
        type,
        amount,
      },
    };
  } catch (err: any) {
    console.log("error creating or updating budget: ", err);
    return { success: false, msg: err.message };
  }
};

export const deleteBudget = async (id: string): Promise<ResponseType> => {
  try {
    await deleteDoc(doc(firestore, "budget", id));
    return { success: true, msg: "Budget deleted" };
  } catch (err: any) {
    console.log("error deleting budget: ", err);
    return { success: false, msg: err.message };
  }
};

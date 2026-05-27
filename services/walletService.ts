import { auth, firestore } from "@/config/firebase";
import { ResponseType, WalletType } from "@/types";
import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    setDoc,
    where,
    writeBatch,
} from "firebase/firestore";
import { uploadFileToCloudinary } from "./imageServices";

/**
 * Loại bỏ các field có giá trị `undefined` trước khi ghi Firestore
 * để tránh lưu dữ liệu rỗng ngoài ý muốn.
 */
const removeUndefinedFields = <T extends Record<string, any>>(data: T): T => {
  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as T;
};

/**
 * Tạo mới hoặc cập nhật một ví trong Firestore.
 *
 * Thành phần liên quan:
 * - UI gọi vào: `app/(modals)/walletModal.tsx`
 * - Upload ảnh ngoài: `services/imageServices.ts` (Cloudinary)
 *
 * Input:
 * - `walletData.id`:
 *   - Có: update ví hiện có (dùng `setDoc(..., { merge: true })`)
 *   - Không: tạo ví mới và khởi tạo các trường tổng hợp
 * - `walletData.image` (tuỳ chọn): nếu có thì upload Cloudinary trước, lưu URL về Firestore
 *
 * Output:
 * - `ResponseType`: `{ success, data|msg }`
 */
export const createOrUpdateWallet = async (
  walletData: Partial<WalletType>,
): Promise<ResponseType> => {
  try {
    let walletToSave = { ...walletData };
    walletToSave.image = walletToSave.image ?? null;
    walletToSave.uid = walletToSave.uid ?? auth.currentUser?.uid;

    if (walletData.image) {
      const imageUploadRes = await uploadFileToCloudinary(
        walletData.image,
        "wallets",
      );
      if (!imageUploadRes.success) {
        return {
          success: false,
          msg: imageUploadRes.msg || "Không thể tải biểu tượng ví lên",
        };
      }
      walletToSave.image = imageUploadRes.data;
    }
    if (!walletData?.id) {
      if (!walletToSave.uid) {
        return {
          success: false,
          msg: "Bạn chưa đăng nhập hoặc phiên đã hết hạn. Vui lòng đăng nhập lại.",
        };
      }
      walletToSave.amount = 0;
      walletToSave.totalIncome = 0;
      walletToSave.totalExpenses = 0;
      walletToSave.created = new Date();
    }

    const walletRef = walletData?.id
      ? doc(firestore, "wallets", walletData?.id)
      : doc(collection(firestore, "wallets"));
    walletToSave = removeUndefinedFields(walletToSave);
    await setDoc(walletRef, walletToSave, { merge: true }); // updates only the data provided
    return { success: true, data: { ...walletToSave, id: walletRef.id } };
  } catch (error: any) {
    console.log("error creating or updating wallet: ", error);
    return { success: false, msg: error.message };
  }
};

/**
 * Xóa ví và toàn bộ giao dịch liên quan.
 *
 * API/DB thao tác:
 * - Firestore: xóa document trong collection `wallets`
 * - Firestore: xóa các document trong collection `transactions` theo `walletId`
 *
 * Lưu ý:
 * - Đây là "cascading delete" theo `walletId`, vì vậy sẽ làm mất dữ liệu giao dịch liên quan.
 * - Hàm sẽ trả lỗi nếu xóa transactions thất bại để UI có thể thông báo.
 */
export const deleteWallet = async (walletId: string): Promise<ResponseType> => {
  try {
    const walletRef = doc(firestore, "wallets", walletId);
    await deleteDoc(walletRef);

    // Delete all transactions related to this wallet (best-effort; surfaced to caller if it fails).
    const deleteTransactionsRes = await deleteTransactionsByWalletId(walletId);
    if (!deleteTransactionsRes.success) {
      return deleteTransactionsRes;
    }

    return { success: true, msg: "Ví đã được xóa thành công" };
  } catch (err: any) {
    console.log("error deleting wallet: ", err);
    return { success: false, msg: err.message };
  }
};

/**
 * Xóa tất cả giao dịch thuộc về một ví theo `walletId`.
 *
 * Vì Firestore giới hạn số operations trong một batch, nên hàm sẽ:
 * - Query tất cả transactions có `walletId`
 * - Xóa theo lô bằng `writeBatch`
 * - Lặp lại cho đến khi không còn document nào khớp
 */
export const deleteTransactionsByWalletId = async (
  walletId: string,
): Promise<ResponseType> => {
  try {
    let hasMoreTransactions = true;

    while (hasMoreTransactions) {
      const transactionsQuery = query(
        collection(firestore, "transactions"),
        where("walletId", "==", walletId),
      );

      const transactionsSnapshot = await getDocs(transactionsQuery);

      if (transactionsSnapshot.size == 0) {
        hasMoreTransactions = false;
        break;
      }

      const batch = writeBatch(firestore);

      transactionsSnapshot.forEach((transactionDoc) => {
        batch.delete(transactionDoc.ref);
      });

      await batch.commit();

      console.log(
        `${transactionsSnapshot.size} giao dịch đã được xóa trong lô này`,
      );
    }

    return {
      success: true,
      msg: "Tất cả giao dịch đã được xóa thành công",
    };
  } catch (err: any) {
    console.log("error deleting wallet: ", err);
    return { success: false, msg: err.message };
  }
};

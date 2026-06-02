import { firestore } from "@/config/firebase";
import { NotificationType, ResponseType } from "@/types";
import { collection, doc, setDoc } from "firebase/firestore";

/**
 * (HIỆN CẢNH BÁO VÍ) Tạo một thông báo (notification) và lưu lên Firestore.
 *
 * Bối cảnh:
 * - Khi người dùng thêm giao dịch chi tiêu, app có thể kiểm tra “sắp vượt / đã vượt” giới hạn.
 * - Nếu có cảnh báo, app tạo notification để hiển thị ở chuông thông báo.
 *
 * Cách hàm hoạt động:
 * 1) Validate dữ liệu bắt buộc: `uid`, `title`, `description`, `type`.
 * 2) Tạo document mới trong collection `notification` (auto id).
 * 3) Chuẩn hóa payload:
 *    - Luôn có `created` (nếu không truyền thì lấy `new Date()` tại thời điểm tạo).
 * 4) Ghi Firestore bằng `setDoc(..., { merge: true })`.
 *
 * Output:
 * - Trả về `id` vừa tạo + dữ liệu notification để UI cập nhật ngay nếu cần.
 */
export const createNotification = async (
  data: Omit<NotificationType, "id" | "created"> & {
    created?: Date;
  },
): Promise<ResponseType> => {
  try {
    if (!data.uid || !data.title || !data.description || !data.type) {
      return { success: false, msg: "Invalid notification data" };
    }

    const notificationRef = doc(collection(firestore, "notification"));

    const payload: NotificationType = {
      uid: data.uid,
      title: data.title,
      description: data.description,
      type: data.type,
      created: data.created || new Date(),
    };

    await setDoc(notificationRef, payload, { merge: true });

    return {
      success: true,
      data: {
        id: notificationRef.id,
        ...payload,
      },
    };
  } catch (err: any) {
    console.log("error creating notification: ", err);
    return { success: false, msg: err.message };
  }
};

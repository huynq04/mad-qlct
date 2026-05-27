import { firestore } from "@/config/firebase";
import {
  collection,
  onSnapshot,
  query,
  QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";

const useFetchData = <T>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Hook subscribe dữ liệu realtime từ Firestore.
    //
    // Lưu ý:
    // - Trong lúc auth/constraints chưa sẵn sàng (ví dụ `uid` còn undefined), việc tạo query có thể lỗi.
    // - Hook cố tình "nuốt" lỗi ở bước tạo query để tránh crash UI và đợi render sau khi constraints hợp lệ.
    // 1. Chặn nếu không có tên collection (tránh lỗi thừa)
    if (!collectionName) {
      setLoading(false);
      return;
    }

    let unsub = () => {};

    try {
      const collectionRef = collection(firestore, collectionName);

      // 2. Tạo query. Nếu constraints có chứa undefined, Firebase có thể văng lỗi
      // Chúng ta bọc trong try-catch để app không bị crash trắng màn hình
      const q = query(collectionRef, ...constraints);

      setLoading(true); // Bắt đầu load dữ liệu mới

      unsub = onSnapshot(
        q,
        (snapshot) => {
          const fetchedData = snapshot.docs.map((doc) => {
            return {
              id: doc.id,
              ...doc.data(),
            };
          }) as T[];

          setData(fetchedData);
          setLoading(false);
          setError(null);
        },
        (err) => {
          console.log("Error fetching data: ", err);
          setError(err.message);
          setLoading(false);
        },
      );
    } catch (err: any) {
      // 3. Nếu query lỗi (do chưa có UID), ta im lặng đợi lần render sau
      console.log("Waiting for valid query constraints...");
      setLoading(false);
    }

    return () => unsub();

    // CỰC KỲ QUAN TRỌNG: Lắng nghe sự thay đổi của constraints và collectionName
    // Dùng JSON.stringify để so sánh nội dung mảng thay vì so sánh địa chỉ ô nhớ (reference)
  }, [collectionName, JSON.stringify(constraints)]);

  return { data, loading, error };
};

/**
 * Hook đọc dữ liệu realtime từ Firestore theo collection + constraints.
 *
 * Input:
 * - `collectionName`: tên collection (ví dụ: `"wallets"`, `"transactions"`)
 * - `constraints`: mảng `QueryConstraint` (ví dụ: `where(...)`, `orderBy(...)`)
 *
 * Output:
 * - `data`: danh sách document (mỗi item được gắn thêm `id`)
 * - `loading`: trạng thái tải
 * - `error`: message lỗi (nếu có)
 *
 * Lưu ý:
 * - Dùng `onSnapshot` nên UI sẽ cập nhật ngay khi Firestore thay đổi.
 */
export default useFetchData;

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
    // Chặn nếu chưa có collectionName, thường xảy ra khi user.uid chưa sẵn sàng.
    if (!collectionName) {
      setLoading(false);
      return;
    }

    let unsub = () => {};

    try {
      const collectionRef = collection(firestore, collectionName);

      // Tạo query Firestore từ collection và điều kiện truyền vào.
      const q = query(collectionRef, ...constraints);

      setLoading(true);

      // Lắng nghe realtime để UI tự cập nhật khi Firestore thay đổi.
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
      // Nếu query lỗi do constraints chưa hợp lệ, đợi lần render sau thay vì crash app.
      console.log("Waiting for valid query constraints...");
      setLoading(false);
    }

    return () => unsub();

    // Dùng JSON.stringify để theo dõi thay đổi nội dung constraints, không chỉ địa chỉ mảng.
  }, [collectionName, JSON.stringify(constraints)]);

  return { data, loading, error };
};

export default useFetchData;

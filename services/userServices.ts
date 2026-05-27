import { firestore } from "@/config/firebase";
import { ResponseType, UserDataType } from "@/types";
import { doc, updateDoc } from "firebase/firestore";
import { uploadFileToCloudinary } from "./imageServices";

// Cập nhật hồ sơ người dùng trong Firestore; nếu ảnh là file local thì upload trước.
export const updateUser = async (
  uid: string,
  updatedData: UserDataType,
): Promise<ResponseType> => {
  try {
    const userDataToSave = { ...updatedData };

    if (userDataToSave.image && userDataToSave?.image?.uri) {
      // API ngoài: Cloudinary Upload API trả secure_url để lưu vào document users/{uid}.
      const imageUploadRes = await uploadFileToCloudinary(
        userDataToSave.image,
        "users",
      );

      if (!imageUploadRes.success) {
        return {
          success: false,
          msg: imageUploadRes.msg || "Không thể tải ảnh lên",
        };
      }

      userDataToSave.image = imageUploadRes.data;
    }

    const userRef = doc(firestore, "users", uid);
    await updateDoc(userRef, userDataToSave);

    return { success: true, msg: "Cập nhật thành công" };
  } catch (error: any) {
    console.log("error updating user: ", error);
    return { success: false, msg: error?.message };
  }
};

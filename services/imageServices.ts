import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/constants";
import { ResponseType } from "@/types";
import axios from "axios";

const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

/**
 * Upload ảnh lên Cloudinary và trả về URL ảnh sau khi upload.
 *
 * API gọi ngoài:
 * - Endpoint: Cloudinary Upload API (`/image/upload`)
 * - Auth: sử dụng `upload_preset` (unsigned upload preset) cấu hình ở Cloudinary
 *
 * Hành vi:
 * - Nếu `file` là string URL sẵn có: trả về luôn (idempotent, không upload lại).
 * - Nếu `file` là object có `uri`: upload bằng `multipart/form-data` và trả về `secure_url`.
 *
 * Lưu ý triển khai:
 * - Nếu `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_UPLOAD_PRESET` không đúng hoặc preset không cho unsigned upload,
 *   Cloudinary sẽ từ chối và tính năng upload icon ví sẽ lỗi.
 */
export const uploadFileToCloudinary = async (
  file: { uri?: string } | string,
  folderName: string,
): Promise<ResponseType> => {
  try {
    if (!file) return { success: true, data: null };
    if (typeof file == "string") {
      return { success: true, data: file };
    }

    if (file && file.uri) {
      const formData = new FormData();
      formData.append("file", {
        uri: file?.uri,
        type: "image/jpeg",
        name: file?.uri?.split("/").pop() || "file.jpg",
      } as any);

      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", folderName);

      const response = await axios.post(CLOUDINARY_API_URL, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      console.log("upload image result: ", response?.data);
      return { success: true, data: response?.data?.secure_url };
    }

    return { success: true };
  } catch (error: any) {
    console.log("got error uploading file: ", error);
    return {
      success: false,
      msg: error.message || "Không thể tải lên tệp tin",
    };
  }
};

/**
 * Trả về ảnh hồ sơ có thể render được trên UI.
 *
 * - Nếu `file` là string: xem như URL ảnh đã upload.
 * - Nếu `file` là object: lấy `uri` local.
 * - Nếu không có ảnh: trả ảnh mặc định của app.
 */
export const getProfileImage = (file: any) => {
  if (file && typeof file === "string") return file;
  if (file && typeof file === "object") return file.uri;

  return require("../assets/images/defaultAvatar.png");
};

/**
 * Chuẩn hóa đường dẫn file ảnh để dùng cho upload/xử lý tiếp theo.
 *
 * - String => URL/path sẵn có
 * - Object => `uri` local từ image picker
 * - Không có => `null`
 */
export const getFilePath = (file: any) => {
  if (file && typeof file === "string") return file;
  if (file && typeof file === "object") return file.uri;

  return null;
};

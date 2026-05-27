import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/constants";
import { ResponseType } from "@/types";
import axios from "axios";

const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// Upload ảnh lên Cloudinary và trả về URL để lưu vào Firestore.
export const uploadFileToCloudinary = async (
  file: { uri?: string } | string,
  folderName: string,
): Promise<ResponseType> => {
  try {
    if (!file) return { success: true, data: null };

    // Nếu file đã là URL thì không cần upload lại.
    if (typeof file == "string") {
      return { success: true, data: file };
    }

    if (file && file.uri) {
      // Cloudinary nhận ảnh dạng multipart/form-data từ URI local của thiết bị.
      const formData = new FormData();
      formData.append("file", {
        uri: file?.uri,
        type: "image/jpeg",
        name: file?.uri?.split("/").pop() || "file.jpg",
      } as any);

      formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
      formData.append("folder", folderName);

      // API ngoài: Cloudinary image upload, trả về secure_url của ảnh.
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

// Chuẩn hóa ảnh đại diện: URL, ảnh local hoặc ảnh mặc định.
export const getProfileImage = (file: any) => {
  if (file && typeof file === "string") return file;
  if (file && typeof file === "object") return file.uri;

  return require("../assets/images/defaultAvatar.png");
};

// Lấy đường dẫn ảnh để hiển thị trong component upload/preview.
export const getFilePath = (file: any) => {
  if (file && typeof file === "string") return file;
  if (file && typeof file === "object") return file.uri;

  return null;
};

import { CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_PRESET } from "@/constants";
import { ResponseType } from "@/types";
import axios from "axios";

const CLOUDINARY_API_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

type LocalImageFile = {
  uri?: string;
};

type UploadableImage = LocalImageFile | string | null | undefined;

const hasLocalUri = (file: UploadableImage): file is LocalImageFile => {
  return !!file && typeof file === "object" && !!file.uri;
};

// Upload ảnh local lên Cloudinary; nếu đầu vào đã là URL thì giữ nguyên để tránh upload lại.
export const uploadFileToCloudinary = async (
  file: UploadableImage,
  folderName: string,
): Promise<ResponseType> => {
  try {
    if (!file) return { success: true, data: null };
    if (typeof file === "string") return { success: true, data: file };
    if (!hasLocalUri(file)) return { success: true };

    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      type: "image/jpeg",
      name: file.uri?.split("/").pop() || "file.jpg",
    } as any);

    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    formData.append("folder", folderName);

    // API ngoài: Cloudinary Upload API nhận multipart/form-data và trả secure_url.
    const response = await axios.post(CLOUDINARY_API_URL, formData, {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    });

    return { success: true, data: response?.data?.secure_url };
  } catch (error: any) {
    console.log("got error uploading file: ", error);
    return {
      success: false,
      msg: error.message || "Không thể tải lên tệp tin",
    };
  }
};

// Chuẩn hóa nguồn ảnh profile: URL từ Firestore, file local hoặc avatar mặc định.
export const getProfileImage = (file: UploadableImage) => {
  if (file && typeof file === "string") return file;
  if (hasLocalUri(file)) return file.uri;

  return require("../assets/images/defaultAvatar.png");
};

// Trả về đường dẫn ảnh để truyền cho API khác; null nghĩa là chưa có ảnh.
export const getFilePath = (file: UploadableImage) => {
  if (file && typeof file === "string") return file;
  if (hasLocalUri(file)) return file.uri;

  return null;
};

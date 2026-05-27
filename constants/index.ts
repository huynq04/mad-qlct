/**
 * Cấu hình runtime dùng cho client (Expo).
 *
 * - Expo hỗ trợ inject biến môi trường ở build/runtime qua `EXPO_PUBLIC_*`.
 * - Không commit khóa bí mật vào repo. Khi triển khai production nên dùng:
 *   - EAS Secrets, hoặc
 *   - Backend proxy (giữ khóa bí mật ở server và app chỉ gọi API của backend).
 */

/**
 * Đọc biến môi trường public và chuẩn hóa về chuỗi.
 * Nếu biến không tồn tại thì trả về chuỗi rỗng để phía UI/service tự xử lý thiếu cấu hình.
 */
const readPublicEnv = (key: string) => {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
};

// Cloudinary (thường dùng unsigned upload preset cho client-side upload).
export const CLOUDINARY_CLOUD_NAME = readPublicEnv("EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME");
export const CLOUDINARY_UPLOAD_PRESET = readPublicEnv("EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET");

// AI providers (nếu rỗng thì tính năng AI Scan sẽ báo thiếu cấu hình).
export const GEMINI_API_KEY = readPublicEnv("EXPO_PUBLIC_GEMINI_API_KEY");
export const OPENAI_API_KEY = readPublicEnv("EXPO_PUBLIC_OPENAI_API_KEY");

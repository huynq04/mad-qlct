import translations, { DEFAULT_LANGUAGE } from "@/constants/translations";
import i18n from "i18next";

if (!i18n.isInitialized) {
  // i18next được khởi tạo ở root layout để toàn app dùng cùng bộ key dịch.
  i18n.init({
    resources: translations,
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    interpolation: {
      escapeValue: false,
    },
    returnNull: false,
  });
}

export default i18n;

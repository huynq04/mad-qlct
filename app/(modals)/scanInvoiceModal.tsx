import BackButton from "@/components/BackButton";
import Button from "@/components/Button";
import Header from "@/components/Header";
import ModalWrapper from "@/components/ModalWrapper";
import ScanResultItem from "@/components/ScanResultItem";
import Typo from "@/components/Typo";
import { colors, radius, spacingX, spacingY } from "@/constants/theme";
import { scanInvoiceWithAI } from "@/services/aiService";
import { ScanResult } from "@/types";
import { setPendingScanResult } from "@/utils/scanInvoiceResultStore";
import { scale, verticalScale } from "@/utils/styling";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as Icons from "phosphor-react-native";
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

type ScanMode = "capture" | "upload";

const ACCENT = "#00E5FF";

/**
 * Modal quét hóa đơn (AI Scan Invoice)
 *
 * Vai trò:
 * - Chụp ảnh hoặc tải ảnh hóa đơn (expo-image-picker)
 * - Gọi AI để trích xuất dữ liệu (services/aiService.ts → `scanInvoiceWithAI`)
 * - Hiển thị kết quả và cho phép người dùng chỉnh sửa trước khi xác nhận
 * - Trả kết quả về màn tạo giao dịch thông qua store tạm:
 *   - set: `utils/scanInvoiceResultStore.ts:setPendingScanResult`
 *   - get: `utils/scanInvoiceResultStore.ts:consumePendingScanResult` (ở transaction modal)
 *
 * API ngoài được gọi gián tiếp:
 * - OpenAI Responses API hoặc Gemini GenerateContent API (tùy key cấu hình)
 */
const ScanInvoiceModal = () => {
  const router = useRouter();
  const [mode, setMode] = useState<ScanMode>("capture");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const scanningRef = useRef(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [editing, setEditing] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const getEndOfToday = (): Date => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today;
  };

  const clampToToday = (dateValue: Date): Date => {
    const maxDate = getEndOfToday();
    return dateValue.getTime() > maxDate.getTime() ? maxDate : dateValue;
  };

  const formatDateDDMMYYYY = (dateValue: Date) => {
    const day = String(dateValue.getDate()).padStart(2, "0");
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const year = String(dateValue.getFullYear());
    return `${day}/${month}/${year}`;
  };

  const parseDDMMYYYY = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    try {
      const [datePart] = dateStr.split(" ");
      const [day, month, year] = datePart.split("/");
      const parsed = new Date(Number(year), Number(month) - 1, Number(day));
      return Number.isFinite(parsed.getTime()) ? parsed : new Date();
    } catch {
      return new Date();
    }
  };

  const onDateChange = (_event: any, selectedDate: any) => {
    if (!result) return;
    const next = clampToToday(selectedDate || parseDDMMYYYY(result.date));
    setResult({ ...result, date: formatDateDDMMYYYY(next) });
    setShowDatePicker(Platform.OS === "ios");
  };

  /**
   * Mở camera để chụp ảnh hóa đơn.
   * Nếu người dùng từ chối quyền camera thì dừng luồng và hiện thông báo.
   */
  const handleCapture = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Quyền truy cập", "Cần quyền camera để chụp hóa đơn");
      return;
    }
    const res = await ImagePicker.launchCameraAsync({
      quality: 1,
      allowsEditing: false,
    } as any);
    if (!res.canceled && res.assets?.length > 0) {
      setImageUri(res.assets[0].uri);
      setResult(null);
    }
  };

  /**
   * Mở thư viện ảnh để chọn ảnh hóa đơn có sẵn trên máy.
   */
  const handleUpload = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 1,
      allowsEditing: false,
      mediaTypes: ["images"],
    } as any);
    if (!res.canceled && res.assets?.length > 0) {
      setImageUri(res.assets[0].uri);
      setResult(null);
    }
  };

  /**
   * Gọi service AI để quét hóa đơn từ `imageUri`.
   *
   * Bảo vệ luồng:
   * - Không cho scan nếu chưa có ảnh
   * - Dùng `scanningRef` để chặn bấm nhiều lần liên tiếp khi request đang chạy
   */
  const handleScan = async () => {
    if (!imageUri) {
      Alert.alert("Chưa có ảnh", "Vui lòng chụp hoặc tải ảnh hóa đơn lên");
      return;
    }
    if (scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setResult(null);
    const res = await scanInvoiceWithAI(imageUri);
    scanningRef.current = false;
    setScanning(false);
    if (res.success && res.data) {
      setResult(res.data);
    } else {
      Alert.alert("Lỗi", res.msg || "Không thể phân tích hóa đơn");
    }
  };

  /**
   * Xác nhận kết quả scan.
   * Kết quả sẽ được lưu vào store tạm và màn hiện tại đóng lại để quay về transaction modal.
   */
  const handleConfirm = () => {
    if (!result) return;
    setPendingScanResult(result);
    router.back();
  };

  const formatAmount = (amount: number) => amount.toLocaleString("vi-VN") + "đ";

  return (
    <ModalWrapper>
      <View style={styles.container}>
        <Header
          title="Quét hóa đơn AI"
          leftIcon={<BackButton />}
          style={{ marginBottom: spacingY._10 }}
        />

        {/* Tab: Capture / Upload */}
        <View style={styles.modeTab}>
          <TouchableOpacity
            style={[styles.tabBtn, mode === "capture" && styles.tabBtnActive]}
            onPress={() => setMode("capture")}
          >
            <Icons.Camera
              size={verticalScale(16)}
              color={mode === "capture" ? colors.black : colors.neutral400}
              weight="bold"
            />
            <Typo
              size={13}
              fontWeight="600"
              color={mode === "capture" ? colors.black : colors.neutral400}
            >
              CHỤP ẢNH
            </Typo>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, mode === "upload" && styles.tabBtnActive]}
            onPress={() => setMode("upload")}
          >
            <Icons.UploadSimple
              size={verticalScale(16)}
              color={mode === "upload" ? colors.black : colors.neutral400}
              weight="bold"
            />
            <Typo
              size={13}
              fontWeight="600"
              color={mode === "upload" ? colors.black : colors.neutral400}
            >
              TẢI ẢNH LÊN
            </Typo>
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Khung ảnh */}
          <TouchableOpacity
            style={styles.imageBox}
            onPress={mode === "capture" ? handleCapture : handleUpload}
            activeOpacity={0.8}
          >
            {imageUri ? (
              <>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.image}
                  resizeMode="cover"
                />
                <View style={styles.liveTag}>
                  <Typo size={11} fontWeight="700" color={colors.text}>
                    {mode === "capture" ? "ẢNH CHỤP" : "XEM TRƯỚC"}
                  </Typo>
                </View>
              </>
            ) : (
              <View style={styles.placeholderBox}>
                <Icons.Camera
                  size={verticalScale(48)}
                  color={colors.neutral500}
                  weight="thin"
                />
                <Typo size={14} color={colors.neutral500}>
                  {mode === "capture"
                    ? "Nhấn để chụp hóa đơn"
                    : "Nhấn để chọn ảnh"}
                </Typo>
                <Typo size={12} color={colors.neutral600}>
                  Căn chỉnh hóa đơn trong khung để tự động quét
                </Typo>
              </View>
            )}
          </TouchableOpacity>

          {/* Nút Scan */}
          <Button
            onPress={handleScan}
            style={styles.scanButton}
            loading={scanning}
          >
            <Icons.Scan
              size={verticalScale(20)}
              color={colors.black}
              weight="bold"
            />
            <Typo fontWeight="700" color={colors.black} size={16}>
              QUÉT HÓA ĐƠN
            </Typo>
          </Button>

          {/* Trạng thái đang xử lý */}
          {scanning && (
            <View style={styles.processingBox}>
              <ActivityIndicator color={ACCENT} size="small" />
              <View style={styles.processingText}>
                <Typo size={14} fontWeight="600" color={ACCENT}>
                  AI đang xử lý...
                </Typo>
                <Typo size={12} color={colors.neutral400}>
                  Đang phân tích dữ liệu hóa đơn
                </Typo>
              </View>
            </View>
          )}

          {/* Kết quả scan */}
          {result && (
            <View style={styles.resultBox}>
              <View style={styles.resultHeader}>
                <Typo size={15} fontWeight="700" color={colors.text}>
                  {editing ? "Chỉnh sửa kết quả" : "Kết quả phân tích"}
                </Typo>
                <View style={styles.aiTag}>
                  <Icons.Robot
                    size={verticalScale(13)}
                    color={ACCENT}
                    weight="fill"
                  />
                  <Typo size={11} fontWeight="700" color={ACCENT}>
                    {editing ? "ĐANG SỬA" : "AI ĐÃ PHÂN TÍCH"}
                  </Typo>
                </View>
              </View>

              <View style={styles.resultList}>
                {/* Tổng tiền */}
                {editing ? (
                  <EditableField
                    icon={
                      <Icons.Money
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    }
                    label="TỔNG TIỀN"
                    value={result.totalAmount.toString()}
                    keyboardType="numeric"
                    onChangeText={(v) =>
                      setResult({
                        ...result,
                        totalAmount: Number(v.replace(/[^0-9]/g, "")) || 0,
                      })
                    }
                  />
                ) : (
                  <ScanResultItem
                    icon={
                      <Icons.Money
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    }
                    label="TỔNG TIỀN"
                    value={formatAmount(result.totalAmount)}
                  />
                )}

                {/* Ngày */}
                {editing ? (
                  <View style={editStyles.container}>
                    <View style={editStyles.iconBox}>
                      <Icons.CalendarBlank
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    </View>
                    <View style={editStyles.textBox}>
                      <Typo size={12} color={colors.neutral400}>
                        NGÀY THANH TOÁN
                      </Typo>
                      <Pressable
                        onPress={() => setShowDatePicker(true)}
                        style={editStyles.input}
                      >
                        <Typo
                          size={14}
                          fontWeight="500"
                          color={colors.text}
                        >
                          {result.date}
                        </Typo>
                      </Pressable>
                      {showDatePicker && (
                        <DateTimePicker
                          value={parseDDMMYYYY(result.date)}
                          mode="date"
                          display={
                            Platform.OS === "ios" ? "spinner" : "default"
                          }
                          maximumDate={getEndOfToday()}
                          onChange={onDateChange}
                        />
                      )}
                    </View>
                  </View>
                ) : (
                  <ScanResultItem
                    icon={
                      <Icons.CalendarBlank
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    }
                    label="NGÀY THANH TOÁN"
                    value={result.date}
                  />
                )}

                {/* Danh mục */}
                {editing ? (
                  <EditableField
                    icon={
                      <Icons.Tag
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    }
                    label="DANH MỤC"
                    value={result.category}
                    onChangeText={(v) => setResult({ ...result, category: v })}
                  />
                ) : (
                  <ScanResultItem
                    icon={
                      <Icons.Tag
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    }
                    label="DANH MỤC"
                    value={result.category}
                  />
                )}

                {/* Mô tả */}
                {editing ? (
                  <EditableField
                    icon={
                      <Icons.ListBullets
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    }
                    label="MÔ TẢ"
                    value={result.description}
                    multiline
                    onChangeText={(v) =>
                      setResult({ ...result, description: v })
                    }
                  />
                ) : (
                  <ScanResultItem
                    icon={
                      <Icons.ListBullets
                        size={verticalScale(18)}
                        color={ACCENT}
                        weight="fill"
                      />
                    }
                    label="MÔ TẢ"
                    value={result.description}
                  />
                )}
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer: Edit / Confirm */}
        {result && (
          <View style={styles.footer}>
            <Button
              onPress={() => {
                setShowDatePicker(false);
                setEditing(!editing);
              }}
              style={{
                ...styles.editBtn,
                ...(editing ? { borderColor: ACCENT, borderWidth: 1 } : {}),
              }}
            >
              <Icons.PencilSimple
                size={verticalScale(18)}
                color={editing ? ACCENT : colors.text}
                weight="bold"
              />
              <Typo
                fontWeight="700"
                color={editing ? ACCENT : colors.text}
                size={15}
              >
                {editing ? "Xong" : "Sửa"}
              </Typo>
            </Button>
            <Button onPress={handleConfirm} style={styles.confirmBtn}>
              <Typo fontWeight="700" color={colors.black} size={15}>
                Xác nhận
              </Typo>
            </Button>
          </View>
        )}
      </View>
    </ModalWrapper>
  );
};

// Component cho chế độ edit
type EditableFieldProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  keyboardType?: "default" | "numeric";
  multiline?: boolean;
};

const EditableField = ({
  icon,
  label,
  value,
  onChangeText,
  keyboardType = "default",
  multiline = false,
}: EditableFieldProps) => (
  <View style={editStyles.container}>
    <View style={editStyles.iconBox}>{icon}</View>
    <View style={editStyles.textBox}>
      <Typo size={12} color={colors.neutral400}>
        {label}
      </Typo>
      <TextInput
        style={[
          editStyles.input,
          multiline && { height: verticalScale(60), textAlignVertical: "top" },
        ]}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        multiline={multiline}
        placeholderTextColor={colors.neutral500}
      />
    </View>
  </View>
);

const editStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacingX._12,
    backgroundColor: colors.neutral800,
    borderRadius: radius._12,
    padding: spacingY._12,
    borderWidth: 1,
    borderColor: colors.neutral600,
  },
  iconBox: {
    width: scale(36),
    height: scale(36),
    borderRadius: radius._10,
    backgroundColor: colors.neutral700,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 2,
  },
  textBox: {
    flex: 1,
    gap: 4,
  },
  input: {
    color: colors.text,
    fontSize: verticalScale(14),
    fontWeight: "500",
    backgroundColor: colors.neutral700,
    borderRadius: radius._10,
    paddingHorizontal: spacingX._10,
    paddingVertical: spacingY._7,
  },
});

export default ScanInvoiceModal;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacingX._20,
  },
  modeTab: {
    flexDirection: "row",
    backgroundColor: colors.neutral900,
    borderRadius: radius._10,
    padding: 4,
    marginBottom: spacingY._15,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingY._7,
    borderRadius: radius._10,
    gap: 6,
  },
  tabBtnActive: {
    backgroundColor: ACCENT,
  },
  scrollContent: {
    gap: spacingY._15,
    paddingBottom: spacingY._20,
  },
  imageBox: {
    height: verticalScale(260),
    backgroundColor: colors.neutral900,
    borderRadius: radius._15,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.neutral700,
    justifyContent: "center",
    alignItems: "center",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  liveTag: {
    position: "absolute",
    top: 10,
    left: 10,
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  placeholderBox: {
    alignItems: "center",
    gap: spacingY._7,
  },
  scanButton: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: ACCENT,
  },
  processingBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.neutral800,
    borderRadius: radius._12,
    padding: spacingY._12,
    gap: spacingX._12,
  },
  processingText: {
    gap: 2,
  },
  resultBox: {
    gap: spacingY._12,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  aiTag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.neutral800,
    paddingHorizontal: spacingX._10,
    paddingVertical: 4,
    borderRadius: radius._10,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  resultList: {
    gap: spacingY._10,
  },
  footer: {
    flexDirection: "row",
    gap: scale(12),
    paddingTop: spacingY._15,
    borderTopWidth: 1,
    borderTopColor: colors.neutral700,
    paddingBottom: spacingY._5,
  },
  editBtn: {
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.neutral700,
    flex: 1,
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: ACCENT,
  },
});

import BackButton from "@/components/BackButton";
import Button from "@/components/Button";
import Header from "@/components/Header";
import ImageUpload from "@/components/ImageUpload";
import Input from "@/components/Input";
import ModalWrapper from "@/components/ModalWrapper";
import Typo from "@/components/Typo";
import { expenseCategories, transactionTypes } from "@/constants/data";
import { radius, spacingX, spacingY } from "@/constants/theme";
import { useAuth } from "@/contexts/authContext";
import { useTheme } from "@/contexts/themeContext";
import useFetchData from "@/hooks/useFetchData";
import { createNotification } from "@/services/notificationService";
import {
  createOrUpdateTransaction,
  deleteTransaction,
  ExpenseLimitExceededItem,
  getExceededExpenseLimits,
} from "@/services/transactionService";
import { TransactionType, WalletType } from "@/types";
import { scale, verticalScale } from "@/utils/styling";
import { consumePendingScanResult } from "@/utils/scanInvoiceResultStore";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useFocusEffect } from "@react-navigation/native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { orderBy, where } from "firebase/firestore";
import * as Icons from "phosphor-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Dropdown } from "react-native-element-dropdown";

/**
 * Modal tạo/cập nhật giao dịch
 *
 * Phần liên quan trực tiếp đến tính năng bạn phụ trách (AI Scan Invoice):
 * - Mở modal quét hóa đơn: `router.push("/(modals)/scanInvoiceModal")`
 * - Khi quay lại màn này, lấy kết quả scan 1 lần bằng `consumePendingScanResult()` và auto-fill form
 * - Chuẩn hóa dữ liệu AI:
 *   - map category tiếng Việt (AI trả về) → category code nội bộ của app
 *   - parse ngày dạng `DD/MM/YYYY` → `Date`
 */
const TransactionModal = () => {
  const { user } = useAuth();
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();

  const [transaction, setTransaction] = useState({
    type: "expense",
    amount: 0,
    description: "",
    category: "",
    date: new Date(),
    walletId: "",
    image: null,
  });

  const [loading, setLoading] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const { data: wallets } = useFetchData<WalletType>("wallets", [
    where("uid", "==", user?.uid),
    orderBy("created", "desc"),
  ]);

  type paramType = {
    id?: string;
    type?: string;
    amount?: string;
    category?: string;
    date?: string;
    description?: string;
    image?: any;
    uid?: string;
    walletId?: string;
    scanned?: string;
  };

  const oldTransaction: paramType = useLocalSearchParams();

  /**
   * Map category AI trả về (tiếng Việt) sang category code nội bộ của app.
   * Đây là bước bắt buộc để dữ liệu scan tương thích với dropdown/category logic hiện tại.
   */
  const mapAICategory = (aiCategory: string): string => {
    const map: Record<string, string> = {
      "Ăn uống": "dining",
      "Di chuyển": "transportation",
      "Mua sắm": "groceries",
      "Y tế": "health",
      "Giải trí": "entertainment",
      "Giáo dục": "personal",
      "Hóa đơn": "utilities",
      Khác: "others",
    };
    return map[aiCategory] || "others";
  };

  const getEndOfToday = (): Date => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    return today;
  };

  const clampToToday = (dateValue: Date): Date => {
    const maxDate = getEndOfToday();
    return dateValue.getTime() > maxDate.getTime() ? maxDate : dateValue;
  };

  const warningPeriodLabel: Record<string, string> = {
    day: "Ngày",
    week: "Tuần",
    month: "Tháng",
  };

  const warningPeriodOrder: Record<string, number> = {
    day: 1,
    week: 2,
    month: 3,
  };

  const formatBudgetWarningDetails = (
    items: ExpenseLimitExceededItem[],
    statusType: "near-limit" | "exceeded-limit",
  ) => {
    return [...items]
      .sort((a, b) => warningPeriodOrder[a.type] - warningPeriodOrder[b.type])
      .map((item) => {
        const nextSpentText = item.nextSpent.toLocaleString("vi-VN");
        const limitAmountText = item.limitAmount.toLocaleString("vi-VN");

        if (statusType === "exceeded-limit") {
          const exceededAmount = Math.max(item.nextSpent - item.limitAmount, 0);
          return `- ${warningPeriodLabel[item.type]}: ${nextSpentText}đ/${limitAmountText}đ (vượt ${exceededAmount.toLocaleString("vi-VN")}đ)`;
        }

        const remainingAmount = Math.max(item.limitAmount - item.nextSpent, 0);
        return `- ${warningPeriodLabel[item.type]}: ${nextSpentText}đ/${limitAmountText}đ (còn ${remainingAmount.toLocaleString("vi-VN")}đ)`;
      })
      .join("\n");
  };

  const parseScannedDate = (dateStr: string): Date => {
    if (!dateStr) return new Date();
    try {
      const [datePart] = dateStr.split(" ");
      const [day, month, year] = datePart.split("/");
      return new Date(Number(year), Number(month) - 1, Number(day));
    } catch {
      return new Date();
    }
  };

  const onDateChange = (event: any, selectedDate: any) => {
    const currentDate = clampToToday(selectedDate || transaction.date);
    setTransaction({
      ...transaction,
      date: currentDate,
    });
    setShowDatePicker(Platform.OS === "ios");
  };

  useEffect(() => {
    if (oldTransaction?.id) {
      setTransaction({
        type: oldTransaction?.type || "expense",
        amount: Number(oldTransaction.amount) || 0,
        description: oldTransaction.description || "",
        category: oldTransaction.category || "",
        date: oldTransaction.date ? new Date(oldTransaction.date) : new Date(),
        walletId: oldTransaction.walletId || "",
        image: oldTransaction?.image ?? null,
      });
    } else if (oldTransaction?.scanned === "true") {
      setTransaction((prev) => ({
        ...prev,
        amount: Number(oldTransaction.amount) || 0,
        description: oldTransaction.description || "",
        category: mapAICategory(oldTransaction.category || ""),
        date: parseScannedDate(oldTransaction.date || ""),
      }));
    }
  }, [oldTransaction?.id, oldTransaction?.scanned]);

  useFocusEffect(
    useCallback(() => {
      // Khi quay lại từ scan modal, lấy kết quả scan 1 lần và tự điền form giao dịch.
      const scanResult = consumePendingScanResult();
      if (!scanResult) return;

      setTransaction((prev) => ({
        ...prev,
        amount: Number(scanResult.totalAmount) || 0,
        description: scanResult.description || "",
        category: mapAICategory(scanResult.category || ""),
        date: parseScannedDate(scanResult.date || ""),
      }));
    }, []),
  );

  const onSubmit = async () => {
    const { type, amount, description, category, date, walletId, image } =
      transaction;

    if (!walletId || !date || !amount || (type === "expense" && !category)) {
      Alert.alert("Giao dịch", "Vui lòng điền đầy đủ thông tin bắt buộc");
      return;
    }

    const notifyBudgetStatus = async (
      items: ExpenseLimitExceededItem[],
      statusType: "near-limit" | "exceeded-limit",
    ) => {
      if (!user?.uid || !items.length) return;

      await Promise.all(
        items.map((item) =>
          createNotification({
            uid: user.uid as string,
            type: statusType,
            title: "Cảnh báo ngân sách",
            description:
              statusType === "near-limit"
                ? `Ví của bạn sắp vượt giới hạn ${warningPeriodLabel[item.type].toLowerCase()} (${item.nextSpent.toLocaleString("vi-VN")}đ/${item.limitAmount.toLocaleString("vi-VN")}đ).`
                : `Ví của bạn đã vượt giới hạn ${warningPeriodLabel[item.type].toLowerCase()} (${item.nextSpent.toLocaleString("vi-VN")}đ/${item.limitAmount.toLocaleString("vi-VN")}đ).`,
            created: new Date(),
          }),
        ),
      );
    };

    const submitTransaction = async () => {
      let transactionData: TransactionType = {
        type,
        amount,
        description,
        category,
        date,
        walletId,
        image: image || null,
        uid: user?.uid,
      };

      if (oldTransaction?.id) transactionData.id = oldTransaction.id;
      setLoading(true);
      const res = await createOrUpdateTransaction(transactionData);
      setLoading(false);

      if (!res.success) {
        Alert.alert("Giao dịch", res.msg);
      }
      return res;
    };

    if (type === "expense") {
      try {
        setLoading(true);
        const warningRes = await getExceededExpenseLimits(
          walletId,
          amount,
          date,
          oldTransaction?.id,
        );
        setLoading(false);

        if (!warningRes.success) {
          Alert.alert("Cảnh báo", warningRes.msg);
          return;
        }

        const exceededItems = warningRes?.data?.exceededItems || [];
        const nearLimitItems = warningRes?.data?.nearLimitItems || [];

        if (exceededItems.length > 0) {
          const exceededDetails = formatBudgetWarningDetails(
            exceededItems,
            "exceeded-limit",
          );
          const nearLimitDetails = formatBudgetWarningDetails(
            nearLimitItems,
            "near-limit",
          );

          let warningMessage = `Giao dịch này vượt các giới hạn:\n${exceededDetails}`;
          if (nearLimitItems.length > 0) {
            warningMessage += `\n\nĐồng thời chạm ngưỡng cảnh báo:\n${nearLimitDetails}`;
          }
          warningMessage += "\n\nBạn vẫn muốn tiếp tục lưu giao dịch?";

          Alert.alert("Cảnh báo giới hạn chi tiêu", warningMessage, [
            { text: "Hủy", style: "cancel" },
            {
              text: "Đồng ý",
              style: "destructive",
              onPress: async () => {
                const submitRes = await submitTransaction();
                if (submitRes.success) {
                  await notifyBudgetStatus(exceededItems, "exceeded-limit");
                  router.back();
                }
              },
            },
          ]);
          return;
        }

        if (nearLimitItems.length > 0) {
          const nearLimitDetails = formatBudgetWarningDetails(
            nearLimitItems,
            "near-limit",
          );

          Alert.alert(
            "Cảnh báo giới hạn chi tiêu",
            `Giao dịch này chạm ngưỡng cảnh báo:\n${nearLimitDetails}\n\nBạn vẫn muốn tiếp tục lưu giao dịch?`,
            [
              { text: "Hủy", style: "cancel" },
              {
                text: "Tiếp tục",
                onPress: async () => {
                  const submitRes = await submitTransaction();
                  if (submitRes.success) {
                    await notifyBudgetStatus(nearLimitItems, "near-limit");
                    router.back();
                  }
                },
              },
            ],
          );
          return;
        }

        const submitRes = await submitTransaction();
        if (submitRes.success) {
          router.back();
        }
        return;
      } catch (err) {
        setLoading(false);
        Alert.alert("Lỗi", "Không thể kiểm tra hạn mức");
        return;
      }
    }

    const submitRes = await submitTransaction();
    if (submitRes.success) router.back();
  };

  return (
    <ModalWrapper>
      <View style={styles.container}>
        <Header
          title={oldTransaction?.id ? "Cập nhật giao dịch" : "Giao dịch mới"}
          leftIcon={<BackButton />}
          rightIcon={
            !oldTransaction?.id ? (
              <TouchableOpacity
                onPress={() => router.push("/(modals)/scanInvoiceModal")}
                style={[
                  styles.scanIcon,
                  {
                    backgroundColor: isDarkMode
                      ? colors.neutral700
                      : colors.neutral200,
                  },
                ]}
              >
                <Icons.Scan
                  size={verticalScale(22)}
                  color={colors.primary}
                  weight="bold"
                />
              </TouchableOpacity>
            ) : undefined
          }
          style={{ marginBottom: spacingY._10 }}
        />

        <ScrollView
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inputContainer}>
            <Typo color={colors.textLight} size={16}>
              Loại
            </Typo>
            <Dropdown
              style={[styles.dropdownContainer, { borderColor: colors.border }]}
              activeColor={isDarkMode ? colors.neutral700 : colors.neutral100}
              selectedTextStyle={{
                color: colors.text,
                fontSize: verticalScale(14),
              }}
              itemTextStyle={{ color: colors.text }}
              containerStyle={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius._15,
              }}
              data={transactionTypes}
              labelField="label"
              valueField="value"
              value={transaction.type}
              onChange={(item) =>
                setTransaction({ ...transaction, type: item.value })
              }
            />
          </View>

          <View style={styles.inputContainer}>
            <Typo color={colors.textLight} size={16}>
              Ví
            </Typo>
            <Dropdown
              style={[styles.dropdownContainer, { borderColor: colors.border }]}
              activeColor={isDarkMode ? colors.neutral700 : colors.neutral100}
              placeholderStyle={{ color: colors.textLight }}
              selectedTextStyle={{
                color: colors.text,
                fontSize: verticalScale(14),
              }}
              itemTextStyle={{ color: colors.text }}
              containerStyle={{
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: radius._15,
              }}
              data={wallets.map((wallet) => ({
                label: `${wallet?.name} (${Number(wallet.amount).toLocaleString("vi-VN")}đ)`,
                value: wallet?.id,
              }))}
              labelField="label"
              valueField="value"
              placeholder="Chọn ví"
              value={transaction.walletId}
              onChange={(item) =>
                setTransaction({ ...transaction, walletId: item.value || "" })
              }
            />
          </View>

          {transaction.type === "expense" && (
            <View style={styles.inputContainer}>
              <Typo color={colors.textLight} size={16}>
                Danh mục chi tiêu
              </Typo>
              <Dropdown
                style={[
                  styles.dropdownContainer,
                  { borderColor: colors.border },
                ]}
                activeColor={isDarkMode ? colors.neutral700 : colors.neutral100}
                placeholderStyle={{ color: colors.textLight }}
                selectedTextStyle={{
                  color: colors.text,
                  fontSize: verticalScale(14),
                }}
                itemTextStyle={{ color: colors.text }}
                containerStyle={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                  borderRadius: radius._15,
                }}
                data={Object.values(expenseCategories)}
                labelField="label"
                valueField="value"
                placeholder="Chọn danh mục"
                value={transaction.category}
                onChange={(item) =>
                  setTransaction({ ...transaction, category: item.value || "" })
                }
              />
            </View>
          )}

          <View style={styles.inputContainer}>
            <Typo color={colors.textLight} size={16}>
              Ngày
            </Typo>
            {!showDatePicker && (
              <Pressable
                style={[styles.dateInput, { borderColor: colors.border }]}
                onPress={() => setShowDatePicker(true)}
              >
                <Typo size={14} color={colors.text}>
                  {(transaction.date as Date).toLocaleDateString("vi-VN")}
                </Typo>
              </Pressable>
            )}
            {showDatePicker && (
              <View>
                <DateTimePicker
                  themeVariant={isDarkMode ? "dark" : "light"}
                  value={transaction.date as Date}
                  maximumDate={getEndOfToday()}
                  textColor={colors.text}
                  mode="date"
                  display={Platform.OS === "ios" ? "spinner" : "default"}
                  onChange={onDateChange}
                />
                {Platform.OS === "ios" && (
                  <TouchableOpacity
                    style={[
                      styles.datePickerButton,
                      { backgroundColor: colors.neutral200 },
                    ]}
                    onPress={() => setShowDatePicker(false)}
                  >
                    <Typo size={15} fontWeight={"500"} color={colors.text}>
                      Ok
                    </Typo>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <Typo color={colors.textLight} size={16}>
              Số tiền
            </Typo>
            <Input
              placeholder="0đ"
              keyboardType="numeric"
              value={
                transaction.amount > 0 ? transaction.amount.toString() : ""
              }
              onChangeText={(value) =>
                setTransaction({
                  ...transaction,
                  amount: Number(value.replace(/[^0-9]/g, "")),
                })
              }
            />
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.flexRow}>
              <Typo color={colors.textLight} size={16}>
                Mô tả
              </Typo>
              <Typo color={colors.textLighter} size={14}>
                (tùy chọn)
              </Typo>
            </View>
            <Input
              placeholder="Nhập nội dung..."
              value={transaction.description}
              multiline
              containerStyle={{
                height: verticalScale(100),
                alignItems: "flex-start",
                paddingVertical: 15,
              }}
              onChangeText={(value) =>
                setTransaction({ ...transaction, description: value })
              }
            />
          </View>

          <View style={styles.inputContainer}>
            <View style={styles.flexRow}>
              <Typo color={colors.textLight} size={16}>
                Ảnh hóa đơn
              </Typo>
              <Typo color={colors.textLighter} size={14}>
                (tùy chọn)
              </Typo>
            </View>
            <ImageUpload
              file={transaction.image}
              onClear={() => setTransaction({ ...transaction, image: null })}
              onSelect={(file) =>
                setTransaction({ ...transaction, image: file })
              }
              placeholder="Tải ảnh lên"
            />
          </View>

          {!oldTransaction?.id && (
            <TouchableOpacity
              style={[
                styles.aiScanButton,
                {
                  backgroundColor: colors.surface,
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => router.push("/(modals)/scanInvoiceModal")}
              activeOpacity={0.8}
            >
              <Icons.Robot
                size={verticalScale(20)}
                color={colors.primary}
                weight="fill"
              />
              <Typo size={15} fontWeight="700" color={colors.primary}>
                QUÉT HÓA ĐƠN AI
              </Typo>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        {oldTransaction?.id && !loading && (
          <Button
            onPress={() =>
              Alert.alert("Xác nhận", "Xóa giao dịch này?", [
                { text: "Hủy", style: "cancel" },
                {
                  text: "Xóa",
                  onPress: () =>
                    deleteTransaction(
                      oldTransaction.id!,
                      oldTransaction.walletId!,
                    ).then(() => router.back()),
                  style: "destructive",
                },
              ])
            }
            style={{
              backgroundColor: colors.rose,
              paddingHorizontal: spacingX._15,
            }}
          >
            <Icons.Trash
              color={colors.white}
              size={verticalScale(24)}
              weight="bold"
            />
          </Button>
        )}
        <Button onPress={onSubmit} loading={loading} style={{ flex: 1 }}>
          <Typo color={colors.black} fontWeight={"700"}>
            {oldTransaction?.id ? "Cập nhật" : "Lưu"}
          </Typo>
        </Button>
      </View>
    </ModalWrapper>
  );
};

export default TransactionModal;

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacingY._20 },
  form: {
    gap: spacingY._20,
    paddingVertical: spacingY._15,
    paddingBottom: spacingY._40,
  },
  footer: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: spacingX._20,
    gap: scale(12),
    paddingTop: spacingY._15,
    borderTopWidth: 1,
    marginBottom: spacingY._5,
  },
  inputContainer: { gap: spacingY._10 },
  flexRow: { flexDirection: "row", alignItems: "center", gap: spacingX._5 },
  dateInput: {
    height: verticalScale(54),
    alignItems: "center",
    flexDirection: "row",
    borderWidth: 1,
    borderRadius: radius._17,
    paddingHorizontal: spacingX._15,
  },
  datePickerButton: {
    alignSelf: "flex-end",
    padding: spacingY._7,
    marginRight: spacingX._7,
    paddingHorizontal: spacingY._15,
    borderRadius: radius._10,
  },
  dropdownContainer: {
    height: verticalScale(54),
    borderWidth: 1,
    paddingHorizontal: spacingX._15,
    borderRadius: radius._15,
  },
  scanIcon: { padding: spacingY._7, borderRadius: radius._10 },
  aiScanButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacingX._10,
    borderWidth: 1,
    borderRadius: radius._15,
    paddingVertical: spacingY._12,
    borderStyle: "dashed",
  },
});

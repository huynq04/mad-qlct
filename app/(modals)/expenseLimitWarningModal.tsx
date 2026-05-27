import BackButton from "@/components/BackButton";
import Button from "@/components/Button";
import Header from "@/components/Header";
import Input from "@/components/Input";
import ModalWrapper from "@/components/ModalWrapper";
import Typo from "@/components/Typo";
import { radius, spacingX, spacingY } from "@/constants/theme";
import { useAuth } from "@/contexts/authContext";
import { useTheme } from "@/contexts/themeContext";
import useFetchData from "@/hooks/useFetchData";
import {
  createOrUpdateBudget,
  deleteBudget,
  getBudgetByWalletId,
} from "@/services/budgetService";
import { BudgetType, ExpenseLimitPeriod, WalletType } from "@/types";
import { verticalScale } from "@/utils/styling";
import { orderBy, where } from "firebase/firestore";
import * as Icons from "phosphor-react-native";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Dropdown } from "react-native-element-dropdown";

const periodOptions: { label: string; value: ExpenseLimitPeriod }[] = [
  { label: "Ngày", value: "day" },
  { label: "Tuần", value: "week" },
  { label: "Tháng", value: "month" },
];

const periodLabel: Record<ExpenseLimitPeriod, string> = {
  day: "Ngày",
  week: "Tuần",
  month: "Tháng",
};

const periodOrder: Record<ExpenseLimitPeriod, number> = {
  day: 1,
  week: 2,
  month: 3,
};

const ExpenseLimitWarningModal = () => {
  const { user } = useAuth();
  const { colors, isDarkMode } = useTheme();

  const [selectedWalletId, setSelectedWalletId] = useState("");
  const [budgets, setBudgets] = useState<BudgetType[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [budgetType, setBudgetType] = useState<ExpenseLimitPeriod>("day");
  const [budgetAmount, setBudgetAmount] = useState("");

  const { data: wallets } = useFetchData<WalletType>("wallets", [
    where("uid", "==", user?.uid),
    orderBy("created", "desc"),
  ]);

  useEffect(() => {
    if (wallets.length && !selectedWalletId) {
      setSelectedWalletId(wallets[0].id || "");
    }
  }, [wallets, selectedWalletId]);

  const fetchWalletBudgets = async (walletId: string) => {
    if (!walletId) {
      setBudgets([]);
      return;
    }
    const res = await getBudgetByWalletId(walletId);
    if (res.success) {
      const sortedBudgets = (res.data || []).sort(
        (a: BudgetType, b: BudgetType) =>
          periodOrder[a.type] - periodOrder[b.type],
      );
      setBudgets(sortedBudgets);
    }
  };

  useEffect(() => {
    fetchWalletBudgets(selectedWalletId);
  }, [selectedWalletId]);

  const onAddBudget = async () => {
    const amount = Number(budgetAmount.replace(/[^0-9]/g, ""));
    if (!amount || amount <= 0) {
      Alert.alert("Lỗi", "Vui lòng nhập số tiền hợp lệ");
      return;
    }
    setLoading(true);
    const res = await createOrUpdateBudget({
      walletId: selectedWalletId,
      type: budgetType,
      amount,
    });
    setLoading(false);
    if (res.success) {
      setShowAddModal(false);
      setBudgetAmount("");
      fetchWalletBudgets(selectedWalletId);
    } else {
      Alert.alert("Lỗi", res.msg);
    }
  };

  const onDeleteBudget = (id?: string) => {
    if (!id) return;
    Alert.alert("Xác nhận", "Bạn có chắc muốn xóa cảnh báo này?", [
      { text: "Hủy", style: "cancel" },
      {
        text: "Xóa",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          const res = await deleteBudget(id);
          setLoading(false);
          if (!res.success) {
            Alert.alert("Lỗi", res.msg);
            return;
          }
          fetchWalletBudgets(selectedWalletId);
        },
      },
    ]);
  };

  return (
    <ModalWrapper>
      <View style={styles.container}>
        <Header
          title="Giới hạn chi tiêu"
          leftIcon={<BackButton />}
          style={{ marginBottom: spacingY._10 }}
        />

        <ScrollView
          contentContainerStyle={styles.form}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.inputContainer}>
            <Typo color={colors.textLight} size={16}>
              Chọn ví
            </Typo>
            <Dropdown
              style={[styles.dropdownContainer, { borderColor: colors.border }]}
              activeColor={isDarkMode ? colors.neutral300 : colors.neutral100}
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
                label: wallet.name,
                value: wallet.id,
              }))}
              maxHeight={300}
              labelField="label"
              valueField="value"
              placeholder="Chọn ví"
              value={selectedWalletId}
              onChange={(item) => setSelectedWalletId(item.value || "")}
            />
          </View>

          <Typo color={colors.text} size={16} fontWeight="600">
            Danh sách cảnh báo
          </Typo>

          <View style={styles.warningList}>
            {budgets.map((item) => (
              <View
                style={[
                  styles.warningItem,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
                key={item.id || item.type}
              >
                <Typo size={15} color={colors.text}>
                  {item.amount.toLocaleString("vi-VN")}đ -{" "}
                  {periodLabel[item.type]}
                </Typo>

                <TouchableOpacity
                  style={styles.deleteIcon}
                  onPress={() => onDeleteBudget(item.id)}
                  activeOpacity={0.8}
                >
                  <Icons.Trash
                    size={verticalScale(16)}
                    color="#fff"
                    weight="bold"
                  />
                </TouchableOpacity>
              </View>
            ))}

            {!budgets.length && (
              <View style={[styles.emptyBox, { borderColor: colors.border }]}>
                <Typo color={colors.textLighter} size={14}>
                  Chưa có cảnh báo nào
                </Typo>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      <View style={[styles.footer, { borderTopColor: colors.border }]}>
        <Button onPress={() => setShowAddModal(true)} style={{ flex: 1 }}>
          <Typo color={colors.black} fontWeight={"700"} size={18}>
            Thêm cảnh báo mới
          </Typo>
        </Button>
      </View>

      <Modal visible={showAddModal} transparent animationType="fade">
        <View style={styles.overlay}>
          <View
            style={[
              styles.addModalCard,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Typo size={18} fontWeight={"700"}>
              Thêm giới hạn
            </Typo>

            <View style={styles.inputContainer}>
              <Typo color={colors.textLight} size={14}>
                Khoảng thời gian
              </Typo>
              <Dropdown
                style={[
                  styles.dropdownContainer,
                  { borderColor: colors.border },
                ]}
                activeColor={isDarkMode ? colors.neutral300 : colors.neutral100}
                selectedTextStyle={{ color: colors.text }}
                itemTextStyle={{ color: colors.text }}
                containerStyle={{
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                }}
                data={periodOptions}
                labelField="label"
                valueField="value"
                value={budgetType}
                onChange={(item) =>
                  setBudgetType(item.value as ExpenseLimitPeriod)
                }
              />
            </View>

            <View style={styles.inputContainer}>
              <Typo color={colors.textLight} size={14}>
                Số tiền tối đa
              </Typo>
              <Input
                keyboardType="numeric"
                placeholder="Nhập số tiền..."
                value={budgetAmount}
                onChangeText={(value) =>
                  setBudgetAmount(value.replace(/[^0-9]/g, ""))
                }
              />
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  {
                    backgroundColor: isDarkMode
                      ? colors.neutral700
                      : colors.neutral200,
                  },
                ]}
                onPress={() => setShowAddModal(false)}
              >
                <Typo size={14} color={colors.text}>
                  Hủy
                </Typo>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  { backgroundColor: colors.primary },
                ]}
                onPress={onAddBudget}
              >
                <Typo size={14} color={colors.black} fontWeight={"700"}>
                  Lưu
                </Typo>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ModalWrapper>
  );
};

export default ExpenseLimitWarningModal;

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: spacingX._20 },
  form: {
    gap: spacingY._20,
    paddingVertical: spacingY._15,
    paddingBottom: spacingY._40,
  },
  inputContainer: { gap: spacingY._10 },
  warningList: { gap: spacingY._12 },
  warningItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radius._12,
    paddingHorizontal: spacingX._12,
    paddingVertical: spacingY._12,
    borderWidth: 1,
  },
  deleteIcon: {
    height: verticalScale(32),
    width: verticalScale(32),
    borderRadius: radius._10,
    backgroundColor: "#ef4444",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyBox: {
    borderStyle: "dashed",
    borderWidth: 1,
    borderRadius: radius._12,
    paddingVertical: spacingY._25,
    alignItems: "center",
  },

  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacingX._20,
    paddingTop: spacingY._15,
    paddingBottom: spacingY._20,
    borderTopWidth: 1,
  },

  dropdownContainer: {
    height: verticalScale(54),
    borderWidth: 1,
    paddingHorizontal: spacingX._15,
    borderRadius: radius._15,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: spacingX._20,
  },
  addModalCard: {
    borderRadius: radius._20,
    padding: spacingX._20,
    gap: spacingY._20,
    borderWidth: 1,
  },
  modalActions: {
    flexDirection: "row",
    gap: spacingX._10,
    justifyContent: "flex-end",
    marginTop: 5,
  },
  modalButton: {
    minWidth: verticalScale(80),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacingY._12,
    borderRadius: radius._12,
  },
});

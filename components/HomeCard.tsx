import { colors, spacingX, spacingY } from "@/constants/theme";
import { useAuth } from "@/contexts/authContext";
import useFetchData from "@/hooks/useFetchData";
import { TransactionType } from "@/types";
import { scale, verticalScale } from "@/utils/styling";
import { where } from "firebase/firestore";
import * as Icons from "phosphor-react-native";
import { useMemo } from "react";
import { ImageBackground, StyleSheet, View } from "react-native";
import Typo from "./Typo";

const HomeCard = () => {
  const { user } = useAuth();

  const { data: transactions, loading: transactionsLoading } =
    useFetchData<TransactionType>(user?.uid ? "transactions" : "", [
      where("uid", "==", user?.uid),
    ]);

  const totals = useMemo(() => {
    const incomeExpenses = transactions.reduce(
      (sum, item) => {
        const amount = Number(item.amount || 0);

        if (item.type === "income") {
          sum.income += amount;
        }

        if (item.type === "expense") {
          sum.expenses += amount;
        }

        return sum;
      },
      { income: 0, expenses: 0 },
    );

    return {
      balance: incomeExpenses.income - incomeExpenses.expenses,
      income: incomeExpenses.income,
      expenses: incomeExpenses.expenses,
    };
  }, [transactions]);

  return (
    <ImageBackground
      source={require("../assets/images/card.png")}
      resizeMode="stretch"
      style={styles.bgImage}
    >
      <View style={styles.container}>
        {/* Total Balance */}
        <View style={styles.totalBalanceRow}>
          <Typo color={colors.neutral800} size={17} fontWeight="500">
            Tổng số dư
          </Typo>

          <Icons.DotsThreeOutline
            size={verticalScale(23)}
            color={colors.black}
            weight="fill"
          />
        </View>

        <Typo color={colors.black} size={30} fontWeight="bold">
          {transactionsLoading
            ? "----"
            : `${totals.balance.toLocaleString("vi-VN")}đ`}
        </Typo>

        {/* Stats: Income & Expense */}
        <View style={styles.stats}>
          {/* Income */}
          <View style={{ gap: verticalScale(5) }}>
            <View style={styles.incomeExpense}>
              <View style={styles.statsIcon}>
                <Icons.ArrowDown
                  size={verticalScale(15)}
                  color={colors.black}
                  weight="bold"
                />
              </View>

              <Typo size={16} color={colors.neutral700} fontWeight="500">
                Thu nhập
              </Typo>
            </View>

            <View style={{ alignSelf: "center" }}>
              <Typo size={17} color={colors.green} fontWeight="600">
                {transactionsLoading
                  ? "----"
                  : `${totals.income.toLocaleString("vi-VN")}đ`}
              </Typo>
            </View>
          </View>

          {/* Expense */}
          <View style={{ gap: verticalScale(5) }}>
            <View style={styles.incomeExpense}>
              <View style={styles.statsIcon}>
                <Icons.ArrowUp
                  size={verticalScale(15)}
                  color={colors.black}
                  weight="bold"
                />
              </View>

              <Typo size={16} color={colors.neutral700} fontWeight="500">
                Chi tiêu
              </Typo>
            </View>

            <View style={{ alignSelf: "center" }}>
              <Typo size={17} color={colors.rose} fontWeight="600">
                {transactionsLoading
                  ? "----"
                  : `${totals.expenses.toLocaleString("vi-VN")}đ`}
              </Typo>
            </View>
          </View>
        </View>
      </View>
    </ImageBackground>
  );
};

export default HomeCard;

const styles = StyleSheet.create({
  bgImage: {
    height: scale(210),
    width: "100%",
  },

  container: {
    padding: spacingX._20,
    paddingHorizontal: scale(23),
    height: "87%",
    width: "100%",
    justifyContent: "space-between",
  },

  totalBalanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacingY._5,
  },

  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  statsIcon: {
    backgroundColor: colors.neutral350,
    padding: spacingY._5,
    borderRadius: 50,
  },

  incomeExpense: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingY._7,
  },
});

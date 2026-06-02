import { firestore } from "@/config/firebase";
import { colors } from "@/constants/theme";
import {
  BudgetType,
  ExpenseLimitPeriod,
  MonthlyInsightStatsType,
  ResponseType,
  TransactionType,
  WalletType,
} from "@/types";
import { getLast12Months, getLast7Days, getYearsRange } from "@/utils/common";
import { scale } from "@/utils/styling";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { uploadFileToCloudinary } from "./imageServices";
import { createOrUpdateWallet } from "./walletService";

const MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CATEGORY_LABELS_VI: Record<string, string> = {
  groceries: "Mua sắm",
  rent: "Nhà ở",
  utilities: "Tiện ích",
  transportation: "Di chuyển",
  entertainment: "Giải trí",
  dining: "Ăn uống",
  health: "Y tế",
  insurance: "Bảo hiểm",
  savings: "Tiết kiệm",
  clothing: "Quần áo",
  personal: "Cá nhân",
  others: "Khác",
};

const CATEGORY_COLORS: Record<string, string> = {
  groceries: "#4B5563",
  rent: "#075985",
  utilities: "#ca8a04",
  transportation: "#b45309",
  entertainment: "#0f766e",
  dining: "#be185d",
  health: "#e11d48",
  insurance: "#404040",
  savings: "#065F46",
  clothing: "#7c3aed",
  personal: "#a21caf",
  others: "#525252",
};

const getMonthYearKey = (date: Date) => {
  const monthName = MONTHS_SHORT[date.getMonth()];
  const shortYear = date.getFullYear().toString().slice(-2);
  return `${monthName} ${shortYear}`;
};

const getTransactionDate = (value: TransactionType["date"]): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const getPeriodRange = (date: Date, period: ExpenseLimitPeriod) => {
  const start = new Date(date);
  const end = new Date(date);

  if (period === "day") {
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  if (period === "week") {
    const daysSinceMonday = (date.getDay() + 6) % 7;
    start.setDate(date.getDate() - daysSinceMonday);
    start.setHours(0, 0, 0, 0);

    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  end.setMonth(start.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);

  return { start, end };
};

export type ExpenseLimitExceededItem = {
  type: ExpenseLimitPeriod;
  limitAmount: number;
  currentSpent: number;
  nextSpent: number;
};

export type ExpenseBudgetStatus = {
  exceededItems: ExpenseLimitExceededItem[];
  nearLimitItems: ExpenseLimitExceededItem[];
};

/**
 * (HIỆN CẢNH BÁO VÍ) Kiểm tra “sắp vượt” hoặc “đã vượt” giới hạn chi tiêu của một ví
 * (tương ứng `getExceedExpenseLimit` trong mô tả báo cáo; trong code hiện dùng tên `getExceededExpenseLimits`).
 *
 * Tư duy nghiệp vụ:
 * - Khi người dùng chuẩn bị lưu một giao dịch chi (expense), ta dự đoán tổng chi sau khi cộng thêm
 *   `expenseAmount` sẽ là bao nhiêu trong chu kỳ ngày/tuần/tháng.
 * - Nếu vượt giới hạn: đưa vào `exceededItems`.
 * - Nếu gần chạm giới hạn (>= 90%): đưa vào `nearLimitItems`.
 *
 * Đầu vào:
 * - `walletId`: ví đang chi tiêu.
 * - `expenseAmount`: số tiền chuẩn bị chi (giao dịch mới hoặc số tiền mới khi sửa).
 * - `date`: ngày của giao dịch (quy định chu kỳ ngày/tuần/tháng cần tính).
 * - `transactionIdToIgnore`: dùng khi sửa giao dịch để “bỏ qua” giao dịch cũ (tránh cộng 2 lần).
 *
 * Các bước chính:
 * 1) Lấy các budget của ví theo `walletId` và gom theo `type` (day/week/month).
 * 2) Lấy tất cả giao dịch expense của ví.
 * 3) Với mỗi `type`:
 *    - Tính khoảng thời gian start/end tương ứng với `date` (hàm `getPeriodRange`).
 *    - Cộng dồn `currentSpent` (tổng chi trong khoảng) và tính `nextSpent = currentSpent + expenseAmount`.
 *    - So sánh `nextSpent` với `limitAmount` để phân loại cảnh báo.
 *
 * Đầu ra:
 * - `ExpenseBudgetStatus` gồm 2 mảng để UI quyết định hiện modal/notification.
 */
export const getExceededExpenseLimits = async (
  walletId: string,
  expenseAmount: number,
  date: Date,
  transactionIdToIgnore?: string,
): Promise<ResponseType> => {
  try {
    if (!walletId || !expenseAmount || expenseAmount <= 0) {
      return { success: true, data: [] };
    }

    const budgetQuery = query(
      collection(firestore, "budget"),
      where("walletId", "==", walletId),
    );
    const budgetSnapshot = await getDocs(budgetQuery);
    const budgetByType: Partial<Record<ExpenseLimitPeriod, BudgetType>> = {};

    budgetSnapshot.docs.forEach((item) => {
      const budget = { id: item.id, ...item.data() } as BudgetType;
      if (!budget?.type || !["day", "week", "month"].includes(budget.type)) {
        return;
      }

      const amount = Number(budget.amount);
      if (!amount || amount <= 0) return;

      budgetByType[budget.type] = {
        ...budget,
        amount,
      };
    });

    const budgetItems = (Object.keys(budgetByType) as ExpenseLimitPeriod[]).map(
      (type) => budgetByType[type] as BudgetType,
    );

    if (!budgetItems.length) {
      return {
        success: true,
        data: {
          exceededItems: [],
          nearLimitItems: [],
        },
      };
    }

    const transactionsQuery = query(
      collection(firestore, "transactions"),
      where("walletId", "==", walletId),
      where("type", "==", "expense"),
    );
    const transactionsSnapshot = await getDocs(transactionsQuery);
    const expenseTransactions = transactionsSnapshot.docs.map((item) => {
      return { id: item.id, ...item.data() } as TransactionType;
    });

    const exceededItems: ExpenseLimitExceededItem[] = [];
    const nearLimitItems: ExpenseLimitExceededItem[] = [];

    budgetItems.forEach((budgetItem) => {
      const { start, end } = getPeriodRange(date, budgetItem.type);

      const currentSpent = expenseTransactions.reduce((total, transaction) => {
        if (transactionIdToIgnore && transaction.id === transactionIdToIgnore) {
          return total;
        }

        const transactionDate = getTransactionDate(transaction.date);
        if (!transactionDate) return total;

        if (transactionDate < start || transactionDate > end) {
          return total;
        }

        return total + Number(transaction.amount || 0);
      }, 0);

      const nextSpent = currentSpent + expenseAmount;
      const limitAmount = Number(budgetItem.amount);
      if (nextSpent > limitAmount) {
        exceededItems.push({
          type: budgetItem.type,
          limitAmount,
          currentSpent,
          nextSpent,
        });
      } else if (nextSpent >= limitAmount * 0.9) {
        nearLimitItems.push({
          type: budgetItem.type,
          limitAmount,
          currentSpent,
          nextSpent,
        });
      }
    });

    const statusData: ExpenseBudgetStatus = {
      exceededItems,
      nearLimitItems,
    };

    return { success: true, data: statusData };
  } catch (err: any) {
    console.log("error checking expense limit warnings: ", err);
    return { success: false, msg: err.message };
  }
};

export const createOrUpdateTransaction = async (
  transactionData: Partial<TransactionType>,
): Promise<ResponseType> => {
  try {
    const { id, type, walletId, amount, image } = transactionData;

    if (!amount || amount <= 0 || !walletId || !type) {
      return { success: false, msg: "Dữ liệu giao dịch không hợp lệ!" };
    }

    if (id) {
      const oldTransactionSnapshot = await getDoc(
        doc(firestore, "transactions", id),
      );

      const oldTransaction = oldTransactionSnapshot.data() as TransactionType;
      const old = oldTransactionSnapshot.data() as TransactionType;

      const shouldRevertOriginal =
        oldTransaction.type !== type ||
        oldTransaction.amount !== amount ||
        oldTransaction.walletId !== walletId;

      if (shouldRevertOriginal) {
        let res = await revertAndUpdateWallets(
          oldTransaction,
          Number(amount),
          type,
          walletId,
        );

        if (!res.success) return res;
      }
    } else {
      // update wallet for new transaction
      let res = await updateWalletForNewTransaction(
        walletId!,
        Number(amount!),
        type,
      );

      if (!res.success) return res;
    }

    if (image) {
      const imageUploadRes = await uploadFileToCloudinary(
        image,
        "transactions",
      );

      if (!imageUploadRes.success) {
        return {
          success: false,
          msg: imageUploadRes.msg || "Failed to upload receipt",
        };
      }

      transactionData.image = imageUploadRes.data;
    }

    const transactionRef = id
      ? doc(firestore, "transactions", id)
      : doc(collection(firestore, "transactions"));

    await setDoc(transactionRef, transactionData, { merge: true });

    return {
      success: true,
      data: { ...transactionData, id: transactionRef.id },
    };
  } catch (err: any) {
    console.log("error creating or updating transaction: ", err);
    return { success: false, msg: err.message };
  }
};

const updateWalletForNewTransaction = async (
  walletId: string,
  amount: number,
  type: string,
) => {
  try {
    const walletRef = doc(firestore, "wallets", walletId);
    const walletSnapshot = await getDoc(walletRef);
    if (!walletSnapshot.exists()) {
      console.log("error updating wallet for new transaction");
      return { success: false, msg: "Wallet not found" };
    }

    const walletData = walletSnapshot.data() as WalletType;

    if (type === "expense" && walletData.amount! - amount < 0) {
      return {
        success: false,
        msg: "Selected wallet don't have enough balance",
      };
    }

    const updateType = type == "income" ? "totalIncome" : "totalExpenses";
    const updatedWalletAmount =
      type == "income"
        ? Number(walletData.amount) + amount
        : Number(walletData.amount) - amount;

    const updatedTotals =
      type == "income"
        ? Number(walletData.totalIncome) + amount
        : Number(walletData.totalExpenses) + amount;

    await updateDoc(walletRef, {
      amount: updatedWalletAmount,
      [updateType]: updatedTotals,
    });

    return { success: true };
  } catch (err: any) {
    console.log("error updating wallet for new transaction: ", err);
    return { success: false, msg: err.message };
  }
};

const revertAndUpdateWallets = async (
  oldTransaction: TransactionType,
  newTransactionAmount: number,
  newTransactionType: string,
  newWalletId: string,
) => {
  try {
    const originalWalletSnapshot = await getDoc(
      doc(firestore, "wallets", oldTransaction.walletId),
    );

    const originalWallet = originalWalletSnapshot.data() as WalletType;

    let newWalletSnapshot = await getDoc(
      doc(firestore, "wallets", newWalletId),
    );
    let newWallet = newWalletSnapshot.data() as WalletType;

    const revertType =
      oldTransaction.type == "income" ? "totalIncome" : "totalExpenses";

    const revertIncomeExpense: number =
      oldTransaction.type == "income"
        ? -Number(oldTransaction.amount)
        : Number(oldTransaction.amount);

    const revertedWalletAmount =
      Number(originalWallet.amount) + revertIncomeExpense;
    // wallet amount, after the transaction is removed

    const revertedIncomeExpenseAmount =
      Number(originalWallet[revertType]) - Number(oldTransaction.amount);

    if (newTransactionType == "expense") {
      // if user tries to convert income to expense on the same ge wallet
      // or if the user tries to increase the expense amount and donn't have enough
      if (
        oldTransaction.walletId == newWalletId &&
        revertedWalletAmount < newTransactionAmount
      ) {
        return {
          success: false,
          msg: "The selected wallet donn't have enough balance",
        };
      }

      // if user tries to add expense from a new wallet but the wallet donn't have anough balance
      if (newWallet.amount! < newTransactionAmount) {
        return {
          success: false,
          msg: "The selected wallet donn't have enough balance",
        };
      }
    }

    await createOrUpdateWallet({
      id: oldTransaction.walletId,
      amount: revertedWalletAmount,
      [revertType]: revertedIncomeExpenseAmount,
    });

    // revert completed
    /////////////////////////////////////////////////////////////////////////

    // refetch the newwallet because we may have just updated it
    newWalletSnapshot = await getDoc(doc(firestore, "wallets", newWalletId));
    newWallet = newWalletSnapshot.data() as WalletType;

    const updateType =
      newTransactionType == "income" ? "totalIncome" : "totalExpenses";

    const updatedTransactionAmount: number =
      newTransactionType == "income"
        ? Number(newTransactionAmount)
        : -Number(newTransactionAmount);

    const newWalletAmount = Number(newWallet.amount) + updatedTransactionAmount;

    const newIncomeExpenseAmount = Number(
      newWallet[updateType]! + Number(newTransactionAmount),
    );

    await createOrUpdateWallet({
      id: newWalletId,
      amount: newWalletAmount,
      [updateType]: newIncomeExpenseAmount,
    });

    return { success: true };
  } catch (err: any) {
    console.log("error updating wallet for new transaction: ", err);
    return { success: false, msg: err.message };
  }
};

export const deleteTransaction = async (
  transactionId: string,
  walletId: string,
) => {
  try {
    const transactionRef = doc(firestore, "transactions", transactionId);
    const transactionSnapshot = await getDoc(transactionRef);

    if (!transactionSnapshot.exists()) {
      return { success: false, msg: "Transaction not found" };
    }

    const transactionData = transactionSnapshot.data() as TransactionType;

    const transactionType = transactionData?.type;
    const transactionAmount = transactionData?.amount;

    // fetch wallet to update amount, totalIncome or totalExpenses
    const walletSnapshot = await getDoc(doc(firestore, "wallets", walletId));
    const walletData = walletSnapshot.data() as WalletType;

    // check fields to be updated based on transaction type
    const updateType =
      transactionType == "income" ? "totalIncome" : "totalExpenses";

    const newWalletAmount =
      walletData?.amount! -
      (transactionType == "income" ? transactionAmount : -transactionAmount);

    const newIncomeExpenseAmount = walletData[updateType]! - transactionAmount;

    // if its income and the wallet amount can go below zero
    if (transactionType == "income" && newWalletAmount < 0) {
      return { success: false, msg: "You cannot delete this transaction" };
    }

    await createOrUpdateWallet({
      id: walletId,
      amount: newWalletAmount,
      [updateType]: newIncomeExpenseAmount,
    });

    await deleteDoc(transactionRef);

    return { success: true };
  } catch (err: any) {
    console.log("error updating wallet for new transaction: ", err);
    return { success: false, msg: err.message };
  }
};

/**
 * (THỐNG KÊ) Lấy thống kê theo tuần (7 ngày gần nhất)
 * (tương ứng `fetchWeeklyStat` trong mô tả báo cáo; trong code hiện là `fetchWeeklyStats`).
 *
 * Mục đích:
 * - Query giao dịch của user trong 7 ngày gần nhất.
 * - Gom tổng `income/expense` theo từng ngày và chuyển sang format phù hợp `BarChart`.
 *
 * Output:
 * - `stats`: mảng dùng cho `react-native-gifted-charts`.
 *   Mỗi ngày tạo 2 cột: 1 cột thu (income) + 1 cột chi (expense).
 * - `transactions`: danh sách giao dịch thô để UI có thể liệt kê bên dưới biểu đồ.
 */
export const fetchWeeklyStats = async (uid: string): Promise<ResponseType> => {
  try {
    const db = firestore;
    const today = new Date();
    const sevenDatesAgo = new Date(today);
    sevenDatesAgo.setDate(today.getDate() - 7);

    const transactionsQuery = query(
      collection(db, "transactions"),
      where("date", ">=", Timestamp.fromDate(sevenDatesAgo)),
      where("date", "<=", Timestamp.fromDate(today)),
      orderBy("date", "desc"),
      where("uid", "==", uid),
    );

    const querySnapshot = await getDocs(transactionsQuery);
    const weeklyData = getLast7Days();
    const transactions: TransactionType[] = [];

    querySnapshot.forEach((doc) => {
      const transaction = doc.data() as TransactionType;
      transaction.id = doc.id;
      transactions.push(transaction);

      const transactionDate = (transaction.date as Timestamp)
        .toDate()
        .toISOString()
        .split("T")[0];

      const dayData = weeklyData.find((day) => day.date === transactionDate);

      if (dayData) {
        if (transaction.type === "income") {
          dayData.income += transaction.amount!;
        } else if (transaction.type === "expense") {
          dayData.expense += transaction.amount!;
        }
      }
    });

    const stats = weeklyData.flatMap((day) => [
      {
        value: day.income,
        label: day.day,
        spacing: scale(4),
        labelWidth: scale(30),
        frontColor: colors.primary,
      },
      {
        value: day.expense,
        frontColor: colors.rose,
      },
    ]);

    return { success: true, data: { stats, transactions } };
  } catch (err: any) {
    console.log("error updating wallet for new transaction: ", err);
    return { success: false, msg: err.message };
  }
};

/**
 * (THỐNG KÊ) Lấy thống kê theo tháng (12 tháng gần nhất)
 * (tương ứng `fetchMonthlyStat` trong mô tả báo cáo; trong code hiện là `fetchMonthlyStats`).
 *
 * Mục đích:
 * - Query giao dịch của user trong khoảng 12 tháng gần nhất.
 * - Gom tổng thu/chi theo từng tháng, sau đó “đổ” ra dữ liệu biểu đồ cột.
 *
 * Điểm đáng chú ý:
 * - `monthlyData` được tạo sẵn 12 phần tử (mỗi tháng income/expense = 0).
 *   Nhờ vậy tháng không có giao dịch vẫn hiển thị cột 0.
 * - Dùng `matchKey = 'YYYY-M'` để map giao dịch vào đúng tháng.
 */
export const fetchMonthlyStats = async (uid: string): Promise<ResponseType> => {
  try {
    const db = firestore;
    const today = new Date();
    const twelveMonthsAgo = new Date(
      today.getFullYear(),
      today.getMonth() - 11,
      1,
    );

    const transactionsQuery = query(
      collection(db, "transactions"),
      where("date", ">=", Timestamp.fromDate(twelveMonthsAgo)),
      where("date", "<=", Timestamp.fromDate(today)),
      orderBy("date", "desc"),
      where("uid", "==", uid),
    );

    const querySnapshot = await getDocs(transactionsQuery);

    const monthlyData: any[] = [];
    // 🛠️ FIX Ở ĐÂY: Đảo vòng lặp để Tháng hiện tại (mới nhất) nằm ngoài cùng bên trái
    for (let i = 0; i <= 11; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      monthlyData.push({
        label: `T${d.getMonth() + 1}`,
        matchKey: `${d.getFullYear()}-${d.getMonth()}`,
        income: 0,
        expense: 0,
      });
    }

    const transactions: TransactionType[] = [];

    querySnapshot.forEach((doc) => {
      const transaction = doc.data() as TransactionType;
      transaction.id = doc.id;
      transactions.push(transaction);

      const transactionDate = getTransactionDate(transaction.date);
      if (!transactionDate) return;

      const matchKey = `${transactionDate.getFullYear()}-${transactionDate.getMonth()}`;
      const monthData = monthlyData.find(
        (month) => month.matchKey === matchKey,
      );

      if (monthData) {
        if (transaction.type === "income") {
          monthData.income += transaction.amount || 0;
        } else if (transaction.type === "expense") {
          monthData.expense += transaction.amount || 0;
        }
      }
    });

    const stats = monthlyData.flatMap((month) => [
      {
        value: month.income,
        label: month.label,
        spacing: scale(4),
        labelWidth: scale(30),
        frontColor: colors.primary,
      },
      {
        value: month.expense,
        frontColor: colors.rose,
      },
    ]);

    return {
      success: true,
      data: { stats, transactions },
    };
  } catch (error) {
    console.error("Error fetching monthly transactions:", error);
    return { success: false, msg: "Failed to fetch monthly transactions" };
  }
};

/**
 * (THỐNG KÊ) Lấy thống kê theo năm (từ năm có giao dịch đầu tiên đến năm hiện tại)
 * (tương ứng `fetchYearlyStat` trong mô tả báo cáo; trong code hiện là `fetchYearlyStats`).
 *
 * Ý tưởng:
 * - Lấy toàn bộ giao dịch của user.
 * - Tìm năm của giao dịch sớm nhất (earliest) để biết cần thống kê từ năm nào.
 * - Tạo “khung năm” bằng `getYearsRange(firstYear, currentYear)` rồi cộng dồn income/expense theo năm.
 */
export const fetchYearlyStats = async (uid: string): Promise<ResponseType> => {
  try {
    const db = firestore;

    // Define query to fetch transactions in the last 12 months
    const transactionsQuery = query(
      collection(db, "transactions"),
      orderBy("date", "desc"),
      where("uid", "==", uid),
    );

    const querySnapshot = await getDocs(transactionsQuery);
    const transactions: TransactionType[] = [];

    const firstTransaction = querySnapshot.docs.reduce((earliest, doc) => {
      const transactionDate = doc.data().date.toDate();
      return transactionDate < earliest ? transactionDate : earliest;
    }, new Date());

    const firstYear = firstTransaction.getFullYear();
    const currentYear = new Date().getFullYear();

    const yearlyData = getYearsRange(firstYear, currentYear);

    // Process transactions to calculate income and expense for each month
    querySnapshot.forEach((doc) => {
      const transaction = doc.data() as TransactionType;
      transaction.id = doc.id; // Include document ID in transaction data
      transactions.push(transaction);

      const transactionYear = (transaction.date as Timestamp)
        .toDate()
        .getFullYear();

      const yearData = yearlyData.find(
        (item: any) => item.year === transactionYear.toString(),
      );

      if (yearData) {
        if (transaction.type === "income") {
          yearData.income += transaction.amount;
        } else if (transaction.type === "expense") {
          yearData.expense += transaction.amount;
        }
      }
    });

    // Reformat monthlyData for the bar chart with income and expense entries for each month
    const stats = yearlyData.flatMap((year: any) => [
      {
        value: year.income,
        label: year.year,
        spacing: scale(4),
        labelWidth: scale(35),
        frontColor: colors.primary, // Income bar color
      },
      {
        value: year.expense,
        frontColor: colors.rose, // Expense bar color
      },
    ]);

    return {
      success: true,
      data: {
        stats,
        transactions, // Include all transaction details
      },
    };
  } catch (error) {
    console.error("Error fetching yearly transactions:", error);
    return {
      success: false,
      msg: "Failed to fetch yearly transactions",
    };
  }
};

const getYearMonthKey = (date: Date) => {
  return `${date.getFullYear()}-${date.getMonth()}`;
};

const getMonthWindow = (year: number, month: number) => {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1),
  };
};

const percentChange = (current: number, previous: number) => {
  if (previous > 0) {
    return ((current - previous) / previous) * 100;
  }
  if (current > 0) return 100;
  return 0;
};

const getMonthlyBudgetLimitByUser = async (uid: string): Promise<number> => {
  const walletsQuery = query(
    collection(firestore, "wallets"),
    where("uid", "==", uid),
  );
  const walletsSnapshot = await getDocs(walletsQuery);
  const walletIdSet = new Set(walletsSnapshot.docs.map((item) => item.id));

  if (!walletIdSet.size) return 0;

  const monthlyBudgetQuery = query(
    collection(firestore, "budget"),
    where("type", "==", "month"),
  );
  const monthlyBudgetSnapshot = await getDocs(monthlyBudgetQuery);

  return monthlyBudgetSnapshot.docs.reduce((total, item) => {
    const budget = { id: item.id, ...item.data() } as BudgetType;
    if (!budget?.walletId || !walletIdSet.has(budget.walletId)) {
      return total;
    }

    const amount = Number(budget.amount || 0);
    if (amount <= 0) return total;

    return total + amount;
  }, 0);
};

export const fetchMonthlyInsightStats = async (
  uid: string,
): Promise<ResponseType> => {
  try {
    if (!uid) {
      return { success: false, msg: "Missing user id" };
    }

    const now = new Date();
    const { start: currentMonthStart, end: nextMonthStart } = getMonthWindow(
      now.getFullYear(),
      now.getMonth(),
    );
    const { start: previousMonthStart, end: previousMonthEnd } = getMonthWindow(
      now.getFullYear(),
      now.getMonth() - 1,
    );
    const lookBackStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);

    const transactionsQuery = query(
      collection(firestore, "transactions"),
      where("uid", "==", uid),
      where("date", ">=", Timestamp.fromDate(lookBackStart)),
      where("date", "<", Timestamp.fromDate(nextMonthStart)),
      orderBy("date", "desc"),
    );

    const querySnapshot = await getDocs(transactionsQuery);

    let totalExpense = 0;
    let totalIncome = 0;
    let previousExpense = 0;
    let transactionCount = 0;
    let previousTransactionCount = 0;

    const currentExpenseByCategory: Record<string, number> = {};
    const previousExpenseByMonth: Record<string, number> = {};
    const previousCategoryByMonth: Record<string, Record<string, number>> = {};

    querySnapshot.forEach((item) => {
      const transaction = { id: item.id, ...item.data() } as TransactionType;
      const transactionDate = getTransactionDate(transaction.date);

      if (!transactionDate) return;

      const isCurrentMonth =
        transactionDate >= currentMonthStart &&
        transactionDate < nextMonthStart;
      const isPreviousMonth =
        transactionDate >= previousMonthStart &&
        transactionDate < previousMonthEnd;

      if (isCurrentMonth) {
        transactionCount += 1;
      }

      if (isPreviousMonth) {
        previousTransactionCount += 1;
      }

      const amount = Number(transaction.amount || 0);
      if (amount <= 0) return;

      if (transaction.type === "income") {
        if (isCurrentMonth) totalIncome += amount;
        return;
      }

      const categoryKey = transaction.category || "others";

      if (isCurrentMonth) {
        totalExpense += amount;
        currentExpenseByCategory[categoryKey] =
          (currentExpenseByCategory[categoryKey] || 0) + amount;
      }

      if (isPreviousMonth) {
        previousExpense += amount;
      }

      if (
        transactionDate >= lookBackStart &&
        transactionDate < currentMonthStart
      ) {
        const monthKey = getYearMonthKey(transactionDate);
        previousExpenseByMonth[monthKey] =
          (previousExpenseByMonth[monthKey] || 0) + amount;

        if (!previousCategoryByMonth[monthKey]) {
          previousCategoryByMonth[monthKey] = {};
        }

        previousCategoryByMonth[monthKey][categoryKey] =
          (previousCategoryByMonth[monthKey][categoryKey] || 0) + amount;
      }
    });

    const categories = Object.entries(currentExpenseByCategory)
      .sort((a, b) => b[1] - a[1])
      .map(([key, amount]) => ({
        key,
        label: CATEGORY_LABELS_VI[key] || CATEGORY_LABELS_VI.others,
        amount,
        percent:
          totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
        color: CATEGORY_COLORS[key] || CATEGORY_COLORS.others,
      }));

    const topCategory = categories[0] || {
      key: "others",
      label: CATEGORY_LABELS_VI.others,
      amount: 0,
      percent: 0,
      color: CATEGORY_COLORS.others,
    };

    const previousThreeMonthKeys = [1, 2, 3].map((offset) => {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      return getYearMonthKey(date);
    });

    const previousTopCategoryAverage =
      previousThreeMonthKeys.reduce((sum, monthKey) => {
        const categoryAmount =
          previousCategoryByMonth[monthKey]?.[topCategory.key] || 0;
        return sum + categoryAmount;
      }, 0) / previousThreeMonthKeys.length;

    const monthlyBudgetLimit = await getMonthlyBudgetLimitByUser(uid);
    const hasMonthlyBudget = monthlyBudgetLimit > 0;
    const hasPreviousExpenseData = previousExpense > 0;
    const expenseChangePercent = hasPreviousExpenseData
      ? percentChange(totalExpense, previousExpense)
      : 0;
    const budgetLimit = Math.max(0, Math.round(monthlyBudgetLimit));

    const savings = totalIncome - totalExpense;
    const savingsRate = totalIncome > 0 ? (savings / totalIncome) * 100 : 0;
    const budgetRemaining = hasMonthlyBudget ? budgetLimit - totalExpense : 0;
    const budgetUsedPercent =
      budgetLimit > 0
        ? Math.min(100, Math.round((totalExpense / budgetLimit) * 100))
        : 0;

    const insightStats: MonthlyInsightStatsType = {
      monthLabel: new Intl.DateTimeFormat("vi-VN", {
        month: "long",
        year: "numeric",
      }).format(now),
      hasMonthlyBudget,
      hasPreviousExpenseData,
      totalExpense,
      totalIncome,
      savings,
      savingsRate,
      expenseChangePercent,
      transactionCount,
      transactionCountChangePercent: percentChange(
        transactionCount,
        previousTransactionCount,
      ),
      budgetLimit,
      budgetUsedPercent,
      budgetRemaining,
      topCategoryLabel: topCategory.label,
      topCategoryAmount: topCategory.amount,
      topCategoryPercent: topCategory.percent,
      categories: categories.slice(0, 6),
      aiPayload: {
        monthLabel: new Intl.DateTimeFormat("vi-VN", {
          month: "long",
          year: "numeric",
        }).format(now),
        hasPreviousExpenseData,
        totalExpense,
        totalIncome,
        savings,
        savingsRate,
        expenseChangePercent,
        transactionCount,
        transactionCountChangePercent: percentChange(
          transactionCount,
          previousTransactionCount,
        ),
        topCategoryLabel: topCategory.label,
        topCategoryAmount: topCategory.amount,
        topCategoryPercent: topCategory.percent,
        previousTopCategoryAverage,
        categories: categories.slice(0, 5).map((item) => ({
          label: item.label,
          amount: item.amount,
          percent: item.percent,
        })),
      },
    };

    return {
      success: true,
      data: insightStats,
    };
  } catch (err: any) {
    console.log("error fetching monthly insight stats: ", err);
    return { success: false, msg: err.message };
  }
};

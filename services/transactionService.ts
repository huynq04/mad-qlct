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

// Nhãn tiếng Việt dùng khi hiển thị thống kê chi tiêu theo danh mục.
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

// Màu đại diện cho từng danh mục trên màn hình phân tích tài chính.
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

// Tạo khóa tháng-năm ngắn gọn để gom nhóm dữ liệu biểu đồ.
const getMonthYearKey = (date: Date) => {
  const monthName = MONTHS_SHORT[date.getMonth()];
  const shortYear = date.getFullYear().toString().slice(-2);
  return `${monthName} ${shortYear}`;
};

// Chuẩn hóa ngày giao dịch vì dữ liệu có thể là Date, Firestore Timestamp hoặc string.
const getTransactionDate = (value: TransactionType["date"]): Date | null => {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

// Tính khoảng thời gian cần kiểm tra theo hạn mức ngày, tuần hoặc tháng.
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

export const getExceededExpenseLimits = async (
  walletId: string,
  expenseAmount: number,
  date: Date,
  transactionIdToIgnore?: string,
): Promise<ResponseType> => {
  try {
    // Bỏ qua kiểm tra hạn mức khi thông tin giao dịch chi chưa hợp lệ.
    if (!walletId || !expenseAmount || expenseAmount <= 0) {
      return { success: true, data: [] };
    }

    // Lấy các hạn mức chi tiêu đã thiết lập cho ví được chọn.
    const budgetQuery = query(
      collection(firestore, "budget"),
      where("walletId", "==", walletId),
    );
    const budgetSnapshot = await getDocs(budgetQuery);
    const budgetByType: Partial<Record<ExpenseLimitPeriod, BudgetType>> = {};

    // Chỉ giữ các hạn mức hợp lệ theo ngày, tuần hoặc tháng.
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

    // Lấy các giao dịch chi hiện có của ví để tính tổng đã chi trong kỳ.
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

    // So sánh tổng đã chi sau giao dịch mới với từng hạn mức để tạo cảnh báo.
    budgetItems.forEach((budgetItem) => {
      const { start, end } = getPeriodRange(date, budgetItem.type);

      const currentSpent = expenseTransactions.reduce((total, transaction) => {
        // Khi sửa giao dịch, bỏ qua giao dịch cũ để không tính trùng số tiền.
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

    // Kiểm tra dữ liệu bắt buộc trước khi ghi Firestore và cập nhật ví.
    if (!amount || amount <= 0 || !walletId || !type) {
      return { success: false, msg: "Dữ liệu giao dịch không hợp lệ!" };
    }

    if (id) {
      // Trường hợp cập nhật: lấy giao dịch cũ để hoàn tác ảnh hưởng lên ví nếu cần.
      const oldTransactionSnapshot = await getDoc(
        doc(firestore, "transactions", id),
      );

      const oldTransaction = oldTransactionSnapshot.data() as TransactionType;

      const shouldRevertOriginal =
        oldTransaction.type !== type ||
        oldTransaction.amount !== amount ||
        oldTransaction.walletId !== walletId;

      if (shouldRevertOriginal) {
        // Nếu đổi ví, đổi loại hoặc đổi số tiền, cần cập nhật lại cả ví cũ và ví mới.
        let res = await revertAndUpdateWallets(
          oldTransaction,
          Number(amount),
          type,
          walletId,
        );

        if (!res.success) return res;
      }
    } else {
      // Trường hợp thêm mới: áp dụng ngay ảnh hưởng của giao dịch vào ví.
      let res = await updateWalletForNewTransaction(
        walletId!,
        Number(amount!),
        type,
      );

      if (!res.success) return res;
    }

    if (image) {
      // Upload ảnh hóa đơn lên Cloudinary trước, sau đó lưu URL ảnh vào giao dịch.
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

    // setDoc với merge giúp thêm mới hoặc cập nhật một phần dữ liệu giao dịch.
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
    // Lấy ví liên kết để kiểm tra số dư và cập nhật tổng thu/tổng chi.
    const walletRef = doc(firestore, "wallets", walletId);
    const walletSnapshot = await getDoc(walletRef);
    if (!walletSnapshot.exists()) {
      console.log("error updating wallet for new transaction");
      return { success: false, msg: "Wallet not found" };
    }

    const walletData = walletSnapshot.data() as WalletType;

    // Không cho tạo giao dịch chi nếu số dư ví không đủ.
    if (type === "expense" && walletData.amount! - amount < 0) {
      return {
        success: false,
        msg: "Selected wallet don't have enough balance",
      };
    }

    // Giao dịch thu làm tăng amount/totalIncome, giao dịch chi làm giảm amount và tăng totalExpenses.
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
    // Lấy ví cũ và ví mới để hoàn tác giao dịch cũ rồi áp dụng giao dịch mới.
    const originalWalletSnapshot = await getDoc(
      doc(firestore, "wallets", oldTransaction.walletId),
    );

    const originalWallet = originalWalletSnapshot.data() as WalletType;

    let newWalletSnapshot = await getDoc(
      doc(firestore, "wallets", newWalletId),
    );
    let newWallet = newWalletSnapshot.data() as WalletType;

    // Xác định trường tổng thu/tổng chi cần hoàn tác dựa trên loại giao dịch cũ.
    const revertType =
      oldTransaction.type == "income" ? "totalIncome" : "totalExpenses";

    const revertIncomeExpense: number =
      oldTransaction.type == "income"
        ? -Number(oldTransaction.amount)
        : Number(oldTransaction.amount);

    const revertedWalletAmount =
      Number(originalWallet.amount) + revertIncomeExpense;
    // Số dư ví sau khi loại bỏ ảnh hưởng của giao dịch cũ.

    const revertedIncomeExpenseAmount =
      Number(originalWallet[revertType]) - Number(oldTransaction.amount);

    if (newTransactionType == "expense") {
      // Kiểm tra số dư nếu giao dịch mới là chi tiêu.
      if (
        oldTransaction.walletId == newWalletId &&
        revertedWalletAmount < newTransactionAmount
      ) {
        return {
          success: false,
          msg: "The selected wallet donn't have enough balance",
        };
      }

      // Nếu chuyển sang ví mới, ví mới cũng phải đủ số dư để chi.
      if (newWallet.amount! < newTransactionAmount) {
        return {
          success: false,
          msg: "The selected wallet donn't have enough balance",
        };
      }
    }

    // Cập nhật ví cũ sau khi hoàn tác giao dịch cũ.
    await createOrUpdateWallet({
      id: oldTransaction.walletId,
      amount: revertedWalletAmount,
      [revertType]: revertedIncomeExpenseAmount,
    });

    // Lấy lại ví mới vì ví mới có thể trùng ví cũ và vừa được cập nhật.
    newWalletSnapshot = await getDoc(doc(firestore, "wallets", newWalletId));
    newWallet = newWalletSnapshot.data() as WalletType;

    // Áp dụng giao dịch mới lên ví mới.
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
    // Lấy giao dịch cần xóa để biết phải hoàn tác số dư ví như thế nào.
    const transactionRef = doc(firestore, "transactions", transactionId);
    const transactionSnapshot = await getDoc(transactionRef);

    if (!transactionSnapshot.exists()) {
      return { success: false, msg: "Transaction not found" };
    }

    const transactionData = transactionSnapshot.data() as TransactionType;

    const transactionType = transactionData?.type;
    const transactionAmount = transactionData?.amount;

    // Lấy ví liên kết để cập nhật amount, totalIncome hoặc totalExpenses.
    const walletSnapshot = await getDoc(doc(firestore, "wallets", walletId));
    const walletData = walletSnapshot.data() as WalletType;

    // Xác định trường cần giảm dựa trên loại giao dịch.
    const updateType =
      transactionType == "income" ? "totalIncome" : "totalExpenses";

    const newWalletAmount =
      walletData?.amount! -
      (transactionType == "income" ? transactionAmount : -transactionAmount);

    const newIncomeExpenseAmount = walletData[updateType]! - transactionAmount;

    // Không cho xóa giao dịch thu nếu việc xóa làm số dư ví âm.
    if (transactionType == "income" && newWalletAmount < 0) {
      return { success: false, msg: "You cannot delete this transaction" };
    }

    // Cập nhật ví trước, sau đó mới xóa document giao dịch.
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

export const fetchWeeklyStats = async (uid: string): Promise<ResponseType> => {
  try {
    const db = firestore;
    const today = new Date();
    const sevenDatesAgo = new Date(today);
    sevenDatesAgo.setDate(today.getDate() - 7);

    // Truy vấn giao dịch trong 7 ngày gần nhất để vẽ thống kê tuần.
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

    // Gom giao dịch theo ngày và cộng riêng thu nhập/chi tiêu.
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

export const fetchMonthlyStats = async (uid: string): Promise<ResponseType> => {
  try {
    const db = firestore;
    const today = new Date();
    const twelveMonthsAgo = new Date(
      today.getFullYear(),
      today.getMonth() - 11,
      1,
    );

    // Truy vấn giao dịch trong 12 tháng gần nhất để vẽ thống kê tháng.
    const transactionsQuery = query(
      collection(db, "transactions"),
      where("date", ">=", Timestamp.fromDate(twelveMonthsAgo)),
      where("date", "<=", Timestamp.fromDate(today)),
      orderBy("date", "desc"),
      where("uid", "==", uid),
    );

    const querySnapshot = await getDocs(transactionsQuery);

    const monthlyData: any[] = [];
    // Đưa tháng hiện tại lên đầu danh sách để biểu đồ hiển thị dữ liệu mới nhất trước.
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

    // Gom dữ liệu theo tháng và cộng riêng thu nhập/chi tiêu.
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

export const fetchYearlyStats = async (uid: string): Promise<ResponseType> => {
  try {
    const db = firestore;

    // Lấy toàn bộ giao dịch của người dùng để gom nhóm theo năm.
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

    // Gom giao dịch theo năm và cộng riêng thu nhập/chi tiêu.
    querySnapshot.forEach((doc) => {
      const transaction = doc.data() as TransactionType;
      transaction.id = doc.id;
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

    // Chuyển dữ liệu năm sang format cột thu/chi cho biểu đồ.
    const stats = yearlyData.flatMap((year: any) => [
      {
        value: year.income,
        label: year.year,
        spacing: scale(4),
        labelWidth: scale(35),
        frontColor: colors.primary,
      },
      {
        value: year.expense,
        frontColor: colors.rose,
      },
    ]);

    return {
      success: true,
      data: {
        stats,
        transactions,
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

// Trả về khoảng thời gian [đầu tháng, đầu tháng sau) để lọc giao dịch theo tháng.
const getMonthWindow = (year: number, month: number) => {
  return {
    start: new Date(year, month, 1),
    end: new Date(year, month + 1, 1),
  };
};

// Tính phần trăm thay đổi, xử lý riêng trường hợp kỳ trước bằng 0.
const percentChange = (current: number, previous: number) => {
  if (previous > 0) {
    return ((current - previous) / previous) * 100;
  }
  if (current > 0) return 100;
  return 0;
};

// Tính tổng hạn mức tháng của tất cả ví thuộc người dùng hiện tại.
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

    // Lấy dữ liệu từ đầu 3 tháng trước đến hết tháng hiện tại để có cơ sở so sánh.
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

    // Truy vấn giao dịch phục vụ màn hình AI Summary.
    const transactionsQuery = query(
      collection(firestore, "transactions"),
      where("uid", "==", uid),
      where("date", ">=", Timestamp.fromDate(lookBackStart)),
      where("date", "<", Timestamp.fromDate(nextMonthStart)),
      orderBy("date", "desc"),
    );

    const querySnapshot = await getDocs(transactionsQuery);

    // Các biến tổng hợp cho tháng hiện tại và tháng trước.
    let totalExpense = 0;
    let totalIncome = 0;
    let previousExpense = 0;
    let transactionCount = 0;
    let previousTransactionCount = 0;

    const currentExpenseByCategory: Record<string, number> = {};
    const previousExpenseByMonth: Record<string, number> = {};
    const previousCategoryByMonth: Record<string, Record<string, number>> = {};

    // Duyệt từng giao dịch để tính tổng thu, tổng chi, số lượng và chi theo danh mục.
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

    // Sắp xếp danh mục theo số tiền chi giảm dần để tìm danh mục chi nhiều nhất.
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

    // Tính trung bình chi tiêu 3 tháng trước của danh mục top hiện tại.
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

    // Lấy hạn mức tháng để tính phần trăm sử dụng ngân sách.
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

    // Payload gồm cả dữ liệu hiển thị và dữ liệu rút gọn gửi sang AI.
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

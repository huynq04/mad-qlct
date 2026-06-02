/**
 * (THỐNG KÊ) Tạo khung dữ liệu cho 7 ngày gần nhất (tương ứng `getLast7day` trong mô tả báo cáo).
 *
 * Mục đích:
 * - Trả về mảng 7 phần tử để “đổ” lên biểu đồ, mỗi phần tử đại diện 1 ngày.
 * - Mỗi ngày luôn có sẵn `income = 0`, `expense = 0` để sau đó cộng dồn giao dịch vào đúng ngày.
 *
 * Ý tưởng xử lý:
 * - Duyệt từ 6 ngày trước → hôm nay, tạo `{ day, date(yyyy-mm-dd), income, expense }`.
 * - Cuối hàm dùng `reverse()` để đảo thứ tự hiển thị theo nhu cầu UI (hiện tại: ngày mới hơn sẽ nằm trước).
 */
export const getLast7Days = () => {
  const daysOfWeek = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
  const result = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    result.push({
      day: daysOfWeek[date.getDay()],
      date: date.toISOString().split("T")[0], // Mon, Tue, Wed...
      income: 0,
      expense: 0,
    });
  }

  return result.reverse(); // returns an array of all the previous 7 days
};

/**
 * (THỐNG KÊ) Tạo khung dữ liệu cho 12 tháng gần nhất (tương ứng `getLast12Month` trong mô tả báo cáo).
 *
 * Mục đích:
 * - Dùng làm “bộ khung” để cộng dồn tổng thu/chi theo từng tháng.
 * - Tránh trường hợp tháng không có giao dịch thì không có cột trên biểu đồ.
 *
 * Output:
 * - Mỗi phần tử: `{ month: 'Tháng X YY', fullDate: yyyy-mm-dd, income, expense }`.
 * - `fullDate` chỉ dùng như một khóa/nhãn phụ; phần quan trọng là `month`, `income`, `expense`.
 */
export const getLast12Months = () => {
  const monthsOfYear = [
    "Tháng 1",
    "Tháng 2",
    "Tháng 3",
    "Tháng 4",
    "Tháng 5",
    "Tháng 6",
    "Tháng 7",
    "Tháng 8",
    "Tháng 9",
    "Tháng 10",
    "Tháng 11",
    "Tháng 12",
  ];

  const result = [];

  for (let i = 11; i >= 0; i--) {
    const date = new Date();
    date.setMonth(date.getMonth() - i);

    const monthName = monthsOfYear[date.getMonth()];
    const shortYear = date.getFullYear().toString().slice(-2);

    const formattedMonthYear = `${monthName} ${shortYear}`; // Jan 24, Feb 25
    const formattedDate = date.toISOString().split("T")[0];

    result.push({
      month: formattedMonthYear,
      fullDate: formattedDate,
      income: 0,
      expense: 0,
    });
  }

  return result.reverse();
};

/**
 * (THỐNG KÊ) Tạo khung dữ liệu cho khoảng năm từ `startYear` đến `endYear`
 * (tương ứng `getYearRange` trong mô tả báo cáo, trong code đặt tên là `getYearsRange`).
 *
 * Mục đích:
 * - Dùng cho biểu đồ theo năm: mỗi năm có tổng thu (`income`) và tổng chi (`expense`).
 *
 * Lưu ý:
 * - Hàm trả về mảng đã `reverse()` để năm mới hơn nằm trước (phù hợp UI biểu đồ).
 */
export const getYearsRange = (startYear: number, endYear: number): any => {
  const result = [];

  for (let year = startYear; year <= endYear; year++) {
    result.push({
      year: year.toString(),
      fullDate: `01-01-${year}`,
      income: 0,
      expense: 0,
    });
  }

  return result.reverse();
};

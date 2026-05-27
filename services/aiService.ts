import { GEMINI_API_KEY, GROQ_API_KEY } from "@/constants";
import {
  AISummaryHighlight,
  AISummaryResult,
  AISummarySuggestion,
  MonthlySummaryAIPayloadType,
  ResponseType,
  ScanResult,
} from "@/types";
import axios from "axios";
import { readAsStringAsync } from "expo-file-system/legacy";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_TEXT_MODEL = "llama-3.3-70b-versatile";
// const GROQ_VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;

// Prompt yêu cầu AI đọc hóa đơn và chỉ trả JSON để dễ parse tự động.
const SCAN_PROMPT = `Extract from this receipt: totalAmount (number), date (DD/MM/YYYY), description (items bought, Vietnamese, max 5), category (one of: Ăn uống|Di chuyển|Mua sắm|Y tế|Giải trí|Giáo dục|Hóa đơn|Khác). Reply ONLY valid JSON, no markdown.`;

// Prompt định nghĩa vai trò, schema JSON và các ràng buộc nội dung cho báo cáo tài chính.
const FINANCIAL_SUMMARY_PROMPT = `Bạn là chuyên gia tài chính cá nhân người Việt Nam.
Hãy phân tích dữ liệu chi tiêu tháng và trả về JSON hợp lệ (không markdown) theo đúng schema:
{
  "summary": "string (2-3 câu, tiếng Việt, ngắn gọn, có số liệu)",
  "highlights": [
    {"text": "string (ngắn)", "tone": "positive|warning|neutral"}
  ],
  "suggestions": [
    {"title": "string", "description": "string (1-2 câu)", "tone": "positive|warning|neutral"}
  ]
}
Yêu cầu:
- Ngôn ngữ: Chỉ dùng tiếng Việt, giọng văn tư vấn tài chính chuyên nghiệp.
- Tiền tệ: Khi nhắc đến số tiền trong phần summary hoặc description, hãy dùng đơn vị VNĐ (Ví dụ: 100.000 VNĐ, 2 triệu VNĐ).
- highlights: từ 2 đến 3 item.
- suggestions: từ 2 đến 3 item.
- Ưu tiên hành động cụ thể, dễ thực hiện.
	- Nếu hasPreviousExpenseData = false: KHÔNG được so sánh với tháng trước, không dùng cụm "so với tháng trước".
	- Không dùng ký tự markdown.`;

// Lấy nội dung text từ response dạng OpenAI-compatible của Groq.
const extractChatContent = (responseData: any): string => {
  const content = responseData?.choices?.[0]?.message?.content;

  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part?.text === "string") return part.text;
        return "";
      })
      .join("");
  }

  return "";
};

// Chuẩn hóa tone AI trả về để UI chỉ nhận 3 giá trị hợp lệ.
const normalizeTone = (tone: unknown): "positive" | "warning" | "neutral" => {
  if (tone === "positive" || tone === "warning" || tone === "neutral") {
    return tone;
  }
  return "neutral";
};

// Sửa một số lỗi JSON thường gặp khi AI trả thiếu dấu đóng hoặc dư dấu phẩy.
const repairIncompleteJson = (text: string) => {
  let cleaned = text
    .replace(/```json|```/g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();

  const startIndex = cleaned.indexOf("{");
  if (startIndex > 0) {
    cleaned = cleaned.slice(startIndex);
  }

  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (const char of cleaned) {
    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{" || char === "[") {
      stack.push(char);
      continue;
    }

    if (char === "}" || char === "]") {
      const last = stack[stack.length - 1];
      if ((last === "{" && char === "}") || (last === "[" && char === "]")) {
        stack.pop();
      }
    }
  }

  if (inString) {
    cleaned += '"';
  }

  while (stack.length) {
    const open = stack.pop();
    cleaned += open === "{" ? "}" : "]";
  }

  return cleaned;
};

// Parse JSON an toàn từ response AI, có thử làm sạch markdown và sửa JSON đơn giản.
const safeParseJSON = (text: string): any | null => {
  const cleanText = text.replace(/```json|```/g, "").trim();
  const parseCandidates: string[] = [];

  if (cleanText) {
    parseCandidates.push(cleanText);
  }

  const firstBrace = cleanText.indexOf("{");
  const lastBrace = cleanText.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    parseCandidates.push(cleanText.slice(firstBrace, lastBrace + 1));
  } else if (firstBrace !== -1) {
    parseCandidates.push(cleanText.slice(firstBrace));
  }

  for (const candidate of parseCandidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(repairIncompleteJson(candidate));
      } catch {
        // Continue trying other candidates.
      }
    }
  }

  return null;
};

// Kiểm tra AI có nhắc so sánh tháng trước trong khi dữ liệu không cho phép không.
const hasPreviousComparisonText = (text: string) => {
  return /tháng trước|so với tháng trước|so với tháng liền trước/i.test(text);
};

// Sinh gợi ý tài chính bằng rule nội bộ để dùng khi AI lỗi hoặc thiếu dữ liệu.
const buildRuleBasedSuggestions = (
  payload: MonthlySummaryAIPayloadType,
): AISummarySuggestion[] => {
  const suggestions: AISummarySuggestion[] = [];

  if (payload.topCategoryPercent >= 30) {
    suggestions.push({
      title: `Kiểm soát ${payload.topCategoryLabel}`,
      description: `Danh mục này đang chiếm ${payload.topCategoryPercent}% tổng chi tiêu. Bạn nên đặt trần theo tuần để giảm áp lực ngân sách cuối tháng.`,
      tone: "warning",
    });
  }

  if (payload.hasPreviousExpenseData && payload.expenseChangePercent >= 12) {
    suggestions.push({
      title: "Chi tiêu đang tăng nhanh",
      description: `Chi tiêu tăng ${payload.expenseChangePercent.toFixed(1)}% so với tháng trước. Hãy rà lại 2-3 khoản lớn và giảm ít nhất 10% trong 2 tuần tới.`,
      tone: "warning",
    });
  } else if (
    payload.hasPreviousExpenseData &&
    payload.expenseChangePercent <= -10
  ) {
    suggestions.push({
      title: "Chi tiêu đã cải thiện",
      description: `Bạn đã giảm ${Math.abs(payload.expenseChangePercent).toFixed(1)}% chi tiêu so với tháng trước. Hãy giữ nhịp này và chuyển phần tiết kiệm sang quỹ dự phòng.`,
      tone: "positive",
    });
  }

  if (payload.savingsRate < 10) {
    suggestions.push({
      title: "Tăng tỷ lệ tiết kiệm",
      description: `Tỷ lệ tiết kiệm hiện là ${payload.savingsRate.toFixed(1)}%. Mục tiêu ngắn hạn nên lên 15% bằng cách tự động chuyển tiền ngay khi có thu nhập.`,
      tone: "warning",
    });
  } else if (payload.savingsRate >= 25) {
    suggestions.push({
      title: "Tiết kiệm đang rất tốt",
      description: `Bạn đang tiết kiệm ${payload.savingsRate.toFixed(1)}% thu nhập. Có thể tách thêm một phần vào quỹ đầu tư dài hạn để tối ưu hiệu quả.`,
      tone: "positive",
    });
  } else {
    suggestions.push({
      title: "Duy trì kỷ luật tài chính",
      description: `Tỷ lệ tiết kiệm hiện ở mức ${payload.savingsRate.toFixed(1)}%. Tiếp tục theo dõi chi tiêu theo tuần để tránh vượt kế hoạch tháng.`,
      tone: "neutral",
    });
  }

  if (payload.transactionCountChangePercent >= 20) {
    suggestions.push({
      title: "Tần suất giao dịch tăng mạnh",
      description: `Số giao dịch tăng ${payload.transactionCountChangePercent.toFixed(1)}%. Gộp các khoản mua nhỏ theo danh sách trước khi chi sẽ giúp kiểm soát tốt hơn.`,
      tone: "neutral",
    });
  }

  if (!suggestions.length) {
    suggestions.push({
      title: "Theo dõi xu hướng mỗi tuần",
      description:
        "Kiểm tra biến động chi tiêu vào cuối tuần để điều chỉnh sớm thay vì đợi cuối tháng.",
      tone: "neutral",
    });
  }

  return suggestions.slice(0, 3);
};

export const buildFallbackFinancialSummary = (
  payload: MonthlySummaryAIPayloadType,
): AISummaryResult => {
  // Tạo báo cáo dự phòng để màn hình AI Summary luôn có dữ liệu hiển thị.
  const formatCurrencyLocal = (value: number) => {
    return `${Math.abs(value).toLocaleString("vi-VN")}đ`;
  };

  const trendWord = payload.hasPreviousExpenseData
    ? payload.expenseChangePercent > 0
      ? `tăng ${Math.abs(payload.expenseChangePercent).toFixed(1)}%`
      : payload.expenseChangePercent < 0
        ? `giảm ${Math.abs(payload.expenseChangePercent).toFixed(1)}%`
        : "ổn định"
    : null;

  const savingsTone = payload.savings >= 0 ? "positive" : "warning";

  return {
    summary: payload.hasPreviousExpenseData
      ? `Trong ${payload.monthLabel}, bạn đã chi tiêu tổng cộng ${formatCurrencyLocal(payload.totalExpense)} (${trendWord} so với tháng trước). Thu nhập đạt ${formatCurrencyLocal(payload.totalIncome)}, mức tiết kiệm hiện tại là ${formatCurrencyLocal(payload.savings)}. Danh mục ${payload.topCategoryLabel} chiếm tỷ trọng cao nhất (${payload.topCategoryPercent}%).`
      : `Trong ${payload.monthLabel}, bạn đã chi tiêu tổng cộng ${formatCurrencyLocal(payload.totalExpense)}. Thu nhập đạt ${formatCurrencyLocal(payload.totalIncome)}, mức tiết kiệm hiện tại là ${formatCurrencyLocal(payload.savings)}. Hiện chưa có dữ liệu chi tiêu tháng trước để so sánh xu hướng.`,
    highlights: [
      {
        text: payload.savings >= 0 ? "Tiết kiệm tốt" : "Tiết kiệm âm",
        tone: savingsTone,
      },
      {
        text: payload.hasPreviousExpenseData
          ? payload.expenseChangePercent > 10
            ? "Chi tiêu đang tăng"
            : payload.expenseChangePercent < -10
              ? "Chi tiêu đã giảm"
              : "Chi tiêu ổn định"
          : "Chưa đủ dữ liệu so sánh tháng trước",
        tone:
          payload.hasPreviousExpenseData && payload.expenseChangePercent > 10
            ? "warning"
            : "neutral",
      },
      {
        text: `${payload.categories.length} danh mục hoạt động`,
        tone: "neutral",
      },
    ],
    suggestions: buildRuleBasedSuggestions(payload),
  };
};

export const scanInvoiceWithAI = async (
  imageUri: string,
): Promise<ResponseType> => {
  try {
    // Đọc file ảnh và convert sang base64
    const base64Image = await readAsStringAsync(imageUri, {
      encoding: "base64",
    });
    // Xác định loại ảnh
    const mimeType = imageUri.toLowerCase().endsWith(".png")
      ? "image/png"
      : "image/jpeg";

    // Body gọi Gemini Vision: gửi ảnh base64 kèm prompt đọc hóa đơn.
    const requestBody = {
      contents: [
        {
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Image,
              },
            },
            {
              text: SCAN_PROMPT,
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 256,
        responseMimeType: "application/json",
      },
    };

    // API ngoài: Gemini generateContent dùng để trích xuất thông tin hóa đơn.
    const response = await axios.post(GEMINI_API_URL, requestBody, {
      headers: { "Content-Type": "application/json" },
      timeout: 30000,
    });

    const text =
      response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    console.log("Gemini raw response:", text);

    if (!text) {
      return { success: false, msg: "AI không trả về kết quả. Thử lại." };
    }

    let parsed: ScanResult;
    try {
      const cleanText = text.replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleanText);
    } catch {
      console.log("JSON parse failed, raw text:", text);
      return {
        success: false,
        msg: "Không đọc được kết quả từ AI. Vui lòng chụp ảnh rõ hơn.",
      };
    }

    // Validate dữ liệu trả về
    const result: ScanResult = {
      totalAmount:
        Number(String(parsed.totalAmount).replace(/[^0-9.]/g, "")) || 0,
      date: parsed.date || new Date().toLocaleDateString("vi-VN"),
      description: parsed.description || "",
      category: parsed.category || "Khác",
    };

    return { success: true, data: result };
  } catch (error: any) {
    const errMsg =
      error?.response?.data?.error?.message ||
      error?.response?.data ||
      error.message;
    console.log("AI scan error:", errMsg);

    if (error?.response?.status === 400) {
      return { success: false, msg: "Ảnh không hợp lệ hoặc quá lớn." };
    }
    if (error?.response?.status === 403) {
      return { success: false, msg: "API key không hợp lệ." };
    }
    if (error?.response?.status === 429) {
      return { success: false, msg: "Đã vượt giới hạn API. Thử lại sau." };
    }
    return {
      success: false,
      msg: `Lỗi: ${errMsg || "Không thể phân tích hóa đơn"}`,
    };
  }
};

export const generateFinancialSummaryWithAI = async (
  payload: MonthlySummaryAIPayloadType,
): Promise<ResponseType> => {
  // Chuẩn bị fallback trước để bất kỳ lỗi AI nào cũng không làm trống giao diện.
  const fallback = buildFallbackFinancialSummary(payload);
  const fallbackHighlights = fallback.highlights;
  const fallbackSuggestions = fallback.suggestions;

  try {
    // Gemini format (legacy):
    // const requestBody = {
    //   contents: [
    //     {
    //       parts: [
    //         {
    //           text: `${FINANCIAL_SUMMARY_PROMPT}\n\nDữ liệu đầu vào:\n${JSON.stringify(payload)}`,
    //         },
    //       ],
    //     },
    //   ],
    //   generationConfig: {
    //     temperature: 0.35,
    //     maxOutputTokens: 700,
    //     responseMimeType: "application/json",
    //   },
    // };

    // Body gọi Groq Chat Completions, ép model trả về JSON object đúng schema.
    const requestBody = {
      model: GROQ_TEXT_MODEL,
      messages: [
        {
          role: "system",
          content: FINANCIAL_SUMMARY_PROMPT,
        },
        {
          role: "user",
          content: `Dữ liệu đầu vào:\n${JSON.stringify(payload)}`,
        },
      ],
      temperature: 0.35,
      max_tokens: 700,
      response_format: {
        type: "json_object",
      },
    };

    // API ngoài: Groq dùng để sinh nhận xét, điểm nổi bật và gợi ý cải thiện.
    const response = await axios.post(GROQ_API_URL, requestBody, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      timeout: 30000,
    });

    // Gemini call (legacy):
    // const response = await axios.post(GEMINI_API_URL, requestBody, {
    //   headers: { "Content-Type": "application/json" },
    //   timeout: 30000,
    // });

    const text = extractChatContent(response.data);
    // const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    if (!text) {
      return { success: true, data: fallback };
    }

    const parsed = safeParseJSON(text);

    if (!parsed || typeof parsed !== "object") {
      return { success: true, data: fallback };
    }

    const summary =
      typeof parsed?.summary === "string" && parsed.summary.trim().length > 0
        ? parsed.summary.trim()
        : fallback.summary;

    // Nếu không có dữ liệu tháng trước, loại bỏ nội dung AI tự ý so sánh tháng trước.
    const safeSummary =
      !payload.hasPreviousExpenseData && hasPreviousComparisonText(summary)
        ? fallback.summary
        : summary;

    // Chuẩn hóa highlights để tránh thiếu text/tone làm lỗi UI.
    const highlights: AISummaryHighlight[] = Array.isArray(parsed?.highlights)
      ? parsed.highlights.slice(0, 3).map((item: any) => ({
          text:
            typeof item?.text === "string" && item.text.trim().length > 0
              ? item.text.trim()
              : "Cập nhật tài chính",
          tone: normalizeTone(item?.tone),
        }))
      : fallback.highlights;

    const safeHighlights = !payload.hasPreviousExpenseData
      ? highlights.map((item, index) => {
          const fallbackItem =
            fallbackHighlights[Math.min(fallbackHighlights.length - 1, index)];

          if (hasPreviousComparisonText(item.text)) {
            return fallbackItem || item;
          }

          return item;
        })
      : highlights;

    // Chuẩn hóa suggestions, thiếu trường nào thì lấy từ fallback tương ứng.
    const suggestions: AISummarySuggestion[] = Array.isArray(
      parsed?.suggestions,
    )
      ? parsed.suggestions.slice(0, 3).map((item: any, index: number) => {
          const fallbackItem =
            fallbackSuggestions[
              Math.min(fallbackSuggestions.length - 1, index)
            ];

          const title =
            typeof item?.title === "string" && item.title.trim().length > 0
              ? item.title.trim()
              : fallbackItem?.title || "Gợi ý tối ưu chi tiêu";

          const description =
            typeof item?.description === "string" &&
            item.description.trim().length > 0
              ? item.description.trim()
              : fallbackItem?.description ||
                "Theo dõi chi tiêu hàng tuần để tối ưu ngân sách.";

          return {
            title,
            description,
            tone: normalizeTone(item?.tone) || fallbackItem?.tone || "neutral",
          };
        })
      : fallback.suggestions;

    const safeSuggestions = !payload.hasPreviousExpenseData
      ? suggestions.map((item: AISummarySuggestion, index: number) => {
          const fallbackItem =
            fallbackSuggestions[
              Math.min(fallbackSuggestions.length - 1, index)
            ];

          if (
            hasPreviousComparisonText(item.title) ||
            hasPreviousComparisonText(item.description)
          ) {
            return fallbackItem || item;
          }

          return item;
        })
      : suggestions;

    // Kết quả cuối cùng đã được kiểm tra và luôn có đủ summary/highlights/suggestions.
    const result: AISummaryResult = {
      summary: safeSummary,
      highlights: safeHighlights.length ? safeHighlights : fallback.highlights,
      suggestions: safeSuggestions.length
        ? safeSuggestions
        : fallback.suggestions,
    };

    return { success: true, data: result };
  } catch (error: any) {
    const errMsg =
      error?.response?.data?.error?.message ||
      error?.response?.data ||
      error.message;
    console.log("AI financial summary error:", errMsg);

    if (error?.response?.status === 403) {
      return { success: true, data: fallback };
    }
    if (error?.response?.status === 429) {
      return { success: true, data: fallback };
    }

    return { success: true, data: fallback };
  }
};

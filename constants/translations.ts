export const DEFAULT_LANGUAGE = "vi";

// Danh sách ngôn ngữ dùng cho màn cài đặt khi cần mở rộng lựa chọn.
export const LANGUAGE_OPTIONS = [
  { label: "Tiếng Việt", value: "vi" },
  { label: "English", value: "en" },
] as const;

// Resource dịch tập trung, giúp UI không phải hard-code text ở từng màn.
const translations = {
  vi: {
    translation: {
      common: {
        ok: "OK",
        cancel: "Hủy",
        error: "Lỗi",
        success: "Thành công",
        failure: "Thất bại",
        update: "Cập nhật",
        or: "hoặc",
      },
      auth: {
        login: {
          titleLine1: "Xin chào,",
          titleLine2: "Mừng bạn trở lại",
          alertTitle: "Đăng nhập",
          subtitle: "Đăng nhập để theo dõi chi phí của bạn",
          emailPlaceholder: "Nhập email của bạn",
          passwordPlaceholder: "Nhập mật khẩu của bạn",
          forgotPassword: "Quên mật khẩu",
          submit: "Đăng nhập",
          google: "Tiếp tục với Google",
          facebook: "Tiếp tục với Facebook",
          noAccount: "Chưa có tài khoản?",
          fillAllFields: "Vui lòng điền đầy đủ thông tin",
          wrongCredentials: "Thông tin đăng nhập không đúng",
          invalidEmail: "Email không hợp lệ",
        },
        register: {
          titleLine1: "Sẵn sàng",
          titleLine2: "Bắt đầu nào",
          alertTitle: "Đăng kí",
          subtitle: "Tạo tài khoản để theo dõi chi phí của bạn",
          namePlaceholder: "Nhập tên của bạn",
          emailPlaceholder: "Nhập email của bạn",
          passwordPlaceholder: "Nhập mật khẩu của bạn",
          submit: "Đăng kí",
          google: "Tiếp tục với Google",
          facebook: "Tiếp tục với Facebook",
          hasAccount: "Đã có tài khoản?",
          fillAllFields:
            "Vui lòng điền đầy đủ thông tin vào tất cả các ô",
          emailInUse: "Email này đã được sử dụng",
          invalidEmail: "Email không hợp lệ",
        },
        forgotPassword: {
          titleLine1: "Quên",
          titleLine2: "mật khẩu",
          alertTitle: "Quên mật khẩu",
          subtitle:
            "Nhập email bạn đã đăng ký để nhận liên kết đặt lại mật khẩu.",
          emailPlaceholder: "Nhập email của bạn",
          submit: "Gửi liên kết",
          missingEmail: "Vui lòng nhập email của bạn",
          sent:
            "Đã gửi link khôi phục! Vui lòng kiểm tra hộp thư.",
          userNotFound: "Không tìm thấy tài khoản với email này",
          invalidEmail: "Email không hợp lệ",
        },
        changePassword: {
          title: "Đổi mật khẩu",
          subtitle:
            "Mật khẩu mới của bạn phải có ít nhất 6 ký tự để đảm bảo an toàn.",
          newPasswordPlaceholder: "Nhập mật khẩu mới",
          confirmPasswordPlaceholder: "Xác nhận mật khẩu mới",
          submit: "Cập nhật",
          missingFields: "Vui lòng điền đầy đủ 2 ô mật khẩu!",
          minLength: "Mật khẩu phải có ít nhất 6 ký tự!",
          mismatch: "Hai mật khẩu không khớp nhau!",
          success:
            "Đổi mật khẩu thành công! Vui lòng đăng nhập lại với mật khẩu mới.",
          recentLoginRequired:
            "Vì lý do bảo mật, vui lòng đăng xuất và đăng nhập lại trước khi đổi mật khẩu.",
          missingSession: "Lỗi: Không tìm thấy phiên đăng nhập.",
        },
        google: {
          missingIdToken: "Không lấy được ID Token từ Google",
          cancelled: "Đăng nhập bị hủy",
        },
      },
      profile: {
        title: "Hồ sơ",
        editInfo: "Chỉnh sửa thông tin",
        settings: "Cài đặt",
        privacyPolicy: "Chính sách bảo mật",
        logout: "Đăng xuất",
        logoutConfirmTitle: "Xác nhận đăng xuất?",
        logoutConfirmMessage: "Bạn có chắc muốn đăng xuất?",
        updateTitle: "Cập nhật thông tin",
        displayName: "Tên hiển thị",
        namePlaceholder: "Nhập tên của bạn",
        missingName: "Vui lòng nhập tên của bạn",
      },
      settings: {
        title: "Cài đặt",
        darkMode: "Chế độ tối",
        notifications: "Thông báo",
        expenseLimitWarning: "Cảnh báo giới hạn chi tiêu",
        changePassword: "Đổi mật khẩu",
        language: "Ngôn ngữ",
      },
      welcome: {
        login: "Đăng nhập",
        register: "Đăng kí",
        headlineLine1: "Luôn kiểm soát",
        headlineLine2: "tài chính của bạn",
        subtitleLine1:
          "Luôn sắp xếp tài chính để xây dựng một cuộc",
        subtitleLine2: "sống tốt đẹp hơn trong tương lai",
        cta: "Bắt đầu nào",
      },
    },
  },
  en: {
    translation: {
      common: {
        ok: "OK",
        cancel: "Cancel",
        error: "Error",
        success: "Success",
        failure: "Failure",
        update: "Update",
        or: "or",
      },
      auth: {
        login: {
          titleLine1: "Hello,",
          titleLine2: "Welcome back",
          alertTitle: "Login",
          subtitle: "Log in to track your expenses",
          emailPlaceholder: "Enter your email",
          passwordPlaceholder: "Enter your password",
          forgotPassword: "Forgot password",
          submit: "Login",
          google: "Continue with Google",
          facebook: "Continue with Facebook",
          noAccount: "Don't have an account?",
          fillAllFields: "Please fill all the fields",
          wrongCredentials: "Wrong credentials",
          invalidEmail: "Invalid email",
        },
        register: {
          titleLine1: "Ready",
          titleLine2: "Let's start",
          alertTitle: "Register",
          subtitle: "Create an account to track your expenses",
          namePlaceholder: "Enter your name",
          emailPlaceholder: "Enter your email",
          passwordPlaceholder: "Enter your password",
          submit: "Register",
          google: "Continue with Google",
          facebook: "Continue with Facebook",
          hasAccount: "Already have an account?",
          fillAllFields: "Please fill all the fields",
          emailInUse: "This email is already in use",
          invalidEmail: "Invalid email",
        },
        forgotPassword: {
          titleLine1: "Reset",
          titleLine2: "Password",
          alertTitle: "Forgot password",
          subtitle:
            "Enter your registered email to receive a password reset link.",
          emailPlaceholder: "Enter your email",
          submit: "Send link",
          missingEmail: "Please enter your email",
          sent: "Password reset link sent. Please check your inbox.",
          userNotFound: "No account found with this email",
          invalidEmail: "Invalid email",
        },
        changePassword: {
          title: "Change password",
          subtitle:
            "Your new password must have at least 6 characters to stay secure.",
          newPasswordPlaceholder: "Enter new password",
          confirmPasswordPlaceholder: "Confirm new password",
          submit: "Update",
          missingFields: "Please fill both password fields!",
          minLength: "Password must have at least 6 characters!",
          mismatch: "Passwords do not match!",
          success:
            "Password changed successfully. Please log in again with your new password.",
          recentLoginRequired:
            "For security reasons, please log out and log in again before changing your password.",
          missingSession: "Error: No active login session found.",
        },
        google: {
          missingIdToken: "Could not get Google ID Token",
          cancelled: "Login was cancelled",
        },
      },
      profile: {
        title: "Profile",
        editInfo: "Edit profile",
        settings: "Settings",
        privacyPolicy: "Privacy policy",
        logout: "Logout",
        logoutConfirmTitle: "Confirm logout?",
        logoutConfirmMessage: "Are you sure you want to log out?",
        updateTitle: "Update profile",
        displayName: "Display name",
        namePlaceholder: "Enter your name",
        missingName: "Please enter your name",
      },
      settings: {
        title: "Settings",
        darkMode: "Dark mode",
        notifications: "Notifications",
        expenseLimitWarning: "Expense limit warning",
        changePassword: "Change password",
        language: "Language",
      },
      welcome: {
        login: "Login",
        register: "Register",
        headlineLine1: "Always control",
        headlineLine2: "your finances",
        subtitleLine1: "Keep your finances organized to build",
        subtitleLine2: "a better life in the future",
        cta: "Get started",
      },
    },
  },
} as const;

export type AppLanguage = keyof typeof translations;

export default translations;

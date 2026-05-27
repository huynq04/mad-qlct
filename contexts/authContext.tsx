import { auth, firestore } from "@/config/firebase";
import { AuthContextType, UserType } from "@/types";
import { GoogleSignin } from "@react-native-google-signin/google-signin";
import { useRouter } from "expo-router";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const USERS_COLLECTION = "users";
const GOOGLE_WEB_CLIENT_ID =
  "478282792207-m3fumu4e8rtq0l3fuhti3mvk428cs0g4.apps.googleusercontent.com";

// Tạo reference tới document hồ sơ người dùng trong collection users.
const getUserDocRef = (uid: string) => doc(firestore, USERS_COLLECTION, uid);

// Chuyển mã lỗi Firebase sang thông báo dễ hiểu để hiển thị trên UI.
const getFirebaseErrorMessage = (
  error: any,
  messagesByCode: Record<string, string>,
) => {
  const fallbackMessage = error?.message || "Đã có lỗi xảy ra";
  const matchedCode = Object.keys(messagesByCode).find((code) =>
    fallbackMessage.includes(code),
  );

  return matchedCode ? messagesByCode[matchedCode] : fallbackMessage;
};

export const AuthContext = createContext<AuthContextType | null>(null);

// Provider tập trung toàn bộ trạng thái và hành động xác thực của ứng dụng.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserType>(null);
  const router = useRouter();

  // Tải hồ sơ mở rộng từ Firestore sau khi Firebase Auth xác nhận user.
  const updateUserData = useCallback(async (uid: string) => {
    try {
      const docSnap = await getDoc(getUserDocRef(uid));

      if (docSnap.exists()) {
        const data = docSnap.data();
        const userData: UserType = {
          uid: data?.uid,
          email: data.email || null,
          name: data.name || null,
          image: data.image || null,
        };
        setUser({ ...userData });
      }
    } catch (error: any) {
      console.log("error loading user data: ", error);
    }
  }, []);

  useEffect(() => {
    // Google Sign-In cần webClientId để đổi Google ID token sang Firebase credential.
    GoogleSignin.configure({
      webClientId: GOOGLE_WEB_CLIENT_ID,
      offlineAccess: true,
    });
  }, []);

  useEffect(() => {
    // Firebase Auth listener quyết định route đầu tiên dựa trên phiên đăng nhập đã lưu.
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        void updateUserData(firebaseUser.uid);
        router.replace("/(tabs)");
        return;
      }

      setUser(null);
      router.replace("/(auth)/welcome");
    });

    return () => unsub();
  }, [router, updateUserData]);

  // Đăng nhập bằng email/mật khẩu thông qua Firebase Authentication.
  const login = useCallback(async (email: string, password: string) => {
    try {
      // Firebase Auth API xác thực email/mật khẩu và tự cập nhật auth state.
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error: any) {
      return {
        success: false,
        msg: getFirebaseErrorMessage(error, {
          "(auth/invalid-credential)": "Thông tin đăng nhập không đúng",
          "(auth/invalid-email)": "Email không hợp lệ",
        }),
      };
    }
  }, []);

  // Đăng nhập bằng Google, sau đó đồng bộ hồ sơ người dùng sang Firestore.
  const loginWithGoogle = useCallback(async () => {
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();

      if (response.type !== "success") {
        return { success: false, msg: "Đăng nhập bị hủy" };
      }

      const idToken = response.data.idToken;
      if (!idToken) throw new Error("Không lấy được ID Token từ Google");

      // Firebase Auth API nhận credential từ Google để đăng nhập cùng một hệ thống user.
      const credential = GoogleAuthProvider.credential(idToken);
      const res = await signInWithCredential(auth, credential);

      const userRef = getUserDocRef(res.user.uid);
      const userSnap = await getDoc(userRef);

      // Firestore lưu hồ sơ mở rộng vì Firebase Auth chỉ giữ thông tin định danh cơ bản.
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          name: res.user.displayName,
          email: res.user.email,
          uid: res.user.uid,
          image: res.user.photoURL,
          createdAt: new Date(),
        });
      }

      return { success: true };
    } catch (error: any) {
      console.log("Google Sign-in Error: ", error);
      return { success: false, msg: error.message };
    }
  }, []);

  // Đăng xuất khỏi Firebase và xóa phiên Google Sign-In nếu người dùng dùng Google.
  const logout = useCallback(async () => {
    try {
      await signOut(auth);

      try {
        await GoogleSignin.signOut();
      } catch (googleError: any) {
        console.log("Google sign-out skipped: ", googleError);
      }
    } catch (error: any) {
      console.log("Logout Error: ", error);
    }
  }, []);

  // Tạo tài khoản mới và lưu hồ sơ ban đầu vào collection users.
  const register = useCallback(
    async (email: string, password: string, name: string) => {
      try {
        // Firebase Auth API tạo user; Firestore lưu profile riêng cho app.
        const response = await createUserWithEmailAndPassword(
          auth,
          email,
          password,
        );

        await setDoc(getUserDocRef(response.user.uid), {
          name,
          email,
          uid: response.user.uid,
          createdAt: new Date(),
        });

        return { success: true };
      } catch (error: any) {
        return {
          success: false,
          msg: getFirebaseErrorMessage(error, {
            "(auth/email-already-in-use)": "Email này đã được sử dụng",
            "(auth/invalid-email)": "Email không hợp lệ",
          }),
        };
      }
    },
    [],
  );

  // Gửi email đặt lại mật khẩu tới địa chỉ đã đăng ký.
  const resetPassword = useCallback(async (email: string) => {
    try {
      // Firebase Auth API gửi email đặt lại mật khẩu theo template trong Firebase Console.
      await sendPasswordResetEmail(auth, email);
      return {
        success: true,
        msg: "Đã gửi link khôi phục! Vui lòng kiểm tra hộp thư.",
      };
    } catch (error: any) {
      return {
        success: false,
        msg: getFirebaseErrorMessage(error, {
          "(auth/user-not-found)":
            "Không tìm thấy tài khoản với email này",
          "(auth/invalid-email)": "Email không hợp lệ",
        }),
      };
    }
  }, []);

  // Đổi mật khẩu cho user hiện tại; Firebase có thể yêu cầu đăng nhập lại.
  const changePassword = useCallback(async (newPassword: string) => {
    try {
      if (!auth.currentUser) {
        return {
          success: false,
          msg: "Lỗi: Không tìm thấy phiên đăng nhập.",
        };
      }

      // Firebase Auth API yêu cầu phiên đăng nhập gần đây cho thao tác nhạy cảm.
      await updatePassword(auth.currentUser, newPassword);
      return {
        success: true,
        msg: "Đổi mật khẩu thành công! Tuyệt vời!",
      };
    } catch (error: any) {
      return {
        success: false,
        msg: getFirebaseErrorMessage(error, {
          "(auth/requires-recent-login)":
            "Vì lý do bảo mật, vui lòng đăng xuất và đăng nhập lại trước khi đổi mật khẩu.",
        }),
      };
    }
  }, []);

  const contextValue: AuthContextType = useMemo(
    () => ({
      user,
      setUser,
      login,
      register,
      loginWithGoogle,
      logout,
      updateUserData,
      resetPassword,
      changePassword,
    }),
    [
      user,
      login,
      register,
      loginWithGoogle,
      logout,
      updateUserData,
      resetPassword,
      changePassword,
    ],
  );

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

// Hook tiện ích để các màn hình truy cập AuthContext an toàn.
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be wrapped inside AuthProvider");
  }
  return context;
};

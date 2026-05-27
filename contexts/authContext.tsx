import { auth, firestore } from "@/config/firebase";
import { AuthContextType, UserType } from "@/types";
import { useRouter } from "expo-router";
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    sendPasswordResetEmail,
    signInWithEmailAndPassword,
    // GoogleAuthProvider,
    // signInWithCredential,
    signOut,
    updatePassword,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import React, { createContext, useContext, useEffect, useState } from "react";

// import { GoogleSignin } from "@react-native-google-signin/google-signin";

export const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<UserType>(null);
  const router = useRouter();

  // Google Sign-In is temporarily disabled because the RNGoogleSignin native module
  // is not available in the current build.
  // useEffect(() => {
  //   GoogleSignin.configure({
  //     webClientId: "478282792207-m3fumu4e8rtq0l3fuhti3mvk428cs0g4.apps.googleusercontent.com",
  //     offlineAccess: true,
  //   });
  // }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      console.log("firebase user: ", firebaseUser);
      if (firebaseUser) {
        updateUserData(firebaseUser.uid);
        router.replace("/(tabs)");
      } else {
        setUser(null);
        router.replace("/(auth)/welcome");
      }
    });

    return () => unsub();
  }, []);

  const login = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { success: true };
    } catch (error: any) {
      let msg = error.message;
      if (msg.includes("(auth/invalid-credential)")) msg = "Wrong credentials";
      if (msg.includes("(auth/invalid-email)")) msg = "Invalid email";
      return { success: false, msg };
    }
  };

  const loginWithGoogle = async () => {
    // try {
    //   await GoogleSignin.hasPlayServices();
    //   const response = await GoogleSignin.signIn();

    //   if (response.type === "success") {
    //     const idToken = response.data.idToken;
    //     if (!idToken) throw new Error("Khong lay duoc ID Token tu Google");

    //     const credential = GoogleAuthProvider.credential(idToken);
    //     const res = await signInWithCredential(auth, credential);

    //     const userRef = doc(firestore, "users", res.user.uid);
    //     const userSnap = await getDoc(userRef);

    //     if (!userSnap.exists()) {
    //       await setDoc(userRef, {
    //         name: res.user.displayName,
    //         email: res.user.email,
    //         uid: res.user.uid,
    //         image: res.user.photoURL,
    //         createdAt: new Date(),
    //       });
    //     }

    //     return { success: true, user: res.user };
    //   } else {
    //     return { success: false, msg: "Dang nhap bi huy" };
    //   }
    // } catch (error: any) {
    //   console.log("Google Sign-in Error: ", error);
    //   return { success: false, msg: error.message };
    // }
    return {
      success: false,
      msg: "Đăng nhập bằng Google đang tạm thời tắt.",
    };
  };

  const logout = async () => {
    try {
      await signOut(auth);

      // await GoogleSignin.signOut();

      console.log("Logged out successfully");
    } catch (error: any) {
      console.log("Logout Error: ", error);
    }
  };

  const register = async (email: string, password: string, name: string) => {
    try {
      let response = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );

      await setDoc(doc(firestore, "users", response?.user?.uid), {
        name,
        email,
        uid: response?.user?.uid,
        createdAt: new Date(),
      });

      return { success: true };
    } catch (error: any) {
      let msg = error.message;
      if (msg.includes("(auth/email-already-in-use)"))
        msg = "This email is already in use";
      if (msg.includes("(auth/invalid-email)")) msg = "Invalid email";
      return { success: false, msg };
    }
  };

  const updateUserData = async (uid: string) => {
    try {
      const docRef = doc(firestore, "users", uid);
      const docSnap = await getDoc(docRef);

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
      console.log("error: ", error);
    }
  };
  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return {
        success: true,
        msg: "Đã gửi link khôi phục! Vui lòng kiểm tra hộp thư.",
      };
    } catch (error: any) {
      let msg = error.message;
      if (msg.includes("(auth/user-not-found)"))
        msg = "Không tìm thấy tài khoản với email này";
      if (msg.includes("(auth/invalid-email)")) msg = "Email không hợp lệ";
      return { success: false, msg };
    }
  };
  const changePassword = async (newPassword: string) => {
    try {
      if (auth.currentUser) {
        await updatePassword(auth.currentUser, newPassword);
        return { success: true, msg: "Đổi mật khẩu thành công! Tuyệt vời!" };
      }
      return { success: false, msg: "Lỗi: Không tìm thấy phiên đăng nhập." };
    } catch (error: any) {
      let msg = error.message;

      if (msg.includes("(auth/requires-recent-login)")) {
        msg =
          "Vì lý do bảo mật, vui lòng đăng xuất và đăng nhập lại trước khi đổi mật khẩu.";
      }
      return { success: false, msg };
    }
  };
  const contextValue: AuthContextType = {
    user,
    setUser,
    login,
    register,
    loginWithGoogle,
    logout,
    updateUserData,
    resetPassword,
    changePassword,
  };

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be wrapped inside AuthProvider");
  }
  return context;
};

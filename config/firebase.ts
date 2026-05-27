import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
// @ts-ignore Firebase Auth RN persistence helper is available at runtime.
import { getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyA7rDaDwQQaIby7LSSqYVcGYM1BwAx-TJo",
  authDomain: "expense-tracker-c13f0.firebaseapp.com",
  projectId: "expense-tracker-c13f0",
  storageBucket: "expense-tracker-c13f0.firebasestorage.app",
  messagingSenderId: "478282792207",
  appId: "1:478282792207:web:0f0dc3be7ac7da2402927a",
};

// Khởi tạo Firebase App một lần để các service dùng chung cùng project.
const app = initializeApp(firebaseConfig);

// Firebase Auth dùng AsyncStorage để giữ phiên đăng nhập sau khi đóng app.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// Cloud Firestore lưu hồ sơ người dùng và dữ liệu nghiệp vụ của ứng dụng.
export const firestore = getFirestore(app);

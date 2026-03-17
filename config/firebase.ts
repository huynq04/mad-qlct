// Import the functions you need from the SDKs you need
import AsyncStorage from "@react-native-async-storage/async-storage";
import { initializeApp } from "firebase/app";
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

// Initialize Firebase

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// auth
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});

// db
export const firestore = getFirestore(app);

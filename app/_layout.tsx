import { AuthProvider } from "@/contexts/authContext";
import { ThemeProvider } from "@/contexts/themeContext";
// Import side effect để i18n sẵn sàng trước khi các màn hình được render.
import "@/config/i18n";
import { Stack } from "expo-router";
import React from "react";

const StackLayout = () => {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(modals)/profileModal" options={{ presentation: "modal" }} />
      <Stack.Screen name="(modals)/walletModal" options={{ presentation: "modal" }} />
      <Stack.Screen name="(modals)/settingsModal" options={{ presentation: "modal" }} />
      <Stack.Screen name="(modals)/scanInvoiceModal" options={{ presentation: "modal" }} />
      <Stack.Screen name="(modals)/searchModal" options={{ presentation: "modal" }} />
      {/* Thêm cho chắc chắn */}
      <Stack.Screen name="(modals)/notificationModal" options={{ presentation: "modal" }} />
    </Stack>
  );
};

export default function RootLayout() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <StackLayout />
      </ThemeProvider>
    </AuthProvider>
  );
}

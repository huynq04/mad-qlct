import { spacingY } from "@/constants/theme";
import { useTheme } from "@/contexts/themeContext";
import { ModalWrapperProps } from "@/types";
import React from "react";
import { Platform, StatusBar, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const isIos = Platform.OS == "ios";

const ModalWrapper = ({ style, children, bg }: ModalWrapperProps) => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const fallbackBg = bg || colors.background;
  const topPadding = isIos
    ? insets.top + spacingY._7
    : (StatusBar.currentHeight || 0) + 10;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: fallbackBg, paddingTop: topPadding },
        style && style,
      ]}
    >
      {children}
    </View>
  );
};

export default ModalWrapper;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingBottom: isIos ? spacingY._20 : spacingY._10,
  },
});

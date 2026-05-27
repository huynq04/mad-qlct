import BackButton from "@/components/BackButton";
import Header from "@/components/Header";
import ModalWrapper from "@/components/ModalWrapper";
import Typo from "@/components/Typo";
import { spacingX, spacingY } from "@/constants/theme";
import { useTheme } from "@/contexts/themeContext";
import { scale, verticalScale } from "@/utils/styling";
import * as Icons from "phosphor-react-native";
import React, { useState } from "react";
import { StyleSheet, Switch, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

const SettingsModal = () => {
    const { isDarkMode, toggleTheme, colors } = useTheme();
    const router = useRouter();

    const [isNotificationsEnabled, setIsNotificationsEnabled] = useState(true);

    return (
        <ModalWrapper>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Header
                    title="Cài đặt"
                    leftIcon={<BackButton />}
                    style={{ marginBottom: spacingY._20 }}
                />

                <View style={styles.section}>
                    {/* 1. Chế độ tối */}
                    <View style={[styles.row, { borderBottomColor: colors.border }]}>
                        <View style={styles.rowLeft}>
                            <Icons.Moon size={verticalScale(24)} color={colors.text} />
                            <Typo color={colors.text} style={{ marginLeft: scale(10) }}>
                                Chế độ tối
                            </Typo>
                        </View>
                        <Switch
                            value={isDarkMode}
                            onValueChange={toggleTheme}
                            trackColor={{ false: colors.neutral400, true: colors.primary }}
                            thumbColor={colors.white}
                        />
                    </View>

                    {/* 2. Thông báo */}
                    <View style={[styles.row, { borderBottomColor: colors.border }]}>
                        <View style={styles.rowLeft}>
                            <Icons.Bell size={verticalScale(24)} color={colors.text} />
                            <Typo color={colors.text} style={{ marginLeft: scale(10) }}>
                                Thông báo
                            </Typo>
                        </View>
                        <Switch
                            value={isNotificationsEnabled}
                            onValueChange={setIsNotificationsEnabled}
                            trackColor={{ false: colors.neutral400, true: colors.primary }}
                            thumbColor={colors.white}
                        />
                    </View>

                    {/* 3. Cảnh báo giới hạn chi tiêu  */}
                    <TouchableOpacity
                        style={[styles.row, { borderBottomColor: colors.border }]}
                        onPress={() => router.push("/(modals)/expenseLimitWarningModal")}
                        activeOpacity={0.8}
                    >
                        <View style={styles.rowLeft}>
                            <Icons.WarningCircle size={verticalScale(24)} color={colors.text} />
                            <Typo color={colors.text} style={{ marginLeft: scale(10) }}>
                                Cảnh báo giới hạn chi tiêu
                            </Typo>
                        </View>
                        <View style={styles.rowRight}>
                            <Icons.CaretRight size={verticalScale(20)} color={colors.textLight} />
                        </View>
                    </TouchableOpacity>

                    {/* 4. Đổi mật khẩu */}
                    <TouchableOpacity
                        style={[styles.row, { borderBottomColor: colors.border }]}
                        onPress={() => router.push("/(auth)/changePasswordModal")}
                        activeOpacity={0.8}
                    >
                        <View style={styles.rowLeft}>
                            <Icons.LockKey size={verticalScale(24)} color={colors.text} />
                            <Typo color={colors.text} style={{ marginLeft: scale(10) }}>
                                Đổi mật khẩu
                            </Typo>
                        </View>
                        <View style={styles.rowRight}>
                            <Typo color={colors.primary} fontWeight={"600"} style={{ marginRight: scale(5) }}>
                                Cập nhật
                            </Typo>
                            <Icons.CaretRight size={verticalScale(20)} color={colors.textLight} />
                        </View>
                    </TouchableOpacity>
                </View>
            </View>
        </ModalWrapper>
    );
};

export default SettingsModal;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        paddingHorizontal: spacingX._20,
    },
    section: {
        gap: spacingY._10,
        marginTop: spacingY._10,
    },
    row: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: spacingY._15,
        borderBottomWidth: 1,
    },
    rowLeft: {
        flexDirection: "row",
        alignItems: "center",
    },
    rowRight: {
        flexDirection: "row",
        alignItems: "center",
    },
});
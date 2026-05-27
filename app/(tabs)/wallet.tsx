import Loading from '@/components/Loading';
import NotificationBell from '@/components/NotificationBell';
import ScreenWrapper from '@/components/ScreenWrapper';
import Typo from '@/components/Typo';
import WalletListItem from '@/components/WalletListItem';
import { radius, spacingX, spacingY } from '@/constants/theme'; // Bỏ import colors tĩnh
import { useAuth } from '@/contexts/authContext';
import { useTheme } from '@/contexts/themeContext'; // Gọi hook theme
import useFetchData from '@/hooks/useFetchData';
import { WalletType } from '@/types';
import { verticalScale } from '@/utils/styling';
import { useRouter } from "expo-router";
import { orderBy, where } from 'firebase/firestore';
import * as Icons from 'phosphor-react-native';
import React from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';


const Wallet = () => {

    const router = useRouter();
    const { user } = useAuth();
    const { colors } = useTheme();

    const { data: wallets, error, loading } = useFetchData<WalletType>("wallets", [
        where("uid", "==", user?.uid),
        orderBy("created", "desc"),
    ]);

    const getTotalBalance = () =>
        wallets.reduce((total, item) => {
            total = total + (item.amount || 0);
            return total;
        }, 0);

    return (

        <ScreenWrapper style={{ backgroundColor: colors.background }}>
            <View style={styles.container}>
                <View style={styles.balanceView}>
                    <View style={{ alignItems: "center" }}>
                        <Typo size={45} fontWeight={"500"}>
                            ${getTotalBalance()?.toFixed(2)}
                        </Typo>
                        <Typo size={20} color={colors.neutral900}>
                            Tổng số dư
                        </Typo>
                    </View>
                </View>

                { }
                <View style={[styles.wallets, { backgroundColor: colors.surface || colors.neutral100 }]}>
                    <View style={styles.flexRow}>
                        {/* Đổi màu chữ */}
                        <Typo size={20} fontWeight={"500"} color={colors.text}>
                            {("Ví của tôi")}
                        </Typo>
                        <TouchableOpacity onPress={() => router.push("/(modals)/walletModal")}>
                            <Icons.PlusCircle
                                weight="fill"
                                color={colors.primary}
                                size={verticalScale(33)}
                            />
                        </TouchableOpacity>
                    </View>
                    {loading && <Loading />}
                    <FlatList
                        data={wallets}
                        renderItem={({ item, index }) => {
                            return <WalletListItem item={item} index={index} router={router} />
                        }}
                        contentContainerStyle={styles.listStyle}
                    />
                </View>
            </View>
        </ScreenWrapper>
    );
};

export default Wallet;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "space-between",
    },
    balanceView: {
        height: verticalScale(160),

        justifyContent: "center",
        alignItems: "center",
    },
    balanceHeader: {
        width: "100%",
        position: "absolute",
        top: spacingY._10,
        left: 0,
        paddingHorizontal: spacingX._20,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    flexRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: spacingY?._10 || 10,
    },
    wallets: {
        flex: 1,

        borderTopRightRadius: radius?._30 || 30,
        borderTopLeftRadius: radius?._30 || 30,
        padding: spacingX?._20 || 20,
        paddingTop: spacingX?._25 || 25,
    },
    listStyle: {
        paddingVertical: spacingY?._25 || 25,
        paddingTop: spacingY?._15 || 15,
    },
});

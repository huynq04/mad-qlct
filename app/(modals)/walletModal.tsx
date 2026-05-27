import BackButton from "@/components/BackButton";
import Button from "@/components/Button";
import Header from "@/components/Header";
import ImageUpload from "@/components/ImageUpload";
import Input from "@/components/Input";
import ModalWrapper from "@/components/ModalWrapper";
import Typo from "@/components/Typo";
import { spacingX, spacingY } from "@/constants/theme";
import { useAuth } from "@/contexts/authContext";
import { useTheme } from "@/contexts/themeContext";
import { createOrUpdateWallet, deleteWallet } from "@/services/walletService";
import { WalletType } from "@/types";
import { scale, verticalScale } from "@/utils/styling";
import { auth } from "@/config/firebase";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Icons from "phosphor-react-native";
import React, { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    View
} from "react-native";


const WalletModal = () => {

    const { user, updateUserData } = useAuth();
    const router = useRouter();
    const { colors } = useTheme();


    const [wallet, setWallet] = useState<WalletType>({
        name: "",
        image: null,
    });

    const [loading, setLoading] = useState(false);

    const oldWallet: { name: string; image: string; id: string } =
        useLocalSearchParams();

    useEffect(() => {
        if (oldWallet?.id) {
            setWallet({
                name: oldWallet?.name,
                image: oldWallet?.image ?? null,
            });
        }
    }, [oldWallet?.id]);

    const onPickImage = async () => {
        let result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            aspect: [4, 3],
            quality: 0.5,
        });

        if (!result.canceled && result.assets?.length > 0) {
        }
    };

    const onSubmit = async () => {
        let { name, image } = wallet;
        if (!name.trim()) {
            Alert.alert(("Vui lòng nhập tên ví"));
            return;
        }
        const effectiveUid = user?.uid ?? auth.currentUser?.uid;
        if (!effectiveUid) {
            Alert.alert(("Tài khoản"), ("Bạn cần đăng nhập lại để tạo/cập nhật ví."));
            return;
        }

        const data: WalletType = {
            name,
            image,
            uid: effectiveUid
        };
        if (oldWallet?.id) data.id = oldWallet?.id;
        setLoading(true);
        const res = await createOrUpdateWallet(data);
        setLoading(false);
        if (res.success) {
            router.back();
        } else {
            Alert.alert(("Ví"), res.msg);
        }
    };

    const onDelete = async () => {
        if (!oldWallet?.id) return;
        setLoading(true);
        const res = await deleteWallet(oldWallet?.id)
        setLoading(false);
        if (res.success) {
            router.back();
        } else {
            Alert.alert(("Ví"), res.msg);
        }
    };

    const showDeleteAlert = () => {
        Alert.alert(
            ("Xác nhận"),
            ("Bạn có chắc chắn muốn thực hiện việc này không?\n Thao tác này sẽ xóa tất cả các giao dịch liên quan đến ví này."),
            [
                {
                    text: ("Hủy"),
                    onPress: () => console.log("Đã hủy"),
                    style: "cancel"
                },
                {
                    text: ("Xóa"),
                    onPress: () => onDelete(),
                    style: "destructive"
                }
            ]
        );
    }

    return (
        <ModalWrapper>
            <View style={[styles.container, { backgroundColor: colors.background }]}>
                <Header
                    title={oldWallet?.id ? ("Cập nhật ví") : ("Ví mới")}
                    leftIcon={<BackButton />}
                    style={{ marginBottom: spacingY._10 }}
                />

                <ScrollView contentContainerStyle={styles.form}>
                    <View style={styles.inputContainer}>
                        <Typo color={colors.text}>{("Tên ví")}</Typo>
                        <Input
                            placeholder={("Ngân sách")}
                            value={wallet.name}
                            onChangeText={(value) =>
                                setWallet({ ...wallet, name: value })
                            }
                        />
                    </View>
                    <View style={styles.inputContainer}>
                        <Typo color={colors.text}>{("Biểu tượng ví")}</Typo>
                        <ImageUpload
                            file={wallet.image}
                            onClear={() => setWallet({ ...wallet, image: null })}
                            onSelect={file => setWallet({ ...wallet, image: file })}
                            placeholder={("Tải ảnh lên")} />
                    </View>
                </ScrollView>
            </View>

            <View style={[styles.footer, { borderTopColor: colors.border }]}>
                {oldWallet?.id && !loading && (
                    <Button onPress={showDeleteAlert}
                        style={{
                            backgroundColor: colors.rose,
                            paddingHorizontal: spacingX._15,
                        }}
                    >
                        <Icons.Trash color={colors.white}
                            size={verticalScale(24)}
                            weight="bold"
                        />
                    </Button>
                )}
                <Button onPress={onSubmit} style={{ flex: 1 }} loading={loading}>
                    <Typo color={colors.black} fontWeight={"700"}>
                        {oldWallet?.id ? ("Cập nhật ví") : ("Thêm ví")}
                    </Typo>
                </Button>
            </View>
        </ModalWrapper>
    );
};

export default WalletModal

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: "space-between",
        paddingHorizontal: spacingY._20,
    },
    footer: {
        alignItems: "center",
        flexDirection: "row",
        justifyContent: "center",
        paddingHorizontal: spacingX._20,
        gap: scale(12),
        paddingTop: spacingY._15,
        marginBottom: spacingY._5,
        borderTopWidth: 1,
    },
    form: {
        gap: spacingY._30,
        marginTop: spacingY._15,
    },
    avatarContainer: {
        position: "relative",
        alignSelf: "center",
    },
    avatar: {
        alignSelf: "center",
        height: verticalScale(135),
        width: verticalScale(135),
        borderRadius: 200,
        borderWidth: 1,
    },
    editIcon: {
        position: "absolute",
        bottom: spacingY._5,
        right: spacingY._7,
        borderRadius: 100,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 4,
        padding: spacingY._7,
    },
    inputContainer: {
        gap: spacingY._10,
    },
});

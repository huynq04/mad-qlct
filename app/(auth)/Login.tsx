import BackButton from "@/components/BackButton";
import Button from "@/components/Button";
import Input from "@/components/Input";
import ScreenWrapper from "@/components/ScreenWrapper";
import Typo from "@/components/Typo";
import { spacingX, spacingY } from "@/constants/theme";
import { useAuth } from "@/contexts/authContext";
import { useTheme } from "@/contexts/themeContext";
import { verticalScale } from "@/utils/styling";
import { useRouter } from "expo-router";
import * as Icons from "phosphor-react-native";
import React, { useRef, useState } from "react";
import { Alert, Pressable, StyleSheet, TouchableOpacity, View } from "react-native";


const Login = () => {

    const { colors } = useTheme();
    const emailRef = useRef("");
    const passwordRef = useRef("");
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();
    const { login: loginUser, loginWithGoogle } = useAuth();

    const handleSubmit = async () => {
        if (!emailRef.current || !passwordRef.current) {
            Alert.alert(("Login"), ("Please fill all the fields"));
            return;
        }

        setIsLoading(true);
        const res = await loginUser(emailRef.current, passwordRef.current);
        setIsLoading(false);

        if (!res.success) {
            Alert.alert(("Login"), res.msg);
        }
    };

    const handleGoogleLogin = async () => {
        const res = await loginWithGoogle();
        if (!res.success) {
            alert(res.msg);
        }
    };

    const handleFacebookLogin = async () => {
        console.log("Login with Facebook pressed");
    };

    return (
        <ScreenWrapper>
            <View style={styles.container}>
                <BackButton iconSize={28} />

                <View style={{ gap: 5, marginTop: spacingY._20 }}>
                    <Typo size={30} fontWeight={"800"}>Xin chào,</Typo>
                    <Typo size={30} fontWeight={"800"}>Mừng bạn trở lại</Typo>
                </View>

                <View style={styles.form}>
                    <Typo size={16} color={colors.textLight}>
                        Đăng nhập để theo dõi chi phí của bạn
                    </Typo>

                    <Input
                        placeholder={"Nhập email của bạn"}
                        onChangeText={(value) => (emailRef.current = value)}
                        icon={
                            <Icons.At
                                size={verticalScale(26)}
                                color={colors.textLight}
                                weight="fill"
                            />
                        }
                    />

                    <Input
                        placeholder={"Nhập mật khẩu của bạn"}
                        secureTextEntry
                        onChangeText={(value) => (passwordRef.current = value)}
                        icon={
                            <Icons.Lock
                                size={verticalScale(26)}
                                color={colors.textLight}
                                weight="fill"
                            />
                        }
                    />

                    <TouchableOpacity onPress={() => router.push("/(auth)/forgotPassword")}>
                        <Typo size={14} color={colors.textLight} fontWeight={"500"} style={{ textAlign: 'right' }}>
                            Quên mật khẩu
                        </Typo>
                    </TouchableOpacity>

                    <Button loading={isLoading} onPress={handleSubmit}>
                        <Typo fontWeight={"700"} color={colors.black} size={21}>
                            Đăng nhập
                        </Typo>
                    </Button>
                </View>


                <View style={styles.dividerContainer}>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                    <Typo size={14} color={colors.textLight} style={{ paddingHorizontal: 10 }}>
                        Or
                    </Typo>
                    <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
                </View>


                <View style={styles.socialContainer}>
                    <TouchableOpacity
                        style={[styles.socialButton, { borderColor: colors.border }]}
                        onPress={handleGoogleLogin}
                    >
                        <Icons.GoogleLogo size={verticalScale(24)} color={colors.text} weight="bold" />
                        <Typo size={16} fontWeight={"600"} color={colors.text}>
                            Tiếp tục với Google
                        </Typo>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.socialButton, { borderColor: colors.border }]}
                        onPress={handleFacebookLogin}
                    >
                        <Icons.FacebookLogo size={verticalScale(24)} color="#1877F2" weight="fill" />
                        <Typo size={16} fontWeight={"600"} color={colors.text}>
                            Tiếp tục với Facebook
                        </Typo>
                    </TouchableOpacity>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Typo size={15} color={colors.textLight}>Chưa có tài khoản ?</Typo>
                    <Pressable onPress={() => router.navigate("/(auth)/Register")}>
                        <Typo size={15} fontWeight={"700"} color={colors.primary}> Đăng kí</Typo>
                    </Pressable>
                </View>
            </View>
        </ScreenWrapper>
    );
};
export default Login;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        gap: spacingY._30,
        paddingHorizontal: spacingX._20,
    },
    form: {
        gap: spacingY._20,
    },
    footer: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        gap: 5,
        marginTop: verticalScale(10),
    },
    dividerContainer: {
        flexDirection: "row",
        alignItems: "center",
        marginVertical: verticalScale(5),
    },
    dividerLine: {
        flex: 1,
        height: 1,

    },
    socialContainer: {
        gap: spacingY._15,
    },
    socialButton: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        height: verticalScale(50),
        borderWidth: 1,
        borderRadius: 12,
        backgroundColor: "transparent",

    },
});
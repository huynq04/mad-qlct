import Button from "@/components/Button";
import HomeCard from "@/components/HomeCard";
import NotificationBell from "@/components/NotificationBell";
import ScreenWrapper from "@/components/ScreenWrapper";
import TransactionList from "@/components/TransactionList";
import Typo from "@/components/Typo";
import { spacingX, spacingY } from "@/constants/theme";
import { useAuth } from "@/contexts/authContext";
import { useTheme } from "@/contexts/themeContext";
import useFetchData from "@/hooks/useFetchData";
import { TransactionType } from "@/types";
import { verticalScale } from "@/utils/styling";
import { useFocusEffect, useRouter } from "expo-router";
import { limit, orderBy, where } from "firebase/firestore";
import * as Icons from "phosphor-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  InteractionManager,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";

const Home = () => {
  const { user } = useAuth();
  const router = useRouter();
  const { colors, isDarkMode } = useTheme();
  const scrollRef = useRef<ScrollView | null>(null);
  const [scrollToTopSignal, setScrollToTopSignal] = useState(0);

  // Lấy các giao dịch gần đây của người dùng hiện tại từ Firestore.
  const constraints = [
    where("uid", "==", user?.uid),
    orderBy("date", "desc"),
    limit(30),
  ];

  const { data: recentTransactions, loading: transactionsLoading } =
    useFetchData<TransactionType>(user?.uid ? "transactions" : "", constraints);

  // Sắp xếp lại danh sách theo số tiền để các giao dịch lớn nổi bật hơn.
  const sortedTransactions = useMemo(() => {
    return [...(recentTransactions || [])].sort(
      (a, b) => (b?.amount || 0) - (a?.amount || 0),
    );
  }, [recentTransactions]);

  useFocusEffect(
    useCallback(() => {
      // Mỗi lần quay lại tab Home, đưa danh sách lên đầu để người dùng thấy dữ liệu mới nhất.
      const scrollToTop = () => {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
        setScrollToTopSignal((prev) => prev + 1);
      };

      const frameId = requestAnimationFrame(scrollToTop);
      const interactionsTask =
        InteractionManager.runAfterInteractions(scrollToTop);
      const timerId = setTimeout(scrollToTop, 150);

      return () => {
        cancelAnimationFrame(frameId);
        interactionsTask.cancel();
        clearTimeout(timerId);
      };
    }, []),
  );

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {/* header */}
        <View style={styles.header}>
          <View style={{ gap: 4 }}>
            <Typo size={16} color={colors.textLight}>
              Xin chào,
            </Typo>

            <Typo size={20} fontWeight="500">
              {user?.name || "Khách"}
            </Typo>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={[
                styles.searchIcon,
                {
                  backgroundColor: isDarkMode
                    ? colors.neutral200
                    : colors.neutral200,
                },
              ]}
              onPress={() => router.push("/(modals)/searchModal")}
            >
              <Icons.MagnifyingGlass
                size={verticalScale(20)}
                color={colors.text}
                weight="bold"
              />
            </TouchableOpacity>

            <NotificationBell />
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scrollViewStyle}
          showsVerticalScrollIndicator={false}
        >
          {/* card */}
          <View>
            <HomeCard />
          </View>

          <TransactionList
            data={sortedTransactions}
            loading={transactionsLoading}
            emptyListMessage="Chưa có giao dịch nào được thêm vào!"
            title="Giao dịch gần đây"
            scrollToTopSignal={scrollToTopSignal}
          />
        </ScrollView>

        <Button
          style={styles.floatingButton}
          onPress={() => router.push("/(modals)/transactionModal")}
        >
          <Icons.Plus color={"#000"} weight="bold" size={verticalScale(24)} />
        </Button>
      </View>
    </ScreenWrapper>
  );
};

export default Home;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: spacingX._20,
    marginTop: verticalScale(8),
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacingY._10,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacingX._10,
  },
  searchIcon: {
    padding: spacingX._10,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
  },
  floatingButton: {
    height: verticalScale(50),
    width: verticalScale(50),
    borderRadius: 100,
    position: "absolute",
    bottom: verticalScale(30),
    right: verticalScale(30),
  },
  scrollViewStyle: {
    marginTop: spacingY._10,
    paddingBottom: verticalScale(100),
    gap: spacingY._25,
  },
});

import React from "react";
import { Platform } from "react-native";
import { Slot, Tabs } from "expo-router";
import { useMedia } from "tamagui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, Users, Newspaper } from "lucide-react-native";
import { palette } from "../../../tamagui.config";

const MOBILE_TAB_LABEL_STYLE = {
    fontSize: 12,
    fontWeight: "600" as const,
};

function MobileTabs() {
    const insets = useSafeAreaInsets();
    const baseHeight = Platform.OS === "ios" ? 52 : 56;
    const tabBarHeight = baseHeight + insets.bottom;

    return (
        <Tabs
            initialRouteName="plans"
            screenOptions={{
                headerShown: false,
                tabBarStyle: {
                    backgroundColor: palette.cream,
                    borderTopColor: palette.stone,
                    borderTopWidth: 1,
                    height: tabBarHeight,
                    paddingTop: 6,
                    paddingBottom: Math.max(insets.bottom, 8),
                },
                tabBarLabelStyle: MOBILE_TAB_LABEL_STYLE,
                tabBarActiveTintColor: palette.espresso,
                tabBarInactiveTintColor: palette.walnut,
                tabBarHideOnKeyboard: true,
                sceneStyle: { backgroundColor: palette.cream },
            }}
        >
            <Tabs.Screen
                name="plans"
                options={{
                    title: "Plans",
                    tabBarLabel: "Plans",
                    tabBarIcon: ({ color, size }) => (
                        <CalendarDays size={size} color={color} strokeWidth={1.8} />
                    ),
                }}
            />
            <Tabs.Screen
                name="people"
                options={{
                    title: "People",
                    tabBarLabel: "People",
                    tabBarIcon: ({ color, size }) => (
                        <Users size={size} color={color} strokeWidth={1.8} />
                    ),
                }}
            />
            <Tabs.Screen
                name="feed"
                options={{
                    title: "Feed",
                    tabBarLabel: "Feed",
                    tabBarIcon: ({ color, size }) => (
                        <Newspaper size={size} color={color} strokeWidth={1.8} />
                    ),
                }}
            />
        </Tabs>
    );
}

export default function TabsLayout() {
    const media = useMedia();
    const isDesktop = media.lg && Platform.OS === "web";

    if (isDesktop) {
        return <Slot />;
    }

    return <MobileTabs />;
}

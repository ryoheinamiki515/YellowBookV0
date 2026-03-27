import React from "react";
import { Platform } from "react-native";
import { Slot, Tabs, useRouter, useSegments } from "expo-router";
import { Text, View, XStack, YStack, useMedia } from "tamagui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CalendarDays, Users, Newspaper } from "lucide-react-native";
import { useAuth } from "../../src/context/AuthContext";
import { ConfirmProvider } from "../../src/components/ConfirmDialog";
import { palette } from "../../tamagui.config";

type NavItem = {
    label: string;
    segment: string;
    href: string;
};

const NAV_ITEMS: NavItem[] = [
    { label: "Plans", segment: "plans", href: "/plans" },
    { label: "People", segment: "people", href: "/people" },
    { label: "Feed", segment: "feed", href: "/feed" },
    { label: "Connections", segment: "connections", href: "/connections" },
];

const MOBILE_TAB_LABEL_STYLE = {
    fontSize: 12,
    fontWeight: "600" as const,
};

function SidebarNavItem({
    item,
    isActive,
}: {
    item: NavItem;
    isActive: boolean;
}) {
    const router = useRouter();

    return (
        <YStack
            paddingHorizontal="$4"
            paddingVertical="$2.5"
            borderRadius="$5"
            backgroundColor={isActive ? "$accentBackground" : "transparent"}
            hoverStyle={
                isActive ? undefined : { backgroundColor: "$backgroundHover" }
            }
            onPress={() => router.push(item.href as any)}
            pressStyle={{ opacity: 0.8, scale: 0.98 }}
            cursor="pointer"
            accessibilityRole="button"
            accessibilityLabel={`Navigate to ${item.label}`}
            accessibilityState={{ selected: isActive }}
        >
            <Text
                fontFamily="$body"
                fontSize="$4"
                fontWeight={isActive ? "600" : "500"}
                color={isActive ? "$accentColor" : "$colorSecondary"}
            >
                {item.label}
            </Text>
        </YStack>
    );
}

function Sidebar() {
    const segments = useSegments();
    const { signOut } = useAuth();
    const router = useRouter();

    const activeSegment = (segments as string[])[1] ?? "";

    return (
        <YStack
            width={240}
            backgroundColor="$backgroundStrong"
            borderRightWidth={1}
            borderRightColor="$borderColorSubtle"
            paddingTop="$6"
            paddingBottom="$4"
            paddingHorizontal="$4"
            justifyContent="space-between"
        >
            <YStack gap="$1">
                {/* Logo + title */}
                <XStack
                    alignItems="center"
                    gap="$2.5"
                    paddingHorizontal="$4"
                    paddingBottom="$5"
                >
                    <View
                        width={32}
                        height={32}
                        borderRadius="$4"
                        backgroundColor="$accentBackground"
                        justifyContent="center"
                        alignItems="center"
                    >
                        <Text
                            fontFamily="$heading"
                            fontSize="$7"
                            color="$accentColor"
                        >
                            Y
                        </Text>
                    </View>
                    <Text
                        fontFamily="$heading"
                        fontSize="$7"
                        color="$color"
                    >
                        YellowBook
                    </Text>
                </XStack>

                {/* Nav items */}
                {NAV_ITEMS.map((item) => (
                    <SidebarNavItem
                        key={item.segment}
                        item={item}
                        isActive={activeSegment === item.segment}
                    />
                ))}
            </YStack>

            <YStack gap="$1">
                <YStack
                    paddingHorizontal="$4"
                    paddingVertical="$2.5"
                    borderRadius="$5"
                    hoverStyle={{ backgroundColor: "$backgroundHover" }}
                    onPress={() => router.push("/settings" as any)}
                    pressStyle={{ opacity: 0.7 }}
                    cursor="pointer"
                    accessibilityRole="button"
                    accessibilityLabel="Me"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$3"
                        fontWeight="500"
                        color="$colorTertiary"
                    >
                        Me
                    </Text>
                </YStack>
                <YStack
                    paddingHorizontal="$4"
                    paddingVertical="$2.5"
                    borderRadius="$5"
                    hoverStyle={{ backgroundColor: "$backgroundHover" }}
                    onPress={signOut}
                    pressStyle={{ opacity: 0.7 }}
                    cursor="pointer"
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$3"
                        fontWeight="500"
                        color="$colorTertiary"
                    >
                        Sign Out
                    </Text>
                </YStack>
            </YStack>
        </YStack>
    );
}

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
            <Tabs.Screen
                name="plan/[id]"
                options={{
                    href: null,
                    title: "Plan",
                    tabBarStyle: { display: "none" },
                }}
            />
            <Tabs.Screen
                name="person/[id]"
                options={{
                    href: null,
                    title: "Person",
                    tabBarStyle: { display: "none" },
                }}
            />
            <Tabs.Screen
                name="settings"
                options={{
                    href: null,
                    title: "Settings",
                    tabBarStyle: { display: "none" },
                }}
            />
            <Tabs.Screen
                name="connections"
                options={{
                    href: null,
                    title: "Connections",
                    tabBarStyle: { display: "none" },
                }}
            />
        </Tabs>
    );
}

export default function MainLayout() {
    const media = useMedia();
    const isDesktop = media.lg && Platform.OS === "web";

    if (!isDesktop) {
        return (
            <ConfirmProvider>
                <MobileTabs />
            </ConfirmProvider>
        );
    }

    return (
        <ConfirmProvider>
            <XStack flex={1} backgroundColor="$background">
                <Sidebar />
                <YStack flex={1}>
                    <Slot />
                </YStack>
            </XStack>
        </ConfirmProvider>
    );
}

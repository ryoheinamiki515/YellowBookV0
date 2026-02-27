import React from "react";
import { Platform, Pressable } from "react-native";
import { Slot, useRouter, useSegments } from "expo-router";
import { Text, View, XStack, YStack, useMedia } from "tamagui";
import { useAuth } from "../../src/context/AuthContext";
import { ConfirmProvider } from "../../src/components/ConfirmDialog";

type NavItem = {
    label: string;
    segment: string;
    href: string;
};

const NAV_ITEMS: NavItem[] = [
    { label: "Plans", segment: "plans", href: "/plans" },
    { label: "People", segment: "people", href: "/people" },
    { label: "Feed", segment: "feed", href: "/feed" },
];

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

            {/* Sign out */}
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
    );
}

export default function MainLayout() {
    const media = useMedia();
    const isDesktop = media.lg && Platform.OS === "web";

    if (!isDesktop) {
        return (
            <ConfirmProvider>
                <Slot />
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

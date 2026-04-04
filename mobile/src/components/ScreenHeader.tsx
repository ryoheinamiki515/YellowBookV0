import React, { useCallback, useState } from "react";
import { Platform } from "react-native";
import { Text, View, XStack, YStack, useMedia } from "tamagui";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";

import { AttentionBellButton } from "./AttentionBellButton";
import { AttentionSheet } from "./plans/AttentionSheet";
import { Avatar } from "./Avatar";
import { useAttentionPlans } from "../hooks/useAttentionPlans";
import { useMeProfile } from "../hooks/useMeProfile";
import { avatarProps, meToAvatarPerson } from "../lib/avatarPerson";

type ScreenHeaderProps = {
    title: string;
    safeArea?: boolean;
};

export function ScreenHeader({ title, safeArea = false }: ScreenHeaderProps) {
    const [attentionSheetOpen, setAttentionSheetOpen] = useState(false);
    const { attentionCount, attentionPlans } = useAttentionPlans();
    const { me } = useMeProfile();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const media = useMedia();
    const hasDesktopSidebar = media.lg && Platform.OS === "web";

    const handleSelectPlan = useCallback(
        (planId: string, focus?: "when" | "people") => {
            setAttentionSheetOpen(false);
            const path = focus
                ? `/plan/${planId}?focus=${focus}`
                : `/plan/${planId}`;
            setTimeout(() => router.push(path as any), 150);
        },
        [router]
    );

    return (
        <YStack
            backgroundColor="$background"
            paddingTop={safeArea ? insets.top : 0}
        >
            <XStack
                paddingHorizontal="$5"
                paddingTop="$4"
                paddingBottom="$3"
                alignItems="center"
                justifyContent="space-between"
            >
                <Text fontFamily="$heading" fontSize="$9" color="$color">
                    {title}
                </Text>

                <XStack alignItems="center" gap="$3">
                    <AttentionBellButton
                        count={attentionCount}
                        onPress={() => setAttentionSheetOpen(true)}
                    />
                    {!hasDesktopSidebar && (
                        <View
                            onPress={() => router.push("/settings" as any)}
                            pressStyle={{ opacity: 0.7, scale: 0.95 }}
                            // @ts-ignore — Tamagui animation prop
                            animation="fast"
                            accessibilityRole="button"
                            accessibilityLabel="Settings"
                            cursor="pointer"
                        >
                            <Avatar
                                {...avatarProps(meToAvatarPerson(me ?? {}))}
                                size={36}
                            />
                        </View>
                    )}
                </XStack>
            </XStack>
            <View
                height={1}
                backgroundColor="$borderColorSubtle"
                marginHorizontal="$5"
                opacity={0.6}
            />

            <AttentionSheet
                open={attentionSheetOpen}
                onOpenChange={setAttentionSheetOpen}
                attentionPlans={attentionPlans}
                onSelectPlan={handleSelectPlan}
            />
        </YStack>
    );
}

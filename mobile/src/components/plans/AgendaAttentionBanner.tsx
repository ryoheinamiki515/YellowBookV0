import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform } from "react-native";
import { Text, XStack, View } from "tamagui";

type AgendaAttentionBannerProps = {
    count: number;
    onPress: () => void;
    reducedMotion: boolean;
};

export function AgendaAttentionBanner({
    count,
    onPress,
    reducedMotion,
}: AgendaAttentionBannerProps) {
    const [dismissed, setDismissed] = useState(false);
    const heightAnim = useRef(new Animated.Value(1)).current;

    const handleDismiss = () => {
        if (reducedMotion) {
            setDismissed(true);
            return;
        }
        Animated.timing(heightAnim, {
            toValue: 0,
            duration: 150,
            easing: Easing.in(Easing.ease),
            useNativeDriver: false,
        }).start(() => setDismissed(true));
    };

    if (dismissed || count === 0) return null;

    const maxHeight = heightAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 56],
    });

    return (
        <Animated.View style={{ maxHeight, overflow: "hidden", opacity: heightAnim }}>
            <XStack
                alignItems="center"
                justifyContent="space-between"
                marginHorizontal="$4"
                marginTop="$2"
                marginBottom="$1"
                paddingHorizontal="$3"
                paddingVertical="$2.5"
                backgroundColor="rgba(212,128,90,0.1)"
                borderRadius={12}
            >
                <XStack
                    flex={1}
                    alignItems="center"
                    gap="$2"
                    onPress={onPress}
                    accessibilityRole="button"
                    accessibilityLabel={`${count} plans need your attention. Tap to scroll to first.`}
                    cursor="pointer"
                >
                    <View
                        width={6}
                        height={6}
                        borderRadius={3}
                        backgroundColor="#D4805A"
                    />
                    <Text fontFamily="$body" fontSize={13} color="#8E5532">
                        {count} {count === 1 ? "plan needs" : "plans need"} your attention
                    </Text>
                </XStack>
                <Text
                    fontFamily="$body"
                    fontSize={16}
                    color="$colorTertiary"
                    onPress={handleDismiss}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss attention banner"
                    paddingHorizontal="$2"
                    cursor="pointer"
                >
                    ✕
                </Text>
            </XStack>
        </Animated.View>
    );
}

import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform } from "react-native";
import { View, XStack, YStack } from "tamagui";

export function AgendaSkeletonRows() {
    const pulseAnim = useRef(new Animated.Value(0.4)).current;

    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.8,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0.4,
                    duration: 900,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: Platform.OS !== "web",
                }),
            ])
        ).start();
    }, []);

    const renderRow = (titleWidth: string, key: number) => (
        <Animated.View
            key={key}
            style={{
                opacity: pulseAnim,
                marginHorizontal: 8,
                marginBottom: 5,
                backgroundColor: "#FFFFFF",
                borderRadius: 14,
                paddingHorizontal: 14,
                paddingVertical: 14,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
            }}
        >
            <View style={{ flex: 1 }}>
                <View
                    width={titleWidth as any}
                    height={14}
                    borderRadius={7}
                    backgroundColor="$color5"
                />
                <View
                    width="35%"
                    height={10}
                    borderRadius={5}
                    backgroundColor="$color4"
                    marginTop={8}
                />
            </View>
            <XStack gap={-5}>
                {[0, 1].map((j) => (
                    <View
                        key={j}
                        width={22}
                        height={22}
                        borderRadius={11}
                        backgroundColor="$color4"
                        borderWidth={2}
                        borderColor="#FFFFFF"
                    />
                ))}
            </XStack>
        </Animated.View>
    );

    const renderDateHeader = (width: number, key: string) => (
        <Animated.View key={key} style={{ opacity: pulseAnim, paddingHorizontal: 16, marginTop: 12, marginBottom: 4 }}>
            <View width={width} height={12} borderRadius={6} backgroundColor="$color5" />
        </Animated.View>
    );

    return (
        <YStack flex={1} paddingTop="$2">
            {renderDateHeader(50, "h1")}
            {renderRow("70%", 0)}
            {renderRow("55%", 1)}

            {renderDateHeader(80, "h2")}
            {renderRow("65%", 2)}
            {renderRow("60%", 3)}
            {renderRow("50%", 4)}

            {renderDateHeader(65, "h3")}
            {renderRow("72%", 5)}
            {renderRow("48%", 6)}
        </YStack>
    );
}

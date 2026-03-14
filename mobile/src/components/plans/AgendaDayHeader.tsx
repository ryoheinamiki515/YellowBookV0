import React from "react";
import { Platform } from "react-native";
import { Text, XStack, View } from "tamagui";

type AgendaDayHeaderProps = {
    label: string;
    isToday: boolean;
    count: number;
};

export function AgendaDayHeader({ label, isToday, count }: AgendaDayHeaderProps) {
    return (
        <XStack
            alignItems="center"
            justifyContent="space-between"
            paddingVertical="$2"
            paddingHorizontal="$4"
            marginTop="$1"
            backgroundColor="$background"
            opacity={0.97}
            {...(Platform.OS === "web"
                ? {
                      // @ts-ignore
                      style: { backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" },
                  }
                : {})}
        >
            <XStack alignItems="center" gap="$2">
                {isToday ? (
                    <View
                        width={3}
                        height={14}
                        borderRadius={1.5}
                        backgroundColor="$accentBackground"
                    />
                ) : null}
                <Text
                    fontFamily="$heading"
                    fontSize={isToday ? 15 : 13}
                    fontWeight={isToday ? "700" : "600"}
                    color={isToday ? "$color" : "$colorTertiary"}
                >
                    {label}
                </Text>
            </XStack>
            {count > 1 ? (
                <Text fontFamily="$body" fontSize={11} color="$colorTertiary">
                    {count}
                </Text>
            ) : null}
        </XStack>
    );
}

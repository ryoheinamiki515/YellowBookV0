import React from "react";
import { Text, View } from "tamagui";
import { Bell } from "lucide-react-native";

import { palette } from "../../tamagui.config";

type AttentionBellButtonProps = {
    count: number;
    onPress: () => void;
};

export function AttentionBellButton({ count, onPress }: AttentionBellButtonProps) {
    return (
        <View
            width={36}
            height={36}
            justifyContent="center"
            alignItems="center"
            onPress={onPress}
            pressStyle={{ opacity: 0.7, scale: 0.95 }}
            // @ts-ignore — Tamagui animation prop
            animation="fast"
            accessibilityRole="button"
            accessibilityLabel={
                count > 0
                    ? `${count} plans need attention`
                    : "No plans need attention"
            }
            cursor="pointer"
        >
            <Bell size={20} color={palette.espresso} strokeWidth={1.8} />

            {count > 0 && (
                <View
                    position="absolute"
                    top={2}
                    right={2}
                    minWidth={16}
                    height={16}
                    borderRadius={8}
                    backgroundColor={palette.terracotta}
                    justifyContent="center"
                    alignItems="center"
                    paddingHorizontal={3}
                >
                    <Text
                        fontFamily="$body"
                        fontSize={10}
                        fontWeight="700"
                        color="white"
                        lineHeight={12}
                    >
                        {count > 99 ? "99+" : count}
                    </Text>
                </View>
            )}
        </View>
    );
}

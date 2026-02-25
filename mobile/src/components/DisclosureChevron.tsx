import React from "react";
import { XStack, View } from "tamagui";

type DisclosureChevronProps = {
    size?: number;
    color?: string;
    strokeWidth?: number;
    opacity?: number;
    endInset?: number;
};

export function DisclosureChevron({
    size = 16,
    color = "$colorTertiary",
    strokeWidth = 2,
    opacity = 0.7,
    endInset = 0,
}: DisclosureChevronProps) {
    const armSize = Math.max(7, Math.round(size * 0.48));

    return (
        <XStack
            width={size + endInset}
            height={size}
            alignItems="center"
            justifyContent="flex-start"
            flexShrink={0}
            pointerEvents="none"
            opacity={opacity}
        >
            <XStack width={size} height={size} alignItems="center" justifyContent="center">
                <View
                    width={armSize}
                    height={armSize}
                    borderRightWidth={strokeWidth}
                    borderBottomWidth={strokeWidth}
                    borderColor={color}
                    borderRadius={1}
                    style={{ transform: [{ rotate: "-45deg" }] }}
                />
            </XStack>
        </XStack>
    );
}

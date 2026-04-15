import React from "react";
import { Spinner, Text, XStack, YStack } from "tamagui";

export type PlanActionChipTone =
    | "neutral"
    | "success"
    | "danger"
    | "caution";

type PlanActionChipProps = {
    label: string;
    onPress: () => void;
    accessibilityLabel: string;
    tone?: PlanActionChipTone;
    compact?: boolean;
    disabled?: boolean;
    loading?: boolean;
};

export function PlanActionChip({
    label,
    onPress,
    accessibilityLabel,
    tone = "neutral",
    compact = false,
    disabled = false,
    loading = false,
}: PlanActionChipProps) {
    const toneStyles: Record<
        PlanActionChipTone,
        {
            backgroundColor: string;
            textColor: string;
            borderColor?: string;
        }
    > = {
        neutral: {
            backgroundColor: "$backgroundStrong",
            textColor: "$colorSecondary",
            borderColor: "$borderColorSubtle",
        },
        success: {
            backgroundColor: "$successBackground",
            textColor: "$successColor",
        },
        danger: {
            backgroundColor: "$destructiveBackground",
            textColor: "$destructiveColor",
        },
        caution: {
            backgroundColor: "$cautionBackground",
            textColor: "$cautionColor",
        },
    };

    const styles = toneStyles[tone];
    const chipDisabled = disabled || loading;

    return (
        <YStack
            minHeight={compact ? 30 : 34}
            paddingHorizontal={compact ? "$2" : "$2.5"}
            paddingVertical={compact ? "$1" : "$1.5"}
            borderRadius="$10"
            borderWidth={styles.borderColor ? 1 : 0}
            borderColor={styles.borderColor ?? "transparent"}
            backgroundColor={styles.backgroundColor}
            justifyContent="center"
            alignItems="center"
            onPress={onPress}
            disabled={chipDisabled}
            opacity={chipDisabled ? 0.55 : 1}
            hoverStyle={{ opacity: 0.85 }}
            pressStyle={{
                scale: 0.98,
                opacity: 0.9,
            }}
            // @ts-ignore - web-only prop
            cursor="pointer"
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            {loading ? (
                <XStack alignItems="center" gap="$1.5">
                    <Spinner size="small" color={styles.textColor} />
                    <Text
                        fontFamily="$body"
                        fontSize={compact ? 11 : "$2"}
                        fontWeight="600"
                        color={styles.textColor}
                    >
                        {label}
                    </Text>
                </XStack>
            ) : (
                <Text
                    fontFamily="$body"
                    fontSize={compact ? 11 : "$2"}
                    fontWeight="600"
                    color={styles.textColor}
                >
                    {label}
                </Text>
            )}
        </YStack>
    );
}

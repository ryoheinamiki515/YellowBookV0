import React from "react";
import { Text, YStack } from "tamagui";

export type DetailFooterActionTone = "neutral" | "accent" | "success" | "danger";
export type DetailFooterActionVariant = "filled" | "outline" | "ghost" | "soft";

type DetailFooterActionProps = {
    label: string;
    onPress: () => void;
    accessibilityLabel: string;
    tone?: DetailFooterActionTone;
    variant?: DetailFooterActionVariant;
    disabled?: boolean;
    flex?: number;
    labelSize?: "$3" | "$4" | "$5";
};

type ActionStyle = {
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    textColor: string;
    pressBackgroundColor: string;
    pressOpacity: number;
    fontWeight: "500" | "600";
};

function resolveActionStyle(
    tone: DetailFooterActionTone,
    variant: DetailFooterActionVariant
): ActionStyle {
    if (variant === "filled") {
        switch (tone) {
            case "accent":
                return {
                    backgroundColor: "$accentBackground",
                    borderColor: "transparent",
                    borderWidth: 0,
                    textColor: "$accentColor",
                    pressBackgroundColor: "$accentBackgroundPress",
                    pressOpacity: 1,
                    fontWeight: "600",
                };
            case "success":
                return {
                    backgroundColor: "$successBackground",
                    borderColor: "transparent",
                    borderWidth: 0,
                    textColor: "$successColor",
                    pressBackgroundColor: "$successColor",
                    pressOpacity: 0.18,
                    fontWeight: "600",
                };
            case "danger":
                return {
                    backgroundColor: "$destructiveBackground",
                    borderColor: "transparent",
                    borderWidth: 0,
                    textColor: "$destructiveColor",
                    pressBackgroundColor: "$destructiveColor",
                    pressOpacity: 0.18,
                    fontWeight: "600",
                };
            case "neutral":
            default:
                return {
                    backgroundColor: "$backgroundStrong",
                    borderColor: "transparent",
                    borderWidth: 0,
                    textColor: "$color",
                    pressBackgroundColor: "$backgroundStrong",
                    pressOpacity: 0.75,
                    fontWeight: "600",
                };
        }
    }

    if (variant === "outline") {
        switch (tone) {
            case "accent":
                return {
                    backgroundColor: "$background",
                    borderColor: "$accentColor",
                    borderWidth: 1,
                    textColor: "$accentColor",
                    pressBackgroundColor: "$accentBackground",
                    pressOpacity: 1,
                    fontWeight: "600",
                };
            case "success":
                return {
                    backgroundColor: "$background",
                    borderColor: "$successColor",
                    borderWidth: 1,
                    textColor: "$successColor",
                    pressBackgroundColor: "$successBackground",
                    pressOpacity: 1,
                    fontWeight: "600",
                };
            case "danger":
                return {
                    backgroundColor: "$background",
                    borderColor: "$destructiveColor",
                    borderWidth: 1,
                    textColor: "$destructiveColor",
                    pressBackgroundColor: "$destructiveBackground",
                    pressOpacity: 1,
                    fontWeight: "600",
                };
            case "neutral":
            default:
                return {
                    backgroundColor: "$background",
                    borderColor: "$borderColor",
                    borderWidth: 1,
                    textColor: "$color",
                    pressBackgroundColor: "$backgroundStrong",
                    pressOpacity: 1,
                    fontWeight: "600",
                };
        }
    }

    if (variant === "soft") {
        switch (tone) {
            case "accent":
                return {
                    backgroundColor: "$accentBackground",
                    borderColor: "$accentColor",
                    borderWidth: 1,
                    textColor: "$accentColor",
                    pressBackgroundColor: "$accentBackgroundPress",
                    pressOpacity: 1,
                    fontWeight: "600",
                };
            case "success":
                return {
                    backgroundColor: "$successBackground",
                    borderColor: "$successColor",
                    borderWidth: 1,
                    textColor: "$successColor",
                    pressBackgroundColor: "$successBackground",
                    pressOpacity: 0.75,
                    fontWeight: "600",
                };
            case "danger":
                return {
                    backgroundColor: "$destructiveBackground",
                    borderColor: "$destructiveColor",
                    borderWidth: 1,
                    textColor: "$destructiveColor",
                    pressBackgroundColor: "$destructiveBackground",
                    pressOpacity: 0.75,
                    fontWeight: "600",
                };
            case "neutral":
            default:
                return {
                    backgroundColor: "$backgroundStrong",
                    borderColor: "$borderColor",
                    borderWidth: 1,
                    textColor: "$color",
                    pressBackgroundColor: "$backgroundStrong",
                    pressOpacity: 0.75,
                    fontWeight: "600",
                };
        }
    }

    switch (tone) {
        case "accent":
            return {
                backgroundColor: "transparent",
                borderColor: "transparent",
                borderWidth: 0,
                textColor: "$accentColor",
                pressBackgroundColor: "$accentBackground",
                pressOpacity: 1,
                fontWeight: "500",
            };
        case "success":
            return {
                backgroundColor: "transparent",
                borderColor: "transparent",
                borderWidth: 0,
                textColor: "$successColor",
                pressBackgroundColor: "$successBackground",
                pressOpacity: 1,
                fontWeight: "500",
            };
        case "danger":
            return {
                backgroundColor: "transparent",
                borderColor: "transparent",
                borderWidth: 0,
                textColor: "$destructiveColor",
                pressBackgroundColor: "$destructiveBackground",
                pressOpacity: 1,
                fontWeight: "500",
            };
        case "neutral":
        default:
            return {
                backgroundColor: "transparent",
                borderColor: "transparent",
                borderWidth: 0,
                textColor: "$colorSecondary",
                pressBackgroundColor: "$backgroundStrong",
                pressOpacity: 1,
                fontWeight: "500",
            };
    }
}

export function DetailFooterAction({
    label,
    onPress,
    accessibilityLabel,
    tone = "neutral",
    variant = "outline",
    disabled = false,
    flex,
    labelSize = "$4",
}: DetailFooterActionProps) {
    const actionStyle = resolveActionStyle(tone, variant);

    return (
        <YStack
            flex={flex}
            minHeight="$11"
            paddingHorizontal="$4"
            borderRadius="$6"
            borderWidth={actionStyle.borderWidth}
            borderColor={actionStyle.borderColor}
            backgroundColor={actionStyle.backgroundColor}
            justifyContent="center"
            alignItems="center"
            onPress={onPress}
            disabled={disabled}
            opacity={disabled ? 0.5 : 1}
            pressStyle={{
                scale: 0.98,
                backgroundColor: actionStyle.pressBackgroundColor,
                opacity: actionStyle.pressOpacity,
            }}
            // @ts-ignore
            animation="fast"
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            cursor="pointer"
        >
            <Text
                fontFamily="$body"
                fontSize={labelSize}
                fontWeight={actionStyle.fontWeight}
                color={actionStyle.textColor}
            >
                {label}
            </Text>
        </YStack>
    );
}

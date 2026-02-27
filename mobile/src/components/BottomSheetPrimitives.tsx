import React from "react";
import {
    Animated,
    Dimensions,
    Easing,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    StyleSheet,
    useWindowDimensions,
} from "react-native";
import type { KeyboardEvent } from "react-native";
import { Input, Spinner, Text, View, XStack, YStack } from "tamagui";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useNativeKeyboardAppearance } from "./AppTextInput";

const SHEET_SHADOW_STYLE = {
    shadowColor: "rgba(0,0,0,0.15)",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 1,
    shadowRadius: 20,
    elevation: 12,
} as const;

const PRIMARY_BUTTON_SHADOW_STYLE = {
    shadowColor: "#B8860B",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
} as const;

const DIALOG_SHADOW_STYLE = {
    shadowColor: "rgba(0,0,0,0.2)",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
    elevation: 16,
} as const;

const BACKDROP_COLOR = "rgba(42,36,32,0.35)";
const SHEET_ANIMATION_DURATION_MS = 280;
const SHEET_HIDDEN_OFFSET = Dimensions.get("window").height;
const SCREEN_HEIGHT = Dimensions.get("screen").height;
const KEYBOARD_SHEET_OVERLAP_PX = 20;
const SHEET_TOP_SAFE_GAP_PX = 12;
const SHEET_BOTTOM_PADDING_PX = 20;

type BottomSheetModalProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
    minHeight?: number;
};

export function BottomSheetModal({
    open,
    onOpenChange,
    children,
    minHeight,
}: BottomSheetModalProps) {
    const insets = useSafeAreaInsets();
    const { width, height: windowHeight } = useWindowDimensions();
    const isDesktop = Platform.OS === "web" && width >= 768;
    const [visible, setVisible] = React.useState(open);
    const transition = React.useRef(new Animated.Value(open ? 1 : 0)).current;
    const keyboardOffset = React.useRef(new Animated.Value(0)).current;
    const safeTopInset = Math.max(insets.top, 0);
    const maxSheetHeight = Math.max(
        120,
        windowHeight - safeTopInset - SHEET_TOP_SAFE_GAP_PX
    );
    const resolvedMinHeight =
        typeof minHeight === "number"
            ? Math.min(minHeight, maxSheetHeight)
            : minHeight;

    const animateKeyboardOffset = React.useCallback(
        (toValue: number, duration = 250) => {
            keyboardOffset.stopAnimation();

            Animated.timing(keyboardOffset, {
                toValue,
                duration,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
            }).start();
        },
        [keyboardOffset]
    );

    React.useEffect(() => {
        if (open) {
            setVisible(true);
        }
    }, [open]);

    React.useEffect(() => {
        if (!visible) {
            return;
        }

        let cancelled = false;
        transition.stopAnimation();

        const animation = Animated.timing(transition, {
            toValue: open ? 1 : 0,
            duration: SHEET_ANIMATION_DURATION_MS,
            easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
            useNativeDriver: true,
        });

        animation.start(({ finished }) => {
            if (cancelled || !finished) {
                return;
            }

            if (!open) {
                setVisible(false);
            }
        });

        return () => {
            cancelled = true;
            animation.stop();
        };
    }, [open, transition, visible]);

    React.useEffect(() => {
        if (isDesktop) return;

        const showEvent =
            Platform.OS === "ios" ? "keyboardWillChangeFrame" : "keyboardDidShow";
        const hideEvent =
            Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

        const showSubscription = Keyboard.addListener(showEvent, (event) => {
            const height =
                Platform.OS === "ios"
                    ? Math.max(0, SCREEN_HEIGHT - event.endCoordinates.screenY)
                    : event.endCoordinates.height;

            animateKeyboardOffset(height, event.duration || 250);
        });

        const hideSubscription = Keyboard.addListener(
            hideEvent,
            (event: KeyboardEvent) => {
                animateKeyboardOffset(0, event.duration || 250);
            }
        );

        return () => {
            showSubscription.remove();
            hideSubscription.remove();
        };
    }, [animateKeyboardOffset, isDesktop]);

    React.useEffect(() => {
        if (!visible) {
            keyboardOffset.setValue(0);
        }
    }, [keyboardOffset, visible]);

    const handleClose = () => {
        Keyboard.dismiss();
        onOpenChange(false);
    };

    if (!visible) {
        return null;
    }

    if (isDesktop) {
        const dialogScale = transition.interpolate({
            inputRange: [0, 1],
            outputRange: [0.95, 1],
        });

        return (
            <Modal
                visible={visible}
                transparent
                animationType="none"
                onRequestClose={handleClose}
            >
                <Pressable
                    style={[
                        StyleSheet.absoluteFill,
                        {
                            justifyContent: "center",
                            alignItems: "center",
                        },
                    ]}
                    onPress={handleClose}
                >
                    <Animated.View
                        pointerEvents="none"
                        style={[
                            StyleSheet.absoluteFill,
                            {
                                backgroundColor: BACKDROP_COLOR,
                                opacity: transition,
                            },
                        ]}
                    />

                    <Animated.View
                        style={{
                            width: "100%",
                            maxWidth: 640,
                            opacity: transition,
                            transform: [{ scale: dialogScale }],
                        }}
                    >
                        <Pressable onPress={(e) => e.stopPropagation()}>
                            <YStack
                                backgroundColor="$surface"
                                borderRadius="$8"
                                padding="$6"
                                paddingBottom={SHEET_BOTTOM_PADDING_PX}
                                minHeight={resolvedMinHeight}
                                maxHeight={maxSheetHeight}
                                flexShrink={1}
                                style={DIALOG_SHADOW_STYLE}
                            >
                                {children}
                            </YStack>
                        </Pressable>
                    </Animated.View>
                </Pressable>
            </Modal>
        );
    }

    const sheetTranslateY = transition.interpolate({
        inputRange: [0, 1],
        outputRange: [SHEET_HIDDEN_OFFSET, 0],
    });
    const keyboardLift = keyboardOffset.interpolate({
        inputRange: [0, KEYBOARD_SHEET_OVERLAP_PX, SCREEN_HEIGHT],
        outputRange: [0, 0, SCREEN_HEIGHT - KEYBOARD_SHEET_OVERLAP_PX],
        extrapolate: "clamp",
    });
    const keyboardFillTranslateY = Animated.add(
        Animated.multiply(keyboardLift, -1),
        SCREEN_HEIGHT
    );

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={handleClose}
        >
            <Pressable
                style={StyleSheet.absoluteFill}
                onPress={handleClose}
            >
                <Animated.View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        {
                            backgroundColor: BACKDROP_COLOR,
                            opacity: transition,
                        },
                    ]}
                />
            </Pressable>

            <Animated.View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    height: SCREEN_HEIGHT,
                    transform: [
                        { translateY: sheetTranslateY },
                        { translateY: keyboardFillTranslateY },
                    ],
                }}
            >
                <YStack flex={1} backgroundColor="$surface" />
            </Animated.View>

            <Animated.View
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    transform: [
                        { translateY: sheetTranslateY },
                        { translateY: Animated.multiply(keyboardLift, -1) },
                    ],
                }}
            >
                <YStack
                    backgroundColor="$surface"
                    borderTopLeftRadius="$8"
                    borderTopRightRadius="$8"
                    padding="$6"
                    paddingBottom={Math.max(insets.bottom, 0) + SHEET_BOTTOM_PADDING_PX}
                    minHeight={resolvedMinHeight}
                    maxHeight={maxSheetHeight}
                    flexShrink={1}
                    style={SHEET_SHADOW_STYLE}
                >
                    {children}
                </YStack>
            </Animated.View>
        </Modal>
    );
}

type BottomSheetHeaderProps = {
    title: string;
    subtitle?: string;
    trailingAction?: React.ReactNode;
    marginBottom?: string | number;
};

export function BottomSheetHeader({
    title,
    subtitle,
    trailingAction,
    marginBottom = "$4",
}: BottomSheetHeaderProps) {
    const titleMarginBottom = subtitle ? "$1" : marginBottom;

    if (trailingAction) {
        return (
            <>
                <XStack
                    justifyContent="space-between"
                    alignItems="center"
                    gap="$3"
                    marginBottom={titleMarginBottom}
                >
                    <Text
                        fontFamily="$heading"
                        fontSize="$8"
                        color="$color"
                        flex={1}
                    >
                        {title}
                    </Text>
                    {trailingAction}
                </XStack>

                {subtitle ? (
                    <Text
                        fontFamily="$body"
                        fontSize="$3"
                        color="$colorTertiary"
                        marginBottom={marginBottom}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </>
        );
    }

    return (
        <>
            <Text
                fontFamily="$heading"
                fontSize="$8"
                color="$color"
                marginBottom={titleMarginBottom}
            >
                {title}
            </Text>

            {subtitle ? (
                <Text
                    fontFamily="$body"
                    fontSize="$3"
                    color="$colorTertiary"
                    marginBottom={marginBottom}
                >
                    {subtitle}
                </Text>
            ) : null}
        </>
    );
}

type BottomSheetHeaderActionProps = {
    label: string;
    onPress: () => void;
    accessibilityLabel: string;
    disabled?: boolean;
};

export function BottomSheetHeaderAction({
    label,
    onPress,
    accessibilityLabel,
    disabled = false,
}: BottomSheetHeaderActionProps) {
    return (
        <YStack
            minWidth={44}
            height="$8"
            paddingHorizontal="$2.5"
            borderRadius="$4"
            backgroundColor="transparent"
            justifyContent="center"
            alignItems="center"
            onPress={onPress}
            disabled={disabled}
            opacity={disabled ? 0.45 : 1}
            pressStyle={{
                opacity: 0.65,
                backgroundColor: "$backgroundStrong",
            }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
        >
            <Text
                fontFamily="$body"
                fontSize="$4"
                fontWeight="600"
                color="$color"
            >
                {label}
            </Text>
        </YStack>
    );
}

export function BottomSheetSectionLabel({
    children,
    marginBottom = "$2",
}: {
    children: React.ReactNode;
    marginBottom?: string | number;
}) {
    return (
        <Text
            fontFamily="$body"
            fontSize={11}
            fontWeight="600"
            color="$colorTertiary"
            letterSpacing={1}
            textTransform="uppercase"
            marginBottom={marginBottom}
        >
            {children}
        </Text>
    );
}

type BottomSheetTextFieldProps = React.ComponentProps<typeof Input>;

export function BottomSheetTextField({
    focusStyle,
    keyboardAppearance,
    ...props
}: BottomSheetTextFieldProps) {
    const nativeKeyboardAppearance = useNativeKeyboardAppearance();

    return (
        <Input
            fontFamily="$body"
            fontSize="$6"
            color="$color"
            backgroundColor="$inputBackground"
            borderColor="$borderColor"
            borderWidth={1}
            borderRadius="$5"
            paddingHorizontal="$4"
            paddingVertical="$3"
            keyboardAppearance={keyboardAppearance ?? nativeKeyboardAppearance}
            {...props}
            focusStyle={
                focusStyle ?? {
                    borderColor: "$borderColorFocus",
                    borderWidth: 2,
                }
            }
        />
    );
}

type BottomSheetListRowTone = "default" | "accent" | "muted";

type BottomSheetListRowProps = {
    title: string;
    subtitle?: string;
    leading?: React.ReactNode;
    trailing?: React.ReactNode;
    onPress?: () => void;
    accessibilityLabel?: string;
    disabled?: boolean;
    tone?: BottomSheetListRowTone;
};

export function BottomSheetListRow({
    title,
    subtitle,
    leading,
    trailing,
    onPress,
    accessibilityLabel,
    disabled = false,
    tone = "default",
}: BottomSheetListRowProps) {
    const isMuted = tone === "muted";
    const isAccent = tone === "accent";
    const isInteractive = Boolean(onPress) && !disabled;

    return (
        <XStack
            alignItems="center"
            gap="$3"
            padding="$3"
            borderRadius="$4"
            borderWidth={1}
            borderColor={isAccent ? "$borderColor" : "$borderColorSubtle"}
            backgroundColor={isMuted ? "$backgroundStrong" : "$surface"}
            opacity={disabled ? 0.6 : 1}
            onPress={onPress}
            disabled={!isInteractive}
            hoverStyle={
                isInteractive
                    ? { backgroundColor: "$surfaceHover" }
                    : undefined
            }
            pressStyle={
                isInteractive
                    ? {
                          backgroundColor: isAccent
                              ? "$surfaceHover"
                              : "$backgroundStrong",
                          scale: 0.995,
                      }
                    : undefined
            }
            accessibilityRole={isInteractive ? "button" : undefined}
            accessibilityLabel={accessibilityLabel}
        >
            {leading ? leading : null}

            <YStack flex={1} minWidth={0}>
                <Text
                    fontFamily="$body"
                    fontSize="$4"
                    color={isMuted ? "$colorTertiary" : "$color"}
                    fontWeight="500"
                    numberOfLines={1}
                >
                    {title}
                </Text>

                {subtitle ? (
                    <Text
                        fontFamily="$body"
                        fontSize={11}
                        color="$colorTertiary"
                        numberOfLines={1}
                    >
                        {subtitle}
                    </Text>
                ) : null}
            </YStack>

            {trailing ? trailing : null}
        </XStack>
    );
}

type BottomSheetPrimaryButtonProps = {
    label: string;
    onPress: () => void;
    accessibilityLabel: string;
    disabled?: boolean;
    loading?: boolean;
    loadingLabel?: string;
    marginTop?: string | number;
    height?: string | number;
    flex?: number;
};

export function BottomSheetPrimaryButton({
    label,
    onPress,
    accessibilityLabel,
    disabled = false,
    loading = false,
    loadingLabel = "Saving...",
    marginTop = "$4",
    height = "$12",
    flex,
}: BottomSheetPrimaryButtonProps) {
    return (
        <YStack
            height={height}
            flex={flex}
            borderRadius="$6"
            backgroundColor="$accentBackground"
            justifyContent="center"
            alignItems="center"
            marginTop={marginTop}
            onPress={onPress}
            disabled={disabled}
            opacity={disabled ? 0.45 : 1}
            hoverStyle={{ opacity: 0.9 }}
            pressStyle={{
                scale: 0.98,
                backgroundColor: "$accentBackgroundPress",
            }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            style={PRIMARY_BUTTON_SHADOW_STYLE}
        >
            {loading ? (
                <XStack alignItems="center" gap="$2">
                    <Spinner size="small" color="$accentColor" />
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        fontWeight="600"
                        color="$accentColor"
                    >
                        {loadingLabel}
                    </Text>
                </XStack>
            ) : (
                <Text
                    fontFamily="$body"
                    fontSize="$4"
                    fontWeight="600"
                    color="$accentColor"
                >
                    {label}
                </Text>
            )}
        </YStack>
    );
}

type BottomSheetSecondaryButtonProps = {
    label: string;
    onPress: () => void;
    accessibilityLabel: string;
    disabled?: boolean;
    height?: string | number;
    flex?: number;
    marginTop?: string | number;
};

export function BottomSheetSecondaryButton({
    label,
    onPress,
    accessibilityLabel,
    disabled = false,
    height = "$11",
    flex,
    marginTop,
}: BottomSheetSecondaryButtonProps) {
    return (
        <YStack
            flex={flex}
            height={height}
            borderRadius="$6"
            borderWidth={1}
            borderColor="$borderColor"
            backgroundColor="$backgroundStrong"
            justifyContent="center"
            alignItems="center"
            onPress={onPress}
            disabled={disabled}
            opacity={disabled ? 0.45 : 1}
            pressStyle={{ opacity: 0.8 }}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            marginTop={marginTop}
        >
            <Text
                fontFamily="$body"
                fontSize="$4"
                fontWeight="600"
                color="$colorSecondary"
            >
                {label}
            </Text>
        </YStack>
    );
}

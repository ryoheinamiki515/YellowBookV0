import React, { useRef, useCallback } from "react";
import { Animated, PanResponder, Platform } from "react-native";
import { Text, View } from "tamagui";

type SwipeableRowProps = {
    children: React.ReactNode;
    onSwipeRight?: () => void;
    onSwipeLeft?: () => void;
    reducedMotion: boolean;
    disabled?: boolean;
};

const THRESHOLD = 80;

export function SwipeableRow({
    children,
    onSwipeRight,
    onSwipeLeft,
    reducedMotion,
    disabled,
}: SwipeableRowProps) {
    if (Platform.OS === "web" || disabled) {
        return <>{children}</>;
    }

    const translateX = useRef(new Animated.Value(0)).current;

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gesture) =>
                Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy * 1.5),
            onPanResponderMove: (_, gesture) => {
                translateX.setValue(gesture.dx);
            },
            onPanResponderRelease: (_, gesture) => {
                if (gesture.dx > THRESHOLD && onSwipeRight) {
                    Animated.timing(translateX, {
                        toValue: 300,
                        duration: reducedMotion ? 0 : 200,
                        useNativeDriver: true,
                    }).start(() => {
                        onSwipeRight();
                        translateX.setValue(0);
                    });
                } else if (gesture.dx < -THRESHOLD && onSwipeLeft) {
                    Animated.timing(translateX, {
                        toValue: -300,
                        duration: reducedMotion ? 0 : 200,
                        useNativeDriver: true,
                    }).start(() => {
                        onSwipeLeft();
                        translateX.setValue(0);
                    });
                } else {
                    Animated.spring(translateX, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                }).start();
            },
        })
    ).current;

    const rightRevealOpacity = translateX.interpolate({
        inputRange: [0, THRESHOLD],
        outputRange: [0, 1],
        extrapolate: "clamp",
    });

    const leftRevealOpacity = translateX.interpolate({
        inputRange: [-THRESHOLD, 0],
        outputRange: [1, 0],
        extrapolate: "clamp",
    });

    return (
        <View position="relative" overflow="hidden">
            {/* Right swipe background (Done) */}
            <Animated.View
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: "rgba(125,174,120,0.30)",
                    justifyContent: "center",
                    paddingLeft: 20,
                    opacity: rightRevealOpacity,
                }}
            >
                <Text fontFamily="$body" fontSize={14} fontWeight="600" color="$successColor">
                    Done
                </Text>
            </Animated.View>

            {/* Left swipe background (Let Go) */}
            <Animated.View
                style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    right: 0,
                    backgroundColor: "rgba(200,112,112,0.25)",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    paddingRight: 20,
                    opacity: leftRevealOpacity,
                }}
            >
                <Text fontFamily="$body" fontSize={14} fontWeight="600" color="$destructiveColor">
                    Let Go
                </Text>
            </Animated.View>

            <Animated.View
                style={{ transform: [{ translateX }] }}
                {...panResponder.panHandlers}
            >
                {children}
            </Animated.View>
        </View>
    );
}

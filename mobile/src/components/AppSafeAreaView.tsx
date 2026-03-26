import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import {
    SafeAreaView,
    type SafeAreaViewProps,
} from "react-native-safe-area-context";

import { palette } from "../../tamagui.config";

type AppSafeAreaViewProps = SafeAreaViewProps & {
    style?: StyleProp<ViewStyle>;
};

export function AppSafeAreaView({
    style,
    ...props
}: AppSafeAreaViewProps) {
    return (
        <SafeAreaView
            {...props}
            style={[{ flex: 1, backgroundColor: palette.cream }, style]}
        />
    );
}

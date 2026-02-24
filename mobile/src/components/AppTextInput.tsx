import React from "react";
import {
    Platform,
    TextInput,
    useColorScheme,
    type TextInputProps,
} from "react-native";

export function useNativeKeyboardAppearance(): TextInputProps["keyboardAppearance"] {
    const colorScheme = useColorScheme();

    if (Platform.OS !== "ios") {
        return undefined;
    }

    if (colorScheme === "dark") {
        return "dark";
    }

    if (colorScheme === "light") {
        return "light";
    }

    return "default";
}

type AppTextInputProps = TextInputProps;

export const AppTextInput = React.forwardRef<TextInput, AppTextInputProps>(
    ({ keyboardAppearance, ...props }, ref) => {
        const nativeKeyboardAppearance = useNativeKeyboardAppearance();

        return (
            <TextInput
                ref={ref}
                keyboardAppearance={
                    keyboardAppearance ?? nativeKeyboardAppearance
                }
                {...props}
            />
        );
    }
);

AppTextInput.displayName = "AppTextInput";

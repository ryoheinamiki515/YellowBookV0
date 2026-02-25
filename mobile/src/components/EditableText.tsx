import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, TextInput as RNTextInput } from "react-native";
import { Text, XStack, YStack } from "tamagui";

import { AppTextInput } from "./AppTextInput";

type EditableTextProps = {
    value: string;
    onSave?: (text: string) => void;
    onChangeText?: (text: string) => void;
    placeholder: string;
    multiline?: boolean;
    textStyle?: Record<string, unknown>;
    placeholderColor?: string;
    showMultilineDoneAction?: boolean;
    multilineDoneLabel?: string;
    saveOnBlur?: boolean;
};

export function EditableText({
    value,
    onSave,
    onChangeText,
    placeholder,
    multiline = false,
    textStyle,
    placeholderColor = "$colorTertiary",
    showMultilineDoneAction = true,
    multilineDoneLabel = "Done",
    saveOnBlur = true,
}: EditableTextProps) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<RNTextInput>(null);

    useEffect(() => {
        if (!editing) setDraft(value);
    }, [value, editing]);

    useEffect(() => {
        if (!editing) {
            return;
        }

        const timer = setTimeout(() => inputRef.current?.focus(), 50);
        return () => clearTimeout(timer);
    }, [editing]);

    const handleChangeText = useCallback(
        (text: string) => {
            setDraft(text);
            onChangeText?.(text);
        },
        [onChangeText]
    );

    const handleBlur = useCallback(() => {
        setEditing(false);
        if (!saveOnBlur) {
            return;
        }

        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) {
            onSave?.(trimmed);
            return;
        }

        setDraft(value);
    }, [draft, value, onSave, saveOnBlur]);

    const handleDonePress = useCallback(() => {
        inputRef.current?.blur();
    }, []);

    if (editing) {
        return (
            <YStack gap={multiline && showMultilineDoneAction ? "$2" : 0}>
                <AppTextInput
                    ref={inputRef}
                    value={draft}
                    onChangeText={handleChangeText}
                    onBlur={handleBlur}
                    multiline={multiline}
                    returnKeyType={multiline ? "default" : "done"}
                    onSubmitEditing={multiline ? undefined : handleBlur}
                    style={[
                        {
                            fontFamily: "System",
                            color: "#2A2420",
                            padding: 0,
                            margin: 0,
                            textAlignVertical: multiline ? "top" : "center",
                        },
                        textStyle as any,
                    ]}
                    blurOnSubmit={!multiline}
                />

                {multiline && showMultilineDoneAction ? (
                    <XStack justifyContent="flex-end">
                        <Pressable
                            onPress={handleDonePress}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel="Done editing text"
                        >
                            <XStack
                                paddingHorizontal="$3"
                                paddingVertical="$1.5"
                                borderRadius="$10"
                                backgroundColor="$backgroundStrong"
                                borderWidth={1}
                                borderColor="$borderColor"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$2"
                                    fontWeight="600"
                                    color="$accentColor"
                                >
                                    {multilineDoneLabel}
                                </Text>
                            </XStack>
                        </Pressable>
                    </XStack>
                ) : null}
            </YStack>
        );
    }

    const isEmpty = !value;

    return (
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button">
            <Text
                fontFamily={
                    (textStyle as any)?.fontFamily === "$heading"
                        ? "$heading"
                        : "$body"
                }
                fontSize={(textStyle as any)?.fontSize ?? "$5"}
                color={isEmpty ? placeholderColor : (textStyle as any)?.color ?? "$color"}
                fontStyle={isEmpty ? "italic" : "normal"}
                fontWeight={(textStyle as any)?.fontWeight}
                lineHeight={(textStyle as any)?.lineHeight}
            >
                {isEmpty ? placeholder : value}
            </Text>
        </Pressable>
    );
}

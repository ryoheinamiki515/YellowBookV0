import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, TextInput as RNTextInput } from "react-native";
import { Text } from "tamagui";

import { palette } from "../../tamagui.config";

import { AppTextInput } from "./AppTextInput";

type EditableTextProps = {
    value: string;
    onSave?: (text: string) => void;
    onChangeText?: (text: string) => void;
    placeholder: string;
    multiline?: boolean;
    textStyle?: Record<string, unknown>;
    placeholderColor?: string;
    saveOnBlur?: boolean;
    readOnly?: boolean;
};

export function EditableText({
    value,
    onSave,
    onChangeText,
    placeholder,
    multiline = false,
    textStyle,
    placeholderColor = "$colorTertiary",
    saveOnBlur = true,
    readOnly = false,
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

    if (!readOnly && editing) {
        return (
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
                        color: palette.espresso,
                        padding: 0,
                        margin: 0,
                        textAlignVertical: multiline ? "top" : "center",
                    },
                    textStyle as any,
                ]}
                blurOnSubmit={!multiline}
            />
        );
    }

    const isEmpty = !value;

    const displayText = (
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
    );

    if (readOnly) return displayText;

    return (
        <Pressable onPress={() => setEditing(true)} accessibilityRole="button">
            {displayText}
        </Pressable>
    );
}

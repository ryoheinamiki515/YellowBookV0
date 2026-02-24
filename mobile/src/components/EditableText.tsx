import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, TextInput as RNTextInput } from "react-native";
import { Text } from "tamagui";

import { AppTextInput } from "./AppTextInput";

type EditableTextProps = {
    value: string;
    onSave: (text: string) => void;
    placeholder: string;
    multiline?: boolean;
    textStyle?: Record<string, unknown>;
    placeholderColor?: string;
};

export function EditableText({
    value,
    onSave,
    placeholder,
    multiline = false,
    textStyle,
    placeholderColor = "$colorTertiary",
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

    const handleBlur = useCallback(() => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) {
            onSave(trimmed);
            return;
        }

        setDraft(value);
    }, [draft, value, onSave]);

    if (editing) {
        return (
            <AppTextInput
                ref={inputRef}
                value={draft}
                onChangeText={setDraft}
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

import React, { useCallback, useState } from "react";
import { Pressable } from "react-native";
import { YStack, Text } from "tamagui";
import type { PersonBirthday } from "../api/generated/model/personBirthday";
import { EditableText } from "./EditableText";
import { BirthdaySheet, formatBirthdayDisplay } from "./BirthdaySheet";

function FieldRow({
    label,
    value,
    placeholder,
    onPress,
}: {
    label: string;
    value: string | null;
    placeholder: string;
    onPress: () => void;
}) {
    return (
        <Pressable onPress={onPress} accessibilityRole="button">
            <YStack gap="$1">
                <Text
                    fontFamily="$body"
                    fontSize={11}
                    fontWeight="600"
                    color="$colorTertiary"
                    letterSpacing={1}
                    textTransform="uppercase"
                >
                    {label}
                </Text>
                <Text
                    fontFamily="$body"
                    fontSize="$4"
                    color={value ? "$color" : "$colorTertiary"}
                    fontStyle={value ? "normal" : "italic"}
                >
                    {value || placeholder}
                </Text>
            </YStack>
        </Pressable>
    );
}

type ProfileFieldsProps = {
    displayName: string;
    birthday: PersonBirthday | undefined | null;
    onSaveDisplayName: (text: string) => void;
    onSaveBirthday: (birthday: PersonBirthday | null) => void;
};

export function ProfileFields({
    displayName,
    birthday,
    onSaveDisplayName,
    onSaveBirthday,
}: ProfileFieldsProps) {
    const [birthdaySheetOpen, setBirthdaySheetOpen] = useState(false);
    const birthdayDisplay = formatBirthdayDisplay(birthday);

    const handleSaveBirthday = useCallback(
        (value: PersonBirthday | null) => {
            onSaveBirthday(value);
        },
        [onSaveBirthday]
    );

    return (
        <>
            {/* Display Name */}
            <YStack marginBottom="$4">
                <EditableText
                    value={displayName}
                    onSave={onSaveDisplayName}
                    placeholder="Name"
                    textStyle={{
                        fontFamily: "$heading",
                        fontSize: 32,
                        color: "$color",
                    }}
                />
            </YStack>

            {/* Birthday */}
            <YStack marginBottom="$5">
                <FieldRow
                    label="Birthday"
                    value={birthdayDisplay}
                    placeholder="Add birthday"
                    onPress={() => setBirthdaySheetOpen(true)}
                />
            </YStack>

            <BirthdaySheet
                open={birthdaySheetOpen}
                onOpenChange={setBirthdaySheetOpen}
                currentBirthday={birthday}
                onSave={handleSaveBirthday}
            />
        </>
    );
}

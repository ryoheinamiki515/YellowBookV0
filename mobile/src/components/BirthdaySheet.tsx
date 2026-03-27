import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { YStack, XStack, Text, View } from "tamagui";
import type { PersonBirthday } from "../api/generated/model/personBirthday";
import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetSecondaryButton,
    BottomSheetSectionLabel,
    BottomSheetTextField,
} from "./BottomSheetPrimitives";

export const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

export function formatBirthdayDisplay(
    birthday: PersonBirthday | undefined | null
): string | null {
    if (!birthday) return null;
    const { month, day, year } = birthday;
    const monthStr = MONTHS[month - 1] || `${month}`;
    if (year) return `${monthStr} ${day}, ${year}`;
    return `${monthStr} ${day}`;
}

export function BirthdaySheet({
    open,
    onOpenChange,
    currentBirthday,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentBirthday: PersonBirthday | undefined | null;
    onSave: (birthday: PersonBirthday | null) => void;
}) {
    const [month, setMonth] = useState(currentBirthday?.month ?? 1);
    const [day, setDay] = useState(currentBirthday?.day ?? 1);
    const [year, setYear] = useState<string>(
        currentBirthday?.year ? String(currentBirthday.year) : ""
    );

    useEffect(() => {
        if (open) {
            setMonth(currentBirthday?.month ?? 1);
            setDay(currentBirthday?.day ?? 1);
            setYear(currentBirthday?.year ? String(currentBirthday.year) : "");
        }
    }, [open, currentBirthday]);

    const handleConfirm = useCallback(() => {
        const parsedYear = year.trim() ? parseInt(year.trim(), 10) : null;
        const validYear =
            parsedYear && parsedYear >= 1900 && parsedYear <= 2100
                ? parsedYear
                : null;
        onSave({
            month,
            day,
            year: validYear,
        });
        onOpenChange(false);
    }, [month, day, year, onSave, onOpenChange]);

    const handleClear = useCallback(() => {
        onSave(null);
        onOpenChange(false);
    }, [onSave, onOpenChange]);

    const daysInMonth = new Date(2000, month, 0).getDate();
    const clampedDay = Math.min(day, daysInMonth);

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader title="Birthday" />

                {/* Month picker */}
                <YStack gap="$3">
                    <YStack gap="$1">
                        <BottomSheetSectionLabel marginBottom={0}>
                            Month
                        </BottomSheetSectionLabel>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                        >
                            <XStack gap="$1.5" paddingVertical="$1">
                                {MONTHS.map((m, i) => {
                                    const isSelected = i + 1 === month;
                                    return (
                                        <Pressable
                                            key={m}
                                            onPress={() => setMonth(i + 1)}
                                        >
                                            <View
                                                paddingHorizontal="$3"
                                                paddingVertical="$2"
                                                borderRadius="$4"
                                                backgroundColor={
                                                    isSelected
                                                        ? "$accentBackground"
                                                        : "$backgroundStrong"
                                                }
                                            >
                                                <Text
                                                    fontFamily="$body"
                                                    fontSize="$3"
                                                    fontWeight={
                                                        isSelected
                                                            ? "600"
                                                            : "400"
                                                    }
                                                    color={
                                                        isSelected
                                                            ? "$accentColor"
                                                            : "$color"
                                                    }
                                                >
                                                    {m.slice(0, 3)}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </XStack>
                        </ScrollView>
                    </YStack>

                    {/* Day picker */}
                    <YStack gap="$1">
                        <BottomSheetSectionLabel marginBottom={0}>
                            Day
                        </BottomSheetSectionLabel>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                        >
                            <XStack gap="$1" paddingVertical="$1">
                                {Array.from(
                                    { length: daysInMonth },
                                    (_, i) => i + 1
                                ).map((d) => {
                                    const isSelected = d === clampedDay;
                                    return (
                                        <Pressable
                                            key={d}
                                            onPress={() => setDay(d)}
                                        >
                                            <View
                                                width={36}
                                                height={36}
                                                borderRadius={18}
                                                justifyContent="center"
                                                alignItems="center"
                                                backgroundColor={
                                                    isSelected
                                                        ? "$accentBackground"
                                                        : "transparent"
                                                }
                                            >
                                                <Text
                                                    fontFamily="$body"
                                                    fontSize="$3"
                                                    fontWeight={
                                                        isSelected
                                                            ? "600"
                                                            : "400"
                                                    }
                                                    color={
                                                        isSelected
                                                            ? "$accentColor"
                                                            : "$color"
                                                    }
                                                >
                                                    {d}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    );
                                })}
                            </XStack>
                        </ScrollView>
                    </YStack>

                    {/* Year (optional) */}
                    <YStack gap="$1">
                        <BottomSheetSectionLabel marginBottom={0}>
                            Year (optional)
                        </BottomSheetSectionLabel>
                        <BottomSheetTextField
                            value={year}
                            onChangeText={setYear}
                            placeholder="e.g. 1990"
                            placeholderTextColor="$placeholderColor"
                            keyboardType="number-pad"
                            maxLength={4}
                        />
                    </YStack>
                </YStack>

                {/* Buttons */}
                <XStack gap="$3" marginTop="$5">
                    {currentBirthday && (
                        <BottomSheetSecondaryButton
                            flex={1}
                            label="Clear"
                            onPress={handleClear}
                            accessibilityLabel="Clear birthday"
                        />
                    )}
                    <BottomSheetPrimaryButton
                        flex={2}
                        height="$11"
                        marginTop={0}
                        label="Confirm"
                        onPress={handleConfirm}
                        accessibilityLabel="Confirm birthday"
                    />
                </XStack>
        </BottomSheetModal>
    );
}

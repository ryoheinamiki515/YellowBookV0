import React from "react";
import { Text, XStack } from "tamagui";

import { useTodayDate } from "../lib/useTodayDate";

type CalendarDateChipProps = {
    date: Date;
    prefix?: string | null;
};

type TodayDateChipProps = {
    prefix?: string | null;
};

function formatCompactDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
    });
}

function formatAccessibleDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    });
}

export function CalendarDateChip({
    date,
    prefix = "Today",
}: CalendarDateChipProps) {
    const compactDate = formatCompactDate(date);
    const text = prefix ? `${prefix} • ${compactDate}` : compactDate;
    const accessibilityLabel = prefix
        ? `${prefix}, ${formatAccessibleDate(date)}`
        : formatAccessibleDate(date);

    return (
        <XStack
            alignItems="center"
            justifyContent="center"
            paddingHorizontal="$2.5"
            paddingVertical="$1"
            borderRadius="$10"
            backgroundColor="$backgroundStrong"
            borderWidth={1}
            borderColor="$borderColorSubtle"
            accessibilityRole="text"
            accessibilityLabel={accessibilityLabel}
        >
            <Text
                fontFamily="$body"
                fontSize="$2"
                fontWeight="600"
                color="$colorSecondary"
            >
                {text}
            </Text>
        </XStack>
    );
}

export function TodayDateChip({
    prefix = "Today",
}: TodayDateChipProps) {
    const today = useTodayDate();
    return <CalendarDateChip date={today} prefix={prefix} />;
}

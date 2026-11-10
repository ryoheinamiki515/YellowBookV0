import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Platform, Pressable, RefreshControl, ScrollView } from "react-native";
import { Calendar } from "react-native-calendars";
import type { DateData } from "react-native-calendars";
import type { DayProps } from "react-native-calendars/src/calendar/day";
import { Text, View, XStack, YStack } from "tamagui";

import { palette } from "../../../tamagui.config";
import type { AgendaPlanRowData } from "../../lib/agendaGrouping";
import { dateFromLocalDateKey, toLocalDateKey } from "../../lib/dateKey";
import { formatFullDate } from "../../lib/planHelpers";
import {
    buildPlanCalendar,
    DAY_DOT_ORDER,
    type DayDot,
    type PlanCalendar,
    type RangeSegment,
} from "../../lib/planCalendar";
import { CALENDAR_THEME, CALENDAR_TODAY_BACKGROUND_COLOR } from "../calendarTheme";

type MarkShape = "dot" | "ring" | "bar";
type MarkAppearance = { color: string; label: string; shape: MarkShape; opacity: number };

const DOT_APPEARANCE: Record<DayDot, MarkAppearance> = {
    morning: { color: palette.honeyDark, label: "Morning", shape: "dot", opacity: 1 },
    afternoon: { color: palette.terracotta, label: "Afternoon", shape: "dot", opacity: 1 },
    evening: { color: palette.sageDark, label: "Evening", shape: "dot", opacity: 1 },
    lateNight: { color: palette.charcoal, label: "Late night", shape: "dot", opacity: 1 },
    allDay: { color: palette.driftwood, label: "Any time", shape: "ring", opacity: 1 },
};

const RANGE_APPEARANCE: MarkAppearance = {
    color: palette.stone,
    label: "Flexible dates",
    shape: "bar",
    opacity: 0.55,
};

const LEGEND: readonly MarkAppearance[] = [
    ...DAY_DOT_ORDER.map((dot) => DOT_APPEARANCE[dot]),
    RANGE_APPEARANCE,
];

const DOT_SIZE = 7;
const RING_WIDTH = 1.25;
const RANGE_BAR_HEIGHT = 4;
const RANGE_BAR_INSET = 6;
const LEGEND_BAR_WIDTH = 14;
const DAY_CELL_MIN_WIDTH = 40;
const DAY_NUMBER_SIZE = 30;
const SELECTED_DAY_COLOR = palette.espresso;

function MarkSwatch({ appearance }: { appearance: MarkAppearance }) {
    const { color, shape, opacity } = appearance;
    if (shape === "bar") {
        return (
            <View
                width={LEGEND_BAR_WIDTH}
                height={RANGE_BAR_HEIGHT}
                borderRadius={RANGE_BAR_HEIGHT / 2}
                backgroundColor={color}
                opacity={opacity}
            />
        );
    }
    return (
        <View
            width={DOT_SIZE}
            height={DOT_SIZE}
            borderRadius={DOT_SIZE / 2}
            backgroundColor={shape === "ring" ? "transparent" : color}
            borderWidth={shape === "ring" ? RING_WIDTH : 0}
            borderColor={color}
            opacity={opacity}
        />
    );
}

function RangeBar({ segment }: { segment: RangeSegment | null }) {
    const radius = RANGE_BAR_HEIGHT / 2;
    const roundStart = !segment?.continuesFromPrevious;
    const roundEnd = !segment?.continuesToNext;
    return (
        <View
            alignSelf="stretch"
            height={RANGE_BAR_HEIGHT}
            marginLeft={roundStart ? RANGE_BAR_INSET : 0}
            marginRight={roundEnd ? RANGE_BAR_INSET : 0}
            backgroundColor={segment ? RANGE_APPEARANCE.color : "transparent"}
            opacity={RANGE_APPEARANCE.opacity}
            borderTopLeftRadius={roundStart ? radius : 0}
            borderBottomLeftRadius={roundStart ? radius : 0}
            borderTopRightRadius={roundEnd ? radius : 0}
            borderBottomRightRadius={roundEnd ? radius : 0}
        />
    );
}

function formatDayTitle(dateKey: string): string {
    return formatFullDate(dateFromLocalDateKey(dateKey).toISOString()) ?? dateKey;
}

type CalendarSelection = {
    calendar: PlanCalendar;
    selectedDateKey: string;
    onSelectDate: (dateKey: string) => void;
};

const CalendarSelectionContext = createContext<CalendarSelection | null>(null);

function useCalendarSelection(): CalendarSelection {
    const selection = useContext(CalendarSelectionContext);
    if (!selection) throw new Error("PlanCalendarDay must render inside PlanCalendarView");
    return selection;
}

function PlanCalendarDay({ date, state }: DayProps & { date?: DateData }) {
    const { calendar, selectedDateKey, onSelectDate } = useCalendarSelection();
    if (!date) return null;

    const dateKey = date.dateString;
    const day = calendar.get(dateKey);
    const planCount = day?.rows.length ?? 0;
    const isSelected = dateKey === selectedDateKey;
    const isToday = state === "today";

    return (
        <Pressable
            style={{ alignSelf: "stretch" }}
            onPress={() => onSelectDate(dateKey)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${formatDayTitle(dateKey)}, ${
                planCount === 0 ? "free" : `${planCount} ${planCount === 1 ? "plan" : "plans"}`
            }`}
        >
            <YStack width="100%" minWidth={DAY_CELL_MIN_WIDTH} alignItems="center" gap={3}>
                <View
                    width={DAY_NUMBER_SIZE}
                    height={DAY_NUMBER_SIZE}
                    borderRadius={DAY_NUMBER_SIZE / 2}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={
                        isSelected
                            ? SELECTED_DAY_COLOR
                            : isToday
                              ? CALENDAR_TODAY_BACKGROUND_COLOR
                              : "transparent"
                    }
                >
                    <Text
                        fontFamily="$body"
                        fontSize={15}
                        fontWeight={isToday || isSelected ? "700" : "500"}
                        color={isSelected ? palette.cream : "$color"}
                    >
                        {date.day}
                    </Text>
                </View>
                <XStack height={DOT_SIZE} gap={2.5} alignItems="center">
                    {day?.dots.map((dot) => (
                        <MarkSwatch key={dot} appearance={DOT_APPEARANCE[dot]} />
                    ))}
                </XStack>
                <RangeBar segment={day?.range ?? null} />
            </YStack>
        </Pressable>
    );
}

function MarkLegend() {
    return (
        <XStack flexWrap="wrap" columnGap="$3" rowGap="$1.5" paddingHorizontal="$2">
            {LEGEND.map((appearance) => (
                <XStack key={appearance.label} alignItems="center" gap={5}>
                    <MarkSwatch appearance={appearance} />
                    <Text fontFamily="$body" fontSize={11} color="$colorSecondary">
                        {appearance.label}
                    </Text>
                </XStack>
            ))}
        </XStack>
    );
}

export function PlanCalendarView({
    rows,
    renderPlanRow,
    refreshing,
    onRefresh,
}: {
    rows: AgendaPlanRowData[];
    renderPlanRow: (row: AgendaPlanRowData, index: number) => React.ReactNode;
    refreshing: boolean;
    onRefresh: () => void;
}) {
    const calendar = useMemo(() => buildPlanCalendar(rows), [rows]);
    const todayDateKey = toLocalDateKey(new Date());
    const [selectedDateKey, setSelectedDateKey] = useState(todayDateKey);
    const selectedRows = calendar.get(selectedDateKey)?.rows ?? [];

    const handleMonthChange = useCallback(
        (month: DateData) => {
            const firstOfMonth = toLocalDateKey(new Date(month.year, month.month - 1, 1));
            const isCurrentMonth = todayDateKey.startsWith(firstOfMonth.slice(0, 7));
            setSelectedDateKey(isCurrentMonth ? todayDateKey : firstOfMonth);
        },
        [todayDateKey]
    );

    const selection = useMemo<CalendarSelection>(
        () => ({ calendar, selectedDateKey, onSelectDate: setSelectedDateKey }),
        [calendar, selectedDateKey]
    );

    return (
        <ScrollView
            contentContainerStyle={{ paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
                Platform.OS !== "web" ? (
                    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                ) : undefined
            }
        >
            <CalendarSelectionContext.Provider value={selection}>
                <YStack paddingHorizontal="$3" gap="$2.5">
                    <Calendar
                        current={todayDateKey}
                        enableSwipeMonths
                        hideExtraDays
                        dayComponent={PlanCalendarDay}
                        onMonthChange={handleMonthChange}
                        theme={{ ...CALENDAR_THEME, calendarBackground: "transparent", textMonthFontWeight: "700" }}
                    />
                    <MarkLegend />
                </YStack>
            </CalendarSelectionContext.Provider>
            <View height={1} backgroundColor="$borderColorSubtle" marginVertical="$3" marginHorizontal="$4" />
            <YStack gap="$2">
                <Text fontFamily="$heading" fontSize={15} fontWeight="700" color="$color" paddingHorizontal="$4">
                    {selectedDateKey === todayDateKey
                        ? `Today · ${formatDayTitle(selectedDateKey)}`
                        : formatDayTitle(selectedDateKey)}
                </Text>
                {selectedRows.length === 0 ? (
                    <Text fontFamily="$body" fontSize={14} color="$colorSecondary" paddingHorizontal="$4">
                        Nothing planned — you're free.
                    </Text>
                ) : (
                    selectedRows.map((row, index) => (
                        <React.Fragment key={row.plan.id}>{renderPlanRow(row, index)}</React.Fragment>
                    ))
                )}
            </YStack>
        </ScrollView>
    );
}

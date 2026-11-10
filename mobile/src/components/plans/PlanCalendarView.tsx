import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { Calendar } from "react-native-calendars";
import type { DateData } from "react-native-calendars";
import type { DayProps } from "react-native-calendars/src/calendar/day";
import { Text, View, XStack, YStack } from "tamagui";

import { palette } from "../../../tamagui.config";
import type { AgendaPlanRowData } from "../../lib/agendaGrouping";
import { toLocalDateKey } from "../../lib/dateKey";
import {
    buildPlanCalendar,
    CALENDAR_MARK_ORDER,
    type CalendarMark,
    type PlanCalendar,
} from "../../lib/planCalendar";
import { PlanCard } from "./PlanCard";

type MarkAppearance = { color: string; label: string; hollow?: boolean; faint?: boolean };

function dateFromKey(dateKey: string, offsetDays = 0): Date {
    const [y, m, d] = dateKey.split("-").map(Number);
    return new Date(y, m - 1, d + offsetDays);
}

function shiftDateKey(dateKey: string, days: number): string {
    return toLocalDateKey(dateFromKey(dateKey, days));
}

function formatDayTitle(dateKey: string): string {
    return dateFromKey(dateKey).toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
    });
}

const MARK_APPEARANCE: Record<CalendarMark, MarkAppearance> = {
    morning: { color: palette.honeyDark, label: "Morning" },
    afternoon: { color: palette.terracotta, label: "Afternoon" },
    evening: { color: palette.sageDark, label: "Evening" },
    lateNight: { color: palette.charcoal, label: "Late night" },
    allDay: { color: palette.driftwood, label: "Any time", hollow: true },
    range: { color: palette.stone, label: "Flexible dates", faint: true },
};

const DOT_SIZE = 7;
const RANGE_BAR_HEIGHT = 4;
const DAY_CELL_SIZE = 40;
const SELECTED_DAY_COLOR = palette.espresso;
const TODAY_BACKGROUND_COLOR = palette.honeyLight;

function LegendSwatch({ mark }: { mark: CalendarMark }) {
    if (mark !== "range") return <MarkDot mark={mark} />;
    return (
        <View
            width={14}
            height={RANGE_BAR_HEIGHT}
            borderRadius={RANGE_BAR_HEIGHT / 2}
            backgroundColor={MARK_APPEARANCE.range.color}
            opacity={0.55}
        />
    );
}

function MarkDot({ mark }: { mark: CalendarMark }) {
    const { color, hollow, faint } = MARK_APPEARANCE[mark];
    return (
        <View
            width={DOT_SIZE}
            height={DOT_SIZE}
            borderRadius={DOT_SIZE / 2}
            backgroundColor={hollow ? "transparent" : color}
            borderWidth={hollow ? 1.25 : 0}
            borderColor={color}
            opacity={faint ? 0.45 : 1}
        />
    );
}

type CalendarSelection = {
    calendar: PlanCalendar;
    selectedDateKey: string;
    todayDateKey: string;
    onSelectDate: (dateKey: string) => void;
};

const CalendarSelectionContext = createContext<CalendarSelection | null>(null);

function useCalendarSelection(): CalendarSelection {
    const selection = useContext(CalendarSelectionContext);
    if (!selection) throw new Error("PlanCalendarDay must render inside PlanCalendarView");
    return selection;
}

function PlanCalendarDay({ date, state }: DayProps & { date?: DateData }) {
    const { calendar, selectedDateKey, todayDateKey, onSelectDate } = useCalendarSelection();
    if (!date) return <View width={DAY_CELL_SIZE} height={DAY_CELL_SIZE} />;

    const dateKey = date.dateString;
    const marks = calendar.get(dateKey)?.marks ?? [];
    const isSelected = dateKey === selectedDateKey;
    const isToday = dateKey === todayDateKey;
    const isOutsideMonth = state === "disabled";
    const planCount = calendar.get(dateKey)?.rows.length ?? 0;

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
            <YStack width="100%" minWidth={DAY_CELL_SIZE} alignItems="center" gap={3}>
                <View
                    width={30}
                    height={30}
                    borderRadius={15}
                    alignItems="center"
                    justifyContent="center"
                    backgroundColor={
                        isSelected ? SELECTED_DAY_COLOR : isToday ? TODAY_BACKGROUND_COLOR : "transparent"
                    }
                >
                    <Text
                        fontFamily="$body"
                        fontSize={15}
                        fontWeight={isToday || isSelected ? "700" : "500"}
                        color={isSelected ? palette.cream : isOutsideMonth ? "$colorTertiary" : "$color"}
                    >
                        {date.day}
                    </Text>
                </View>
                <XStack height={DOT_SIZE} gap={2.5} alignItems="center">
                    {marks.filter((mark) => mark !== "range").map((mark) => (
                        <MarkDot key={mark} mark={mark} />
                    ))}
                </XStack>
                <RangeBar
                    visible={marks.includes("range")}
                    continuesFromPrevious={hasRange(calendar, shiftDateKey(dateKey, -1))}
                    continuesToNext={hasRange(calendar, shiftDateKey(dateKey, 1))}
                />
            </YStack>
        </Pressable>
    );
}

function hasRange(calendar: PlanCalendar, dateKey: string): boolean {
    return calendar.get(dateKey)?.marks.includes("range") ?? false;
}

function RangeBar({
    visible,
    continuesFromPrevious,
    continuesToNext,
}: {
    visible: boolean;
    continuesFromPrevious: boolean;
    continuesToNext: boolean;
}) {
    const radius = RANGE_BAR_HEIGHT / 2;
    return (
        <View
            alignSelf="stretch"
            height={RANGE_BAR_HEIGHT}
            marginLeft={continuesFromPrevious ? 0 : 6}
            marginRight={continuesToNext ? 0 : 6}
            backgroundColor={visible ? MARK_APPEARANCE.range.color : "transparent"}
            opacity={0.55}
            borderTopLeftRadius={continuesFromPrevious ? 0 : radius}
            borderBottomLeftRadius={continuesFromPrevious ? 0 : radius}
            borderTopRightRadius={continuesToNext ? 0 : radius}
            borderBottomRightRadius={continuesToNext ? 0 : radius}
        />
    );
}

function MarkLegend() {
    return (
        <XStack flexWrap="wrap" columnGap="$3" rowGap="$1.5" paddingHorizontal="$2">
            {CALENDAR_MARK_ORDER.map((mark) => (
                <XStack key={mark} alignItems="center" gap={5}>
                    <LegendSwatch mark={mark} />
                    <Text fontFamily="$body" fontSize={11} color="$colorSecondary">
                        {MARK_APPEARANCE[mark].label}
                    </Text>
                </XStack>
            ))}
        </XStack>
    );
}

function SelectedDayPlans({
    dateKey,
    todayDateKey,
    rows,
    onOpenPlan,
    reducedMotion,
}: {
    dateKey: string;
    todayDateKey: string;
    rows: AgendaPlanRowData[];
    onOpenPlan: (planId: string) => void;
    reducedMotion: boolean;
}) {
    return (
        <YStack gap="$2">
            <Text
                fontFamily="$heading"
                fontSize={15}
                fontWeight="700"
                color="$color"
                paddingHorizontal="$4"
            >
                {dateKey === todayDateKey ? `Today · ${formatDayTitle(dateKey)}` : formatDayTitle(dateKey)}
            </Text>
            {rows.length === 0 ? (
                <Text fontFamily="$body" fontSize={14} color="$colorSecondary" paddingHorizontal="$4">
                    Nothing planned — you're free.
                </Text>
            ) : (
                rows.map((row) => (
                    <PlanCard
                        key={row.plan.id}
                        plan={row.plan}
                        variant="compact"
                        onPress={(plan) => onOpenPlan(plan.id)}
                        reducedMotion={reducedMotion}
                    />
                ))
            )}
        </YStack>
    );
}

export function PlanCalendarView({
    rows,
    onOpenPlan,
    reducedMotion,
}: {
    rows: AgendaPlanRowData[];
    onOpenPlan: (planId: string) => void;
    reducedMotion: boolean;
}) {
    const calendar = useMemo(() => buildPlanCalendar(rows), [rows]);
    const todayDateKey = toLocalDateKey(new Date());
    const [selectedDateKey, setSelectedDateKey] = useState(todayDateKey);

    const handleMonthChange = useCallback((month: DateData) => {
        setSelectedDateKey((current) =>
            current.startsWith(month.dateString.slice(0, 7)) ? current : month.dateString
        );
    }, []);

    const selection = useMemo<CalendarSelection>(
        () => ({ calendar, selectedDateKey, todayDateKey, onSelectDate: setSelectedDateKey }),
        [calendar, selectedDateKey, todayDateKey]
    );

    return (
        <ScrollView contentContainerStyle={{ paddingBottom: 100 }} showsVerticalScrollIndicator={false}>
            <CalendarSelectionContext.Provider value={selection}>
                <YStack paddingHorizontal="$3" gap="$2.5">
                    <Calendar
                        current={todayDateKey}
                        enableSwipeMonths
                        hideExtraDays
                        dayComponent={PlanCalendarDay}
                        onMonthChange={handleMonthChange}
                        theme={{
                            calendarBackground: "transparent",
                            monthTextColor: palette.espresso,
                            textSectionTitleColor: palette.bark,
                            arrowColor: palette.walnut,
                            textMonthFontSize: 17,
                            textMonthFontWeight: "700",
                            textDayHeaderFontSize: 12,
                        }}
                    />
                    <MarkLegend />
                </YStack>
            </CalendarSelectionContext.Provider>
            <View height={1} backgroundColor="$borderColorSubtle" marginVertical="$3" marginHorizontal="$4" />
            <SelectedDayPlans
                dateKey={selectedDateKey}
                todayDateKey={todayDateKey}
                rows={calendar.get(selectedDateKey)?.rows ?? []}
                onOpenPlan={onOpenPlan}
                reducedMotion={reducedMotion}
            />
        </ScrollView>
    );
}

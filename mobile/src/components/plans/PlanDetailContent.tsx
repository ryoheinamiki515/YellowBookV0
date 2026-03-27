import React, { useCallback, useRef, useEffect, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Keyboard,
    Platform,
    Pressable,
    ScrollView,
    Share,
    AccessibilityInfo,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View, useMedia } from "tamagui";
import { palette } from "../../../tamagui.config";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Calendar } from "react-native-calendars";
import type { CalendarProps, DateData } from "react-native-calendars";
import {
    BottomSheetHeader,
    BottomSheetHeaderAction,
    BottomSheetListRow,
    BottomSheetModal,
    BottomSheetSectionLabel,
    BottomSheetTextField,
} from "../BottomSheetPrimitives";
import { EditableText } from "../EditableText";
import { useConfirm } from "../ConfirmDialog";
import { DetailFooterAction } from "../DetailFooterAction";
import { PlanQuickActionRow } from "./PlanQuickActionRow";
import { formatPlanWhenDisplay } from "./PlanReadOnlyDetails";

import {
    useGetPlan,
    useListPlans,
    usePatchPlan,
    useDeletePlan,
    useAddPlanParticipant,
    useDeletePlanParticipant,
} from "../../api/generated/plans/plans";
import {
    useSharePlan,
    useGetShareStatus,
    useUnsubscribeFromPlan,
    usePatchPlanMembership,
    getGetShareStatusQueryKey,
} from "../../api/generated/sharing/sharing";
import {
    useListPeople,
    useCreatePerson,
} from "../../api/generated/people/people";
import type { SocialPlan } from "../../api/generated/model/socialPlan";
import type { SocialPlanPatchRequest } from "../../api/generated/model/socialPlanPatchRequest";
import type { SocialPlanTimePrecision } from "../../api/generated/model/socialPlanTimePrecision";
import type { Person } from "../../api/generated/model/person";
import { PlanMemberResponse } from "../../api/generated/model/planMemberResponse";
import { useReducedMotionPreference } from "../../lib/planHelpers";
import { Avatar } from "../Avatar";
import { getSharedPeopleForDisplay } from "../../lib/sharedPeople";
import {
    fromPlan,
    fromStorageFields,
    getDateKey,
    toStorageFields,
    type PlanWhen,
} from "../../lib/planWhen";
import {
    invalidatePeopleQueries,
    invalidatePlanQueries,
} from "../../lib/queryInvalidation";

type PlanPersonIdentity = {
    personId?: string | null;
    displayName?: string | null;
};

type StagedParticipantAdd =
    | {
          kind: "existing-person";
          draftId: string;
          personId: string;
          displayName: string;
      }
    | {
          kind: "new-person";
          draftId: string;
          displayName: string;
      };

type DisplayPlanParticipantChip = {
    key: string;
    source: "server" | "staged-existing-person" | "staged-new-person";
    participantId?: string;
    personId?: string | null;
    displayName: string;
};

function normalizePersonDisplayName(
    name: string | null | undefined
): string | null {
    const normalized = name?.trim().toLowerCase();
    return normalized ? normalized : null;
}

function mergeUniquePlanPeople(
    ...groups: PlanPersonIdentity[][]
): PlanPersonIdentity[] {
    const merged: PlanPersonIdentity[] = [];
    const seenPersonIds = new Set<string>();
    const seenDisplayNames = new Set<string>();

    for (const group of groups) {
        for (const person of group) {
            const personId = person.personId ?? null;
            const displayName = person.displayName?.trim() || null;
            const normalizedDisplayName = normalizePersonDisplayName(displayName);

            if (!personId && !normalizedDisplayName) continue;

            const isDuplicate =
                (personId ? seenPersonIds.has(personId) : false) ||
                (normalizedDisplayName
                    ? seenDisplayNames.has(normalizedDisplayName)
                    : false);

            if (isDuplicate) continue;

            if (personId) seenPersonIds.add(personId);
            if (normalizedDisplayName) {
                seenDisplayNames.add(normalizedDisplayName);
            }

            merged.push({
                personId,
                displayName,
            });
        }
    }

    return merged;
}

function getErrorStatusCode(error: unknown): number | null {
    if (!error || typeof error !== "object") return null;
    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : null;
}

type PlanEditableDraft = {
    intentText: string;
    locationText: string;
    contextNote: string;
    timePrecision: SocialPlanTimePrecision;
    anchorStart: string | null;
    anchorEnd: string | null;
    timezone: string | null;
};

function buildPlanEditableDraft(plan: SocialPlan): PlanEditableDraft {
    return {
        intentText: plan.intentText ?? "",
        locationText: plan.locationText ?? "",
        contextNote: plan.contextNote ?? "",
        timePrecision: plan.timePrecision,
        anchorStart: plan.anchorStart ?? null,
        anchorEnd: plan.anchorEnd ?? null,
        timezone: plan.timezone ?? null,
    };
}

function arePlanEditableDraftsEqual(
    a: PlanEditableDraft,
    b: PlanEditableDraft
): boolean {
    return (
        a.intentText === b.intentText &&
        a.locationText === b.locationText &&
        a.contextNote === b.contextNote &&
        a.timePrecision === b.timePrecision &&
        a.anchorStart === b.anchorStart &&
        a.anchorEnd === b.anchorEnd &&
        a.timezone === b.timezone
    );
}

function normalizeOptionalPlanText(value: string): string | null {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}

function normalizePlanDraftForSave(draft: PlanEditableDraft): PlanEditableDraft {
    const when = fromStorageFields({
        timePrecision: draft.timePrecision,
        anchorStart: draft.anchorStart,
        anchorEnd: draft.anchorEnd,
        timezone: draft.timezone,
    });
    const normalized = toStorageFields(when);

    return {
        ...draft,
        intentText: draft.intentText.trim(),
        locationText: normalizeOptionalPlanText(draft.locationText) ?? "",
        contextNote: normalizeOptionalPlanText(draft.contextNote) ?? "",
        ...normalized,
    };
}

function buildPlanPatchFromDraft(draft: PlanEditableDraft): SocialPlanPatchRequest {
    const normalizedDraft = normalizePlanDraftForSave(draft);

    return {
        intentText: normalizedDraft.intentText,
        locationText: normalizeOptionalPlanText(normalizedDraft.locationText),
        contextNote: normalizeOptionalPlanText(normalizedDraft.contextNote),
        timePrecision: normalizedDraft.timePrecision,
        anchorStart: normalizedDraft.anchorStart,
        anchorEnd: normalizedDraft.anchorEnd,
        timezone: normalizedDraft.timezone,
    };
}

// ---------------------------------------------------------------------------
// FieldRow — tappable row with label + value/placeholder
// ---------------------------------------------------------------------------

function FieldRow({
    label,
    value,
    placeholder,
    onPress,
}: {
    label: string;
    value: string | null;
    placeholder: string;
    onPress?: () => void;
}) {
    const content = (
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
    );

    if (!onPress) return content;

    return (
        <Pressable onPress={onPress} accessibilityRole="button">
            {content}
        </Pressable>
    );
}

type WindowRangeSelectionStep = "start" | "end";
type CalendarMarkedDates = NonNullable<CalendarProps["markedDates"]>;
type WindowRangeMarking = CalendarMarkedDates[string];

const RANGE_ENDPOINT_COLOR = palette.terracottaDark;
const RANGE_TEXT_COLOR = "#FFFFFF";
const RANGE_CALENDAR_SURFACE_COLOR = palette.parchment;
const RANGE_CALENDAR_TEXT_COLOR = palette.espresso;
const RANGE_CALENDAR_MUTED_TEXT_COLOR = palette.driftwood;
const RANGE_CALENDAR_DISABLED_TEXT_COLOR = palette.stone;

const EXISTING_PLAN_DOT_COLOR = palette.amberLight;

function buildExistingPlanMarkedDates(
    plans: SocialPlan[],
    excludePlanId: string
): CalendarMarkedDates {
    const markings: CalendarMarkedDates = {};
    for (const plan of plans) {
        if (plan.id === excludePlanId || plan.state !== "OPEN") continue;
        const key = getDateKey(fromPlan(plan));
        if (key && !markings[key]) {
            markings[key] = { marked: true, dotColor: EXISTING_PLAN_DOT_COLOR };
        }
    }
    return markings;
}

function formatWindowPickerDate(date: Date): string {
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
    });
}

function normalizeDateOnly(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function compareDateOnly(a: Date, b: Date): number {
    return normalizeDateOnly(a).getTime() - normalizeDateOnly(b).getTime();
}

function toCalendarDateKey(date: Date): string {
    const local = normalizeDateOnly(date);
    const year = local.getFullYear();
    const month = `${local.getMonth() + 1}`.padStart(2, "0");
    const day = `${local.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function dateFromCalendarPress(day: DateData): Date {
    return new Date(day.year, day.month - 1, day.day);
}

function buildWindowRangeMarkedDates(
    startDate: Date,
    endDate: Date
): CalendarMarkedDates {
    const start = normalizeDateOnly(startDate);
    const end = normalizeDateOnly(endDate);
    const markings: CalendarMarkedDates = {};
    const cursor = new Date(start);

    while (cursor <= end) {
        const key = toCalendarDateKey(cursor);
        const isStart = compareDateOnly(cursor, start) === 0;
        const isEnd = compareDateOnly(cursor, end) === 0;

        const marking: WindowRangeMarking = {
            color: RANGE_ENDPOINT_COLOR,
            textColor: RANGE_TEXT_COLOR,
        };

        if (isStart) marking.startingDay = true;
        if (isEnd) marking.endingDay = true;

        markings[key] = marking;
        cursor.setDate(cursor.getDate() + 1);
    }

    return markings;
}

function WindowRangeCalendarSelector({
    startDate,
    endDate,
    selectionStep,
    onSelectionStepChange,
    onStartDateChange,
    onEndDateChange,
    existingPlanDots,
}: {
    startDate: Date;
    endDate: Date;
    selectionStep: WindowRangeSelectionStep;
    onSelectionStepChange: (step: WindowRangeSelectionStep) => void;
    onStartDateChange: (date: Date) => void;
    onEndDateChange: (date: Date) => void;
    existingPlanDots?: CalendarMarkedDates;
}) {
    const rangeMarkings = buildWindowRangeMarkedDates(startDate, endDate);
    const markedDates: CalendarMarkedDates = { ...existingPlanDots };
    for (const [key, value] of Object.entries(rangeMarkings)) {
        markedDates[key] = { ...markedDates[key], ...value };
    }

    const handleDayPress = useCallback(
        (day: DateData) => {
            const selectedDate = dateFromCalendarPress(day);

            if (selectionStep === "start") {
                onStartDateChange(selectedDate);
                onEndDateChange(selectedDate);
                onSelectionStepChange("end");
                return;
            }

            if (compareDateOnly(selectedDate, startDate) < 0) {
                onStartDateChange(selectedDate);
                onEndDateChange(selectedDate);
                onSelectionStepChange("end");
                return;
            }

            onEndDateChange(selectedDate);
            onSelectionStepChange("start");
        },
        [
            onEndDateChange,
            onSelectionStepChange,
            onStartDateChange,
            selectionStep,
            startDate,
        ]
    );

    const isAwaitingEndSelection = selectionStep === "end";
    const hasMultiDayRange = compareDateOnly(startDate, endDate) !== 0;
    const helperText = isAwaitingEndSelection
        ? "Tap the latest date to finish the window."
        : hasMultiDayRange
          ? "Range selected. Tap any date to start a new range."
          : "Tap a date to start your range.";

    const renderSummaryCard = useCallback(
        (title: string, value: Date) => (
            <YStack
                flex={1}
                padding="$3"
                borderRadius="$4"
                borderWidth={1}
                borderColor="$borderColor"
                backgroundColor="$backgroundStrong"
                gap="$1"
            >
                <Text
                    fontFamily="$body"
                    fontSize="$2"
                    fontWeight="600"
                    color="$colorSecondary"
                    textTransform="uppercase"
                    letterSpacing={0.8}
                >
                    {title}
                </Text>
                <Text
                    fontFamily="$body"
                    fontSize="$4"
                    fontWeight="600"
                    color="$color"
                >
                    {formatWindowPickerDate(value)}
                </Text>
            </YStack>
        ),
        []
    );

    return (
        <YStack gap="$3">
            <Text fontFamily="$body" fontSize="$3" color="$colorSecondary">
                {helperText}
            </Text>

            <XStack gap="$2">
                {renderSummaryCard("Earliest", startDate)}
                {renderSummaryCard("Latest", endDate)}
            </XStack>

            <YStack
                borderWidth={1}
                borderColor="$borderColor"
                borderRadius="$5"
                overflow="hidden"
                backgroundColor="$backgroundStrong"
                padding="$2.5"
            >
                <Calendar
                    current={toCalendarDateKey(startDate)}
                    enableSwipeMonths
                    hideExtraDays
                    markingType="period"
                    markedDates={markedDates}
                    onDayPress={handleDayPress}
                    headerStyle={{
                        borderBottomWidth: 0,
                        paddingBottom: 6,
                        marginBottom: 2,
                    }}
                    theme={{
                        calendarBackground: RANGE_CALENDAR_SURFACE_COLOR,
                        monthTextColor: RANGE_CALENDAR_TEXT_COLOR,
                        dayTextColor: RANGE_CALENDAR_TEXT_COLOR,
                        textDisabledColor: RANGE_CALENDAR_DISABLED_TEXT_COLOR,
                        textInactiveColor: RANGE_CALENDAR_DISABLED_TEXT_COLOR,
                        textSectionTitleColor: RANGE_CALENDAR_MUTED_TEXT_COLOR,
                        todayTextColor: "#F0B881",
                        arrowColor: "#F0B881",
                        textDayFontSize: 16,
                        textMonthFontSize: 17,
                        textDayHeaderFontSize: 12,
                    }}
                    style={{ width: "100%" }}
                />
            </YStack>
        </YStack>
    );
}

// ---------------------------------------------------------------------------
// WhenSheet — bottom sheet for time picking
// ---------------------------------------------------------------------------

function WhenSheet({
    open,
    onOpenChange,
    currentPrecision,
    currentAnchorStart,
    currentAnchorEnd,
    onSave,
    otherPlans,
    planId,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPrecision: SocialPlanTimePrecision;
    currentAnchorStart: string | null | undefined;
    currentAnchorEnd: string | null | undefined;
    onSave: (when: PlanWhen) => void;
    otherPlans: SocialPlan[];
    planId: string;
}) {
    const [mode, setMode] = useState<"menu" | "date" | "window">("menu");
    const [includeTime, setIncludeTime] = useState(false);
    const [pickedDate, setPickedDate] = useState(
        currentAnchorStart ? new Date(currentAnchorStart) : new Date()
    );
    const [windowStart, setWindowStart] = useState(new Date());
    const [windowEnd, setWindowEnd] = useState(new Date());
    const [windowSelectionStep, setWindowSelectionStep] =
        useState<WindowRangeSelectionStep>("start");

    useEffect(() => {
        if (open) {
            setMode("menu");
            const initial = currentAnchorStart ? new Date(currentAnchorStart) : new Date();
            const initialEnd = currentAnchorEnd ? new Date(currentAnchorEnd) : initial;
            setPickedDate(initial);
            setIncludeTime(currentPrecision === "EXACT");
            setWindowStart(initial);
            setWindowEnd(initialEnd < initial ? initial : initialEnd);
            setWindowSelectionStep("start");
        }
    }, [open, currentAnchorStart, currentAnchorEnd, currentPrecision]);

    const handlePickDate = useCallback(() => {
        setMode("date");
    }, []);

    const handlePickWindow = useCallback(() => {
        setMode("window");
    }, []);

    const handleWhenever = useCallback(() => {
        onSave({ kind: "whenever" });
        onOpenChange(false);
    }, [onSave, onOpenChange]);

    const handleDateConfirm = useCallback(() => {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
        if (includeTime) {
            onSave({ kind: "exactTime", datetime: pickedDate.toISOString(), timezone: tz });
        } else {
            onSave({ kind: "day", date: pickedDate.toISOString(), timezone: tz });
        }
        onOpenChange(false);
    }, [includeTime, pickedDate, onSave, onOpenChange]);

    const handleWindowConfirm = useCallback(() => {
        if (windowEnd < windowStart) {
            Alert.alert(
                "Window is out of order",
                "The latest date has to be the same as or after the earliest date.",
            );
            return;
        }
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
        onSave({ kind: "window", start: windowStart.toISOString(), end: windowEnd.toISOString(), timezone: tz });
        onOpenChange(false);
    }, [windowStart, windowEnd, onSave, onOpenChange]);

    const renderBackConfirmButtons = useCallback(
        (onConfirm: () => void) => (
            <XStack gap="$3" width="100%">
                <YStack
                    flex={1}
                    height="$11"
                    borderRadius="$6"
                    borderWidth={1}
                    borderColor="$borderColor"
                    justifyContent="center"
                    alignItems="center"
                    onPress={() => setMode("menu")}
                    pressStyle={{ opacity: 0.7 }}
                    cursor="pointer"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        color="$colorSecondary"
                    >
                        Back
                    </Text>
                </YStack>
                <YStack
                    flex={2}
                    height="$11"
                    borderRadius="$6"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    onPress={onConfirm}
                    pressStyle={{
                        scale: 0.98,
                        backgroundColor: "$accentBackgroundPress",
                    }}
                    // @ts-ignore
                    animation="fast"
                    cursor="pointer"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        fontWeight="600"
                        color="$accentColor"
                    >
                        Confirm
                    </Text>
                </YStack>
            </XStack>
        ),
        []
    );

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <Text
                fontFamily="$heading"
                fontSize="$8"
                color="$color"
                marginBottom="$4"
            >
                When?
            </Text>

            {mode === "menu" ? (
                <YStack gap="$3">
                    <Pressable onPress={handlePickDate}>
                        <YStack
                            backgroundColor="$backgroundStrong"
                            padding="$4"
                            borderRadius="$5"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$5"
                                fontWeight="500"
                                color="$color"
                            >
                                Pick a date
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorTertiary"
                                marginTop="$1"
                            >
                                Choose a date, optionally add a time
                            </Text>
                        </YStack>
                    </Pressable>

                    <Pressable onPress={handlePickWindow}>
                        <YStack
                            backgroundColor="$backgroundStrong"
                            padding="$4"
                            borderRadius="$5"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$5"
                                fontWeight="500"
                                color="$color"
                            >
                                Rough window
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorTertiary"
                                marginTop="$1"
                            >
                                Set an earliest and latest date
                            </Text>
                        </YStack>
                    </Pressable>

                    <Pressable onPress={handleWhenever}>
                        <YStack
                            backgroundColor="$backgroundStrong"
                            padding="$4"
                            borderRadius="$5"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$5"
                                fontWeight="500"
                                color="$color"
                            >
                                Whenever
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorTertiary"
                                marginTop="$1"
                            >
                                We&apos;ll figure it out later
                            </Text>
                        </YStack>
                    </Pressable>
                </YStack>
            ) : mode === "window" ? (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <YStack gap="$4">
                        <WindowRangeCalendarSelector
                            startDate={windowStart}
                            endDate={windowEnd}
                            selectionStep={windowSelectionStep}
                            onSelectionStepChange={setWindowSelectionStep}
                            onStartDateChange={setWindowStart}
                            onEndDateChange={setWindowEnd}
                            existingPlanDots={buildExistingPlanMarkedDates(otherPlans, planId)}
                        />

                        {renderBackConfirmButtons(handleWindowConfirm)}
                    </YStack>
                </ScrollView>
            ) : (
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <YStack gap="$4">
                        <YStack
                            borderWidth={1}
                            borderColor="$borderColor"
                            borderRadius="$5"
                            overflow="hidden"
                            backgroundColor="$backgroundStrong"
                            padding="$2.5"
                        >
                            <Calendar
                                current={toCalendarDateKey(pickedDate)}
                                enableSwipeMonths
                                hideExtraDays
                                markedDates={(() => {
                                    const dots = buildExistingPlanMarkedDates(otherPlans, planId);
                                    const selectedKey = toCalendarDateKey(pickedDate);
                                    dots[selectedKey] = {
                                        ...dots[selectedKey],
                                        selected: true,
                                        selectedColor: RANGE_ENDPOINT_COLOR,
                                    };
                                    return dots;
                                })()}
                                onDayPress={(day: DateData) => {
                                    setPickedDate(dateFromCalendarPress(day));
                                }}
                                headerStyle={{
                                    borderBottomWidth: 0,
                                    paddingBottom: 6,
                                    marginBottom: 2,
                                }}
                                theme={{
                                    calendarBackground: RANGE_CALENDAR_SURFACE_COLOR,
                                    monthTextColor: RANGE_CALENDAR_TEXT_COLOR,
                                    dayTextColor: RANGE_CALENDAR_TEXT_COLOR,
                                    textDisabledColor: RANGE_CALENDAR_DISABLED_TEXT_COLOR,
                                    textInactiveColor: RANGE_CALENDAR_DISABLED_TEXT_COLOR,
                                    textSectionTitleColor: RANGE_CALENDAR_MUTED_TEXT_COLOR,
                                    todayTextColor: EXISTING_PLAN_DOT_COLOR,
                                    arrowColor: EXISTING_PLAN_DOT_COLOR,
                                    selectedDayBackgroundColor: RANGE_ENDPOINT_COLOR,
                                    selectedDayTextColor: RANGE_TEXT_COLOR,
                                    textDayFontSize: 16,
                                    textMonthFontSize: 17,
                                    textDayHeaderFontSize: 12,
                                }}
                                style={{ width: "100%" }}
                            />
                        </YStack>

                        {(() => {
                            const selectedKey = toCalendarDateKey(pickedDate);
                            const plansOnDate = otherPlans.filter(
                                (p) =>
                                    p.id !== planId &&
                                    p.state === "OPEN" &&
                                    getDateKey(fromPlan(p)) === selectedKey
                            );
                            if (plansOnDate.length === 0) return null;
                            const names = plansOnDate.map((p) => p.intentText).join(", ");
                            return (
                                <XStack
                                    backgroundColor="rgba(240, 184, 129, 0.22)"
                                    borderRadius="$4"
                                    padding="$3"
                                    gap="$2.5"
                                    alignItems="flex-start"
                                >
                                    <Text fontSize={14} marginTop={1}>
                                        {"*"}
                                    </Text>
                                    <YStack flex={1} gap="$1">
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$2"
                                            color={EXISTING_PLAN_DOT_COLOR}
                                            fontWeight="500"
                                        >
                                            {plansOnDate.length === 1
                                                ? "You have another plan on this date"
                                                : `You have ${plansOnDate.length} other plans on this date`}
                                        </Text>
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$2"
                                            color="$colorTertiary"
                                            numberOfLines={2}
                                        >
                                            {names}
                                        </Text>
                                    </YStack>
                                </XStack>
                            );
                        })()}

                        <Pressable onPress={() => setIncludeTime((v) => !v)}>
                            <XStack
                                alignItems="center"
                                gap="$2"
                                paddingVertical="$2"
                                alignSelf="flex-start"
                            >
                                <View
                                    width={20}
                                    height={20}
                                    borderRadius={4}
                                    borderWidth={1.5}
                                    borderColor={includeTime ? "$accentBackground" : "$borderColor"}
                                    backgroundColor={includeTime ? "$accentBackground" : "transparent"}
                                    justifyContent="center"
                                    alignItems="center"
                                >
                                    {includeTime ? (
                                        <Text fontSize={12} color="$accentColor" fontWeight="700">
                                            ✓
                                        </Text>
                                    ) : null}
                                </View>
                                <Text
                                    fontFamily="$body"
                                    fontSize="$3"
                                    color="$colorSecondary"
                                >
                                    Include a specific time
                                </Text>
                            </XStack>
                        </Pressable>

                        {includeTime ? (
                            <DateTimePicker
                                value={pickedDate}
                                mode="time"
                                display="spinner"
                                themeVariant="light"
                                onChange={(_event, date) => {
                                    if (date) setPickedDate(date);
                                }}
                                style={{ width: "100%" }}
                            />
                        ) : null}

                        {renderBackConfirmButtons(handleDateConfirm)}
                    </YStack>
                </ScrollView>
            )}
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// AddPersonSheet — bottom sheet for adding participants
// ---------------------------------------------------------------------------

function AddPersonSheet({
    open,
    onOpenChange,
    currentParticipants,
    onStageExistingPerson,
    onStageNewPerson,
    onRemoveParticipant,
    disabled = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentParticipants: PlanPersonIdentity[];
    onStageExistingPerson: (person: Person) => void;
    onStageNewPerson: (displayName: string) => void;
    onRemoveParticipant: (identity: PlanPersonIdentity) => void;
    disabled?: boolean;
}) {
    const [searchText, setSearchText] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");

    useEffect(() => {
        if (!open) {
            setSearchText("");
            setDebouncedQ("");
        }
    }, [open]);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQ(searchText.trim());
        }, 300);
        return () => clearTimeout(timer);
    }, [searchText]);

    // Always fetch people — show all when no search, filter when searching
    const { data: peopleResponse } = useListPeople(
        debouncedQ ? { q: debouncedQ } : undefined
    );

    const allPeople: Person[] =
        peopleResponse?.data && "data" in peopleResponse.data
            ? (peopleResponse.data as { data: Person[] }).data
            : [];

    const allPlanPeople = mergeUniquePlanPeople(currentParticipants);
    const existingPersonIds = new Set(
        allPlanPeople
            .map((p) => p.personId)
            .filter(Boolean) as string[]
    );
    const existingDisplayNames = new Set(
        allPlanPeople
            .map((p) => normalizePersonDisplayName(p.displayName))
            .filter(Boolean) as string[]
    );

    const isPersonOnPlan = useCallback(
        (person: Person): boolean => {
            const normalizedName = normalizePersonDisplayName(person.displayName);
            return (
                existingPersonIds.has(person.id) ||
                !!(normalizedName && existingDisplayNames.has(normalizedName))
            );
        },
        [existingPersonIds, existingDisplayNames]
    );

    const allOnPlan = allPlanPeople.filter(
        (p): p is { personId?: string | null; displayName: string } =>
            Boolean(p.displayName)
    );

    const handleTogglePerson = useCallback(
        (person: Person) => {
            if (isPersonOnPlan(person)) {
                onRemoveParticipant({
                    personId: person.id,
                    displayName: person.displayName,
                });
            } else {
                onStageExistingPerson(person);
            }
            setSearchText("");
        },
        [isPersonOnPlan, onRemoveParticipant, onStageExistingPerson]
    );

    const handleCreateAndAdd = useCallback(() => {
        const name = searchText.trim();
        if (!name) return;
        onStageNewPerson(name);
        setSearchText("");
    }, [searchText, onStageNewPerson]);

    // Check if typed name already exists as a participant or matches an existing person
    const normalizedSearch = normalizePersonDisplayName(searchText);
    const nameAlreadyOnPlan = normalizedSearch
        ? existingDisplayNames.has(normalizedSearch)
        : false;
    const exactMatchInLibrary = normalizedSearch
        ? allPeople.find(
              (p) =>
                  normalizePersonDisplayName(p.displayName) === normalizedSearch
          )
        : null;

    return (
        <BottomSheetModal
            open={open}
            onOpenChange={onOpenChange}
            minHeight={300}
        >
            <BottomSheetHeader
                title="Add someone"
                subtitle="Search your People library or type a new name. Changes save when you tap Save."
                trailingAction={
                    <BottomSheetHeaderAction
                        label="Done"
                        onPress={() => {
                            Keyboard.dismiss();
                            onOpenChange(false);
                        }}
                        accessibilityLabel="Done adding people"
                    />
                }
            />

            <BottomSheetTextField
                placeholder="Search or type a name..."
                placeholderTextColor="$placeholderColor"
                value={searchText}
                onChangeText={setSearchText}
                autoFocus
                accessibilityLabel="Search for a person"
            />

            {/* People already on this plan */}
            {allOnPlan.length > 0 && (
                <YStack marginTop="$3">
                    <BottomSheetSectionLabel>
                        On this plan
                    </BottomSheetSectionLabel>
                    <XStack
                        flexWrap="wrap"
                        gap="$1.5"
                        marginBottom="$1"
                    >
                        {allOnPlan.map((person) => {
                            const name = person.displayName;
                            const nameKey =
                                normalizePersonDisplayName(name) || name;
                            const chipKey = person.personId || `name:${nameKey}`;

                            return (
                                <Pressable
                                    key={chipKey}
                                    onPress={() => onRemoveParticipant(person)}
                                    disabled={disabled}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Remove ${name} from this plan`}
                                >
                                    <XStack
                                        alignItems="center"
                                        gap="$1.5"
                                        backgroundColor="$backgroundStrong"
                                        borderWidth={1}
                                        borderColor="$borderColorSubtle"
                                        paddingHorizontal="$2.5"
                                        paddingVertical="$1"
                                        borderRadius="$10"
                                    >
                                        <Avatar name={name} size={20} />
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$2"
                                            color="$color"
                                        >
                                            {name}
                                        </Text>
                                        <View
                                            width={14}
                                            height={14}
                                            borderRadius={7}
                                            backgroundColor="$colorTertiary"
                                            justifyContent="center"
                                            alignItems="center"
                                        >
                                            <Text
                                                fontFamily="$body"
                                                fontSize={9}
                                                fontWeight="700"
                                                color="white"
                                                lineHeight={11}
                                            >
                                                {"×"}
                                            </Text>
                                        </View>
                                    </XStack>
                                </Pressable>
                            );
                        })}
                    </XStack>
                </YStack>
            )}

                <ScrollView
                    style={{ marginTop: 12, maxHeight: 240 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <YStack gap="$2" paddingBottom="$1">
                        {allPeople.map((person) => {
                            const onPlan = isPersonOnPlan(person);
                            return (
                                <BottomSheetListRow
                                    key={person.id}
                                    onPress={() => handleTogglePerson(person)}
                                    disabled={disabled}
                                    accessibilityLabel={
                                        onPlan
                                            ? `Remove ${person.displayName} from this plan`
                                            : `Add ${person.displayName} to this plan`
                                    }
                                    leading={
                                        <Avatar name={person.displayName} size={32} />
                                    }
                                    title={person.displayName}
                                    subtitle={
                                        person.pronouns || person.neighborhood
                                            ? [person.pronouns, person.neighborhood]
                                                  .filter(Boolean)
                                                  .join(" · ")
                                            : undefined
                                    }
                                    trailing={
                                        onPlan ? (
                                            <Text
                                                fontFamily="$body"
                                                fontSize="$4"
                                                color="$accentColor"
                                            >
                                                {"✓"}
                                            </Text>
                                        ) : undefined
                                    }
                                />
                            );
                        })}

                        {/* "Already on this plan" hint */}
                        {searchText.trim().length > 0 && nameAlreadyOnPlan && (
                            <BottomSheetListRow
                                tone="muted"
                                title={searchText.trim()}
                                subtitle="Already on this plan"
                                leading={
                                    <View
                                        width={32}
                                        height={32}
                                        borderRadius={16}
                                        backgroundColor="$surface"
                                        justifyContent="center"
                                        alignItems="center"
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize={13}
                                            fontWeight="600"
                                            color="$colorTertiary"
                                        >
                                            {searchText.trim().charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                }
                            />
                        )}

                        {/* Create new person + add to plan */}
                        {searchText.trim().length > 0 &&
                            !exactMatchInLibrary &&
                            !nameAlreadyOnPlan && (
                            <BottomSheetListRow
                                onPress={handleCreateAndAdd}
                                disabled={disabled}
                                tone="accent"
                                accessibilityLabel={`Create ${searchText.trim()} and add to this plan`}
                                leading={
                                    <View
                                        width={32}
                                        height={32}
                                        borderRadius={16}
                                        backgroundColor="$accentBackground"
                                        justifyContent="center"
                                        alignItems="center"
                                    >
                                        <Text
                                            fontFamily="$heading"
                                            fontSize="$5"
                                            color="$accentColor"
                                        >
                                            +
                                        </Text>
                                    </View>
                                }
                                title={
                                    disabled
                                        ? "Saving..."
                                        : `Add "${searchText.trim()}"`
                                }
                                subtitle="Will save to your People library and add to this plan when you save"
                                trailing={
                                    <XStack
                                        borderRadius="$10"
                                        backgroundColor="$backgroundStrong"
                                        borderWidth={1}
                                        borderColor="$borderColorSubtle"
                                        paddingHorizontal="$2.5"
                                        paddingVertical="$1"
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$2"
                                            color="$colorSecondary"
                                            fontWeight="600"
                                        >
                                            New
                                        </Text>
                                    </XStack>
                                }
                            />
                        )}

                        {/* Empty state when no people exist */}
                        {allPeople.length === 0 &&
                            !searchText.trim() && (
                                <YStack
                                    padding="$4"
                                    alignItems="center"
                                    gap="$1"
                                    backgroundColor="$backgroundStrong"
                                    borderRadius="$4"
                                >
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$3"
                                        color="$colorTertiary"
                                        textAlign="center"
                                    >
                                        No people in your library yet.
                                    </Text>
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$3"
                                        color="$colorTertiary"
                                        textAlign="center"
                                    >
                                        Type a name to create one.
                                    </Text>
                                </YStack>
                            )}
                    </YStack>
                </ScrollView>
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// Detail screen
// ---------------------------------------------------------------------------

type PlanDetailContentProps = {
    planId: string;
    focusTarget?: string;
    onClose: () => void;
    showNavBar?: boolean;
};

function responseStatusLabel(response?: string): string {
    switch (response) {
        case "ACCEPTED": return "Shared with you \u00b7 Going";
        case "MAYBE":    return "Shared with you \u00b7 Maybe";
        case "DECLINED": return "Shared with you \u00b7 Can\u2019t go";
        default:         return "Shared with you";
    }
}

export function PlanDetailContent({
    planId: id,
    focusTarget: focusProp,
    onClose,
    showNavBar = true,
}: PlanDetailContentProps) {
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const media = useMedia();
    const isDesktopWeb = media.lg && Platform.OS === "web";
    const reducedMotion = useReducedMotionPreference();
    const useNativeDriver = Platform.OS !== "web";

    const { data: planResponse, isLoading, isError } = useGetPlan(id!);
    const patchPlan = usePatchPlan();
    const deletePlan = useDeletePlan();
    const addParticipant = useAddPlanParticipant();
    const deleteParticipant = useDeletePlanParticipant();
    const createPerson = useCreatePerson();
    const sharePlanMutation = useSharePlan();
    const unsubscribeMutation = useUnsubscribeFromPlan();
    const membershipMutation = usePatchPlanMembership();

    const plan: SocialPlan | undefined =
        planResponse?.data && "data" in planResponse.data
            ? (planResponse.data as { data: SocialPlan }).data
            : undefined;

    const { data: ownedPlansResponse } = useListPlans({
        state: ["OPEN"],
        scope: "owned",
    });
    const otherPlans: SocialPlan[] =
        ownedPlansResponse?.data && "data" in ownedPlansResponse.data
            ? (ownedPlansResponse.data as { data: SocialPlan[] }).data
            : [];

    const isSubscriber = plan?.role === "member";
    const isOwner = plan?.role === "owner";
    const permissions = (plan as any)?.permissions as {
        canEdit?: boolean;
        canChangeState?: boolean;
        canDelete?: boolean;
        canShare?: boolean;
        canRespond?: boolean;
        canDiscuss?: boolean;
        canLeave?: boolean;
    } | undefined;
    const membership = (plan as any)?.membership as {
        role?: string;
        response?: string;
        privateNote?: string | null;
        markedDoneAt?: string | null;
    } | undefined;
    const { data: shareStatusResponse } = useGetShareStatus(id, {
        query: {
            enabled: Boolean(plan && isOwner),
        },
    });
    const shareStatus =
        shareStatusResponse?.data && "data" in shareStatusResponse.data
            ? (shareStatusResponse.data as {
                  data: { shareToken?: { token?: string | null } | null } | null;
              }).data
            : null;
    const hasActiveShareLink = Boolean(shareStatus?.shareToken?.token);

    // Bottom sheet states
    const [whenSheetOpen, setWhenSheetOpen] = useState(false);
    const [addPersonSheetOpen, setAddPersonSheetOpen] = useState(false);
    const [planDraft, setPlanDraft] = useState<PlanEditableDraft | null>(null);
    const [removedParticipantIds, setRemovedParticipantIds] = useState<string[]>(
        []
    );
    const [stagedParticipantAdds, setStagedParticipantAdds] = useState<
        StagedParticipantAdd[]
    >([]);
    const didApplyInitialFocusRef = useRef(false);
    const participantDraftIdCounterRef = useRef(0);

    const focusTarget = focusProp;
    const serverPlanDraft = plan ? buildPlanEditableDraft(plan) : null;
    const effectivePlanDraft = planDraft ?? serverPlanDraft;
    const isFieldDraftDirty = Boolean(
        planDraft &&
            serverPlanDraft &&
            !arePlanEditableDraftsEqual(planDraft, serverPlanDraft)
    );
    const hasPendingParticipantChanges =
        removedParticipantIds.length > 0 || stagedParticipantAdds.length > 0;
    const isDraftDirty = isFieldDraftDirty || hasPendingParticipantChanges;
    const canSaveDraft = Boolean(effectivePlanDraft?.intentText.trim()) && isDraftDirty;

    useEffect(() => {
        if (didApplyInitialFocusRef.current) return;
        if (!plan) return;

        if (focusTarget === "when") {
            setWhenSheetOpen(true);
        } else if (focusTarget === "people") {
            setAddPersonSheetOpen(true);
        }

        didApplyInitialFocusRef.current = true;
    }, [plan, focusTarget]);

    useEffect(() => {
        if (!plan) return;
        if (planDraft && isFieldDraftDirty) return;

        const nextDraft = buildPlanEditableDraft(plan);
        if (planDraft && arePlanEditableDraftsEqual(planDraft, nextDraft)) {
            return;
        }

        setPlanDraft(nextDraft);
    }, [plan, planDraft, isFieldDraftDirty]);

    // Entrance animation
    const fadeAnim = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
    const slideAnim = useRef(
        new Animated.Value(reducedMotion ? 0 : 24)
    ).current;

    useEffect(() => {
        if (reducedMotion) return;
        Animated.parallel([
            Animated.timing(fadeAnim, {
                toValue: 1,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
            Animated.timing(slideAnim, {
                toValue: 0,
                duration: 350,
                easing: Easing.out(Easing.cubic),
                useNativeDriver,
            }),
        ]).start();
    }, []);

    const invalidateAll = useCallback(() => {
        void invalidatePlanQueries(queryClient);
    }, [queryClient]);

    const patchPlanDraft = useCallback(
        (patch: Partial<PlanEditableDraft>) => {
            setPlanDraft((currentDraft) => {
                const baseDraft = currentDraft ?? serverPlanDraft;
                return baseDraft ? { ...baseDraft, ...patch } : currentDraft;
            });
        },
        [serverPlanDraft]
    );

    const handleDraftIntentChange = useCallback(
        (text: string) => {
            patchPlanDraft({ intentText: text });
        },
        [patchPlanDraft]
    );

    const handleDraftLocationChange = useCallback(
        (text: string) => {
            patchPlanDraft({ locationText: text });
        },
        [patchPlanDraft]
    );

    const handleDraftNoteChange = useCallback(
        (text: string) => {
            patchPlanDraft({ contextNote: text });
        },
        [patchPlanDraft]
    );

    const handleDraftWhenChange = useCallback(
        (when: PlanWhen) => {
            const fields = toStorageFields(when);
            patchPlanDraft(fields);
        },
        [patchPlanDraft]
    );

    const handleCancelOrBack = useCallback(async () => {
        if (!isDraftDirty) {
            onClose();
            return;
        }

        const confirmed = await confirm({
            title: "Discard plan edits?",
            message: "Your changes haven't been saved yet.",
            confirmLabel: "Discard",
            cancelLabel: "Keep Editing",
            destructive: true,
        });
        if (confirmed) {
            Keyboard.dismiss();
            onClose();
        }
    }, [isDraftDirty, onClose, confirm]);

    const handleSavePlanDraft = useCallback(async () => {
        if (!effectivePlanDraft || !id) return;
        if (!isDraftDirty) return;

        const normalizedDraft = normalizePlanDraftForSave(effectivePlanDraft);
        if (!normalizedDraft.intentText) {
            confirm({ title: "Plan needs a title", message: "Add what the plan is first.", confirmLabel: "OK" });
            return;
        }

        Keyboard.dismiss();
        setPlanDraft(normalizedDraft);
        let didSaveAnyChange = false;
        let didCreatePeople = false;

        try {
            if (isFieldDraftDirty) {
                await patchPlan.mutateAsync({
                    planId: id,
                    data: buildPlanPatchFromDraft(normalizedDraft),
                });
                didSaveAnyChange = true;
            }

            for (const participantId of removedParticipantIds) {
                try {
                    await deleteParticipant.mutateAsync({
                        planId: id,
                        participantId,
                    });
                    didSaveAnyChange = true;
                } catch (error) {
                    const status = getErrorStatusCode(error);
                    if (status === 404) {
                        // Already removed on the server; treat as applied.
                        didSaveAnyChange = true;
                        continue;
                    }
                    throw error;
                }
            }

            for (const stagedParticipant of stagedParticipantAdds) {
                let participantData:
                    | { personId: string; displayName: string }
                    | { displayName: string };

                if (stagedParticipant.kind === "existing-person") {
                    participantData = {
                        personId: stagedParticipant.personId,
                        displayName: stagedParticipant.displayName,
                    };
                } else {
                    let createdPerson: Person | null = null;

                    try {
                        const response = await createPerson.mutateAsync({
                            data: { displayName: stagedParticipant.displayName },
                        });

                        createdPerson =
                            response?.data && "data" in response.data
                                ? (response.data as { data: Person }).data
                                : null;
                        didCreatePeople = true;
                        didSaveAnyChange = true;
                    } catch (error) {
                        const status = getErrorStatusCode(error);
                        if (status !== 409) {
                            throw error;
                        }
                    }

                    participantData = createdPerson
                        ? {
                              personId: createdPerson.id,
                              displayName: createdPerson.displayName,
                          }
                        : { displayName: stagedParticipant.displayName };
                }

                try {
                    await addParticipant.mutateAsync({ planId: id, data: participantData });
                    didSaveAnyChange = true;
                } catch (error) {
                    const status = getErrorStatusCode(error);
                    if (status === 409) {
                        // Already on the plan; treat as applied.
                        didSaveAnyChange = true;
                        continue;
                    }
                    throw error;
                }
            }

            setRemovedParticipantIds([]);
            setStagedParticipantAdds([]);

            AccessibilityInfo.announceForAccessibility?.("Plan changes saved");
        } catch (error) {
            confirm({
                title: didSaveAnyChange
                    ? "Some changes were saved"
                    : "Couldn't save changes",
                message: didSaveAnyChange
                    ? "Some edits couldn't be saved. Review the plan and save again."
                    : "Something went wrong — try again?",
                confirmLabel: "OK",
            });
        } finally {
            if (didCreatePeople) {
                void invalidatePeopleQueries(queryClient);
            }
            invalidateAll();
        }
    }, [
        effectivePlanDraft,
        id,
        isDraftDirty,
        isFieldDraftDirty,
        patchPlan,
        addParticipant,
        deleteParticipant,
        createPerson,
        removedParticipantIds,
        stagedParticipantAdds,
        queryClient,
        invalidateAll,
    ]);

    // --- State actions ---

    const handleMarkDone = useCallback(() => {
        if (permissions?.canEdit) {
            patchPlan.mutate(
                { planId: id!, data: { state: "DONE" } },
                { onSettled: invalidateAll }
            );
        } else {
            membershipMutation.mutate(
                { planId: id!, data: { markedDoneAt: new Date().toISOString() } },
                {
                    onSuccess: () => {
                        invalidatePlanQueries(queryClient);
                        onClose?.();
                    },
                }
            );
        }
    }, [patchPlan, membershipMutation, permissions, id, invalidateAll, queryClient, onClose]);

    const handleRespond = useCallback(
        (newResponse: PlanMemberResponse) => {
            if (!id) return;
            const value =
                membership?.response === newResponse
                    ? PlanMemberResponse.PENDING
                    : newResponse;
            membershipMutation.mutate(
                { planId: id, data: { response: value } },
                { onSuccess: () => invalidatePlanQueries(queryClient) }
            );
        },
        [id, membership?.response, membershipMutation, queryClient]
    );

    const handleReopen = useCallback(() => {
        patchPlan.mutate(
            { planId: id!, data: { state: "OPEN" } },
            { onSettled: invalidateAll }
        );
    }, [patchPlan, id, invalidateAll]);

    const handleDrop = useCallback(async () => {
        const confirmed = await confirm({
            title: "Let go of this plan?",
            message: "You can always find it later.",
            confirmLabel: "Let Go",
            destructive: true,
        });
        if (confirmed) {
            patchPlan.mutate(
                { planId: id!, data: { state: "DROPPED" } },
                {
                    onSettled: () => {
                        invalidateAll();
                        onClose();
                    },
                }
            );
        }
    }, [patchPlan, id, invalidateAll, onClose, confirm]);

    const handleDelete = useCallback(async () => {
        const confirmed = await confirm({
            title: "Delete this plan?",
            message: "This can't be undone.",
            confirmLabel: "Delete",
            destructive: true,
        });
        if (confirmed) {
            deletePlan.mutate(
                { planId: id! },
                {
                    onSettled: () => {
                        void invalidatePlanQueries(queryClient);
                        onClose();
                    },
                }
            );
        }
    }, [deletePlan, id, queryClient, onClose, confirm]);

    // --- Participant draft actions ---

    const nextParticipantDraftId = useCallback(() => {
        participantDraftIdCounterRef.current += 1;
        return `draft:${participantDraftIdCounterRef.current}`;
    }, []);

    const handleStageExistingPersonParticipant = useCallback(
        (person: Person) => {
            const normalizedName = normalizePersonDisplayName(person.displayName);
            const removedMatch = plan?.participants.find(
                (participant) =>
                    removedParticipantIds.includes(participant.id) &&
                    ((participant.personId && participant.personId === person.id) ||
                        (normalizedName &&
                            normalizePersonDisplayName(participant.displayName) ===
                                normalizedName))
            );

            if (removedMatch) {
                setRemovedParticipantIds((prev) =>
                    prev.filter((participantId) => participantId !== removedMatch.id)
                );
                return;
            }

            setStagedParticipantAdds((prev) => {
                const duplicate = prev.some(
                    (participant) =>
                        (participant.kind === "existing-person" &&
                            participant.personId === person.id) ||
                        (normalizedName &&
                            normalizePersonDisplayName(participant.displayName) ===
                                normalizedName)
                );

                if (duplicate) return prev;

                return [
                    ...prev,
                    {
                        kind: "existing-person",
                        draftId: nextParticipantDraftId(),
                        personId: person.id,
                        displayName: person.displayName,
                    },
                ];
            });
        },
        [plan, removedParticipantIds, nextParticipantDraftId]
    );

    const handleStageNewPersonParticipant = useCallback(
        (displayName: string) => {
            const trimmedName = displayName.trim();
            if (!trimmedName) return;

            const normalizedName = normalizePersonDisplayName(trimmedName);
            const removedMatch = plan?.participants.find(
                (participant) =>
                    removedParticipantIds.includes(participant.id) &&
                    normalizedName &&
                    normalizePersonDisplayName(participant.displayName) === normalizedName
            );

            if (removedMatch) {
                setRemovedParticipantIds((prev) =>
                    prev.filter((participantId) => participantId !== removedMatch.id)
                );
                return;
            }

            setStagedParticipantAdds((prev) => {
                const duplicate = prev.some(
                    (participant) =>
                        normalizedName &&
                        normalizePersonDisplayName(participant.displayName) ===
                            normalizedName
                );

                if (duplicate) return prev;

                return [
                    ...prev,
                    {
                        kind: "new-person",
                        draftId: nextParticipantDraftId(),
                        displayName: trimmedName,
                    },
                ];
            });
        },
        [plan, removedParticipantIds, nextParticipantDraftId]
    );

    const handleRemoveParticipantChip = useCallback(
        (participant: DisplayPlanParticipantChip) => {
            if (participant.source === "server" && participant.participantId) {
                setRemovedParticipantIds((prev) =>
                    prev.includes(participant.participantId!)
                        ? prev
                        : [...prev, participant.participantId!]
                );
                return;
            }

            setStagedParticipantAdds((prev) =>
                prev.filter((draft) => draft.draftId !== participant.key)
            );
        },
        []
    );

    const handleRemoveParticipantByIdentity = useCallback(
        (identity: PlanPersonIdentity) => {
            const normalizedName = normalizePersonDisplayName(identity.displayName);

            // Check server participants first
            if (plan) {
                const serverMatch = plan.participants.find(
                    (p) =>
                        !removedParticipantIds.includes(p.id) &&
                        ((identity.personId && p.personId === identity.personId) ||
                            (normalizedName &&
                                normalizePersonDisplayName(p.displayName) ===
                                    normalizedName))
                );
                if (serverMatch) {
                    setRemovedParticipantIds((prev) =>
                        prev.includes(serverMatch.id)
                            ? prev
                            : [...prev, serverMatch.id]
                    );
                    return;
                }
            }

            // Check staged additions
            setStagedParticipantAdds((prev) =>
                prev.filter((draft) => {
                    if (
                        identity.personId &&
                        draft.kind === "existing-person"
                    ) {
                        return draft.personId !== identity.personId;
                    }
                    if (normalizedName) {
                        return (
                            normalizePersonDisplayName(draft.displayName) !==
                            normalizedName
                        );
                    }
                    return true;
                })
            );
        },
        [plan, removedParticipantIds]
    );

    const handleSharePlan = useCallback(() => {
        sharePlanMutation.mutate(
            { planId: id! },
            {
                onSuccess: (response) => {
                    const data = response.data as any;
                    const url = data?.data?.shareToken?.url;
                    if (!url) return;

                    queryClient.invalidateQueries({
                        queryKey: getGetShareStatusQueryKey(id!),
                    });

                    if (Platform.OS === "web") {
                        navigator.clipboard?.writeText(url);
                        Alert.alert("Copied!", "Share link copied to clipboard.");
                    } else {
                        Share.share({
                            message: `Check out ${
                                plan?.intentText?.trim() || "this plan"
                            }\n${url}`,
                        });
                    }
                },
                onError: () => {
                    Alert.alert("Error", "Could not share this plan.");
                },
            }
        );
    }, [id, plan?.intentText, queryClient, sharePlanMutation]);

    const handleUnsubscribe = useCallback(async () => {
        const confirmed = await confirm({
            title: "Unsubscribe?",
            message: "You will no longer see updates for this plan.",
            confirmLabel: "Unsubscribe",
            destructive: true,
        });
        if (!confirmed) return;

        unsubscribeMutation.mutate(
            { planId: id! },
            {
                onSuccess: () => {
                    void invalidatePlanQueries(queryClient);
                    onClose?.();
                },
            }
        );
    }, [id, confirm, unsubscribeMutation, queryClient, onClose]);

    // Loading state
    if (isLoading) {
        return (
            <YStack
                flex={1}
                backgroundColor="$background"
                justifyContent="center"
                alignItems="center"
            >
                <Animated.View
                    style={{ opacity: 0.5, width: "85%", gap: 16 }}
                >
                    <View
                        width="40%"
                        height={16}
                        borderRadius={8}
                        backgroundColor={palette.sand}
                    />
                    <View
                        width="80%"
                        height={24}
                        borderRadius={12}
                        backgroundColor={palette.sand}
                    />
                    <View
                        width="60%"
                        height={14}
                        borderRadius={7}
                        backgroundColor={palette.sand}
                    />
                </Animated.View>
            </YStack>
        );
    }

    if (isError || !plan) {
        return (
            <YStack flex={1} backgroundColor="$background" padding="$6">
                {showNavBar ? (
                    <Pressable onPress={onClose}>
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            color="$accentColor"
                        >
                            Back
                        </Text>
                    </Pressable>
                ) : null}
                <YStack
                    flex={1}
                    justifyContent="center"
                    alignItems="center"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$6"
                        color="$colorSecondary"
                        textAlign="center"
                    >
                        Couldn't load this plan.
                    </Text>
                </YStack>
            </YStack>
        );
    }

    const canEdit = Boolean(permissions?.canEdit);
    const isDone = plan.state === "DONE";
    const isDropped = plan.state === "DROPPED";
    const isOpen = plan.state === "OPEN";
    const isEditSavePending =
        patchPlan.isPending ||
        addParticipant.isPending ||
        deleteParticipant.isPending ||
        createPerson.isPending;
    const isMutating = isEditSavePending || deletePlan.isPending;
    const stateActionsDisabled = isMutating || isDraftDirty;
    const activePlanDraft = effectivePlanDraft ?? buildPlanEditableDraft(plan);

    const whenDisplay = formatPlanWhenDisplay(
        activePlanDraft.timePrecision,
        activePlanDraft.anchorStart,
        activePlanDraft.anchorEnd
    );

    const removedParticipantIdSet = new Set(removedParticipantIds);
    const visibleServerParticipants = plan.participants.filter(
        (p) => (p.displayName || p.personId) && !removedParticipantIdSet.has(p.id)
    );
    const participants: DisplayPlanParticipantChip[] = canEdit
        ? [
            ...visibleServerParticipants.map((participant) => ({
                key: participant.id,
                source: "server" as const,
                participantId: participant.id,
                personId: participant.personId ?? null,
                displayName: participant.displayName || "Unknown",
            })),
            ...stagedParticipantAdds.map((participant) => ({
                key: participant.draftId,
                source:
                    participant.kind === "existing-person"
                        ? ("staged-existing-person" as const)
                        : ("staged-new-person" as const),
                personId:
                    participant.kind === "existing-person"
                        ? participant.personId
                        : null,
                displayName: participant.displayName,
            })),
        ]
        : getSharedPeopleForDisplay(plan, { localizeViewer: true }).map((person) => ({
            key: person.key,
            source: "server" as const,
            participantId: undefined,
            personId: null,
            displayName: person.label,
        }));

    return (
        <YStack flex={1} backgroundColor="$background" position="relative">
                {showNavBar ? (
                    <XStack
                        paddingHorizontal="$5"
                        paddingVertical="$3"
                        alignItems="center"
                        justifyContent="space-between"
                    >
                        <Pressable
                            onPress={handleCancelOrBack}
                            disabled={isMutating}
                            hitSlop={12}
                            accessibilityRole="button"
                            accessibilityLabel="Go back"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$4"
                                color="$accentColor"
                                fontWeight="500"
                                opacity={isMutating ? 0.5 : 1}
                            >
                                Back
                            </Text>
                        </Pressable>

                        {!permissions?.canDelete ? (
                            <View width={28} />
                        ) : isDraftDirty ? (
                            <View width={28} />
                        ) : (
                            <Pressable
                                onPress={handleDelete}
                                hitSlop={12}
                                accessibilityRole="button"
                                accessibilityLabel="Delete plan"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$6"
                                    color="$colorTertiary"
                                >
                                    ···
                                </Text>
                            </Pressable>
                        )}
                    </XStack>
                ) : null}

                <ScrollView
                    contentContainerStyle={{
                        paddingHorizontal: 24,
                        paddingBottom: isDesktopWeb ? 24 : showNavBar ? 140 : 24,
                    }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <Animated.View
                        style={{
                            opacity: fadeAnim,
                            transform: [{ translateY: slideAnim }],
                        }}
                    >
                        <>
                                {isSubscriber && plan.ownerDisplayName ? (
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$3"
                                        color="$colorSecondary"
                                        marginBottom="$2"
                                    >
                                        Shared by {plan.ownerDisplayName}
                                    </Text>
                                ) : null}

                                <View
                                    alignSelf="flex-start"
                                    backgroundColor={
                                        isDone
                                            ? "$successBackground"
                                            : isDropped
                                              ? "$destructiveBackground"
                                              : "$backgroundStrong"
                                    }
                                    paddingHorizontal="$2.5"
                                    paddingVertical="$1"
                                    borderRadius="$12"
                                    marginBottom="$3"
                                >
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$2"
                                        fontWeight="600"
                                        color={
                                            isDone
                                                ? "$successColor"
                                                : isDropped
                                                  ? "$destructiveColor"
                                                  : "$colorSecondary"
                                        }
                                    >
                                        {isOpen
                                            ? "Open"
                                            : isDone
                                              ? "Done"
                                              : "Let go"}
                                    </Text>
                                </View>

                                <YStack marginBottom="$4">
                                    <EditableText
                                        value={activePlanDraft.intentText}
                                        onChangeText={handleDraftIntentChange}
                                        saveOnBlur={false}
                                        readOnly={!canEdit}
                                        placeholder="What's the plan?"
                                        textStyle={{
                                            fontFamily: "$heading",
                                            fontSize: 32,
                                            color: "$color",
                                        }}
                                    />
                                </YStack>

                                <YStack marginBottom="$5">
                                    <FieldRow
                                        label="When"
                                        value={whenDisplay.primary}
                                        placeholder={canEdit ? "When are you thinking?" : "Not set"}
                                        onPress={canEdit ? () => setWhenSheetOpen(true) : undefined}
                                    />
                                    {whenDisplay.secondary && (
                                        <Text
                                            fontFamily="$body"
                                            fontSize="$2"
                                            color="$colorTertiary"
                                            marginTop="$1"
                                        >
                                            {whenDisplay.secondary}
                                        </Text>
                                    )}
                                </YStack>

                                <YStack marginBottom="$5">
                                    <Text
                                        fontFamily="$body"
                                        fontSize={11}
                                        fontWeight="600"
                                        color="$colorTertiary"
                                        letterSpacing={1}
                                        textTransform="uppercase"
                                        marginBottom="$1"
                                    >
                                        Where
                                    </Text>
                                    <EditableText
                                        value={activePlanDraft.locationText}
                                        onChangeText={handleDraftLocationChange}
                                        saveOnBlur={false}
                                        readOnly={!canEdit}
                                        placeholder={canEdit ? "Add a place" : "Not set"}
                                        textStyle={{
                                            fontSize: 16,
                                            color: "$color",
                                        }}
                                    />
                                </YStack>

                                <YStack marginBottom="$5">
                                    <Text
                                        fontFamily="$body"
                                        fontSize={11}
                                        fontWeight="600"
                                        color="$colorTertiary"
                                        letterSpacing={1}
                                        textTransform="uppercase"
                                        marginBottom="$2"
                                    >
                                        Who
                                    </Text>

                                    {participants.length > 0 ? (
                                        <XStack
                                            flexWrap="wrap"
                                            gap="$2"
                                            marginBottom={canEdit ? "$2" : 0}
                                        >
                                            {participants.map((p) => {
                                                const name = p.displayName || "Unknown";

                                                const chip = (
                                                    <XStack
                                                        alignItems="center"
                                                        gap="$2"
                                                        backgroundColor="$backgroundStrong"
                                                        paddingHorizontal="$3"
                                                        paddingVertical="$1.5"
                                                        borderRadius="$10"
                                                        opacity={canEdit && isMutating ? 0.5 : 1}
                                                    >
                                                        <Avatar name={name} size={24} />
                                                        <Text
                                                            fontFamily="$body"
                                                            fontSize="$3"
                                                            color="$color"
                                                        >
                                                            {name}
                                                        </Text>
                                                        {canEdit && (
                                                            <View
                                                                width={16}
                                                                height={16}
                                                                borderRadius={8}
                                                                backgroundColor="$colorTertiary"
                                                                justifyContent="center"
                                                                alignItems="center"
                                                                marginLeft="$1"
                                                            >
                                                                <Text
                                                                    fontFamily="$body"
                                                                    fontSize={10}
                                                                    fontWeight="700"
                                                                    color="white"
                                                                    lineHeight={12}
                                                                >
                                                                    {"×"}
                                                                </Text>
                                                            </View>
                                                        )}
                                                    </XStack>
                                                );

                                                if (!canEdit) {
                                                    return <React.Fragment key={p.key}>{chip}</React.Fragment>;
                                                }

                                                return (
                                                    <Pressable
                                                        key={p.key}
                                                        onPress={() =>
                                                            handleRemoveParticipantChip(
                                                                p
                                                            )
                                                        }
                                                        disabled={isMutating}
                                                        accessibilityRole="button"
                                                        accessibilityHint="Tap to remove"
                                                    >
                                                        {chip}
                                                    </Pressable>
                                                );
                                            })}
                                        </XStack>
                                    ) : (
                                        !canEdit ? (
                                            <Text
                                                fontFamily="$body"
                                                fontSize="$4"
                                                color="$colorTertiary"
                                                fontStyle="italic"
                                            >
                                                No one added yet
                                            </Text>
                                        ) : null
                                    )}

                                    {canEdit ? (
                                        <Pressable
                                            onPress={() => setAddPersonSheetOpen(true)}
                                            disabled={isMutating}
                                            accessibilityRole="button"
                                            accessibilityLabel="Add someone to this plan"
                                        >
                                            <XStack
                                                alignItems="center"
                                                gap="$2"
                                                opacity={isMutating ? 0.5 : 1}
                                            >
                                                <View
                                                    width={28}
                                                    height={28}
                                                    borderRadius={14}
                                                    borderWidth={1.5}
                                                    borderColor="$accentColor"
                                                    borderStyle="dashed"
                                                    justifyContent="center"
                                                    alignItems="center"
                                                >
                                                    <Text
                                                        fontFamily="$heading"
                                                        fontSize="$4"
                                                        color="$accentColor"
                                                        marginTop={-1}
                                                    >
                                                        +
                                                    </Text>
                                                </View>
                                                <Text
                                                    fontFamily="$body"
                                                    fontSize="$3"
                                                    color="$accentColor"
                                                    fontWeight="500"
                                                >
                                                    Add someone
                                                </Text>
                                            </XStack>
                                        </Pressable>
                                    ) : null}
                                </YStack>

                                <YStack marginBottom="$5">
                                    <Text
                                        fontFamily="$body"
                                        fontSize={11}
                                        fontWeight="600"
                                        color="$colorTertiary"
                                        letterSpacing={1}
                                        textTransform="uppercase"
                                        marginBottom="$1"
                                    >
                                        Notes
                                    </Text>
                                    <EditableText
                                        value={activePlanDraft.contextNote}
                                        onChangeText={handleDraftNoteChange}
                                        saveOnBlur={false}
                                        readOnly={!canEdit}
                                        placeholder={canEdit ? "Any context? Why this matters, what to remember..." : "No notes"}
                                        multiline
                                        textStyle={{
                                            fontSize: 16,
                                            color: "$color",
                                            lineHeight: 24,
                                        }}
                                    />
                                </YStack>

                                <YStack
                                    marginTop="$4"
                                    paddingTop="$4"
                                    borderTopWidth={1}
                                    borderTopColor="$borderColorSubtle"
                                    gap="$1.5"
                                >
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$1"
                                        color="$colorTertiary"
                                    >
                                        Created{" "}
                                        {new Date(plan.createdAt).toLocaleDateString(
                                            undefined,
                                            {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            }
                                        )}
                                    </Text>
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$1"
                                        color="$colorTertiary"
                                    >
                                        Updated{" "}
                                        {new Date(plan.updatedAt).toLocaleDateString(
                                            undefined,
                                            {
                                                month: "short",
                                                day: "numeric",
                                                year: "numeric",
                                            }
                                        )}
                                    </Text>
                                </YStack>
                            </>
                    </Animated.View>
                </ScrollView>

                {/* 6. Bottom action bar — contextual */}
                <YStack
                    {...(isDesktopWeb || !showNavBar
                        ? { paddingHorizontal: "$6", paddingVertical: "$4" }
                        : {
                              position: "absolute" as const,
                              bottom: 0,
                              left: 0,
                              right: 0,
                              paddingHorizontal: "$6",
                              paddingBottom: "$8",
                              paddingTop: "$4",
                          })}
                    backgroundColor="$background"
                >
                    {permissions?.canLeave ? (
                        <YStack gap="$2">
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorSecondary"
                            >
                                {responseStatusLabel(membership?.response)}
                            </Text>
                            {permissions?.canRespond && isOpen && (
                                <PlanQuickActionRow
                                    compact
                                    actions={[
                                        {
                                            key: "accept",
                                            label: "Going",
                                            onPress: () => handleRespond(PlanMemberResponse.ACCEPTED),
                                            accessibilityLabel: "Accept this plan",
                                            tone: membership?.response === "ACCEPTED" ? "accent" : "neutral",
                                            loading: membershipMutation.isPending,
                                        },
                                        {
                                            key: "maybe",
                                            label: "Maybe",
                                            onPress: () => handleRespond(PlanMemberResponse.MAYBE),
                                            accessibilityLabel: "Respond maybe to this plan",
                                            tone: membership?.response === "MAYBE" ? "accent" : "neutral",
                                            loading: membershipMutation.isPending,
                                        },
                                        {
                                            key: "decline",
                                            label: "Can\u2019t go",
                                            onPress: () => handleRespond(PlanMemberResponse.DECLINED),
                                            accessibilityLabel: "Decline this plan",
                                            tone: membership?.response === "DECLINED" ? "accent" : "neutral",
                                            loading: membershipMutation.isPending,
                                        },
                                    ]}
                                />
                            )}
                            {permissions?.canChangeState && isOpen && (
                                <DetailFooterAction
                                    label={membershipMutation.isPending ? "Saving..." : "Mark Done"}
                                    onPress={handleMarkDone}
                                    disabled={stateActionsDisabled || membershipMutation.isPending}
                                    tone="success"
                                    variant="soft"
                                    labelSize="$5"
                                    accessibilityLabel="Mark plan as done"
                                />
                            )}
                            <DetailFooterAction
                                label={unsubscribeMutation.isPending ? "Unsubscribing..." : "Unsubscribe"}
                                onPress={handleUnsubscribe}
                                disabled={unsubscribeMutation.isPending}
                                tone="danger"
                                variant="ghost"
                                accessibilityLabel="Unsubscribe from this plan"
                            />
                        </YStack>
                    ) : isDraftDirty ? (
                        <YStack gap="$2">
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorSecondary"
                            >
                                Unsaved changes. Save to keep them or Cancel to discard.
                            </Text>
                            <XStack gap="$3" alignItems="center">
                                <DetailFooterAction
                                    flex={1}
                                    label="Cancel"
                                    onPress={handleCancelOrBack}
                                    disabled={isMutating}
                                    tone="neutral"
                                    variant="ghost"
                                    accessibilityLabel="Cancel unsaved edits"
                                />
                                <DetailFooterAction
                                    flex={2}
                                    label={isEditSavePending ? "Saving..." : "Save"}
                                    onPress={handleSavePlanDraft}
                                    disabled={!canSaveDraft || isMutating}
                                    tone="accent"
                                    variant="filled"
                                    labelSize="$5"
                                    accessibilityLabel="Save plan changes"
                                />
                            </XStack>
                        </YStack>
                    ) : (
                        <YStack gap="$2">
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorSecondary"
                            >
                                {hasActiveShareLink
                                    ? "Currently shared. Re-share to copy the link again."
                                    : "Private until you share it."}
                            </Text>
                            <XStack gap="$3" alignItems="center">
                                {isOpen ? (
                                    <>
                                        <DetailFooterAction
                                            flex={2}
                                            label={
                                                patchPlan.isPending
                                                    ? "Saving..."
                                                    : "Mark Done"
                                            }
                                            onPress={handleMarkDone}
                                            disabled={stateActionsDisabled}
                                            tone="success"
                                            variant="soft"
                                            labelSize="$5"
                                            accessibilityLabel="Mark plan as done"
                                        />
                                        <DetailFooterAction
                                            flex={1}
                                            label="Let Go"
                                            onPress={handleDrop}
                                            disabled={stateActionsDisabled}
                                            tone="danger"
                                            variant="soft"
                                            accessibilityLabel="Let go of this plan"
                                        />
                                    </>
                                ) : (
                                    <DetailFooterAction
                                        flex={1}
                                        label={patchPlan.isPending ? "Saving..." : "Reopen"}
                                        onPress={handleReopen}
                                        disabled={stateActionsDisabled}
                                        tone="neutral"
                                        variant="outline"
                                        accessibilityLabel="Reopen this plan"
                                    />
                                )}
                            </XStack>
                            <DetailFooterAction
                                label={
                                    sharePlanMutation.isPending
                                        ? "Sharing..."
                                        : hasActiveShareLink
                                          ? "Copy Share Link"
                                          : "Share"
                                }
                                onPress={handleSharePlan}
                                disabled={sharePlanMutation.isPending || isDraftDirty}
                                tone="accent"
                                variant="outline"
                                accessibilityLabel="Share this plan"
                            />
                        </YStack>
                    )}
                </YStack>

                {/* Bottom sheets */}
                <WhenSheet
                    open={whenSheetOpen}
                    onOpenChange={setWhenSheetOpen}
                    currentPrecision={activePlanDraft.timePrecision}
                    currentAnchorStart={activePlanDraft.anchorStart}
                    currentAnchorEnd={activePlanDraft.anchorEnd}
                    onSave={handleDraftWhenChange}
                    otherPlans={otherPlans}
                    planId={id}
                />

                <AddPersonSheet
                    open={addPersonSheetOpen}
                    onOpenChange={setAddPersonSheetOpen}
                    currentParticipants={[
                        ...visibleServerParticipants.map((participant) => ({
                            personId: participant.personId,
                            displayName: participant.displayName,
                        })),
                        ...stagedParticipantAdds.map((participant) => ({
                            personId:
                                participant.kind === "existing-person"
                                    ? participant.personId
                                    : null,
                            displayName: participant.displayName,
                        })),
                    ]}
                    onStageExistingPerson={handleStageExistingPersonParticipant}
                    onStageNewPerson={handleStageNewPersonParticipant}
                    onRemoveParticipant={handleRemoveParticipantByIdentity}
                    disabled={isMutating}
                />
            </YStack>
    );
}

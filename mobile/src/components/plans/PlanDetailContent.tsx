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
import {
    formatPlanWhenDisplay,
    PlanReadOnlyDetails,
} from "./PlanReadOnlyDetails";

import {
    useGetPlan,
    usePatchPlan,
    useDeletePlan,
    useAddPlanParticipant,
    useDeletePlanParticipant,
} from "../../api/generated/plans/plans";
import {
    useSharePlan,
    useGetShareStatus,
    useUnsubscribeFromPlan,
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
import { getInitialColor, useReducedMotionPreference } from "../../lib/planHelpers";
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
    const isUnanchored = draft.timePrecision === "NONE";

    return {
        ...draft,
        intentText: draft.intentText.trim(),
        locationText: normalizeOptionalPlanText(draft.locationText) ?? "",
        contextNote: normalizeOptionalPlanText(draft.contextNote) ?? "",
        anchorStart: isUnanchored ? null : draft.anchorStart,
        anchorEnd: isUnanchored ? null : draft.anchorEnd,
        timezone: isUnanchored ? null : draft.timezone,
    };
}

function buildPlanPatchFromDraft(draft: PlanEditableDraft): SocialPlanPatchRequest {
    const normalizedDraft = normalizePlanDraftForSave(draft);
    const timePrecision = normalizedDraft.timePrecision;
    const isUnanchored = timePrecision === "NONE";

    return {
        intentText: normalizedDraft.intentText,
        locationText: normalizeOptionalPlanText(normalizedDraft.locationText),
        contextNote: normalizeOptionalPlanText(normalizedDraft.contextNote),
        timePrecision,
        anchorStart: isUnanchored ? null : normalizedDraft.anchorStart,
        anchorEnd: isUnanchored ? null : normalizedDraft.anchorEnd,
        timezone: isUnanchored ? null : normalizedDraft.timezone,
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

type WindowRangeSelectionStep = "start" | "end";
type CalendarMarkedDates = NonNullable<CalendarProps["markedDates"]>;
type WindowRangeMarking = CalendarMarkedDates[string];

const RANGE_ENDPOINT_COLOR = "#C17A56";
const RANGE_TEXT_COLOR = "#FFFFFF";
const RANGE_CALENDAR_SURFACE_COLOR = "#221D19";
const RANGE_CALENDAR_TEXT_COLOR = "#F2E9DF";
const RANGE_CALENDAR_MUTED_TEXT_COLOR = "#A99C90";
const RANGE_CALENDAR_DISABLED_TEXT_COLOR = "#6F645A";

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
}: {
    startDate: Date;
    endDate: Date;
    selectionStep: WindowRangeSelectionStep;
    onSelectionStepChange: (step: WindowRangeSelectionStep) => void;
    onStartDateChange: (date: Date) => void;
    onEndDateChange: (date: Date) => void;
}) {
    const markedDates = buildWindowRangeMarkedDates(startDate, endDate);

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
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPrecision: SocialPlanTimePrecision;
    currentAnchorStart: string | null | undefined;
    currentAnchorEnd: string | null | undefined;
    onSave: (data: {
        timePrecision: SocialPlanTimePrecision;
        anchorStart: string | null;
        anchorEnd: string | null;
    }) => void;
}) {
    const [mode, setMode] = useState<"menu" | "date" | "datetime" | "window">("menu");
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
            setWindowStart(initial);
            setWindowEnd(initialEnd < initial ? initial : initialEnd);
            setWindowSelectionStep("start");
        }
    }, [open, currentAnchorStart, currentAnchorEnd, currentPrecision]);

    const handlePickDay = useCallback(() => {
        setMode("date");
    }, []);

    const handlePickExact = useCallback(() => {
        setMode("datetime");
    }, []);

    const handlePickWindow = useCallback(() => {
        setMode("window");
    }, []);

    const handleNoDate = useCallback(() => {
        onSave({
            timePrecision: "NONE",
            anchorStart: null,
            anchorEnd: null,
        });
        onOpenChange(false);
    }, [onSave, onOpenChange]);

    const handleDateConfirm = useCallback(() => {
        if (mode === "datetime") {
            onSave({
                timePrecision: "EXACT",
                anchorStart: pickedDate.toISOString(),
                anchorEnd: null,
            });
        } else if (mode === "date") {
            onSave({
                timePrecision: "WINDOW",
                anchorStart: pickedDate.toISOString(),
                anchorEnd: null,
            });
        }
        onOpenChange(false);
    }, [mode, pickedDate, onSave, onOpenChange]);

    const handleWindowConfirm = useCallback(() => {
        if (windowEnd < windowStart) {
            Alert.alert(
                "Window is out of order",
                "The latest date has to be the same as or after the earliest date.",
            );
            return;
        }
        onSave({
            timePrecision: "WINDOW",
            anchorStart: windowStart.toISOString(),
            anchorEnd: windowEnd.toISOString(),
        });
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
                    <Pressable onPress={handlePickDay}>
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
                                Pick a day
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorTertiary"
                                marginTop="$1"
                            >
                                Choose a date for this plan
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

                    <Pressable onPress={handlePickExact}>
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
                                Specific time
                            </Text>
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorTertiary"
                                marginTop="$1"
                            >
                                Pick a date and time
                            </Text>
                        </YStack>
                    </Pressable>

                    <Pressable onPress={handleNoDate}>
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
                                No date yet
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
                        />

                        {renderBackConfirmButtons(handleWindowConfirm)}
                    </YStack>
                </ScrollView>
            ) : (
                <YStack gap="$4" alignItems="center">
                    <DateTimePicker
                        value={pickedDate}
                        mode={mode === "datetime" ? "datetime" : "date"}
                        display="inline"
                        onChange={(_event, date) => {
                            if (date) setPickedDate(date);
                        }}
                        style={{ width: "100%" }}
                    />

                    {renderBackConfirmButtons(handleDateConfirm)}
                </YStack>
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
    disabled = false,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentParticipants: PlanPersonIdentity[];
    onStageExistingPerson: (person: Person) => void;
    onStageNewPerson: (displayName: string) => void;
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

    // Filter out people already added as participants (by personId or displayName)
    const people = allPeople.filter(
        (p) => {
            const normalizedName = normalizePersonDisplayName(p.displayName);
            return (
                !existingPersonIds.has(p.id) &&
                !(normalizedName && existingDisplayNames.has(normalizedName))
            );
        }
    );

    const allOnPlan = allPlanPeople.filter(
        (p): p is { personId?: string | null; displayName: string } =>
            Boolean(p.displayName)
    );

    const handleSelectPerson = useCallback(
        (person: Person) => {
            onStageExistingPerson(person);
            setSearchText("");
        },
        [onStageExistingPerson]
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
        ? people.find(
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
                                <XStack
                                    key={chipKey}
                                    alignItems="center"
                                    gap="$1.5"
                                    backgroundColor="$backgroundStrong"
                                    borderWidth={1}
                                    borderColor="$borderColorSubtle"
                                    paddingHorizontal="$2.5"
                                    paddingVertical="$1"
                                    borderRadius="$10"
                                >
                                    <View
                                        width={20}
                                        height={20}
                                        borderRadius={10}
                                        backgroundColor={getInitialColor(name)}
                                        justifyContent="center"
                                        alignItems="center"
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize={9}
                                            fontWeight="600"
                                            color="white"
                                        >
                                            {name.charAt(0).toUpperCase()}
                                        </Text>
                                    </View>
                                    <Text
                                        fontFamily="$body"
                                        fontSize="$2"
                                        color="$color"
                                    >
                                        {name}
                                    </Text>
                                </XStack>
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
                        {people.map((person) => (
                            <BottomSheetListRow
                                key={person.id}
                                onPress={() => handleSelectPerson(person)}
                                disabled={disabled}
                                accessibilityLabel={`Add ${person.displayName} to this plan`}
                                leading={
                                    <View
                                        width={32}
                                        height={32}
                                        borderRadius={16}
                                        backgroundColor={getInitialColor(
                                            person.displayName
                                        )}
                                        justifyContent="center"
                                        alignItems="center"
                                    >
                                        <Text
                                            fontFamily="$body"
                                            fontSize={13}
                                            fontWeight="600"
                                            color="white"
                                        >
                                            {person.displayName
                                                .charAt(0)
                                                .toUpperCase()}
                                        </Text>
                                    </View>
                                }
                                title={person.displayName}
                                subtitle={
                                    person.pronouns || person.neighborhood
                                        ? [person.pronouns, person.neighborhood]
                                              .filter(Boolean)
                                              .join(" · ")
                                        : undefined
                                }
                            />
                        ))}

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
                        {people.length === 0 &&
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
};

export function PlanDetailContent({
    planId: id,
    focusTarget: focusProp,
    onClose,
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

    const plan: SocialPlan | undefined =
        planResponse?.data && "data" in planResponse.data
            ? (planResponse.data as { data: SocialPlan }).data
            : undefined;

    const isSubscriber = plan?.role === "subscriber";
    const { data: shareStatusResponse } = useGetShareStatus(id, {
        query: {
            enabled: Boolean(plan && !isSubscriber),
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
        (data: {
            timePrecision: SocialPlanTimePrecision;
            anchorStart: string | null;
            anchorEnd: string | null;
        }) => {
            patchPlanDraft({
                timePrecision: data.timePrecision,
                anchorStart: data.anchorStart,
                anchorEnd: data.anchorEnd,
                timezone:
                    data.timePrecision === "NONE"
                        ? null
                        : Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
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
        patchPlan.mutate(
            { planId: id!, data: { state: "DONE" } },
            { onSettled: invalidateAll }
        );
    }, [patchPlan, id, invalidateAll]);

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
        async (participant: DisplayPlanParticipantChip) => {
            const name = participant.displayName || "this person";
            const description =
                participant.source === "server"
                    ? "They'll be removed when you save."
                    : "They won't be added unless you save.";

            const confirmed = await confirm({
                title: `Remove ${name}?`,
                message: description,
                confirmLabel: "Remove",
                destructive: true,
            });
            if (confirmed) {
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
            }
        },
        [confirm]
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
                        backgroundColor="#EDE7DC"
                    />
                    <View
                        width="80%"
                        height={24}
                        borderRadius={12}
                        backgroundColor="#EDE7DC"
                    />
                    <View
                        width="60%"
                        height={14}
                        borderRadius={7}
                        backgroundColor="#EDE7DC"
                    />
                </Animated.View>
            </YStack>
        );
    }

    if (isError || !plan) {
        return (
            <YStack flex={1} backgroundColor="$background" padding="$6">
                <Pressable onPress={onClose}>
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        color="$accentColor"
                    >
                        Back
                    </Text>
                </Pressable>
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
    const participants: DisplayPlanParticipantChip[] = [
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
    ];

    return (
            <YStack flex={1} backgroundColor="$background" position="relative">
                {/* Navigation bar */}
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

                    {isSubscriber ? (
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

                <ScrollView
                    contentContainerStyle={{
                        paddingHorizontal: 24,
                        paddingBottom: isDesktopWeb ? 24 : 140,
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
                        {isSubscriber ? (
                            <PlanReadOnlyDetails
                                plan={plan}
                                preface="Shared with you"
                            />
                        ) : (
                            <>
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
                                        placeholder="When are you thinking?"
                                        onPress={() => setWhenSheetOpen(true)}
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
                                        placeholder="Add a place"
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

                                    {participants.length > 0 && (
                                        <XStack
                                            flexWrap="wrap"
                                            gap="$2"
                                            marginBottom="$2"
                                        >
                                            {participants.map((p) => {
                                                const name = p.displayName || "Unknown";

                                                return (
                                                    <Pressable
                                                        key={p.key}
                                                        onLongPress={() =>
                                                            handleRemoveParticipantChip(
                                                                p
                                                            )
                                                        }
                                                        disabled={isMutating}
                                                        accessibilityRole="button"
                                                        accessibilityHint={
                                                            p.source === "server"
                                                                ? "Long press to remove and save later"
                                                                : "Long press to remove this staged addition"
                                                        }
                                                    >
                                                        <XStack
                                                            alignItems="center"
                                                            gap="$2"
                                                            backgroundColor="$backgroundStrong"
                                                            paddingHorizontal="$3"
                                                            paddingVertical="$1.5"
                                                            borderRadius="$10"
                                                            opacity={isMutating ? 0.5 : 1}
                                                        >
                                                            <View
                                                                width={24}
                                                                height={24}
                                                                borderRadius={12}
                                                                backgroundColor={getInitialColor(
                                                                    name
                                                                )}
                                                                justifyContent="center"
                                                                alignItems="center"
                                                            >
                                                                <Text
                                                                    fontFamily="$body"
                                                                    fontSize={11}
                                                                    fontWeight="600"
                                                                    color="white"
                                                                >
                                                                    {name
                                                                        .charAt(0)
                                                                        .toUpperCase()}
                                                                </Text>
                                                            </View>
                                                            <Text
                                                                fontFamily="$body"
                                                                fontSize="$3"
                                                                color="$color"
                                                            >
                                                                {name}
                                                            </Text>
                                                        </XStack>
                                                    </Pressable>
                                                );
                                            })}
                                        </XStack>
                                    )}

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
                                        placeholder="Any context? Why this matters, what to remember..."
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
                        )}
                    </Animated.View>
                </ScrollView>

                {/* 6. Bottom action bar — contextual */}
                <YStack
                    {...(isDesktopWeb
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
                    {isSubscriber ? (
                        <YStack gap="$2">
                            <Text
                                fontFamily="$body"
                                fontSize="$2"
                                color="$colorSecondary"
                            >
                                Shared with you
                            </Text>
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
                    disabled={isMutating}
                />
            </YStack>
    );
}

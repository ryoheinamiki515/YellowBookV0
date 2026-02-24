import React, { useCallback, useRef, useEffect, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Keyboard,
    Platform,
    Pressable,
    ScrollView,
    AccessibilityInfo,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View } from "tamagui";
import { SafeAreaView } from "react-native-safe-area-context";
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
} from "../../src/components/BottomSheetPrimitives";
import { EditableText } from "../../src/components/EditableText";

import {
    useGetPlan,
    usePatchPlan,
    useDeletePlan,
    useAddPlanParticipant,
    useDeletePlanParticipant,
    getListPlansQueryKey,
    getGetPlanQueryKey,
} from "../../src/api/generated/plans/plans";
import {
    useListPeople,
    useCreatePerson,
    getListPeopleQueryKey,
} from "../../src/api/generated/people/people";
import type { SocialPlan } from "../../src/api/generated/model/socialPlan";
import type { SocialPlanParticipant } from "../../src/api/generated/model/socialPlanParticipant";
import type { Person } from "../../src/api/generated/model/person";
import {
    AVATAR_COLORS,
    getInitialColor,
    formatRelativeDate,
    formatFullDate,
    useReducedMotionPreference,
} from "../../src/lib/planHelpers";

type PlanPersonIdentity = {
    personId?: string | null;
    displayName?: string | null;
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
    currentPrecision: string;
    currentAnchorStart: string | null | undefined;
    currentAnchorEnd: string | null | undefined;
    onSave: (data: {
        timePrecision: string;
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
                "The latest date has to be the same as or after the earliest date."
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
    planId,
    onAdded,
    existingParticipants,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    planId: string;
    onAdded: () => void;
    existingParticipants: SocialPlanParticipant[];
}) {
    const [searchText, setSearchText] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    // Track participants added during this sheet session
    const [justAdded, setJustAdded] = useState<
        { personId?: string; displayName: string }[]
    >([]);
    const addParticipant = useAddPlanParticipant();
    const createPerson = useCreatePerson();
    const queryClient = useQueryClient();

    useEffect(() => {
        if (!open) {
            setSearchText("");
            setDebouncedQ("");
            setJustAdded([]);
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

    // Merge server state + local optimistic state into a single deduped source.
    // This prevents newly-added people from rendering twice after a refetch.
    const allPlanPeople = mergeUniquePlanPeople(existingParticipants, justAdded);
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

    const isAdding = addParticipant.isPending || createPerson.isPending;

    const allOnPlan = allPlanPeople.filter(
        (p): p is { personId?: string | null; displayName: string } =>
            Boolean(p.displayName)
    );

    const handleSelectPerson = useCallback(
        (person: Person) => {
            addParticipant.mutate(
                {
                    planId,
                    data: { personId: person.id, displayName: person.displayName },
                },
                {
                    onSuccess: () => {
                        setJustAdded((prev) => [
                            ...prev,
                            { personId: person.id, displayName: person.displayName },
                        ]);
                        setSearchText("");
                        onAdded();
                    },
                    onError: () => {
                        Alert.alert(
                            "Couldn't add them",
                            "Something went wrong — try again?"
                        );
                    },
                }
            );
        },
        [addParticipant, planId, onAdded]
    );

    // Create a new Person in the library, then link them as participant
    const handleCreateAndAdd = useCallback(() => {
        const name = searchText.trim();
        if (!name) return;
        createPerson.mutate(
            { data: { displayName: name } },
            {
                onSuccess: (response) => {
                    const newPerson =
                        response?.data && "data" in response.data
                            ? (response.data as { data: Person }).data
                            : null;

                    const participantData = newPerson
                        ? { personId: newPerson.id, displayName: newPerson.displayName }
                        : { displayName: name };

                    addParticipant.mutate(
                        { planId, data: participantData },
                        {
                            onSuccess: () => {
                                queryClient.invalidateQueries({
                                    queryKey: getListPeopleQueryKey(),
                                });
                                setJustAdded((prev) => [
                                    ...prev,
                                    { personId: newPerson?.id, displayName: name },
                                ]);
                                setSearchText("");
                                onAdded();
                            },
                            onError: () => {
                                queryClient.invalidateQueries({
                                    queryKey: getListPeopleQueryKey(),
                                });
                                onAdded();
                                Alert.alert(
                                    "Person saved, but couldn't add to plan",
                                    `${name} was added to your People library. Try adding them to this plan again.`
                                );
                            },
                        }
                    );
                },
                onError: () => {
                    Alert.alert(
                        "Couldn't save that",
                        "Something went wrong — try again?"
                    );
                },
            }
        );
    }, [createPerson, addParticipant, planId, searchText, queryClient, onAdded]);

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
                subtitle="Search your People library or type a new name to add."
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
                                disabled={isAdding}
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
                                disabled={isAdding}
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
                                    isAdding
                                        ? "Adding..."
                                        : `Add "${searchText.trim()}"`
                                }
                                subtitle="Saves to your People library and adds to this plan"
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
// formatWhenDisplay — human-readable time display
// ---------------------------------------------------------------------------

function formatWhenDisplay(
    timePrecision: string,
    anchorStart: string | null | undefined,
    anchorEnd: string | null | undefined
): { primary: string | null; secondary: string | null } {
    if (timePrecision === "NONE") {
        return { primary: "Whenever works", secondary: null };
    }
    if (timePrecision === "UNSPECIFIED" || !anchorStart) {
        return { primary: null, secondary: null };
    }

    const relative = formatRelativeDate(anchorStart);
    const full = formatFullDate(anchorStart);

    if (timePrecision === "EXACT") {
        const date = new Date(anchorStart);
        const timeStr = date.toLocaleTimeString(undefined, {
            hour: "numeric",
            minute: "2-digit",
        });
        return {
            primary: relative ? `${relative} at ${timeStr}` : timeStr,
            secondary: full,
        };
    }

    // WINDOW with an end date — show range
    if (anchorEnd) {
        const endFull = formatFullDate(anchorEnd);
        return {
            primary: relative,
            secondary: full && endFull ? `${full} — ${endFull}` : full,
        };
    }

    return { primary: relative, secondary: full };
}

// ---------------------------------------------------------------------------
// Detail screen
// ---------------------------------------------------------------------------

export default function PlanDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const reducedMotion = useReducedMotionPreference();
    const useNativeDriver = Platform.OS !== "web";

    const { data: planResponse, isLoading, isError } = useGetPlan(id!);
    const patchPlan = usePatchPlan();
    const deletePlan = useDeletePlan();
    const deleteParticipant = useDeletePlanParticipant();

    const plan: SocialPlan | undefined =
        planResponse?.data && "data" in planResponse.data
            ? (planResponse.data as { data: SocialPlan }).data
            : undefined;

    // Bottom sheet states
    const [whenSheetOpen, setWhenSheetOpen] = useState(false);
    const [addPersonSheetOpen, setAddPersonSheetOpen] = useState(false);

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
        queryClient.invalidateQueries({ queryKey: getListPlansQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPlanQueryKey(id!) });
    }, [queryClient, id]);

    // --- Patch helpers ---

    const handlePatchField = useCallback(
        (data: Record<string, unknown>) => {
            patchPlan.mutate(
                { planId: id!, data },
                { onSettled: invalidateAll }
            );
        },
        [patchPlan, id, invalidateAll]
    );

    const handleSaveIntent = useCallback(
        (text: string) => handlePatchField({ intentText: text }),
        [handlePatchField]
    );

    const handleSaveLocation = useCallback(
        (text: string) => handlePatchField({ locationText: text }),
        [handlePatchField]
    );

    const handleSaveNote = useCallback(
        (text: string) => handlePatchField({ contextNote: text }),
        [handlePatchField]
    );

    const handleSaveWhen = useCallback(
        (data: {
            timePrecision: string;
            anchorStart: string | null;
            anchorEnd: string | null;
        }) => {
            handlePatchField({
                timePrecision: data.timePrecision,
                anchorStart: data.anchorStart,
                anchorEnd: data.anchorEnd,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            });
        },
        [handlePatchField]
    );

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

    const handleDrop = useCallback(() => {
        Alert.alert("Let go of this plan?", "You can always find it later.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Let Go",
                style: "destructive",
                onPress: () => {
                    patchPlan.mutate(
                        { planId: id!, data: { state: "DROPPED" } },
                        {
                            onSettled: () => {
                                invalidateAll();
                                router.back();
                            },
                        }
                    );
                },
            },
        ]);
    }, [patchPlan, id, invalidateAll, router]);

    const handleDelete = useCallback(() => {
        Alert.alert("Delete this plan?", "This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                    deletePlan.mutate(
                        { planId: id! },
                        {
                            onSettled: () => {
                                queryClient.invalidateQueries({
                                    queryKey: getListPlansQueryKey(),
                                });
                                router.back();
                            },
                        }
                    );
                },
            },
        ]);
    }, [deletePlan, id, queryClient, router]);

    // --- Participant actions ---

    const handleRemoveParticipant = useCallback(
        (participant: SocialPlanParticipant) => {
            const name = participant.displayName || "this person";
            Alert.alert(`Remove ${name}?`, undefined, [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Remove",
                    style: "destructive",
                    onPress: () => {
                        deleteParticipant.mutate(
                            { planId: id!, participantId: participant.id },
                            { onSettled: invalidateAll }
                        );
                    },
                },
            ]);
        },
        [deleteParticipant, id, invalidateAll]
    );

    // Loading state
    if (isLoading) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
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
            </SafeAreaView>
        );
    }

    if (isError || !plan) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
                <YStack flex={1} backgroundColor="$background" padding="$6">
                    <Pressable onPress={() => router.back()}>
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
            </SafeAreaView>
        );
    }

    const isDone = plan.state === "DONE";
    const isDropped = plan.state === "DROPPED";
    const isOpen = plan.state === "OPEN";
    const isMutating = patchPlan.isPending || deletePlan.isPending;

    const whenDisplay = formatWhenDisplay(
        plan.timePrecision,
        plan.anchorStart,
        plan.anchorEnd
    );

    const participants = plan.participants.filter(
        (p) => p.displayName || p.personId
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#FBF8F3" }}>
            <YStack flex={1} backgroundColor="$background">
                {/* Navigation bar */}
                <XStack
                    paddingHorizontal="$5"
                    paddingVertical="$3"
                    alignItems="center"
                    justifyContent="space-between"
                >
                    <Pressable
                        onPress={() => router.back()}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Go back"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            color="$accentColor"
                            fontWeight="500"
                        >
                            Back
                        </Text>
                    </Pressable>

                    {/* Overflow menu */}
                    <Pressable
                        onPress={() => {
                            const options: {
                                text: string;
                                style?: "destructive" | "cancel";
                                onPress?: () => void;
                            }[] = [];
                            options.push({
                                text: "Delete permanently",
                                style: "destructive",
                                onPress: handleDelete,
                            });
                            options.push({ text: "Cancel", style: "cancel" });
                            Alert.alert("Options", undefined, options);
                        }}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Plan options"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$6"
                            color="$colorTertiary"
                        >
                            ···
                        </Text>
                    </Pressable>
                </XStack>

                <ScrollView
                    contentContainerStyle={{
                        paddingHorizontal: 24,
                        paddingBottom: 140,
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
                        {/* State badge */}
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

                        {/* 1. Editable Intent Text */}
                        <YStack marginBottom="$4">
                            <EditableText
                                value={plan.intentText}
                                onSave={handleSaveIntent}
                                placeholder="What's the plan?"
                                textStyle={{
                                    fontFamily: "$heading",
                                    fontSize: 32,
                                    color: "$color",
                                }}
                            />
                        </YStack>

                        {/* 2. When field */}
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

                        {/* 3. Where field */}
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
                                value={plan.locationText || ""}
                                onSave={handleSaveLocation}
                                placeholder="Add a place"
                                textStyle={{
                                    fontSize: 16,
                                    color: "$color",
                                }}
                            />
                        </YStack>

                        {/* 4. Who section */}
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
                                        const name =
                                            p.displayName || "Unknown";
                                        return (
                                            <Pressable
                                                key={p.id}
                                                onLongPress={() =>
                                                    handleRemoveParticipant(p)
                                                }
                                                accessibilityRole="button"
                                                accessibilityHint="Long press to remove"
                                            >
                                                <XStack
                                                    alignItems="center"
                                                    gap="$2"
                                                    backgroundColor="$backgroundStrong"
                                                    paddingHorizontal="$3"
                                                    paddingVertical="$1.5"
                                                    borderRadius="$10"
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
                                accessibilityRole="button"
                                accessibilityLabel="Add someone to this plan"
                            >
                                <XStack alignItems="center" gap="$2">
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

                        {/* 5. Notes section */}
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
                                value={plan.contextNote || ""}
                                onSave={handleSaveNote}
                                placeholder="Any context? Why this matters, what to remember..."
                                multiline
                                textStyle={{
                                    fontSize: 16,
                                    color: "$color",
                                    lineHeight: 24,
                                }}
                            />
                        </YStack>

                        {/* Metadata */}
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
                    </Animated.View>
                </ScrollView>

                {/* 6. Bottom action bar — contextual */}
                <YStack
                    position="absolute"
                    bottom={0}
                    left={0}
                    right={0}
                    paddingHorizontal="$6"
                    paddingBottom="$8"
                    paddingTop="$4"
                    backgroundColor="$background"
                >
                    {isOpen ? (
                        <XStack gap="$3">
                            {/* Mark Done — primary */}
                            <YStack
                                flex={2}
                                height="$12"
                                borderRadius="$6"
                                backgroundColor="$successBackground"
                                justifyContent="center"
                                alignItems="center"
                                onPress={handleMarkDone}
                                disabled={isMutating}
                                opacity={isMutating ? 0.5 : 1}
                                pressStyle={{
                                    scale: 0.98,
                                    backgroundColor: "$successColor",
                                }}
                                // @ts-ignore
                                animation="fast"
                                accessibilityRole="button"
                                accessibilityLabel="Mark plan as done"
                                cursor="pointer"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$5"
                                    fontWeight="600"
                                    color="$successColor"
                                >
                                    {patchPlan.isPending
                                        ? "Saving..."
                                        : "Mark Done"}
                                </Text>
                            </YStack>

                            {/* Let Go — secondary */}
                            <YStack
                                flex={1}
                                height="$12"
                                borderRadius="$6"
                                justifyContent="center"
                                alignItems="center"
                                onPress={handleDrop}
                                disabled={isMutating}
                                opacity={isMutating ? 0.5 : 1}
                                pressStyle={{ opacity: 0.6 }}
                                accessibilityRole="button"
                                accessibilityLabel="Let go of this plan"
                                cursor="pointer"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$4"
                                    color="$colorTertiary"
                                >
                                    Let Go
                                </Text>
                            </YStack>
                        </XStack>
                    ) : (
                        <YStack
                            height="$12"
                            borderRadius="$6"
                            borderWidth={1}
                            borderColor="$borderColor"
                            justifyContent="center"
                            alignItems="center"
                            onPress={handleReopen}
                            disabled={isMutating}
                            opacity={isMutating ? 0.5 : 1}
                            pressStyle={{
                                scale: 0.98,
                                backgroundColor: "$backgroundStrong",
                            }}
                            // @ts-ignore
                            animation="fast"
                            accessibilityRole="button"
                            accessibilityLabel="Reopen this plan"
                            cursor="pointer"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize="$5"
                                fontWeight="600"
                                color="$color"
                            >
                                {patchPlan.isPending ? "Saving..." : "Reopen"}
                            </Text>
                        </YStack>
                    )}
                </YStack>

                {/* Bottom sheets */}
                <WhenSheet
                    open={whenSheetOpen}
                    onOpenChange={setWhenSheetOpen}
                    currentPrecision={plan.timePrecision}
                    currentAnchorStart={plan.anchorStart}
                    currentAnchorEnd={plan.anchorEnd}
                    onSave={handleSaveWhen}
                />

                <AddPersonSheet
                    open={addPersonSheetOpen}
                    onOpenChange={setAddPersonSheetOpen}
                    planId={id!}
                    onAdded={invalidateAll}
                    existingParticipants={participants}
                />
            </YStack>
        </SafeAreaView>
    );
}

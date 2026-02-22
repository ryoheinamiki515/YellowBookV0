import React, { useCallback, useRef, useEffect, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Keyboard,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    TextInput as RNTextInput,
    AccessibilityInfo,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View, Input } from "tamagui";
import { SafeAreaView } from "react-native-safe-area-context";
import DateTimePicker from "@react-native-community/datetimepicker";

import {
    useGetPlan,
    usePatchPlan,
    useDeletePlan,
    useAddPlanParticipant,
    useDeletePlanParticipant,
    getListPlansQueryKey,
    getGetPlanQueryKey,
} from "../../src/api/generated/plans/plans";
import { useListPeople } from "../../src/api/generated/people/people";
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

// ---------------------------------------------------------------------------
// EditableText — tappable text that becomes a TextInput
// ---------------------------------------------------------------------------

function EditableText({
    value,
    onSave,
    placeholder,
    multiline = false,
    textStyle,
    placeholderColor = "$colorTertiary",
}: {
    value: string;
    onSave: (text: string) => void;
    placeholder: string;
    multiline?: boolean;
    textStyle?: Record<string, unknown>;
    placeholderColor?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    const inputRef = useRef<RNTextInput>(null);

    useEffect(() => {
        if (!editing) setDraft(value);
    }, [value, editing]);

    useEffect(() => {
        if (editing) {
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [editing]);

    const handleBlur = useCallback(() => {
        setEditing(false);
        const trimmed = draft.trim();
        if (trimmed && trimmed !== value) {
            onSave(trimmed);
        } else {
            setDraft(value);
        }
    }, [draft, value, onSave]);

    if (editing) {
        return (
            <RNTextInput
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

// ---------------------------------------------------------------------------
// WhenSheet — bottom sheet for time picking
// ---------------------------------------------------------------------------

function WhenSheet({
    open,
    onOpenChange,
    currentPrecision,
    currentAnchorStart,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPrecision: string;
    currentAnchorStart: string | null | undefined;
    onSave: (data: {
        timePrecision: string;
        anchorStart: string | null;
        anchorEnd: string | null;
    }) => void;
}) {
    const [mode, setMode] = useState<"menu" | "date" | "datetime">("menu");
    const [pickedDate, setPickedDate] = useState(
        currentAnchorStart ? new Date(currentAnchorStart) : new Date()
    );

    useEffect(() => {
        if (open) {
            setMode("menu");
            setPickedDate(
                currentAnchorStart ? new Date(currentAnchorStart) : new Date()
            );
        }
    }, [open, currentAnchorStart]);

    const handlePickDay = useCallback(() => {
        setMode("date");
    }, []);

    const handlePickExact = useCallback(() => {
        setMode("datetime");
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
        const precision = mode === "datetime" ? "EXACT" : "WINDOW";
        onSave({
            timePrecision: precision,
            anchorStart: pickedDate.toISOString(),
            anchorEnd: null,
        });
        onOpenChange(false);
    }, [mode, pickedDate, onSave, onOpenChange]);

    return (
        <Modal
            visible={open}
            transparent
            animationType="slide"
            onRequestClose={() => onOpenChange(false)}
        >
            <Pressable
                style={{ flex: 1, backgroundColor: "rgba(42,36,32,0.35)" }}
                onPress={() => onOpenChange(false)}
            />
            <YStack
                position="absolute"
                bottom={0}
                left={0}
                right={0}
                backgroundColor="$surface"
                borderTopLeftRadius="$8"
                borderTopRightRadius="$8"
                padding="$6"
                paddingBottom="$11"
                // @ts-ignore
                shadowColor="rgba(0,0,0,0.15)"
                shadowOffset={{ width: 0, height: -4 }}
                shadowOpacity={1}
                shadowRadius={20}
                elevation={12}
            >
                {/* Drag handle */}
                <XStack justifyContent="center" marginBottom="$4">
                    <View
                        width={36}
                        height={4}
                        borderRadius="$12"
                        backgroundColor="$borderColor"
                    />
                </XStack>

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
                                    We'll figure it out later
                                </Text>
                            </YStack>
                        </Pressable>
                    </YStack>
                ) : (
                    <YStack gap="$4" alignItems="center">
                        <DateTimePicker
                            value={pickedDate}
                            mode={mode === "datetime" ? "datetime" : "date"}
                            display="spinner"
                            onChange={(_event, date) => {
                                if (date) setPickedDate(date);
                            }}
                            style={{ width: "100%" }}
                        />

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
                                onPress={handleDateConfirm}
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
                    </YStack>
                )}
            </YStack>
        </Modal>
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
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    planId: string;
    onAdded: () => void;
}) {
    const [searchText, setSearchText] = useState("");
    const [debouncedQ, setDebouncedQ] = useState("");
    const addParticipant = useAddPlanParticipant();

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

    const { data: peopleResponse } = useListPeople(
        debouncedQ ? { q: debouncedQ } : undefined,
        { query: { enabled: !!debouncedQ } }
    );

    const people: Person[] =
        peopleResponse?.data && "data" in peopleResponse.data
            ? (peopleResponse.data as { data: Person[] }).data
            : [];

    const handleSelectPerson = useCallback(
        (person: Person) => {
            addParticipant.mutate(
                {
                    planId,
                    data: { personId: person.id, displayName: person.displayName },
                },
                {
                    onSuccess: () => {
                        onAdded();
                        onOpenChange(false);
                    },
                }
            );
        },
        [addParticipant, planId, onAdded, onOpenChange]
    );

    const handleAddByName = useCallback(() => {
        const name = searchText.trim();
        if (!name) return;
        addParticipant.mutate(
            { planId, data: { displayName: name } },
            {
                onSuccess: () => {
                    onAdded();
                    onOpenChange(false);
                },
            }
        );
    }, [addParticipant, planId, searchText, onAdded, onOpenChange]);

    const isAdding = addParticipant.isPending;

    return (
        <Modal
            visible={open}
            transparent
            animationType="slide"
            onRequestClose={() => onOpenChange(false)}
        >
            <Pressable
                style={{ flex: 1, backgroundColor: "rgba(42,36,32,0.35)" }}
                onPress={() => {
                    Keyboard.dismiss();
                    onOpenChange(false);
                }}
            />
            <YStack
                position="absolute"
                bottom={0}
                left={0}
                right={0}
                backgroundColor="$surface"
                borderTopLeftRadius="$8"
                borderTopRightRadius="$8"
                padding="$6"
                paddingBottom="$11"
                minHeight={300}
                // @ts-ignore
                shadowColor="rgba(0,0,0,0.15)"
                shadowOffset={{ width: 0, height: -4 }}
                shadowOpacity={1}
                shadowRadius={20}
                elevation={12}
            >
                {/* Drag handle */}
                <XStack justifyContent="center" marginBottom="$4">
                    <View
                        width={36}
                        height={4}
                        borderRadius="$12"
                        backgroundColor="$borderColor"
                    />
                </XStack>

                <Text
                    fontFamily="$heading"
                    fontSize="$8"
                    color="$color"
                    marginBottom="$3"
                >
                    Add someone
                </Text>

                <Input
                    fontFamily="$body"
                    fontSize="$5"
                    color="$color"
                    backgroundColor="$inputBackground"
                    borderColor="$borderColor"
                    borderWidth={1}
                    borderRadius="$5"
                    paddingHorizontal="$4"
                    paddingVertical="$3"
                    placeholder="Search or type a name..."
                    placeholderTextColor="$placeholderColor"
                    value={searchText}
                    onChangeText={setSearchText}
                    autoFocus
                    focusStyle={{
                        borderColor: "$borderColorFocus",
                        borderWidth: 2,
                    }}
                    accessibilityLabel="Search for a person"
                />

                <YStack marginTop="$3" gap="$1" maxHeight={200}>
                    {people.map((person) => (
                        <Pressable
                            key={person.id}
                            onPress={() => handleSelectPerson(person)}
                            disabled={isAdding}
                        >
                            <XStack
                                alignItems="center"
                                gap="$3"
                                padding="$3"
                                borderRadius="$4"
                                pressStyle={{ backgroundColor: "$backgroundStrong" }}
                            >
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
                                <Text
                                    fontFamily="$body"
                                    fontSize="$4"
                                    color="$color"
                                >
                                    {person.displayName}
                                </Text>
                            </XStack>
                        </Pressable>
                    ))}

                    {searchText.trim().length > 0 && (
                        <Pressable
                            onPress={handleAddByName}
                            disabled={isAdding}
                        >
                            <XStack
                                alignItems="center"
                                gap="$3"
                                padding="$3"
                                borderRadius="$4"
                                opacity={isAdding ? 0.5 : 1}
                            >
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
                                <Text
                                    fontFamily="$body"
                                    fontSize="$4"
                                    color="$accentColor"
                                    fontWeight="500"
                                >
                                    {isAdding
                                        ? "Adding..."
                                        : `Add "${searchText.trim()}"`}
                                </Text>
                            </XStack>
                        </Pressable>
                    )}
                </YStack>
            </YStack>
        </Modal>
    );
}

// ---------------------------------------------------------------------------
// formatWhenDisplay — human-readable time display
// ---------------------------------------------------------------------------

function formatWhenDisplay(
    timePrecision: string,
    anchorStart: string | null | undefined
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
        plan.anchorStart
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
                    onSave={handleSaveWhen}
                />

                <AddPersonSheet
                    open={addPersonSheetOpen}
                    onOpenChange={setAddPersonSheetOpen}
                    planId={id!}
                    onAdded={invalidateAll}
                />
            </YStack>
        </SafeAreaView>
    );
}

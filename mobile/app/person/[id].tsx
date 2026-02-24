import React, { useCallback, useRef, useEffect, useState } from "react";
import {
    Alert,
    Animated,
    Easing,
    Platform,
    Pressable,
    ScrollView,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View } from "tamagui";
import { SafeAreaView } from "react-native-safe-area-context";
import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetSecondaryButton,
    BottomSheetSectionLabel,
    BottomSheetTextField,
} from "../../src/components/BottomSheetPrimitives";
import { EditableText } from "../../src/components/EditableText";

import {
    useGetPerson,
    usePatchPerson,
    useDeletePerson,
    getListPeopleQueryKey,
    getGetPersonQueryKey,
} from "../../src/api/generated/people/people";
import type { Person } from "../../src/api/generated/model/person";
import type { PersonBirthday } from "../../src/api/generated/model/personBirthday";
import {
    getInitialColor,
    useReducedMotionPreference,
} from "../../src/lib/planHelpers";

// ---------------------------------------------------------------------------
// FieldRow
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
// BirthdaySheet
// ---------------------------------------------------------------------------

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
];

function BirthdaySheet({
    open,
    onOpenChange,
    currentBirthday,
    onSave,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentBirthday: PersonBirthday | undefined;
    onSave: (birthday: PersonBirthday) => void;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBirthdayDisplay(
    birthday: PersonBirthday | undefined
): string | null {
    if (!birthday) return null;
    const { month, day, year } = birthday;
    const monthNames = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    ];
    const monthStr = monthNames[month - 1] || `${month}`;
    if (year) return `${monthStr} ${day}, ${year}`;
    return `${monthStr} ${day}`;
}

// ---------------------------------------------------------------------------
// Detail screen
// ---------------------------------------------------------------------------

export default function PersonDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const queryClient = useQueryClient();
    const reducedMotion = useReducedMotionPreference();
    const useNativeDriver = Platform.OS !== "web";

    const {
        data: personResponse,
        isLoading,
        isError,
    } = useGetPerson(id!);
    const patchPerson = usePatchPerson();
    const deletePerson = useDeletePerson();

    const person: Person | undefined =
        personResponse?.data && "data" in personResponse.data
            ? (personResponse.data as { data: Person }).data
            : undefined;

    const [birthdaySheetOpen, setBirthdaySheetOpen] = useState(false);

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
        queryClient.invalidateQueries({ queryKey: getListPeopleQueryKey() });
        queryClient.invalidateQueries({
            queryKey: getGetPersonQueryKey(id!),
        });
    }, [queryClient, id]);

    // --- Patch helpers ---

    const handlePatchField = useCallback(
        (data: Record<string, unknown>) => {
            patchPerson.mutate(
                { personId: id!, data },
                { onSettled: invalidateAll }
            );
        },
        [patchPerson, id, invalidateAll]
    );

    const handleSaveDisplayName = useCallback(
        (text: string) => handlePatchField({ displayName: text }),
        [handlePatchField]
    );

    const handleSavePronouns = useCallback(
        (text: string) => handlePatchField({ pronouns: text }),
        [handlePatchField]
    );

    const handleSaveNeighborhood = useCallback(
        (text: string) => handlePatchField({ neighborhood: text }),
        [handlePatchField]
    );

    const handleSaveNotes = useCallback(
        (text: string) => handlePatchField({ notes: text }),
        [handlePatchField]
    );

    const handleSaveBirthday = useCallback(
        (birthday: PersonBirthday) => {
            handlePatchField({ birthday });
        },
        [handlePatchField]
    );

    // --- Archive / Delete ---

    const handleToggleArchive = useCallback(() => {
        if (person?.archivedAt) {
            handlePatchField({ archivedAt: null });
        } else {
            handlePatchField({ archivedAt: new Date().toISOString() });
        }
    }, [person?.archivedAt, handlePatchField]);

    const handleDelete = useCallback(() => {
        Alert.alert("Delete this person?", "This can't be undone.", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                    deletePerson.mutate(
                        { personId: id! },
                        {
                            onSettled: () => {
                                queryClient.invalidateQueries({
                                    queryKey: getListPeopleQueryKey(),
                                });
                                router.back();
                            },
                        }
                    );
                },
            },
        ]);
    }, [deletePerson, id, queryClient, router]);

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

    if (isError || !person) {
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
                            Couldn't load this person.
                        </Text>
                    </YStack>
                </YStack>
            </SafeAreaView>
        );
    }

    const isArchived = !!person.archivedAt;
    const isMutating = patchPerson.isPending || deletePerson.isPending;
    const birthdayDisplay = formatBirthdayDisplay(person.birthday);

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

                    <Pressable
                        onPress={() => {
                            Alert.alert("Options", undefined, [
                                {
                                    text: "Delete permanently",
                                    style: "destructive",
                                    onPress: handleDelete,
                                },
                                { text: "Cancel", style: "cancel" },
                            ]);
                        }}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel="Person options"
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
                        {/* Avatar */}
                        <View
                            alignSelf="flex-start"
                            width={56}
                            height={56}
                            borderRadius={28}
                            backgroundColor={getInitialColor(
                                person.displayName
                            )}
                            justifyContent="center"
                            alignItems="center"
                            marginBottom="$3"
                        >
                            <Text
                                fontFamily="$body"
                                fontSize={24}
                                fontWeight="600"
                                color="white"
                            >
                                {person.displayName.charAt(0).toUpperCase()}
                            </Text>
                        </View>

                        {/* Archived badge */}
                        {isArchived && (
                            <View
                                alignSelf="flex-start"
                                backgroundColor="$backgroundStrong"
                                paddingHorizontal="$2.5"
                                paddingVertical="$1"
                                borderRadius="$12"
                                marginBottom="$3"
                            >
                                <Text
                                    fontFamily="$body"
                                    fontSize="$2"
                                    fontWeight="600"
                                    color="$colorTertiary"
                                >
                                    Archived
                                </Text>
                            </View>
                        )}

                        {/* 1. Display Name */}
                        <YStack marginBottom="$4">
                            <EditableText
                                value={person.displayName}
                                onSave={handleSaveDisplayName}
                                placeholder="Name"
                                textStyle={{
                                    fontFamily: "$heading",
                                    fontSize: 32,
                                    color: "$color",
                                }}
                            />
                        </YStack>

                        {/* 2. Pronouns */}
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
                                Pronouns
                            </Text>
                            <EditableText
                                value={person.pronouns || ""}
                                onSave={handleSavePronouns}
                                placeholder="Add pronouns"
                                textStyle={{
                                    fontSize: 16,
                                    color: "$color",
                                }}
                            />
                        </YStack>

                        {/* 3. Neighborhood */}
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
                                Neighborhood
                            </Text>
                            <EditableText
                                value={person.neighborhood || ""}
                                onSave={handleSaveNeighborhood}
                                placeholder="Where do they live?"
                                textStyle={{
                                    fontSize: 16,
                                    color: "$color",
                                }}
                            />
                        </YStack>

                        {/* 4. Birthday */}
                        <YStack marginBottom="$5">
                            <FieldRow
                                label="Birthday"
                                value={birthdayDisplay}
                                placeholder="Add birthday"
                                onPress={() => setBirthdaySheetOpen(true)}
                            />
                        </YStack>

                        {/* 5. Notes */}
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
                                value={person.notes || ""}
                                onSave={handleSaveNotes}
                                placeholder="Anything you want to remember about them..."
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
                                {new Date(person.createdAt).toLocaleDateString(
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
                                {new Date(person.updatedAt).toLocaleDateString(
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

                {/* Bottom action bar — Archive/Unarchive */}
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
                    <YStack
                        height="$12"
                        borderRadius="$6"
                        borderWidth={1}
                        borderColor="$borderColor"
                        justifyContent="center"
                        alignItems="center"
                        onPress={handleToggleArchive}
                        disabled={isMutating}
                        opacity={isMutating ? 0.5 : 1}
                        pressStyle={{
                            scale: 0.98,
                            backgroundColor: "$backgroundStrong",
                        }}
                        // @ts-ignore
                        animation="fast"
                        accessibilityRole="button"
                        accessibilityLabel={
                            isArchived ? "Unarchive person" : "Archive person"
                        }
                        cursor="pointer"
                    >
                        <Text
                            fontFamily="$body"
                            fontSize="$5"
                            fontWeight="600"
                            color="$color"
                        >
                            {patchPerson.isPending
                                ? "Saving..."
                                : isArchived
                                  ? "Unarchive"
                                  : "Archive"}
                        </Text>
                    </YStack>
                </YStack>

                {/* Birthday sheet */}
                <BirthdaySheet
                    open={birthdaySheetOpen}
                    onOpenChange={setBirthdaySheetOpen}
                    currentBirthday={person.birthday}
                    onSave={handleSaveBirthday}
                />
            </YStack>
        </SafeAreaView>
    );
}

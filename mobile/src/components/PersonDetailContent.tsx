import React, {
    useCallback,
    useDeferredValue,
    useRef,
    useEffect,
    useState,
} from "react";
import {
    Alert,
    Animated,
    Easing,
    Platform,
    Pressable,
    ScrollView,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { YStack, XStack, Text, View, useMedia } from "tamagui";
import {
    BottomSheetHeader,
    BottomSheetListRow,
    BottomSheetModal,
    BottomSheetSectionLabel,
    BottomSheetTextField,
} from "./BottomSheetPrimitives";
import { EditableText } from "./EditableText";
import { useConfirm } from "./ConfirmDialog";
import { DetailFooterAction } from "./DetailFooterAction";
import { PersonEventsSection } from "./PersonEventsSection";

import {
    useGetPerson,
    usePatchPerson,
    useDeletePerson,
    useListPeople,
} from "../api/generated/people/people";
import type { Person } from "../api/generated/model/person";
import type { PersonBirthday } from "../api/generated/model/personBirthday";
import { ProfileFields } from "./ProfileFields";
import { useMergePerson } from "../api/peopleMerge";
import { getProblemDetail } from "../lib/problemDetails";
import {
    invalidatePeopleQueries,
    invalidatePlanQueries,
} from "../lib/queryInvalidation";
import { useReducedMotionPreference } from "../lib/planHelpers";
import { Avatar } from "./Avatar";
import { avatarProps } from "../lib/avatarPerson";

function buildMergeCandidateSubtitle(person: Person) {
    const parts = [
        person.pronouns,
        person.neighborhood,
        person.archivedAt ? "Archived" : null,
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? parts.join(" • ") : undefined;
}

function MergePersonSheet({
    open,
    onOpenChange,
    currentPerson,
    onSelectPerson,
    isMerging,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentPerson: Person;
    onSelectPerson: (person: Person) => void;
    isMerging: boolean;
}) {
    const [searchText, setSearchText] = useState("");
    const deferredSearchText = useDeferredValue(searchText.trim());

    useEffect(() => {
        if (!open) {
            setSearchText("");
        }
    }, [open]);

    const { data: peopleResponse, isLoading } = useListPeople(
        deferredSearchText
            ? { q: deferredSearchText, limit: 200 }
            : { limit: 200 },
        {
            query: {
                enabled: open,
            },
        }
    );

    const allPeople: Person[] =
        peopleResponse?.data && "data" in peopleResponse.data
            ? (peopleResponse.data as { data: Person[] }).data
            : [];
    const candidates = allPeople.filter((person) => person.id !== currentPerson.id);

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange} minHeight={520}>
            <BottomSheetHeader title={`Keep ${currentPerson.displayName}`} />

            <YStack gap="$3">
                <Text fontFamily="$body" fontSize="$3" color="$colorSecondary">
                    Choose another person to fold into {currentPerson.displayName}. Their
                    plans, notes, and connected profile will move here, and the duplicate
                    record will be deleted.
                </Text>

                <YStack gap="$1">
                    <BottomSheetSectionLabel marginBottom={0}>
                        Search People
                    </BottomSheetSectionLabel>
                    <BottomSheetTextField
                        value={searchText}
                        onChangeText={setSearchText}
                        placeholder="Search by name"
                        placeholderTextColor="$placeholderColor"
                        disabled={isMerging}
                    />
                </YStack>

                <YStack gap="$2">
                    {isLoading ? (
                        <Text fontFamily="$body" fontSize="$3" color="$colorSecondary">
                            Loading people...
                        </Text>
                    ) : candidates.length === 0 ? (
                        <Text fontFamily="$body" fontSize="$3" color="$colorSecondary">
                            No other people match this search.
                        </Text>
                    ) : (
                        candidates.map((person) => (
                            <BottomSheetListRow
                                key={person.id}
                                title={person.displayName}
                                subtitle={buildMergeCandidateSubtitle(person)}
                                onPress={() => onSelectPerson(person)}
                                disabled={isMerging}
                                accessibilityLabel={`Merge ${person.displayName} into ${currentPerson.displayName}`}
                            />
                        ))
                    )}
                </YStack>
            </YStack>
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// Detail screen
// ---------------------------------------------------------------------------

type PersonDetailContentProps = {
    personId: string;
    onClose: () => void;
    onOpenPlan?: (planId: string) => void;
};

export function PersonDetailContent({
    personId: id,
    onClose,
    onOpenPlan,
}: PersonDetailContentProps) {
    const confirm = useConfirm();
    const router = useRouter();
    const media = useMedia();
    const isDesktopWeb = media.lg && Platform.OS === "web";
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
    const mergePerson = useMergePerson();

    const person: Person | undefined =
        personResponse?.data && "data" in personResponse.data
            ? (personResponse.data as { data: Person }).data
            : undefined;

    const [mergeSheetOpen, setMergeSheetOpen] = useState(false);

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
        void invalidatePeopleQueries(queryClient);
        void invalidatePlanQueries(queryClient);
    }, [queryClient]);

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

    const handleOpenPlan = useCallback(
        (planId: string) => {
            if (onOpenPlan) {
                onOpenPlan(planId);
                return;
            }

            router.push(`/plan/${planId}`);
        },
        [onOpenPlan, router]
    );

    // --- Archive / Delete ---

    const handleToggleArchive = useCallback(() => {
        if (person?.archivedAt) {
            handlePatchField({ archivedAt: null });
        } else {
            handlePatchField({ archivedAt: new Date().toISOString() });
        }
    }, [person?.archivedAt, handlePatchField]);

    const handleDelete = useCallback(async () => {
        const confirmed = await confirm({
            title: "Delete this person?",
            message:
                "This permanently removes them from your People Library. Existing plans will stay readable.",
            confirmLabel: "Delete",
            destructive: true,
        });
        if (confirmed) {
            deletePerson.mutate(
                { personId: id! },
                {
                    onSuccess: () => {
                        invalidateAll();
                        onClose();
                    },
                }
            );
        }
    }, [deletePerson, invalidateAll, onClose, confirm]);

    const handleMergePerson = useCallback(
        async (personToMerge: Person) => {
            if (!person) return;

            const confirmed = await confirm({
                title: `Merge ${personToMerge.displayName} into ${person.displayName}?`,
                message:
                    `${person.displayName} will be kept. ${personToMerge.displayName}'s plans, notes, and connected profile will move here, and ${personToMerge.displayName} will be removed from your People library.`,
                confirmLabel: "Merge",
                destructive: true,
            });
            if (!confirmed) return;

            mergePerson.mutate(
                {
                    personId: person.id,
                    data: { sourcePersonId: personToMerge.id },
                },
                {
                    onSuccess: () => {
                        setMergeSheetOpen(false);
                        invalidateAll();
                    },
                    onError: (error) => {
                        Alert.alert(
                            "Couldn't merge people",
                            getProblemDetail(error) || "Could not merge these people."
                        );
                    },
                }
            );
        },
        [confirm, invalidateAll, mergePerson, person]
    );

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
                        backgroundColor="$color4"
                    />
                    <View
                        width="80%"
                        height={24}
                        borderRadius={12}
                        backgroundColor="$color4"
                    />
                    <View
                        width="60%"
                        height={14}
                        borderRadius={7}
                        backgroundColor="$color4"
                    />
                </Animated.View>
            </YStack>
        );
    }

    if (isError || !person) {
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
                        Couldn't load this person.
                    </Text>
                </YStack>
            </YStack>
        );
    }

    const isArchived = !!person.archivedAt;
    const isMutating =
        patchPerson.isPending || deletePerson.isPending || mergePerson.isPending;

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
                        onPress={() => onClose()}
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

                    <View width={28} />
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
                        {/* Avatar */}
                        <View alignSelf="flex-start" marginBottom="$3">
                            <Avatar {...avatarProps(person)} size={56} />
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

                        {/* 1. Display Name + Birthday */}
                        <ProfileFields
                            displayName={person.displayName}
                            birthday={person.birthday}
                            onSaveDisplayName={handleSaveDisplayName}
                            onSaveBirthday={handleSaveBirthday}
                        />

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

                        {/* 4. Events */}
                        <PersonEventsSection
                            personId={id}
                            onOpenPlan={handleOpenPlan}
                        />

                        {/* 6. Notes */}
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

                {/* Bottom action bar */}
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
                    gap="$2"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$2"
                        color="$colorSecondary"
                    >
                        Merge folds a duplicate into this person. Archive hides them. Delete removes the record.
                    </Text>
                    <DetailFooterAction
                        label={
                            mergePerson.isPending
                                ? "Merging..."
                                : "Merge Another Into This"
                        }
                        onPress={() => setMergeSheetOpen(true)}
                        disabled={isMutating}
                        tone="accent"
                        variant="outline"
                        labelSize="$5"
                        accessibilityLabel="Merge another person into this one"
                    />
                    <XStack gap="$3" alignItems="center">
                        <DetailFooterAction
                            flex={1}
                            label={
                                patchPerson.isPending
                                    ? "Saving..."
                                    : isArchived
                                      ? "Unarchive"
                                      : "Archive"
                            }
                            onPress={handleToggleArchive}
                            disabled={isMutating}
                            tone="neutral"
                            variant="outline"
                            labelSize="$5"
                            accessibilityLabel={
                                isArchived ? "Unarchive person" : "Archive person"
                            }
                        />
                        <DetailFooterAction
                            flex={1}
                            label={
                                deletePerson.isPending ? "Deleting..." : "Delete"
                            }
                            onPress={handleDelete}
                            disabled={isMutating}
                            tone="danger"
                            variant="soft"
                            labelSize="$5"
                            accessibilityLabel="Delete person"
                        />
                    </XStack>
                </YStack>

                <MergePersonSheet
                    open={mergeSheetOpen}
                    onOpenChange={setMergeSheetOpen}
                    currentPerson={person}
                    onSelectPerson={handleMergePerson}
                    isMerging={mergePerson.isPending}
                />
            </YStack>
    );
}

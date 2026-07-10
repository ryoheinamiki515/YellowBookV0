import React, { useCallback, useEffect, useState } from "react";
import { Keyboard, Pressable, ScrollView } from "react-native";
import { YStack, XStack, Text, View } from "tamagui";

import {
    BottomSheetHeader,
    BottomSheetHeaderAction,
    BottomSheetListRow,
    BottomSheetModal,
    BottomSheetSectionLabel,
    BottomSheetTextField,
} from "../BottomSheetPrimitives";
import { Avatar } from "../Avatar";
import { avatarProps } from "../../lib/avatarPerson";
import { useListPeople } from "../../api/generated/people/people";
import { useListGroups } from "../../api/generated/groups/groups";
import type { Person } from "../../api/generated/model/person";
import type { Group } from "../../api/generated/model/group";
import {
    mergeUniquePlanPeople,
    normalizePersonDisplayName,
    type PlanPersonIdentity,
} from "../../lib/planParticipants";

/**
 * Search-and-toggle picker for attaching people to a plan or group.
 *
 * Generic over the destination: the parent owns the actual add/remove via the
 * callbacks. When `onAddGroup` is provided, a "Your groups" section appears —
 * tapping a group hands the whole group to the parent to expand into members.
 */
type AddPeopleSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    currentParticipants: PlanPersonIdentity[];
    onStageExistingPerson: (person: Person) => void;
    onStageNewPerson: (displayName: string) => void;
    onRemoveParticipant: (identity: PlanPersonIdentity) => void;
    onAddGroup?: (group: Group) => void;
    disabled?: boolean;
    title?: string;
    subtitle?: string;
    currentLabel?: string;
};

export function AddPeopleSheet({
    open,
    onOpenChange,
    currentParticipants,
    onStageExistingPerson,
    onStageNewPerson,
    onRemoveParticipant,
    onAddGroup,
    disabled = false,
    title = "Add people",
    subtitle = "Search your People library or type a new name.",
    currentLabel = "On this plan",
}: AddPeopleSheetProps) {
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

    const { data: groupsResponse } = useListGroups();
    const allGroups: Group[] =
        groupsResponse?.data && "data" in groupsResponse.data
            ? (groupsResponse.data as { data: Group[] }).data
            : [];

    // Groups only appear when the parent can expand them (i.e. plan surfaces).
    // Skip empty groups — "add everyone" of nobody is a no-op.
    const visibleGroups = onAddGroup
        ? allGroups.filter((group) => {
              if (group.memberCount <= 0) return false;
              if (!debouncedQ) return true;
              return group.name.toLowerCase().includes(debouncedQ.toLowerCase());
          })
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

    const handleAddGroup = useCallback(
        (group: Group) => {
            onAddGroup?.(group);
            setSearchText("");
        },
        [onAddGroup]
    );

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
                title={title}
                subtitle={subtitle}
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

            {/* People already selected */}
            {allOnPlan.length > 0 && (
                <YStack marginTop="$3">
                    <BottomSheetSectionLabel>
                        {currentLabel}
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
                                    accessibilityLabel={`Remove ${name}`}
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
                                        <Avatar {...avatarProps(person, name)} size={20} />
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
                        {/* Groups — tap to add everyone at once */}
                        {visibleGroups.length > 0 && (
                            <>
                                <BottomSheetSectionLabel>
                                    Your groups
                                </BottomSheetSectionLabel>
                                {visibleGroups.map((group) => (
                                    <BottomSheetListRow
                                        key={group.id}
                                        onPress={() => handleAddGroup(group)}
                                        disabled={disabled}
                                        tone="accent"
                                        accessibilityLabel={`Add everyone in ${group.name}`}
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
                                                    #
                                                </Text>
                                            </View>
                                        }
                                        title={group.name}
                                        subtitle={`${group.memberCount} ${
                                            group.memberCount === 1
                                                ? "person"
                                                : "people"
                                        }`}
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
                                                    Add all
                                                </Text>
                                            </XStack>
                                        }
                                    />
                                ))}
                                <BottomSheetSectionLabel>
                                    People
                                </BottomSheetSectionLabel>
                            </>
                        )}

                        {allPeople.map((person) => {
                            const onPlan = isPersonOnPlan(person);
                            return (
                                <BottomSheetListRow
                                    key={person.id}
                                    onPress={() => handleTogglePerson(person)}
                                    disabled={disabled}
                                    accessibilityLabel={
                                        onPlan
                                            ? `Remove ${person.displayName}`
                                            : `Add ${person.displayName}`
                                    }
                                    leading={
                                        <Avatar {...avatarProps(person)} size={32} />
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

                        {/* "Already added" hint */}
                        {searchText.trim().length > 0 && nameAlreadyOnPlan && (
                            <BottomSheetListRow
                                tone="muted"
                                title={searchText.trim()}
                                subtitle="Already added"
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

                        {/* Create new person + add */}
                        {searchText.trim().length > 0 &&
                            !exactMatchInLibrary &&
                            !nameAlreadyOnPlan && (
                            <BottomSheetListRow
                                onPress={handleCreateAndAdd}
                                disabled={disabled}
                                tone="accent"
                                accessibilityLabel={`Create ${searchText.trim()} and add`}
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
                                subtitle="Saves to your People library"
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

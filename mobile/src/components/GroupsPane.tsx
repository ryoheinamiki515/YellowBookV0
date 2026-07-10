import React, { useCallback, useState } from "react";
import { Alert, FlatList, Keyboard, Platform } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View } from "tamagui";

import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetTextField,
} from "./BottomSheetPrimitives";
import { Avatar } from "./Avatar";
import { avatarProps } from "../lib/avatarPerson";
import {
    useListGroups,
    useCreateGroup,
    getListGroupsQueryKey,
} from "../api/generated/groups/groups";
import type { Group } from "../api/generated/model/group";
import { useSheetSessionState } from "../hooks/useSheetSessionState";

function memberCountLabel(count: number): string {
    return `${count} ${count === 1 ? "person" : "people"}`;
}

// ---------------------------------------------------------------------------
// Group card
// ---------------------------------------------------------------------------

function GroupCard({
    group,
    onPress,
}: {
    group: Group;
    onPress: (group: Group) => void;
}) {
    const shownMembers = group.members.slice(0, 5);

    return (
        <XStack
            backgroundColor="$surface"
            borderRadius="$7"
            paddingVertical="$3"
            paddingHorizontal="$4"
            borderWidth={1}
            borderColor="$borderColorSubtle"
            alignItems="center"
            gap="$3"
            marginBottom={10}
            onPress={() => onPress(group)}
            hoverStyle={{ backgroundColor: "$surfaceHover" }}
            pressStyle={{ scale: 0.985, backgroundColor: "$surfaceHover" }}
            // @ts-ignore - web-only CSS property
            style={
                Platform.OS === "web"
                    ? { WebkitTapHighlightColor: "transparent" }
                    : undefined
            }
            // @ts-ignore
            animation="fast"
            accessibilityRole="button"
            accessibilityLabel={`Group: ${group.name}, ${memberCountLabel(
                group.memberCount
            )}`}
        >
            <YStack flex={1} gap="$1.5">
                <Text
                    fontFamily="$heading"
                    fontSize="$6"
                    color="$color"
                    numberOfLines={1}
                >
                    {`#${group.name}`}
                </Text>
                <XStack alignItems="center" gap="$2">
                    {shownMembers.length > 0 && (
                        <XStack>
                            {shownMembers.map((member, index) => (
                                <View
                                    key={member.personId}
                                    marginLeft={index === 0 ? 0 : -6}
                                >
                                    <Avatar
                                        {...avatarProps({
                                            displayName: member.displayName,
                                            profileImageUrl: member.profileImageUrl,
                                        })}
                                        size={22}
                                        borderWidth={1}
                                        borderColor="$surface"
                                    />
                                </View>
                            ))}
                        </XStack>
                    )}
                    <Text
                        fontFamily="$body"
                        fontSize={11}
                        color="$colorTertiary"
                        numberOfLines={1}
                    >
                        {memberCountLabel(group.memberCount)}
                    </Text>
                </XStack>
            </YStack>
        </XStack>
    );
}

// ---------------------------------------------------------------------------
// Create group bottom sheet
// ---------------------------------------------------------------------------

function CreateGroupSheet({
    open,
    onOpenChange,
    onCreated,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
}) {
    const [draft, setDraft] = useSheetSessionState(open, () => ({ name: "" }));
    const createGroup = useCreateGroup();

    const handleNameChange = useCallback(
        (value: string) => {
            setDraft((currentDraft) => ({ ...currentDraft, name: value }));
        },
        [setDraft]
    );

    const handleCreate = useCallback(() => {
        const trimmed = draft.name.trim();
        if (!trimmed) return;

        Keyboard.dismiss();
        createGroup.mutate(
            { data: { name: trimmed } },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    onCreated();
                },
                onError: (error) => {
                    const status = (error as { status?: number })?.status;
                    if (status === 409) {
                        Alert.alert(
                            "Name taken",
                            "You already have a group with that name."
                        );
                    } else {
                        Alert.alert(
                            "Couldn't save that",
                            "Something went wrong — try again?"
                        );
                    }
                },
            }
        );
    }, [draft.name, createGroup, onOpenChange, onCreated]);

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader
                title="New group"
                subtitle="Name a crew — like badminton or book club."
            />

            <BottomSheetTextField
                placeholder="Group name..."
                placeholderTextColor="$placeholderColor"
                value={draft.name}
                onChangeText={handleNameChange}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                accessibilityLabel="Group name"
            />

            <BottomSheetPrimaryButton
                label="Save Group"
                loadingLabel="Saving..."
                loading={createGroup.isPending}
                onPress={handleCreate}
                disabled={!draft.name.trim() || createGroup.isPending}
                accessibilityLabel="Save group"
            />
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// Groups pane — the "Groups" side of the People tab
// ---------------------------------------------------------------------------

export function GroupsPane({
    onOpenGroup,
}: {
    onOpenGroup: (groupId: string) => void;
}) {
    const queryClient = useQueryClient();
    const [sheetOpen, setSheetOpen] = useState(false);
    const { data, isLoading, isError, refetch } = useListGroups();

    const groups: Group[] =
        data?.data && "data" in data.data
            ? (data.data as { data: Group[] }).data
            : [];

    const handleCreated = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: getListGroupsQueryKey() });
    }, [queryClient]);

    const handleOpen = useCallback(
        (group: Group) => onOpenGroup(group.id),
        [onOpenGroup]
    );

    const renderGroupCard = useCallback(
        ({ item }: { item: Group }) => (
            <GroupCard group={item} onPress={handleOpen} />
        ),
        [handleOpen]
    );

    return (
        <>
            {isLoading ? (
                <YStack flex={1} justifyContent="center" alignItems="center">
                    <Text fontFamily="$body" fontSize="$4" color="$colorTertiary">
                        Loading groups...
                    </Text>
                </YStack>
            ) : isError ? (
                <YStack
                    flex={1}
                    justifyContent="center"
                    alignItems="center"
                    paddingHorizontal="$6"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$6"
                        color="$colorSecondary"
                        textAlign="center"
                        lineHeight="$7"
                    >
                        Something went wrong.{"\n"}
                        {Platform.OS === "web" ? "Try again." : "Pull down to try again."}
                    </Text>
                </YStack>
            ) : groups.length === 0 ? (
                <YStack
                    flex={1}
                    justifyContent="center"
                    alignItems="center"
                    paddingHorizontal="$8"
                    gap="$2"
                >
                    <Text
                        fontFamily="$heading"
                        fontSize="$8"
                        color="$color"
                        textAlign="center"
                    >
                        Group your people
                    </Text>
                    <Text
                        fontFamily="$body"
                        fontSize="$5"
                        color="$colorSecondary"
                        textAlign="center"
                        lineHeight="$6"
                    >
                        Make a crew like #badminton, then add everyone to a plan in one tap.
                    </Text>
                </YStack>
            ) : (
                <FlatList
                    data={groups}
                    renderItem={renderGroupCard}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{
                        paddingHorizontal: 24,
                        paddingTop: 12,
                        paddingBottom: 16,
                    }}
                    showsVerticalScrollIndicator={false}
                    onRefresh={Platform.OS !== "web" ? refetch : undefined}
                    refreshing={false}
                />
            )}

            {/* Bottom bar: New Group CTA */}
            <YStack
                paddingHorizontal="$6"
                paddingTop="$3"
                paddingBottom="$2"
                backgroundColor="$background"
                borderTopWidth={1}
                borderTopColor="$borderColorSubtle"
            >
                <YStack
                    height={48}
                    borderRadius="$6"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    onPress={() => setSheetOpen(true)}
                    pressStyle={{
                        scale: 0.98,
                        backgroundColor: "$accentBackgroundPress",
                    }}
                    // @ts-ignore
                    animation="fast"
                    accessibilityRole="button"
                    accessibilityLabel="Create a new group"
                    cursor="pointer"
                >
                    <XStack alignItems="center" gap="$1.5">
                        <Text
                            fontFamily="$heading"
                            fontSize="$7"
                            color="$accentColor"
                            marginTop={-1}
                        >
                            +
                        </Text>
                        <Text
                            fontFamily="$body"
                            fontSize="$4"
                            fontWeight="600"
                            color="$accentColor"
                        >
                            New Group
                        </Text>
                    </XStack>
                </YStack>
            </YStack>

            <CreateGroupSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                onCreated={handleCreated}
            />
        </>
    );
}

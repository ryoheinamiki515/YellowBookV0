import React, { useCallback, useState } from "react";
import { Alert, Keyboard, Pressable, ScrollView } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View } from "tamagui";
import { MoreHorizontal } from "lucide-react-native";
import { palette } from "../../tamagui.config";

import {
    ActionsBottomSheet,
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetTextField,
} from "./BottomSheetPrimitives";
import { AddPeopleSheet } from "./plans/AddPeopleSheet";
import { Avatar } from "./Avatar";
import { avatarProps } from "../lib/avatarPerson";
import { useConfirm } from "./ConfirmDialog";
import {
    useGetGroup,
    useAddGroupMember,
    useDeleteGroupMember,
    usePatchGroup,
    useDeleteGroup,
} from "../api/generated/groups/groups";
import { useCreatePerson } from "../api/generated/people/people";
import type { Group } from "../api/generated/model/group";
import type { Person } from "../api/generated/model/person";
import {
    normalizePersonDisplayName,
    type PlanPersonIdentity,
} from "../lib/planParticipants";
import {
    invalidateGroupQueries,
    invalidatePeopleQueries,
} from "../lib/queryInvalidation";
import { useSheetSessionState } from "../hooks/useSheetSessionState";

function memberCountLabel(count: number): string {
    return `${count} ${count === 1 ? "person" : "people"}`;
}

// ---------------------------------------------------------------------------
// Rename group bottom sheet
// ---------------------------------------------------------------------------

function RenameGroupSheet({
    open,
    onOpenChange,
    groupId,
    currentName,
    onRenamed,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groupId: string;
    currentName: string;
    onRenamed: () => void;
}) {
    const [draft, setDraft] = useSheetSessionState(open, () => ({
        name: currentName,
    }));
    const patchGroup = usePatchGroup();

    const handleSave = useCallback(() => {
        const trimmed = draft.name.trim();
        if (!trimmed) return;

        Keyboard.dismiss();
        patchGroup.mutate(
            { groupId, data: { name: trimmed } },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    onRenamed();
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
    }, [draft.name, patchGroup, groupId, onOpenChange, onRenamed]);

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader title="Rename group" />
            <BottomSheetTextField
                placeholder="Group name..."
                placeholderTextColor="$placeholderColor"
                value={draft.name}
                onChangeText={(value) =>
                    setDraft((d) => ({ ...d, name: value }))
                }
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSave}
                accessibilityLabel="Group name"
            />
            <BottomSheetPrimaryButton
                label="Save"
                loadingLabel="Saving..."
                loading={patchGroup.isPending}
                onPress={handleSave}
                disabled={!draft.name.trim() || patchGroup.isPending}
                accessibilityLabel="Save group name"
            />
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// Member row
// ---------------------------------------------------------------------------

function MemberRow({
    displayName,
    profileImageUrl,
    onRemove,
    disabled,
}: {
    displayName: string;
    profileImageUrl?: string | null;
    onRemove: () => void;
    disabled: boolean;
}) {
    return (
        <XStack
            alignItems="center"
            gap="$3"
            paddingVertical="$2.5"
            borderBottomWidth={1}
            borderBottomColor="$borderColorSubtle"
        >
            <Avatar {...avatarProps({ displayName, profileImageUrl })} size={36} />
            <Text
                flex={1}
                fontFamily="$body"
                fontSize="$5"
                color="$color"
                numberOfLines={1}
            >
                {displayName}
            </Text>
            <Pressable
                onPress={onRemove}
                disabled={disabled}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${displayName} from this group`}
                style={{ opacity: disabled ? 0.4 : 1 }}
            >
                <Text fontFamily="$body" fontSize="$3" color="$colorTertiary">
                    Remove
                </Text>
            </Pressable>
        </XStack>
    );
}

// ---------------------------------------------------------------------------
// Group detail
// ---------------------------------------------------------------------------

export function GroupDetailContent({
    groupId,
    onClose,
}: {
    groupId: string;
    onClose: () => void;
}) {
    const queryClient = useQueryClient();
    const confirm = useConfirm();
    const { data, isLoading, isError } = useGetGroup(groupId);

    const group: Group | null =
        data?.data && "data" in data.data
            ? (data.data as { data: Group }).data
            : null;

    const addMember = useAddGroupMember();
    const deleteMember = useDeleteGroupMember();
    const createPerson = useCreatePerson();
    const deleteGroup = useDeleteGroup();

    const [addSheetOpen, setAddSheetOpen] = useState(false);
    const [renameSheetOpen, setRenameSheetOpen] = useState(false);
    const [actionsOpen, setActionsOpen] = useState(false);

    const invalidate = useCallback(() => {
        invalidateGroupQueries(queryClient);
    }, [queryClient]);

    const members = group?.members ?? [];
    const currentParticipants: PlanPersonIdentity[] = members.map((m) => ({
        personId: m.personId,
        displayName: m.displayName,
        profileImageUrl: m.profileImageUrl,
    }));

    const isMutating =
        addMember.isPending ||
        deleteMember.isPending ||
        createPerson.isPending ||
        deleteGroup.isPending;

    const handleAddExisting = useCallback(
        (person: { id: string; displayName: string; profileImageUrl?: string | null }) => {
            addMember.mutate(
                { groupId, personId: person.id },
                { onSuccess: invalidate }
            );
        },
        [groupId, addMember, invalidate]
    );

    const handleAddNew = useCallback(
        (displayName: string) => {
            const name = displayName.trim();
            if (!name) return;
            createPerson.mutate(
                { data: { displayName: name } },
                {
                    onSuccess: (resp) => {
                        const created =
                            resp?.data && "data" in resp.data
                                ? (resp.data as { data: Person }).data
                                : null;
                        if (created?.id) {
                            addMember.mutate(
                                { groupId, personId: created.id },
                                {
                                    onSuccess: () => {
                                        invalidatePeopleQueries(queryClient);
                                        invalidate();
                                    },
                                }
                            );
                        }
                    },
                }
            );
        },
        [groupId, createPerson, addMember, queryClient, invalidate]
    );

    const handleRemove = useCallback(
        (identity: PlanPersonIdentity) => {
            const norm = normalizePersonDisplayName(identity.displayName);
            const member = members.find(
                (m) =>
                    (identity.personId && m.personId === identity.personId) ||
                    (norm && normalizePersonDisplayName(m.displayName) === norm)
            );
            if (member) {
                deleteMember.mutate(
                    { groupId, personId: member.personId },
                    { onSuccess: invalidate }
                );
            }
        },
        [members, groupId, deleteMember, invalidate]
    );

    const handleDelete = useCallback(async () => {
        const ok = await confirm({
            title: "Delete this group?",
            message: "This removes the group only — the people in it stay in your library.",
            confirmLabel: "Delete",
            destructive: true,
        });
        if (ok) {
            deleteGroup.mutate(
                { groupId },
                {
                    onSuccess: () => {
                        invalidate();
                        onClose();
                    },
                }
            );
        }
    }, [confirm, deleteGroup, groupId, invalidate, onClose]);

    if (isLoading) {
        return (
            <YStack flex={1} backgroundColor="$background" justifyContent="center" alignItems="center">
                <Text fontFamily="$body" fontSize="$4" color="$colorTertiary">
                    Loading...
                </Text>
            </YStack>
        );
    }

    if (isError || !group) {
        return (
            <YStack flex={1} backgroundColor="$background" padding="$6">
                <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Go back">
                    <Text fontFamily="$body" fontSize="$4" color="$accentColor" fontWeight="500">
                        Back
                    </Text>
                </Pressable>
                <YStack flex={1} justifyContent="center" alignItems="center">
                    <Text fontFamily="$body" fontSize="$6" color="$colorSecondary" textAlign="center">
                        Couldn't load this group.
                    </Text>
                </YStack>
            </YStack>
        );
    }

    return (
        <YStack flex={1} backgroundColor="$background">
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
                    <Text fontFamily="$body" fontSize="$4" color="$accentColor" fontWeight="500">
                        Back
                    </Text>
                </Pressable>

                <Pressable
                    onPress={() => setActionsOpen(true)}
                    hitSlop={12}
                    disabled={isMutating}
                    accessibilityRole="button"
                    accessibilityLabel="More actions"
                    style={{ opacity: isMutating ? 0.4 : 1 }}
                >
                    <MoreHorizontal size={24} color={palette.espresso} strokeWidth={1.8} />
                </Pressable>
            </XStack>

            <ScrollView
                contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
            >
                <Text fontFamily="$heading" fontSize="$9" color="$color" marginBottom="$1">
                    {`#${group.name}`}
                </Text>
                <Text fontFamily="$body" fontSize="$4" color="$colorTertiary" marginBottom="$4">
                    {memberCountLabel(group.memberCount)}
                </Text>

                <YStack
                    height={44}
                    borderRadius="$6"
                    backgroundColor="$accentBackground"
                    justifyContent="center"
                    alignItems="center"
                    onPress={() => setAddSheetOpen(true)}
                    pressStyle={{ scale: 0.98, backgroundColor: "$accentBackgroundPress" }}
                    // @ts-ignore
                    animation="fast"
                    accessibilityRole="button"
                    accessibilityLabel="Add people to this group"
                    cursor="pointer"
                    marginBottom="$4"
                >
                    <XStack alignItems="center" gap="$1.5">
                        <Text fontFamily="$heading" fontSize="$6" color="$accentColor" marginTop={-1}>
                            +
                        </Text>
                        <Text fontFamily="$body" fontSize="$4" fontWeight="600" color="$accentColor">
                            Add people
                        </Text>
                    </XStack>
                </YStack>

                {members.length === 0 ? (
                    <YStack paddingVertical="$8" alignItems="center" gap="$1">
                        <Text fontFamily="$body" fontSize="$4" color="$colorTertiary" textAlign="center">
                            No one in this group yet.
                        </Text>
                        <Text fontFamily="$body" fontSize="$3" color="$colorTertiary" textAlign="center">
                            Tap "Add people" to build your crew.
                        </Text>
                    </YStack>
                ) : (
                    <YStack>
                        {members.map((member) => (
                            <MemberRow
                                key={member.personId}
                                displayName={member.displayName}
                                profileImageUrl={member.profileImageUrl}
                                disabled={isMutating}
                                onRemove={() =>
                                    handleRemove({
                                        personId: member.personId,
                                        displayName: member.displayName,
                                    })
                                }
                            />
                        ))}
                    </YStack>
                )}
            </ScrollView>

            <AddPeopleSheet
                open={addSheetOpen}
                onOpenChange={setAddSheetOpen}
                title="Add to group"
                subtitle="Search your People library or type a new name."
                currentLabel="In this group"
                currentParticipants={currentParticipants}
                onStageExistingPerson={handleAddExisting}
                onStageNewPerson={handleAddNew}
                onRemoveParticipant={handleRemove}
                disabled={isMutating}
            />

            <RenameGroupSheet
                open={renameSheetOpen}
                onOpenChange={setRenameSheetOpen}
                groupId={groupId}
                currentName={group.name}
                onRenamed={invalidate}
            />

            <ActionsBottomSheet
                open={actionsOpen}
                onOpenChange={setActionsOpen}
                title="Manage group"
                isBusy={isMutating}
                actions={[
                    {
                        key: "rename",
                        title: "Rename group",
                        onPress: () => setRenameSheetOpen(true),
                        accessibilityLabel: "Rename group",
                    },
                    {
                        key: "delete",
                        title: "Delete group",
                        subtitle: "The people in it stay in your library",
                        tone: "danger",
                        onPress: handleDelete,
                        accessibilityLabel: "Delete group",
                    },
                ]}
            />
        </YStack>
    );
}

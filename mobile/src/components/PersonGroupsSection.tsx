import React, { useCallback, useState } from "react";
import { Pressable, ScrollView } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { YStack, XStack, Text, View } from "tamagui";

import {
    BottomSheetHeader,
    BottomSheetHeaderAction,
    BottomSheetListRow,
    BottomSheetModal,
} from "./BottomSheetPrimitives";
import {
    useListGroups,
    useAddGroupMember,
    useDeleteGroupMember,
} from "../api/generated/groups/groups";
import type { Group } from "../api/generated/model/group";
import { invalidateGroupQueries } from "../lib/queryInvalidation";

function memberCountLabel(count: number): string {
    return `${count} ${count === 1 ? "person" : "people"}`;
}

// ---------------------------------------------------------------------------
// Group picker sheet — toggle this person's membership across all groups
// ---------------------------------------------------------------------------

function GroupPickerSheet({
    open,
    onOpenChange,
    groups,
    personId,
    onToggle,
    isMutating,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    groups: Group[];
    personId: string;
    onToggle: (group: Group) => void;
    isMutating: boolean;
}) {
    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange} minHeight={300}>
            <BottomSheetHeader
                title="Add to groups"
                subtitle="Tap a group to add or remove this person."
                trailingAction={
                    <BottomSheetHeaderAction
                        label="Done"
                        onPress={() => onOpenChange(false)}
                        accessibilityLabel="Done editing groups"
                    />
                }
            />

            {groups.length === 0 ? (
                <YStack
                    padding="$4"
                    alignItems="center"
                    gap="$1"
                    backgroundColor="$backgroundStrong"
                    borderRadius="$4"
                    marginTop="$3"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$3"
                        color="$colorTertiary"
                        textAlign="center"
                    >
                        No groups yet.
                    </Text>
                    <Text
                        fontFamily="$body"
                        fontSize="$3"
                        color="$colorTertiary"
                        textAlign="center"
                    >
                        Create one from the People tab → Groups.
                    </Text>
                </YStack>
            ) : (
                <ScrollView
                    style={{ marginTop: 12, maxHeight: 320 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    <YStack gap="$2" paddingBottom="$1">
                        {groups.map((group) => {
                            const isMember = group.members.some(
                                (m) => m.personId === personId
                            );
                            return (
                                <BottomSheetListRow
                                    key={group.id}
                                    onPress={() => onToggle(group)}
                                    disabled={isMutating}
                                    accessibilityLabel={
                                        isMember
                                            ? `Remove from ${group.name}`
                                            : `Add to ${group.name}`
                                    }
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
                                    subtitle={memberCountLabel(group.memberCount)}
                                    trailing={
                                        isMember ? (
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
                    </YStack>
                </ScrollView>
            )}
        </BottomSheetModal>
    );
}

// ---------------------------------------------------------------------------
// Person groups section — editable #group chips on a person's profile
// ---------------------------------------------------------------------------

export function PersonGroupsSection({ personId }: { personId: string }) {
    const queryClient = useQueryClient();
    const [sheetOpen, setSheetOpen] = useState(false);
    const { data } = useListGroups();

    const allGroups: Group[] =
        data?.data && "data" in data.data
            ? (data.data as { data: Group[] }).data
            : [];

    const addMember = useAddGroupMember();
    const deleteMember = useDeleteGroupMember();
    const isMutating = addMember.isPending || deleteMember.isPending;

    const memberOf = allGroups.filter((g) =>
        g.members.some((m) => m.personId === personId)
    );

    const handleToggle = useCallback(
        (group: Group) => {
            const isMember = group.members.some((m) => m.personId === personId);
            const opts = {
                onSuccess: () => {
                    invalidateGroupQueries(queryClient);
                },
            };
            if (isMember) {
                deleteMember.mutate({ groupId: group.id, personId }, opts);
            } else {
                addMember.mutate({ groupId: group.id, personId }, opts);
            }
        },
        [personId, addMember, deleteMember, queryClient]
    );

    return (
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
                Groups
            </Text>

            <XStack flexWrap="wrap" gap="$1.5" alignItems="center">
                {memberOf.map((group) => (
                    <Pressable
                        key={group.id}
                        onPress={() => handleToggle(group)}
                        disabled={isMutating}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove from ${group.name}`}
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
                            <Text fontFamily="$body" fontSize="$3" color="$color">
                                {`#${group.name}`}
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
                ))}

                <Pressable
                    onPress={() => setSheetOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Add this person to a group"
                >
                    <XStack
                        alignItems="center"
                        gap="$1.5"
                        backgroundColor="$accentBackground"
                        paddingHorizontal="$2.5"
                        paddingVertical="$1"
                        borderRadius="$10"
                    >
                        <Text
                            fontFamily="$heading"
                            fontSize="$4"
                            color="$accentColor"
                            lineHeight={18}
                        >
                            +
                        </Text>
                        <Text
                            fontFamily="$body"
                            fontSize="$3"
                            fontWeight="600"
                            color="$accentColor"
                        >
                            {memberOf.length > 0 ? "Edit groups" : "Add to group"}
                        </Text>
                    </XStack>
                </Pressable>
            </XStack>

            <GroupPickerSheet
                open={sheetOpen}
                onOpenChange={setSheetOpen}
                groups={allGroups}
                personId={personId}
                onToggle={handleToggle}
                isMutating={isMutating}
            />
        </YStack>
    );
}

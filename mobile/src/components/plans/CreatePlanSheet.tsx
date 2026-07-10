import React, { useCallback, useEffect, useState } from "react";
import { Alert, Keyboard, Pressable } from "react-native";
import { YStack, XStack, Text, View } from "tamagui";

import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetSectionLabel,
    BottomSheetTextField,
} from "../BottomSheetPrimitives";
import { AddPeopleSheet } from "./AddPeopleSheet";
import { Avatar } from "../Avatar";
import { avatarProps } from "../../lib/avatarPerson";
import { useCreatePlan } from "../../api/generated/plans/plans";
import type { SocialPlanParticipantCreateRequest } from "../../api/generated/model/socialPlanParticipantCreateRequest";
import type { Group } from "../../api/generated/model/group";
import {
    mergeUniquePlanPeople,
    normalizePersonDisplayName,
    type PlanPersonIdentity,
} from "../../lib/planParticipants";
import { useSheetSessionState } from "../../hooks/useSheetSessionState";

export type CreatePlanParticipantPrefill = {
    personId?: string | null;
    displayName?: string | null;
    isPrimary?: boolean;
};

type CreatePlanSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onCreated: () => void;
    initialIntentText?: string;
    initialParticipants?: CreatePlanParticipantPrefill[];
    title?: string;
    subtitle?: string;
    placeholder?: string;
    submitLabel?: string;
};

type CreatePlanDraft = {
    intentText: string;
    participants: PlanPersonIdentity[];
};

function prefillsToIdentities(
    prefills: CreatePlanParticipantPrefill[]
): PlanPersonIdentity[] {
    return mergeUniquePlanPeople(
        prefills.map((p) => ({
            personId: p.personId ?? null,
            displayName: p.displayName ?? null,
            profileImageUrl: null,
        }))
    );
}

// Preserve the "primary" flag a caller set on a prefill (e.g. the feed seeds a
// 1:1 plan's friend as primary) by re-applying it at submit to the surviving
// matching participant.
function findPrimaryKey(prefills: CreatePlanParticipantPrefill[]) {
    const primary = prefills.find((p) => p.isPrimary);
    return {
        personId: primary?.personId ?? null,
        name: normalizePersonDisplayName(primary?.displayName),
    };
}

function identitiesToCreateRequests(
    participants: PlanPersonIdentity[],
    primaryKey: { personId: string | null; name: string | null }
): SocialPlanParticipantCreateRequest[] {
    return participants
        .map((p) => {
            const displayName = p.displayName?.trim() || null;
            const personId = p.personId || null;
            if (!personId && !displayName) return null;
            const isPrimary =
                (!!primaryKey.personId && personId === primaryKey.personId) ||
                (!!primaryKey.name &&
                    normalizePersonDisplayName(displayName) === primaryKey.name);
            return {
                personId,
                displayName,
                isPrimary,
            } as SocialPlanParticipantCreateRequest;
        })
        .filter(
            (p): p is SocialPlanParticipantCreateRequest => p !== null
        );
}

function buildCreatePlanDraft(
    initialIntentText?: string,
    initialParticipants?: CreatePlanParticipantPrefill[]
): CreatePlanDraft {
    return {
        intentText: initialIntentText ?? "",
        participants: prefillsToIdentities(initialParticipants ?? []),
    };
}

export function CreatePlanSheet({
    open,
    onOpenChange,
    onCreated,
    initialIntentText,
    initialParticipants,
    title = "New plan",
    subtitle = "What would you like to do with someone?",
    placeholder = "Lunch with Sam, gym Monday, call Dad...",
    submitLabel = "Save Plan",
}: CreatePlanSheetProps) {
    const createPlan = useCreatePlan();
    const [pickerOpen, setPickerOpen] = useState(false);
    const getInitialDraft = useCallback(
        () => buildCreatePlanDraft(initialIntentText, initialParticipants),
        [initialIntentText, initialParticipants]
    );
    const [draft, setDraft] = useSheetSessionState(open, getInitialDraft);

    // Close the picker whenever this sheet closes.
    useEffect(() => {
        if (!open) setPickerOpen(false);
    }, [open]);

    const handleIntentTextChange = useCallback(
        (text: string) => {
            setDraft((currentDraft) => ({
                ...currentDraft,
                intentText: text,
            }));
        },
        [setDraft]
    );

    const handleAddPerson = useCallback(
        (person: { id: string; displayName: string; profileImageUrl?: string | null }) => {
            setDraft((d) => ({
                ...d,
                participants: mergeUniquePlanPeople([
                    ...d.participants,
                    {
                        personId: person.id,
                        displayName: person.displayName,
                        profileImageUrl: person.profileImageUrl ?? null,
                    },
                ]),
            }));
        },
        [setDraft]
    );

    const handleAddNewPerson = useCallback(
        (displayName: string) => {
            const name = displayName.trim();
            if (!name) return;
            setDraft((d) => ({
                ...d,
                participants: mergeUniquePlanPeople([
                    ...d.participants,
                    { personId: null, displayName: name, profileImageUrl: null },
                ]),
            }));
        },
        [setDraft]
    );

    const handleRemovePerson = useCallback(
        (identity: PlanPersonIdentity) => {
            const normName = normalizePersonDisplayName(identity.displayName);
            setDraft((d) => ({
                ...d,
                participants: d.participants.filter((p) => {
                    if (identity.personId && p.personId) {
                        return p.personId !== identity.personId;
                    }
                    if (normName) {
                        return normalizePersonDisplayName(p.displayName) !== normName;
                    }
                    return true;
                }),
            }));
        },
        [setDraft]
    );

    const handleAddGroup = useCallback(
        (group: Group) => {
            setDraft((d) => ({
                ...d,
                participants: mergeUniquePlanPeople(
                    d.participants,
                    group.members.map((m) => ({
                        personId: m.personId,
                        displayName: m.displayName,
                        profileImageUrl: m.profileImageUrl ?? null,
                    }))
                ),
            }));
        },
        [setDraft]
    );

    const handleCreate = useCallback(() => {
        const trimmed = draft.intentText.trim();
        if (!trimmed) return;

        Keyboard.dismiss();
        const participants = identitiesToCreateRequests(
            draft.participants,
            findPrimaryKey(initialParticipants ?? [])
        );
        createPlan.mutate(
            {
                data: {
                    intentText: trimmed,
                    ...(participants.length > 0 ? { participants } : {}),
                },
            },
            {
                onSuccess: () => {
                    onOpenChange(false);
                    onCreated();
                },
                onError: () => {
                    Alert.alert(
                        "Couldn't save that",
                        "Something went wrong — try again?"
                    );
                },
            }
        );
    }, [
        createPlan,
        draft.intentText,
        draft.participants,
        initialParticipants,
        onCreated,
        onOpenChange,
    ]);

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader title={title} subtitle={subtitle} />

            <BottomSheetTextField
                placeholder={placeholder}
                placeholderTextColor="$placeholderColor"
                value={draft.intentText}
                onChangeText={handleIntentTextChange}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCreate}
                accessibilityLabel="What's the plan?"
            />

            {/* People — add individuals or a whole group, then drop anyone */}
            <YStack gap="$2" marginTop="$3">
                <BottomSheetSectionLabel>People</BottomSheetSectionLabel>
                <XStack flexWrap="wrap" gap="$1.5" alignItems="center">
                    {draft.participants.map((p) => {
                        const name = p.displayName || "Unknown";
                        const chipKey =
                            p.personId ||
                            `name:${normalizePersonDisplayName(name) || name}`;
                        return (
                            <Pressable
                                key={chipKey}
                                onPress={() => handleRemovePerson(p)}
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
                                    <Avatar
                                        {...avatarProps({
                                            displayName: name,
                                            profileImageUrl: p.profileImageUrl,
                                        })}
                                        size={20}
                                    />
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

                    <Pressable
                        onPress={() => {
                            Keyboard.dismiss();
                            setPickerOpen(true);
                        }}
                        accessibilityRole="button"
                        accessibilityLabel="Add people to this plan"
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
                                fontSize="$2"
                                fontWeight="600"
                                color="$accentColor"
                            >
                                {draft.participants.length > 0
                                    ? "Add more"
                                    : "Add people"}
                            </Text>
                        </XStack>
                    </Pressable>
                </XStack>
            </YStack>

            <BottomSheetPrimaryButton
                label={submitLabel}
                loadingLabel="Saving..."
                loading={createPlan.isPending}
                onPress={handleCreate}
                disabled={!draft.intentText.trim() || createPlan.isPending}
                accessibilityLabel="Save plan"
            />

            <AddPeopleSheet
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                title="Add people"
                subtitle="Add individuals or a whole group, then drop anyone you like."
                currentParticipants={draft.participants}
                onStageExistingPerson={handleAddPerson}
                onStageNewPerson={handleAddNewPerson}
                onRemoveParticipant={handleRemovePerson}
                onAddGroup={handleAddGroup}
                disabled={createPlan.isPending}
            />
        </BottomSheetModal>
    );
}

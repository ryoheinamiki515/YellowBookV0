import React, { useCallback } from "react";
import { Alert, Keyboard } from "react-native";

import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetTextField,
} from "../BottomSheetPrimitives";
import { useCreatePlan } from "../../api/generated/plans/plans";
import type { SocialPlanParticipantCreateRequest } from "../../api/generated/model/socialPlanParticipantCreateRequest";
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
    participants: SocialPlanParticipantCreateRequest[];
};

function normalizeParticipants(
    participants: CreatePlanParticipantPrefill[]
): SocialPlanParticipantCreateRequest[] {
    return participants
        .map((participant) => {
            const displayName = participant.displayName?.trim() || null;
            const personId = participant.personId || null;
            if (!personId && !displayName) {
                return null;
            }
            return {
                personId,
                displayName,
                isPrimary: participant.isPrimary ?? false,
            } as SocialPlanParticipantCreateRequest;
        })
        .filter(
            (participant): participant is SocialPlanParticipantCreateRequest =>
                participant !== null
        );
}

function buildCreatePlanDraft(
    initialIntentText?: string,
    initialParticipants?: CreatePlanParticipantPrefill[]
): CreatePlanDraft {
    return {
        intentText: initialIntentText ?? "",
        participants: normalizeParticipants(initialParticipants ?? []),
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
    const getInitialDraft = useCallback(
        () => buildCreatePlanDraft(initialIntentText, initialParticipants),
        [initialIntentText, initialParticipants]
    );
    const [draft, setDraft] = useSheetSessionState(open, getInitialDraft);

    const handleIntentTextChange = useCallback(
        (text: string) => {
            setDraft((currentDraft) => ({
                ...currentDraft,
                intentText: text,
            }));
        },
        [setDraft]
    );

    const handleCreate = useCallback(() => {
        const trimmed = draft.intentText.trim();
        if (!trimmed) return;

        Keyboard.dismiss();
        createPlan.mutate(
            {
                data: {
                    intentText: trimmed,
                    ...(draft.participants.length > 0
                        ? { participants: draft.participants }
                        : {}),
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
    }, [createPlan, draft.intentText, draft.participants, onCreated, onOpenChange]);

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

            <BottomSheetPrimaryButton
                label={submitLabel}
                loadingLabel="Saving..."
                loading={createPlan.isPending}
                onPress={handleCreate}
                disabled={!draft.intentText.trim() || createPlan.isPending}
                accessibilityLabel="Save plan"
            />
        </BottomSheetModal>
    );
}

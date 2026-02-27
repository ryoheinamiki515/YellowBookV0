import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Keyboard } from "react-native";

import {
    BottomSheetHeader,
    BottomSheetModal,
    BottomSheetPrimaryButton,
    BottomSheetTextField,
} from "../BottomSheetPrimitives";
import { useCreatePlan } from "../../api/generated/plans/plans";
import type { SocialPlanParticipantCreateRequest } from "../../api/generated/model/socialPlanParticipantCreateRequest";

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
    const [intentText, setIntentText] = useState(initialIntentText ?? "");

    useEffect(() => {
        if (!open) return;
        setIntentText(initialIntentText ?? "");
    }, [open, initialIntentText]);

    const participants = useMemo(
        () => normalizeParticipants(initialParticipants ?? []),
        [initialParticipants]
    );

    const handleCreate = useCallback(() => {
        const trimmed = intentText.trim();
        if (!trimmed) return;

        Keyboard.dismiss();
        createPlan.mutate(
            {
                data: {
                    intentText: trimmed,
                    ...(participants.length > 0 ? { participants } : {}),
                },
            },
            {
                onSuccess: () => {
                    setIntentText("");
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
    }, [createPlan, intentText, onCreated, onOpenChange, participants]);

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader title={title} subtitle={subtitle} />

            <BottomSheetTextField
                placeholder={placeholder}
                placeholderTextColor="$placeholderColor"
                value={intentText}
                onChangeText={setIntentText}
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
                disabled={!intentText.trim() || createPlan.isPending}
                accessibilityLabel="Save plan"
            />
        </BottomSheetModal>
    );
}

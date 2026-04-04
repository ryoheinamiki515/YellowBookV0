import React, { useCallback } from "react";
import { ScrollView } from "react-native";
import { Text, View, YStack } from "tamagui";

import { palette } from "../../../tamagui.config";
import {
    BottomSheetModal,
    BottomSheetHeader,
    BottomSheetListRow,
} from "../BottomSheetPrimitives";
import type { AgendaPlanRowData } from "../../lib/agendaGrouping";
import type { PlanAttentionReason } from "../../lib/planListDerivations";
import { getAttentionReasonLabel } from "../../lib/planListDerivations";

export function focusTargetForReason(
    reason: PlanAttentionReason
): "people" | "when" {
    switch (reason) {
        case "missing-people":
        case "missing-people-and-date":
            return "people";
        case "missing-date":
        case "past-due":
        case "stale-open":
            return "when";
    }
}

function AttentionDot() {
    return (
        <View
            width={6}
            height={6}
            borderRadius={3}
            backgroundColor={palette.terracotta}
        />
    );
}

type AttentionSheetProps = {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    attentionPlans: AgendaPlanRowData[];
    onSelectPlan: (planId: string, focus?: "when" | "people") => void;
};

export function AttentionSheet({
    open,
    onOpenChange,
    attentionPlans,
    onSelectPlan,
}: AttentionSheetProps) {
    const handlePlanPress = useCallback(
        (row: AgendaPlanRowData) => {
            onOpenChange(false);
            const focus = row.attentionReason
                ? focusTargetForReason(row.attentionReason)
                : undefined;
            // Small delay to let the sheet animate closed before opening the detail
            setTimeout(() => onSelectPlan(row.plan.id, focus), 150);
        },
        [onOpenChange, onSelectPlan]
    );

    return (
        <BottomSheetModal open={open} onOpenChange={onOpenChange}>
            <BottomSheetHeader
                title="Needs Attention"
                subtitle={
                    attentionPlans.length === 1
                        ? "1 plan needs your attention"
                        : `${attentionPlans.length} plans need your attention`
                }
            />

            {attentionPlans.length === 0 ? (
                <YStack
                    alignItems="center"
                    justifyContent="center"
                    paddingVertical="$6"
                >
                    <Text
                        fontFamily="$body"
                        fontSize="$4"
                        color="$colorTertiary"
                    >
                        All caught up!
                    </Text>
                </YStack>
            ) : (
                <ScrollView
                    style={{ maxHeight: 400 }}
                    showsVerticalScrollIndicator={false}
                >
                    <YStack gap="$2">
                        {attentionPlans.map((row) => (
                            <BottomSheetListRow
                                key={row.plan.id}
                                title={row.plan.intentText}
                                subtitle={
                                    row.attentionReason
                                        ? getAttentionReasonLabel(row.attentionReason)
                                        : undefined
                                }
                                leading={<AttentionDot />}
                                onPress={() => handlePlanPress(row)}
                                accessibilityLabel={`${row.plan.intentText}, ${
                                    row.attentionReason
                                        ? getAttentionReasonLabel(row.attentionReason)
                                        : ""
                                }`}
                                tone={
                                    row.attentionReason === "stale-open"
                                        ? "muted"
                                        : "default"
                                }
                            />
                        ))}
                    </YStack>
                </ScrollView>
            )}
        </BottomSheetModal>
    );
}

import React from "react";
import { XStack } from "tamagui";

import { PlanActionChip, type PlanActionChipTone } from "./PlanActionChip";

export type PlanQuickActionRowAction = {
    key: string;
    label: string;
    onPress: () => void;
    accessibilityLabel: string;
    tone?: PlanActionChipTone;
    disabled?: boolean;
    loading?: boolean;
};

type PlanQuickActionRowProps = {
    actions: PlanQuickActionRowAction[];
    compact?: boolean;
};

export function PlanQuickActionRow({
    actions,
    compact = false,
}: PlanQuickActionRowProps) {
    if (actions.length === 0) return null;

    return (
        <XStack flexWrap="wrap" gap="$2">
            {actions.map((action) => (
                <PlanActionChip
                    key={action.key}
                    label={action.label}
                    onPress={action.onPress}
                    accessibilityLabel={action.accessibilityLabel}
                    tone={action.tone}
                    compact={compact}
                    disabled={action.disabled}
                    loading={action.loading}
                />
            ))}
        </XStack>
    );
}

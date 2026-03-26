import React from "react";

import { BottomSheetModal } from "../BottomSheetPrimitives";
import { PlanDetailContent } from "./PlanDetailContent";

type PlanDetailSheetProps = {
    planId: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    focusTarget?: "when" | "people";
};

export function PlanDetailSheet({
    planId,
    open,
    onOpenChange,
    focusTarget,
}: PlanDetailSheetProps) {
    return (
        <BottomSheetModal
            open={open}
            onOpenChange={onOpenChange}
            variant="full"
        >
            {planId ? (
                <PlanDetailContent
                    key={planId}
                    planId={planId}
                    focusTarget={focusTarget}
                    onClose={() => onOpenChange(false)}
                    showNavBar={false}
                />
            ) : null}
        </BottomSheetModal>
    );
}

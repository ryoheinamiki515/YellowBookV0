import type { PlanQuickActionRowAction } from "../components/plans/PlanQuickActionRow";
import type {
    PlanAttentionReason,
    PlanQuickActionKind,
} from "./planListDerivations";

export function getPlanQuickActionLabel(
    kind: PlanQuickActionKind,
    attentionReason: PlanAttentionReason | null
): string {
    switch (kind) {
        case "focus-people":
            return "Add who";
        case "focus-when":
            return attentionReason === "past-due" ? "Reschedule" : "Pick day";
        case "let-go":
            return "Let go";
        case "mark-done":
            return "Done";
        case "open":
        default:
            return "Open";
    }
}

export function getPlanQuickActionTone(
    kind: PlanQuickActionKind
): PlanQuickActionRowAction["tone"] {
    switch (kind) {
        case "focus-people":
        case "focus-when":
            return "caution";
        case "mark-done":
            return "success";
        case "let-go":
            return "danger";
        case "open":
        default:
            return "neutral";
    }
}

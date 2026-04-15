import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    getPlanQuickActionLabel,
    getPlanQuickActionTone,
} from "./planQuickActions.js";
import type {
    PlanAttentionReason,
    PlanQuickActionKind,
} from "./planListDerivations.js";

describe("getPlanQuickActionLabel", () => {
    const cases: [PlanQuickActionKind, PlanAttentionReason | null, string][] = [
        ["focus-people", null, "Add who"],
        ["focus-when", "past-due", "Reschedule"],
        ["focus-when", null, "Pick day"],
        ["focus-when", "missing-date", "Pick day"],
        ["let-go", null, "Let go"],
        ["mark-done", null, "Done"],
        ["open", null, "Open"],
    ];

    for (const [kind, reason, expected] of cases) {
        test(`returns "${expected}" for ${kind} / ${reason ?? "null"}`, () => {
            assert.equal(getPlanQuickActionLabel(kind, reason), expected);
        });
    }
});

describe("getPlanQuickActionTone", () => {
    const cases: [PlanQuickActionKind, string][] = [
        ["focus-people", "caution"],
        ["focus-when", "caution"],
        ["mark-done", "success"],
        ["let-go", "danger"],
        ["open", "neutral"],
    ];

    for (const [kind, expected] of cases) {
        test(`${kind} → ${expected}`, () => {
            assert.equal(getPlanQuickActionTone(kind), expected);
        });
    }
});

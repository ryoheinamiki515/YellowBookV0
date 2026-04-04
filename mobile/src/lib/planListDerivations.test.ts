import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { getAttentionReasonLabel, getQuickActionsForAttention } from "./planListDerivations.js";
import type { PlanAttentionReason } from "./planListDerivations.js";
import type { SocialPlan } from "../api/generated/model/socialPlan.js";

describe("getAttentionReasonLabel", () => {
    const cases: [PlanAttentionReason, string][] = [
        ["missing-people-and-date", "Needs people + date"],
        ["missing-people", "Needs people"],
        ["missing-date", "Needs date"],
        ["past-due", "Past due"],
        ["stale-open", "Drifting"],
    ];

    for (const [reason, expected] of cases) {
        test(`returns "${expected}" for "${reason}"`, () => {
            assert.equal(getAttentionReasonLabel(reason), expected);
        });
    }
});

function makePlan(overrides: Partial<SocialPlan> & { id: string }): SocialPlan {
    return {
        ownerId: "user-owner",
        intentText: "Test plan",
        state: "OPEN",
        timePrecision: "UNSPECIFIED",
        participants: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        ...overrides,
    } as SocialPlan;
}

describe("getQuickActionsForAttention", () => {
    test("past-due includes mark-done, focus-when, and let-go", () => {
        const plan = makePlan({ id: "p1" });
        const actions = getQuickActionsForAttention(plan, "past-due");
        assert.deepEqual(actions, ["mark-done", "focus-when", "let-go"]);
    });

    test("missing-people-and-date includes focus-people and focus-when", () => {
        const plan = makePlan({ id: "p2" });
        const actions = getQuickActionsForAttention(plan, "missing-people-and-date");
        assert.deepEqual(actions, ["focus-people", "focus-when"]);
    });

    test("missing-date includes focus-when", () => {
        const plan = makePlan({ id: "p3" });
        const actions = getQuickActionsForAttention(plan, "missing-date");
        assert.deepEqual(actions, ["focus-when"]);
    });

    test("missing-people includes focus-people", () => {
        const plan = makePlan({ id: "p4" });
        const actions = getQuickActionsForAttention(plan, "missing-people");
        assert.deepEqual(actions, ["focus-people"]);
    });
});

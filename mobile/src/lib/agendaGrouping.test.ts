import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildAgendaSections } from "./agendaGrouping.js";
import type { SocialPlan } from "../api/generated/model/socialPlan.js";

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

function yesterday(): string {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString();
}

describe("buildAgendaSections — shared plan quick actions", () => {
    test("shared past-due plan gets mark-done quick action instead of focus-when/let-go", () => {
        const sharedPastDuePlan = makePlan({
            id: "shared-1",
            anchorStart: yesterday(),
            anchorEnd: yesterday(),
            timePrecision: "EXACT",
        });

        const sections = buildAgendaSections([], [sharedPastDuePlan]);
        const pastDueSection = sections.find((s) => s.dayKey === "PAST_DUE");

        assert.ok(pastDueSection, "should have a Past Due section");
        assert.equal(pastDueSection.data.length, 1);

        const row = pastDueSection.data[0]!;
        assert.equal(row.isShared, true);
        assert.equal(row.attentionReason, "past-due");
        assert.deepEqual(row.quickActions, ["mark-done"]);
    });

    test("owned past-due plan gets mark-done, focus-when, and let-go quick actions", () => {
        const ownedPastDuePlan = makePlan({
            id: "owned-1",
            anchorStart: yesterday(),
            anchorEnd: yesterday(),
            timePrecision: "EXACT",
        });

        const sections = buildAgendaSections([ownedPastDuePlan], []);
        const pastDueSection = sections.find((s) => s.dayKey === "PAST_DUE");

        assert.ok(pastDueSection, "should have a Past Due section");
        const row = pastDueSection.data[0]!;
        assert.equal(row.isShared, false);
        assert.deepEqual(row.quickActions, ["mark-done", "focus-when", "let-go"]);
    });

    test("subscribed plan with markedDoneAt is excluded from agenda", () => {
        const markedDonePlan = makePlan({
            id: "shared-done",
            membership: {
                role: "member",
                response: "ACCEPTED",
                markedDoneAt: new Date().toISOString(),
            },
        });

        const sections = buildAgendaSections([], [markedDonePlan]);
        const allPlanIds = sections.flatMap((s) => s.data.map((r) => r.plan.id));
        assert.ok(!allPlanIds.includes("shared-done"), "marked-done plan should be excluded");
    });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mergeUniquePlanPeople, normalizePersonDisplayName } from "./planParticipants";

describe("normalizePersonDisplayName", () => {
    test("trims and lowercases", () => {
        assert.equal(normalizePersonDisplayName("  Sam Smith "), "sam smith");
    });

    test("blank / whitespace / nullish become null", () => {
        assert.equal(normalizePersonDisplayName("   "), null);
        assert.equal(normalizePersonDisplayName(""), null);
        assert.equal(normalizePersonDisplayName(null), null);
        assert.equal(normalizePersonDisplayName(undefined), null);
    });
});

describe("mergeUniquePlanPeople (the group-expansion dedupe primitive)", () => {
    test("keeps every member of a single group", () => {
        const group = [
            { personId: "p1", displayName: "Sam" },
            { personId: "p2", displayName: "Uma" },
            { personId: "p3", displayName: "Ravi" },
        ];
        const merged = mergeUniquePlanPeople(group);
        assert.deepEqual(merged.map((p) => p.personId), ["p1", "p2", "p3"]);
    });

    test("two overlapping groups dedupe by personId", () => {
        const badminton = [
            { personId: "p1", displayName: "Sam" },
            { personId: "p2", displayName: "Uma" },
        ];
        const dinner = [
            { personId: "p2", displayName: "Uma" }, // also in badminton
            { personId: "p4", displayName: "Mei" },
        ];
        const merged = mergeUniquePlanPeople(badminton, dinner);
        assert.deepEqual(merged.map((p) => p.personId), ["p1", "p2", "p4"]);
    });

    test("adding a group then the same person individually yields a single entry", () => {
        const group = [{ personId: "p1", displayName: "Sam" }];
        const individual = [{ personId: "p1", displayName: "Sam" }];
        const merged = mergeUniquePlanPeople(group, individual);
        assert.equal(merged.length, 1);
    });

    test("dedupes by normalized displayName when personIds differ or are absent", () => {
        const merged = mergeUniquePlanPeople(
            [{ displayName: "Sam" }],
            [{ displayName: "  sam  " }] // same person, different casing/spacing, no id
        );
        assert.equal(merged.length, 1);
        assert.equal(merged[0].displayName, "Sam");
    });

    test("skips entries that have neither a personId nor a displayName", () => {
        const merged = mergeUniquePlanPeople([
            { personId: null, displayName: "   " },
            { personId: "p1", displayName: "Sam" },
        ]);
        assert.deepEqual(merged.map((p) => p.personId), ["p1"]);
    });

    test("keeps the first occurrence's profileImageUrl", () => {
        const merged = mergeUniquePlanPeople(
            [{ personId: "p1", displayName: "Sam", profileImageUrl: "first.png" }],
            [{ personId: "p1", displayName: "Sam", profileImageUrl: "second.png" }]
        );
        assert.equal(merged.length, 1);
        assert.equal(merged[0].profileImageUrl, "first.png");
    });
});

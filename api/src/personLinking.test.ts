import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    areNamesReconciliable,
    selectPersonCandidateForLinkedUser,
    shouldReplaceLinkedPersonPlaceholder,
} from "./personLinking.js";

describe("personLinking", () => {
    test("treats a short nickname as reconcilable with a longer display name", () => {
        assert.equal(areNamesReconciliable("Kev", "Kevin"), true);
    });

    test("does not reconcile multi-token names that only partially overlap", () => {
        assert.equal(areNamesReconciliable("Kev S", "Kevin"), false);
    });

    test("reuses an exact existing match before nickname matching", () => {
        assert.deepEqual(
            selectPersonCandidateForLinkedUser({
                incomingDisplayName: "Kevin",
                candidates: [
                    { id: "person-kev", displayName: "Kev" },
                    { id: "person-kevin", displayName: "Kevin" },
                ],
            }),
            { id: "person-kevin", displayName: "Kevin" }
        );
    });

    test("reconciles a single nickname-like candidate", () => {
        assert.deepEqual(
            selectPersonCandidateForLinkedUser({
                incomingDisplayName: "Kevin",
                candidates: [{ id: "person-kev", displayName: "Kev" }],
            }),
            { id: "person-kev", displayName: "Kev" }
        );
    });

    test("avoids auto-linking when multiple nickname-like candidates exist", () => {
        assert.equal(
            selectPersonCandidateForLinkedUser({
                incomingDisplayName: "Samuel",
                candidates: [
                    { id: "person-sam", displayName: "Sam" },
                    { id: "person-samu", displayName: "Samu" },
                ],
            }),
            null
        );
    });

    test("replaces the system placeholder when a real display name becomes available", () => {
        assert.equal(
            shouldReplaceLinkedPersonPlaceholder("Friend", "Chanmi"),
            true
        );
        assert.equal(
            shouldReplaceLinkedPersonPlaceholder("TK", "Chanmi"),
            false
        );
    });
});

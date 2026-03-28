import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { buildSharedPeople } from "./socialPlan.js";

function makeParticipant(overrides: Record<string, unknown> = {}) {
    return {
        id: "part-1",
        planId: "plan-1",
        personId: "person-1",
        displayName: "Alice",
        isPrimary: false,
        createdAt: new Date("2025-01-01"),
        updatedAt: new Date("2025-01-01"),
        person: {
            linkedUserId: null,
            displayName: "Alice",
        },
        ...overrides,
    } as any;
}

describe("buildSharedPeople — profileImageUrl", () => {
    test("includes owner profileImageUrl from ownerProfileImageUrl param", () => {
        const result = buildSharedPeople({
            ownerId: "owner-1",
            ownerDisplayName: "Owner",
            ownerProfileImageUrl: "https://example.com/owner.jpg",
            participants: [],
        });

        assert.equal(result.length, 1);
        assert.equal(result[0]!.profileImageUrl, "https://example.com/owner.jpg");
    });

    test("prefers connectionMap profileImageUrl for owner over ownerProfileImageUrl", () => {
        const connectionMap = new Map([
            ["owner-1", { personId: "p-1", displayName: "Owner", profileImageUrl: "https://example.com/from-connection.jpg" }],
        ]);

        const result = buildSharedPeople({
            ownerId: "owner-1",
            ownerDisplayName: "Owner",
            ownerProfileImageUrl: "https://example.com/direct.jpg",
            participants: [],
            connectionMap,
        });

        assert.equal(result[0]!.profileImageUrl, "https://example.com/from-connection.jpg");
    });

    test("returns null profileImageUrl for owner when no image", () => {
        const result = buildSharedPeople({
            ownerId: "owner-1",
            ownerDisplayName: "Owner",
            ownerProfileImageUrl: null,
            participants: [],
        });

        assert.equal(result[0]!.profileImageUrl, null);
    });

    test("includes participant profileImageUrl from linked user", () => {
        const participant = makeParticipant({
            person: {
                linkedUserId: "user-2",
                displayName: "Alice",
                linkedUser: { profileImageUrl: "https://example.com/alice.jpg" },
            },
        });

        const result = buildSharedPeople({
            ownerId: "owner-1",
            ownerDisplayName: "Owner",
            ownerProfileImageUrl: null,
            participants: [participant],
        });

        const alice = result.find((p) => p.displayName === "Alice");
        assert.equal(alice?.profileImageUrl, "https://example.com/alice.jpg");
    });

    test("prefers connectionMap profileImageUrl for participant", () => {
        const connectionMap = new Map([
            ["user-2", { personId: "p-2", displayName: "Alice", profileImageUrl: "https://example.com/connection-alice.jpg" }],
        ]);

        const participant = makeParticipant({
            person: {
                linkedUserId: "user-2",
                displayName: "Alice",
                linkedUser: { profileImageUrl: "https://example.com/direct-alice.jpg" },
            },
        });

        const result = buildSharedPeople({
            ownerId: "owner-1",
            ownerDisplayName: "Owner",
            ownerProfileImageUrl: null,
            participants: [participant],
            connectionMap,
        });

        const alice = result.find((p) => p.displayName === "Alice");
        assert.equal(alice?.profileImageUrl, "https://example.com/connection-alice.jpg");
    });

    test("returns null profileImageUrl for participant without linked user", () => {
        const participant = makeParticipant({
            person: { linkedUserId: null, displayName: "Bob" },
        });

        const result = buildSharedPeople({
            ownerId: "owner-1",
            ownerDisplayName: "Owner",
            ownerProfileImageUrl: null,
            participants: [participant],
        });

        const bob = result.find((p) => p.displayName === "Bob");
        assert.equal(bob?.profileImageUrl, null);
    });

    test("returns null profileImageUrl when linked user has no image", () => {
        const participant = makeParticipant({
            person: {
                linkedUserId: "user-2",
                displayName: "Carol",
                linkedUser: { profileImageUrl: null },
            },
        });

        const result = buildSharedPeople({
            ownerId: "owner-1",
            ownerDisplayName: "Owner",
            ownerProfileImageUrl: null,
            participants: [participant],
        });

        const carol = result.find((p) => p.displayName === "Carol");
        assert.equal(carol?.profileImageUrl, null);
    });
});

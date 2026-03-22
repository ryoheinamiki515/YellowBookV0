import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { serializePlanActivity } from "./planActivity.js";

const NOW = new Date("2026-03-15T12:00:00.000Z");

function makeActivity(overrides?: Partial<{
    id: string;
    planId: string;
    actorId: string;
    kind: "MESSAGE" | "RESPONSE" | "STATE_CHANGE" | "MILESTONE";
    body: string | null;
    metadata: Record<string, unknown> | null;
}>) {
    return {
        id: overrides?.id ?? "activity-1",
        planId: overrides?.planId ?? "plan-1",
        actorId: overrides?.actorId ?? "user-bob",
        kind: overrides?.kind ?? "MESSAGE",
        body: overrides?.body ?? null,
        metadata: overrides?.metadata ?? null,
        createdAt: NOW,
        actor: {
            displayName: "Bob" as string | null,
        },
    };
}

// ===========================================================================
// Issue #15 — Discussion serialization
// ===========================================================================
describe("serializePlanActivity", () => {
    test("serializes a MESSAGE activity with body", () => {
        const result = serializePlanActivity(
            makeActivity({ kind: "MESSAGE", body: "Sounds great!" }),
            new Map(),
            "user-viewer"
        );

        assert.equal(result.id, "activity-1");
        assert.equal(result.kind, "MESSAGE");
        assert.equal(result.body, "Sounds great!");
        assert.equal(result.actorDisplayName, "Bob");
        assert.equal(result.actorIsViewer, false);
        assert.equal(result.createdAt, NOW.toISOString());
    });

    test("sets actorIsViewer=true when viewer is the actor", () => {
        const result = serializePlanActivity(
            makeActivity({ actorId: "user-bob" }),
            new Map(),
            "user-bob"
        );

        assert.equal(result.actorIsViewer, true);
    });

    test("prefers connectionMap display name over actor's own name", () => {
        const result = serializePlanActivity(
            makeActivity({ actorId: "user-bob" }),
            new Map([["user-bob", { personId: "person-bob", displayName: "Bobby" }]]),
            "user-viewer"
        );

        assert.equal(result.actorDisplayName, "Bobby");
    });

    test("falls back to actor.displayName when not in connectionMap", () => {
        const result = serializePlanActivity(
            makeActivity({ actorId: "user-bob" }),
            new Map(),
            "user-viewer"
        );

        assert.equal(result.actorDisplayName, "Bob");
    });

    test("falls back to 'Someone' when actor has no display name and not in connectionMap", () => {
        const activity = makeActivity({ actorId: "user-ghost" });
        activity.actor.displayName = null;

        const result = serializePlanActivity(activity, new Map(), "user-viewer");

        assert.equal(result.actorDisplayName, "Someone");
    });

    // Issue #14 — RESPONSE activity serialization
    test("serializes RESPONSE activity with metadata", () => {
        const result = serializePlanActivity(
            makeActivity({
                kind: "RESPONSE",
                metadata: {
                    previousResponse: "PENDING",
                    newResponse: "ACCEPTED",
                    actorDisplayName: "Bob",
                },
            }),
            new Map(),
            "user-viewer"
        );

        assert.equal(result.kind, "RESPONSE");
        const meta = result.metadata as any;
        assert.equal(meta.previousResponse, "PENDING");
        assert.equal(meta.newResponse, "ACCEPTED");
    });

    // Issue #24 — STATE_CHANGE activity serialization
    test("serializes STATE_CHANGE activity for marked_done", () => {
        const result = serializePlanActivity(
            makeActivity({
                kind: "STATE_CHANGE",
                metadata: { action: "marked_done" },
            }),
            new Map(),
            "user-bob"
        );

        assert.equal(result.kind, "STATE_CHANGE");
        assert.equal(result.actorIsViewer, true);
        assert.deepEqual(result.metadata, { action: "marked_done" });
    });
});

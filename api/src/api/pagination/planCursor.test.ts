import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    encodeCursor,
    decodeCursor,
    encodeDisplayNameCursor,
    decodeDisplayNameCursor,
} from "./planCursor.js";

describe("PlanCursor (updatedAt + id)", () => {
    test("round-trips a cursor", () => {
        const input = { updatedAt: "2025-01-15T12:00:00.000Z", id: "a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d" };
        const encoded = encodeCursor(input);
        const decoded = decodeCursor(encoded);
        assert.deepEqual(decoded, input);
    });

    test("rejects invalid cursor", () => {
        assert.throws(() => decodeCursor("not-a-valid-cursor"));
    });
});

describe("DisplayNameCursor", () => {
    test("round-trips a cursor", () => {
        const input = { displayName: "Alice", id: "a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d" };
        const encoded = encodeDisplayNameCursor(input);
        const decoded = decodeDisplayNameCursor(encoded);
        assert.deepEqual(decoded, input);
    });

    test("handles special characters in displayName", () => {
        const input = { displayName: "José María", id: "a1b2c3d4-e5f6-1a2b-8c3d-4e5f6a7b8c9d" };
        const encoded = encodeDisplayNameCursor(input);
        const decoded = decodeDisplayNameCursor(encoded);
        assert.deepEqual(decoded, input);
    });

    test("rejects invalid cursor", () => {
        assert.throws(() => decodeDisplayNameCursor("not-a-valid-cursor"));
    });
});

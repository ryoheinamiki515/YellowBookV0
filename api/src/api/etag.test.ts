import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { representationEtag } from "./etag.js";

describe("representationEtag", () => {
    test("changes when the serialized payload changes", () => {
        const before = {
            data: {
                id: "plan-1",
                participants: [{ id: "participant-1", displayName: "TK" }],
            },
        };
        const after = {
            data: {
                id: "plan-1",
                participants: [{ id: "participant-1", displayName: "ChanMi" }],
            },
        };

        assert.notEqual(representationEtag(before), representationEtag(after));
    });
});

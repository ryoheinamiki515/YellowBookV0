import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { notificationRouteForData } from "./notificationRouting.js";

describe("notificationRouteForData", () => {
    test("routes a plan_shared payload to the plan detail path", () => {
        assert.equal(
            notificationRouteForData({ type: "plan_shared", planId: "abc-123" }),
            "/plan/abc-123"
        );
    });

    test("returns null for unknown notification types", () => {
        assert.equal(notificationRouteForData({ type: "something_else", planId: "abc" }), null);
    });

    test("returns null when planId is missing or empty", () => {
        assert.equal(notificationRouteForData({ type: "plan_shared" }), null);
        assert.equal(notificationRouteForData({ type: "plan_shared", planId: "" }), null);
    });

    test("returns null for non-object payloads", () => {
        assert.equal(notificationRouteForData(null), null);
        assert.equal(notificationRouteForData(undefined), null);
        assert.equal(notificationRouteForData("plan_shared"), null);
    });

    test("encodes a planId so it cannot escape the /plan/ route", () => {
        assert.equal(
            notificationRouteForData({ type: "plan_shared", planId: "../login" }),
            "/plan/..%2Flogin"
        );
    });
});

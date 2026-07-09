import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { pushRegistrationRetryDelayMs } from "./pushRegistrationRetry.js";

describe("pushRegistrationRetryDelayMs", () => {
    test("grows exponentially from a 1s base", () => {
        assert.equal(pushRegistrationRetryDelayMs(0), 1000);
        assert.equal(pushRegistrationRetryDelayMs(1), 2000);
        assert.equal(pushRegistrationRetryDelayMs(2), 4000);
        assert.equal(pushRegistrationRetryDelayMs(3), 8000);
    });

    test("caps at 30s", () => {
        assert.equal(pushRegistrationRetryDelayMs(10), 30000);
        assert.equal(pushRegistrationRetryDelayMs(100), 30000);
    });
});

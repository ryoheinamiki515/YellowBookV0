import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    buildExpoMessages,
    sendExpoPushMessages,
    unregisteredTokens,
    type ExpoPushMessage,
} from "./pushNotifications.js";

const PAYLOAD = { title: "Ada shared a plan", body: "Coffee this weekend", data: { type: "plan_shared", planId: "p1" } };

describe("buildExpoMessages", () => {
    test("builds one message per token with sound + data", () => {
        const messages = buildExpoMessages(["ExpoPushToken[a]", "ExpoPushToken[b]"], PAYLOAD);
        assert.equal(messages.length, 2);
        assert.deepEqual(messages[0], {
            to: "ExpoPushToken[a]",
            title: PAYLOAD.title,
            body: PAYLOAD.body,
            sound: "default",
            data: PAYLOAD.data,
        });
    });

    test("omits data when not provided", () => {
        const [message] = buildExpoMessages(["ExpoPushToken[a]"], { title: "t", body: "b" });
        assert.equal("data" in message!, false);
    });
});

describe("unregisteredTokens", () => {
    test("returns tokens whose ticket is a DeviceNotRegistered error", () => {
        const messages = buildExpoMessages(["good", "dead", "other-error"], PAYLOAD);
        const tickets = [
            { status: "ok" as const, id: "1" },
            { status: "error" as const, message: "gone", details: { error: "DeviceNotRegistered" } },
            { status: "error" as const, message: "boom", details: { error: "MessageTooBig" } },
        ];
        assert.deepEqual(unregisteredTokens(messages, tickets), ["dead"]);
    });

    test("returns empty when all ok", () => {
        const messages = buildExpoMessages(["a"], PAYLOAD);
        assert.deepEqual(unregisteredTokens(messages, [{ status: "ok" }]), []);
    });
});

describe("sendExpoPushMessages", () => {
    test("POSTs JSON to Expo and returns concatenated tickets", async () => {
        const calls: { url: string; body: unknown }[] = [];
        const fakeFetch = (async (url: any, init: any) => {
            calls.push({ url: String(url), body: JSON.parse(init.body) });
            return { json: async () => ({ data: [{ status: "ok", id: "x" }] }) } as any;
        }) as typeof fetch;

        const messages = buildExpoMessages(["t1"], PAYLOAD);
        const tickets = await sendExpoPushMessages(messages, fakeFetch);

        assert.equal(calls.length, 1);
        assert.match(calls[0]!.url, /exp\.host/);
        assert.deepEqual(calls[0]!.body, messages);
        assert.deepEqual(tickets, [{ status: "ok", id: "x" }]);
    });

    test("chunks into batches of 100", async () => {
        const batchSizes: number[] = [];
        const fakeFetch = (async (_url: any, init: any) => {
            const batch = JSON.parse(init.body) as ExpoPushMessage[];
            batchSizes.push(batch.length);
            return { json: async () => ({ data: batch.map(() => ({ status: "ok" })) }) } as any;
        }) as typeof fetch;

        const tokens = Array.from({ length: 250 }, (_, i) => `t${i}`);
        const tickets = await sendExpoPushMessages(buildExpoMessages(tokens, PAYLOAD), fakeFetch);

        assert.deepEqual(batchSizes, [100, 100, 50]);
        assert.equal(tickets.length, 250);
    });
});

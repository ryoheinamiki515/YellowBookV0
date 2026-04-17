import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import { RefreshTokenRevokedError, refreshAccessToken } from "./refreshAccessToken";

describe("refreshAccessToken", () => {
    const originalFetch = globalThis.fetch;
    const originalDomain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
    const originalClientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;

    beforeEach(() => {
        process.env.EXPO_PUBLIC_AUTH0_DOMAIN = "example.auth0.com";
        process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID = "test-client";
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        if (originalDomain === undefined) delete process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
        else process.env.EXPO_PUBLIC_AUTH0_DOMAIN = originalDomain;
        if (originalClientId === undefined) delete process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
        else process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID = originalClientId;
    });

    function stubFetch(status: number, body: unknown) {
        globalThis.fetch = (async () =>
            new Response(JSON.stringify(body), {
                status,
                headers: { "Content-Type": "application/json" },
            })) as typeof fetch;
    }

    test("returns new tokens on 200 with rotation", async () => {
        stubFetch(200, { access_token: "new-access", refresh_token: "new-refresh" });
        const result = await refreshAccessToken("old-refresh");
        assert.equal(result.accessToken, "new-access");
        assert.equal(result.refreshToken, "new-refresh");
    });

    test("falls back to provided refresh token when Auth0 does not rotate", async () => {
        stubFetch(200, { access_token: "new-access" });
        const result = await refreshAccessToken("old-refresh");
        assert.equal(result.accessToken, "new-access");
        assert.equal(result.refreshToken, "old-refresh");
    });

    test("4xx invalid_grant throws RefreshTokenRevokedError with description", async () => {
        stubFetch(403, { error: "invalid_grant", error_description: "Token revoked" });
        await assert.rejects(
            () => refreshAccessToken("bad"),
            (err: Error) =>
                err instanceof RefreshTokenRevokedError && err.message === "Token revoked"
        );
    });

    test("4xx without description falls back to error code", async () => {
        stubFetch(400, { error: "invalid_grant" });
        await assert.rejects(
            () => refreshAccessToken("bad"),
            (err: Error) =>
                err instanceof RefreshTokenRevokedError && err.message === "invalid_grant"
        );
    });

    test("5xx throws generic Error (transient)", async () => {
        stubFetch(503, { error: "server_error" });
        await assert.rejects(
            () => refreshAccessToken("rt"),
            (err: Error) =>
                !(err instanceof RefreshTokenRevokedError) && /HTTP 503/.test(err.message)
        );
    });

    test("200 without access_token is treated as transient failure", async () => {
        stubFetch(200, {});
        await assert.rejects(
            () => refreshAccessToken("rt"),
            (err: Error) => !(err instanceof RefreshTokenRevokedError)
        );
    });

    test("network error propagates as generic Error (transient)", async () => {
        const networkErr = new Error("network down");
        globalThis.fetch = (async () => {
            throw networkErr;
        }) as typeof fetch;
        await assert.rejects(
            () => refreshAccessToken("rt"),
            (err: Error) => err === networkErr
        );
    });

    test("sends grant_type, client_id, and refresh_token in body", async () => {
        let captured: { url: unknown; init: RequestInit | undefined } | null = null;
        globalThis.fetch = (async (url: unknown, init?: RequestInit) => {
            captured = { url, init };
            return new Response(JSON.stringify({ access_token: "x" }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }) as typeof fetch;

        await refreshAccessToken("rt1");

        assert.equal(captured!.url, "https://example.auth0.com/oauth/token");
        assert.equal(captured!.init?.method, "POST");
        const params = new URLSearchParams(captured!.init?.body as string);
        assert.equal(params.get("grant_type"), "refresh_token");
        assert.equal(params.get("client_id"), "test-client");
        assert.equal(params.get("refresh_token"), "rt1");
    });

    test("throws when EXPO_PUBLIC_AUTH0_DOMAIN missing", async () => {
        delete process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
        await assert.rejects(() => refreshAccessToken("rt"), /EXPO_PUBLIC_AUTH0_DOMAIN/);
    });

    test("throws when EXPO_PUBLIC_AUTH0_CLIENT_ID missing", async () => {
        delete process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
        await assert.rejects(() => refreshAccessToken("rt"), /EXPO_PUBLIC_AUTH0_CLIENT_ID/);
    });
});

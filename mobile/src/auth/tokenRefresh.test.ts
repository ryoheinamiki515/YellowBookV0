import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RefreshTokenRevokedError, type RefreshedTokens } from "./refreshAccessToken";
import { createTokenRefresher, type TokenRefresherDeps } from "./tokenRefresh";

type Harness = {
    deps: TokenRefresherDeps;
    saves: { access: string[]; refresh: string[] };
    removes: { access: number; refresh: number };
};

function makeHarness(overrides: Partial<TokenRefresherDeps> = {}): Harness {
    const saves = { access: [] as string[], refresh: [] as string[] };
    const removes = { access: 0, refresh: 0 };

    const deps: TokenRefresherDeps = {
        getRefreshToken: async () => "stored-rt",
        saveAccessToken: async (t) => { saves.access.push(t); },
        saveRefreshToken: async (t) => { saves.refresh.push(t); },
        removeAccessToken: async () => { removes.access++; },
        removeRefreshToken: async () => { removes.refresh++; },
        refresh: async () => ({ accessToken: "new-at", refreshToken: "new-rt" }),
        ...overrides,
    };

    return { deps, saves, removes };
}

describe("createTokenRefresher", () => {
    test("success path returns refreshed and persists both tokens", async () => {
        const { deps, saves } = makeHarness();
        const refresher = createTokenRefresher(deps);

        const result = await refresher.ensureFreshAccessToken();

        assert.deepEqual(result, { status: "refreshed", accessToken: "new-at" });
        assert.deepEqual(saves.access, ["new-at"]);
        assert.deepEqual(saves.refresh, ["new-rt"]);
    });

    test("returns no_refresh_token when none stored", async () => {
        const { deps } = makeHarness({ getRefreshToken: async () => null });
        const refresher = createTokenRefresher(deps);

        const result = await refresher.ensureFreshAccessToken();

        assert.deepEqual(result, { status: "no_refresh_token" });
    });

    test("RefreshTokenRevokedError returns revoked and clears both tokens", async () => {
        const { deps, removes, saves } = makeHarness({
            refresh: async () => {
                throw new RefreshTokenRevokedError("invalid_grant", null);
            },
        });
        const refresher = createTokenRefresher(deps);

        const result = await refresher.ensureFreshAccessToken();

        assert.deepEqual(result, { status: "revoked" });
        assert.equal(removes.access, 1);
        assert.equal(removes.refresh, 1);
        assert.deepEqual(saves.access, []);
        assert.deepEqual(saves.refresh, []);
    });

    test("generic error returns transient_error and does NOT clear tokens", async () => {
        const err = new Error("network down");
        const { deps, removes } = makeHarness({
            refresh: async () => { throw err; },
        });
        const refresher = createTokenRefresher(deps);

        const result = await refresher.ensureFreshAccessToken();

        assert.equal(result.status, "transient_error");
        assert.equal((result as { status: "transient_error"; error: unknown }).error, err);
        assert.equal(removes.access, 0);
        assert.equal(removes.refresh, 0);
    });

    test("single-flight: three concurrent calls trigger refresh once, all get same result", async () => {
        let refreshCalls = 0;
        let release!: () => void;
        const gate = new Promise<void>((r) => { release = r; });
        const { deps } = makeHarness({
            refresh: async (): Promise<RefreshedTokens> => {
                refreshCalls++;
                await gate;
                return { accessToken: "shared-at", refreshToken: "shared-rt" };
            },
        });
        const refresher = createTokenRefresher(deps);

        const p1 = refresher.ensureFreshAccessToken();
        const p2 = refresher.ensureFreshAccessToken();
        const p3 = refresher.ensureFreshAccessToken();

        release();
        const results = await Promise.all([p1, p2, p3]);

        assert.equal(refreshCalls, 1);
        for (const r of results) {
            assert.deepEqual(r, { status: "refreshed", accessToken: "shared-at" });
        }
    });

    test("in-flight promise clears after settle so a later call starts a new refresh", async () => {
        let refreshCalls = 0;
        const { deps } = makeHarness({
            refresh: async (): Promise<RefreshedTokens> => {
                refreshCalls++;
                return { accessToken: `at-${refreshCalls}`, refreshToken: `rt-${refreshCalls}` };
            },
        });
        const refresher = createTokenRefresher(deps);

        await refresher.ensureFreshAccessToken();
        await refresher.ensureFreshAccessToken();

        assert.equal(refreshCalls, 2);
    });

    test("in-flight promise clears after a rejected refresh too", async () => {
        let refreshCalls = 0;
        const { deps } = makeHarness({
            refresh: async () => {
                refreshCalls++;
                if (refreshCalls === 1) throw new Error("first failed");
                return { accessToken: "at-2", refreshToken: "rt-2" };
            },
        });
        const refresher = createTokenRefresher(deps);

        const first = await refresher.ensureFreshAccessToken();
        const second = await refresher.ensureFreshAccessToken();

        assert.equal(first.status, "transient_error");
        assert.deepEqual(second, { status: "refreshed", accessToken: "at-2" });
        assert.equal(refreshCalls, 2);
    });

    test("getRefreshToken read failure returns transient_error, not a thrown rejection", async () => {
        const readErr = new Error("secure store unavailable");
        const { deps, removes } = makeHarness({
            getRefreshToken: async () => { throw readErr; },
        });
        const refresher = createTokenRefresher(deps);

        const result = await refresher.ensureFreshAccessToken();

        assert.equal(result.status, "transient_error");
        assert.equal((result as { status: "transient_error"; error: unknown }).error, readErr);
        assert.equal(removes.access, 0);
        assert.equal(removes.refresh, 0);
    });

    test("saveAccessToken failure after successful refresh returns transient_error", async () => {
        const saveErr = new Error("disk full");
        const { deps } = makeHarness({
            saveAccessToken: async () => { throw saveErr; },
        });
        const refresher = createTokenRefresher(deps);

        const result = await refresher.ensureFreshAccessToken();

        assert.equal(result.status, "transient_error");
        assert.equal((result as { status: "transient_error"; error: unknown }).error, saveErr);
    });

    test("storage cleanup failure on revoke does not mask the revoked signal", async () => {
        const { deps } = makeHarness({
            refresh: async () => {
                throw new RefreshTokenRevokedError("revoked", null);
            },
            removeAccessToken: async () => { throw new Error("storage offline"); },
            removeRefreshToken: async () => { throw new Error("storage offline"); },
        });
        const refresher = createTokenRefresher(deps);

        const result = await refresher.ensureFreshAccessToken();

        assert.deepEqual(result, { status: "revoked" });
    });
});

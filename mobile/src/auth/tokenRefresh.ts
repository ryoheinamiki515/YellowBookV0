import { RefreshTokenRevokedError, type RefreshedTokens } from "./refreshAccessToken";

export type TokenRefresherDeps = {
    getRefreshToken: () => Promise<string | null>;
    saveAccessToken: (token: string) => Promise<void>;
    saveRefreshToken: (token: string) => Promise<void>;
    removeAccessToken: () => Promise<void>;
    removeRefreshToken: () => Promise<void>;
    refresh: (refreshToken: string) => Promise<RefreshedTokens>;
};

export type EnsureFreshAccessTokenResult =
    | { status: "refreshed"; accessToken: string }
    | { status: "no_refresh_token" }
    | { status: "revoked" }
    | { status: "transient_error"; error: unknown };

export type TokenRefresher = {
    ensureFreshAccessToken: () => Promise<EnsureFreshAccessTokenResult>;
};

export function createTokenRefresher(deps: TokenRefresherDeps): TokenRefresher {
    let inFlight: Promise<EnsureFreshAccessTokenResult> | null = null;

    async function runRefresh(): Promise<EnsureFreshAccessTokenResult> {
        try {
            const refreshToken = await deps.getRefreshToken();
            if (!refreshToken) return { status: "no_refresh_token" };

            const tokens = await deps.refresh(refreshToken);
            await Promise.all([
                deps.saveAccessToken(tokens.accessToken),
                deps.saveRefreshToken(tokens.refreshToken),
            ]);
            return { status: "refreshed", accessToken: tokens.accessToken };
        } catch (error) {
            if (error instanceof RefreshTokenRevokedError) {
                try {
                    await Promise.all([
                        deps.removeAccessToken(),
                        deps.removeRefreshToken(),
                    ]);
                } catch {
                    // Storage cleanup failure shouldn't mask the revoked signal.
                }
                return { status: "revoked" };
            }
            return { status: "transient_error", error };
        }
    }

    async function ensureFreshAccessToken(): Promise<EnsureFreshAccessTokenResult> {
        if (inFlight) return inFlight;

        const promise = runRefresh();
        inFlight = promise;
        try {
            return await promise;
        } finally {
            inFlight = null;
        }
    }

    return { ensureFreshAccessToken };
}

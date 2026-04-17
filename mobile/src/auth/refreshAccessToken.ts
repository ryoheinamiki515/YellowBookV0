export class RefreshTokenRevokedError extends Error {
    readonly responseBody: unknown;

    constructor(message: string, responseBody: unknown) {
        super(message);
        this.name = "RefreshTokenRevokedError";
        this.responseBody = responseBody;
    }
}

export type RefreshedTokens = {
    accessToken: string;
    refreshToken: string;
};

// Posts directly to Auth0's token endpoint. Must NOT route through the app's customFetch
// wrapper — a refresh that returns 401 would otherwise recurse into the 401 handler.
export async function refreshAccessToken(refreshToken: string): Promise<RefreshedTokens> {
    const domain = process.env.EXPO_PUBLIC_AUTH0_DOMAIN;
    const clientId = process.env.EXPO_PUBLIC_AUTH0_CLIENT_ID;
    if (!domain) throw new Error("Missing EXPO_PUBLIC_AUTH0_DOMAIN");
    if (!clientId) throw new Error("Missing EXPO_PUBLIC_AUTH0_CLIENT_ID");

    const res = await fetch(`https://${domain}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: clientId,
            refresh_token: refreshToken,
        }).toString(),
    });

    const body = await res.json().catch(() => null);

    if (res.ok && body?.access_token) {
        return {
            accessToken: body.access_token,
            refreshToken: body.refresh_token ?? refreshToken,
        };
    }

    // Only `invalid_grant` means the refresh token itself is revoked / expired / mismatched —
    // that is the single terminal case per Auth0. Other 4xx (invalid_request, invalid_client,
    // 429 rate limit, etc.) are client/config/transient errors; the refresh token may still be
    // valid, so we must not sign the user out.
    if (body?.error === "invalid_grant") {
        const message = body?.error_description || body?.error || `HTTP ${res.status}`;
        throw new RefreshTokenRevokedError(message, body);
    }

    throw new Error(`Auth0 token refresh failed: HTTP ${res.status}`);
}

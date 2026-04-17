import { Platform } from "react-native";
import Constants from "expo-constants";
import {
    getRefreshToken,
    getToken,
    removeRefreshToken,
    removeToken,
    saveRefreshToken,
    saveToken,
} from "./../lib/tokenStorage";
import { emitAuthSessionInvalidation } from "../auth/authSessionEvents";
import { refreshAccessToken } from "../auth/refreshAccessToken";
import { createTokenRefresher } from "../auth/tokenRefresh";

function getExpoMetroHostIp(): string | null {
    const c = Constants as any;

    const hostCandidates = [
        c?.expoConfig?.hostUri,
        c?.manifest2?.extra?.expoClient?.hostUri,
        c?.manifest?.debuggerHost,
        c?.expoGoConfig?.debuggerHost,
    ].filter((v: unknown): v is string => typeof v === "string" && v.length > 0);

    for (const host of hostCandidates) {
        const withoutScheme = host.replace(/^https?:\/\//, "");
        const hostPort = withoutScheme.split("/")[0] ?? "";
        const hostname = hostPort.split(":")[0] ?? "";

        // Skip simulator-local values; keep scanning for a usable LAN IP/host.
        if (!hostname || hostname === "localhost" || hostname === "127.0.0.1") continue;

        return hostname;
    }

    return null;
}

function replaceLocalhostWithReachableHost(raw: string): string {
    if (!/localhost|127\.0\.0\.1/.test(raw)) return raw;

    if (Platform.OS === "android") {
        return raw.replace("127.0.0.1", "10.0.2.2").replace("localhost", "10.0.2.2");
    }

    return raw;
}

// 1) Base URL: set this in .env as EXPO_PUBLIC_API_BASE_URL
//    iOS simulator can use localhost
//    Android emulator needs 10.0.2.2 for "your machine"
//    Physical devices should use your computer LAN IP (we also retry with Expo's LAN host on failure).
function getBaseUrl() {
    const raw = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (!raw) throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");

    const normalized = replaceLocalhostWithReachableHost(raw);

    // Avoid accidental double slash when generated paths start with /v1
    return normalized.endsWith("/") ? normalized.slice(0, -1) : normalized;
}

async function parseBody(res: Response) {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json") || ct.includes("application/problem+json")) {
        return res.json();
    }
    return res.text();
}

const tokenRefresher = createTokenRefresher({
    getRefreshToken,
    saveAccessToken: saveToken,
    saveRefreshToken,
    removeAccessToken: removeToken,
    removeRefreshToken,
    refresh: refreshAccessToken,
});

function buildRequestHeaders(options: RequestInit, bearerToken: string | null) {
    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");
    if (bearerToken) headers.set("Authorization", `Bearer ${bearerToken}`);

    // Only set JSON content-type when we actually send a JSON body.
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    return headers;
}

// Performs a single fetch with the LAN-host fallback that physical devices need on first boot.
async function executeRequest(
    url: string,
    baseUrl: string,
    options: RequestInit,
    bearerToken: string | null
): Promise<Response> {
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    const headers = buildRequestHeaders(options, bearerToken);

    try {
        return await fetch(fullUrl, { ...options, headers });
    } catch (cause: any) {
        const isRelativeRequest = !url.startsWith("http");
        const looksLocalhost = /localhost|127\.0\.0\.1/.test(baseUrl);
        const metroHost = getExpoMetroHostIp();

        // Keep simulator behavior intact: try localhost first, then auto-retry with Expo's LAN host.
        if (isRelativeRequest && looksLocalhost && metroHost && Platform.OS !== "web") {
            const fallbackBaseUrl = baseUrl
                .replace("127.0.0.1", metroHost)
                .replace("localhost", metroHost);
            const fallbackUrl = `${fallbackBaseUrl}${url}`;

            try {
                return await fetch(fallbackUrl, { ...options, headers });
            } catch {
                // Fall through to the original error below for a clearer message.
            }
        }

        const hostHint = Platform.OS === "android"
            ? "Android emulator should use 10.0.2.2; physical devices must use your computer LAN IP."
            : "iOS simulator can use localhost; physical devices must use your computer LAN IP.";
        const err: any = new Error(
            `Network request failed for ${fullUrl}. Check EXPO_PUBLIC_API_BASE_URL (${baseUrl}). ${hostHint}`
        );
        err.cause = cause;
        err.baseUrl = baseUrl;
        err.url = fullUrl;
        throw err;
    }
}

// Orval custom fetch wrapper returns { status, data, headers }
export const customFetch = async <T>(
    url: string,
    options: RequestInit
): Promise<T> => {
    const baseUrl = getBaseUrl();
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;
    const token = await getToken();

    let res = await executeRequest(url, baseUrl, options, token);

    // On 401, try to refresh the access token exactly once and retry. A 401 on the retry
    // propagates as a normal error below — we never recurse into the refresh flow twice.
    if (res.status === 401) {
        const refreshResult = await tokenRefresher.ensureFreshAccessToken();

        if (refreshResult.status === "refreshed") {
            res = await executeRequest(url, baseUrl, options, refreshResult.accessToken);
            if (res.status === 401) {
                // Freshly-minted token still rejected — the session is unusable.
                emitAuthSessionInvalidation({
                    kind: "unauthorized",
                    status: 401,
                    url: fullUrl,
                });
            }
        } else if (
            refreshResult.status === "revoked" ||
            refreshResult.status === "no_refresh_token"
        ) {
            emitAuthSessionInvalidation({
                kind: "unauthorized",
                status: 401,
                url: fullUrl,
            });
        }
        // transient_error: do not sign out; let the 401 surface as an error so the caller can retry.
    }

    const body = await parseBody(res);

    // Make non-2xx fail fast (TanStack Query wants thrown errors)
    if (!res.ok) {
        const err: any = new Error(body?.title || body?.detail || `HTTP ${res.status}`);
        err.status = res.status;
        err.problem = body; // your RFC7807 payload
        err.headers = res.headers;
        throw err;
    }

    return { status: res.status, data: body, headers: res.headers } as any as T;
};

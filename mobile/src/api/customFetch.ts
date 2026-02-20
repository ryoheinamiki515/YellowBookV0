import { Platform } from "react-native";
import { getToken } from "./../lib/tokenStorage";

// 1) Base URL: set this in .env as EXPO_PUBLIC_API_BASE_URL
//    iOS simulator can use localhost
//    Android emulator needs 10.0.2.2 for "your machine"
function getBaseUrl() {
    const raw = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (!raw) throw new Error("Missing EXPO_PUBLIC_API_BASE_URL");

    if (Platform.OS === "android" && raw.includes("localhost")) {
        return raw.replace("localhost", "10.0.2.2");
    }
    return raw;
}

// 2) Token getter backed by SecureStore + Auth0
async function getAccessToken(): Promise<string | null> {
    // 1. Check Env var override
    if (process.env.EXPO_PUBLIC_DEV_ACCESS_TOKEN) {
        return process.env.EXPO_PUBLIC_DEV_ACCESS_TOKEN;
    }
    // 2. Check SecureStore
    return await getToken();
}

async function parseBody(res: Response) {
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json") || ct.includes("application/problem+json")) {
        return res.json();
    }
    return res.text();
}

// Orval custom fetch wrapper returns { status, data, headers }
export const customFetch = async <T>(
    url: string,
    options: RequestInit
): Promise<T> => {
    const baseUrl = getBaseUrl();
    const fullUrl = url.startsWith("http") ? url : `${baseUrl}${url}`;

    const token = await getAccessToken();

    const headers = new Headers(options.headers);
    headers.set("Accept", "application/json");

    if (token) headers.set("Authorization", `Bearer ${token}`);

    // Only set JSON content-type when we actually send a JSON body
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    const res = await fetch(fullUrl, { ...options, headers });

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

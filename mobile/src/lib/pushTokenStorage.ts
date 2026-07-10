import { unregisterPushToken } from "../api/generated/system/system";
import {
    readStoredValue,
    removeStoredValue,
    writeStoredValue,
} from "./clientStorage";

const PUSH_TOKEN_KEY = "expo_push_token";

export function saveRegisteredPushToken(token: string) {
    return writeStoredValue(PUSH_TOKEN_KEY, token);
}

export function getRegisteredPushToken() {
    return readStoredValue(PUSH_TOKEN_KEY);
}

/**
 * Best-effort: unregister this device's push token on the server before the
 * auth session is cleared (so the request is still authenticated), then forget
 * it locally. Called from AuthContext.signOut. The backend also re-associates a
 * token on the next sign-in, so a failure here is not correctness-critical.
 */
export async function unregisterPushTokenForSignOut() {
    const token = await getRegisteredPushToken();
    if (!token) return;

    try {
        await unregisterPushToken(token);
    } catch {
        // best-effort — network/401 during sign-out is acceptable
    }
    await removeStoredValue(PUSH_TOKEN_KEY);
}

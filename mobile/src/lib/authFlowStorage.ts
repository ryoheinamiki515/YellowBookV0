import {
    readStoredValue,
    removeStoredValue,
    writeStoredValue,
} from "./clientStorage";

const PENDING_PATH_KEY = "pending_post_auth_path";
const PROFILE_NAME_SUGGESTION_KEY = "profile_name_suggestion";

export function sanitizeInternalPath(path: string | null | undefined): string | null {
    if (!path) return null;

    const trimmed = path.trim();
    if (!trimmed.startsWith("/") || trimmed.startsWith("//")) {
        return null;
    }

    return trimmed;
}

export function getResumablePendingPath(path: string | null | undefined): string | null {
    const normalized = sanitizeInternalPath(path);
    if (!normalized || normalized === "/login" || normalized === "/complete-profile") {
        return null;
    }

    return normalized;
}

function normalizeProfileNameSuggestion(value: string | null | undefined): string | null {
    if (!value) return null;

    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

export async function getPendingPath(): Promise<string | null> {
    return sanitizeInternalPath(await readStoredValue(PENDING_PATH_KEY));
}

export async function savePendingPath(path: string | null | undefined) {
    const normalized = sanitizeInternalPath(path);
    if (!normalized) {
        await clearPendingPath();
        return;
    }

    await writeStoredValue(PENDING_PATH_KEY, normalized);
}

export async function clearPendingPath() {
    await removeStoredValue(PENDING_PATH_KEY);
}

export async function getProfileNameSuggestion(): Promise<string | null> {
    return normalizeProfileNameSuggestion(
        await readStoredValue(PROFILE_NAME_SUGGESTION_KEY)
    );
}

export async function saveProfileNameSuggestion(
    value: string | null | undefined
) {
    const normalized = normalizeProfileNameSuggestion(value);
    if (!normalized) {
        await clearProfileNameSuggestion();
        return;
    }

    await writeStoredValue(PROFILE_NAME_SUGGESTION_KEY, normalized);
}

export async function clearProfileNameSuggestion() {
    await removeStoredValue(PROFILE_NAME_SUGGESTION_KEY);
}

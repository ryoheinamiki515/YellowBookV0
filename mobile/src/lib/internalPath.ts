// Pure helpers for validating internal app routes. Kept free of storage /
// react-native imports so they can be reused (and unit-tested) anywhere.

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

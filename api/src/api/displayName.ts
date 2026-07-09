export function nullIfBlank(value: string | null | undefined) {
    if (value == null) return null;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
}

export function requireDisplayName(value: string | null | undefined) {
    const displayName = nullIfBlank(value);
    if (!displayName) {
        throw { status: 409, expose: true, message: "display_name_required" };
    }
    return displayName;
}

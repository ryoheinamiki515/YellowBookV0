/**
 * Shared identity helpers for people attached to a plan or group.
 *
 * A "plan person" is identified by an optional People-Library `personId` and/or
 * a `displayName` snapshot. These helpers dedupe by either, so the same person
 * can't be added twice — whether they arrive individually or via a group.
 */

export type PlanPersonIdentity = {
    personId?: string | null;
    displayName?: string | null;
    profileImageUrl?: string | null;
};

export function normalizePersonDisplayName(
    name: string | null | undefined
): string | null {
    const normalized = name?.trim().toLowerCase();
    return normalized ? normalized : null;
}

/**
 * Merge one or more lists of people into a single list with no duplicates,
 * keeping the first occurrence. Two entries collide when they share a
 * `personId` or a normalized `displayName`.
 */
export function mergeUniquePlanPeople(
    ...groups: PlanPersonIdentity[][]
): PlanPersonIdentity[] {
    const merged: PlanPersonIdentity[] = [];
    const seenPersonIds = new Set<string>();
    const seenDisplayNames = new Set<string>();

    for (const group of groups) {
        for (const person of group) {
            const personId = person.personId ?? null;
            const displayName = person.displayName?.trim() || null;
            const normalizedDisplayName = normalizePersonDisplayName(displayName);

            if (!personId && !normalizedDisplayName) continue;

            const isDuplicate =
                (personId ? seenPersonIds.has(personId) : false) ||
                (normalizedDisplayName
                    ? seenDisplayNames.has(normalizedDisplayName)
                    : false);

            if (isDuplicate) continue;

            if (personId) seenPersonIds.add(personId);
            if (normalizedDisplayName) {
                seenDisplayNames.add(normalizedDisplayName);
            }

            merged.push({
                personId,
                displayName,
                profileImageUrl: person.profileImageUrl ?? null,
            });
        }
    }

    return merged;
}

import type { Person as DbPerson } from "@prisma/client";

export function serializePerson(p: DbPerson) {
    return {
        id: p.id,
        displayName: p.displayName,
        pronouns: p.pronouns,
        neighborhood: p.neighborhood,
        notes: p.notes,
        birthday:
            p.birthdayMonth != null && p.birthdayDay != null
                ? {
                    month: p.birthdayMonth,
                    day: p.birthdayDay,
                    year: p.birthdayYear,
                }
                : null,
        archivedAt: p.archivedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}

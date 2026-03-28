import type { Person as DbPerson, User as DbUser } from "@prisma/client";
import { SYSTEM_LINKED_PERSON_PLACEHOLDER } from "../../personLinking.js";

export const linkedUserProfileSelect = {
    displayName: true,
    birthdayMonth: true,
    birthdayDay: true,
    birthdayYear: true,
    profileImageUrl: true,
} as const;

type LinkedUserProfile = Pick<
    DbUser,
    "displayName" | "birthdayMonth" | "birthdayDay" | "birthdayYear" | "profileImageUrl"
>;

type PersonWithLinkedUser = DbPerson & {
    linkedUser?: LinkedUserProfile | null;
};

export function serializeBirthday(fields: {
    birthdayMonth: number | null;
    birthdayDay: number | null;
    birthdayYear: number | null;
}) {
    return fields.birthdayMonth != null && fields.birthdayDay != null
        ? { month: fields.birthdayMonth, day: fields.birthdayDay, year: fields.birthdayYear }
        : null;
}

function overlayDisplayName(person: PersonWithLinkedUser): string {
    const linkedUser = person.linkedUser;
    if (
        person.displayName === SYSTEM_LINKED_PERSON_PLACEHOLDER &&
        linkedUser?.displayName
    ) {
        return linkedUser.displayName;
    }
    return person.displayName;
}

export function serializePerson(p: PersonWithLinkedUser) {
    const linkedUserBirthday = p.linkedUser ? serializeBirthday(p.linkedUser) : null;
    const personBirthday = serializeBirthday(p);

    return {
        id: p.id,
        displayName: overlayDisplayName(p),
        pronouns: p.pronouns,
        neighborhood: p.neighborhood,
        notes: p.notes,
        birthday: linkedUserBirthday ?? personBirthday,
        profileImageUrl: p.linkedUser?.profileImageUrl ?? null,
        archivedAt: p.archivedAt?.toISOString() ?? null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
    };
}

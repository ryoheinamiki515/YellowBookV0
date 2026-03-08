import type { Person, Prisma, SocialPlanParticipant } from "@prisma/client";
import { shouldReplaceLinkedPersonPlaceholder } from "./personLinking.js";

const MAX_PERSON_NOTES_LENGTH = 20000;

type MergeablePerson = Pick<
    Person,
    | "id"
    | "ownerId"
    | "displayName"
    | "linkedUserId"
    | "pronouns"
    | "neighborhood"
    | "notes"
    | "birthdayMonth"
    | "birthdayDay"
    | "birthdayYear"
    | "archivedAt"
>;

type MergeableParticipant = Pick<
    SocialPlanParticipant,
    "id" | "planId" | "displayName" | "isPrimary"
>;

function normalizeOptionalText(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed?.length ? trimmed : null;
}

function mergeNotes(params: {
    targetDisplayName: string;
    sourceDisplayName: string;
    targetNotes: string | null | undefined;
    sourceNotes: string | null | undefined;
}) {
    const {
        targetDisplayName,
        sourceDisplayName,
        targetNotes,
        sourceNotes,
    } = params;

    const normalizedTarget = normalizeOptionalText(targetNotes);
    const normalizedSource = normalizeOptionalText(sourceNotes);

    if (!normalizedTarget) return normalizedSource;
    if (!normalizedSource || normalizedSource === normalizedTarget) {
        return normalizedTarget;
    }

    const merged = `${normalizedTarget}\n\nMerged from ${sourceDisplayName} into ${targetDisplayName}:\n${normalizedSource}`;
    return merged.slice(0, MAX_PERSON_NOTES_LENGTH).trimEnd();
}

function mergeBirthday(personToKeep: MergeablePerson, personToMerge: MergeablePerson) {
    const keepHasBirthday =
        personToKeep.birthdayMonth != null && personToKeep.birthdayDay != null;
    const mergeHasBirthday =
        personToMerge.birthdayMonth != null && personToMerge.birthdayDay != null;

    if (!keepHasBirthday && !mergeHasBirthday) {
        return {
            birthdayMonth: null,
            birthdayDay: null,
            birthdayYear: null,
        };
    }

    if (!keepHasBirthday) {
        return {
            birthdayMonth: personToMerge.birthdayMonth,
            birthdayDay: personToMerge.birthdayDay,
            birthdayYear: personToMerge.birthdayYear,
        };
    }

    if (
        mergeHasBirthday &&
        personToKeep.birthdayMonth === personToMerge.birthdayMonth &&
        personToKeep.birthdayDay === personToMerge.birthdayDay &&
        personToKeep.birthdayYear == null &&
        personToMerge.birthdayYear != null
    ) {
        return {
            birthdayMonth: personToKeep.birthdayMonth,
            birthdayDay: personToKeep.birthdayDay,
            birthdayYear: personToMerge.birthdayYear,
        };
    }

    return {
        birthdayMonth: personToKeep.birthdayMonth,
        birthdayDay: personToKeep.birthdayDay,
        birthdayYear: personToKeep.birthdayYear,
    };
}

export function buildMergedPersonUpdate(params: {
    personToKeep: MergeablePerson;
    personToMerge: MergeablePerson;
}) {
    const { personToKeep, personToMerge } = params;

    if (
        personToKeep.linkedUserId &&
        personToMerge.linkedUserId &&
        personToKeep.linkedUserId !== personToMerge.linkedUserId
    ) {
        throw {
            status: 409,
            expose: true,
            message: "cannot_merge_people_with_different_linked_users",
        };
    }

    const birthday = mergeBirthday(personToKeep, personToMerge);

    return {
        displayName: shouldReplaceLinkedPersonPlaceholder(
            personToKeep.displayName,
            personToMerge.displayName
        )
            ? personToMerge.displayName
            : personToKeep.displayName,
        linkedUserId: personToKeep.linkedUserId ?? personToMerge.linkedUserId ?? null,
        pronouns:
            normalizeOptionalText(personToKeep.pronouns) ??
            normalizeOptionalText(personToMerge.pronouns),
        neighborhood:
            normalizeOptionalText(personToKeep.neighborhood) ??
            normalizeOptionalText(personToMerge.neighborhood),
        notes: mergeNotes({
            targetDisplayName: personToKeep.displayName,
            sourceDisplayName: personToMerge.displayName,
            targetNotes: personToKeep.notes,
            sourceNotes: personToMerge.notes,
        }),
        birthdayMonth: birthday.birthdayMonth,
        birthdayDay: birthday.birthdayDay,
        birthdayYear: birthday.birthdayYear,
        archivedAt:
            personToKeep.archivedAt && personToMerge.archivedAt
                ? personToKeep.archivedAt
                : null,
    } satisfies Prisma.PersonUncheckedUpdateInput;
}

async function mergePersonParticipants(params: {
    tx: Prisma.TransactionClient;
    personToKeepId: string;
    personToMergeId: string;
    personToKeepDisplayName: string;
}) {
    const {
        tx,
        personToKeepId,
        personToMergeId,
        personToKeepDisplayName,
    } = params;

    const [keepParticipants, mergeParticipants] = await Promise.all([
        tx.socialPlanParticipant.findMany({
            where: { personId: personToKeepId },
            select: { id: true, planId: true, displayName: true, isPrimary: true },
        }),
        tx.socialPlanParticipant.findMany({
            where: { personId: personToMergeId },
            select: { id: true, planId: true, displayName: true, isPrimary: true },
        }),
    ]);

    const keepParticipantByPlanId = new Map(
        keepParticipants.map((participant) => [participant.planId, participant])
    );

    for (const mergeParticipant of mergeParticipants) {
        const existing = keepParticipantByPlanId.get(mergeParticipant.planId);

        if (!existing) {
            await tx.socialPlanParticipant.update({
                where: { id: mergeParticipant.id },
                data: {
                    personId: personToKeepId,
                    displayName: personToKeepDisplayName,
                },
            });
            continue;
        }

        const participantUpdate: Prisma.SocialPlanParticipantUncheckedUpdateInput = {};

        if (existing.displayName !== personToKeepDisplayName) {
            participantUpdate.displayName = personToKeepDisplayName;
        }

        if (mergeParticipant.isPrimary && !existing.isPrimary) {
            participantUpdate.isPrimary = true;
        }

        if (Object.keys(participantUpdate).length > 0) {
            await tx.socialPlanParticipant.update({
                where: { id: existing.id },
                data: participantUpdate,
            });
        }

        await tx.socialPlanParticipant.delete({
            where: { id: mergeParticipant.id },
        });
    }
}

export async function mergePeople(params: {
    tx: Prisma.TransactionClient;
    ownerId: string;
    personToKeepId: string;
    personToMergeId: string;
}) {
    const { tx, ownerId, personToKeepId, personToMergeId } = params;

    if (personToKeepId === personToMergeId) {
        throw {
            status: 400,
            expose: true,
            message: "cannot_merge_same_person",
        };
    }

    const [personToKeep, personToMerge] = await Promise.all([
        tx.person.findFirst({
            where: { id: personToKeepId, ownerId },
        }),
        tx.person.findFirst({
            where: { id: personToMergeId, ownerId },
        }),
    ]);

    if (!personToKeep || !personToMerge) {
        throw { status: 404, expose: true, message: "not_found" };
    }

    const mergedPersonData = buildMergedPersonUpdate({
        personToKeep,
        personToMerge,
    });

    await mergePersonParticipants({
        tx,
        personToKeepId: personToKeep.id,
        personToMergeId: personToMerge.id,
        personToKeepDisplayName: mergedPersonData.displayName as string,
    });

    const mergedPerson = await tx.person.update({
        where: { id: personToKeep.id },
        data: mergedPersonData,
    });

    await tx.person.delete({
        where: { id: personToMerge.id },
    });

    return mergedPerson;
}

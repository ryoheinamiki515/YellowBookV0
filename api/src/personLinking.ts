import type { Person, Prisma } from "@prisma/client";

type PersonCandidate = Pick<Person, "id" | "displayName">;

export const SYSTEM_LINKED_PERSON_PLACEHOLDER = "Friend";

export type LinkOrCreateLinkedPersonParams = {
    ownerId: string;
    linkedUserId: string;
    displayName: string;
};

export function shouldReplaceLinkedPersonPlaceholder(
    existingDisplayName: string,
    incomingDisplayName: string
) {
    return (
        existingDisplayName === SYSTEM_LINKED_PERSON_PLACEHOLDER &&
        incomingDisplayName !== SYSTEM_LINKED_PERSON_PLACEHOLDER
    );
}

function normalizeDisplayName(value: string | null | undefined) {
    const normalized = value
        ?.trim()
        .toLocaleLowerCase()
        .replace(/'/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim();

    return normalized?.length ? normalized : null;
}

function toSingleTokenDisplayName(value: string | null | undefined) {
    const normalized = normalizeDisplayName(value);
    if (!normalized) return null;

    const tokens = normalized.split(/\s+/);
    return tokens.length === 1 ? tokens[0]! : null;
}

export function areNamesReconciliable(existingName: string, incomingName: string) {
    const normalizedExisting = normalizeDisplayName(existingName);
    const normalizedIncoming = normalizeDisplayName(incomingName);

    if (!normalizedExisting || !normalizedIncoming) return false;
    if (normalizedExisting === normalizedIncoming) return true;

    const existingSingleToken = toSingleTokenDisplayName(existingName);
    const incomingSingleToken = toSingleTokenDisplayName(incomingName);

    if (!existingSingleToken || !incomingSingleToken) return false;

    const [shorter, longer] =
        existingSingleToken.length <= incomingSingleToken.length
            ? [existingSingleToken, incomingSingleToken]
            : [incomingSingleToken, existingSingleToken];

    return shorter.length >= 3 && longer.startsWith(shorter);
}

export function selectPersonCandidateForLinkedUser(params: {
    incomingDisplayName: string;
    candidates: PersonCandidate[];
}) {
    const { incomingDisplayName, candidates } = params;
    const normalizedIncoming = normalizeDisplayName(incomingDisplayName);

    if (!normalizedIncoming) return null;

    const exactMatch = candidates.find(
        (candidate) => normalizeDisplayName(candidate.displayName) === normalizedIncoming
    );
    if (exactMatch) return exactMatch;

    const reconciliableMatches = candidates.filter((candidate) =>
        areNamesReconciliable(candidate.displayName, incomingDisplayName)
    );

    return reconciliableMatches.length === 1 ? reconciliableMatches[0]! : null;
}

export async function linkOrCreateLinkedPerson(
    tx: Prisma.TransactionClient,
    params: LinkOrCreateLinkedPersonParams
) {
    const { ownerId, linkedUserId, displayName } = params;

    const alreadyLinked = await tx.person.findFirst({
        where: { ownerId, linkedUserId },
    });
    if (alreadyLinked) {
        if (
            shouldReplaceLinkedPersonPlaceholder(
                alreadyLinked.displayName,
                displayName
            )
        ) {
            return tx.person.update({
                where: { id: alreadyLinked.id },
                data: { displayName },
            });
        }

        return alreadyLinked;
    }

    const existingCandidates = await tx.person.findMany({
        where: {
            ownerId,
            linkedUserId: null,
        },
        select: { id: true, displayName: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    });

    const match = selectPersonCandidateForLinkedUser({
        incomingDisplayName: displayName,
        candidates: existingCandidates,
    });

    if (match) {
        return tx.person.update({
            where: { id: match.id },
            data: {
                linkedUserId,
                ...(shouldReplaceLinkedPersonPlaceholder(
                    match.displayName,
                    displayName
                )
                    ? { displayName }
                    : {}),
            },
        });
    }

    return tx.person.create({
        data: { ownerId, linkedUserId, displayName },
    });
}

import type { SharedPlanPerson } from "../api/generated/model/sharedPlanPerson";

type SharedPeopleSource = {
    sharedPeople?: SharedPlanPerson[] | null;
    participants?: Array<{ id?: string; displayName?: string | null }> | null;
};

export type DisplaySharedPerson = SharedPlanPerson & {
    label: string;
};

function normalizeDisplayName(value: string | null | undefined) {
    const trimmed = value?.trim();
    return trimmed?.length ? trimmed : null;
}

function buildFallbackSharedPeople(
    source: SharedPeopleSource
): SharedPlanPerson[] {
    return (source.participants ?? []).flatMap((participant, index) => {
        const displayName = normalizeDisplayName(participant.displayName);
        if (!displayName) return [];

        return [
            {
                key: participant.id ?? `participant:${index}`,
                displayName,
                kind: "participant",
                isViewer: false,
            } satisfies SharedPlanPerson,
        ];
    });
}

export function getSharedPeopleForDisplay(
    source: SharedPeopleSource,
    options?: {
        localizeViewer?: boolean;
        excludeViewer?: boolean;
    }
): DisplaySharedPerson[] {
    const localizeViewer = options?.localizeViewer ?? false;
    const excludeViewer = options?.excludeViewer ?? false;
    const sharedPeople =
        source.sharedPeople && source.sharedPeople.length > 0
            ? source.sharedPeople
            : buildFallbackSharedPeople(source);

    return sharedPeople
        .filter((person) => !excludeViewer || !person.isViewer)
        .map((person) => ({
            ...person,
            label: localizeViewer && person.isViewer ? "You" : person.displayName,
        }));
}

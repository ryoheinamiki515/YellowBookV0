import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { SocialPlan, SocialPlanParticipant } from "@prisma/client";
import {
    buildSharedPeople,
    serializeSocialPlan,
    serializeSubscribedPlan,
} from "./socialPlan.js";

type TestParticipant = SocialPlanParticipant & {
    person?: { linkedUserId: string | null; displayName?: string | null } | null;
};

const CREATED_AT = new Date("2026-03-07T12:00:00.000Z");

function makeParticipant(params: {
    id: string;
    displayName?: string | null;
    linkedUserId?: string | null;
    currentPersonDisplayName?: string | null;
}): TestParticipant {
    const participant: SocialPlanParticipant = {
        id: params.id,
        planId: "plan-1",
        personId: params.linkedUserId ? `person-${params.id}` : null,
        displayName: params.displayName ?? null,
        isPrimary: false,
        createdAt: CREATED_AT,
    };

    if (params.linkedUserId === undefined) {
        return participant;
    }

    return {
        ...participant,
        person: {
            linkedUserId: params.linkedUserId,
            displayName: params.currentPersonDisplayName ?? null,
        },
    };
}

function makePlan(params?: {
    ownerId?: string;
    ownerDisplayName?: string;
    participants?: TestParticipant[];
}) {
    const plan: SocialPlan = {
        id: "plan-1",
        ownerId: params?.ownerId ?? "user-kevin",
        intentText: "Coffee soon?",
        contextNote: "Catch up",
        locationText: "Cafe",
        state: "OPEN",
        timePrecision: "UNSPECIFIED",
        anchorStart: null,
        anchorEnd: null,
        timezone: null,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
    };

    return {
        ...plan,
        participants: params?.participants ?? [],
        owner: {
            displayName: params?.ownerDisplayName ?? "Kevin",
        },
    };
}

describe("buildSharedPeople", () => {
    test("returns the owner when the plan has no explicit participants", () => {
        assert.deepEqual(
            buildSharedPeople({
                ownerId: "user-kevin",
                ownerDisplayName: "Kevin",
            }),
            [
                {
                    key: "owner:user-kevin",
                    displayName: "Kevin",
                    kind: "owner",
                    isViewer: false,
                },
            ]
        );
    });

    test("marks the viewer when a participant resolves to the subscriber", () => {
        assert.deepEqual(
            buildSharedPeople({
                ownerId: "user-kevin",
                ownerDisplayName: "Kevin",
                participants: [
                    makeParticipant({
                        id: "participant-sam",
                        displayName: "Sam",
                        linkedUserId: "user-sam",
                    }),
                ],
                connectionMap: new Map([
                    [
                        "user-sam",
                        {
                            personId: "person-sam",
                            displayName: "Sam",
                        },
                    ],
                ]),
                viewerUserId: "user-sam",
            }),
            [
                {
                    key: "owner:user-kevin",
                    displayName: "Kevin",
                    kind: "owner",
                    isViewer: false,
                },
                {
                    key: "participant:user:user-sam",
                    displayName: "Sam",
                    kind: "participant",
                    isViewer: true,
                },
            ]
        );
    });

    test("keeps owner first and preserves participant order after reconciliation", () => {
        assert.deepEqual(
            buildSharedPeople({
                ownerId: "user-kevin",
                ownerDisplayName: "Kevin",
                participants: [
                    makeParticipant({
                        id: "participant-sam",
                        displayName: "Sam",
                        linkedUserId: "user-sam",
                    }),
                    makeParticipant({
                        id: "participant-alex",
                        displayName: "Alex",
                        linkedUserId: "user-alex",
                    }),
                ],
                connectionMap: new Map([
                    [
                        "user-sam",
                        {
                            personId: "person-sam",
                            displayName: "Sam",
                        },
                    ],
                    [
                        "user-alex",
                        {
                            personId: "person-alex",
                            displayName: "Alex",
                        },
                    ],
                ]),
                viewerUserId: "user-sam",
            }).map((person) => person.displayName),
            ["Kevin", "Sam", "Alex"]
        );
    });

    test("deduplicates the owner when they also appear as a participant", () => {
        assert.deepEqual(
            buildSharedPeople({
                ownerId: "user-kevin",
                ownerDisplayName: "Kevin",
                participants: [
                    makeParticipant({
                        id: "participant-kevin",
                        displayName: "Kevin",
                        linkedUserId: "user-kevin",
                    }),
                    makeParticipant({
                        id: "participant-sam",
                        displayName: "Sam",
                        linkedUserId: "user-sam",
                    }),
                ],
                viewerUserId: "user-sam",
            }).map((person) => ({
                displayName: person.displayName,
                kind: person.kind,
            })),
            [
                {
                    displayName: "Kevin",
                    kind: "owner",
                },
                {
                    displayName: "Sam",
                    kind: "participant",
                },
            ]
        );
    });

    test("falls back to participant display names and deduplicates repeated names", () => {
        assert.deepEqual(
            buildSharedPeople({
                ownerId: "user-kevin",
                ownerDisplayName: "Kevin",
                participants: [
                    makeParticipant({
                        id: "participant-alex-1",
                        displayName: "Alex",
                    }),
                    makeParticipant({
                        id: "participant-alex-2",
                        displayName: "Alex",
                    }),
                ],
            }),
            [
                {
                    key: "owner:user-kevin",
                    displayName: "Kevin",
                    kind: "owner",
                    isViewer: false,
                },
                {
                    key: "participant:name:alex",
                    displayName: "Alex",
                    kind: "participant",
                    isViewer: false,
                },
            ]
        );
    });

    test("uses the viewer's linked person name for a subscribed owner", () => {
        const serialized = serializeSubscribedPlan(
            makePlan(),
            new Map([
                [
                    "user-kevin",
                    {
                        personId: "person-kev",
                        displayName: "Kev",
                    },
                ],
            ]),
            "user-viewer"
        );

        assert.equal(serialized.ownerDisplayName, "Kev");
        assert.equal(serialized.sharedPeople?.[0]?.displayName, "Kev");
    });

    test("prefers the current person name over the participant snapshot for owners", () => {
        const serialized = serializeSocialPlan(
            makePlan({
                participants: [
                    makeParticipant({
                        id: "participant-tk",
                        displayName: "TK",
                        linkedUserId: null,
                        currentPersonDisplayName: "ChanMi",
                    }),
                ],
            })
        );

        assert.equal(serialized.participants[0]?.displayName, "ChanMi");
    });
});

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
    getPlanView,
    assertPlanPermission,
    updateMembership,
    derivePermissions,
    type AssertPermissionError,
} from "./planView.js";

// ---------------------------------------------------------------------------
// Mock Prisma factory
// ---------------------------------------------------------------------------

type MockMembership = {
    id: string;
    planId: string;
    userId: string;
    role: "OWNER" | "MEMBER";
    response: "PENDING" | "ACCEPTED" | "DECLINED" | "MAYBE";
    privateNote: string | null;
    markedDoneAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
};

type MockActivity = {
    planId: string;
    actorId: string;
    kind: string;
    body?: string | null;
    metadata?: Record<string, unknown>;
};

const NOW = new Date("2026-03-15T12:00:00.000Z");

function makeMembership(overrides: Partial<MockMembership> & Pick<MockMembership, "userId" | "planId" | "role">): MockMembership {
    return {
        id: `membership-${overrides.userId}-${overrides.planId}`,
        response: overrides.role === "OWNER" ? "ACCEPTED" : "PENDING",
        privateNote: null,
        markedDoneAt: null,
        createdAt: NOW,
        updatedAt: NOW,
        ...overrides,
    };
}

function makeMockPlan(overrides?: Partial<{
    id: string;
    ownerId: string;
    ownerDisplayName: string;
    contextNote: string | null;
    state: string;
}>) {
    const id = overrides?.id ?? "plan-1";
    const ownerId = overrides?.ownerId ?? "user-kevin";
    return {
        id,
        ownerId,
        intentText: "Coffee soon?",
        contextNote: overrides?.contextNote ?? "Catch up notes",
        locationText: "Cafe",
        state: overrides?.state ?? "OPEN",
        timePrecision: "UNSPECIFIED",
        anchorStart: null,
        anchorEnd: null,
        timezone: null,
        participants: [],
        owner: { displayName: overrides?.ownerDisplayName ?? "Kevin" },
        createdAt: NOW,
        updatedAt: NOW,
    };
}

function makeMockPrisma(opts: {
    memberships: MockMembership[];
    plan?: ReturnType<typeof makeMockPlan>;
    linkedPeople?: Array<{ linkedUserId: string; displayName: string; id: string }>;
    users?: Array<{ id: string; displayName: string | null }>;
}) {
    const createdActivities: MockActivity[] = [];
    let membershipStore = opts.memberships.map((m) => ({ ...m }));

    return {
        prisma: {
            planMembership: {
                findUnique({ where }: any) {
                    if (where.planId_userId) {
                        const { planId, userId } = where.planId_userId;
                        return Promise.resolve(
                            membershipStore.find((m) => m.planId === planId && m.userId === userId) ?? null
                        );
                    }
                    return Promise.resolve(
                        membershipStore.find((m) => m.id === where.id) ?? null
                    );
                },
                update({ where, data }: any) {
                    const idx = membershipStore.findIndex((m) => m.id === where.id);
                    if (idx === -1) throw new Error("Membership not found in mock");
                    membershipStore[idx] = { ...membershipStore[idx]!, ...data, updatedAt: new Date() };
                    return Promise.resolve(membershipStore[idx]);
                },
            },
            socialPlan: {
                findUnique({ where }: any) {
                    const plan = opts.plan ?? makeMockPlan();
                    return Promise.resolve(where.id === plan.id ? plan : null);
                },
            },
            person: {
                findMany() {
                    return Promise.resolve(opts.linkedPeople ?? []);
                },
            },
            user: {
                findUnique({ where }: any) {
                    const user = (opts.users ?? []).find((u) => u.id === where.id);
                    return Promise.resolve(user ?? null);
                },
            },
            planActivity: {
                create({ data }: any) {
                    createdActivities.push(data);
                    return Promise.resolve({ id: `activity-${createdActivities.length}`, ...data, createdAt: new Date() });
                },
            },
        } as any,
        createdActivities,
        getMembershipStore: () => membershipStore,
    };
}


// ===========================================================================
// Issue #24 — Shared plan completion by non-owner
// ===========================================================================
describe("issue #24 — shared plan completion by non-owner", () => {
    test("member can set markedDoneAt via updateMembership", async () => {
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        const result = await updateMembership(prisma, "user-bob", "plan-1", {
            markedDoneAt: NOW,
        });

        assert.equal(result.role, "member");
        assert.equal(result.markedDoneAt, NOW.toISOString());
    });

    test("setting markedDoneAt creates STATE_CHANGE activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            markedDoneAt: NOW,
        });

        assert.equal(createdActivities.length, 1);
        assert.equal(createdActivities[0]!.kind, "STATE_CHANGE");
        assert.deepEqual(createdActivities[0]!.metadata, { action: "marked_done" });
        assert.equal(createdActivities[0]!.actorId, "user-bob");
    });

    test("setting markedDoneAt=null (undo) does not create a duplicate activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    markedDoneAt: NOW,
                }),
            ],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            markedDoneAt: null,
        });

        assert.equal(createdActivities.length, 0);
    });

    test("re-marking done when already marked does not create duplicate activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    markedDoneAt: NOW,
                }),
            ],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            markedDoneAt: new Date("2026-03-16T00:00:00Z"),
        });

        assert.equal(createdActivities.length, 0);
    });

    test("owner can also set markedDoneAt", async () => {
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
        });

        const result = await updateMembership(prisma, "user-kevin", "plan-1", {
            markedDoneAt: NOW,
        });

        assert.equal(result.role, "owner");
        assert.equal(result.markedDoneAt, NOW.toISOString());
    });

    test("derivePermissions grants canChangeState to both roles", () => {
        assert.equal(derivePermissions("OWNER").canChangeState, true);
        assert.equal(derivePermissions("MEMBER").canChangeState, true);
    });
});


// ===========================================================================
// Issue #23 — Private per-user notes on a shared plan
// ===========================================================================
describe("issue #23 — private per-user notes", () => {
    test("member can set privateNote via updateMembership", async () => {
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
        });

        const result = await updateMembership(prisma, "user-bob", "plan-1", {
            privateNote: "Bring a gift",
        });

        assert.equal(result.privateNote, "Bring a gift");
    });

    test("privateNote can be cleared by setting null", async () => {
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    privateNote: "Old note",
                }),
            ],
        });

        const result = await updateMembership(prisma, "user-bob", "plan-1", {
            privateNote: null,
        });

        assert.equal(result.privateNote, null);
    });

    test("getPlanView returns privateNote only for the requesting viewer", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    privateNote: "Bob's secret note",
                }),
                makeMembership({
                    userId: "user-kevin",
                    planId: "plan-1",
                    role: "OWNER",
                    privateNote: "Kevin's note",
                }),
            ],
            plan,
        });

        const bobView = await getPlanView(prisma, "user-bob", "plan-1");
        assert.equal(bobView?.membership.privateNote, "Bob's secret note");

        const kevinView = await getPlanView(prisma, "user-kevin", "plan-1");
        assert.equal(kevinView?.membership.privateNote, "Kevin's note");
    });

    test("one member's privateNote is not visible to another member", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    privateNote: "Bob's private thoughts",
                }),
                makeMembership({
                    userId: "user-kevin",
                    planId: "plan-1",
                    role: "OWNER",
                    privateNote: null,
                }),
            ],
            plan,
        });

        const kevinView = await getPlanView(prisma, "user-kevin", "plan-1");
        assert.equal(kevinView?.membership.privateNote, null);
        assert.notEqual(kevinView?.membership.privateNote, "Bob's private thoughts");
    });

    test("setting privateNote does not create any activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            privateNote: "My note",
        });

        assert.equal(createdActivities.length, 0);
    });

    test("owner can also set privateNote", async () => {
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
        });

        const result = await updateMembership(prisma, "user-kevin", "plan-1", {
            privateNote: "Remember to book",
        });

        assert.equal(result.privateNote, "Remember to book");
    });
});


// ===========================================================================
// Issue #14 — Respond to shared plans
// ===========================================================================
describe("issue #14 — respond to shared plans", () => {
    test("setting response=ACCEPTED creates RESPONSE activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            response: "ACCEPTED",
        });

        assert.equal(createdActivities.length, 1);
        assert.equal(createdActivities[0]!.kind, "RESPONSE");
        assert.deepEqual(createdActivities[0]!.metadata, {
            previousResponse: "PENDING",
            newResponse: "ACCEPTED",
            actorDisplayName: "Bob",
        });
    });

    test("setting response=DECLINED creates RESPONSE activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            response: "DECLINED",
        });

        assert.equal(createdActivities.length, 1);
        const meta = createdActivities[0]!.metadata as any;
        assert.equal(meta.previousResponse, "PENDING");
        assert.equal(meta.newResponse, "DECLINED");
    });

    test("setting response=MAYBE creates RESPONSE activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            response: "MAYBE",
        });

        assert.equal(createdActivities.length, 1);
        const meta = createdActivities[0]!.metadata as any;
        assert.equal(meta.newResponse, "MAYBE");
    });

    test("setting the same response value does not create a duplicate activity", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    response: "ACCEPTED",
                }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            response: "ACCEPTED",
        });

        assert.equal(createdActivities.length, 0);
    });

    test("changing from ACCEPTED to DECLINED creates activity with correct transition", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    response: "ACCEPTED",
                }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            response: "DECLINED",
        });

        assert.equal(createdActivities.length, 1);
        const meta = createdActivities[0]!.metadata as any;
        assert.equal(meta.previousResponse, "ACCEPTED");
        assert.equal(meta.newResponse, "DECLINED");
    });

    test("new member defaults to PENDING response", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        const view = await getPlanView(prisma, "user-bob", "plan-1");
        assert.equal(view?.membership.response, "PENDING");
    });

    test("owner membership defaults to ACCEPTED response", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
            plan,
        });

        const view = await getPlanView(prisma, "user-kevin", "plan-1");
        assert.equal(view?.membership.response, "ACCEPTED");
    });

    test("activity uses fallback display name when actor has none", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-ghost", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [],
        });

        await updateMembership(prisma, "user-ghost", "plan-1", {
            response: "ACCEPTED",
        });

        const meta = createdActivities[0]!.metadata as any;
        assert.equal(meta.actorDisplayName, "Someone");
    });

    test("derivePermissions grants canRespond only to MEMBER", () => {
        assert.equal(derivePermissions("MEMBER").canRespond, true);
        assert.equal(derivePermissions("OWNER").canRespond, false);
    });
});


// ===========================================================================
// Issue #15 — Discussion on shared plans
// ===========================================================================
describe("issue #15 — discussion on shared plans", () => {
    test("derivePermissions grants canDiscuss to both roles", () => {
        assert.equal(derivePermissions("OWNER").canDiscuss, true);
        assert.equal(derivePermissions("MEMBER").canDiscuss, true);
    });

    test("non-member gets null from getPlanView (gates discussion access)", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
            plan,
        });

        const view = await getPlanView(prisma, "user-stranger", "plan-1");
        assert.equal(view, null);
    });

    test("assertPlanPermission throws 404 for non-member", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
            plan,
        });

        try {
            await assertPlanPermission(prisma, "user-stranger", "plan-1", "canDiscuss");
            assert.fail("Should have thrown");
        } catch (e) {
            const err = e as AssertPermissionError;
            assert.equal(err.status, 404);
            assert.equal(err.message, "not_found");
        }
    });

    test("assertPlanPermission succeeds for member with canDiscuss", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        const view = await assertPlanPermission(prisma, "user-bob", "plan-1", "canDiscuss");
        assert.equal(view.membership.role, "member");
    });
});


// ===========================================================================
// Issue #21 — Per-user completion model (milestones)
// ===========================================================================
describe("issue #21 — per-user completion model", () => {
    test("markedDoneAt is per-membership, not per-plan", async () => {
        const plan = makeMockPlan({ state: "OPEN" });
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-kevin",
                    planId: "plan-1",
                    role: "OWNER",
                    markedDoneAt: null,
                }),
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    markedDoneAt: NOW,
                }),
            ],
            plan,
        });

        const kevinView = await getPlanView(prisma, "user-kevin", "plan-1");
        assert.equal(kevinView?.membership.markedDoneAt, null);

        const bobView = await getPlanView(prisma, "user-bob", "plan-1");
        assert.equal(bobView?.membership.markedDoneAt, NOW.toISOString());
    });

    test("plan state stays OPEN when a member marks done individually", async () => {
        const plan = makeMockPlan({ state: "OPEN" });
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        await updateMembership(prisma, "user-bob", "plan-1", {
            markedDoneAt: NOW,
        });

        const view = await getPlanView(prisma, "user-bob", "plan-1");
        assert.equal((view?.plan as any).state, "OPEN");
    });

    test("member can clear markedDoneAt by setting null", async () => {
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({
                    userId: "user-bob",
                    planId: "plan-1",
                    role: "MEMBER",
                    markedDoneAt: NOW,
                }),
            ],
        });

        const result = await updateMembership(prisma, "user-bob", "plan-1", {
            markedDoneAt: null,
        });

        assert.equal(result.markedDoneAt, null);
    });
});


// ===========================================================================
// getPlanView — unified view shape
// ===========================================================================
describe("getPlanView — unified view", () => {
    test("returns permissions, membership, and plan for an OWNER", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
            plan,
        });

        const view = await getPlanView(prisma, "user-kevin", "plan-1");
        assert.ok(view);
        assert.equal(view.membership.role, "owner");
        assert.deepEqual(view.permissions, derivePermissions("OWNER"));
        assert.equal((view.plan as any).intentText, "Coffee soon?");
    });

    test("returns permissions, membership, and plan for a MEMBER", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        const view = await getPlanView(prisma, "user-bob", "plan-1");
        assert.ok(view);
        assert.equal(view.membership.role, "member");
        assert.deepEqual(view.permissions, derivePermissions("MEMBER"));
    });

    test("owner view includes contextNote", async () => {
        const plan = makeMockPlan({ contextNote: "Important context" });
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
            plan,
        });

        const view = await getPlanView(prisma, "user-kevin", "plan-1");
        assert.equal((view?.plan as any).contextNote, "Important context");
    });

    test("member view redacts contextNote", async () => {
        const plan = makeMockPlan({ contextNote: "Important context" });
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        const view = await getPlanView(prisma, "user-bob", "plan-1");
        assert.equal((view?.plan as any).contextNote, null);
    });

    test("returns null for non-member", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [],
            plan,
        });

        const view = await getPlanView(prisma, "user-stranger", "plan-1");
        assert.equal(view, null);
    });
});


// ===========================================================================
// assertPlanPermission — permission gating
// ===========================================================================
describe("assertPlanPermission", () => {
    test("throws 403 when member tries canEdit", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        try {
            await assertPlanPermission(prisma, "user-bob", "plan-1", "canEdit");
            assert.fail("Should have thrown");
        } catch (e) {
            const err = e as AssertPermissionError;
            assert.equal(err.status, 403);
            assert.equal(err.message, "forbidden");
        }
    });

    test("throws 403 when member tries canDelete", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        try {
            await assertPlanPermission(prisma, "user-bob", "plan-1", "canDelete");
            assert.fail("Should have thrown");
        } catch (e) {
            assert.equal((e as AssertPermissionError).status, 403);
        }
    });

    test("throws 403 when member tries canShare", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        try {
            await assertPlanPermission(prisma, "user-bob", "plan-1", "canShare");
            assert.fail("Should have thrown");
        } catch (e) {
            assert.equal((e as AssertPermissionError).status, 403);
        }
    });

    test("succeeds when owner uses canEdit", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-kevin", planId: "plan-1", role: "OWNER" }),
            ],
            plan,
        });

        const view = await assertPlanPermission(prisma, "user-kevin", "plan-1", "canEdit");
        assert.equal(view.membership.role, "owner");
    });

    test("succeeds when member uses canChangeState", async () => {
        const plan = makeMockPlan();
        const { prisma } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            plan,
        });

        const view = await assertPlanPermission(prisma, "user-bob", "plan-1", "canChangeState");
        assert.equal(view.membership.role, "member");
    });
});


// ===========================================================================
// updateMembership — combined patch scenarios
// ===========================================================================
describe("updateMembership — combined patches", () => {
    test("can set response and privateNote in the same call", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        const result = await updateMembership(prisma, "user-bob", "plan-1", {
            response: "ACCEPTED",
            privateNote: "Looking forward to it",
        });

        assert.equal(result.response, "ACCEPTED");
        assert.equal(result.privateNote, "Looking forward to it");
        assert.equal(createdActivities.length, 1);
        assert.equal(createdActivities[0]!.kind, "RESPONSE");
    });

    test("can set response and markedDoneAt in the same call", async () => {
        const { prisma, createdActivities } = makeMockPrisma({
            memberships: [
                makeMembership({ userId: "user-bob", planId: "plan-1", role: "MEMBER" }),
            ],
            users: [{ id: "user-bob", displayName: "Bob" }],
        });

        const result = await updateMembership(prisma, "user-bob", "plan-1", {
            response: "ACCEPTED",
            markedDoneAt: NOW,
        });

        assert.equal(result.response, "ACCEPTED");
        assert.equal(result.markedDoneAt, NOW.toISOString());
        assert.equal(createdActivities.length, 2);
        assert.equal(createdActivities[0]!.kind, "RESPONSE");
        assert.equal(createdActivities[1]!.kind, "STATE_CHANGE");
    });

    test("throws 404 when membership does not exist", async () => {
        const { prisma } = makeMockPrisma({ memberships: [] });

        try {
            await updateMembership(prisma, "user-ghost", "plan-1", {
                response: "ACCEPTED",
            });
            assert.fail("Should have thrown");
        } catch (e) {
            assert.equal((e as any).status, 404);
        }
    });
});

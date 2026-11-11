/**
 * Resets and seeds the dev users on a local API started with DEV_AUTH=1.
 *
 * Everything goes through the public API with dev tokens, so seeded data obeys
 * the same rules as data created in the app. Only `dev|*` users are touched;
 * against an API without DEV_AUTH every call fails with 401 and nothing changes.
 *
 * Dates are relative to today in this machine's time zone, so the current
 * month always has plans of every kind.
 *
 *   API_BASE_URL=http://localhost:3100 npx tsx scripts/seed-dev-data.ts
 */

const API_BASE_URL = (process.env.API_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

type DevUser = { name: string; displayName: string };

const ALICE: DevUser = { name: "alice", displayName: "Alice" };
const BOB: DevUser = { name: "bob", displayName: "Bob" };
const CASEY: DevUser = { name: "casey", displayName: "Casey" };
const DEV_USERS = [ALICE, BOB, CASEY];

type Json = Record<string, any>;

async function call(user: DevUser, method: string, path: string, body?: Json, headers: Record<string, string> = {}) {
    const res = await fetch(`${API_BASE_URL}/v1${path}`, {
        method,
        headers: {
            Authorization: `Bearer dev:${user.name}`,
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...headers,
        },
        body: body ? JSON.stringify(body) : null,
    });
    if (!res.ok) {
        throw new Error(`${user.name}: ${method} ${path} -> ${res.status} ${await res.text()}`);
    }
    return { data: res.status === 204 ? null : ((await res.json()) as Json).data };
}

function daysFromToday(days: number, hour = 0, minute = 0): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, minute).toISOString();
}

type PlanSeed = {
    intentText: string;
    timePrecision: "NONE" | "WINDOW" | "EXACT";
    anchorStart?: string;
    anchorEnd?: string;
    locationText?: string;
    with?: string[];
    done?: boolean;
};

async function createPlan(owner: DevUser, seed: PlanSeed, peopleByName: Map<string, string>) {
    const { data: plan } = await call(owner, "POST", "/plans", {
        intentText: seed.intentText,
        timePrecision: seed.timePrecision,
        anchorStart: seed.anchorStart,
        anchorEnd: seed.anchorEnd,
        locationText: seed.locationText,
        timezone: TIME_ZONE,
    });
    for (const [index, displayName] of (seed.with ?? []).entries()) {
        const personId = peopleByName.get(displayName);
        await call(owner, "POST", `/plans/${plan.id}/participants`, {
            ...(personId ? { personId } : { displayName }),
            isPrimary: index === 0,
        });
    }
    if (seed.done) {
        await call(owner, "PATCH", `/plans/${plan.id}`, { state: "DONE" }, {
            "Content-Type": "application/merge-patch+json",
        });
    }
    return plan.id as string;
}

async function connect(sender: DevUser, acceptor: DevUser) {
    const { data: invite } = await call(sender, "POST", "/connections/invites");
    await call(acceptor, "POST", `/connections/invites/${invite.token}/accept`);
}

async function peopleOf(user: DevUser): Promise<Map<string, string>> {
    const { data } = await call(user, "GET", "/people?limit=100");
    return new Map((data as Json[]).map((person) => [person.displayName, person.id]));
}

async function main() {
    const health = await fetch(`${API_BASE_URL}/v1/health`).catch(() => null);
    if (!health?.ok) throw new Error(`API not reachable at ${API_BASE_URL}`);

    for (const user of DEV_USERS) await call(user, "DELETE", "/me");
    for (const user of DEV_USERS) await call(user, "PATCH", "/me", { displayName: user.displayName });

    await connect(ALICE, BOB);
    await connect(ALICE, CASEY);
    await call(ALICE, "POST", "/people", { displayName: "Grandma" });

    const alicePeople = await peopleOf(ALICE);
    const alicePlans: PlanSeed[] = [
        { intentText: "Coffee with Bob", timePrecision: "EXACT", anchorStart: daysFromToday(0, 9, 30), with: ["Bob"] },
        { intentText: "Dinner at the ramen spot", timePrecision: "EXACT", anchorStart: daysFromToday(0, 19), locationText: "Mission", with: ["Casey"] },
        { intentText: "Picnic in the park", timePrecision: "WINDOW", anchorStart: daysFromToday(2, 12), with: ["Bob", "Casey"] },
        { intentText: "Climbing session", timePrecision: "EXACT", anchorStart: daysFromToday(3, 14), with: ["Casey"] },
        { intentText: "Late show", timePrecision: "EXACT", anchorStart: daysFromToday(3, 22, 30), with: ["Bob"] },
        { intentText: "Tahoe weekend", timePrecision: "WINDOW", anchorStart: daysFromToday(5, 9), anchorEnd: daysFromToday(7, 18), with: ["Bob", "Casey"] },
        { intentText: "Lunch with Casey", timePrecision: "EXACT", anchorStart: daysFromToday(9, 12, 30), with: ["Casey"] },
        { intentText: "Brunch", timePrecision: "EXACT", anchorStart: daysFromToday(-3, 11), with: ["Bob"] },
        { intentText: "Call Grandma sometime", timePrecision: "NONE", with: ["Grandma"] },
        { intentText: "Museum day", timePrecision: "EXACT", anchorStart: daysFromToday(-6, 15), with: ["Casey"], done: true },
    ];
    for (const seed of alicePlans) await createPlan(ALICE, seed, alicePeople);

    const bobPeople = await peopleOf(BOB);
    const sharedPlanId = await createPlan(
        BOB,
        { intentText: "Bob's birthday drinks", timePrecision: "EXACT", anchorStart: daysFromToday(4, 20), with: ["Alice"] },
        bobPeople
    );
    await call(BOB, "POST", `/plans/${sharedPlanId}/share`);

    console.log(
        `Seeded ${DEV_USERS.map((u) => u.name).join(", ")} at ${API_BASE_URL} (${TIME_ZONE}): ` +
            `${alicePlans.length} plans owned by alice, 1 shared with her by bob.`
    );
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});

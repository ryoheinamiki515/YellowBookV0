import type { Person } from "../api/generated/model/person";
import type { SocialPlan } from "../api/generated/model/socialPlan";
import {
    buildOpenPlanSections,
    type DerivedPlanListItem,
    type PlanAttentionReason,
} from "./planListDerivations";

export type FeedPrimaryAction =
    | {
          kind: "open-plan";
          label: "Open plan";
          planId: string;
      }
    | {
          kind: "focus-people";
          label: "Add who";
          planId: string;
          focus: "people";
      }
    | {
          kind: "focus-when";
          label: "Pick day" | "Reschedule";
          planId: string;
          focus: "when";
      }
    | {
          kind: "add-person";
          label: "Add your first person";
      }
    | {
          kind: "start-plan";
          label: "Start your first plan" | "Start a new plan" | `Start plan with ${string}`;
          personId?: string;
          personDisplayName?: string;
          starterIntentText?: string;
      };

export type FeedHeroPlanItem = {
    kind: "hero-plan";
    key: string;
    plan: SocialPlan;
    derived: DerivedPlanListItem;
    reasonLabel: string;
    primaryAction: FeedPrimaryAction;
};

export type FeedQueuePlanItem = {
    kind: "queue-plan";
    key: string;
    plan: SocialPlan;
    derived: DerivedPlanListItem;
};

export type FeedWarmWinItem = {
    kind: "warm-win";
    key: string;
    plan: SocialPlan;
};

export type FeedPersonSparkItem = {
    kind: "person-spark";
    key: string;
    person: Person;
    primaryAction: FeedPrimaryAction;
};

export type FeedItem =
    | FeedHeroPlanItem
    | FeedQueuePlanItem
    | FeedWarmWinItem
    | FeedPersonSparkItem;

export type FeedEmptyStateKind = "no-people" | "no-plans" | "no-open-plans";

export type FeedSection =
    | {
          type: "next-step";
          title: string;
          subtitle?: string;
          items: FeedHeroPlanItem[];
      }
    | {
          type: "action-queue";
          title: string;
          subtitle?: string;
          items: FeedQueuePlanItem[];
      }
    | {
          type: "warm-wins";
          title: string;
          subtitle?: string;
          items: FeedWarmWinItem[];
      }
    | {
          type: "people-sparks";
          title: string;
          subtitle?: string;
          items: FeedPersonSparkItem[];
      }
    | {
          type: "empty";
          title: string;
          subtitle: string;
          emptyStateKind: FeedEmptyStateKind;
          primaryAction: FeedPrimaryAction;
          items: [];
      };

type BuildFeedSectionsInput = {
    plans: SocialPlan[];
    people: Person[];
    now?: Date;
};

function toTimeMs(iso: string | null | undefined): number | null {
    if (!iso) return null;
    const value = new Date(iso).getTime();
    return Number.isNaN(value) ? null : value;
}

function compareNullableNumberDesc(a: number | null, b: number | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return b - a;
}

function compareByUpdatedDesc<T extends { id: string; updatedAt: string; createdAt: string }>(
    a: T,
    b: T
): number {
    return (
        compareNullableNumberDesc(toTimeMs(a.updatedAt), toTimeMs(b.updatedAt)) ||
        compareNullableNumberDesc(toTimeMs(a.createdAt), toTimeMs(b.createdAt)) ||
        a.id.localeCompare(b.id)
    );
}

function attentionReasonLabel(reason: PlanAttentionReason | null): string {
    switch (reason) {
        case "missing-people-and-date":
            return "Needs people + date";
        case "missing-people":
            return "Needs people";
        case "missing-date":
            return "Needs date";
        case "past-due":
            return "Past due";
        case "stale-open":
            return "Drifting";
        default:
            return "Coming up";
    }
}

function mapHeroPrimaryAction(derived: DerivedPlanListItem): FeedPrimaryAction {
    const reason = derived.attentionReason;

    if (reason === "missing-people" || reason === "missing-people-and-date") {
        return {
            kind: "focus-people",
            label: "Add who",
            planId: derived.plan.id,
            focus: "people",
        };
    }

    if (reason === "missing-date" || reason === "past-due" || reason === "stale-open") {
        return {
            kind: "focus-when",
            label: reason === "past-due" ? "Reschedule" : "Pick day",
            planId: derived.plan.id,
            focus: "when",
        };
    }

    return {
        kind: "open-plan",
        label: "Open plan",
        planId: derived.plan.id,
    };
}

function deriveOpenPlanItems(plans: SocialPlan[]): DerivedPlanListItem[] {
    const derivedItems: DerivedPlanListItem[] = [];
    for (const item of buildOpenPlanSections(plans)) {
        if (item.type === "plan") {
            derivedItems.push(item.derived);
        }
    }
    return derivedItems;
}

function deriveWarmWins(plans: SocialPlan[], now: Date): FeedWarmWinItem[] {
    const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    return plans
        .filter((plan) => {
            if (plan.state !== "DONE") return false;
            const updatedAtMs = toTimeMs(plan.updatedAt);
            return updatedAtMs !== null && updatedAtMs >= sevenDaysAgo;
        })
        .sort(compareByUpdatedDesc)
        .slice(0, 3)
        .map((plan) => ({
            kind: "warm-win" as const,
            key: `warm-win:${plan.id}`,
            plan,
        }));
}

function derivePeopleSparks(plans: SocialPlan[], people: Person[]): FeedPersonSparkItem[] {
    const openParticipantIds = new Set<string>();

    plans
        .filter((plan) => plan.state === "OPEN")
        .forEach((plan) => {
            plan.participants.forEach((participant) => {
                if (participant.personId) {
                    openParticipantIds.add(participant.personId);
                }
            });
        });

    return people
        .filter((person) => !person.archivedAt)
        .filter((person) => !openParticipantIds.has(person.id))
        .sort(compareByUpdatedDesc)
        .slice(0, 3)
        .map((person) => ({
            kind: "person-spark" as const,
            key: `person-spark:${person.id}`,
            person,
            primaryAction: {
                kind: "start-plan",
                label: `Start plan with ${person.displayName}`,
                personId: person.id,
                personDisplayName: person.displayName,
                starterIntentText: `Catch up with ${person.displayName}`,
            },
        }));
}

export function buildFeedSections({
    plans,
    people,
    now = new Date(),
}: BuildFeedSectionsInput): FeedSection[] {
    const sections: FeedSection[] = [];
    const openDerivedItems = deriveOpenPlanItems(plans);
    const warmWins = deriveWarmWins(plans, now);
    const activePeople = people.filter((person) => !person.archivedAt);
    const peopleSparks = derivePeopleSparks(plans, people);

    const hero = openDerivedItems[0];
    if (hero) {
        sections.push({
            type: "next-step",
            title: "Next step",
            subtitle: "One kind next step. No pressure.",
            items: [
                {
                    kind: "hero-plan",
                    key: `hero:${hero.plan.id}`,
                    plan: hero.plan,
                    derived: hero,
                    reasonLabel: attentionReasonLabel(hero.attentionReason),
                    primaryAction: mapHeroPrimaryAction(hero),
                },
            ],
        });

        const queueItems = openDerivedItems.slice(1, 6).map((derived) => ({
            kind: "queue-plan" as const,
            key: `queue:${derived.plan.id}`,
            plan: derived.plan,
            derived,
        }));

        if (queueItems.length > 0) {
            sections.push({
                type: "action-queue",
                title: "Action queue",
                items: queueItems,
            });
        }
    }

    if (warmWins.length > 0) {
        sections.push({
            type: "warm-wins",
            title: "Warm wins",
            subtitle: "Recent follow-through.",
            items: warmWins,
        });
    }

    if (openDerivedItems.length === 0 && activePeople.length > 0 && peopleSparks.length > 0) {
        sections.push({
            type: "people-sparks",
            title: "People sparks",
            subtitle: "If you want, start something simple.",
            items: peopleSparks,
        });
    }

    if (openDerivedItems.length === 0) {
        if (activePeople.length === 0 && plans.length === 0) {
            sections.push({
                type: "empty",
                title: "Who matters to you?",
                subtitle: "Add someone you want to stay connected with.",
                emptyStateKind: "no-people",
                primaryAction: {
                    kind: "add-person",
                    label: "Add your first person",
                },
                items: [],
            });
        } else if (activePeople.length > 0 && plans.length === 0) {
            sections.push({
                type: "empty",
                title: "Ready for your first plan?",
                subtitle: "Start small. A walk, lunch, or a quick call.",
                emptyStateKind: "no-plans",
                primaryAction: {
                    kind: "start-plan",
                    label: "Start your first plan",
                },
                items: [],
            });
        } else {
            sections.push({
                type: "empty",
                title: "What do you want to look forward to next?",
                subtitle: "You can begin a fresh plan anytime.",
                emptyStateKind: "no-open-plans",
                primaryAction: {
                    kind: "start-plan",
                    label: "Start a new plan",
                },
                items: [],
            });
        }
    }

    return sections;
}

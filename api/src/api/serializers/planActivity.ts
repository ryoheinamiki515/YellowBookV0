import type { PlanActivity as DbPlanActivity, User as DbUser } from "@prisma/client";

type ActivityWithActor = DbPlanActivity & {
    actor: Pick<DbUser, "displayName">;
};

export function serializePlanActivity(
    activity: ActivityWithActor,
    connectionMap: Map<string, { personId: string; displayName: string }>,
    viewerUserId: string
) {
    const actorDisplayName =
        connectionMap.get(activity.actorId)?.displayName ??
        activity.actor.displayName ??
        "Someone";

    return {
        id: activity.id,
        planId: activity.planId,
        actorDisplayName,
        actorIsViewer: activity.actorId === viewerUserId,
        kind: activity.kind,
        body: activity.body,
        metadata: activity.metadata,
        createdAt: activity.createdAt.toISOString(),
    };
}
